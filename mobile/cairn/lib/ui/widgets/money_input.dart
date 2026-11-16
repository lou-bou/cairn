import 'package:flutter/services.dart';
import 'package:kit/kit.dart';
import 'package:material_ui/material_ui.dart';

import '../../domain/money.dart';

/// Lets a decimal comma from the keypad work as a decimal point ("12,5" → "12.5") while leaving
/// pasted thousands separators ("1,365") alone.
final decimalCommaFormatter = TextInputFormatter.withFunction((oldValue, newValue) {
  final text = newValue.text;
  final comma = text.indexOf(',');
  if (comma < 0 || text.contains('.') || comma != text.lastIndexOf(',')) return newValue;
  if (text.length - comma - 1 > 2) return newValue;
  return newValue.copyWith(text: text.replaceFirst(',', '.'));
});

final amountFormatters = [
  FilteringTextInputFormatter.allow(RegExp(r'[0-9.,\s]')),
  decimalCommaFormatter,
];

const amountKeyboard = TextInputType.numberWithOptions(decimal: true);

typedef MoneyValues = ({int amount, Currency currency, int rate});

/// State for "amount + currency + (for DZD) rate", shared by every form that takes money.
class MoneyInputController extends ChangeNotifier {
  MoneyInputController({MoneyValues? initial, required int defaultRate, Currency? currency})
    : currency = initial?.currency ?? currency ?? Currency.eur,
      _defaultRate = defaultRate,
      amount = TextEditingController(
        text: initial == null ? '' : formatAmountInput(initial.amount, initial.currency),
      ),
      rate = TextEditingController(text: formatRate(initial?.rate ?? defaultRate)) {
    amount.addListener(notifyListeners);
    rate.addListener(notifyListeners);
  }

  final TextEditingController amount;
  final TextEditingController rate;
  final int _defaultRate;
  Currency currency;

  void setCurrency(Currency c) {
    if (c == currency) return;
    currency = c;
    notifyListeners();
  }

  /// "≈ €3.64" for a DZD amount at the entered rate, or null.
  String? get preview {
    if (currency != Currency.dzd || amount.text.trim().isEmpty) return null;
    try {
      final eur = toEurCents(parseAmount(amount.text, Currency.dzd), Currency.dzd, parseRate(rate.text));
      return formatMoney(eur, Currency.eur);
    } on MoneyError {
      return null;
    }
  }

  /// Parse into API values. Problems are written into [errors] under [amountKey] and 'rate'.
  MoneyValues? parse(Map<String, String> errors, String amountKey, {bool allowZero = false}) {
    var parsedAmount = 0, parsedRate = _defaultRate;
    var ok = true;
    try {
      parsedAmount = parseAmount(amount.text, currency);
      if (parsedAmount == 0 && !allowZero) {
        errors[amountKey] = 'Amount must be greater than 0';
        ok = false;
      }
    } on MoneyError catch (e) {
      errors[amountKey] = e.message;
      ok = false;
    }
    try {
      parsedRate = parseRate(rate.text);
    } on MoneyError catch (e) {
      errors['rate'] = e.message;
      ok = false;
    }
    return ok ? (amount: parsedAmount, currency: currency, rate: parsedRate) : null;
  }

  @override
  void dispose() {
    amount.dispose();
    rate.dispose();
    super.dispose();
  }
}

InputDecoration invalidIf(bool invalid, [InputDecoration base = const InputDecoration()]) =>
    invalid ? base.copyWith(error: const SizedBox.shrink()) : base;

class CurrencyToggle extends StatelessWidget {
  const CurrencyToggle({super.key, required this.value, required this.onChanged, this.dense = false});

  final Currency value;
  final ValueChanged<Currency> onChanged;
  final bool dense;

  @override
  Widget build(BuildContext context) => KitSegmented<Currency>(
    value: value,
    onChanged: onChanged,
    dense: dense,
    expand: false,
    options: const [SegOption(Currency.eur, 'EUR'), SegOption(Currency.dzd, 'DZD')],
  );
}

/// The big amount field with its currency toggle beside it.
class AmountRow extends StatelessWidget {
  const AmountRow({
    super.key,
    required this.controller,
    required this.currency,
    required this.onCurrency,
    this.invalid = false,
    this.autofocus = false,
  });

  final TextEditingController controller;
  final Currency currency;
  final ValueChanged<Currency> onCurrency;
  final bool invalid;
  final bool autofocus;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: TextField(
            controller: controller,
            autofocus: autofocus,
            keyboardType: amountKeyboard,
            inputFormatters: amountFormatters,
            style: context.text.headlineMedium!.num,
            decoration: invalidIf(
              invalid,
              InputDecoration(hintText: currency == Currency.eur ? '0.00' : '0'),
            ),
          ),
        ),
        const SizedBox(width: Space.s2),
        SizedBox(height: 52, child: CurrencyToggle(value: currency, onChanged: onCurrency)),
      ],
    );
  }
}

/// Amount, currency and (for DZD) the rate with a live EUR preview.
class MoneyInputFields extends StatelessWidget {
  const MoneyInputFields({
    super.key,
    required this.controller,
    required this.label,
    this.amountError,
    this.rateError,
    this.hint,
    this.autofocus = false,
  });

  final MoneyInputController controller;
  final String label;
  final String? amountError;
  final String? rateError;
  final String? hint;
  final bool autofocus;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          KitField(
            label: label,
            error: amountError,
            hint: hint,
            child: AmountRow(
              controller: controller.amount,
              currency: controller.currency,
              onCurrency: controller.setCurrency,
              invalid: amountError != null,
              autofocus: autofocus,
            ),
          ),
          if (controller.currency == Currency.dzd) ...[
            const SizedBox(height: Space.s4),
            KitField(
              label: 'Rate (DZD per €1)',
              error: rateError,
              hint: controller.preview == null ? null : '≈ ${controller.preview}',
              child: TextField(
                controller: controller.rate,
                keyboardType: amountKeyboard,
                inputFormatters: amountFormatters,
                style: context.text.bodyLarge!.num,
                decoration: invalidIf(rateError != null),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
