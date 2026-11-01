/**
 * Money math for Cairn. No floats, ever.
 *
 * - Amounts are integer minor units: cents for EUR, centimes for DZD.
 * - Rates are DZD per 1 EUR as an integer in thousandths ("rate milli"): 275 → 275000, 262.5 → 262500.
 * - Conversions use BigInt and round half up (away from zero on .5), to the nearest minor unit.
 * - User input is parsed from strings digit by digit, never through Number/parseFloat.
 */

export const CURRENCIES = ['EUR', 'DZD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const RATE_SCALE = 1000;
const RATE_SCALE_N = BigInt(RATE_SCALE);

/** Upper bound for any stored amount, far below Number.MAX_SAFE_INTEGER so sums stay exact. */
export const MAX_MINOR = 1_000_000_000_000; // 10 billion EUR or DZD
/** Upper bound for a rate: 1,000,000 DZD per EUR. */
export const MAX_RATE_MILLI = 1_000_000 * RATE_SCALE;

export class MoneyError extends Error {
  override name = 'MoneyError';
}

export function isCurrency(value: unknown): value is Currency {
  return value === 'EUR' || value === 'DZD';
}

/** Digits allowed after the decimal point when the user types an amount. */
export function inputDecimals(currency: Currency): number {
  // Dinars are entered whole so a DZD entry always redisplays exactly as typed.
  return currency === 'EUR' ? 2 : 0;
}

function assertSafeInt(n: number, what: string): void {
  if (!Number.isSafeInteger(n))
    throw new MoneyError(`${what} must be a whole number of minor units`);
}

/** Divide and round half away from zero. */
export function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new MoneyError('Division by zero');
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const q = (abs * 2n + denominator) / (denominator * 2n);
  return negative ? -q : q;
}

/**
 * Parse a decimal string into an integer scaled by 10^scale.
 * Accepts "1365", "1,365.50", "1 365.5". Comma and space are thousands separators; "." is the
 * decimal point. Rejects signs, exponents, and more decimals than `maxDecimals`.
 */
function parseScaled(input: string, scale: number, maxDecimals: number, what: string): bigint {
  const s = input.trim().replace(/[\s\u00a0\u202f]/g, '');
  if (s === '') throw new MoneyError(`Enter ${what}`);
  const m = /^(\d{1,3}(?:,\d{3})+|\d+)?(?:\.(\d*))?$/.exec(s);
  if (!m || (m[1] === undefined && !m[2]))
    throw new MoneyError(`"${input.trim()}" is not a valid ${what}`);
  const intPart = (m[1] ?? '0').replace(/,/g, '');
  const fracPart = (m[2] ?? '').replace(/0+$/, '');
  if (fracPart.length > maxDecimals) {
    throw new MoneyError(
      maxDecimals === 0
        ? `${capitalize(what)} must be a whole number`
        : `${capitalize(what)} can have at most ${maxDecimals} decimal places`,
    );
  }
  return BigInt(intPart) * 10n ** BigInt(scale) + BigInt(fracPart.padEnd(scale, '0') || '0');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Parse a user-typed amount into minor units. Returns >= 0; callers decide whether 0 is allowed. */
export function parseAmount(input: string, currency: Currency): number {
  const minor = parseScaled(input, 2, inputDecimals(currency), 'amount');
  if (minor > BigInt(MAX_MINOR)) throw new MoneyError('Amount is too large');
  return Number(minor);
}

/** Parse a user-typed rate (DZD per 1 EUR) into rate milli. Must be > 0, up to 3 decimals. */
export function parseRate(input: string): number {
  const milli = parseScaled(input, 3, 3, 'rate');
  if (milli === 0n) throw new MoneyError('Rate must be greater than 0');
  if (milli > BigInt(MAX_RATE_MILLI)) throw new MoneyError('Rate is too large');
  return Number(milli);
}

export function assertRateMilli(rateMilli: number): void {
  if (!Number.isSafeInteger(rateMilli) || rateMilli <= 0 || rateMilli > MAX_RATE_MILLI) {
    throw new MoneyError('Rate must be a positive whole number of thousandths');
  }
}

/** Convert an amount in its original currency to EUR cents using the record's own rate. */
export function toEurCents(amountMinor: number, currency: Currency, rateMilli: number): number {
  assertSafeInt(amountMinor, 'Amount');
  if (currency === 'EUR') return amountMinor;
  assertRateMilli(rateMilli);
  // centimes / (rateMilli / 1000) = centimes * 1000 / rateMilli
  return Number(divRoundHalfUp(BigInt(amountMinor) * RATE_SCALE_N, BigInt(rateMilli)));
}

/** Convert EUR cents to DZD centimes at the given rate (display only). */
export function eurToDzdCentimes(eurCents: number, rateMilli: number): number {
  assertSafeInt(eurCents, 'Amount');
  assertRateMilli(rateMilli);
  return Number(divRoundHalfUp(BigInt(eurCents) * BigInt(rateMilli), RATE_SCALE_N));
}

/** A stored record's money, as kept in the DB. */
export interface StoredAmount {
  amountOriginal: number;
  currency: Currency;
  amountEur: number;
}

/**
 * The amount to show for a record in the chosen display currency (spec §8):
 * - EUR display: the stored EUR value.
 * - DZD display: a DZD-entered record shows its original amount exactly; anything else is
 *   the EUR value at the current default rate.
 */
export function displayMinor(
  record: StoredAmount,
  display: Currency,
  currentRateMilli: number,
): { minor: number; currency: Currency } {
  if (display === 'EUR') return { minor: record.amountEur, currency: 'EUR' };
  if (record.currency === 'DZD') return { minor: record.amountOriginal, currency: 'DZD' };
  return { minor: eurToDzdCentimes(record.amountEur, currentRateMilli), currency: 'DZD' };
}

/** A computed EUR total (balance, sums) in the chosen display currency. */
export function displayTotal(
  eurCents: number,
  display: Currency,
  currentRateMilli: number,
): { minor: number; currency: Currency } {
  if (display === 'EUR') return { minor: eurCents, currency: 'EUR' };
  return { minor: eurToDzdCentimes(eurCents, currentRateMilli), currency: 'DZD' };
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export interface FormatOptions {
  /** Show "+" for positive values (for signed IN/OUT rows and differences). */
  signed?: boolean;
}

/** Format minor units for display: EUR as "€1,365.00", DZD as "375,375 DA" (rounded to dinars). */
export function formatMoney(minor: number, currency: Currency, opts: FormatOptions = {}): string {
  assertSafeInt(minor, 'Amount');
  let n = BigInt(minor);
  if (currency === 'DZD') n = divRoundHalfUp(n, 100n);
  const negative = n < 0n;
  const abs = negative ? -n : n;
  const sign = negative ? '\u2212' : opts.signed && abs > 0n ? '+' : '';

  if (currency === 'EUR') {
    const whole = groupThousands((abs / 100n).toString());
    const cents = (abs % 100n).toString().padStart(2, '0');
    return `${sign}€${whole}.${cents}`;
  }
  return `${sign}${groupThousands(abs.toString())} DA`;
}

/** Minor units back to a plain string for an edit field: 136550 EUR → "1365.50", 100000 DZD → "1000". */
export function formatAmountInput(minor: number, currency: Currency): string {
  assertSafeInt(minor, 'Amount');
  const n = BigInt(minor);
  const negative = n < 0n;
  const abs = negative ? -n : n;
  const whole = (abs / 100n).toString();
  const frac = (abs % 100n).toString().padStart(2, '0');
  const sign = negative ? '-' : '';
  if (currency === 'DZD') return frac === '00' ? `${sign}${whole}` : `${sign}${whole}.${frac}`;
  return `${sign}${whole}.${frac}`;
}

/** Rate milli back to a plain string: 275000 → "275", 262500 → "262.5". */
export function formatRate(rateMilli: number): string {
  assertRateMilli(rateMilli);
  const n = BigInt(rateMilli);
  const whole = n / RATE_SCALE_N;
  const frac = (n % RATE_SCALE_N).toString().padStart(3, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** Exact integer sum; throws if the result leaves the safe integer range. */
export function sumMinor(values: Iterable<number>): number {
  let total = 0n;
  for (const v of values) {
    assertSafeInt(v, 'Amount');
    total += BigInt(v);
  }
  const result = Number(total);
  assertSafeInt(result, 'Total');
  return result;
}
