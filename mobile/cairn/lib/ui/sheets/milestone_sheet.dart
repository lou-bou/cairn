import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:material_ui/material_ui.dart';

import '../../data/store.dart';
import '../../data/view.dart';
import '../../domain/models.dart';
import '../widgets/money_input.dart';

Future<void> openMilestoneSheet(
  BuildContext context, {
  required String goalId,
  Milestone? milestone,
}) => showKitSheet<void>(
  context,
  builder: (_) => MilestoneSheet(goalId: goalId, milestone: milestone),
);

/// Shows server notices ("Goal raised to …") after a write.
void showNotices(Notices notices) {
  for (final n in notices) {
    Toasts.show(n, duration: const Duration(seconds: 7));
  }
}

class MilestoneSheet extends ConsumerStatefulWidget {
  const MilestoneSheet({super.key, required this.goalId, this.milestone});

  /// The goal a new milestone is added to.
  final String goalId;
  final Milestone? milestone;

  @override
  ConsumerState<MilestoneSheet> createState() => _MilestoneSheetState();
}

class _MilestoneSheetState extends ConsumerState<MilestoneSheet> {
  late final MoneyInputController _money;
  late final TextEditingController _name;
  late final TextEditingController _note;
  Map<String, String> _errors = {};
  String? _formError;
  bool _busy = false;
  bool _deleting = false;
  bool _confirmDelete = false;

  @override
  void initState() {
    super.initState();
    final m = widget.milestone;
    _money = MoneyInputController(
      initial: m == null ? null : (amount: m.costOriginal, currency: m.currency, rate: m.rate),
      defaultRate: ref.read(rateProvider),
    );
    _name = TextEditingController(text: m?.name ?? '');
    _note = TextEditingController(text: m?.note ?? '');
  }

  @override
  void dispose() {
    _money.dispose();
    _name.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _run(Future<Notices> Function() action, String done, {bool deleting = false}) async {
    setState(() {
      _busy = !deleting;
      _deleting = deleting;
      _formError = null;
    });
    try {
      final notices = await action();
      if (!mounted) return;
      Toasts.show(done);
      showNotices(notices);
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      setState(() {
        _errors = e.fields;
        _formError = e.fields.isEmpty ? e.message : null;
      });
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _deleting = false;
        });
      }
    }
  }

  void _submit() {
    final errors = <String, String>{};
    final values = _money.parse(errors, 'costOriginal');
    if (_name.text.trim().isEmpty) errors['name'] = 'Name is required';
    setState(() => _errors = errors);
    if (values == null || errors.isNotEmpty) return;
    final body = {
      'name': _name.text.trim(),
      'note': _note.text.trim(),
      'costOriginal': values.amount,
      'currency': values.currency.code,
      'rate': values.rate,
    };
    final data = ref.read(dataProvider.notifier);
    final m = widget.milestone;
    _run(
      () =>
          m == null ? data.createMilestone(widget.goalId, body) : data.updateMilestone(m.id, body),
      m == null ? 'Milestone added' : 'Milestone saved',
    );
  }

  @override
  Widget build(BuildContext context) {
    final m = widget.milestone;
    return KitSheet(
      title: m == null ? 'New milestone' : 'Edit milestone',
      footer: Row(
        children: [
          if (m != null) ...[
            _confirmDelete
                ? KitButton(
                    label: 'Confirm delete',
                    variant: ButtonVariant.danger,
                    busy: _deleting,
                    onPressed: () => _run(
                      () => ref.read(dataProvider.notifier).deleteMilestone(m.id),
                      'Milestone deleted',
                      deleting: true,
                    ),
                  )
                : KitButton(
                    label: 'Delete',
                    icon: LucideIcons.trash2,
                    variant: ButtonVariant.ghost,
                    onPressed: () => setState(() => _confirmDelete = true),
                  ),
            const SizedBox(width: Space.s2),
          ],
          Expanded(
            child: KitButton(
              label: m == null ? 'Add milestone' : 'Save',
              variant: ButtonVariant.primary,
              block: true,
              busy: _busy,
              onPressed: _submit,
            ),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          KitField(
            label: 'Name',
            error: _errors['name'],
            child: TextField(
              controller: _name,
              autofocus: m == null,
              maxLength: 80,
              textCapitalization: TextCapitalization.sentences,
              textInputAction: TextInputAction.next,
              decoration: invalidIf(
                _errors['name'] != null,
                const InputDecoration(hintText: 'e.g. Visa and flight', counterText: ''),
              ),
            ),
          ),
          const SizedBox(height: Space.s4),
          MoneyInputFields(
            controller: _money,
            label: 'Cost of this step',
            hint: 'Just this step. Thresholds add up the steps before it.',
            amountError: _errors['costOriginal'],
            rateError: _errors['rate'],
          ),
          const SizedBox(height: Space.s4),
          KitField(
            label: 'Note',
            error: _errors['note'],
            child: TextField(
              controller: _note,
              maxLength: 500,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                hintText: 'What this covers (optional)',
                counterText: '',
              ),
            ),
          ),
          if (_formError != null) ...[const SizedBox(height: Space.s4), FormError(_formError)],
        ],
      ),
    );
  }
}
