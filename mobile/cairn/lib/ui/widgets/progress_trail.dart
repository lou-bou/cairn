import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:material_ui/material_ui.dart';

import '../../data/view.dart';
import '../../domain/milestones.dart';
import '../../domain/models.dart';
import '../theme.dart';

typedef Placed = ({double left, int row});

const _gap = 8.0;
const _maxRows = 4;
const _rowHeight = 26.0;

/// Flag-style label placement: each label starts at its marker and extends right. Placing from
/// the rightmost marker leftward, a label drops a row whenever it would run into one already
/// placed. Labels that would overflow the right edge hang left of their marker instead.
List<Placed> placeLabels(List<double> xs, List<double> widths, double trackWidth) {
  final rows = <List<({double start, double end})>>[];
  final out = List<Placed>.filled(xs.length, (left: 0, row: 0));
  for (var i = xs.length - 1; i >= 0; i--) {
    final x = xs[i], w = widths[i];
    final left = x + w <= trackWidth ? x : (x - w < 0 ? 0.0 : x - w);
    var row = rows.indexWhere(
      (spans) => spans.every((s) => left + w + _gap <= s.start || left >= s.end + _gap),
    );
    if (row == -1) row = rows.length < _maxRows ? rows.length : _maxRows - 1;
    if (row == rows.length) rows.add([]);
    rows[row].add((start: left, end: left + w));
    out[i] = (left: left, row: row);
  }
  return out;
}

/// The goal as a trail: a progress bar with a marker per milestone and a flag at the end.
/// Tap a label for that milestone's details.
class ProgressTrail extends ConsumerStatefulWidget {
  const ProgressTrail({super.key, required this.goal, required this.milestones});

  final Goal goal;
  final List<Milestone> milestones;

  @override
  ConsumerState<ProgressTrail> createState() => _ProgressTrailState();
}

class _ProgressTrailState extends ConsumerState<ProgressTrail> {
  String? _selected;

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    final c = context.cairn;
    final goal = widget.goal;
    final milestones = widget.milestones;
    final money = ref.watch(moneyProvider);
    final goalEur = goal.amountEur < 1 ? 1 : goal.amountEur;
    double frac(int eur) => (eur / goalEur).clamp(0.0, 1.0);
    final balance = goal.balanceEur < 0 ? 0 : goal.balanceEur;
    final goalReached = goal.amountEur > 0 && goal.balanceEur >= goal.amountEur;
    final labelStyle = context.text.labelMedium!.copyWith(fontWeight: FontWeight.w600);
    final detail = milestones.where((m) => m.id == _selected).firstOrNull;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        LayoutBuilder(
          builder: (context, box) {
            // The flag sits at the end of the track; keep markers clear of it.
            final width = box.maxWidth - 14;
            final xs = [for (final m in milestones) frac(m.thresholdEur) * width];
            final widths = [
              for (final m in milestones)
                (TextPainter(
                        text: TextSpan(text: shortName(m.name), style: labelStyle),
                        textDirection: TextDirection.ltr,
                        maxLines: 1,
                      )..layout()).width +
                    (isReached(m, goal.balanceEur) ? 16 : 0) +
                    12,
            ];
            final placed = placeLabels(xs, widths, box.maxWidth);
            final rows = placed.isEmpty
                ? 0
                : placed.map((p) => p.row).reduce((a, b) => a > b ? a : b) + 1;

            return Semantics(
              label:
                  'Progress toward ${goal.name}: ${(frac(balance) * 100).floor()}%, '
                  '${money.total(goal.balanceEur)} of ${money.total(goal.amountEur)}',
              child: SizedBox(
                height: 22 + (rows == 0 ? 0 : 8 + rows * _rowHeight),
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    // Track and fill
                    Positioned(
                      left: 0,
                      right: 0,
                      top: 5,
                      height: 12,
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(Radii.pill),
                        child: ColoredBox(
                          color: c.progressTrack,
                          child: Align(
                            alignment: Alignment.centerLeft,
                            child: TweenAnimationBuilder<double>(
                              tween: Tween(end: frac(balance)),
                              duration: const Duration(milliseconds: 600),
                              curve: Motion.easeOut,
                              builder: (context, v, _) => FractionallySizedBox(
                                widthFactor: v,
                                heightFactor: 1,
                                child: DecoratedBox(
                                  decoration: BoxDecoration(
                                    color: t.accent,
                                    borderRadius: BorderRadius.circular(Radii.pill),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                    // Leader lines from markers down to their labels
                    for (var i = 0; i < milestones.length; i++)
                      Positioned(
                        left: xs[i] - 0.5,
                        top: 20,
                        width: 1,
                        height: 10 + placed[i].row * _rowHeight,
                        child: ColoredBox(color: t.borderStrong),
                      ),
                    // Markers
                    for (var i = 0; i < milestones.length; i++)
                      Positioned(
                        left: xs[i] - 9,
                        top: 2,
                        child: _Marker(
                          done: isReached(milestones[i], goal.balanceEur),
                          selected: milestones[i].id == _selected,
                        ),
                      ),
                    // Goal flag
                    Positioned(
                      right: 0,
                      top: 0,
                      child: Container(
                        width: 22,
                        height: 22,
                        decoration: BoxDecoration(
                          color: goalReached ? t.accent : c.progressMarker,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: goalReached ? t.accent : c.progressMarkerBorder,
                            width: 2,
                          ),
                        ),
                        child: Icon(
                          LucideIcons.flag,
                          size: 11,
                          color: goalReached ? t.onAccent : t.textMuted,
                        ),
                      ),
                    ),
                    // Labels
                    for (var i = 0; i < milestones.length; i++)
                      Positioned(
                        left: placed[i].left,
                        top: 30 + placed[i].row * _rowHeight,
                        child: _Label(
                          text: shortName(milestones[i].name),
                          style: labelStyle,
                          done: isReached(milestones[i], goal.balanceEur),
                          selected: milestones[i].id == _selected,
                          onTap: () => setState(
                            () => _selected = _selected == milestones[i].id
                                ? null
                                : milestones[i].id,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            );
          },
        ),
        AnimatedSize(
          duration: Motion.base,
          curve: Motion.easeOut,
          alignment: Alignment.topCenter,
          child: detail == null
              ? const SizedBox(width: double.infinity)
              : _Detail(milestone: detail, goal: goal, money: money),
        ),
      ],
    );
  }
}

class _Marker extends StatelessWidget {
  const _Marker({required this.done, required this.selected});
  final bool done, selected;

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    final c = context.cairn;
    return AnimatedContainer(
      duration: Motion.base,
      width: 18,
      height: 18,
      decoration: BoxDecoration(
        color: done ? t.text : c.progressMarker,
        shape: BoxShape.circle,
        border: Border.all(
          color: selected ? t.accent : (done ? t.text : c.progressMarkerBorder),
          width: 2,
        ),
      ),
      child: done ? Icon(LucideIcons.check, size: 10, color: t.bg) : null,
    );
  }
}

class _Label extends StatelessWidget {
  const _Label({
    required this.text,
    required this.style,
    required this.done,
    required this.selected,
    required this.onTap,
  });

  final String text;
  final TextStyle style;
  final bool done, selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    return Pressable(
      onTap: onTap,
      child: Container(
        height: 22,
        padding: const EdgeInsets.symmetric(horizontal: 6),
        decoration: BoxDecoration(
          color: selected ? t.accentSoft : t.surfaceSunken,
          borderRadius: BorderRadius.circular(Radii.sm),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (done) ...[
              Icon(LucideIcons.check, size: 12, color: t.positive),
              const SizedBox(width: 4),
            ],
            Text(
              text,
              maxLines: 1,
              style: style.copyWith(color: selected ? t.accentText : (done ? t.text : t.textMuted)),
            ),
          ],
        ),
      ),
    );
  }
}

class _Detail extends StatelessWidget {
  const _Detail({required this.milestone, required this.goal, required this.money});

  final Milestone milestone;
  final Goal goal;
  final MoneyFmt money;

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    final done = isReached(milestone, goal.balanceEur);
    final toGo = milestone.thresholdEur - goal.balanceEur;
    Widget row(String label, String value) => Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        children: [
          Expanded(
            child: Text(label, style: context.text.bodyMedium!.copyWith(color: t.textMuted)),
          ),
          Text(value, style: context.text.bodyMedium!.num.copyWith(fontWeight: FontWeight.w600)),
        ],
      ),
    );
    return Container(
      margin: const EdgeInsets.only(top: Space.s3),
      padding: const EdgeInsets.all(Space.s3),
      decoration: BoxDecoration(
        color: t.surfaceSunken,
        borderRadius: BorderRadius.circular(Radii.md),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(milestone.name, style: context.text.titleSmall)),
              const SizedBox(width: Space.s2),
              Badge2(label: done ? 'Reached' : 'Not yet', done: done),
            ],
          ),
          row('Cost', money.total(milestone.costEur)),
          row('Reached at', money.total(milestone.thresholdEur)),
          if (!done) row('To go', money.total(toGo < 0 ? 0 : toGo)),
          if (milestone.note.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: Space.s2),
              child: Text(milestone.note, style: context.text.bodySmall),
            ),
        ],
      ),
    );
  }
}
