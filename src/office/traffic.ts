// The traffic in the streets around the office: a small simulation that the
// view steps forward on the game's time.
//
// Every vehicle has a speed of its own and enters the town at a moment of its
// own, so no two minutes look the same. They still never touch:
//
// - In a lane a vehicle never comes closer to the one in front than a small
//   gap: it brakes, and stands still if it has to.
// - Every crossing has traffic lights. A vehicle only drives onto a crossing
//   on green, and only when there is room to leave it on the other side, so
//   nobody ever stands still on a crossing. The lights go to the other street
//   only once the crossing is empty, and sooner for a bus that is running late.
// - A vehicle may turn right at a crossing, on its own street's green: that
//   crosses no other lane, and it only turns when the street it turns into has
//   room for it. In a town by the water the side streets end at the shore, and
//   everyone coming down one turns there.
// - A car or a van may overtake a bus or a taxi that stands at the kerb, on
//   the other side of the road, when nothing is coming the other way for as
//   long as that takes and the lights ahead keep the side streets waiting.
//
// The bus runs to the timetable: it stands at the stop in front of the office
// at a quarter to every hour of the office clock.
//
// Unlike the rest of this folder the traffic has a state, kept by the view
// and never saved: it is only something to look at.

import { MS_PER_DAY, TOWN_MS_PER_DAY } from '../config/balance';
import { BUILDINGS, CORE, WEST, type Building } from '../config/office';
import { OFFICE_DAY } from '../config/world';
import { Rng } from '../sim/rng';
import { CITY, type Tone } from './assets';
import { OFFICE_BLOCK, STREET, busyStreets } from './city';
import { SITES, type Site } from './sites';

export type VehicleKind = keyof typeof CITY.vehicles;

/** Seconds of game time, at normal speed, that an hour on the office clock lasts in a month of thirty days. */
export const HOUR_SECONDS = (30 * MS_PER_DAY) / 1000 / (OFFICE_DAY.to - OFFICE_DAY.from);

/**
 * A duration in the street, written in hours of the clock the town was laid
 * out by (`TOWN_MS_PER_DAY`), as hours on today's office clock (0.16.0): the
 * same real seconds, so a bus drives and stands as long as it did when a day was shorter.
 */
export const townHours = (hours: number) => (hours * 30 * TOWN_MS_PER_DAY) / 1000 / (OFFICE_DAY.to - OFFICE_DAY.from) / HOUR_SECONDS;

/** How far outside the last street a lane begins and ends, in tiles: vehicles come in from beyond the edge of town. */
const MARGIN = 6;
/** Half the width of a street: a crossing reaches this far from its middle. */
const HALF = CITY.streetWidth / 2;
/** The room a vehicle keeps to the one in front, bumper to bumper. */
const GAP = 0.35;
/** How far before a crossing a vehicle that has to wait stops. */
const LINE_GAP = 0.15;
/** The width of the strip on each side of a crossing where people cross the street (0.20.0): a vehicle stops short of it, and never stands on it. */
export const ZEBRA = 0.5;
/** People step out onto a crossing only when the lights have shown green for this long, in seconds: whoever drove on before is gone from the strip. */
const STEADY = 0.6;
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

/**
 * The traffic lights, in seconds: a street keeps green for at least `green`
 * while the other one waits (or `urgent` when a vehicle that is running late
 * waits there), then shows amber for `amber`; after that both are red until
 * the crossing is empty. A street where a vehicle that is due somewhere is
 * about to go keeps green up to `hold`.
 */
export const LIGHTS = { green: 2.4, urgent: 0.6, amber: 0.8, hold: 6 };
/** What a vehicle that is due somewhere reckons a set of lights on its way may cost it, in seconds. */
const RED_LIGHT = 1.5;
/** How far before a crossing's line the lights see a vehicle coming that is due somewhere, or is in its way, in tiles. */
const DUE_SEEN = 6;
/** The share of vehicles that turn right at a crossing where they can. */
const TURNING = 0.22;
/** The kinds of vehicle that turn and overtake: buses and trucks keep to their street. */
const NIMBLE: readonly VehicleKind[] = ['car', 'taxi', 'van'];
/** How long a vehicle that means to turn waits at the line for room in the other street before it goes straight on instead, in seconds. */
const TURN_PATIENCE = 4;
/** The radius of a right turn: the kerb's corner is its middle. */
const BEND = CITY.streetWidth / 4;
/** How long the way round the corner is. */
const ARC = (Math.PI / 2) * BEND;
/** Overtaking: how far a vehicle travels while it moves over to the other lane or back. */
const SWERVE = 1.6;
/**
 * Room an overtaker needs in front of it, behind the vehicle it overtakes: to
 * be over in the other lane, tail and all, before it is level with it. It
 * stops that far back, and looks to overtake from at most `SPOT` further.
 */
const pullOut = (vehicle: Vehicle) => SWERVE + vehicle.length + 0.15;
const SPOT = 1.5;
/** How close a bus or a taxi is to its stop when those behind it start keeping back, in tiles. */
const STOPPING = 8;

export interface Lane {
  along: 'x' | 'z';
  /** Where the lane lies on the other axis. */
  at: number;
  direction: 1 | -1;
  /** Where a vehicle at 0 is on the lane's own axis: the lane is measured from there, in the way it is driven. */
  origin: number;
  length: number;
  /**
   * The crossings on the way, nearest first: the middle of each, measured
   * along the lane, and the lane of the cross street that a right turn there
   * leads into, with where the crossing's middle is along that one.
   */
  crossings: { s: number; id: number; right: { lane: number; s: number } | null }[];
  /** The lane of the same street that goes the other way. */
  oncoming: number;
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

/**
 * A right turn: the vehicle goes round the corner of crossing `id` from lane
 * `from`, where the bend starts at `start`, into lane `to`, where it ends at
 * `end`. It is in the queue of `from` until its tail is round the corner too,
 * and whoever follows it waits at the start of the bend until then: on the
 * way round its tail swings across the lane.
 */
export interface Turn {
  id: number;
  from: number;
  to: number;
  start: number;
  end: number;
}

/**
 * Overtaking the vehicle `passing`, which stands at the kerb: the overtaker
 * moves over to the other lane from `from` on (where its front was when it
 * set out), is past it when its middle is at `back`, where it moves back, and
 * is in its own lane again, tail and all, at `back + SWERVE` plus half its
 * length. All measured along its lane. Oncoming traffic stops short of where
 * it ends (see `wallAhead`).
 */
export interface Pass {
  passing: number;
  from: number;
  back: number;
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
  /** What it means to do at the next crossing, decided when it comes near, and when that was. */
  plan?: { id: number; turn: boolean; at: number };
  turn?: Turn;
  pass?: Pass;
  /** The vehicle that is overtaking this one: it stays where it is until that one is past. */
  passedBy?: number;
}

export type Light = 'green' | 'amber' | 'red';

/**
 * A side of a crossing where people cross the street, named by the axis of the
 * street they cross and the side of the crossing's middle the strip is on:
 * '+z' is the strip across the street that runs along z, on the side where z is larger.
 */
export type Edge = '+x' | '-x' | '+z' | '-z';

interface Crossing {
  /** The street whose vehicles are on it or about to be. */
  axis: 'x' | 'z' | null;
  holders: number;
  /** How many people are on the strip of each side (0.20.0). */
  foot: Record<Edge, number>;
  /** Since when each street has been waiting for it, and when that was last repeated. */
  asked: { x: number; z: number };
  seen: { x: number; z: number };
  /**
   * When a vehicle that has to be somewhere on time, or is in the way of one,
   * last waited for it, per street; and when one was last seen coming.
   */
  urgent: { x: number; z: number };
  due: { x: number; z: number };
  /** The lights: which street has them, at which stage, and since when. None where one of the two streets is closed. */
  lights: { green: 'x' | 'z'; stage: 'green' | 'amber' | 'clearing'; since: number } | null;
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
  /** The lanes nobody drives in: on the street the long building stands across. */
  closed: boolean[];
  /** Per lane, the crossing where everyone has to turn: the last one before the water, in a town by it. */
  ends: (number | null)[];
  /** Per lane, the crossing where it begins: the first one away from the water, in a town by it. Nobody comes in from its start. */
  begins: (number | null)[];
}

// --- The streets ---

function buildLanes(): { lanes: Lane[]; crossings: number } {
  const busy = busyStreets();
  const across = { x: busy.filter((s) => s.along === 'x'), z: busy.filter((s) => s.along === 'z') };
  const lanes: Lane[] = [];
  /** The street each lane is on. */
  const streetOf: number[] = [];
  for (const street of busy) {
    const others = street.along === 'x' ? across.z : across.x;
    const own = across[street.along].indexOf(street);
    for (const direction of [1, -1] as const) {
      // The lane to the driver's right of the middle line.
      const side = street.along === 'x' ? direction : -direction;
      const length = STREET.length[street.along] + 2 * MARGIN;
      const from = STREET.from[street.along] - MARGIN;
      const origin = direction > 0 ? from : from + length;
      streetOf.push(street.at);
      lanes.push({
        along: street.along,
        at: street.at + side * (CITY.streetWidth / 4),
        direction,
        origin,
        length,
        crossings: others
          .map((other, n) => ({ s: (other.at - origin) * direction, id: street.along === 'x' ? own * across.z.length + n : n * across.z.length + own, right: null }))
          .sort((a, b) => a.s - b.s),
        oncoming: -1,
      });
    }
  }
  lanes.forEach((lane, l) => {
    lane.oncoming = lanes.findIndex((other, o) => o !== l && other.along === lane.along && streetOf[o] === streetOf[l]);
    // Turning right: heading along x the right hand is the way z goes up, so the turn leads into the cross street's
    // lane in the same direction; heading along z it leads into the lane of the cross street the other way.
    for (const crossing of lane.crossings) {
      const at = lane.origin + lane.direction * crossing.s;
      const along = lane.along === 'x' ? 'z' : 'x';
      const direction = lane.along === 'x' ? lane.direction : -lane.direction;
      const to = lanes.findIndex((other, o) => other.along === along && other.direction === direction && Math.abs(streetOf[o]! - at) < 0.01);
      const there = lanes[to]?.crossings.find((c) => c.id === crossing.id);
      crossing.right = there ? { lane: to, s: there.s } : null;
    }
  });
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
 * after; without anyone to wait for it stays `stay`. All in hours on the clock, as `townHours`.
 */
export const TAXI = { lead: townHours(1.9), early: townHours(0.2), stay: townHours(0.1), patience: townHours(1) };

/**
 * The bus is due at the stop at a quarter to the hour. It leaves the edge of
 * town `lead` before that, aims to be there `early`, and stays until `stay`
 * after: all in hours on the clock, the durations as `townHours`. Nothing else
 * comes into town by its road for `clear` before it does.
 */
export const BUS = { lead: townHours(3.1), early: townHours(0.2), stay: townHours(0.1), due: 0.75, clear: townHours(0.4) };

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

// --- Crossings and their lights ---

const otherAxis = (axis: 'x' | 'z') => (axis === 'x' ? 'z' : 'x');

/** Whether a crossing lets a vehicle of a street onto it now, room on the other side left aside. */
function open(crossing: Crossing, axis: 'x' | 'z'): boolean {
  const { lights } = crossing;
  if (lights) return lights.stage === 'green' && lights.green === axis && (crossing.holders === 0 || crossing.axis === axis);
  return crossing.axis === null || crossing.axis === axis;
}

/** A vehicle of a street is on a crossing, or keeps the other street off it. */
function hold(crossing: Crossing, axis: 'x' | 'z'): void {
  crossing.axis = axis;
  crossing.holders++;
}

/**
 * Whether a vehicle may drive onto a crossing now: on green, with `room` to
 * stand clear of it where it is going. If not for want of its turn, it is
 * noted as waiting, which is what turns the lights.
 */
function take(traffic: Traffic, crossing: Crossing, id: number, axis: 'x' | 'z', vehicle: Vehicle, room: boolean, first: boolean): boolean {
  // No room to stand clear of the crossing on the other side: don't even ask. One that is due somewhere does say
  // it is there, so that its green lasts until it can go.
  if (!room) {
    if (first) crossing.due[axis] = traffic.time;
    return false;
  }
  const other = otherAxis(axis);
  const fresh = traffic.time - STALE;
  const theirs = crossing.seen[other] >= fresh ? crossing.asked[other] : null;
  const mine = crossing.seen[axis] >= fresh ? crossing.asked[axis] : null;
  // Without lights (where one street is closed) whoever asked first goes first. A vehicle that has to be somewhere
  // on time, and whoever is in its way, does not wait its turn there; at lights it gets green sooner.
  const giveWay = !first && crossing.urgent[other] >= fresh;
  const granted = crossing.lights
    ? open(crossing, axis)
    : !giveWay &&
      (crossing.axis === null
        ? first || theirs === null || (mine !== null && mine <= theirs)
        : crossing.axis === axis && (first || theirs === null || traffic.time - theirs < PATIENCE));
  if (first && !granted) crossing.urgent[axis] = crossing.due[axis] = traffic.time;
  if (!granted) {
    if (mine === null) crossing.asked[axis] = traffic.time;
    crossing.seen[axis] = traffic.time;
    return false;
  }
  hold(crossing, axis);
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

/** How many people are on the strips across a street of a crossing (the one that runs along `axis`). */
const onFoot = (crossing: Crossing, axis: 'x' | 'z') => crossing.foot[`+${axis}`] + crossing.foot[`-${axis}`];

/**
 * The lights go on to the next stage: a street that has had green for long
 * enough while the other one waits gets amber, then both get red, and once
 * the crossing is empty the other street gets green.
 */
function runLights(traffic: Traffic): void {
  const fresh = traffic.time - STALE;
  for (const crossing of traffic.crossings) {
    const { lights } = crossing;
    if (!lights) continue;
    const waiting = otherAxis(lights.green);
    const long = traffic.time - lights.since;
    if (lights.stage === 'green') {
      // A bus or a taxi that is due somewhere gets green sooner, and keeps it while it is about to go.
      const late = crossing.due[waiting] >= fresh;
      // Someone on foot who is crossing the other street keeps it as well, for no longer than a bus would.
      const keep = (crossing.due[lights.green] >= fresh || onFoot(crossing, waiting) > 0) && long < LIGHTS.hold;
      if (!keep && crossing.seen[waiting] >= fresh && long >= (late ? LIGHTS.urgent : LIGHTS.green)) Object.assign(lights, { stage: 'amber', since: traffic.time });
    } else if (lights.stage === 'amber') {
      if (long >= LIGHTS.amber) Object.assign(lights, { stage: 'clearing', since: traffic.time });
    } else if (crossing.holders === 0 && onFoot(crossing, waiting) === 0) {
      Object.assign(lights, { green: waiting, stage: 'green', since: traffic.time });
    }
  }
}

/** What the lights of a crossing show the vehicles of a street; null where the crossing has none. */
export function lightFor(traffic: Traffic, id: number, axis: 'x' | 'z'): Light | null {
  const lights = traffic.crossings[id]?.lights;
  if (!lights) return null;
  if (lights.green !== axis || lights.stage === 'clearing') return 'red';
  return lights.stage === 'amber' ? 'amber' : 'green';
}

// --- People crossing the street (0.20.0) ---

/** The middle of every crossing of two streets that carry traffic, by its id. */
export const CROSSINGS: readonly { id: number; x: number; z: number }[] = (() => {
  const found = new Map<number, { id: number; x: number; z: number }>();
  for (const lane of LANES) {
    for (const c of lane.crossings) {
      const at = lane.origin + lane.direction * c.s;
      const middle = found.get(c.id) ?? { id: c.id, x: NaN, z: NaN };
      middle[lane.along] = at;
      found.set(c.id, middle);
    }
  }
  return [...found.values()];
})();

/** The crossing whose middle is at a point, or null. */
export const crossingAt = (x: number, z: number): number | null => CROSSINGS.find((c) => Math.abs(c.x - x) < 0.01 && Math.abs(c.z - z) < 0.01)?.id ?? null;

/** The ground a strip covers: the crossing's side, as long as the street is wide and `ZEBRA` deep. */
function stripOf(id: number, edge: Edge): { x1: number; z1: number; x2: number; z2: number } {
  const c = CROSSINGS.find((x) => x.id === id)!;
  const sign = edge[0] === '+' ? 1 : -1;
  const [from, to] = [sign * HALF, sign * (HALF + ZEBRA)].sort((a, b) => a - b) as [number, number];
  return edge[1] === 'z'
    ? { x1: c.x - HALF, x2: c.x + HALF, z1: c.z + from, z2: c.z + to }
    : { x1: c.x + from, x2: c.x + to, z1: c.z - HALF, z2: c.z + HALF };
}

/** Whether a vehicle covers any of the ground of a strip, or comes within `margin` of it. */
function vehicleOnStrip(traffic: Traffic, id: number, edge: Edge, margin: number): boolean {
  const strip = stripOf(id, edge);
  return vehiclesIn(traffic).some((vehicle) => {
    const { x, z, angle } = placeOf(traffic, vehicle);
    const [c, s] = [Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle))];
    const hx = (c * vehicle.length) / 2 + (s * vehicle.width) / 2;
    const hz = (s * vehicle.length) / 2 + (c * vehicle.width) / 2;
    return x + hx > strip.x1 - margin && x - hx < strip.x2 + margin && z + hz > strip.z1 - margin && z - hz < strip.z2 + margin;
  });
}

/** The lights of a crossing, or null where they are missing: people cross there only at lights. */
export const hasLights = (traffic: Traffic, id: number) => traffic.crossings[id]?.lights != null;

/**
 * Whether someone may step out onto the strip of a side of a crossing now:
 * the street they walk along has had a steady green (never amber) and the
 * one they cross is red; nobody drives round a corner onto the strip; and no
 * vehicle stands on it or is close to it.
 */
export function mayStepOut(traffic: Traffic, id: number, edge: Edge): boolean {
  const lights = traffic.crossings[id]?.lights;
  if (!lights) return false;
  const walking = otherAxis(edge[1] as 'x' | 'z');
  if (lights.stage !== 'green' || lights.green !== walking || traffic.time - lights.since < STEADY) return false;
  for (const vehicle of vehiclesIn(traffic)) if (vehicle.turn?.id === id && edgeOf(traffic.lanes[vehicle.turn.to]!) === edge) return false;
  return !vehicleOnStrip(traffic, id, edge, 0.3);
}

/** Someone on foot who waits at a kerb asks for the lights to change for them, as a vehicle that waits does. */
export function askToCross(traffic: Traffic, id: number, edge: Edge): void {
  const crossing = traffic.crossings[id];
  if (crossing?.lights) crossing.seen[otherAxis(edge[1] as 'x' | 'z')] = traffic.time;
}

/** Someone steps onto the strip of a side of a crossing, or off it. */
export function stepOut(traffic: Traffic, id: number, edge: Edge): void {
  traffic.crossings[id]!.foot[edge]++;
}
export function stepOff(traffic: Traffic, id: number, edge: Edge): void {
  const crossing = traffic.crossings[id]!;
  crossing.foot[edge] = Math.max(0, crossing.foot[edge] - 1);
}

/**
 * The traffic lights to draw: one before every crossing that has lights, on
 * the right of each lane that is driven up to it, facing the drivers. `x` and
 * `z` are the foot of its post.
 */
export function signalsOf(traffic: Traffic): { id: number; axis: 'x' | 'z'; x: number; z: number; angle: number }[] {
  return traffic.lanes.flatMap((lane, l) => {
    if (traffic.closed[l]) return [];
    const right = rightOf(lane);
    const angle = angleOf(lane) + Math.PI;
    const from = lane.crossings.find((c) => c.id === traffic.begins[l])?.s ?? -Infinity;
    return lane.crossings
      .filter((c) => traffic.crossings[c.id]!.lights && c.s > from)
      .map((c) => {
        const at = laneAt(lane, c.s - HALF - 0.3);
        const out = CITY.streetWidth / 4 + 0.35;
        return { id: c.id, axis: lane.along, x: at.x + right.x * out, z: at.z + right.z * out, angle };
      });
  });
}

// --- Turning and overtaking ---

/** The way a lane is driven, and the driver's right hand, as directions on the ground. */
const headingOf = (lane: Lane) => (lane.along === 'x' ? { x: lane.direction, z: 0 } : { x: 0, z: lane.direction });
function rightOf(lane: Lane): { x: number; z: number } {
  const h = headingOf(lane);
  return { x: -h.z, z: h.x };
}
/** The strip a vehicle that leaves a lane's crossing drives over on the way out: the side of the crossing the lane is driven towards. */
const edgeOf = (lane: Lane): Edge => `${lane.direction > 0 ? '+' : '-'}${lane.along}`;

/** The angle around the vertical of a vehicle driving a lane. */
const angleOf = (lane: Lane) => (lane.along === 'x' ? (lane.direction > 0 ? 0 : Math.PI) : lane.direction > 0 ? -Math.PI / 2 : Math.PI / 2);

/**
 * What a vehicle means to do at a crossing: turn right (true) or go straight
 * on. It is decided once, when it comes near; one that has waited too long at
 * the line for room round the corner goes straight on instead, unless the
 * street ends there.
 */
function planFor(traffic: Traffic, l: number, vehicle: Vehicle, crossing: Lane['crossings'][number]): boolean {
  const must = traffic.ends[l] === crossing.id;
  if (vehicle.plan?.id !== crossing.id) {
    // The draw is made for everyone, so that one vehicle's choice does not change the next one's.
    const draw = traffic.rng.next();
    // Not into a street that ends right there, at the water.
    const right = crossing.right;
    const can = right !== null && !traffic.closed[right.lane] && traffic.ends[right.lane] !== crossing.id && !vehicle.halt && NIMBLE.includes(vehicle.kind) && !busComing(traffic, right);
    vehicle.plan = { id: crossing.id, turn: must || (can && draw < TURNING), at: traffic.time };
  }
  if (vehicle.plan.turn && !must && traffic.time - vehicle.plan.at > TURN_PATIENCE) vehicle.plan.turn = false;
  return vehicle.plan.turn;
}

/** Whether the bus is on its way to its stop in a lane, still short of a point of it: nobody turns in ahead of it. */
const busComing = (traffic: Traffic, at: { lane: number; s: number }) =>
  traffic.queues[at.lane]!.some((v) => v.kind === 'bus' && v.halt?.state === 'ahead' && v.s < at.s);

/** Whether the street a right turn leads into has room for the vehicle past the crossing, after those already turning into it from this lane. */
function roomRound(traffic: Traffic, l: number, vehicle: Vehicle, right: { lane: number; s: number }): boolean {
  let free = wallAhead(traffic, right.lane, right.s);
  for (const v of traffic.queues[right.lane]!) if (v.s > right.s) free = Math.min(free, v.s - v.length / 2);
  let taken = 0;
  for (const v of traffic.queues[l]!) if (v !== vehicle && v.turn?.to === right.lane && v.lane === l) taken += v.length + GAP;
  return free - (right.s + HALF + ZEBRA) - taken >= vehicle.length + GAP;
}

/**
 * How far a vehicle going round a corner may go, measured along the lane it
 * came from: up to the nearest one past the corner in the street it turns into.
 */
function bendLimit(traffic: Traffic, vehicle: Vehicle): number {
  const turn = vehicle.turn!;
  // Measured along the lane it turns into, past the crossing; then along the way round.
  const along = (s: number) => s - turn.end + turn.start + ARC;
  let limit = along(wallAhead(traffic, turn.to, turn.end - HALF)) - vehicle.length / 2 - GAP;
  for (const v of traffic.queues[turn.to]!) {
    if (v.s <= turn.end - HALF) continue;
    limit = Math.min(limit, along(v.s - v.length / 2) - vehicle.length / 2 - GAP);
  }
  return limit;
}

/** A vehicle that is round the corner, tail and all, leaves the queue of the lane it came from for that of the street it turned into, and the crossing. */
function turnInto(traffic: Traffic, vehicle: Vehicle): void {
  const turn = vehicle.turn!;
  const from = traffic.queues[turn.from]!;
  from.splice(from.indexOf(vehicle), 1);
  vehicle.lane = turn.to;
  vehicle.s = turn.end + (vehicle.s - turn.start - ARC);
  vehicle.turn = undefined;
  vehicle.holds = vehicle.holds.filter((id) => id !== turn.id);
  release(traffic, turn.id);
  const to = traffic.queues[turn.to]!;
  const k = to.findIndex((v) => v.s < vehicle.s);
  to.splice(k < 0 ? to.length : k, 0, vehicle);
}

/** Whether an overtaker is over in the other lane altogether, its tail included, and not yet on its way back. */
const over = (vehicle: Vehicle) => vehicle.pass !== undefined && vehicle.s - vehicle.length / 2 >= vehicle.pass.from + SWERVE && vehicle.s < vehicle.pass.back;

/**
 * The vehicle a vehicle follows in its lane: the one in front, leaving out an
 * overtaker that is over in the other lane, and for an overtaker the one in
 * front of the vehicle it overtakes.
 */
function leaderOf(queue: Vehicle[], i: number): Vehicle | undefined {
  const vehicle = queue[i]!;
  let j = i - 1;
  if (vehicle.pass) {
    const k = queue.findIndex((v) => v.id === vehicle.pass!.passing);
    if (k >= 0 && k < i) j = k - 1;
  }
  for (; j >= 0; j--) if (!over(queue[j]!)) return queue[j];
  return undefined;
}

/** How far along its lane an overtaker's front reaches while any of it is still out in the other lane, and a little more. */
const reachOf = (vehicle: Vehicle) => vehicle.pass!.back + SWERVE + vehicle.length + 0.1;

/**
 * Where the nearest overtaker ahead in the other lane ends, measured along
 * this lane, past a point of it: oncoming traffic stays short of that until
 * the overtaker is back in its own lane. Infinity if there is none.
 */
function wallAhead(traffic: Traffic, l: number, s: number): number {
  const lane = traffic.lanes[l]!;
  if (lane.oncoming < 0) return Infinity;
  const other = traffic.lanes[lane.oncoming]!;
  let wall = Infinity;
  for (const v of traffic.queues[lane.oncoming]!) {
    if (!v.pass) continue;
    const at = (other.origin + other.direction * reachOf(v) - lane.origin) * lane.direction;
    if (at > s) wall = Math.min(wall, at);
  }
  return wall;
}

/**
 * Overtakes the vehicle in front if it stands at the kerb and everything
 * allows it: there is room to come back in ahead of it, every crossing it
 * drives over is on green for it (it then holds them, so that the side
 * streets keep waiting), nobody is in the other lane where it is going, and
 * everyone coming the other way can still stop short of where it will be.
 */
function overtake(traffic: Traffic, l: number, vehicle: Vehicle, ahead: Vehicle): void {
  if (!NIMBLE.includes(vehicle.kind) || vehicle.halt || vehicle.turn || ahead.halt?.state !== 'standing' || ahead.passedBy !== undefined || ahead.pass) return;
  const lane = traffic.lanes[l]!;
  const gap = ahead.s - ahead.length / 2 - (vehicle.s + vehicle.length / 2);
  if (gap < pullOut(vehicle) || gap > pullOut(vehicle) + SPOT || lane.oncoming < 0) return;
  const back = ahead.s + ahead.length / 2 + GAP + vehicle.length / 2;
  const done = back + SWERVE + vehicle.length / 2;
  const queue = traffic.queues[l]!;
  // Room to come back in, ahead of the one it overtakes.
  const next = leaderOf(queue, queue.indexOf(ahead));
  if (next && next.s - next.length / 2 - GAP < done + vehicle.length / 2) return;
  const end = done + vehicle.length / 2 + LINE_GAP + 0.2;
  const across = lane.crossings.filter((c) => c.s + HALF > vehicle.s - vehicle.length / 2 && c.s - HALF < end && !vehicle.holds.includes(c.id));
  if (across.some((c) => traffic.ends[l] === c.id || (vehicle.plan?.id === c.id && vehicle.plan.turn))) return;
  if (!across.every((c) => open(traffic.crossings[c.id]!, lane.along))) return;
  // Oncoming: nobody where it is going, and everyone else able to stop short of it, a long frame included.
  const wall = back + SWERVE + vehicle.length + 0.1 + GAP;
  const oncoming = traffic.lanes[lane.oncoming]!;
  for (const v of traffic.queues[lane.oncoming]!) {
    const p = (oncoming.origin + oncoming.direction * v.s - lane.origin) * lane.direction;
    if (p + v.length / 2 < vehicle.s - vehicle.length / 2) continue;
    if (p - v.length / 2 - wall < (v.v * v.v) / (2 * BRAKING) + v.v * 0.15 + 0.05) return;
  }
  for (const c of across) {
    hold(traffic.crossings[c.id]!, lane.along);
    vehicle.holds.push(c.id);
  }
  vehicle.pass = { passing: ahead.id, from: vehicle.s + vehicle.length / 2, back };
  ahead.passedBy = vehicle.id;
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
  // Every set of lights on the way may cost a moment.
  const lights = traffic.lanes[vehicle.lane]!.crossings.filter((c) => c.s > vehicle.s && c.s < halt.s && traffic.crossings[c.id]!.lights).length;
  const seconds = Math.max((halt.due - traffic.hours) * HOUR_SECONDS - lights * RED_LIGHT, 0.1);
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
  runLights(traffic);
  /** Those that are round a corner this step: they change lanes after every lane has moved. */
  const turned: Vehicle[] = [];

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
      let leader = leaderOf(queue, i);
      if (leader && !vehicle.pass) {
        overtake(traffic, l, vehicle, leader);
        if (vehicle.pass) leader = leaderOf(queue, i);
      }
      let limit = leader ? leader.s - leader.length / 2 - vehicle.length / 2 - GAP : Infinity;
      // The one in front is going round a corner: wait at the start of the bend until it is round.
      if (leader?.turn) limit = Math.min(limit, leader.turn.start - GAP - vehicle.length / 2);
      // Someone overtaking comes the other way in this lane: stop short of where they will be.
      const wall = wallAhead(traffic, l, vehicle.s);
      limit = Math.min(limit, wall - GAP - vehicle.length / 2);
      // The one in front stops at the kerb, or is about to: keep far enough back to pull out and overtake it.
      const stopping = leader?.halt !== undefined && leader.halt.state !== 'done' && leader.halt.s - leader.s < STOPPING;
      if (leader && stopping && !vehicle.pass && NIMBLE.includes(vehicle.kind) && !vehicle.halt) limit = Math.min(limit, leader.s - leader.length / 2 - pullOut(vehicle) - 0.05 - vehicle.length / 2);
      // Round a corner: the lane it came from no longer matters once it is in the bend.
      const turn = vehicle.turn;
      if (turn) limit = Math.min(vehicle.s < turn.start ? limit : Infinity, bendLimit(traffic, vehicle));
      // Someone is overtaking it: it stays where it is until they are past.
      if (vehicle.passedBy !== undefined) limit = Math.min(limit, vehicle.s);
      const halt = vehicle.halt;
      if (halt && halt.state !== 'done') limit = Math.min(limit, halt.s);
      const first = push[i]! > 0;

      if (!turn) {
        for (const crossing of lane.crossings) {
          if (vehicle.holds.includes(crossing.id)) continue;
          const line = crossing.s - HALF - ZEBRA - vehicle.length / 2 - LINE_GAP;
          // Behind it already, or too far ahead to think about.
          if (vehicle.s > line + LINE_GAP / 2) continue;
          // A bus or a taxi that is due, and whoever is in its way, are seen coming by the lights from a little way off.
          if (first && line - vehicle.s < DUE_SEEN) traffic.crossings[crossing.id]!.due[lane.along] = traffic.time;
          if (limit <= line || line - vehicle.s > (vehicle.v * vehicle.v) / (2 * BRAKING) + ASK) break;
          const turning = planFor(traffic, l, vehicle, crossing);
          // Someone is crossing the street it turns into: it waits before the corner until they are over.
          if (turning && traffic.crossings[crossing.id]!.foot[edgeOf(traffic.lanes[crossing.right!.lane]!)] > 0) {
            limit = line;
            break;
          }
          const room = turning ? roomRound(traffic, l, vehicle, crossing.right!) : Math.min(leader ? leader.s - leader.length / 2 : Infinity, wall) - GAP >= crossing.s + HALF + ZEBRA + vehicle.length;
          if (take(traffic, traffic.crossings[crossing.id]!, crossing.id, lane.along, vehicle, room, first)) {
            if (!turning) continue;
            vehicle.turn = { id: crossing.id, from: l, to: crossing.right!.lane, start: crossing.s - HALF, end: crossing.right!.s + HALF };
            break;
          }
          limit = line;
          break;
        }
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
        const id = vehicle.holds[h]!;
        // The corner it is going round is let go of once it is round.
        if (vehicle.turn?.id === id) continue;
        const held = lane.crossings.find((c) => c.id === id);
        if (held && vehicle.s - vehicle.length / 2 >= held.s + HALF) {
          release(traffic, id);
          vehicle.holds.splice(h, 1);
        }
      }
      if (vehicle.turn && vehicle.s - vehicle.length / 2 >= vehicle.turn.start + ARC) turned.push(vehicle);

      const pass = vehicle.pass;
      if (pass) {
        // Past it: it takes its place ahead of it in the lane, and the other one may drive on.
        const k = queue.findIndex((v) => v.id === pass.passing);
        if (k >= 0 && k < i && vehicle.s >= pass.back) {
          queue.splice(i, 1);
          queue.splice(k, 0, vehicle);
          queue[k + 1]!.passedBy = undefined;
        }
        if (vehicle.s >= pass.back + SWERVE + vehicle.length / 2) vehicle.pass = undefined;
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
      const gone = queue.shift()!;
      for (const id of gone.holds) release(traffic, id);
      traffic.left++;
    }

    // The road the bus comes in by is left clear for a moment before it does.
    const busSoon = l === BUS_STOP.lane && traffic.hours >= traffic.nextBus + BUS.due - BUS.lead - BUS.clear;
    if (traffic.time >= traffic.nextSpawn[l]! && !busSoon) {
      const { mix, every } = traffic.rules;
      let pick = traffic.rng.next();
      const kind = (Object.keys(mix) as (keyof typeof mix)[]).find((k) => (pick -= mix[k]) < 0) ?? 'car';
      if (enter(traffic, l, kind)) traffic.nextSpawn[l] = traffic.time + every * (0.3 + 1.4 * traffic.rng.next());
    }
  });

  for (const vehicle of turned) turnInto(traffic, vehicle);
}

/**
 * The traffic of a game as it is at a time on the office clock (see
 * `clockHours`): the streets are filled by letting a few hours go by first,
 * so buses that are due are on their way. Nothing drives in a street that the
 * office's own block lies across: the side street the long building stands
 * on. In a town by the water (`water`) the side streets end at the shore:
 * nobody comes up them from there, and everyone going down one turns there.
 */
export function createTraffic(seed: number, hours: number, rules: Site['traffic'] = SITES.capital.traffic, building: Building = BUILDINGS.standard, water = false): Traffic {
  const before = hours - WARM_UP;
  const busy = busyStreets(building);
  const closed = LANES.map((lane) => !busy.some((street) => street.along === lane.along && Math.abs(street.at - lane.at) < CITY.streetWidth / 2));
  // The crossing with the street along the shore, on a side street.
  const shoreline = STREET.from.z + STREET.length.z;
  const shore = (lane: Lane) => lane.crossings.find((c) => Math.abs(lane.origin + lane.direction * c.s - shoreline) < 0.01)?.id ?? null;
  const side = (lane: Lane) => water && lane.along === 'z';
  const rng = new Rng(seed ^ 0x7a3c19);
  // Lights where both streets carry traffic, each crossing at a moment of its own in its round.
  const driven = Array.from({ length: TOWN.crossings }, () => ({ x: false, z: false }));
  LANES.forEach((lane, l) => {
    if (!closed[l]) for (const c of lane.crossings) driven[c.id]![lane.along] = true;
  });
  const traffic: Traffic = {
    lanes: [...LANES],
    queues: LANES.map(() => []),
    crossings: driven.map((axes) => ({
      axis: null,
      holders: 0,
      foot: { '+x': 0, '-x': 0, '+z': 0, '-z': 0 },
      asked: { x: 0, z: 0 },
      seen: { x: -Infinity, z: -Infinity },
      urgent: { x: -Infinity, z: -Infinity },
      due: { x: -Infinity, z: -Infinity },
      lights: axes.x && axes.z ? { green: rng.next() < 0.5 ? 'x' : 'z', stage: 'green', since: -rng.next() * LIGHTS.green } : null,
    })),
    rng,
    time: 0,
    hours: before,
    nextSpawn: [],
    nextId: 1,
    nextBus: Math.ceil(before - BUS.due + BUS.lead),
    orders: [],
    rules,
    left: 0,
    closed,
    ends: LANES.map((lane) => (side(lane) && lane.direction > 0 ? shore(lane) : null)),
    begins: LANES.map((lane) => (side(lane) && lane.direction < 0 ? shore(lane) : null)),
  };
  traffic.nextSpawn = LANES.map((_, l) => (closed[l] || traffic.begins[l] !== null ? Infinity : 1) * traffic.rng.next() * rules.every);
  const steps = Math.ceil((WARM_UP * HOUR_SECONDS) / (2 * STEP));
  for (let n = 1; n <= steps; n++) {
    traffic.hours = before + (WARM_UP * n) / steps;
    advance(traffic, 2 * STEP);
  }
  return traffic;
}

/** Hours on the clock that go by before a new town is shown: longer than a bus needs to reach its stop. */
const WARM_UP = BUS.lead + townHours(1.5);

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

/** How far over in the other lane an overtaker is at a point of its own lane: it moves over and back gently. */
function swerve(pass: Pass, s: number): number {
  const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  return (CITY.streetWidth / 2) * Math.min(ease((s - pass.from) / SWERVE), 1 - ease((s - pass.back) / SWERVE));
}

/** A point of a vehicle, `offset` ahead of its middle along its way: round a corner, or beside its lane while it overtakes. */
function pointOf(traffic: Traffic, vehicle: Vehicle, offset: number): { x: number; z: number } {
  const { turn, pass } = vehicle;
  let lane = traffic.lanes[vehicle.lane]!;
  let s = vehicle.s + offset;
  if (turn) {
    const from = traffic.lanes[turn.from]!;
    // How far round it is, measured from where the bend starts: back along the lane it came from, or on into the next.
    const u = vehicle.s + offset - turn.start;
    if (u >= ARC) return laneAt(traffic.lanes[turn.to]!, turn.end + u - ARC);
    if (u > 0) {
      // A quarter circle round the kerb's corner, from the way in to the way out.
      const start = laneAt(from, turn.start);
      const [h, r, a] = [headingOf(from), rightOf(from), u / BEND];
      return {
        x: start.x + BEND * (r.x * (1 - Math.cos(a)) + h.x * Math.sin(a)),
        z: start.z + BEND * (r.z * (1 - Math.cos(a)) + h.z * Math.sin(a)),
      };
    }
    [lane, s] = [from, turn.start + u];
  }
  const at = laneAt(lane, s);
  if (!pass) return at;
  // Over to the left, where the other lane is.
  const r = rightOf(lane);
  const out = swerve(pass, s);
  return { x: at.x - r.x * out, z: at.z - r.z * out };
}

/**
 * Where a vehicle is: its middle in floor tiles, and the way it points as an
 * angle around the vertical. Round a corner or overtaking, its front and its
 * rear each follow the way, and it points from the one to the other.
 */
export function placeOf(traffic: Traffic, vehicle: Vehicle): { x: number; z: number; angle: number } {
  const lane = traffic.lanes[vehicle.lane]!;
  if (!vehicle.turn && !vehicle.pass) return { ...laneAt(lane, vehicle.s), angle: angleOf(lane) };
  const rear = pointOf(traffic, vehicle, -vehicle.length / 2);
  const front = pointOf(traffic, vehicle, vehicle.length / 2);
  return { x: (rear.x + front.x) / 2, z: (rear.z + front.z) / 2, angle: Math.atan2(-(front.z - rear.z), front.x - rear.x) };
}

/** The bus that is standing at the stop, if one is. */
export const busAtStop = (traffic: Traffic): Vehicle | undefined => traffic.queues[BUS_STOP.lane]!.find((v) => v.kind === 'bus' && v.halt?.state === 'standing');
