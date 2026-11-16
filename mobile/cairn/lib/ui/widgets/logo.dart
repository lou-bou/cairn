import 'dart:math' as math;

import 'package:kit/kit.dart';
import 'package:material_ui/material_ui.dart';

import '../theme.dart';

/// The Cairn mark: three stacked stones, the top one with a small face.
/// [hop] lifts the top stone (0 = resting), for the goal celebration.
class LogoMark extends StatelessWidget {
  const LogoMark({super.key, this.size = 28, this.hop = 0});

  final double size;
  final double hop;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: Size.square(size),
      painter: _MarkPainter(
        base: context.cairn.stoneBase,
        middle: context.cairn.stoneMiddle,
        top: context.kit.accent,
        face: context.kit.onAccent,
        hop: hop,
      ),
    );
  }
}

class _MarkPainter extends CustomPainter {
  _MarkPainter({
    required this.base,
    required this.middle,
    required this.top,
    required this.face,
    required this.hop,
  });

  final Color base, middle, top, face;
  final double hop;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 64);
    final p = Paint()..isAntiAlias = true;

    canvas.drawOval(
      Rect.fromCenter(center: const Offset(32, 50), width: 48, height: 19),
      p..color = base,
    );

    canvas.save();
    canvas.translate(30.5, 31.5);
    canvas.rotate(-5 * math.pi / 180);
    canvas.drawOval(
      Rect.fromCenter(center: Offset.zero, width: 34, height: 15),
      p..color = middle,
    );
    canvas.restore();

    canvas.save();
    canvas.translate(33, 15 - hop * 7);
    canvas.rotate(6 * math.pi / 180);
    canvas.drawOval(Rect.fromCenter(center: Offset.zero, width: 23, height: 17), p..color = top);
    p.color = face;
    canvas.drawCircle(const Offset(-3.4, -0.8), 1.35, p);
    canvas.drawCircle(const Offset(3.4, -0.8), 1.35, p);
    final smile = Path()
      ..moveTo(-2.1, 2.4)
      ..quadraticBezierTo(0, 4.3, 2.1, 2.4);
    canvas.drawPath(
      smile,
      Paint()
        ..color = face
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.3
        ..strokeCap = StrokeCap.round,
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(_MarkPainter old) =>
      old.hop != hop || old.base != base || old.middle != middle || old.top != top;
}

/// Mark plus the lowercase wordmark.
class Logo extends StatelessWidget {
  const Logo({super.key, this.size = 28, this.hop = 0});

  final double size;
  final double hop;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Cairn',
      excludeSemantics: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          LogoMark(size: size, hop: hop),
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
