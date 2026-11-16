import 'dart:math';

import 'package:material_ui/material_ui.dart';

class _Piece {
  _Piece(Random r, Offset origin, double angle, double spread, double speed, this.color)
    : x = origin.dx,
      y = origin.dy,
      rotation = r.nextDouble() * pi,
      spin = (r.nextDouble() - 0.5) * 12,
      size = 5 + r.nextDouble() * 5,
      wobble = r.nextDouble() * pi * 2 {
    final a = angle + (r.nextDouble() - 0.5) * spread;
    final v = speed * (0.45 + r.nextDouble() * 0.55);
    vx = cos(a) * v;
    vy = -sin(a) * v;
  }

  double x, y, rotation, wobble;
  late double vx, vy;
  final double spin, size;
  final Color color;
}

/// A full-screen confetti burst. Call [ConfettiLayerState.fire] through a GlobalKey.
class ConfettiLayer extends StatefulWidget {
  const ConfettiLayer({super.key, required this.colors});
  final List<Color> colors;

  @override
  State<ConfettiLayer> createState() => ConfettiLayerState();
}

class ConfettiLayerState extends State<ConfettiLayer> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 3200),
  )..addListener(_tick);
  final _pieces = <_Piece>[];
  final _random = Random();
  double _last = 0;

  /// [big] adds two side cannons, for reaching the whole goal.
  void fire({bool big = false}) {
    if (MediaQuery.of(context).disableAnimations) return;
    final size = MediaQuery.of(context).size;
    void burst(int count, Offset origin, double angleDeg, double spreadDeg, double speed) {
      for (var i = 0; i < count; i++) {
        _pieces.add(
          _Piece(
            _random,
            origin,
            angleDeg * pi / 180,
            spreadDeg * pi / 180,
            speed,
            widget.colors[_random.nextInt(widget.colors.length)],
          ),
        );
      }
    }

    burst(big ? 160 : 90, Offset(size.width / 2, size.height * 0.7), 90, 75, size.height * 1.5);
    if (big) {
      burst(70, Offset(0, size.height * 0.75), 60, 60, size.height * 1.4);
      burst(70, Offset(size.width, size.height * 0.75), 120, 60, size.height * 1.4);
    }
    _last = 0;
    _c.forward(from: 0);
  }

  void _tick() {
    final now = _c.value * 3.2;
    final dt = (now - _last).clamp(0.0, 0.05);
    _last = now;
    for (final p in _pieces) {
      p.vy += 1500 * dt;
      p.vx *= 1 - 1.6 * dt;
      p.vy *= 1 - 1.6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.spin * dt;
      p.wobble += 8 * dt;
    }
    if (_c.isCompleted) _pieces.clear();
    setState(() {});
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_pieces.isEmpty) return const SizedBox.shrink();
    return IgnorePointer(
      child: RepaintBoundary(
        child: CustomPaint(
          size: Size.infinite,
          painter: _ConfettiPainter(List.of(_pieces), 1 - Curves.easeIn.transform(_c.value)),
        ),
      ),
    );
  }
}

class _ConfettiPainter extends CustomPainter {
  _ConfettiPainter(this.pieces, this.opacity);
  final List<_Piece> pieces;
  final double opacity;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint();
    for (final p in pieces) {
      paint.color = p.color.withValues(alpha: opacity.clamp(0.0, 1.0));
      canvas.save();
      canvas.translate(p.x, p.y);
      canvas.rotate(p.rotation);
      canvas.scale(1, cos(p.wobble).abs().clamp(0.25, 1.0));
      canvas.drawRect(Rect.fromCenter(center: Offset.zero, width: p.size, height: p.size * 0.6), paint);
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(_ConfettiPainter old) => true;
}
