// The people in the street: those who come to the office and go home (the
// journeys of day.ts), and people who are just out for a walk.
//
// The journeys are tied to the traffic (traffic.ts): someone who comes by
// bus gets out when the bus stands at the stop, someone who takes a taxi
// when theirs stands at the door, and whoever goes home that way waits for
// it. So the people who are on their way have a state, kept by the view and
// never saved, like the traffic. The strollers are simpler: where each one
// is follows from the time alone.

import { BUILDINGS, CORE, FLOOR, WEST as FACE, widthOf, type Building } from '../config/office';
import type { Id } from '../sim/state';
import { CITY } from './assets';
import { OFFICE_BLOCK, officeBlock } from './city';
import { SITES } from './sites';
import { DAY, type Trip } from './day';
import { BUS_STOP, HOUR_SECONDS, TAXI_STAND, busAtStop, orderTaxi, releaseTaxi, taxiFor, type Traffic } from './traffic';

/** Tiles per second: people in the street walk a little faster than in the office. */
const PACE = 3.4;

/** Where people walk on the office's own pavement, and the places they go to. */
const WEST = OFFICE_BLOCK.x + CITY.streetWidth / 2 + 0.9;
const FRONT = OFFICE_BLOCK.z + OFFICE_BLOCK.d - CITY.streetWidth / 2 - 0.25;
export const PLACES = {
  /** Just outside the entrance. */
  door: [FACE - 0.15, CORE.hall.y + CORE.hall.h / 2] as [number, number],
  /** On the pavement in front of the entrance. */
  gate: [WEST, CORE.hall.y + CORE.hall.h / 2] as [number, number],
  /** The corner of the office between the entrance and the bus stop. */
  corner: [WEST, FRONT] as [number, number],
  stop: [BUS_STOP.wait.x, FRONT] as [number, number],
  taxi: [TAXI_STAND.wait.x, TAXI_STAND.wait.z] as [number, number],
  /** Where people on foot come from and go to: round the back corner of the office, out of sight. */
  away: [WEST, OFFICE_BLOCK.z + CITY.streetWidth / 2 + 0.3] as [number, number],
};

const lengthOf = (path: readonly [number, number][]) => path.slice(1).reduce((sum, point, i) => sum + Math.hypot(point[0] - path[i]![0], point[1] - path[i]![1]), 0);

/** The ways to and from the entrance. */
export const ROUTES = {
  bus: [PLACES.stop, PLACES.corner, PLACES.gate, PLACES.door],
  taxi: [PLACES.taxi, PLACES.gate, PLACES.door],
  walk: [PLACES.away, PLACES.gate, PLACES.door],
} as const;

/** How long each way takes, in hours on the clock. */
export const WALK_HOURS = {
  bus: lengthOf(ROUTES.bus) / PACE / HOUR_SECONDS,
  taxi: lengthOf(ROUTES.taxi) / PACE / HOUR_SECONDS,
  walk: lengthOf(ROUTES.walk) / PACE / HOUR_SECONDS,
};

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
  /** What they wait for once they are there: the bus, or the taxi of their journey. */
  wait: 'bus' | 'taxi' | null;
  /** Seconds before they set off, so that a busload does not walk as one. */
  delay: number;
  speed: number;
}

export interface Street {
  walkers: Walker[];
  /** The journeys that have begun, or were missed. */
  begun: Set<string>;
}

export const createStreet = (): Street => ({ walkers: [], begun: new Set() });

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

/** Where someone who waits for the bus or a taxi stands: along the pavement, one beside the other. The bus stop's pavement runs along x, the taxi stand's along z. */
const queued = (travel: 'bus' | 'taxi', place: [number, number], n: number): [number, number] =>
  travel === 'bus' ? [place[0] + (n % 6) * 0.45 - 0.9, place[1] - Math.floor(n / 6) * 0.3] : [place[0], place[1] + (n % 6) * 0.45];

/**
 * Moves the street on by `seconds` of game time, to `hours` on the office
 * clock (hours that keep counting: `dawn` is the hour the day began at).
 * `trips` are the journeys of that day.
 */
export function stepStreet(street: Street, traffic: Traffic, trips: readonly Trip[], dawn: number, hours: number, seconds: number): void {
  const bus = busAtStop(traffic);
  let alighting = 0;
  for (const trip of trips) {
    if (street.begun.has(trip.key)) continue;
    // When they are at the door, in hours that keep counting.
    const at = dawn + trip.at - 8;
    if (trip.way === 'in') {
      if (trip.travel === 'walk') {
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
      if (hours < at) continue;
      if (hours <= at + TOLERANCE) {
        const route = [...ROUTES[trip.travel]].reverse();
        const waiting = street.walkers.filter((w) => w.wait === trip.travel).length;
        if (trip.travel !== 'walk') route[route.length - 1] = queued(trip.travel, route[route.length - 1]!, waiting);
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
    let left = w.speed * seconds;
    w.moving = w.path.length > 0;
    while (left > 0 && w.path.length > 0) {
      const [x, z] = w.path[0]!;
      const distance = Math.hypot(x - w.x, z - w.z);
      if (distance <= left) {
        [w.x, w.z] = [x, z];
        left -= distance;
        w.path.shift();
      } else {
        w.angle = Math.atan2(x - w.x, z - w.z);
        w.x += ((x - w.x) / distance) * left;
        w.z += ((z - w.z) / distance) * left;
        left = 0;
      }
    }
  }
  // Whoever has arrived is gone: through the door, round the corner, onto the bus or into their taxi.
  street.walkers = street.walkers.filter((w) => {
    if (w.path.length > 0 || w.delay > 0) return true;
    if (w.wait === 'bus') return !bus;
    if (w.wait === 'taxi') {
      if (!taxiFor(traffic, w.key)) return hours < tripTime(trips, w.key, dawn) + 1;
      releaseTaxi(traffic, w.key);
    }
    return false;
  });
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
}

function roll(seed: number, n: number, salt: number): number {
  let h = (n * 374761393 + salt * 668265263 + Math.imul(seed | 0, 1597334677)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * The people out for a walk in a game's town: each goes round one block, on
 * the pavement along its kerb, and never crosses a street. Most walk in front
 * of the office and beside it, where they can be seen.
 */
export function strollers(seed: number, count: number = SITES.capital.strollers, building: Building = BUILDINGS.standard): Stroller[] {
  const pad = { w: CITY.block.w - CITY.streetWidth, d: CITY.block.d - CITY.streetWidth };
  // The blocks in view: the office's own, the row in front of it and the ones beside it.
  const own = officeBlock(building);
  const blocks: { x: number; z: number; w: number; d: number }[] = [{ x: own.x + own.w / 2, z: own.z + own.d / 2, w: own.w - CITY.streetWidth, d: own.d - CITY.streetWidth }];
  for (let i = -1; i <= 4; i++) {
    for (let j = 0; j <= 2; j++) {
      if (i >= 0 && i < building.blocks && j < 2) continue;
      // The block the railway runs along has its pavement taken by the pillars.
      if (j === 2 && i >= 0) continue;
      blocks.push({ x: OFFICE_BLOCK.x + (i + 0.5) * CITY.block.w, z: OFFICE_BLOCK.z + (j + 0.5) * CITY.block.d, w: pad.w, d: pad.d });
    }
  }
  return Array.from({ length: count }, (_, n): Stroller => {
    // Every third one walks round the office itself.
    const block = n % 3 === 0 ? blocks[0]! : blocks[1 + Math.floor(roll(seed, n, 1) * (blocks.length - 1))]!;
    return {
      name: `Passer-by ${Math.floor(roll(seed, n, 2) * 1000)}`,
      x: block.x,
      z: block.z,
      w: block.w / 2 - STROLL_INSET,
      d: block.d / 2 - STROLL_INSET,
      direction: roll(seed, n, 3) < 0.5 ? 1 : -1,
      start: roll(seed, n, 4),
      speed: 1 + roll(seed, n, 5) * 0.8,
    };
  });
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
export function onPavement(x: number, z: number, building: Building = BUILDINGS.standard): boolean {
  const inOffice = x > FACE - 0.1 && x < FACE + widthOf(building) + 0.1 && z > -0.1 && z < FLOOR.h + 0.1;
  if (inOffice) return false;
  const half = CITY.streetWidth / 2;
  /** How far a point is from the nearest street's middle line. */
  const fromLine = (value: number, origin: number, step: number) => {
    const off = (((value - origin) % step) + step) % step;
    return Math.min(off, step - off);
  };
  const own = officeBlock(building);
  const inBlock = x > own.x + half && x < own.x + own.w - half && z > own.z + half && z < own.z + own.d - half;
  if (inBlock) return true;
  return fromLine(x, OFFICE_BLOCK.x, CITY.block.w) >= half && fromLine(z, OFFICE_BLOCK.z, CITY.block.d) >= half;
}
