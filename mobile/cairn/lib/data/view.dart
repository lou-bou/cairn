import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';

import '../domain/dates.dart';
import '../domain/milestones.dart';
import '../domain/models.dart';
import '../domain/money.dart';
import '../domain/summary.dart';
import 'store.dart';

/// What the screens show: the server snapshot with the phone's pending changes applied on top.

final snapshotProvider = Provider<Snapshot?>((ref) => ref.watch(dataProvider.select((d) => d.snapshot)));

/// True once there is anything to show (from cache or the network).
final hasDataProvider = Provider<bool>((ref) => ref.watch(snapshotProvider) != null);

final categoriesProvider = Provider<List<Category>>((ref) {
  final c = ref.watch(snapshotProvider.select((s) => s?.categories));
  return c == null || c.isEmpty ? defaultCategories : c;
});

final settingsProvider = Provider<Settings?>(
  (ref) => ref.watch(snapshotProvider.select((s) => s?.settings)),
);

final rateProvider = Provider<int>(
  (ref) => ref.watch(settingsProvider.select((s) => s?.defaultRate)) ?? fallbackRateMilli,
);

/// Apply queued transaction changes to the server's list. Pure, so it can be tested directly.
List<Tx> applyPending(List<Tx> server, List<OutboxOp> ops) {
  final byId = {for (final t in server) t.id: t};
  for (final op in ops) {
    switch (op.kind) {
      case 'tx.create':
        final id = op.payload['tempId'] as String;
        byId[id] = Tx.fromInput(
          TxInput.fromJson(Map<String, dynamic>.from(op.payload['input'] as Map)),
          id: id,
          createdAt: op.createdAt.toUtc().toIso8601String(),
        );
      case 'tx.update':
        final id = op.payload['id'] as String;
        final old = byId[id];
        if (old != null) {
          byId[id] = Tx.fromInput(
            TxInput.fromJson(Map<String, dynamic>.from(op.payload['input'] as Map)),
            id: id,
            createdAt: old.createdAt,
            updatedAt: op.createdAt.toUtc().toIso8601String(),
          );
        }
      case 'tx.delete':
        byId.remove(op.payload['id']);
    }
  }
  return byId.values.toList()..sort((a, b) {
    final d = b.date.compareTo(a.date);
    return d != 0 ? d : b.createdAt.compareTo(a.createdAt);
  });
}

/// All transactions, newest first, including ones not yet synced.
final transactionsProvider = Provider<List<Tx>>((ref) {
  final server = ref.watch(snapshotProvider.select((s) => s?.transactions)) ?? const <Tx>[];
  return applyPending(server, ref.watch(outboxProvider));
});

final balanceProvider = Provider<int>(
  (ref) => ref.watch(transactionsProvider).fold(0, (sum, t) => sum + t.signedEur),
);

/// The goal with the balance the phone currently shows.
final goalProvider = Provider<Goal?>((ref) {
  final goal = ref.watch(snapshotProvider.select((s) => s?.goal));
  return goal?.withBalance(ref.watch(balanceProvider));
});

final milestonesProvider = Provider<List<Milestone>>(
  (ref) => ref.watch(snapshotProvider.select((s) => s?.milestones)) ?? const [],
);

final progressProvider = Provider<Progress?>((ref) {
  final goal = ref.watch(goalProvider);
  return goal == null ? null : progressOf(goal, ref.watch(milestonesProvider));
});

typedef DateRange = ({String? from, String? to});

final summaryProvider = Provider.family<Summary, DateRange>(
  (ref, range) => buildSummary(ref.watch(transactionsProvider), from: range.from, to: range.to),
);

final thisMonthProvider = Provider<Summary>((ref) {
  final today = todayIso();
  return ref.watch(summaryProvider((from: startOfMonth(today), to: endOfMonth(today))));
});

/// Number of changes still waiting to reach the server, and how many the server refused.
final pendingCountProvider = Provider<({int waiting, int failed})>((ref) {
  final ops = ref.watch(outboxProvider);
  final failed = ops.where((o) => o.failed).length;
  return (waiting: ops.length - failed, failed: failed);
});

// ---- Display currency ----

const displayCurrencyPref = 'displayCurrency';
const lastEntryCurrencyPref = 'lastEntryCurrency';
const lastEntrySourcePref = 'lastEntrySource';

final displayCurrencyProvider = Provider<Currency>(
  (ref) => Currency.parse(ref.watch(prefProvider(displayCurrencyPref))),
);

/// Money formatting bound to the display currency and the current default rate.
class MoneyFmt {
  const MoneyFmt(this.display, this.rate);
  final Currency display;
  final int rate;

  /// A computed EUR total (balance, sums).
  String total(int eurCents, {bool signed = false}) {
    final d = displayTotal(eurCents, display, rate);
    return formatMoney(d.minor, d.currency, signed: signed);
  }

  /// A stored record: DZD-entered rows show their original DZD amount in DZD mode.
  String record({required int amountOriginal, required Currency currency, required int amountEur}) {
    final d = displayMinor(
      amountOriginal: amountOriginal,
      currency: currency,
      amountEur: amountEur,
      display: display,
      currentRateMilli: rate,
    );
    return formatMoney(d.minor, d.currency);
  }

  int convert(int eurCents) => displayTotal(eurCents, display, rate).minor;
}

final moneyProvider = Provider<MoneyFmt>(
  (ref) => MoneyFmt(ref.watch(displayCurrencyProvider), ref.watch(rateProvider)),
);
