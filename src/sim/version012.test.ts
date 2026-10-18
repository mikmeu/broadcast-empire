import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, DIFFICULTY_COSTS, MILESTONES, STARTING_MONEY } from '../config/balance';
import { MILESTONE_LIST } from '../config/milestones';
import { airingPrice, buyLicense, buyTitle, createChannel, createShow, hire, scheduleShow, setChannelManager, setRoomType, titlePrice, type ActionResult } from './actions';
import { addMissingEquipment, autoPlaceFurniture, rentRoom, setUpMasterControl, setUpPostRoom } from './fixtures';
import { sensibleBot } from './bots';
import { monthlyNet, outlook, payTitles, runningCosts, salaryFor } from './economy';
import { generateCandidates } from './generate';
import { licenseMonthly, licensePrice } from './licenses';
import { checkMilestones, milestoneReward } from './milestones';
import { createInitialState } from './newGame';
import { monthlyRent } from './office';
import { Rng } from './rng';
import { fromSaveFile, toSaveFile } from './save';
import type { GameState } from './state';
import { tick } from './tick';
import { unlockAll } from './unlocks';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}

/** The sensible bot's radio station, with a TV channel in the Capital, a library and money to spare. */
function tvStation(difficulty: GameState['difficulty'] = 'normal'): GameState & { tvId: string } {
  let s: GameState & { lastId?: string } = structuredClone(unlockAll(sensibleBot(createInitialState(1, difficulty))));
  s.money = 2_000_000;
  s.floorsUnlocked = 2;
  s = ok(createChannel(s, { name: 'Test TV', logo: { shape: 'square', color: '#000', initials: 'TV' }, medium: 'tv' }));
  const tvId = s.lastId!;
  s = ok(buyLicense(s, tvId, 'capital'));
  s.candidates.push({ id: 'p-manager', name: 'Test Person', skill: 80, salary: 2_000, specialties: [], fame: 0, department: null, role: 'channelManager' });
  s = ok(hire(s, 'p-manager'));
  s = ok(autoPlaceFurniture(s, s.rooms.find((r) => r.type === 'managementOffice')!.roomId, 'managerDesk'));
  s = ok(setChannelManager(s, tvId, 'p-manager'));
  // The titles come by post (0.17.0).
  s = ok(addMissingEquipment(ok(setRoomType(ok(setUpPostRoom(ok(rentRoom(s, 'K')))), 'K', 'library')), 'K'));
  // A second channel goes out through a master control room (0.16.0).
  s = ok(setUpMasterControl(s));
  return Object.assign(s, { tvId });
}

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

  describe('bills are paid every day', () => {
    it('the money a company has is what it can spend: the 1st takes no more than another day', () => {
      let s = sensibleBot(createInitialState(1));
      for (let day = 0; day < 29; day++) s = tick(sensibleBot(s));
      const days: number[] = [];
      // 30 and 31 January, and 1 February: the bills of a day each time.
      for (let day = 0; day < 3; day++) {
        const before = s.money;
        s = tick(sensibleBot(s));
        days.push(before - s.money + s.lastDay!.channels.filter((c) => c.isPlayer).reduce((sum, c) => sum + c.slots.reduce((x, slot) => x + slot.revenue, 0), 0));
      }
      expect(s.monthlyReports).toHaveLength(1);
      // Gifts for milestones aside, no day costs much more than the others.
      const gifts = s.monthlyReports[0]!.gifts + s.ledger.gifts;
      expect(Math.max(...days) - Math.min(...days)).toBeLessThan(gifts + 2_000);
    });
  });

  describe('a title is paid by the airing', () => {
    it('buying costs nothing; every airing costs its share, in the running costs', () => {
      const station = tvStation();
      let s: GameState = station;
      const offer = s.market.titles.filter((t) => t.genre === 'series').sort((a, b) => b.quality - a.quality)[0]!;
      const money = s.money;
      s = ok(buyTitle(s, offer.id));
      expect(s.money).toBe(money);
      const title = s.library.find((t) => t.id === offer.id)!;
      expect(title.perAiring).toBe(airingPrice(s, offer));
      expect(title.perAiring * offer.airings).toBeCloseTo(titlePrice(s, offer.price), -2);

      const show = ok(createShow(s, { name: 'Evening Series', genre: 'series', hostId: null, staffIds: [], studioId: null }));
      s = ok(scheduleShow(show, station.tvId, 3, show.lastId!));
      expect(outlook(s).titles).toBeCloseTo((title.perAiring * 365.25) / 12, 0);
      const before = s.ledger.titles;
      s = tick(s);
      expect(s.library.find((t) => t.id === offer.id)!.airingsLeft).toBe(offer.airings - 1);
      expect(s.ledger.titles - before).toBe(title.perAiring);
      expect(runningCosts(s.ledger)).toBeGreaterThanOrEqual(s.ledger.titles);
    });

    it('a title bought before 0.12.0 was paid already, and nothing is paid twice', () => {
      const s = structuredClone(tvStation());
      s.library.push({ id: 'old', name: 'Old', genre: 'series', quality: 0.8, airingsLeft: 5, freshness: 1, fee: 0, perAiring: 0 });
      const money = s.money;
      payTitles(s, new Set(['old']));
      expect(s.money).toBe(money);
      expect(s.ledger.titles).toBe(0);
    });

    it('no new titles while the company is in the red', () => {
      const s = { ...tvStation(), money: -1 };
      expect(buyTitle(s, s.market.titles[0]!.id).ok).toBe(false);
    });
  });

  describe('Uncle Tabby pays for milestones', () => {
    it('most milestones bring money, by the difficulty; the dividends bring none', () => {
      for (const id of ['firstDividend', 'dividendsSmall', 'dividendsMedium', 'dividendsLarge'] as const) {
        expect(milestoneReward({ difficulty: 'easy' }, id)).toBe(0);
      }
      expect(MILESTONE_LIST.filter((m) => m.reward > 0).length).toBeGreaterThan(MILESTONE_LIST.length / 2);
      for (const difficulty of DIFFICULTIES) {
        expect(milestoneReward({ difficulty }, 'tvLicense')).toBe(getReward('tvLicense') * MILESTONES.rewardScale[difficulty]);
      }
    });

    it('the money comes in when the milestone is reached, as a gift in the books', () => {
      const s = structuredClone(tvStation('easy'));
      s.milestones = s.milestones.filter((m) => m.id !== 'tvLicense');
      const { money } = s;
      const gifts = s.ledger.gifts;
      checkMilestones(s);
      const reward = milestoneReward(s, 'tvLicense');
      expect(reward).toBeGreaterThan(0);
      expect(s.money - money).toBeGreaterThanOrEqual(reward);
      expect(s.ledger.gifts - gifts).toBe(s.money - money);
      expect(s.messages.some((m) => m.text.includes('Uncle Tabby sends'))).toBe(true);
      expect(monthlyNet({ ...s.ledger, revenue: 0 })).toBeGreaterThanOrEqual(monthlyNet({ ...s.ledger, revenue: 0, gifts: 0 }));
    });
  });

  it('the month ahead names what running campaigns will still cost, apart from the running result (0.12.1)', () => {
    const s = structuredClone(sensibleBot(createInitialState(1)));
    const without = outlook(s);
    expect(without.campaigns).toBe(0);
    s.campaigns = [
      { id: 'c1', targetId: s.channels[0]!.id, audience: 'all', weeklyBudget: 7_000, marketerId: 'm', endDay: s.day + 10, weeks: 4, repeat: false },
      { id: 'c2', targetId: s.channels[0]!.id, audience: 'all', weeklyBudget: 700, marketerId: 'm', endDay: s.day + 400, weeks: 4, repeat: false },
    ];
    const ahead = outlook(s);
    expect(ahead.campaigns).toBeCloseTo(1_000 * 10 + (100 * 365.25) / 12, 6);
    expect(ahead.result).toBe(without.result);
  });

  it('a save from 0.11.0 pays what had built up this month, and keeps its titles paid for', () => {
    let s = sensibleBot(createInitialState(1));
    for (let day = 0; day < 10; day++) s = tick(sensibleBot(s));
    const old = structuredClone(toSaveFile(s, 0)) as unknown as { version: number; state: Record<string, any> };
    old.version = 27;
    const owed = 5_000;
    old.state.ledger.salaries = owed;
    old.state.ledger.rent = 0;
    old.state.ledger.licenseFees = 0;
    delete old.state.ledger.titles;
    delete old.state.ledger.gifts;
    old.state.library = [{ id: 'x', name: 'X', genre: 'series', quality: 0.5, airingsLeft: 3, freshness: 1, fee: 0 }];
    const { state } = fromSaveFile(old);
    expect(state.money).toBe(s.money - owed);
    expect(state.library[0]!.perAiring).toBe(0);
    expect(state.ledger).toMatchObject({ titles: 0, gifts: 0 });
    for (const report of state.monthlyReports) expect(report).toMatchObject({ titles: 0, gifts: 0 });
  });
});

const getReward = (id: string) => MILESTONE_LIST.find((m) => m.id === id)!.reward;
