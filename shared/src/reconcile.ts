import { addDays, daysInMonth, toIsoDate, weekday } from './dates.js';

export type ReconcileFrequency = 'weekly' | 'monthly' | 'off';

export interface ReconcileSchedule {
  reconcileFrequency: ReconcileFrequency;
  /** Weekday 0–6 (Sunday = 0) when weekly, day of month 1–31 when monthly. */
  reconcileDay: number;
  /** ISO timestamp of the last count. */
  lastReconciledAt: string | null;
  /** "YYYY-MM-DD": the banner stays hidden until this date. */
  reconcileSnoozedUntil: string | null;
}

/** The most recent scheduled count date on or before `today`, or null when reminders are off. */
export function lastDueDate(s: ReconcileSchedule, today: string): string | null {
  if (s.reconcileFrequency === 'off') return null;
  if (s.reconcileFrequency === 'weekly') {
    const back = (weekday(today) - s.reconcileDay + 7) % 7;
    return addDays(today, -back);
  }
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  // Day 31 in a 30-day month means the last day of that month.
  const thisMonth = Math.min(s.reconcileDay, daysInMonth(y, m));
  if (d >= thisMonth) return toIsoDate(y, m, thisMonth);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return toIsoDate(py, pm, Math.min(s.reconcileDay, daysInMonth(py, pm)));
}

/**
 * A count is due when the latest scheduled date has passed without a count since,
 * and the user hasn't snoozed past today. `lastReconciledAt` is compared by its local date.
 */
export function isReconcileDue(
  s: ReconcileSchedule,
  today: string,
  lastReconciledDate: string | null,
): boolean {
  const due = lastDueDate(s, today);
  if (!due) return false;
  if (s.reconcileSnoozedUntil && s.reconcileSnoozedUntil > today) return false;
  return lastReconciledDate === null || lastReconciledDate < due;
}
