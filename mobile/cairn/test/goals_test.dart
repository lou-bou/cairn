import 'dart:io';

import 'package:cairn/app.dart';
import 'package:cairn/data/store.dart';
import 'package:cairn/data/view.dart';
import 'package:cairn/ui/sheets/milestone_sheet.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_server.dart';

void main() {
  late Directory dir;
  late FakeCairn server;

  setUp(() {
    dir = Directory.systemTemp.createTempSync('cairn_goals');
    server = FakeCairn()..seed('2026-11-01', 'in', 1700000, note: 'Savings');
    server.goals.add({'id': 'car', 'name': 'Car', 'mode': 'auto', 'archivedAt': null});
    server.goalMilestones['car'] = [];
    for (final (name, euros) in const [
      ('Car', 16000),
      ('Insurance (first year)', 2000),
      ('Registration', 150),
      ('Repair buffer', 1000),
      ('Driving test and licence', 4000),
    ]) {
      server.goalMilestones['car']!.add({
        'id': 'car-$name',
        'name': name,
        'note': '',
        'sortOrder': 0,
        'costOriginal': euros * 100,
        'currency': 'EUR',
        'rate': 275000,
        'costEur': euros * 100,
        'achievedAt': null,
        'celebrationSeen': true,
      });
    }
  });
  tearDown(() => dir.deleteSync(recursive: true));

  Future<ProviderContainer> launch(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1170, 2532);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final c = containerFor(server, dir);
    await tester.pumpWidget(UncontrolledProviderScope(container: c, child: const CairnApp()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Goal').last);
    await tester.pumpAndSettle();
    return c;
  }

  Future<void> close(WidgetTester tester, ProviderContainer c) async {
    await tester.pump(const Duration(seconds: 10));
    await tester.pumpWidget(const SizedBox());
    c.dispose();
    await tester.pump(const Duration(seconds: 1));
  }

  testWidgets('switch the goal you are working toward', (tester) async {
    final c = await launch(tester);
    expect(find.text('WORKING TOWARD'), findsOneWidget);
    expect(find.text('Move abroad'), findsWidgets);
    expect(c.read(goalsProvider).map((g) => g.name), ['Move abroad', 'Car']);

    await tester.tap(find.text('Switch'));
    await tester.pumpAndSettle();
    expect(find.text('Work toward'), findsOneWidget);
    // €17,000 covers the car itself, not the insurance after it.
    expect(find.text('1 of 5 milestones covered'), findsOneWidget);
    expect(find.text('€23,150.00'), findsOneWidget);

    await tester.tap(find.text('Car').first);
    await tester.pumpAndSettle();
    expect(server.activeId, 'car');
    expect(c.read(goalProvider)!.name, 'Car');
    expect(find.text('Driving test and licence'), findsOneWidget);
    await close(tester, c);
  });

  testWidgets('add a goal, then its milestones, without switching to it', (tester) async {
    final c = await launch(tester);
    await tester.tap(find.text('All goals'));
    await tester.pumpAndSettle();
    expect(find.text('Goals'), findsOneWidget);

    await tester.tap(find.text('New goal'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(EditableText).last, 'Laptop');
    await tester.tap(find.text('Add goal'));
    await tester.pumpAndSettle();

    // Its own page opens, ready for milestones.
    expect(find.text('No milestones yet'), findsOneWidget);
    expect(find.text('Work toward this goal'), findsOneWidget);
    final laptop = server.goals.last['id'] as String;
    expect(server.goals.last['name'], 'Laptop');

    await tester.tap(find.text('Add').last);
    await tester.pumpAndSettle();
    final fields = find.descendant(
      of: find.byType(MilestoneSheet),
      matching: find.byType(EditableText),
    );
    await tester.enterText(fields.at(0), 'Laptop');
    await tester.enterText(fields.at(1), '1200');
    await tester.tap(find.text('Add milestone'));
    await tester.pumpAndSettle();

    expect(server.goalMilestones[laptop]!.single['costEur'], 120000);
    expect(server.activeId, 'g1', reason: 'adding a goal does not switch to it');
    expect(c.read(goalsProvider).firstWhere((g) => g.id == laptop).amountEur, 120000);
    await close(tester, c);
  });

  testWidgets('a server from before goals still shows its one goal', (tester) async {
    server.oldServer = true;
    final c = await launch(tester);
    expect(c.read(dataProvider).error, isNull, reason: 'the missing route is not a failure');
    final goals = c.read(goalsProvider);
    expect(goals.map((g) => g.name), ['Move abroad']);
    expect(find.text('WORKING TOWARD'), findsOneWidget);
    await close(tester, c);
  });
}
