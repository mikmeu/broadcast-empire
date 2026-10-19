import { describe, expect, it } from 'vitest';
import { DAYS_PER_YEAR, DECOR, DIFFICULTY_COSTS, ROYALTIES } from '../config/balance';
import { FURNITURE, STUDIO_REQUIREMENTS } from '../config/office';
import { autoPlaceFurniture, type ActionResult } from './actions';
import { sensibleBot } from './bots';
import { showQuality } from './broadcast';
import { RUNNING_COSTS, dailyRoyalties, monthlyNet, outlook, payRoyalties, royaltyShare } from './economy';
import { createInitialState } from './newGame';
import { SAVE_VERSION, fromSaveFile, toSaveFile } from './save';
import { emptyLedger, type DayResult, type GameState, type Show } from './state';
import { advance, tick } from './tick';
import { unlockAll } from './unlocks';
import { ARTICLES } from '../wiki/articles';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** A radio station from the sensible test player, a month on the air, with everything open and money to spare. */
const station = (): GameState => {
  const s = structuredClone(unlockAll(advance(sensibleBot(createInitialState(1)), 30)));
  s.money = 5_000_000;
  return s;
};

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

describe('0.18.0', () => {
  describe('music royalties (R119)', () => {
    it('a music show pays its share of what its slot earned', () => {
      for (const genre of ['top40', 'rock', 'classical'] as const) {
        const { s, show } = withGenre(station(), genre);
        const money = s.money;
        payRoyalties(s, dayOf(s, show.id, 1_000));
        expect(s.ledger.royalties).toBeCloseTo(1_000 * ROYALTIES.share * DIFFICULTY_COSTS[s.difficulty]);
        expect(money - s.money).toBeCloseTo(s.ledger.royalties);
      }
    });

    it('the morning show, talk and news pay none', () => {
      for (const genre of ['morningShow', 'talk', 'news'] as const) {
        const { s, show } = withGenre(station(), genre);
        payRoyalties(s, dayOf(s, show.id, 1_000));
        expect(s.ledger.royalties).toBe(0);
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
      const { s } = withGenre(station(), 'top40');
      const next = tick(s);
      expect(next.ledger.royalties).toBeGreaterThan(s.ledger.royalties);
      const ahead = outlook(next);
      expect(ahead.royalties).toBeGreaterThan(0);
      expect(ahead.royalties).toBeCloseTo(next.channels.reduce((sum, c) => sum + dailyRoyalties(next, c.schedule), 0) * (DAYS_PER_YEAR / 12), 0);
    });

    it('the wiki explains them', () => {
      expect(JSON.stringify(ARTICLES.find((a) => a.id === 'money'))).toMatch(/Music royalties/);
    });
  });

  describe('record shelves (R119)', () => {
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

  it('a game saved at version 32 loads with no royalties paid yet', () => {
    const s = advance(station(), 40);
    const save = JSON.parse(JSON.stringify(toSaveFile(s, 0)));
    delete save.state.ledger.royalties;
    for (const report of save.state.monthlyReports) delete report.royalties;
    const { state, version } = fromSaveFile({ ...save, version: 32 });
    expect(version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(33);
    expect(state.ledger.royalties).toBe(0);
    expect(state.monthlyReports.length).toBeGreaterThan(0);
    for (const report of state.monthlyReports) expect(report.royalties).toBe(0);
  });
});
