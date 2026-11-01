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
