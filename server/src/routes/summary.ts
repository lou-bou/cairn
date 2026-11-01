import type { FastifyPluginAsync } from 'fastify';
import {
  divRoundHalfUp,
  monthsBetween,
  summaryQuery,
  sumMinor,
  todayIso,
  type BalancePoint,
  type CategoryTotal,
  type MonthTotal,
  type Summary,
} from '@cairn/shared';
import type { Db } from '../db/index.js';
import { balanceEur } from '../domain/queries.js';
import { parse } from '../errors.js';

const SIGNED = `CASE type WHEN 'in' THEN amount_eur ELSE -amount_eur END`;

export function buildSummary(
  db: Db,
  from: string | null,
  to: string | null,
  today = todayIso(),
): Summary {
  const where: string[] = [];
  const params: Record<string, string> = {};
  if (from) {
    where.push('date >= @from');
    params.from = from;
  }
  if (to) {
    where.push('date <= @to');
    params.to = to;
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totals = db
    .prepare(
      `SELECT COALESCE(SUM(CASE type WHEN 'in' THEN amount_eur END), 0) AS inEur,
              COALESCE(SUM(CASE type WHEN 'out' THEN amount_eur END), 0) AS outEur,
              MIN(date) AS firstDate
       FROM transactions ${clause}`,
    )
    .get(params) as { inEur: number; outEur: number; firstDate: string | null };

  const categories = db
    .prepare(
      `SELECT category_id AS categoryId, type, SUM(amount_eur) AS totalEur, COUNT(*) AS count
       FROM transactions ${clause} GROUP BY category_id, type ORDER BY totalEur DESC`,
    )
    .all(params) as CategoryTotal[];

  const byMonth = new Map(
    (
      db
        .prepare(
          `SELECT substr(date, 1, 7) AS month,
                  COALESCE(SUM(CASE type WHEN 'in' THEN amount_eur END), 0) AS inEur,
                  COALESCE(SUM(CASE type WHEN 'out' THEN amount_eur END), 0) AS outEur
           FROM transactions ${clause} GROUP BY month`,
        )
        .all(params) as MonthTotal[]
    ).map((m) => [m.month, m]),
  );

  // Months span the requested range; for all time, from the first entry to this month.
  const rangeStart = from ?? totals.firstDate ?? today;
  const rangeEnd = to ?? (today > rangeStart ? today : rangeStart);
  const monthly = monthsBetween(rangeStart, rangeEnd).map(
    (month) => byMonth.get(month) ?? { month, inEur: 0, outEur: 0 },
  );
  const monthCount = monthly.length;

  // Balance over time: running all-time balance, sampled at each day with entries in range.
  const opening = from
    ? (db
        .prepare(`SELECT COALESCE(SUM(${SIGNED}), 0) FROM transactions WHERE date < ?`)
        .pluck()
        .get(from) as number)
    : 0;
  const days = db
    .prepare(
      `SELECT date, SUM(${SIGNED}) AS delta FROM transactions ${clause} GROUP BY date ORDER BY date`,
    )
    .all(params) as { date: string; delta: number }[];
  const balanceSeries: BalancePoint[] = [];
  let running = opening;
  if (from && (days.length === 0 || days[0]!.date > from))
    balanceSeries.push({ date: from, balanceEur: opening });
  for (const d of days) {
    running = sumMinor([running, d.delta]);
    balanceSeries.push({ date: d.date, balanceEur: running });
  }
  const last = balanceSeries.at(-1);
  if (last && last.date < rangeEnd) balanceSeries.push({ date: rangeEnd, balanceEur: running });

  const div = (n: number) =>
    monthCount ? Number(divRoundHalfUp(BigInt(n), BigInt(monthCount))) : 0;
  return {
    from,
    to,
    balanceEur: balanceEur(db),
    inEur: totals.inEur,
    outEur: totals.outEur,
    netEur: totals.inEur - totals.outEur,
    monthCount,
    avgMonthlyInEur: div(totals.inEur),
    avgMonthlyOutEur: div(totals.outEur),
    categories,
    monthly,
    balanceSeries,
  };
}

export const summaryRoutes: FastifyPluginAsync = async (app) => {
  app.get('/summary', async (req) => {
    const q = parse(summaryQuery, req.query);
    return { data: buildSummary(app.db, q.from ?? null, q.to ?? null) };
  });
};
