import { sumMinor, type Goal, type Milestone, type Settings } from '@cairn/shared';
import type { Db } from '../db/index.js';
import { toGoal, toMilestone, type GoalRow, type MilestoneRow } from './rows.js';

export function balanceEur(db: Db): number {
  return db
    .prepare(
      `SELECT COALESCE(SUM(CASE type WHEN 'in' THEN amount_eur ELSE -amount_eur END), 0) FROM transactions`,
    )
    .pluck()
    .get() as number;
}

export function milestoneRows(db: Db): MilestoneRow[] {
  return db.prepare('SELECT * FROM milestones ORDER BY sort_order, id').all() as MilestoneRow[];
}

/** Each threshold is the running sum of costs in order (spec §5). */
export function withThresholds(rows: MilestoneRow[]): Milestone[] {
  let running = 0;
  return rows.map((r) => {
    running = sumMinor([running, r.cost_eur]);
    return toMilestone(r, running);
  });
}

export function listMilestones(db: Db): Milestone[] {
  return withThresholds(milestoneRows(db));
}

export function goalRow(db: Db): GoalRow {
  return db.prepare('SELECT * FROM goal WHERE id = 1').get() as GoalRow;
}

export function getGoal(db: Db): Goal {
  const sum = sumMinor(milestoneRows(db).map((m) => m.cost_eur));
  return toGoal(goalRow(db), sum, balanceEur(db));
}

const SETTING_KEYS = {
  defaultRate: 'default_rate',
  reconcileFrequency: 'reconcile_frequency',
  reconcileDay: 'reconcile_day',
  lastReconciledAt: 'last_reconciled_at',
  reconcileSnoozedUntil: 'reconcile_snoozed_until',
} as const satisfies Record<keyof Settings, string>;

export function getSettings(db: Db): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as {
    key: string;
    value: string | null;
  }[];
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const str = (k: keyof Settings) => map.get(SETTING_KEYS[k]) ?? null;
  return {
    defaultRate: Number(str('defaultRate')),
    reconcileFrequency: (str('reconcileFrequency') ?? 'weekly') as Settings['reconcileFrequency'],
    reconcileDay: Number(str('reconcileDay') ?? 0),
    lastReconciledAt: str('lastReconciledAt'),
    reconcileSnoozedUntil: str('reconcileSnoozedUntil'),
  };
}

export function saveSettings(db: Db, patch: Partial<Settings>): void {
  const stmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
  );
  for (const [k, v] of Object.entries(patch) as [keyof Settings, Settings[keyof Settings]][]) {
    if (v === undefined) continue;
    stmt.run(SETTING_KEYS[k], v === null ? null : String(v));
  }
}

export function defaultRate(db: Db): number {
  return getSettings(db).defaultRate;
}
