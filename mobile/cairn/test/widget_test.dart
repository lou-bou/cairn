import 'dart:io';

import 'package:cairn/app.dart';
import 'package:cairn/data/store.dart';
import 'package:cairn/data/view.dart';
import 'package:cairn/ui/widgets/progress_trail.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kit/kit.dart';

import 'fake_server.dart';

void main() {
  late Directory dir;
  late FakeCairn server;

  setUp(() {
    dir = Directory.systemTemp.createTempSync('cairn_widget');
    server = FakeCairn()
      ..seed('2026-08-01', 'in', 100000, note: 'Salary')
      ..seed('2026-09-03', 'out', 2500, note: 'Lunch')
      ..seed(todayForTests(), 'out', 1200, note: 'Taxi')
      ..milestones = [
        milestone('m1', 'Phase 1: Fees', 50000, 50000, reached: true),
        milestone('m2', 'Phase 2: Deposit', 100000, 150000),
        milestone('m3', 'Phase 3: Flight and first month', 150000, 300000),
      ];
  });
  tearDown(() => dir.deleteSync(recursive: true));

  /// Pumps the app on a phone-sized screen and returns its container.
  Future<ProviderContainer> launch(WidgetTester tester, {bool connected = true}) async {
    tester.view.physicalSize = const Size(1170, 2532);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final c = containerFor(server, dir, connected: connected);
    await tester.pumpWidget(UncontrolledProviderScope(container: c, child: const CairnApp()));
    await tester.pumpAndSettle();
    return c;
  }

  /// Unmount and dispose so no timers outlive the test.
  Future<void> close(WidgetTester tester, ProviderContainer c) async {
    await tester.pump(const Duration(seconds: 10)); // let toasts time out
    await tester.pumpWidget(const SizedBox());
    c.dispose();
    await tester.pump(const Duration(seconds: 1));
  }

  testWidgets('first run: connect with a service token, then the data loads', (tester) async {
    final c = await launch(tester, connected: false);
    expect(find.text('Connect to your server'), findsOneWidget);

    // A wrong token is explained, and nothing is saved.
    server.accessDenied = true;
    await tester.enterText(find.byType(EditableText).at(0), 'cairn.test');
    await tester.enterText(find.byType(EditableText).at(1), 'id.access');
    await tester.enterText(find.byType(EditableText).at(2), 'wrong');
    await tester.tap(find.text('Test and save'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Cloudflare Access refused this service token'), findsOneWidget);
    expect(c.read(connectionProvider), isNull);

    server.accessDenied = false;
    await tester.scrollUntilVisible(
      find.text('Test and save'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Test and save'));
    await tester.pumpAndSettle();
    expect(c.read(connectionProvider)!.baseUrl, 'https://cairn.test');
    expect(find.text('BALANCE'), findsOneWidget);
    expect(find.text('€963.00'), findsWidgets);
    expect(find.text('Taxi'), findsOneWidget);
    final sent = server.adapter.requests.last.headers;
    expect(sent['CF-Access-Client-Id'], 'id.access');
    await close(tester, c);
  });

  testWidgets('every tab renders with real-looking data', (tester) async {
    final c = await launch(tester);
    expect(find.text('Move abroad'), findsOneWidget);
    expect(find.text('Phase 1'), findsOneWidget); // short milestone label on the trail
    expect(find.textContaining('You can afford'), findsOneWidget);

    await tester.tap(find.text('Activity'));
    await tester.pumpAndSettle();
    expect(find.text('3 entries'), findsOneWidget);
    await tester.enterText(find.byType(EditableText).first, 'lun');
    await tester.pumpAndSettle();
    expect(find.text('1 entry matches'), findsOneWidget);
    expect(find.text('Lunch'), findsOneWidget);
    expect(find.text('Taxi'), findsNothing);

    await tester.tap(find.text('Goal').last);
    await tester.pumpAndSettle();
    expect(find.text('Phase 2: Deposit'), findsOneWidget);
    expect(find.text('Milestones total'), findsOneWidget);

    await tester.tap(find.text('Stats'));
    await tester.pumpAndSettle();
    expect(find.text('Balance over time'), findsOneWidget);
    expect(find.text('In vs out by month'), findsOneWidget);
    await tester.tap(find.text('All time'));
    await tester.pumpAndSettle();
    expect(find.text('€1,000.00'), findsWidgets);

    await tester.tap(find.text('Settings').last);
    await tester.pumpAndSettle();
    expect(find.text('Exchange rate'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Connection'),
      300,
      scrollable: find
          .descendant(of: find.byType(CustomScrollView), matching: find.byType(Scrollable))
          .first,
    );
    expect(find.text('cairn.test'), findsOneWidget);
    expect(find.text('Connected'), findsOneWidget);

    // Switching the display currency converts totals at the default rate.
    await tester.tap(find.text('DZD').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Home'));
    await tester.pumpAndSettle();
    expect(find.text('264,825 DA'), findsWidgets);
    await close(tester, c);
  });

  testWidgets('offline: cached data shows at once and a new entry is kept', (tester) async {
    // A first session fills the cache.
    final first = containerFor(server, dir);
    await tester.runAsync(() async {
      await first.read(dataProvider.notifier).refresh();
      await first.read(jsonStoreProvider).write('noop', 1);
    });
    first.dispose();

    server.offline = true;
    final c = await launch(tester);
    expect(find.text('€963.00'), findsWidgets);
    expect(find.text('Offline'), findsOneWidget);

    await tester.tap(find.text('Money out'));
    await tester.pumpAndSettle();
    expect(find.text('New entry'), findsOneWidget);

    // Nothing entered yet: the form says what is missing instead of closing.
    await tester.tap(find.text('Add'));
    await tester.pumpAndSettle();
    expect(find.text('Enter an amount'), findsOneWidget);
    expect(find.text('Choose a category'), findsOneWidget);

    await tester.enterText(find.byType(EditableText).first, '12,5');
    await tester.tap(find.text('Living'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add'));
    await tester.pumpAndSettle();

    expect(find.text('New entry'), findsNothing);
    expect(find.text('€950.50'), findsWidgets, reason: 'the balance includes the unsent entry');
    expect(find.text('Offline · 1'), findsOneWidget);
    expect(c.read(pendingCountProvider).waiting, 1);
    expect(server.transactions, hasLength(3));

    // Back online: it is sent and the pill goes away.
    server.offline = false;
    await tester.runAsync(() => c.read(dataProvider.notifier).refresh());
    await tester.pumpAndSettle();
    expect(server.transactions, hasLength(4));
    expect(server.transactions.last['amountEur'], 1250);
    expect(find.textContaining('Offline'), findsNothing);
    await close(tester, c);
  });

  test('trail labels never overlap and stay inside the track', () {
    final xs = [40.0, 60.0, 150.0, 290.0];
    final widths = [70.0, 80.0, 60.0, 90.0];
    final placed = placeLabels(xs, widths, 300);
    for (var i = 0; i < placed.length; i++) {
      expect(placed[i].left, greaterThanOrEqualTo(0));
      expect(placed[i].left + widths[i], lessThanOrEqualTo(300));
      for (var j = i + 1; j < placed.length; j++) {
        if (placed[i].row != placed[j].row) continue;
        final apart =
            placed[i].left + widths[i] <= placed[j].left ||
            placed[j].left + widths[j] <= placed[i].left;
        expect(apart, isTrue, reason: 'labels $i and $j share a row and overlap');
      }
    }
    expect(placed[3].left, 200, reason: 'a label that would overflow hangs left of its marker');
  });
}

String todayForTests() {
  final n = DateTime.now();
  return '${n.year}-${n.month.toString().padLeft(2, '0')}-${n.day.toString().padLeft(2, '0')}';
}

Map<String, dynamic> milestone(String id, String name, int cost, int threshold, {bool reached = false}) => {
  'id': id,
  'name': name,
  'note': '',
  'sortOrder': 0,
  'costOriginal': cost,
  'currency': 'EUR',
  'rate': 275000,
  'costEur': cost,
  'thresholdEur': threshold,
  'achievedAt': reached ? '2026-08-01T10:00:00.000Z' : null,
  'celebrationSeen': true,
};
