import 'dates.dart';
import 'models.dart';

/// The most recent scheduled count date on or before [today], or null when reminders are off.
/// (A port of shared/src/reconcile.ts.)
String? lastDueDate(Settings s, String today) {
  if (s.reconcileFrequency == 'off') return null;
  if (s.reconcileFrequency == 'weekly') {
    final back = (weekday(today) - s.reconcileDay + 7) % 7;
    return addDays(today, -back);
  }
  final y = int.parse(today.substring(0, 4));
  final m = int.parse(today.substring(5, 7));
  final d = int.parse(today.substring(8, 10));
  int clamp(int year, int month) {
    final dim = daysInMonth(year, month);
    return s.reconcileDay < dim ? s.reconcileDay : dim;
  }

  // Day 31 in a 30-day month means the last day of that month.
  final thisMonth = clamp(y, m);
  if (d >= thisMonth) return toIsoDate(y, m, thisMonth);
  final py = m == 1 ? y - 1 : y;
  final pm = m == 1 ? 12 : m - 1;
  return toIsoDate(py, pm, clamp(py, pm));
}

/// A count is due when the latest scheduled date has passed without a count since, and the
/// user hasn't snoozed past today.
bool isReconcileDue(Settings s, String today) {
  final due = lastDueDate(s, today);
  if (due == null) return false;
  final snoozed = s.reconcileSnoozedUntil;
  if (snoozed != null && snoozed.compareTo(today) > 0) return false;
  final last = s.lastReconciledAt == null ? null : localDateOf(s.lastReconciledAt!);
  return last == null || last.compareTo(due) < 0;
}
