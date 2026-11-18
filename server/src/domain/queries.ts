import { sumMinor, type Goal, type GoalDetail, type Milestone, type Settings } from '@cairn/shared';
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

/** The goal being worked toward. There is always exactly one. */
export function activeGoalId(db: Db): string {
  return db
    .prepare("SELECT value FROM settings WHERE key = 'active_goal_id'")
    .pluck()
    .get() as string;
}

export function setActiveGoal(db: Db, id: string): void {
  db.prepare("UPDATE settings SET value = ? WHERE key = 'active_goal_id'").run(id);
}

export function goalRows(db: Db): GoalRow[] {
  return db.prepare('SELECT * FROM goals ORDER BY sort_order, id').all() as GoalRow[];
}

export function findGoalRow(db: Db, id: string): GoalRow | undefined {
  return db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as GoalRow | undefined;
}

/** The active goal's row, or another goal's. */
export function goalRow(db: Db, id: string = activeGoalId(db)): GoalRow {
  return findGoalRow(db, id)!;
}

/** One goal's milestones in order: the active goal's unless [goalId] says otherwise. */
export function milestoneRows(db: Db, goalId: string = activeGoalId(db)): MilestoneRow[] {
  return db
    .prepare('SELECT * FROM milestones WHERE goal_id = ? ORDER BY sort_order, id')
    .all(goalId) as MilestoneRow[];
}

/** Every goal's milestones, goal by goal. */
export function allMilestoneRows(db: Db): MilestoneRow[] {
  return db
    .prepare(
      `SELECT m.* FROM milestones m JOIN goals g ON g.id = m.goal_id
       ORDER BY g.sort_order, g.id, m.sort_order, m.id`,
    )
    .all() as MilestoneRow[];
}

/** Each threshold is the running sum of costs in order (spec §5). */
export function withThresholds(rows: MilestoneRow[]): Milestone[] {
  let running = 0;
  return rows.map((r) => {
    running = sumMinor([running, r.cost_eur]);
    return toMilestone(r, running);
  });
}

export function listMilestones(db: Db, goalId?: string): Milestone[] {
  return withThresholds(milestoneRows(db, goalId));
}

/** The active goal, or another one by id. */
export function getGoal(db: Db, id: string = activeGoalId(db)): Goal {
  const sum = sumMinor(milestoneRows(db, id).map((m) => m.cost_eur));
  return toGoal(goalRow(db, id), sum, balanceEur(db), activeGoalId(db));
}

/** Every goal with its own milestones, for the goals page. */
export function listGoals(db: Db): GoalDetail[] {
  const balance = balanceEur(db);
  const active = activeGoalId(db);
  return goalRows(db).map((g) => {
    const milestones = listMilestones(db, g.id);
    const sum = sumMinor(milestones.map((m) => m.costEur));
    return { ...toGoal(g, sum, balance, active), milestones };
  });
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
