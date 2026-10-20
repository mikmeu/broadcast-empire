import { describe, expect, it } from 'vitest';
import { SALARY, STREAMING, TALENT_MANAGER_CANDIDATES, TRAINING, WORKSHOP } from '../config/balance';
import { ELECTIONS } from '../config/events';
import { HINTS } from '../config/guide';
import { FURNITURE, ONE_DESK_ROOMS, STUDIO_REQUIREMENTS, type FurnitureType, type RoomType } from '../config/office';
import { TO_RECORD } from '../config/voiceOver';
import { getArticle, stringsOf } from '../wiki/articles';
import type { Block } from '../wiki/types';
import { buildRoom, closeStreaming, hire, openStreaming, releaseRoom, sellFurniture, sendOnTraining, sendToTalentProgramme, setStreamingPrice, type ActionResult } from './actions';
import { simulateDay, watchedOnDemand } from './broadcast';
import { sensibleBot, streamBot, tvBot, type Bot } from './bots';
import { toCalendarDate, toDay } from './calendar';
import { runCheat } from './cheats';
import { monthlyNet, outlook, RUNNING_COSTS } from './economy';
import { electionOn, runEvents } from './events';
import { addMissingEquipment, autoPlaceFurniture } from './fixtures';
import { generateCandidates } from './generate';
import { createInitialState } from './newGame';
import { deskFor, deskRoomFor, employeesWithDesk } from './office';
import { campaignStart, catchUpElections, governmentFalls, holdElection, monthsAfter, regularElection } from './politics';
import { Rng } from './rng';
import { proposeRoom } from './rooms';
import { fromSaveFile, SAVE_VERSION, toSaveFile } from './save';
import { slow } from './slow';
import { inHouseCourse, talentBlocker, trainingBlocker, trainingCost, workshops } from './staff';
import { emptyLedger, type GameState, type Person, type RentedRoom, type Title } from './state';
import { fairPrice, priceFactor, streamingBlocker, streamingTarget } from './streaming';
import { teamOf } from './teams';
import { advance, tick } from './tick';
import { unlockAll } from './unlocks';

/** A library with `racks` server racks, written straight into the game: the rules count racks, not where they stand. */
function library(racks: number, tier = 1): RentedRoom {
  return {
    roomId: 'lib-test',
    name: 'Library 1',
    floor: 1,
    x: 0,
    y: 0,
    w: 6,
    h: 4,
    door: { x: 3.5, z: 4 },
    type: 'library',
    furniture: Array.from({ length: racks }, (_, i) => ({ id: `rack${i}`, type: 'serverRack' as const, x: i * 2, y: 0, turn: 0, tier, condition: 100, boughtOn: 0 })),
    cleanliness: 100,
    issue: null,
  };
}

const title = (i: number, freshness = 1): Title => ({ id: `title${i}`, name: `Film ${i}`, genre: 'movies', quality: 0.7, airingsLeft: 10, freshness, fee: 0, perAiring: 400 });

/** A company in 2016 that has researched Streaming, with racks and a library of titles to offer. */
function ready(racks = 2, titles = 20, freshness = 1): GameState {
  const s = createInitialState(1);
  s.day = toDay(2016, 3, 1);
  s.techs = ['streaming'];
  s.rooms.push(library(racks));
  s.library = Array.from({ length: titles }, (_, i) => title(i, freshness));
  return s;
}

const opened = (s: GameState, price: number = STREAMING.price.start) => {
  const result = openStreaming(s, price);
  if (!result.ok) throw new Error(result.error);
  return result.state;
};

const play = (bot: Bot, state: GameState, days: number) => {
  let s = state;
  for (let i = 0; i < days && !s.bankrupt; i++) s = tick(bot(s));
  return s;
};

describe('a streaming service (R74)', () => {
  it('opens only once it is researched, with racks and enough to offer, and says why not', () => {
    const none = createInitialState(1);
    expect(openStreaming(none, 8)).toMatchObject({ ok: false, error: 'Research Streaming first.' });
    const researched = { ...createInitialState(1), techs: ['streaming' as const] };
    expect(streamingBlocker(researched)).toBe(`Needs ${STREAMING.minRacks} server racks in a library.`);
    expect(streamingBlocker(ready(2, STREAMING.minCatalogue - 1))).toBe(`Needs ${STREAMING.minCatalogue} shows on the air or titles in the library.`);
    // Teleshopping is not on the service.
    const shopping = ready(2, STREAMING.minCatalogue - 1);
    shopping.library.push({ ...title(99), genre: 'teleshopping' });
    expect(streamingBlocker(shopping)).not.toBeNull();

    const s = ready();
    expect(openStreaming(s, STREAMING.price.max + 1)).toMatchObject({ ok: false });
    const open = opened(s);
    expect(open.streaming).toMatchObject({ since: s.day, price: STREAMING.price.start, subscribers: 0 });
    expect(open.headlines.at(-1)!.text).toContain('streaming service');
    expect(openStreaming(open, 8)).toMatchObject({ ok: false, error: 'Your streaming service is open already.' });

    expect(setStreamingPrice(open, 11.3)).toMatchObject({ ok: true, state: { streaming: { price: 11.5 } } });
    expect(closeStreaming(open)).toMatchObject({ ok: true, state: { streaming: null } });
    expect(closeStreaming(s)).toMatchObject({ ok: false });
  });

  it('draws fewer subscribers at a higher price, and the best price is near the fair one', () => {
    const s = ready();
    const fair = fairPrice(2016);
    expect(streamingTarget(s, 14).demand).toBeLessThan(streamingTarget(s, 8).demand);
    expect(priceFactor(fair, fair)).toBe(1);
    // Revenue at the fair price beats revenue well above it.
    const income = (price: number) => streamingTarget(s, price).demand * price;
    expect(income(fair)).toBeGreaterThan(income(fair + 5));
    expect(income(fair)).toBeGreaterThan(income(STREAMING.price.min));
  });

  it('loses subscribers when its catalogue goes stale', () => {
    let s = opened(ready(4, 20, 1));
    for (let i = 0; i < 90; i++) s = tick(s);
    const before = s.streaming!.subscribers;
    expect(before).toBeGreaterThan(0);
    for (const t of s.library) t.freshness = 0.3;
    // Titles off the air get fresh again by themselves: keep them stale for the test.
    for (let i = 0; i < 60; i++) {
      s = tick(s);
      for (const t of s.library) t.freshness = 0.3;
    }
    expect(s.streaming!.subscribers).toBeLessThan(before * 0.6);
  });

  it('never has more subscribers than its racks serve, and says once that it is full', () => {
    let s = opened(ready(2, 60));
    s.day = toDay(2029, 3, 1);
    const capacity = 2 * STREAMING.subscribersPerRack[0]!;
    expect(streamingTarget(s).demand).toBeGreaterThan(capacity);
    const full = (x: GameState) => x.messages.filter((m) => m.text.startsWith('Your streaming service is full')).length;
    s = tick(s);
    expect(full(s)).toBe(1);
    for (let i = 0; i < 120; i++) {
      s = tick(s);
      expect(full(s)).toBeLessThanOrEqual(1);
    }
    expect(s.streaming!.subscribers).toBeLessThanOrEqual(capacity);
    expect(s.streaming!.subscribers).toBeGreaterThan(capacity * 0.95);
    expect(s.streaming!.capped).toBe(true);
  });

  it('pays its subscriptions into the revenue and its costs among the running costs', () => {
    let s = opened(ready(4, 20));
    for (let i = 0; i < 40 && s.day < toDay(2016, 4, 1) - 1; i++) s = tick(s);
    expect(s.ledger.subscriptions).toBeGreaterThan(0);
    expect(s.ledger.revenue).toBeGreaterThanOrEqual(s.ledger.subscriptions);
    expect(s.ledger.streaming).toBeGreaterThan(0);
    expect(RUNNING_COSTS).toContain('streaming');
    expect(monthlyNet({ ...emptyLedger(), streaming: 100 })).toBe(-100);
    const ahead = outlook(s);
    expect(ahead.subscriptions).toBeCloseTo(s.streaming!.subscribers * s.streaming!.price);
    expect(ahead.streaming).toBeGreaterThan(0);
  });

  it('opens the rival services in their years, in the news', () => {
    let s = ready();
    s.day = toDay(2013, 12, 31);
    s = tick(s);
    expect(s.headlines.some((h) => h.text.includes('EPB+'))).toBe(true);
    expect(streamingTarget(s).rivals.map((r) => r.name)).toEqual(['EPB+']);
    s.day = toDay(2030, 1, 1);
    expect(streamingTarget(s).rivals.find((r) => r.name === 'Nimbus')!.appeal).toBeCloseTo(0.35 + 13 * 0.03);
  });

  it('a game from before loads without a service, and the year code moves the day it opened', () => {
    const s = ready();
    const save = toSaveFile(s, 1) as unknown as { version: number; state: Record<string, any> };
    delete save.state.streaming;
    delete save.state.ledger.subscriptions;
    delete save.state.ledger.streaming;
    // Save version 34 is that of the workshop (R140), which came before it in 0.18.0.
    const { state, version } = fromSaveFile({ ...save, version: 34 });
    expect(version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(35);
    expect(state.streaming).toBeNull();
    expect(state.ledger).toMatchObject({ subscriptions: 0, streaming: 0 });

    const open = opened(s);
    const moved = runCheat(open, 'year 2020');
    expect(moved.ok && moved.state.streaming!.since - open.streaming!.since).toBe(toDay(2020, 3, 1) - toDay(2016, 3, 1));
  });

  it('Penny brings it up, the line waits for its recording, and the wiki has an article', () => {
    expect(HINTS.find((h) => h.id === 'streaming')).toMatchObject({ to: 'broadcast:streaming', wiki: 'streaming' });
    expect(TO_RECORD.streaming).toBe('new');
    expect(getArticle('streaming').title).toBe('Streaming');
  });

  describe('against the TV test player', () => {
    // The TV bot's company after a year, moved to 2014 with everything researched: a TV company of the streaming years.
    const start = (() => {
      const grown = play(tvBot, createInitialState(2), 400);
      const moved = runCheat(grown, 'year 2014');
      if (!moved.ok) throw new Error(moved.error);
      const all = runCheat(moved.state, 'research all');
      if (!all.ok) throw new Error(all.error);
      return all.state;
    })();

    it('a game without a service draws the viewers it did; one with a service draws fewer on its own TV, and rivals none fewer', () => {
      expect(watchedOnDemand(start)).toBe(1);
      const plain = simulateDay(start);
      const streaming = simulateDay({ ...start, streaming: { since: start.day, price: 8, subscribers: 20_000, weekAgo: 0, capped: false } });
      const total = (r: typeof plain, pick: (c: (typeof plain.channels)[number]) => boolean) =>
        r.channels.filter(pick).reduce((sum, c) => sum + c.slots.reduce((x, slot) => x + slot.listeners, 0), 0);
      const ownTv = (c: (typeof plain.channels)[number]) => c.isPlayer && c.medium === 'tv';
      expect(total(streaming, ownTv)).toBeLessThan(total(plain, ownTv));
      expect(total(streaming, ownTv)).toBeGreaterThan(total(plain, ownTv) * 0.98);
      expect(total(streaming, (c) => !ownTv(c))).toBeCloseTo(total(plain, (c) => !ownTv(c)));
    });

    it(
      'earns more with a service than without, the subscriptions a fair part of it',
      () => {
        const days = 730;
        const revenue = (s: GameState) => s.monthlyReports.reduce((sum, r) => sum + r.revenue, 0);
        const subscriptions = (s: GameState) => s.monthlyReports.reduce((sum, r) => sum + r.subscriptions, 0);
        const before = revenue(start);
        const tv = play(tvBot, start, days);
        const stream = play(streamBot, start, days);
        expect(tv.bankrupt || stream.bankrupt).toBe(false);
        expect(stream.streaming).not.toBeNull();
        expect(revenue(stream) - before).toBeGreaterThan(revenue(tv) - before);
        // Measured over three seeds from 1970 (npm run simulate -- --bot stream): 9% of revenue in 2012, 24–26% by 2029.
        const share = subscriptions(stream) / (revenue(stream) - before);
        expect(share).toBeGreaterThan(0.05);
        expect(share).toBeLessThan(0.3);
      },
      slow(120_000),
    );
  });
});

/** A new game with its elections held up to a day. */
function worldOn(seed: number, day: number): GameState {
  const s = { ...createInitialState(seed), day };
  catchUpElections(s);
  return s;
}

/** The first seed whose world has a snap election before 2000. */
function seedWithSnap(): number {
  for (let seed = 1; ; seed++) if (worldOn(seed, toDay(2000, 1, 1)).politics.history.some((e) => e.snap)) return seed;
}

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}
const error = (result: ActionResult) => (result.ok ? '' : result.error);

/** A radio station from the sensible test player, a month on the air, with everything open, money to spare and two floors. */
const station = (days = 30): GameState => {
  const s = structuredClone(unlockAll(advance(sensibleBot(createInitialState(1)), days)));
  s.money = 5_000_000;
  s.floorsUnlocked = 2;
  return s;
};

/** Hires a made-up person straight from the pool. */
function hirePerson(state: GameState, person: Partial<Person> & Pick<Person, 'role'>): GameState & { lastId?: string } {
  const s = structuredClone(state);
  const id = `p-${s.nextId++}`;
  s.candidates.push({ id, name: `Test ${person.role} ${id}`, skill: 50, salary: 2_000, specialties: [], fame: 0, department: null, ...person });
  return Object.assign(ok(hire(s, id)), { lastId: id });
}

/** Builds a room of a kind where the game proposes it, with everything on its checklist and the extra pieces. Its id is `lastId`. */
function room(state: GameState, type: RoomType, ...extra: FurnitureType[]): GameState & { lastId?: string } {
  const floor = [1, 2].find((f) => proposeRoom(state, f, type))!;
  let s = ok(buildRoom(state, { ...proposeRoom(state, floor, type)!, type }));
  const id = s.lastId!;
  if (STUDIO_REQUIREMENTS[type]) s = ok(addMissingEquipment(s, id));
  for (const piece of extra) s = ok(autoPlaceFurniture(s, id, piece));
  return Object.assign(s, { lastId: id });
}

/** A workshop with everything it needs (two training seats) and a talent manager at its desk. Its id is `workshop`. */
function withWorkshop(state: GameState, ...extra: FurnitureType[]): GameState & { workshop: string; lastId?: string } {
  const built = room(state, 'workshop', ...extra);
  const id = built.lastId!;
  return Object.assign(hirePerson(built, { role: 'talentManager' }), { workshop: id });
}

describe('version 0.18.0', () => {
  describe('the workshop and the talent manager (R140)', () => {
    it('is a room of its own with a trainer’s desk, two training seats and a whiteboard on wheels', () => {
      expect(STUDIO_REQUIREMENTS.workshop).toEqual({ trainerDesk: 1, trainingSeat: 2, whiteboard: 1 });
      for (const type of ['trainerDesk', 'trainingSeat', 'whiteboard'] as const) expect(FURNITURE[type].rooms).toEqual(['workshop']);
      expect(ONE_DESK_ROOMS.workshop).toBe('trainerDesk');
      expect(deskFor('talentManager')).toBe('trainerDesk');
      expect(deskRoomFor('talentManager')).toBe('workshop');
      // Like the managers, they belong to no team.
      expect(teamOf('talentManager')).toBeNull();
    });

    it('comes to the hiring pool once a month, at a salary of their own', () => {
      const pool = generateCandidates(createInitialState(3), new Rng(7), 1980).filter((p) => p.role === 'talentManager');
      expect(pool).toHaveLength(TALENT_MANAGER_CANDIDATES);
      for (const p of pool) {
        expect(p.salary).toBeGreaterThanOrEqual(SALARY.talentManager.min);
        expect(p.salary).toBeLessThanOrEqual(SALARY.talentManager.max * 1.5);
      }
    });

    it('works at the trainer’s desk, and only in a workshop that has all it needs', () => {
      const s = withWorkshop(station());
      const manager = s.lastId!;
      expect(employeesWithDesk(s).get(manager)?.roomId).toBe(s.workshop);
      expect(workshops(s)).toHaveLength(1);
      expect(workshops(s)[0]).toMatchObject({ seats: 2, pupils: [] });
      // Without the whiteboard there is no workshop to teach in.
      const bare = structuredClone(s);
      const shop = bare.rooms.find((r) => r.roomId === s.workshop)!;
      shop.furniture = shop.furniture.filter((f) => f.type !== 'whiteboard');
      expect(employeesWithDesk(bare).has(manager)).toBe(false);
      expect(workshops(bare)).toHaveLength(0);
    });
  });

  describe('a course in the house (R140)', () => {
    it('needs no head of the department, and costs a month of salary instead of two', () => {
      const plain = station();
      const producer = plain.employees.find((e) => e.role === 'production')!;
      // Outside, as before: the head of Production arranges it.
      expect(trainingBlocker(plain, producer)).toMatch(/arranged by the head of Production/);
      expect(trainingCost(plain, producer)).toBe(Math.round((producer.salary * TRAINING.salaryMonths) / 100) * 100);

      const s = withWorkshop(plain);
      expect(trainingBlocker(s, producer)).toBeNull();
      expect(trainingCost(s, producer)).toBe(Math.round((producer.salary * WORKSHOP.salaryMonths) / 100) * 100);
      const sent = ok(sendOnTraining(s, producer.id));
      expect(s.money - sent.money).toBe(trainingCost(s, producer));
      expect(sent.ledger.training).toBe(trainingCost(s, producer));
      const away = sent.employees.find((e) => e.id === producer.id)!;
      expect(away).toMatchObject({ trainingUntil: s.day + TRAINING.days, courseIn: s.workshop });
    });

    it('takes one to a seat, from any job, and the next one waits', () => {
      const start = withWorkshop(station());
      const shop = start.workshop;
      let s: GameState = start;
      const producers = s.employees.filter((e) => e.role === 'production');
      expect(producers.length).toBeGreaterThanOrEqual(2);
      const host = s.employees.find((e) => e.role === 'host')!;
      // Two of the same job at once, which a course outside does not allow.
      s = ok(sendOnTraining(s, producers[0]!.id));
      s = ok(sendOnTraining(s, producers[1]!.id));
      expect(workshops(s)[0]!.pupils).toHaveLength(2);
      expect(inHouseCourse(s)).toBeUndefined();
      // Every seat is taken: outside, a host still goes, with a channel manager, at the old price.
      expect(trainingCost(s, host)).toBe(Math.round((host.salary * TRAINING.salaryMonths) / 100) * 100);
      s = ok(sendOnTraining(s, host.id));
      expect(s.employees.find((e) => e.id === host.id)!.courseIn).toBeNull();
      // And a third producer has nowhere to go: there is no head of Production.
      if (producers[2]) expect(trainingBlocker(s, producers[2])).toMatch(/Every training seat is taken/);
      // A third seat makes room.
      const seated = ok(autoPlaceFurniture(s, shop, 'trainingSeat'));
      expect(inHouseCourse(seated)).toMatchObject({ seats: 3 });
    });

    it('lets a course finish when the workshop is given up, and a new one is outside', () => {
      const start = withWorkshop(station());
      const shop = start.workshop;
      let s: GameState = start;
      const producer = s.employees.find((e) => e.role === 'production')!;
      s = ok(sendOnTraining(s, producer.id));
      for (const piece of s.rooms.find((r) => r.roomId === shop)!.furniture) s = ok(sellFurniture(s, shop, piece.id));
      s = ok(releaseRoom(s, shop));
      expect(s.rooms.some((r) => r.roomId === shop)).toBe(false);
      expect(workshops(s)).toHaveLength(0);
      const away = s.employees.find((e) => e.id === producer.id)!;
      expect(away.trainingUntil).not.toBeNull();
      // Nobody else is sent outside without a head of Production.
      const other = s.employees.find((e) => e.role === 'production' && e.id !== producer.id)!;
      expect(error(sendOnTraining(s, other.id))).toMatch(/head of Production/);
      s = advance(s, TRAINING.days);
      const back = s.employees.find((e) => e.id === producer.id)!;
      expect(back).toMatchObject({ trainingUntil: null, courseIn: null });
      expect(back.skill).toBeGreaterThan(producer.skill);
    });
  });

  describe('the talent programme (R140)', () => {
    it('is arranged by the talent manager, no longer by a channel manager', () => {
      let s: GameState & { lastId?: string } = hirePerson(station(), { role: 'host', skill: 30 });
      const host = s.lastId!;
      expect(s.employees.some((e) => e.role === 'channelManager')).toBe(true);
      expect(talentBlocker(s, s.employees.find((e) => e.id === host)!)).toMatch(/arranged by a talent manager/);
      s = withWorkshop(s);
      expect(talentBlocker(s, s.employees.find((e) => e.id === host)!)).toBeNull();
      s = ok(sendToTalentProgramme(s, host));
      // It takes no training seat.
      expect(workshops(s)[0]!.pupils).toHaveLength(0);
    });
  });

  describe('an older save (R140)', () => {
    it('loads with every running course outside', () => {
      const s = station();
      const old = JSON.parse(JSON.stringify(toSaveFile(s, 0)));
      old.state.employees[0].trainingUntil = s.day + 10;
      for (const e of old.state.employees) delete e.courseIn;
      // Save version 33 is that of the elections (R76), which came first in 0.18.0.
      const { state, version } = fromSaveFile({ ...old, version: 33 });
      expect(version).toBe(SAVE_VERSION);
      expect(SAVE_VERSION).toBeGreaterThanOrEqual(34);
      expect(state.employees.every((e) => e.courseIn === null)).toBe(true);
      expect(state.employees[0]!.trainingUntil).toBe(s.day + 10);
    });
  });

  describe('elections with people in them (R76)', () => {
    it('starts a game with a president in their first term, elected in 1967, and an election in June 1971', () => {
      const { politics } = createInitialState(1);
      expect(politics.president.terms).toBe(1);
      expect(politics.president.name).not.toBe(politics.vicePresident.name);
      expect(politics.history).toEqual([{ day: toDay(1967, 6, 1), president: politics.president.name, vicePresident: politics.vicePresident.name, snap: false }]);
      expect(politics.nextElection).toBe(toDay(1971, 6, 1));
      expect(politics.snap).toBe(false);
    });

    it('gives a seed the same presidents every time, and other seeds others', () => {
      const day = toDay(2010, 1, 1);
      expect(worldOn(5, day).politics).toEqual(worldOn(5, day).politics);
      const firsts = new Set([1, 2, 3, 4, 5, 6].map((seed) => worldOn(seed, day).politics.history.map((e) => e.president).join()));
      expect(firsts.size).toBeGreaterThan(1);
    });

    it('never names a politician after someone in the game, or after an earlier one', () => {
      const s = worldOn(3, toDay(2040, 1, 1));
      const people = new Set([...s.candidates.map((c) => c.name), ...s.rivals.flatMap((r) => r.channels.flatMap((c) => c.schedule.map((show) => show.hostName)))]);
      const names = s.politics.history.flatMap((e) => [e.president, e.vicePresident]);
      for (const name of names) expect(people.has(name)).toBe(false);
      // A vice-president who becomes president keeps their name; nobody else comes back.
      const firstSeen = new Map<string, number>();
      s.politics.history.forEach((e, n) => {
        for (const name of [e.president, e.vicePresident]) if (!firstSeen.has(name)) firstSeen.set(name, n);
      });
      expect(firstSeen.size).toBeGreaterThan(s.politics.history.length);
    });

    it('lets nobody serve a third term', () => {
      let thirds = 0;
      let seconds = 0;
      let vicePresidents = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const { history } = worldOn(seed, toDay(2100, 1, 1)).politics;
        for (let n = 2; n < history.length; n++) if (history[n]!.president === history[n - 1]!.president && history[n]!.president === history[n - 2]!.president) thirds++;
        for (let n = 1; n < history.length; n++) {
          if (history[n]!.president === history[n - 1]!.president) seconds++;
          if (history[n]!.president === history[n - 1]!.vicePresident) vicePresidents++;
        }
      }
      expect(thirds).toBe(0);
      expect(seconds).toBeGreaterThan(0);
      expect(vicePresidents).toBeGreaterThan(0);
    });

    it('holds a snap election now and then, and counts the four years from it', () => {
      let elections = 0;
      let snaps = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const { history } = worldOn(seed, toDay(2100, 1, 1)).politics;
        history.slice(1).forEach((e, n) => {
          const before = history[n]!.day;
          const months = Math.round((e.day - before) / 30.44);
          if (e.snap) expect(months).toBeLessThan(ELECTIONS.every * 12);
          else expect(e.day).toBe(monthsAfter(before, ELECTIONS.every * 12));
        });
        elections += history.length - 1;
        snaps += history.filter((e) => e.snap).length;
      }
      // About one term in five is cut short.
      expect(snaps / elections).toBeGreaterThan(0.1);
      expect(snaps / elections).toBeLessThan(0.3);
    });

    it('announces a snap election in the news two months ahead, with the campaign the month before it', () => {
      const seed = seedWithSnap();
      const draft = createInitialState(seed);
      const rng = new Rng(1);
      let announced: { day: number; polling: number } | null = null;
      while (!announced) {
        draft.day++;
        const falls = governmentFalls(draft.politics);
        runEvents(draft, rng);
        if (falls === draft.day) announced = { day: draft.day, polling: draft.politics.nextElection };
      }
      expect(announced.polling).toBe(monthsAfter(announced.day, ELECTIONS.noticeMonths));
      expect(draft.headlines.at(-1)!.text).toMatch(/falls: a snap election is called/);
      const message = draft.messages.at(-1)!;
      expect(message.text).toMatch(/snap election on/);
      expect(message.topic).toBe('event');
      expect(electionOn(draft)).toBe(false);
      expect(electionOn({ ...draft, day: campaignStart(draft.politics) })).toBe(true);

      // Polling day names the winners, and the next election is four years on unless it falls again.
      while (draft.day < announced.polling) {
        draft.day++;
        runEvents(draft, rng);
      }
      const { president, vicePresident } = draft.politics;
      expect(draft.headlines.at(-1)!.text).toContain(`Election day: `);
      expect(draft.headlines.at(-1)!.text).toContain(president.name);
      expect(draft.headlines.at(-1)!.text).toContain(`with ${vicePresident.name} as vice-president`);
      expect(draft.politics.history.at(-1)).toMatchObject({ day: announced.polling, snap: true });
      expect(regularElection(draft.politics)).toBe(monthsAfter(announced.polling, ELECTIONS.every * 12));
    });

    it('draws nothing from the main stream of the game', () => {
      const draft = createInitialState(1);
      draft.day = draft.politics.nextElection;
      const before = draft.rngState;
      holdElection(draft);
      expect(draft.rngState).toBe(before);
    });
  });

  describe('a save from 0.17.0', () => {
    it('loads with the elections the seed would have had, held up to its day', () => {
      const day = toDay(1993, 3, 12);
      const s = { ...createInitialState(11), day };
      const save = JSON.parse(JSON.stringify(toSaveFile(s, 0)));
      delete save.state.politics;
      const { state, version } = fromSaveFile({ ...save, version: 32 });
      expect(version).toBe(SAVE_VERSION);
      expect(SAVE_VERSION).toBeGreaterThanOrEqual(33);
      expect(state.politics).toEqual(worldOn(11, day).politics);
      expect(state.politics.history[0]!.day).toBe(toDay(1967, 6, 1));
      expect(toCalendarDate(state.politics.history[1]!.day).year).toBe(1971);
      for (const e of state.politics.history) expect(e.day).toBeLessThanOrEqual(day);
      expect(state.politics.nextElection).toBeGreaterThan(day);
    });
  });

  describe('the wiki', () => {
    const block = () =>
      getArticle('history')
        .sections.find((s) => s.heading === 'Elections')!
        .body.find((b): b is Extract<Block, { asOf: unknown }> => typeof b !== 'string' && 'asOf' in b)!;
    const shown = (game: GameState | null) => block().asOf(game?.day ?? null, game).flatMap(stringsOf).join(' ');

    it('names who is in office in the game that is open, and nobody elected later', () => {
      const then = worldOn(2, toDay(1985, 1, 1));
      const later = worldOn(2, toDay(2030, 1, 1));
      const text = shown(then);
      expect(text).toContain(then.politics.president.name);
      expect(text).toContain(then.politics.vicePresident.name);
      for (const e of then.politics.history) expect(text).toContain(e.president);
      const inOffice = [then.politics.president.name, then.politics.vicePresident.name];
      const newcomers = later.politics.history.slice(then.politics.history.length).flatMap((e) => [e.president, e.vicePresident]).filter((name) => !inOffice.includes(name));
      expect(newcomers.length).toBeGreaterThan(0);
      for (const name of newcomers) expect(text).not.toContain(name);
    });

    it('gives the date of the next regular election, and a snap one only once it is announced', () => {
      const seed = seedWithSnap();
      let s = worldOn(seed, 0);
      while (!s.politics.snap) s = worldOn(seed, s.politics.nextElection);
      const falls = governmentFalls(s.politics)!;
      const regular = regularElection(s.politics);
      const before = shown({ ...s, day: falls - 1 });
      expect(before).toMatch(/Next election/);
      expect(before).toContain(String(toCalendarDate(regular).year));
      expect(before).not.toMatch(/Snap election:/);
      expect(shown({ ...s, day: falls })).toMatch(/Snap election:/);
    });

    it('reads as at the start before a game is open, with no names', () => {
      const text = shown(null);
      expect(text).toContain(String(ELECTIONS.startElected));
      expect(text).not.toContain(createInitialState(1).politics.president.name);
    });
  });
});
