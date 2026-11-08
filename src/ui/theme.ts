// The color scheme. The stylesheet has light values on :root and dark ones
// under [data-theme='dark'], so the scheme in use is always written on the
// root element: the player's choice, or by default the time of day on the
// office clock of the game that is open (0.15.0).

import type { Theme } from '../persistence/settings';
import { hourAt, toCalendarDate } from '../sim/calendar';

/**
 * Sunrise and sunset on the office clock in each month, January first, in
 * hours. The office day runs from 8 in the morning to 10 at night over a
 * month (OFFICE_DAY), so in summer it never gets dark, and in winter it is
 * dark from the late afternoon and, in December, for a while after eight in
 * the morning. January's sun is up at eight, so a new game opens in the light (0.16.0).
 */
export const DAYLIGHT: readonly (readonly [rise: number, set: number])[] = [
  [8, 16.75], [8, 17.75], [7, 18.75], [7, 20.5], [6, 21.25], [5.5, 22],
  [5.75, 21.75], [6.5, 21], [7.25, 20], [8, 18.75], [8, 17], [8.75, 16.5],
];

/** Whether it is dark outside the office on a day of the game: before sunrise or after sunset on its clock. */
export function isNight(day: number): boolean {
  const hour = hourAt(day);
  const [rise, set] = DAYLIGHT[toCalendarDate(day).month - 1]!;
  return hour < rise || hour >= set;
}

/** Which scheme a setting comes down to on a day of the game; with no game open, the time of day is light. */
export const resolveTheme = (theme: Theme, day: number | null): 'light' | 'dark' => (theme === 'clock' ? (day !== null && isNight(day) ? 'dark' : 'light') : theme);

/** With the system's cursor on, the root element says so, and the stylesheet gives every cursor variable its plain keyword (0.21.0, #311). */
export function applyCursors(system: boolean): void {
  if (system) document.documentElement.dataset.cursors = 'system';
  else delete document.documentElement.dataset.cursors;
}

export function applyTheme(theme: Theme, day: number | null): void {
  const scheme = resolveTheme(theme, day);
  if (document.documentElement.dataset.theme !== scheme) document.documentElement.dataset.theme = scheme;
}
