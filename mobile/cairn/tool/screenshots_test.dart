// Renders the main screens to PNG with the real fonts, for a visual check without a phone:
//
//   flutter test tool/screenshots_test.dart --update-goldens
//
// Images land in build/screens/. Not part of the normal test run.
import 'dart:convert';
import 'dart:io';

import 'package:cairn/app.dart';
import 'package:cairn/data/store.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kit/kit.dart';

import '../test/fake_server.dart';
import '../test/widget_test.dart' show milestone;

Future<void> loadAppFonts() async {
  final manifest = jsonDecode(await rootBundle.loadString('FontManifest.json')) as List;
  for (final entry in manifest) {
    final loader = FontLoader(entry['family'] as String);
    for (final font in entry['fonts'] as List) {
      loader.addFont(rootBundle.load(font['asset'] as String));
    }
    await loader.load();
  }
}

String iso(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

void main() {
  late Directory dir;
  late FakeCairn server;

  setUpAll(loadAppFonts);
  setUp(() {
    dir = Directory.systemTemp.createTempSync('cairn_shots');
    final now = DateTime.now();
    String ago(int days) => iso(now.subtract(Duration(days: days)));
    server = FakeCairn()
      ..goalAmount = 3000000
      ..seed(ago(150), 'in', 420000, note: 'Savings so far')
      ..seed(ago(120), 'in', 185000, note: 'Salary')
      ..seed(ago(110), 'out', 42000, note: 'Rent')
      ..seed(ago(90), 'in', 185000, note: 'Salary')
      ..seed(ago(80), 'out', 61000, note: 'Language exam')
      ..seed(ago(60), 'in', 185000, note: 'Salary')
      ..seed(ago(45), 'out', 23500, note: 'Document translation')
      ..seed(ago(30), 'in', 190000, note: 'Salary')
      ..seed(ago(12), 'out', 18000, note: 'Groceries')
      ..seed(ago(3), 'out', 4500, note: 'Phone plan')
      ..seed(ago(1), 'in', 30000, note: 'Freelance')
      ..seed(ago(0), 'out', 1250, note: 'Coffee with Amine')
      ..milestones = [
        milestone('m1', 'Phase 1: Pre-admission', 400000, 400000, reached: true),
        milestone('m2', 'Phase 2: Visa', 600000, 1000000, reached: true),
        milestone('m3', 'Phase 3: Flight', 500000, 1500000),
        milestone('m4', 'Phase 4: First months', 1500000, 3000000),
      ];
  });
  tearDown(() => dir.deleteSync(recursive: true));

  Future<ProviderContainer> launch(
    WidgetTester tester, {
    bool dark = false,
    bool connected = true,
  }) async {
    tester.view.physicalSize = const Size(1179, 2556);
    tester.view.devicePixelRatio = 3;
    tester.view.padding = const FakeViewPadding(top: 141, bottom: 72);
    tester.view.viewPadding = const FakeViewPadding(top: 141, bottom: 72);
    addTearDown(tester.view.reset);
    final c = containerFor(server, dir, connected: connected);
    if (dark) c.read(prefsProvider.notifier).set(themeModePref, 'dark');
    await tester.pumpWidget(UncontrolledProviderScope(container: c, child: const CairnApp()));
    await tester.pumpAndSettle();
    return c;
  }

  Future<void> shot(WidgetTester tester, String name) async {
    await tester.pumpAndSettle();
    await expectLater(find.byType(CairnApp), matchesGoldenFile('../build/screens/$name.png'));
  }

  Future<void> close(WidgetTester tester, ProviderContainer c) async {
    await tester.pump(const Duration(seconds: 10));
    await tester.pumpWidget(const SizedBox());
    c.dispose();
    await tester.pump(const Duration(seconds: 1));
  }

  testWidgets('light', (tester) async {
    final c = await launch(tester);
    await shot(tester, '1-home');
    await tester.tap(find.text('Phase 3'));
    await shot(tester, '1b-home-milestone');
    await tester.tap(find.text('Activity'));
    await shot(tester, '2-activity');
    await tester.tap(find.text('Goal').last);
    await shot(tester, '3-goal');
    await tester.tap(find.text('Stats'));
    await shot(tester, '4-stats');
    await tester.drag(find.text('Balance over time'), const Offset(0, -900));
    await shot(tester, '4b-stats-lower');
    await tester.tap(find.text('Settings').last);
    await shot(tester, '5-settings');
    await tester.drag(find.text('Count reminder'), const Offset(0, -900));
    await shot(tester, '5b-settings-lower');
    await tester.tap(find.text('Home'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Money out'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(EditableText).first, '24.50');
    await tester.tap(find.text('Living'));
    await shot(tester, '6-entry-sheet');
    await close(tester, c);
  });

  testWidgets('dark and offline', (tester) async {
    final first = containerFor(server, dir);
    await tester.runAsync(() async {
      await first.read(jsonStoreProvider).write('noop', 1);
    });
    first.dispose();
    final c = await launch(tester, dark: true);
    await shot(tester, '7-home-dark');
    await tester.tap(find.text('Stats'));
    await shot(tester, '8-stats-dark');
    await close(tester, c);
  });

  // The splash, frozen at moments of interest (ms since it appeared), with a warm cache so it
  // leaves on the first hop end, at 1400 ms, and lands at 1850 ms.
  Future<void> splashShots(WidgetTester tester, {required bool dark, required List<int> at}) async {
    final first = containerFor(server, dir);
    await tester.runAsync(() async {
      await first.read(dataProvider.notifier).refresh();
      await first.read(jsonStoreProvider).write('noop', 1);
    });
    first.dispose();
    tester.view.physicalSize = const Size(1179, 2556);
    tester.view.devicePixelRatio = 3;
    tester.view.padding = const FakeViewPadding(top: 141, bottom: 72);
    tester.view.viewPadding = const FakeViewPadding(top: 141, bottom: 72);
    addTearDown(tester.view.reset);
    final c = containerFor(server, dir, splash: true);
    if (dark) c.read(prefsProvider.notifier).set(themeModePref, 'dark');
    await tester.pumpWidget(UncontrolledProviderScope(container: c, child: const CairnApp()));
    var now = 0;
    for (final ms in at) {
      while (now < ms) {
        final step = ms - now < 16 ? ms - now : 16;
        await tester.pump(Duration(milliseconds: step));
        now += step;
      }
      await expectLater(
        find.byType(CairnApp),
        matchesGoldenFile(
          '../build/screens/splash-${dark ? 'dark-' : ''}${ms.toString().padLeft(4, '0')}.png',
        ),
      );
    }
    await close(tester, c);
  }

  testWidgets('splash', (tester) async {
    await splashShots(
      tester,
      dark: false,
      at: [16, 150, 330, 515, 730, 1080, 1250, 1500, 1650, 1900],
    );
  });

  testWidgets('splash dark', (tester) async {
    await splashShots(tester, dark: true, at: [515, 1080, 1550]);
  });

  testWidgets('first run', (tester) async {
    final c = await launch(tester, connected: false);
    await shot(tester, '9-connect');
    await close(tester, c);
  });
}
