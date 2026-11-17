// Phase 1 acceptance criteria (prompt.md section 14): a sensible strategy is
// profitable within 6 months, a neglectful one goes bankrupt, and the game can
// be played from January 1970 to December 1971.

import { describe, expect, it } from 'vitest';
import { atHome, capitalBot, LEAVE_OUT, leaveOutProblem, neglectfulBot, sensibleBot, tvBot, without, type Bot } from './bots';
import { createInitialState } from './newGame';
import type { Employee, GameState } from './state';
import { tick } from './tick';

const TWO_YEARS = 365 + 365;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const onDealsJob = (e: Employee) => e.role === 'sales' && (e.salesJob ?? 'deals') === 'deals';

function play(bot: Bot, seed: number, days = TWO_YEARS): GameState {
  let state = createInitialState(seed);
  while (state.day < days && !state.bankrupt) state = tick(bot(state));
  return state;
}

describe('Phase 1 acceptance', () => {
  it.each(SEEDS)('sensible play is profitable within 6 months and survives 1970–1971 (seed %i)', (seed) => {
    const state = play(sensibleBot, seed);
    expect(state.bankrupt).toBe(false);
    expect(state.day).toBe(TWO_YEARS);
    const firstProfit = state.monthlyReports.findIndex((r) => r.net > 0);
    expect(firstProfit).toBeGreaterThanOrEqual(0);
    expect(firstProfit).toBeLessThan(6);
  });

  it.each(SEEDS)('neglectful play goes bankrupt (seed %i)', (seed) => {
    expect(play(neglectfulBot, seed).bankrupt).toBe(true);
  });

  it('is deterministic for the same seed and decisions', () => {
    expect(play(sensibleBot, 3, 120)).toEqual(play(sensibleBot, 3, 120));
  });
});

// A first licence at home, outside Coaxia, went bankrupt in the first year in every game (#428): wages and rent now follow the region.
describe('a first licence at home outside Coaxia (#428)', () => {
  const HOMES = ['north', 'coast', 'heartland', 'highlands'] as const;
  const playAt = (headquarters: (typeof HOMES)[number], seed: number) => {
    let state = createInitialState(seed, 'normal', { playerName: 'Bot', companyName: 'Bot', headquarters });
    while (state.day < TWO_YEARS && !state.bankrupt) state = tick(atHome(sensibleBot)(state));
    return state;
  };

  it.each(HOMES)('the sensible bot lives through 1970–1971 in %s (seeds 42, 13)', (home) => {
    for (const seed of [42, 13]) expect(playAt(home, seed).bankrupt).toBe(false);
  });
});

// The deal salespeople retiring left the bots without sponsors for good, as the till and orders staff of the gift shop counted as sales (#426).
describe('the Capital bot hires for deals when nobody is on deals (#426)', () => {
  it('hires a new deal salesperson when the only one left works the till', () => {
    let state = createInitialState(42);
    while (state.day < 70 && !state.bankrupt) state = tick(capitalBot(state));
    expect(state.employees.some((e) => e.role === 'sales')).toBe(true);
    state = { ...state, employees: state.employees.map((e) => (e.role === 'sales' ? { ...e, salesJob: 'till' as const } : e)) };
    expect(state.employees.some(onDealsJob)).toBe(false);
    for (let i = 0; i < 40 && !state.bankrupt; i++) state = tick(capitalBot(state));
    expect(state.employees.some(onDealsJob)).toBe(true);
  });
});

// The Competition panel and Penny's e-mails (#410) only read the fields, and rivalry stays 0 before 1973 on normal.
// Counter-programming (#411) reads rivalry and move, but with rivalry reset every day no rival ever plans one, so this still holds.
describe('rival money and rivalry change nothing in the first years (#409, #411, #413)', () => {
  /** The game without the three new fields, and without the day a host was courted (#413). */
  const stripped = (s: GameState) => ({
    ...s,
    employees: s.employees.map(({ courtedOn: _courtedOn, ...rest }) => rest),
    rivals: s.rivals.map(({ money: _money, rivalry: _rivalry, move: _move, ...rest }) => rest),
  });

  it('a game with them reset every day is the same game, random numbers included', () => {
    let normal = createInitialState(2);
    let reset = createInitialState(2);
    while (normal.day < TWO_YEARS && !normal.bankrupt) {
      normal = tick(sensibleBot(normal));
      reset = tick(sensibleBot(reset));
      // Money is no longer reset (#414): rivals pay for licenses and expansion from it, so it is part of the game now.
      reset = { ...reset, rivals: reset.rivals.map((r) => ({ ...r, rivalry: 0, move: null })) };
    }
    expect(normal.rngState).toBe(reset.rngState);
    expect(stripped(reset)).toEqual(stripped(normal));
  });
});

// `npm run simulate -- --without <feature>` plays a bot without one feature, to show what it is worth (#442).
describe('a bot that leaves a feature out (#442)', () => {
  const canteens = (s: GameState) => s.rooms.filter((r) => r.type === 'canteen').length;

  it('builds no canteen without it, and the plain bot does', () => {
    expect(canteens(tick(sensibleBot(createInitialState(42))))).toBeGreaterThan(0);
    expect(canteens(tick(without('canteen')(sensibleBot)(createInitialState(42))))).toBe(0);
  });

  it('plays the same game as the plain bot when it never plays the feature', () => {
    // The sensible bot has no TV channel to leave out, so nothing may change: the option moves no guard test.
    const play120 = (bot: Bot) => {
      let state = createInitialState(3);
      while (state.day < 120 && !state.bankrupt) state = tick(bot(state));
      return state;
    };
    expect(play120(without('tv')(sensibleBot))).toEqual(play120(sensibleBot));
  });

  it('clears the flag after each move, so a plain bot is never held back', () => {
    without('canteen')(sensibleBot)(createInitialState(42));
    expect(canteens(tick(sensibleBot(createInitialState(42))))).toBeGreaterThan(0);
  });

  it('names at least one real bot for every feature, and refuses a bot that does not play it', () => {
    const bots = ['sensible', 'capital', 'neglectful', 'growth', 'network', 'nosupport', 'research', 'tv', 'stream'];
    for (const [feature, { usedBy }] of Object.entries(LEAVE_OUT)) {
      expect(usedBy.length).toBeGreaterThan(0);
      for (const bot of usedBy) expect(bots).toContain(bot);
      expect(leaveOutProblem(feature, usedBy[0]!)).toBeNull();
    }
    expect(leaveOutProblem('events', 'neglectful')).toContain('never plays');
    expect(leaveOutProblem('flying', 'growth')).toContain('Unknown feature');
  });
});

describe('the TV bot borrows for its launch (#452)', () => {
  // Research, not money, holds the launch back in a whole game (seeds 1–3), so the loan is a fallback: tested on a state with the research done and the money short.
  const short = (leaveOut: boolean) => {
    const bot = leaveOut ? without('loans')(tvBot) : tvBot;
    let s = play(tvBot, 1, 400);
    s = { ...s, techs: [...new Set([...s.techs, 'kidsFormat' as const, 'soapOperaFormat' as const])], floorsUnlocked: Math.max(2, s.floorsUnlocked) };
    for (let i = 0; i < 31 && !s.loan; i++) s = tick(bot({ ...s, money: 500_000 }));
    return s;
  };

  it('takes one loan for the shortfall, and not when loans are left out', () => {
    expect(short(false).loan).not.toBeNull();
    expect(short(true).loan).toBeNull();
  }, 30_000);
});
