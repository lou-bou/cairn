import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartColumn } from 'lucide-react';
import {
  addMonths,
  displayTotal,
  startOfMonth,
  todayIso,
  type Category,
  type CategoryTotal,
  type Currency,
  type Goal,
  type Milestone,
  type Summary,
  type TxType,
} from '@cairn/shared';
import { useCategories, useGoal, useMilestones, useSummary } from '../api/hooks';
import { PageHeader } from '../components/AppShell';
import { Card, CardHeader, EmptyState } from '../components/Card';
import { ChartTooltipBox, Legend } from '../components/ChartTooltip';
import { Segmented } from '../components/Form';
import { categoryColor } from '../lib/categories';
import { formatDay, formatMonth } from '../lib/dates';
import { shortName } from '../lib/milestones';
import { formatCompact, useMoney } from '../lib/money';
import { useTokens } from '../lib/tokens';
import styles from './Stats.module.css';

type Range = 'month' | '3months' | 'all';

const TOKENS = [
  '--chart-grid',
  '--chart-axis',
  '--chart-line',
  '--chart-in',
  '--chart-out',
  '--chart-threshold',
  '--chart-goal',
  '--color-surface',
  '--color-text-muted',
  '--font-numeric',
  '--radius-xs',
] as const;

function rangeDates(range: Range, today: string): { from?: string; to?: string } {
  if (range === 'month') return { from: startOfMonth(today), to: today };
  if (range === '3months') return { from: startOfMonth(addMonths(today, -2)), to: today };
  return {};
}

const dayNumber = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / 86_400_000;
};
/** Round an axis maximum up to a clean value: a short list of round multiples of a power of ten (minor units). */
function niceCeil(n: number): number {
  if (n <= 0) return 0;
  const pow = 10 ** Math.floor(Math.log10(n));
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s * pow >= n) ?? 10;
  return step * pow;
}

const fromDayNumber = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);

export function StatsPage() {
  const [range, setRange] = useState<Range>('3months');
  const today = todayIso();
  const { from, to } = rangeDates(range, today);
  const { data: summary } = useSummary(from, to);
  const { data: goal } = useGoal();
  const { data: milestones = [] } = useMilestones();
  const { data: categories = [] } = useCategories();
  const money = useMoney();
  const hasData = summary && (summary.inEur > 0 || summary.outEur > 0);

  return (
    <div className={styles.page}>
      <PageHeader title="Stats" />
      <Segmented
        label="Date range"
        value={range}
        onChange={setRange}
        className={styles.range}
        options={[
          { value: 'month', label: 'This month' },
          { value: '3months', label: '3 months' },
          { value: 'all', label: 'All time' },
        ]}
      />

      {summary && (
        <section className={styles.tiles} aria-label="Summary">
          <Tile label="Money in" value={money.total(summary.inEur)} />
          <Tile label="Money out" value={money.total(summary.outEur)} />
          <Tile label="Net" value={money.total(summary.netEur, { signed: true })} />
          <Tile label="Balance now" value={money.total(summary.balanceEur)} />
          <Tile label="Avg in / month" value={money.total(summary.avgMonthlyInEur)} />
          <Tile label="Avg out / month" value={money.total(summary.avgMonthlyOutEur)} />
        </section>
      )}

      {summary && !hasData ? (
        <Card>
          <EmptyState icon={<ChartColumn />} title="No entries in this range">
            Charts appear once money comes in or goes out. Try “All time”.
          </EmptyState>
        </Card>
      ) : (
        summary &&
        goal && (
          <>
            <BalanceChart summary={summary} goal={goal} milestones={milestones} />
            <MonthlyChart summary={summary} />
            <div className={styles.split}>
              <Ranking
                title="Where most money comes in from"
                type="in"
                totals={summary.categories}
                categories={categories}
              />
              <Ranking
                title="What takes the most money out"
                type="out"
                totals={summary.categories}
                categories={categories}
              />
            </div>
          </>
        )
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.tile}>
      <p className={styles.tileLabel}>{label}</p>
      <p className={`${styles.tileValue} num`}>{value}</p>
    </div>
  );
}

function useDisplay() {
  const money = useMoney();
  const conv = (eur: number) => displayTotal(eur, money.displayCurrency, money.rate).minor;
  const cur: Currency = money.displayCurrency;
  return { money, conv, cur };
}

function BalanceChart({
  summary,
  goal,
  milestones,
}: {
  summary: Summary;
  goal: Goal;
  milestones: Milestone[];
}) {
  const t = useTokens(TOKENS);
  const { money, conv, cur } = useDisplay();
  const data = summary.balanceSeries.map((p) => ({
    x: dayNumber(p.date),
    y: conv(p.balanceEur),
    eur: p.balanceEur,
  }));

  // Show the thresholds near the data: everything up to the next unmet one, so the line isn't flattened.
  const maxBalance = Math.max(0, ...summary.balanceSeries.map((p) => p.balanceEur));
  const minBalance = Math.min(0, ...summary.balanceSeries.map((p) => p.balanceEur));
  const nextTarget =
    milestones.find((m) => m.thresholdEur > maxBalance)?.thresholdEur ?? goal.amountEur;
  const top = Math.max(maxBalance, nextTarget);
  const lines = [
    ...milestones.map((m) => ({ eur: m.thresholdEur, label: shortName(m.name), goal: false })),
    { eur: goal.amountEur, label: 'Goal', goal: true },
  ].filter((l) => l.eur <= top);
  // Drop labels that would sit on top of a higher neighbour.
  const labelled = lines.map((l, i) => {
    const next = lines[i + 1];
    return { ...l, showLabel: !next || (next.eur - l.eur) / Math.max(top, 1) > 0.07 };
  });

  if (data.length < 2) {
    return null;
  }

  return (
    <Card>
      <CardHeader title="Balance over time" />
      <div
        className={styles.chart}
        role="img"
        aria-label={`Balance over time, now ${money.total(summary.balanceEur)}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={t['--chart-grid']} vertical={false} />
            <XAxis
              dataKey="x"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(n: number) => formatDay(fromDayNumber(n))}
              stroke={t['--chart-axis']}
              tick={{ fill: t['--color-text-muted'] }}
              tickLine={false}
              axisLine={{ stroke: t['--chart-grid'] }}
              minTickGap={24}
            />
            <YAxis
              domain={[conv(minBalance), niceCeil(conv(top) * 1.04)]}
              tickCount={5}
              tickFormatter={(v: number) => formatCompact(v, cur)}
              tick={{ fill: t['--color-text-muted'] }}
              tickLine={false}
              axisLine={false}
              width={cur === 'DZD' ? 72 : 56}
            />
            {labelled.map((l) => (
              <ReferenceLine
                key={`${l.label}-${l.eur}`}
                y={conv(l.eur)}
                stroke={l.goal ? t['--chart-goal'] : t['--chart-threshold']}
                strokeWidth={1}
                label={
                  l.showLabel
                    ? {
                        value: l.label,
                        position: 'insideTopLeft',

                        fill: t['--color-text-muted'],
                      }
                    : undefined
                }
              />
            ))}
            <Tooltip
              cursor={{ stroke: t['--chart-axis'], strokeWidth: 1 }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
                if (!active || !p) return null;
                return (
                  <ChartTooltipBox
                    title={formatDay(fromDayNumber(p.x))}
                    rows={[
                      { label: 'Balance', value: money.total(p.eur), swatch: t['--chart-line'] },
                    ]}
                  />
                );
              }}
            />
            <Line
              type="stepAfter"
              dataKey="y"
              stroke={t['--chart-line']}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              dot={false}
              activeDot={{
                r: 5,
                fill: t['--chart-line'],
                stroke: t['--color-surface'],
                strokeWidth: 2,
              }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function MonthlyChart({ summary }: { summary: Summary }) {
  const t = useTokens(TOKENS);
  const { money, conv, cur } = useDisplay();
  const data = summary.monthly.map((m) => ({ ...m, inD: conv(m.inEur), outD: conv(m.outEur) }));
  // Bar ends follow the theme's small radius (Recharts needs a number).
  const r = Number.parseInt(t['--radius-xs'], 10) || 0;
  const barRadius: [number, number, number, number] = [r, r, 0, 0];
  const multiYear = new Set(summary.monthly.map((m) => m.month.slice(0, 4))).size > 1;

  return (
    <Card>
      <CardHeader title="In vs out by month" />
      <Legend
        items={[
          { label: 'Money in', color: t['--chart-in'] },
          { label: 'Money out', color: t['--chart-out'] },
        ]}
      />
      <div className={styles.chartShort} role="img" aria-label="Money in and out per month">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            barGap={2}
            barCategoryGap="28%"
          >
            <CartesianGrid stroke={t['--chart-grid']} vertical={false} />
            <XAxis
              dataKey="month"
              tickFormatter={(m: string) => formatMonth(m, multiYear)}
              tick={{ fill: t['--color-text-muted'] }}
              tickLine={false}
              axisLine={{ stroke: t['--chart-grid'] }}
            />
            <YAxis
              tickFormatter={(v: number) => formatCompact(v, cur)}
              tick={{ fill: t['--color-text-muted'] }}
              tickLine={false}
              axisLine={false}
              width={cur === 'DZD' ? 72 : 56}
            />
            <Tooltip
              cursor={{ fill: t['--chart-grid'] }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
                if (!active || !p) return null;
                return (
                  <ChartTooltipBox
                    title={formatMonth(p.month, true)}
                    rows={[
                      { label: 'In', value: money.total(p.inEur), swatch: t['--chart-in'] },
                      { label: 'Out', value: money.total(p.outEur), swatch: t['--chart-out'] },
                      { label: 'Net', value: money.total(p.inEur - p.outEur, { signed: true }) },
                    ]}
                  />
                );
              }}
            />
            <Bar
              dataKey="inD"
              name="Money in"
              fill={t['--chart-in']}
              radius={barRadius}
              maxBarSize={24}
              isAnimationActive={false}
            />
            <Bar
              dataKey="outD"
              name="Money out"
              fill={t['--chart-out']}
              radius={barRadius}
              maxBarSize={24}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function Ranking({
  title,
  type,
  totals,
  categories,
}: {
  title: string;
  type: TxType;
  totals: CategoryTotal[];
  categories: Category[];
}) {
  const money = useMoney();
  const rows = useMemo(
    () => totals.filter((c) => c.type === type).sort((a, b) => b.totalEur - a.totalEur),
    [totals, type],
  );
  const sum = rows.reduce((s, r) => s + r.totalEur, 0);
  const max = rows[0]?.totalEur ?? 0;
  const names = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <Card>
      <CardHeader title={title} />
      {rows.length === 0 ? (
        <p className="muted">Nothing {type === 'in' ? 'came in' : 'went out'} in this range.</p>
      ) : (
        <ol className={styles.ranking}>
          {rows.map((r) => {
            // Percent is display-only; integer math, rounded half up.
            const pct = sum ? Math.floor((r.totalEur * 1000) / sum + 0.5) / 10 : 0;
            return (
              <li key={r.categoryId} className={styles.rankRow}>
                <div className={styles.rankHead}>
                  <span className={styles.rankName}>
                    <span
                      className={styles.rankSwatch}
                      style={{ background: categoryColor(r.categoryId) }}
                      aria-hidden="true"
                    />
                    {names.get(r.categoryId) ?? r.categoryId}
                  </span>
                  <span className="num">{money.total(r.totalEur)}</span>
                  <span className={`${styles.rankPct} num`}>{pct}%</span>
                </div>
                <div className={styles.rankTrack} aria-hidden="true">
                  <div
                    className={styles.rankBar}
                    style={{
                      width: `${max ? (r.totalEur / max) * 100 : 0}%`,
                      background: categoryColor(r.categoryId),
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
