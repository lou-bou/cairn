import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:material_ui/material_ui.dart';

import '../../data/store.dart';
import '../../data/view.dart';
import '../../domain/dates.dart';
import '../../domain/models.dart';
import '../../domain/reconcile.dart';
import '../sheets/reconcile_sheet.dart';
import '../sheets/tx_sheet.dart';
import '../widgets/page.dart';
import '../widgets/progress_trail.dart';
import '../widgets/tx_list.dart';

class HomePage extends ConsumerWidget {
  const HomePage({super.key, required this.onSeeAll});

  final VoidCallback onSeeAll;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final recent = ref.watch(transactionsProvider).take(6).toList();
    return PageList(
      children: [
        const ReconcileBanner(),
        const _BalanceCard(),
        const _GoalCard(),
        KitCard(
          padding: const EdgeInsets.fromLTRB(Space.s4, Space.s4, Space.s4, Space.s2),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              CardHeader(
                title: 'Recent',
                action: recent.isEmpty
                    ? null
                    : Pressable(
                        onTap: onSeeAll,
                        child: Text(
                          'See all',
                          style: context.text.labelLarge!.copyWith(color: context.kit.accentText),
                        ),
                      ),
              ),
              if (recent.isEmpty)
                const EmptyState(
                  icon: LucideIcons.receiptText,
                  title: 'Nothing here yet',
                  body:
                      'Add the money you already have with Money in, then log what comes in and '
                      'goes out.',
                )
              else
                TxColumn(items: recent),
            ],
          ),
        ),
      ],
    );
  }
}

/// Shown when a count is due.
class ReconcileBanner extends ConsumerWidget {
  const ReconcileBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(settingsProvider);
    final today = todayIso();
    if (settings == null || !isReconcileDue(settings, today)) return const SizedBox.shrink();
    final t = context.kit;
    return Container(
      padding: const EdgeInsets.all(Space.s3),
      decoration: BoxDecoration(color: t.warningSoft, borderRadius: BorderRadius.circular(Radii.lg)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(LucideIcons.bellRing, size: 18, color: t.warningText),
              Space.s2.w,
              Expanded(
                child: Text(
                  'Count your money and compare it with the app balance.',
                  style: context.text.bodyMedium!.copyWith(color: t.warningText),
                ),
              ),
            ],
          ),
          Space.s3.h,
          Row(
            children: [
              KitButton(
                label: 'Count now',
                small: true,
                variant: ButtonVariant.primary,
                onPressed: () => openReconcileSheet(context),
              ),
              Space.s2.w,
              KitButton(
                label: 'Snooze 1 day',
                small: true,
                variant: ButtonVariant.ghost,
                onPressed: () async {
                  try {
                    await ref.read(dataProvider.notifier).saveSettings({
                      'reconcileSnoozedUntil': addDays(today, 1),
                    });
                  } on ApiException catch (e) {
                    Toasts.show(e.message);
                  }
                },
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _BalanceCard extends ConsumerWidget {
  const _BalanceCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.kit;
    final money = ref.watch(moneyProvider);
    final balance = ref.watch(balanceProvider);
    final month = ref.watch(thisMonthProvider);

    Widget stat(IconData icon, Color color, String label, String value) => Semantics(
      label: '$label $value',
      excludeSemantics: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: color),
          4.w,
          Text(value, style: context.text.bodyMedium!.num.copyWith(fontWeight: FontWeight.w600)),
        ],
      ),
    );

    return KitCard(
      padding: const EdgeInsets.all(Space.s5),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('BALANCE', style: context.text.labelSmall),
          Space.s1.h,
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              money.total(balance),
              style: context.text.displayLarge!.num.copyWith(
                color: balance < 0 ? t.negative : t.text,
              ),
            ),
          ),
          Space.s2.h,
          Wrap(
            spacing: Space.s4,
            runSpacing: Space.s1,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text('This month', style: context.text.bodyMedium!.copyWith(color: t.textMuted)),
              stat(LucideIcons.arrowDownLeft, t.positive, 'In', money.total(month.inEur)),
              stat(LucideIcons.arrowUpRight, t.negative, 'Out', money.total(month.outEur)),
            ],
          ),
          Space.s4.h,
          Row(
            children: [
              Expanded(
                child: KitButton(
                  label: 'Money in',
                  icon: LucideIcons.plus,
                  variant: ButtonVariant.positive,
                  block: true,
                  onPressed: () => openTxSheet(context, type: TxType.moneyIn),
                ),
              ),
              Space.s3.w,
              Expanded(
                child: KitButton(
                  label: 'Money out',
                  icon: LucideIcons.minus,
                  variant: ButtonVariant.negative,
                  block: true,
                  onPressed: () => openTxSheet(context, type: TxType.moneyOut),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _GoalCard extends ConsumerWidget {
  const _GoalCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final goal = ref.watch(goalProvider);
    final progress = ref.watch(progressProvider);
    if (goal == null || progress == null) return const SizedBox.shrink();
    final t = context.kit;
    final money = ref.watch(moneyProvider);
    final milestones = ref.watch(milestonesProvider);
    final balance = goal.balanceEur < 0 ? 0 : goal.balanceEur;
    final body = context.text.bodyMedium!;
    final strong = body.copyWith(fontWeight: FontWeight.w600);

    return KitCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(goal.name, style: context.text.titleMedium),
                    2.h,
                    Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(text: money.total(balance), style: strong.num),
                          TextSpan(
                            text: ' of ${money.total(goal.amountEur)}',
                            style: body.num.copyWith(color: t.textMuted),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              Text(
                '${(progress.fraction * 100).floor()}%',
                style: context.text.headlineMedium!.num.copyWith(color: t.accentText),
              ),
            ],
          ),
          Space.s4.h,
          ProgressTrail(goal: goal, milestones: milestones),
          Space.s3.h,
          if (progress.goalReached)
            Text('Goal reached. Well done.', style: strong)
          else if (progress.next != null)
            Text.rich(
              TextSpan(
                style: body,
                children: [
                  const TextSpan(text: 'Next: '),
                  TextSpan(text: progress.next!.name, style: strong),
                  TextSpan(text: ' · ${money.total(progress.remainingToNext)} to go', style: body.num),
                ],
              ),
            )
          else
            Text(
              '${milestones.isNotEmpty ? 'Every milestone reached. ' : ''}'
              '${money.total(progress.remainingToGoal)} to the goal',
              style: body.num,
            ),
          if (progress.latestAchieved != null) ...[
            4.h,
            Text.rich(
              TextSpan(
                style: body.copyWith(color: t.positive),
                children: [
                  const TextSpan(text: 'You can afford '),
                  TextSpan(
                    text: progress.latestAchieved!.name,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
