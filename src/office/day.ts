// The working day: who is at work when, and how they get there. Pure: it
// follows from the game state and the day, so the office (layout.ts) and the
// street (street.ts) tell the same story.
//
// Times are hours on the office clock (OFFICE_DAY): 9 is nine in the morning.
// The simulation knows nothing of this; it is only what the player sees.

import { OFFICE_DAY, SLOTS, SLOT_HOURS } from '../config/world';
import { RECEPTIONIST_NAME } from '../config/names';
import { onAirIds, slotsOf } from '../sim/deals';
import { nameFromKey } from '../sim/names';
import { buildingOf } from '../sim/office';
import { carBays } from './parking';
import { townHours } from './traffic';
import type { Employee, GameState, Id, Show } from '../sim/state';

/** How someone comes to work and goes home. */
export type Travel = 'walk' | 'bus' | 'taxi' | 'car';

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
  /** The guest of a talk show comes by taxi this long before the show, and goes home this long after it. */
  guestBefore: 0.5,
  guestAfter: 0.25,
  /** Shares of those who come on foot, by bus and by car (0.20.0); the rest take a taxi. */
  onFoot: 0.3,
  byBus: 0.3,
  byCar: 0.25,
  /** The share of hosts who come by car (0.20.0); the rest take a taxi. */
  hostsByCar: 0.5,
  /** A car is in its bay this long before its owner is at the door, and stays this long after they have come out of it. */
  parkedBefore: 0.5,
  parkedAfter: 0.25,
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
  const scheduled = onAirIds(state);
  return state.shows.filter((show) => show.studioId !== null && scheduled.has(show.id));
};

/** The hours a show is on the air today: one stretch for every slot it fills. */
export function airtimes(state: GameState, show: Show): [from: number, to: number][] {
  const slots = new Set(slotsOf(state, show.id));
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

/**
 * How someone would like to travel on a day. Hosts come by car or take a taxi;
 * the others walk, take the bus, drive or take a taxi as the day has it. Whether
 * there is a bay for the car is another matter: see `travelFor`.
 */
export function travelOf(employee: { id: Id; role: Employee['role'] | 'ceo' }, day: number): Travel {
  const roll = chance(employee.id, day, 1);
  if (employee.role === 'host') return roll < DAY.hostsByCar ? 'car' : 'taxi';
  return roll < DAY.onFoot ? 'walk' : roll < DAY.onFoot + DAY.byBus ? 'bus' : roll < DAY.onFoot + DAY.byBus + DAY.byCar ? 'car' : 'taxi';
}

/** The bays of the company's car park that go to the cars of a day, by the id of whoever parks there (0.20.0). */
export type CarPlan = Map<Id, number>;

let planned: { state: GameState; employees: GameState['employees']; floors: number; day: number; plan: CarPlan } | null = null;

/**
 * Who parks where on a day. Everyone who would come by car (`travelOf`) gets a
 * bay of the open part of the lot (parking.ts) that is free for as long as
 * their car is there, starting from a place in the lot that follows from their
 * id; someone for whom there is none takes a taxi instead. No random numbers
 * are drawn, so nothing else in a seeded game moves.
 */
export function carPlan(state: GameState, day: number): CarPlan {
  if (planned?.state === state && planned.employees === state.employees && planned.floors === state.floorsUnlocked && planned.day === day) return planned.plan;
  const bays = carBays(buildingOf(state), state.floorsUnlocked);
  const wishes = [...state.employees, ceoOf(state)].flatMap((person) => {
    if (travelOf(person, day) !== 'car') return [];
    const shift = person.role === 'ceo' ? CEO_SHIFT : shiftOf(state, person);
    if (!shift) return [];
    const from = (doorTime(shift, 'car') ?? OFFICE_DAY.from) - DAY.parkedBefore;
    const to = shift.to + DAY.wayOut + DAY.parkedAfter;
    return [{ id: person.id, from, to }];
  });
  const plan: CarPlan = new Map();
  const taken: { bay: number; from: number; to: number }[] = [];
  for (const { id, from, to } of wishes.sort((a, b) => a.from - b.from || (a.id < b.id ? -1 : 1))) {
    const first = Math.floor(chance(id, day, 7) * bays.length);
    for (let n = 0; n < bays.length; n++) {
      const bay = bays[(first + n) % bays.length]!.id;
      if (taken.some((t) => t.bay === bay && t.from < to && from < t.to)) continue;
      taken.push({ bay, from, to });
      plan.set(id, bay);
      break;
    }
  }
  planned = { state, employees: state.employees, floors: state.floorsUnlocked, day, plan };
  return plan;
}

/** How someone travels on a day: as `travelOf` has it, but by taxi where the car park has no bay left for their car. */
export function travelFor(state: GameState, employee: { id: Id; role: Employee['role'] | 'ceo' }, day: number): Travel {
  const wish = travelOf(employee, day);
  return wish === 'car' && !carPlan(state, day).has(employee.id) ? 'taxi' : wish;
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
  /** For those who come by car (0.20.0): the car of the day, the same on the way in and the way out, and the bay it stands in (parking.ts). */
  car?: { key: string; bay: number };
}

/** A made-up name, the same every time for the same key: for the people who come here but don't work here. */
const madeUpName = nameFromKey;

/**
 * The name of one of the cast of a show that has no host (0.14.0): made up,
 * and the same every time for that show and place, so they keep their looks.
 */
export const castName = (showId: string, n: number): string => madeUpName(`${showId}:${n}`);

/**
 * The name of someone in the audience of a show (0.17.0), by their seat
 * counted across all the blocks of seating in the studio: the same for the
 * one who comes by bus and the one in the seat, and the same every time that
 * show is on.
 */
export const audienceName = (showId: string, seat: number): string => madeUpName(`${showId}:audience:${seat}`);

/** The receptionist's name (0.17.0): the same in every game, since #155 a fixed one (config/names.ts). */
export const receptionistName = (): string => RECEPTIONIST_NAME;

/** The name of the guest of a talk show (0.17.0). */
export const guestName = (showId: string): string => madeUpName(`${showId}:guest`);

/** The name of a contestant on a game show (0.17.0), by their place. */
export const contestantName = (showId: string, n: number): string => madeUpName(`${showId}:contestant:${n}`);

/**
 * The shows of a studio that bring a guest, with the hours the guest is there
 * today: from before the show until after it. Shared by the office (layout.ts)
 * and the street, so the one who gets out of the taxi is the one at the table.
 */
export function guestStays(state: GameState, studioId: string): { show: Show; from: number; to: number }[] {
  return made(state)
    .filter((show) => show.studioId === studioId)
    .flatMap((show) => airtimes(state, show).map(([from, to]) => ({ show, from: from - DAY.guestBefore, to: to + DAY.guestAfter })));
}

/** The id of the guest of the talk show in a studio: the same in the office and in the street. */
export const guestId = (studioId: string) => `visitor-guest-${studioId}`;

/**
 * Everyone's journeys of a day: staff coming in and going home, the audiences
 * of the shows, and the guests of the talk shows, who come and go by taxi.
 * `guests` are the studios of the talk shows that have a seat for a guest.
 */
export function tripsOf(state: GameState, day: number, audiences: { studioId: string; seats: number }[] = [], guests: string[] = []): Trip[] {
  const trips: Trip[] = [];
  const cars = carPlan(state, day);
  for (const person of [...state.employees, ceoOf(state)]) {
    const shift = person.role === 'ceo' ? CEO_SHIFT : shiftOf(state, person);
    if (!shift) continue;
    const travel = travelFor(state, person, day);
    const bay = travel === 'car' ? cars.get(person.id) : undefined;
    const car = bay === undefined ? {} : { car: { key: `${day}:${person.id}`, bay } };
    const door = doorTime(shift, travel);
    if (door !== null) trips.push({ key: `${day}:${person.id}:in`, id: person.id, name: person.name, way: 'in', travel, at: door, ...car });
    // Whoever works until the day ends is not seen to leave.
    const out = shift.to + DAY.wayOut;
    if (out < OFFICE_DAY.to) trips.push({ key: `${day}:${person.id}:out`, id: person.id, name: person.name, way: 'out', travel, at: out, ...car });
  }
  // Seats are counted across the blocks of a studio, as in the office (layout.ts), so a second block brings people of its own.
  const counted = new Map<string, number>();
  for (const { studioId, seats } of audiences) {
    const first = counted.get(studioId) ?? 0;
    counted.set(studioId, first + seats);
    const slots = made(state).filter((show) => show.studioId === studioId).flatMap((show) => airtimes(state, show).map((hours) => [show, ...hours] as const));
    for (const [show, from, to] of slots) {
      for (let n = first; n < first + seats; n++) {
        const id = `audience-${studioId}-${from}-${n}`;
        const name = audienceName(show.id, n);
        // They come by the bus before the show and take the next one home.
        if (from - DAY.audienceBefore > OFFICE_DAY.from + 0.5) trips.push({ key: `${day}:${id}:in`, id, name, way: 'in', travel: 'bus', at: from - DAY.audienceBefore });
        if (to + DAY.audienceAfter + DAY.wayOut < OFFICE_DAY.to) trips.push({ key: `${day}:${id}:out`, id, name, way: 'out', travel: 'bus', at: to + DAY.audienceAfter + DAY.wayOut });
      }
    }
  }
  for (const studioId of guests) {
    const id = guestId(studioId);
    for (const { show, from, to } of guestStays(state, studioId)) {
      const name = guestName(show.id);
      if (from > OFFICE_DAY.from + 0.5) trips.push({ key: `${day}:${id}:${from}:in`, id, name, way: 'in', travel: 'taxi', at: from });
      if (to + DAY.wayOut < OFFICE_DAY.to) trips.push({ key: `${day}:${id}:${from}:out`, id, name, way: 'out', travel: 'taxi', at: to + DAY.wayOut });
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
