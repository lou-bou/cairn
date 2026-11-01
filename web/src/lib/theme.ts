import { DEFAULT_THEME, findTheme } from '../themes/registry';
import { safeStorage } from './storage';

const KEY = 'cairn.theme';

/** Apply a theme by id: load its stylesheet if needed and set data-theme on <html>. */
export async function applyTheme(id: string): Promise<void> {
  const theme = findTheme(id) ?? findTheme(DEFAULT_THEME)!;
  await theme.load?.();
  document.documentElement.dataset.theme = theme.id;
  safeStorage.set(KEY, theme.id);
}

/** Startup: ?theme=<id> wins (handy for testing), then the saved choice, then the default. */
export function initTheme(): Promise<void> {
  const fromUrl = new URLSearchParams(window.location.search).get('theme');
  const id = (fromUrl && findTheme(fromUrl)?.id) ?? safeStorage.get(KEY) ?? DEFAULT_THEME;
  return applyTheme(id);
}

export function currentTheme(): string {
  return document.documentElement.dataset.theme ?? DEFAULT_THEME;
}

export type Scheme = 'system' | 'light' | 'dark';
const SCHEME_KEY = 'cairn.scheme';
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

export function savedScheme(): Scheme {
  const v = safeStorage.get(SCHEME_KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

/** Resolve the Appearance setting to data-scheme on <html>, and match the browser chrome to it. */
function resolveScheme(): void {
  const pref = savedScheme();
  const dark = pref === 'dark' || (pref === 'system' && darkQuery.matches);
  document.documentElement.dataset.scheme = dark ? 'dark' : 'light';
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim();
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  metas.forEach((m, i) => {
    if (i > 0) m.remove();
    else if (bg) {
      m.removeAttribute('media');
      m.content = bg;
    }
  });
}

export function applyScheme(pref: Scheme): void {
  if (pref === 'system') safeStorage.remove(SCHEME_KEY);
  else safeStorage.set(SCHEME_KEY, pref);
  resolveScheme();
}

/** Startup: resolve once and follow OS changes while on System. */
export function initScheme(): void {
  resolveScheme();
  darkQuery.addEventListener('change', resolveScheme);
}
