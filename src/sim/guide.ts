// The tutorial's logic: which of Penny Cash's lines (config/guide.ts) is due.
//
// A step is done when the game says so, not when a button in the tutorial was
// pressed, so the player can do things in their own order and Penny picks up
// wherever the company stands. Hints wait until her steps are finished, except
// the one about being in the red.

import type { Feature } from '../config/unlocks';
import { isUnlocked } from './unlocks';
import { ACTIVE_REGIONS } from '../config/balance';
import { HINTS, OFFER, STEPS, TV_STEPS, WELCOME, type Line } from '../config/guide';
import { SLOTS } from '../config/world';
import { toCalendarDate } from './calendar';
import { dividendDue, dividendReserve, runningResult } from './economy';
import { electionOn, recessionIn, sportsEventOn } from './events';
import { freeLicenses, licensePrice } from './licenses';
import { employeesWithDesk, isFurnished, isManager, isStudioReady, needsDesk, wearsOut } from './office';
import { ownEventBlocker, ownEventCost } from './ownEvents';
import { PLAYER, type GameState, type Role } from './state';

/** What Penny's opening asks for: a host for each of five shows, and producers who make two shows each. */
export const GUIDE_TEAM = { hosts: 5, production: 3 };

const count = (state: GameState, role: Role) => state.employees.filter((e) => e.role === role).length;
/** The first team that needs desks: the managers and the people in production. Whoever is hired later gets a desk in a step of their own. */
const deskWorkers = (state: GameState) => state.employees.filter((e) => needsDesk(e.role) && (e.role === 'production' || isManager(e.role)));
const desked = (state: GameState) => deskWorkers(state).filter((e) => employeesWithDesk(state).has(e.id)).length;
/** Whether someone in a job is hired and has a desk to work at. */
const atDesk = (state: GameState, role: Role) => state.employees.some((e) => e.role === role && employeesWithDesk(state).has(e.id));
/** The most slots any channel has filled. */
const slotsFilled = (state: GameState) => Math.max(0, ...state.channels.map((c) => c.schedule.filter(Boolean).length));
const seen = (state: GameState, id: string) => state.guide.seen.includes(id);

/** When each step counts as done. A step without an entry is only talk: it is done once the player has answered it. */
const DONE: Record<string, (state: GameState) => boolean> = {
  studio: (s) => s.rooms.some((r) => r.type === 'radioStudio'),
  equipment: (s) => s.rooms.some((r) => r.type === 'radioStudio' && isStudioReady(s, r)),
  office: (s) => s.rooms.some((r) => r.type === 'office'),
  management: (s) => s.rooms.some((r) => r.type === 'managementOffice' && isFurnished(r)),
  manager: (s) => count(s, 'channelManager') > 0,
  hosts: (s) => count(s, 'host') >= GUIDE_TEAM.hosts,
  production: (s) => count(s, 'production') >= GUIDE_TEAM.production,
  desks: (s) => deskWorkers(s).length > 0 && desked(s) === deskWorkers(s).length,
  channel: (s) => s.channels.length > 0,
  'in-charge': (s) => s.channels.some((c) => c.managerId !== null),
  license: (s) => s.licenses.length > 0,
  // Five shows first, then the schedule: a show is made before there is a slot to talk about.
  show: (s) => s.shows.length > 0,
  'full-day': (s) => s.shows.length >= SLOTS.length,
  schedule: (s) => slotsFilled(s) === SLOTS.length,
  cleaner: (s) => count(s, 'cleaner') > 0,
  play: (s) => s.day > 0,
  'first-month': (s) => s.monthlyReports.length > 0,
  // A month that paid its own way, as the monthly report counts it: the running result, without what was
  // bought once. It is also what opens Sales, which the next step needs. A January that did so is a step done.
  black: (s) => earning(s) && isUnlocked(s, 'sales'),
  sales: (s) => atDesk(s, 'sales'),
  // The first contract opens Marketing, which the next step needs.
  sponsor: (s) => (s.contracts.length > 0 || s.milestones.some((m) => m.id === 'firstSponsor')) && isUnlocked(s, 'marketing'),
  marketing: (s) => atDesk(s, 'marketing'),
  campaign: (s) => s.campaigns.length > 0 || Object.keys(s.promotion).length > 0,
  // Television, the small way (TV_STEPS).
  'tv-channel': (s) => tvChannel(s) !== undefined,
  'tv-manager': (s) => {
    const managerId = tvChannel(s)?.managerId;
    return managerId != null && employeesWithDesk(s).has(managerId);
  },
  'tv-license': (s) => s.licenses.some((l) => l.channelId === tvChannel(s)?.id),
  'tv-library': (s) => s.rooms.some((r) => r.type === 'library' && isFurnished(r)),
  'tv-titles': (s) => seriesEpisodes(s) >= TV_EPISODES || tvOnAir(s),
  'tv-show': (s) => tvOnAir(s),
};

/** The player's first TV channel, if there is one. */
const tvChannel = (state: GameState) => state.channels.find((c) => c.medium === 'tv');
/** Whether that channel has a program on its schedule. */
const tvOnAir = (state: GameState) => tvChannel(state)?.schedule.some(Boolean) ?? false;
/** Episodes of series in the library that can still be aired. */
const seriesEpisodes = (state: GameState) => state.library.filter((t) => t.genre === 'series').reduce((sum, t) => sum + t.airingsLeft, 0);
/** What Penny has the player buy before a first evening of television: about three weeks of series. */
export const TV_EPISODES = 20;

/** How far along a step with a count is, for the steps that have one. */
const PROGRESS: Record<string, (state: GameState) => { have: number; need: number; of: string }> = {
  hosts: (s) => ({ have: count(s, 'host'), need: GUIDE_TEAM.hosts, of: 'hosts hired' }),
  production: (s) => ({ have: count(s, 'production'), need: GUIDE_TEAM.production, of: 'producers hired' }),
  desks: (s) => ({ have: desked(s), need: deskWorkers(s).length, of: 'desk workers have a desk' }),
  'full-day': (s) => ({ have: s.shows.length, need: SLOTS.length, of: 'shows made' }),
  schedule: (s) => ({ have: slotsFilled(s), need: SLOTS.length, of: 'slots filled' }),
  'tv-titles': (s) => ({ have: seriesEpisodes(s), need: TV_EPISODES, of: 'episodes of series bought' }),
};

export const stepDone = (state: GameState, id: string) => (DONE[id] ? DONE[id](state) : seen(state, id));

/** Whether Penny's first weeks are behind the player: from then on she only drops hints. */
export const guideFinished = (state: GameState) => seen(state, STEPS[STEPS.length - 1]!.id);

/** A month in which the company paid its own way: the point of the first weeks. Furniture, a license and the like are left out, as on the monthly report. */
function earning(state: GameState): boolean {
  return state.monthlyReports.some((r) => runningResult(r) > 0);
}
const year = (state: GameState) => toCalendarDate(state.day).year;
/** Cash the company could spend without touching its reserve: a year of running costs. */
const spare = (state: GameState) => state.money - dividendReserve(state);

/** A region the player's first channel doesn't broadcast in yet, that still has a license for sale, cheapest first. */
function nextRegion(state: GameState) {
  const channel = state.channels[0];
  if (!channel) return undefined;
  const covered = new Set(state.licenses.filter((l) => l.channelId === channel.id).map((l) => l.regionId));
  return ACTIVE_REGIONS.filter((r) => !covered.has(r) && freeLicenses(state, channel.medium, r) > 0)
    .map((r) => licensePrice(channel.medium, r, state.day))
    .sort((a, b) => a - b)[0];
}

/** Cash to have left after a purchase Penny suggests. */
const CUSHION = 30_000;
/** What television costs to start the small way, on top of its cheapest license: a library, a desk, a month of series and something to fall back on. */
const TV_START = 70_000;
/** What a second radio station costs to start, on top of its license: a talk studio, a desk, and a few months of its people. */
const TALK_START = 40_000;

/** Days between two hints, so a company that qualifies for several hears them one at a time. */
export const HINT_PAUSE = 7;
/** Hints about something with a deadline, or that is costing money now: these don't wait their turn. */
const URGENT = ['red', 'bailout', 'maintenance', 'auction', 'renewal', 'poaching', 'rights'];

/** Hints that also break into the first weeks, the most pressing first: the uncle's rescue, then being in the red. */
const INTERRUPTS = ['bailout', 'red'];

/** What has to be open before a hint makes sense: Penny never points at a window with a lock on it. */
export const HINT_NEEDS: Record<string, Feature> = {
  'second-region': 'regions',
  research: 'research',
  auction: 'regions',
  rights: 'content',
  'own-event': 'events',
};

/** When each hint is due. Each is said once. */
const DUE: Record<string, (state: GameState) => boolean> = {
  red: (s) => s.negativeMonths > 0 || s.money < 0,
  bailout: (s) => s.bailedOut,
  stale: (s) => s.shows.some((show) => show.freshness < 0.8),
  'second-region': (s) => {
    const price = nextRegion(s);
    return earning(s) && price !== undefined && s.money >= price + CUSHION;
  },
  'talk-station': (s) => {
    const price = Math.min(...ACTIVE_REGIONS.filter((r) => freeLicenses(s, 'radio', r) > 0).map((r) => licensePrice('radio', r, s.day)));
    return earning(s) && s.channels.length === 1 && s.channels[0]!.medium === 'radio' && s.money >= price + TALK_START;
  },
  technician: (s) => count(s, 'technician') === 0 && s.rooms.some((r) => r.furniture.some((f) => wearsOut(f.type) && f.condition < 70)),
  maintenance: (s) => count(s, 'maintenance') === 0 && s.rooms.some((r) => r.issue),
  canteen: (s) => s.employees.length >= 10 && !s.rooms.some((r) => r.type === 'canteen') && s.money >= CUSHION * 2,
  research: (s) => count(s, 'researcher') === 0 && s.monthlyReports.length >= 4 && s.money >= CUSHION * 2,
  television: (s) => {
    // The cheapest TV license that can be bought today; in some regions there is none for years.
    const price = Math.min(...ACTIVE_REGIONS.filter((r) => freeLicenses(s, 'tv', r) > 0).map((r) => licensePrice('tv', r, s.day)));
    return earning(s) && !s.channels.some((c) => c.medium === 'tv') && s.money >= price + TV_START;
  },
  auction: (s) => s.auctions.some((a) => a.holder === null && s.channels.some((c) => c.medium === a.medium)),
  renewal: (s) => s.auctions.some((a) => a.holder?.ownerId === PLAYER),
  poaching: (s) => s.poachOffers.length > 0,
  event: (s) => sportsEventOn(s.day) !== null || electionOn(s.day) || recessionIn(year(s)) !== undefined,
  rights: (s) => s.rightsAuctions.length > 0 && s.channels.some((c) => c.medium === 'tv'),
  'own-event': (s) => s.channels.some((c) => !ownEventBlocker(s, c, 'concert') && spare(s) >= ownEventCost(s, c, 'concert')),
  dividend: (s) => toCalendarDate(s.day).month === 12 && dividendDue(s) > 0,
  'second-floor': (s) => s.floorsUnlocked > 1,
  places: (s) => s.rooms.filter((r) => r.type === 'office').length > 1,
};

/** What the tutorial has to say right now, if anything. */
export type GuideView =
  | { kind: 'welcome'; line: Line; page: number; pages: number }
  | { kind: 'offer'; line: Line }
  | { kind: 'step'; line: Line; index: number; total: number; progress?: { have: number; need: number; of: string }; /** The name of what she walks through, for the steps that come after the first weeks. */ chapter?: string }
  | { kind: 'hint'; line: Line };

export function guideView(state: GameState): GuideView | null {
  const { stage } = state.guide;
  if (stage === 'off') return null;
  if (stage === 'welcome') {
    const page = WELCOME.findIndex((line) => !seen(state, line.id));
    if (page >= 0) return { kind: 'welcome', line: WELCOME[page]!, page, pages: WELCOME.length };
  }
  if (stage === 'welcome' || stage === 'offer') return { kind: 'offer', line: OFFER };

  // Money trouble comes before everything else: it can't wait for the first weeks to be over.
  const trouble = INTERRUPTS.flatMap((id) => HINTS.filter((line) => line.id === id)).find((line) => !seen(state, line.id) && DUE[line.id]!(state));
  if (trouble) return { kind: 'hint', line: trouble };

  if (!guideFinished(state)) {
    const index = STEPS.findIndex((line) => !stepDone(state, line.id));
    if (index < 0) return null;
    const line = STEPS[index]!;
    return { kind: 'step', line, index, total: STEPS.length, progress: PROGRESS[line.id]?.(state) };
  }
  const quiet = state.day < state.guide.quiet;
  const open = (id: string) => HINT_NEEDS[id] === undefined || isUnlocked(state, HINT_NEEDS[id]);
  const due = (line: Line) => !seen(state, line.id) && open(line.id) && DUE[line.id]?.(state);
  // What has a deadline comes first, also while she is walking the player through television.
  const urgent = HINTS.find((line) => URGENT.includes(line.id) && due(line));
  if (urgent) return { kind: 'hint', line: urgent };
  if (inTvChapter(state)) {
    const index = TV_STEPS.findIndex((line) => !stepDone(state, line.id));
    const line = TV_STEPS[index]!;
    return { kind: 'step', line, index, total: TV_STEPS.length, progress: PROGRESS[line.id]?.(state), chapter: 'television' };
  }
  const hint = quiet ? undefined : HINTS.find(due);
  return hint ? { kind: 'hint', line: hint } : null;
}

/** What marks an offer of Penny's as turned down: the id of the hint that made it, with this after it. */
const LATER = '-later';

/** Whether Penny is walking the player through television: they said yes to her hint, and its steps are not all done. */
export const inTvChapter = (state: GameState) =>
  seen(state, 'television') && !seen(state, `television${LATER}`) && TV_STEPS.some((line) => !stepDone(state, line.id));

// --- What the player answers ---

function change(state: GameState, fn: (guide: GameState['guide']) => void): GameState {
  const guide = structuredClone(state.guide);
  fn(guide);
  return { ...state, guide };
}

const remember = (guide: GameState['guide'], id: string) => {
  if (!guide.seen.includes(id)) guide.seen.push(id);
};

/** Takes away a line that is only talk: a page of the welcome, the last step, or a hint. */
export function acknowledge(state: GameState, id: string): GameState {
  return change(state, (guide) => {
    remember(guide, id);
    if (guide.stage === 'on') guide.quiet = state.day + HINT_PAUSE;
    if (guide.stage === 'welcome' && WELCOME.every((line) => guide.seen.includes(line.id))) guide.stage = 'offer';
  });
}

/** Says no to an offer of Penny's to walk the player through something: the hint is taken away and its steps never start. */
export function postpone(state: GameState, id: string): GameState {
  return change(acknowledge(state, id), (guide) => remember(guide, `${id}${LATER}`));
}

/** Goes from Uncle Tabby's welcome straight to Penny's question. */
export function skipWelcome(state: GameState): GameState {
  return change(state, (guide) => {
    if (guide.stage === 'welcome') guide.stage = 'offer';
  });
}

/** Calls Penny in or sends her away: the answer to her offer, and the switch in the Settings. */
export function setGuide(state: GameState, on: boolean): GameState {
  return change(state, (guide) => {
    guide.stage = on ? 'on' : 'off';
  });
}
