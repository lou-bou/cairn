import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:material_ui/material_ui.dart';

import '../../data/store.dart';
import '../../data/view.dart';
import '../../domain/models.dart';
import '../../domain/money.dart';
import '../theme.dart';
import '../widgets/money_input.dart';
import 'milestone_sheet.dart' show showNotices;

Future<void> openReconcileSheet(BuildContext context) =>
    showKitSheet<void>(context, builder: (_) => const ReconcileSheet());

/// Enter the counted total, compare with the app balance, then finish as-is or with an adjustment.
class ReconcileSheet extends ConsumerStatefulWidget {
  const ReconcileSheet({super.key});

  @override
  ConsumerState<ReconcileSheet> createState() => _ReconcileSheetState();
}

class _ReconcileSheetState extends ConsumerState<ReconcileSheet> {
  late final MoneyInputController _money = MoneyInputController(
    defaultRate: ref.read(rateProvider),
  );
  ({MoneyValues values, int eur})? _counted;
  String _categoryId = '';
  Map<String, String> _errors = {};
  String? _formError;
  bool _busy = false;

  @override
  void dispose() {
    _money.dispose();
    super.dispose();
  }

  void _compare() {
    final errors = <String, String>{};
    // A count of zero is a valid answer.
    final values = _money.parse(errors, 'countedOriginal', allowZero: true);
    setState(() {
      _errors = errors;
      if (values != null) {
        _counted = (values: values, eur: toEurCents(values.amount, values.currency, values.rate));
      }
    });
    FocusScope.of(context).unfocus();
  }

  Future<void> _finish(bool adjust) async {
    final counted = _counted;
    if (counted == null) return;
    if (adjust && _categoryId.isEmpty) {
      setState(() => _errors = {'categoryId': 'Choose a category for the adjustment'});
      return;
    }
    setState(() {
      _busy = true;
      _formError = null;
    });
    try {
      final notices = await ref.read(dataProvider.notifier).createReconciliation({
        'countedOriginal': counted.values.amount,
        'currency': counted.values.currency.code,
        'rate': counted.values.rate,
        if (adjust) 'adjustment': {'categoryId': _categoryId},
      });
      if (!mounted) return;
      Toasts.show(adjust ? 'Balance adjusted to your count' : 'Count saved');
      showNotices(notices);
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      setState(() => _formError = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    final money = ref.watch(moneyProvider);
    final balance = ref.watch(balanceProvider);
    final pending = ref.watch(pendingCountProvider).waiting;
    final counted = _counted;
    final muted = context.text.bodyMedium!.copyWith(color: t.textMuted);

    if (counted == null) {
      return KitSheet(
        title: 'Count your money',
        footer: KitButton(
          label: 'Compare',
          variant: ButtonVariant.primary,
          block: true,
          onPressed: _compare,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Add up the cash and accounts you are saving in, then enter the total.', style: muted),
            const SizedBox(height: Space.s4),
            MoneyInputFields(
              controller: _money,
              label: 'Counted total',
              amountError: _errors['countedOriginal'],
              rateError: _errors['rate'],
              autofocus: true,
            ),
          ],
        ),
      );
    }

    final diff = counted.eur - balance;
    final adjustType = diff > 0 ? TxType.moneyIn : TxType.moneyOut;
    Widget row(String label, String value, {String? sub, Color? color}) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(child: Text(label, style: muted)),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                value,
                style: context.text.bodyLarge!.num.copyWith(fontWeight: FontWeight.w600, color: color),
              ),
              if (sub != null) Text(sub, style: context.text.bodySmall!.num),
            ],
          ),
        ],
      ),
    );

    return KitSheet(
      title: 'Count your money',
      footer: diff == 0
          ? KitButton(
              label: 'Done',
              variant: ButtonVariant.primary,
              block: true,
              busy: _busy,
              onPressed: () => _finish(false),
            )
          : Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                KitButton(
                  label: 'Adjust',
                  variant: ButtonVariant.primary,
                  block: true,
                  busy: _busy,
                  onPressed: () => _finish(true),
                ),
                const SizedBox(height: Space.s2),
                KitButton(
                  label: 'Done without adjusting',
                  block: true,
                  onPressed: _busy ? null : () => _finish(false),
                ),
              ],
            ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          row('App balance', money.total(balance)),
          row(
            'You counted',
            money.total(counted.eur),
            sub: counted.values.currency != money.display
                ? formatMoney(counted.values.amount, counted.values.currency)
                : null,
          ),
          Divider(color: t.border),
          row('Difference', money.total(diff, signed: true), color: diff == 0 ? t.positive : null),
          const SizedBox(height: Space.s3),
          if (pending > 0) ...[
            Text(
              '$pending ${pending == 1 ? 'entry is' : 'entries are'} still waiting to sync. The '
              'server compares against its own balance, so sync first for an exact result.',
              style: context.text.bodySmall!.copyWith(color: t.warningText),
            ),
            const SizedBox(height: Space.s3),
          ],
          if (diff == 0)
            Row(
              children: [
                Icon(LucideIcons.check, size: 18, color: t.positive),
                const SizedBox(width: Space.s2),
                Text(
                  'It matches.',
                  style: context.text.bodyLarge!.copyWith(
                    color: t.positive,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            )
          else ...[
            Text(
              'Adjust adds a money ${adjustType.code} entry of ${money.total(diff.abs())} so the '
              'app matches your count.',
              style: muted,
            ),
            const SizedBox(height: Space.s4),
            KitField(
              label: 'Adjustment category',
              error: _errors['categoryId'],
              child: KitChips<String>(
                value: _categoryId,
                onChanged: (v) => setState(() => _categoryId = v),
                options: [
                  for (final c in ref.watch(categoriesProvider).where((c) => c.type == adjustType))
                    ChipOption(c.id, c.name, swatch: context.cairn.category(c.id)),
                ],
              ),
            ),
          ],
          const SizedBox(height: Space.s3),
          Align(
            alignment: Alignment.centerLeft,
            child: KitButton(
              label: 'Change count',
              variant: ButtonVariant.ghost,
              small: true,
              onPressed: () => setState(() => _counted = null),
            ),
          ),
          if (_formError != null) ...[const SizedBox(height: Space.s3), FormError(_formError)],
        ],
      ),
    );
  }
}
