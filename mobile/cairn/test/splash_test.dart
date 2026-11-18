import 'dart:async';
import 'dart:io';

import 'package:cairn/app.dart';
import 'package:cairn/data/store.dart';
import 'package:cairn/ui/widgets/logo.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kit/kit.dart';

import 'fake_server.dart';

void main() {
  group('keyframes (web/src/styles/global.css)', () {
    test('the stones drop in one at a time and settle', () {
      final start = splashPose(0);
      expect([start.base.opacity, start.mid.opacity, start.top.opacity], [0, 0, 0]);
      expect(start.base.dy, -2.6);
      // 15% into the base stone's drop it is fully opaque; the others have not started.
      final early = splashPose(75);
      expect(early.base.opacity, 1);
      expect(early.mid.opacity, 0);
      // 55%: landed and squashed.
      final landed = splashPose(275);
      expect(landed.base.dy, closeTo(0, 1e-9));
      expect(landed.base.sx, closeTo(1.12, 1e-9));
      expect(landed.base.sy, closeTo(0.82, 1e-9));
      // The top stone starts 240 ms in and is at rest at 740 ms.
      expect(splashPose(240).top.opacity, 0);
      final settled = splashPose(740);
      for (final s in [settled.base, settled.mid, settled.top]) {
        expect([s.dy, s.sx, s.sy, s.opacity], [0, 1, 1, 1]);
      }
    });

    test('the top stone blinks once, then hops every 640 ms', () {
      expect(splashPose(619).eyes, 1);
      expect(splashPose(730).eyes, closeTo(0.1, 1e-9));
      expect(splashPose(840).eyes, 1);
      expect(splashPose(759).hop, StoneMotion.rest);
      final peak = splashPose(760 + 320);
      expect(peak.hop.dy, closeTo(-0.3, 1e-9));
      expect(peak.hop.sx, closeTo(0.97, 1e-9));
      expect(splashPose(1400).hop, StoneMotion.rest);
      expect(splashPose(1080 + 640).hop.dy, closeTo(-0.3, 1e-9));
    });

    test('it leaves at the end of a hop, at most 800 ms after it may', () {
      expect(splashLeaveAt(700), 1400);
      expect(splashLeaveAt(1400), 1400);
      expect(splashLeaveAt(1401), 2040);
      expect(splashLeaveAt(3010), 3320);
    });
  });

  group('splash in the app', () {
    late Directory dir;
    late FakeCairn server;

    setUp(() {
      dir = Directory.systemTemp.createTempSync('cairn_splash');
      server = FakeCairn()..seed('2026-11-01', 'in', 100000, note: 'Salary');
    });
    tearDown(() => dir.deleteSync(recursive: true));

    Future<void> fillCache(WidgetTester tester) async {
      final first = containerFor(server, dir);
      await tester.runAsync(() async {
        await first.read(dataProvider.notifier).refresh();
        await first.read(jsonStoreProvider).write('noop', 1);
      });
      first.dispose();
    }

    /// Starts the app with the splash and returns a clock that advances it frame by frame.
    Future<(ProviderContainer, Future<void> Function(double ms))> launch(
      WidgetTester tester,
    ) async {
      tester.view.physicalSize = const Size(1170, 2532);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      final c = containerFor(server, dir, splash: true);
      await tester.pumpWidget(UncontrolledProviderScope(container: c, child: const CairnApp()));
      var now = 0.0;
      Future<void> until(double ms) async {
        while (now < ms) {
          await tester.pump(const Duration(milliseconds: 10));
          now += 10;
        }
      }

      return (c, until);
    }

    Future<void> close(WidgetTester tester, ProviderContainer c) async {
      await tester.pumpWidget(const SizedBox());
      c.dispose();
      await tester.pump(const Duration(seconds: 1));
    }

    testWidgets('with cached data: the app is there from the first frame, the splash lands '
        'after one hop', (tester) async {
      await fillCache(tester);
      server.offline = true; // a slow network must not hold it when there is a cache
      final (c, until) = await launch(tester);
      expect(find.byType(Splash), findsOneWidget);
      expect(find.text('€1,000.00'), findsWidgets, reason: 'cached data is rendered under it');

      await until(1400);
      expect(find.byType(Splash), findsOneWidget);
      await until(1840);
      expect(find.byType(Splash), findsOneWidget, reason: 'mid-flight');
      await until(1870);
      expect(find.byType(Splash), findsNothing);
      await close(tester, c);
    });

    testWidgets('a first load with nothing cached holds it until the data arrives', (tester) async {
      server.hold = Completer();
      final (c, until) = await launch(tester);
      await until(3000);
      expect(find.byType(Splash), findsOneWidget);
      server.hold!.complete();
      server.hold = null;
      await until(3700);
      expect(find.byType(Splash), findsOneWidget, reason: 'it lands after the hop ending at 3320');
      await until(3790);
      expect(find.byType(Splash), findsNothing);
      expect(find.text('€1,000.00'), findsWidgets);
      await close(tester, c);
    });

    testWidgets('a stuck network never holds it past 5 seconds', (tester) async {
      server.hold = Completer();
      final (c, until) = await launch(tester);
      await until(5600);
      expect(find.byType(Splash), findsOneWidget);
      await until(5720);
      expect(find.byType(Splash), findsNothing);
      server.hold!.complete();
      await close(tester, c);
    });

    testWidgets('reduced motion: a still logo, gone as soon as it may go', (tester) async {
      tester.platformDispatcher.accessibilityFeaturesTestValue = const FakeAccessibilityFeatures(
        disableAnimations: true,
      );
      addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
      await fillCache(tester);
      final (c, until) = await launch(tester);
      await until(190);
      expect(find.byType(Splash), findsOneWidget);
      await until(220);
      expect(find.byType(Splash), findsNothing);
      await close(tester, c);
    });
  });
}
