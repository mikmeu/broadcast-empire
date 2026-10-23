// Where everyone is in the 3D office. Pure: it only reads the game state and
// the asset registry, so the view just draws what this returns.

import { AUDIENCE_PER_SEATING, CORE, FLOOR, FURNITURE, RECEPTION, ROOM_TYPE_NAMES, SERVICE_ROOMS, WEST, inText, largestPart, partsOf, type FurnitureType, type RoomLayout, type RoomShape } from '../config/office';
import { OFFICE_DAY, SLOTS, SLOT_HOURS } from '../config/world';
import { CEO_ID, CEO_SHIFT, DAY, airtimes, atWork, audienceName, castName, ceoOf, chance, contestantName, doorTime, guestId, guestName, guestStays, mealPlan, receptionistName, shiftOf, travelOf, type Meal, type Shift, type Travel } from './day';
import { formatDate, formatHour, hourAt, monthNumber } from '../sim/calendar';
import { SUPPORT_ROLES, tvControlRooms, borrowedDesks, deskFor, deskRoomFor, employeesWithDesk, findRoom, floorPlan, footprint, inOrder, isFurnished, isManager, needsDesk, roomName, type BorrowedDesk } from '../sim/office';
import { onStrike, teamOf } from '../sim/teams';
import type { Employee, Furniture, GameState, Id, RentedRoom, Role, Show } from '../sim/state';
import { FURNITURE_ASSETS, type Activity, type Part, type Spot } from './assets';
import { getGenre, hasHost } from '../config/genres';

export { CEO_ID, castName } from './day';

/** What someone is doing where they are; see `whereabouts`. */
export type Status = 'post' | 'onAir' | 'offAir' | 'lunch' | 'away' | 'waiting' | 'visiting' | 'leaving' | 'passing';

/** Someone on a floor: where they are (in floor tiles), which way they face and what they are doing. */
export interface Person {
  id: Id;
  name: string;
  /** Their job; `ceo` for the player; or `visitor` for someone who does not work here: the audience, a guest, the receptionist. */
  role: Role | 'ceo' | 'visitor';
  floor: number;
  x: number;
  z: number;
  /** How far above the floor they are, in tiles: on a stage or a step. */
  y?: number;
  /** Quarter turns, counter-clockwise seen from above; 0 faces north. */
  turn: number;
  activity: Activity;
  /** The room they are in, or null in the corridor. */
  roomId: string | null;
  status: Status;
  /** The show they are presenting right now, or working the controls for, if it is on the air. */
  show?: string;
  /** Out of sight once they get there: through a door, into a lift or out of the building. */
  away?: boolean;
  /** Where they come from when they turn up on a floor: the lift or the entrance. */
  from?: { x: number; z: number; roomId: string };
  /** For someone who goes into the lifts with others in the same beat: their place in the line in front of the doors, and the seconds they wait there before going in (see `liftQueue`). */
  queue?: { x: number; z: number; wait: number };
  /** Set out for the lift or the entrance in this very beat (those who turn up on a floor have `from`): the footsteps of the beat are theirs. */
  fresh?: boolean;
}

/** The line of the entrance: the middle of the hall between the stairs and the lifts, in tiles from the top of the floor. */
export const CORRIDOR_Z = FLOOR.corridorY + 0.5;

/** The parts of a piece of furniture at its tier. */
export function partsAt(type: FurnitureType, tier: number): Part[] {
  return FURNITURE_ASSETS[type].parts.filter((p) => !p.tiers || (tier >= p.tiers[0] && tier <= p.tiers[1]));
}

/**
 * Which way is into a room from its door, and which way runs along the wall
 * the door is in: by the wall of the room that the door is on.
 */
export function doorway(room: RoomShape): { into: [x: number, z: number]; along: [x: number, z: number] } {
  const { door } = room;
  if (door.z === room.y) return { into: [0, 1], along: [1, 0] };
  if (door.z === room.y + room.h) return { into: [0, -1], along: [1, 0] };
  return { into: [door.x === room.x ? 1 : -1, 0], along: [0, 1] };
}

/**
 * The places in the block at the head of the floor that people go to but that
 * are not rooms of the game: the stairs and the lifts at the front, on every
 * floor, and on the ground floor the rooms of the technicians and the
 * cleaners and the entrance. Each has a way in from the hall.
 */
export const SERVICE = {
  stairs: { name: 'the stairs', door: { x: CORE.stairs.x + 1.5, z: CORE.stairs.y + CORE.stairs.h }, at: { x: CORE.stairs.x + 1.5, z: CORE.stairs.y + 1.2 } },
  technician: { name: 'the technicians’ room', door: SERVICE_ROOMS.technician.door, at: { x: CORE.technician.x + 0.9, z: CORE.technician.y + 1.5 } },
  cleaners: { name: 'the cleaners’ room', door: SERVICE_ROOMS.cleaners.door, at: { x: CORE.cleaners.x + 0.9, z: CORE.cleaners.y + 1.5 } },
  // The ways on and off a floor: the lifts on every floor, and on the ground floor the entrance.
  lifts: { name: 'the lifts', door: { x: CORE.lifts.x + 0.75, z: CORE.lifts.y - 0.4 }, at: { x: CORE.lifts.x + 0.75, z: CORE.lifts.y + 0.3 } },
  entrance: { name: 'the entrance', door: { x: CORE.hall.x, z: FLOOR.corridorY + 0.5 }, at: { x: WEST + 0.3, z: FLOOR.corridorY + 0.5 } },
} as const;
export type ServiceId = keyof typeof SERVICE;
const isService = (id: string): id is ServiceId => id in SERVICE;

/** What a room or a place in the block is called. */
export const placeName = (state: GameState, id: string) => (isService(id) ? SERVICE[id].name : roomName(state, id));

/** The places for people at a piece of furniture of a tier. */
export function spotsAt(type: FurnitureType, tier: number): Spot[] {
  return (FURNITURE_ASSETS[type].spots ?? []).filter((spot) => !spot.tiers || (tier >= spot.tiers[0] && tier <= spot.tiers[1]));
}

/**
 * A point of a piece of furniture, given in tiles from the corner of its
 * unturned footprint, as a point of its footprint after `turn` quarter turns.
 */
export function turned(type: FurnitureType, turn: number, x: number, z: number): [x: number, z: number] {
  const { w, h } = FURNITURE[type];
  const size = footprint(type, turn);
  const px = x - w / 2;
  const pz = z - h / 2;
  const [rx, rz] = ([[px, pz], [pz, -px], [-px, -pz], [-pz, px]] as const)[((turn % 4) + 4) % 4]!;
  return [size.w / 2 + rx, size.h / 2 + rz];
}

/** A spot of a piece of furniture as a place on the floor. */
function spotOn(layout: RoomShape, item: Furniture, index: number) {
  const spot = spotsAt(item.type, item.tier)[index];
  if (!spot) return null;
  const [x, z] = turned(item.type, item.turn, spot.at[0], spot.at[1]);
  return { x: layout.x + item.x + x, z: layout.y + item.y + z, turn: spot.turn + item.turn, activity: spot.activity, ...(spot.up !== undefined && { y: spot.up }) };
}

/** Every place for people at a piece of furniture, as places on the floor. */
const spotsOn = (layout: RoomShape, item: Furniture) => spotsAt(item.type, item.tier).map((_, i) => spotOn(layout, item, i)!);

/** Which desk each employee with a desk sits at, following the order of `employeesWithDesk`: managers at a manager's desk, the others at a workstation. */
export function deskSeats(state: GameState): Map<Id, { roomId: string; item: Furniture }> {
  const items = new Map(state.rooms.flatMap((r) => r.furniture.map((item): [Id, Furniture] => [item.id, item])));
  const seats = new Map<Id, { roomId: string; item: Furniture }>();
  for (const [employeeId, desk] of employeesWithDesk(state)) {
    const item = items.get(desk.itemId);
    if (item) seats.set(employeeId, { roomId: desk.roomId, item });
  }
  return seats;
}

/**
 * Furniture a host presents from, most likely first: the seats at the talk
 * table, the news desk and the sets, then the chairs at the mixing desk, then
 * the loose microphones of older games.
 */
const HOST_FURNITURE: readonly FurnitureType[] = ['talkTable', 'newsDesk', 'set', 'soapSet', 'gameShowSet', 'kidsSet', 'mixingDesk', 'microphone'];

// --- The office's own day ---

/**
 * The office lives by the clock beside the date: a month of the calendar is
 * one day here, from 8 in the morning to 10 at night (OFFICE_DAY). That day is
 * counted in beats of a quarter of an hour; people move when a beat begins.
 * It is only what the player sees; the simulation does not know about it.
 */
export const ROUTINE = {
  beatsPerHour: 4,
  /** How long someone is gone when they leave for the toilets, in beats. */
  awayBeats: 4,
};

/** Beats in the office's day. */
export const DAY_BEATS = (OFFICE_DAY.to - OFFICE_DAY.from) * ROUTINE.beatsPerHour;

const modulo = (n: number, m: number) => ((n % m) + m) % m;

/** The beat the office is in on a game day, `progress` (0–1) into that day. It keeps counting from one month into the next. */
export function beatAt(day: number, progress = 0): number {
  const beat = Math.floor((hourAt(day, progress) - OFFICE_DAY.from) * ROUTINE.beatsPerHour + 1e-6);
  return monthNumber(day) * DAY_BEATS + Math.min(beat, DAY_BEATS - 1);
}

/** The time on the clock when a beat begins, in hours. */
export const hourOfBeat = (beat: number) => OFFICE_DAY.from + modulo(beat, DAY_BEATS) / ROUTINE.beatsPerHour;

/** The beat of a day at which the clock reaches an hour. */
export const beatOfHour = (hour: number) => Math.round((hour - OFFICE_DAY.from) * ROUTINE.beatsPerHour);

/** The slot of the schedule (an index into SLOTS) that is on the air at a beat, or -1 before the first show and after the last. */
export function slotAt(beat: number): number {
  const hour = hourOfBeat(beat);
  return SLOTS.findIndex((slot) => hour >= SLOT_HOURS[slot][0] && hour < SLOT_HOURS[slot][1]);
}

/** The shows made in a studio that are on a channel's schedule in a slot. */
export function showsOnAir(state: GameState, slot: number): Show[] {
  if (slot < 0) return [];
  const scheduled = new Set(state.channels.map((channel) => channel.schedule[slot]));
  return state.shows.filter((show) => show.studioId !== null && scheduled.has(show.id));
}


type Place = Pick<Person, 'x' | 'z' | 'y' | 'turn' | 'activity' | 'roomId' | 'status' | 'floor' | 'show'>;

/** How long someone who leaves a floor is still seen on their way to the lift or the door, in beats. */
const LEAVING_BEATS = 4;
/** How long someone who works on a higher floor is seen crossing the ground floor on their way in or out, in beats. */
const PASSING_BEATS = 2;

/** Every seat in every canteen, in the order of the building: the seats of the meal plan (day.ts). */
function canteenChairs(state: GameState): Place[] {
  return inOrder(state.rooms.filter((r) => r.type === 'canteen')).flatMap((room) =>
    room.furniture.flatMap((item) => spotsOn(room, item)).map((spot): Place => ({ ...spot, roomId: room.roomId, floor: room.floor, status: 'lunch' })),
  );
}

const mealCache = new WeakMap<GameState, Map<number, Meal[]>>();
/** Who eats when on a day; worked out once for a state of the game. */
function mealsOn(state: GameState, day: number, seats: number): Meal[] {
  const days = mealCache.get(state) ?? new Map<number, Meal[]>();
  mealCache.set(state, days);
  if (!days.has(day)) days.set(day, mealPlan(state, day, seats));
  return days.get(day)!;
}

/** When someone slips away for a moment on a day: once, at a moment of their own within their hours. */
function breakOf(id: Id, shift: Shift, day: number): number {
  const room = Math.max(0, shift.to - shift.from - 2);
  return shift.from + 0.75 + Math.floor((chance(id, day, 7) * room) / 0.25) * 0.25;
}

const peopleCache = new WeakMap<GameState, Map<number, Map<Id, Person>>>();

/**
 * Everyone who is in the building, by their id. Without a beat, everyone is
 * at their post: office staff at their desks, hosts in the studio of their
 * first show, support staff in the room they work in today, and whoever has
 * no place waiting in the hall of floor 1.
 *
 * With a beat the office lives through its day, by the clock (see ROUTINE and day.ts):
 * - Everyone is only there during their hours: nine to five for most, around
 *   their shows for hosts and production staff.
 * - A host is in the studio while one of their shows is on the air, and
 *   between shows sits in the canteen on that floor, or waits in the hall.
 * - While a show is on from a studio whose desk stands in a control room next
 *   door, one of the show's production staff works that desk.
 * - Around midday everyone but the hosts eats in a canteen, each at a moment
 *   of their own, as far as there are seats; those who work late eat again
 *   around dinner time.
 * - Everyone who is not on the air leaves for the toilets once a day: to the
 *   toilets on their floor if there are any, or else down the stairs.
 * - People who don't work here come and go with it: a receptionist at the
 *   reception desk, a guest in a radio talk studio from before its show until
 *   after it, and an audience on the audience seating from before a show until after it.
 */
export function peopleAt(state: GameState, beat?: number): Map<Id, Person> {
  const beats = peopleCache.get(state) ?? new Map<number, Map<Id, Person>>();
  peopleCache.set(state, beats);
  const key = beat ?? -1;
  if (!beats.has(key)) {
    // A day's worth of beats is plenty to keep.
    if (beats.size > 2 * DAY_BEATS) beats.clear();
    beats.set(key, findPeople(state, beat));
  }
  return beats.get(key)!;
}

function findPeople(state: GameState, beat?: number): Map<Id, Person> {
  const seats = deskSeats(state);
  const rooms = new Map(state.rooms.map((r) => [r.roomId, r]));
  const routine = beat !== undefined;
  const hour = routine ? hourOfBeat(beat) : 0;
  const day = routine ? Math.floor(beat / DAY_BEATS) : 0;
  const live = routine ? showsOnAir(state, slotAt(beat)) : [];
  /** The control room of each TV studio, by the studio's id (0.16.0). */
  const controlFor = new Map([...tvControlRooms(state)].map(([studioId, room]) => [studioId, room.roomId]));
  /** Who works the desk in a control room, for the shows that are on from the studio next door. */
  const operators = new Map<Id, { show: Show; desk: BorrowedDesk }>();
  const borrowed = borrowedDesks(state);
  for (const show of live) {
    const desk = borrowed.get(show.studioId!);
    const operator = desk && show.staffIds.find((id) => seats.has(id) && !operators.has(id));
    if (desk && operator && ![...operators.values()].some((o) => o.desk.item.id === desk.item.id)) operators.set(operator, { show, desk });
  }
  /** Host spots already taken, per room. */
  const taken = new Map<string, number>();
  /** Support staff already standing in a room. */
  const helpers = new Map<string, number>();
  /** People already waiting in the hall, per floor. */
  const queue = new Map<number, number>();
  /** The seats of the canteens, who eats where right now, and which seats that leaves. */
  const chairs = canteenChairs(state);
  const eating = new Map<Id, Place>();
  const inUse = new Set<number>();
  if (routine) {
    for (const meal of mealsOn(state, day, chairs.length)) {
      if (meal.from > hour || hour >= meal.to) continue;
      eating.set(meal.id, chairs[meal.seat]!);
      inUse.add(meal.seat);
    }
  }
  /** A seat on a floor that nobody eats at now, for a host between shows: from the far end, which the meals fill last. */
  const spare = (onFloor: number): Place | undefined => {
    for (let n = chairs.length - 1; n >= 0; n--) {
      if (inUse.has(n) || chairs[n]!.floor !== onFloor) continue;
      inUse.add(n);
      return chairs[n];
    }
    return undefined;
  };

  const wait = (onFloor: number, status: Status): Place => {
    const n = queue.get(onFloor) ?? 0;
    queue.set(onFloor, n + 1);
    // In the hall between the stairs and the lifts, which is never built on: two rows of three, and then again.
    return { x: WEST + CORE.upper - 0.6 - (Math.floor(n / 2) % 3) * 0.8, z: CORRIDOR_Z + (n % 2 === 0 ? -0.2 : 0.2), turn: 1, activity: 'idle', roomId: null, floor: onFloor, status };
  };
  /** Support staff with nothing to do wait in their own room on the ground floor, side by side. */
  const idle = (where: 'technician' | 'cleaners'): Place => {
    const n = helpers.get(where) ?? 0;
    helpers.set(where, n + 1);
    const { at } = SERVICE[where];
    return { x: at.x + (n % 2) * 0.9, z: at.z + (Math.floor(n / 2) % 2) * 0.8 - 0.4, turn: 2, activity: 'idle', roomId: where, floor: 1, status: 'post' };
  };
  /** The toilets on each floor that can be used, with the places in them. */
  const toilets = new Map<number, { room: RentedRoom; free: Place[] }>();
  for (const room of state.rooms.filter((r) => r.type === 'toilets' && isFurnished(r))) {
    if (toilets.has(room.floor)) continue;
    const free = room.furniture.flatMap((item) => spotsOn(room, item)).map((spot): Place => ({ ...spot, roomId: room.roomId, floor: room.floor, status: 'away' }));
    toilets.set(room.floor, { room, free });
  }
  /** Where someone is while they are away for a moment: on a toilet, waiting at the sinks, or gone down the stairs. */
  const away = (floor: number): Place & { away?: boolean } => {
    const there = toilets.get(floor);
    if (!there) return { ...SERVICE.stairs.at, turn: 0, activity: 'idle', roomId: 'stairs', floor, status: 'away', away: true };
    const { room } = there;
    const middle = largestPart(room);
    return there.free.shift() ?? { x: middle.x + middle.w / 2, z: middle.y + middle.h / 2, turn: 0, activity: 'idle', roomId: room.roomId, floor, status: 'away' };
  };
  const inStudio = (roomId: string, show: Show, status: Status): Place => {
    const layout = rooms.get(roomId);
    // A show whose studio is gone has nowhere to be made: its host waits.
    if (!layout) return { ...wait(1, 'waiting'), show: show.name };
    const spots = HOST_FURNITURE.flatMap((type) => layout.furniture.filter((f) => f.type === type)).flatMap((item) => spotsOn(layout, item));
    const n = taken.get(roomId) ?? 0;
    taken.set(roomId, n + 1);
    const middle = largestPart(layout);
    const spot = spots[n] ?? { x: middle.x + middle.w / 2 + (n - spots.length) * 0.8, z: middle.y + middle.h / 2, turn: 2, activity: 'idle' as const };
    return { ...spot, roomId, floor: layout.floor, status, show: show.name };
  };

  /** Where an employee is, before anyone leaves for a moment. */
  const placeOf = (e: Employee): Place => {
    if (needsDesk(e.role)) {
      const controls = operators.get(e.id);
      const controlRoom = controls && rooms.get(controls.desk.roomId);
      const atDesk = controls && controlRoom && spotOn(controlRoom, controls.desk.item, 0);
      if (controls && atDesk) return { ...atDesk, roomId: controlRoom.roomId, floor: controlRoom.floor, status: 'onAir', show: controls.show.name };
      const meal = eating.get(e.id);
      if (meal) return meal;
      const seat = seats.get(e.id);
      const office = seat && rooms.get(seat.roomId);
      const spot = seat && office && spotOn(office, seat.item, 0);
      if (!office || !spot) return wait(1, 'post');
      return { ...spot, roomId: office.roomId, floor: office.floor, status: 'post' };
    }
    if (SUPPORT_ROLES.includes(e.role)) {
      const meal = eating.get(e.id);
      if (meal) return meal;
      const room = e.location ? rooms.get(e.location) : undefined;
      if (!room) return idle(e.role === 'cleaner' ? 'cleaners' : 'technician');
      const n = helpers.get(room.roomId) ?? 0;
      helpers.set(room.roomId, n + 1);
      // A technician who works the desks of a control room or the master control room (0.16.0) is at them.
      if (e.role === 'technician' && (room.type === 'controlRoom' || room.type === 'masterControl')) {
        const desks = room.furniture.filter((f) => f.type === 'controlDesk' || f.type === 'audioMixer' || f.type === 'mcrDesk');
        const desk = desks[n % Math.max(1, desks.length)];
        const spot = desk && spotOn(room, desk, 0);
        if (spot) return { ...spot, roomId: room.roomId, floor: room.floor, status: room.type === 'controlRoom' && live.some((show) => controlFor.get(show.studioId!) === room.roomId) ? 'onAir' : 'post' };
      }
      // Just inside the door, side by side along the wall it is in.
      const { door } = room;
      const { into, along } = doorway(room);
      const inside = into[0] === 0 ? 0.6 : 0.8;
      const aside = 1.2 + n * 0.8;
      const at = { x: door.x + into[0] * inside + along[0] * aside, z: door.z + into[1] * inside + along[1] * aside };
      return { ...at, turn: 1, activity: e.role === 'cleaner' ? 'clean' : 'work', roomId: room.roomId, floor: room.floor, status: 'post' };
    }
    const own = state.shows.filter((s) => s.hostId === e.id && s.studioId);
    if (!routine) return own[0] ? inStudio(own[0].studioId!, own[0], 'post') : wait(1, 'waiting');
    const now = live.find((s) => s.hostId === e.id);
    if (now) return inStudio(now.studioId!, now, 'onAir');
    if (!own[0]) return wait(1, 'waiting');
    // Between shows: a seat in the canteen on the floor of their studio, or the hall there.
    const home = rooms.get(own[0].studioId!)?.floor ?? 1;
    const seat = spare(home);
    return seat ? { ...seat, status: 'offAir' } : wait(home, 'offAir');
  };

  const people = new Map<Id, Person>();
  for (const e of state.employees) {
    // Whoever is on strike stays away (0.15.0).
    if (onStrike(state, e)) continue;
    const shift = routine ? shiftOf(state, e) : null;
    if (routine && !atWork(shift, travelOf(e, day), hour)) continue;
    const place = placeOf(e);
    const base = { id: e.id, name: e.name, role: e.role };
    // Once a day, at a moment of their own, everyone who is not on the air or at the table is gone for a moment.
    const start = shift ? breakOf(e.id, shift, day) : Infinity;
    const gone = place.status !== 'onAir' && place.status !== 'lunch' && hour >= start && hour < start + ROUTINE.awayBeats / ROUTINE.beatsPerHour;
    people.set(e.id, gone ? { ...base, ...away(place.floor) } : { ...base, ...place });
  }
  if (!routine || atWork(CEO_SHIFT, travelOf(ceoOf(state), day), hour)) people.set(CEO_ID, ceo(state));
  if (routine) for (const visitor of visitors(state, hour, live, taken)) people.set(visitor.id, visitor);
  return people;
}

/** Where someone goes to leave a floor, or comes from to turn up on it: the entrance when it is the street, the lifts when it is another floor. */
const wayOff = (floor: number, outside: boolean) => (floor === 1 && outside ? ('entrance' as const) : ('lifts' as const));

/**
 * Everyone who is on a floor (see `peopleAt`), and with a beat also those who
 * are on their way onto it or off it:
 * - Someone who was not on the floor a moment ago comes from the lifts, or on
 *   the ground floor from the entrance if they come from outside.
 * - Someone who has just left is still seen walking to the lifts or the
 *   entrance, and is out of sight once they get there.
 * - Whoever comes to work on a higher floor, or goes home from one, crosses
 *   the ground floor between the entrance and the lifts.
 */
export function peopleOnFloor(state: GameState, floor: number, beat?: number): Person[] {
  const now = peopleAt(state, beat);
  if (beat === undefined) return [...now.values()].filter((p) => p.floor === floor);
  // Nobody is looked for before the day began: whoever is in early is at their place when it does.
  const sinceDawn = modulo(beat, DAY_BEATS);
  const back = (beats: number) => (beats <= sinceDawn ? peopleAt(state, beat - beats) : null);
  const at = (where: 'entrance' | 'lifts') => ({ ...SERVICE[where].at, roomId: where });
  const hidden = { y: 0, turn: 0, activity: 'idle' as const, floor, show: undefined, away: true };
  const people: Person[] = [];
  const seen = new Set<Id>();
  /** Those who set out for the lifts in this very beat: they queue for them. */
  const setOut = new Set<Id>();

  const before = back(1);
  for (const person of now.values()) {
    const was = before ? before.get(person.id) : person;
    if (person.floor === floor) {
      people.push(was?.floor === floor ? person : { ...person, from: at(wayOff(floor, !was)) });
      seen.add(person.id);
    } else if (floor === 1 && Array.from({ length: PASSING_BEATS }, (_, k) => back(k + 1)).some((then) => then && !then.has(person.id))) {
      // In from the street a moment ago, and up in the lift.
      const fresh = Boolean(before) && !before!.has(person.id);
      people.push({ ...person, ...at('lifts'), ...hidden, status: 'passing', from: at('entrance'), ...(fresh && { fresh }) });
      seen.add(person.id);
      if (fresh) setOut.add(person.id);
    }
  }
  // Those who were here a moment ago: on their way to the lifts or out of the door.
  for (let k = 1; k <= LEAVING_BEATS; k++) {
    for (const was of back(k)?.values() ?? []) {
      if (seen.has(was.id)) continue;
      const here = now.get(was.id);
      if (was.floor === floor) {
        people.push({ ...was, ...at(wayOff(floor, !here)), ...hidden, status: 'leaving', ...(k === 1 && { fresh: true }) });
        seen.add(was.id);
        if (k === 1) setOut.add(was.id);
      } else if (floor === 1 && !here && k <= PASSING_BEATS) {
        // Down in the lift and out into the street.
        people.push({ ...was, ...at('entrance'), ...hidden, status: 'passing', from: at('lifts'), ...(k === 1 && { fresh: true }) });
        seen.add(was.id);
      }
    }
  }
  // Whoever sets out for the lifts together lines up for them (0.20.0).
  const going = people.filter((p) => p.roomId === 'lifts' && p.away && setOut.has(p.id));
  const places = liftQueue(going.map((p) => p.id));
  return people.map((p) => (places.has(p.id) ? { ...p, queue: places.get(p.id)! } : p));
}

/** The line for the lifts (0.20.0): how many get into a lift at once, and how often a lift goes, in seconds of game time. */
export const LIFT_QUEUE = { perLift: 3, every: 2, gap: 0.5 };

/**
 * The line in front of the two lift doors for those who go into the lifts in
 * the same beat, in the order of their ids: they take turns at the two doors,
 * a row of them behind each other. The first row of each lift (`perLift`
 * people) goes in at once; the rest wait for the next departure, a lift going
 * every `every` seconds.
 */
export function liftQueue(ids: Id[]): Map<Id, { x: number; z: number; wait: number }> {
  const doors = [CORE.lifts.x + 0.75, CORE.lifts.x + 2.25];
  const line = SERVICE.lifts.door.z - 0.3;
  const places = new Map<Id, { x: number; z: number; wait: number }>();
  [...ids].sort().forEach((id, k) => {
    // The line is five rows long, up to the corridor; a longer crowd stands on top of each other rather than in the corridor.
    const row = Math.floor(k / 2) % 5;
    places.set(id, { x: doors[k % 2]!, z: line - LIFT_QUEUE.gap * row, wait: Math.floor(k / (2 * LIFT_QUEUE.perLift)) * LIFT_QUEUE.every });
  });
  return places;
}

/**
 * The player, as the CEO: at the CEO's desk in their own office, or else
 * standing in the reception.
 */
function ceo(state: GameState): Person {
  const who = { id: CEO_ID, name: state.playerName, role: 'ceo' as const, status: 'post' as const };
  for (const room of state.rooms.filter((r) => r.type === 'ceoOffice')) {
    const desk = room.furniture.find((f) => f.type === 'ceoDesk');
    const seat = desk && spotOn(room, desk, 0);
    if (seat) return { ...who, ...seat, roomId: room.roomId, floor: room.floor };
  }
  const hall = findRoom(state, RECEPTION.id)!;
  return { ...who, x: hall.x + hall.w - 1, z: hall.y + hall.h / 2 + 1.4, turn: 3, activity: 'idle', roomId: hall.roomId, floor: hall.floor };
}

/** People who play in a game show while it is on. */
const CONTESTANTS = 2;


/** The blocks of audience seating in the studios, with how many people each brings: for the journeys of the day (day.ts). */
export function audienceBlocks(state: GameState): { studioId: string; seats: number }[] {
  return state.rooms.flatMap((room) => room.furniture.filter((f) => f.type === 'audienceSeating').map(() => ({ studioId: room.roomId, seats: AUDIENCE_PER_SEATING })));
}

/** The places for the host and a guest of a radio talk studio, most likely first. */
const guestSeats = (room: RentedRoom) => HOST_FURNITURE.flatMap((type) => room.furniture.filter((f) => f.type === type)).flatMap((item) => spotsOn(room, item));

/** The radio talk studios that have a seat for a guest as well as the host: for the journeys of the day (day.ts) and for `visitors`. */
export function talkGuests(state: GameState): string[] {
  return state.rooms.filter((room) => room.type === 'radioTalkStudio' && guestSeats(room).length > 1).map((room) => room.roomId);
}

/**
 * The people who don't work here: a receptionist at the reception desk, a
 * guest for every show of a radio talk studio from before it until after it, the cast of a
 * sitcom or reality show that is on, two contestants at a game show that is on, and an audience
 * on every block of audience seating in a studio, from before a show there
 * until after it. `taken` is how many host places are in use per studio, so a
 * guest takes the next one.
 */
function visitors(state: GameState, hour: number, live: Show[], taken: Map<string, number>): Person[] {
  const guests: Person[] = [];
  const visitor = (id: string, name: string, place: Place): Person => ({ id, name, role: 'visitor', ...place });

  const reception = findRoom(state, RECEPTION.id);
  const desk = reception?.furniture.find((f) => f.type === 'receptionDesk');
  const seat = reception && desk && spotOn(reception, desk, 0);
  if (reception && seat) guests.push(visitor('visitor-reception', receptionistName(state.seed), { ...seat, roomId: reception.roomId, floor: reception.floor, status: 'visiting' }));

  // The guest comes by taxi before the show and goes home by taxi after it (0.20.0): they are in the studio all that time.
  for (const studioId of talkGuests(state)) {
    const room = findRoom(state, studioId)!;
    const stay = guestStays(state, studioId).find((s) => hour >= s.from && hour < s.to);
    if (!stay) continue;
    // The guest takes the next free seat at the talk table or the mixing desk: the one after the host's, while the show is not on.
    const seats = guestSeats(room);
    const free = seats[live.some((s) => s.studioId === studioId) ? taken.get(studioId) ?? 0 : 1];
    if (free) guests.push(visitor(guestId(studioId), guestName(stay.show.id), { ...free, roomId: studioId, floor: room.floor, status: 'visiting', show: stay.show.name }));
  }

  // The cast of a show that has no host, on its set while it is on, and one of them in the confession booth (0.14.0).
  for (const show of live.filter((s) => !hasHost(getGenre(s.genre)))) {
    const room = findRoom(state, show.studioId!);
    const set = room?.furniture.find((f) => f.type === getGenre(show.genre).set);
    if (!room || !set) continue;
    const booth = room.furniture.find((f) => f.type === 'confessionBooth');
    const places = [...spotsOn(room, set), ...(booth ? spotsOn(room, booth) : [])];
    places.forEach((place, i) => {
      guests.push(visitor(`visitor-cast-${room.roomId}-${i}`, castName(show.id, i), { ...place, roomId: room.roomId, floor: room.floor, status: 'visiting', show: show.name }));
    });
  }

  // Two contestants at the game show, behind the teams' desks, while it is on (0.13.0).
  for (const show of live.filter((s) => s.genre === 'gameShow')) {
    const room = findRoom(state, show.studioId!);
    const set = room?.furniture.find((f) => f.type === 'gameShowSet');
    if (!room || !set) continue;
    const places = spotsOn(room, set).slice(1, 1 + CONTESTANTS);
    places.forEach((place, i) => {
      guests.push(visitor(`visitor-contestant-${room.roomId}-${i}`, contestantName(show.id, i), { ...place, roomId: room.roomId, floor: room.floor, status: 'visiting', show: show.name }));
    });
  }

  for (const room of state.rooms) {
    const blocks = room.furniture.filter((f) => f.type === 'audienceSeating');
    if (blocks.length === 0) continue;
    // The show they have come for: the one that is on, about to begin or just over.
    const show = state.shows
      .filter((s) => s.studioId === room.roomId)
      .find((s) => airtimes(state, s).some(([from, to]) => hour >= from - DAY.audienceBefore && hour < to + DAY.audienceAfter));
    if (!show) continue;
    // Seats are counted across the blocks, as for the bus (day.ts), so a second block brings people of its own.
    blocks.forEach((block, b) => {
      spotsOn(room, block).slice(0, AUDIENCE_PER_SEATING).forEach((spot, i) => {
        guests.push(visitor(`visitor-audience-${block.id}-${i}`, audienceName(show.id, b * AUDIENCE_PER_SEATING + i), { ...spot, roomId: room.roomId, floor: room.floor, status: 'visiting', show: show.name }));
      });
    });
  }
  return guests;
}

/** The rooms on a floor, with the reception on the ground floor. */
export const roomsOnFloor = (state: GameState, floor: number): RoomLayout[] => floorPlan(state).filter((r) => r.floor === floor);

/**
 * The room or the place in the block at the head of the floor that a point is
 * in, or null in the corridor and the hall: where someone who is on their way
 * is right now, so that they go on from there.
 */
export function roomAt(state: GameState, floor: number, x: number, z: number): string | null {
  const inside = (r: { x: number; y: number; w: number; h: number }) => x >= r.x && x <= r.x + r.w && z >= r.y && z <= r.y + r.h;
  const room = floorPlan(state).find((r) => r.floor === floor && partsOf(r).some(inside));
  if (room) return room.id;
  for (const id of ['stairs', 'lifts'] as const) if (inside(CORE[id])) return id;
  if (floor > 1) return null;
  for (const id of ['technician', 'cleaners'] as const) if (inside(CORE[id])) return id;
  return x < CORE.hall.x && z >= CORE.hall.y && z <= CORE.hall.y + CORE.hall.h ? 'entrance' : null;
}

/** In words, what someone is doing where they are: for the person panel. */
export function whereabouts(state: GameState, person: Person): string {
  const room = person.roomId ? placeName(state, person.roomId) : null;
  if (person.status === 'passing') return person.roomId === 'lifts' ? 'On the way up in the lift.' : 'On the way out.';
  if (person.status === 'leaving') return person.roomId === 'entrance' ? 'On the way out.' : 'On the way to the lift.';
  if (person.role === 'visitor' && person.id.startsWith('visitor-cast-')) return `On the air in ${room}, in the cast of “${person.show}”.`;
  if (person.role === 'visitor' && person.id.startsWith('visitor-audience-')) return `In the audience of “${person.show}”.`;
  if (person.role === 'visitor' && person.id.startsWith('visitor-guest-')) return `A guest on “${person.show}”, in ${room}.`;
  if (person.role === 'visitor' && person.id.startsWith('visitor-contestant-')) return `A contestant on “${person.show}”, in ${room}.`;
  if (person.role === 'visitor') return person.show ? `Here for “${person.show}”.` : 'The receptionist, at the reception desk.';
  if (person.role === 'ceo') return person.activity === 'sit' ? 'At your desk in your own office.' : 'In the reception. Build a CEO’s office and put a CEO’s desk in it: that is where you would work.';
  if (person.status === 'away') return person.away ? 'Away for a moment.' : `In ${room}, for a moment.`;
  if (person.status === 'lunch') return `Having lunch in ${room}.`;
  if (person.status === 'onAir') return person.role === 'host' ? `On the air in ${room}, presenting “${person.show}”.` : `At the controls in ${room} for “${person.show}”.`;
  if (person.status === 'offAir') return room ? `Between shows, in ${room}.` : 'Between shows, waiting in the hall: there is no free seat in a canteen on this floor.';
  if (needsDesk(person.role)) {
    if (room) return `At their desk in ${room}.`;
    if (isManager(person.role)) return 'Waiting in the hall: there is no manager’s desk for them in a management office.';
    if (person.role === 'writer') return 'Waiting in the hall: there is no writer’s place for them in a writers’ room with a story board.';
    if (person.role === 'cook') return 'Waiting in the hall: there is no stove for them in a canteen that has all it needs.';
    const piece = deskFor(person.role);
    if (piece === 'workstation') return 'Waiting in the hall: there is no working workstation for them.';
    const kind = inText(ROOM_TYPE_NAMES[deskRoomFor(person.role)]);
    return `Waiting in the hall: there is no working ${FURNITURE[piece].name.toLowerCase()} for them in ${/^[aeiou]/i.test(kind) ? 'an' : 'a'} ${kind}.`;
  }
  if (SUPPORT_ROLES.includes(person.role)) {
    if (!room || isService(person.roomId!)) return `Nothing to do today: waiting in ${room ?? 'the hall'}.`;
    const job = person.role === 'cleaner' ? 'Cleaning' : person.role === 'technician' ? 'Repairing equipment in' : 'Fixing the building in';
    return `${job} ${room}.`;
  }
  const shows = state.shows.filter((s) => s.hostId === person.id).map((s) => `“${s.name}”`);
  if (!room) return shows.length > 0 ? 'Waiting in the hall: their show has no studio.' : 'Waiting in the hall: no show to present.';
  return `In ${room}, presenting ${shows.join(' and ')}.`;
}

const TRAVEL_WORDS: Record<Travel, string> = { walk: 'on foot', bus: 'by bus', taxi: 'by taxi' };

/**
 * In words, what someone who works here is doing at a beat, wherever they
 * are: in the office (see `whereabouts`), or not in yet, or gone home.
 */
export function whereaboutsOf(state: GameState, id: Id, beat: number): string {
  const person = peopleAt(state, beat).get(id);
  if (person) return whereabouts(state, person);
  const employee = state.employees.find((e) => e.id === id);
  const you = id === CEO_ID;
  if (!employee && !you) return 'Not in the office.';
  if (employee && onStrike(state, employee)) return `On strike until ${formatDate(state.unrest[teamOf(employee.role)!]!.strikeUntil!)}: at home.`;
  const day = Math.floor(beat / DAY_BEATS);
  const shift = employee ? shiftOf(state, employee) : CEO_SHIFT;
  if (!shift) return 'At home: no show of theirs is on the air today.';
  const travel = travelOf(employee ?? ceoOf(state), day);
  const hours = `${formatHour(shift.from)} to ${formatHour(shift.to)}`;
  if (hourOfBeat(beat) >= shift.to) return `Gone home ${TRAVEL_WORDS[travel]}. ${you ? 'Your' : 'Their'} hours today were ${hours}.`;
  const door = doorTime(shift, travel) ?? shift.from;
  return `Not in yet: coming ${TRAVEL_WORDS[travel]}, in at ${formatHour(door)}. ${you ? 'Your' : 'Their'} hours today are ${hours}.`;
}

