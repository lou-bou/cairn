import { useEffect, useState } from 'react';

/**
 * Read resolved token values for things that can't use CSS directly (chart libraries, canvas
 * confetti). Re-reads when data-theme or data-scheme changes.
 */
export function readToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function useTokens<K extends string>(names: readonly K[]): Record<K, string> {
  const read = () => Object.fromEntries(names.map((n) => [n, readToken(n)])) as Record<K, string>;
  const [values, setValues] = useState(read);
  const key = names.join('|');

  useEffect(() => {
    const update = () => setValues(read());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-scheme'],
    });
    update();
    return () => {
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return values;
}
