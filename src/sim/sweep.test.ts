import { describe, expect, it } from 'vitest';
import { growthBot, sensibleBot } from './bots';
import { createInitialState } from './newGame';
import type { GameState, MonthlyReport } from './state';
import { channelResult, channelWages, lateMoneySummary, median, paybackSummary, purchasesMade, summarise, summaryTable, takeChannelFigures, takenFromOthers, tallyChannelDay, tallyPurchase, yearRecord, type ChannelTallies, type GameRecord, type YearRecord } from './sweep';
import { tick } from './tick';

const report = (year: number, month: number, over: Partial<MonthlyReport>): MonthlyReport => ({ ...createInitialState(1).ledger, year, month, net: 0, balance: 0, ...over });

describe('the sweep: a year of a game (#441)', () => {
  it('sums the year\'s reports, and takes profit without the gifts and before events', () => {
    const state: GameState = createInitialState(1);
    state.monthlyReports = [
      report(1969, 12, { net: 999_999 }),
      report(1970, 1, { net: 100, revenue: 400, events: 30, gifts: 0 }),
      report(1970, 2, { net: 50, revenue: 300, events: 20, gifts: 40 }),
    ];
    const y = yearRecord(state)!;
    expect(y.year).toBe(1970);
    expect(y.months).toBe(2);
    expect(y.ledger.revenue).toBe(700);
    expect(y.net).toBe(150);
    expect(y.profit).toBe(110);
    expect(y.profitBeforeEvents).toBe(160);
  });

  it('counts the money borrowed back in, so a loan shows only its interest (#452)', () => {
    const state: GameState = createInitialState(1);
    state.monthlyReports = [
      report(1970, 1, { net: 0, loanProceeds: 200_000 }),
      report(1970, 2, { net: -210_000, loanPayments: 210_000 }),
    ];
    const y = yearRecord(state)!;
    expect(y.net).toBe(-210_000);
    expect(y.profit).toBe(-10_000);
  });

  it('holds the average morale and host skill at the year\'s end (#455)', () => {
    const state: GameState = tick(sensibleBot(createInitialState(1)));
    const base = state.employees[0]!;
    const person = (role: 'host' | 'production', skill: number, morale: number) => ({ ...base, id: `e${skill}${role}`, role, skill, morale });
    state.employees = [person('host', 30, 40), person('host', 51, 60), person('production', 90, 80)];
    state.monthlyReports = [report(1970, 1, { net: 0 })];
    const y = yearRecord(state)!;
    expect(y.morale).toBe(60);
    expect(y.hostSkill).toBe(41);
    state.employees = [];
    expect(yearRecord(state)!.hostSkill).toBe(0);
  });

  it('holds the average reputation of the channels at the year\'s end (#458)', () => {
    const state: GameState = tick(sensibleBot(createInitialState(1)));
    state.monthlyReports = [report(1970, 1, { net: 0 })];
    const [first] = state.channels;
    const licence = state.licenses[0]!;
    state.licenses = [licence, { ...licence, channelId: 'c2' }];
    state.channels = [
      { ...first!, id: licence.channelId, reputation: { [licence.regionId]: 0.4 } },
      { ...first!, id: 'c2', reputation: { [licence.regionId]: 0.8 } },
    ];
    expect(yearRecord(state)!.reputation).toBe(60);
    state.channels = [];
    expect(yearRecord(state)!.reputation).toBe(0);
  });

  it('has nothing before the first report', () => {
    expect(yearRecord(createInitialState(1))).toBeNull();
  });

  it('holds cash, staff by job, channels and licences of a game played for a few months', () => {
    let state = createInitialState(7);
    for (let i = 0; i < 100 && !state.bankrupt; i++) state = tick(sensibleBot(state));
    const y = yearRecord(state)!;
    expect(y.cash).toBe(state.money);
    expect(y.channels.radio).toBe(state.channels.length);
    expect(y.licenses.radio).toBe(state.licenses.length);
    expect(Object.values(y.staff).reduce((a, b) => a + b, 0)).toBe(state.employees.length);
    expect(y.level).toBeGreaterThanOrEqual(0);
  });
});

const game = (bot: string, seed: number, profit: number, over: Partial<GameRecord> = {}): GameRecord => ({
  setup: { bot, difficulty: 'normal', region: 'capital', seed, years: 60 },
  commit: 'abc',
  runSeconds: 1,
  years: [{ year: 1970, profit, profitBeforeEvents: profit + 10, dividendsPaid: 5, cash: 7 } as YearRecord],
  bankrupt: null,
  bailedOut: null,
  ...over,
});

describe('the sweep: the summary (#441)', () => {
  it('takes a median', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });

  it('gives a row per setup, with the median, lowest and highest profit and the bankrupt count', () => {
    const rows = summarise([game('growth', 1, 10), game('growth', 2, 30), game('growth', 3, 20, { bankrupt: { day: 5, month: '1994-03' } }), game('tv', 1, 5)]);
    expect(rows.map((r) => r.bot)).toEqual(['growth', 'tv']);
    expect(rows[0]).toMatchObject({ games: 3, bankrupt: 1, profit: { median: 20, low: 10, high: 30 }, beforeEvents: { median: 30 } });
  });

  it('compares with the baseline game by game, and marks a change within the spread of the seeds', () => {
    const now = [game('growth', 1, 100), game('growth', 2, 200), game('tv', 1, 100), game('tv', 2, 300)];
    const before = [game('growth', 1, 90), game('growth', 2, 190), game('tv', 1, 100), game('tv', 2, 100)];
    const [growth, tv] = summarise(now, before);
    expect(growth!.change).toBe(10);
    expect(growth!.withinNoise).toBe(true);
    expect(tv!.change).toBe(100);
    expect(tv!.withinNoise).toBe(true);
    const [big] = summarise([game('growth', 1, 100), game('growth', 2, 101)], [game('growth', 1, 10), game('growth', 2, 11)]);
    expect(big!.withinNoise).toBe(false);
  });

  it('has no change without a matching baseline', () => {
    const [row] = summarise([game('growth', 1, 10)], [game('tv', 1, 10)]);
    expect(row!.change).toBeNull();
    expect(summaryTable([row!], true)).toContain('no match');
  });
});

describe('the sweep: games that leave a feature out (#442)', () => {
  const left = (bot: string, seed: number, profit: number, without: string) => game(bot, seed, profit, { setup: { bot, difficulty: 'normal', region: 'capital', seed, years: 60, without } });

  it('compares a row without a feature with the full games of the same folder', () => {
    const rows = summarise([game('growth', 1, 100), game('growth', 2, 200), left('growth', 1, 60, 'events'), left('growth', 2, 150, 'events')]);
    expect(rows.map((r) => r.without)).toEqual([null, 'events']);
    expect(rows[0]!.change).toBeNull();
    expect(rows[1]).toMatchObject({ games: 2, change: -45 });
  });

  it('counts a record with no `without` as a full game, and keeps the rows apart', () => {
    const rows = summarise([game('growth', 1, 100), left('growth', 1, 90, 'canteen'), left('growth', 1, 80, 'events')]);
    expect(rows.map((r) => r.without)).toEqual([null, 'canteen', 'events']);
    expect(rows.every((r) => r.games === 1)).toBe(true);
    expect(rows[2]!.change).toBe(-20);
  });

  it('has no change when the full game is missing, and shows the left-out column', () => {
    const rows = summarise([left('growth', 1, 60, 'events')]);
    expect(rows[0]!.change).toBeNull();
    const table = summaryTable(rows, false);
    expect(table).toContain('left out');
    expect(table).toContain('events');
    expect(table).toContain('no match');
  });
});

describe('the sweep: each channel on its own (#436)', () => {
  // The growth player has opened its second station by the autumn of 1970.
  const play = () => {
    let s = createInitialState(42);
    const tallies: ChannelTallies = new Map();
    // Day 600, not 300: Uncle Tabby's smaller gifts put the second station later (#432).
    while (s.day < 600 && !s.bankrupt) {
      const played = growthBot(s);
      tallyPurchase(tallies, s, played);
      s = tick(played);
      if (s.lastDay) tallyChannelDay(tallies, played, s.lastDay);
    }
    return { s, tallies };
  };

  it("keeps a station's figures, and the wages of its own people are not the whole payroll", () => {
    const { s, tallies } = play();
    expect(s.channels.length).toBeGreaterThanOrEqual(2);
    const figures = takeChannelFigures(tallies);
    expect(figures.map((f) => f.name)).toEqual(s.channels.map((c) => c.name));
    for (const f of figures) {
      expect(f.revenue).toBeGreaterThan(0);
      expect(f.licensePurchases).toBeGreaterThan(0);
      expect(f.unsold).toBeGreaterThanOrEqual(0);
      expect(f.unsold).toBeLessThanOrEqual(1);
      expect(channelResult(f)).toBe(f.revenue - f.wages - f.licenseFees - f.licensePurchases - f.taken);
    }
    const payroll = s.employees.reduce((sum, e) => sum + e.salary, 0);
    const split = s.channels.reduce((sum, c) => sum + channelWages(s, c.id), 0);
    expect(split).toBeGreaterThan(0);
    expect(split).toBeLessThanOrEqual(payroll);
    expect(takeChannelFigures(tallies)).toEqual([]);
  });

  it("shows that taking a twin off the air raises the first station's revenue", () => {
    const { s } = play();
    const taken = takenFromOthers(s);
    const [first, second] = s.channels;
    expect(taken[second!.id]).toBeGreaterThan(0);
    expect(typeof taken[first!.id]).toBe('number');
  });
});

describe('the sweep: what the bot bought (#475)', () => {
  it('records the licences and the second station with their prices, and not the same licence twice', () => {
    let s = createInitialState(42);
    const bought = [] as ReturnType<typeof purchasesMade>;
    while (s.day < 600 && !s.bankrupt) {
      const played = growthBot(s);
      bought.push(...purchasesMade(s, played));
      s = tick(played);
    }
    const licences = bought.filter((p) => p.kind === 'licence');
    expect(licences.length).toBeGreaterThan(3);
    for (const p of bought) {
      expect(p.price).toBeGreaterThan(0);
      expect(p.year).toBeGreaterThanOrEqual(1970);
    }
    expect(bought.some((p) => p.what === 'radio channel 2')).toBe(true);
    // Each licence is for a region the company did not hold, so no two share one.
    expect(new Set(licences.map((p) => p.what)).size).toBe(licences.length);
    // The prices are what the licences cost: nothing is counted that the company does not hold.
    const paid = [...bought.filter((p) => p.kind !== 'room' && p.kind !== 'floor')].reduce((sum, p) => sum + p.price, 0);
    expect(paid).toBeLessThanOrEqual(s.licenses.reduce((sum, l) => sum + l.price, 0) + s.vans.reduce((sum, v) => sum + v.price, 0) + (s.helicopter?.price ?? 0));
  });

  it('counts a room of a new kind once, at the rise in the day\'s purchases, and not a renewal', () => {
    const before = createInitialState(1);
    const after = structuredClone(before);
    after.day = before.day + 1;
    after.ledger.purchases = before.ledger.purchases + 5000;
    after.rooms.push({ ...after.rooms[0]!, roomId: 'new-weather', type: 'weatherStudio', fixed: undefined });
    expect(purchasesMade(before, after).filter((p) => p.kind === 'room')).toEqual([expect.objectContaining({ what: 'weatherStudio', price: 5000, year: 1970 })]);
    after.licenses = after.licenses.map((l) => ({ ...l, id: `renewed-${l.id}`, expiresOn: l.expiresOn + 1000 }));
    expect(purchasesMade(before, after).filter((p) => p.kind === 'licence')).toEqual([]);
  });

  it('counts a licence bought from a rival as a takeover at what was paid, not as a licence (#476)', () => {
    const before = createInitialState(1);
    const after = structuredClone(before);
    const base = { regionId: 'capital' as const, medium: 'radio' as const, channelId: 'c1', expiresOn: 900 };
    after.licenses.push({ ...base, id: 'taken-1', price: 40_000, takenOver: { from: 'r1', paid: 90_000, on: 0 } });
    expect(purchasesMade(before, after)).toEqual([expect.objectContaining({ kind: 'takeover', what: 'takeover 1', price: 90_000 })]);
    const again = structuredClone(after);
    again.licenses.push({ ...base, id: 'taken-2', price: 40_000, takenOver: { from: 'r1', paid: 70_000, on: 1 } });
    expect(purchasesMade(after, again)).toEqual([expect.objectContaining({ what: 'takeover 2', price: 70_000 })]);
  });
});

describe('the sweep: late money and payback (#475)', () => {
  const year = (y: number, cash: number, over: Partial<YearRecord> = {}): YearRecord => ({ year: y, months: 12, cash, profit: 0, profitBeforeEvents: 0, dividendsPaid: 0, ledger: { salaries: 100 } as YearRecord['ledger'], ...over }) as YearRecord;

  it("gives the year of the last purchase, cash as a multiple of a year's costs, and the dividend after 1985", () => {
    const g = game('growth', 1, 0, {
      years: [year(1985, 300, { dividendsPaid: 10 }), year(2000, 500), year(2015, 150, { dividendsPaid: 40 })],
      purchases: [{ kind: 'helicopter', what: 'helicopter', year: 1975, month: 1, price: 5 }, { kind: 'van', what: 'news van', year: 2003, month: 6, price: 5 }],
    });
    const text = lateMoneySummary([g]);
    expect(text).toContain('| growth | normal | capital | 1 | 2003 | 1 of 1 | 3.0 | 5.0 | 1.5 | 5.0 | 0 of 1 | 0.0 |');
  });

  it('shows a dash for a file without purchases, and leaves out the games that left a feature out', () => {
    const old = game('growth', 1, 0, { years: [year(1985, 100), year(2000, 100)] });
    expect(lateMoneySummary([old])).toMatch(/\| 1 \| – \| – \| 1\.0 \|/);
    const left = game('growth', 2, 0, { setup: { bot: 'growth', difficulty: 'normal', region: 'capital', seed: 2, years: 60, without: 'events' } });
    expect(lateMoneySummary([left])).toBe('');
  });

  const heli = { kind: 'helicopter', what: 'helicopter', year: 1980, month: 1, price: 60 } as const;
  const twoYears = (profit: number) => [year(1980, 0, { profitBeforeEvents: profit }), year(1981, 0, { profitBeforeEvents: profit })];
  const without = (seed: number, profit: number) => game('growth', seed, 0, { setup: { bot: 'growth', difficulty: 'normal', region: 'capital', seed, years: 60, without: 'helicopter' }, years: twoYears(profit) });

  it('works out a payback from the price and the gain against the game without it, and says "never" for no gain', () => {
    const full = (seed: number) => game('growth', seed, 0, { years: twoYears(100), purchases: [heli] });
    // Seed 1: 200 with it against 240 without, plus the 60 paid, over two years: 10 a year, 6 years to pay back.
    // Seed 2: it earned less than it cost.
    const text = paybackSummary([full(1), without(1, 120), full(2), without(2, 200)]);
    expect(text).toContain('| growth | normal | capital | helicopter | 2 | 0.0 | never (6.0–never) | 1 of 2 |');
  });

  it('has nothing to say without a purchase to pair, and for a feature with no price', () => {
    expect(paybackSummary([game('growth', 1, 0), without(1, 10)])).toBe('');
  });
});
