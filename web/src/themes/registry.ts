/**
 * Theme registry. Adding a theme = one token file + one entry here; no component changes.
 * The token file must define every custom property that default.css defines.
 */
import './default.css';

export interface ThemeDef {
  id: string;
  label: string;
  /** Hidden from the theme picker; still loadable with ?theme=<id> (used to verify token usage). */
  devOnly?: boolean;
  /** Optional font or token stylesheet, loaded when the theme is first applied. */
  load?: () => Promise<unknown>;
}

export const THEMES: ThemeDef[] = [
  { id: 'default', label: 'Cairn' },
  { id: 'test', label: 'Token test', devOnly: true, load: () => import('./test.css') },
];

export const DEFAULT_THEME = 'default';

/** Flip on when the Settings theme picker ships (spec §14, future feature). */
export const SHOW_THEME_PICKER = false;

/** Themes offered in the picker. */
export function availableThemes(): ThemeDef[] {
  return THEMES.filter((t) => !t.devOnly || import.meta.env.DEV);
}

export function findTheme(id: string | null | undefined): ThemeDef | undefined {
  return THEMES.find((t) => t.id === id);
}
