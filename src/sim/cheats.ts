// Cheat codes for testing (prompt.md Phase 6b). Like a player action, a code
// takes the state and returns a new one; nothing here runs unless a code is
// typed into the console (Ctrl+Alt+C).

import { FEATURES } from '../config/unlocks';
import { ACTIVE_REGIONS, BANKRUPTCY_MONTHS, DAYS_PER_YEAR, EVENTS, START_YEAR } from '../config/balance';
import { RECESSIONS } from '../config/events';
import { TECHS } from '../config/tech';
import { getRegion, type Medium } from '../config/world';
import { openLicenseAuction } from './auctions';
import { formatDate, monthNumber, toCalendarDate, toDay } from './calendar';
import { goBankrupt, outlook } from './economy';
import { breakRandomStory } from './breakingNews';
import { recessionIn, sportsEventIn } from './events';
import { MEDIUM_NAMES } from './licenses';
import { buildingOf } from './office';
import { campaignStart } from './politics';
import { STRIKES } from '../config/balance';
import { TEAMS, TEAM_IDS, teamMembers } from './teams';
import type { GameState, TeamId } from './state';
import { advance } from './tick';

export type CheatResult = { ok: true; state: GameState; message: string } | { ok: false; error: string };

/** Every code, with what to type after it: shown by `help`. */
export const CHEATS: readonly { code: string; use: string; does: string }[] = [
  { code: 'money', use: 'money 50000', does: 'Adds cash. A negative amount takes it away.' },
  { code: 'year', use: 'year 2000', does: 'Moves the calendar to that year, same day and month. Nothing is simulated: everything that runs keeps the time it had left.' },
  { code: 'days', use: 'days 30', does: 'Plays that many days at once, as if you had waited.' },
  { code: 'rp', use: 'rp 500', does: 'Adds research points.' },
  { code: 'research', use: 'research all', does: 'Researches every technology.' },
  { code: 'reputation', use: 'reputation 80', does: 'Sets the reputation of all your channels, 0 to 100.' },
  { code: 'prestige', use: 'prestige 100', does: 'Adds prestige.' },
  { code: 'floors', use: 'floors', does: 'Opens all office floors.' },
  { code: 'unlock', use: 'unlock', does: 'Opens everything a new company has to reach a milestone for: sales, marketing, research, more regions, the content market and events.' },
  { code: 'morale', use: 'morale 100', does: 'Sets the morale of all staff, 0 to 100.' },
  { code: 'skill', use: 'skill 90', does: 'Sets the skill of all staff, 1 to 100.' },
  { code: 'repair', use: 'repair', does: 'Cleans every room, repairs all equipment and fixes the building.' },
  { code: 'strike', use: 'strike hosts', does: 'That team walks out at once, for the usual time: hosts, production, sales, marketing, research or support.' },
  { code: 'event', use: 'event', does: 'Moves the calendar to the next World Cup or Olympics, on the day its TV rights go to auction. “event worldcup”, “event olympics”, “event election” or “event recession” go to the day that one begins. “event breaking” breaks a news story today, without moving the calendar. Everything keeps the time it had left, as with “year”.' },
  { code: 'auction', use: 'auction tv capital', does: 'Puts one more radio or TV license up for auction, for the usual week: capital, north, coast, heartland or highlands. Without a region, your headquarters region.' },
  { code: 'bankrupt', use: 'bankrupt', does: 'The bank pulls the plug at once, without Uncle Tabby. “bankrupt soon” puts you in the red, two months in, so the bank decides on the 1st.' },
  { code: 'seed', use: 'seed', does: 'Shows the seed of this game, which also decides its town.' },
  { code: 'help', use: 'help', does: 'Lists the codes.' },
];

/** The furthest the calendar can be moved, and the most days played at once. */
export const CHEAT_LIMITS = { lastYear: 2099, days: 3660 };

/**
 * State fields that hold a game day. `year` moves all of them along with the
 * calendar, so a license keeps the years it had left and nothing expires
 * because of the jump. A new day-stamped field must be added here.
 */
const DAY_FIELDS = new Set(['day', 'hiredOn', 'expiresOn', 'lastEventDay', 'endDay', 'endsOn', 'startDay', 'fromDay', 'bornOn', 'from', 'until', 'lastPoachDay', 'boughtOn', 'trainingUntil', 'talentUntil', 'on', 'since', 'warnedOn', 'strikeUntil', 'masterControl', 'controlRooms', 'headquarters', 'nextElection']);

/** Moves every day stamp in a value by `days`, in place. */
function shiftDays(value: unknown, days: number): void {
  if (Array.isArray(value)) {
    for (const item of value) shiftDays(item, days);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  for (const [key, field] of Object.entries(record)) {
    if (typeof field === 'number' && DAY_FIELDS.has(key)) record[key] = field + days;
    else shiftDays(field, days);
  }
}

/**
 * Moves the calendar to a day without simulating anything: every day stamp
 * moves along, and the monthly reports, which are filed under a year and a
 * month, by as many months.
 */
function moveCalendar(draft: GameState, day: number): void {
  const months = monthNumber(day) - monthNumber(draft.day);
  shiftDays(draft, day - draft.day);
  for (const report of draft.monthlyReports) {
    const month = report.year * 12 + report.month - 1 + months;
    report.year = Math.floor(month / 12);
    report.month = month - report.year * 12 + 1;
  }
}

/** The words `event` takes, and what each looks for. */
const EVENT_WORDS = ['worldcup', 'olympics', 'election', 'recession', 'breaking'] as const;
type EventWord = (typeof EVENT_WORDS)[number];

/**
 * Where `event` goes: the day before the thing begins, so that playing that one
 * day lets the game report it, with what the console says then. Elections are
 * in the state rather than the calendar, so the jump leaves them where they are.
 * A string says why there is nothing to go to.
 */
function nextEvent(state: GameState, word: Exclude<EventWord, 'breaking'> | undefined): { day: number; message: string; election?: true } | string {
  const { year } = toCalendarDate(state.day);
  const tooLate = (what: string) => `The next ${what} is after ${CHEAT_LIMITS.lastYear}, the furthest the calendar goes.`;

  if (word === 'election') {
    const p = state.politics;
    const campaign = state.day < campaignStart(p);
    const starts = campaign ? campaignStart(p) : p.nextElection;
    if (toCalendarDate(starts).year > CHEAT_LIMITS.lastYear) return tooLate('election');
    return { day: starts - 1, message: campaign ? 'the election campaign has begun.' : 'it is election day.', election: true };
  }

  if (word === 'recession') {
    const recession = RECESSIONS.find((r) => !recessionIn(r.year - 1) && toDay(r.year, 1, 1) > state.day);
    if (!recession) return `No recession comes after ${RECESSIONS[RECESSIONS.length - 1]!.year}.`;
    return { day: toDay(recession.year, 1, 1) - 1, message: `${recession.name} has begun.` };
  }

  // A World Cup or the Olympics: from the auction of its TV rights, or from its first day.
  const kind = word === 'worldcup' ? 'worldCup' : word === 'olympics' ? 'olympics' : undefined;
  for (let y = year; y <= CHEAT_LIMITS.lastYear; y++) {
    const event = sportsEventIn(y);
    if (!event || (kind && event.kind !== kind)) continue;
    const starts = kind ? event.startDay : event.startDay - EVENTS.auctionLeadDays;
    if (starts <= state.day) continue;
    return kind
      ? { day: starts - 1, message: `the ${event.name} has begun.` }
      : { day: starts - 1, message: `the TV rights to the ${event.name} are up for auction. Bid on the Content screen; “days ${EVENTS.auctionLeadDays}” takes you to its first day.` };
  }
  return tooLate(word === 'worldcup' ? 'World Cup' : word === 'olympics' ? 'Olympics' : 'World Cup or Olympics');
}

/** A whole number as people type it: 50000, 50.000, 50,000, 50k or 2m. */
function parseAmount(text: string | undefined): number | null {
  const match = /^([+\-−]?)(\d[\d.,_]*)([km]?)$/i.exec(text ?? '');
  if (!match) return null;
  const digits = Number(match[2]!.replace(/[.,_]/g, ''));
  const scale = match[3]!.toLowerCase() === 'k' ? 1_000 : match[3]!.toLowerCase() === 'm' ? 1_000_000 : 1;
  return (match[1] === '-' || match[1] === '−' ? -1 : 1) * digits * scale;
}

const count = (n: number) => n.toLocaleString('en-US');
const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));

/** Runs one line typed into the cheat console. */
export function runCheat(state: GameState, input: string): CheatResult {
  const [code = '', arg, arg2] = input.trim().toLowerCase().split(/\s+/);
  const amount = parseAmount(arg);
  const draft = structuredClone(state);
  const done = (message: string): CheatResult => ({ ok: true, state: draft, message });
  const needsNumber = (example: string): CheatResult => ({ ok: false, error: `Type a number after it, like “${example}”.` });

  switch (code) {
    case 'help':
      return done(CHEATS.map((c) => c.use).join(' · '));

    case 'money':
      if (amount === null) return needsNumber('money 50000');
      draft.money += amount;
      return done(`${amount < 0 ? 'Took' : 'Added'} €${count(Math.abs(amount))}. You now have €${count(Math.round(draft.money))}.`);

    case 'year': {
      if (amount === null) return needsNumber('year 2000');
      if (amount < START_YEAR || amount > CHEAT_LIMITS.lastYear) return { ok: false, error: `Pick a year from ${START_YEAR} to ${CHEAT_LIMITS.lastYear}.` };
      const { month, dayOfMonth } = toCalendarDate(state.day);
      moveCalendar(draft, toDay(amount, month, dayOfMonth));
      return done(`It is now ${formatDate(draft.day)}. Contracts, licenses and loans kept the time they had left.`);
    }

    case 'days': {
      if (amount === null || amount < 1) return needsNumber('days 30');
      if (state.bankrupt) return { ok: false, error: 'The company is bankrupt, so time stands still.' };
      const days = Math.min(amount, CHEAT_LIMITS.days);
      const next = advance(state, days);
      return { ok: true, state: next, message: `Played ${count(next.day - state.day)} day${next.day - state.day === 1 ? '' : 's'}. It is now ${formatDate(next.day)}.${next.bankrupt ? ' The company went bankrupt on the way.' : ''}` };
    }

    case 'rp':
      if (amount === null) return needsNumber('rp 500');
      draft.researchPoints = Math.max(0, draft.researchPoints + amount);
      return done(`You now have ${count(Math.round(draft.researchPoints))} research points.`);

    case 'research':
      if (arg !== 'all') return { ok: false, error: 'Type “research all”. For points, use “rp 500”.' };
      draft.techs = TECHS.map((t) => t.id);
      return done(`All ${TECHS.length} technologies are researched.`);

    case 'reputation': {
      if (amount === null) return needsNumber('reputation 80');
      if (draft.channels.length === 0) return { ok: false, error: 'You have no channel yet, so there is no reputation to set.' };
      const value = clamp(amount, 0, 100);
      for (const channel of draft.channels) {
        for (const region of Object.keys(channel.reputation) as (keyof typeof channel.reputation)[]) channel.reputation[region] = value / 100;
      }
      draft.reputation = value;
      return done(`Reputation is ${value} on every channel.`);
    }

    case 'prestige':
      if (amount === null) return needsNumber('prestige 100');
      draft.prestige = Math.max(0, draft.prestige + amount);
      return done(`You now have ${count(draft.prestige)} prestige.`);

    case 'floors':
      draft.floorsUnlocked = buildingOf(draft).floors;
      return done(`All ${draft.floorsUnlocked} floors are open.`);

    case 'unlock':
      draft.unlocked = [...FEATURES];
      return done('Everything is open.');

    case 'morale': {
      if (amount === null) return needsNumber('morale 100');
      const value = clamp(amount, 0, 100);
      for (const employee of draft.employees) employee.morale = value;
      return done(`Morale is ${value} for all ${draft.employees.length} staff.`);
    }

    case 'skill': {
      if (amount === null) return needsNumber('skill 90');
      const value = clamp(amount, 1, 100);
      for (const employee of draft.employees) employee.skill = value;
      return done(`Skill is ${value} for all ${draft.employees.length} staff.`);
    }

    case 'repair':
      for (const room of draft.rooms) {
        room.cleanliness = 100;
        room.issue = null;
        for (const item of room.furniture) item.condition = 100;
      }
      return done('Every room is clean, all equipment works and the building has no faults.');

    case 'strike': {
      const team = TEAM_IDS.find((id) => id === arg) as TeamId | undefined;
      if (!team) return { ok: false, error: `Name a team after it: ${TEAM_IDS.join(', ')}.` };
      if (teamMembers(draft, team).length === 0) return { ok: false, error: `There is nobody in ${TEAMS[team].inText}.` };
      draft.unrest[team] = { since: draft.day, warnedOn: draft.day, strikeUntil: draft.day + STRIKES.days };
      return done(`${TEAMS[team].name} is on strike until ${formatDate(draft.day + STRIKES.days)}.`);
    }

    case 'event': {
      const word = EVENT_WORDS.find((w) => w === arg);
      if (arg && !word) return { ok: false, error: `Type “event”, or one of: ${EVENT_WORDS.join(', ')}.` };
      if (word === 'breaking') {
        const story = breakRandomStory(draft);
        return story ? done(`A story breaks today: ${story.headline}`) : { ok: false, error: 'There is no story left to break.' };
      }
      if (state.bankrupt) return { ok: false, error: 'The company is bankrupt, so time stands still.' };
      const target = nextEvent(state, word);
      if (typeof target === 'string') return { ok: false, error: target };
      const politics = structuredClone(draft.politics);
      moveCalendar(draft, target.day);
      if (target.election) draft.politics = politics;
      // One day played, so the game itself reports what begins.
      const next = advance(draft, 1);
      return { ok: true, state: next, message: `It is now ${formatDate(next.day)}: ${target.message} Contracts, licenses and loans kept the time they had left.${next.bankrupt ? ' The company went bankrupt on the way.' : ''}` };
    }

    case 'auction': {
      const medium = (['radio', 'tv'] as const).find((m) => m === arg) as Medium | undefined;
      const regionId = arg2 === undefined ? draft.headquarters : ACTIVE_REGIONS.find((r) => r === arg2);
      if (!medium || !regionId) return { ok: false, error: `Type “auction radio” or “auction tv”, and a region: ${ACTIVE_REGIONS.join(', ')}.` };
      if (state.bankrupt) return { ok: false, error: 'The company is bankrupt, so there is nobody to bid.' };
      // Issued like any other license, so it can be bought at the list price if nobody bids.
      draft.licensesIssued[medium][regionId] = (draft.licensesIssued[medium][regionId] ?? 0) + 1;
      const auction = openLicenseAuction(draft, medium, regionId);
      return done(`A ${MEDIUM_NAMES[medium]} license in ${getRegion(regionId).name} is up for auction until ${formatDate(auction.endsOn)}.`);
    }

    case 'bankrupt': {
      if (arg !== undefined && arg !== 'soon') return { ok: false, error: 'Type “bankrupt”, or “bankrupt soon” to let the bank decide on the 1st.' };
      if (state.bankrupt) return { ok: false, error: 'The company is already bankrupt.' };
      if (!arg) {
        goBankrupt(draft);
        return done('The bank has pulled the plug. Load an earlier save to play on.');
      }
      // In the red until the 1st, whatever the channels earn on the way there.
      const { year, month } = toCalendarDate(draft.day);
      const first = toDay(year, month + 1, 1);
      const earnings = (Math.max(0, outlook(draft).income) / (DAYS_PER_YEAR / 12)) * (first - draft.day);
      draft.money = -Math.ceil(1 + 2 * earnings);
      draft.negativeMonths = BANKRUPTCY_MONTHS - 1;
      const then = draft.bailedOut ? 'the company goes bankrupt' : 'Uncle Tabby pays in, as he does once';
      return done(`You are €${count(-draft.money)} in the red, ${draft.negativeMonths} months in. On ${formatDate(first)} the bank decides: ${then}.`);
    }

    case 'seed':
      return done(`This game’s seed is ${state.seed}.`);

    default:
      return { ok: false, error: code ? `There is no code “${code}”. Type “help” for the list.` : 'Type a code, or “help” for the list.' };
  }
}
