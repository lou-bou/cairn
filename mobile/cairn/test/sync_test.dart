import 'dart:io';

import 'package:cairn/data/store.dart';
import 'package:cairn/data/view.dart';
import 'package:cairn/domain/models.dart';
import 'package:cairn/domain/money.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kit/kit.dart';

import 'fake_server.dart';

TxInput coffee({int cents = 350, String note = 'Coffee', Currency currency = Currency.eur}) =>
    TxInput(
      type: TxType.moneyOut,
      date: '2026-11-16',
      note: note,
      amountOriginal: cents,
      currency: currency,
      rate: 275000,
      categoryId: 'living',
      source: 'cash',
    );

void main() {
  late Directory dir;
  late FakeCairn server;
  late ProviderContainer c;
  CairnData data() => c.read(dataProvider.notifier);
  Outbox outbox() => c.read(outboxProvider.notifier);

  /// Let queued sends and their follow-up refresh finish.
  Future<void> settle() async {
    for (var i = 0; i < 3; i++) {
      await outbox().flush();
      await data().refresh();
    }
  }

  setUp(() {
    dir = Directory.systemTemp.createTempSync('cairn_sync');
    server = FakeCairn()
      ..seed('2026-11-01', 'in', 100000, note: 'Salary')
      ..seed('2026-11-03', 'out', 2500, note: 'Lunch');
    c = containerFor(server, dir);
  });
  tearDown(() {
    c.dispose();
    dir.deleteSync(recursive: true);
  });

  test('refresh loads everything and the next launch starts from the cache', () async {
    expect(c.read(hasDataProvider), isFalse);
    await data().refresh();
    expect(c.read(transactionsProvider).map((t) => t.note), ['Lunch', 'Salary']);
    expect(c.read(balanceProvider), 97500);
    expect(c.read(netStatusProvider), NetState.ok);
    expect(c.read(snapshotProvider)!.backup!.state, 'ok');
    await c.read(jsonStoreProvider).write('noop', 1);

    // Relaunch with no network at all: the data is there in the first frame.
    server.offline = true;
    final relaunch = containerFor(server, dir);
    addTearDown(relaunch.dispose);
    expect(relaunch.read(hasDataProvider), isTrue);
    expect(relaunch.read(balanceProvider), 97500);
    await relaunch.read(dataProvider.notifier).refresh();
    expect(relaunch.read(netStatusProvider), NetState.offline);
    expect(relaunch.read(balanceProvider), 97500, reason: 'a failed refresh keeps the cache');
  });

  test('online: an entry shows at once and is confirmed by the server', () async {
    await data().refresh();
    data().addTx(coffee());
    final shown = c.read(transactionsProvider).first;
    expect(shown.note, 'Coffee');
    expect(shown.pending, isTrue);
    expect(c.read(balanceProvider), 97150);

    await settle();
    expect(c.read(outboxProvider), isEmpty);
    final saved = c.read(transactionsProvider).first;
    expect(saved.id, startsWith('srv-'));
    expect(saved.pending, isFalse);
    expect(server.balance, 97150);
  });

  test('offline: entries queue, show in totals and stats, and sync later in order', () async {
    await data().refresh();
    server.offline = true;
    data().addTx(coffee());
    data().addTx(coffee(cents: 100000, note: 'Rent', currency: Currency.dzd)); // 1,000 DA = €3.64
    await outbox().flush();

    expect(c.read(pendingCountProvider), (waiting: 2, failed: 0));
    expect(c.read(balanceProvider), 97500 - 350 - 364);
    expect(c.read(thisMonthProvider).outEur, 2500 + 350 + 364);
    expect(c.read(netStatusProvider), NetState.offline);
    expect(server.transactions, hasLength(2));

    server.offline = false;
    await settle();
    expect(c.read(pendingCountProvider), (waiting: 0, failed: 0));
    expect(server.transactions.map((t) => t['note']), ['Salary', 'Lunch', 'Coffee', 'Rent']);
    expect(c.read(balanceProvider), server.balance);
  });

  test('offline edits and deletes of an unsent entry never reach the server', () async {
    await data().refresh();
    server.offline = true;
    data().addTx(coffee());
    await outbox().flush();
    final temp = c.read(transactionsProvider).first.id;
    data().updateTx(temp, coffee(cents: 400, note: 'Big coffee'));
    await outbox().flush();
    expect(c.read(transactionsProvider).first.note, 'Big coffee');
    expect(c.read(outboxProvider), hasLength(1), reason: 'the edit is folded into the create');

    data().deleteTx(temp);
    expect(c.read(outboxProvider), isEmpty);
    server.offline = false;
    await settle();
    expect(server.writes, isEmpty);
    expect(server.transactions, hasLength(2));
  });

  test('offline edit and delete of synced entries are applied later', () async {
    await data().refresh();
    final lunch = c.read(transactionsProvider).firstWhere((t) => t.note == 'Lunch');
    final salary = c.read(transactionsProvider).firstWhere((t) => t.note == 'Salary');
    server.offline = true;
    data().updateTx(lunch.id, coffee(cents: 3000, note: 'Long lunch'));
    data().deleteTx(salary.id);
    expect(c.read(balanceProvider), -3000);

    server.offline = false;
    await settle();
    expect(server.transactions.single['note'], 'Long lunch');
    expect(server.balance, -3000);
    expect(c.read(outboxProvider), isEmpty);
  });

  test('a lost response does not create a duplicate', () async {
    await data().refresh();
    server.loseNextResponse = true; // the server stores it; the phone sees a network error
    data().addTx(coffee());
    await outbox().flush();
    expect(server.transactions, hasLength(3));
    expect(c.read(outboxProvider).single.attempts, 1);
    expect(c.read(transactionsProvider).where((t) => t.note == 'Coffee'), hasLength(1));

    await settle();
    expect(server.transactions, hasLength(3), reason: 'the stored copy is claimed, not re-sent');
    expect(server.writes.where((w) => w.startsWith('POST')), hasLength(1));
    expect(c.read(outboxProvider), isEmpty);
    expect(c.read(transactionsProvider).where((t) => t.note == 'Coffee'), hasLength(1));
  });

  test('two identical entries on purpose are both kept', () async {
    await data().refresh();
    data().addTx(coffee());
    await settle();
    server.loseNextResponse = true;
    data().addTx(coffee());
    await outbox().flush(); // stored, answer lost: the duplicate check runs on retry
    await settle();
    expect(server.transactions.where((t) => t['note'] == 'Coffee'), hasLength(2));
    expect(server.writes.where((w) => w.startsWith('POST')), hasLength(2));
    expect(c.read(transactionsProvider).where((t) => t.note == 'Coffee'), hasLength(2));
  });

  test('an edit queued behind an unconfirmed create follows it to its real id', () async {
    await data().refresh();
    server.loseNextResponse = true;
    data().addTx(coffee());
    await outbox().flush();
    final temp = c.read(transactionsProvider).first.id;
    data().updateTx(temp, coffee(cents: 500, note: 'Coffee and cake'));
    await settle();
    expect(c.read(outboxProvider), isEmpty);
    final coffees = server.transactions.where((t) => (t['note'] as String).startsWith('Coffee'));
    expect(coffees.single['note'], 'Coffee and cake');
    expect(coffees.single['amountEur'], 500);
  });

  test('Access refusing the token is reported as that, and nothing is lost', () async {
    await data().refresh();
    server.accessDenied = true;
    data().addTx(coffee());
    await outbox().flush();
    await data().refresh();
    expect(c.read(netStatusProvider), NetState.accessDenied);
    expect(c.read(pendingCountProvider).waiting, 1);
    expect(c.read(transactionsProvider).first.note, 'Coffee');

    server.accessDenied = false;
    await settle();
    expect(c.read(netStatusProvider), NetState.ok);
    expect(server.transactions.last['note'], 'Coffee');
  });

  test('editing an entry deleted elsewhere drops the edit', () async {
    await data().refresh();
    final lunch = c.read(transactionsProvider).firstWhere((t) => t.note == 'Lunch');
    server.transactions.removeWhere((t) => t['id'] == lunch.id);
    data().updateTx(lunch.id, coffee(note: 'Edited'));
    await settle();
    expect(c.read(outboxProvider), isEmpty);
    expect(c.read(transactionsProvider).map((t) => t.note), ['Salary']);
  });

  test('settings are saved straight to the server', () async {
    await data().refresh();
    await data().saveSettings({'defaultRate': 262500});
    expect(c.read(rateProvider), 262500);
    expect(server.settings['defaultRate'], 262500);

    server.offline = true;
    await expectLater(
      data().saveSettings({'defaultRate': 300000}),
      throwsA(isA<ApiException>().having((e) => e.kind, 'kind', ApiFailure.network)),
    );
    expect(c.read(rateProvider), 262500);
  });

  test('applyPending is pure and keeps the newest-first order', () {
    final server = [
      Tx.fromInput(coffee(note: 'Old'), id: 'a', createdAt: '2026-11-16T08:00:00Z', pending: false),
    ];
    final ops = [
      OutboxOp(
        id: '1',
        kind: 'tx.create',
        payload: {'tempId': 'local-1', 'input': coffee(note: 'New').toJson()},
        createdAt: DateTime.utc(2026, 11, 16, 9),
      ),
      OutboxOp(
        id: '2',
        kind: 'tx.delete',
        payload: {'id': 'missing'},
        createdAt: DateTime.utc(2026, 11, 16, 9, 1),
      ),
    ];
    final view = applyPending(server, ops);
    expect(view.map((t) => t.note), ['New', 'Old']);
    expect(view.first.pending, isTrue);
    expect(server, hasLength(1));
  });
}
