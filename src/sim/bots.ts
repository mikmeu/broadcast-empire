// Simple automated players for the headless balance check (scripts/simulate.ts)
// and the acceptance tests.

import { ACTIVE_REGIONS, OFF_SPECIALTY_SKILL, OWN_EVENTS, RENEWAL, type OwnEventKind } from '../config/balance';
import { getGenre, type GenreId } from '../config/genres';
import type { RoomType } from '../config/office';
import {
  acceptOffer,
  buildRoom,
  buyLicense,
  buyTitle,
  createChannel,
  createShow,
  hire,
  matchPoachOffer,
  placeBid,
  research,
  upgradeCost,
  upgradeEquipment,
  revampShow,
  scheduleShow,
  stageEvent,
  setChannelManager,
  startCampaign,
  type ActionResult,
} from './actions';
import { hasCapacity, hostSkill } from './broadcast';
import { airingsByGenre, libraryCapacity } from './content';
import { isFirstOfMonth, toCalendarDate } from './calendar';
import { dividendReserve } from './economy';
import { addMissingEquipment, autoPlaceFurniture } from './fixtures';
import { ownEventBlocker, ownEventCost } from './ownEvents';
import { TECHS } from '../config/tech';
import { outdatedItems, researchBlocker } from './tech';
import { freeLicenses, licensePrice } from './licenses';
import { employeesWithDesk, findFreeSpot, isManager, managerDeskCount, needsDesk, wearsOut, workstationCount } from './office';
import { proposeRoom } from './rooms';
import { showListeners } from './sales';
import { PLAYER, type GameState, type Id, type Person, type Role } from './state';
import { canteenCoverage, upkeepLoad } from './upkeep';
import { population } from './world';

export type Bot = (state: GameState) => GameState;

function must(result: ActionResult): GameState & { lastId?: Id } {
  if (!result.ok) throw new Error(`Bot action failed: ${result.error}`);
  return Object.assign(result.state, { lastId: result.id });
}

/** For optional moves: keep the old state if the action fails. */
function attempt(state: GameState, action: (s: GameState) => ActionResult): GameState {
  const result = action(state);
  return result.ok ? result.state : state;
}

function hireBest(state: GameState, role: Role, count: number, prefer?: (p: Person) => number): GameState {
  const picks = state.candidates
    .filter((c) => c.role === role)
    .sort((a, b) => (prefer?.(b) ?? b.skill) - (prefer?.(a) ?? a.skill))
    .slice(0, count);
  return picks.reduce((s, p) => attempt(s, (x) => hire(x, p.id)), state);
}

/**
 * Where a bot would build a room of a kind: the place the game proposes, of
 * the usual size for that kind, on the lowest floor that has one. A bot plans
 * its floors the way “Propose a place” does for a player: two rows of rooms
 * along the hall, filled from the stairs and the lifts.
 */
function placeFor(state: GameState, type: RoomType) {
  for (let floor = 1; floor <= state.floorsUnlocked; floor++) {
    const plan = proposeRoom(state, floor, type);
    if (plan) return plan;
  }
  return null;
}

/** Builds a room of a kind where the bot would (see `placeFor`). The id of the room is `lastId`. */
function build(state: GameState, type: RoomType): GameState & { lastId?: Id } {
  const plan = placeFor(state, type);
  if (!plan) throw new Error(`Bot action failed: no floor has a place left for a ${type}.`);
  return must(buildRoom(state, { ...plan, type }));
}

/** Places desks (building rooms as needed) until everyone who works at one has one: manager's desks for the managers, workstations for the rest. */
function ensureDesks(state: GameState): GameState {
  let s = state;
  const kinds = [
    { managers: true, room: 'managementOffice', desk: 'managerDesk', count: managerDeskCount },
    { managers: false, room: 'office', desk: 'workstation', count: workstationCount },
  ] as const;
  for (const kind of kinds) {
    const needed = () => s.employees.filter((e) => needsDesk(e.role) && isManager(e.role) === kind.managers).length - kind.count(s);
    while (needed() > 0) {
      const room = s.rooms.find((r) => r.type === kind.room && findFreeSpot(s, r, kind.desk));
      if (room) {
        s = must(autoPlaceFurniture(s, room.roomId, kind.desk));
        continue;
      }
      if (!placeFor(s, kind.room)) break;
      s = build(s, kind.room);
    }
  }
  return s;
}

/** Builds a studio, or another room with a checklist, and puts in it what the checklist asks for. The id of the room is `lastId`. */
function setUpStudio(state: GameState, type: RoomType): GameState & { lastId?: Id } {
  const built = build(state, type);
  const roomId = built.lastId!;
  return Object.assign(must(addMissingEquipment(built, roomId)), { lastId: roomId });
}

/** Slot indexes from most to fewest radio listeners: morning, afternoon, lunch, evening, late night. */
const SLOTS_BY_REACH = [0, 2, 1, 3, 4];

interface StationPlan {
  name: string;
  /** Genre per slot. */
  plan: readonly GenreId[];
  hosts: number;
  production: number;
  region: (typeof ACTIVE_REGIONS)[number];
}

/** Creates a channel with its own channel manager, hosts, production staff and a full schedule. `studios` are the rooms its shows are made in, by kind. */
function setUpStation(state: GameState, station: StationPlan, studios: Partial<Record<RoomType, string>>, scheduleShows: boolean, medium: 'radio' | 'tv' = 'radio'): GameState {
  let s = must(createChannel(state, { name: station.name, logo: { shape: 'circle', color: '#6631d2', initials: 'BOT' }, medium }));
  const channelId = s.lastId!;
  s = must(buyLicense(s, channelId, station.region));

  // A host's skill counts in full only in their specialties.
  const hostValue = (p: Person) => p.skill * (p.specialties.some((g) => station.plan.includes(g)) ? 1 : OFF_SPECIALTY_SKILL);
  const before = new Set(s.employees.map((e) => e.id));
  s = hireBest(s, 'channelManager', 1);
  s = hireBest(s, 'host', station.hosts, hostValue);
  s = hireBest(s, 'production', station.production);
  s = ensureDesks(s);
  const team = (role: Role) => s.employees.filter((e) => e.role === role && !before.has(e.id));

  const manager = team('channelManager')[0];
  if (manager) s = must(setChannelManager(s, channelId, manager.id));
  if (!scheduleShows) return s;

  // Fill the biggest slots first so they get the best people.
  for (const slot of SLOTS_BY_REACH) {
    const genre = station.plan[slot]!;
    if (getGenre(genre).kind === 'licensed') {
      s = must(createShow(s, { name: `${getGenre(genre).name} ${slot + 1}`, genre, hostId: null, staffIds: [], studioId: null }));
      s = must(scheduleShow(s, channelId, slot, s.lastId!));
      continue;
    }
    const free = (role: Role) => team(role).filter((e) => hasCapacity(s, e.id));
    const host = free('host').sort((a, b) => hostSkill(b, genre) - hostSkill(a, genre))[0];
    const staff = free('production')
      .sort((a, b) => b.skill - a.skill)
      .slice(0, getGenre(genre).requiredStaff);
    s = must(
      createShow(s, {
        name: `${getGenre(genre).name} ${slot + 1}`,
        genre,
        hostId: host?.id ?? null,
        staffIds: staff.map((e) => e.id),
        studioId: studios[getGenre(genre).studio] ?? null,
      }),
    );
    s = must(scheduleShow(s, channelId, slot, s.lastId!));
  }
  return s;
}

const FIRST_STATION: StationPlan = {
  name: 'Bot FM',
  // Coaxia is young: music through the day and into the night, with news for its professionals in the evening.
  plan: ['morningShow', 'top40', 'top40', 'news', 'rock'],
  hosts: 5,
  production: 5,
  region: 'capital',
};

const SECOND_STATION: StationPlan = {
  name: 'Bot Rock',
  plan: ['morningShow', 'rock', 'top40', 'rock', 'rock'],
  hosts: 5,
  production: 4,
  region: 'capital',
};

/** A second station for the people the first one leaves to others (0.13.0): news, talk and classical music for professionals and seniors. */
const TALK_STATION: StationPlan = {
  name: 'Bot Talk',
  plan: ['news', 'talk', 'classical', 'news', 'classical'],
  hosts: 5,
  production: 5,
  region: 'capital',
};

function setUpFirstStation(state: GameState, scheduleShows: boolean): GameState {
  const withStudio = setUpStudio(state, 'radioStudio');
  const withTalk = setUpStudio(withStudio, 'radioTalkStudio');
  return setUpStation(withTalk, FIRST_STATION, { radioStudio: withStudio.lastId!, radioTalkStudio: withTalk.lastId! }, scheduleShows);
}

function revampStaleShows(state: GameState, reserve: number): GameState {
  return state.shows
    .filter((show) => show.freshness < 0.8)
    .reduce((s, show) => {
      const result = revampShow(s, show.id);
      return result.ok && result.state.money > reserve ? result.state : s;
    }, state);
}

/**
 * Hires support staff as the office needs them: cleaners whenever the rooms get
 * dirty faster than they are cleaned, a technician once equipment shows wear
 * and maintenance staff once something in the building has failed.
 */
function staffSupport(state: GameState): GameState {
  let s = state;
  const load = upkeepLoad(s, employeesWithDesk(s));
  const worn = s.rooms.some((r) => r.furniture.some((f) => wearsOut(f.type) && f.condition < 70));
  if (load.cleaning.needed > load.cleaning.capacity) s = hireBest(s, 'cleaner', 1);
  if (worn && load.repairs.needed > load.repairs.capacity) s = hireBest(s, 'technician', 1);
  if (s.rooms.some((r) => r.issue) && load.maintenance.needed > load.maintenance.capacity) s = hireBest(s, 'maintenance', 1);
  return s;
}

/** Sets up a canteen once the company has `budget` in the bank, and adds tables as the staff grows. */
function runCanteen(state: GameState, budget: number): GameState {
  let s = state;
  if (!s.rooms.some((r) => r.type === 'canteen')) {
    if (!placeFor(s, 'canteen') || s.money < budget) return s;
    s = setUpStudio(s, 'canteen');
  }
  for (const canteen of s.rooms.filter((r) => r.type === 'canteen')) {
    while (canteenCoverage(s) < 1 && findFreeSpot(s, s.rooms.find((r) => r.roomId === canteen.roomId)!, 'canteenTable')) {
      s = must(autoPlaceFurniture(s, canteen.roomId, 'canteenTable'));
    }
  }
  return s;
}

/**
 * Keeps what the company has: matches offers rivals make to its hosts, and in a
 * renewal round bids enough that no challenger can take the license (the most a
 * challenger bids, less the holder's advantage) when it has the money.
 */
function keepHosts(state: GameState): GameState {
  let s = state.poachOffers.reduce((x, offer) => attempt(x, (y) => matchPoachOffer(y, offer.id)), state);
  for (const auction of s.auctions) {
    const holder = auction.holder;
    if (holder?.ownerId !== PLAYER || auction.bid || auction.interested === 0) continue;
    const safe = Math.ceil((holder.value * RENEWAL.challengeYears.max) / (1 + RENEWAL.holderAdvantage) / 1000) * 1000;
    const amount = Math.max(auction.reserve, Math.min(safe, Math.floor(s.money / 1000) * 1000));
    if (amount > auction.reserve) s = attempt(s, (x) => placeBid(x, auction.id, holder.channelId, amount));
  }
  return s;
}

/**
 * Once a year per channel, stages the biggest event the company can pay for
 * out of the cash above its dividend reserve: money the owners would otherwise take.
 */
function stageEvents(state: GameState): GameState {
  let s = state;
  for (const channel of s.channels) {
    const spare = s.money - dividendReserve(s);
    const kind = (['telethon', 'gala', 'concert'] as OwnEventKind[]).find((k) => ownEventCost(s, channel, k) <= spare && !ownEventBlocker(s, channel, k));
    if (kind && OWN_EVENTS[kind]) s = attempt(s, (x) => stageEvent(x, channel.id, kind));
  }
  return s;
}

/** Phase 1 strategy: one channel in the Capital, revamps stale shows each month, never grows. */
export const sensibleBot: Bot = (state) => {
  if (state.day === 0) return runCanteen(staffSupport(setUpFirstStation(state, true)), 60_000);
  const s = keepHosts(state);
  if (!isFirstOfMonth(s.day)) return s;
  return revampStaleShows(runCanteen(staffSupport(s), 60_000), 20_000);
};

/**
 * One well-run channel that stays in the Capital: like the sensible bot, plus
 * sponsors, a production manager and one researcher to keep the studios up to
 * date. The "tight but profitable" case.
 */
export const capitalBot: Bot = (state) => {
  if (state.day === 0) return sensibleBot(state);
  let s = acceptGoodOffers(sensibleBot(state));
  if (!isFirstOfMonth(s.day)) return s;
  const has = (role: Role) => s.employees.some((e) => e.role === role);
  if (!has('sales')) s = ensureDesks(hireBest(s, 'sales', 2));
  if (!has('manager') && s.money > 100_000) {
    const manager = s.candidates.find((c) => c.role === 'manager' && c.department === 'production');
    if (manager) s = ensureDesks(attempt(s, (x) => hire(x, manager.id)));
  }
  return keepUp(s, 1, 0, 40_000);
};

/** Spends the same money on rooms and staff but never puts a show on the schedule. */
export const neglectfulBot: Bot = (state) => (state.day === 0 ? setUpFirstStation(state, false) : state);

// --- Growth bot ---

/** Attaches open offers to unsponsored shows that comfortably beat the minimum. */
function acceptGoodOffers(state: GameState): GameState {
  if (state.offers.length === 0 || !state.lastDay) return state;
  let s = state;
  const listeners = showListeners(state.lastDay);
  for (const offer of [...s.offers].sort((a, b) => b.cpmMultiplier - a.cpmMultiplier)) {
    const show = s.shows
      .filter(
        (sh) =>
          getGenre(sh.genre).medium === offer.medium &&
          !s.contracts.some((c) => c.showId === sh.id) &&
          (listeners.get(sh.id) ?? 0) >= offer.minListeners * 1.15,
      )
      .sort((a, b) => (listeners.get(b.id) ?? 0) - (listeners.get(a.id) ?? 0))[0];
    if (show) s = attempt(s, (x) => acceptOffer(x, offer.id, show.id));
  }
  return s;
}

/** Buys a license in the most populous region a channel doesn't cover yet. */
function expandChannel(state: GameState, channelId: Id): GameState {
  const covered = new Set(state.licenses.filter((l) => l.channelId === channelId).map((l) => l.regionId));
  const region = ACTIVE_REGIONS.filter((r) => !covered.has(r) && freeLicenses(state, 'radio', r) > 0).sort(
    (a, b) => population(b, state.day) - population(a, state.day),
  )[0];
  if (!region || state.money - licensePrice('radio', region, state) < RESERVE) return state;
  return attempt(state, (s) => buyLicense(s, channelId, region));
}

/** Cash the growth bot keeps after buying a license. */
const RESERVE = 50_000;

/**
 * Starts like the sensible bot, then grows: expands into a new region whenever
 * cash allows, hires sales staff for sponsors from month 1, adds a production
 * manager and marketing once it can afford them, and opens a second channel
 * once the first covers every region it can.
 */
export const growthBot: Bot = (state) => {
  if (state.day === 0) return staffSupport(setUpFirstStation(state, true));
  const s = acceptGoodOffers(keepHosts(state));
  return isFirstOfMonth(s.day) ? growRadio(s) : s;
};

/** Grows like the growth bot, but its second station is aimed at other audiences than its first: the way to grow the wiki's article “Growing” describes. */
export const networkBot: Bot = (state) => {
  if (state.day === 0) return staffSupport(setUpFirstStation(state, true));
  const s = acceptGoodOffers(keepHosts(state));
  return isFirstOfMonth(s.day) ? growRadio(s, true, TALK_STATION) : s;
};

/** Grows like the growth bot but never hires support staff or builds a canteen. */
export const noSupportBot: Bot = (state) => {
  if (state.day === 0) return setUpFirstStation(state, true);
  const s = acceptGoodOffers(keepHosts(state));
  return isFirstOfMonth(s.day) ? growRadio(s, false) : s;
};

/**
 * Keeps up with technology: hires researchers, researches each tech once it is
 * possible (`yearsEarly` before its historical year), and upgrades outdated equipment.
 */
function keepUp(state: GameState, researchers: number, yearsEarly: number, reserve = 100_000): GameState {
  let s = state;
  const month = Math.round(s.day / 30.44);
  const have = s.employees.filter((e) => e.role === 'researcher').length;
  if (month >= 3 && have < researchers && s.money > reserve) s = ensureDesks(hireBest(s, 'researcher', researchers - have));
  const year = toCalendarDate(s.day).year;
  for (const tech of TECHS.filter((t) => t.year - yearsEarly <= year)) {
    if (!researchBlocker(s, tech)) s = attempt(s, (x) => research(x, tech.id));
  }
  for (const room of s.rooms.filter((r) => outdatedItems(s, r).length > 0)) {
    if (s.money - upgradeCost(s, room.roomId) > reserve) s = attempt(s, (x) => upgradeEquipment(x, room.roomId));
  }
  return s;
}

function growRadio(state: GameState, support = true, second: StationPlan = SECOND_STATION): GameState {
  let s = keepUp(state, 2, 0);
  if (support) s = stageEvents(runCanteen(staffSupport(s), 100_000));

  const month = Math.round(s.day / 30.44);
  s = revampStaleShows(s, 40_000);
  const has = (role: Role, department?: string) =>
    s.employees.some((e) => e.role === role && (!department || e.department === department));

  // Licenses pay back fastest, so expansion comes first.
  for (const channel of s.channels.filter((c) => c.medium === 'radio')) s = expandChannel(s, channel.id);

  if (month >= 1 && !has('sales')) s = ensureDesks(hireBest(s, 'sales', 2));
  if (month >= 6 && s.money > 150_000 && !has('manager', 'production')) {
    const manager = s.candidates.find((c) => c.role === 'manager' && c.department === 'production');
    if (manager) s = ensureDesks(attempt(s, (x) => hire(x, manager.id)));
  }
  if (month >= 6 && s.money > 150_000 && !has('marketing')) s = ensureDesks(hireBest(s, 'marketing', 1));
  if (has('marketing') && s.campaigns.length === 0 && s.money > 200_000) {
    s = attempt(s, (x) => startCampaign(x, { targetId: x.channels[0]!.id, audience: 'all', weeklyBudget: 2_500, weeks: 8 }));
  }

  const first = s.channels[0]!;
  const firstDone = ACTIVE_REGIONS.every(
    (r) => s.licenses.some((l) => l.channelId === first.id && l.regionId === r) || freeLicenses(s, 'radio', r) === 0,
  );
  if (firstDone && !s.channels.some((c) => c.name === second.name) && s.money > 200_000) {
    // A studio of every kind its plan needs.
    const studios: Partial<Record<RoomType, string>> = {};
    for (const type of new Set(second.plan.map((genre) => getGenre(genre).studio))) {
      const built = setUpStudio(s, type);
      studios[type] = built.lastId!;
      s = built;
    }
    s = setUpStation(s, second, studios, true);
  }
  return s;
}

// --- TV bot ---

/** Money the TV bot wants before it launches: license, studio, library, first titles and a buffer. */
export const TV_LAUNCH_MONEY = 650_000;

const TV_STATION: StationPlan = {
  name: 'Bot TV',
  // The kids' show in the production studio, the soap in its own; licensed programs from the library.
  plan: ['kids', 'series', 'soap', 'movies', 'series'],
  hosts: 2,
  production: 6,
  region: 'capital',
};

/** Keeps enough titles in the library for the licensed programs, buying the best value first. */
function stockLibrary(state: GameState): GameState {
  let s = state;
  const wanted: Partial<Record<string, number>> = { movies: 45, series: 90 };
  const offers = [...s.market.titles].sort((a, b) => b.quality ** 2 / Math.max(1, b.price / b.airings) - a.quality ** 2 / Math.max(1, a.price / a.airings));
  for (const offer of offers) {
    const have = airingsByGenre(s).get(offer.genre) ?? 0;
    if (have >= (wanted[offer.genre] ?? 0) || offer.quality < 0.45) continue;
    if (s.library.length >= libraryCapacity(s) || s.money - offer.price < 100_000) continue;
    s = attempt(s, (x) => buyTitle(x, offer.id));
  }
  return s;
}

/** Bids on TV auctions where its channel doesn't broadcast yet, if it can afford to. */
function bidOnAuctions(state: GameState): GameState {
  const tv = state.channels.find((c) => c.medium === 'tv');
  if (!tv) return state;
  return state.auctions
    .filter((a) => !a.holder && a.medium === 'tv' && !a.bid && !state.licenses.some((l) => l.channelId === tv.id && l.regionId === a.regionId))
    .reduce((s, a) => {
      const amount = Math.round((a.reserve * 2) / 1000) * 1000;
      return s.money - amount > 300_000 ? attempt(s, (x) => placeBid(x, a.id, tv.id, amount)) : s;
    }, state);
}

/** Buys free TV licenses (left over from auctions nobody won) for its channel. */
function expandTv(state: GameState): GameState {
  const tv = state.channels.find((c) => c.medium === 'tv');
  if (!tv) return state;
  const covered = new Set(state.licenses.filter((l) => l.channelId === tv.id).map((l) => l.regionId));
  const region = ACTIVE_REGIONS.filter((r) => !covered.has(r) && freeLicenses(state, 'tv', r) > 0).sort(
    (a, b) => population(b, state.day) - population(a, state.day),
  )[0];
  if (!region || state.money - licensePrice('tv', region, state) < 250_000) return state;
  return attempt(state, (s) => buyLicense(s, tv.id, region));
}

/** Grows like the growth bot, but with a bigger R&D team that researches every tech as early as it can. */
export const researchBot: Bot = (state) => {
  if (state.day === 0) return staffSupport(setUpFirstStation(state, true));
  const s = acceptGoodOffers(keepHosts(state));
  return isFirstOfMonth(s.day) ? growRadio(keepUp(s, 5, 5)) : s;
};

/** Grows radio like the growth bot, then launches a TV channel in the Capital once it has the money. */
export const tvBot: Bot = (state) => {
  if (state.day === 0) return staffSupport(setUpFirstStation(state, true));
  let s = bidOnAuctions(acceptGoodOffers(keepHosts(state)));
  if (!isFirstOfMonth(s.day)) return s;
  s = growRadio(s);

  const hasTv = s.channels.some((c) => c.medium === 'tv');
  if (!hasTv && s.money >= TV_LAUNCH_MONEY && s.floorsUnlocked >= 2) {
    const built = setUpStudio(s, 'tvProductionStudio');
    const studios: Partial<Record<RoomType, string>> = { tvProductionStudio: built.lastId! };
    // A soap opera is made in a studio of its own, around a decor that has to be researched; without it the bot makes a sitcom instead.
    s = attempt(built, (x) => research(x, 'soapOperaFormat'));
    if (s.techs.includes('soapOperaFormat') && placeFor(s, 'tvSoapStudio')) {
      const soapStudio = setUpStudio(s, 'tvSoapStudio');
      studios.tvSoapStudio = soapStudio.lastId!;
      s = soapStudio;
    }
    const soap = studios.tvSoapStudio !== undefined;
    const library = setUpStudio(s, 'library');
    s = must(autoPlaceFurniture(library, library.lastId!, 'shelving'));
    s = stockLibrary(s);
    s = setUpStation(s, { ...TV_STATION, plan: TV_STATION.plan.map((genre) => (genre === 'soap' && !soap ? 'sitcom' : genre)) }, studios, true, 'tv');
  }
  if (s.channels.some((c) => c.medium === 'tv')) s = expandTv(stockLibrary(s));
  return s;
};
