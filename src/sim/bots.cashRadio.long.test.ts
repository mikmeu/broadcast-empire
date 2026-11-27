import { describe, expect, it } from 'vitest';
import { growthBot } from './bots';
import { mostCash, profit2010s } from './longGames';
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
    // Aimed poaching (#413): the bot matches every offer at the top premium, so host salaries rise and the owners get less: 4.6M measured.
    // The growers open a third station (#458), which pays the company more but leaves less to the owners in the meantime: 3.4M measured.
    expect(state.dividendsPaid).toBeGreaterThan(3_000_000);
    // The late game (#444): a company that grew in 1970 and runs as it always did stays in the black in the 2010s. Measured on seeds 1, 2, 3
    // and 42 (growth and network, 0.23.0): +€0.2 to +€3.1 million a year on average, with revenue 15 to 50% above the 1990s and salaries flat.
    expect(profit2010s(state)).toBeGreaterThan(0);
  }, slow(300_000));
});
