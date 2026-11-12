import { describe, expect, it } from 'vitest';
import { OPENING_SHOWS, CLERK_CANDIDATES, COOK_CANDIDATES, ENGINEER_CANDIDATES } from '../config/balance';
import { getGenre } from '../config/genres';
import { sensibleBot, type Bot } from './bots';
import { createInitialState } from './newGame';
import type { GameState } from './state';
import { tick } from './tick';
import { generateCandidates } from './generate';
import { Rng } from './rng';

/** The sensible bot's company after a number of days. */
function company(days: number, seed = 1, bot: Bot = sensibleBot): GameState {
  let s = createInitialState(seed);
  for (let day = 0; day < days; day++) s = tick(bot(s));
  return s;
}

describe('version 0.10.0', () => {
  describe('the first hiring pool (R41)', () => {
    it('has a host for each of the five shows Penny plans, in every new game', () => {
      for (let seed = 1; seed <= 25; seed++) {
        const hosts = createInitialState(seed).candidates.filter((c) => c.role === 'host');
        const left = [...hosts];
        for (const genre of OPENING_SHOWS) {
          const at = left.findIndex((h) => h.specialties[0] === genre);
          expect(at, `seed ${seed}: no host left for ${genre}`).toBeGreaterThanOrEqual(0);
          left.splice(at, 1);
        }
        // Nobody has the same specialty twice, or more than two.
        for (const host of hosts) expect(new Set(host.specialties).size, `seed ${seed}`).toBe(host.specialties.length);
        for (const host of hosts) expect(host.specialties.length, `seed ${seed}`).toBeLessThanOrEqual(2);
      }
    });

    it('later pools are left to chance', () => {
      const pools = Array.from({ length: 12 }, (_, seed) => company(31, seed + 1).candidates.filter((c) => c.role === 'host' && getGenre(c.specialties[0]!).medium === 'radio'));
      const fits = (pool: GameState['candidates']) => OPENING_SHOWS.every((genre, i) => pool[i]?.specialties[0] === genre);
      expect(pools.some((pool) => !fits(pool))).toBe(true);
    });
  });
});

// From version015.
describe('version 0.15.0', () => {
  it('brings audio engineers, cooks and clerks into the hiring pool', () => {
    const s = createInitialState(1);
    const pool = generateCandidates(s, new Rng(7), 1980);
    expect(pool.filter((p) => p.role === 'engineer')).toHaveLength(ENGINEER_CANDIDATES);
    expect(pool.filter((p) => p.role === 'cook')).toHaveLength(COOK_CANDIDATES);
    expect(pool.filter((p) => p.role === 'clerk')).toHaveLength(CLERK_CANDIDATES);
    expect(new Set(pool.map((p) => p.id)).size).toBe(pool.length);
  });
});
