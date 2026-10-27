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
import { BUILDINGS, type Building } from '../config/office';
import { OFFICE_DAY } from '../config/world';
import { Rng } from '../sim/rng';
import { CITY, type Tone } from './assets';
import { lotOf, wayIn, wayOut, type Lot } from './parking';
import { SITES, type Site } from './sites';
import { CAPITAL, type Layout, type Stop } from './townLayout';

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
/**
 * Room an overtaker needs in front of it, behind the vehicle it overtakes: to
 * be over in the other lane, tail and all, before it is level with it. It
 * stops that far back, and looks to overtake from at most `SPOT` further.
 */
const pullOut = (traffic: Traffic, vehicle: Vehicle) => traffic.roads.swerve + vehicle.length + 0.15;
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
  /** For a car on its way to the company's parking lot (0.20.0): it turns in as it gets there instead of waiting; `key` is its journey. */
  park?: boolean;
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
  /** A van of the company's, out on a news trip (0.20.0): it is drawn with its dish. */
  news?: true;
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
  /** The streets of the town (see `roadsOf`). */
  roads: Roads;
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
  /** The building the town is laid out round, and the company's parking lot beside it (0.20.0). */
  building: Building;
  lot: LotState;
}

/**
 * A car in the company's parking lot (0.20.0): on its way into a bay, parked,
 * or on its way out. It is on private ground, not in a lane, and drives the
 * lot's own ways (parking.ts) one behind the other.
 */
export interface LotCar {
  /** The journey of the day it belongs to: the same on the way in and the way out. */
  key: string;
  bay: number;
  kind: 'car' | 'van';
  tone: Tone;
  state: 'arriving' | 'parked' | 'leaving';
  x: number;
  z: number;
  angle: number;
  /** The points it still drives to. */
  path: [number, number][];
  /** Backing out of its bay: it keeps the way it points until it is in the aisle. */
  backing: boolean;
  /** Until when it stays at the most, in hours that keep counting: a car of a day gone by is not there any more. */
  until: number;
  /** A news van of the company's (0.20.0). */
  news?: true;
}

/** A car ordered to the lot: whose, to which bay, and when it should have parked. */
export interface CarOrder {
  key: string;
  bay: number;
  kind: 'car' | 'van';
  news?: true;
  due: number;
  /** Until when the car stays in its bay at the most (see `LotCar`). */
  until: number;
  sent: boolean;
}

export interface LotState {
  /** The lot's ground and bays. */
  ground: Lot;
  /** The lane of the street beside it that is driven into the lot and out of it, or null where nobody drives that street. */
  lane: number | null;
  /** Where along that lane a car stands to turn in, and where one that has come out joins it: the middle of the car. For each of the lot's gates (parking.ts); `turnIn` and `joinAt` are those of the first. */
  turns: number[];
  joins: number[];
  turnIn: number;
  joinAt: number;
  cars: LotCar[];
  orders: CarOrder[];
}

// --- The streets ---

function buildLanes(layout: Layout): { lanes: Lane[]; crossings: number } {
  const busy = layout.busy(BUILDINGS.standard);
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
      const length = layout.length[street.along] + 2 * MARGIN;
      const from = layout.from[street.along] - MARGIN;
      const origin = direction > 0 ? from : from + length;
      streetOf.push(street.at);
      lanes.push({
        along: street.along,
        at: street.at + side * (layout.streetWidth / 4),
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

/** A place where the bus or a taxi stops: its lane, where the middle of the vehicle stands, and where its passengers stand on the pavement. */
export interface StopPlace {
  lane: number;
  x: number;
  z: number;
  s: number;
  wait: { x: number; z: number };
}

/**
 * The streets of a town as the traffic drives them (townLayout.ts): the lanes
 * of the streets that carry traffic, the middle of every crossing by its id,
 * the bus stop and the taxi stand, and the sizes that follow from how wide
 * the streets are. Built once for a layout.
 */
export interface Roads {
  layout: Layout;
  lanes: Lane[];
  /** The middle of every crossing of two streets that carry traffic, by its id. */
  crossings: { id: number; x: number; z: number }[];
  /** How many crossings there are, ids counted from 0. */
  count: number;
  /**
   * The bus stop: on the reception's street, on the office's side. `x` and `z`
   * are where the middle of the bus stands; `wait` is where its passengers
   * stand on the pavement.
   */
  busStop: StopPlace;
  /**
   * The taxi stand: on the reception's street, at the entrance. `x` and
   * `z` are where the middle of a taxi stands; `wait` is where its passenger
   * gets in or out, on the pavement.
   */
  taxiStand: StopPlace;
  /** Half the width of a street: a crossing reaches this far from its middle. */
  half: number;
  /** The radius of a right turn, the kerb's corner being its middle, and how long the way round the corner is. */
  bend: number;
  arc: number;
  /** Overtaking: how far a vehicle travels while it moves over to the other lane or back. */
  swerve: number;
}

const built = new Map<Layout, Roads>();

/** The streets of a town, as the traffic drives them. */
export function roadsOf(layout: Layout = CAPITAL): Roads {
  let roads = built.get(layout);
  if (!roads) {
    roads = buildRoads(layout);
    built.set(layout, roads);
  }
  return roads;
}

function buildRoads(layout: Layout): Roads {
  const { lanes, crossings: count } = buildLanes(layout);
  const found = new Map<number, { id: number; x: number; z: number }>();
  for (const lane of lanes) {
    for (const c of lane.crossings) {
      const at = lane.origin + lane.direction * c.s;
      const middle = found.get(c.id) ?? { id: c.id, x: NaN, z: NaN };
      middle[lane.along] = at;
      found.set(c.id, middle);
    }
  }
  const sw = layout.streetWidth;
  const bend = sw / 4;
  const own = layout.own(BUILDINGS.standard);
  /** The place of a stop: in the lane on the office's side of its street. */
  const stopPlace = (stop: Stop): StopPlace => {
    const index = lanes.findIndex((lane) => lane.along === stop.along && Math.abs(lane.at - stop.at) < sw / 2 && nearOffice(lane, stop.at, own));
    if (index < 0) throw new Error(`No lane beside the office on ${stop.along} ${stop.at}`);
    const lane = lanes[index]!;
    const middle = stop.along === 'x' ? own.z + own.d / 2 : own.x + own.w / 2;
    const side = Math.sign(middle - stop.at);
    const out = sw / 4 + 0.45;
    const [x, z] = stop.along === 'x' ? [stop.pos, lane.at] : [lane.at, stop.pos];
    return { lane: index, x, z, s: along(lane, { x, z }), wait: stop.along === 'x' ? { x, z: z + side * out } : { x: x + side * out, z } };
  };
  return {
    layout,
    lanes,
    crossings: [...found.values()],
    count,
    busStop: stopPlace(layout.stops.bus),
    taxiStand: stopPlace(layout.stops.taxi),
    half: sw / 2,
    bend,
    arc: (Math.PI / 2) * bend,
    swerve: 0.8 * sw,
  };
}

/** Where a point of a lane is in the town, in floor tiles. */
export function laneAt(lane: Lane, s: number): { x: number; z: number } {
  const along = lane.origin + lane.direction * s;
  return lane.along === 'x' ? { x: along, z: lane.at } : { x: lane.at, z: along };
}

/** How far along a lane a place in the town is. */
const along = (lane: Lane, place: { x: number; z: number }) => ((lane.along === 'x' ? place.x : place.z) - lane.origin) * lane.direction;

/** Whether a lane is on the office's side of its street. */
function nearOffice(lane: Lane, street: number, own: { x: number; z: number; w: number; d: number }): boolean {
  const middle = lane.along === 'x' ? own.z + own.d / 2 : own.x + own.w / 2;
  return Math.abs(lane.at - middle) < Math.abs(street - middle);
}

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

/**
 * The lanes of a town laid out from a drawing are longer than the grid's, and
 * a stop can be further from where its lane begins. The `lead` of the bus, of
 * a taxi and of a car for the lot was made for a stop as far from the start of
 * its lane as `NEAR` says (the furthest in a grid of blocks): from there on,
 * whoever is sent to a stop starts sooner by the time the rest of the way takes
 * at an easy `EASY` tiles per second. Hours on the clock.
 */
const NEAR = { bus: 45, taxi: 28, car: 24 };
const EASY = 2.2;
const farther = (s: number, near: number) => Math.max(0, s - near) / EASY / HOUR_SECONDS;
const busLead = (roads: Roads) => BUS.lead + farther(roads.busStop.s, NEAR.bus);
/** How long before it is due at the door an ordered taxi comes into town. */
export const taxiLead = (roads: Roads) => TAXI.lead + farther(roads.taxiStand.s, NEAR.taxi);

/**
 * Where on its lane a vehicle that is sent to a stop is when it comes into
 * view, if it has been sent late (a day begins with its first orders, which
 * come too late for the vehicle to have driven all the way from the edge of
 * town): so far from the stop that it gets there on time at an easy pace.
 * Null where it comes in at the start of the lane: a stop no further than a
 * grid's, or sent in time.
 */
function onTheWay(traffic: Traffic, due: number, early: number, stop: number, near: number): number | null {
  if (stop <= near) return null;
  // The way it can still drive before it should be at the stop, at an easy pace (it slows down or speeds up to be there on time).
  const reach = (due - early - traffic.hours) * HOUR_SECONDS * EASY;
  return stop - reach > 0 ? Math.min(stop - reach, stop - 12) : null;
}

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

/** The crossing of a town whose middle is at a point, or null. */
export const crossingAt = (roads: Roads, x: number, z: number): number | null => roads.crossings.find((c) => Math.abs(c.x - x) < 0.01 && Math.abs(c.z - z) < 0.01)?.id ?? null;

/** The ground a strip covers: the crossing's side, as long as the street is wide and `ZEBRA` deep. */
function stripOf(roads: Roads, id: number, edge: Edge): { x1: number; z1: number; x2: number; z2: number } {
  const c = roads.crossings.find((x) => x.id === id)!;
  const { half } = roads;
  const sign = edge[0] === '+' ? 1 : -1;
  const [from, to] = [sign * half, sign * (half + ZEBRA)].sort((a, b) => a - b) as [number, number];
  return edge[1] === 'z'
    ? { x1: c.x - half, x2: c.x + half, z1: c.z + from, z2: c.z + to }
    : { x1: c.x + from, x2: c.x + to, z1: c.z - half, z2: c.z + half };
}

/** Whether a vehicle covers any of the ground of a strip, or comes within `margin` of it. */
function vehicleOnStrip(traffic: Traffic, id: number, edge: Edge, margin: number): boolean {
  const strip = stripOf(traffic.roads, id, edge);
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
        const at = laneAt(lane, c.s - traffic.roads.half - 0.3);
        const out = traffic.roads.layout.streetWidth / 4 + 0.35;
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
  return free - (right.s + traffic.roads.half + ZEBRA) - taken >= vehicle.length + GAP;
}

/**
 * How far a vehicle going round a corner may go, measured along the lane it
 * came from: up to the nearest one past the corner in the street it turns into.
 */
function bendLimit(traffic: Traffic, vehicle: Vehicle): number {
  const turn = vehicle.turn!;
  // Measured along the lane it turns into, past the crossing; then along the way round.
  const { half, arc } = traffic.roads;
  const along = (s: number) => s - turn.end + turn.start + arc;
  let limit = along(wallAhead(traffic, turn.to, turn.end - half)) - vehicle.length / 2 - GAP;
  for (const v of traffic.queues[turn.to]!) {
    if (v.s <= turn.end - half) continue;
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
  vehicle.s = turn.end + (vehicle.s - turn.start - traffic.roads.arc);
  vehicle.turn = undefined;
  vehicle.holds = vehicle.holds.filter((id) => id !== turn.id);
  release(traffic, turn.id);
  const to = traffic.queues[turn.to]!;
  const k = to.findIndex((v) => v.s < vehicle.s);
  to.splice(k < 0 ? to.length : k, 0, vehicle);
}

/** Whether an overtaker is over in the other lane altogether, its tail included, and not yet on its way back. */
const over = (traffic: Traffic, vehicle: Vehicle) => vehicle.pass !== undefined && vehicle.s - vehicle.length / 2 >= vehicle.pass.from + traffic.roads.swerve && vehicle.s < vehicle.pass.back;

/**
 * The vehicle a vehicle follows in its lane: the one in front, leaving out an
 * overtaker that is over in the other lane, and for an overtaker the one in
 * front of the vehicle it overtakes.
 */
function leaderOf(traffic: Traffic, queue: Vehicle[], i: number): Vehicle | undefined {
  const vehicle = queue[i]!;
  let j = i - 1;
  if (vehicle.pass) {
    const k = queue.findIndex((v) => v.id === vehicle.pass!.passing);
    if (k >= 0 && k < i) j = k - 1;
  }
  for (; j >= 0; j--) if (!over(traffic, queue[j]!)) return queue[j];
  return undefined;
}

/** How far along its lane an overtaker's front reaches while any of it is still out in the other lane, and a little more. */
const reachOf = (traffic: Traffic, vehicle: Vehicle) => vehicle.pass!.back + traffic.roads.swerve + vehicle.length + 0.1;

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
    const at = (other.origin + other.direction * reachOf(traffic, v) - lane.origin) * lane.direction;
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
  if (!NIMBLE.includes(vehicle.kind) || vehicle.turn || ahead.halt?.state !== 'standing' || ahead.passedBy !== undefined || ahead.pass) return;
  const lane = traffic.lanes[l]!;
  const gap = ahead.s - ahead.length / 2 - (vehicle.s + vehicle.length / 2);
  const { half, swerve } = traffic.roads;
  if (gap < pullOut(traffic, vehicle) || gap > pullOut(traffic, vehicle) + SPOT || lane.oncoming < 0) return;
  const back = ahead.s + ahead.length / 2 + GAP + vehicle.length / 2;
  const done = back + swerve + vehicle.length / 2;
  // A taxi or a car on its way to a stop of its own passes a bus that stands before it, if it is well back in its lane before it has to stop.
  if (vehicle.halt && !(vehicle.halt.state === 'ahead' && vehicle.halt.s > done + vehicle.length + 1)) return;
  const queue = traffic.queues[l]!;
  // Room to come back in, ahead of the one it overtakes.
  const next = leaderOf(traffic, queue, queue.indexOf(ahead));
  if (next && next.s - next.length / 2 - GAP < done + vehicle.length / 2) return;
  const end = done + vehicle.length / 2 + LINE_GAP + 0.2;
  const across = lane.crossings.filter((c) => c.s + half > vehicle.s - vehicle.length / 2 && c.s - half < end && !vehicle.holds.includes(c.id));
  if (across.some((c) => traffic.ends[l] === c.id || (vehicle.plan?.id === c.id && vehicle.plan.turn))) return;
  if (!across.every((c) => open(traffic.crossings[c.id]!, lane.along))) return;
  // Oncoming: nobody where it is going, and everyone else able to stop short of it, a long frame included.
  const wall = back + swerve + vehicle.length + 0.1 + GAP;
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
  const { due, stay, early } = BUS;
  const { busStop } = traffic.roads;
  const lead = busLead(traffic.roads);
  while (traffic.hours >= traffic.nextBus + due - lead) {
    // A bus that could not leave in time is not run at all.
    if (traffic.hours < traffic.nextBus + due - lead + 0.5) {
      const bus = enter(traffic, busStop.lane, 'bus');
      if (!bus) return;
      bus.halt = { s: busStop.s, due: traffic.nextBus + due - early, until: traffic.nextBus + due + stay, state: 'ahead', stood: 0 };
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
  traffic.queues[traffic.roads.taxiStand.lane]!.find((v) => v.halt?.key === key && v.halt.state === 'standing');

/** Lets the taxi of a journey drive on: its passenger has got out, or in. */
export function releaseTaxi(traffic: Traffic, key: string): void {
  const taxi = traffic.queues[traffic.roads.taxiStand.lane]!.find((v) => v.halt?.key === key);
  if (taxi?.halt) {
    taxi.halt.key = undefined;
    taxi.halt.until = Math.min(taxi.halt.until, traffic.hours);
  }
}

/** Sends the ordered taxis on their way once it is time, and forgets the orders of long ago. */
function dispatchTaxis(traffic: Traffic): void {
  const { early, stay, patience } = TAXI;
  const { taxiStand } = traffic.roads;
  const lead = taxiLead(traffic.roads);
  for (const order of traffic.orders) {
    if (order.sent || traffic.hours < order.due - lead) continue;
    const s = onTheWay(traffic, order.due, early, taxiStand.s, NEAR.taxi);
    const taxi = s === null ? enter(traffic, taxiStand.lane, 'taxi') : join(traffic, taxiStand.lane, 'taxi', s, order.key);
    if (!taxi) break;
    taxi.halt = { s: taxiStand.s, due: order.due - early, until: order.due + stay, state: 'ahead', stood: 0, key: order.key };
    order.sent = true;
  }
  if (traffic.orders.length > 0 && traffic.orders[0]!.due + patience + lead < traffic.hours) traffic.orders = traffic.orders.filter((order) => order.due + patience + lead >= traffic.hours);
}

// --- The parking lot (0.20.0) ---

/** A car comes into town `lead` before it is due at the lot's drive-in, aims to be there `early` before. Hours on the clock, as `townHours`. */
export const CAR = { lead: townHours(1.9), early: townHours(0.1) };
/** Tiles per second inside the lot. */
const LOT_SPEED = 2.2;
/** Radians per second a car in the lot turns at. */
const LOT_TURN = 7;
/** How far past its turn a car drives on the lane before it is in the drive-in, and how far before the turn it stands. */
const LOT_RUN = 0.9;
/** The room a car in the lot needs to leave behind the one in front of it, along their way. */
const LOT_GAP = 1.8;

/**
 * Where the lot is far from where its cars come into view, cars are sent a
 * little earlier than they need to be, so that the lights and a slow car in
 * front do not make them late for their owners: in hours on the clock, none
 * where the lot is close.
 */
export const carSlack = (traffic: Traffic) => (traffic.lot.lane !== null && traffic.lot.turnIn > NEAR.car ? 0.25 : 0);

/**
 * How long a car takes to drive in from the drive-in to its bay and park, in
 * hours on the clock: eight seconds, and the drive over the company's ground
 * where the lot stands back from its street.
 */
export function parkingHours(traffic: Traffic): number {
  const { lot } = traffic;
  const laneAt = lot.lane === null ? lot.ground.street : traffic.lanes[lot.lane]!.at;
  const across = Math.max(0, lot.ground.side > 0 ? lot.ground.x0 - laneAt - 1.5 : laneAt - lot.ground.x1 - 1.5);
  // (The eight seconds are generous: half the time the way across takes is what it adds, as measured.)
  return (8 + across / LOT_SPEED / 2) / HOUR_SECONDS;
}

/** A number from 0 to 1 for a key, always the same: the cars of the lot do not draw from the traffic's own random numbers. */
function unit(key: string, salt: number): number {
  let h = salt * 668265263;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 1274126177);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/**
 * The lane of a street that is driven into the lot and out of it: the one on the lot's side of the street (going
 * north where the lot is east of it, south where it is west of it). Null where nobody drives that street.
 */
function lotLane(roads: Roads, ground: Lot, closed: boolean[]): number | null {
  const lane = roads.lanes.findIndex((l) => l.along === 'z' && l.direction === -ground.side && Math.abs(l.at - (ground.street + (ground.side * roads.layout.streetWidth) / 4)) < 0.01);
  return lane < 0 || closed[lane] ? null : lane;
}

function lotOfTown(roads: Roads, building: Building, closed: boolean[]): LotState {
  const ground = lotOf(building, roads.layout);
  const lane = lotLane(roads, ground, closed);
  const l = lane === null ? null : roads.lanes[lane]!;
  // The car stands before the way in, in the direction it is driving, and the one that comes out is a little way on.
  const flow = -ground.side;
  const turns = ground.gates.map((gate) => (l ? along(l, { x: l.at, z: gate.in - flow * LOT_RUN }) : 0));
  const joins = ground.gates.map((gate) => (l ? along(l, { x: l.at, z: gate.out + flow * LOT_RUN }) : 0));
  return { ground, lane, turns, joins, turnIn: turns[0]!, joinAt: joins[0]!, cars: [], orders: [] };
}

/** Where the lane that goes to the lot is, in the town, at one of the lot's gates. */
export const lotGate = (traffic: Traffic, gate = 0): { x: number; z: number } => {
  const { lot } = traffic;
  return lot.lane === null ? { x: lot.ground.street, z: lot.ground.gates[gate]!.in } : laneAt(traffic.lanes[lot.lane]!, lot.turns[gate]!);
};

/** The gate of the lot a journey's car is ordered to, if it is. */
const gateOfOrder = (traffic: Traffic, key: string | undefined): number => {
  const order = traffic.lot.orders.find((o) => o.key === key);
  return (order && traffic.lot.ground.bays[order.bay]?.gate) || 0;
};

/** The color of a car of the lot's: from its journey alone. */
const toneOf = (key: string): Tone => CITY.traffic.tones[Math.floor(unit(key, 1) * CITY.traffic.tones.length)]!;

/** Whether a vehicle has room to join a lane at a place along it: behind it, room for whoever comes up from there to stop. */
function roomAt(traffic: Traffic, lane: number, s: number, length: number): boolean {
  return traffic.queues[lane]!.every((v) => {
    const behind = v.s < s;
    const gap = behind ? s - length / 2 - (v.s + v.length / 2) : v.s - v.length / 2 - (s + length / 2);
    return gap >= GAP + (behind ? (v.v * v.v) / (2 * BRAKING) + 0.2 : 0);
  });
}

/** A new vehicle at a place on a lane, among those already driving it, if there is room. */
function join(traffic: Traffic, lane: number, kind: VehicleKind, s: number, key: string): Vehicle | null {
  const spec = CITY.vehicles[kind];
  if (!roomAt(traffic, lane, s, spec.length)) return null;
  const speed = spec.speed[0] + unit(key, 2) * (spec.speed[1] - spec.speed[0]);
  const vehicle: Vehicle = { id: traffic.nextId++, kind, tone: toneOf(key), lane, s, v: 0.6, speed, pace: speed, length: spec.length, width: spec.width, holds: [] };
  const queue = traffic.queues[lane]!;
  const k = queue.findIndex((v) => v.s < s);
  queue.splice(k < 0 ? queue.length : k, 0, vehicle);
  return vehicle;
}

/** The turned corners of a way, cut a little short, so that a car goes round them instead of turning on the spot. */
function rounded(points: readonly [number, number][]): [number, number][] {
  const toward = (from: [number, number], to: [number, number], by: number): [number, number] => {
    const d = Math.hypot(to[0] - from[0], to[1] - from[1]);
    return d < 1e-9 ? from : [from[0] + ((to[0] - from[0]) * by) / d, from[1] + ((to[1] - from[1]) * by) / d];
  };
  const out: [number, number][] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const [a, p, b] = [points[i - 1]!, points[i]!, points[i + 1]!];
    const cut = (to: [number, number]) => Math.min(0.45, Math.hypot(to[0] - p[0], to[1] - p[1]) / 2);
    out.push(toward(p, a, cut(a)), toward(p, b, cut(b)));
  }
  out.push(points[points.length - 1]!);
  return out;
}

/** Orders a car to the lot (for a journey, to a bay), to have parked at a time on the office clock (see `clockHours`). Ordering twice for the same journey changes nothing. */
export function orderCar(traffic: Traffic, key: string, bay: number, due: number, until: number, vehicle: { kind: 'car' | 'van'; news?: true } = { kind: 'car' }): void {
  if (traffic.lot.orders.some((order) => order.key === key)) return;
  traffic.lot.orders.push({ key, bay, due, until, sent: false, ...vehicle });
}

/** The car of a journey, wherever it is in the lot. */
export const lotCarFor = (traffic: Traffic, key: string): LotCar | undefined => traffic.lot.cars.find((car) => car.key === key);

/** Puts a car in its bay at once, without driving it there: for whoever came before the town was looked at. */
export function parkCar(traffic: Traffic, key: string, bay: number, until: number, vehicle: { kind: 'car' | 'van'; news?: true } = { kind: 'car' }): void {
  if (lotCarFor(traffic, key)) return;
  const spot = traffic.lot.ground.bays[bay];
  if (!spot) return;
  traffic.lot.cars.push({ key, bay, tone: toneOf(key), state: 'parked', x: spot.x, z: spot.z, angle: spot.angle, path: [], backing: false, until, ...vehicle });
}

/** Whoever owns the car has got in: it backs out of its bay and drives out. */
export function leaveLot(traffic: Traffic, key: string): void {
  const { lot } = traffic;
  const car = lotCarFor(traffic, key);
  if (!car || car.state !== 'parked') return;
  const bay = lot.ground.bays[car.bay]!;
  const mouth: [number, number] = [lot.lane === null ? lot.ground.street : traffic.lanes[lot.lane]!.at, lot.ground.gates[bay.gate]!.out];
  const way = wayOut(bay, mouth);
  // On out of the drive-out and a little way up the lane: the turn is made by a car already in the lane's direction.
  way.push([mouth[0], mouth[1] - lot.ground.side * LOT_RUN]);
  car.path = rounded(way).slice(1);
  car.state = 'leaving';
  car.backing = true;
}

/** Whether the drive-in of a gate is free for another car: whoever came in before has driven on. */
function driveInFree(traffic: Traffic, at: number): boolean {
  const gate = lotGate(traffic, at);
  return !traffic.lot.cars.some((car) => car.state === 'arriving' && Math.hypot(car.x - gate.x, car.z - gate.z) < LOT_GAP + CITY.vehicles.car.length);
}

/** A car that stands at the turn goes into the lot: it is no longer in the lane, and drives to its bay. */
function turnIntoLot(traffic: Traffic, vehicle: Vehicle): void {
  const { lot } = traffic;
  const queue = traffic.queues[vehicle.lane]!;
  queue.splice(queue.indexOf(vehicle), 1);
  for (const id of vehicle.holds) release(traffic, id);
  const order = lot.orders.find((o) => o.key === vehicle.halt?.key);
  const bay = order ? lot.ground.bays[order.bay] : undefined;
  if (!order || !bay) return;
  const at = placeOf(traffic, vehicle);
  const way = wayIn(bay, [at.x, at.z]);
  // Straight on from where it stood, then in: the turn is to the right.
  way.splice(1, 0, [at.x, lot.ground.gates[bay.gate]!.in]);
  lot.cars.push({
    key: order.key,
    bay: order.bay,
    kind: order.kind,
    ...(order.news && { news: true as const }),
    tone: vehicle.tone,
    state: 'arriving',
    x: at.x,
    z: at.z,
    angle: at.angle,
    path: rounded(way).slice(1),
    backing: false,
    until: order.until,
  });
}

/** Sends the ordered cars on their way once it is time. */
function dispatchCars(traffic: Traffic): void {
  const { lot } = traffic;
  const lead = CAR.lead + farther(lot.turnIn, NEAR.car);
  for (const order of lot.orders) {
    if (order.sent || traffic.hours < order.due - lead) continue;
    if (lot.lane === null) {
      // Nobody drives the street the lot is on: the car is there when it should be.
      parkCar(traffic, order.key, order.bay, order.until, order);
      order.sent = true;
      continue;
    }
    // Where the lane begins: in a town by the water nobody comes in from its start, so it begins past the shore.
    const lane = traffic.lanes[lot.lane]!;
    const first = lane.crossings.find((c) => c.id === traffic.begins[lot.lane!]);
    const turn = lot.turns[lot.ground.bays[order.bay]?.gate ?? 0]!;
    const way = onTheWay(traffic, order.due, CAR.early, turn, NEAR.car);
    const s = first ? first.s + traffic.roads.half + ZEBRA + CITY.vehicles[order.kind].length : way ?? -CITY.vehicles[order.kind].length / 2;
    const car = join(traffic, lot.lane, order.kind, s, order.key);
    if (!car) break;
    if (order.news) car.news = true;
    car.halt = { s: turn, due: order.due - CAR.early, until: order.due, state: 'ahead', stood: 0, key: order.key, park: true };
    order.sent = true;
  }
  // An order is forgotten a while after it was due.
  if (lot.orders.length > 0 && lot.orders[0]!.due + lead < traffic.hours - 1) lot.orders = lot.orders.filter((order) => order.due + lead >= traffic.hours - 1);
}

/** The way a car in the lot turns to point where it goes: the shortest way round, at most `by`. */
function turnToward(angle: number, target: number, by: number): number {
  let delta = (target - angle) % (2 * Math.PI);
  if (delta > Math.PI) delta -= 2 * Math.PI;
  if (delta < -Math.PI) delta += 2 * Math.PI;
  return angle + Math.max(-by, Math.min(by, delta));
}

/** Moves the cars in the lot on: they drive in and park, and back out and join the street's lane when there is room. */
function stepLot(traffic: Traffic, dt: number): void {
  const { lot } = traffic;
  lot.cars = lot.cars.filter((car) => car.until > traffic.hours);
  /** How far a car still has to drive: the one with less is the one in front. */
  const remaining = (car: LotCar) => car.path.reduce((sum, [x, z], i) => sum + Math.hypot(x - (car.path[i - 1]?.[0] ?? car.x), z - (car.path[i - 1]?.[1] ?? car.z)), 0);
  for (const [n, car] of lot.cars.entries()) {
    if (car.state === 'parked') continue;
    // One behind the other: whoever drives the same way as the car in front keeps its distance.
    const mine = remaining(car);
    const ahead = lot.cars.some((other, m) => {
      if (m === n || other.state !== car.state || Math.hypot(other.x - car.x, other.z - car.z) >= LOT_GAP) return false;
      const theirs = remaining(other);
      return theirs < mine || (theirs === mine && m < n);
    });
    let left = ahead ? 0 : LOT_SPEED * dt;
    while (left > 0 && car.path.length > 0) {
      const [px, pz] = car.path[0]!;
      const to = Math.hypot(px - car.x, pz - car.z);
      if (!car.backing && to > 1e-6) car.angle = turnToward(car.angle, Math.atan2(-(pz - car.z), px - car.x), LOT_TURN * dt);
      if (to <= left) {
        [car.x, car.z] = [px, pz];
        left -= to;
        car.path.shift();
        car.backing = false;
      } else {
        car.x += ((px - car.x) / to) * left;
        car.z += ((pz - car.z) / to) * left;
        left = 0;
      }
    }
    if (car.path.length > 0) continue;
    if (car.state === 'arriving') {
      car.state = 'parked';
      car.angle = lot.ground.bays[car.bay]!.angle;
    } else if (lot.lane === null) {
      car.until = -Infinity;
    } else if (!traffic.queues[traffic.lanes[lot.lane]!.oncoming]!.some((v) => v.pass)) {
      const joined = join(traffic, lot.lane, car.kind, lot.joins[lot.ground.bays[car.bay]!.gate]!, car.key);
      if (!joined) continue;
      if (car.news) joined.news = true;
      car.until = -Infinity;
    }
  }
}

function advance(traffic: Traffic, dt: number): void {
  traffic.time += dt;
  dispatchBus(traffic);
  dispatchTaxis(traffic);
  dispatchCars(traffic);
  runLights(traffic);
  /** Those that are round a corner this step: they change lanes after every lane has moved. */
  const turned: Vehicle[] = [];
  /** Cars that are at the turn into the lot this step. */
  const parking: Vehicle[] = [];

  const { half, arc, swerve } = traffic.roads;
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
      let leader = leaderOf(traffic, queue, i);
      if (leader && !vehicle.pass) {
        overtake(traffic, l, vehicle, leader);
        if (vehicle.pass) leader = leaderOf(traffic, queue, i);
      }
      let limit = leader ? leader.s - leader.length / 2 - vehicle.length / 2 - GAP : Infinity;
      // The one in front is going round a corner: wait at the start of the bend until it is round.
      if (leader?.turn) limit = Math.min(limit, leader.turn.start - GAP - vehicle.length / 2);
      // Someone overtaking comes the other way in this lane: stop short of where they will be.
      const wall = wallAhead(traffic, l, vehicle.s);
      limit = Math.min(limit, wall - GAP - vehicle.length / 2);
      // The one in front stops at the kerb, or is about to: keep far enough back to pull out and overtake it.
      const stopping = leader?.halt !== undefined && leader.halt.state !== 'done' && leader.halt.s - leader.s < STOPPING;
      const bound = vehicle.halt === undefined || (vehicle.halt.state === 'ahead' && leader !== undefined && vehicle.halt.s > leader.s + 2 * pullOut(traffic, vehicle) + vehicle.length + 1);
      if (leader && stopping && !vehicle.pass && NIMBLE.includes(vehicle.kind) && bound) limit = Math.min(limit, leader.s - leader.length / 2 - pullOut(traffic, vehicle) - 0.05 - vehicle.length / 2);
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
          const line = crossing.s - half - ZEBRA - vehicle.length / 2 - LINE_GAP;
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
          const room = turning ? roomRound(traffic, l, vehicle, crossing.right!) : Math.min(leader ? leader.s - leader.length / 2 : Infinity, wall) - GAP >= crossing.s + half + ZEBRA + vehicle.length;
          if (take(traffic, traffic.crossings[crossing.id]!, crossing.id, lane.along, vehicle, room, first)) {
            if (!turning) continue;
            vehicle.turn = { id: crossing.id, from: l, to: crossing.right!.lane, start: crossing.s - half, end: crossing.right!.s + half };
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
        if (held && vehicle.s - vehicle.length / 2 >= held.s + half) {
          release(traffic, id);
          vehicle.holds.splice(h, 1);
        }
      }
      if (vehicle.turn && vehicle.s - vehicle.length / 2 >= vehicle.turn.start + arc) turned.push(vehicle);

      const pass = vehicle.pass;
      if (pass) {
        // Past it: it takes its place ahead of it in the lane, and the other one may drive on.
        const k = queue.findIndex((v) => v.id === pass.passing);
        if (k >= 0 && k < i && vehicle.s >= pass.back) {
          queue.splice(i, 1);
          queue.splice(k, 0, vehicle);
          queue[k + 1]!.passedBy = undefined;
        }
        if (vehicle.s >= pass.back + swerve + vehicle.length / 2) vehicle.pass = undefined;
      }

      if (halt && halt.state !== 'done' && halt.s - vehicle.s <= 1e-4) {
        halt.state = 'standing';
        halt.stood += dt;
        if (halt.park) {
          // A car for the lot turns in as soon as the drive-in is free.
          if (driveInFree(traffic, gateOfOrder(traffic, halt.key)) && !parking.some((p) => p.lane === vehicle.lane)) {
            halt.state = 'done';
            parking.push(vehicle);
          }
        } else {
          // A taxi waits for whoever ordered it, but not for ever.
          const waiting = halt.key !== undefined && traffic.hours < halt.due + TAXI.patience;
          if (traffic.hours >= halt.until && halt.stood >= CITY.traffic.shortestStop && !waiting) halt.state = 'done';
        }
      }
    }
    while (queue[0] && queue[0].s - queue[0].length / 2 > lane.length) {
      const gone = queue.shift()!;
      for (const id of gone.holds) release(traffic, id);
      traffic.left++;
    }

    // The road the bus comes in by is left clear for a moment before it does.
    const busSoon = l === traffic.roads.busStop.lane && traffic.hours >= traffic.nextBus + BUS.due - busLead(traffic.roads) - BUS.clear;
    if (traffic.time >= traffic.nextSpawn[l]! && !busSoon) {
      const { mix, every } = traffic.rules;
      let pick = traffic.rng.next();
      const kind = (Object.keys(mix) as (keyof typeof mix)[]).find((k) => (pick -= mix[k]) < 0) ?? 'car';
      if (enter(traffic, l, kind)) traffic.nextSpawn[l] = traffic.time + every * (0.3 + 1.4 * traffic.rng.next());
    }
  });

  for (const vehicle of turned) turnInto(traffic, vehicle);
  for (const vehicle of parking) turnIntoLot(traffic, vehicle);
  stepLot(traffic, dt);
}

/**
 * The traffic of a game as it is at a time on the office clock (see
 * `clockHours`): the streets are filled by letting a few hours go by first,
 * so buses that are due are on their way. Nothing drives in a street that the
 * office's own block lies across: the side street the long building stands
 * on. In a town by the water (`water`) the side streets end at the shore:
 * nobody comes up them from there, and everyone going down one turns there.
 */
export function createTraffic(seed: number, hours: number, rules: Site['traffic'] = SITES.capital.traffic, building: Building = BUILDINGS.standard, water = false, layout: Layout = CAPITAL): Traffic {
  const roads = roadsOf(layout);
  const warmUp = busLead(roads) + townHours(1.5);
  const before = hours - warmUp;
  const lanes = roads.lanes;
  const busy = layout.busy(building);
  const closed = lanes.map((lane) => !busy.some((street) => street.along === lane.along && Math.abs(street.at - lane.at) < layout.streetWidth / 2));
  // The crossing with the street along the shore, on a side street.
  const shoreline = layout.from.z + layout.length.z;
  const shore = (lane: Lane) => lane.crossings.find((c) => Math.abs(lane.origin + lane.direction * c.s - shoreline) < 0.01)?.id ?? null;
  const side = (lane: Lane) => water && lane.along === 'z';
  const rng = new Rng(seed ^ 0x7a3c19);
  // Lights where both streets carry traffic, each crossing at a moment of its own in its round.
  const driven = Array.from({ length: roads.count }, () => ({ x: false, z: false }));
  lanes.forEach((lane, l) => {
    if (!closed[l]) for (const c of lane.crossings) driven[c.id]![lane.along] = true;
  });
  const traffic: Traffic = {
    roads,
    lanes: [...lanes],
    queues: lanes.map(() => []),
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
    nextBus: Math.ceil(before - BUS.due + busLead(roads)),
    orders: [],
    rules,
    left: 0,
    closed,
    ends: lanes.map((lane) => (side(lane) && lane.direction > 0 ? shore(lane) : null)),
    begins: lanes.map((lane) => (side(lane) && lane.direction < 0 ? shore(lane) : null)),
    building,
    lot: lotOfTown(roads, building, closed),
  };
  traffic.nextSpawn = lanes.map((_, l) => (closed[l] || traffic.begins[l] !== null ? Infinity : 1) * traffic.rng.next() * rules.every);
  // Hours on the clock go by before a new town is shown: longer than a bus needs to reach its stop.
  const steps = Math.ceil((warmUp * HOUR_SECONDS) / (2 * STEP));
  for (let n = 1; n <= steps; n++) {
    traffic.hours = before + (warmUp * n) / steps;
    advance(traffic, 2 * STEP);
  }
  return traffic;
}

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
function swerveAt(roads: Roads, pass: Pass, s: number): number {
  const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  return (roads.layout.streetWidth / 2) * Math.min(ease((s - pass.from) / roads.swerve), 1 - ease((s - pass.back) / roads.swerve));
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
    const { arc, bend } = traffic.roads;
    if (u >= arc) return laneAt(traffic.lanes[turn.to]!, turn.end + u - arc);
    if (u > 0) {
      // A quarter circle round the kerb's corner, from the way in to the way out.
      const start = laneAt(from, turn.start);
      const [h, r, a] = [headingOf(from), rightOf(from), u / bend];
      return {
        x: start.x + bend * (r.x * (1 - Math.cos(a)) + h.x * Math.sin(a)),
        z: start.z + bend * (r.z * (1 - Math.cos(a)) + h.z * Math.sin(a)),
      };
    }
    [lane, s] = [from, turn.start + u];
  }
  const at = laneAt(lane, s);
  if (!pass) return at;
  // Over to the left, where the other lane is.
  const r = rightOf(lane);
  const out = swerveAt(traffic.roads, pass, s);
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
export const busAtStop = (traffic: Traffic): Vehicle | undefined => traffic.queues[traffic.roads.busStop.lane]!.find((v) => v.kind === 'bus' && v.halt?.state === 'standing');
