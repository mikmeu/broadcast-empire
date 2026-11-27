import { describe, expect, it } from 'vitest';
import { networkBot } from './bots';
import { mostCash, profit2010s } from './longGames';
import { slow } from './slow';

// A long test: it runs in its own job, when a change touches game logic (see PIPELINE.md, "Testing: what runs where").

describe('the late game (#444)', () => {
  it('the network player, seed 2, reaches 2030 and earns in the 2010s', () => {
    // Before 0.23.0 this game went bankrupt on day 18017. Measured on seeds 1, 2, 3 and 42 (growth and network): all eight reach 2030,
    // with +€0.2 to +€3.1 million a year on average in the 2010s; revenue is 15 to 50% above the 1990s and salaries are flat.
    const { state } = mostCash(networkBot, 2);
    expect(state.bankrupt).toBe(false);
    expect(profit2010s(state)).toBeGreaterThan(0);
  }, slow(450_000));
});
