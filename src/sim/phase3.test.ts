import { describe, expect, it } from 'vitest';
import { CONTENT, DIFFICULTIES, EPISODE_COST, STARTING_MONEY } from '../config/balance';
import { getGenre, type GenreId } from '../config/genres';
import { FURNITURE, STUDIO_REQUIREMENTS, type FurnitureType, type RoomType } from '../config/office';
import { acceptOffer, buyLicense, buyRights, buyTitle, createChannel, createShow, hire, placeBid, scheduleShow, setChannelManager, setRoomType, type ActionResult } from './actions';
import { addMissingEquipment, autoPlaceFurniture, rentRoom, setUpMasterControl } from './fixtures';
import { issueLicenses } from './auctions';
import { isMarketLeader, listenersByOwner, showQuality, simulateDay, talksOnly } from './broadcast';
import { growthBot, sensibleBot, tvBot } from './bots';
import { libraryCapacity } from './content';
import { companyValue } from './economy';
import { freeLicenses, licensePrice, LIST_PRICES } from './licenses';
import { createInitialState } from './newGame';
import { slow } from './slow';
import { unlockAll } from './unlocks';
import { isManager } from './office';
import { fromSaveFile, SAVE_VERSION } from './save';
import { PLAYER, type GameState, type Person, type Title } from './state';
import { tick } from './tick';

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
  s = ok(addMissingEquipment(ok(setRoomType(ok(rentRoom(s, 'K')), 'K', 'library')), 'K'));
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

/** A produced TV show with a studio, host and full staff, scheduled in a slot. */
function producedTvShow(
  state: GameState & { tvId: string },
  genre: GenreId,
  room: string,
  type: RoomType,
  staff: number,
  slot: number,
): GameState & { tvId: string; lastId?: string } {
  let s = ok(addMissingEquipment(ok(setRoomType(ok(rentRoom(state, room)), room, type)), room));
  s = hireWithDesk(s, { role: 'host', specialties: [genre] });
  const hostId = s.lastId!;
  const staffIds: string[] = [];
  for (let i = 0; i < staff; i++) {
    s = hireWithDesk(s, { role: 'production' });
    staffIds.push(s.lastId!);
  }
  s = ok(createShow(s, { name: 'Produced', genre, hostId, staffIds, studioId: room }));
  const showId = s.lastId!;
  s = ok(scheduleShow(s, state.tvId, slot, showId));
  return Object.assign(s, { tvId: state.tvId, lastId: showId });
}

describe('TV licenses', () => {
  it('cost eight times a radio license, with one free in the Capital at the start', () => {
    const s = unlockAll(createInitialState(1));
    expect(licensePrice('tv', 'capital', LIST_PRICES)).toBe(8 * licensePrice('radio', 'capital', LIST_PRICES));
    expect(freeLicenses(s, 'tv', 'capital')).toBe(1);
    for (const region of ['north', 'coast', 'heartland', 'highlands'] as const) expect(freeLicenses(s, 'tv', region)).toBe(0);
  });

  it('the public broadcaster runs a national TV channel from the start', () => {
    const s = unlockAll(createInitialState(1));
    const tv = s.rivals.flatMap((r) => r.channels).filter((c) => c.medium === 'tv');
    expect(tv).toHaveLength(1);
    expect(tv[0]!.regionIds).toHaveLength(5);
  });

  it('can be bought once; a TV channel only takes TV licenses', () => {
    const s = tvStation();
    expect(s.licenses.find((l) => l.channelId === s.tvId)!.medium).toBe('tv');
    const second = ok(createChannel(s, { name: 'Second TV', logo, medium: 'tv' }));
    expect(error(buyLicense(second, second.lastId!, 'capital'))).toMatch(/All TV licenses in Coaxia are taken/);
  });
});

describe('license auctions', () => {
  it('open when the authority issues a new license', () => {
    const s = structuredClone(unlockAll(createInitialState(1)));
    s.day = jan1(1972);
    issueLicenses(s);
    const auction = s.auctions.find((a) => a.medium === 'tv' && a.regionId === 'north');
    expect(auction).toBeDefined();
    expect(auction!.reserve).toBe(licensePrice('tv', 'north', s));
    expect(freeLicenses(s, 'tv', 'north')).toBe(0);
  });

  it('refuse bids below the reserve or above your money', () => {
    const s = tvStation();
    s.auctions.push({ id: 'a1', medium: 'tv', regionId: 'north', reserve: 100_000, endsOn: s.day + 7, interested: 0, bid: null, holder: null });
    expect(error(placeBid(s, 'a1', s.tvId, 50_000))).toMatch(/at least the reserve/);
    expect(error(placeBid(s, 'a1', s.tvId, 9_000_000))).toMatch(/more than you have/);
    expect(error(placeBid(s, 'a1', s.channels[0]!.id, 200_000))).toMatch(/TV license/);
  });

  it('the highest sealed bid wins, and the player pays only when winning', () => {
    const s = tvStation();
    s.auctions.push({ id: 'a1', medium: 'tv', regionId: 'north', reserve: 100_000, endsOn: s.day + 1, interested: 0, bid: null, holder: null });
    const bid = ok(placeBid(s, 'a1', s.tvId, 900_000));
    const after = tick(bid);
    expect(after.auctions).toHaveLength(0);
    expect(after.licenses.some((l) => l.channelId === s.tvId && l.regionId === 'north' && l.price === 900_000)).toBe(true);
    expect(after.ledger.purchases - bid.ledger.purchases).toBe(900_000);
  });

  it('a rival outbids a low bid and launches its TV channel', () => {
    const s = tvStation();
    s.day = jan1(1975) + 3;
    s.auctions.push({ id: 'a1', medium: 'tv', regionId: 'north', reserve: 100_000, endsOn: s.day + 1, interested: 1, bid: null, holder: null });
    const bid = ok(placeBid(s, 'a1', s.tvId, 100_000));
    const after = tick(bid);
    expect(after.licenses.some((l) => l.channelId === s.tvId && l.regionId === 'north')).toBe(false);
    expect(after.money).toBeGreaterThan(bid.money - 100_000);
    const rivalTv = after.rivals.flatMap((r) => r.channels).filter((c) => c.medium === 'tv' && c.regionIds.includes('north'));
    expect(rivalTv.length).toBeGreaterThan(1);
  });

  it('a license nobody bids on can be bought at the list price', () => {
    const s = tvStation();
    // In 1970 no rival is ready for more TV.
    s.licensesIssued.tv.north = 2;
    s.auctions.push({ id: 'a1', medium: 'tv', regionId: 'north', reserve: 100_000, endsOn: s.day + 1, interested: 0, bid: null, holder: null });
    expect(freeLicenses(s, 'tv', 'north')).toBe(0);
    const after = tick(s);
    expect(freeLicenses(after, 'tv', 'north')).toBe(1);
    expect(ok(buyLicense(after, s.tvId, 'north')).licenses.some((l) => l.channelId === s.tvId && l.regionId === 'north')).toBe(true);
  });
});

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
    expect(error(buyTitle(s, offer.id))).toMatch(/library/);
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

describe('produced TV shows', () => {
  it('cost their episode budget each day they air', () => {
    const s = producedTvShow(tvStation(), 'kids', 'J', 'tvKidsStudio', 3, 0);
    const next = tick(s);
    expect(simulateDay(s).channels.find((c) => c.channelId === s.tvId)!.slots[0]!.showId).toBe(s.lastId);
    expect(next.ledger.production - s.ledger.production).toBe(EPISODE_COST.kids);
  });

  it('TV sports airs without broadcast rights, and talks about sport; with rights it shows the games and draws more', () => {
    const s = producedTvShow(tvStation(), 'tvSports', 'J', 'tvNewsStudio', 4, 3);
    const show = s.shows.find((sh) => sh.id === s.lastId)!;
    expect(showQuality(s, show).problems).toEqual([]);
    expect(talksOnly(s, getGenre('tvSports'))).toBe(true);
    const rights = { ...s.market.rights[0]!, prestige: 1 };
    const withRights = ok(buyRights({ ...s, market: { ...s.market, rights: [rights] } }, rights.id));
    expect(talksOnly(withRights, getGenre('tvSports'))).toBe(false);
    const evening = (state: GameState) => simulateDay(state).channels.find((c) => c.channelId === s.tvId)!.slots[3]!;
    expect(evening(s).programName).toBe('Produced');
    expect(evening(withRights).programName).toBe('Produced');
    expect(evening(withRights).listeners).toBeGreaterThan(evening(s).listeners);
  });
});

describe('sponsors and markets by medium', () => {
  it('a TV sponsor only fits a TV show', () => {
    const s = tvStation();
    s.offers.push({ id: 'o-tv', sponsor: 'Polar Cola', medium: 'tv', cpmMultiplier: 1.2, preferredAudience: null, minListeners: 1, weeks: 8, penalty: 100, expiresOn: s.day + 7 });
    expect(error(acceptOffer(s, 'o-tv', s.shows[0]!.id))).toMatch(/wants a TV show/);
  });

  it('radio and TV are separate markets', () => {
    const s = tick(unlockAll(sensibleBot(createInitialState(1))));
    expect(listenersByOwner(s.lastDay!, 'tv').get(PLAYER)).toBeUndefined();
    expect(listenersByOwner(s.lastDay!, 'tv').size).toBe(1);
    expect(isMarketLeader(s.lastDay!, 'tv')).toBe(false);
    expect(s.viewers).toBe(0);
  });
});

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

// --- Phase 3 acceptance (prompt.md section 14) ---

describe('Phase 3 acceptance', () => {
  it('starting TV costs more than the company starts with, and many times a radio station', () => {
    const cost = (type: RoomType) =>
      (Object.entries(STUDIO_REQUIREMENTS[type]!) as [FurnitureType, number][]).reduce((sum, [f, n]) => sum + FURNITURE[f].cost * n, 0);
    const cheapestStudio = Math.min(cost('tvTalkStudio'), cost('tvNewsStudio'), cost('tvKidsStudio'));
    const tv = licensePrice('tv', 'capital', LIST_PRICES) + cheapestStudio + cost('library');
    const radio = licensePrice('radio', 'capital', LIST_PRICES) + cost('radioStudio');
    // On easy a company starts with enough for it (0.12.0): the user wanted to be able to build studios early.
    for (const difficulty of DIFFICULTIES.filter((d) => d !== 'easy')) {
      expect(licensePrice('tv', 'capital', { day: 0, difficulty }) + cheapestStudio + cost('library')).toBeGreaterThan(STARTING_MONEY[difficulty]);
    }
    expect(tv).toBeGreaterThan(5 * radio);
  });

  it.each([1, 2, 3])('TV is an expensive mid-game step that pays off (seed %i)', (seed) => {
    let tv = createInitialState(seed);
    let radio = createInitialState(seed);
    let launch: number | null = null;
    let launchCost = 0;
    for (let day = 0; day < Math.round(10 * 365.25); day++) {
      const before = tv.money;
      tv = tick(tvBot(tv));
      radio = tick(growthBot(radio));
      if (launch === null && tv.channels.some((c) => c.medium === 'tv')) {
        launch = tv.day;
        launchCost = before - tv.money;
      }
    }
    expect(tv.bankrupt).toBe(false);
    // Mid-game: radio has to pay for it first.
    expect(launch).not.toBeNull();
    expect(launch!).toBeGreaterThan(180);
    // Expensive: the launch takes studios, a library and staff at once, before the license. (Until 0.12.0 the TV company
    // was also still behind the one that stayed in radio a year later; since titles are paid by the airing it catches up sooner.)
    expect(launchCost).toBeGreaterThan(100_000);
    // Meaningful: after ten years it's worth clearly more, and TV earns a large part of the revenue.
    expect(companyValue(tv)).toBeGreaterThan(1.3 * companyValue(radio));
    const week = tv.weeklyReports.at(-1)!.channels.filter((c) => c.isPlayer);
    const tvShare = week.filter((c) => c.medium === 'tv').reduce((s, c) => s + c.revenue, 0) / week.reduce((s, c) => s + c.revenue, 0);
    expect(tvShare).toBeGreaterThan(0.4);
  }, slow(60_000));
});
