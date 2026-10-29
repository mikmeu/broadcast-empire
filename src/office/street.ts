// The people in the street: those who come to the office and go home (the
// journeys of day.ts), and people who are just out for a walk.
//
// The journeys are tied to the traffic (traffic.ts): someone who comes by
// bus gets out when the bus stands at the stop, someone who takes a taxi
// when theirs stands at the door, and whoever goes home that way waits for
// it. So the people who are on their way have a state, kept by the view and
// never saved, like the traffic. The strollers are simpler: where each one
// is follows from the time alone.

import { BUILDINGS, type Building } from '../config/office';
import type { Id } from '../sim/state';
import { onLot, walkFrom } from './parking';
import { SITES } from './sites';
import { DAY, type Trip, type VanTrip } from './day';
import { OFFICE_DAY } from '../config/world';
import { CAPITAL, type Layout } from './townLayout';
import { HOUR_SECONDS, busAtStop, carSlack, crossingAt, hasLights, askToCross, leaveLot, lotCarFor, mayStepOut, orderCar, orderTaxi, parkCar, parkingHours, releaseTaxi, roadsOf, stepOff, stepOut, taxiFor, type Edge, type Roads, type Traffic } from './traffic';

/** Tiles per second: people in the street walk a little faster than in the office. */
const PACE = 3.4;

/** The places people go to on the way to the entrance. */
export interface Places {
  /** Just outside the entrance. */
  door: [number, number];
  /** On the pavement or the ground in front of the entrance. */
  gate: [number, number];
  /** Where the way from the bus stop turns towards the entrance. */
  corner: [number, number];
  stop: [number, number];
  taxi: [number, number];
  /** Where people on foot come from and go to: out of sight, behind the office. */
  away: [number, number];
  /** The door on the courtyard side, where the people of the lot go in, or null in a town with no courtyard. */
  court: [number, number] | null;
}

const placesBy = new Map<Roads, Places>();

/** The places people walk to in a town, from where its layout has its stops and its entrance. */
export function placesOf(roads: Roads): Places {
  let places = placesBy.get(roads);
  if (!places) {
    const { places: at } = roads.layout;
    const pair = (p: { x: number; z: number }): [number, number] => [p.x, p.z];
    places = {
      door: pair(at.door),
      gate: pair(at.gate),
      corner: pair(at.corner(roads.busStop.wait)),
      stop: pair(at.stop(roads.busStop.wait)),
      taxi: [roads.taxiStand.wait.x, roads.taxiStand.wait.z],
      away: pair(at.away),
      court: at.court ? pair(at.court) : null,
    };
    placesBy.set(roads, places);
  }
  return places;
}

const lengthOf = (path: readonly [number, number][]) => path.slice(1).reduce((sum, point, i) => sum + Math.hypot(point[0] - path[i]![0], point[1] - path[i]![1]), 0);

/** The ways to and from the entrance. */
export function routesOf(roads: Roads) {
  const p = placesOf(roads);
  return { bus: [p.stop, p.corner, p.gate, p.door], taxi: [p.taxi, p.gate, p.door], walk: [p.away, p.gate, p.door] } as const;
}

/** How long each way takes, in hours on the clock. */
export function walkHoursOf(roads: Roads) {
  const routes = routesOf(roads);
  return { bus: lengthOf(routes.bus) / PACE / HOUR_SECONDS, taxi: lengthOf(routes.taxi) / PACE / HOUR_SECONDS, walk: lengthOf(routes.walk) / PACE / HOUR_SECONDS };
}

/** How long before or after its time a bus or taxi is still the one someone means, in hours; after that they do without. */
const TOLERANCE = 0.35;

/** Someone on their way to or from the office. */
export interface Walker {
  /** The journey they are on. */
  key: string;
  /** Who they are: an employee's id, the player's, or a made-up one for someone in an audience. */
  id: Id;
  name: string;
  x: number;
  z: number;
  /** The way they face, as an angle around the vertical. */
  angle: number;
  moving: boolean;
  /** Where they still have to go. */
  path: [number, number][];
  /** What they wait for once they are there: the bus, or the taxi of their journey. On the way out of the lot's bay (0.20.0): the car, which drives off once they are in it. */
  wait: 'bus' | 'taxi' | 'car' | null;
  /** For someone from the car park: the car they drive, by its journey. */
  car?: string;
  /** For someone who crosses the street between the car park and the office (0.20.0): where, and how far they are. */
  gate?: Gate;
  /** Seconds before they set off, so that a busload does not walk as one. */
  delay: number;
  speed: number;
}

/**
 * A street crossed on the way, at a crossing with lights: the walker waits at
 * the kerb for a steady green, as the people out for a walk do. `to` is the
 * point of their path on the other side.
 */
export interface Gate {
  id: number;
  edge: Edge;
  to: [number, number];
  state: 'ahead' | 'wait' | 'cross' | 'done';
}

export interface Street {
  walkers: Walker[];
  /** The journeys that have begun, or were missed. */
  begun: Set<string>;
  /** The strollers who cross a street at a crossing with lights (0.20.0), as they are now. */
  crossers: Crosser[];
}

/** The street of a town whose strollers are given: those of them who cross a street are kept track of. */
export const createStreet = (walking: readonly Stroller[] = []): Street => ({
  walkers: [],
  begun: new Set(),
  crossers: walking.flatMap((stroller, n) => (stroller.across ? [crosser(stroller, n)] : [])),
});

/** A number from 0 to 1 for a journey, always the same for the same one. */
function spread(key: string, salt: number): number {
  let h = salt * 668265263;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 1274126177);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

function walker(trip: Trip, route: readonly [number, number][], wait: Walker['wait'], queue: number): Walker {
  // Everyone keeps a little to their own side of the line, and a busload sets off one after the other.
  const aside = (spread(trip.key, 1) - 0.5) * 0.3;
  const path = route.slice(1).map(([x, z], i, rest): [number, number] => (i === rest.length - 1 ? [x, z] : [x + aside, z + aside]));
  const [x, z] = route[0]!;
  return { key: trip.key, id: trip.id, name: trip.name, x: x + aside, z: z + aside, angle: 0, moving: false, path, wait, delay: queue * 0.3, speed: PACE * (0.9 + 0.2 * spread(trip.key, 2)) };
}

/**
 * The way from a bay of the car park to the entrance (0.20.0): over the lot
 * to the corner, over the street at the crossing with lights, and along the
 * office's own pavement; in a courtyard, across the green to its door. `to` is
 * where in the list the far side of the street is.
 */
export function carRoute(traffic: Traffic, bay: number): { points: [number, number][]; to: number; id: number | null } {
  const { roads } = traffic;
  const lot = traffic.lot.ground;
  const places = placesOf(roads);
  const inLot = walkFrom(lot, lot.bays[bay]!);
  // A lot on a street along x (#218) is on the office's side of it: no street is crossed, and the way goes on over the company's ground to the gate.
  if (lot.along === 'x') {
    const last = inLot[inLot.length - 1]!;
    return { points: [...inLot, [places.gate[0], last[1]], places.gate, places.door], to: inLot.length, id: null };
  }
  const crossing = roads.layout.lotCrossing(traffic.building);
  // Where the lot is in the courtyard of the U there is no street to cross: the way goes across the green to the door on the courtyard side.
  if (!crossing && places.court) return { points: [...inLot, places.court], to: inLot.length, id: null };
  if (!crossing) return { points: [...inLot, [places.gate[0], lot.walkZ], places.gate, places.door], to: inLot.length, id: null };
  const far: [number, number] = [lot.street - roads.layout.streetWidth / 2 - 0.22, lot.walkZ];
  return { points: [...inLot, far, places.corner, places.gate, places.door], to: inLot.length, id: crossingAt(roads, crossing.x, crossing.z) };
}

/** How long the walk from a bay to the entrance takes, in hours on the clock, with a moment's wait for the lights. */
const LIGHTS_WAIT = 4;
export const carWalkHours = (traffic: Traffic, bay: number) => {
  const route = carRoute(traffic, bay);
  return (lengthOf(route.points) / PACE + (route.id === null ? 0 : LIGHTS_WAIT)) / HOUR_SECONDS;
};

/** Someone who walks between a bay and the entrance, in either direction. */
function carWalker(trip: Trip, traffic: Traffic, forward: boolean): Walker {
  const { points, to, id } = carRoute(traffic, trip.car!.bay);
  const route = forward ? points : [...points].reverse();
  const w = walker(trip, route, forward ? null : 'car', 0);
  w.car = trip.car!.key;
  if (id !== null) w.gate = { id, edge: '-z', to: w.path[(forward ? to : points.length - to) - 1]!, state: 'ahead' };
  return w;
}

/**
 * Where someone who waits for the bus or a taxi stands: along the pavement, one beside the other. In a grid of
 * blocks the bus stop's pavement runs along x and the taxi stand's along z; where both are on one street, along z.
 */
const queued = (roads: Roads, travel: 'bus' | 'taxi', place: [number, number], n: number): [number, number] =>
  travel === 'bus' && roads.layout.stops.bus.along === 'x' ? [place[0] + (n % 6) * 0.45 - 0.9, place[1] - Math.floor(n / 6) * 0.3] : [place[0] + (travel === 'bus' ? Math.floor(n / 6) * 0.3 : 0), place[1] + (n % 6) * 0.45 - (travel === 'bus' ? 0.9 : 0)];

/**
 * Moves the street on by `seconds` of game time, to `hours` on the office
 * clock (hours that keep counting: `dawn` is the hour the day began at).
 * `trips` are the journeys of that day.
 */
export function stepStreet(street: Street, traffic: Traffic, trips: readonly Trip[], dawn: number, hours: number, seconds: number): void {
  const bus = busAtStop(traffic);
  const ROUTES = routesOf(traffic.roads);
  const WALK_HOURS = walkHoursOf(traffic.roads);
  let alighting = 0;
  // A car stays in its bay at the most until the day is over.
  const until = dawn + OFFICE_DAY.to - OFFICE_DAY.from;
  for (const trip of trips) {
    if (street.begun.has(trip.key)) continue;
    // When they are at the door, in hours that keep counting.
    const at = dawn + trip.at - 8;
    const { car } = trip;
    if (trip.way === 'in') {
      if (car) {
        // The car is due at the lot's drive-in early enough to park and for the walk to the door.
        const walk = carWalkHours(traffic, car.bay);
        const slack = carSlack(traffic);
        const due = at - walk - parkingHours(traffic) - slack;
        orderCar(traffic, car.key, car.bay, due, until);
        const parked = lotCarFor(traffic, car.key)?.state === 'parked';
        if (!parked && hours < due + slack + TOLERANCE) continue;
        // A car that came early lets its owner out when they have to set off, not before.
        if (slack > 0 && hours < at - walk - 0.05) continue;
        if (hours <= at + TOLERANCE) street.walkers.push(carWalker(trip, traffic, true));
        else parkCar(traffic, car.key, car.bay, until);
      } else if (trip.travel === 'walk') {
        if (hours < at - WALK_HOURS.walk) continue;
        // Too late to be seen coming: they are in already.
        if (hours <= at) street.walkers.push(walker(trip, ROUTES.walk, null, 0));
      } else if (trip.travel === 'bus') {
        // The bus that gets them to the door in time; they get out when it stands at the stop.
        const due = Math.floor(at - DAY.busWalk - 0.75 + 1e-6) + 0.75;
        if (hours < due - TOLERANCE || (!bus && hours < due + TOLERANCE)) continue;
        if (hours <= at + TOLERANCE) street.walkers.push(walker(trip, ROUTES.bus, null, alighting++));
      } else {
        const due = at - WALK_HOURS.taxi;
        orderTaxi(traffic, trip.key, due);
        const here = taxiFor(traffic, trip.key);
        if (!here && hours < due + TOLERANCE) continue;
        if (here) releaseTaxi(traffic, trip.key);
        if (hours <= at + TOLERANCE) street.walkers.push(walker(trip, ROUTES.taxi, null, 0));
      }
    } else {
      // A taxi home is ordered ahead, so that it is there when they come out.
      if (trip.travel === 'taxi') orderTaxi(traffic, trip.key, at + WALK_HOURS.taxi);
      // Whoever has no way in to be seen (they were in before the day began) has their car in its bay all the same.
      if (car && !trips.some((t) => t.way === 'in' && t.car?.key === car.key)) parkCar(traffic, car.key, car.bay, until);
      if (hours < at) continue;
      if (car) {
        if (hours <= at + TOLERANCE) street.walkers.push(carWalker(trip, traffic, false));
        else leaveLot(traffic, car.key);
      } else if (trip.travel !== 'car' && hours <= at + TOLERANCE) {
        const route = [...ROUTES[trip.travel]].reverse();
        const waiting = street.walkers.filter((w) => w.wait === trip.travel).length;
        if (trip.travel !== 'walk') route[route.length - 1] = queued(traffic.roads, trip.travel, route[route.length - 1]!, waiting);
        street.walkers.push(walker(trip, route, trip.travel === 'walk' ? null : trip.travel, 0));
      }
    }
    street.begun.add(trip.key);
  }

  for (const w of street.walkers) {
    if (w.delay > 0) {
      w.delay -= seconds;
      continue;
    }
    stepWalker(w, traffic, seconds);
  }
  for (const c of street.crossers) stepCrosser(c, traffic, seconds);
  // Whoever has arrived is gone: through the door, round the corner, onto the bus, into their taxi or their car.
  street.walkers = street.walkers.filter((w) => {
    if (w.path.length > 0 || w.delay > 0) return true;
    if (w.wait === 'car') {
      leaveLot(traffic, w.car!);
      return false;
    }
    if (w.wait === 'bus') return !bus;
    if (w.wait === 'taxi') {
      if (!taxiFor(traffic, w.key)) return hours < tripTime(trips, w.key, dawn) + 1;
      releaseTaxi(traffic, w.key);
    }
    return false;
  });
}

/**
 * The news vans of the company (0.20.0, #20) on a day: each stands in its bay of the van zone; a crewed one
 * drives out before its shows and is back after them (`vanTripsOf` in day.ts). Like a car, one that is seen only
 * after its time is where it should be: out, or home.
 */
export function stepVans(street: Street, traffic: Traffic, vans: readonly VanTrip[], dawn: number, hours: number): void {
  const until = dawn + OFFICE_DAY.to - OFFICE_DAY.from;
  const news = { kind: 'van', news: true } as const;
  for (const trip of vans) {
    const out = trip.out === null ? null : dawn + trip.out - OFFICE_DAY.from;
    const back = trip.back === null ? null : dawn + trip.back - OFFICE_DAY.from;
    if (out === null || hours < out) {
      parkCar(traffic, trip.key, trip.bay, until, news);
      continue;
    }
    if (!street.begun.has(trip.key)) {
      if (hours <= out + TOLERANCE) {
        parkCar(traffic, trip.key, trip.bay, until, news);
        leaveLot(traffic, trip.key);
      }
      street.begun.add(trip.key);
    }
    const home = `${trip.key}:back`;
    if (back === null || street.begun.has(home)) continue;
    if (hours > back + TOLERANCE && !traffic.lot.orders.some((order) => order.key === home)) {
      parkCar(traffic, home, trip.bay, until, news);
      street.begun.add(home);
    } else {
      orderCar(traffic, home, trip.bay, back - parkingHours(traffic), until, news);
    }
  }
}

/**
 * Moves someone on their way. Where the way crosses a street (a `gate`) they
 * stop at the kerb, ask for the lights and step out onto the strip when they
 * may, as the people out for a walk do (`stepCrosser`).
 */
function stepWalker(w: Walker, traffic: Traffic, seconds: number): void {
  const { gate } = w;
  if (gate?.state === 'ahead') {
    // Up to the kerb, and no further.
    const at = w.path.indexOf(gate.to);
    if (at < 0) gate.state = 'done';
    else {
      const rest = w.path.splice(at);
      w.moving = w.path.length > 0;
      follow(w, w.speed * seconds);
      w.path.push(...rest);
      if (w.path[0] === gate.to) gate.state = 'wait';
      return;
    }
  }
  if (gate?.state === 'wait') {
    askToCross(traffic, gate.id, gate.edge);
    if (!mayStepOut(traffic, gate.id, gate.edge)) {
      w.moving = false;
      return;
    }
    stepOut(traffic, gate.id, gate.edge);
    gate.state = 'cross';
  }
  w.moving = w.path.length > 0;
  follow(w, w.speed * seconds);
  if (gate?.state === 'cross' && w.path[0] !== gate.to) {
    stepOff(traffic, gate.id, gate.edge);
    gate.state = 'done';
  }
}

/** Walks someone along their path for a distance in tiles. */
function follow(w: { x: number; z: number; angle: number; path: [number, number][] }, distance: number): void {
  let left = distance;
  while (left > 0 && w.path.length > 0) {
    const [x, z] = w.path[0]!;
    const to = Math.hypot(x - w.x, z - w.z);
    if (to <= left) {
      [w.x, w.z] = [x, z];
      left -= to;
      w.path.shift();
    } else {
      w.angle = Math.atan2(x - w.x, z - w.z);
      w.x += ((x - w.x) / to) * left;
      w.z += ((z - w.z) / to) * left;
      left = 0;
    }
  }
}

/** When a journey begins or ends at the door, in hours that keep counting; long ago for one that is not of today. */
const tripTime = (trips: readonly Trip[], key: string, dawn: number) => dawn + (trips.find((trip) => trip.key === key)?.at ?? -100) - 8;

// --- People out for a walk ---

/** Someone who walks round a block of the town, on its pavement. */
export interface Stroller {
  /** Which of the made-up people they are: decides what they look like. */
  name: string;
  /** The line they walk: a rectangle, by its middle and half its width and depth. */
  x: number;
  z: number;
  w: number;
  d: number;
  /** +1 walks it clockwise seen from above, -1 the other way. */
  direction: 1 | -1;
  /** Where on the line they start, 0–1, and how fast they walk, in tiles per second. */
  start: number;
  speed: number;
  /** A stroller who does not only walk round this block (0.20.0) crosses to the next one at a crossing with lights, round it and back. */
  across?: Across;
}

/** The way over a street from one block to its neighbour, at a crossing. */
export interface Across {
  /** The crossing, and the side of it where the strip lies (traffic.ts). */
  id: number;
  edge: Edge;
  /** Where the strip begins, on the line of the stroller's own block, and where it ends, on that of the other one. */
  gate: [number, number];
  far: [number, number];
  /** The other block, as a stroller's line is given: the middle and half the width and depth. */
  block: { x: number; z: number; w: number; d: number };
}

function roll(seed: number, n: number, salt: number): number {
  let h = (n * 374761393 + salt * 668265263 + Math.imul(seed | 0, 1597334677)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * The people out for a walk in a game's town: each goes round one block, on
 * the pavement along its kerb. Those who don't walk round the office itself
 * cross a street too, where a crossing with lights is beside their block (see
 * `Crosser`), and so walk round two blocks. Most walk in front of the office
 * and beside it, where they can be seen.
 */
export function strollers(seed: number, count: number = SITES.capital.strollers, building: Building = BUILDINGS.standard, layout: Layout = CAPITAL): Stroller[] {
  // The blocks in view: the office's own, the row in front of it and the ones beside it (or, from a drawing, the big blocks between the streets).
  const { own, others } = layout.strolling(building);
  const blocks: { x: number; z: number; w: number; d: number }[] = [own, ...others];
  const roads = roadsOf(layout);
  return Array.from({ length: count }, (_, n): Stroller => {
    // Every third one walks round the office itself.
    const itself = n % 3 === 0;
    // (A town laid out by its roads has no other block: all walk round the office.)
    const block = itself || blocks.length === 1 ? blocks[0]! : blocks[1 + Math.floor(roll(seed, n, 1) * (blocks.length - 1))]!;
    const stroller: Stroller = {
      name: `Passer-by ${Math.floor(roll(seed, n, 2) * 1000)}`,
      x: block.x,
      z: block.z,
      w: block.w / 2 - STROLL_INSET,
      d: block.d / 2 - STROLL_INSET,
      direction: roll(seed, n, 3) < 0.5 ? 1 : -1,
      start: roll(seed, n, 4),
      speed: 1 + roll(seed, n, 5) * 0.8,
    };
    // Those who don't walk round the office itself cross a street, where there is a crossing with lights beside their block.
    const across = itself || blocks.length === 1 ? undefined : crossingFrom(stroller, building, roll(seed, n, 6), roads);
    return across ? { ...stroller, across } : stroller;
  });
}

/**
 * Where a stroller of a block can cross to a neighbouring block: at a corner
 * of it that is a crossing with lights, over the street to the block beside it
 * or the one in front of it (never to the office's own block, nor to the one
 * the railway runs along). `pick` chooses among them.
 */
function crossingFrom(stroller: Stroller, building: Building, pick: number, roads: Roads): Across | undefined {
  const { layout } = roads;
  const half = layout.streetWidth / 2;
  const options: Across[] = [];
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    // The crossing is at the corner of the block from kerb to kerb, half a street further out.
    const [cx, cz] = [stroller.x + sx * (stroller.w + STROLL_INSET + half), stroller.z + sz * (stroller.d + STROLL_INSET + half)];
    const id = crossingAt(roads, cx, cz);
    if (id === null) continue;
    // Over the street that runs along z to the block beside this one, or over the one along x to the block in front.
    for (const bx of [sx, 0] as const) {
      // The block on the far side of the street, found by a point just over it and just inside the stroller's own row or column.
      const probe: [number, number] = bx !== 0 ? [cx + sx * (half + 1), cz - sz * (half + 1)] : [cx - sx * (half + 1), cz + sz * (half + 1)];
      const cell = layout.cellAt(building, probe[0], probe[1]);
      if (!cell) continue;
      const other = { x: cell.x, z: cell.z, w: cell.w / 2 - STROLL_INSET, d: cell.d / 2 - STROLL_INSET };
      // The strip is on the side of the crossing that the stroller's block is on.
      const gate: [number, number] = [stroller.x + sx * stroller.w, stroller.z + sz * stroller.d];
      const far: [number, number] = bx !== 0 ? [other.x - sx * other.w, gate[1]] : [gate[0], other.z - sz * other.d];
      const edge: Edge = bx !== 0 ? `${sz > 0 ? '-' : '+'}z` : `${sx > 0 ? '-' : '+'}x`;
      options.push({ id, edge, gate, far, block: other });
    }
  }
  return options[Math.floor(pick * options.length)];
}

/** Someone out for a walk who crosses a street, as they are now: where they are, and what they wait for. */
export interface Crosser {
  /** Which of the strollers they are, by their place in the list `strollers` gave. */
  n: number;
  name: string;
  across: Across;
  /** The line of their own block, and which way they walk round a block. */
  own: { x: number; z: number; w: number; d: number };
  direction: 1 | -1;
  x: number;
  z: number;
  angle: number;
  moving: boolean;
  path: [number, number][];
  /** Which block they walk round now: 0 is their own, 1 the one over the street. */
  side: 0 | 1;
  /** Walking round a block, waiting at the kerb for green, or on the strip over the street. */
  phase: 'lap' | 'wait' | 'cross';
  speed: number;
}

/** The corners of a block's line, in the order a stroller who walks it forwards comes to them. */
const corners = (block: { x: number; z: number; w: number; d: number }): [number, number][] => [
  [block.x - block.w, block.z - block.d],
  [block.x + block.w, block.z - block.d],
  [block.x + block.w, block.z + block.d],
  [block.x - block.w, block.z + block.d],
];

/** A walk once round a block from the corner `from`, which is where it ends too. */
function lap(block: { x: number; z: number; w: number; d: number }, from: [number, number], direction: 1 | -1): [number, number][] {
  const all = corners(block);
  const start = all.findIndex((c) => Math.abs(c[0] - from[0]) < 1e-6 && Math.abs(c[1] - from[1]) < 1e-6);
  return [1, 2, 3, 4].map((k) => all[(((start + direction * k) % 4) + 4) % 4]!);
}

const lapLength = (path: readonly [number, number][], from: [number, number]) => lengthOf([from, ...path]);

function crosser(stroller: Stroller, n: number): Crosser {
  const across = stroller.across!;
  const path = lap(stroller, across.gate, stroller.direction);
  const own = { x: stroller.x, z: stroller.z, w: stroller.w, d: stroller.d };
  const c: Crosser = { n, name: stroller.name, across, own, direction: stroller.direction, x: across.gate[0], z: across.gate[1], angle: 0, moving: true, path, side: 0, phase: 'lap', speed: stroller.speed };
  // Everyone starts somewhere on their first round.
  follow(c, stroller.start * lapLength(path, across.gate));
  return c;
}

/** The block a crosser walks round, and the corner of it where the strip begins. */
const sideOf = (c: Crosser) => (c.side === 0 ? { block: c.own, gate: c.across.gate } : { block: c.across.block, gate: c.across.far });

function stepCrosser(c: Crosser, traffic: Traffic, seconds: number): void {
  const { across } = c;
  if (c.phase === 'wait') {
    askToCross(traffic, across.id, across.edge);
    if (!mayStepOut(traffic, across.id, across.edge)) {
      c.moving = false;
      return;
    }
    stepOut(traffic, across.id, across.edge);
    c.phase = 'cross';
    c.path = [c.side === 0 ? across.far : across.gate];
  }
  c.moving = true;
  follow(c, c.speed * seconds);
  if (c.path.length > 0) return;
  if (c.phase === 'cross') {
    stepOff(traffic, across.id, across.edge);
    c.side = c.side === 0 ? 1 : 0;
    c.phase = 'lap';
    const { block, gate } = sideOf(c);
    c.path = lap(block, gate, c.direction);
  } else if (c.phase === 'lap') {
    // Back at the corner of the block: over the street if the crossing has lights, or else once more round.
    if (hasLights(traffic, across.id)) c.phase = 'wait';
    else c.path = lap(sideOf(c).block, sideOf(c).gate, c.direction);
  }
}

/** How far from the kerb the strollers walk. */
const STROLL_INSET = 0.22;

/** Where a stroller is after `seconds` of game time, and the way they face. */
export function strollerAt(stroller: Stroller, seconds: number): { x: number; z: number; angle: number } {
  const { w, d } = stroller;
  const around = 4 * (w + d);
  let along = (((stroller.start * around + stroller.direction * stroller.speed * seconds) % around) + around) % around;
  // The four sides in turn, starting at the corner with the smallest x and z and going along x first.
  const sides: [length: number, fromX: number, fromZ: number, dx: number, dz: number][] = [
    [2 * w, -w, -d, 1, 0],
    [2 * d, w, -d, 0, 1],
    [2 * w, w, d, -1, 0],
    [2 * d, -w, d, 0, -1],
  ];
  for (const [length, fromX, fromZ, dx, dz] of sides) {
    if (along <= length) {
      return { x: stroller.x + fromX + dx * along, z: stroller.z + fromZ + dz * along, angle: Math.atan2(dx * stroller.direction, dz * stroller.direction) };
    }
    along -= length;
  }
  return { x: stroller.x - w, z: stroller.z - d, angle: 0 };
}

/** Whether a point is on a pavement: not on a street, and not inside the office. For the tests. */
export function onPavement(x: number, z: number, building: Building = BUILDINGS.standard, layout: Layout = CAPITAL): boolean {
  const inOffice = building.wings.some((r) => x > r.x - 0.1 && x < r.x + r.w + 0.1 && z > r.y - 0.1 && z < r.y + r.h + 0.1);
  if (inOffice) return false;
  // The car park beside the office is one stretch of ground, with no street between its two town blocks.
  if (onLot(x, z, building, layout)) return true;
  return layout.pavement(building, x, z);
}
