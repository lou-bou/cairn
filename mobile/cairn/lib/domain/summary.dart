import 'dates.dart';
import 'models.dart';
import 'money.dart';

typedef CategoryTotal = ({String categoryId, TxType type, int totalEur, int count});
typedef MonthTotal = ({String month, int inEur, int outEur});
typedef BalancePoint = ({String date, int balanceEur});

class Summary {
  const Summary({
    required this.from,
    required this.to,
    required this.balanceEur,
    required this.inEur,
    required this.outEur,
    required this.monthCount,
    required this.avgMonthlyInEur,
    required this.avgMonthlyOutEur,
    required this.categories,
    required this.monthly,
    required this.balanceSeries,
  });

  final String? from;
  final String? to;

  /// The all-time balance, whatever the range.
  final int balanceEur;
  final int inEur;
  final int outEur;
  int get netEur => inEur - outEur;
  final int monthCount;
  final int avgMonthlyInEur;
  final int avgMonthlyOutEur;
  final List<CategoryTotal> categories;
  final List<MonthTotal> monthly;
  final List<BalancePoint> balanceSeries;
}

/// Totals and chart series for a date range, computed on the phone from the full transaction
/// list. Mirrors the server's buildSummary (server/src/routes/summary.ts) so both agree, and so
/// stats work offline and include entries that are still waiting to sync.
Summary buildSummary(List<Tx> all, {String? from, String? to, String? today}) {
  final now = today ?? todayIso();
  bool inRange(Tx t) =>
      (from == null || t.date.compareTo(from) >= 0) && (to == null || t.date.compareTo(to) <= 0);

  var balance = 0, inEur = 0, outEur = 0, opening = 0;
  String? firstDate;
  final cats = <String, ({String categoryId, TxType type, int totalEur, int count})>{};
  final byMonth = <String, ({int inEur, int outEur})>{};
  final byDay = <String, int>{};

  for (final t in all) {
    balance += t.signedEur;
    if (from != null && t.date.compareTo(from) < 0) opening += t.signedEur;
    if (!inRange(t)) continue;

    if (t.type == TxType.moneyIn) {
      inEur += t.amountEur;
    } else {
      outEur += t.amountEur;
    }
    if (firstDate == null || t.date.compareTo(firstDate) < 0) firstDate = t.date;

    final ck = '${t.categoryId}|${t.type.code}';
    final c = cats[ck];
    cats[ck] = (
      categoryId: t.categoryId,
      type: t.type,
      totalEur: (c?.totalEur ?? 0) + t.amountEur,
      count: (c?.count ?? 0) + 1,
    );

    final mk = monthKey(t.date);
    final m = byMonth[mk] ?? (inEur: 0, outEur: 0);
    byMonth[mk] = t.type == TxType.moneyIn
        ? (inEur: m.inEur + t.amountEur, outEur: m.outEur)
        : (inEur: m.inEur, outEur: m.outEur + t.amountEur);

    byDay[t.date] = (byDay[t.date] ?? 0) + t.signedEur;
  }

  // Months span the requested range; for all time, from the first entry to this month.
  final rangeStart = from ?? firstDate ?? now;
  final rangeEnd = to ?? (now.compareTo(rangeStart) > 0 ? now : rangeStart);
  final monthly = <MonthTotal>[
    for (final month in monthsBetween(rangeStart, rangeEnd))
      (month: month, inEur: byMonth[month]?.inEur ?? 0, outEur: byMonth[month]?.outEur ?? 0),
  ];
  final monthCount = monthly.length;

  // Balance over time: the running all-time balance, sampled at each day with entries in range.
  final days = byDay.keys.toList()..sort();
  final series = <BalancePoint>[];
  var running = opening;
  if (from != null && (days.isEmpty || days.first.compareTo(from) > 0)) {
    series.add((date: from, balanceEur: opening));
  }
  for (final d in days) {
    running += byDay[d]!;
    series.add((date: d, balanceEur: running));
  }
  if (series.isNotEmpty && series.last.date.compareTo(rangeEnd) < 0) {
    series.add((date: rangeEnd, balanceEur: running));
  }

  int avg(int n) =>
      monthCount == 0 ? 0 : divRoundHalfUp(BigInt.from(n), BigInt.from(monthCount)).toInt();

  final categories = cats.values.toList()..sort((a, b) => b.totalEur.compareTo(a.totalEur));

  return Summary(
    from: from,
    to: to,
    balanceEur: balance,
    inEur: inEur,
    outEur: outEur,
    monthCount: monthCount,
    avgMonthlyInEur: avg(inEur),
    avgMonthlyOutEur: avg(outEur),
    categories: categories,
    monthly: monthly,
    balanceSeries: series,
  );
}
