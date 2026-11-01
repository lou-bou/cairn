import type { Goal, Milestone } from '@cairn/shared';

/** "Phase 1: Pre-admission" → "Phase 1". Used where space is tight (progress labels, toasts). */
export function shortName(name: string): string {
  const head = name.split(':')[0]!.trim();
  return head || name;
}

export interface Progress {
  next: Milestone | null;
  /** The furthest milestone along the trail that is achieved. */
  latestAchieved: Milestone | null;
  remainingToNext: number;
  remainingToGoal: number;
  fraction: number;
}

export function progressOf(goal: Goal, milestones: Milestone[]): Progress {
  const next = milestones.find((m) => m.achievedAt === null) ?? null;
  const achieved = milestones.filter((m) => m.achievedAt !== null);
  const latestAchieved = achieved.at(-1) ?? null;
  const fraction =
    goal.amountEur > 0 ? Math.min(1, Math.max(0, goal.balanceEur / goal.amountEur)) : 0;
  return {
    next,
    latestAchieved,
    remainingToNext: next ? Math.max(0, next.thresholdEur - goal.balanceEur) : 0,
    remainingToGoal: Math.max(0, goal.amountEur - goal.balanceEur),
    fraction,
  };
}
