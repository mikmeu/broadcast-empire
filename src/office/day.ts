// The working day: who is at work when, and how they get there. Pure: it
// follows from the game state and the day, so the office (layout.ts) and the
// street (street.ts) tell the same story.
//
// Times are hours on the office clock (OFFICE_DAY): 9 is nine in the morning.
// The simulation knows nothing of this; it is only what the player sees.

import { OFFICE_DAY, SLOTS, SLOT_HOURS } from '../config/world';
import { townHours } from './traffic';
import type { Employee, GameState, Id, Show } from '../sim/state';

/** How someone comes to work and goes home. */
export type Travel = 'walk' | 'bus' | 'taxi';

/** The hours someone is at work on a day. */
export interface Shift {
  from: number;
  to: number;
  /** In before the clock starts: at their post when the day begins, without being seen to arrive. */
  early: boolean;
}

export const DAY = {
  /** The hours of everyone but hosts and production staff. */
  office: { from: 9, to: 17 },
  /** How long a shift of the production staff is at least. */
  shift: 8,
  /** A host is in this long before their first show, and stays this long after their last. */
  hostBefore: 0.75,
  hostAfter: 0.25,
  /** Production staff are in this long before the first show they work on, and stay this long after the last. */
  crewBefore: 0.5,
  crewAfter: 0.25,
  /** Lunch is eaten between these hours, dinner between those, and a meal takes this long. */
  lunch: { from: 11, to: 14 },
  dinner: { from: 17, to: 18.75 },
  meal: 0.75,
  /** From getting off the bus to the door, and from the door to wherever they go on leaving: hours on the clock, the time it takes in the street (0.16.0). */
  busWalk: townHours(0.5),
  /** How long it takes to get from one's place to the door when the day is done. */
  wayOut: 0.5,
  /** An audience is in its seats this long before the show, and gets up this long after. */
  audienceBefore: 0.5,
  audienceAfter: 0.25,
  /** Shares of those who come on foot and by bus; the rest take a taxi. */
  onFoot: 0.4,
  byBus: 0.4,
} as const;

/** A number from 0 to 1 that is different for every person and day, and always the same for one. */
export function chance(id: Id, day: number, salt: number): number {
  let h = (day * 374761393 + salt * 668265263) | 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 1274126177);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/** The shows that are on a schedule and have a studio: the ones that are really made today. */
const made = (state: GameState): Show[] => {
  const scheduled = new Set(state.channels.flatMap((channel) => channel.schedule));
  return state.shows.filter((show) => show.studioId !== null && scheduled.has(show.id));
};

/** The hours a show is on the air today: one stretch for every slot it fills. */
export function airtimes(state: GameState, show: Show): [from: number, to: number][] {
  const slots = new Set(state.channels.flatMap((channel) => channel.schedule.flatMap((id, slot) => (id === show.id ? [slot] : []))));
  return [...slots].sort((a, b) => a - b).map((slot) => [SLOT_HOURS[SLOTS[slot]!][0], SLOT_HOURS[SLOTS[slot]!][1]]);
}

/** The first start and the last end of the shows someone presents or works on today, or null if they have none. */
function span(state: GameState, mine: (show: Show) => boolean): [first: number, last: number] | null {
  const times = made(state).filter(mine).flatMap((show) => airtimes(state, show));
  return times.length === 0 ? null : [Math.min(...times.map((t) => t[0])), Math.max(...times.map((t) => t[1]))];
}

const FIRST_SHOW = SLOT_HOURS[SLOTS[0]][0];

/**
 * When someone is at work today, or null for a host without a show on the air:
 *
 * - Hosts come shortly before their first show and leave shortly after their last.
 * - Production staff work a day of eight hours around the shows they make:
 *   the usual nine to five if that covers them, from the start of the day if
 *   they have the first show, and into the evening if they have a late one.
 * - Everyone else works from nine to five.
 *
 * Whoever is needed for the first show of the day is in before the clock starts.
 */
export function shiftOf(state: GameState, employee: Employee): Shift | null {
  const { office } = DAY;
  if (employee.role === 'host') {
    const shows = span(state, (show) => show.hostId === employee.id);
    if (!shows) return null;
    const early = shows[0] <= FIRST_SHOW;
    return { from: early ? OFFICE_DAY.from : shows[0] - DAY.hostBefore, to: Math.min(OFFICE_DAY.to, shows[1] + DAY.hostAfter), early };
  }
  if (employee.role !== 'production') return { ...office, early: false };
  const shows = span(state, (show) => show.staffIds.includes(employee.id));
  if (!shows) return { ...office, early: false };
  const early = shows[0] - DAY.crewBefore < office.from;
  const late = shows[1] > office.to;
  // Never home before the last show they work on is over.
  const to = Math.min(OFFICE_DAY.to, Math.max(shows[1] + DAY.crewAfter, late ? 0 : early ? OFFICE_DAY.from + DAY.shift : office.to));
  const from = early ? OFFICE_DAY.from : late ? Math.max(office.from, to - DAY.shift) : office.from;
  return { from, to, early };
}

/** The id the player's own character goes by among the people of the office. */
export const CEO_ID = 'ceo';
/** The player keeps office hours. */
export const CEO_SHIFT: Shift = { ...DAY.office, early: false };
/** The player as someone who comes to work. */
export const ceoOf = (state: GameState) => ({ id: CEO_ID, name: state.playerName, role: 'ceo' as const });

/** How someone travels on a day. Hosts always take a taxi; the others walk, take the bus or a taxi as the day has it. */
export function travelOf(employee: { id: Id; role: Employee['role'] | 'ceo' }, day: number): Travel {
  if (employee.role === 'host') return 'taxi';
  const roll = chance(employee.id, day, 1);
  return roll < DAY.onFoot ? 'walk' : roll < DAY.onFoot + DAY.byBus ? 'bus' : 'taxi';
}

/** The bus someone takes to be in by a time: the last one that stands at the stop no later than a quarter of an hour before it. */
export const busBefore = (hour: number) => Math.floor(hour - 0.75 - 0.25 + 1e-9) + 0.75;

/**
 * When someone walks in through the door: at the start of their shift, or for
 * those who come by bus a walk after the bus that stands at the stop at a
 * quarter to. Null for those who are in before the day begins.
 */
export function doorTime(shift: Shift, travel: Travel): number | null {
  if (shift.early) return null;
  return travel === 'bus' ? Math.max(shift.from, busBefore(shift.from + 0.25) + DAY.busWalk) : shift.from;
}

/** Whether someone is in the building at an hour: from walking in until their shift ends. */
export function atWork(shift: Shift | null, travel: Travel, hour: number): boolean {
  if (!shift) return false;
  return hour >= (doorTime(shift, travel) ?? OFFICE_DAY.from) && hour < shift.to;
}

/** A journey to or from the office that can be seen in the street. */
export interface Trip {
  /** Unique for the day: who, and which way. */
  key: string;
  /** Whose journey: an employee's id, or a name for someone who does not work here. */
  id: Id;
  name: string;
  way: 'in' | 'out';
  travel: Travel;
  /** For the way in: when they walk through the door. For the way out: when they come out of it. */
  at: number;
}

/** Everyone's journeys of a day: staff coming in and going home, and the audiences of the shows. */
export function tripsOf(state: GameState, day: number, audiences: { studioId: string; seats: number }[] = []): Trip[] {
  const trips: Trip[] = [];
  for (const person of [...state.employees, ceoOf(state)]) {
    const shift = person.role === 'ceo' ? CEO_SHIFT : shiftOf(state, person);
    if (!shift) continue;
    const travel = travelOf(person, day);
    const door = doorTime(shift, travel);
    if (door !== null) trips.push({ key: `${day}:${person.id}:in`, id: person.id, name: person.name, way: 'in', travel, at: door });
    // Whoever works until the day ends is not seen to leave.
    const out = shift.to + DAY.wayOut;
    if (out < OFFICE_DAY.to) trips.push({ key: `${day}:${person.id}:out`, id: person.id, name: person.name, way: 'out', travel, at: out });
  }
  for (const { studioId, seats } of audiences) {
    for (const [from, to] of made(state).filter((show) => show.studioId === studioId).flatMap((show) => airtimes(state, show))) {
      for (let n = 0; n < seats; n++) {
        const id = `audience-${studioId}-${from}-${n}`;
        const name = `Audience ${studioId} ${n}`;
        // They come by the bus before the show and take the next one home.
        if (from - DAY.audienceBefore > OFFICE_DAY.from + 0.5) trips.push({ key: `${day}:${id}:in`, id, name, way: 'in', travel: 'bus', at: from - DAY.audienceBefore });
        if (to + DAY.audienceAfter + DAY.wayOut < OFFICE_DAY.to) trips.push({ key: `${day}:${id}:out`, id, name, way: 'out', travel: 'bus', at: to + DAY.audienceAfter + DAY.wayOut });
      }
    }
  }
  return trips.sort((a, b) => a.at - b.at);
}

/** A meal in the canteen: who eats on which seat, from when to when. */
export interface Meal {
  id: Id;
  seat: number;
  from: number;
  to: number;
}

/**
 * Who eats when. Everyone who is at work over lunch picks a moment between
 * eleven and two, and whoever works into the evening one around dinner time.
 * They take a seat that is free for the whole meal, a little later if need
 * be; with no seat free in time they go without. `seats` is how many seats
 * the canteens have together.
 */
export function mealPlan(state: GameState, day: number, seats: number): Meal[] {
  const meals: Meal[] = [];
  const free = (seat: number, from: number, to: number) => !meals.some((meal) => meal.seat === seat && meal.from < to && from < meal.to);
  const wishes = state.employees.flatMap((employee) => {
    if (employee.role === 'host') return [];
    const shift = shiftOf(state, employee);
    if (!shift) return [];
    const door = doorTime(shift, travelOf(employee, day)) ?? shift.from;
    return [DAY.lunch, DAY.dinner].flatMap((window, n) => {
      // Dinner is for those who are still at work when it is over.
      if (n === 1 && shift.to < window.to) return [];
      const from = Math.max(window.from, door + 0.5);
      const until = Math.min(window.to, shift.to - 0.25) - DAY.meal;
      if (until < from) return [];
      const wish = from + Math.floor((chance(employee.id, day, 2 + n) * (until - from)) / 0.25 + 1e-9) * 0.25;
      return [{ id: employee.id, wish, until }];
    });
  });
  for (const { id, wish, until } of wishes.sort((a, b) => a.wish - b.wish || (a.id < b.id ? -1 : 1))) {
    for (let from = wish; from <= until + 1e-9; from += 0.25) {
      const seat = Array.from({ length: seats }, (_, n) => n).find((n) => free(n, from, from + DAY.meal));
      if (seat === undefined) continue;
      meals.push({ id, seat, from, to: from + DAY.meal });
      break;
    }
  }
  return meals;
}
