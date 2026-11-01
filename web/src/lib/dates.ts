import { addDays, todayIso } from '@cairn/shared';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Today", "Yesterday", "3 Oct" or "3 Oct 2025" for other years. */
export function formatDay(iso: string, today = todayIso()): string {
  if (iso === today) return 'Today';
  if (iso === addDays(today, -1)) return 'Yesterday';
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const base = `${d} ${MONTHS[m - 1]}`;
  return iso.slice(0, 4) === today.slice(0, 4) ? base : `${base} ${y}`;
}

export function formatMonth(key: string): string {
  const [y, m] = key.split('-').map(Number) as [number, number];
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
}

/** Local date of an ISO timestamp. */
export function localDateOf(ts: string): string {
  return todayIso(new Date(ts));
}
