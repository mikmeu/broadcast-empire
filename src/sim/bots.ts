// Simple automated players for the headless balance check (scripts/simulate.ts)
// and the acceptance tests.

import { ACTIVE_REGIONS, COOKS, OFF_SPECIALTY_SKILL, OWN_EVENTS, POST, RENEWAL, type OwnEventKind } from '../config/balance';
import { getGenre, hasHost, type GenreId } from '../config/genres';
import { FLOOR, RECEPTION, ROOM_SIZES, buildable, type RoomType } from '../config/office';
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
  setMonthlyMeeting,
  startCampaign,
  type ActionResult,
} from './actions';
import { hasCapacity, hostSkill } from './broadcast';
import { airingsByGenre, hasPostRoom, libraryCapacity } from './content';
import { isFirstOfMonth, toCalendarDate } from './calendar';
import { dividendReserve } from './economy';
import { addMissingEquipment, autoPlaceFurniture } from './fixtures';
import { ownEventBlocker, ownEventCost } from './ownEvents';
import { TECHS } from '../config/tech';
import { outdatedItems, researchBlocker } from './tech';
import { freeLicenses, licensePrice } from './licenses';
import { buildingOf, deskFor, deskRoomFor, employeesWithDesk, findFreeSpot, needsDesk, wearsOut } from './office';
import { masterControlRoom } from './control';
import { proposeRoom, roomError } from './rooms';
import { showListeners } from './sales';
import { PLAYER, type GameState, type Id, type Person, type Role } from './state';
import { canteenCoverage, upkeepLoad } from './upkeep';

import { TEAMS, TEAM_IDS } from './teams';
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

/** A place for a room of a kind of the usual size as far from the stairs as it goes, the first floor first: in the north row, then in the south. */
function farPlaceFor(state: GameState, type: RoomType) {
  const size = ROOM_SIZES[type];
  for (let floor = 1; floor <= state.floorsUnlocked; floor++) {
    const area = buildable(buildingOf(state), floor);
    for (const y of [FLOOR.corridorY - size.h, FLOOR.corridorY + 1]) {
      for (let x = area.x + area.w - size.w; x >= area.x; x--) {
        const plan = { floor, x, y, ...size, door: { x: x + Math.floor(size.w / 2) + 0.5, z: y < FLOOR.corridorY ? y + size.h : y } };
        if (roomError(state, plan) === null) return plan;
      }
    }
  }
  return null;
}

/** Builds a room of a kind where the bot would (see `placeFor`). The id of the room is `lastId`. */
function build(state: GameState, type: RoomType): GameState & { lastId?: Id } {
  const plan = placeFor(state, type);
  if (!plan) throw new Error(`Bot action failed: no floor has a place left for a ${type}.`);
  return must(buildRoom(state, { ...plan, type }));
}

/** Places desks (building rooms as needed) until everyone who works at one has one: manager's desks for the managers, writers' places for the writers, workstations for the rest. */
function ensureDesks(state: GameState): GameState {
  let s = state;
  for (const desk of ['managerDesk', 'writingDesk', 'workstation'] as const) {
    const workers = s.employees.filter((e) => needsDesk(e.role) && deskFor(e.role) === desk);
    if (workers.length === 0) continue;
    const roomType = deskRoomFor(workers[0]!.role);
    const placed = () => s.rooms.filter((r) => r.type === roomType).reduce((n, r) => n + r.furniture.filter((f) => f.type === desk).length, 0);
    const needed = () => s.employees.filter((e) => needsDesk(e.role) && deskFor(e.role) === desk).length - placed();
    while (needed() > 0) {
      const room = s.rooms.find((r) => r.type === roomType && findFreeSpot(s, r, desk));
      if (room) {
        s = must(autoPlaceFurniture(s, room.roomId, desk));
        continue;
      }
      if (!placeFor(s, roomType)) break;
      // A writers' room needs its story board before anyone can work in it.
      s = roomType === 'writersRoom' ? setUpStudio(s, roomType) : build(s, roomType);
    }
  }
  return s;
}

/**
 * Builds a studio, or another room with a checklist, and puts in it what the
 * checklist asks for. A TV studio gets its control room wall to wall with it
 * (0.16.0), with the control desk and the audio mixer in it. The id of the room is `lastId`.
 */
function setUpStudio(state: GameState, type: RoomType): GameState & { lastId?: Id } {
  const built = build(state, type);
  const roomId = built.lastId!;
  return Object.assign(must(addMissingEquipment(built, roomId)), { lastId: roomId });
}

/**
 * What every company needs before it goes on the air (0.16.0): a CEO's office
 * with its desk, and a desk at the reception. A bot puts its office at the far
 * end of the ground floor, out of the way of the rooms it builds from the stairs.
 */
function setUpHeadquarters(state: GameState): GameState {
  let s = state;
  if (!s.rooms.some((r) => r.type === 'ceoOffice')) {
    const plan = farPlaceFor(s, 'ceoOffice');
    if (!plan) throw new Error('Bot action failed: no place for a CEO’s office.');
    const built = must(buildRoom(s, { ...plan, type: 'ceoOffice' }));
    s = must(addMissingEquipment(built, built.lastId!));
  }
  if (!s.rooms.some((r) => r.roomId === RECEPTION.id && r.furniture.some((f) => f.type === 'receptionDesk'))) s = must(autoPlaceFurniture(s, RECEPTION.id, 'receptionDesk'));
  return s;
}

/**
 * The master control room every channel goes out through (0.16.0), with a
 * technician to work its desk. Like the CEO's office it goes at the far end of
 * the floor, out of the way of the rooms the bot builds from the stairs.
 */
function setUpMasterControl(state: GameState): GameState {
  let s = state;
  if (!masterControlRoom(s)) {
    const plan = farPlaceFor(s, 'masterControl');
    if (!plan) return s;
    const built = must(buildRoom(s, { ...plan, type: 'masterControl' }));
    s = must(addMissingEquipment(built, built.lastId!));
  }
  // Skill matters little at the desk: the cheapest will do, as Penny says.
  if (!s.employees.some((e) => e.role === 'technician')) s = hireBest(s, 'technician', 1, (p) => -p.salary);
  return s;
}

/** Slot indexes from most to fewest radio listeners: morning, afternoon, lunch, evening, late night. */
const SLOTS_BY_REACH = [0, 2, 1, 3, 4];

interface StationPlan {
  name: string;
  /** Genre per slot. */
  plan: readonly GenreId[];
  hosts: number;
  production: number;
  /** Writers, for the shows that are written (0.14.0). */
  writers?: number;
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
  if (station.writers) s = hireBest(s, 'writer', station.writers);
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
    const host = hasHost(getGenre(genre)) ? free('host').sort((a, b) => hostSkill(b, genre) - hostSkill(a, genre))[0] : undefined;
    const staff = free('production')
      .sort((a, b) => b.skill - a.skill)
      .slice(0, getGenre(genre).requiredStaff);
    const writers = free('writer')
      .sort((a, b) => b.skill - a.skill)
      .slice(0, getGenre(genre).writers?.needed ?? 0);
    s = must(
      createShow(s, {
        name: `${getGenre(genre).name} ${slot + 1}`,
        genre,
        hostId: host?.id ?? null,
        staffIds: staff.map((e) => e.id),
        writerIds: writers.map((e) => e.id),
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
  return setUpMasterControl(setUpHeadquarters(setUpStation(withTalk, FIRST_STATION, { radioStudio: withStudio.lastId!, radioTalkStudio: withTalk.lastId! }, scheduleShows)));
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
  if ((worn && load.repairs.needed > load.repairs.capacity) || load.crew.needed > load.crew.capacity) s = hireBest(s, 'technician', 1);
  if (s.rooms.some((r) => r.issue) && load.maintenance.needed > load.maintenance.capacity) s = hireBest(s, 'maintenance', 1);
  return s;
}

/**
 * Sets up a canteen once the company has `budget` in the bank, with a stove and a cook in it (0.15.0), and adds
 * tables as the staff grows, and a cook for every COOKS.mealsEach of them while there is room for a stove.
 */
function runCanteen(state: GameState, budget: number): GameState {
  let s = state;
  if (!s.rooms.some((r) => r.type === 'canteen')) {
    if (!placeFor(s, 'canteen') || s.money < budget) return s;
    s = setUpStudio(s, 'canteen');
  }
  const cooks = () => s.employees.filter((e) => e.role === 'cook').length;
  const stoves = () => s.rooms.filter((r) => r.type === 'canteen').reduce((n, r) => n + r.furniture.filter((f) => f.type === 'stove').length, 0);
  if (cooks() < Math.ceil(s.employees.length / COOKS.mealsEach) && s.candidates.some((c) => c.role === 'cook') && s.money > budget / 2) {
    const kitchen = s.rooms.find((r) => r.type === 'canteen' && findFreeSpot(s, r, 'stove'));
    if (stoves() <= cooks() && kitchen) s = must(autoPlaceFurniture(s, kitchen.roomId, 'stove'));
    if (stoves() > cooks()) s = hireBest(s, 'cook', 1);
  }
  for (const canteen of s.rooms.filter((r) => r.type === 'canteen')) {
    while (canteenCoverage(s) < 1 && findFreeSpot(s, s.rooms.find((r) => r.roomId === canteen.roomId)!, 'canteenTable')) {
      s = must(autoPlaceFurniture(s, canteen.roomId, 'canteenTable'));
    }
  }
  return s;
}

/**
 * Looks after morale beyond the canteen (0.15.0), once the company has `budget` in the bank: a post room with a
 * clerk for every POST.staffEach staff, and a meeting room where every team that has a manager meets each month.
 */
function lookAfterStaff(state: GameState, budget: number): GameState {
  let s = state;
  if (s.money < budget || s.employees.length < 12) return s;
  const room = (type: RoomType) => s.rooms.find((r) => r.type === type);
  if (!room('postRoom') && placeFor(s, 'postRoom')) s = setUpStudio(s, 'postRoom');
  const post = room('postRoom');
  const clerks = () => s.employees.filter((e) => e.role === 'clerk').length;
  if (post && clerks() < Math.ceil(s.employees.length / POST.staffEach) && s.candidates.some((c) => c.role === 'clerk')) {
    const cases = post.furniture.filter((f) => f.type === 'sortingCase').length;
    if (cases <= clerks() && findFreeSpot(s, post, 'sortingCase')) s = must(autoPlaceFurniture(s, post.roomId, 'sortingCase'));
    s = hireBest(s, 'clerk', 1);
  }
  if (!room('meetingRoom') && placeFor(s, 'meetingRoom')) s = setUpStudio(s, 'meetingRoom');
  for (const team of TEAM_IDS) {
    if (TEAMS[team].ledBy && !s.meetings[team]?.monthly) s = attempt(s, (x) => setMonthlyMeeting(x, team, true));
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
const sensibleBotMoves = (state: GameState): GameState => {
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
const capitalBotMoves = (state: GameState): GameState => {
  if (state.day === 0) return sensibleBotMoves(state);
  let s = acceptGoodOffers(sensibleBotMoves(state));
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
const neglectfulBotMoves = (state: GameState): GameState => (state.day === 0 ? setUpFirstStation(state, false) : state);

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
const growthBotMoves = (state: GameState): GameState => {
  if (state.day === 0) return staffSupport(setUpFirstStation(state, true));
  const s = acceptGoodOffers(keepHosts(state));
  return isFirstOfMonth(s.day) ? growRadio(s) : s;
};

/** Grows like the growth bot, but its second station is aimed at other audiences than its first: the way to grow the wiki's article “Growing” describes. */
const networkBotMoves = (state: GameState): GameState => {
  if (state.day === 0) return staffSupport(setUpFirstStation(state, true));
  const s = acceptGoodOffers(keepHosts(state));
  return isFirstOfMonth(s.day) ? growRadio(s, true, TALK_STATION) : s;
};

/** Grows like the growth bot but never hires support staff or builds a canteen. */
const noSupportBotMoves = (state: GameState): GameState => {
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
  if (support) s = stageEvents(lookAfterStaff(runCanteen(staffSupport(s), 100_000), 150_000));

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
    s = setUpMasterControl(s);
    // A studio of every kind its plan needs, once there is a master control room for it and a place for each.
    const kinds = [...new Set(second.plan.map((genre) => getGenre(genre).studio))];
    if (!masterControlRoom(s) || !kinds.every((type) => placeFor(s, type))) return s;
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

/** Money the TV bot wants before it launches: license, studio, post room, library, first titles and a buffer. */
export const TV_LAUNCH_MONEY = 650_000;

const TV_STATION: StationPlan = {
  name: 'Bot TV',
  // The kids' show and the soap in studios of their own, the soap written by two writers and the kids' show by one; licensed programs from the library.
  // Only the kids' show has a host.
  plan: ['kids', 'series', 'soap', 'movies', 'series'],
  hosts: 1,
  production: 6,
  writers: 3,
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
const researchBotMoves = (state: GameState): GameState => {
  if (state.day === 0) return staffSupport(setUpFirstStation(state, true));
  const s = acceptGoodOffers(keepHosts(state));
  return isFirstOfMonth(s.day) ? growRadio(keepUp(s, 5, 5)) : s;
};

/** Grows radio like the growth bot, then launches a TV channel in the Capital once it has the money. */
const tvBotMoves = (state: GameState): GameState => {
  if (state.day === 0) return staffSupport(setUpFirstStation(state, true));
  let s = bidOnAuctions(acceptGoodOffers(keepHosts(state)));
  if (!isFirstOfMonth(s.day)) return s;
  s = growRadio(s);

  const hasTv = s.channels.some((c) => c.medium === 'tv');
  if (!hasTv && s.money >= TV_LAUNCH_MONEY && s.floorsUnlocked >= 2) s = setUpMasterControl(s);
  if (!hasTv && s.money >= TV_LAUNCH_MONEY && s.floorsUnlocked >= 2 && masterControlRoom(s) && placeFor(s, 'tvKidsStudio')) {
    const built = setUpStudio(s, 'tvKidsStudio');
    const studios: Partial<Record<RoomType, string>> = { tvKidsStudio: built.lastId! };
    // A soap opera is made around a decor that has to be researched; without it the bot makes a sitcom instead. Each has a studio of its own.
    s = attempt(built, (x) => research(x, 'soapOperaFormat'));
    const second = s.techs.includes('soapOperaFormat') ? 'tvSoapStudio' : 'tvSitcomStudio';
    if (placeFor(s, second)) {
      const studio = setUpStudio(s, second);
      studios[second] = studio.lastId!;
      s = studio;
    }
    const soap = studios.tvSoapStudio !== undefined;
    // The titles come by post (0.17.0): a post room with its sorting case before the library.
    if (!hasPostRoom(s)) s = setUpStudio(s, 'postRoom');
    const library = setUpStudio(s, 'library');
    s = must(autoPlaceFurniture(library, library.lastId!, 'shelving'));
    s = stockLibrary(s);
    s = setUpStation(s, { ...TV_STATION, plan: TV_STATION.plan.map((genre) => (genre === 'soap' && !soap ? 'sitcom' : genre)) }, studios, true, 'tv');
  }
  if (s.channels.some((c) => c.medium === 'tv')) s = expandTv(stockLibrary(s));
  return s;
};

/** What a bot hands back to the game: the state it played, without the id of what it built last, which is the bot's own business. */
function played(state: GameState): GameState {
  if (!('lastId' in state)) return state;
  const { lastId: _, ...game } = state as GameState & { lastId?: Id };
  return game;
}

// The test players, as the game and the tests know them.
export const sensibleBot: Bot = (state) => played(sensibleBotMoves(state));
export const capitalBot: Bot = (state) => played(capitalBotMoves(state));
export const neglectfulBot: Bot = (state) => played(neglectfulBotMoves(state));
export const growthBot: Bot = (state) => played(growthBotMoves(state));
export const networkBot: Bot = (state) => played(networkBotMoves(state));
export const noSupportBot: Bot = (state) => played(noSupportBotMoves(state));
export const researchBot: Bot = (state) => played(researchBotMoves(state));
export const tvBot: Bot = (state) => played(tvBotMoves(state));
