// Phase 1 acceptance criteria (prompt.md section 14): a sensible strategy is
// profitable within 6 months, a neglectful one goes bankrupt, and the game can
// be played from January 1970 to December 1971.

import { describe, expect, it } from 'vitest';
import { neglectfulBot, sensibleBot, type Bot } from './bots';
import { createInitialState } from './newGame';
import type { GameState } from './state';
import { tick } from './tick';

const TWO_YEARS = 365 + 365;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

function play(bot: Bot, seed: number, days = TWO_YEARS): GameState {
  let state = createInitialState(seed);
  while (state.day < days && !state.bankrupt) state = tick(bot(state));
  return state;
}

describe('Phase 1 acceptance', () => {
  it.each(SEEDS)('sensible play is profitable within 6 months and survives 1970–1971 (seed %i)', (seed) => {
    const state = play(sensibleBot, seed);
    expect(state.bankrupt).toBe(false);
    expect(state.day).toBe(TWO_YEARS);
    const firstProfit = state.monthlyReports.findIndex((r) => r.net > 0);
    expect(firstProfit).toBeGreaterThanOrEqual(0);
    expect(firstProfit).toBeLessThan(6);
  });

  it.each(SEEDS)('neglectful play goes bankrupt (seed %i)', (seed) => {
    expect(play(neglectfulBot, seed).bankrupt).toBe(true);
  });

  it('is deterministic for the same seed and decisions', () => {
    expect(play(sensibleBot, 3, 120)).toEqual(play(sensibleBot, 3, 120));
  });
});
