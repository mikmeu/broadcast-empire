import { describe, expect, it } from 'vitest';
import { sensibleBot } from './bots';
import { createInitialState } from './newGame';
import { unlockAll } from './unlocks';
import { buildingOf, findRoom } from './office';
import { fromSaveFile, SAVE_VERSION, toSaveFile } from './save';
import type { GameState, Person, Show } from './state';
import { tick, advance } from './tick';
import { DAYS_PER_YEAR, MORALE, RENEWAL, RIVALRY } from '../config/balance';
import { getGenre } from '../config/genres';
import { toDay } from './calendar';
import { withoutRecordRooms, addMissingEquipment, autoPlaceFurniture } from './fixtures';
import { STUDIO_REQUIREMENTS, type FurnitureType, type RoomType } from '../config/office';
import { buildRoom, hire, type ActionResult } from './actions';
import { proposeRoom } from './rooms';

/** The sensible bot's day-0 station: one channel in the Capital, five shows, free desks for two more staff. */
const station = () => structuredClone(unlockAll(sensibleBot(createInitialState(1))));

describe('saves from Phase 1', () => {
  it('upgrade to the Phase 2 state', () => {
    const s = structuredClone(station()) as unknown as Record<string, unknown> & GameState;
    // Shape a Phase 1 save: one rival, no Phase 2 fields, an unused license.
    const old = s as unknown as Record<string, unknown>;
    for (const key of ['offers', 'contracts', 'campaigns', 'promotion', 'loan', 'floorsUnlocked']) delete old[key];
    s.rivals = [s.rivals[0]!];
    delete (s.rivals[0] as unknown as Record<string, unknown>).personality;
    for (const e of s.employees) {
      delete (e as unknown as Record<string, unknown>).xp;
      delete (e as unknown as Record<string, unknown>).level;
    }
    for (const l of s.licenses) delete (l as unknown as Record<string, unknown>).price;
    (s.licenses as unknown[]).push({ id: 'l-old', regionId: 'north', medium: 'radio', channelId: null });
    const money = s.money;

    const { state, version } = fromSaveFile({ version: 2, savedAt: 1, state: s });
    expect(version).toBe(SAVE_VERSION);
    expect(state.rivals).toHaveLength(4);
    expect(state.employees.every((e) => e.level === 1 && e.xp === 0)).toBe(true);
    expect(state.licenses.map((l) => l.id)).not.toContain('l-old');
    expect(state.money).toBe(money + 20_000);
    // Every floor of the building is open in a save from before the levels (0.20.0).
    expect(state.floorsUnlocked).toBe(buildingOf(state).floors);
  });
});

// From phase3.
describe('saves from Phase 2', () => {
  it('upgrade to the Phase 3 state', () => {
    const s = structuredClone(unlockAll(sensibleBot(createInitialState(1)))) as unknown as Record<string, unknown> & GameState;
    const old = s as unknown as Record<string, unknown>;
    for (const key of ['viewers', 'licensesIssued', 'auctions', 'library', 'market', 'sportsRights']) delete old[key];
    for (const rival of s.rivals) rival.channels = rival.channels.filter((c) => c.medium === 'radio');
    const { state, version } = fromSaveFile({ version: 3, savedAt: 1, state: s });
    expect(version).toBe(SAVE_VERSION);
    expect(state.rivals.flatMap((r) => r.channels).filter((c) => c.medium === 'tv')).toHaveLength(1);
    expect(state.licensesIssued.tv.capital).toBe(2);
    expect(state.market.titles.length).toBeGreaterThan(0);
    expect(tick(state).day).toBe(state.day + 1);
  });
});

// From phase4a.
describe('saves from Phase 3', () => {
  it('upgrade with tier-1 furniture and no techs', () => {
    const s = structuredClone(unlockAll(sensibleBot(createInitialState(1)))) as unknown as Record<string, unknown> & GameState;
    delete (s as Record<string, unknown>).techs;
    for (const room of s.rooms) for (const f of room.furniture) delete (f as unknown as Record<string, unknown>).tier;
    const { state, version } = fromSaveFile({ version: 4, savedAt: 1, state: s });
    expect(version).toBe(SAVE_VERSION);
    expect(state.techs).toEqual([]);
    expect(state.rooms.flatMap((r) => r.furniture).every((f) => f.tier === 1)).toBe(true);
  });
});

// From phase4b.
describe('saves from Phase 4a', () => {
  it('upgrade with a clean office, equipment in good repair and neutral morale', () => {
    const s = structuredClone(unlockAll(sensibleBot(createInitialState(1)))) as unknown as Record<string, unknown> & GameState;
    for (const e of s.employees) {
      delete (e as unknown as Record<string, unknown>).morale;
      delete (e as unknown as Record<string, unknown>).location;
    }
    for (const r of s.rooms) {
      delete (r as unknown as Record<string, unknown>).cleanliness;
      delete (r as unknown as Record<string, unknown>).issue;
      for (const f of r.furniture) delete (f as unknown as Record<string, unknown>).condition;
    }
    const { state, version } = fromSaveFile({ version: 5, savedAt: 1, state: s });
    expect(version).toBe(SAVE_VERSION);
    expect(state.employees.every((e) => e.morale === MORALE.neutral && e.location === null)).toBe(true);
    expect(state.rooms.every((r) => r.cleanliness === 100 && r.issue === null && r.furniture.every((f) => f.condition === 100))).toBe(true);
    expect(tick(state).day).toBe(1);
  });
});

// From phase4c.
describe('saves from Phase 4b', () => {
  it('upgrade with named rival hosts and no events in progress', () => {
    const s = structuredClone(unlockAll(sensibleBot(createInitialState(1)))) as unknown as Record<string, unknown> & GameState;
    for (const key of ['rightsAuctions', 'eventRights', 'poachOffers', 'lastPoachDay', 'headlines']) delete (s as Record<string, unknown>)[key];
    for (const show of s.rivals.flatMap((r) => r.channels).flatMap((c) => c.schedule)) delete (show as unknown as Record<string, unknown>).hostName;
    const { state, version } = fromSaveFile({ version: 6, savedAt: 1, state: s });
    expect(version).toBe(SAVE_VERSION);
    expect(state.headlines).toEqual([]);
    expect(state.lastPoachDay).toBeNull();
    const shows = state.rivals.flatMap((r) => r.channels).flatMap((c) => c.schedule);
    expect(shows.every((x) => (getGenre(x.genre).kind === 'produced') === (x.hostName !== ''))).toBe(true);
    expect(tick(state).day).toBe(1);
  });
});

// From phase5a.
describe('saves from Phase 4c', () => {
  it('upgrade as a normal game with no dividends paid', () => {
    const s = structuredClone(advance(sensibleBot(createInitialState(1)), 40)) as unknown as Record<string, unknown> & GameState;
    delete (s as Record<string, unknown>).difficulty;
    delete (s as Record<string, unknown>).dividendsPaid;
    delete (s.ledger as unknown as Record<string, unknown>).dividends;
    for (const r of s.monthlyReports) delete (r as unknown as Record<string, unknown>).dividends;
    const { state, version } = fromSaveFile({ version: 7, savedAt: 1, state: s });
    expect(version).toBe(SAVE_VERSION);
    expect(state).toMatchObject({ difficulty: 'normal', dividendsPaid: 0 });
    expect(state.ledger.dividends).toBe(0);
    expect(state.monthlyReports.every((r) => r.dividends === 0)).toBe(true);
    expect(tick(state).day).toBe(41);
  });
});

// From phase5b.
{
  /** The sensible bot's station on a date, with money to spend. */
  function station(year = 1970, month = 1, dayOfMonth = 1): GameState {
    const s = structuredClone(unlockAll(sensibleBot(createInitialState(1))));
    s.day = toDay(year, month, dayOfMonth);
    s.money = 1_000_000;
    // unlockAll gives the technologies of the jobs (#207), some ahead of 1970: none of them is a milestone here.
    s.techs = [];
    return s;
  }

  const reached = (s: GameState) => s.milestones.map((m) => m.id);

  describe('saves from Phase 5a', () => {
    it('upgrade with no milestones, which are then picked up on the next day', () => {
      const played = tick(station());
      const old = structuredClone(played) as unknown as Record<string, unknown> & GameState;
      delete (old as Record<string, unknown>).milestones;
      for (const c of old.lastDay!.channels) delete (c as unknown as Record<string, unknown>).regionListeners;
      for (const day of old.week) for (const c of day.channels) delete (c as unknown as Record<string, unknown>).regionListeners;
      const { state, version } = fromSaveFile({ version: 8, savedAt: 1, state: old });
      expect(version).toBe(SAVE_VERSION);
      expect(state.milestones).toEqual([]);
      expect(state.lastDay!.channels.every((c) => c.regionListeners !== undefined)).toBe(true);
      expect(reached(tick(state))).toEqual(['onAir']);
    });
  });
}

// From phase5c.
{
  const station = (): GameState => structuredClone(sensibleBot(createInitialState(1)));

  describe('saves from before Phase 5c', () => {
    it('upgrade with empty audience and region breakdowns', () => {
      const s = structuredClone(advance(station(), 10)) as unknown as Record<string, unknown> & GameState;
      for (const day of [s.lastDay!, ...s.week]) for (const c of day.channels) delete (c as unknown as Record<string, unknown>).audienceListeners;
      for (const r of s.weeklyReports) {
        for (const c of r.channels) {
          delete (c as unknown as Record<string, unknown>).audienceListeners;
          delete (c as unknown as Record<string, unknown>).regionListeners;
        }
      }
      const { state, version } = fromSaveFile({ version: 10, savedAt: 1, state: s });
      expect(version).toBe(SAVE_VERSION);
      expect(state.weeklyReports.every((r) => r.channels.every((c) => c.regionListeners && c.audienceListeners))).toBe(true);
      expect(tick(state).lastDay!.channels[0]!.audienceListeners.teens).toBeGreaterThan(0);
    });
  });
}

// From phase5d.
describe('saves from before Phase 5d', () => {
  it('upgrade with staggered expiry dates and no prestige', () => {
    const s = structuredClone(advance(unlockAll(sensibleBot(createInitialState(1))), 40)) as unknown as Record<string, unknown> & GameState;
    for (const key of ['prestige', 'licenseBars']) delete (s as Record<string, unknown>)[key];
    for (const l of s.licenses) delete (l as unknown as Record<string, unknown>).expiresOn;
    for (const c of s.channels) delete (c as unknown as Record<string, unknown>).lastEventDay;
    for (const c of s.rivals.flatMap((r) => r.channels)) delete (c as unknown as Record<string, unknown>).licenseExpiry;
    delete (s.ledger as unknown as Record<string, unknown>).events;
    delete (s.ledger as unknown as Record<string, unknown>).renewals;
    const { state, version } = fromSaveFile({ version: 11, savedAt: 1, state: s });
    expect(version).toBe(SAVE_VERSION);
    expect(state).toMatchObject({ prestige: 0, licenseBars: [] });
    const first = state.day + Math.round(RENEWAL.firstTermYears.min * 365.25);
    expect(state.licenses.every((l) => l.expiresOn >= first)).toBe(true);
    expect(state.rivals.flatMap((r) => r.channels).every((c) => c.regionIds.every((r) => c.licenseExpiry[r]! >= first))).toBe(true);
    expect(state.ledger.events + state.ledger.renewals).toBe(0);
    expect(tick(state).day).toBe(41);
  });
});

// From phase5g.
describe('saves from before Phase 5g', () => {
  it('load with every piece of furniture unturned', () => {
    let s = createInitialState(1);
    for (let day = 0; day < 40; day++) s = tick(sensibleBot(s));
    const old = structuredClone(s) as unknown as Record<string, unknown> & GameState;
    for (const room of old.rooms) for (const item of room.furniture) delete (item as unknown as Record<string, unknown>).turn;
    const { state, version } = fromSaveFile({ version: 12, savedAt: 1, state: old });
    expect(version).toBe(SAVE_VERSION);
    const furniture = state.rooms.flatMap((r) => r.furniture);
    expect(furniture.length).toBeGreaterThan(0);
    expect(furniture.every((f) => f.turn === 0)).toBe(true);
    expect(tick(state).day).toBe(41);
  });
});

// From version013.
{
  /** A radio station from the sensible test player, a month on the air, with everything open and money to spare. */
  const station = (days = 30): GameState => {
    // Without the library and post room the bot keeps its records in (0.18.0): the tests below build rooms where the game proposes them.
    const s = structuredClone(withoutRecordRooms(unlockAll(advance(sensibleBot(createInitialState(1)), days))));
    s.money = 3_000_000;
    s.floorsUnlocked = 2;
    return s;
  };

  describe('version 0.13.0', () => {
    it('a save from 0.12 keeps loading, with the new books and the week’s figures to come', () => {
      const s = station();
      const old = structuredClone(toSaveFile(s, 0)) as unknown as { version: number; state: Record<string, any> };
      old.version = 28;
      delete old.state.weekAgo;
      delete old.state.ledger.sponsorRevenue;
      delete old.state.ledger.fees;
      old.state.campaigns = [{ id: 'm1', targetId: s.channels[0]!.id, audience: 'all', weeklyBudget: 1_000, marketerId: 'x', endDay: s.day + 10 }];
      const { state } = fromSaveFile(old);
      expect(state.weekAgo).toEqual({});
      expect(state.ledger).toMatchObject({ sponsorRevenue: 0, fees: 0 });
      expect(state.campaigns[0]).toMatchObject({ weeks: 2, repeat: false });
    });
  });
}

// From version014.
{
function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}

/** A radio station from the sensible test player, a month on the air, with everything open, money to spare and two floors. */
const station = (days = 30): GameState => {
  // Without the library and post room the bot keeps its records in (0.18.0): the tests below build rooms where the game proposes them.
  const s = structuredClone(withoutRecordRooms(unlockAll(advance(sensibleBot(createInitialState(1)), days))));
  s.money = 5_000_000;
  s.floorsUnlocked = 2;
  return s;
};

/** Hires a made-up person straight from the pool. */
function hirePerson(state: GameState, person: Partial<Person> & Pick<Person, 'role'>): GameState & { lastId?: string } {
  const s = structuredClone(state);
  const id = `p-${s.nextId++}`;
  s.candidates.push({ id, name: `Test ${person.role} ${id}`, skill: 80, salary: 2_000, specialties: [], fame: 0, department: null, ...person });
  return Object.assign(ok(hire(s, id)), { lastId: id });
}

/** Builds a room of a kind where the game proposes it, on the lowest floor with room, with everything on its checklist. Its id is `lastId`. */
function room(state: GameState, type: RoomType, ...extra: FurnitureType[]): GameState & { lastId?: string } {
  const floor = [1, 2].find((f) => proposeRoom(state, f, type))!;
  let s = ok(buildRoom(state, { ...proposeRoom(state, floor, type)!, type }));
  const id = s.lastId!;
  if (STUDIO_REQUIREMENTS[type]) s = ok(addMissingEquipment(s, id));
  for (const piece of extra) s = ok(autoPlaceFurniture(s, id, piece));
  return Object.assign(s, { lastId: id });
}

describe('version 0.14.0', () => {
  describe('a game from 0.13.0', () => {
    it('turns a production studio into the studio of what it made, with that decor, and frees the host of a sitcom', () => {
      let s: GameState & { lastId?: string } = structuredClone(station());
      s = room(s, 'tvKidsStudio');
      const kidsRoom = s.lastId!;
      s = room(s, 'tvKidsStudio');
      const mixed = s.lastId!;
      s = hirePerson(s, { role: 'host', specialties: ['sitcom'] });
      const host = s.lastId!;
      // As 0.13.0 had them: production studios without a set, one making a kids' show, one a sitcom and a kids' show.
      for (const id of [kidsRoom, mixed]) {
        const r = findRoom(s, id)!;
        r.type = 'tvProductionStudio' as RoomType;
        r.furniture = r.furniture.filter((f) => f.type !== 'kidsSet');
      }
      findRoom(s, kidsRoom)!.name = 'TV production studio 1';
      findRoom(s, mixed)!.name = 'Studio Two';
      const show = (id: string, genre: Show['genre'], studioId: string, hostId: string | null = null): Show => ({ id, name: id, genre, hostId, staffIds: [], writerIds: [], editorIds: [], studioId, freshness: 1, tone: 'normal' });
      s.shows.push(show('kids', 'kids', kidsRoom), show('sitcom', 'sitcom', mixed, host), show('sitcom2', 'sitcom', mixed), show('kids2', 'kids', mixed));
      const old = JSON.parse(JSON.stringify(toSaveFile(s, 0)));
      for (const sh of old.state.shows) delete sh.writerIds;
      for (const e of old.state.employees) delete e.leaving;
      const rivalSitcom = old.state.rivals.flatMap((r: GameState['rivals'][number]) => r.channels).flatMap((c: { schedule: { genre: string; hostName: string }[] }) => c.schedule);
      rivalSitcom[0].genre = 'sitcom';
      rivalSitcom[0].hostName = 'Old Host';

      const { state } = fromSaveFile({ ...old, version: 29 });
      expect(findRoom(state, kidsRoom)).toMatchObject({ type: 'tvKidsStudio', name: 'TV kids’ studio 1' });
      expect(findRoom(state, kidsRoom)!.furniture.some((f) => f.type === 'kidsSet')).toBe(true);
      // Most of what the second made were sitcoms: it is a sitcom studio, and keeps the name it was given.
      expect(findRoom(state, mixed)).toMatchObject({ type: 'tvSitcomStudio', name: 'Studio Two' });
      expect(findRoom(state, mixed)!.furniture.some((f) => f.type === 'sitcomSet')).toBe(true);
      const studioOf = (id: string) => state.shows.find((x) => x.id === id)!.studioId;
      expect([studioOf('kids'), studioOf('sitcom'), studioOf('sitcom2'), studioOf('kids2')]).toEqual([kidsRoom, mixed, mixed, null]);
      expect(state.messages.some((m) => /“kids2” needs a TV kids’ studio now/.test(m.text))).toBe(true);
      // The sitcom's host is free, and the sitcom needs writers.
      expect(state.shows.find((x) => x.id === 'sitcom')!.hostId).toBeNull();
      expect(state.messages.some((m) => /“sitcom” needs writers now.*is free for another show/.test(m.text))).toBe(true);
      expect(state.shows.every((x) => Array.isArray(x.writerIds))).toBe(true);
      expect(state.employees.every((e) => e.leaving === null)).toBe(true);
      expect(state.rivals.flatMap((r) => r.channels).flatMap((c) => c.schedule)[0]!.hostName).toBe('');
      // Every show that has a studio has one of its kind.
      for (const sh of state.shows.filter((x) => x.studioId)) expect(findRoom(state, sh.studioId!)!.type, sh.id).toBe(getGenre(sh.genre).studio);
    });
  });
});
}

// From version015.
{
  /** A radio station from the sensible test player, a month on the air, with everything open, money to spare and two floors; without the cooks it may have hired. */
  const station = (): GameState => {
    // Without the library and post room the bot keeps its records in (0.18.0): the tests below build rooms where the game proposes them.
    const s = structuredClone(withoutRecordRooms(unlockAll(advance(sensibleBot(createInitialState(1)), 30))));
    s.money = 5_000_000;
    s.floorsUnlocked = 2;
    s.employees = s.employees.filter((e) => e.role !== 'cook');
    for (const room of s.rooms) room.furniture = room.furniture.filter((f) => f.type !== 'stove');
    return s;
  };

  describe('version 0.15.0', () => {
    it('loads a game saved in 0.14.0 with no meetings and nobody unhappy', () => {
      const old = JSON.parse(JSON.stringify(toSaveFile(station(), 0)));
      delete old.state.meetings;
      delete old.state.unrest;
      const { state } = fromSaveFile({ ...old, version: 30 });
      expect(state.meetings).toEqual({});
      expect(state.unrest).toEqual({});
      expect(tick(state).day).toBe(state.day + 1);
    });
  });
}

// Version 84 (0.22.0, #404).
describe('saves from before the event hall (#404)', () => {
  it('turn the day of the last event into a concert at a small venue with no host picked, or into nothing', () => {
    const s = structuredClone(advance(station(), 3)) as unknown as GameState;
    const old = structuredClone(s) as unknown as { channels: Record<string, unknown>[] };
    old.channels[0]!.lastEventDay = 123;
    delete old.channels[0]!.lastEvent;
    const withEvent = fromSaveFile({ version: 83, savedAt: 1, state: old as never });
    expect(withEvent.version).toBe(SAVE_VERSION);
    expect(withEvent.state.channels[0]!.lastEvent).toEqual({ day: 123, kind: 'concert', venue: 'small', hostId: null });
    expect('lastEventDay' in withEvent.state.channels[0]!).toBe(false);

    old.channels[0]!.lastEventDay = null;
    const without = fromSaveFile({ version: 83, savedAt: 1, state: old as never });
    expect(without.state.channels[0]!.lastEvent).toBeNull();
    expect(tick(without.state).day).toBe(without.state.day + 1);
  });
});

// Version 85 (0.23.0, #405).
describe('saves from before the talent show (#405)', () => {
  it('load unchanged: no show has a jury, and the game goes on', () => {
    const s = structuredClone(advance(station(), 3)) as unknown as GameState;
    const loaded = fromSaveFile({ version: 84, savedAt: 1, state: s as never });
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.state.shows.some((show) => show.jury !== undefined)).toBe(false);
    expect(tick(loaded.state).day).toBe(loaded.state.day + 1);
  });
});

// Version 86 (0.23.0, #409).
describe('saves from before rival money (#409)', () => {
  const old = (s: GameState) => {
    const copy = structuredClone(s) as unknown as { rivals: Record<string, unknown>[] };
    for (const r of copy.rivals) for (const key of ['money', 'rivalry', 'move']) delete r[key];
    return copy as never;
  };

  it('give each rival its start money without a weekly report, no rivalry and no move', () => {
    const s = structuredClone(advance(station(), 1)) as unknown as GameState;
    s.weeklyReports = [];
    const { state } = fromSaveFile({ version: 85, savedAt: 1, state: old(s) });
    for (const rival of state.rivals) {
      expect(rival.money).toBe(RIVALRY.startMoney[rival.personality]);
      expect(rival.rivalry).toBe(0);
      expect(rival.move).toBeNull();
    }
    expect(tick(state).day).toBe(state.day + 1);
  });

  it('take the money from the revenue of the last weekly report, up to the ceiling', () => {
    const s = structuredClone(advance(station(), 1)) as unknown as GameState;
    const [first, second] = s.rivals;
    const row = (ownerId: string, revenue: number) => ({ channelId: ownerId, name: 'R', ownerId, isPlayer: false, medium: 'radio' as const, slots: [], regionListeners: {}, audienceListeners: {}, revenue });
    s.weeklyReports = [{ fromDay: 0, days: 7, channels: [row(first!.id, 7000), row(second!.id, 7e9)] }];
    const { state } = fromSaveFile({ version: 85, savedAt: 1, state: old(s) });
    expect(state.rivals[0]!.money).toBeCloseTo(1000 * RIVALRY.keptShare * DAYS_PER_YEAR);
    expect(state.rivals[1]!.money).toBe(RIVALRY.startMoney[second!.personality] * RIVALRY.ceilingTimesStart);
  });
});

// Version 87 (0.23.0, #413).
describe('saves from before aimed poaching (#413)', () => {
  it('load unchanged: no host was courted, no offer has a fee, and the game goes on', () => {
    const s = structuredClone(advance(station(), 3)) as unknown as GameState;
    const loaded = fromSaveFile({ version: 86, savedAt: 1, state: s as never });
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.state.employees.some((e) => e.courtedOn != null)).toBe(false);
    expect(loaded.state.poachOffers.some((o) => o.fee !== undefined)).toBe(false);
    expect(tick(loaded.state).day).toBe(loaded.state.day + 1);
  });
});
