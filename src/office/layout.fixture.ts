// What every Layout of the five towns says, written down as plain data (0.21.0, #327): the proof that the one layout function
// that reads a map file (townLayout.ts) lays a town out as the two functions it replaced did. Recorded in layout.fixture.json
// by `npx tsx scripts/recordLayoutFixture.ts`; layout.fixture.test.ts holds the code to it.
//
// For each town and each building (the region's own, the standard one and the long one) every field and function of the Layout is
// answered; `pavement` and `cellAt` are asked over the ground and kept as a hash. A second recording holds what stands in the town
// with the seed 1970 (the seed the five default towns are written from): houses, trees, lamps, foothills and the peaks of the range.

import { BUILDINGS, buildingFor, type Building } from '../config/office';
import type { RegionId } from '../config/world';
import { rangeOf, townBlocks } from './city';
import { SITES } from './sites';
import { layoutOf, type Layout } from './townLayout';

export const LAYOUT_REGIONS: RegionId[] = ['capital', 'north', 'coast', 'heartland', 'highlands'];

/** The seed the five default towns are written from. */
export const TOWN_SEED = 1970;

const round = (n: number) => Math.round(n * 1e4) / 1e4;

/** Plain data of any value: numbers rounded, functions and undefined left out. */
export function plain(value: unknown): unknown {
  if (typeof value === 'number') return Number.isFinite(value) ? round(value) : String(value);
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => typeof v !== 'function' && v !== undefined)
        .map(([k, v]) => [k, plain(v)]),
    );
  }
  return value;
}

/** A short hash of a text. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16);
}

/** The ground the pavement and the cell of a point are asked over: from -140 to 140 in both directions, off the whole tiles. */
const SAMPLES = Array.from({ length: 165 }, (_, n) => -140 + n * 1.7 + 0.3);

function sampled(layout: Layout, building: Building) {
  let pavement = '';
  let cells = '';
  const seen: string[] = [];
  for (const z of SAMPLES) {
    for (const x of SAMPLES) {
      pavement += layout.pavement(building, x, z) ? '1' : '0';
      const cell = layout.cellAt(building, x, z);
      const key = cell ? JSON.stringify(plain(cell)) : '';
      if (key && !seen.includes(key)) seen.push(key);
      cells += key ? String(seen.indexOf(key)) : '-';
      cells += ',';
    }
  }
  return { pavement: hash(pavement), paved: [...pavement].filter((c) => c === '1').length, cellAt: hash(cells), cells: seen.length };
}

/** Every answer one Layout gives for one building, as plain data. */
export function describeLayout(layout: Layout, building: Building) {
  const stops = layout.stops;
  return plain({
    own: layout.own(building),
    lot: layout.lot(building),
    streets: layout.streets(building),
    busy: layout.busy(building),
    strolling: layout.strolling(building),
    lotCrossing: layout.lotCrossing(building),
    corner: [layout.places.corner(stops.bus), layout.places.corner(stops.taxi)],
    stop: layout.places.stop(stops.bus),
    ...sampled(layout, building),
  });
}

/** The fields of a Layout that do not depend on the building. */
export function describeFields(layout: Layout) {
  const { own, lot, streets, busy, strolling, cellAt, pavement, lotCrossing, ...rest } = layout;
  void [own, lot, streets, busy, strolling, cellAt, pavement, lotCrossing];
  const { corner, stop, ...places } = rest.places;
  void [corner, stop];
  return plain({ ...rest, places });
}

export interface LayoutTown {
  name: string;
  region: RegionId;
  buildings: Record<string, Building>;
}

export const LAYOUT_TOWNS: LayoutTown[] = LAYOUT_REGIONS.map((region) => ({
  name: SITES[region].map!,
  region,
  buildings: { region: buildingFor(region), standard: BUILDINGS.standard, long: BUILDINGS.long },
}));

/** Everything the layout of a town says, for each of its buildings. */
export function describeTown(town: LayoutTown) {
  const layout = layoutOf(SITES[town.region]);
  return {
    fields: describeFields(layout),
    buildings: Object.fromEntries(Object.entries(town.buildings).map(([name, building]) => [name, describeLayout(layout, building)])),
  };
}

// --- What stands in the town ---

/** A spot of the town as a line of text: the kind, the model and the place to 2 decimals, so that a list compares whatever its order. */
const at = (kind: string, file: string, x: number, z: number, turn: number, scale = 1) => `${kind} ${file} ${x.toFixed(2)} ${z.toFixed(2)} ${turn} ${scale.toFixed(2)}`;

/** The houses, trees, lamps and foothills of a town and the peaks of its range, from `townBlocks` and `rangeOf`, sorted. */
export function standing(region: RegionId, building: Building = buildingFor(region), seed: number = TOWN_SEED): { things: string[]; peaks: string[] } {
  const site = SITES[region];
  const things: string[] = [];
  for (const block of townBlocks(seed, site, building)) {
    for (const item of block.items) things.push(at('item', item.building.file, item.x, item.z, item.turn));
    for (const piece of block.hill ?? []) things.push(at('hill', piece.building.file, piece.x, piece.z, piece.turn, piece.scale));
    for (const lamp of block.lamps ?? []) things.push(at('lamp', '', lamp.x, lamp.z, 0));
  }
  const peaks = rangeOf(seed, site, building).map((p) => `${p.x.toFixed(2)} ${p.z.toFixed(2)} ${p.radius.toFixed(2)} ${p.height.toFixed(2)} ${p.sides} ${p.angle.toFixed(2)}`);
  return { things: things.sort(), peaks: peaks.sort() };
}
