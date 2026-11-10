import { describe, expect, it } from 'vitest';
import { growthBot } from './bots';
import { mostCash } from './longGames';
import { slow } from './slow';

// A long test: it runs in its own job, when a change touches game logic (see PIPELINE.md, "Testing: what runs where").

describe('Phase 5a acceptance', () => {
  it('a growing radio company never sits on more than three years of revenue, 1970–2030', () => {
    const { state, years } = mostCash(growthBot, 2);
    expect(state.bankrupt).toBe(false);
    expect(years).toBeLessThan(3);
    // Much of the spare cash now goes into events (Phase 5d) before the owners can take it.
    // The gift shop (#380) now pays about the old merchandise share, not two to three times it, so the owners get less: 8.5M measured.
    // The host who turns unsafe (#259, 0.22.0) once in this game is let go by the bot, and the owners get less: 8.7M without that host, 6.0M with.
    expect(state.dividendsPaid).toBeGreaterThan(5_000_000);
  }, slow(300_000));
});
