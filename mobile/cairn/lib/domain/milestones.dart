import 'models.dart';

/// "Phase 1: Pre-admission" → "Phase 1". Used where space is tight (trail labels, toasts).
String shortName(String name) {
  final head = name.split(':').first.trim();
  return head.isEmpty ? name : head;
}

class Progress {
  const Progress({
    required this.next,
    required this.latestAchieved,
    required this.remainingToNext,
    required this.remainingToGoal,
    required this.fraction,
    required this.goalReached,
  });

  final Milestone? next;

  /// The furthest milestone along the trail that the balance covers.
  final Milestone? latestAchieved;
  final int remainingToNext;
  final int remainingToGoal;
  final double fraction;
  final bool goalReached;
}

/// Whether [m] is covered by [balanceEur]. Derived from the balance rather than the server's
/// achievedAt so it is right for entries that have not synced yet.
bool isReached(Milestone m, int balanceEur) => balanceEur >= m.thresholdEur;

Progress progressOf(Goal goal, List<Milestone> milestones) {
  final balance = goal.balanceEur;
  Milestone? next, latest;
  for (final m in milestones) {
    if (isReached(m, balance)) {
      latest = m;
    } else {
      next ??= m;
    }
  }
  final fraction = goal.amountEur > 0 ? (balance / goal.amountEur).clamp(0.0, 1.0) : 0.0;
  int floor0(int v) => v < 0 ? 0 : v;
  return Progress(
    next: next,
    latestAchieved: latest,
    remainingToNext: next == null ? 0 : floor0(next.thresholdEur - balance),
    remainingToGoal: floor0(goal.amountEur - balance),
    fraction: fraction,
    goalReached: goal.amountEur > 0 && balance >= goal.amountEur,
  );
}

/// Cumulative thresholds for [milestones] in the given order.
List<Milestone> withThresholds(List<Milestone> milestones) {
  var sum = 0;
  return [
    for (final m in milestones) m.withThreshold(sum += m.costEur),
  ];
}
