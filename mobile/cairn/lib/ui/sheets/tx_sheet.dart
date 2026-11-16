import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:kit/kit.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:material_ui/material_ui.dart';

import '../../data/store.dart';
import '../../data/view.dart';
import '../../domain/dates.dart';
import '../../domain/models.dart';
import '../../domain/money.dart';
import '../theme.dart';
import '../widgets/money_input.dart';

/// Open the entry form: pass [type] for a new entry or [tx] to edit one.
Future<void> openTxSheet(BuildContext context, {TxType? type, Tx? tx}) {
  return showKitSheet<void>(
    context,
    builder: (_) => TxSheet(type: type ?? tx?.type ?? TxType.moneyOut, editing: tx),
  );
}

Future<String?> pickDate(BuildContext context, String current, {String? min, String? max}) async {
  final picked = await showDatePicker(
    context: context,
    initialDate: dateOf(current),
    firstDate: min == null ? DateTime.utc(2000) : dateOf(min),
    lastDate: max == null ? DateTime.utc(2100, 12, 31) : dateOf(max),
  );
  return picked == null ? null : isoOf(picked);
}

class TxSheet extends ConsumerStatefulWidget {
  const TxSheet({super.key, required this.type, this.editing});

  final TxType type;
  final Tx? editing;

  @override
  ConsumerState<TxSheet> createState() => _TxSheetState();
}

class _TxSheetState extends ConsumerState<TxSheet> {
  late TxType _type = widget.type;
  late final MoneyInputController _money;
  late final TextEditingController _note;
  late String _categoryId = widget.editing?.categoryId ?? '';
  late String _source;
  late String _date = widget.editing?.date ?? todayIso();
  bool _editRate = false;
  bool _confirmDelete = false;
  Map<String, String> _errors = {};

  @override
  void initState() {
    super.initState();
    final e = widget.editing;
    final prefs = ref.read(prefsProvider);
    final lastSource = prefs[lastEntrySourcePref];
    _source = e?.source ?? (sources.any((s) => s.id == lastSource) ? lastSource as String : 'cash');
    _money = MoneyInputController(
      initial: e == null ? null : (amount: e.amountOriginal, currency: e.currency, rate: e.rate),
      defaultRate: ref.read(rateProvider),
      currency: Currency.parse(prefs[lastEntryCurrencyPref]),
    );
    _note = TextEditingController(text: e?.note ?? '');
  }

  @override
  void dispose() {
    _money.dispose();
    _note.dispose();
    super.dispose();
  }

  void _submit() {
    final errors = <String, String>{};
    final values = _money.parse(errors, 'amountOriginal');
    final categories = ref.read(categoriesProvider).where((c) => c.type == _type);
    if (!categories.any((c) => c.id == _categoryId)) errors['categoryId'] = 'Choose a category';
    if (_note.text.trim().length > 500) errors['note'] = 'Note is too long (500 characters max)';
    setState(() => _errors = errors);
    if (values == null || errors.isNotEmpty) {
      HapticFeedback.heavyImpact();
      return;
    }

    final input = TxInput(
      type: _type,
      date: _date,
      note: _note.text.trim(),
      amountOriginal: values.amount,
      currency: values.currency,
      rate: values.rate,
      categoryId: _categoryId,
      source: _source,
      isAdjustment: widget.editing?.isAdjustment ?? false,
    );
    final data = ref.read(dataProvider.notifier);
    final editing = widget.editing;
    if (editing != null) {
      data.updateTx(editing.id, input);
    } else {
      data.addTx(input);
    }
    ref.read(prefsProvider.notifier)
      ..set(lastEntryCurrencyPref, values.currency.code)
      ..set(lastEntrySourcePref, _source);
    HapticFeedback.mediumImpact();
    Toasts.show(
      editing != null
          ? 'Saved'
          : _type == TxType.moneyIn
          ? 'Money in added'
          : 'Money out added',
    );
    Navigator.of(context).pop();
  }

  void _delete() {
    ref.read(dataProvider.notifier).deleteTx(widget.editing!.id);
    Toasts.show('Deleted');
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    final editing = widget.editing;
    final categories = ref.watch(categoriesProvider).where((c) => c.type == _type).toList();

    return KitSheet(
      title: editing != null ? 'Edit entry' : 'New entry',
      footer: Row(
        children: [
          if (editing != null) ...[
            _confirmDelete
                ? KitButton(label: 'Confirm delete', variant: ButtonVariant.danger, onPressed: _delete)
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
              label: editing != null ? 'Save' : 'Add',
              variant: ButtonVariant.primary,
              block: true,
              onPressed: _submit,
            ),
          ),
        ],
      ),
      child: ListenableBuilder(
        listenable: _money,
        builder: (context, _) {
          final preview = _money.preview;
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              KitSegmented<TxType>(
                value: _type,
                onChanged: (v) => setState(() {
                  _type = v;
                  _categoryId = '';
                }),
                options: const [
                  SegOption(TxType.moneyIn, 'Money in', tone: Tone.positive),
                  SegOption(TxType.moneyOut, 'Money out', tone: Tone.negative),
                ],
              ),
              const SizedBox(height: Space.s4),
              KitField(
                label: 'Amount',
                error: _errors['amountOriginal'],
                child: AmountRow(
                  controller: _money.amount,
                  currency: _money.currency,
                  onCurrency: _money.setCurrency,
                  invalid: _errors['amountOriginal'] != null,
                  autofocus: editing == null,
                ),
              ),
              const SizedBox(height: Space.s2),
              if (_editRate)
                Padding(
                  padding: const EdgeInsets.only(top: Space.s2),
                  child: KitField(
                    label: 'Rate (DZD per €1)',
                    error: _errors['rate'],
                    hint: preview == null ? null : '≈ $preview',
                    child: TextField(
                      controller: _money.rate,
                      keyboardType: amountKeyboard,
                      inputFormatters: amountFormatters,
                      style: context.text.bodyLarge!.num,
                      decoration: invalidIf(_errors['rate'] != null),
                    ),
                  ),
                )
              else
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        '€1 = ${_money.rate.text} DA${preview == null ? '' : ' · ≈ $preview'}',
                        style: context.text.bodySmall!.num,
                      ),
                    ),
                    Pressable(
                      onTap: () => setState(() => _editRate = true),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: Space.s2),
                        child: Text(
                          'Change rate',
                          style: context.text.labelMedium!.copyWith(
                            color: t.accentText,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              const SizedBox(height: Space.s4),
              KitField(
                label: 'Category',
                error: _errors['categoryId'],
                child: KitChips<String>(
                  value: _categoryId,
                  onChanged: (v) => setState(() => _categoryId = v),
                  options: [
                    for (final c in categories)
                      ChipOption(c.id, c.name, swatch: context.cairn.category(c.id)),
                  ],
                ),
              ),
              const SizedBox(height: Space.s4),
              KitField(
                label: _type == TxType.moneyIn ? 'Source' : 'Paid from',
                child: KitSegmented<String>(
                  value: _source,
                  onChanged: (v) => setState(() => _source = v),
                  options: [for (final s in sources) SegOption(s.id, s.name)],
                ),
              ),
              const SizedBox(height: Space.s4),
              KitField(
                label: 'Date',
                child: PickerField(
                  value: formatDay(_date),
                  icon: LucideIcons.calendar,
                  onTap: () async {
                    final d = await pickDate(context, _date);
                    if (d != null) setState(() => _date = d);
                  },
                ),
              ),
              const SizedBox(height: Space.s4),
              KitField(
                label: 'Note',
                error: _errors['note'],
                child: TextField(
                  controller: _note,
                  maxLength: 500,
                  textCapitalization: TextCapitalization.sentences,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _submit(),
                  decoration: const InputDecoration(hintText: 'Optional', counterText: ''),
                ),
              ),
              if (editing?.isAdjustment ?? false) ...[
                const SizedBox(height: Space.s3),
                Text('This entry is a reconciliation adjustment.', style: context.text.bodySmall),
              ],
              if (editing?.pending ?? false) ...[
                const SizedBox(height: Space.s3),
                Text(
                  'This entry is saved on the phone and will be sent when the server is reachable.',
                  style: context.text.bodySmall,
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}
