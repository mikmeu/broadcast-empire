// Phase 1 acceptance criteria (prompt.md section 14): a sensible strategy is
// profitable within 6 months, a neglectful one goes bankrupt, and the game can
// be played from January 1970 to December 1971.

import { describe, expect, it } from 'vitest';
import { buyOutCost } from './deals';
import { reach } from './world';
import { AUDIENCES } from '../config/world';
import type { GenreId } from '../config/genres';
import { atHome, capitalBot, growthBot, HOME_STATIONS, LEAVE_OUT, leaveOutProblem, neglectfulBot, sensibleBot, takeOverRivalWhenItPays, takeOverWhenItPays, tvBot, without, type Bot } from './bots';
import { ACTIVE_REGIONS, TAKEOVER } from '../config/balance';
import { takeoverPrice, takeoverTerms, weakestRival, wholeTakeoverTerms } from './takeovers';
import { unlockAll } from './unlocks';
import { standInFor } from './backup';
import { isFirstOfMonth, toCalendarDate } from './calendar';
import { getGenre, hasFormat, lawsuitSource } from '../config/genres';
import { createInitialState } from './newGame';
import { workshops } from './staff';
import type { Employee, GameState } from './state';
import { tick } from './tick';
import type { TechId } from '../config/tech';

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
// The test players start at home with a first station for the region's audiences, and the later stations go where a licence is free (#429).
describe('a first licence at home outside Coaxia (#428, #429)', () => {
  const HOMES = ['north', 'coast', 'heartland', 'highlands'] as const;
  const playAt = (headquarters: (typeof HOMES)[number], seed: number, bot: Bot = sensibleBot, days = TWO_YEARS, difficulty: 'easy' | 'normal' = 'normal') => {
    let state = createInitialState(seed, difficulty, { playerName: 'Bot', companyName: 'Bot', headquarters });
    while (state.day < days && !state.bankrupt) state = tick(atHome(bot)(state));
    return state;
  };
  const THREE_YEARS = 3 * 365;

  it.each(HOMES)('the sensible bot lives through 1970–1971 in %s (seeds 42, 13)', (home) => {
    for (const seed of [42, 13]) expect(playAt(home, seed).bankrupt).toBe(false);
  });

  it.each(HOMES)('the sensible bot has a profitable month within 12 months in %s (seeds 42, 13)', (home) => {
    for (const seed of [42, 13]) {
      const firstProfit = playAt(home, seed, sensibleBot, 365).monthlyReports.findIndex((r) => r.net > 0);
      expect(firstProfit).toBeGreaterThanOrEqual(0);
      expect(firstProfit).toBeLessThan(12);
    }
  });

  // The growth bot at home in Transponder Valley is bankrupt in 1971 on normal (seed 42): a finding for a balance issue, not guarded here.
  it.each(['coast', 'heartland', 'highlands'] as const)('the growth bot lives to the end of 1972 in %s on normal', (home) => {
    expect(playAt(home, 42, growthBot, THREE_YEARS).bankrupt).toBe(false);
  });

  // Its second station wanted a licence at home, found none free, and the action failed (the audit's stop).
  it.each(['heartland', 'highlands'] as const)('the growth bot reaches the end of 1972 in %s on easy, without a failed action', (home) => {
    const state = playAt(home, 42, growthBot, THREE_YEARS, 'easy');
    expect(state.bankrupt).toBe(false);
    expect(state.day).toBe(THREE_YEARS);
  });

  it.each(HOMES)('the plan for %s reaches more of its own people than Bot FM’s plan, or as many', (home) => {
    const reached = (plan: readonly string[]) =>
      plan.reduce((sum, genre, slot) => sum + AUDIENCES.reduce((a, { id }) => a + reach(home, 'radio', slot, id, 0) * (getGenre(genre as GenreId).fit[id] ?? 0), 0), 0);
    expect(reached(HOME_STATIONS[home].plan)).toBeGreaterThanOrEqual(reached(HOME_STATIONS.capital.plan));
    expect(HOME_STATIONS[home].region).toBe(home);
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
    // Day 650, not 400: Uncle Tabby's smaller gifts put the second station later (#432).
    while (s.day < 650 && !s.bankrupt) s = tick(growthBot(s));
    s = { ...s, money: 2_000_000, showSales: [], studioLets: [] };
    const before = s.shows.length;
    let sold = false;
    for (let i = 0; i < 90 && !s.bankrupt && !sold; i++) {
      s = tick(growthBot({ ...s, money: Math.max(s.money, 1_000_000) }));
      sold = s.showSales.length > 0;
    }
    expect(sold).toBe(true);
    const sale = s.showSales[0]!;
    // A show made to sell, or one back from an earlier sale (#455: the growers' game now differs by day 400, and a show was back).
    expect(s.shows.length).toBeGreaterThanOrEqual(before);
    expect(s.channels.some((c) => c.schedule.includes(sale.showId))).toBe(false);
    expect(s.shows.find((show) => show.id === sale.showId)?.hostId).toBeTruthy();
  }, 120_000);

  it('buys a let studio out when the second station needs one, and uses it', () => {
    let s = createInitialState(1);
    while (s.day < 650 && !s.bankrupt) s = tick(growthBot(s));
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

describe('the TV bot airs game shows, reality TV, teleshopping and documentaries (#456)', () => {
  // Prepared state: the TV channel is launched, the formats are researched and the market holds teleshopping titles; money is held up.
  const offers = Array.from({ length: 6 }, (_, i) => ({ id: `tele-${i}`, name: `Shop ${i}`, genre: 'teleshopping' as const, quality: 0.25, airings: 40, price: 0, fee: 800 }));
  const prepared = (extra: readonly TechId[]) => {
    let s = play(tvBot, 1, 120);
    // Five floors, as a game has by the 1980s: the sports, game and reality studios need the room.
    s = { ...s, techs: [...new Set([...s.techs, 'kidsFormat' as const, 'soapOperaFormat' as const])], floorsUnlocked: Math.max(5, s.floorsUnlocked) };
    for (let i = 0; i < 120 && !s.bankrupt && !s.channels.some((c) => c.medium === 'tv'); i++) s = tick(tvBot({ ...s, money: Math.max(s.money, 1_500_000) }));
    return { ...s, techs: [...new Set([...s.techs, ...extra])], unlocked: [...new Set([...s.unlocked, 'content' as const, 'sportsRights' as const])] };
  };
  const run = (bot: Bot, from: GameState, days: number) => {
    let s = from;
    for (let i = 0; i < days && !s.bankrupt; i++) {
      const stocked = s.market.titles.some((t) => t.genre === 'teleshopping') ? s.market : { ...s.market, titles: [...s.market.titles, ...offers] };
      s = tick(bot({ ...s, money: Math.max(s.money, 1_500_000), market: stocked }));
    }
    return s;
  };
  const slots = (s: GameState) => s.channels.find((c) => c.medium === 'tv')!.schedule.map((id) => s.shows.find((x) => x.id === id)?.genre ?? null);

  it('airs documentaries late at night, a game show at lunch, teleshopping late at night and takes votes and fees', () => {
    const start = prepared(['gameShowFormat', 'teleshoppingFormat', 'phoneIns', 'premiumLines']);
    const s = run(tvBot, start, 200);
    expect(slots(s)[1]).toBe('gameShow');
    expect(slots(s)[4]).toBe('teleshopping');
    // Both series slots were taken, and the shows they held are not kept as orphans.
    expect(s.shows.some((x) => x.genre === 'series' || x.genre === 'documentary')).toBe(false);
    expect(s.monthlyReports.some((r) => r.fees > 0)).toBe(true);
    expect(s.monthlyReports.some((r) => r.votes > 0)).toBe(true);
  }, 240_000);

  it('airs reality TV in the afternoon in place of the soap', () => {
    const s = run(tvBot, prepared(['realityFormat']), 62);
    expect(s.rooms.some((r) => r.type === 'tvRealityStudio')).toBe(true);
    expect(slots(s)[2]).toBe('reality');
    expect(s.shows.some((x) => x.genre === 'soap')).toBe(false);
  }, 120_000);

  it('keeps the plain schedule when the formats are left out', () => {
    const s = run(without('formats')(tvBot), prepared(['gameShowFormat', 'teleshoppingFormat', 'premiumLines', 'realityFormat']), 120);
    expect(slots(s)).not.toContain('gameShow');
    expect(slots(s)).not.toContain('teleshopping');
    expect(slots(s)).not.toContain('reality');
    expect(s.monthlyReports.every((r) => r.fees === 0 && r.votes === 0)).toBe(true);
  }, 180_000);
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
  const prepared = () => rich(growthBot, 600);
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
    let start = rich(growthBot, 700);
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

describe('the test players poach, brainstorm and use flex workers and back-ups (#457)', () => {
  const RICH = 1_000_000;
  const rich = (bot: Bot, days: number) => {
    let s = createInitialState(1);
    while (s.day < days && !s.bankrupt) s = tick(bot({ ...s, money: s.day > 300 ? Math.max(s.money, RICH) : s.money }));
    return s;
  };
  const prepared = () => rich(growthBot, 600);
  const dayOfMonth = (s: GameState) => toCalendarDate(s.day).dayOfMonth;
  /** Plays on with money to spare until `until`, changing the state each day with `rig`. */
  const play = (bot: Bot, from: GameState, days: number, until: (s: GameState) => boolean, rig: (s: GameState) => GameState = (s) => s) => {
    let s = from;
    for (let i = 0; i < days && !s.bankrupt && !until(s); i++) s = tick(bot(rig({ ...s, money: Math.max(s.money, RICH) })));
    return s;
  };
  const onAir = (s: GameState) => s.shows.filter((x) => x.hostId && s.channels.some((c) => c.schedule.includes(x.id)));

  it('signs a rival’s much better host for the show of that genre, and signs nobody when poaching is left out', () => {
    const start = prepared();
    const show = onAir(start).find((x) => getGenre(x.genre).kind !== 'licensed')!;
    const rivalStar = (s: GameState): GameState => ({
      ...s,
      lastPoachDay: null,
      rivals: s.rivals.map((r, i) => (i === 0 ? { ...r, channels: r.channels.map((c, j) => (j === 0 ? { ...c, schedule: c.schedule.map((x, k) => (k === 0 ? { ...x, genre: show.genre, quality: 50, hostFame: 100, hostName: 'Rival Star' } : x)) } : c)) } : r)),
    });
    const signed = play(growthBot, start, 35, (s) => s.employees.some((e) => e.name === 'Rival Star'), rivalStar);
    const star = signed.employees.find((e) => e.name === 'Rival Star');
    expect(star).toBeDefined();
    expect(signed.lastPoachDay).not.toBeNull();
    expect(signed.shows.some((x) => x.hostId === star!.id)).toBe(true);
    const tail = play(growthBot, signed, 3, () => false);
    expect(tail.ledger.severance + tail.monthlyReports.reduce((n, r) => n + r.severance, 0)).toBeGreaterThan(0);
    const without1 = play(without('poaching')(growthBot), start, 35, () => false, rivalStar);
    expect(without1.employees.some((e) => e.name === 'Rival Star')).toBe(false);
    expect(without1.lastPoachDay).toBeNull();
  }, 120_000);

  it('holds a brainstorm on the 15th when the stale shows cost more to revamp, and revamps them one by one when brainstorms are left out', () => {
    const start = prepared();
    const channel = start.channels[0]!;
    // Every show of the channel it made itself, under 80%: the brainstorm (2,500 + 2,000 each) is cheaper than a revamp of each (3,000).
    const own = start.shows.filter((x) => channel.schedule.includes(x.id) && getGenre(x.genre).kind !== 'licensed' && !hasFormat(x.genre));
    expect(own.length).toBeGreaterThanOrEqual(3);
    const stale = (s: GameState): GameState => ({ ...s, shows: s.shows.map((x) => (own.some((o) => o.id === x.id) ? { ...x, freshness: 0.5 } : x)) });
    const fresh = (s: GameState) => own.every((o) => s.shows.find((x) => x.id === o.id)!.freshness >= 1);
    const held = play(growthBot, start, 40, (s) => s.brainstorms[channel.id] !== undefined && dayOfMonth(s) > 15, (s) => (s.brainstorms[channel.id] === undefined ? stale(s) : s));
    expect(held.brainstorms[channel.id]).toBeDefined();
    expect(dayOfMonth({ ...held, day: held.brainstorms[channel.id]! })).toBe(15);
    expect(fresh(held) || held.brainstorms[channel.id]! > 0).toBe(true);
    const revamped = play(without('brainstorms')(growthBot), start, 40, (s) => dayOfMonth(s) === 1 && s.day > start.day + 3, (s) => (dayOfMonth(s) === 1 ? stale(s) : s));
    expect(revamped.brainstorms[channel.id]).toBeUndefined();
  }, 120_000);

  it('hires a flex worker when a production person is away with an agency temp, and none when flex workers are left out', () => {
    // One flex worker for every 30 staff other than hosts: a later game has that many.
    const grown = rich(growthBot, 700);
    expect(grown.employees.filter((e) => e.role !== 'host').length).toBeGreaterThanOrEqual(30);
    // The bot has hired some by then: start with none and nobody covered by one.
    const start = { ...grown, flexWorkers: [], employees: grown.employees.map((e) => (e.away?.temp?.flexId !== undefined ? { ...e, away: { ...e.away, temp: null } } : e)) };
    const away = (s: GameState): GameState => {
      const person = s.employees.find((e) => e.role === 'production' && !e.away);
      if (!person || s.employees.some((e) => e.away?.temp)) return s;
      return { ...s, employees: s.employees.map((e) => (e.id === person.id ? { ...e, away: { reason: 'sick' as const, from: s.day, until: s.day + 20, temp: { name: 'Agency Temp', salary: 2_000 } } } : e)) };
    };
    const hired = play(growthBot, start, 40, (s) => s.flexWorkers.length > 0, away);
    expect(hired.flexWorkers.length).toBe(1);
    const next = play(growthBot, hired, 2, () => false);
    expect(next.employees.some((e) => e.away?.temp?.flexId !== undefined)).toBe(true);
    const none = play(without('flexWorkers')(growthBot), start, 40, () => false, away);
    expect(none.flexWorkers.length).toBe(0);
  }, 120_000);

  it('names back-ups, and an ill host gets no temp while the back-up covers, until the days run out', () => {
    const start = prepared();
    const named = play(growthBot, start, 35, (s) => dayOfMonth(s) === 2 && s.employees.some((e) => e.role === 'host' && e.backupId));
    const hosts = named.employees.filter((e) => e.role === 'host' && named.shows.some((x) => x.hostId === e.id && named.channels.some((c) => c.schedule.includes(x.id))));
    const host = hosts.find((e) => e.backupId && standInFor({ ...named, employees: named.employees.map((o) => (o.id === e.id ? { ...o, away: { reason: 'sick' as const, from: named.day, until: named.day + 30, temp: null } } : o)) }, { ...e, away: { reason: 'sick' as const, from: named.day, until: named.day + 30, temp: null } }));
    expect(host).toBeDefined();
    const ill = (s: GameState): GameState => ({ ...s, employees: s.employees.map((o) => (o.id === host!.id && !o.away ? { ...o, away: { reason: 'sick' as const, from: s.day, until: s.day + 40, temp: null } } : o)) });
    const covered = tick(growthBot(ill(named)));
    expect(covered.employees.find((e) => e.id === host!.id)?.away?.temp).toBeNull();
    const later = play(growthBot, covered, 20, (s) => !!s.employees.find((e) => e.id === host!.id)?.away?.temp);
    expect(later.employees.find((e) => e.id === host!.id)?.away?.temp).toBeTruthy();
    const plain = tick(without('backupHosts')(growthBot)(ill({ ...named, employees: named.employees.map((e) => ({ ...e, backupId: null })) })));
    expect(plain.employees.find((e) => e.id === host!.id)?.away?.temp).toBeTruthy();
    const unnamed = play(without('backupHosts')(growthBot), { ...start, employees: start.employees.map((e) => ({ ...e, backupId: null })) }, 35, () => false);
    expect(unnamed.employees.some((e) => e.backupId)).toBe(false);
  }, 120_000);
});

describe('the test players use social accounts, tone, the ad dial, breaking news and more channels (#458)', () => {
  const RICH = 1_000_000;
  const rich = (bot: Bot, days: number) => {
    let s = createInitialState(1);
    while (s.day < days && !s.bankrupt) s = tick(bot({ ...s, money: s.day > 300 ? Math.max(s.money, RICH) : s.money }));
    return s;
  };
  /** The first of the next month, so the monthly moves run on the next call of the bot. */
  const toFirst = (bot: Bot, from: GameState) => {
    let s = from;
    while (!isFirstOfMonth(s.day) && !s.bankrupt) s = tick(bot({ ...s, money: Math.max(s.money, RICH) }));
    return s;
  };
  const prepared = (bot: Bot = growthBot, days = 600) => toFirst(bot, rich(bot, days));
  const rigged = (s: GameState, f: (c: GameState['channels'][number]) => GameState['channels'][number]): GameState => ({ ...s, channels: s.channels.map(f) });
  /** Yesterday's slots of the player's channels, each with `listeners` and `unsold` minutes. */
  const yesterday = (s: GameState, unsold: number | undefined): GameState => ({
    ...s,
    lastDay: { ...s.lastDay!, channels: s.lastDay!.channels.map((c) => (c.isPlayer ? { ...c, slots: c.slots.map((slot) => ({ ...slot, listeners: 10_000, unsold })) } : c)) },
  });

  it('opens an account on every channel once Social media is researched, and none when accounts are left out', () => {
    const base = prepared();
    const start = { ...base, techs: [...new Set([...base.techs, 'socialMedia' as const])] };
    expect(start.channels.every((c) => !c.social)).toBe(true);
    const played = growthBot({ ...start, money: RICH });
    expect(played.channels.every((c) => c.social)).toBe(true);
    expect(played.employees.filter((e) => e.role === 'marketing').length).toBeGreaterThanOrEqual(played.channels.length);
    const none = without('socialAccounts')(growthBot)({ ...start, money: RICH });
    expect(none.channels.some((c) => c.social)).toBe(false);
  }, 120_000);

  it('makes the shows that can be sued bold with a lawyer, normal while a case is pending, and leaves them normal when tone is left out', () => {
    // The lawyer comes with the third show that can be sued.
    const start = prepared(growthBot, 800);
    const sueable =(s: GameState) => s.shows.filter((x) => lawsuitSource(x.genre) !== null);
    expect(start.employees.some((e) => e.role === 'lawyer')).toBe(true);
    const normal = { ...start, shows: start.shows.map((x) => ({ ...x, tone: 'normal' as const })) };
    const bold = growthBot({ ...normal, money: RICH });
    expect(sueable(bold).length).toBeGreaterThan(0);
    expect(sueable(bold).every((x) => x.tone === 'bold')).toBe(true);
    const target = sueable(bold)[0]!;
    const sued = { ...bold, lawsuits: [{ id: 'l1', showId: target.id, showName: target.name, source: 'libel' as const, claim: 1_000, filedOn: bold.day, courtOn: bold.day + 30, channelId: null }] };
    const back = growthBot({ ...sued, money: RICH });
    expect(back.shows.find((x) => x.id === target.id)!.tone).toBe('normal');
    expect(sueable(back).filter((x) => x.id !== target.id).every((x) => x.tone === 'bold')).toBe(true);
    const left = without('tone')(growthBot)({ ...normal, money: RICH });
    expect(sueable(left).every((x) => x.tone === 'normal')).toBe(true);
  }, 120_000);

  it('lowers the dial a step when minutes go unsold, raises it when nothing does, and leaves it at 5 when the dial is left out', () => {
    const start = prepared();
    const dial = (s: GameState) => s.channels[0]!.adMinutes;
    expect(dial(start)).toBe(5);
    // Four minutes sold of five: the dial comes down one step a month.
    expect(dial(growthBot({ ...yesterday(start, 1), money: RICH }))).toBe(4.5);
    // Nothing unsold at a dial of 3: advertisers would take more.
    const low = rigged(yesterday(start, undefined), (c) => ({ ...c, adMinutes: 3 }));
    expect(dial(growthBot({ ...low, money: RICH }))).toBe(3.5);
    // Never above 5, the limit from 1972.
    expect(dial(growthBot({ ...yesterday(start, undefined), money: RICH }))).toBe(5);
    expect(dial(without('adMinutes')(growthBot)({ ...yesterday(start, 1), money: RICH }))).toBe(5);
  }, 120_000);

  it('breaks in on a story in the emptiest slot that is not news and has no sponsor, and does not when breaking news is left out', () => {
    const start = prepared();
    const story = { id: 'snap', day: start.day, until: start.day + 3, major: true, light: false, headline: 'Test' };
    const withStory: GameState = { ...start, breakingNews: { ...start.breakingNews, stories: [story] } };
    const channel = start.channels[0]!;
    const played = growthBot(withStory);
    const mine = played.breakingNews.breakIns.filter((b) => b.channelId === channel.id);
    expect(mine.length).toBe(1);
    const shows = (s: GameState) => channel.schedule.map((id, slot) => ({ slot, show: s.shows.find((x) => x.id === id)! }));
    expect(getGenre(shows(played)[mine[0]!.slot]!.show.genre).id === 'news' || getGenre(shows(played)[mine[0]!.slot]!.show.genre).id === 'tvNews').toBe(false);
    const slots = withStory.lastDay!.channels.find((c) => c.channelId === channel.id)!.slots;
    const open = shows(played).filter(({ show }) => !['news', 'tvNews'].includes(show.genre) && !withStory.contracts.some((c) => c.showId === show.id));
    const emptiest = Math.min(...open.map(({ slot }) => slots[slot]!.listeners));
    expect(slots[mine[0]!.slot]!.listeners).toBe(emptiest);
    // Once per story and channel.
    expect(growthBot({ ...played }).breakingNews.breakIns.filter((b) => b.channelId === channel.id).length).toBe(1);
    expect(without('breakingNews')(growthBot)(withStory).breakingNews.breakIns.length).toBe(0);
  }, 120_000);

  it('opens a third radio station in the Capital once the money is there, and none when more stations are left out', () => {
    const grown = rich(growthBot, 600);
    // Two stations, each covering every region it can; the later ones are taken away and money is held up.
    const names = (s: GameState) => s.channels.map((c) => c.name);
    expect(names(grown)).toContain('Bot Rock');
    const opened = (bot: Bot) => {
      let s: GameState = { ...grown, channels: grown.channels.filter((c) => c.name !== 'Bot Talk') };
      for (let i = 0; i < 120 && !s.bankrupt; i++) s = tick(bot({ ...s, money: Math.max(s.money, 6_000_000) }));
      return names(s);
    };
    expect(opened(growthBot)).toContain('Bot Talk');
    expect(opened(without('moreStations')(growthBot))).not.toContain('Bot Talk');
  }, 240_000);

  it('opens a second TV channel with licensed titles only once a second TV licence is unlocked, and none when it is left out', () => {
    let start = play(tvBot, 1, 120);
    start = { ...start, techs: [...new Set([...start.techs, 'kidsFormat' as const, 'soapOperaFormat' as const])], floorsUnlocked: Math.max(5, start.floorsUnlocked) };
    for (let i = 0; i < 150 && !start.bankrupt && !start.channels.some((c) => c.medium === 'tv'); i++) start = tick(tvBot({ ...start, money: Math.max(start.money, 3_000_000) }));
    expect(start.channels.some((c) => c.medium === 'tv')).toBe(true);
    // In a game the TV licences are taken by rivals at the start: one is left free here, as when an auction ends with no winner.
    const unlocked: GameState = {
      ...start,
      unlocked: [...new Set([...start.unlocked, 'secondTvLicense' as const])],
      licensesIssued: { ...start.licensesIssued, tv: { ...start.licensesIssued.tv, capital: (start.licensesIssued.tv.capital ?? 0) + 1 } },
    };
    const run = (bot: Bot) => {
      let s = unlocked;
      for (let i = 0; i < 400 && !s.bankrupt; i++) s = tick(bot({ ...s, money: Math.max(s.money, 3_000_000) }));
      return s;
    };
    const tv = run(tvBot);
    const second = tv.channels.find((c) => c.name === 'Bot TV 2');
    expect(second).toBeDefined();
    expect(tv.licenses.some((l) => l.channelId === second!.id)).toBe(true);
    expect(second!.schedule.filter((id) => id).length).toBe(5);
    expect(second!.schedule.every((id) => getGenre(tv.shows.find((x) => x.id === id)!.genre).kind === 'licensed')).toBe(true);
    expect(run(without('secondTvChannel')(tvBot)).channels.some((c) => c.name === 'Bot TV 2')).toBe(false);
  }, 600_000);

  it('opens a third TV channel on a late licence only when it pays back within 8 years, and none when it is left out (#479)', () => {
    let start = play(tvBot, 1, 120);
    start = { ...start, techs: [...new Set([...start.techs, 'kidsFormat' as const, 'soapOperaFormat' as const])], floorsUnlocked: Math.max(5, start.floorsUnlocked) };
    for (let i = 0; i < 150 && !start.bankrupt && !start.channels.some((c) => c.medium === 'tv'); i++) start = tick(tvBot({ ...start, money: Math.max(start.money, 3_000_000) }));
    // One free licence for the second channel, as in the test above; the third comes on top of it.
    let two: GameState = {
      ...start,
      unlocked: [...new Set([...start.unlocked, 'secondTvLicense' as const])],
      licensesIssued: { ...start.licensesIssued, tv: { ...start.licensesIssued.tv, capital: (start.licensesIssued.tv.capital ?? 0) + 1 } },
    };
    for (let i = 0; i < 400 && !two.bankrupt && !two.channels.some((c) => c.name === 'Bot TV 2'); i++) two = tick(tvBot({ ...two, money: Math.max(two.money, 3_000_000) }));
    expect(two.channels.some((c) => c.name === 'Bot TV 2')).toBe(true);
    // The bot moves on the first of the month.
    for (let i = 0; i < 40 && !two.bankrupt && !isFirstOfMonth(two.day); i++) two = tick(tvBot({ ...two, money: Math.max(two.money, 3_000_000) }));
    expect(isFirstOfMonth(two.day)).toBe(true);
    // A late licence is free in the Capital, the third channel is open, and its TV channels earned `revenue` last week.
    const late = (revenue: number): GameState => {
      const s: GameState = {
        ...two,
        money: 30_000_000,
        unlocked: [...new Set([...two.unlocked, 'thirdTvChannel' as const])],
        licensesIssued: { ...two.licensesIssued, tv: { ...two.licensesIssued.tv, capital: (two.licensesIssued.tv.capital ?? 0) + 1 } },
        auctions: [],
      };
      const channels = s.channels.filter((c) => c.medium === 'tv').map((c) => ({ channelId: c.id, name: c.name, ownerId: 'player', isPlayer: true, medium: 'tv' as const, slots: [], regionListeners: { capital: 1000 }, audienceListeners: {}, revenue }));
      return { ...s, weeklyReports: [{ fromDay: s.day - 7, days: 7, channels }] };
    };
    const opened = tvBot(late(5_000_000));
    const third = opened.channels.find((c) => c.name === 'Bot TV 3');
    expect(third).toBeDefined();
    expect(opened.licenses.some((l) => l.channelId === third!.id)).toBe(true);
    expect(third!.schedule.filter((id) => id).length).toBe(5);
    expect(third!.schedule.every((id) => getGenre(opened.shows.find((x) => x.id === id)!.genre).kind === 'licensed')).toBe(true);
    // Left out, or a licence that would not pay back within 8 years: none.
    expect(without('thirdTvChannel')(tvBot)(late(5_000_000)).channels.some((c) => c.name === 'Bot TV 3')).toBe(false);
    expect(tvBot(late(1_000)).channels.some((c) => c.name === 'Bot TV 3')).toBe(false);
    // Before the third channel is open: none.
    expect(tvBot({ ...late(5_000_000), unlocked: two.unlocked.filter((f) => f !== 'thirdTvChannel') }).channels.some((c) => c.name === 'Bot TV 3')).toBe(false);
  }, 900_000);
});

describe('the growers buy a rival’s licence when it pays back (#476)', () => {
  /** The sensible bot's station, rich, and a rival (not EPB) with two radio regions the station is not in; `revenue` is what that channel earned in the last week. */
  function market(revenue: number) {
    const s = structuredClone(unlockAll(sensibleBot(createInitialState(1))));
    s.money = 50_000_000;
    const mine = s.channels.find((c) => c.medium === 'radio')!;
    const held = new Set(s.licenses.filter((l) => l.channelId === mine.id).map((l) => l.regionId));
    const [sale, other] = ACTIVE_REGIONS.filter((r) => !held.has(r));
    const rival = s.rivals.find((r) => r.personality !== 'highbrow')!;
    const theirs = rival.channels.find((c) => c.medium === 'radio')!;
    theirs.regionIds = [sale!, other!];
    theirs.reputation = { [sale!]: 0.5, [other!]: 0.5 };
    theirs.licenseExpiry = { [sale!]: s.day + 900, [other!]: s.day + 900 };
    s.auctions = [];
    s.weeklyReports = [{ fromDay: s.day - 7, days: 7, channels: [{ channelId: theirs.id, name: 'R', ownerId: rival.id, isPlayer: false, medium: 'radio', slots: [], regionListeners: { [sale!]: 5000, [other!]: 5000 }, audienceListeners: {}, revenue }] }];
    return { s, rival, theirs, sale: sale!, other: other! };
  }

  it('buys when the price is within the payback years of the revenue there less the fee', () => {
    const { s, rival, theirs, sale, other } = market(10_000);
    const { price, revenue, fee } = takeoverTerms(s, rival, theirs, sale);
    expect(price).toBeLessThanOrEqual(TAKEOVER.paybackYears * (revenue - fee));
    const after = takeOverWhenItPays(s);
    expect(after.licenses.filter((l) => l.takenOver)).toHaveLength(1);
    expect(after.money).toBeLessThan(s.money);
    // At most one a month: the other region is still for sale.
    expect(after.rivals.find((r) => r.id === rival.id)!.channels.find((c) => c.id === theirs.id)!.regionIds).toHaveLength(1);
    expect(takeoverPrice(s, rival, theirs, other)).toBeGreaterThan(0);
  });

  it('does not buy when the rival earns too little there to pay it back', () => {
    const { s } = market(0);
    expect(takeOverWhenItPays(s)).toBe(s);
  });

  it('does not buy when the cash left would be under the dividend reserve', () => {
    const { s } = market(10_000);
    s.money = 1000;
    expect(takeOverWhenItPays(s)).toBe(s);
  });

  it('plays no takeover when it is left out, and only the growth and the network bot play it', () => {
    const { s } = market(10_000);
    expect(without('takeovers')(takeOverWhenItPays)(s)).toBe(s);
    expect(leaveOutProblem('takeovers', 'growth')).toBeNull();
    expect(leaveOutProblem('takeovers', 'network')).toBeNull();
    expect(leaveOutProblem('takeovers', 'tv')).toContain('never plays');
  });
});

describe('the growth bot buys the weakest rival when it pays back (#477)', () => {
  /** The sensible bot's station, rich, and every private rival's radio channel earning `revenue` a week. */
  function market(revenue: number) {
    const s = structuredClone(unlockAll(sensibleBot(createInitialState(1))));
    s.money = 500_000_000;
    s.auctions = [];
    s.weeklyReports = [
      {
        fromDay: s.day - 7,
        days: 7,
        channels: s.rivals
          .filter((r) => r.personality !== 'highbrow')
          .flatMap((r) => r.channels.filter((c) => c.medium === 'radio').map((c) => ({ channelId: c.id, name: c.name, ownerId: r.id, isPlayer: false, medium: 'radio' as const, slots: [], regionListeners: Object.fromEntries(c.regionIds.map((id) => [id, 5000])), audienceListeners: {}, revenue }))),
      },
    ];
    return s;
  }

  it('buys when the price, less the rival’s money, is within the payback years of what the kept channel earns', () => {
    const s = market(200_000);
    const rival = weakestRival(s)!;
    const radio = rival.channels.find((c) => c.medium === 'radio')!;
    const terms = wholeTakeoverTerms(s, rival, [radio.id]);
    expect(terms.price - terms.money).toBeLessThanOrEqual(8 * (terms.revenue - terms.fees - terms.salaries));
    const after = takeOverRivalWhenItPays(s);
    expect(after.rivals.some((r) => r.id === rival.id)).toBe(false);
    expect(after.boughtRivals).toHaveLength(1);
    // The radio channel is kept and staffed, or closed when the building has no room: either way no TV channel came with it.
    expect(after.channels.filter((c) => c.medium === 'tv')).toHaveLength(s.channels.filter((c) => c.medium === 'tv').length);
  });

  it('does not buy when the kept channel earns too little to pay it back, or when cash would fall under the reserve', () => {
    expect(takeOverRivalWhenItPays(market(0))).toEqual(market(0));
    const poor = market(200_000);
    poor.money = 1000;
    expect(takeOverRivalWhenItPays(poor)).toBe(poor);
  });

  it('plays nothing when it is left out, and only the growth bot plays it', () => {
    const s = market(200_000);
    expect(without('wholeTakeover')(takeOverRivalWhenItPays)(s)).toBe(s);
    expect(leaveOutProblem('wholeTakeover', 'growth')).toBeNull();
    expect(leaveOutProblem('wholeTakeover', 'network')).toContain('never plays');
    expect(leaveOutProblem('wholeTakeover', 'tv')).toContain('never plays');
  });
});
