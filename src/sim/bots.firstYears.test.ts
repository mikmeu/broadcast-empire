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

// The Competition panel and Penny's e-mails (#410) only read the fields, and rivalry stays 0 before 1973 on normal.
// Counter-programming (#411) reads rivalry and move, but with rivalry reset every day no rival ever plans one, so this still holds.
describe('rival money and rivalry change nothing in the first years (#409, #411, #413)', () => {
  /** The game without the three new fields, and without the day a host was courted (#413). */
  const stripped = (s: GameState) => ({
    ...s,
    employees: s.employees.map(({ courtedOn: _courtedOn, ...rest }) => rest),
    rivals: s.rivals.map(({ money: _money, rivalry: _rivalry, move: _move, ...rest }) => rest),
  });

  it('a game with them reset every day is the same game, random numbers included', () => {
    let normal = createInitialState(2);
    let reset = createInitialState(2);
    while (normal.day < TWO_YEARS && !normal.bankrupt) {
      normal = tick(sensibleBot(normal));
      reset = tick(sensibleBot(reset));
      // Money is no longer reset (#414): rivals pay for licenses and expansion from it, so it is part of the game now.
      reset = { ...reset, rivals: reset.rivals.map((r) => ({ ...r, rivalry: 0, move: null })) };
    }
    expect(normal.rngState).toBe(reset.rngState);
    expect(stripped(reset)).toEqual(stripped(normal));
  });
});
