import { describe, expect, it } from 'vitest';
import { isMarketLeader } from './broadcast';
import { growthBot, sensibleBot, type Bot } from './bots';
import { createInitialState } from './newGame';
import { slow } from './slow';
import type { GameState } from './state';
import { tick } from './tick';

// A long test: it runs in its own job, when a change touches game logic (see PIPELINE.md, "Testing: what runs where").

// --- Phase 2 acceptance (prompt.md section 14) ---

const TEN_YEARS = Math.round(10 * 365.25);

/** Plays up to ten years; returns the day the player first led the weekly ratings (or null). */
function firstLead(bot: Bot, seed: number): { state: GameState; firstLeadDay: number | null } {
  let state = createInitialState(seed);
  let firstLeadDay: number | null = null;
  while (state.day < TEN_YEARS && !state.bankrupt && firstLeadDay === null) {
    const previous = state.weeklyReports.at(-1)?.fromDay;
    state = tick(bot(state));
    const latest = state.weeklyReports.at(-1);
    if (latest && latest.fromDay !== previous && isMarketLeader(latest, 'radio')) firstLeadDay = state.day;
  }
  return { state, firstLeadDay };
}

describe('Phase 2 acceptance', () => {
  it.each([1, 2, 3])('growing across regions and channels makes the player market leader (seed %i)', (seed) => {
    const { state, firstLeadDay } = firstLead(growthBot, seed);
    expect(state.bankrupt).toBe(false);
    expect(firstLeadDay).not.toBeNull();
    // Not trivial: it takes five months at the least.
    expect(firstLeadDay!).toBeGreaterThan(150);
  }, slow(30_000));

  it.each([1, 2, 3])('a single channel in the Capital never leads the market (seed %i)', (seed) => {
    expect(firstLead(sensibleBot, seed).firstLeadDay).toBeNull();
  }, slow(30_000));
});
