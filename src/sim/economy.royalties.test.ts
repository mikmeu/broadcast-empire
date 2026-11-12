import { describe, expect, it } from 'vitest';
import { DAYS_PER_YEAR, DECOR, DIFFICULTY_COSTS, ROYALTIES } from '../config/balance';
import { FURNITURE, STUDIO_REQUIREMENTS } from '../config/office';
import { ARTICLES } from '../wiki/articles';
import type { ActionResult } from './actions';
import { showQuality } from './broadcast';
import { sensibleBot } from './bots';
import { dailyRoyalties, monthlyNet, outlook, payRoyalties, royaltyShare, RUNNING_COSTS } from './economy';
import { autoPlaceFurniture } from './fixtures';
import { createInitialState } from './newGame';
import { fromSaveFile, SAVE_VERSION, toSaveFile } from './save';
import { emptyLedger, type DayResult, type GameState, type Show } from './state';
import { advance, tick } from './tick';
import { unlockAll } from './unlocks';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}

/** A radio station from the sensible test player, a month on the air, with everything open, money to spare and two floors. */
const station = (days = 30): GameState => {
  const s = structuredClone(unlockAll(advance(sensibleBot(createInitialState(1)), days)));
  s.money = 5_000_000;
  s.floorsUnlocked = 2;
  return s;
};

describe('version 0.18.0', () => {
  describe('music royalties (R119)', () => {
    /** The station with its first show made in a radio studio turned into a show of `genre`. */
    function withGenre(state: GameState, genre: Show['genre']): { s: GameState; show: Show } {
      const s = structuredClone(state);
      const show = s.shows.find((x) => s.rooms.find((r) => r.roomId === x.studioId)?.type === 'radioStudio')!;
      show.genre = genre;
      return { s, show };
    }

    /** A day on which every slot of the player's channels earned `revenue`, aired by `showId`. */
    function dayOf(state: GameState, showId: string, revenue: number): DayResult {
      return {
        day: state.day,
        channels: [{ ...state.lastDay!.channels.find((c) => c.isPlayer)!, slots: [{ showId, titleId: null, programName: 'Test', quality: 0.5, listeners: 1_000, share: 0.1, revenue }] }],
      };
    }

    it('a music show pays its share of what its slot earned', () => {
      for (const genre of ['top40', 'rock', 'classical'] as const) {
        const { s, show } = withGenre(station(), genre);
        const [money, paid] = [s.money, s.ledger.royalties];
        payRoyalties(s, dayOf(s, show.id, 1_000));
        expect(s.ledger.royalties - paid).toBeCloseTo(1_000 * ROYALTIES.share * DIFFICULTY_COSTS[s.difficulty]);
        expect(money - s.money).toBeCloseTo(s.ledger.royalties - paid);
      }
    });

    it('the morning show, talk and news pay none', () => {
      for (const genre of ['morningShow', 'talk', 'news'] as const) {
        const { s, show } = withGenre(station(), genre);
        const [money, paid] = [s.money, s.ledger.royalties];
        payRoyalties(s, dayOf(s, show.id, 1_000));
        expect(s.ledger.royalties).toBe(paid);
        expect(s.money).toBe(money);
        expect(royaltyShare(s, genre)).toBe(0);
      }
    });

    it('the difficulty scales the share', () => {
      expect(royaltyShare({ difficulty: 'easy' }, 'top40')).toBeCloseTo(ROYALTIES.share * DIFFICULTY_COSTS.easy);
      expect(royaltyShare({ difficulty: 'normal' }, 'top40')).toBeCloseTo(ROYALTIES.share);
      expect(royaltyShare({ difficulty: 'hard' }, 'top40')).toBeCloseTo(ROYALTIES.share * DIFFICULTY_COSTS.hard);
    });

    it('is a running cost, paid every day the music is on, and the month ahead counts it', () => {
      expect(RUNNING_COSTS).toContain('royalties');
      const ledger = { ...emptyLedger(), revenue: 1_000, royalties: 60 };
      expect(monthlyNet(ledger)).toBe(940);
      // The sensible player's station plays music: its first month's report has paid royalties.
      const { s } = withGenre(advance(station(), 2), 'top40');
      expect(s.monthlyReports.at(-1)!.royalties).toBeGreaterThan(0);
      const next = tick(s);
      expect(next.ledger.royalties).toBeGreaterThan(s.ledger.royalties);
      const ahead = outlook(next);
      expect(ahead.royalties).toBeGreaterThan(0);
      expect(ahead.royalties).toBeCloseTo(next.channels.reduce((sum, c) => sum + dailyRoyalties(next, c.schedule), 0) * (DAYS_PER_YEAR / 12), 0);
    });

    it('the wiki explains them', () => {
      expect(JSON.stringify(ARTICLES.find((a) => a.id === 'money'))).toMatch(/Music royalties/);
    });

    describe('record shelves', () => {
      it('stand in a radio studio, and are not on its checklist', () => {
        expect(FURNITURE.recordShelves).toMatchObject({ w: 2, h: 1, rooms: ['radioStudio'], durable: true });
        expect(STUDIO_REQUIREMENTS.radioStudio).not.toHaveProperty('recordShelves');
      });

      it('make a Top 40 show in their studio better, and a morning show not', () => {
        const { s: music, show } = withGenre(station(), 'top40');
        const before = showQuality(music, show);
        expect(before.records).toBe(1);
        const shelved = ok(autoPlaceFurniture(music, show.studioId!, 'recordShelves'));
        const after = showQuality(shelved, show);
        expect(after.records).toBe(1 + DECOR.recordShelves);
        expect(after.quality).toBeCloseTo(before.quality * (1 + DECOR.recordShelves));
        // A second set adds nothing.
        const twice = autoPlaceFurniture(shelved, show.studioId!, 'recordShelves');
        if (twice.ok) expect(showQuality(twice.state, show).records).toBe(1 + DECOR.recordShelves);

        const morning = { ...show, genre: 'morningShow' as const };
        expect(showQuality(shelved, morning).records).toBe(1);
      });
    });

    it('a game saved before them loads with no royalties paid yet', () => {
      const s = advance(station(), 40);
      const save = JSON.parse(JSON.stringify(toSaveFile(s, 0)));
      delete save.state.ledger.royalties;
      for (const report of save.state.monthlyReports) delete report.royalties;
      // Save version 36 is that of the streaming service (R74), which came before them in 0.18.0.
      const { state, version } = fromSaveFile({ ...save, version: 41 });
      expect(version).toBe(SAVE_VERSION);
      expect(SAVE_VERSION).toBeGreaterThanOrEqual(42);
      expect(state.ledger.royalties).toBe(0);
      expect(state.monthlyReports.length).toBeGreaterThan(0);
      for (const report of state.monthlyReports) expect(report.royalties).toBe(0);
    });
  });
});
