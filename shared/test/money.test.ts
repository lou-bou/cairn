import { describe, expect, it } from 'vitest';
import {
  MAX_MINOR,
  MoneyError,
  displayMinor,
  displayTotal,
  divRoundHalfUp,
  eurToDzdCentimes,
  formatAmountInput,
  formatMoney,
  formatRate,
  parseAmount,
  parseRate,
  sumMinor,
  toEurCents,
} from '../src/money.js';

const RATE_275 = 275_000;

describe('divRoundHalfUp', () => {
  it.each([
    [10n, 4n, 3n], // 2.5 → 3
    [9n, 4n, 2n], // 2.25 → 2
    [11n, 4n, 3n], // 2.75 → 3
    [-10n, 4n, -3n], // -2.5 → -3 (away from zero)
    [-9n, 4n, -2n],
    [10n, -4n, -3n],
    [0n, 7n, 0n],
    [8n, 4n, 2n],
  ])('%s / %s = %s', (n, d, expected) => {
    expect(divRoundHalfUp(n, d)).toBe(expected);
  });

  it('rejects division by zero', () => {
    expect(() => divRoundHalfUp(1n, 0n)).toThrow(MoneyError);
  });
});

describe('parseAmount', () => {
  it.each([
    ['1365', 'EUR', 136500],
    ['1365.5', 'EUR', 136550],
    ['1365.50', 'EUR', 136550],
    ['1,365.50', 'EUR', 136550],
    ['1 365.50', 'EUR', 136550],
    ['  42  ', 'EUR', 4200],
    ['0.01', 'EUR', 1],
    ['.5', 'EUR', 50],
    ['5.', 'EUR', 500],
    ['1.230', 'EUR', 123], // trailing zeros beyond 2 decimals are fine
    ['0', 'EUR', 0],
    ['1000', 'DZD', 100000],
    ['375,375', 'DZD', 37537500],
    ['1000.00', 'DZD', 100000],
  ] as const)('%s %s → %i', (input, currency, expected) => {
    expect(parseAmount(input, currency)).toBe(expected);
  });

  it.each([
    ['', 'EUR', /Enter amount/],
    ['abc', 'EUR', /not a valid amount/],
    ['-5', 'EUR', /not a valid amount/],
    ['+5', 'EUR', /not a valid amount/],
    ['1e3', 'EUR', /not a valid amount/],
    ['1,36', 'EUR', /not a valid amount/],
    ['1,2345', 'EUR', /not a valid amount/],
    ['.', 'EUR', /not a valid amount/],
    ['1.2.3', 'EUR', /not a valid amount/],
    ['1.234', 'EUR', /at most 2 decimal places/],
    ['1000.5', 'DZD', /whole number/],
    ['10000000001', 'EUR', /too large/],
  ] as const)('rejects %j (%s)', (input, currency, message) => {
    expect(() => parseAmount(input, currency)).toThrow(message);
  });

  it('accepts the maximum amount exactly', () => {
    expect(parseAmount('10000000000', 'EUR')).toBe(MAX_MINOR);
  });
});

describe('parseRate / formatRate', () => {
  it.each([
    ['275', 275000],
    ['262.5', 262500],
    ['262.125', 262125],
    ['0.001', 1],
    ['1,000', 1000000],
  ])('%s → %i', (input, expected) => {
    expect(parseRate(input)).toBe(expected);
    expect(parseRate(formatRate(expected))).toBe(expected);
  });

  it.each([
    ['0', /greater than 0/],
    ['0.000', /greater than 0/],
    ['262.1234', /at most 3 decimal places/],
    ['-275', /not a valid rate/],
    ['', /Enter rate/],
    ['1000001', /too large/],
  ])('rejects %j', (input, message) => {
    expect(() => parseRate(input)).toThrow(message);
  });

  it.each([
    [275000, '275'],
    [262500, '262.5'],
    [262050, '262.05'],
    [1, '0.001'],
  ])('formats %i as %s', (milli, expected) => {
    expect(formatRate(milli)).toBe(expected);
  });
});

describe('toEurCents', () => {
  it('AC 1: 1,000 DZD at 275 is €3.64', () => {
    expect(toEurCents(parseAmount('1000', 'DZD'), 'DZD', RATE_275)).toBe(364);
  });

  it('leaves EUR untouched and ignores the rate', () => {
    expect(toEurCents(136500, 'EUR', RATE_275)).toBe(136500);
  });

  it('rounds half up at the exact .5 boundary', () => {
    // 1 DA at rate 200 = 0.5 cent → 1
    expect(toEurCents(100, 'DZD', 200_000)).toBe(1);
    // 0.5 DA at rate 100 = 0.5 cent → 1
    expect(toEurCents(50, 'DZD', 100_000)).toBe(1);
    // just under half rounds down: 49 centimes at rate 100 = 0.49 cent → 0
    expect(toEurCents(49, 'DZD', 100_000)).toBe(0);
  });

  it('handles fractional rates exactly', () => {
    // 262.5 DA per EUR: 1,050 DA = €4.00 exactly
    expect(toEurCents(105000, 'DZD', 262_500)).toBe(400);
  });

  it('matches the seed goal at 275: 8,250,000 DA = €30,000.00', () => {
    expect(toEurCents(825_000_000, 'DZD', RATE_275)).toBe(3_000_000);
  });

  it('stays exact for the largest amounts', () => {
    expect(toEurCents(MAX_MINOR, 'DZD', 1)).toBe(MAX_MINOR * 1000);
  });

  it('rejects non-integer amounts and bad rates', () => {
    expect(() => toEurCents(1.5, 'EUR', RATE_275)).toThrow(MoneyError);
    expect(() => toEurCents(100, 'DZD', 0)).toThrow(MoneyError);
    expect(() => toEurCents(100, 'DZD', 275.5)).toThrow(MoneyError);
  });
});

describe('eurToDzdCentimes', () => {
  it('converts at the given rate', () => {
    expect(eurToDzdCentimes(136500, RATE_275)).toBe(37537500); // €1,365 → 375,375 DA
    expect(eurToDzdCentimes(364, RATE_275)).toBe(100100); // €3.64 → 1,001 DA
  });

  it('handles negative values symmetrically', () => {
    expect(eurToDzdCentimes(-136500, RATE_275)).toBe(-37537500);
  });
});

describe('formatMoney', () => {
  it.each([
    [136500, 'EUR', '€1,365.00'],
    [364, 'EUR', '€3.64'],
    [5, 'EUR', '€0.05'],
    [0, 'EUR', '€0.00'],
    [300000000, 'EUR', '€3,000,000.00'],
    [-1250, 'EUR', '−€12.50'],
    [37537500, 'DZD', '375,375 DA'],
    [100000, 'DZD', '1,000 DA'],
    [100050, 'DZD', '1,001 DA'], // rounds half up to whole dinars at display time
    [100049, 'DZD', '1,000 DA'],
    [-100050, 'DZD', '−1,001 DA'],
    [0, 'DZD', '0 DA'],
  ] as const)('%i %s → %s', (minor, currency, expected) => {
    expect(formatMoney(minor, currency)).toBe(expected);
  });

  it('adds + only when signed and positive', () => {
    expect(formatMoney(1250, 'EUR', { signed: true })).toBe('+€12.50');
    expect(formatMoney(0, 'EUR', { signed: true })).toBe('€0.00');
    expect(formatMoney(-1250, 'EUR', { signed: true })).toBe('−€12.50');
  });
});

describe('formatAmountInput', () => {
  it.each([
    [136550, 'EUR', '1365.50'],
    [136500, 'EUR', '1365.00'],
    [5, 'EUR', '0.05'],
    [100000, 'DZD', '1000'],
  ] as const)('%i %s → %s and parses back', (minor, currency, expected) => {
    expect(formatAmountInput(minor, currency)).toBe(expected);
    expect(parseAmount(expected, currency)).toBe(minor);
  });
});

describe('display rules (spec §8)', () => {
  const dzdRow = { amountOriginal: 100000, currency: 'DZD' as const, amountEur: 364 };
  const eurRow = { amountOriginal: 136500, currency: 'EUR' as const, amountEur: 136500 };

  it('AC 1: a DZD row shows exactly what was typed in DZD mode', () => {
    const d = displayMinor(dzdRow, 'DZD', RATE_275);
    expect(formatMoney(d.minor, d.currency)).toBe('1,000 DA');
  });

  it('a DZD row keeps its original amount after the default rate changes', () => {
    const d = displayMinor(dzdRow, 'DZD', 300_000);
    expect(formatMoney(d.minor, d.currency)).toBe('1,000 DA');
  });

  it('a DZD row shows its stored EUR value in EUR mode', () => {
    const d = displayMinor(dzdRow, 'EUR', RATE_275);
    expect(formatMoney(d.minor, d.currency)).toBe('€3.64');
  });

  it('an EUR row in DZD mode uses the current default rate', () => {
    expect(formatMoney(displayMinor(eurRow, 'DZD', RATE_275).minor, 'DZD')).toBe('375,375 DA');
    expect(formatMoney(displayMinor(eurRow, 'DZD', 300_000).minor, 'DZD')).toBe('409,500 DA');
  });

  it('totals convert from EUR at the current rate', () => {
    expect(displayTotal(136500, 'EUR', RATE_275)).toEqual({ minor: 136500, currency: 'EUR' });
    expect(displayTotal(136500, 'DZD', RATE_275)).toEqual({ minor: 37537500, currency: 'DZD' });
  });
});

describe('sumMinor', () => {
  it('sums exactly', () => {
    expect(sumMinor([136500, 243500, 110000])).toBe(490000);
    expect(sumMinor([])).toBe(0);
  });

  it('rejects floats and overflow', () => {
    expect(() => sumMinor([1, 0.5])).toThrow(MoneyError);
    expect(() => sumMinor([Number.MAX_SAFE_INTEGER, 1])).toThrow(MoneyError);
  });

  it('avoids the classic float trap', () => {
    // 0.1 + 0.2 in cents
    expect(sumMinor([parseAmount('0.1', 'EUR'), parseAmount('0.2', 'EUR')])).toBe(
      parseAmount('0.3', 'EUR'),
    );
  });
});
