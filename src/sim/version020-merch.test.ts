import { describe, expect, it } from 'vitest';
import { DAYS_PER_YEAR, MERCH } from '../config/balance';
import { awardFans, growFans, hasMerchandiseDeal, merchandiseFor, merchandiseShare, qualityCurve, sellMerchandise } from './merchandise';
import { outlook } from './economy';
import { createInitialState } from './newGame';
import type { Desks } from './office';
import { fromSaveFile, SAVE_VERSION, toSaveFile } from './save';
import { PLAYER, type DayResult, type GameState, type Show } from './state';

/** A game with one show of `genre`, and a salesperson, written straight into the state: the rules count them, not where they stand. */
function game(genre: Show['genre'], fans: number): { s: GameState; show: Show; desked: Desks } {
  const s = createInitialState(1);
  s.unlocked = ['merchandise'];
  const show: Show = { id: 'sh1', name: 'Test', genre, hostId: null, staffIds: [], writerIds: [], editorIds: [], studioId: null, freshness: 1, tone: 'normal', fans };
  s.shows = [show];
  const seller = { ...structuredClone(s.employees[0]!), id: 'seller', role: 'sales' as const };
  s.employees = [seller];
  return { s, show, desked: new Map([['seller', {} as never]]) as Desks };
}

/** A day on which the player's show earned `revenue` at `quality`; `titleId` for a bought title. */
function dayOf(state: GameState, showId: string | null, revenue: number, quality = 1, titleId: string | null = null): DayResult {
  return {
    day: state.day,
    channels: [{ channelId: 'ch1', name: 'Test', onAir: true, ownerId: PLAYER, isPlayer: true, medium: 'tv', slots: [{ showId, titleId, programName: 'Test', quality, listeners: 1_000, share: 0.1, revenue }], regionListeners: {}, audienceListeners: {}, revenue } as DayResult['channels'][number]],
  };
}

describe('merchandise (R118)', () => {
  it('kids shows and sitcoms sell most, every other show of your own a little, a bought title nothing', () => {
    expect(merchandiseShare({ genre: 'kids' })).toBe(MERCH.share.kids);
    expect(merchandiseShare({ genre: 'sitcom' })).toBe(MERCH.share.sitcom);
    expect(merchandiseShare({ genre: 'tvNews' })).toBe(MERCH.mediumShare.tv);
    expect(merchandiseShare({ genre: 'top40' })).toBe(MERCH.mediumShare.radio);
    expect(merchandiseShare({ genre: 'cartoons' })).toBe(0);
    expect(merchandiseShare({ genre: 'movies' })).toBe(0);
  });

  it('nothing sells below the least quality, and the share rises evenly to full at 1', () => {
    expect(qualityCurve(MERCH.minQuality)).toBe(0);
    expect(qualityCurve(0.1)).toBe(0);
    expect(qualityCurve(1)).toBe(1);
    expect(qualityCurve((1 + MERCH.minQuality) / 2)).toBeCloseTo(0.5);
  });

  it('pays the share of the slot’s revenue, on top of it, times quality and fans', () => {
    const { s, show, desked } = game('kids', 0.5);
    const [money, revenue] = [s.money, s.ledger.revenue];
    const result = dayOf(s, show.id, 1_000, 1);
    sellMerchandise(s, result, desked);
    const expected = 1_000 * 0.2 * 0.5;
    expect(s.ledger.merchandise).toBeCloseTo(expected);
    expect(s.money - money).toBeCloseTo(expected);
    expect(s.ledger.revenue - revenue).toBeCloseTo(expected);
    expect(result.channels[0]!.slots[0]!.merchandise).toBeCloseTo(expected);
    expect(merchandiseFor(show, { revenue: 1_000, quality: 1 })).toBeCloseTo(expected);
  });

  it('is told once, when a show first sells', () => {
    const { s, show, desked } = game('sitcom', 0.5);
    sellMerchandise(s, dayOf(s, show.id, 1_000), desked);
    sellMerchandise(s, dayOf(s, show.id, 1_000), desked);
    expect(s.messages.filter((m) => /Merchandise from “Test”/.test(m.text))).toHaveLength(1);
  });

  it('pays nothing for a bought title or without a salesperson at a desk', () => {
    const bought = game('cartoons', 1);
    sellMerchandise(bought.s, dayOf(bought.s, bought.show.id, 1_000, 1, 't1'), bought.desked);
    expect(bought.s.ledger.merchandise).toBe(0);

    const { s, show } = game('kids', 1);
    expect(hasMerchandiseDeal(s, new Map())).toBe(false);
    sellMerchandise(s, dayOf(s, show.id, 1_000), new Map());
    expect(s.ledger.merchandise).toBe(0);
  });

  it('fans rise towards the quality while the show airs, and fade off the air', () => {
    const { s, show } = game('kids', 0);
    growFans(s, dayOf(s, show.id, 1_000, 0.8));
    expect(show.fans).toBeCloseTo(0.8 * MERCH.grow);
    show.fans = 0.5;
    growFans(s, dayOf(s, null, 0, 0));
    expect(show.fans).toBeCloseTo(0.5 - MERCH.fade);
    show.fans = 0.001;
    growFans(s, dayOf(s, null, 0, 0));
    expect(show.fans).toBe(0);
    // A few months on the air and most of the way there.
    show.fans = 0;
    for (let day = 0; day < 120; day++) growFans(s, dayOf(s, show.id, 1_000, 0.8));
    expect(show.fans).toBeGreaterThan(0.8 * 0.6);
    expect(show.fans).toBeLessThan(0.8);
  });

  it('an award brings fans, up to all of them', () => {
    const { s, show } = game('sitcom', 0.5);
    awardFans(s, show.id, 'nomination');
    expect(show.fans).toBeCloseTo(0.5 +MERCH.awardFans.nomination);
    awardFans(s, show.id, 'win');
    awardFans(s, show.id, 'win');
    expect(show.fans).toBe(1);
    awardFans(s, 'nobody', 'win');
  });

  it('the month ahead counts yesterday’s sales, the same as the books', () => {
    const { s, show, desked } = game('kids', 1);
    const result = dayOf(s, show.id, 1_000, 1);
    sellMerchandise(s, result, desked);
    s.lastDay = result;
    const ahead = outlook(s);
    expect(ahead.merchandise).toBeCloseTo(s.ledger.merchandise * (DAYS_PER_YEAR / 12));
    expect(ahead.income).toBeCloseTo((1_000 + s.ledger.merchandise) * (DAYS_PER_YEAR / 12));
  });

  describe('the save', () => {
    it('loads a save of version 53: fans from the last quality, and a clean line in the books', () => {
      const { s, show } = game('kids', 0);
      s.lastDay = dayOf(s, show.id, 1_000, 0.8);
      s.monthlyReports = [{ ...s.ledger, year: 1970, month: 1, net: 0, balance: 0 }];
      const file = JSON.parse(JSON.stringify(toSaveFile(s, 0)));
      delete file.state.ledger.merchandise;
      delete file.state.monthlyReports[0].merchandise;
      delete file.state.shows[0].fans;
      const loaded = fromSaveFile({ ...file, version: 53 });
      expect(loaded.version).toBe(SAVE_VERSION);
      expect(SAVE_VERSION).toBeGreaterThanOrEqual(54);
      expect(loaded.state.shows[0]!.fans).toBeCloseTo(0.4);
      expect(loaded.state.ledger.merchandise).toBe(0);
      expect(loaded.state.monthlyReports[0]!.merchandise).toBe(0);
    });
  });
});
