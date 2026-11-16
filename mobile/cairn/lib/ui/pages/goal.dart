import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:material_ui/material_ui.dart';

import '../../data/store.dart';
import '../../data/view.dart';
import '../../domain/milestones.dart';
import '../../domain/models.dart';
import '../../domain/money.dart';
import '../sheets/milestone_sheet.dart';
import '../widgets/money_input.dart';
import '../widgets/page.dart';

class GoalPage extends ConsumerWidget {
  const GoalPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final goal = ref.watch(goalProvider);
    final milestones = ref.watch(milestonesProvider);
    return PageList(
      children: [
        const PageTitle('Goal'),
        if (goal != null) ...[
          _GoalForm(key: ValueKey('${goal.mode}:${goal.customEur}:${goal.name}'), goal: goal),
          KitCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                CardHeader(
                  title: 'Milestones',
                  action: KitButton(
                    label: 'Add',
                    icon: LucideIcons.plus,
                    small: true,
                    onPressed: () => openMilestoneSheet(context),
                  ),
                ),
                if (milestones.isEmpty)
                  const EmptyState(
                    icon: LucideIcons.mountain,
                    title: 'No milestones yet',
                    body:
                        'Break the goal into steps you can afford one at a time, like fees, a '
                        'deposit or a flight.',
                  )
                else
                  _MilestoneList(milestones: milestones, goal: goal),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _GoalForm extends ConsumerStatefulWidget {
  const _GoalForm({super.key, required this.goal});
  final Goal goal;

  @override
  ConsumerState<_GoalForm> createState() => _GoalFormState();
}

class _GoalFormState extends ConsumerState<_GoalForm> {
  late final TextEditingController _name = TextEditingController(text: widget.goal.name);
  late String _mode = widget.goal.mode;
  late final MoneyInputController _money;
  Map<String, String> _errors = {};
  String? _formError;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final g = widget.goal;
    _money = MoneyInputController(
      initial: g.customOriginal != null && g.currency != null && g.rate != null
          ? (amount: g.customOriginal!, currency: g.currency!, rate: g.rate!)
          : null,
      defaultRate: ref.read(rateProvider),
    );
  }

  @override
  void dispose() {
    _name.dispose();
    _money.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    final errors = <String, String>{};
    if (_name.text.trim().isEmpty) errors['name'] = 'Name is required';
    final body = <String, dynamic>{'name': _name.text.trim(), 'mode': _mode};
    if (_mode == 'custom') {
      final v = _money.parse(errors, 'customOriginal');
      if (v != null) {
        body.addAll({'customOriginal': v.amount, 'currency': v.currency.code, 'rate': v.rate});
      }
    } else if (widget.goal.milestoneSumEur <= 0) {
      errors['mode'] = 'Auto mode needs at least one milestone';
    }
    setState(() {
      _errors = errors;
      _formError = null;
    });
    if (errors.isNotEmpty) return;

    setState(() => _busy = true);
    try {
      final notices = await ref.read(dataProvider.notifier).saveGoal(body);
      Toasts.show('Goal saved');
      showNotices(notices);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _errors = e.fields;
          _formError = e.fields.isEmpty ? e.message : null;
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    final goal = widget.goal;
    final money = ref.watch(moneyProvider);
    return KitCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Expanded(
                child: Text('Goal', style: context.text.bodyMedium!.copyWith(color: t.textMuted)),
              ),
              Text(money.total(goal.amountEur), style: context.text.headlineMedium!.num),
            ],
          ),
          Space.s4.h,
          KitField(
            label: 'Name',
            error: _errors['name'],
            child: TextField(
              controller: _name,
              maxLength: 80,
              textCapitalization: TextCapitalization.sentences,
              decoration: invalidIf(
                _errors['name'] != null,
                const InputDecoration(counterText: ''),
              ),
            ),
          ),
          Space.s4.h,
          KitField(
            label: 'Amount',
            error: _errors['mode'],
            hint: _mode == 'auto'
                ? 'The goal is the total of all milestones and follows them as they change.'
                : 'Must be at least the milestone total of '
                      '${formatMoney(goal.milestoneSumEur, Currency.eur)}.',
            child: KitSegmented<String>(
              value: _mode,
              onChanged: (v) => setState(() => _mode = v),
              options: const [
                SegOption('auto', 'Sum of milestones'),
                SegOption('custom', 'Custom amount'),
              ],
            ),
          ),
          if (_mode == 'custom') ...[
            Space.s4.h,
            MoneyInputFields(
              controller: _money,
              label: 'Custom amount',
              amountError: _errors['customOriginal'],
              rateError: _errors['rate'],
            ),
          ],
          if (_formError != null) ...[Space.s4.h, FormError(_formError)],
          Space.s4.h,
          Align(
            alignment: Alignment.centerLeft,
            child: KitButton(
              label: 'Save goal',
              variant: ButtonVariant.primary,
              busy: _busy,
              onPressed: _submit,
            ),
          ),
        ],
      ),
    );
  }
}

class _MilestoneList extends ConsumerStatefulWidget {
  const _MilestoneList({required this.milestones, required this.goal});

  final List<Milestone> milestones;
  final Goal goal;

  @override
  ConsumerState<_MilestoneList> createState() => _MilestoneListState();
}

class _MilestoneListState extends ConsumerState<_MilestoneList> {
  /// The order shown while the server confirms a drag; null means "as the server has it".
  List<String>? _localOrder;

  Future<void> _reorder(int from, int to) async {
    final ids = [for (final m in _ordered()) m.id];
    if (from == to) return;
    ids.insert(to, ids.removeAt(from));
    setState(() => _localOrder = ids);
    try {
      showNotices(await ref.read(dataProvider.notifier).reorderMilestones(ids));
    } on ApiException catch (e) {
      Toasts.show(e.message);
    } finally {
      if (mounted) setState(() => _localOrder = null);
    }
  }

  List<Milestone> _ordered() {
    final order = _localOrder;
    if (order == null) return widget.milestones;
    final byId = {for (final m in widget.milestones) m.id: m};
    // A milestone added or removed meanwhile makes the local order stale.
    if (order.length != byId.length || !order.every(byId.containsKey)) return widget.milestones;
    return withThresholds([for (final id in order) byId[id]!]);
  }

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    final goal = widget.goal;
    final money = ref.watch(moneyProvider);
    final ordered = _ordered();
    final buffer = goal.amountEur - goal.milestoneSumEur;

    Widget total(String label, int eur) => Padding(
      padding: const EdgeInsets.only(top: Space.s2),
      child: Row(
        children: [
          Expanded(
            child: Text(label, style: context.text.bodyMedium!.copyWith(color: t.textMuted)),
          ),
          Text(
            money.total(eur),
            style: context.text.bodyMedium!.num.copyWith(fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ReorderableListView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          buildDefaultDragHandles: false,
          itemCount: ordered.length,
          onReorderStart: (_) => HapticFeedback.mediumImpact(),
          onReorderItem: _reorder,
          proxyDecorator: (child, _, animation) => AnimatedBuilder(
            animation: animation,
            builder: (context, _) => Material(
              color: t.surface,
              elevation: 6 * animation.value,
              shadowColor: t.shadow,
              borderRadius: BorderRadius.circular(Radii.md),
              child: child,
            ),
          ),
          itemBuilder: (context, i) {
            final m = ordered[i];
            final reached = isReached(m, goal.balanceEur);
            final cost = money.record(
              amountOriginal: m.costOriginal,
              currency: m.currency,
              amountEur: m.costEur,
            );
            final original = m.currency != money.display
                ? ' (${formatMoney(m.costOriginal, m.currency)})'
                : '';
            return Container(
              key: ValueKey(m.id),
              decoration: BoxDecoration(
                border: i == 0 ? null : Border(top: BorderSide(color: t.border)),
              ),
              child: Row(
                children: [
                  ReorderableDragStartListener(
                    index: i,
                    child: Semantics(
                      label: 'Drag to reorder ${m.name}',
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(0, Space.s4, Space.s2, Space.s4),
                        child: Icon(LucideIcons.gripVertical, size: 18, color: t.textFaint),
                      ),
                    ),
                  ),
                  Container(
                    width: 24,
                    height: 24,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: reached ? t.text : t.surfaceSunken,
                      shape: BoxShape.circle,
                    ),
                    child: Text(
                      '${i + 1}',
                      style: context.text.labelMedium!.num.copyWith(
                        color: reached ? t.bg : t.textMuted,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  Space.s3.w,
                  Expanded(
                    child: Pressable(
                      scale: 0.99,
                      onTap: () => openMilestoneSheet(context, milestone: m),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: Space.s3),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              m.name,
                              style: context.text.bodyLarge!.copyWith(fontWeight: FontWeight.w500),
                            ),
                            2.h,
                            Text(
                              '$cost$original · reached at ${money.total(m.thresholdEur)}',
                              style: context.text.bodySmall!.num,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  Space.s2.w,
                  Badge2(label: reached ? 'Reached' : 'Ahead', done: reached),
                ],
              ),
            );
          },
        ),
        Divider(color: t.border),
        total('Milestones total', goal.milestoneSumEur),
        if (buffer > 0) total('Buffer to the goal', buffer),
      ],
    );
  }
}
