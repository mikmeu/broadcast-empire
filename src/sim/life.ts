// The life of your people (0.20.0, #174): their age, parental leave, sickness, retirement and death. See LIFE in
// config/balance.ts. All of it is drawn from random numbers of its own, made of the game's seed, the day and the
// person, so that the game's main stream does not move and seeded games stay what they were.

import { DAYS_PER_YEAR, LIFE, MORALE, START_YEAR, STRIKES } from '../config/balance';
import { formatDate, toCalendarDate } from './calendar';
import { isWoman } from './names';
import { Rng } from './rng';
import { removeEmployee } from './staff';
import { addHeadline, addMessage, type Employee, type GameState, type Person, type Role } from './state';
import { TEAMS, isAway } from './teams';

/** A stream of random numbers for one person on one day, apart from the game's own. `what` tells draws apart. */
export function lifeRng(state: Pick<GameState, 'seed' | 'day'>, id: string, what = ''): Rng {
  let hash = 2166136261;
  for (const c of `${state.seed}|${state.day}|${id}|${what}`) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
  const rng = new Rng(hash);
  rng.next();
  return rng;
}

/** Someone's age in whole years today, or null for a person who has no birthday (a test person). */
export function ageOf(state: Pick<GameState, 'day'>, person: Pick<Person, 'bornOn'>): number | null {
  return person.bornOn === undefined ? null : Math.floor((state.day - person.bornOn) / DAYS_PER_YEAR);
}

/** The day someone retires: their 65th birthday. */
export const retiresOn = (bornOn: number) => Math.ceil(bornOn + LIFE.retireAt * DAYS_PER_YEAR);

/**
 * The birthday of someone new, drawn from a hash of their id (not the game's stream). In the first
 * `LIFE.youngYears` years of the game everyone is `startAges`; later, up to `laterMaxAge`, most of them young.
 */
export function birthFor(state: Pick<GameState, 'seed' | 'day'>, id: string): number {
  const rng = lifeRng(state, id, 'born');
  const { min, max } = LIFE.startAges;
  const young = toCalendarDate(state.day).year - START_YEAR < LIFE.youngYears;
  const age = young ? rng.int(min, max) : min + Math.floor(rng.next() ** 3 * (LIFE.laterMaxAge - min + 1));
  return state.day - Math.floor(age * DAYS_PER_YEAR) - rng.int(0, 364);
}

/** A birthday for a given age in years (a rival's host who signs with you): the age is drawn from the id between `min` and `max`. */
export function birthAt(state: Pick<GameState, 'seed' | 'day'>, id: string, min: number, max: number): number {
  const rng = lifeRng(state, id, 'born');
  return state.day - Math.floor(rng.int(min, max) * DAYS_PER_YEAR) - rng.int(0, 364);
}

/** What the agency charges a month for a temp for this person (see LIFE.temp). */
export const tempPrice = (employee: Pick<Employee, 'salary'>) => Math.round((employee.salary * LIFE.temp.agency) / 50) * 50;

/** Why a temp can't be taken on for someone today, or null if one can. */
export function tempBlocker(state: GameState, employee: Employee): string | null {
  if (!isAway(state, employee)) return employee.away ? `${employee.name} is not away yet: ${formatDate(employee.away.from)}.` : `${employee.name} is at work.`;
  if (employee.away!.temp) return `${employee.away!.temp.name} stands in for ${employee.name} already.`;
  return null;
}

/** The jobs whose absence stops a show or an office: these hear of it with a pop-up. */
const matters = (role: Role) => role === 'channelManager' || TEAMS.hosts.roles.includes(role) || TEAMS.production.roles.includes(role);

const firstName = (name: string) => name.split(' ')[0] ?? name;

/** How much more often someone falls ill at this morale: 1 at the neutral level, up to LIFE.sick.lowMorale at a strike's. */
export function sicknessFactor(morale: number): number {
  const share = Math.min(1, Math.max(0, (MORALE.neutral - morale) / (MORALE.neutral - STRIKES.below)));
  return 1 + (LIFE.sick.lowMorale - 1) * share;
}

/** The daily chance that someone of this age and morale falls ill. */
export const sickChance = (age: number, morale: number) =>
  ((LIFE.sick.perYear * sicknessFactor(morale) * (age >= LIFE.sick.olderFrom ? LIFE.sick.older : 1)) / DAYS_PER_YEAR);

/** The daily chance that someone of this age dies. */
export function deathChance(age: number): number {
  const bracket = [...LIFE.death].reverse().find((b) => age >= b.from) ?? LIFE.death[0]!;
  return bracket.perYear / DAYS_PER_YEAR;
}

/** The daily chance that someone of this age announces a leave, so that they have LIFE.leave.children over the years. */
export const leaveChance = (age: number) => (age >= LIFE.leave.from && age < LIFE.leave.to ? LIFE.leave.children / ((LIFE.leave.to - LIFE.leave.from) * DAYS_PER_YEAR) : 0);

/** Daily, once the day has turned: people come back, retire, die, fall ill and go on leave. */
export function lifeEvents(draft: GameState): void {
  for (const e of [...draft.employees]) {
    const age = ageOf(draft, e);
    if (age === null) continue;
    const important = matters(e.role);
    const rng = lifeRng(draft, e.id);

    if (e.away && draft.day >= e.away.until) {
      e.away = null;
      if (important) addMessage(draft, 'good', `${e.name} is back at work.`, undefined, undefined, 'staff');
    }

    const retireOn = retiresOn(e.bornOn!);
    if (draft.day >= retireOn) {
      retire(draft, e);
      continue;
    }
    if (draft.day === retireOn - LIFE.retireNotice) {
      addMessage(draft, 'warning', `${e.name} retires on ${formatDate(retireOn)}, at ${LIFE.retireAt}. Find someone for their work before then.`, undefined, 'staff');
    }

    if (rng.next() < deathChance(age)) {
      die(draft, e, age);
      continue;
    }

    if (e.away) continue;
    // All three are drawn together, so that one's outcome does not move the others.
    const ill = rng.next();
    const expecting = rng.next();
    const spell = rng.next();
    if (ill < sickChance(age, e.morale)) fallIll(draft, e, spell, rng, important);
    else if (expecting < leaveChance(age)) goOnLeave(draft, e, important);
  }
}

function fallIll(draft: GameState, e: Employee, spell: number, rng: Rng, important: boolean): void {
  const long = spell < 1 / LIFE.sick.longOneIn;
  const days = long ? rng.int(LIFE.sick.longDays.min, LIFE.sick.longDays.max) : rng.int(LIFE.sick.days.min, LIFE.sick.days.max);
  e.away = { reason: 'sick', from: draft.day, until: draft.day + days, temp: null };
  if (important || long) addMessage(draft, 'warning', `${e.name} is ill until ${formatDate(e.away.until - 1)}. They are paid; nobody does their work meanwhile. Take on a temp, or hire someone else.`, undefined, important ? 'staff' : undefined);
}

function goOnLeave(draft: GameState, e: Employee, important: boolean): void {
  const woman = isWoman(e.name);
  const notice = woman ? LIFE.leave.womanNotice : LIFE.leave.manNotice;
  const from = draft.day + notice;
  const until = from + (woman ? LIFE.leave.womanDays : LIFE.leave.manDays);
  e.away = { reason: 'leave', from, until, temp: null };
  const why = woman ? `${firstName(e.name)} is expecting a baby` : `${firstName(e.name)} is about to become a father`;
  const text = `${why} and is on parental leave from ${formatDate(from)} to ${formatDate(until - 1)}. The government pays them, not you. Nobody does their work meanwhile: take on a temp, or hire someone else.`;
  addMessage(draft, important ? 'warning' : 'info', text, undefined, important ? 'staff' : undefined);
}

function retire(draft: GameState, e: Employee): void {
  removeEmployee(draft, e.id);
  addMessage(draft, 'info', `${e.name} has retired, at ${LIFE.retireAt}. Thank you for all the years.`, undefined, matters(e.role) ? 'staff' : undefined);
  if (e.role === 'host' && e.fame >= LIFE.famousHost) addHeadline(draft, `The host ${e.name} retires, after a long career.`);
}

function die(draft: GameState, e: Employee, age: number): void {
  removeEmployee(draft, e.id);
  addMessage(draft, 'warning', `${e.name} has died, aged ${age}. We are very sorry. Their work needs someone new.`, undefined, 'staff');
  if (e.role === 'host' && e.fame >= LIFE.famousHost) addHeadline(draft, `The host ${e.name} has died, aged ${age}.`);
}
