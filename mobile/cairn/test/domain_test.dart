import 'package:cairn/domain/dates.dart';
import 'package:cairn/domain/milestones.dart';
import 'package:cairn/domain/models.dart';
import 'package:cairn/domain/money.dart';
import 'package:cairn/domain/reconcile.dart';
import 'package:cairn/domain/summary.dart';
import 'package:flutter_test/flutter_test.dart';

const rate275 = 275000;
const eur = Currency.eur;
const dzd = Currency.dzd;

Matcher moneyError(Pattern message) =>
    throwsA(isA<MoneyError>().having((e) => e.message, 'message', matches(message)));

Tx tx(String id, String date, String type, int eurCents, {String category = 'living'}) => Tx(
  id: id,
  type: TxType.parse(type),
  date: date,
  note: '',
  amountOriginal: eurCents,
  currency: eur,
  rate: rate275,
  amountEur: eurCents,
  categoryId: category,
  source: 'cash',
  isAdjustment: false,
  createdAt: '${date}T10:00:00.000Z',
  updatedAt: '${date}T10:00:00.000Z',
);

Settings settings(String freq, int day, {String? last, String? snoozed}) => Settings(
  defaultRate: rate275,
  reconcileFrequency: freq,
  reconcileDay: day,
  lastReconciledAt: last,
  reconcileSnoozedUntil: snoozed,
);

void main() {
  // These mirror shared/test/money.test.ts, so the phone and the server can never disagree.
  group('money', () {
    test('divRoundHalfUp rounds half away from zero', () {
      for (final (n, d, expected) in [
        (10, 4, 3),
        (9, 4, 2),
        (11, 4, 3),
        (-10, 4, -3),
        (-9, 4, -2),
        (10, -4, -3),
        (0, 7, 0),
        (8, 4, 2),
      ]) {
        expect(divRoundHalfUp(BigInt.from(n), BigInt.from(d)), BigInt.from(expected));
      }
      expect(() => divRoundHalfUp(BigInt.one, BigInt.zero), throwsA(isA<MoneyError>()));
    });

    test('parseAmount accepts what people type', () {
      for (final (input, currency, expected) in [
        ('1365', eur, 136500),
        ('1365.5', eur, 136550),
        ('1365.50', eur, 136550),
        ('1,365.50', eur, 136550),
        ('1 365.50', eur, 136550),
        ('  42  ', eur, 4200),
        ('0.01', eur, 1),
        ('.5', eur, 50),
        ('5.', eur, 500),
        ('1.230', eur, 123),
        ('0', eur, 0),
        ('1000', dzd, 100000),
        ('375,375', dzd, 37537500),
        ('1000.00', dzd, 100000),
        ('10000000000', eur, maxMinor),
      ]) {
        expect(parseAmount(input, currency), expected, reason: input);
      }
    });

    test('parseAmount rejects everything else', () {
      for (final (input, currency, message) in [
        ('', eur, 'Enter an amount'),
        ('abc', eur, 'not a valid amount'),
        ('-5', eur, 'not a valid amount'),
        ('+5', eur, 'not a valid amount'),
        ('1e3', eur, 'not a valid amount'),
        ('1,36', eur, 'not a valid amount'),
        ('1,2345', eur, 'not a valid amount'),
        ('.', eur, 'not a valid amount'),
        ('1.2.3', eur, 'not a valid amount'),
        ('1.234', eur, 'at most 2 decimal places'),
        ('1000.5', dzd, 'whole number'),
        ('10000000001', eur, 'too large'),
      ]) {
        expect(() => parseAmount(input, currency), moneyError(message), reason: input);
      }
    });

    test('parseRate and formatRate round-trip', () {
      for (final (input, expected) in [
        ('275', 275000),
        ('262.5', 262500),
        ('262.125', 262125),
        ('0.001', 1),
        ('1,000', 1000000),
      ]) {
        expect(parseRate(input), expected);
        expect(parseRate(formatRate(expected)), expected);
      }
      for (final (input, message) in [
        ('0', 'greater than 0'),
        ('0.000', 'greater than 0'),
        ('262.1234', 'at most 3 decimal places'),
        ('-275', 'not a valid rate'),
        ('', 'Enter a rate'),
        ('1000001', 'too large'),
      ]) {
        expect(() => parseRate(input), moneyError(message), reason: input);
      }
      expect(formatRate(262050), '262.05');
      expect(formatRate(1), '0.001');
    });

    test('toEurCents matches the server', () {
      expect(toEurCents(parseAmount('1000', dzd), dzd, rate275), 364); // AC 1
      expect(toEurCents(136500, eur, rate275), 136500);
      expect(toEurCents(100, dzd, 200000), 1); // exact .5 rounds up
      expect(toEurCents(50, dzd, 100000), 1);
      expect(toEurCents(49, dzd, 100000), 0);
      expect(toEurCents(105000, dzd, 262500), 400);
      expect(toEurCents(825000000, dzd, rate275), 3000000);
      expect(toEurCents(maxMinor, dzd, 1), maxMinor * 1000);
      expect(() => toEurCents(100, dzd, 0), throwsA(isA<MoneyError>()));
    });

    test('eurToDzdCentimes', () {
      expect(eurToDzdCentimes(136500, rate275), 37537500);
      expect(eurToDzdCentimes(364, rate275), 100100);
      expect(eurToDzdCentimes(-136500, rate275), -37537500);
    });

    test('formatMoney', () {
      for (final (minor, currency, expected) in [
        (136500, eur, '€1,365.00'),
        (364, eur, '€3.64'),
        (5, eur, '€0.05'),
        (0, eur, '€0.00'),
        (300000000, eur, '€3,000,000.00'),
        (-1250, eur, '−€12.50'),
        (37537500, dzd, '375,375 DA'),
        (100000, dzd, '1,000 DA'),
        (100050, dzd, '1,001 DA'),
        (100049, dzd, '1,000 DA'),
        (-100050, dzd, '−1,001 DA'),
        (0, dzd, '0 DA'),
      ]) {
        expect(formatMoney(minor, currency), expected);
      }
      expect(formatMoney(1250, eur, signed: true), '+€12.50');
      expect(formatMoney(0, eur, signed: true), '€0.00');
      expect(formatMoney(-1250, eur, signed: true), '−€12.50');
    });

    test('formatAmountInput parses back', () {
      for (final (minor, currency, expected) in [
        (136550, eur, '1365.50'),
        (136500, eur, '1365.00'),
        (5, eur, '0.05'),
        (100000, dzd, '1000'),
      ]) {
        expect(formatAmountInput(minor, currency), expected);
        expect(parseAmount(expected, currency), minor);
      }
    });

    test('display rules: DZD rows show what was typed, EUR rows use the current rate', () {
      Shown show(int original, Currency c, int amountEur, Currency display, int rate) =>
          displayMinor(
            amountOriginal: original,
            currency: c,
            amountEur: amountEur,
            display: display,
            currentRateMilli: rate,
          );
      expect(show(100000, dzd, 364, dzd, rate275), (minor: 100000, currency: dzd));
      expect(show(100000, dzd, 364, dzd, 300000), (minor: 100000, currency: dzd));
      expect(show(100000, dzd, 364, eur, rate275), (minor: 364, currency: eur));
      expect(formatMoney(show(136500, eur, 136500, dzd, rate275).minor, dzd), '375,375 DA');
      expect(formatMoney(show(136500, eur, 136500, dzd, 300000).minor, dzd), '409,500 DA');
      expect(displayTotal(136500, dzd, rate275), (minor: 37537500, currency: dzd));
    });

    test('formatCompact for chart axes', () {
      expect(formatCompact(250000, eur), '€2.5K');
      expect(formatCompact(37537500, dzd), '375K DA');
      expect(formatCompact(99900, eur), '€999');
      expect(formatCompact(150000000, eur), '€1.5M');
      expect(formatCompact(-250000, eur), '−€2.5K');
    });
  });

  group('dates', () {
    test('validity, month ends and arithmetic', () {
      expect(isIsoDate('2024-02-29'), isTrue);
      expect(isIsoDate('2026-02-29'), isFalse);
      expect(isIsoDate('2026-13-01'), isFalse);
      expect(isIsoDate('26-1-1'), isFalse);
      expect(addDays('2026-02-28', 1), '2026-03-01');
      expect(addDays('2026-01-01', -1), '2025-12-31');
      expect(weekday('2026-11-15'), 0); // a Sunday
      expect(weekday('2026-11-16'), 1);
      expect(endOfMonth('2026-02-10'), '2026-02-28');
      expect(addMonths('2026-01-31', 1), '2026-02-28');
      expect(addMonths('2026-01-15', -2), '2025-11-15');
      expect(monthsBetween('2025-11-20', '2026-02-01'), ['2025-11', '2025-12', '2026-01', '2026-02']);
      expect(fromDayNumber(dayNumber('2026-11-16')), '2026-11-16');
    });

    test('formatDay', () {
      expect(formatDay('2026-11-16', today: '2026-11-16'), 'Today');
      expect(formatDay('2026-11-15', today: '2026-11-16'), 'Yesterday');
      expect(formatDay('2026-10-03', today: '2026-11-16'), '3 Oct');
      expect(formatDay('2025-10-03', today: '2026-11-16'), '3 Oct 2025');
      expect(formatMonth('2026-09'), 'Sep');
      expect(formatMonth('2026-09', withYear: true), 'Sep 2026');
    });
  });

  group('count reminder', () {
    test('weekly: due from the scheduled weekday until counted', () {
      // 2026-11-16 is a Monday. Scheduled on Sundays (0).
      final s = settings('weekly', 0);
      expect(lastDueDate(s, '2026-11-16'), '2026-11-15');
      expect(isReconcileDue(s, '2026-11-16'), isTrue);
      expect(isReconcileDue(settings('weekly', 0, last: '2026-11-15T12:00:00'), '2026-11-16'), isFalse);
      expect(isReconcileDue(settings('weekly', 0, last: '2026-11-10T12:00:00'), '2026-11-16'), isTrue);
    });

    test('monthly: day 31 means the last day of a shorter month', () {
      final s = settings('monthly', 31);
      expect(lastDueDate(s, '2026-11-30'), '2026-11-30');
      expect(lastDueDate(s, '2026-11-29'), '2026-10-31');
      expect(lastDueDate(s, '2026-01-10'), '2025-12-31');
    });

    test('off and snoozed are never due', () {
      expect(isReconcileDue(settings('off', 1), '2026-11-16'), isFalse);
      expect(isReconcileDue(settings('weekly', 0, snoozed: '2026-11-17'), '2026-11-16'), isFalse);
      expect(isReconcileDue(settings('weekly', 0, snoozed: '2026-11-16'), '2026-11-16'), isTrue);
    });
  });

  group('summary (same rules as the server)', () {
    final all = [
      tx('a', '2026-08-10', 'in', 100000, category: 'income'),
      tx('b', '2026-09-05', 'out', 20000),
      tx('c', '2026-11-02', 'in', 50000, category: 'savings'),
      tx('d', '2026-11-02', 'out', 5000),
      tx('e', '2026-11-10', 'out', 10001, category: 'luxury'),
    ];

    test('range totals, averages and categories', () {
      final s = buildSummary(all, from: '2026-09-01', to: '2026-11-16', today: '2026-11-16');
      expect(s.inEur, 50000);
      expect(s.outEur, 35001);
      expect(s.netEur, 14999);
      expect(s.balanceEur, 114999, reason: 'the balance is all-time, whatever the range');
      expect(s.monthCount, 3);
      expect(s.avgMonthlyInEur, 16667); // 50000 / 3 rounded half up
      expect(s.avgMonthlyOutEur, 11667);
      expect([for (final m in s.monthly) (m.month, m.inEur, m.outEur)], [
        ('2026-09', 0, 20000),
        ('2026-10', 0, 0),
        ('2026-11', 50000, 15001),
      ]);
      expect(s.categories.first, (categoryId: 'savings', type: TxType.moneyIn, totalEur: 50000, count: 1));
      expect(
        s.categories.firstWhere((c) => c.categoryId == 'living'),
        (categoryId: 'living', type: TxType.moneyOut, totalEur: 25000, count: 2),
      );
    });

    test('balance series starts at the opening balance and runs to the range end', () {
      final s = buildSummary(all, from: '2026-09-01', to: '2026-11-16', today: '2026-11-16');
      expect(s.balanceSeries, [
        (date: '2026-09-01', balanceEur: 100000),
        (date: '2026-09-05', balanceEur: 80000),
        (date: '2026-11-02', balanceEur: 125000),
        (date: '2026-11-10', balanceEur: 114999),
        (date: '2026-11-16', balanceEur: 114999),
      ]);
    });

    test('all time runs from the first entry to today', () {
      final s = buildSummary(all, today: '2026-11-16');
      expect(s.monthly.first.month, '2026-08');
      expect(s.monthly.last.month, '2026-11');
      expect(s.balanceSeries.first, (date: '2026-08-10', balanceEur: 100000));
      expect(s.balanceSeries.last, (date: '2026-11-16', balanceEur: 114999));
    });

    test('no entries at all', () {
      final s = buildSummary(const [], today: '2026-11-16');
      expect(s.balanceEur, 0);
      expect(s.monthly, [(month: '2026-11', inEur: 0, outEur: 0)]);
      expect(s.balanceSeries, isEmpty);
    });
  });

  group('milestones', () {
    Milestone m(String id, int cost, int threshold) => Milestone(
      id: id,
      name: 'Phase $id: something long',
      note: '',
      sortOrder: 0,
      costOriginal: cost,
      currency: eur,
      rate: rate275,
      costEur: cost,
      thresholdEur: threshold,
      achievedAt: null,
      celebrationSeen: true,
    );
    Goal goal(int amount, int balance) => Goal(
      name: 'Move',
      mode: 'auto',
      customOriginal: null,
      currency: null,
      rate: null,
      customEur: null,
      amountEur: amount,
      milestoneSumEur: amount,
      balanceEur: balance,
      achievedAt: null,
      celebrationSeen: true,
    );

    test('progress follows the balance', () {
      final ms = [m('1', 1000, 1000), m('2', 2000, 3000), m('3', 3000, 6000)];
      final p = progressOf(goal(6000, 3500), ms);
      expect(p.latestAchieved!.id, '2');
      expect(p.next!.id, '3');
      expect(p.remainingToNext, 2500);
      expect(p.remainingToGoal, 2500);
      expect(p.goalReached, isFalse);
      expect(progressOf(goal(6000, 6000), ms).goalReached, isTrue);
      expect(progressOf(goal(6000, -50), ms).fraction, 0);
      expect(progressOf(goal(0, 100), const []).goalReached, isFalse);
    });

    test('shortName and thresholds', () {
      expect(shortName('Phase 1: Pre-admission'), 'Phase 1');
      expect(shortName('Car'), 'Car');
      expect(shortName(': odd'), ': odd');
      final re = withThresholds([m('2', 2000, 0), m('1', 1000, 0)]);
      expect([for (final x in re) x.thresholdEur], [2000, 3000]);
    });
  });
}
