import { describe, expect, it } from 'vitest';
import { REGULATOR, RENEWAL } from '../config/balance';
import type { GenreId } from '../config/genres';
import { growthBot, sensibleBot, tvBot } from './bots';
import { ADULT_FROM, mayAir, pickTitles, refreshMarket } from './content';
import { costFactor } from './difficulty';
import { createInitialState } from './newGame';
import { Rng } from './rng';
import { checkNews, checkRules, decideComplaints, holderAdvantage, newRecord, recordNote, recordOf, upheldChance } from './regulator';
import { SAVE_VERSION, fromSaveFile, toSaveFile } from './save';
import type { ChannelDay, DayResult, GameState, SlotResult, Title } from './state';
import { advance, tick } from './tick';
import { employeesWithDesk } from './office';

const base = () => structuredClone(advance(sensibleBot(createInitialState(1)), 30));

const title = (id: string, genre: GenreId, adult = false): Title => ({ id, name: id, genre, quality: 0.5, airingsLeft: 10, freshness: 1, fee: 0, perAiring: 100, ...(adult && { adult: true }) });

/** A day of the player's first channel with a show of the given genre (and a title) in each slot. */
function dayWith(s: GameState, slots: { genre: GenreId; titleId?: string }[]): DayResult {
  const channel = s.channels[0]!;
  const results: SlotResult[] = slots.map((slot, i) => {
    const id = `rs${i}`;
    if (!s.shows.some((x) => x.id === id)) s.shows.push({ id, name: id, genre: slot.genre, hostId: null, staffIds: [], writerIds: [], editorIds: [], studioId: null, freshness: 1, tone: 'normal' });
    s.shows.find((x) => x.id === id)!.genre = slot.genre;
    return { showId: id, titleId: slot.titleId ?? null, programName: id, quality: 0.5, listeners: 100, share: 0.1, revenue: 1_000 };
  });
  const day: ChannelDay = { channelId: channel.id, name: channel.name, ownerId: 'player', isPlayer: true, medium: channel.medium, onAir: true, slots: results, regionListeners: { [s.licenses[0]!.regionId]: 100 }, audienceListeners: {} };
  return { day: s.day, channels: [day] };
}

describe('The broadcasting authority (0.19.0, R120)', () => {
  it('a film for adults may air only in the late-night slot', () => {
    expect(ADULT_FROM).toBe(4);
    expect(mayAir({ adult: true }, 3)).toBe(false);
    expect(mayAir({ adult: true }, 4)).toBe(true);
    expect(mayAir({}, 0)).toBe(true);
  });

  it('a film for adults in the evening draws a complaint and a fine; late at night it does not', () => {
    const s = base();
    s.library.push(title('film', 'movies', true));
    const slots = (at: number) => Array.from({ length: 5 }, (_, i) => ({ genre: 'movies' as GenreId, titleId: i === at ? 'film' : undefined }));
    checkRules(s, dayWith(s, slots(3)));
    expect(s.complaints).toHaveLength(1);
    expect(s.complaints[0]).toMatchObject({ rule: 'adult', upheld: null, decideOn: s.day + REGULATOR.decideDays });
    expect(s.complaints[0]!.fine).toBeGreaterThanOrEqual(REGULATOR.fine.min * costFactor(s) - 100);
    const late = base();
    late.library.push(title('film', 'movies', true));
    checkRules(late, dayWith(late, slots(4)));
    expect(late.complaints).toEqual([]);
  });

  it('more than one slot of teleshopping a day draws a complaint', () => {
    const one = base();
    checkRules(one, dayWith(one, [{ genre: 'teleshopping', titleId: 'a' }, { genre: 'top40' }, { genre: 'top40' }, { genre: 'top40' }, { genre: 'top40' }]));
    expect(one.complaints).toEqual([]);
    const two = base();
    checkRules(two, dayWith(two, [{ genre: 'teleshopping', titleId: 'a' }, { genre: 'teleshopping', titleId: 'b' }, { genre: 'top40' }, { genre: 'top40' }, { genre: 'top40' }]));
    expect(two.complaints.map((c) => c.rule)).toEqual(['teleshopping']);
  });

  it('a channel has one open complaint per rule, however many days it breaks it', () => {
    const s = base();
    const breach = () => dayWith(s, [{ genre: 'teleshopping', titleId: 'a' }, { genre: 'teleshopping', titleId: 'b' }, { genre: 'top40' }, { genre: 'top40' }, { genre: 'top40' }]);
    checkRules(s, breach());
    checkRules(s, breach());
    expect(s.complaints).toHaveLength(1);
  });

  it('a decided complaint is fined and recorded, or thrown out; a repeat within the year doubles the fine', () => {
    const s = base();
    const breach = () => dayWith(s, [{ genre: 'teleshopping', titleId: 'a' }, { genre: 'teleshopping', titleId: 'b' }, { genre: 'top40' }, { genre: 'top40' }, { genre: 'top40' }]);
    breach();
    const desked = employeesWithDesk(s);
    expect(upheldChance(s, desked)).toBeLessThanOrEqual(REGULATOR.upheld);
    let upheld = 0;
    let first = 0;
    for (let i = 0; i < 60; i++) {
      const t = structuredClone(s);
      t.seed = i + 1;
      checkRules(t, breach());
      t.day += REGULATOR.decideDays;
      const money = t.money;
      decideComplaints(t, desked);
      const c = t.complaints[0]!;
      expect(c.upheld).not.toBeNull();
      first = c.fine;
      if (c.upheld) {
        upheld++;
        expect(t.money).toBe(money - c.fine);
        expect(t.ledger.fines).toBe(c.fine);
        expect(recordOf(t.licenses.find((l) => l.regionId === c.regionId)!).upheld).toBe(1);
      } else {
        expect(t.money).toBe(money);
      }
    }
    expect(upheld).toBeGreaterThan(30);
    expect(upheld).toBeLessThan(60);
    // The repeat.
    const r = base();
    checkRules(r, dayWith(r, [{ genre: 'teleshopping', titleId: 'a' }, { genre: 'teleshopping', titleId: 'b' }, { genre: 'top40' }, { genre: 'top40' }, { genre: 'top40' }]));
    r.complaints[0]!.upheld = true;
    r.day += 20;
    checkRules(r, dayWith(r, [{ genre: 'teleshopping', titleId: 'a' }, { genre: 'teleshopping', titleId: 'b' }, { genre: 'top40' }, { genre: 'top40' }, { genre: 'top40' }]));
    expect(r.complaints[1]!.fine).toBe(first * 2);
  });

  it('the news rule: a license short of news is fined every 1 January, but only once it has aired enough to be judged', () => {
    const s = base();
    const license = s.licenses[0]!;
    license.record = { upheld: 0, newsSlots: 10, slots: 100 };
    checkNews(s);
    expect(s.complaints).toEqual([]);
    license.record = { upheld: 0, newsSlots: 10, slots: 500 };
    checkNews(s);
    expect(s.complaints.map((c) => c.rule)).toEqual(['news']);
    const fine = base();
    fine.licenses[0]!.record = { upheld: 0, newsSlots: 100, slots: 500 };
    checkNews(fine);
    expect(fine.complaints).toEqual([]);
  });

  it('the days add to a license’s record, news slots counted', () => {
    const s = base();
    const record = recordOf(s.licenses[0]!);
    const [slots, news] = [record.slots, record.newsSlots];
    checkRules(s, dayWith(s, [{ genre: 'news' }, { genre: 'top40' }, { genre: 'top40' }, { genre: 'top40' }, { genre: 'top40' }]));
    expect(record.slots).toBe(slots + 5);
    expect(record.newsSlots).toBe(news + 1);
  });

  it('the record costs the holder advantage at renewal, and never more than it has', () => {
    const s = base();
    const license = s.licenses[0]!;
    license.record = newRecord();
    expect(holderAdvantage(license)).toBe(RENEWAL.holderAdvantage);
    expect(recordNote(license)).toBe('');
    license.record = { upheld: 2, newsSlots: 100, slots: 500 };
    expect(holderAdvantage(license)).toBeCloseTo(RENEWAL.holderAdvantage - 2 * REGULATOR.upheldCut);
    expect(recordNote(license)).toContain('2 upheld complaints');
    license.record = { upheld: 1, newsSlots: 0, slots: 500 };
    expect(holderAdvantage(license)).toBeCloseTo(RENEWAL.holderAdvantage - REGULATOR.upheldCut - REGULATOR.newsCut);
    license.record = { upheld: 50, newsSlots: 0, slots: 500 };
    expect(holderAdvantage(license)).toBe(0);
  });

  it('a film for adults stays out of the early slots, and airs there only when nothing else is left', () => {
    const s = base();
    // pickTitles needs a library room: give it capacity by testing the rule through two titles of one genre.
    const room = s.rooms[0]!;
    room.type = 'library';
    room.furniture.push({ id: 'shelf-x', type: 'shelving', tier: 1 } as never);
    const channel = s.channels[0]!;
    s.shows.push({ id: 'film-show', name: 'Films', genre: 'movies', hostId: null, staffIds: [], writerIds: [], editorIds: [], studioId: null, freshness: 1, tone: 'normal' });
    channel.schedule = channel.schedule.map(() => null);
    channel.schedule[3] = 'film-show';
    channel.schedule[4] = 'film-show';
    s.library = [title('adult', 'movies', true), { ...title('plain', 'movies'), quality: 0.2 }];
    const picks = pickTitles(s);
    expect(picks.get(`${channel.id}:3`)?.id).toBe('plain');
    expect(picks.get(`${channel.id}:4`)?.id).toBe('adult');
    s.library = [title('adult', 'movies', true)];
    expect(pickTitles(s).get(`${channel.id}:3`)?.id).toBe('adult');
  });

  it('about a third of the films on the market are for adults, and nothing else is', () => {
    const s = createInitialState(3);
    s.day = 365 * 30;
    s.techs = [...s.techs];
    let films = 0;
    let adults = 0;
    for (let m = 0; m < 40; m++) {
      refreshMarket(s, new Rng(m + 1));
      for (const offer of s.market.titles) {
        if (offer.genre === 'movies') {
          films++;
          if (offer.adult) adults++;
        } else expect(offer.adult).toBeUndefined();
      }
    }
    if (films > 0) expect(adults / films).toBeGreaterThan(REGULATOR.adultShare - 0.15);
    if (films > 0) expect(adults / films).toBeLessThan(REGULATOR.adultShare + 0.15);
  });

  it('the test players keep the rules: no complaint in four years, on radio or on television', () => {
    for (const bot of [growthBot, tvBot]) {
      let s = createInitialState(1);
      const seen = new Set<string>();
      while (s.day < 365 * 4 && !s.bankrupt) {
        s = tick(bot(s));
        for (const c of s.complaints) seen.add(c.id);
      }
      expect(s.bankrupt).toBeFalsy();
      expect([...seen]).toEqual([]);
    }
  }, 120_000);

  describe('the save', () => {
    it('loads a save of version 48: nobody has complained, every license has a clean record', () => {
      const s = base();
      const file = JSON.parse(JSON.stringify(toSaveFile(s, 0)));
      delete file.state.complaints;
      delete file.state.ledger.fines;
      for (const license of file.state.licenses) delete license.record;
      for (const report of file.state.monthlyReports) delete report.fines;
      const { version, state } = fromSaveFile({ ...file, version: 48 });
      expect(version).toBe(SAVE_VERSION);
      expect(state.complaints).toEqual([]);
      expect(state.licenses.length).toBeGreaterThan(0);
      expect(state.licenses.every((l) => l.record?.slots === 0 && l.record.upheld === 0)).toBe(true);
      expect(state.ledger.fines).toBe(0);
      expect(state.monthlyReports.every((r) => r.fines === 0)).toBe(true);
    });
  });
});
