// Cheat codes for testing (prompt.md Phase 6b). Like a player action, a code
// takes the state and returns a new one; nothing here runs unless a code is
// typed into the console (Ctrl+Alt+C).

import { FEATURES } from '../config/unlocks';
import { START_YEAR } from '../config/balance';
import { TECHS } from '../config/tech';
import { formatDate, toCalendarDate, toDay } from './calendar';
import { buildingOf } from './office';
import type { GameState } from './state';
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
const DAY_FIELDS = new Set(['day', 'hiredOn', 'expiresOn', 'lastEventDay', 'endDay', 'endsOn', 'startDay', 'fromDay', 'until', 'lastPoachDay', 'boughtOn', 'trainingUntil']);

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
  const [code = '', arg] = input.trim().toLowerCase().split(/\s+/);
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
      const { year, month, dayOfMonth } = toCalendarDate(state.day);
      shiftDays(draft, toDay(amount, month, dayOfMonth) - state.day);
      // Monthly reports are filed under a year and month instead of a day.
      for (const report of draft.monthlyReports) report.year += amount - year;
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

    case 'seed':
      return done(`This game’s seed is ${state.seed}.`);

    default:
      return { ok: false, error: code ? `There is no code “${code}”. Type “help” for the list.` : 'Type a code, or “help” for the list.' };
  }
}
