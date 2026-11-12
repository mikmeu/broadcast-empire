import { describe, expect, it } from 'vitest';
import { SPORTS_RIGHTS } from '../config/balance';
import { GENRES, getGenre } from '../config/genres';
import { rightsBonus, talksOnly } from './broadcast';
import { createInitialState } from './newGame';
import type { GameState } from './state';

describe('version 0.10.0', () => {
  describe('a sports show without rights (R63)', () => {
    it('talks about sport and draws less; rights for the season show the games', () => {
      const s = createInitialState(1);
      const sports = getGenre('tvSports');
      expect(talksOnly(s, sports)).toBe(true);
      expect(rightsBonus(s, sports)).toBe(SPORTS_RIGHTS.talkOnly);
      // Any rights are better than none.
      expect(SPORTS_RIGHTS.talkOnly).toBeLessThan(SPORTS_RIGHTS.prestige.min);
      const held: GameState = { ...s, sportsRights: [{ id: 'x', name: 'League', prestige: 1.1, endDay: s.day + 100 }] };
      expect(talksOnly(held, sports)).toBe(false);
      expect(rightsBonus(held, sports)).toBe(1.1);
      // Radio commentary and every other genre have nothing to do with rights.
      for (const genre of GENRES.filter((g) => g.id !== 'tvSports')) expect(rightsBonus(s, genre), genre.id).toBe(1);
    });
  });
});
