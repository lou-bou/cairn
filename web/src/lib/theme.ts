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
