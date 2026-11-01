import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Currency } from '@cairn/shared';
import { safeStorage } from './storage';

const KEY = 'cairn.displayCurrency';

interface Prefs {
  displayCurrency: Currency;
  setDisplayCurrency: (c: Currency) => void;
  toggleDisplayCurrency: () => void;
}

const PrefsContext = createContext<Prefs | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [displayCurrency, setState] = useState<Currency>(() =>
    safeStorage.get(KEY) === 'DZD' ? 'DZD' : 'EUR',
  );
  const setDisplayCurrency = useCallback((c: Currency) => {
    setState(c);
    safeStorage.set(KEY, c);
  }, []);
  const value = useMemo(
    () => ({
      displayCurrency,
      setDisplayCurrency,
      toggleDisplayCurrency: () => setDisplayCurrency(displayCurrency === 'EUR' ? 'DZD' : 'EUR'),
    }),
    [displayCurrency, setDisplayCurrency],
  );
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): Prefs {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs outside PrefsProvider');
  return ctx;
}
