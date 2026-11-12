// What the long tests (`*.long.test.ts`) share. Not in fixtures.ts, which bots.ts imports: this one plays games.
import { toDay } from './calendar';
import { createInitialState } from './newGame';
import type { Bot } from './bots';
import type { GameState } from './state';
import { tick } from './tick';

/**
 * Plays to 2030 and returns the most cash the company ever held, in years of its revenue (after the first two years).
 * `watch` sees every day as it is played: the game before the day and after it.
 */
export function mostCash(bot: Bot, seed: number, watch?: (before: GameState, after: GameState) => void): { state: GameState; years: number } {
  let s = createInitialState(seed);
  let years = 0;
  const end = toDay(2030, 1, 1);
  while (s.day < end && !s.bankrupt) {
    const before = s;
    s = tick(bot(s));
    watch?.(before, s);
    if (s.day % 30 !== 0 || s.monthlyReports.length < 24) continue;
    const revenue = s.monthlyReports.slice(-12).reduce((sum, r) => sum + r.revenue, 0);
    years = Math.max(years, s.money / revenue);
  }
  return { state: s, years };
}
