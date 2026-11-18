import 'dart:math' as math;

import 'package:flutter/scheduler.dart';
import 'package:kit/kit.dart';
import 'package:material_ui/material_ui.dart';

import '../theme.dart';

// ---------- the mark ----------
//
// Same shapes as the web logo (web/index.html #splash, web/src/components/Logo.tsx), in its
// 64×64 viewBox:
//   base   ellipse (32, 50) rx 24 ry 9.5
//   middle ellipse (30.5, 31.5) rx 17 ry 7.5, rotated −5° about its centre
//   top    ellipse (33, 15) rx 11.5 ry 8.5, rotated 6° about its centre, with two eyes
//          (r 1.35 at 29.6/36.4, 14.2) and a smile (M30.9 17.4 Q33 19.3 35.1 17.4, width 1.4).

/// The height of a w×h box after rotating it by [degrees], measured the way Chrome measures an
/// SVG group's fill-box: the bounds of the rotated rectangle. The web animations scale and
/// translate each stone relative to that box.
double _rotatedBoxHeight(double w, double h, double degrees) {
  final r = degrees * math.pi / 180;
  return w * math.sin(r).abs() + h * math.cos(r).abs();
}

/// Each stone's fill-box height, and the bottom-centre point its animations scale from
/// (`transform-box: fill-box; transform-origin: 50% 100%`).
final _baseH = 19.0;
final _midH = _rotatedBoxHeight(34, 15, -5);
final _topH = _rotatedBoxHeight(23, 17, 6);
final _baseOrigin = Offset(32, 50 + _baseH / 2);
final _midOrigin = Offset(30.5, 31.5 + _midH / 2);
final _topOrigin = Offset(33, 15 + _topH / 2);

/// One stone's transform: a vertical move and a squash, both about its bottom centre, and its
/// opacity. [dy] is a fraction of the stone's own height, like the CSS percentages.
@immutable
class StoneMotion {
  const StoneMotion({this.dy = 0, this.sx = 1, this.sy = 1, this.opacity = 1});

  final double dy, sx, sy, opacity;

  static const rest = StoneMotion();

  @override
  bool operator ==(Object other) =>
      other is StoneMotion &&
      other.dy == dy &&
      other.sx == sx &&
      other.sy == sy &&
      other.opacity == opacity;

  @override
  int get hashCode => Object.hash(dy, sx, sy, opacity);
}

/// How the mark is drawn at one moment. At rest everything is in place.
@immutable
class MarkPose {
  const MarkPose({
    this.base = StoneMotion.rest,
    this.mid = StoneMotion.rest,
    this.top = StoneMotion.rest,
    this.hop = StoneMotion.rest,
    this.eyes = 1,
  });

  /// The drop of each stone (web: `.splash-stone`).
  final StoneMotion base, mid, top;

  /// The top stone's hop, on top of its drop (web: `.splash-hop`, and the goal celebration).
  final StoneMotion hop;

  /// The eyes' vertical scale, for the blink (1 = open).
  final double eyes;

  static const rest = MarkPose();

  @override
  bool operator ==(Object other) =>
      other is MarkPose &&
      other.base == base &&
      other.mid == mid &&
      other.top == top &&
      other.hop == hop &&
      other.eyes == eyes;

  @override
  int get hashCode => Object.hash(base, mid, top, hop, eyes);
}

/// Paints the mark in a square, in the theme's logo colours.
class MarkPainter extends CustomPainter {
  MarkPainter({
    required this.base,
    required this.middle,
    required this.top,
    required this.face,
    this.pose = MarkPose.rest,
  });

  /// The colours for the current theme (web: --logo-stone-base, -middle, -top, --logo-face).
  factory MarkPainter.of(BuildContext context, [MarkPose pose = MarkPose.rest]) => MarkPainter(
    base: context.cairn.stoneBase,
    middle: context.cairn.stoneMiddle,
    top: context.kit.accent,
    face: context.kit.onAccent,
    pose: pose,
  );

  final Color base, middle, top, face;
  final MarkPose pose;

  /// Applies [m] about [origin] for a stone whose fill-box is [height] tall.
  static void _move(Canvas canvas, StoneMotion m, Offset origin, double height) {
    if (m.dy == 0 && m.sx == 1 && m.sy == 1) return;
    canvas.translate(origin.dx, origin.dy + m.dy * height);
    canvas.scale(m.sx, m.sy);
    canvas.translate(-origin.dx, -origin.dy);
  }

  /// Runs [draw] at opacity [o]. A group's opacity in SVG fades it as one picture, so a stone
  /// with a face needs its own layer.
  static void _faded(Canvas canvas, double o, Rect bounds, void Function() draw) {
    if (o <= 0) return;
    if (o >= 1) return draw();
    canvas.saveLayer(bounds, Paint()..color = Color.fromRGBO(0, 0, 0, o));
    draw();
    canvas.restore();
  }

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(size.width / 64, size.height / 64);
    final fill = Paint()..isAntiAlias = true;
    const everything = Rect.fromLTWH(-64, -256, 192, 384);

    canvas.save();
    _move(canvas, pose.base, _baseOrigin, _baseH);
    _faded(canvas, pose.base.opacity, everything, () {
      canvas.drawOval(
        Rect.fromCenter(center: const Offset(32, 50), width: 48, height: 19),
        fill..color = base,
      );
    });
    canvas.restore();

    canvas.save();
    _move(canvas, pose.mid, _midOrigin, _midH);
    _faded(canvas, pose.mid.opacity, everything, () {
      canvas.translate(30.5, 31.5);
      canvas.rotate(-5 * math.pi / 180);
      canvas.drawOval(
        Rect.fromCenter(center: Offset.zero, width: 34, height: 15),
        fill..color = middle,
      );
    });
    canvas.restore();

    canvas.save();
    _move(canvas, pose.top, _topOrigin, _topH);
    _faded(canvas, pose.top.opacity, everything, () {
      _move(canvas, pose.hop, _topOrigin, _topH);
      canvas.translate(33, 15);
      canvas.rotate(6 * math.pi / 180);
      canvas.drawOval(
        Rect.fromCenter(center: Offset.zero, width: 23, height: 17),
        fill..color = top,
      );
      fill.color = face;
      for (final x in const [-3.4, 3.4]) {
        // Each eye blinks about its own centre.
        canvas.save();
        canvas.translate(x, -0.8);
        canvas.scale(1, pose.eyes);
        canvas.drawCircle(Offset.zero, 1.35, fill);
        canvas.restore();
      }
      canvas.drawPath(
        Path()
          ..moveTo(-2.1, 2.4)
          ..quadraticBezierTo(0, 4.3, 2.1, 2.4),
        Paint()
          ..isAntiAlias = true
          ..color = face
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.4
          ..strokeCap = StrokeCap.round,
      );
    });
    canvas.restore();

    canvas.restore();
  }

  @override
  bool shouldRepaint(MarkPainter old) =>
      old.pose != pose ||
      old.base != base ||
      old.middle != middle ||
      old.top != top ||
      old.face != face;
}

/// The Cairn mark: three stacked stones, the top one with a small face.
/// [hop] lifts the top stone (0 = resting), for the goal celebration.
class LogoMark extends StatelessWidget {
  const LogoMark({super.key, this.size = 28, this.hop = 0, this.pose});

  final double size;
  final double hop;

  /// Overrides [hop] with a full pose (the splash).
  final MarkPose? pose;

  @override
  Widget build(BuildContext context) {
    final p = pose ?? (hop == 0 ? MarkPose.rest : MarkPose(hop: StoneMotion(dy: -hop * 7 / _topH)));
    return CustomPaint(size: Size.square(size), painter: MarkPainter.of(context, p));
  }
}

/// Mark plus the lowercase wordmark. [markKey] marks where the splash lands.
class Logo extends StatelessWidget {
  const Logo({super.key, this.size = 28, this.hop = 0, this.markKey});

  final double size;
  final double hop;
  final Key? markKey;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Cairn',
      excludeSemantics: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          LogoMark(key: markKey, size: size, hop: hop),
          SizedBox(width: size * 0.22),
          Text(
            'cairn',
            style: TextStyle(
              fontFamily: kitDisplay,
              fontSize: size * 0.82,
              height: 1,
              letterSpacing: -0.3,
              color: context.kit.text,
              fontWeight: FontWeight.w800,
              fontVariations: const [FontVariation.weight(800)],
            ),
          ),
        ],
      ),
    );
  }
}

// ---------- the splash keyframes (web/src/styles/global.css "Shown in index.html") ----------

/// CSS timing keywords.
const _cssEase = Cubic(0.25, 0.1, 0.25, 1);
const _cssEaseOut = Cubic(0, 0, 0.58, 1);
const _cssEaseInOut = Cubic(0.42, 0, 0.58, 1);

/// A CSS @keyframes track: [frames] are (offset 0–1, value); segment i is eased by [curves][i],
/// or by [curve] when no per-keyframe timing function is given.
double _track(
  double p,
  List<(double, double)> frames, {
  Curve curve = _cssEase,
  List<Curve>? curves,
}) {
  if (p <= frames.first.$1) return frames.first.$2;
  for (var i = 0; i < frames.length - 1; i++) {
    final (a, va) = frames[i];
    final (b, vb) = frames[i + 1];
    if (p <= b) {
      final c = curves?[i] ?? curve;
      return va + (vb - va) * c.transform((p - a) / (b - a));
    }
  }
  return frames.last.$2;
}

/// `splash-drop 500ms both`: from 2.6 stone-heights above, squash on landing, settle.
const _dropMs = 500.0;
const _dropCurves = [Cubic(0.5, 0, 0.9, 0.5), _cssEaseOut, _cssEaseInOut];

StoneMotion _drop(double ms, double delay) {
  final p = ((ms - delay) / _dropMs).clamp(0.0, 1.0);
  return StoneMotion(
    dy: _track(p, const [(0, -2.6), (0.55, 0), (0.78, -0.06), (1, 0)], curves: _dropCurves),
    sx: _track(p, const [(0, 0.96), (0.55, 1.12), (0.78, 0.97), (1, 1)], curves: _dropCurves),
    sy: _track(p, const [(0, 1.06), (0.55, 0.82), (0.78, 1.05), (1, 1)], curves: _dropCurves),
    // Opacity is only keyed at 0% and 15%, so it uses the first segment's timing function.
    opacity: _track(p, const [(0, 0), (0.15, 1)], curve: _dropCurves.first),
  );
}

/// `splash-hop 640ms ease-in-out 760ms infinite` on the top stone.
const hopStartMs = 760.0;
const hopPeriodMs = 640.0;

StoneMotion _hop(double ms) {
  if (ms < hopStartMs) return StoneMotion.rest;
  final q = ((ms - hopStartMs) % hopPeriodMs) / hopPeriodMs;
  return StoneMotion(
    dy: _track(q, const [(0, 0), (0.18, 0), (0.5, -0.3), (0.8, 0), (1, 0)], curve: _cssEaseInOut),
    sx: _track(q, const [
      (0, 1),
      (0.18, 1.08),
      (0.5, 0.97),
      (0.8, 1.06),
      (1, 1),
    ], curve: _cssEaseInOut),
    sy: _track(q, const [
      (0, 1),
      (0.18, 0.9),
      (0.5, 1.04),
      (0.8, 0.93),
      (1, 1),
    ], curve: _cssEaseInOut),
  );
}

/// `splash-blink 220ms var(--ease-out) 620ms`, once, not held before or after.
double _blink(double ms) {
  final p = (ms - 620) / 220;
  if (p < 0 || p >= 1) return 1;
  return _track(p, const [(0, 1), (0.5, 0.1), (1, 1)], curve: Motion.easeOut);
}

/// The pose [ms] after the splash appeared: the stones drop in 120 ms apart and squash as they
/// land, the top one blinks, then it hops until the splash leaves.
MarkPose splashPose(double ms) => MarkPose(
  base: _drop(ms, 0),
  mid: _drop(ms, 120),
  top: _drop(ms, 240),
  hop: _hop(ms),
  eyes: _blink(ms),
);

/// When the splash may leave, given that it was free to from [readyMs] on: at the end of the
/// next hop, so stopping the hop doesn't make the stone jump, but never more than 800 ms later
/// (web/src/lib/splash.ts: the `animationiteration` / `sleep(800)` race).
double splashLeaveAt(double readyMs) {
  final iterations = math.max(1, ((readyMs - hopStartMs) / hopPeriodMs).ceil());
  final hopEnd = hopStartMs + iterations * hopPeriodMs;
  return math.min(hopEnd, readyMs + 800);
}

/// The loading splash, ported from web/src/lib/splash.ts.
///
/// The stones drop in and the top one keeps hopping. It stays at least [minMs], and longer
/// only while [ready] is false (a first load with nothing cached), up to [maxMs]. Then, at the
/// end of a hop, the mark flies onto the header logo ([target]) as the background fades. With
/// reduced motion it is the still logo, removed with no flight as soon as it may leave.
class Splash extends StatefulWidget {
  const Splash({super.key, required this.target, required this.ready, required this.onDone});

  final GlobalKey target;
  final bool ready;
  final VoidCallback onDone;

  static const minMs = 700.0, reducedMinMs = 200.0, maxMs = 5000.0, flightMs = 450.0;

  /// The mark is 6rem across.
  static const size = 96.0;

  @override
  State<Splash> createState() => _SplashState();
}

class _SplashState extends State<Splash> with SingleTickerProviderStateMixin {
  late final Ticker _ticker = createTicker(_tick);
  double _ms = 0;
  double? _leaveAt;
  double? _flightStart;
  Offset _to = Offset.zero;
  double _toScale = 1;
  bool _hasTarget = false;
  bool _still = false;
  bool _done = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _still = MediaQuery.disableAnimationsOf(context);
    if (!_ticker.isActive && !_done) _ticker.start();
  }

  void _tick(Duration elapsed) {
    final ms = elapsed.inMicroseconds / 1000;
    final mayLeave = widget.ready || ms >= Splash.maxMs;
    if (_still) {
      if (ms >= Splash.reducedMinMs && mayLeave) _finish();
      return;
    }
    if (_leaveAt == null && ms >= Splash.minMs && mayLeave) _leaveAt = splashLeaveAt(ms);
    if (_flightStart == null && _leaveAt != null && ms >= _leaveAt!) {
      _measure();
      _flightStart = _leaveAt;
    }
    setState(() => _ms = ms);
    if (_flightStart != null && ms - _flightStart! >= Splash.flightMs) _finish();
  }

  void _finish() {
    if (_done) return;
    _done = true;
    _ticker.stop();
    widget.onDone();
  }

  /// Where the header's mark is, relative to the splash's own mark (top-left to top-left).
  void _measure() {
    final box = widget.target.currentContext?.findRenderObject() as RenderBox?;
    final own = context.findRenderObject() as RenderBox?;
    if (box == null || own == null || !box.attached || !box.hasSize || !own.hasSize) return;
    final from = own.size.center(Offset.zero) - const Offset(Splash.size / 2, Splash.size / 2);
    _to = box.localToGlobal(Offset.zero, ancestor: own) - from;
    _toScale = box.size.height / Splash.size;
    _hasTarget = true;
  }

  @override
  void dispose() {
    _ticker.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    final flying = _flightStart == null
        ? 0.0
        : Motion.easeOut.transform(((_ms - _flightStart!) / Splash.flightMs).clamp(0.0, 1.0));
    final pose = _still || _flightStart != null ? MarkPose.rest : splashPose(_ms);

    Widget mark = SizedBox.square(
      dimension: Splash.size,
      child: CustomPaint(painter: MarkPainter.of(context, pose)),
    );
    if (_hasTarget) {
      mark = Transform.translate(
        offset: _to * flying,
        child: Transform.scale(
          scale: 1 + (_toScale - 1) * flying,
          alignment: Alignment.topLeft,
          child: mark,
        ),
      );
    } else if (_flightStart != null) {
      // No header logo on screen: the mark fades out where it is.
      mark = Opacity(opacity: 1 - flying, child: mark);
    }

    // The splash takes taps until it starts to leave; the app is usable during the flight.
    return IgnorePointer(
      ignoring: _flightStart != null,
      child: Semantics(
        label: 'Cairn is loading',
        container: true,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () {},
          child: Stack(
            children: [
              Positioned.fill(
                child: ColoredBox(color: t.bg.withValues(alpha: 1 - flying)),
              ),
              Center(child: mark),
            ],
          ),
        ),
      ),
    );
  }
}
