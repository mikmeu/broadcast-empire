// The color scheme. The stylesheet has light values on :root and dark ones
// under [data-theme='dark'], so the scheme in use is always written on the
// root element: the player's choice, or what the system uses right now.

import type { Theme } from '../persistence/settings';

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)');

/** Which scheme a setting comes down to. */
export const resolveTheme = (theme: Theme, systemIsDark: boolean): 'light' | 'dark' => (theme === 'system' ? (systemIsDark ? 'dark' : 'light') : theme);

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = resolveTheme(theme, systemDark().matches);
}

/** Keeps following the system when it switches, for as long as the setting says so. */
export function followSystemTheme(current: () => Theme): void {
  systemDark().addEventListener('change', () => applyTheme(current()));
}
