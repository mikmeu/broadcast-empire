import { describe, expect, it } from 'vitest';
import { CONTENT } from '../config/balance';
import { type GenreId, getGenre } from '../config/genres';
import { buyLicense, buyTitle, createChannel, createShow, hire, scheduleShow, setChannelManager, setRoomType, type ActionResult, research } from './actions';
import { addMissingEquipment, autoPlaceFurniture, rentRoom, setUpMasterControl, setUpPostRoom } from './fixtures';
import { showQuality, simulateDay } from './broadcast';
import { sensibleBot } from './bots';
import { libraryCapacity, refreshMarket } from './content';
import { createInitialState } from './newGame';
import { unlockAll } from './unlocks';
import { isManager } from './office';
import type { GameState, Person, Title } from './state';
import { tick } from './tick';
import { rivalEraQuality } from './generate';
import { Rng } from './rng';
import { TITLE_NAMES } from '../config/names';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}
const error = (result: ActionResult) => (result.ok ? 'no error' : result.error);
const logo = { shape: 'square' as const, color: '#000', initials: 'TV' };

/** Day numbers of 1 January in a given year. */
const jan1 = (year: number) => Math.round((Date.UTC(year, 0, 1) - Date.UTC(1970, 0, 1)) / 86_400_000);

/** Hires a made-up person and gives them a desk in office L (floor 2). */
function hireWithDesk(state: GameState, person: Partial<Person> & Pick<Person, 'role'>): GameState & { lastId?: string } {
  let s = structuredClone(state);
  const id = `p-tv-${s.nextId++}`;
  s.candidates.push({ id, name: 'Test Person', skill: 80, salary: 2_000, specialties: [], fame: 0, department: null, ...person });
  s = ok(hire(s, id));
  if (!s.rooms.some((r) => r.roomId === 'L')) s = ok(setRoomType(ok(rentRoom(s, 'L')), 'L', 'office'));
  // A manager's desk goes in the management office the station already has.
  if (isManager(person.role)) s = ok(autoPlaceFurniture(s, s.rooms.find((r) => r.type === 'managementOffice')!.roomId, 'managerDesk'));
  else if (person.role !== 'host') s = ok(autoPlaceFurniture(s, 'L', 'workstation'));
  return Object.assign(s, { lastId: id });
}

/** The sensible bot's radio station plus a rich company with a TV channel in the Capital and a library. */
function tvStation(): GameState & { tvId: string } {
  let s: GameState & { lastId?: string } = structuredClone(unlockAll(sensibleBot(createInitialState(1))));
  s.money = 5_000_000;
  s.floorsUnlocked = 2;
  s = ok(createChannel(s, { name: 'Test TV', logo, medium: 'tv' }));
  const tvId = s.lastId!;
  s = ok(buyLicense(s, tvId, 'capital'));
  s = hireWithDesk(s, { role: 'channelManager' });
  s = ok(setChannelManager(s, tvId, s.lastId!));
  // The titles come by post (0.17.0).
  s = ok(addMissingEquipment(ok(setRoomType(ok(setUpPostRoom(ok(rentRoom(s, 'K')))), 'K', 'library')), 'K'));
  // A second channel goes out through a master control room (0.16.0).
  s = ok(setUpMasterControl(s));
  return Object.assign(s, { tvId });
}

const title = (id: string, genre: GenreId, quality: number, airingsLeft = 10, fee = 0): Title => ({
  id,
  name: `Title ${id}`,
  genre,
  quality,
  airingsLeft,
  freshness: 1,
  fee,
  perAiring: 0,
});

/** A licensed program in a slot of the TV channel. */
function licensedProgram(state: GameState & { tvId: string }, genre: GenreId, slot: number): GameState & { tvId: string; lastId?: string } {
  let s = ok(createShow(state, { name: `Program ${slot}`, genre, hostId: null, staffIds: [], studioId: null }));
  const showId = s.lastId!;
  s = ok(scheduleShow(s, state.tvId, slot, showId));
  return Object.assign(s, { tvId: state.tvId, lastId: showId });
}

describe('content market and library', () => {
  it('offers titles every month', () => {
    const s = unlockAll(createInitialState(1));
    expect(s.market.titles.filter((t) => t.genre === 'movies')).toHaveLength(CONTENT.titlesPerMonth.movies!);
    expect(s.market.titles.some((t) => t.genre === 'musicVideos')).toBe(false);
    expect(s.market.rights.length).toBeGreaterThan(0);
  });

  it('needs a library with room on the shelves', () => {
    const s = unlockAll(createInitialState(1));
    const offer = s.market.titles[0]!;
    expect(error(buyTitle(s, offer.id))).toMatch(/post room/);
    expect(error(buyTitle(ok(setUpPostRoom({ ...s, money: 5_000_000 })), offer.id))).toMatch(/library/);
    const tv = tvStation();
    const bought = ok(buyTitle(tv, tv.market.titles[0]!.id));
    expect(bought.library).toHaveLength(1);
    // Since 0.12.0 nothing is paid when a title is bought: its airings are paid as they air.
    expect(bought.money).toBe(tv.money);
    expect(bought.library[0]!.perAiring).toBe(Math.round(tv.market.titles[0]!.price / tv.market.titles[0]!.airings));
    const full = structuredClone(tv);
    full.library = Array.from({ length: libraryCapacity(full) }, (_, i) => title(`x${i}`, 'movies', 0.5));
    expect(error(buyTitle(full, full.market.titles[0]!.id))).toMatch(/library is full/);
  });

  it('licensed programs need no host, staff or studio', () => {
    const s = tvStation();
    const host = s.employees.find((e) => e.role === 'host')!;
    const created = ok(createShow(s, { name: 'Movie Night', genre: 'movies', hostId: host.id, staffIds: [], studioId: 'C' }));
    const show = created.shows.find((sh) => sh.id === created.lastId)!;
    expect(show.hostId).toBeNull();
    expect(show.studioId).toBeNull();
    expect(showQuality(created, show).problems).toEqual(['No movies left in the library: buy more on the content market']);
  });

  it('a licensed program airs the best title, which then loses freshness and an airing', () => {
    const base = tvStation();
    base.library.push(title('t-good', 'movies', 0.9), title('t-ok', 'movies', 0.6));
    const s = licensedProgram(base, 'movies', 3);
    const slot = simulateDay(s).channels.find((c) => c.channelId === s.tvId)!.slots[3]!;
    expect(slot.titleId).toBe('t-good');
    expect(slot.programName).toBe('Program 3: Title t-good');
    expect(slot.listeners).toBeGreaterThan(0);
    const next = tick(s);
    const aired = next.library.find((t) => t.id === 't-good')!;
    expect(aired.airingsLeft).toBe(9);
    expect(aired.freshness).toBeCloseTo(CONTENT.freshnessPerAiring);
  });

  it('two programs of the same genre air different titles', () => {
    let s = tvStation();
    s.library.push(title('t1', 'series', 0.8), title('t2', 'series', 0.7));
    s = licensedProgram(licensedProgram(s, 'series', 1), 'series', 3);
    const slots = simulateDay(s).channels.find((c) => c.channelId === s.tvId)!.slots;
    // The bigger evening slot gets the better title.
    expect(slots[3]!.titleId).toBe('t1');
    expect(slots[1]!.titleId).toBe('t2');
  });

  it('a title leaves the library when its airings run out, and the slot becomes a rerun', () => {
    const base = tvStation();
    base.library.push(title('t-last', 'movies', 0.8, 1));
    const s = tick(licensedProgram(base, 'movies', 3));
    expect(s.library).toHaveLength(0);
    expect(simulateDay(s).channels.find((c) => c.channelId === base.tvId)!.slots[3]!.programName).toBe('Rerun');
  });

  it('teleshopping pays a fixed fee per airing instead of ad revenue', () => {
    const base = tvStation();
    base.day = jan1(1988);
    base.techs.push('teleshoppingFormat');
    base.library.push(title('t-shop', 'teleshopping', 0.3, 20, 1_500));
    const s = licensedProgram(base, 'teleshopping', 1);
    expect(simulateDay(s).channels.find((c) => c.channelId === s.tvId)!.slots[1]!.revenue).toBe(1_500);
  });
});

// From phase4a.
{
  function ok(result: ActionResult): GameState {
    if (!result.ok) throw new Error(result.error);
    return result.state;
  }
  const error = (result: ActionResult) => (result.ok ? 'no error' : result.error);
  const jan1 = (year: number) => Math.round((Date.UTC(year, 0, 1) - Date.UTC(1970, 0, 1)) / 86_400_000);

  /** The sensible bot's station with plenty of research points. */
  function station(year = 1970): GameState {
    const s = structuredClone(unlockAll(sensibleBot(createInitialState(1))));
    s.day = jan1(year);
    s.researchPoints = 100_000;
    s.money = 1_000_000;
    return s;
  }

  describe('formats and rivals over the decades', () => {
    it('new formats need research before the player can use them', () => {
      const s = station(2001);
      expect(error(createShow(s, { name: 'The House', genre: 'reality', hostId: null, staffIds: [], studioId: null }))).toMatch(/Research/);
      refreshMarket(s, new Rng(1));
      expect(s.market.titles.some((t) => t.genre === 'musicVideos')).toBe(false);
      const researched = ok(research(s, 'musicVideoFormat'));
      refreshMarket(researched, new Rng(1));
      expect(researched.market.titles.some((t) => t.genre === 'musicVideos')).toBe(true);
    });

    it('rivals get better over time', () => {
      expect(rivalEraQuality(1970)).toBe(1);
      expect(rivalEraQuality(2000)).toBeGreaterThan(rivalEraQuality(1985));
    });
  });
}

// From version016.
describe('version 0.16.0', () => {
  it('cartoons are bought for the library, for the families (R134)', () => {
    const cartoons = getGenre('cartoons');
    expect(cartoons).toMatchObject({ kind: 'licensed', medium: 'tv', studio: 'library' });
    expect(cartoons.fit.families).toBe(1);
    expect(TITLE_NAMES.cartoons).toBeDefined();
    const s = structuredClone(createInitialState(1));
    refreshMarket(s, new Rng(5));
    expect(s.market.titles.filter((t) => t.genre === 'cartoons')).toHaveLength(4);
  });
});
