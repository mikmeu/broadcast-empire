// The map check (0.21.0, #283): whether the game can run on a town. `checkMapFile` (src/mods/mapFile.ts) only
// reads a file; this lays the town out and looks at what the game needs of it, each step with its own reason in plain
// words, so that the editor (#284) and the loader (#290) can show it, and one step can be relaxed without the others.
//
// It does not run at start in src/config/maps.ts: townLayout imports that, so it would be an import cycle.

import type { Building } from '../config/office';
import type { MapFile } from '../mods/mapFile';
import { lotOf } from './parking';
import { byRoads, houseOf, layoutFromMap, type Layout } from './townLayout';
import { roadsOf, type Roads } from './traffic';

export type TownCheck = { ok: true } | { ok: false; reason: string };

/** How far the gate may be from the spot the bus stop's passengers wait on, in tiles. Aerial Fields' walk, the longest of the five, is 14. */
export const DOOR_REACH = 40;

const no = (reason: string): TownCheck => ({ ok: false, reason });

/** What the layout code would crash on, in plain words; null if the map has what it needs. */
function missing(file: MapFile): string | null {
  const { map, settings } = file;
  const roads = byRoads(map);
  if (map.lanes.length === 0) return 'The map has no roads: draw at least one lane.';
  if (map.wings.length === 0) return 'The map has no wings: the office needs ground to stand on.';
  if (!roads && !map.wings.some((wing) => wing.w > wing.h)) return 'The map has no wing lying east to west: a town of streets in a grid needs one for the office to stand at.';
  if (!map.train) return 'The map has no railway.';
  if (map.parking.length + map.courtyard.parking.length === 0) return 'No lot: the map has no parking strip.';
  if (roads && settings.busStop.from === 'drawing') return 'A town laid out by its roads puts the bus stop at the entrance, not where the map draws it.';
  if (!roads && settings.busStop.from === 'drawing' && !map.busStop) return 'The bus stop is to be where the map draws it, and it draws none.';
  return null;
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
  const early = missing(file);
  if (early) return no(early);
  const house = houseOf(file, building);

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

  const lot = lotProblem(layout, house);
  if (lot) return no(lot);

  const wait = roads.busStop.wait;
  const walk = Math.hypot(layout.places.gate.x - wait.x, layout.places.gate.z - wait.z);
  if (walk > DOOR_REACH) return no(`No door onto a road: the entrance is ${Math.round(walk)} tiles from the bus stop; it must be within ${DOOR_REACH}.`);

  return { ok: true };
}
