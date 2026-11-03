// How long the walks to the entrance take in a town. Shared by the working day
// (day.ts) and the street (street.ts): day.ts can't import the street, which
// imports the day, so the measure lives here, on the traffic and the layout alone.

import type { WayKind } from '../mods/mapFile';
import { HOUR_SECONDS, townHours, type Roads } from './traffic';

/** Tiles per second: people in the street walk a little faster than in the office. */
export const PACE = 3.4;

/** From getting off the bus to the door, at the least: hours on the clock, the time it takes in the street (0.16.0). */
export const BUS_WALK = townHours(0.5);

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
  /** For an entrance on the far side of the building from the lot: the corner the people of the lot go round, on the line of the gate, or null. */
  round: [number, number] | null;
}

const placesBy = new WeakMap<Roads, Places>();

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
      round: at.round ? pair(at.round) : null,
    };
    placesBy.set(roads, places);
  }
  return places;
}

export const lengthOf = (path: readonly [number, number][]) => path.slice(1).reduce((sum, point, i) => sum + Math.hypot(point[0] - path[i]![0], point[1] - path[i]![1]), 0);

/** The corners the map gives a way (0.21.0, #339), between its start and the gate; none on the five towns. */
export function cornersOf(roads: Roads, kind: WayKind): [number, number][] {
  return (roads.layout.places.ways?.[kind]?.via ?? []).map((p): [number, number] => [p.x, p.z]);
}

/** The ways to and from the entrance. With corners a way goes through them, from its start to the gate; with none it is as it always was. */
export function routesOf(roads: Roads) {
  const p = placesOf(roads);
  const [bus, taxi, away] = [cornersOf(roads, 'bus'), cornersOf(roads, 'taxi'), cornersOf(roads, 'away')];
  return {
    bus: bus.length > 0 ? [p.stop, ...bus, p.gate, p.door] : [p.stop, p.corner, p.gate, p.door],
    taxi: [p.taxi, ...taxi, p.gate, p.door],
    walk: [p.away, ...away, p.gate, p.door],
  } as { bus: [number, number][]; taxi: [number, number][]; walk: [number, number][] };
}

/** How long each way takes, in hours on the clock. */
export function walkHoursOf(roads: Roads) {
  const routes = routesOf(roads);
  return { bus: lengthOf(routes.bus) / PACE / HOUR_SECONDS, taxi: lengthOf(routes.taxi) / PACE / HOUR_SECONDS, walk: lengthOf(routes.walk) / PACE / HOUR_SECONDS };
}

const busWalkBy = new WeakMap<Roads, number>();

/** The walk from the bus stop to the door in a town: what it measures, but never less than the day's usual (#221). */
export function busWalkOf(roads: Roads): number {
  let walk = busWalkBy.get(roads);
  if (walk === undefined) {
    walk = Math.max(BUS_WALK, walkHoursOf(roads).bus);
    busWalkBy.set(roads, walk);
  }
  return walk;
}
