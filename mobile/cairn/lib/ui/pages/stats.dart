import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:material_ui/material_ui.dart';

import '../../data/view.dart';
import '../../domain/dates.dart';
import '../../domain/milestones.dart';
import '../../domain/models.dart';
import '../../domain/money.dart';
import '../../domain/summary.dart';
import '../theme.dart';
import '../widgets/page.dart';

enum StatsRange { month, threeMonths, all }

DateRange rangeDates(StatsRange range, String today) => switch (range) {
  StatsRange.month => (from: startOfMonth(today), to: today),
  StatsRange.threeMonths => (from: startOfMonth(addMonths(today, -2)), to: today),
  StatsRange.all => (from: null, to: null),
};

/// Round an axis maximum up to a clean value: a round multiple of a power of ten.
double niceCeil(double n) {
  if (n <= 0) return 0;
  final pow = math.pow(10, (math.log(n) / math.ln10).floor()).toDouble();
  const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  return steps.firstWhere((s) => s * pow >= n, orElse: () => 10) * pow;
}

/// A round tick step from 0: 1, 2, 2.5 or 5 × 10ⁿ, giving about [count] ticks up to [max].
double niceStep(double max, [int count = 4]) {
  if (max <= 0) return 1;
  final raw = max / count;
  final pow = math.pow(10, (math.log(raw) / math.ln10).floor()).toDouble();
  const steps = [1, 2, 2.5, 5, 10];
  return steps.firstWhere((s) => s * pow >= raw, orElse: () => 10) * pow;
}

class StatsPage extends ConsumerStatefulWidget {
  const StatsPage({super.key});

  @override
  ConsumerState<StatsPage> createState() => _StatsPageState();
}

class _StatsPageState extends ConsumerState<StatsPage> {
  StatsRange _range = StatsRange.threeMonths;

  @override
  Widget build(BuildContext context) {
    final summary = ref.watch(summaryProvider(rangeDates(_range, todayIso())));
    final goal = ref.watch(goalProvider);
    final money = ref.watch(moneyProvider);
    final hasData = summary.inEur > 0 || summary.outEur > 0;

    Widget tile(String label, String value) => _Tile(label: label, value: value);

    return PageList(
      children: [
        const PageTitle('Stats'),
        KitSegmented<StatsRange>(
          value: _range,
          onChanged: (v) => setState(() => _range = v),
          options: const [
            SegOption(StatsRange.month, 'This month'),
            SegOption(StatsRange.threeMonths, '3 months'),
            SegOption(StatsRange.all, 'All time'),
          ],
        ),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          padding: EdgeInsets.zero,
          mainAxisSpacing: Space.s3,
          crossAxisSpacing: Space.s3,
          childAspectRatio: 2.3,
          children: [
            tile('Money in', money.total(summary.inEur)),
            tile('Money out', money.total(summary.outEur)),
            tile('Net', money.total(summary.netEur, signed: true)),
            tile('Balance now', money.total(summary.balanceEur)),
            tile('Avg in / month', money.total(summary.avgMonthlyInEur)),
            tile('Avg out / month', money.total(summary.avgMonthlyOutEur)),
          ],
        ),
        if (!hasData)
          const KitCard(
            child: EmptyState(
              icon: LucideIcons.chartColumn,
              title: 'No entries in this range',
              body: 'Charts appear once money comes in or goes out. Try “All time”.',
            ),
          )
        else ...[
          if (goal != null && summary.balanceSeries.length >= 2)
            _BalanceChart(summary: summary, goal: goal),
          _MonthlyChart(summary: summary),
          _Ranking(
            title: 'Where most money comes in from',
            type: TxType.moneyIn,
            totals: summary.categories,
          ),
          _Ranking(
            title: 'What takes the most money out',
            type: TxType.moneyOut,
            totals: summary.categories,
          ),
        ],
      ],
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({required this.label, required this.value});
  final String label, value;

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Space.s3),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(Radii.lg),
        border: Border.all(color: t.border),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: context.text.bodySmall),
          2.h,
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(value, style: context.text.titleLarge!.num),
          ),
        ],
      ),
    );
  }
}

class _TooltipRow {
  const _TooltipRow(this.label, this.value, [this.swatch]);
  final String label, value;
  final Color? swatch;
}

/// The readout shown above a chart while a finger is on it.
class _Readout extends StatelessWidget {
  const _Readout({required this.title, required this.rows});
  final String? title;
  final List<_TooltipRow> rows;

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    return SizedBox(
      height: 22,
      child: title == null
          ? Align(
              alignment: Alignment.centerLeft,
              child: Text('Touch the chart for details', style: context.text.bodySmall),
            )
          : Row(
              children: [
                Text(title!, style: context.text.labelMedium!.copyWith(color: t.text)),
                const Spacer(),
                for (final r in rows) ...[
                  Space.s3.w,
                  if (r.swatch != null) ...[
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(color: r.swatch, shape: BoxShape.circle),
                    ),
                    4.w,
                  ],
                  Text(
                    r.swatch == null ? '${r.label} ${r.value}' : r.value,
                    style: context.text.labelMedium!.num.copyWith(
                      color: t.text,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ],
            ),
    );
  }
}

AxisTitles _noTitles() => const AxisTitles(sideTitles: SideTitles(showTitles: false));

class _BalanceChart extends ConsumerStatefulWidget {
  const _BalanceChart({required this.summary, required this.goal});
  final Summary summary;
  final Goal goal;

  @override
  ConsumerState<_BalanceChart> createState() => _BalanceChartState();
}

class _BalanceChartState extends ConsumerState<_BalanceChart> {
  int? _touched;

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    final c = context.cairn;
    final money = ref.watch(moneyProvider);
    final milestones = ref.watch(milestonesProvider);
    final series = widget.summary.balanceSeries;
    final goal = widget.goal;
    final axisStyle = context.text.labelSmall!.num.copyWith(letterSpacing: 0, fontSize: 10.5);

    double conv(int eur) => money.convert(eur).toDouble();
    final spots = [for (final p in series) FlSpot(dayNumber(p.date).toDouble(), conv(p.balanceEur))];

    // Show the thresholds near the data: everything up to the next unmet one, so the line
    // isn't flattened by a far-away goal.
    final maxBalance = series.map((p) => p.balanceEur).fold(0, math.max);
    final minBalance = series.map((p) => p.balanceEur).fold(0, math.min);
    final nextTarget =
        milestones.where((m) => m.thresholdEur > maxBalance).firstOrNull?.thresholdEur ??
        goal.amountEur;
    final top = math.max(maxBalance, nextTarget);
    final lines = [
      for (final m in milestones) (eur: m.thresholdEur, label: shortName(m.name), goal: false),
      (eur: goal.amountEur, label: 'Goal', goal: true),
    ].where((l) => l.eur <= top && l.eur > 0).toList();

    final maxY = niceCeil(conv(top) * 1.04);
    final minY = conv(minBalance);
    final minX = spots.first.x, maxX = spots.last.x;
    final spanDays = math.max(1, maxX - minX);
    final touched = _touched != null && _touched! < series.length ? series[_touched!] : null;

    return KitCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const CardHeader(title: 'Balance over time'),
          _Readout(
            title: touched == null ? null : formatDay(touched.date),
            rows: [
              if (touched != null)
                _TooltipRow('Balance', money.total(touched.balanceEur), c.chartLine),
            ],
          ),
          Space.s2.h,
          Semantics(
            label: 'Balance over time, now ${money.total(widget.summary.balanceEur)}',
            child: SizedBox(
              height: 220,
              child: LineChart(
                duration: Duration.zero,
                LineChartData(
                  minX: minX,
                  maxX: maxX,
                  minY: minY,
                  maxY: maxY <= minY ? minY + 1 : maxY,
                  clipData: const FlClipData.none(),
                  borderData: FlBorderData(
                    show: true,
                    border: Border(bottom: BorderSide(color: c.chartGrid)),
                  ),
                  gridData: FlGridData(
                    drawVerticalLine: false,
                    horizontalInterval: math.max(1, (maxY - minY) / 4),
                    getDrawingHorizontalLine: (_) => FlLine(color: c.chartGrid, strokeWidth: 1),
                  ),
                  titlesData: FlTitlesData(
                    topTitles: _noTitles(),
                    rightTitles: _noTitles(),
                    leftTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        reservedSize: money.display == Currency.dzd ? 62 : 48,
                        interval: math.max(1, (maxY - minY) / 4),
                        getTitlesWidget: (value, meta) => SideTitleWidget(
                          meta: meta,
                          child: Text(
                            formatCompact(value.round(), money.display),
                            style: axisStyle,
                          ),
                        ),
                      ),
                    ),
                    bottomTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        reservedSize: 26,
                        interval: math.max(1, (spanDays / 3).ceilToDouble()),
                        getTitlesWidget: (value, meta) {
                          // Skip the automatic edge tick when it would crowd a regular one.
                          if (value != meta.min && (meta.max - value) < spanDays / 6 && value != meta.max) {
                            return const SizedBox.shrink();
                          }
                          return SideTitleWidget(
                            meta: meta,
                            fitInside: SideTitleFitInsideData.fromTitleMeta(meta),
                            child: Text(formatDay(fromDayNumber(value.round())), style: axisStyle),
                          );
                        },
                      ),
                    ),
                  ),
                  extraLinesData: ExtraLinesData(
                    extraLinesOnTop: false,
                    horizontalLines: [
                      for (var i = 0; i < lines.length; i++)
                        HorizontalLine(
                          y: conv(lines[i].eur),
                          color: lines[i].goal ? t.accent : c.chartThreshold,
                          strokeWidth: 1,
                          dashArray: lines[i].goal ? null : [4, 4],
                          label: HorizontalLineLabel(
                            // Drop labels that would sit on top of a higher neighbour.
                            show:
                                i == lines.length - 1 ||
                                (lines[i + 1].eur - lines[i].eur) / math.max(top, 1) > 0.07,
                            alignment: Alignment.topLeft,
                            padding: const EdgeInsets.only(left: 4, bottom: 2),
                            style: axisStyle,
                            labelResolver: (_) => lines[i].label,
                          ),
                        ),
                    ],
                  ),
                  lineTouchData: LineTouchData(
                    handleBuiltInTouches: true,
                    touchCallback: (event, response) {
                      final i = event.isInterestedForInteractions
                          ? response?.lineBarSpots?.firstOrNull?.spotIndex
                          : null;
                      if (i != _touched) setState(() => _touched = i);
                    },
                    getTouchedSpotIndicator: (bar, indexes) => [
                      for (final _ in indexes)
                        TouchedSpotIndicatorData(
                          FlLine(color: c.chartAxis, strokeWidth: 1),
                          FlDotData(
                            getDotPainter: (_, _, _, _) => FlDotCirclePainter(
                              radius: 5,
                              color: c.chartLine,
                              strokeWidth: 2,
                              strokeColor: t.surface,
                            ),
                          ),
                        ),
                    ],
                    touchTooltipData: LineTouchTooltipData(
                      getTooltipColor: (_) => Colors.transparent,
                      getTooltipItems: (spots) => [for (final _ in spots) null],
                    ),
                  ),
                  lineBarsData: [
                    LineChartBarData(
                      spots: spots,
                      isStepLineChart: true,
                      lineChartStepData: const LineChartStepData(
                        stepDirection: LineChartStepData.stepDirectionForward,
                      ),
                      color: c.chartLine,
                      barWidth: 2,
                      isStrokeCapRound: true,
                      isStrokeJoinRound: true,
                      dotData: const FlDotData(show: false),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MonthlyChart extends ConsumerStatefulWidget {
  const _MonthlyChart({required this.summary});
  final Summary summary;

  @override
  ConsumerState<_MonthlyChart> createState() => _MonthlyChartState();
}

class _MonthlyChartState extends ConsumerState<_MonthlyChart> {
  int? _touched;

  @override
  Widget build(BuildContext context) {
    final c = context.cairn;
    final t = context.kit;
    final money = ref.watch(moneyProvider);
    final months = widget.summary.monthly;
    final axisStyle = context.text.labelSmall!.num.copyWith(letterSpacing: 0, fontSize: 10.5);
    double conv(int eur) => money.convert(eur).toDouble();

    final maxValue = months.fold(0.0, (m, x) => math.max(m, math.max(conv(x.inEur), conv(x.outEur))));
    final step = niceStep(maxValue);
    final maxY = math.max(step, (maxValue / step).ceil() * step);
    final multiYear = {for (final m in months) m.month.substring(0, 4)}.length > 1;
    final labelEvery = math.max(1, (months.length / 6).ceil());
    final barWidth = months.length > 12 ? 5.0 : (months.length > 6 ? 9.0 : 14.0);
    const radius = BorderRadius.vertical(top: Radius.circular(Radii.xs));
    final touched = _touched != null && _touched! < months.length ? months[_touched!] : null;

    Widget legend(String label, Color color) => Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(3)),
        ),
        6.w,
        Text(label, style: context.text.bodySmall),
      ],
    );

    return KitCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const CardHeader(title: 'In vs out by month'),
          if (touched == null)
            SizedBox(
              height: 22,
              child: Row(
                children: [
                  legend('Money in', c.chartIn),
                  Space.s4.w,
                  legend('Money out', c.chartOut),
                ],
              ),
            )
          else
            _Readout(
              title: formatMonth(touched.month, withYear: true),
              rows: [
                _TooltipRow('In', money.total(touched.inEur), c.chartIn),
                _TooltipRow('Out', money.total(touched.outEur), c.chartOut),
                _TooltipRow('Net', money.total(touched.inEur - touched.outEur, signed: true)),
              ],
            ),
          Space.s2.h,
          Semantics(
            label: 'Money in and out per month',
            child: SizedBox(
              height: 190,
              child: BarChart(
                duration: Duration.zero,
                BarChartData(
                  maxY: maxY,
                  alignment: BarChartAlignment.spaceAround,
                  borderData: FlBorderData(
                    show: true,
                    border: Border(bottom: BorderSide(color: c.chartGrid)),
                  ),
                  gridData: FlGridData(
                    drawVerticalLine: false,
                    horizontalInterval: step,
                    getDrawingHorizontalLine: (_) => FlLine(color: c.chartGrid, strokeWidth: 1),
                  ),
                  titlesData: FlTitlesData(
                    topTitles: _noTitles(),
                    rightTitles: _noTitles(),
                    leftTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        reservedSize: money.display == Currency.dzd ? 62 : 48,
                        interval: step,
                        getTitlesWidget: (value, meta) => SideTitleWidget(
                          meta: meta,
                          child: Text(
                            formatCompact(value.round(), money.display),
                            style: axisStyle,
                          ),
                        ),
                      ),
                    ),
                    bottomTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        reservedSize: 26,
                        getTitlesWidget: (value, meta) {
                          final i = value.round();
                          if (i < 0 || i >= months.length || i % labelEvery != 0) {
                            return const SizedBox.shrink();
                          }
                          return SideTitleWidget(
                            meta: meta,
                            child: Text(
                              formatMonth(months[i].month, withYear: multiYear && months.length <= 4),
                              style: axisStyle,
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                  barTouchData: BarTouchData(
                    handleBuiltInTouches: false,
                    touchCallback: (event, response) {
                      final i = event.isInterestedForInteractions
                          ? response?.spot?.touchedBarGroupIndex
                          : null;
                      if (i != _touched) setState(() => _touched = i);
                    },
                  ),
                  barGroups: [
                    for (var i = 0; i < months.length; i++)
                      BarChartGroupData(
                        x: i,
                        barsSpace: 2,
                        barRods: [
                          BarChartRodData(
                            toY: conv(months[i].inEur),
                            width: barWidth,
                            borderRadius: radius,
                            color: _touched == null || _touched == i
                                ? c.chartIn
                                : c.chartIn.withValues(alpha: 0.4),
                          ),
                          BarChartRodData(
                            toY: conv(months[i].outEur),
                            width: barWidth,
                            borderRadius: radius,
                            color: _touched == null || _touched == i
                                ? c.chartOut
                                : c.chartOut.withValues(alpha: 0.4),
                          ),
                        ],
                      ),
                  ],
                ),
              ),
            ),
          ),
          if (touched == null && months.length > 1)
            Padding(
              padding: const EdgeInsets.only(top: Space.s1),
              child: Text(
                'Touch a month for its totals',
                style: context.text.bodySmall!.copyWith(color: t.textFaint),
              ),
            ),
        ],
      ),
    );
  }
}

class _Ranking extends ConsumerWidget {
  const _Ranking({required this.title, required this.type, required this.totals});

  final String title;
  final TxType type;
  final List<CategoryTotal> totals;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.kit;
    final money = ref.watch(moneyProvider);
    final names = {for (final c in ref.watch(categoriesProvider)) c.id: c.name};
    final rows = totals.where((c) => c.type == type).toList()
      ..sort((a, b) => b.totalEur.compareTo(a.totalEur));
    final sum = rows.fold(0, (s, r) => s + r.totalEur);
    final max = rows.isEmpty ? 0 : rows.first.totalEur;

    return KitCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          CardHeader(title: title),
          if (rows.isEmpty)
            Text(
              'Nothing ${type == TxType.moneyIn ? 'came in' : 'went out'} in this range.',
              style: context.text.bodyMedium!.copyWith(color: t.textMuted),
            ),
          for (final r in rows) ...[
            Row(
              children: [
                Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    color: context.cairn.category(r.categoryId),
                    shape: BoxShape.circle,
                  ),
                ),
                Space.s2.w,
                Expanded(
                  child: Text(names[r.categoryId] ?? r.categoryId, style: context.text.bodyMedium),
                ),
                Text(
                  money.total(r.totalEur),
                  style: context.text.bodyMedium!.num.copyWith(fontWeight: FontWeight.w600),
                ),
                SizedBox(
                  width: 52,
                  child: Text(
                    // Percent is display-only; integer math, rounded half up to one decimal.
                    '${_percent(r.totalEur, sum)}%',
                    textAlign: TextAlign.right,
                    style: context.text.bodySmall!.num,
                  ),
                ),
              ],
            ),
            6.h,
            ClipRRect(
              borderRadius: BorderRadius.circular(Radii.pill),
              child: SizedBox(
                height: 6,
                child: ColoredBox(
                  color: t.surfaceSunken,
                  child: FractionallySizedBox(
                    alignment: Alignment.centerLeft,
                    widthFactor: max == 0 ? 0 : r.totalEur / max,
                    child: ColoredBox(color: context.cairn.category(r.categoryId)),
                  ),
                ),
              ),
            ),
            Space.s3.h,
          ],
        ],
      ),
    );
  }
}

String _percent(int part, int sum) {
  if (sum == 0) return '0';
  final tenths = (part * 1000 + sum ~/ 2) ~/ sum;
  return tenths % 10 == 0 ? '${tenths ~/ 10}' : '${tenths ~/ 10}.${tenths % 10}';
}
