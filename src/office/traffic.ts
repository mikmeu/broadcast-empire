// The traffic in the streets around the office: a small simulation that the
// view steps forward on the game's time.
//
// Every vehicle has a speed of its own and enters the town at a moment of its
// own, so no two minutes look the same. They still never touch:
//
// - In a lane a vehicle never comes closer to the one in front than a small
//   gap: it brakes, and stands still if it has to.
// - A crossing belongs to one of its two streets at a time. A vehicle only
//   drives onto it when the crossing is free or already belongs to its own
//   street, and when there is room to leave it on the other side, so nobody
//   ever stands still on a crossing. Whoever asked first goes first, and a
//   street that has waited a moment stops the other one.
//
// The bus runs to the timetable: it stands at the stop in front of the office
// at a quarter to every hour of the office clock.
//
// Unlike the rest of this folder the traffic has a state, kept by the view
// and never saved: it is only something to look at.

import { MS_PER_DAY } from '../config/balance';
import { BUILDINGS, CORE, WEST, type Building } from '../config/office';
import { OFFICE_DAY } from '../config/world';
import { Rng } from '../sim/rng';
import { CITY, type Tone } from './assets';
import { OFFICE_BLOCK, STREET, busyStreets } from './city';
import { SITES, type Site } from './sites';

export type VehicleKind = keyof typeof CITY.vehicles;

/** Seconds of game time, at normal speed, that an hour on the office clock lasts in a month of thirty days. */
export const HOUR_SECONDS = (30 * MS_PER_DAY) / 1000 / (OFFICE_DAY.to - OFFICE_DAY.from);

/** How far outside the last street a lane begins and ends, in tiles: vehicles come in from beyond the edge of town. */
const MARGIN = 6;
/** Half the width of a street: a crossing reaches this far from its middle. */
const HALF = CITY.streetWidth / 2;
/** The room a vehicle keeps to the one in front, bumper to bumper. */
const GAP = 0.35;
/** How far before a crossing a vehicle that has to wait stops. */
const LINE_GAP = 0.15;
/** A vehicle asks for a crossing when it is this much further from its stopping line than it needs to brake. */
const ASK = 0.7;
/** How long a street may keep a crossing while the other street waits, in seconds. */
const PATIENCE = 1.2;
/** After this long without being repeated, a request for a crossing no longer counts. */
const STALE = 0.25;
/** How far past the place where it is going a vehicle that has to be on time keeps the road ahead moving, in tiles. */
const CLEAR_PAST = 12;
/** Tiles per second per second. */
const ACCELERATION = 3.2;
const BRAKING = 6;
/** The longest step the simulation takes at once, in seconds; longer ones are cut up. */
const STEP = 1 / 30;

export interface Lane {
  along: 'x' | 'z';
  /** Where the lane lies on the other axis. */
  at: number;
  direction: 1 | -1;
  /** Where a vehicle at 0 is on the lane's own axis: the lane is measured from there, in the way it is driven. */
  origin: number;
  length: number;
  /** The crossings on the way, nearest first: the middle of each, measured along the lane. */
  crossings: { s: number; id: number }[];
}

/** A place where a vehicle stands still for a while: a bus at its stop, a taxi at the door. */
export interface Halt {
  /** Where the middle of the vehicle stands, measured along its lane. */
  s: number;
  /** When it should be standing there, and until when it waits at least: times on the office clock, counted in hours without end (see `clockHours`). */
  due: number;
  until: number;
  state: 'ahead' | 'standing' | 'done';
  /** How long it has stood, in seconds. */
  stood: number;
  /** For a taxi that was ordered: for whom. It waits for them, though not for ever. */
  key?: string;
}

export interface Vehicle {
  id: number;
  kind: VehicleKind;
  /** The color of the body. */
  tone: Tone;
  lane: number;
  /** Where its middle is, measured along the lane. */
  s: number;
  /** Speed now, and the speed it likes to drive: tiles per second. */
  v: number;
  speed: number;
  /** The speed it drives at most right now: its own, unless it has somewhere to be on time. */
  pace: number;
  length: number;
  width: number;
  /** The crossings it may be on. */
  holds: number[];
  halt?: Halt;
}

interface Crossing {
  /** The street whose vehicles are on it or about to be. */
  axis: 'x' | 'z' | null;
  holders: number;
  /** Since when each street has been waiting for it, and when that was last repeated. */
  asked: { x: number; z: number };
  seen: { x: number; z: number };
  /** When a vehicle that has to be somewhere on time last waited for it, per street. */
  urgent: { x: number; z: number };
}

export interface Traffic {
  lanes: Lane[];
  /** The vehicles in each lane, the one in front first. */
  queues: Vehicle[][];
  crossings: Crossing[];
  rng: Rng;
  /** Seconds simulated so far. */
  time: number;
  /** The time on the office clock, counted in hours without end. */
  hours: number;
  /** When the next vehicle enters each lane. */
  nextSpawn: number[];
  nextId: number;
  /** The hour whose quarter-to bus leaves next. */
  nextBus: number;
  /** The taxis that have been ordered: for whom, when they are due at the door, and whether one is on its way. */
  orders: { key: string; due: number; sent: boolean }[];
  /** How many vehicles have driven out of town. */
  left: number;
  /** How busy the streets of this town are, and with what (sites.ts). */
  rules: Site['traffic'];
}

// --- The streets ---

function buildLanes(): { lanes: Lane[]; crossings: number } {
  const busy = busyStreets();
  const across = { x: busy.filter((s) => s.along === 'x'), z: busy.filter((s) => s.along === 'z') };
  const lanes: Lane[] = [];
  for (const street of busy) {
    const others = street.along === 'x' ? across.z : across.x;
    const own = across[street.along].indexOf(street);
    for (const direction of [1, -1] as const) {
      // The lane to the driver's right of the middle line.
      const side = street.along === 'x' ? direction : -direction;
      const length = STREET.length[street.along] + 2 * MARGIN;
      const from = STREET.from[street.along] - MARGIN;
      const origin = direction > 0 ? from : from + length;
      lanes.push({
        along: street.along,
        at: street.at + side * (CITY.streetWidth / 4),
        direction,
        origin,
        length,
        crossings: others
          .map((other, n) => ({ s: (other.at - origin) * direction, id: street.along === 'x' ? own * across.z.length + n : n * across.z.length + own }))
          .sort((a, b) => a.s - b.s),
      });
    }
  }
  return { lanes, crossings: across.x.length * across.z.length };
}

const TOWN = buildLanes();
export const LANES: readonly Lane[] = TOWN.lanes;

/** Where a point of a lane is in the town, in floor tiles. */
export function laneAt(lane: Lane, s: number): { x: number; z: number } {
  const along = lane.origin + lane.direction * s;
  return lane.along === 'x' ? { x: along, z: lane.at } : { x: lane.at, z: along };
}

/** How far along a lane a place in the town is. */
const along = (lane: Lane, place: { x: number; z: number }) => ((lane.along === 'x' ? place.x : place.z) - lane.origin) * lane.direction;

/** The lane of a street that runs along the office's own pavement. */
function laneBeside(axis: 'x' | 'z', street: number): number {
  const index = LANES.findIndex((lane) => lane.along === axis && Math.abs(lane.at - street) < CITY.streetWidth / 2 && nearOffice(lane, street));
  if (index < 0) throw new Error(`No lane beside the office on ${axis} ${street}`);
  return index;
}

/** Whether a lane is on the office's side of its street. */
function nearOffice(lane: Lane, street: number): boolean {
  const middle = lane.along === 'x' ? OFFICE_BLOCK.z + OFFICE_BLOCK.d / 2 : OFFICE_BLOCK.x + OFFICE_BLOCK.w / 2;
  return Math.abs(lane.at - middle) < Math.abs(street - middle);
}

/**
 * The bus stop: on the street in front of the office, on the office's side,
 * by the corner the entrance is around. `x` and `z` are where the middle of
 * the bus stands; `wait` is where its passengers stand on the pavement.
 */
export const BUS_STOP = (() => {
  const lane = laneBeside('x', OFFICE_BLOCK.z + OFFICE_BLOCK.d);
  const x = WEST + 6;
  const z = LANES[lane]!.at;
  return { lane, x, z, s: along(LANES[lane]!, { x, z }), wait: { x, z: z - CITY.streetWidth / 4 - 0.45 } };
})();

/**
 * The taxi stand: on the street beside the office, at the entrance. `x` and
 * `z` are where the middle of a taxi stands; `wait` is where its passenger
 * gets in or out, on the pavement.
 */
export const TAXI_STAND = (() => {
  const lane = laneBeside('z', OFFICE_BLOCK.x);
  const x = LANES[lane]!.at;
  const z = CORE.hall.y + CORE.hall.h / 2 + 0.9;
  return { lane, x, z, s: along(LANES[lane]!, { x, z }), wait: { x: x + CITY.streetWidth / 4 + 0.45, z } };
})();

/**
 * An ordered taxi comes into town `lead` before it is due at the door, aims
 * to be there `early`, and waits for whoever ordered it until `patience`
 * after; without anyone to wait for it stays `stay`. All in hours on the clock.
 */
export const TAXI = { lead: 1.9, early: 0.1, stay: 0.1, patience: 1 };

/**
 * The bus is due at the stop at a quarter to the hour. It leaves the edge of
 * town `lead` before that, aims to be there `early`, and stays until `stay`
 * after: all in hours on the clock.
 */
export const BUS = { lead: 3.1, early: 0.2, stay: 0.1, due: 0.75 };

// --- The simulation ---

/**
 * The time on the office clock as hours that keep counting: a day at the
 * office has `OFFICE_DAY.to - OFFICE_DAY.from` of them, and the next day's
 * first hour follows the last one of today. `hour` is the time on the clock,
 * `day` how many office days have gone before.
 */
export const clockHours = (day: number, hour: number) => day * (OFFICE_DAY.to - OFFICE_DAY.from) + (hour - OFFICE_DAY.from);

/** A new vehicle of a kind at the start of a lane, if there is room for it. */
export function enter(traffic: Traffic, lane: number, kind: VehicleKind): Vehicle | null {
  const spec = CITY.vehicles[kind];
  const queue = traffic.queues[lane]!;
  const last = queue[queue.length - 1];
  if (last && last.s - last.length / 2 - GAP < spec.length / 2 + 0.3) return null;
  const { rng } = traffic;
  const speed = spec.speed[0] + rng.next() * (spec.speed[1] - spec.speed[0]);
  const tones = kind === 'car' || kind === 'van' || kind === 'truck' ? CITY.traffic.tones : null;
  const vehicle: Vehicle = {
    id: traffic.nextId++,
    kind,
    tone: tones ? tones[Math.floor(rng.next() * tones.length)]! : 'white',
    lane,
    s: -spec.length / 2,
    v: speed,
    speed,
    pace: speed,
    length: spec.length,
    width: spec.width,
    holds: [],
  };
  queue.push(vehicle);
  return vehicle;
}

/** Whether a vehicle may drive onto a crossing now; if not for want of its turn, it is noted as waiting. */
function take(traffic: Traffic, crossing: Crossing, id: number, exit: number, axis: 'x' | 'z', vehicle: Vehicle, leader: Vehicle | undefined, first: boolean): boolean {
  // No room to stand clear of the crossing on the other side: don't even ask.
  if (leader && leader.s - leader.length / 2 - GAP < exit + vehicle.length) return false;
  const other = axis === 'x' ? 'z' : 'x';
  const fresh = traffic.time - STALE;
  const theirs = crossing.seen[other] >= fresh ? crossing.asked[other] : null;
  const mine = crossing.seen[axis] >= fresh ? crossing.asked[axis] : null;
  // A vehicle that has to be somewhere on time, and whoever is in its way, does not wait its turn: it only waits
  // for the crossing to be clear, and the other street lets it go first.
  const giveWay = !first && crossing.urgent[other] >= fresh;
  const granted =
    !giveWay &&
    (crossing.axis === null
      ? first || theirs === null || (mine !== null && mine <= theirs)
      : crossing.axis === axis && (first || theirs === null || traffic.time - theirs < PATIENCE));
  if (first && !granted) crossing.urgent[axis] = traffic.time;
  if (!granted) {
    if (mine === null) crossing.asked[axis] = traffic.time;
    crossing.seen[axis] = traffic.time;
    return false;
  }
  crossing.axis = axis;
  crossing.holders++;
  crossing.seen[axis] = -Infinity;
  vehicle.holds.push(id);
  return true;
}

function release(traffic: Traffic, id: number): void {
  const crossing = traffic.crossings[id]!;
  crossing.holders--;
  if (crossing.holders <= 0) {
    crossing.holders = 0;
    crossing.axis = null;
  }
}

/** Sends the bus for the next quarter to the hour on its way, once it is time. */
function dispatchBus(traffic: Traffic): void {
  const { due, lead, stay, early } = BUS;
  while (traffic.hours >= traffic.nextBus + due - lead) {
    // A bus that could not leave in time is not run at all.
    if (traffic.hours < traffic.nextBus + due - lead + 0.5) {
      const bus = enter(traffic, BUS_STOP.lane, 'bus');
      if (!bus) return;
      bus.halt = { s: BUS_STOP.s, due: traffic.nextBus + due - early, until: traffic.nextBus + due + stay, state: 'ahead', stood: 0 };
    }
    traffic.nextBus++;
  }
}

/** With somewhere to be on time, a vehicle drives as fast as it takes to get there then, within what it can do. */
function setPace(traffic: Traffic, vehicle: Vehicle): void {
  const halt = vehicle.halt!;
  const seconds = Math.max((halt.due - traffic.hours) * HOUR_SECONDS, 0.1);
  vehicle.pace = Math.min(Math.max((halt.s - vehicle.s) / seconds, vehicle.speed * CITY.traffic.dawdle), vehicle.speed * CITY.traffic.hurry);
}

/** Orders a taxi to be at the door at a time on the office clock (see `clockHours`). Ordering twice for the same journey changes nothing. */
export function orderTaxi(traffic: Traffic, key: string, due: number): void {
  if (traffic.orders.some((order) => order.key === key)) return;
  traffic.orders.push({ key, due, sent: false });
}

/** The taxi that stands at the door for a journey, if it has come. */
export const taxiFor = (traffic: Traffic, key: string): Vehicle | undefined =>
  traffic.queues[TAXI_STAND.lane]!.find((v) => v.halt?.key === key && v.halt.state === 'standing');

/** Lets the taxi of a journey drive on: its passenger has got out, or in. */
export function releaseTaxi(traffic: Traffic, key: string): void {
  const taxi = traffic.queues[TAXI_STAND.lane]!.find((v) => v.halt?.key === key);
  if (taxi?.halt) {
    taxi.halt.key = undefined;
    taxi.halt.until = Math.min(taxi.halt.until, traffic.hours);
  }
}

/** Sends the ordered taxis on their way once it is time, and forgets the orders of long ago. */
function dispatchTaxis(traffic: Traffic): void {
  const { lead, early, stay, patience } = TAXI;
  for (const order of traffic.orders) {
    if (order.sent || traffic.hours < order.due - lead) continue;
    const taxi = enter(traffic, TAXI_STAND.lane, 'taxi');
    if (!taxi) break;
    taxi.halt = { s: TAXI_STAND.s, due: order.due - early, until: order.due + stay, state: 'ahead', stood: 0, key: order.key };
    order.sent = true;
  }
  if (traffic.orders.length > 0 && traffic.orders[0]!.due + patience + lead < traffic.hours) traffic.orders = traffic.orders.filter((order) => order.due + patience + lead >= traffic.hours);
}

function advance(traffic: Traffic, dt: number): void {
  traffic.time += dt;
  dispatchBus(traffic);
  dispatchTaxis(traffic);

  traffic.lanes.forEach((lane, l) => {
    const queue = traffic.queues[l]!;
    // A vehicle that is due somewhere, and everyone in front of it up to a little past where it is going, go
    // first at crossings and drive at least at its pace: `push` is that pace for each vehicle, or 0.
    const push: number[] = [];
    let pace = 0;
    let upTo = -Infinity;
    for (let i = queue.length - 1; i >= 0; i--) {
      const vehicle = queue[i]!;
      if (vehicle.s >= upTo) pace = 0;
      if (vehicle.halt?.state === 'ahead') {
        setPace(traffic, vehicle);
        pace = Math.max(pace, vehicle.pace);
        upTo = Math.max(upTo, vehicle.halt.s + CLEAR_PAST);
      }
      push[i] = pace;
    }
    for (let i = 0; i < queue.length; i++) {
      const vehicle = queue[i]!;
      const leader = queue[i - 1];
      let limit = leader ? leader.s - leader.length / 2 - vehicle.length / 2 - GAP : Infinity;
      const halt = vehicle.halt;
      if (halt && halt.state !== 'done') limit = Math.min(limit, halt.s);
      const first = push[i]! > 0;

      for (const { s, id } of lane.crossings) {
        if (vehicle.holds.includes(id)) continue;
        const line = s - HALF - vehicle.length / 2 - LINE_GAP;
        // Behind it already, or too far ahead to think about.
        if (vehicle.s > line + LINE_GAP / 2) continue;
        if (limit <= line || line - vehicle.s > (vehicle.v * vehicle.v) / (2 * BRAKING) + ASK) break;
        if (take(traffic, traffic.crossings[id]!, id, s + HALF, lane.along, vehicle, leader, first)) continue;
        limit = line;
        break;
      }

      // Whoever is in front of a vehicle that is running late does not hold it up: they drive on at its pace.
      if (!halt || halt.state !== 'ahead') vehicle.pace = Math.max(vehicle.speed, push[i]!);

      const room = limit - vehicle.s;
      if (room <= 1e-4) {
        vehicle.v = 0;
      } else {
        const want = Math.min(vehicle.pace, Math.sqrt(2 * BRAKING * room));
        vehicle.v = want > vehicle.v ? Math.min(want, vehicle.v + ACCELERATION * dt) : want;
        vehicle.s = Math.min(vehicle.s + vehicle.v * dt, limit);
      }

      for (let h = vehicle.holds.length - 1; h >= 0; h--) {
        const held = lane.crossings.find((c) => c.id === vehicle.holds[h])!;
        if (vehicle.s - vehicle.length / 2 >= held.s + HALF) {
          release(traffic, held.id);
          vehicle.holds.splice(h, 1);
        }
      }

      if (halt && halt.state !== 'done' && halt.s - vehicle.s <= 1e-4) {
        halt.state = 'standing';
        halt.stood += dt;
        // A taxi waits for whoever ordered it, but not for ever.
        const waiting = halt.key !== undefined && traffic.hours < halt.due + TAXI.patience;
        if (traffic.hours >= halt.until && halt.stood >= CITY.traffic.shortestStop && !waiting) halt.state = 'done';
      }
    }
    while (queue[0] && queue[0].s - queue[0].length / 2 > lane.length) {
      for (const id of queue[0].holds) release(traffic, id);
      queue.shift();
      traffic.left++;
    }

    if (traffic.time >= traffic.nextSpawn[l]!) {
      const { mix, every } = traffic.rules;
      let pick = traffic.rng.next();
      const kind = (Object.keys(mix) as (keyof typeof mix)[]).find((k) => (pick -= mix[k]) < 0) ?? 'car';
      if (enter(traffic, l, kind)) traffic.nextSpawn[l] = traffic.time + every * (0.3 + 1.4 * traffic.rng.next());
    }
  });
}

/**
 * The traffic of a game as it is at a time on the office clock (see
 * `clockHours`): the streets are filled by letting a few hours go by first,
 * so buses that are due are on their way. Nothing drives in a street that the
 * office's own block lies across: the side street the long building stands on.
 */
export function createTraffic(seed: number, hours: number, rules: Site['traffic'] = SITES.capital.traffic, building: Building = BUILDINGS.standard): Traffic {
  const before = hours - WARM_UP;
  const traffic: Traffic = {
    lanes: [...LANES],
    queues: LANES.map(() => []),
    crossings: Array.from({ length: TOWN.crossings }, () => ({ axis: null, holders: 0, asked: { x: 0, z: 0 }, seen: { x: -Infinity, z: -Infinity }, urgent: { x: -Infinity, z: -Infinity } })),
    rng: new Rng(seed ^ 0x7a3c19),
    time: 0,
    hours: before,
    nextSpawn: [],
    nextId: 1,
    nextBus: Math.ceil(before - BUS.due + BUS.lead),
    orders: [],
    rules,
    left: 0,
  };
  const busy = busyStreets(building);
  const open = (lane: Lane) => busy.some((street) => street.along === lane.along && Math.abs(street.at - lane.at) < CITY.streetWidth / 2);
  traffic.nextSpawn = LANES.map((lane) => (open(lane) ? 1 : Infinity) * traffic.rng.next() * rules.every);
  const steps = Math.ceil((WARM_UP * HOUR_SECONDS) / (2 * STEP));
  for (let n = 1; n <= steps; n++) {
    traffic.hours = before + (WARM_UP * n) / steps;
    advance(traffic, 2 * STEP);
  }
  return traffic;
}

/** Hours on the clock that go by before a new town is shown: longer than a bus needs to reach its stop. */
const WARM_UP = BUS.lead + 1.5;

/** Moves the traffic on by `seconds` of game time, to `hours` on the office clock. */
export function stepTraffic(traffic: Traffic, seconds: number, hours: number): void {
  const steps = Math.ceil(seconds / STEP);
  const from = traffic.hours;
  for (let n = 1; n <= steps; n++) {
    traffic.hours = from + ((hours - from) * n) / steps;
    advance(traffic, seconds / steps);
  }
  traffic.hours = hours;
}

/** Every vehicle in town. */
export const vehiclesIn = (traffic: Traffic): Vehicle[] => traffic.queues.flat();

/** Where a vehicle is: its middle in floor tiles, and the way it points as an angle around the vertical. */
export function placeOf(traffic: Traffic, vehicle: Vehicle): { x: number; z: number; angle: number } {
  const lane = traffic.lanes[vehicle.lane]!;
  const angle = lane.along === 'x' ? (lane.direction > 0 ? 0 : Math.PI) : lane.direction > 0 ? -Math.PI / 2 : Math.PI / 2;
  return { ...laneAt(lane, vehicle.s), angle };
}

/** The bus that is standing at the stop, if one is. */
export const busAtStop = (traffic: Traffic): Vehicle | undefined => traffic.queues[BUS_STOP.lane]!.find((v) => v.kind === 'bus' && v.halt?.state === 'standing');
