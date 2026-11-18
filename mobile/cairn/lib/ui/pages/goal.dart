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
import '../theme.dart';
import '../widgets/page.dart';

/// The Goal tab: the goal being worked toward, with a switcher and a way to every goal.
class GoalPage extends ConsumerWidget {
  const GoalPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final goal = ref.watch(goalByIdProvider(null));
    return PageList(
      children: [
        PageTitle(
          'Goal',
          actions: [
            KitButton(
              label: 'All goals',
              icon: LucideIcons.listChecks,
              small: true,
              onPressed: () => openGoalsScreen(context),
            ),
          ],
        ),
        if (goal != null) ...[_Switcher(goal: goal), ..._goalCards(context, goal)],
      ],
    );
  }
}

/// Any goal, active or not, as its own screen.
class GoalScreen extends ConsumerWidget {
  const GoalScreen({super.key, required this.goalId});
  final String goalId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final goal = ref.watch(goalByIdProvider(goalId));
    return Scaffold(
      appBar: AppBar(title: Text(goal?.name ?? 'Goal')),
      body: SafeArea(
        top: false,
        child: goal == null
            ? const Center(
                child: EmptyState(icon: LucideIcons.mountain, title: 'This goal no longer exists'),
              )
            : PageList(
                children: [
                  if (!goal.active) _NotActiveCard(goal: goal),
                  ..._goalCards(context, goal),
                ],
              ),
      ),
    );
  }
}

Future<void> openGoal(BuildContext context, String goalId) =>
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => GoalScreen(goalId: goalId)));

Future<void> openGoalsScreen(BuildContext context) =>
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const GoalsScreen()));

List<Widget> _goalCards(BuildContext context, Goal goal) => [
  _GoalForm(key: ValueKey('${goal.id}:${goal.mode}:${goal.customEur}:${goal.name}'), goal: goal),
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
            onPressed: () => openMilestoneSheet(context, goalId: goal.id),
          ),
        ),
        if (goal.milestones.isEmpty)
          const EmptyState(
            icon: LucideIcons.mountain,
            title: 'No milestones yet',
            body:
                'Break the goal into steps you can afford one at a time, like the price, '
                'insurance or a deposit. The goal adds them up.',
          )
        else
          _MilestoneList(milestones: goal.milestones, goal: goal),
      ],
    ),
  ),
];

/// "Working toward: Car ▾": opens the list of goals to switch to.
class _Switcher extends ConsumerWidget {
  const _Switcher({required this.goal});
  final Goal goal;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.kit;
    final others = ref.watch(goalsProvider).where((g) => !g.active && !g.archived).length;
    return Pressable(
      scale: 0.99,
      semanticLabel: 'Working toward ${goal.name}. Switch goal',
      onTap: () => _openSwitchSheet(context),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: Space.s4, vertical: Space.s3),
        decoration: BoxDecoration(
          color: t.accentSoft,
          borderRadius: BorderRadius.circular(Radii.lg),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'WORKING TOWARD',
                    style: context.text.labelSmall!.copyWith(color: t.accentText),
                  ),
                  2.h,
                  Text(goal.name, style: context.text.titleMedium),
                ],
              ),
            ),
            Text(
              others == 0 ? 'Add a goal' : 'Switch',
              style: context.text.labelLarge!.copyWith(color: t.accentText),
            ),
            4.w,
            Icon(LucideIcons.chevronDown, size: 18, color: t.accentText),
          ],
        ),
      ),
    );
  }
}

Future<void> _openSwitchSheet(BuildContext context) =>
    showKitSheet<void>(context, builder: (_) => const _SwitchSheet());

class _SwitchSheet extends ConsumerStatefulWidget {
  const _SwitchSheet();

  @override
  ConsumerState<_SwitchSheet> createState() => _SwitchSheetState();
}

class _SwitchSheetState extends ConsumerState<_SwitchSheet> {
  String? _busy;

  Future<void> _activate(Goal g) async {
    if (g.active) return Navigator.of(context).pop();
    setState(() => _busy = g.id);
    try {
      showNotices(await ref.read(dataProvider.notifier).activateGoal(g.id));
      Toasts.show('Working toward ${g.name}');
      if (mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      Toasts.show(e.message);
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final goals = ref.watch(goalsProvider).where((g) => !g.archived || g.active).toList();
    return KitSheet(
      title: 'Work toward',
      footer: Row(
        children: [
          Expanded(
            child: KitButton(
              label: 'All goals',
              icon: LucideIcons.listChecks,
              block: true,
              onPressed: () {
                Navigator.of(context).pop();
                openGoalsScreen(context);
              },
            ),
          ),
          Space.s3.w,
          Expanded(
            child: KitButton(
              label: 'New goal',
              icon: LucideIcons.plus,
              variant: ButtonVariant.primary,
              block: true,
              onPressed: () async {
                Navigator.of(context).pop();
                await openNewGoalSheet(context);
              },
            ),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Your balance counts toward the goal you pick. Milestones it already covers are '
            'marked reached without a celebration.',
            style: context.text.bodySmall,
          ),
          Space.s3.h,
          for (final g in goals)
            Padding(
              padding: const EdgeInsets.only(bottom: Space.s2),
              child: _GoalTile(goal: g, busy: _busy == g.id, onTap: () => _activate(g)),
            ),
        ],
      ),
    );
  }
}

/// A goal in a list: name, amount, how far the balance covers it.
class _GoalTile extends ConsumerWidget {
  const _GoalTile({required this.goal, required this.onTap, this.busy = false});

  final Goal goal;
  final VoidCallback onTap;
  final bool busy;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.kit;
    final money = ref.watch(moneyProvider);
    final balance = goal.balanceEur < 0 ? 0 : goal.balanceEur;
    final fraction = goal.amountEur > 0 ? (balance / goal.amountEur).clamp(0.0, 1.0) : 0.0;
    final steps = goal.milestones.length;
    final covered = goal.milestones.where((m) => isReached(m, goal.balanceEur)).length;
    return Pressable(
      scale: 0.985,
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(Space.s4),
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: BorderRadius.circular(Radii.lg),
          border: Border.all(
            color: goal.active ? t.accent : t.border,
            width: goal.active ? 1.5 : 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    goal.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: context.text.titleSmall,
                  ),
                ),
                if (busy)
                  const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                else if (goal.active)
                  Icon(LucideIcons.check, size: 18, color: t.accentText),
              ],
            ),
            4.h,
            Row(
              children: [
                Expanded(
                  child: Text(
                    goal.amountEur > 0 ? money.total(goal.amountEur) : 'No amount yet',
                    style: context.text.bodySmall!.num,
                  ),
                ),
                Text(
                  steps == 0
                      ? 'No milestones'
                      : '$covered of $steps ${steps == 1 ? 'milestone' : 'milestones'} covered',
                  style: context.text.bodySmall,
                ),
              ],
            ),
            Space.s2.h,
            ClipRRect(
              borderRadius: BorderRadius.circular(Radii.pill),
              child: SizedBox(
                height: 6,
                child: ColoredBox(
                  color: context.cairn.progressTrack,
                  child: FractionallySizedBox(
                    alignment: Alignment.centerLeft,
                    widthFactor: fraction,
                    child: ColoredBox(color: t.accent),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Every goal: the active one, the others, and the archived ones.
class GoalsScreen extends ConsumerWidget {
  const GoalsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final goals = ref.watch(goalsProvider);
    final current = goals.where((g) => !g.archived).toList();
    final archived = goals.where((g) => g.archived).toList();
    return Scaffold(
      appBar: AppBar(title: const Text('Goals')),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: context.kit.surface,
          border: Border(top: BorderSide(color: context.kit.border)),
        ),
        padding: EdgeInsets.fromLTRB(
          Space.s4,
          Space.s3,
          Space.s4,
          Space.s3 + MediaQuery.viewPaddingOf(context).bottom,
        ),
        child: KitButton(
          label: 'New goal',
          icon: LucideIcons.plus,
          variant: ButtonVariant.primary,
          block: true,
          onPressed: () => openNewGoalSheet(context),
        ),
      ),
      body: SafeArea(
        top: false,
        child: PageList(
          children: [
            Text(
              'Your balance counts toward the goal you are working toward. The others show how '
              'far the same money would get you.',
              style: context.text.bodyMedium!.copyWith(color: context.kit.textMuted),
            ),
            for (final g in current) _GoalTile(goal: g, onTap: () => openGoal(context, g.id)),
            if (archived.isNotEmpty)
              Theme(
                data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
                child: ExpansionTile(
                  tilePadding: EdgeInsets.zero,
                  childrenPadding: EdgeInsets.zero,
                  title: Text('Archived (${archived.length})', style: context.text.labelLarge),
                  children: [
                    for (final g in archived)
                      Padding(
                        padding: const EdgeInsets.only(bottom: Space.s3),
                        child: _GoalTile(goal: g, onTap: () => openGoal(context, g.id)),
                      ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// On a goal that isn't the one being worked toward: switch to it, archive or delete it.
class _NotActiveCard extends ConsumerStatefulWidget {
  const _NotActiveCard({required this.goal});
  final Goal goal;

  @override
  ConsumerState<_NotActiveCard> createState() => _NotActiveCardState();
}

class _NotActiveCardState extends ConsumerState<_NotActiveCard> {
  String? _busy;

  Future<void> _run(String what, Future<Notices> Function(CairnData d) action, String done) async {
    setState(() => _busy = what);
    try {
      showNotices(await action(ref.read(dataProvider.notifier)));
      Toasts.show(done);
      if (what != 'archive' && mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      Toasts.show(e.message);
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    final g = widget.goal;
    final activeName = ref.watch(goalProvider)?.name ?? 'another goal';
    return KitCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '${g.archived ? 'This goal is archived. ' : ''}You are working toward $activeName. '
            'Make this the goal to see your progress on it at home and get its celebrations.',
            style: context.text.bodyMedium!.copyWith(color: t.textMuted),
          ),
          Space.s3.h,
          KitButton(
            label: 'Work toward this goal',
            variant: ButtonVariant.primary,
            block: true,
            busy: _busy == 'activate',
            onPressed: _busy != null
                ? null
                : () => _run('activate', (d) => d.activateGoal(g.id), 'Working toward ${g.name}'),
          ),
          Space.s2.h,
          Row(
            children: [
              Expanded(
                child: KitButton(
                  label: g.archived ? 'Restore' : 'Archive',
                  icon: LucideIcons.archive,
                  block: true,
                  busy: _busy == 'archive',
                  onPressed: _busy != null
                      ? null
                      : () => _run(
                          'archive',
                          (d) => d.archiveGoal(g.id, archived: !g.archived),
                          g.archived ? 'Goal restored' : 'Goal archived',
                        ),
                ),
              ),
              Space.s2.w,
              Expanded(
                child: KitButton(
                  label: 'Delete',
                  icon: LucideIcons.trash2,
                  variant: ButtonVariant.ghost,
                  block: true,
                  busy: _busy == 'delete',
                  onPressed: _busy != null
                      ? null
                      : () async {
                          final ok = await confirmSheet(
                            context,
                            title: 'Delete ${g.name}?',
                            message: 'Its ${g.milestones.length} milestones are deleted with it.',
                            confirmLabel: 'Delete',
                            danger: true,
                          );
                          if (ok) await _run('delete', (d) => d.deleteGoal(g.id), 'Goal deleted');
                        },
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Name and amount for a new goal; opens it afterwards so its milestones can be added.
Future<void> openNewGoalSheet(BuildContext context) async {
  final id = await showKitSheet<String>(context, builder: (_) => const _NewGoalSheet());
  if (id != null && context.mounted) await openGoal(context, id);
}

class _NewGoalSheet extends ConsumerStatefulWidget {
  const _NewGoalSheet();

  @override
  ConsumerState<_NewGoalSheet> createState() => _NewGoalSheetState();
}

class _NewGoalSheetState extends ConsumerState<_NewGoalSheet> {
  final _name = TextEditingController();
  String _mode = 'auto';
  late final MoneyInputController _money = MoneyInputController(
    defaultRate: ref.read(rateProvider),
  );
  Map<String, String> _errors = {};
  String? _formError;
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose();
    _money.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final errors = <String, String>{};
    final body = _goalBody(_name.text, _mode, _money, errors);
    setState(() {
      _errors = errors;
      _formError = null;
    });
    if (body == null) return;
    setState(() => _busy = true);
    try {
      final id = await ref.read(dataProvider.notifier).createGoal(body);
      Toasts.show('Goal added. Now add its milestones.');
      if (mounted) Navigator.of(context).pop(id);
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
    return KitSheet(
      title: 'New goal',
      footer: KitButton(
        label: 'Add goal',
        variant: ButtonVariant.primary,
        block: true,
        busy: _busy,
        onPressed: _submit,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _GoalFields(
            name: _name,
            mode: _mode,
            onMode: (v) => setState(() => _mode = v),
            money: _money,
            errors: _errors,
            milestoneSumEur: 0,
            autofocus: true,
          ),
          if (_formError != null) ...[Space.s4.h, FormError(_formError)],
        ],
      ),
    );
  }
}

/// The API body for a goal's name and amount, or null with [errors] filled in.
Map<String, dynamic>? _goalBody(
  String name,
  String mode,
  MoneyInputController money,
  Map<String, String> errors,
) {
  if (name.trim().isEmpty) errors['name'] = 'Name is required';
  final body = <String, dynamic>{'name': name.trim(), 'mode': mode};
  if (mode == 'custom') {
    final v = money.parse(errors, 'customOriginal');
    if (v != null) {
      body.addAll({'customOriginal': v.amount, 'currency': v.currency.code, 'rate': v.rate});
    }
  }
  return errors.isEmpty ? body : null;
}

/// Name, "sum of milestones" or a custom amount: shared by editing and creating a goal.
class _GoalFields extends StatelessWidget {
  const _GoalFields({
    required this.name,
    required this.mode,
    required this.onMode,
    required this.money,
    required this.errors,
    required this.milestoneSumEur,
    this.autofocus = false,
  });

  final TextEditingController name;
  final String mode;
  final ValueChanged<String> onMode;
  final MoneyInputController money;
  final Map<String, String> errors;
  final int milestoneSumEur;
  final bool autofocus;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        KitField(
          label: 'Name',
          error: errors['name'],
          child: TextField(
            controller: name,
            autofocus: autofocus,
            maxLength: 80,
            textCapitalization: TextCapitalization.sentences,
            decoration: invalidIf(
              errors['name'] != null,
              const InputDecoration(counterText: '', hintText: 'e.g. Car'),
            ),
          ),
        ),
        Space.s4.h,
        KitField(
          label: 'Amount',
          error: errors['mode'],
          hint: mode == 'auto'
              ? 'The goal is the total of its milestones and follows them as they change.'
              : milestoneSumEur > 0
              ? 'Must be at least the milestone total of '
                    '${formatMoney(milestoneSumEur, Currency.eur)}.'
              : 'A fixed amount. Milestones can still mark the steps toward it.',
          child: KitSegmented<String>(
            value: mode,
            onChanged: onMode,
            options: const [
              SegOption('auto', 'Sum of milestones'),
              SegOption('custom', 'Custom amount'),
            ],
          ),
        ),
        if (mode == 'custom') ...[
          Space.s4.h,
          MoneyInputFields(
            controller: money,
            label: 'Custom amount',
            amountError: errors['customOriginal'],
            rateError: errors['rate'],
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
    final body = _goalBody(_name.text, _mode, _money, errors);
    setState(() {
      _errors = errors;
      _formError = null;
    });
    if (body == null) return;

    setState(() => _busy = true);
    try {
      final notices = await ref.read(dataProvider.notifier).updateGoal(widget.goal.id, body);
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
                child: Text(
                  goal.active ? 'Goal' : 'Would need',
                  style: context.text.bodyMedium!.copyWith(color: t.textMuted),
                ),
              ),
              Text(
                goal.amountEur > 0 ? money.total(goal.amountEur) : 'No amount yet',
                style: goal.amountEur > 0
                    ? context.text.headlineMedium!.num
                    : context.text.titleMedium!.copyWith(color: t.textMuted),
              ),
            ],
          ),
          Space.s4.h,
          _GoalFields(
            name: _name,
            mode: _mode,
            onMode: (v) => setState(() => _mode = v),
            money: _money,
            errors: _errors,
            milestoneSumEur: goal.milestoneSumEur,
          ),
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
                      onTap: () => openMilestoneSheet(context, goalId: goal.id, milestone: m),
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
