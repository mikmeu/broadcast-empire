import { describe, expect, it } from 'vitest';
import { RIVAL_DIFFICULTY, RIVAL_ERA, RIVAL_QUALITY_CAP, type Difficulty, DIFFICULTIES, DIFFICULTY_COSTS, STARTING_MONEY } from '../config/balance';
import { sensibleBot } from './bots';
import { toDay } from './calendar';
import { generateRivalShow, rivalEraQuality, rivalStrength, generateCandidates } from './generate';
import { createInitialState } from './newGame';
import { Rng } from './rng';
import type { GameState } from './state';
import { titlePrice } from './actions';
import { salaryFor } from './economy';
import { licenseMonthly, licensePrice } from './licenses';
import { monthlyRent } from './office';

/** The sensible bot's station on a date. */
function station(year = 1970, month = 1, dayOfMonth = 1): GameState {
  const s = structuredClone(sensibleBot(createInitialState(1)));
  s.day = toDay(year, month, dayOfMonth);
  return s;
}

const rivalQuality = (s: GameState) => {
  const shows = s.rivals.flatMap((r) => r.channels).flatMap((c) => c.schedule);
  return shows.reduce((sum, x) => sum + x.quality, 0) / shows.length;
};

describe('difficulty', () => {
  it('is normal by default and scales every rival show', () => {
    expect(createInitialState(1).difficulty).toBe('normal');
    const quality = (d: Difficulty) => rivalQuality(createInitialState(1, d));
    expect(quality('easy') / quality('normal')).toBeCloseTo(RIVAL_DIFFICULTY.easy / RIVAL_DIFFICULTY.normal);
    expect(quality('hard') / quality('normal')).toBeCloseTo(RIVAL_DIFFICULTY.hard / RIVAL_DIFFICULTY.normal);
  });

  it('rivals keep pace with the decades, up to a cap', () => {
    expect(rivalEraQuality(2000)).toBeCloseTo(1 + 30 * RIVAL_ERA.perYear);
    expect(rivalEraQuality(2100)).toBe(RIVAL_ERA.max);
    const s = station(1990);
    expect(rivalStrength(s)).toBeCloseTo(RIVAL_DIFFICULTY.normal * rivalEraQuality(1990));
    expect(generateRivalShow(new Rng(1), 'highbrow', 'news', [], 5).quality).toBe(RIVAL_QUALITY_CAP);
  });
});

// From version012.
describe('version 0.12.0: balance (R85)', () => {
  describe('the difficulty sets what things cost', () => {
    it('starting money, rent, licenses, salaries and titles follow the difficulty', () => {
      for (const difficulty of DIFFICULTIES) {
        const game = { day: 0, difficulty };
        const factor = DIFFICULTY_COSTS[difficulty];
        expect(createInitialState(1, difficulty).money).toBe(STARTING_MONEY[difficulty]);
        expect(monthlyRent({ w: 6, h: 5 }, game)).toBe(Math.round((monthlyRent({ w: 6, h: 5 }, { difficulty: 'normal' }) * factor) / 10) * 10);
        expect(licensePrice('tv', 'capital', game)).toBeCloseTo(licensePrice('tv', 'capital', { day: 0, difficulty: 'normal' }) * factor, -3);
        expect(licenseMonthly('radio', 'north', game)).toBeCloseTo(licenseMonthly('radio', 'north', { day: 0, difficulty: 'normal' }) * factor, -2);
        expect(salaryFor('production', 60, 0, game)).toBeCloseTo(salaryFor('production', 60, 0, { difficulty: 'normal' }) * factor, -2);
        expect(titlePrice(createInitialState(1, difficulty), 10_000)).toBe(10_000 * factor);
      }
      expect(STARTING_MONEY.easy).toBeGreaterThan(STARTING_MONEY.normal);
      expect(STARTING_MONEY.hard).toBeLessThan(STARTING_MONEY.normal);
    });

    it('the hiring pool asks less on easy', () => {
      const pool = (difficulty: GameState['difficulty']) => {
        const s = createInitialState(1, difficulty);
        generateCandidates(s, new Rng(7), 1970);
        return s.candidates;
      };
      const easy = pool('easy');
      const normal = pool('normal');
      expect(easy.map((c) => c.skill)).toEqual(normal.map((c) => c.skill));
      easy.forEach((c, i) => expect(c.salary).toBeLessThan(normal[i]!.salary));
    });
  });
});
