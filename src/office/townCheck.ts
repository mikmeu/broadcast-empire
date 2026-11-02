// The map check (0.21.0, #283): whether the game can run on a town. `checkMapFile` (src/mods/mapFile.ts) only
// reads a file; this lays the town out and looks at what the game needs of it, each step with its own reason in plain
// words, so that the editor (#284) and the loader (#290) can show it, and one step can be relaxed without the others.
//
// It does not run at start in src/config/maps.ts: townLayout imports that, so it would be an import cycle.

import type { Building } from '../config/office';
import type { MapFile } from '../mods/mapFile';
import { itemsOf } from './city';
import { floorProblem } from './drawnBuilding';
import { lotOf } from './parking';
import { houseOf, layoutFromMap, type Layout, type MapParts } from './townLayout';
import { roadsOf, type Roads } from './traffic';

export type TownCheck = { ok: true } | { ok: false; reason: string };

/** How far the gate may be from the spot the bus stop's passengers wait on, in tiles. Aerial Fields' walk, the longest of the five, is 14. */
export const DOOR_REACH = 40;

const no = (reason: string): TownCheck => ({ ok: false, reason });

/** What the layout code would crash on, in plain words; null if the map has what it needs. */
function missing(file: MapFile): string | null {
  const { map, settings } = file;
  if (map.roads.length === 0) return 'The map has no roads: put down at least one.';
  if (map.building.wings.length === 0) return 'The map has no wings: the office needs ground to stand on.';
  if (!map.rail) return 'The map has no railway.';
  if (settings.layout === 'roads' && !map.edge) return 'A town laid out by its roads needs an edge: the box the town lies in.';
  if (settings.layout === 'roads' && map.roads.some((r) => r.from === undefined || r.to === undefined)) return 'Every road of a town laid out by its roads needs the ends it runs between.';
  if (settings.layout === 'grid' && !map.ground.some((g) => g.edge)) return 'A town of streets in a grid needs blocks of ground between them.';
  if (map.lot.parking.length === 0 && settings.layout === 'grid') return 'No lot: the map has no parking strip.';
  const track = trackProblem(file);
  if (track) return track;
  return null;
}

/** How clear of a level crossing everything has to be, in tiles (0.21.0, #288): a bus (6.4 tiles) and its margins fit between the stopping line and a junction, and a queue before the barrier does not block the junction. */
export const CROSSING_CLEAR = 8;
/** The narrowest a railway on the ground may be drawn, in tiles: the train is 3.9 wide, and has to fit between the blocks. */
export const TRACK_WIDTH = 4;

/** What a railway on the ground needs of the drawing before the town is laid out, in plain words; null if it has it or is elevated. */
function trackProblem(file: MapFile): string | null {
  const { rail } = file.map;
  if (file.settings.railway !== 'ground' || !rail) return null;
  if (rail.w < rail.d) return 'The railway on the ground has to lie east to west: make its box wider than it is deep.';
  if (rail.d < TRACK_WIDTH) return `The railway on the ground is too narrow: its box is ${rail.d} tiles wide and must be at least ${TRACK_WIDTH}, so that the train fits between the blocks.`;
  return null;
}

/** The distance of a point from a box, in tiles (0 inside it). */
const apart = (p: { x: number; z: number }, box: { x1: number; x2: number; z1: number; z2: number }) => Math.hypot(Math.max(box.x1 - p.x, 0, p.x - box.x2), Math.max(box.z1 - p.z, 0, p.z - box.z2));

/**
 * What a railway on the ground needs of the town laid out (0.21.0, #288), in plain words: a road does not run along the track; every road that
 * crosses it is `CROSSING_CLEAR` tiles from a junction, the end of a road and the edge of the map; the stops and the lot are as far from a crossing,
 * and on the same side of the track as the door; and no building stands on it. Null if it has all that, or is elevated.
 */
function trackFits(layout: Layout, roads: Roads, house: Building, scaleOf: number, decor: boolean): string | null {
  const { railway } = layout;
  if (!railway.ground) return null;
  const half = railway.width / 2;
  const track = { x1: railway.from, x2: railway.from + railway.length, z1: railway.z - half, z2: railway.z + half };
  // (A lane is half the width of a street: a road whose kerb touches the track runs beside it, and is no road along it.)
  const laneHalf = layout.streetWidth / 4;
  for (const l of roads.lanes) {
    if (l.along === 'x' && l.at + laneHalf > track.z1 + 0.01 && l.at - laneHalf < track.z2 - 0.01) return 'A road runs along the track: roads may cross a railway on the ground, not run along it.';
  }

  const crossings = roads.crossings.filter((c) => c.rail);
  for (const lane of roads.lanes) {
    for (const crossing of lane.crossings.filter((c) => c.rail)) {
      const near = crossing.s - crossing.half;
      const far = crossing.s + crossing.half;
      // Beside the track on both sides: the nearest junction, the end of the road or the edge of the map.
      const sides = [
        { gap: near, end: lane.startsAt },
        { gap: lane.length - far, end: lane.endsAt },
      ];
      for (const { gap, end } of sides) {
        if (end === 'edge' && gap < CROSSING_CLEAR) return `A road crosses the track within ${CROSSING_CLEAR} tiles of the edge of the map: move the track in, or the road out.`;
        if (end === 'dead' && gap < CROSSING_CLEAR) return `A road crosses the track within ${CROSSING_CLEAR} tiles of the end of the road: a vehicle has to be able to stand before the barrier.`;
      }
      for (const other of lane.crossings) {
        if (other.rail) continue;
        const gap = other.s > crossing.s ? other.s - other.half - far : near - (other.s + other.half);
        if (gap < CROSSING_CLEAR) return `A road crosses the track within ${CROSSING_CLEAR} tiles of a junction: a queue before the barrier would block it.`;
      }
    }
  }

  const stops = [
    { name: 'the bus stop', at: roads.busStop },
    { name: 'the taxi stand', at: roads.taxiStand },
  ];
  const { ground } = { ground: lotOf(house, layout) };
  const gates = ground.gates.map((g) => (ground.along === 'z' ? { x: ground.street, z: g.in } : { x: g.in, z: ground.street }));
  const door = layout.places.gate;
  const side = (z: number) => Math.sign(z - railway.z);
  for (const crossing of crossings) {
    const box = { x1: crossing.x - crossing.reach.x, x2: crossing.x + crossing.reach.x, z1: crossing.z - crossing.reach.z, z2: crossing.z + crossing.reach.z };
    for (const { name, at } of stops) if (apart(at, box) < CROSSING_CLEAR) return `${name[0]!.toUpperCase()}${name.slice(1)} is within ${CROSSING_CLEAR} tiles of a level crossing: a bus would stand on the track.`;
    for (const gate of gates) if (apart(gate, box) < CROSSING_CLEAR) return `The gate of the lot is within ${CROSSING_CLEAR} tiles of a level crossing: a car turning in would stand on the track.`;
  }
  for (const { name, at } of stops) if (side(at.z) !== side(door.z)) return `${name[0]!.toUpperCase()}${name.slice(1)} is on the other side of the track from the door: nobody could walk to the office without crossing it.`;
  const lot = layout.lot(house).block;
  if (side(lot.z + lot.d / 2) !== side(door.z)) return 'The lot is on the other side of the track from the door: nobody could walk to the office without crossing it.';

  // Nothing stands on the track.
  return decor ? onTheTrack(layout.map, house, scaleOf, track) : null;
}

/** Whether a house, a tree or a wing stands on the track (by the room the model takes). What stands in the town is what the file writes. */
function onTheTrack(parts: Pick<MapParts, 'houses' | 'trees'> | undefined, house: Building, scaleOf: number, track: { x1: number; x2: number; z1: number; z2: number }): string | null {
  const rects = [...(parts ? itemsOf(parts).map((i) => ({ x: i.x - (i.building.w * scaleOf) / 2, z: i.z - (i.building.d * scaleOf) / 2, w: i.building.w * scaleOf, d: i.building.d * scaleOf })) : []), ...house.wings.map((w) => ({ x: w.x, z: w.y, w: w.w, d: w.h }))];
  if (rects.some((r) => r.x < track.x2 && r.x + r.w > track.x1 && r.z < track.z2 && r.z + r.d > track.z1)) return 'A building stands on the track: move the track, or the building.';
  return null;
}

/**
 * The part of the check that depends on the houses and trees (0.21.0, #328): whether one stands on a railway on the ground. It needs no layout, so
 * the editor runs it on every edit of the decor, and `checkStructure` only when the roads, the rail and the rest of the structure change.
 */
export function standsOnTrack(file: MapFile, building?: Building): string | null {
  const { rail } = file.map;
  if (file.settings.railway !== 'ground' || !rail) return null;
  let house: Building;
  try {
    house = houseOf(file, building);
  } catch {
    return null;
  }
  return onTheTrack(file.map, house, file.settings.scale, { x1: rail.x, x2: rail.x + rail.w, z1: rail.z, z2: rail.z + rail.d });
}

/** The lot has ground, opens onto a street of the town and has room for cars. */
function lotProblem(layout: Layout, house: Building): string | null {
  const { block, street, along } = layout.lot(house);
  if (block.w <= 0 || block.d <= 0) return 'No lot: the ground for it has no size.';
  const onStreet = layout.streets(house).some((s) => s.along === (along ?? 'z') && Math.abs(s.at - street) < 0.01);
  if (!onStreet) return 'No lot: it opens onto no road of the town.';
  if (lotOf(house, layout).bays.length === 0) return 'No lot: it has no room for a single bay.';
  return null;
}

/** Whether the game can run on this town, and if not, why. `building` is the one the town is laid out round (see `houseOf`). */
export function checkTown(file: MapFile, building?: Building): TownCheck {
  return check(file, building, true);
}

/** `checkTown` without the houses and trees (see `standsOnTrack`): it depends on the structure of the map alone (see `structureKey`). */
export function checkStructure(file: MapFile, building?: Building): TownCheck {
  return check(file, building, false);
}

function check(file: MapFile, building: Building | undefined, decor: boolean): TownCheck {
  const early = missing(file);
  if (early) return no(early);
  // A map of no region gets a building worked out from its wings and reception box (#289): why it can have none is a reason of its own.
  let house: Building;
  try {
    house = houseOf(file, building);
  } catch (error) {
    return no(error instanceof Error ? error.message : String(error));
  }
  const floor = house.id === 'map' ? floorProblem(house) : null;
  if (floor) return no(floor);

  let layout: Layout;
  try {
    layout = layoutFromMap(file, house);
  } catch (error) {
    return no(`The game cannot lay out this town: ${error instanceof Error ? error.message : String(error)}`);
  }

  let roads: Roads;
  try {
    roads = roadsOf(layout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return no(/No lane beside the office/.test(message) ? 'No stop: no road runs beside the office.' : `The game cannot build the roads of this town: ${message}`);
  }

  if (!roads.lanes.some((lane) => lane.startsAt === 'edge')) return no('No road reaches the edge of the map: nothing can drive in.');

  // A route that finds no way in falls back to the stop's own lane, which then does not begin at the edge.
  const reached = (route: { entry: number }) => roads.lanes[route.entry]?.startsAt === 'edge';
  if (!reached(roads.busRoute)) return no('No stop: no bus can reach the bus stop from the edge of the map.');
  if (!reached(roads.taxiRoute)) return no('No stop: no taxi can reach the taxi stand from the edge of the map.');

  const fit = trackFits(layout, roads, house, file.settings.scale, decor);
  if (fit) return no(fit);

  const lot = lotProblem(layout, house);
  if (lot) return no(lot);

  const wait = roads.busStop.wait;
  const walk = Math.hypot(layout.places.gate.x - wait.x, layout.places.gate.z - wait.z);
  if (walk > DOOR_REACH) return no(`No door onto a road: the entrance is ${Math.round(walk)} tiles from the bus stop; it must be within ${DOOR_REACH}.`);

  return { ok: true };
}
