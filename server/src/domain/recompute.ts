import { formatMoney, sumMinor } from '@cairn/shared';
import type { Db } from '../db/index.js';
import { balanceEur, defaultRate, goalRow, milestoneRows } from './queries.js';

/**
 * Bring the goal and every milestone in line with the current data (spec §5).
 * Call inside the same DB transaction as the write that triggered it.
 * Returns notices to show the user.
 */
export function recompute(db: Db, now = new Date().toISOString()): string[] {
  const notices: string[] = [];
  const balance = balanceEur(db);
  const milestones = milestoneRows(db);
  const sum = sumMinor(milestones.map((m) => m.cost_eur));
  const goal = goalRow(db);

  if (goal.mode === 'auto' && milestones.length === 0) {
    // Auto needs milestones. Keep the goal the user was working toward as a custom amount.
    const previous = goal.amount_eur;
    db.prepare(
      `UPDATE goal SET mode = 'custom', custom_original = ?, currency = 'EUR', rate = ?, custom_eur = ? WHERE id = 1`,
    ).run(previous, defaultRate(db), previous);
    Object.assign(goal, { mode: 'custom', custom_eur: previous });
    notices.push(
      `No milestones left, so the goal is now a custom amount of ${formatMoney(previous, 'EUR')}.`,
    );
  }

  if (goal.mode === 'custom' && goal.custom_eur !== null && goal.custom_eur < sum) {
    db.prepare(
      `UPDATE goal SET custom_original = ?, currency = 'EUR', rate = ?, custom_eur = ? WHERE id = 1`,
    ).run(sum, defaultRate(db), sum);
    goal.custom_eur = sum;
    notices.push(
      `The milestones now add up to more than the goal, so the goal was raised to ${formatMoney(sum, 'EUR')}.`,
    );
  }

  const goalEur = goal.mode === 'auto' ? sum : (goal.custom_eur ?? 0);

  const setMilestone = db.prepare(
    'UPDATE milestones SET achieved_at = ?, celebration_seen = ? WHERE id = ?',
  );
  let threshold = 0;
  for (const m of milestones) {
    threshold = sumMinor([threshold, m.cost_eur]);
    const achieved = balance >= threshold;
    if (achieved && m.achieved_at === null) setMilestone.run(now, 0, m.id);
    else if (!achieved && m.achieved_at !== null) setMilestone.run(null, 1, m.id);
  }

  const goalAchieved = goalEur > 0 && balance >= goalEur;
  let achievedAt = goal.achieved_at;
  let seen = goal.celebration_seen;
  if (goalAchieved && achievedAt === null) [achievedAt, seen] = [now, 0];
  else if (!goalAchieved && achievedAt !== null) [achievedAt, seen] = [null, 1];
  db.prepare(
    'UPDATE goal SET amount_eur = ?, achieved_at = ?, celebration_seen = ? WHERE id = 1',
  ).run(goalEur, achievedAt, seen);

  return notices;
}
