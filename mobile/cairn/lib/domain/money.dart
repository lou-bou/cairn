/// Money math for Cairn, a port of shared/src/money.ts. No floats, ever.
///
/// - Amounts are integer minor units: cents for EUR, centimes for DZD.
/// - Rates are DZD per 1 EUR as an integer in thousandths: 275 → 275000, 262.5 → 262500.
/// - Conversions use BigInt and round half up (away from zero on .5).
/// - User input is parsed from strings digit by digit, never through double.
library;

enum Currency {
  eur('EUR'),
  dzd('DZD');

  const Currency(this.code);
  final String code;

  static Currency parse(Object? code) => code == 'DZD' ? Currency.dzd : Currency.eur;
}

const rateScale = 1000;
final _rateScaleN = BigInt.from(rateScale);

/// Upper bound for any stored amount: 10 billion EUR or DZD.
const maxMinor = 1000000000000;

/// Upper bound for a rate: 1,000,000 DZD per EUR.
const maxRateMilli = 1000000 * rateScale;

const fallbackRateMilli = 275000;

class MoneyError implements Exception {
  const MoneyError(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Digits allowed after the decimal point when typing an amount. Dinars are entered whole.
int inputDecimals(Currency c) => c == Currency.eur ? 2 : 0;

/// Divide and round half away from zero.
BigInt divRoundHalfUp(BigInt numerator, BigInt denominator) {
  if (denominator == BigInt.zero) throw const MoneyError('Division by zero');
  if (denominator.isNegative) {
    numerator = -numerator;
    denominator = -denominator;
  }
  final negative = numerator.isNegative;
  final abs = negative ? -numerator : numerator;
  final q = (abs * BigInt.two + denominator) ~/ (denominator * BigInt.two);
  return negative ? -q : q;
}

final _scaledPattern = RegExp(r'^(\d{1,3}(?:,\d{3})+|\d+)?(?:\.(\d*))?$');

String _capitalize(String s) => s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);

/// Parse a decimal string into an integer scaled by 10^scale.
/// Accepts "1365", "1,365.50", "1 365.5". Comma and space are thousands separators.
BigInt _parseScaled(String input, int scale, int maxDecimals, String what) {
  final s = input.trim().replaceAll(RegExp(r'[\s  ]'), '');
  if (s.isEmpty) throw MoneyError('Enter ${what == 'amount' ? 'an' : 'a'} $what');
  final m = _scaledPattern.firstMatch(s);
  final intGroup = m?.group(1);
  final fracGroup = m?.group(2);
  if (m == null || (intGroup == null && (fracGroup == null || fracGroup.isEmpty))) {
    throw MoneyError('"${input.trim()}" is not a valid $what');
  }
  final intPart = (intGroup ?? '0').replaceAll(',', '');
  final fracPart = (fracGroup ?? '').replaceAll(RegExp(r'0+$'), '');
  if (fracPart.length > maxDecimals) {
    throw MoneyError(
      maxDecimals == 0
          ? '${_capitalize(what)} must be a whole number'
          : '${_capitalize(what)} can have at most $maxDecimals decimal places',
    );
  }
  final frac = fracPart.padRight(scale, '0');
  return BigInt.parse(intPart) * BigInt.from(10).pow(scale) +
      (frac.isEmpty ? BigInt.zero : BigInt.parse(frac));
}

/// Parse a typed amount into minor units. Returns >= 0; callers decide whether 0 is allowed.
int parseAmount(String input, Currency currency) {
  final minor = _parseScaled(input, 2, inputDecimals(currency), 'amount');
  if (minor > BigInt.from(maxMinor)) throw const MoneyError('Amount is too large');
  return minor.toInt();
}

/// Parse a typed rate (DZD per 1 EUR) into rate milli. Must be > 0, up to 3 decimals.
int parseRate(String input) {
  final milli = _parseScaled(input, 3, 3, 'rate');
  if (milli == BigInt.zero) throw const MoneyError('Rate must be greater than 0');
  if (milli > BigInt.from(maxRateMilli)) throw const MoneyError('Rate is too large');
  return milli.toInt();
}

void _assertRate(int rateMilli) {
  if (rateMilli <= 0 || rateMilli > maxRateMilli) {
    throw const MoneyError('Rate must be a positive whole number of thousandths');
  }
}

/// Convert an amount in its original currency to EUR cents using the record's own rate.
int toEurCents(int amountMinor, Currency currency, int rateMilli) {
  if (currency == Currency.eur) return amountMinor;
  _assertRate(rateMilli);
  return divRoundHalfUp(BigInt.from(amountMinor) * _rateScaleN, BigInt.from(rateMilli)).toInt();
}

/// Convert EUR cents to DZD centimes at the given rate (display only).
int eurToDzdCentimes(int eurCents, int rateMilli) {
  _assertRate(rateMilli);
  return divRoundHalfUp(BigInt.from(eurCents) * BigInt.from(rateMilli), _rateScaleN).toInt();
}

typedef Shown = ({int minor, Currency currency});

/// The amount to show for a stored record in the chosen display currency:
/// - EUR display: the stored EUR value.
/// - DZD display: a DZD-entered record shows its original amount exactly; anything else is the
///   EUR value at the current default rate.
Shown displayMinor({
  required int amountOriginal,
  required Currency currency,
  required int amountEur,
  required Currency display,
  required int currentRateMilli,
}) {
  if (display == Currency.eur) return (minor: amountEur, currency: Currency.eur);
  if (currency == Currency.dzd) return (minor: amountOriginal, currency: Currency.dzd);
  return (minor: eurToDzdCentimes(amountEur, currentRateMilli), currency: Currency.dzd);
}

/// A computed EUR total (balance, sums) in the chosen display currency.
Shown displayTotal(int eurCents, Currency display, int currentRateMilli) {
  if (display == Currency.eur) return (minor: eurCents, currency: Currency.eur);
  return (minor: eurToDzdCentimes(eurCents, currentRateMilli), currency: Currency.dzd);
}

String _groupThousands(String digits) {
  final out = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) out.write(',');
    out.write(digits[i]);
  }
  return out.toString();
}

/// Format minor units: EUR as "€1,365.00", DZD as "375,375 DA" (rounded to dinars).
String formatMoney(int minor, Currency currency, {bool signed = false}) {
  var n = BigInt.from(minor);
  if (currency == Currency.dzd) n = divRoundHalfUp(n, BigInt.from(100));
  final negative = n.isNegative;
  final abs = negative ? -n : n;
  final sign = negative ? '−' : (signed && abs > BigInt.zero ? '+' : '');
  if (currency == Currency.eur) {
    final whole = _groupThousands((abs ~/ BigInt.from(100)).toString());
    final cents = (abs % BigInt.from(100)).toString().padLeft(2, '0');
    return '$sign€$whole.$cents';
  }
  return '$sign${_groupThousands(abs.toString())} DA';
}

/// Minor units back to a plain string for an edit field: 136550 EUR → "1365.50", 100000 DZD → "1000".
String formatAmountInput(int minor, Currency currency) {
  final negative = minor < 0;
  final abs = minor.abs();
  final whole = (abs ~/ 100).toString();
  final frac = (abs % 100).toString().padLeft(2, '0');
  final sign = negative ? '-' : '';
  if (currency == Currency.dzd) return frac == '00' ? '$sign$whole' : '$sign$whole.$frac';
  return '$sign$whole.$frac';
}

/// Rate milli back to a plain string: 275000 → "275", 262500 → "262.5".
String formatRate(int rateMilli) {
  _assertRate(rateMilli);
  final whole = rateMilli ~/ rateScale;
  final frac = (rateMilli % rateScale).toString().padLeft(3, '0').replaceAll(RegExp(r'0+$'), '');
  return frac.isEmpty ? '$whole' : '$whole.$frac';
}

/// Short axis labels in display units: 250000 cents → "€2.5K", 37537500 centimes → "375K DA".
String formatCompact(int minor, Currency currency) {
  final units = BigInt.from(minor) ~/ BigInt.from(100);
  final negative = units.isNegative;
  final abs = negative ? -units : units;
  String step(int div, String suffix) {
    final d = BigInt.from(div);
    final tenths = (abs * BigInt.from(10) + d ~/ BigInt.two) ~/ d;
    final whole = tenths ~/ BigInt.from(10);
    final frac = tenths % BigInt.from(10);
    final showFrac = frac != BigInt.zero && whole < BigInt.from(100);
    return '$whole${showFrac ? '.$frac' : ''}$suffix';
  }

  final body = abs >= BigInt.from(1000000)
      ? step(1000000, 'M')
      : abs >= BigInt.from(1000)
      ? step(1000, 'K')
      : abs.toString();
  final sign = negative ? '−' : '';
  return currency == Currency.eur ? '$sign€$body' : '$sign$body DA';
}
