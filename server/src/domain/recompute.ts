import { formatMoney, sumMinor } from '@cairn/shared';
import type { Db } from '../db/index.js';
import { activeGoalId, balanceEur, defaultRate, goalRows, milestoneRows } from './queries.js';

export interface RecomputeOptions {
  /**
   * Record what the balance already covers without celebrating it. Used when switching goals,
   * so making a goal active doesn't celebrate money saved before.
   */
  silent?: boolean;
}

/**
 * Bring every goal in line with the current data (spec §5), and the active goal's achievements.
 * Call inside the same DB transaction as the write that triggered it.
 * Returns notices to show the user.
 */
export function recompute(
  db: Db,
  now = new Date().toISOString(),
  { silent = false }: RecomputeOptions = {},
): string[] {
  const notices: string[] = [];
  const balance = balanceEur(db);
  const activeId = activeGoalId(db);
  const seenWhenReached = silent ? 1 : 0;

  for (const goal of goalRows(db)) {
    const active = goal.id === activeId;
    // Notices about a goal you're not looking at say which one.
    const about = (text: string) => (active ? text : `${goal.name}: ${text}`);
    const milestones = milestoneRows(db, goal.id);
    const sum = sumMinor(milestones.map((m) => m.cost_eur));

    if (goal.mode === 'custom' && goal.custom_eur !== null && goal.custom_eur < sum) {
      db.prepare(
        `UPDATE goals SET custom_original = ?, currency = 'EUR', rate = ?, custom_eur = ? WHERE id = ?`,
      ).run(sum, defaultRate(db), sum, goal.id);
      goal.custom_eur = sum;
      notices.push(
        about(
          `The milestones now add up to more than the goal, so the goal was raised to ${formatMoney(sum, 'EUR')}.`,
        ),
      );
    }

    const goalEur = goal.mode === 'auto' ? sum : (goal.custom_eur ?? 0);
    if (!active) {
      db.prepare('UPDATE goals SET amount_eur = ? WHERE id = ?').run(goalEur, goal.id);
      continue;
    }

    // Achievements follow the balance only for the goal being worked toward.
    const setMilestone = db.prepare(
      'UPDATE milestones SET achieved_at = ?, celebration_seen = ? WHERE id = ?',
    );
    let threshold = 0;
    for (const m of milestones) {
      threshold = sumMinor([threshold, m.cost_eur]);
      const achieved = balance >= threshold;
      if (achieved && m.achieved_at === null) setMilestone.run(now, seenWhenReached, m.id);
      else if (!achieved && m.achieved_at !== null) setMilestone.run(null, 1, m.id);
    }

    const goalAchieved = goalEur > 0 && balance >= goalEur;
    let achievedAt = goal.achieved_at;
    let seen = goal.celebration_seen;
    if (goalAchieved && achievedAt === null) [achievedAt, seen] = [now, seenWhenReached];
    else if (!goalAchieved && achievedAt !== null) [achievedAt, seen] = [null, 1];
    db.prepare(
      'UPDATE goals SET amount_eur = ?, achieved_at = ?, celebration_seen = ? WHERE id = ?',
    ).run(goalEur, achievedAt, seen, goal.id);
  }

  return notices;
}
