import { describe, expect, it } from 'vitest';
import { sensibleBot } from './bots';
import { createInitialState } from './newGame';
import type { GameState, MonthlyReport } from './state';
import { median, summarise, summaryTable, yearRecord, type GameRecord, type YearRecord } from './sweep';
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
