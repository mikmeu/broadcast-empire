// Simple automated players for the headless balance check (scripts/simulate.ts)
// and the acceptance tests.

import { ACTIVE_REGIONS, ADS, CALLS, COOKS, EVENTS, HELICOPTER, LOAN, MAX_PLAYER_CHANNELS, MERCH, MERCH_LINES, NEWS_VAN, OFF_SPECIALTY_SKILL, OWN_EVENTS, POST, RECORDS, RENEWAL, REVAMP_COST, RIVALRY, SECURITY, TALENT, WEATHER, type OwnEventKind } from '../config/balance';
import { ACTS, FORMATS, getGenre, hasFormat, hasHost, lawsuitSource, type GenreId } from '../config/genres';
import { RECEPTION, ROOM_SIZES, TITLES_PER_SHELF, type RoomType } from '../config/office';
import {
  acceptOffer,
  assignVan,
  buildRoom,
  buyLicense,
  buyBoxes,
  buyNewsVan,
  buyHelicopter,
  sellHelicopter,
  buyRecords,
  buyRights,
  buyTitle,
  placeRightsBid,
  rightsPrice,
  createChannel,
  createShow,
  deleteShow,
  fire,
  grantRaise,
  hire,
  hireTemp,
  poachHost,
  callBrainstorm,
  setBackupHost,
  hireFlexWorker,
  letFlexWorkerGo,
  updateShow,
  matchPoachOffer,
  openStreaming,
  sendOnTraining,
  sendToTalentProgramme,
  promote,
  coachHost,
  placeBid,
  setStreamingPrice,
  research,
  openDecade,
  upgradeCost,
  upgradeEquipment,
  revampShow,
  rewriteShow,
  scheduleShow,
  settleCase,
  stageEvent,
  bookThemeWeek,
  setChannelManager,
  setMonthlyChannelMeeting,
  setMonthlyMeeting,
  setSalesJob,
  startCampaign,
  openSocialAccount,
  setShowTone,
  setAdMinutes,
  breakIn,
  type ActionResult,
} from './actions';
import { callInSlots, channelSpecialization, hasCapacity, hostSkill } from './broadcast';
import { takesVotes, votesWanted, votingOpen } from './calls';
import { buyOut, letStudio, sellShow } from './commands/deals';
import { buyOutCost, buyersFor, estimateSale, letBlocker, saleBlocker, salesAtDesk } from './deals';
import { shiftOf, vanBlocker } from './newsVans';
import { canHire, isUnlocked } from './unlocks';
import { weatherStudioOf } from './weather';
import { hasRushNews, helicopterBlocker } from './helicopter';
import { ordersBlocker, roomLeft, sellsMerchandise, shopHolds, showHype } from './merchandise';
import { adAppeal, adLimit, unsoldShare } from './adMinutes';
import { breakInBlocker } from './breakingNewsBooking';
import { isNewsGenre, leadStory } from './breakingNews';
import { freeMarketer } from './marketing';
import { onAirtime, onOrders, onTill, promotionBlocker, talentCost, trainingBlocker, trainingCost, workshops } from './staff';
import { mondayOf } from './themeWeeks';
import { themeWeekCost } from './themeWeekBooking';
import { airingsByGenre, hasPostRoom, hasRecords, hasServerRack, libraryCapacity, libraryUsed, playsRecords } from './content';
import { isFirstOfMonth, toCalendarDate } from './calendar';
import { sameSlot, standInFor } from './backup';
import { freeFlexWorkers } from './life';
import { brainstormBlocker, brainstormCost, brainstormShows } from './morale';
import { poachCooldown, poachTargets } from './poaching';
import { dividendReserve, maxLoan } from './economy';
import { repayLoan, takeLoan } from './commands/money';
import { addMissingEquipment, autoPlaceFurniture } from './fixtures';
import { EVENT_SIZE } from '../config/venues';
import { eventHosts, ownEventBlocker, ownEventCost } from './ownEvents';
import { TECHS, type TechId } from '../config/tech';
import { decadeBlocker, nextDecade, outdatedItems, researchBlocker } from './tech';
import { freeLicenses, licensePrice, playerLicensePrice } from './licenses';
import { buildingOf, deskOf, deskRoomOf, employeesWithDesk, findFreeSpot, needsDesk, wearsOut } from './office';
import { masterControlRoom } from './control';
import { candidatePlans, proposeBeside, proposeRoom, roomError } from './rooms';
import { lossChance, settlement } from './legal';
import { isCoached, unsafeHost } from './conduct';
import { showListeners, sponsorRefusal } from './sales';
import { fairPrice, onDemandTitles, roundPrice, serverRacks } from './streaming';
import { PLAYER, type Employee, type GameState, type Id, type Person, type Role } from './state';
import { canteenCoverage, targets, upkeepLoad } from './upkeep';

import { TEAMS, TEAM_IDS, isAway } from './teams';
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
  for (let floor = 1; floor <= state.floorsUnlocked; floor++) {
    for (const plan of candidatePlans(buildingOf(state), floor, ROOM_SIZES[type], { sideFirst: true, reverse: true })) {
      if (roomError(state, plan) === null) return plan;
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
    const workers = s.employees.filter((e) => needsDesk(e.role) && deskOf(e) === desk);
    if (workers.length === 0) continue;
    const roomType = deskRoomOf(workers[0]!);
    const placed = () => s.rooms.filter((r) => r.type === roomType).reduce((n, r) => n + r.furniture.filter((f) => f.type === desk).length, 0);
    const needed = () => s.employees.filter((e) => needsDesk(e.role) && deskOf(e) === desk).length - placed();
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

/**
 * Makes room in a library for `places` more (0.18.0): the post room the titles come through, a library if there is none, and shelving
 * until that much is free; another library when the last is full.
 */
function makeRoomInLibrary(state: GameState, places: number): GameState {
  // Both go in the first gap of the south row, so that the north row keeps room for a canteen.
  const setUpFar = (from: GameState, type: RoomType) => {
    let plan: ReturnType<typeof placeFor> = null;
    for (let floor = 1; floor <= from.floorsUnlocked && !plan; floor++) {
      plan = candidatePlans(buildingOf(from), floor, ROOM_SIZES[type], { sideFirst: true, highFirst: true }).find((candidate) => roomError(from, candidate) === null) ?? null;
    }
    plan ??= placeFor(from, type);
    if (!plan) throw new Error(`Bot action failed: no floor has a place left for a ${type}.`);
    const built = must(buildRoom(from, { ...plan, type }));
    return Object.assign(must(addMissingEquipment(built, built.lastId!)), { lastId: built.lastId! });
  };
  let s = state;
  if (!hasPostRoom(s) && !hasServerRack(s)) s = setUpFar(s, 'postRoom');
  while (libraryCapacity(s) - libraryUsed(s) < places) {
    const room = s.rooms.find((r) => r.type === 'library' && findFreeSpot(s, r, 'shelving'));
    if (room) {
      s = must(autoPlaceFurniture(s, room.roomId, 'shelving'));
      continue;
    }
    const library = setUpFar(s, 'library');
    s = must(autoPlaceFurniture(library, library.lastId!, 'shelving'));
  }
  return s;
}

/** Buys the record collections the shows of a station play, building the library for them first: there is no starter collection (0.18.0). */
function stockRecords(state: GameState, plan: readonly GenreId[]): GameState {
  let s = state;
  for (const genre of new Set(plan.filter((g) => playsRecords(g) && !hasRecords(s, g)))) {
    s = makeRoomInLibrary(s, RECORDS.libraryUnits);
    s = attempt(s, (x) => buyRecords(x, genre));
  }
  return s;
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
  // News in the evening too, for the professionals.
  plan: ['morningShow', 'rock', 'top40', 'news', 'rock'],
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

/** A fourth station (#458), for what the other three leave: the morning show, classical music, talk, news and rock. */
const GOLD_STATION: StationPlan = {
  name: 'Bot Gold',
  plan: ['morningShow', 'classical', 'talk', 'news', 'rock'],
  hosts: 5,
  production: 5,
  region: 'capital',
};

/** Whether the first station is bought in the headquarters region, not the Capital (#428): see `atHome`. */
let firstStationAtHome = false;

/** A bot that buys its first licence in the region of its headquarters, as a player who skips Penny's advice does (#428). */
export const atHome =
  (bot: Bot): Bot =>
  (state) => {
    firstStationAtHome = true;
    try {
      return bot(state);
    } finally {
      firstStationAtHome = false;
    }
  };

const CAPITAL_AND_UP = ['capital', 'growth', 'network', 'nosupport', 'research', 'tv', 'stream'];
const GROWERS = ['growth', 'network', 'research', 'tv', 'stream'];
const WITH_SHOP = ['sensible', 'capital', 'growth', 'network', 'research', 'tv', 'stream'];

/**
 * The features a test player can leave out (#442), each with the bots that play it. `npm run simulate -- --without <feature>`
 * plays the same bot without it, to show what it is worth. A bot that never plays a feature cannot leave it out.
 */
export const LEAVE_OUT = {
  events: { what: 'staging its own events', usedBy: GROWERS },
  themeWeeks: { what: 'booking theme weeks', usedBy: GROWERS },
  helicopter: { what: 'buying the traffic helicopter', usedBy: GROWERS },
  giftShop: { what: 'the gift shop', usedBy: WITH_SHOP },
  secondStation: { what: 'the second radio station', usedBy: [...GROWERS, 'nosupport'] },
  sponsors: { what: 'accepting sponsor offers (the deal salespeople stay)', usedBy: CAPITAL_AND_UP },
  canteen: { what: 'the canteen', usedBy: ['sensible', 'capital', ...GROWERS] },
  marketing: { what: 'hiring marketing and running campaigns', usedBy: [...GROWERS, 'nosupport'] },
  lawyer: { what: 'hiring a lawyer (cases are still settled)', usedBy: [...GROWERS, 'nosupport'] },
  newsVan: { what: 'the news van', usedBy: GROWERS },
  weather: { what: 'the weather studio', usedBy: GROWERS },
  callCentre: { what: 'the call centre', usedBy: GROWERS },
  security: { what: 'the security room', usedBy: GROWERS },
  scheduling: { what: 'the music scheduling office', usedBy: GROWERS },
  tv: { what: 'the TV channel (launch, auctions and licences)', usedBy: ['tv', 'stream'] },
  streaming: { what: 'the streaming service', usedBy: ['stream'] },
  loans: { what: 'borrowing to launch TV sooner, and repaying early', usedBy: ['tv', 'stream'] },
  deals: { what: 'selling a show to a rival, letting a studio, and buying out', usedBy: GROWERS },
  sportsRights: { what: 'buying sports rights and bidding for the World Cup and the Olympics (the sports show stays)', usedBy: ['tv', 'stream'] },
  training: { what: 'courses, the workshop and the talent programme (weak hosts are still replaced from the hiring pool)', usedBy: GROWERS },
  promotions: { what: 'promoting a head of production from inside (one is hired instead)', usedBy: GROWERS },
  coaching: { what: 'a psychologist to coach an unsafe host (the host is let go instead)', usedBy: GROWERS },
  formats: { what: 'documentaries, teleshopping, a game show and reality TV on the TV channel (the plain schedule stays)', usedBy: ['tv', 'stream'] },
  poaching: { what: 'signing a rival’s host for the weakest show of that genre', usedBy: GROWERS },
  brainstorms: { what: 'a consultant’s brainstorm when it is cheaper than the revamps', usedBy: GROWERS },
  flexWorkers: { what: 'flex workers in place of agency temps', usedBy: GROWERS },
  backupHosts: { what: 'back-up hosts for an ill host (a temp is hired at once instead)', usedBy: GROWERS },
  socialAccounts: { what: 'a social media account for every channel, with a marketer to run it', usedBy: GROWERS },
  tone: { what: 'a bold tone on the shows that can be sued, while a lawyer is at a desk (every show stays normal instead)', usedBy: GROWERS },
  adMinutes: { what: 'the ad minutes dial, kept at what sells (it stays at 5 instead)', usedBy: GROWERS },
  breakingNews: { what: 'breaking in on a story, in the emptiest slot that is not news', usedBy: GROWERS },
  moreStations: { what: 'a third and fourth radio station in the Capital', usedBy: GROWERS },
  secondTvChannel: { what: 'a second TV channel with licensed titles only', usedBy: ['tv', 'stream'] },
} as const satisfies Record<string, { what: string; usedBy: readonly string[] }>;

export type LeftOut = keyof typeof LEAVE_OUT;

/** Why a bot cannot leave a feature out, or null when it can: an unknown name, or a bot that never plays the feature (#442). */
export function leaveOutProblem(feature: string, bot: string): string | null {
  if (!(feature in LEAVE_OUT)) return `Unknown feature "${feature}". Use: ${Object.keys(LEAVE_OUT).join(', ')}`;
  const { what, usedBy } = LEAVE_OUT[feature as LeftOut];
  const users: readonly string[] = usedBy;
  return users.includes(bot) ? null : `The ${bot} bot never plays "${feature}" (${what}), so the game would only repeat the full one. Bots that do: ${users.join(', ')}.`;
}

/** The feature the bot now playing leaves out (#442): see `without`. */
let leftOutFeature: LeftOut | null = null;
const leftOut = (feature: LeftOut) => leftOutFeature === feature;

/** A bot that leaves one feature out, to show what the feature is worth (#442). Nothing changes for a bot that is not wrapped. */
export const without =
  (feature: LeftOut) =>
  (bot: Bot): Bot =>
  (state) => {
    leftOutFeature = feature;
    try {
      return bot(state);
    } finally {
      leftOutFeature = null;
    }
  };

function setUpFirstStation(state: GameState, scheduleShows: boolean): GameState {
  const withStudio = setUpStudio(state, 'radioStudio');
  const withTalk = setUpStudio(withStudio, 'radioTalkStudio');
  const first = firstStationAtHome ? { ...FIRST_STATION, region: state.headquarters } : FIRST_STATION;
  const station = setUpMasterControl(setUpHeadquarters(setUpStation(withTalk, first, { radioStudio: withStudio.lastId!, radioTalkStudio: withTalk.lastId! }, scheduleShows)));
  // The records come last (0.18.0), so the post room and the library take the floor that is left after the rooms the station is made in.
  return scheduleShows ? stockRecords(station, first.plan) : station;
}

/** The shows its writers lead are rewritten, not revamped (0.22.0, #260): see `rewriteStaleShows`. */
function revampStaleShows(state: GameState, reserve: number): GameState {
  return rewriteStaleShows(
    state.shows
      .filter((show) => show.freshness < 0.8 && !hasFormat(show.genre))
      .reduce((s, show) => {
        const result = revampShow(s, show.id);
        return result.ok && result.state.money > reserve ? result.state : s;
      }, state),
  );
}

/** A show with a format under 80% gets every act but the signature one moved to the next option along, each time the four weeks are up. */
function rewriteStaleShows(state: GameState): GameState {
  return state.shows
    .filter((show) => show.freshness < 0.8 && show.format)
    .reduce((s, show) => {
      const acts = FORMATS[show.genre];
      const format = show.format;
      if (!acts || !format) return s;
      const next = { ...format };
      for (const { id } of ACTS) {
        if (acts[id].signature === format[id]) continue;
        // The next option along, never the signature.
        const options = acts[id].options.filter((o) => o.id !== acts[id].signature);
        next[id] = options[(options.findIndex((o) => o.id === format[id]) + 1) % options.length]!.id;
      }
      const result = rewriteShow(s, show.id, next);
      return result.ok ? result.state : s;
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
  if (leftOut('canteen')) return state;
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

/** The most call agents a bot hires (0.20.0). */
const CALL_AGENTS_MAX = 40;
/** What a bot keeps in hand for a weather studio and its kit (0.22.0): the room, a camera, lights, a green screen and a weather desk. */
const WEATHER_BUDGET = 40_000;
/** What a bot keeps in hand after buying the traffic helicopter (0.22.0, #395). */
const HELICOPTER_RESERVE = 2_000_000;
/** A bot sells the helicopter when its money falls below this. */
const HELICOPTER_SELL_BELOW = 1_500_000;

/**
 * Looks after morale beyond the canteen (0.15.0), once the company has `budget` in the bank: a post room with a
 * clerk for every POST.staffEach staff, and a meeting room where every team that has a manager meets each month,
 * and the production team of every channel that has a channel manager (0.17.0).
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
  // Once a host is famous (0.18.0): a security room, with a guard for every SECURITY.hostsEach of them.
  const famous = targets(s).length;
  if (famous > 0 && !leftOut('security') && !room('securityRoom') && placeFor(s, 'securityRoom')) s = setUpStudio(s, 'securityRoom');
  const security = room('securityRoom');
  const guards = () => s.employees.filter((e) => e.role === 'guard').length;
  if (security && guards() < Math.ceil(famous / SECURITY.hostsEach) && s.candidates.some((c) => c.role === 'guard')) {
    const desks = security.furniture.filter((f) => f.type === 'securityDesk').length;
    if (desks <= guards() && findFreeSpot(s, security, 'securityDesk')) s = must(autoPlaceFurniture(s, security.roomId, 'securityDesk'));
    s = hireBest(s, 'guard', 1);
  }
  // Phone lines (0.20.0): a call centre with an agent for each CALLS.each calls a talk show or a vote on a game show wants.
  const desked = employeesWithDesk(s);
  const voters = (s.lastDay?.channels ?? []).filter((c) => c.isPlayer).flatMap((c) => c.slots).filter((slot) => slot.showId && !slot.titleId && takesVotes(s.shows.find((x) => x.id === slot.showId)?.genre ?? ''));
  const wanted = callInSlots(s, desked) * CALLS.callIn + (votingOpen(s) ? voters.reduce((sum, slot) => sum + votesWanted(slot.listeners), 0) : 0);
  const agents = () => s.employees.filter((e) => e.role === 'callAgent').length;
  if (wanted > 0 && !leftOut('callCentre') && canHire(s, 'callAgent') && !room('callCentre') && placeFor(s, 'callCentre')) s = setUpStudio(s, 'callCentre');
  // Up to six a month, so the agents keep up with the votes of a game show.
  for (let hired = 0; hired < 6 && room('callCentre') && agents() < Math.min(CALL_AGENTS_MAX, Math.ceil(wanted / CALLS.each)) && s.candidates.some((c) => c.role === 'callAgent'); hired++) {
    const centres = () => s.rooms.filter((r) => r.type === 'callCentre');
    const callDesks = () => centres().reduce((n, r) => n + r.furniture.filter((f) => f.type === 'callDesk').length, 0);
    if (callDesks() <= agents()) {
      // A call centre holds a few desks: when the last one is full the next goes in a call centre of its own (#456, a game show's votes need many agents).
      const open = centres().find((r) => findFreeSpot(s, r, 'callDesk'));
      if (open) s = must(autoPlaceFurniture(s, open.roomId, 'callDesk'));
      else if (placeFor(s, 'callCentre')) s = setUpStudio(s, 'callCentre');
    }
    s = hireBest(s, 'callAgent', 1);
  }
  // News vans (0.20.0): once there is a news show on the air, one van and one journalist, for the shift with more news shows.
  const newsIn = (shift: 'day' | 'evening') =>
    s.channels.reduce((n, c) => n + c.schedule.filter((id, slot) => shiftOf(slot) === shift && (NEWS_VAN.newsGenres as readonly string[]).includes(s.shows.find((x) => x.id === id)?.genre ?? '')).length, 0);
  const newsShift = newsIn('evening') >= newsIn('day') ? 'evening' : 'day';
  if (!leftOut('newsVan') && s.vans.length === 0 && vanBlocker(s) === null && newsIn(newsShift) > 0 && s.money >= budget + NEWS_VAN.price) {
    const bought = attempt(s, buyNewsVan);
    if (bought.vans.length > 0) s = attempt(bought, (x) => assignVan(x, x.vans[0]!.id, newsShift));
  }
  if (s.vans.length > 0 && !s.employees.some((e) => e.role === 'journalist') && s.candidates.some((c) => c.role === 'journalist')) s = seat(hireBest(s, 'journalist', 1));
  // The weather studio (0.22.0): once there is a news show on the air, one weather studio wall to wall with the studio it is made in, and a meteorologist.
  const newsStudios = [...new Set(s.channels.flatMap((c) => c.schedule).map((id) => s.shows.find((x) => x.id === id)).filter((show) => show && (WEATHER.newsGenres as readonly string[]).includes(show.genre) && show.studioId).map((show) => show!.studioId!))];
  if (!leftOut('weather') && !room('weatherStudio') && isUnlocked(s, 'weather') && s.money >= budget + WEATHER_BUDGET && newsStudios.some((id) => !weatherStudioOf(s, id) && proposeBeside(s, id, 'weatherStudio'))) {
    const studio = newsStudios.find((id) => proposeBeside(s, id, 'weatherStudio'))!;
    const plan = proposeBeside(s, studio, 'weatherStudio')!;
    const built = must(buildRoom(s, { ...plan, type: 'weatherStudio' }));
    s = must(addMissingEquipment(built, built.lastId!));
  }
  const weatherRoom = room('weatherStudio');
  if (weatherRoom && !s.employees.some((e) => e.role === 'meteorologist') && canHire(s, 'meteorologist') && s.candidates.some((c) => c.role === 'meteorologist')) s = seat(hireBest(s, 'meteorologist', 1));
  // The traffic helicopter (0.22.0, #395): once it is open and a news show is on in a rush slot, with its price and a reserve in hand.
  // It costs about €365,000 a year in flights and a bot's news draws little more for it: a bot buys only when rich and sheds it when cash runs low.
  if (s.helicopter && s.money < HELICOPTER_SELL_BELOW) s = attempt(s, sellHelicopter);
  else if (!leftOut('helicopter') && helicopterBlocker(s) === null && hasRushNews(s) && s.money >= budget + HELICOPTER.price + HELICOPTER_RESERVE) s = attempt(s, buyHelicopter);
  if (!room('meetingRoom') && placeFor(s, 'meetingRoom')) s = setUpStudio(s, 'meetingRoom');
  for (const team of TEAM_IDS) {
    if (TEAMS[team].ledBy && !s.meetings[team]?.monthly) s = attempt(s, (x) => setMonthlyMeeting(x, team, true));
  }
  for (const channel of s.channels) {
    if (channel.managerId && !s.channelMeetings[channel.id]?.monthly) s = attempt(s, (x) => setMonthlyChannelMeeting(x, channel.id, true));
  }
  return s;
}

/** Desks for whoever was just taken on, as far as the money goes: a bot that cannot pay for one leaves them without. */
function seat(state: GameState): GameState {
  try {
    return ensureDesks(state);
  } catch {
    return state;
  }
}

/**
 * Looks after the people who are away (0.20.0): a temp for anyone who is on leave or ill,
 * and someone new, from the pool, for a channel manager, host or production person who retired or died, given the
 * work they left (hosts and production staff of a show, and the writers of a show that has them).
 */
function coverStaff(state: GameState): GameState {
  let s = state;
  for (const e of s.employees) {
    // An ill host whose back-up stands in gets no temp: the back-up saves the fee. Once the days of cover run out, the temp comes (#457).
    if (isAway(s, e) && !e.away!.temp && !(e.role === 'host' && !leftOut('backupHosts') && standInFor(s, e))) s = attempt(s, (x) => hireTemp(x, e.id));
  }
  for (const channel of s.channels) {
    if (channel.managerId && s.employees.some((e) => e.id === channel.managerId)) continue;
    const before = new Set(s.employees.map((e) => e.id));
    const hired = hireBest(s, 'channelManager', 1);
    const manager = hired.employees.find((e) => !before.has(e.id));
    if (manager) s = seat(attempt(hired, (x) => setChannelManager(x, channel.id, manager.id)));
  }
  for (const show of s.shows) {
    const genre = getGenre(show.genre);
    if (genre.kind === 'licensed') continue;
    // All or nothing: people hired for a show that cannot be changed would be hired again the next day.
    const untouched = s;
    const wanted =(role: Role, have: readonly Id[], needed: number, prefer?: (p: Person) => number) => {
      let ids = have.filter((id) => s.employees.some((e) => e.id === id));
      while (ids.length < needed) {
        const before = new Set(s.employees.map((e) => e.id));
        s = hireBest(s, role, 1, prefer);
        const person = s.employees.find((e) => e.role === role && !before.has(e.id));
        if (!person) break;
        ids = [...ids, person.id];
      }
      return ids;
    };
    const hostless = hasHost(genre) && !show.hostId;
    const staff = wanted('production', show.staffIds, genre.requiredStaff);
    const writers = wanted('writer', show.writerIds, genre.writers?.needed ?? 0);
    let hostId = show.hostId;
    if (hostless) {
      const before = new Set(s.employees.map((e) => e.id));
      s = hireBest(s, 'host', 1, (p) => hostSkill(p, show.genre));
      hostId = s.employees.find((e) => e.role === 'host' && !before.has(e.id))?.id ?? null;
    }
    if (hostId === show.hostId && staff.length === show.staffIds.length && writers.length === show.writerIds.length) continue;
    const seated = seat(s);
    const updated = updateShow(seated, show.id, { name: show.name, genre: show.genre, hostId, staffIds: staff, writerIds: writers, editorIds: show.editorIds, studioId: show.studioId });
    s = updated.ok ? updated.state : untouched;
  }
  return s;
}

/**
 * Keeps what the company has: matches offers rivals make to its hosts, pays a
 * host who won an award what they ask, and in a renewal round bids enough that
 * no challenger can take the license (the most a challenger bids, less the
 * holder's advantage) when it has the money.
 */
function keepHosts(state: GameState): GameState {
  const covered = coverStaff(state);
  let s = covered.poachOffers.reduce((x, offer) => attempt(x, (y) => matchPoachOffer(y, offer.id)), covered);
  s = s.awards.raises.reduce((x, request) => attempt(x, (y) => grantRaise(y, request.id)), s);
  for (const auction of s.auctions) {
    const holder = auction.holder;
    if (holder?.ownerId !== PLAYER || auction.bid || auction.interested === 0) continue;
    // Rivalry only pushes a challenger's bid once a rival watches you (#414): before that the old bid is safe.
    const push = s.rivals.some((r) => r.rivalry >= RIVALRY.watch) ? 1 + RIVALRY.bidPush : 1;
    const safe = Math.ceil((holder.value * RENEWAL.challengeYears.max * push) /(1 + RENEWAL.holderAdvantage) / 1000) * 1000;
    // No challenger can bid more than it has (#414), so a bid of that money over the holder's advantage is safe too.
    const richest = Math.max(0, ...s.rivals.map((r) => r.money));
    const beyondAnyPurse = Math.ceil(richest / (1 + RENEWAL.holderAdvantage) / 1000) * 1000;
    const amount = Math.max(auction.reserve, Math.min(safe, beyondAnyPurse, Math.floor(s.money / 1000) * 1000));
    if (amount > auction.reserve) s = attempt(s, (x) => placeBid(x, auction.id, holder.channelId, amount));
  }
  return s;
}

/**
 * Once a year per channel, stages the biggest event the company can pay for
 * out of the cash above its dividend reserve: money the owners would otherwise take.
 */
function stageEvents(state: GameState): GameState {
  if (leftOut('events')) return state;
  let s = state;
  for (const channel of s.channels) {
    const spare = s.money - dividendReserve(s);
    // They hold it at the outside venue that fits the kind, with their most famous host (0.22.0, #404).
    const hostId = eventHosts(s, channel)[0]?.id ?? null;
    const kind = (['telethon', 'gala', 'concert'] as OwnEventKind[]).find((k) => ownEventCost(s, channel, k, EVENT_SIZE[k], hostId).total <= spare && !ownEventBlocker(s, channel, k, EVENT_SIZE[k], hostId));
    if (kind && OWN_EVENTS[kind]) s = attempt(s, (x) => stageEvent(x, channel.id, kind, EVENT_SIZE[kind], hostId));
  }
  return s;
}

/**
 * Twice a year per radio channel, books a hit list (a listener game on a channel that is not about music) for a
 * Monday five weeks ahead, when the cash above the dividend reserve covers it and no other week is near.
 */
function bookThemeWeeks(state: GameState): GameState {
  if (leftOut('themeWeeks')) return state;
  let s = state;
  for (const channel of s.channels.filter((c) => c.medium === 'radio')) {
    const startDay = mondayOf(s.day) + 35;
    const kind = channelSpecialization(s, channel) === 'Music' ? 'hitList' : 'game';
    const spare = s.money - dividendReserve(s);
    if (themeWeekCost(s, channel.id, kind) > spare || s.themeWeeks.some((w) => w.channelId === channel.id && Math.abs(w.startDay - startDay) < 150)) continue;
    s = attempt(s, (x) => bookThemeWeek(x, channel.id, kind, startDay));
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
 * With a second salesperson, and a tenth of the ad minutes unsold yesterday, the newest goes on airtime to find buyers (0.21.0, #363); the
 * first stays on deals. A player who reads the line under the dial does the same.
 */
function putOnAirtime(state: GameState): GameState {
  const sellers = state.employees.filter((e) => e.role === 'sales' && !onTill(e) && !onOrders(e));
  if (sellers.length < 2 || sellers.some(onAirtime) || unsoldShare(state, state.lastDay) < 0.1) return state;
  return attempt(state, (x) => setSalesJob(x, sellers[sellers.length - 1]!.id, 'airtime'));
}

/**
 * Whether a salesperson works on sponsor deals (a missing job counts as deals). The gift shop's people on the till and on orders have the
 * role `sales` too, so the bots hire for deals by this, not by the role (#426).
 */
const onDeals = (e: Employee) => e.role === 'sales' && (e.salesJob ?? 'deals') === 'deals';

// --- Deals: selling a show, letting a studio, buying out (#453) ---

/** Cash a bot wants before it makes a deal, the same as the gift shop's. */
const DEALS_MONEY = 150_000;
/** A sale has to bring in this many times the monthly salary of the host hired for it. */
const SALE_OVER_SALARY = 1.5;
/** Cash above which a bot buys a tenant out to have the studio back, the same as for a second station's licence. */
const BUY_OUT_RESERVE = 200_000;

/** Whether a bot can make a deal today: Selling shows is open, a salesperson on deals has a desk, and the cash is there (#453). */
const dealsOpen = (s: GameState) => !leftOut('deals') && isUnlocked(s, 'showSales') && salesAtDesk(s) && s.money > DEALS_MONEY;

/** The radio shows the bot has records for, that it makes to sell: they come in the genre its studios are for. */
const SALE_GENRES: readonly GenreId[] = ['top40', 'rock'];

/**
 * Sells a show to the rival channel that pays most, one sale at a time. A produced show that is off the schedule (one that is back
 * from last year's sale) goes first. Otherwise the bot hires the cheapest host and makes a show to sell, when the sale is worth
 * 1.5 times the host's salary. It plays the whole try on a copy and keeps it only when the sale goes through, so a failed try costs nothing.
 */
function sellAShow(state: GameState): GameState {
  if (!dealsOpen(state) || state.showSales.length > 0) return state;
  const bestBuyer = (s: GameState, show: GameState['shows'][number], atLeast: number) =>
    buyersFor(s, show)
      .map((b) => ({ ...b, estimate: estimateSale(s, b.channel.id, b.slot) }))
      .filter((b) => b.estimate >= atLeast)
      .sort((a, b) => b.estimate - a.estimate);
  const spare = state.shows.find((show) => saleBlocker(state, show) === null && getGenre(show.genre).medium === 'radio');
  if (spare) {
    for (const buyer of bestBuyer(state, spare, 0)) {
      const sold = attempt(state, (x) => sellShow(x, spare.id, buyer.channel.id));
      if (sold !== state) return sold;
    }
    return state;
  }
  const genre = SALE_GENRES.find((g) => hasRecords(state, g));
  const host = state.candidates.filter((c) => c.role === 'host').sort((a, b) => a.salary - b.salary)[0];
  if (!genre || !host) return state;
  const hired = attempt(state, (x) => hire(x, host.id));
  if (hired === state) return state;
  const hostId = hired.employees.find((e) => !state.employees.some((o) => o.id === e.id) && e.role === 'host')?.id;
  const crew = hired.employees
    .filter((e) => e.role === 'production' && hasCapacity(hired, e.id))
    .sort((a, b) => b.skill - a.skill)
    .slice(0, getGenre(genre).requiredStaff);
  if (!hostId || crew.length < getGenre(genre).requiredStaff) return state;
  for (const studio of hired.rooms.filter((r) => r.type === 'radioStudio')) {
    const made = attempt(hired, (x) => createShow(x, { name: `Sold ${getGenre(genre).name} ${hired.shows.length + 1}`, genre, hostId, staffIds: crew.map((e) => e.id), studioId: studio.roomId }));
    const show = made.shows.find((sh) => !hired.shows.some((o) => o.id === sh.id));
    if (!show) continue;
    for (const buyer of bestBuyer(made, show, host.salary * SALE_OVER_SALARY)) {
      const sold = attempt(made, (x) => sellShow(x, show.id, buyer.channel.id));
      if (sold !== made) return sold;
    }
  }
  return state;
}

/**
 * Lets one studio no show uses, one letting at a time. When there is none it builds a bare radio studio (no equipment) to let, as long
 * as a place is left for the next one the bot will want.
 */
function letAStudio(state: GameState): GameState {
  if (!dealsOpen(state) || state.studioLets.length > 0) return state;
  const unused = state.rooms.find((r) => letBlocker(state, r) === null);
  if (unused) return attempt(state, (x) => letStudio(x, unused.roomId));
  if (!placeFor(state, 'radioStudio')) return state;
  const built = build(state, 'radioStudio');
  if (!placeFor(built, 'radioStudio')) return state;
  const let_ = attempt(built, (x) => letStudio(x, built.lastId!));
  return let_ === built ? state : let_;
}

/** Whether a studio of a kind is let out to a tenant. */
const hasLetStudio = (state: GameState, type: RoomType) => state.studioLets.some((l) => state.rooms.some((r) => r.roomId === l.roomId && r.type === type));

/**
 * Buys the tenant out of a let studio of a kind the bot is about to build, when the cash above its reserve covers it, and puts in
 * the equipment it lacks. Null when there is no such studio or it costs too much. The id of the room is `lastId`.
 */
function buyOutToUse(state: GameState, type: RoomType): (GameState & { lastId?: Id }) | null {
  const deal = state.studioLets.find((l) => state.rooms.some((r) => r.roomId === l.roomId && r.type === type));
  if (!deal || state.money - buyOutCost(state, deal) < BUY_OUT_RESERVE) return null;
  const bought = attempt(state, (x) => buyOut(x, deal.id));
  if (bought === state) return null;
  const equipped = attempt(bought, (x) => addMissingEquipment(x, deal.roomId));
  return Object.assign(equipped, { lastId: deal.roomId });
}

/** Sells a show and lets a studio, once a month (#453). */
const makeDeals = (state: GameState): GameState => letAStudio(sellAShow(state));

/**
 * One well-run channel that stays in the Capital: like the sensible bot, plus
 * sponsors, a production manager and one researcher to keep the studios up to
 * date. The case Penny warns about (#431).
 */
const capitalBotMoves = (state: GameState): GameState => {
  if (state.day === 0) return sensibleBotMoves(state);
  let s = acceptGoodOffers(sensibleBotMoves(state));
  if (!isFirstOfMonth(s.day)) return s;
  const has = (role: Role) => s.employees.some((e) => e.role === role);
  if (!s.employees.some(onDeals)) s = ensureDesks(hireBest(s, 'sales', 2));
  s = putOnAirtime(s);
  s = makeDeals(s);
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
  if (leftOut('sponsors') || state.offers.length === 0 || !state.lastDay) return state;
  let s = state;
  const listeners = showListeners(state.lastDay);
  for (const offer of [...s.offers].sort((a, b) => b.cpmMultiplier - a.cpmMultiplier)) {
    const show = s.shows
      .filter(
        (sh) => sponsorRefusal(s, offer, sh) === null && (listeners.get(sh.id) ?? 0) >= offer.minListeners * 1.15,
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
  if (!region || state.money - playerLicensePrice(state, 'radio', region) < RESERVE) return state;
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
  const s = breakInOnStories(staffMoves(acceptGoodOffers(keepHosts(state))));
  return isFirstOfMonth(s.day) ? growRadio(s) : s;
};

/** Grows like the growth bot, but its second station is aimed at other audiences than its first: the way to grow the wiki's article “Growing” describes. */
const networkBotMoves = (state: GameState): GameState => {
  if (state.day === 0) return staffSupport(setUpFirstStation(state, true));
  const s = breakInOnStories(staffMoves(acceptGoodOffers(keepHosts(state))));
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
function keepUp(state: GameState, researchers: number, yearsEarly: number, reserve = 100_000, saveFor: readonly TechId[] = []): GameState {
  let s = state;
  const month = Math.round(s.day / 30.44);
  const have = s.employees.filter((e) => e.role === 'researcher').length;
  if (month >= 3 && have < researchers && s.money > reserve) s = ensureDesks(hireBest(s, 'researcher', researchers - have));
  const year = toCalendarDate(s.day).year;
  // A bot that researches early opens the next decade as soon as it can; one that waits for the years never needs to.
  const next = nextDecade(s);
  if (yearsEarly > 0 && next !== null && next - yearsEarly <= year && !decadeBlocker(s, next)) s = attempt(s, (x) => openDecade(x, next));
  // A bot that is saving for techs (the TV bot, for the formats of its first shows) spends nothing else until it has them.
  for (const tech of saveFor) if (!s.techs.includes(tech)) s = attempt(s, (x) => research(x, tech));
  for (const tech of TECHS.filter((t) => t.year - yearsEarly <= year && saveFor.every((id) => s.techs.includes(id)))) {
    if (!researchBlocker(s, tech)) s = attempt(s, (x) => research(x, tech.id));
  }
  for (const room of s.rooms.filter((r) => outdatedItems(s, r).length > 0)) {
    if (s.money - upgradeCost(s, room.roomId) > reserve) s = attempt(s, (x) => upgradeEquipment(x, room.roomId));
  }
  return s;
}

/** Once the company has two channels and `budget` in the bank, a music scheduling office with one scheduler in it (0.18.0), the way the post room gets its clerk. */
function runScheduling(state: GameState, budget: number): GameState {
  let s = state;
  if (leftOut('scheduling') || s.channels.length < 2 || s.money < budget) return s;
  if (!canHire(s, 'scheduler')) return s;
  if (!s.rooms.some((r) => r.type === 'musicSchedulingOffice')) {
    if (!placeFor(s, 'musicSchedulingOffice')) return s;
    s = setUpStudio(s, 'musicSchedulingOffice');
  }
  if (!s.employees.some((e) => e.role === 'scheduler') && s.candidates.some((c) => c.role === 'scheduler')) s = hireBest(s, 'scheduler', 1);
  return s;
}

/**
 * Lawsuits (0.19.0): with three or more shows that can be sued on the air, a lawyer at a workstation; and a case is settled when
 * the chance of losing it is above a half and the money is there. The growers set the tone of those shows in `setTones` (#458);
 * every other bot leaves every show on the normal tone.
 */
function defendShows(state: GameState): GameState {
  let s = state;
  const sueable = s.shows.filter((show) => lawsuitSource(show.genre) !== null && s.channels.some((c) => c.schedule.includes(show.id)));
  if (!leftOut('lawyer') && sueable.length >= 3 && !s.employees.some((e) => e.role === 'lawyer') && s.candidates.some((c) => c.role === 'lawyer') && s.money > 100_000) {
    s = ensureDesks(hireBest(s, 'lawyer', 1));
  }
  const desked = employeesWithDesk(s);
  for (const lawsuit of s.lawsuits) {
    if (lossChance(s, desked) > 0.5 && s.money > settlement(s, desked, lawsuit) * 2) s = attempt(s, (x) => settleCase(x, lawsuit.id));
  }
  return s;
}

// --- Social accounts, tone, the ad dial and breaking news (#458) ---

/** Cash a bot wants in hand before it opens social media accounts (#458). */
const SOCIAL_MONEY = 200_000;

/** A social media account for every channel once Social media is researched and 200k is in hand, with a marketer hired for each that has none free (#458). Never closed again. */
function openSocialAccounts(state: GameState): GameState {
  if (leftOut('socialAccounts') || !state.techs.includes('socialMedia') || state.money < SOCIAL_MONEY) return state;
  return state.channels
    .filter((c) => !c.social)
    .reduce((s, channel) => {
      const free = freeMarketer(s, employeesWithDesk(s)) ? s : ensureDesks(hireBest(s, 'marketing', 1));
      return attempt(free, (x) => openSocialAccount(x, channel.id));
    }, state);
}

/**
 * The tone of the shows that can be sued (#458): bold while a lawyer is at a desk and no case is pending against the show, normal
 * while one is, and normal everywhere without a lawyer. It only changes a show whose tone is not what it should be.
 */
function setTones(state: GameState): GameState {
  if (leftOut('tone')) return state;
  const lawyer = state.employees.some((e) => e.role === 'lawyer' && employeesWithDesk(state).has(e.id));
  return state.shows
    .filter((show) => lawsuitSource(show.genre) !== null)
    .reduce((s, show) => {
      const tone = lawyer && !s.lawsuits.some((l) => l.showId === show.id) ? 'bold' : 'normal';
      return show.tone === tone ? s : attempt(s, (x) => setShowTone(x, show.id, tone));
    }, state);
}

/**
 * The ad minutes dial (#458): a step a month towards what sold best yesterday. Each slot's demand is the dial less what went unsold; a
 * slot with nothing unsold would take more. A minute earns what sells at it, times how much listeners like the breaks at that dial, over
 * the slot's listeners. Never above 5, the limit from 1972, so the bot never breaks the law.
 */
function setAdDials(state: GameState): GameState {
  const day = state.lastDay;
  if (leftOut('adMinutes') || !day) return state;
  return state.channels.reduce((s, channel) => {
    const slots = day.channels.find((c) => c.channelId === channel.id && c.isPlayer)?.slots.filter((slot) => slot.listeners > 0) ?? [];
    if (slots.length === 0) return s;
    const score = (dial: number) => slots.reduce((sum, slot) => sum + slot.listeners * Math.min(dial, slot.unsold ? channel.adMinutes - slot.unsold : Infinity) * adAppeal(dial), 0);
    const top = Math.min(ADS.neutral, adLimit(s.day));
    let best = channel.adMinutes;
    for (let dial = ADS.min; dial <= top; dial += ADS.step) if (score(dial) > score(best) + 1e-9) best = dial;
    const next = channel.adMinutes + Math.sign(best - channel.adMinutes) * ADS.step;
    return next === channel.adMinutes ? s : attempt(s, (x) => setAdMinutes(x, channel.id, next));
  }, state);
}

/**
 * Breaks in on a story that is breaking (#458), once on each channel: in the slot that had the fewest listeners yesterday, that is not news
 * and has a show without a sponsor contract. That buys the reputation for the least ad money.
 */
function breakInOnStories(state: GameState): GameState {
  if (leftOut('breakingNews') || !leadStory(state)) return state;
  return state.channels.reduce((s, channel) => {
    const slots = s.lastDay?.channels.find((c) => c.channelId === channel.id)?.slots ?? [];
    const candidates = channel.schedule
      .map((id, slot) => ({ slot, show: s.shows.find((x) => x.id === id) }))
      .filter(({ show }) => show && !isNewsGenre(getGenre(show.genre)) && !s.contracts.some((c) => c.showId === show.id))
      .sort((a, b) => (slots[a.slot]?.listeners ?? 0) - (slots[b.slot]?.listeners ?? 0));
    const pick = candidates.find(({ slot }) => breakInBlocker(s, channel.id, slot) === null);
    return pick ? attempt(s, (x) => breakIn(x, channel.id, pick.slot)) : s;
  }, state);
}

// --- Training, the talent programme, promotions and coaching (#455) ---

/** Staff the company has before a bot builds a workshop (#455). */
const WORKSHOP_STAFF = 20;
/** Cash a bot keeps after a course, a workshop or the talent programme (#455). */
const TRAINING_RESERVE = 150_000;
/** Staff at or above this skill are not sent on a course (#455). */
const COURSE_BELOW = 70;
/** Points of host skill a candidate must have over the weakest host on air to take their place (#455). */
const CANDIDATE_GAP = 15;
/** Points a talent programme graduate must have over the weakest host on air to take their place (#455). */
const GRADUATE_GAP = 5;
/** Days after the programme a graduate who is not needed waits before they are let go (#455): three months. */
const GRADUATE_WAIT = 90;
/** Points a head of production from inside may be behind the best candidate (#455). */
const PROMOTE_WITHIN = 5;
/** Cash a bot wants in hand to hire a psychologist (#455). */
const COACHING_MONEY = 100_000;

const onSchedule = (state: GameState, showId: Id) => state.channels.some((c) => c.schedule.includes(showId));
/** A host who presents no show, is not away on the talent programme or a course, and has not given notice. */
const freeHosts = (state: GameState) =>
  state.employees.filter((e) => e.role === 'host' && !e.leaving && e.talentUntil == null && e.trainingUntil == null && !state.shows.some((x) => x.hostId === e.id));

/** Builds a workshop and hires its talent manager at 20 staff and 150k; the TV bots wait for their TV channel, so the workshop never takes the place of the kids' studio (#455). */
function runWorkshop(state: GameState, waitingForTv: boolean): GameState {
  if (leftOut('training') || waitingForTv || state.employees.length < WORKSHOP_STAFF || state.money < TRAINING_RESERVE) return state;
  try {
    let s = state;
    if (!s.rooms.some((r) => r.type === 'workshop')) {
      if (!placeFor(s, 'workshop')) return state;
      s = setUpStudio(s, 'workshop');
    }
    if (!s.employees.some((e) => e.role === 'talentManager')) s = seat(hireBest(s, 'talentManager', 1));
    return s;
  } catch {
    return state;
  }
}

/** Sends whoever works on a scheduled show and has a skill under 70 on a course, the weakest first, while 150k is left after each one (#455). */
function trainStaff(state: GameState): GameState {
  if (leftOut('training')) return state;
  const shows = state.shows.filter((x) => onSchedule(state, x.id));
  const working = new Set<Id>(shows.flatMap((x) => [...(x.hostId ? [x.hostId] : []), ...x.staffIds, ...x.writerIds]));
  return state.employees
    .filter((e) => working.has(e.id) && e.skill < COURSE_BELOW)
    .sort((a, b) => a.skill - b.skill)
    .reduce((s, e) => {
      const now = s.employees.find((x) => x.id === e.id)!;
      return trainingBlocker(s, now) === null && s.money - trainingCost(s, now) >= TRAINING_RESERVE ? attempt(s, (x) => sendOnTraining(x, e.id)) : s;
    }, state);
}

/**
 * Puts a weak host through the talent programme: with a workshop, and nobody in it or waiting free, it hires the cheapest host of skill 40
 * or less with a specialty in a genre of the bot's shows and sends them. Every host a bot has presents a show, so none would qualify otherwise.
 * The try is played on a copy and kept only when the programme takes them, so a failed one costs nothing (#455).
 */
function useTalentProgramme(state: GameState): GameState {
  if (leftOut('training') || workshops(state).length === 0 || state.employees.some((e) => e.talentUntil != null) || freeHosts(state).length > 0) return state;
  const genres = new Set(state.shows.map((x) => x.genre));
  const host = state.candidates
    .filter((c) => c.role === 'host' && c.skill <= TALENT.maxSkill && c.specialties.some((g) => genres.has(g)))
    .sort((a, b) => a.salary - b.salary)[0];
  if (!host) return state;
  const hired = attempt(state, (x) => hire(x, host.id));
  const newcomer = hired.employees.find((e) => e.role === 'host' && !state.employees.some((o) => o.id === e.id));
  if (hired === state || !newcomer || hired.money - talentCost(newcomer) < TRAINING_RESERVE) return state;
  const hostId = newcomer.id;
  const sent = attempt(hired, (x) => sendToTalentProgramme(x, hostId));
  return sent === hired ? state : sent;
}

/**
 * Lets the weakest host on air go for a better one, once a month: a free host (a talent programme graduate) first, who must have 5 points
 * more, otherwise a candidate with 15 more. The show gets the new host, then the old one is let go with severance. A free host nobody needs
 * three months after the programme is let go too, so nobody is paid to sit idle (#455).
 */
function replaceWeakHost(state: GameState): GameState {
  let s = state;
  const onAir = s.shows.filter((x) => x.hostId && hasHost(getGenre(x.genre)) && onSchedule(s, x.id));
  const weakest = onAir
    .map((show) => ({ show, host: s.employees.find((e) => e.id === show.hostId) }))
    .filter((x): x is { show: GameState['shows'][number]; host: Employee } => !!x.host && !x.host.leaving && x.host.trainingUntil == null)
    .sort((a, b) => hostSkill(a.host, a.show.genre) - hostSkill(b.host, b.show.genre))[0];
  if (weakest) {
    const { show, host } = weakest;
    const have = hostSkill(host, show.genre) * 100;
    const free = freeHosts(s).sort((a, b) => hostSkill(b, show.genre) - hostSkill(a, show.genre))[0];
    const candidate = s.candidates.filter((c) => c.role === 'host').sort((a, b) => hostSkill(b, show.genre) - hostSkill(a, show.genre))[0];
    let nextId: Id | null = null;
    let hired = s;
    if (free && hostSkill(free, show.genre) * 100 >= have + GRADUATE_GAP) nextId = free.id;
    else if (candidate && hostSkill(candidate, show.genre) * 100 >= have + CANDIDATE_GAP && s.money > TRAINING_RESERVE) {
      hired = attempt(s, (x) => hire(x, candidate.id));
      nextId = hired === s ? null : (hired.employees.find((e) => e.role === 'host' && !s.employees.some((o) => o.id === e.id))?.id ?? null);
    }
    if (nextId) {
      const swapped = attempt(seat(hired), (x) => updateShow(x, show.id, { name: show.name, genre: show.genre, hostId: nextId, staffIds: show.staffIds, writerIds: show.writerIds, editorIds: show.editorIds, jury: show.jury, studioId: show.studioId }));
      if (swapped.shows.find((x) => x.id === show.id)?.hostId === nextId) {
        // The old host may present another show: then they stay.
        s = swapped.shows.some((x) => x.hostId === host.id) ? swapped : attempt(swapped, (x) => fire(x, host.id));
      }
    }
  }
  const idle = freeHosts(s).find((e) => s.day > e.hiredOn + TALENT.days + GRADUATE_WAIT);
  return idle ? attempt(s, (x) => fire(x, idle.id)) : s;
}

/**
 * The head of production: a production person or writer is promoted from inside when they are within 5 points of the best candidate,
 * and the show they led is covered the next day. Otherwise the best candidate is hired, as before (#455).
 */
function promoteOrHire(state: GameState): GameState {
  const manager = state.candidates.filter((c) => c.role === 'manager' && c.department === 'production').sort((a, b) => b.skill - a.skill)[0];
  if (!manager) return state;
  const inside = leftOut('promotions')
    ? undefined
    : state.employees
        .filter((e) => (e.role === 'production' || e.role === 'writer') && promotionBlocker(state, e) === null)
        .sort((a, b) => b.skill - a.skill)[0];
  if (inside && inside.skill >= manager.skill - PROMOTE_WITHIN) {
    const promoted = attempt(state, (x) => promote(x, inside.id));
    if (promoted !== state) return seat(promoted);
  }
  return ensureDesks(attempt(state, (x) => hire(x, manager.id)));
}

/**
 * A host who is unsafe to work with (0.22.0, #259) is coached by a psychologist: one at a desk is used, or one is hired and given a desk
 * when 100k is in hand, all on a copy kept only when the coaching starts. Without one the host is let go at once. The psychologist is
 * let go, with severance, once nobody needs them: a host turns unsafe about once a decade (#455).
 */
function coachUnsafeHost(state: GameState): GameState {
  if (leftOut('coaching')) return letUnsafeHostGo(state);
  const unsafe = unsafeHost(state);
  if (!unsafe) {
    const psychologist = state.employees.find((e) => e.role === 'psychologist');
    return psychologist ? attempt(state, (x) => fire(x, psychologist.id)) : state;
  }
  if (isCoached(unsafe)) return state;
  const coach = (s: GameState) => attempt(s, (x) => coachHost(x, unsafe.id));
  // A psychologist the bot has: at a desk already, or given one now.
  if (state.employees.some((e) => e.role === 'psychologist')) {
    const seated = seat(state);
    const coached = coach(seated);
    return coached !== seated ? coached : letUnsafeHostGo(state);
  }
  const pick = state.candidates.find((c) => c.role === 'psychologist');
  if (!state.employees.some((e) => e.role === 'psychologist') && pick && state.money >= COACHING_MONEY) {
    const hired = attempt(state, (x) => hire(x, pick.id));
    if (hired !== state) {
      const started = coach(seat(hired));
      if (started !== hired) return started;
    }
  }
  return letUnsafeHostGo(state);
}

// --- Poaching, brainstorms, flex workers and back-up hosts (#457) ---

/** Cash a bot keeps after the signing fee of a rival's host (#457): the margin `bidOnAuctions` keeps. */
const POACH_RESERVE = 300_000;
/** A bot has one flex worker for every this many staff other than hosts (#457). */
const FLEX_STAFF = 30;
/** Cash a bot wants in hand to take on a flex worker (#457). */
const FLEX_MONEY = 150_000;

/**
 * Signs the host of a rival's show for the weakest host on air in that genre (#457), once a month when the cooldown is over: the most famous
 * rival host whose genre a show of the bot's is on the air in, 15 points better than that show's host, with 300k left after the fee. The show
 * gets the new host, then the old one is let go with severance unless they present another show.
 */
function poachRivalHost(state: GameState): GameState {
  if (leftOut('poaching') || poachCooldown(state) > 0) return state;
  const onAir = state.shows.filter((x) => x.hostId && hasHost(getGenre(x.genre)) && onSchedule(state, x.id));
  const weakOf = (genre: GenreId) =>
    onAir
      .filter((x) => x.genre === genre)
      .map((show) => ({ show, host: state.employees.find((e) => e.id === show.hostId) }))
      .filter((x): x is { show: GameState['shows'][number]; host: Employee } => !!x.host && !x.host.leaving && x.host.trainingUntil == null)
      .sort((a, b) => hostSkill(a.host, genre) - hostSkill(b.host, genre))[0];
  for (const target of poachTargets(state)) {
    const weak = weakOf(target.show.genre);
    if (!weak || target.skill < hostSkill(weak.host, weak.show.genre) * 100 + CANDIDATE_GAP || state.money - target.fee < POACH_RESERVE) continue;
    const signed = attempt(state, (x) => poachHost(x, target.channel.id, target.slot));
    const newcomer = signed.employees.find((e) => !state.employees.some((o) => o.id === e.id));
    if (signed === state || !newcomer) return state;
    const { show, host } = weak;
    const swapped = attempt(seat(signed), (x) => updateShow(x, show.id, { name: show.name, genre: show.genre, hostId: newcomer.id, staffIds: show.staffIds, writerIds: show.writerIds, editorIds: show.editorIds, jury: show.jury, studioId: show.studioId }));
    if (swapped.shows.find((x) => x.id === show.id)?.hostId !== newcomer.id) return signed;
    return swapped.shows.some((x) => x.hostId === host.id) ? swapped : attempt(swapped, (x) => fire(x, host.id));
  }
  return state;
}

/**
 * A consultant's brainstorm for a channel (#457), on the 15th, away from the monthly meetings that take the meeting room on the 1st: when it
 * costs no more than the revamps of the shows `revampStaleShows` would revamp there, and 40k is left after it.
 */
function holdBrainstorms(state: GameState): GameState {
  if (leftOut('brainstorms') || toCalendarDate(state.day).dayOfMonth !== 15) return state;
  return state.channels.reduce((s, channel) => {
    if (brainstormBlocker(s, channel.id) !== null) return s;
    const stale = brainstormShows(s, channel.id).filter((x) => x.freshness < 0.8 && !hasFormat(x.genre)).length;
    const cost = brainstormCost(s, channel.id);
    return cost <= REVAMP_COST * stale && s.money - cost > 40_000 ? attempt(s, (x) => callBrainstorm(x, channel.id)) : s;
  }, state);
}

/**
 * Flex workers in place of agency temps (#457): one is hired when someone other than a host is away with an agency temp, none is free, there
 * are fewer than one for every 30 staff other than hosts and 150k is in hand. A free one goes, with severance, when there are more than that.
 */
function hireFlexWorkers(state: GameState): GameState {
  if (leftOut('flexWorkers')) return state;
  const cap = Math.floor(state.employees.filter((e) => e.role !== 'host').length / FLEX_STAFF);
  const free = freeFlexWorkers(state);
  if (state.flexWorkers.length > cap) return free[0] ? attempt(state, (x) => letFlexWorkerGo(x, free[0]!.id)) : state;
  const agencyTemp = state.employees.some((e) => e.role !== 'host' && isAway(state, e) && e.away!.temp && e.away!.temp.flexId === undefined);
  return agencyTemp && free.length === 0 && state.flexWorkers.length < cap && state.money >= FLEX_MONEY ? attempt(state, hireFlexWorker) : state;
}

/** Names a back-up for every host on the air who has none (#457): another host who is never on in the same slot, the best fit for the host's genre first, and one who backs nobody up yet before one who does. */
function nameBackups(state: GameState): GameState {
  if (leftOut('backupHosts')) return state;
  return state.employees
    .filter((h) => h.role === 'host' && !h.backupId && state.shows.some((x) => x.hostId === h.id && onSchedule(state, x.id)))
    .reduce((s, host) => {
      const genre = s.shows.find((x) => x.hostId === host.id && onSchedule(s, x.id))!.genre;
      const backs = (e: Employee) => s.employees.filter((o) => o.backupId === e.id).length;
      const pick = s.employees
        .filter((e) => e.role === 'host' && e.id !== host.id && !e.leaving && s.shows.some((x) => x.hostId === e.id && onSchedule(s, x.id)) && !sameSlot(s, host, e))
        .sort((a, b) => backs(a) - backs(b) || hostSkill(b, genre) - hostSkill(a, genre))[0];
      return pick ? attempt(s, (x) => setBackupHost(x, host.id, pick.id)) : s;
    }, state);
}

/** The staff moves of the growers (#457): poaching, flex workers and back-ups on the 1st of the month, brainstorms on the 15th. */
function staffMoves(state: GameState): GameState {
  const day = toCalendarDate(state.day).dayOfMonth;
  if (day === 15) return holdBrainstorms(state);
  return day === 1 ? nameBackups(hireFlexWorkers(poachRivalHost(state))) : state;
}

function growRadio(state: GameState, support = true, second: StationPlan = SECOND_STATION, saveFor: readonly TechId[] = []): GameState {
  let s = defendShows(keepUp(state, 2, 0, 100_000, saveFor));
  if (support) s = runScheduling(bookThemeWeeks(stageEvents(lookAfterStaff(runCanteen(staffSupport(s), 100_000), 150_000))), 150_000);
  // The TV bots wait for their TV channel before they build a workshop (saveFor is empty once it is on the air, or left out).
  if (support) s = trainStaff(useTalentProgramme(replaceWeakHost(runWorkshop(s, saveFor.length > 0))));
  if (support) s = setTones(openSocialAccounts(s));

  const month = Math.round(s.day / 30.44);
  s = revampStaleShows(s, 40_000);
  const has = (role: Role, department?: string) =>
    s.employees.some((e) => e.role === role && (!department || e.department === department));

  // Licenses pay back fastest, so expansion comes first.
  for (const channel of s.channels.filter((c) => c.medium === 'radio')) s = expandChannel(s, channel.id);

  if (month >= 1 && !s.employees.some(onDeals)) s = ensureDesks(hireBest(s, 'sales', 2));
  s = putOnAirtime(s);
  if (support) s = setAdDials(s);
  s = makeDeals(s);
  if (month >= 6 && s.money > 150_000 && !has('manager', 'production')) {
    // The growers promote a head of production from inside when someone is good enough (#455); the others hire one.
    if (support) s = promoteOrHire(s);
    else {
      const manager = s.candidates.find((c) => c.role === 'manager' && c.department === 'production');
      if (manager) s = ensureDesks(attempt(s, (x) => hire(x, manager.id)));
    }
  }
  if (!leftOut('marketing') && month >= 6 && s.money > 150_000 && !has('marketing')) s = ensureDesks(hireBest(s, 'marketing', 1));
  if (!leftOut('marketing') && has('marketing') && s.campaigns.length === 0 && s.money > 200_000) {
    s = attempt(s, (x) => startCampaign(x, { targetId: x.channels[0]!.id, audience: 'all', weeklyBudget: 2_500, weeks: 8 }));
  }

  const first = s.channels[0]!;
  const firstDone = ACTIVE_REGIONS.every(
    (r) => s.licenses.some((l) => l.channelId === first.id && l.regionId === r) || freeLicenses(s, 'radio', r) === 0,
  );
  // The second station's license is dearer with every license held (#430), so its price comes on top of the cash the bot wants.
  if (!leftOut('secondStation') && firstDone && !s.channels.some((c) => c.name === second.name) && s.money > 200_000 + playerLicensePrice(s, 'radio', second.region)) {
    return openStation(s, second);
  }
  return support && saveFor.length === 0 ? moreStations(s, second) : s;
}

/** Opens a radio station: its studios (bought back from a tenant first, #453), its channel and its records. It waits for a master control room and a place for every studio. */
function openStation(state: GameState, station: StationPlan): GameState {
  let s = setUpMasterControl(state);
  // A studio of every kind its plan needs, once there is a master control room for it and a place for each.
  const kinds = [...new Set(station.plan.map((genre) => getGenre(genre).studio))];
  if (!masterControlRoom(s) || !kinds.every((type) => placeFor(s, type) || hasLetStudio(s, type))) return s;
  const studios: Partial<Record<RoomType, string>> = {};
  for (const type of kinds) {
    // A studio the bot let out is bought back before it builds another of the kind (#453).
    const built = buyOutToUse(s, type) ?? setUpStudio(s, type);
    studios[type] = built.lastId!;
    s = built;
  }
  return stockRecords(setUpStation(s, station, studios, true), station.plan);
}

/** Cash a bot wants in hand besides the licence before it opens a third or fourth station (#458). */
const MORE_STATIONS_MONEY = 1_000_000;

/**
 * A third and a fourth radio station, in the Capital (#458): when the newest station covers every region it can, a licence in the Capital is
 * free, there is room for another channel, and 1M is in hand besides the licence. Each is dearer than the last (#430). The third is Talk (Rock
 * for the network bot, whose second is Talk), the fourth Gold.
 */
function moreStations(state: GameState, second: StationPlan): GameState {
  if (leftOut('moreStations') || state.channels.length >= MAX_PLAYER_CHANNELS || !state.channels.some((c) => c.name === second.name)) return state;
  const next = [second === TALK_STATION ? SECOND_STATION : TALK_STATION, GOLD_STATION].find((plan) => !state.channels.some((c) => c.name === plan.name));
  const newest = [...state.channels].reverse().find((c) => c.medium === 'radio');
  if (!next || !newest || freeLicenses(state, 'radio', next.region) === 0) return state;
  const covered = ACTIVE_REGIONS.every((r) => state.licenses.some((l) => l.channelId === newest.id && l.regionId === r) || freeLicenses(state, 'radio', r) === 0);
  return covered && state.money >= MORE_STATIONS_MONEY + playerLicensePrice(state, 'radio', next.region) ? openStation(state, next) : state;
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
  // A second TV channel airs titles as much again (#458).
  const tvChannels = s.channels.filter((c) => c.medium === 'tv').length;
  const wanted: Partial<Record<string, number>> = { movies: 45 * Math.max(1, tvChannels), series: 90 * Math.max(1, tvChannels) };
  if (tvChannels > 1) {
    wanted.cartoons = 30;
    wanted.documentary = 30;
  }
  // Documentaries while they are on the air, and teleshopping once it is researched (#456).
  if (!leftOut('formats')) {
    if (tvSlotGenre(s, LATE_SLOT) === 'documentary') wanted.documentary = 30;
    if (s.techs.includes('teleshoppingFormat')) wanted.teleshopping = 40;
  }
  const offers = [...s.market.titles].sort((a, b) => b.quality ** 2 / Math.max(1, b.price / b.airings) - a.quality ** 2 / Math.max(1, a.price / a.airings));
  for (const offer of offers) {
    const have = airingsByGenre(s).get(offer.genre) ?? 0;
    // The bot keeps the broadcasting authority's rules: no film for adults (0.19.0).
    // Teleshopping is capped at 0.3 quality and pays a fee per airing instead of costing one, so the floor does not apply to it (#456).
    if (have >= (wanted[offer.genre] ?? 0) || (offer.quality < 0.45 && offer.genre !== 'teleshopping') || offer.adult) continue;
    if (libraryUsed(s) >= libraryCapacity(s) || s.money - offer.price < 100_000) continue;
    s = attempt(s, (x) => buyTitle(x, offer.id));
  }
  return s;
}

/** Bids on TV auctions where its channel doesn't broadcast yet, if it can afford to. */
function bidOnAuctions(state: GameState): GameState {
  const tv = state.channels.find((c) => c.medium === 'tv');
  if (!tv || leftOut('tv')) return state;
  return state.auctions
    .filter((a) => !a.holder && a.medium === 'tv' && !a.bid && !state.licenses.some((l) => l.channelId === tv.id && l.regionId === a.regionId))
    .reduce((s, a) => {
      const amount = Math.round((a.reserve * 2) / 1000) * 1000;
      return s.money - amount > 300_000 ? attempt(s, (x) => placeBid(x, a.id, tv.id, amount)) : s;
    }, state);
}

/** Buys free TV licenses (left over from auctions nobody won) for its channel. */
function expandTv(state: GameState): GameState {
  if (leftOut('tv')) return state;
  // Bot TV first, then Bot TV 2 (#458).
  for (const tv of state.channels.filter((c) => c.medium === 'tv')) {
    const region = tvRegionWithout(state, tv.id);
    if (!region || state.money - licensePrice('tv', region, state) < 250_000) continue;
    return attempt(state, (s) => buyLicense(s, tv.id, region));
  }
  return state;
}

/** The most populous region with a free TV licence that a channel does not cover yet. */
function tvRegionWithout(state: GameState, channelId: Id) {
  const covered = new Set(state.licenses.filter((l) => l.channelId === channelId).map((l) => l.regionId));
  return ACTIVE_REGIONS.filter((r) => !covered.has(r) && freeLicenses(state, 'tv', r) > 0).sort((a, b) => population(b, state.day) - population(a, state.day))[0];
}

/** Cash a bot wants in hand besides the licence before it opens a second TV channel (#458). */
const SECOND_TV_MONEY = 1_000_000;

const SECOND_TV_STATION: StationPlan = {
  name: 'Bot TV 2',
  // Licensed titles only: no studio, no host, no production staff.
  plan: ['cartoons', 'series', 'movies', 'movies', 'documentary'],
  hosts: 0,
  production: 0,
  region: 'capital',
};

/**
 * A second TV channel with licensed titles only (#458): once a second TV licence is unlocked, Bot TV covers every region it can, there is
 * room for a channel and 1M is in hand besides the licence. It goes in the most populous region with a free TV licence.
 */
function secondTvChannel(state: GameState): GameState {
  const tv = state.channels.find((c) => c.medium === 'tv');
  if (leftOut('secondTvChannel') || !tv || !isUnlocked(state, 'secondTvLicense') || state.channels.length >= MAX_PLAYER_CHANNELS || state.channels.some((c) => c.name === SECOND_TV_STATION.name)) return state;
  if (tvRegionWithout(state, tv.id)) return state;
  const region = ACTIVE_REGIONS.filter((r) => freeLicenses(state, 'tv', r) > 0).sort((a, b) => population(b, state.day) - population(a, state.day))[0];
  if (!region || state.money < SECOND_TV_MONEY + licensePrice('tv', region, state)) return state;
  try {
    return setUpStation(state, { ...SECOND_TV_STATION, region }, {}, true, 'tv');
  } catch {
    return state;
  }
}

/** Cash the bot keeps after paying a loan off early, the same reserve `expandTv` keeps (#452). */
const LOAN_REPAY_RESERVE = 250_000;

/** Borrows what is still missing for the TV launch, once everything else is ready: floors, formats and a place for the kids' studio (#452). One loan, 24 months, never to cover a loss. */
function borrowForTv(state: GameState): GameState {
  if (leftOut('loans') || state.loan || state.channels.some((c) => c.medium === 'tv') || state.money >= TV_LAUNCH_MONEY) return state;
  if (state.floorsUnlocked < 2 || !state.techs.includes('kidsFormat') || !state.techs.includes('soapOperaFormat') || !placeFor(state, 'tvKidsStudio')) return state;
  const amount = Math.max(LOAN.minAmount, Math.ceil((TV_LAUNCH_MONEY - state.money) / 10_000) * 10_000);
  return amount > maxLoan(state) ? state : attempt(state, (x) => takeLoan(x, amount, 24));
}

/** Pays the loan off on the 1st of the month once cash after paying would still be 250k (#452). */
function repayEarly(state: GameState): GameState {
  if (leftOut('loans') || !state.loan || state.money - state.loan.balance < LOAN_REPAY_RESERVE) return state;
  return attempt(state, repayLoan);
}

/** Cash the bot wants before it sets up a sports show: the studio, a host and four staff (#454). */
const SPORTS_MONEY = 400_000;
/** Cash left over after season rights, the same reserve `expandTv` keeps (#454). */
const RIGHTS_RESERVE = 250_000;
/** The TV slot the sports show takes: the evening, in place of the films (#454). */
const SPORTS_SLOT = 3;

const sportsShow = (state: GameState) => state.shows.find((x) => x.genre === 'tvSports');
const sportsOnAir = (state: GameState) => {
  const show = sportsShow(state);
  return !!show && state.channels.some((c) => c.medium === 'tv' && c.schedule.includes(show.id));
};

/** Builds a TV news studio, hires a host and four staff, and airs a TV sports show in the evening in place of the films (#454). Once, when sports rights are unlocked. */
function setUpSports(state: GameState): GameState {
  const tv = state.channels.find((c) => c.medium === 'tv');
  if (!tv || sportsShow(state) || !isUnlocked(state, 'sportsRights') || state.money < SPORTS_MONEY || !placeFor(state, 'tvNewsStudio')) return state;
  const genre = getGenre('tvSports');
  const built = setUpStudio(state, 'tvNewsStudio');
  const before = new Set(built.employees.map((e) => e.id));
  let s = hireBest(built, 'host', 1, (p) => hostSkill(p, 'tvSports'));
  s = hireBest(s, 'production', genre.requiredStaff);
  s = ensureDesks(s);
  const hired = (role: Role) => s.employees.filter((e) => e.role === role && !before.has(e.id) && hasCapacity(s, e.id));
  const host = hired('host')[0];
  const staff = hired('production').slice(0, genre.requiredStaff);
  if (!host || staff.length < genre.requiredStaff) return state;
  const made = attempt(s, (x) => createShow(x, { name: 'TV sports 1', genre: 'tvSports', hostId: host.id, staffIds: staff.map((e) => e.id), studioId: built.lastId! }));
  const show = sportsShow(made);
  if (!show) return state;
  const aired = attempt(made, (x) => scheduleShow(x, tv.id, SPORTS_SLOT, show.id));
  return aired === made ? state : aired;
}

/** Buys season rights while the sports show is on the air: when it holds none, or all end within 31 days, the offer with the most prestige that leaves 250k (#454). */
function keepSportsRights(state: GameState): GameState {
  if (leftOut('sportsRights') || !sportsOnAir(state) || !isUnlocked(state, 'sportsRights')) return state;
  if (state.sportsRights.some((r) => r.endDay > state.day + 31)) return state;
  const offer = state.market.rights.filter((r) => state.money - rightsPrice(state, r.price) >= RIGHTS_RESERVE).sort((a, b) => b.prestige - a.prestige)[0];
  return offer ? attempt(state, (x) => buyRights(x, offer.id)) : state;
}

/** Bids 2.5 times the reserve in every open event rights auction it has not bid in, while the sports show is on the air (#454). Beats every rival that does not watch the player. */
function bidForEvents(state: GameState): GameState {
  if (leftOut('sportsRights') || !sportsOnAir(state) || !isUnlocked(state, 'sportsRights')) return state;
  return state.rightsAuctions
    .filter((a) => a.bid == null)
    .reduce((s, a) => {
      const amount = Math.round((a.reserve * (1 + EVENTS.aggression.max)) / 1000) * 1000;
      return s.money - amount > 300_000 ? attempt(s, (x) => placeRightsBid(x, a.id, amount)) : s;
    }, state);
}

/** Cash the bot wants before it builds a game or reality studio and hires for it (#456). Below `SPORTS_MONEY`: a game studio costs less than a news studio and rights. */
const FORMATS_MONEY = 300_000;
/** The TV slots the formats take: lunch for the game show, the afternoon for reality TV, late at night for documentaries and teleshopping (#456). */
const GAME_SLOT = 1;
const REALITY_SLOT = 2;
const LATE_SLOT = 4;

/** The genre of the show in a slot of the bot's TV channel, if any (#456). */
function tvSlotGenre(state: GameState, slot: number): GenreId | null {
  const id = state.channels.find((c) => c.medium === 'tv')?.schedule[slot];
  return state.shows.find((x) => x.id === id)?.genre ?? null;
}

/** Puts a show in a slot of the TV channel and takes the show that was there off the books if nothing else airs it (#456). */
function replaceInSlot(state: GameState, channelId: Id, slot: number, showId: Id): GameState | null {
  const old = state.channels.find((c) => c.id === channelId)?.schedule[slot] ?? null;
  const aired = attempt(state, (x) => scheduleShow(x, channelId, slot, showId));
  if (aired === state) return null;
  return old && old !== showId && !aired.channels.some((c) => c.schedule.includes(old)) ? attempt(aired, (x) => deleteShow(x, old)) : aired;
}

/** Hires what is missing of `count` free people in a role, and returns the free ones (#456). */
function crewOf(state: GameState, role: Role, count: number, prefer?: (p: Person) => number): { state: GameState; people: Employee[] } {
  const free = (x: GameState) => x.employees.filter((e) => e.role === role && hasCapacity(x, e.id));
  const missing = count - free(state).length;
  const s = missing > 0 ? ensureDesks(hireBest(state, role, missing, prefer)) : state;
  return { state: s, people: free(s).sort((a, b) => b.skill - a.skill).slice(0, count) };
}

/** Airs documentaries late at night from the start, and teleshopping in their place once it is researched and titles are in the library (#456). Licensed, so no studio and no host. */
function airLateNight(state: GameState): GameState {
  const tv = state.channels.find((c) => c.medium === 'tv');
  if (!tv) return state;
  const now = tvSlotGenre(state, LATE_SLOT);
  const shopping = state.techs.includes('teleshoppingFormat') && (airingsByGenre(state).get('teleshopping') ?? 0) > 0;
  const genre = shopping ? 'teleshopping' : 'documentary';
  if (now === genre || now === 'teleshopping') return state;
  const made = attempt(state, (x) => createShow(x, { name: `${getGenre(genre).name} 5`, genre, hostId: null, staffIds: [], studioId: null }));
  const show = made.shows.find((x) => x.genre === genre && !made.channels.some((c) => c.schedule.includes(x.id)));
  return (show && replaceInSlot(made, tv.id, LATE_SLOT, show.id)) || state;
}

/** Builds a game show studio, hires a host and three staff, and airs a game show at lunch in place of the series. Once, when the format is researched (#456). */
function setUpGameShow(state: GameState): GameState {
  const tv = state.channels.find((c) => c.medium === 'tv');
  if (!tv || state.shows.some((x) => x.genre === 'gameShow') || !state.techs.includes('gameShowFormat') || state.money < FORMATS_MONEY || !placeFor(state, 'tvGameStudio')) return state;
  const genre = getGenre('gameShow');
  const built = setUpStudio(state, 'tvGameStudio');
  // A new host: the free ones may be in the talent programme (#455).
  const before = new Set(built.employees.map((e) => e.id));
  const hired = hireBest(built, 'host', 1, (p) => hostSkill(p, 'gameShow'));
  const host = hired.employees.find((e) => e.role === 'host' && !before.has(e.id) && hasCapacity(hired, e.id));
  const staff = crewOf(hired, 'production', genre.requiredStaff);
  if (!host || staff.people.length < genre.requiredStaff) return state;
  const made = attempt(staff.state, (x) => createShow(x, { name: 'Game show 2', genre: 'gameShow', hostId: host.id, staffIds: staff.people.map((e) => e.id), studioId: built.lastId! }));
  const show = made.shows.find((x) => x.genre === 'gameShow');
  return (show && replaceInSlot(made, tv.id, GAME_SLOT, show.id)) || state;
}

/** Builds a reality studio and airs reality TV in the afternoon, from 2000, in place of the soap (or what stands in for it). The soap's writers and staff move over (#456). */
function setUpReality(state: GameState): GameState {
  const tv = state.channels.find((c) => c.medium === 'tv');
  if (!tv || state.shows.some((x) => x.genre === 'reality') || !state.techs.includes('realityFormat') || state.money < FORMATS_MONEY || !placeFor(state, 'tvRealityStudio')) return state;
  const genre = getGenre('reality');
  const old = state.shows.find((x) => x.id === tv.schedule[REALITY_SLOT]);
  // The old show goes first, so its people are free for the new one; if the new one fails, the state before is kept.
  let s = old ? attempt(state, (x) => deleteShow(x, old.id)) : state;
  if (old && s === state) return state;
  const built = setUpStudio(s, 'tvRealityStudio');
  const staff = crewOf(built, 'production', genre.requiredStaff);
  const writers = crewOf(staff.state, 'writer', genre.writers!.needed);
  if (staff.people.length < genre.requiredStaff || writers.people.length < genre.writers!.needed) return state;
  s = attempt(writers.state, (x) =>
    createShow(x, { name: 'Reality TV 3', genre: 'reality', hostId: null, staffIds: staff.people.map((e) => e.id), writerIds: writers.people.map((e) => e.id), studioId: built.lastId! }),
  );
  const show = s.shows.find((x) => x.genre === 'reality');
  if (!show) return state;
  const aired = attempt(s, (x) => scheduleShow(x, tv.id, REALITY_SLOT, show.id));
  return aired === s ? state : aired;
}

/** The formats of the TV channel besides kids and sports, once each (#456): documentaries and teleshopping late at night, a game show at lunch, reality TV in the afternoon. */
function airFormats(state: GameState): GameState {
  if (leftOut('formats') || !state.channels.some((c) => c.medium === 'tv')) return state;
  return setUpReality(setUpGameShow(airLateNight(state)));
}

/** Grows like the growth bot, but with a bigger R&D team that researches every tech as early as it can. */
const researchBotMoves = (state: GameState): GameState => {
  if (state.day === 0) return staffSupport(setUpFirstStation(state, true));
  const s = breakInOnStories(staffMoves(acceptGoodOffers(keepHosts(state))));
  return isFirstOfMonth(s.day) ? growRadio(keepUp(s, 5, 5)) : s;
};

/** Grows radio like the growth bot, then launches a TV channel in the Capital once it has the money. */
const tvBotMoves = (state: GameState): GameState => {
  if (state.day === 0) return staffSupport(setUpFirstStation(state, true));
  let s = breakInOnStories(staffMoves(bidForEvents(bidOnAuctions(acceptGoodOffers(keepHosts(state))))));
  if (!isFirstOfMonth(s.day)) return s;
  s = growRadio(s, true, SECOND_STATION, leftOut('tv') || s.channels.some((c) => c.medium === 'tv') ? [] : ['kidsFormat', 'soapOperaFormat']);
  // Without the TV channel the bot plays radio only (#442).
  if (leftOut('tv')) return s;

  s = repayEarly(s);
  s = borrowForTv(s);
  const hasTv = s.channels.some((c) => c.medium === 'tv');
  if (!hasTv && s.money >= TV_LAUNCH_MONEY && s.floorsUnlocked >= 2) s = setUpMasterControl(s);
  // The kids' show is a format of the 1970s that has to be researched first (#207): the bot waits a month if it cannot yet.
  if (!hasTv && s.money >= TV_LAUNCH_MONEY && s.floorsUnlocked >= 2 && s.techs.includes('kidsFormat') && s.techs.includes('soapOperaFormat') && masterControlRoom(s) && placeFor(s, 'tvKidsStudio')) {
    const built = setUpStudio(s, 'tvKidsStudio');
    const studios: Partial<Record<RoomType, string>> = { tvKidsStudio: built.lastId! };
    s = built;
    // A soap opera is made around a decor that has to be researched too; without it the bot makes a sitcom, another format to research,
    // and without that a film in its place. Each has a studio of its own.
    for (const tech of ['soapOperaFormat', 'sitcomFormat'] as const) if (!s.techs.includes('soapOperaFormat') && !s.techs.includes(tech)) s = attempt(s, (x) => research(x, tech));
    const second = s.techs.includes('soapOperaFormat') ? 'tvSoapStudio' : s.techs.includes('sitcomFormat') ? 'tvSitcomStudio' : null;
    if (second && placeFor(s, second)) {
      const studio = setUpStudio(s, second);
      studios[second] = studio.lastId!;
      s = studio;
    }
    const soap = studios.tvSoapStudio !== undefined;
    const sitcom = studios.tvSitcomStudio !== undefined;
    // The titles come by post (0.17.0): a post room with its sorting case before the library. A shelf of its own beside the records.
    s = makeRoomInLibrary(s, TITLES_PER_SHELF);
    s = stockLibrary(s);
    s = setUpStation(s, { ...TV_STATION, plan: TV_STATION.plan.map((genre) => (genre !== 'soap' || soap ? genre : sitcom ? 'sitcom' : 'movies')) }, studios, true, 'tv');
  }
  if (s.channels.some((c) => c.medium === 'tv')) s = expandTv(stockLibrary(s));
  s = keepSportsRights(setUpSports(s));
  s = airFormats(s);
  s = secondTvChannel(s);
  return s;
};

// --- Streaming bot (0.18.0) ---

/** Server racks the streaming bot opens its service with; it adds one whenever the service is full. */
const STREAM_RACKS = 4;
/** Titles the streaming bot keeps on its service, besides its shows. */
const STREAM_TITLES = 40;

/** Buys the best titles on the market (no teleshopping) until the service has enough: they cost nothing until they air, and an airing's price a month on the service. */
function stockCatalogue(state: GameState): GameState {
  let s = state;
  const offers = s.market.titles.filter((o) => o.genre !== 'teleshopping' && o.quality >= 0.5).sort((a, b) => b.quality - a.quality);
  for (const offer of offers) {
    if (onDemandTitles(s).length >= STREAM_TITLES || libraryUsed(s) >= libraryCapacity(s)) break;
    s = attempt(s, (x) => buyTitle(x, offer.id));
  }
  return s;
}

/** Puts server racks in a library until it has `wanted`, building another library when the first is full, while the money lasts. */
function addRacks(state: GameState, wanted: number): GameState {
  let s = state;
  while (serverRacks(s).length < wanted && s.money > 150_000) {
    const library = s.rooms.find((r) => r.type === 'library' && findFreeSpot(s, r, 'serverRack'));
    if (!library) {
      if (!placeFor(s, 'library')) break;
      s = setUpStudio(s, 'library');
      continue;
    }
    const placed = autoPlaceFurniture(s, library.roomId, 'serverRack');
    if (!placed.ok) break;
    s = placed.state;
  }
  return s;
}

/**
 * Plays like the TV bot and, once Streaming is researched, opens a service:
 * server racks in its library, titles to offer besides its shows, and a rack
 * more whenever the service is full. Its price is the fair price of the year.
 */
const streamBotMoves = (state: GameState): GameState => {
  let s = tvBotMoves(state);
  if (leftOut('streaming') || !isFirstOfMonth(s.day) || !s.techs.includes('streaming') || !s.rooms.some((r) => r.type === 'library')) return s;
  s = addRacks(s, s.streaming?.capped ? serverRacks(s).length + 1 : STREAM_RACKS);
  s = stockCatalogue(s);
  const price = roundPrice(fairPrice(toCalendarDate(s.day).year));
  if (!s.streaming) return attempt(s, (x) => openStreaming(x, price));
  return s.streaming.price === price ? s : attempt(s, (x) => setStreamingPrice(x, price));
};

/**
 * The gift shop (0.21.0), for the bots that look after their staff: from level 9, a shop on the ground floor with a till and a piece for each
 * line, a salesperson on the till; a storage room beside it and a salesperson on orders once orders can open; and boxes for every show of
 * their own that the shelves have room for. Daily, as the stock sells in days. The neglectful and the no-support bot never do this.
 */
function runGiftShop(state: GameState): GameState {
  let s = state;
  if (leftOut('giftShop') || !isUnlocked(s, 'merchandise') || s.money < 150_000) return s;
  const find = (type: RoomType) => s.rooms.find((r) => r.type === type);
  const newestSeller = () => [...s.employees].reverse().find((e) => e.role === 'sales' && !onTill(e) && !onOrders(e));
  if (!find('giftShop')) {
    if (!isFirstOfMonth(s.day)) return s;
    const plan = proposeRoom(s, 1, 'giftShop');
    if (!plan) return s;
    try {
      const built = must(buildRoom(s, { ...plan, type: 'giftShop' }));
      s = must(addMissingEquipment(built, built.lastId!));
    } catch {
      return state;
    }
  }
  const shop = find('giftShop')!;
  for (const type of ['tapeShelf', 'clothingTable', 'shelfBags'] as const) {
    const now = find('giftShop')!;
    if (!now.furniture.some((f) => f.type === type) && findFreeSpot(s, now, type)) s = must(autoPlaceFurniture(s, now.roomId, type));
  }
  if (!s.employees.some(onTill) && s.candidates.some((c) => c.role === 'sales')) {
    s = hireBest(s, 'sales', 1);
    const seller = newestSeller();
    if (seller) s = attempt(s, (x) => setSalesJob(x, seller.id, 'till'));
  }
  // Orders: a storage room next door, when the post room and the phone lines are there.
  if (isFirstOfMonth(s.day) && ordersBlocker(s) === null && !find('storageRoom')) {
    const plan = proposeBeside(s, shop.roomId, 'storageRoom');
    if (plan) {
      try {
        const built = must(buildRoom(s, { ...plan, type: 'storageRoom' }));
        s = must(addMissingEquipment(built, built.lastId!));
      } catch {
        // No money for it today: try again next month.
      }
    }
  }
  if (find('storageRoom') && !s.employees.some(onOrders) && s.candidates.some((c) => c.role === 'sales')) {
    s = hireBest(s, 'sales', 1);
    const seller = newestSeller();
    if (seller) s = attempt(s, (x) => setSalesJob(x, seller.id, 'orders'));
  }
  // Boxes: fill each line's shelves, shared between the shows of their own that have fans.
  // The shelves hold a few boxes: they go to the shows whose fans want the most.
  const score = (show: GameState['shows'][number]) => (show.fans ?? 0) * (MERCH.devotion[show.genre] ?? MERCH.devotionOther) * (0.5 + showHype(show));
  const own = s.shows.filter((show) => sellsMerchandise(show) && (show.fans ?? 0) >= 0.1).sort((a, b) => score(b) - score(a));
  for (const line of MERCH_LINES) {
    const places = Math.max(1, Math.floor(shopHolds(s, line) / MERCH.box));
    for (const show of own.slice(0, places)) {
      const target = shopHolds(s, line) / Math.min(places, own.length);
      const missing = target - (show.stock?.[line]?.units ?? 0);
      const boxes = Math.min(Math.floor(missing / MERCH.box), Math.floor(roomLeft(s, line) / MERCH.box));
      if (boxes >= 1 && s.money > 150_000) s = attempt(s, (x) => buyBoxes(x, show.id, line, boxes));
    }
  }
  return s;
}

/** What a bot hands back to the game: the state it played, without the id of what it built last, which is the bot's own business. */
function played(state: GameState): GameState {
  if (!('lastId' in state)) return state;
  const { lastId: _, ...game } = state as GameState & { lastId?: Id };
  return game;
}

/** A host who is unsafe to work with (0.22.0, #259) is let go at once. The sensible and the capital bot hire no psychologist; the growers do (`coachUnsafeHost`, #455). */
function letUnsafeHostGo(state: GameState): GameState {
  const unsafe = unsafeHost(state);
  return unsafe ? attempt(state, (x) => fire(x, unsafe.id)) : state;
}

// The test players, as the game and the tests know them.
export const sensibleBot: Bot = (state) => played(runGiftShop(sensibleBotMoves(letUnsafeHostGo(state))));
export const capitalBot: Bot = (state) => played(runGiftShop(capitalBotMoves(letUnsafeHostGo(state))));
export const neglectfulBot: Bot = (state) => played(neglectfulBotMoves(state));
export const growthBot: Bot = (state) => played(runGiftShop(growthBotMoves(coachUnsafeHost(state))));
export const networkBot: Bot = (state) => played(runGiftShop(networkBotMoves(coachUnsafeHost(state))));
export const noSupportBot: Bot = (state) => played(noSupportBotMoves(state));
export const researchBot: Bot = (state) => played(runGiftShop(researchBotMoves(coachUnsafeHost(state))));
export const tvBot: Bot = (state) => played(runGiftShop(tvBotMoves(coachUnsafeHost(state))));
export const streamBot: Bot = (state) => played(runGiftShop(streamBotMoves(coachUnsafeHost(state))));
