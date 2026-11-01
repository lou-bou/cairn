import {
  displayMinor,
  displayTotal,
  formatMoney,
  type Currency,
  type FormatOptions,
  type StoredAmount,
} from '@cairn/shared';
import { useSettings } from '../api/hooks';
import { usePrefs } from './prefs';

const FALLBACK_RATE = 275_000;

/** Money formatting bound to the device's display currency and the current default rate (spec §8). */
export function useMoney() {
  const { displayCurrency } = usePrefs();
  const { data: settings } = useSettings();
  const rate = settings?.defaultRate ?? FALLBACK_RATE;

  return {
    displayCurrency,
    rate,
    /** A computed EUR total (balance, sums). */
    total(eurCents: number, opts?: FormatOptions): string {
      const d = displayTotal(eurCents, displayCurrency, rate);
      return formatMoney(d.minor, d.currency, opts);
    },
    /** A stored record: DZD-entered rows show their original DZD amount in DZD mode. */
    record(r: StoredAmount, opts?: FormatOptions): string {
      const d = displayMinor(r, displayCurrency, rate);
      return formatMoney(d.minor, d.currency, opts);
    },
    original(minor: number, currency: Currency): string {
      return formatMoney(minor, currency);
    },
  };
}

/** Short axis labels in display units: 250000 cents → "€2.5K", 37537500 centimes → "375K DA". */
export function formatCompact(minor: number, currency: Currency): string {
  const units = BigInt(Math.round(minor)) / 100n;
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const step = (div: bigint, suffix: string) => {
    const tenths = (abs * 10n + div / 2n) / div;
    const whole = tenths / 10n;
    const frac = tenths % 10n;
    return `${whole}${frac && whole < 100n ? `.${frac}` : ''}${suffix}`;
  };
  const body =
    abs >= 1_000_000n ? step(1_000_000n, 'M') : abs >= 1000n ? step(1000n, 'K') : abs.toString();
  const sign = negative ? '−' : '';
  return currency === 'EUR' ? `${sign}€${body}` : `${sign}${body} DA`;
}
