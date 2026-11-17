// Phase 1 acceptance criteria (prompt.md section 14): a sensible strategy is
// profitable within 6 months, a neglectful one goes bankrupt, and the game can
// be played from January 1970 to December 1971.

import { describe, expect, it } from 'vitest';
import { buyOutCost } from './deals';
import { atHome, capitalBot, growthBot, LEAVE_OUT, leaveOutProblem, neglectfulBot, sensibleBot, tvBot, without, type Bot } from './bots';
import { createInitialState } from './newGame';
import { workshops } from './staff';
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

describe('the test players sell shows and let studios (#453)', () => {
  /** Plays a bot and counts the deals it makes, by what ends the day. */
  const deals = (bot: Bot, days: number) => {
    let s = createInitialState(1);
    const seen = { lets: 0, sales: 0, hosts: 0 };
    while (s.day < days && !s.bankrupt) {
      const before = s;
      s = tick(bot(s));
      seen.lets += s.studioLets.filter((l) => !before.studioLets.some((o) => o.id === l.id)).length;
      seen.sales += s.showSales.filter((l) => !before.showSales.some((o) => o.id === l.id)).length;
    }
    return { state: s, ...seen };
  };

  it('lets a studio once Selling shows is open, and plays no deal when they are left out', () => {
    const full = deals(growthBot, 600);
    expect(full.lets).toBeGreaterThan(0);
    expect(full.state.studioLets.length).toBeLessThanOrEqual(1);
    const bare = deals(without('deals')(growthBot), 600);
    expect(bare.lets + bare.sales).toBe(0);
  }, 60_000);

  it('makes a show to sell to a rival, and sells it', () => {
    // Prepared state: the bot has played two years and has money and the level for deals.
    let s = createInitialState(1);
    while (s.day < 400 && !s.bankrupt) s = tick(growthBot(s));
    s = { ...s, money: 2_000_000, showSales: [], studioLets: [] };
    const before = s.shows.length;
    let sold = false;
    for (let i = 0; i < 90 && !s.bankrupt && !sold; i++) {
      s = tick(growthBot({ ...s, money: Math.max(s.money, 1_000_000) }));
      sold = s.showSales.length > 0;
    }
    expect(sold).toBe(true);
    const sale = s.showSales[0]!;
    expect(s.shows.length).toBeGreaterThan(before);
    expect(s.channels.some((c) => c.schedule.includes(sale.showId))).toBe(false);
    expect(s.shows.find((show) => show.id === sale.showId)?.hostId).toBeTruthy();
  }, 120_000);

  it('buys a let studio out when the second station needs one, and uses it', () => {
    let s = createInitialState(1);
    while (s.day < 400 && !s.bankrupt) s = tick(growthBot(s));
    const let_ = s.studioLets[0];
    expect(let_).toBeDefined();
    // The second station has not been set up: take it away so the bot has to choose between building and buying back.
    s = { ...s, channels: s.channels.slice(0, 1), money: 3_000_000 };
    const room = s.rooms.find((r) => r.roomId === let_!.roomId)!;
    const cost = buyOutCost(s, let_!);
    expect(cost).toBeGreaterThan(0);
    let next = s;
    for (let i = 0; i < 40 && next.studioLets.some((l) => l.id === let_!.id); i++) next = tick(growthBot({ ...next, money: Math.max(next.money, 3_000_000) }));
    expect(next.studioLets.some((l) => l.id === let_!.id)).toBe(false);
    expect(next.shows.some((show) => show.studioId === room.roomId)).toBe(true);
    // It is bought back and used, not built again: the bot holds no more studios of that kind than before.
    expect(next.rooms.filter((r) => r.type === room.type).length).toBe(s.rooms.filter((r) => r.type === room.type).length);
  }, 120_000);
});

describe('the TV bot airs sports and buys rights (#454)', () => {
  // Prepared state: the TV channel is launched (research given, money set), Sports rights is open and there is cash for the studio.
  const prepared = () => {
    let s = play(tvBot, 1, 120);
    s = { ...s, techs: [...new Set([...s.techs, 'kidsFormat' as const, 'soapOperaFormat' as const])], floorsUnlocked: Math.max(3, s.floorsUnlocked) };
    for (let i = 0; i < 120 && !s.bankrupt && !s.channels.some((c) => c.medium === 'tv'); i++) s = tick(tvBot({ ...s, money: Math.max(s.money, 1_500_000) }));
    return { ...s, unlocked: [...new Set([...s.unlocked, 'content' as const, 'sportsRights' as const])] };
  };
  const run = (bot: Bot, from: GameState, days: number) => {
    let s = from;
    for (let i = 0; i < days && !s.bankrupt; i++) s = tick(bot({ ...s, money: Math.max(s.money, 1_500_000) }));
    return s;
  };

  it('builds the studio, airs sports in the evening and holds rights', () => {
    const start = prepared();
    expect(start.channels.some((c) => c.medium === 'tv')).toBe(true);
    const s = run(tvBot, start, 62);
    const show = s.shows.find((x) => x.genre === 'tvSports');
    expect(s.rooms.some((r) => r.type === 'tvNewsStudio')).toBe(true);
    expect(show).toBeDefined();
    expect(s.channels.find((c) => c.medium === 'tv')!.schedule[3]).toBe(show!.id);
    expect(s.sportsRights.length).toBeGreaterThan(0);
    expect(s.monthlyReports.some((r) => r.content > 0)).toBe(true);
  }, 120_000);

  it('bids 2.5 times the reserve for event rights', () => {
    const aired = run(tvBot, prepared(), 62);
    const auction = { id: 'ra-test', eventId: 'worldCup', name: 'World Cup', reserve: 100_000, endsOn: aired.day + 30, interested: 1, bid: null };
    const s = tvBot({ ...aired, money: 2_000_000, rightsAuctions: [auction] });
    expect(s.rightsAuctions[0]!.bid).toBe(250_000);
  }, 120_000);

  it('makes the show but buys and bids for nothing when the rights are left out', () => {
    const bare = without('sportsRights')(tvBot);
    const aired = run(bare, prepared(), 62);
    expect(aired.shows.some((x) => x.genre === 'tvSports')).toBe(true);
    expect(aired.sportsRights.length).toBe(0);
    const auction = { id: 'ra-test', eventId: 'worldCup', name: 'World Cup', reserve: 100_000, endsOn: aired.day + 30, interested: 1, bid: null };
    expect(bare({ ...aired, money: 2_000_000, rightsAuctions: [auction] }).rightsAuctions[0]!.bid).toBeNull();
  }, 120_000);
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

describe('the test players train, coach and promote (#455)', () => {
  const RICH = 1_000_000;
  /** Plays a bot with money to spare from day 300 on, so the moves that wait for cash are not held back. */
  const rich = (bot: Bot, days: number) => {
    let s = createInitialState(1);
    while (s.day < days && !s.bankrupt) s = tick(bot({ ...s, money: s.day > 300 ? Math.max(s.money, RICH) : s.money }));
    return s;
  };
  const prepared = () => rich(growthBot, 330);
  /** Plays on with money to spare; `offer` puts a candidate in the pool each day, as the pool is drawn again every month. */
  const tryDays = (bot: Bot, from: GameState, days: number, until: (s: GameState) => boolean, offer: GameState['candidates'][number][] = []) => {
    let s = from;
    for (let i = 0; i < days && !s.bankrupt && !until(s); i++) s = tick(bot({ ...s, money: Math.max(s.money, RICH), candidates: [...s.candidates.filter((c) => !offer.some((o) => o.id === c.id)), ...offer] }));
    return s;
  };
  const onAir = (s: GameState) => s.shows.filter((x) => x.hostId && s.channels.some((c) => c.schedule.includes(x.id)));

  it('builds a workshop with a talent manager, sends people on courses and puts a host through the talent programme', () => {
    const s = rich(growthBot, 480);
    expect(s.rooms.some((r) => r.type === 'workshop')).toBe(true);
    expect(workshops(s).length).toBe(1);
    expect(s.monthlyReports.some((r) => r.training > 0)).toBe(true);
    expect(s.employees.some((e) => e.trainingUntil != null)).toBe(true);
    const talent = s.employees.find((e) => e.talentUntil != null);
    expect(talent).toBeDefined();
    expect(s.shows.some((x) => x.hostId === talent!.id)).toBe(false);
  }, 120_000);

  it('does none of it when training is left out', () => {
    const s = rich(without('training')(growthBot), 480);
    expect(s.rooms.some((r) => r.type === 'workshop')).toBe(false);
    expect(s.employees.some((e) => e.role === 'talentManager' || e.trainingUntil != null || e.talentUntil != null)).toBe(false);
    expect(s.monthlyReports.every((r) => r.training === 0)).toBe(true);
  }, 120_000);

  it('lets a weak host on air go, with severance, for a much better one, and the show keeps airing', () => {
    const start = prepared();
    const airing = onAir(start);
    expect(airing.length).toBeGreaterThan(1);
    // A star who fits every show on air: whichever host is the weakest that day is the one replaced.
    const star = { ...start.employees.find((e) => e.role === 'host')!, id: 'c-star', name: 'Star Host', skill: 95, fame: 0, specialties: [...new Set(airing.map((x) => x.genre))] } as unknown as GameState['candidates'][number];
    const s = tryDays(growthBot, start, 35, (x) => x.shows.some((sh) => x.employees.find((e) => e.id === sh.hostId)?.name === 'Star Host'), [star]);
    const show = s.shows.find((sh) => s.employees.find((e) => e.id === sh.hostId)?.name === 'Star Host')!;
    expect(show).toBeDefined();
    const before = start.shows.find((sh) => sh.id === show.id)!;
    expect(s.employees.some((e) => e.id === before.hostId)).toBe(false);
    expect(s.channels.some((c) => c.schedule.includes(show.id))).toBe(true);
    const next = tryDays(growthBot, s, 2, () => false, [star]);
    expect(next.ledger.severance > 0 || next.monthlyReports.some((r) => r.severance > 0)).toBe(true);
  }, 120_000);

  it('promotes a strong production person to head of production, and the show is covered again', () => {
    let start = rich(growthBot, 250);
    const crew = start.employees.filter((e) => e.role === 'production').sort((a, b) => b.skill - a.skill);
    const best = crew[0]!;
    const manager = { ...best, id: 'c-boss', name: 'Candidate Boss', role: 'manager', department: 'production', skill: 50 } as unknown as GameState['candidates'][number];
    start = {
      ...start,
      employees: start.employees.filter((e) => !(e.role === 'manager' && e.department === 'production')).map((e) => (e.id === best.id ? { ...e, skill: 90 } : e)),
      candidates: [...start.candidates.filter((c) => !(c.role === 'manager' && c.department === 'production')), manager],
    };
    const headOf = (s: GameState) => s.employees.find((e) => e.role === 'manager' && e.department === 'production');
    const s = tryDays(growthBot, start, 40, (x) => !!headOf(x), [manager]);
    expect(headOf(s)?.id).toBe(best.id);
    const after = tryDays(growthBot, s, 5, () => false);
    for (const show of after.shows) expect(show.staffIds.every((id) => after.employees.some((e) => e.id === id && e.role === 'production'))).toBe(true);
    const hired = tryDays(without('promotions')(growthBot), start, 40, (x) => !!headOf(x), [manager]);
    expect(headOf(hired)?.name).toBe('Candidate Boss');
    expect(hired.employees.find((e) => e.id === best.id)?.role).toBe('production');
  }, 120_000);

  it('has a psychologist coach an unsafe host instead of letting them go, and lets the psychologist go afterwards', () => {
    const start = prepared();
    const host = onAir(start).map((x) => start.employees.find((e) => e.id === x.hostId)!)[0]!;
    const psychologist = { ...host, id: 'c-psy', name: 'Dr Psy', role: 'psychologist', specialties: [] } as unknown as GameState['candidates'][number];
    const unsafe = { ...start, candidates: [...start.candidates, psychologist], employees: start.employees.map((e) => (e.id === host.id ? { ...e, conduct: { since: start.day, coachedUntil: null } } : e)) };
    const coached = tick(growthBot(unsafe));
    expect(coached.employees.find((e) => e.id === host.id)?.conduct?.coachedUntil).toBeGreaterThan(unsafe.day);
    expect(coached.employees.some((e) => e.role === 'psychologist')).toBe(true);
    const done = tryDays(growthBot, coached, 100, (x) => !x.employees.some((e) => e.role === 'psychologist'));
    expect(done.employees.find((e) => e.id === host.id)?.conduct?.cleared).toBe(true);
    expect(done.employees.some((e) => e.role === 'psychologist')).toBe(false);
  }, 120_000);

  it('lets the host go when coaching is left out, and the sensible bot does too', () => {
    const start = prepared();
    const host = onAir(start).map((x) => start.employees.find((e) => e.id === x.hostId)!)[0]!;
    const psychologist = { ...host, id: 'c-psy', name: 'Dr Psy', role: 'psychologist', specialties: [] } as unknown as GameState['candidates'][number];
    const unsafe = { ...start, candidates: [...start.candidates, psychologist], employees: start.employees.map((e) => (e.id === host.id ? { ...e, conduct: { since: start.day, coachedUntil: null } } : e)) };
    for (const bot of [without('coaching')(growthBot), sensibleBot]) {
      const s = tick(bot(unsafe));
      expect(s.employees.some((e) => e.id === host.id)).toBe(false);
      expect(s.employees.some((e) => e.role === 'psychologist')).toBe(false);
    }
  }, 120_000);
});
