// The converter of old map files (0.21.0, #327): a file of format 1 (src/mods/oldMapFile.ts, boxes that the layout code read, with the houses
// of a town left to the game's seed) is laid out as it always was and written down as a file of format 2 (src/mods/mapFile.ts).
//
// What is here is frozen: `mapLayout`, `roadLayout`, `byRoads` and `floorShift` laid a town out from its boxes, and `oldTownBlocks` and
// `oldRange` chose its houses, trees, lamps, foothills and peaks from the seed. They are copied as they were and nothing else calls them: the
// converter needs them for good, to read the old files of the folder and the `customMap` of old saves (migration 71).
//
// `readMapFile` is the way a file comes in from outside: format 2 as it is, format 1 converted first.

import { BUILDINGS, CORE, WEST, buildingFor, coreFrame, westOf, widthOf, type Building, type Rect as FloorRect } from '../config/office';
import type { RegionId } from '../config/world';
import { CITY, NATURE, type CityBuilding } from '../office/assets';
import type { HillPiece, RangePeak, TownBlock, TownBuilding } from '../office/city';
import { LAMP_HEIGHT, PAVEMENT, clearance } from '../office/clearance';
import { NO_RECEPTION, floorFaces, workOut } from '../office/drawnBuilding';
import { LOOKS, SITE_YARD, type Site } from '../office/siteLooks';
import type { Cell, Layout, Rect, Spot, Street } from '../office/townLayout';
import { MAP_FORMAT, MAP_GRID, checkMapFile, type GroundKind, type MapBox, type MapCheck, type MapFile, type MapGround, type MapHill, type MapHouse, type MapPeak, type MapRoad, type MapSettings, type MapSpot, type MapTree, type TownMap as TownMap2 } from './mapFile';
import { OLD_MAP_FORMAT, checkOldMapFile, type OldMapFile, type TileBox, type TileLane, type TownMap } from './oldMapFile';
import { OLD_MAPS } from './oldMaps';

/** The standard building: the town was laid out round it. */
const STANDARD = BUILDINGS.standard;

const sameLine = (a: number, b: number) => Math.abs(a - b) < 0.01;

/** The old parts of a town laid out from a drawing, in floor tiles. */
export interface OldMapParts {
  buildings: Rect[];
  alleys: Rect[];
  greens: Rect[];
  plot: Rect;
  courtyard: { parking: Rect[]; green: Rect[]; fountain: Spot | null };
  cells: (Rect & { i: number; j: number })[];
  medians: Rect[];
  oneWays: Street[];
  beyond: Rect[];
  water: Rect[];
  beach: Rect[];
  carriageways: Rect[];
  concrete: Rect[];
  placed: { x: number; z: number; model: string; turn: number }[];
  trees: Spot[];
  lamps: Spot[];
  roads: Street[];
  driveways: Rect[];
  mountains: Rect[];
  plots: Rect[];
}

/** What `mapLayout` and `roadLayout` made: a Layout (townLayout.ts) with the old parts. */
export type OldLayout = Omit<Layout, 'map'> & {
  map?: OldMapParts;
  /** (Added for the converter.) The bands of a town of cells: the streets along z and along x, and the railway's band. */
  bands?: { verticals: Band[]; horizontals: Band[]; rail: Band };
};

/** How large the room is a plot of ground leaves round a block of the grid, in tiles: what a block keeps free of the half streets round it. */
const PAD = { w: CITY.block.w - CITY.streetWidth - 0.3, d: CITY.block.d - CITY.streetWidth - 0.3 };

/** How tall a street lamp post stands, how far from the kerb of a green strip, and how far apart along it. */
const LAMP_INSET = 0.8;
const LAMP_EVERY = 8;

/** Two streets whose kerbs are closer than this are one road in the drawing: only the first carries traffic, as a vehicle has no room to stand between their crossings. */
const TWIN = 4;

/** How wide a street is that vehicles drive in: a lane of 2 tiles each way, which holds a vehicle drawn twice its first size (0.20.0). */
const ROAD_WIDTH = 4;

/** How far a street that runs on past the shore to the lot goes beyond the lot's block: room for a car to drive out and turn round. */
const LOT_DRIVE = 6;

/** A street this close (kerb to the company's ground) is beside the office, and carries traffic even where it lies behind it. */
const NEAR = 14;

export interface Band {
  at: number;
  /** The kerbs: west and east, or north and south. */
  from: number;
  to: number;
}

/** The lanes of a drawing as streets: lanes that lie side by side are one street. */
function bandsOf(map: TownMap, vertical: boolean, shift: number): Band[] {
  const lanes = map.lanes.filter((lane) => (vertical ? lane.h > lane.w : lane.w > lane.h));
  const spans = lanes.map((lane) => (vertical ? [lane.x + shift, lane.x + lane.w + shift] : [lane.y + shift, lane.y + lane.h + shift]) as [number, number]).sort((a, b) => a[0] - b[0]);
  const bands: Band[] = [];
  for (const [from, to] of spans) {
    const previous = bands[bands.length - 1];
    if (previous && from <= previous.to + 0.01) previous.to = Math.max(previous.to, to);
    else bands.push({ at: 0, from, to });
  }
  for (const band of bands) band.at = (band.from + band.to) / 2;
  return bands;
}

/** The models put down by hand, in floor tiles: each stands in the middle of its tile. */
const pointsOf = (points: TownMap['trees'], shift: { x: number; z: number }): Spot[] => points.map((p) => ({ x: p.x + 0.5 + shift.x, z: p.y + 0.5 + shift.z }));
const placedOf = (map: TownMap, shift: { x: number; z: number }) => map.placed.map((p) => ({ x: p.x + 0.5 + shift.x, z: p.y + 0.5 + shift.z, model: p.model, turn: p.turn }));

/** The boxes the office building stands on: the wings and the reception box. */
const floorBoxes = (map: TownMap): TileBox[] => [...map.wings, ...(map.reception ? [map.reception] : [])];

/**
 * How far a drawing is moved onto the floor grid (#289): its north edge is the building's, so a leg drawn north of the rest stays on the
 * grid (0 on the five default maps). West-east: a grid has its northmost wing along x at `WEST`; a town of roads has its westmost end there,
 * unless the building is written (see `roadLayout`).
 */
export function floorShift(map: TownMap, roads: boolean): { x: number; z: number } {
  const boxes = floorBoxes(map);
  const z = 0 - Math.min(...boxes.map((b) => b.y));
  if (roads) return { x: WEST - Math.min(...boxes.map((b) => b.x)), z };
  // (A map with no wing along x is refused by the town check, but may still be asked for its floor.)
  const along = map.wings.filter((wing) => wing.w > wing.h);
  const north = (along.length > 0 ? along : map.wings).reduce((a, b) => (b.y < a.y ? b : a));
  return { x: WEST - north.x, z };
}

function mapLayout({ id, map, settings }: OldMapFile, building: Building): OldLayout {
  const stopFromDrawing = settings.busStop.from === 'drawing';
  // The office stands at the north wing: the one wing that lies along x, furthest north.
  const shift = floorShift(map, false);
  const rect = (box: TileBox): Rect => ({ x: box.x + shift.x, z: box.y + shift.z, w: box.w, d: box.h });

  const verticals = bandsOf(map, true, shift.x);
  const horizontals = bandsOf(map, false, shift.z);
  const sw = Math.min(...[...verticals, ...horizontals].map((band) => band.to - band.from));
  const half = sw / 2;

  const buildings = map.buildings.map(rect);
  const alleys = map.alleys.map(rect);
  const train = rect(map.train!);
  const plotBox = map.wings.map(rect);
  const x0 = Math.min(...plotBox.map((r) => r.x));
  const z0 = Math.min(...plotBox.map((r) => r.z));
  const plot: Rect = { x: x0, z: z0, w: Math.max(...plotBox.map((r) => r.x + r.w)) - x0, d: Math.max(...plotBox.map((r) => r.z + r.d)) - z0 };

  // The last street east of the drawing: its outermost column of blocks is the last thing in it.
  const eastEnd = Math.max(...[...buildings, ...alleys].map((r) => r.x + r.w));
  const lastEast: Band = { at: eastEnd + half, from: eastEnd, to: eastEnd + sw };
  // Likewise west of the drawing, where its blocks reach further west than its westernmost street: one more street beyond them.
  const westEnd = Math.min(...[...buildings, ...alleys].map((r) => r.x));
  const firstWest: Band | null = verticals.length === 0 || verticals[0]!.from > westEnd + 0.01 ? { at: westEnd - half, from: westEnd - sw, to: westEnd } : null;
  const xs = [...(firstWest ? [firstWest] : []), ...verticals, lastEast];
  const rail: Band = { at: train.z + train.d / 2, from: train.z, to: train.z + train.d };
  // The railway is the last of them, south of the town, unless the drawing has it elsewhere (behind the office, in the north).
  const zs = [...horizontals, rail].sort((a, b) => a.at - b.at);

  const from = { x: xs[0]!.at, z: zs[0]!.at };
  const length = { x: xs[xs.length - 1]!.at - from.x, z: zs[zs.length - 1]!.at - from.z };

  // The reception's street: the street the drawing's bus stop is on the kerb of.
  const busStop = stopFromDrawing ? map.busStop : null;
  const stopAt = busStop ? { x: busStop.x + shift.x, z: busStop.y + shift.z } : null;
  const stopStreet = stopAt ? verticals.reduce((a, b) => (Math.min(Math.abs(b.from - stopAt.x), Math.abs(b.to - stopAt.x)) < Math.min(Math.abs(a.from - stopAt.x), Math.abs(a.to - stopAt.x)) ? b : a)) : verticals[0]!;

  // The company's block, from alley to alley across the plot; a longer building reaches over the street east of it.
  const alleyNorth = alleys.filter((r) => r.z + r.d <= plot.z + 0.01).reduce<Rect | null>((a, r) => (a && a.z > r.z ? a : r), null);
  const alleyNorthEdge = alleyNorth ? alleyNorth.z : plot.z;
  const alleySouth = alleys.filter((r) => r.z >= plot.z + plot.d - 0.01).reduce<Rect | null>((a, r) => (a && a.z < r.z ? a : r), null);
  const alleySouthEdge = alleySouth ? alleySouth.z + alleySouth.d : plot.z + plot.d;
  const eastOf = (at: number) => xs.find((band) => band.at > at + 0.01) ?? lastEast;
  // A drawing may have no street west of the company's ground: then its block reaches as far west as the U's reception door needs.
  const westStreet = verticals.filter((band) => band.at < plot.x).reduce<Band>((a, b) => (b.at > a.at ? b : a), { at: plot.x - 2 * sw, from: plot.x - 2.5 * sw, to: plot.x - 1.5 * sw });
  const eastStreet = eastOf(plot.x + plot.w);
  const own = (building: Building): Rect => {
    const east = building.blocks > BUILDINGS.standard.blocks ? eastOf(eastStreet.at) : eastStreet;
    return { x: westStreet.at, z: alleyNorthEdge, w: east.at - westStreet.at, d: alleySouthEdge - alleyNorthEdge };
  };
  const streets =(building: Building): Street[] => {
    const o = own(building);
    return [
      ...xs.filter((band) => !(band.at > o.x + 0.01 && band.at < o.x + o.w - 0.01)).map((band): Street => ({ along: 'z', at: band.at })),
      ...zs.filter((band) => !(band.at > o.z + 0.01 && band.at < o.z + o.d - 0.01)).map((band): Street => ({ along: 'x', at: band.at })),
    ];
  };
  /** The streets, each kept only if the kerbs of the one before it are far enough off. */
  const twinOf = new Map<Street, Street>();
  const roads = (lines: Street[], along: 'x' | 'z'): Street[] => {
    const kept: Street[] = [];
    for (const line of lines.filter((l) => l.along === along).sort((a, b) => a.at - b.at)) {
      const before = kept[kept.length - 1];
      if (!before || line.at - before.at - sw >= TWIN) kept.push(line);
      else twinOf.set(before, line);
    }
    return kept;
  };
  /**
   * The street as it is driven (#194): with the lanes of the drawing where it gives them a direction. Two carriageways side by side are one road with
   * a strip between them, and the game drives on the right everywhere: the drawing, mirrored, has the carriageways the wrong way round, so they swap.
   */
  const driven = (street: Street): Street => {
    const vertical = street.along === 'z';
    const drawnBands = vertical ? verticals : horizontals;
    const bandOf = (s: Street) => drawnBands.find((band) => sameLine(band.at, s.at));
    const twin = twinOf.get(street);
    const bands = [bandOf(street), twin ? bandOf(twin) : undefined].filter((b): b is Band => b !== undefined);
    const drawn = map.lanes
      .filter((lane) => (vertical ? lane.h > lane.w : lane.w > lane.h))
      .map((lane) => ({ lane, box: rect(lane) }))
      .map(({ lane, box }) => ({ at: vertical ? box.x + box.w / 2 : box.z + box.d / 2, dir: lane.dir }));
    const carriageways = bands.map((band) => drawn.filter((l) => l.at > band.from && l.at < band.to));
    if (carriageways.length === 0 || carriageways.some((lanes) => lanes.length === 0 || lanes.some((l) => l.dir === 'both'))) return street;
    const sign = (dir: string) => (dir === 'south' || dir === 'east' ? 1 : -1) as 1 | -1;
    let directions = carriageways.map((lanes) => sign(lanes[0]!.dir));
    // Driving on the right: the carriageway on the larger side of the road is the one heading east (along x) or north (along z).
    if (bands.length === 2 && directions[0] !== directions[1]) directions = [vertical ? 1 : -1, vertical ? -1 : 1];
    const lanes = carriageways.flatMap((ls, n) => ls.map((l) => ({ at: l.at, direction: directions[n]! })));
    const from = bands[0]!.from;
    const to = bands[bands.length - 1]!.to;
    return { ...street, at: (from + to) / 2, width: to - from, lanes: lanes.sort((a, b) => a.at - b.at) };
  };

  // The one-way streets (#235), as they are driven, busy or not: every lane of them runs the same way. The railway is not a street.
  const standardStreets = streets(STANDARD);
  const oneWays = [...roads(standardStreets, 'z'), ...roads(standardStreets, 'x')]
    .filter((street) => !(street.along === 'x' && sameLine(street.at, rail.at)))
    .map(driven)
    .filter((street) => street.lanes !== undefined && street.lanes.length > 0 && street.lanes.every((lane) => lane.direction === street.lanes![0]!.direction));

  // The grid the streets make, from kerb to kerb: the cells have the drawing's contents in them.
  const cells: OldMapParts['cells'] = [];
  const medians: Rect[] = [];
  // The ground of the drawing south of its last street (the company's own row, in a drawing whose streets end north of it) is one more row.
  const bottom = Math.max(...[...buildings, ...alleys, plot].map((r) => r.z + r.d));
  const lastZ = zs[zs.length - 1]!;
  const rows = bottom > lastZ.to + 1 ? [...zs, { at: bottom, from: bottom, to: bottom }] : zs;
  xs.slice(0, -1).forEach((a, i) => {
    rows.slice(0, -1).forEach((b, j) => {
      const next = [xs[i + 1]!, rows[j + 1]!] as const;
      const cell = { i, j, x: a.to, z: b.to, w: next[0].from - a.to, d: next[1].from - b.to };
      cells.push(cell);
      // The strip between the two carriageways of a road (0.20.0): a narrow cell between two streets, but not the one between the last street and the railway.
      if (Math.min(cell.w, cell.d) < 6 && !sameLine(b.at, rail.at) && !sameLine(next[1].at, rail.at) && b.at !== bottom && next[1].at !== bottom) medians.push({ x: cell.x, z: cell.z, w: cell.w, d: cell.d });
    });
  });
  const middleOf = (r: Rect): Cell => ({ x: r.x + r.w / 2, z: r.z + r.d / 2, w: r.w, d: r.d });
  /** Strollers walk round the cells that are blocks, not the strips between the two streets of a road. */
  const wide = (r: Rect) => Math.min(r.w, r.d) >= 6;
  /** The row of cells the company's ground is in. */
  const ownRow = cells.find((c) => plot.x + 1 >= c.x && plot.x + 1 <= c.x + c.w && plot.z + 1 >= c.z && plot.z + 1 <= c.z + c.d)?.j ?? 0;
  /** The cells that are the office's own block: those of its row between its streets. */
  const isOwn = (building: Building, c: OldMapParts['cells'][number]) => {
    const o = own(building);
    return c.j === ownRow && c.x >= o.x - 0.01 && c.x + c.w <= o.x + o.w + half + 0.01;
  };
  /** A cell cut short at a street that runs through it (the made-up street east of a drawing may lie among the drawn ones). */
  const clipped = (c: Rect): Rect => {
    const through = xs.filter((band) => band.from > c.x + 0.01 && band.from < c.x + c.w - 0.01);
    return through.length === 0 ? c : { ...c, w: Math.min(...through.map((band) => band.from)) - c.x };
  };
  /** A cell of the office's row that reaches over all of the office's ground (one big cell, in a drawing without streets round it): no block of other people's. */
  const holdsOffice = (building: Building, c: OldMapParts['cells'][number]) => {
    const o = own(building);
    return c.j === ownRow && c.x < o.x + half + 0.01 && c.x + c.w > o.x + o.w - half - 0.01;
  };

  // The outermost row of blocks in the north, once more beyond the northernmost street: mirrored over the two streets it lies behind.
  const top = Math.min(...buildings.map((r) => r.z));
  const northStreets = horizontals.filter((band) => !sameLine(band.at, rail.at));
  const mirror = ((northStreets[0] ?? zs[0]!).at + (northStreets[1] ?? zs[1]!).at) / 2;
  // (Not where the railway runs behind the northernmost street: nothing is beyond that.)
  const beyond = sameLine(zs[0]!.at, rail.at) ? [] : buildings.filter((r) => r.z === top).map((r): Rect => ({ x: r.x, z: 2 * mirror - (r.z + r.d), w: r.w, d: r.d }));

  // Both stops are on the reception's street, in its lane on the office's side. The drawing has the bus stop level with the
  // reception of the U, in the middle of the west wing (0.20.0: the capital's building is the U). The taxi stands north of it,
  // so that nobody who is not due at the bus stop has to wait behind a bus on the way to the taxi stand, and no bus behind a
  // waiting taxi before its stop.
  // (A drawing without a U has the standard building's door, on the west face of the company's ground.)
  // The building is the region's own (0.20.0): its entrance faces west, or north or south, and everything here follows it.
  const facing = building.core.faces;
  const { point } = coreFrame(building);
  const mid = CORE.entry.y + 0.5;
  const gate: Spot = point(-1, mid);
  const doorAt: Spot = point(-0.15, mid);
  const busPos = (facing === 'w' ? gate.z : gate.x) + 0.9;
  // Without a street beside the entrance (none west of the company's ground, or none near), the stops are on the street along
  // the front or the back of it, level with the entrance, the taxi west of the bus. An entrance facing north or south is on
  // the street along the front or the back of the building to begin with.
  const westNear = !busStop && !verticals.some((band) => (band.to <= plot.x + 0.01 && plot.x - band.to <= NEAR) || (band.from >= plot.x + plot.w - 0.01 && band.from - plot.x - plot.w <= NEAR));
  const nearest = horizontals
    .filter((band) => !sameLine(band.at, rail.at))
    .filter((band) => (facing === 's' ? band.from >= plot.z + plot.d - 0.01 : facing === 'n' ? band.to <= plot.z + 0.01 : true))
    .map((band) => ({ band, gap: band.to <= plot.z ? plot.z - band.to : band.from - (plot.z + plot.d) }))
    .filter(({ gap }) => gap >= 0 && gap <= NEAR)
    .sort((a, b) => a.gap - b.gap)[0];
  const onAcross = (facing !== 'w' || westNear) && nearest;
  const stops = onAcross
    ? { bus: { along: 'x' as const, at: nearest.band.at, pos: gate.x }, taxi: { along: 'x' as const, at: nearest.band.at, pos: gate.x - 7 } }
    : {
        bus: { along: 'z' as const, at: stopStreet.at, pos: busPos },
        taxi: { along: 'z' as const, at: stopStreet.at, pos: busPos - 6.4 },
      };
  const railStrips: { from: number; to: number }[] = xs.slice(0, -1).map((band, i) => ({ from: band.to, to: xs[i + 1]!.from }));
  // The courtyard of the U (0.20.0): the lot is all of it, two parking strips with the green between them, and opens onto
  // the street east of the plot, along the mouth of the U.
  const yard = map.courtyard;
  // A drawing without a U has its parking where it is drawn: those strips are the lot.
  // The lot lays its bays along x, so strips drawn upright are made into one lying one: from the nearest of them to the street east of the company's ground.
  const drawn = (yard.parking.length > 0 ? yard.parking : map.parking).map(rect);
  const lying = drawn.filter((r) => r.w >= r.d);
  const upright = drawn.filter((r) => r.w < r.d).sort((a, b) => Math.abs(a.x - eastStreet.from) - Math.abs(b.x - eastStreet.from))[0];
  const gapToStreet = upright ? eastStreet.from - upright.x : 0;
  const strips: Rect[] = lying.length > 0 || !upright || gapToStreet < 12 ? lying : [{ x: upright.x, z: upright.z + upright.d / 2 - 3, w: gapToStreet, d: 6 }];
  const courtyard: OldMapParts['courtyard'] = {
    parking: strips,
    green: yard.green.map(rect),
    fountain: yard.fountain ? { x: yard.fountain.x + shift.x, z: yard.fountain.y + shift.z } : null,
  };
  const yardBoxes = [...courtyard.parking, ...courtyard.green];
  const yardX = Math.min(...yardBoxes.map((r) => r.x));
  const yardZ = Math.min(...yardBoxes.map((r) => r.z));
  const lotBlock: Rect = { x: yardX, z: yardZ, w: Math.max(...yardBoxes.map((r) => r.x + r.w)) - yardX, d: Math.max(...yardBoxes.map((r) => r.z + r.d)) - yardZ };
  // Their door in: on the courtyard face of the west wing, level with the reception.
  const courtDoor: Spot = { x: lotBlock.x + 0.15, z: gate.z };
  // With the entrance on the south or the north face and the lot on the other side of the building: the people of the lot go round the
  // building's east corner, along the pavement between it and the street east of it.
  const round: Spot | null = facing === 'w' ? null : { x: (plot.x + plot.w + eastStreet.from) / 2, z: gate.z };
  // A lot south of the town's last street (the shore): the street it opens onto would end at that last street, short of the lot's gate. It runs
  // on past it instead, as a drive that only the lot's cars use (traffic.ts), to a dead end a little way beyond the lot.
  const lotPast = lotBlock.z > zs[zs.length - 1]!.at;

  // The streets as asphalt (#285): the streets along z run from the first street along x to the last, those along x from the first to the last along z. The railway is not a street.
  const through = zs.filter((band) => !sameLine(band.at, rail.at));
  const carriageways: Rect[] =
    through.length === 0
      ? []
      : [
          ...xs.map((band): Rect => ({ x: band.from, z: through[0]!.from, w: band.to - band.from, d: through[through.length - 1]!.to - through[0]!.from })),
          ...through.map((band): Rect => ({ x: xs[0]!.from, z: band.from, w: xs[xs.length - 1]!.to - xs[0]!.from, d: band.to - band.from })),
        ];

  return {
    id,
    streetWidth: sw,
    from,
    length,
    railway: { z: rail.at, from: from.x, length: length.x, width: train.d, strips: settings.railway === 'ground' ? [] : railStrips, ...(settings.railway === 'ground' && { ground: true as const }) },
    own,
    lot: () => ({ block: lotBlock, street: eastStreet.at }),
    streets,
    busy: (building) => {
      const o = own(building);
      const all = streets(building);
      const x = roads(all.filter((l) => l.along === 'z' && l.at >= o.x - 0.01 && l.at < lastEast.at - 0.01), 'z');
      const z = roads(all.filter((l) => l.along === 'x' && (l.at >= o.z - 0.01 || (onAcross && sameLine(l.at, nearest.band.at))) && !sameLine(l.at, rail.at)), 'x');
      return [...x, ...z].map(driven).map((street) => (lotPast && street.along === 'z' && sameLine(street.at, eastStreet.at) ? { ...street, from: from.z, to: lotBlock.z + lotBlock.d + LOT_DRIVE } : street));
    },
    stops,
    places: {
      door: doorAt,
      gate,
      corner: (stop) => (facing === 'w' ? { x: gate.x, z: stop.z } : { x: stop.x, z: gate.z }),
      stop: (wait) => wait,
      // Round the back of the office, out of sight: down the alleyway behind it, in line with the entrance. With the entrance on the
      // south face the alley behind is the lot's: along the pavement in front, from the street east of it.
      away: facing === 'w' ? { x: gate.x, z: plot.z - 2.5 } : { x: eastStreet.from - 0.4, z: gate.z },
      court: facing === 'w' ? courtDoor : null,
      round,
    },
    strolling: (building) => {
      const mine = cells.filter((c) => isOwn(building, c));
      // (A drawing whose row is one cell reaching far past the office's streets has none of its own: the block is then the office's
      // ground, from kerb to kerb, and that big cell is no block of other people's.)
      const o = own(building);
      // Where no street or alley runs beside the building, it is walked round 1.6 tiles out from its walls.
      const clear = 1.6;
      const x0w = Math.min(o.x + half, ...building.wings.map((r) => r.x - clear));
      const x1w = Math.max(o.x + o.w - half, ...building.wings.map((r) => r.x + r.w + clear));
      const z0w = Math.min(o.z, ...building.wings.map((r) => r.y - clear));
      const z1w = Math.max(o.z + o.d, ...building.wings.map((r) => r.y + r.h + clear));
      const ground: Rect = { x: x0w, z: z0w, w: x1w - x0w, d: z1w - z0w };
      const x0 = Math.min(...mine.map((c) => c.x));
      const z0 = Math.min(...mine.map((c) => c.z));
      const outline: Rect = mine.length > 0 ? { x: x0, z: z0, w: Math.max(...mine.map((c) => c.x + c.w)) - x0, d: Math.max(...mine.map((c) => c.z + c.d)) - z0 } : ground;
      return { own: middleOf(outline), others: cells.filter((c) => wide(c) && !isOwn(building, c) && !holdsOffice(building, c)).map((c) => middleOf(clipped(c))) };
    },
    cellAt: (building, x, z) => {
      const found = cells.find((c) => x >= c.x && x <= c.x + c.w && z >= c.z && z <= c.z + c.d);
      return found && wide(found) && !isOwn(building, found) && !holdsOffice(building, found) ? middleOf(found) : null;
    },
    pavement: (_building, x, z) => !xs.some((band) => x > band.from + 0.001 && x < band.to - 0.001) && !zs.some((band) => z > band.from + 0.001 && z < band.to - 0.001),
    lotCrossing: () => null,
    bands: { verticals: xs, horizontals: zs.filter((band) => band !== rail), rail },
    map: { buildings, alleys, greens: map.greens.map(rect).filter((r) => r.x >= xs[0]!.to - 0.01 && r.x + r.w <= xs[xs.length - 1]!.from + 0.01), plot, courtyard, cells, medians, oneWays, beyond, carriageways, water: map.water.map(rect), beach: map.beach.map(rect), concrete: map.concrete.map(rect), placed: placedOf(map, shift), trees: pointsOf(map.trees, shift), lamps: pointsOf(map.lamps, shift), roads: [], driveways: [], mountains: [], plots: [] },
  };
}

// --- A town laid out by its roads (#218) ---

/**
 * Whether a drawing is laid out by its roads (Aerial Fields and Amplify Hills), not as a grid of cells (#283). It is when it
 * draws a road as one lane with ends of its own: a lane 1 tile wide, or a lane 2 tiles wide with no other lane along its long
 * side. A grid draws every street as two or more lanes side by side, across the whole drawing.
 */
export function byRoads(map: TownMap): boolean {
  const thin = (lane: TileLane) => Math.min(lane.w, lane.h) < 2;
  const upright = (lane: TileLane) => lane.h > lane.w;
  /** Another lane of the same direction lying against the long side of this one, over some of its length. */
  const beside = (lane: TileLane, other: TileLane) => {
    if (other === lane || upright(other) !== upright(lane)) return false;
    const [across, wide] = upright(lane) ? (['x', 'w'] as const) : (['y', 'h'] as const);
    const [along, long] = upright(lane) ? (['y', 'h'] as const) : (['x', 'w'] as const);
    const touching = other[across] === lane[across] + lane[wide] || other[across] + other[wide] === lane[across];
    return touching && other[along] < lane[along] + lane[long] && other[along] + other[long] > lane[along];
  };
  return map.lanes.some((lane) => thin(lane) || !map.lanes.some((other) => beside(lane, other)));
}

/** How long a plot is along a band of houses, about, in tiles. */
const PLOT = 11;
/** The lot is this long along its road: the length of its bays and its walkway (parking.ts). */
const LOT_LENGTH = 13;
/** The lot stands this far from the end of a road it opens onto, so that a car can turn in. */
const LOT_END = 3;

function roadLayout({ id, map, settings }: OldMapFile, house: Building): OldLayout {
  const face = westOf(house);
  const { point } = coreFrame(house);
  // The building stands on all the red shapes (0.20.0): the drawing is shifted so that its westmost wing is the building's west face,
  // and its north edge is the building's.
  const shift = { ...floorShift(map, true), x: face - Math.min(...floorBoxes(map).map((w) => w.x)) };
  const rect = (box: TileBox): Rect => ({ x: box.x + shift.x, z: box.y + shift.z, w: box.w, d: box.h });

  // The roads are the 2-tile lanes; the 1-tile ones are driveways. Lanes in a line, with no more than a junction between them, are one road.
  const lanes = map.lanes.map(rect);
  const sw = Math.min(...lanes.map((r) => Math.min(r.w, r.d)).filter((n) => n >= 2));
  const half = sw / 2;
  // A road is drawn 2 tiles wide, but vehicles are drawn twice as large (0.20.0): it is driven as a road of 4, a lane of 2 tiles each way, as the streets of the other towns are.
  const driven = Math.max(sw, ROAD_WIDTH);
  const isRoad = (r: Rect) => Math.min(r.w, r.d) >= 2;
  type Road = Required<Pick<Street, 'along' | 'at' | 'from' | 'to'>>;
  const lines = lanes.filter(isRoad).map((r): Road => (r.w > r.d ? { along: 'x', at: r.z + r.d / 2, from: r.x, to: r.x + r.w } : { along: 'z', at: r.x + r.w / 2, from: r.z, to: r.z + r.d }));
  const joined = (list: Road[]): Road[] => {
    const out: Road[] = [];
    for (const line of [...list].sort((p, q) => (p.along < q.along ? -1 : p.along > q.along ? 1 : p.at - q.at || p.from - q.from))) {
      const same = out.find((r) => r.along === line.along && sameLine(r.at, line.at) && line.from <= r.to + sw + 0.01 && line.to >= r.from - sw - 0.01);
      if (same) {
        same.from = Math.min(same.from, line.from);
        same.to = Math.max(same.to, line.to);
      } else out.push({ ...line });
    }
    return out;
  };
  // Two roads side by side whose kerbs are closer than TWIN, one beginning where the other ends (the drawing steps a road aside at a
  // junction), are one road: a vehicle has no room to stand between their junctions. The later one moves to the first's line.
  const stepped = joined(lines);
  for (const along of ['x', 'z'] as const) {
    const group = stepped.filter((r) => r.along === along).sort((p, q) => p.at - q.at);
    group.forEach((road, n) => {
      const before = group.slice(0, n).find((p) => !sameLine(p.at, road.at) && road.at - p.at - sw < TWIN && road.from <= p.to + sw + 0.01 && road.to >= p.from - sw - 0.01);
      if (before) road.at = before.at;
    });
  }
  const roads = joined(stepped);
  // A road that ends beside another (the drawing's lanes stop at each other's kerbs) ends on the other's middle line.
  const drawn = roads.map((r) => ({ ...r }));
  for (const road of roads) {
    for (const end of ['from', 'to'] as const) {
      const near = drawn
        .filter((o) => o.along !== road.along && Math.abs(o.at - road[end]) <= sw + 0.01 && road.at >= o.from - half - 0.01 && road.at <= o.to + half + 0.01)
        .sort((a, b) => Math.abs(a.at - road[end]) - Math.abs(b.at - road[end]))[0];
      if (near) road[end] = near.at;
    }
  }

  // The edge of the drawing: all of it. A road that reaches it is where vehicles come in.
  const everything = [...map.lanes, ...map.buildings, ...map.alleys, ...map.mountains, ...map.greens, ...map.wings, ...map.parking, ...map.courtyard.parking, ...map.water, ...map.beach, ...(map.train ? [map.train] : [])].map(rect);
  const edgeX = Math.min(...everything.map((r) => r.x));
  const edgeZ = Math.min(...everything.map((r) => r.z));
  const edge: Rect = { x: edgeX, z: edgeZ, w: Math.max(...everything.map((r) => r.x + r.w)) - edgeX, d: Math.max(...everything.map((r) => r.z + r.d)) - edgeZ };

  const wingBoxes = map.wings.map(rect);
  const plotX = Math.min(...wingBoxes.map((r) => r.x));
  const plotZ = Math.min(...wingBoxes.map((r) => r.z));
  const plot: Rect = { x: plotX, z: plotZ, w: Math.max(...wingBoxes.map((r) => r.x + r.w)) - plotX, d: Math.max(...wingBoxes.map((r) => r.z + r.d)) - plotZ };
  const train = rect(map.train!);
  // The entrance, as in a town of cells: the gate on the pavement in front of it and the door in the wall.
  const gate: Spot = point(-1, CORE.entry.y + 0.5);
  const doorAt: Spot = point(-0.15, CORE.entry.y + 0.5);

  // The lot: the drawn parking strip nearest the door, opening onto the road south of it. It is as long as its bays need, from
  // the end of the strip nearest that road's end (but clear of it), and clear of the building's south face.
  // (In a drawing with a U, the strips are in its courtyard.)
  const strips = [...map.parking, ...map.courtyard.parking].map(rect);
  // (Two strips as far from the door, on either side of it: the west one, as the lot has always been on that side of the building.)
  const gap = (r: Rect) => Math.abs(r.x + r.w / 2 - gate.x);
  const strip = strips.reduce((a, b) => (gap(b) < gap(a) - 0.01 || (Math.abs(gap(b) - gap(a)) <= 0.01 && b.x < a.x) ? b : a));
  const street = roads.filter((r) => r.along === 'x' && r.at >= strip.z + strip.d - 0.01 && r.from <= strip.x + strip.w && r.to >= strip.x).reduce((a, b) => (b.at < a.at ? b : a));
  const lotEast = Math.min(strip.x + strip.w, street.to - LOT_END);
  // (Clear of the floor above it: the south edge of the wings that stand over the strip, or the building's depth if none do.)
  const over = house.wings.filter((w) => w.x < strip.x + strip.w && w.x + w.w > strip.x).map((w) => w.y + w.h);
  const lotNorth = Math.max(strip.z, (over.length > 0 ? Math.max(...over) : house.depth) + 2);
  const lotWidth = Math.min(LOT_LENGTH, strip.w);
  const lotBlock: Rect = { x: lotEast - lotWidth, z: lotNorth, w: lotWidth, d: strip.z + strip.d - lotNorth };

  // The stops: on the road south of the lot, the bus level with the entrance (see BusStopRule) and the taxi west of it.
  const busPos = gate.x + (settings.busStop.from === 'entrance' ? settings.busStop.shift : 0);
  const stops = { bus: { along: 'x' as const, at: street.at, pos: busPos }, taxi: { along: 'x' as const, at: street.at, pos: busPos - 6.4 } };

  // The plots: a house with its garden on each. A band of houses is cut into plots of about PLOT tiles along it.
  const plots = map.buildings.map(rect).flatMap((band): Rect[] => {
    const lengthwise = band.w >= band.d ? 'x' : 'z';
    const length = lengthwise === 'x' ? band.w : band.d;
    if (length < 1.5 * PLOT) return [band];
    const count = Math.round(length / PLOT);
    return Array.from({ length: count }, (_, n): Rect => (lengthwise === 'x' ? { ...band, x: band.x + (n * length) / count, w: length / count } : { ...band, z: band.z + (n * length) / count, d: length / count }));
  });

  const onRoad = (x: number, z: number) =>
    roads.some((r) => (r.along === 'x' ? Math.abs(z - r.at) < half - 0.001 && x > r.from - half && x < r.to + half : Math.abs(x - r.at) < half - 0.001 && z > r.from - half && z < r.to + half));
  // The people out for a walk go round the building.
  const WALK = 1.6;
  // (Where open water lies against the building, as the lake does in Amplify Hills between the legs, they keep to its front instead, the
  // reception's rows and the pavement south of them: a loop round the whole of it would be walking on the lake.)
  const reception = map.reception ? rect(map.reception) : null;
  const lakeside = reception !== null && map.water.map(rect).some((w) => w.x < face + widthOf(house) && w.x + w.w > face && w.z < house.depth && w.z + w.d > 0);
  const body: Rect = reception && lakeside ? { x: face, z: reception.z, w: widthOf(house), d: house.depth - reception.z } : { x: face, z: 0, w: widthOf(house), d: house.depth };
  // The corner the people out for a walk go to when they leave: the inner corner of the west leg of a U; with none, the reception's own corner.
  const westFront = house.wings.filter((w) => w.y + w.h === house.depth && w.x + w.w <= gate.x).map((w) => w.x + w.w);
  const awayX = westFront.length > 0 ? Math.max(...westFront) + 1.5 : Math.min(...house.wings.filter((w) => w.y + w.h === house.depth && w.x <= gate.x && w.x + w.w > gate.x).map((w) => w.x)) - 1.5;

  // The walking paths: the ring round the whole building, 1.6 tiles out, cut where it would run over a road as drawn (half the driven
  // width and a little more), over open water or into a wing. What is left in stretches of 8 tiles and more are the paths: people walk
  // to the end of one, turn and walk back.
  const wingRects = house.wings.map((w): Rect => ({ x: w.x, z: w.y, w: w.w, d: w.h }));
  const waters = map.water.map(rect);
  const ringBox = {
    x0: Math.min(...wingRects.map((r) => r.x)) - WALK,
    z0: Math.min(...wingRects.map((r) => r.z)) - WALK,
    x1: Math.max(...wingRects.map((r) => r.x + r.w)) + WALK,
    z1: Math.max(...wingRects.map((r) => r.z + r.d)) + WALK,
  };
  const STEP = 0.25;
  const ring: [number, number][] = [];
  for (let x = ringBox.x0; x < ringBox.x1 - 1e-9; x += STEP) ring.push([x, ringBox.z0]);
  for (let z = ringBox.z0; z < ringBox.z1 - 1e-9; z += STEP) ring.push([ringBox.x1, z]);
  for (let x = ringBox.x1; x > ringBox.x0 + 1e-9; x -= STEP) ring.push([x, ringBox.z1]);
  for (let z = ringBox.z1; z > ringBox.z0 + 1e-9; z -= STEP) ring.push([ringBox.x0, z]);
  const kerb = driven / 2 + 0.5;
  const blocked = ([x, z]: [number, number]) =>
    roads.some((r) => (r.along === 'x' ? Math.abs(z - r.at) < kerb && x > r.from - kerb && x < r.to + kerb : Math.abs(x - r.at) < kerb && z > r.from - kerb && z < r.to + kerb)) ||
    waters.some((w) => x > w.x - 0.5 && x < w.x + w.w + 0.5 && z > w.z - 0.5 && z < w.z + w.d + 0.5) ||
    // (A track on the ground is walked over only at a level crossing, by those who stop for its barrier, 0.21.0: the paths are cut at it.)
    (settings.railway === 'ground' && x > train.x - 0.5 && x < train.x + train.w + 0.5 && z > train.z - 0.5 && z < train.z + train.d + 0.5) ||
    wingRects.some((w) => x > w.x - 0.1 && x < w.x + w.w + 0.1 && z > w.z - 0.1 && z < w.z + w.d + 0.1);
  const walks: [number, number][][] = [];
  const first = ring.findIndex(blocked);
  if (first >= 0) {
    let run: [number, number][] = [];
    const close = () => {
      // (Only the corners, where the path turns.)
      const turns = (p: [number, number], k: number) => Math.abs((p[0] - run[k - 1]![0]) * (run[k + 1]![1] - p[1]) - (p[1] - run[k - 1]![1]) * (run[k + 1]![0] - p[0])) > 1e-6;
      const bends = run.filter((p, k) => k === 0 || k === run.length - 1 || turns(p, k));
      if (bends.length > 1 && (run.length - 1) * STEP >= 8) walks.push(bends);
      run = [];
    };
    for (let k = 1; k <= ring.length; k++) {
      const p = ring[(first + k) % ring.length]!;
      if (blocked(p)) close();
      else run.push(p);
    }
  }

  // The roads as asphalt (#285), each over its own length: the ends beside another road reach its far kerb, those at the edge of the drawing run on out of sight.
  const OUT = 60;
  const carriageways = roads.map((road): Rect => {
    const [low, high] = road.along === 'x' ? [edge.x, edge.x + edge.w] : [edge.z, edge.z + edge.d];
    const from = road.from - (Math.abs(road.from - low) < 0.01 ? OUT : driven / 2);
    const to = road.to + (Math.abs(road.to - high) < 0.01 ? OUT : driven / 2);
    return road.along === 'x' ? { x: from, z: road.at - driven / 2, w: to - from, d: driven } : { x: road.at - driven / 2, z: from, w: driven, d: to - from };
  });

  return {
    id,
    streetWidth: driven,
    from: { x: edge.x, z: edge.z },
    length: { x: edge.w, z: edge.d },
    edge,
    // The train runs where the drawing has it, on pillars between which no road passes: a plinth every 20 tiles.
    railway: {
      z: train.z + train.d / 2,
      from: train.x,
      length: train.w,
      width: train.d,
      strips: settings.railway === 'ground' ? [] : Array.from({ length: Math.floor(train.w / 20) }, (_, n) => ({ from: train.x + n * 20 + 8.5, to: train.x + n * 20 + 11.5 })),
      ...(settings.railway === 'ground' && { ground: true as const }),
    },
    own: () => plot,
    lot: () => ({ block: lotBlock, street: street.at, along: 'x', side: -1 }),
    streets: () => roads,
    busy: () => roads,
    stops,
    places: {
      door: doorAt,
      gate,
      // Straight from the stop to the entrance, over the pavement.
      corner: (stop) => stop,
      stop: (wait) => wait,
      // Round the back of the office, out of sight: behind it; or, for an entrance in the U, along the front pavement west to the inner corner of the west leg;
      // or, with no wing ending on the front west of the door (Amplify Hills), to the corner of the reception, 1.5 tiles out.
      away: { x: awayX, z: gate.z },
      court: null,
    },
    strolling: () => ({ own: { x: body.x + body.w / 2, z: body.z + body.d / 2, w: body.w + 2 * WALK, d: body.d + 2 * WALK }, others: [], paths: walks }),
    cellAt: () => null,
    pavement: (_building, x, z) => !onRoad(x, z),
    lotCrossing: () => null,
    map: {
      buildings: map.buildings.map(rect),
      alleys: [],
      greens: map.greens.map(rect),
      plot,
      courtyard: { parking: [], green: [], fountain: null },
      cells: [],
      medians: [],
      oneWays: [],
      beyond: [],
      carriageways,
      water: map.water.map(rect),
      beach: map.beach.map(rect),
      concrete: map.concrete.map(rect),
      placed: placedOf(map, shift),
      trees: pointsOf(map.trees, shift),
      lamps: pointsOf(map.lamps, shift),
      roads,
      driveways: [...lanes.filter((r) => !isRoad(r)), ...strips.filter((r) => r !== strip)],
      mountains: map.mountains.map(rect),
      plots,
    },
  };
}


/** A pseudo-random number from 0 to 1 for a block, fixed for a game's seed. */
function chance(seed: number, i: number, j: number, salt: number): number {
  let h = (i * 374761393 + j * 668265263 + salt * 2147483647 + Math.imul(seed | 0, 1597334677)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}


/**
 * The range behind the town, on the far mountain rect of its drawing: three rows of
 * peaks, each row higher than the one in front. Fixed by the seed, like the town;
 * only in the hills.
 */
export function oldRange(seed: number, site: Site, layout: OldLayout): RangePeak[] {
  const mountains = site.hills ? (layout.map?.mountains ?? []) : [];
  // The far rect is the one furthest north.
  const rect = mountains.reduce<Rect | null>((a, r) => (a && a.z < r.z ? a : r), null);
  if (!rect) return [];
  const peaks: RangePeak[] = [];
  const middle = rect.x + rect.w / 2;
  const rows = [{ out: 12, height: 7, back: 0.85 }, { out: 22, height: 12, back: 0.5 }, { out: 34, height: 17, back: 0.15 }];
  const step = rect.w / 13;
  rows.forEach((row, r) => {
    for (let n = -6; n <= 6; n++) {
      const at = (r * 13 + n) * 31;
      const radius = row.out * 0.6 * (0.75 + chance(seed, n, r, 31) * 0.5);
      peaks.push({
        x: middle + n * step + (chance(seed, n, r, 32) - 0.5) * step * 0.6,
        z: rect.z + rect.d * row.back + (chance(seed, n, r, 33) - 0.5) * 6,
        radius,
        height: row.height * (0.7 + chance(seed, n, r, 34) * 0.6),
        sides: 5 + Math.floor(chance(seed, at, r, 35) * 2),
        angle: chance(seed, n, r, 36) * Math.PI,
      });
    }
  });
  return peaks;
}


/** The room left between two buildings that stand wall to wall. */
const JOIN = 0.04;


/** The trees of the suburban kit, as things that stand in town. */
const TREES: CityBuilding[] = [
  { file: 'suburban/tree-large.glb', w: 0.3, height: 0.77, d: 0.3 },
  { file: 'suburban/tree-small.glb', w: 0.3, height: 0.57, d: 0.3 },
];

/** Up to `count` trees on a block: in its corners if a house stands on it, anywhere on it if not. */
function treesOn(seed: number, i: number, j: number, x: number, z: number, count: number, site: Site, office: Building, house?: { building: CityBuilding; turn: number }, room: { w: number; d: number } = PAD): TownBuilding[] {
  const trees: TownBuilding[] = [];
  // (A tree is drawn as large as the kit, so it keeps half its width from the edge: 0.4 at scale 3 would be too little at 6.)
  const margin = Math.max(0.4, (TREES[0]!.w * site.scale) / 2 + 0.05);
  const half = { w: room.w / 2 - margin, d: room.d / 2 - margin };
  const w = house ? ((house.turn % 2 === 0 ? house.building.w : house.building.d) * site.scale) / 2 + 0.5 : 0;
  const d = house ? ((house.turn % 2 === 0 ? house.building.d : house.building.w) * site.scale) / 2 + 0.5 : 0;
  for (let n = 0; n < count; n++) {
    if (chance(seed, i * 31 + n, j, 21) < 0.3) continue;
    const building = TREES[Math.floor(chance(seed, i * 31 + n, j, 22) * TREES.length)]!;
    const dx = house ? (n % 2 === 0 ? -1 : 1) * half.w : (chance(seed, i * 31 + n, j, 23) * 2 - 1) * half.w;
    const dz = house ? (n < 2 ? -1 : 1) * half.d : (chance(seed, i * 31 + n, j, 24) * 2 - 1) * half.d;
    // Clear of the house, and not so tall in front of the office that it hides it.
    if (house && Math.abs(dx) < w && Math.abs(dz) < d) continue;
    if (building.height * site.scale + PAVEMENT > clearance(x + dx, z + dz, 1, 1, office)) continue;
    trees.push({ building, x: x + dx, z: z + dz, turn: 0 });
  }
  return trees;
}


// --- A town laid out from a drawing ---

/** How far from the kerb the buildings of a block stand back, and the room a yard keeps free in the middle, in tiles. */
const SETBACK = 0.5;
const YARD = 2;
/** The ground in view, in floor tiles: beyond it the buildings of a block are left out. */
const IN_VIEW = { x0: -70, x1: 80, z0: -60, z1: 90 };

const covers = (outer: { x: number; z: number; w: number; d: number }, r: { x: number; z: number; w: number; d: number }) =>
  r.x >= outer.x - 0.01 && r.x + r.w <= outer.x + outer.w + 0.01 && r.z >= outer.z - 0.01 && r.z + r.d <= outer.z + outer.d + 0.01;
const middleOf = (r: { x: number; z: number; w: number; d: number }) => ({ x: r.x + r.w / 2, z: r.z + r.d / 2, w: r.w, d: r.d });

/**
 * The blocks of a town laid out from a drawing: one per cell of the grid the
 * streets make. A cell with bands of buildings gets a terrace along every side
 * of each band (see `terraced`) and its yard left open; a green strip is grass
 * with trees; the strips between the two streets of a road are bare. The
 * alleyways are paved strips on the cell, with no traffic.
 */
function mapBlocks(seed: number, site: Site, building: Building, layout: OldLayout): TownBlock[] {
  const parts = layout.map!;
  const blocks: TownBlock[] = [];
  const handTrees = parts.trees.length > 0;
  const handLamps = parts.lamps.length > 0;
  const solid =(r: { x: number; z: number; w: number; d: number }) => r.x + r.w > IN_VIEW.x0 && r.x < IN_VIEW.x1 && r.z + r.d > IN_VIEW.z0 && r.z < IN_VIEW.z1;
  for (const cell of parts.cells) {
    const { i, j } = cell;
    const mid = middleOf(cell);
    const green = parts.greens.some((g) => covers(g, cell) || covers(cell, g));
    const bands = parts.buildings.filter((r) => covers(cell, r));
    const alleys = parts.alleys.filter((r) => r.x + r.w > cell.x && r.x < cell.x + cell.w && r.z + r.d > cell.z && r.z < cell.z + cell.d).map(middleOf);
    const median = parts.medians.some((m) => covers(m, cell));
    const base = { i, j, x: mid.x, z: mid.z, rect: mid, ...(alleys.length > 0 && { alleys }), ...(median && { median }) };
    if (green) {
      // Where the countryside is fields, the green of the drawing is a field.
      const field = site.far === 'field';
      const side = !field && solid(cell) ? streetside(seed, i, j, mid, site, building) : null;
      // A map that puts trees (or lamps) down by hand has those and not the code's own (#287): the two are left out separately.
      const trees = handTrees ? [] : (side?.trees ?? []);
      const lamps = handLamps ? [] : (side?.lamps ?? []);
      blocks.push({ ...base, ground: field ? 'field' : 'grass', items: trees, ...(layout.id === 'coaxia' && lamps.length > 0 && { lamps }) });
      continue;
    }
    const items: TownBuilding[] = [];
    bands.forEach((band, n) => {
      if (!solid(band)) return;
      // On industrial sites a share of the bands behind the office is a yard instead.
      const inFront = band.x + band.w / 2 >= westOf(building) && band.z + band.d / 2 >= 0;
      if (!inFront && chance(seed, i * 8 + n, j, 14) < site.yards) items.push(...yardsOn(seed, i * 8 + n, j, band, site, building));
      else items.push(...terraced(seed, i * 8 + n, j, band, site, building));
    });
    blocks.push({ ...base, ground: site.ground, items });
  }
  // The beach and the water of the drawing: ground of their own, lower than a pavement. The last street is where the traffic turns.
  [...parts.beach.map((r) => ({ r, ground: 'sand' as const })), ...parts.water.map((r) => ({ r, ground: 'water' as const }))].forEach(({ r, ground }, n) => {
    const mid = middleOf(r);
    blocks.push({ i: 100 + n, j: 100, x: mid.x, z: mid.z, rect: mid, ground, items: [] });
  });
  // Beyond the north edge of the drawing the outermost row of blocks goes on.
  parts.beyond.forEach((band, n) => {
    if (!solid(band)) return;
    const column = parts.cells.find((c) => band.x + band.w / 2 >= c.x && band.x + band.w / 2 <= c.x + c.w)?.i ?? n;
    const mid = middleOf(band);
    // (Its index is its own: several of them can lie in one cell, now that a cell can be wide.)
    blocks.push({ i: 200 + n, j: -1, x: mid.x, z: mid.z, rect: mid, ground: site.ground, items: terraced(seed, column * 8 + n, -1, band, site, building) });
  });
  return blocks;
}

// --- A town laid out by its roads (#218) ---

/** How far apart the pieces of a foothill stand on a mountain rect, in tiles. */
const HILL_STEP = 6;

/**
 * The foothills on a rect of the drawing (the near mountains): the kit's slopes and cliffs on a loose grid, each moved a
 * little at random so that they run into one another, taller the further back (north) they stand.
 */
export function hillsOn(seed: number, key: number, rect: Rect, office: Building): HillPiece[] {
  const cols = Math.max(1, Math.round(rect.w / HILL_STEP));
  const rows = Math.max(1, Math.round(rect.d / HILL_STEP));
  const pieces: HillPiece[] = [];
  for (let r = 0; r < rows; r++) {
    // 1 at the back (north) of the rect, 0 at the front.
    const back = rows === 1 ? 1 : 1 - r / (rows - 1);
    for (let c = 0; c < cols; c++) {
      const n = r * cols + c;
      if (chance(seed, key * 997 + n, 3, 20) < 0.15) continue;
      const building = NATURE.foothills[Math.floor(chance(seed, key * 997 + n, 3, 21) * NATURE.foothills.length)]!;
      const scale = 2.8 + back * 3.2 + chance(seed, key * 997 + n, 3, 22) * 1.2;
      const turn = Math.floor(chance(seed, key * 997 + n, 3, 23) * 4);
      const x = rect.x + ((c + 0.5) * rect.w) / cols + (chance(seed, key * 997 + n, 3, 24) - 0.5) * 2.4;
      const z = rect.z + ((r + 0.5) * rect.d) / rows + (chance(seed, key * 997 + n, 3, 25) - 0.5) * 2.4;
      const [w, d] = turn % 2 === 0 ? [building.w, building.d] : [building.d, building.w];
      // Whatever stands in front of the office stays low enough not to hide it.
      if (building.height * scale + PAVEMENT <= clearance(x, z, w * scale, d * scale, office)) pieces.push({ building, x, z, turn, scale });
    }
  }
  return pieces;
}

/** The turn that puts a house's front to the nearest road: 0 faces south (+z), 1 east, 2 north, 3 west. */
function facingRoad(plot: Rect, roads: readonly Street[]): number {
  const mid = middleOf(plot);
  let best = { gap: Infinity, turn: 0 };
  for (const road of roads) {
    const [offset, turns] = road.along === 'x' ? [road.at - mid.z, [2, 0] as const] : [road.at - mid.x, [3, 1] as const];
    // Only a road whose length reaches the plot counts.
    const alongPlot = road.along === 'x' ? mid.x : mid.z;
    if (alongPlot < (road.from ?? -Infinity) - 5 || alongPlot > (road.to ?? Infinity) + 5) continue;
    if (Math.abs(offset) < best.gap) best = { gap: Math.abs(offset), turn: turns[offset > 0 ? 1 : 0] };
  }
  return best.turn;
}

/** A house with its garden on a plot: one of the site's houses, its front to the nearest road, and trees in the corners of the garden. */
function houseOn(seed: number, n: number, plot: Rect, roads: readonly Street[], site: Site, office: Building): TownBuilding[] {
  const { scale } = site;
  const mid = middleOf(plot);
  const turn = facingRoad(plot, roads);
  const options = site.low.filter((building) => {
    const [w, d] = turn % 2 === 0 ? [building.w, building.d] : [building.d, building.w];
    return w * scale <= plot.w - 2 && d * scale <= plot.d - 2 && building.height * scale + PAVEMENT <= clearance(mid.x, mid.z, w * scale, d * scale, office);
  });
  const house = options[Math.floor(chance(seed, n, 5, 2) * options.length)];
  if (!house) return [];
  const items: TownBuilding[] = [{ building: house, x: mid.x, z: mid.z, turn }];
  if (site.trees > 0) items.push(...treesOn(seed, n, 5, mid.x, mid.z, site.trees, site, office, { building: house, turn }, { w: plot.w - 0.2, d: plot.d - 0.2 }));
  return items;
}

/** A rect of the drawing without the roads that run over it: cut at the kerb, keeping the larger part. */
function clipToRoads(rect: Rect, roads: readonly Street[], half: number): Rect {
  let r = rect;
  for (const road of roads) {
    const [from, to] = [road.from ?? -Infinity, road.to ?? Infinity];
    if (road.along === 'x') {
      if (road.at + half <= r.z || road.at - half >= r.z + r.d || to <= r.x || from >= r.x + r.w) continue;
      const [above, below] = [road.at - half - r.z, r.z + r.d - (road.at + half)];
      r = above >= below ? { ...r, d: above } : { ...r, z: road.at + half, d: below };
    } else {
      if (road.at + half <= r.x || road.at - half >= r.x + r.w || to <= r.z || from >= r.z + r.d) continue;
      const [before, after] = [road.at - half - r.x, r.x + r.w - (road.at + half)];
      r = before >= after ? { ...r, w: before } : { ...r, x: road.at + half, w: after };
    }
  }
  return r;
}

/**
 * The blocks of a town laid out by its roads: a block for each plot (a house with its garden), each field (the green of the
 * drawing, where the countryside is fields), each piece of water, and the near mountains with their foothills. What lies
 * between them is the open land of the site (Town.tsx). Plots beyond the ground in view are left out.
 */
function roadBlocks(seed: number, site: Site, building: Building, layout: OldLayout): TownBlock[] {
  const parts = layout.map!;
  const blocks: TownBlock[] = [];
  const visible = (r: Rect) => r.x + r.w > IN_VIEW.x0 && r.x < IN_VIEW.x1 && r.z + r.d > IN_VIEW.z0 && r.z < IN_VIEW.z1;
  parts.plots.forEach((plot, n) => {
    if (!visible(plot)) return;
    const mid = middleOf(plot);
    blocks.push({ i: n, j: 0, x: mid.x, z: mid.z, rect: mid, ground: site.ground, items: houseOn(seed, n, plot, parts.roads, site, building) });
  });
  parts.greens.map((r) => clipToRoads(r, parts.roads, layout.streetWidth / 2)).filter(visible).forEach((r, n) => {
    const mid = middleOf(r);
    blocks.push({ i: n, j: 1, x: mid.x, z: mid.z, ground: site.far === 'field' ? 'field' : 'grass', items: [], land: mid });
  });
  parts.water.forEach((r, n) => {
    const mid = middleOf(r);
    blocks.push({ i: n, j: 2, x: mid.x, z: mid.z, rect: mid, ground: 'water', items: [] });
  });
  // The foothills are on every mountain rect but the furthest, which is the range's (a lone rect has them too).
  const far = parts.mountains.reduce<Rect | null>((a, r) => (a && a.z < r.z ? a : r), null);
  parts.mountains.forEach((r, n) => {
    if (r === far && parts.mountains.length > 1) return;
    const mid = middleOf(r);
    blocks.push({ i: n, j: 3, x: mid.x, z: mid.z, ground: 'grass', items: [], land: mid, hill: hillsOn(seed, n, r, building) });
  });
  return blocks;
}

/** What stands in a yard laid out on a band of the drawing: tanks, containers and chimneys on a grid of places, with room between them. */
function yardsOn(seed: number, i: number, j: number, band: Rect, site: Site, office: Building): TownBuilding[] {
  const PITCH = 6;
  const items: TownBuilding[] = [];
  const cols = Math.floor((band.w - 2 * (SETBACK + 2)) / PITCH);
  const rows = Math.floor((band.d - 2 * (SETBACK + 2)) / PITCH);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (chance(seed, i * 101 + c, j * 53 + r, 31) < 0.25) continue;
      const building = SITE_YARD[Math.floor(chance(seed, i * 101 + c, j * 53 + r, 32) * SITE_YARD.length)]!;
      const [w, d] = [building.w * site.scale, building.d * site.scale];
      const x = band.x + band.w / 2 + (c - (cols - 1) / 2) * PITCH + (chance(seed, i * 101 + c, j * 53 + r, 33) - 0.5);
      const z = band.z + band.d / 2 + (r - (rows - 1) / 2) * PITCH + (chance(seed, i * 101 + c, j * 53 + r, 34) - 0.5);
      if (w > PITCH - 0.5 || d > PITCH - 0.5) continue;
      if (building.height * site.scale + PAVEMENT > clearance(x, z, w, d, office)) continue;
      items.push({ building, x, z, turn: 0 });
    }
  }
  return items;
}

/** A band of buildings is a block of the town: how deep, in tiles, the terraces round it may be at most. */
const roomFor = (across: number) => Math.max(0, across / 2 - YARD / 2);

/**
 * The buildings of a block of a town laid out from a drawing, put together as
 * a block of the town is (see `builtUp`): a terrace along every side of the
 * band, wall to wall with the fronts to the street, and the yard behind them
 * left open. The north and south terraces run the whole length, the west and
 * east ones between them. The first building comes from the site's kit, the
 * rest from its fill, so that a tower gets smaller neighbours. Where a
 * building would hide the ground floor it is left out.
 */
function terraced(seed: number, i: number, j: number, band: { x: number; z: number; w: number; d: number }, site: Site, office: Building): TownBuilding[] {
  const { scale } = site;
  const mid = middleOf(band);
  // Behind the office a share of the blocks gets taller buildings; in front of it they stay low.
  const inFront = mid.x >= westOf(office) && mid.z >= 0;
  const tall = !inFront && chance(seed, i, j, 1) < site.tallShare;
  // By the sea the row of the office and the one in front of it (the sea front) is large houses.
  const front = site.frontRow && mid.z >= 0 ? site.frontRow : null;
  const kit = front ?? (tall ? site.tall : site.low);
  const fill = front ?? (tall ? [...site.tall, ...site.low] : site.low);
  const items: TownBuilding[] = [];
  let first = true;
  // Puts a terrace on one side: `length` long, `room` deep; `at` turns a place along it and the depth of a building into a point.
  const row = (side: number, length: number, room: number, place: (along: number, depth: number) => [x: number, z: number], turn: number, salt: number, along: 'x' | 'z'): number => {
    const placed: { building: CityBuilding; at: number }[] = [];
    let left = length;
    let cursor = 0;
    for (let n = 0; n < 40; n++) {
      const options = (first ? kit : fill).filter((b) => b.w * scale <= left && b.d * scale <= room);
      const pick = options[Math.floor(chance(seed, i * 40 + n, j * 7 + side, 43 + salt) * options.length)];
      if (!pick) break;
      placed.push({ building: pick, at: cursor + (pick.w * scale) / 2 });
      cursor += pick.w * scale + JOIN;
      left -= pick.w * scale + JOIN;
      first = false;
    }
    // Centred on the side.
    const shift = left / 2;
    let depth = 0;
    for (const { building, at } of placed) {
      const [w, d] = [building.w * scale, building.d * scale];
      const [x, z] = place(at + shift, d);
      const [fw, fd] = along === 'x' ? [w, d] : [d, w];
      if (building.height * scale + PAVEMENT > clearance(x, z, fw, fd, office)) continue;
      items.push({ building, x, z, turn });
      depth = Math.max(depth, d);
    }
    return depth;
  };
  const x0 = band.x + SETBACK;
  const x1 = band.x + band.w - SETBACK;
  const z0 = band.z + SETBACK;
  const z1 = band.z + band.d - SETBACK;
  // A thin band (a row of houses or shops between two streets) is one terrace, with the whole depth of the band, facing south.
  if (band.d < 14 && band.w >= band.d) {
    row(1, x1 - x0, band.d - 2 * SETBACK, (a, d) => [x0 + a, z1 - d / 2], 0, 1, 'x');
    return items;
  }
  const north = row(-1, x1 - x0, roomFor(band.d - 2 * SETBACK), (a, d) => [x0 + a, z0 + d / 2], 2, 0, 'x');
  const south = row(1, x1 - x0, roomFor(band.d - 2 * SETBACK), (a, d) => [x0 + a, z1 - d / 2], 0, 1, 'x');
  const between = Math.max(0, z1 - south - (z0 + north));
  const sideRoom = roomFor(band.w - 2 * SETBACK);
  row(-1, between, sideRoom, (a, d) => [x0 + d / 2, z0 + north + a], 3, 2, 'z');
  row(1, between, sideRoom, (a, d) => [x1 - d / 2, z0 + north + a], 1, 3, 'z');
  return items;
}

/**
 * What stands on a green strip: a row of lamp posts along both long edges, just inside the kerb, and between them the
 * trees, two staggered rows along the long side. Whatever would hide the ground floor is left out (a lamp that hides it
 * only from a turned view is left out when it is drawn, see `lampHides`), and a tree is left out where a lamp stands.
 */
export function streetside(seed: number, i: number, j: number, cell: { x: number; z: number; w: number; d: number }, site: Site, office: Building): { trees: TownBuilding[]; lamps: { x: number; z: number }[] } {
  const lamps: { x: number; z: number }[] = [];
  const alongZ = cell.d >= cell.w;
  const [length, across] = alongZ ? [cell.d, cell.w] : [cell.w, cell.d];
  const posts = Math.floor(length / LAMP_EVERY);
  for (let n = 0; n < posts; n++) {
    for (const side of [-1, 1]) {
      const lengthwise = -length / 2 + (n + 0.5) * (length / posts);
      const crosswise = side * (across / 2 - LAMP_INSET);
      const [x, z] = alongZ ? [cell.x + crosswise, cell.z + lengthwise] : [cell.x + lengthwise, cell.z + crosswise];
      if (LAMP_HEIGHT + PAVEMENT > clearance(x, z, 0.6, 0.6, office)) continue;
      lamps.push({ x, z });
    }
  }
  const trees = greenTrees(seed, i, j, cell, site, office).filter((tree) => lamps.every((lamp) => Math.hypot(lamp.x - tree.x, lamp.z - tree.z) > 1));
  return { trees, lamps };
}

function greenTrees(seed: number, i: number, j: number, cell: { x: number; z: number; w: number; d: number }, site: Site, office: Building): TownBuilding[] {
  const trees: TownBuilding[] = [];
  const alongZ = cell.d >= cell.w;
  const [length, across] = alongZ ? [cell.d, cell.w] : [cell.w, cell.d];
  // (Trees are drawn as large as the kit: 5 tiles apart at scale 3, so 10 at scale 6 (0.20.0).)
  const count = Math.floor(length / ((5 * site.scale) / 3));
  for (let n = 0; n < count; n++) {
    for (const side of [-1, 1]) {
      if (chance(seed, i * 97 + n, j * 3 + side, 21) < 0.3) continue;
      const building = TREES[Math.floor(chance(seed, i * 97 + n, j * 3 + side, 22) * TREES.length)]!;
      const lengthwise = -length / 2 + (n + 0.5 + side * 0.15 + (chance(seed, i * 97 + n, j * 3 + side, 23) - 0.5) * 0.4) * (length / count);
      const crosswise = side * (across / 4 + (chance(seed, i * 97 + n, j * 3 + side, 24) - 0.5) * (across / 6));
      const [x, z] = alongZ ? [cell.x + crosswise, cell.z + lengthwise] : [cell.x + lengthwise, cell.z + crosswise];
      if (building.height * site.scale + PAVEMENT > clearance(x, z, 1, 1, office)) continue;
      trees.push({ building, x, z, turn: 0 });
    }
  }
  return trees;
}


// --- The old way to a Layout ---

/** The building of a map of no region, as it was worked out from the drawing (#289): the drawing moved by `shift` onto the floor grid. Throws, with the reason, if the map has none. */
export function oldDrawnBuilding(file: OldMapFile, shift: { x: number; z: number }): Building {
  const { map, settings } = file;
  if (!map.reception) throw new Error(NO_RECEPTION);
  const at = (b: TileBox): FloorRect => ({ x: b.x + shift.x, y: b.y + shift.z, w: b.w, h: b.h });
  const box = at(map.reception);
  const wings = map.wings.map(at);
  const worked = workOut({ wings, box, face: floorFaces(box, [...wings, box], map.lanes.map(at)), yard: [...map.courtyard.parking, ...map.courtyard.green].map(at), floors: settings.floors });
  if (!worked.ok) throw new Error(worked.reason);
  return worked.building;
}

/**
 * The building a drawing is laid out round: the one given, the region's own, or (a map of no region) the one worked out from its wings and
 * reception box, with the floors the map's settings say. Throws, with the reason, when a drawn map can have no building.
 */
export function oldHouseOf(file: OldMapFile, building?: Building): Building {
  const region = (Object.keys(LOOKS) as RegionId[]).find((r) => LOOKS[r].map === file.id);
  const house = building ?? (region ? buildingFor(region) : undefined);
  if (!house) return oldDrawnBuilding(file, floorShift(file.map, byRoads(file.map)));
  return house.floors === file.settings.floors ? house : { ...house, floors: file.settings.floors };
}

/** The layout of a town from an old map file: by its roads or as a grid of cells, by what the map draws. */
export function oldLayoutFromMap(file: OldMapFile, building?: Building): OldLayout {
  const house = oldHouseOf(file, building);
  return byRoads(file.map) ? roadLayout(file, house) : mapLayout(file, house);
}

/** The blocks of an old town, with what its seed put on them. */
export function oldTownBlocks(seed: number, site: Site, building: Building, layout: OldLayout): TownBlock[] {
  return layout.map!.roads.length > 0 ? roadBlocks(seed, site, building, layout) : mapBlocks(seed, site, building, layout);
}

// --- The conversion ---

/** The seed the five default towns are written from, and the one a file of the folder is converted with. */
export const TOWN_SEED = 1970;

const two = (n: number): number => Number(n.toFixed(2));

/** Every number of a value to 2 decimals. */
function rounded<T>(value: T): T {
  if (typeof value === 'number') return two(value) as T;
  if (Array.isArray(value)) return value.map(rounded) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rounded(v)])) as T;
  return value;
}

const boxOf = (r: { x: number; z: number; w: number; d: number }): MapBox => ({ x: r.x, z: r.z, w: r.w, d: r.d });
/** A block of the old town is by its middle; a box of the file by its corner. */
const cornerOf = (r: { x: number; z: number; w: number; d: number }): MapBox => ({ x: r.x - r.w / 2, z: r.z - r.d / 2, w: r.w, d: r.d });

const TREE_FILES: readonly string[] = TREES.map((tree) => tree.file);

/** The roads of a town of cells, written as roads: the bands of its streets, a dual carriageway as one road, with the lanes and what the old layout said of them. */
function gridRoads(layout: OldLayout, house: Building): MapRoad[] {
  const { verticals, horizontals } = layout.bands!;
  const busy = layout.busy(house);
  const out: MapRoad[] = [];
  for (const [along, bands] of [['z', verticals], ['x', horizontals]] as const) {
    const todo = [...bands];
    while (todo.length > 0) {
      const band = todo.shift()!;
      const dual = busy.find((s) => s.along === along && s.width !== undefined && s.lanes !== undefined && sameLine(s.at - s.width / 2, band.from) && s.width > band.to - band.from + 0.01);
      if (dual) {
        const inside = todo.filter((b) => b.from >= band.to - 0.01 && b.to <= dual.at + dual.width! / 2 + 0.01);
        for (const b of inside) todo.splice(todo.indexOf(b), 1);
        const last = inside[inside.length - 1] ?? band;
        out.push({ along, at: dual.at, width: dual.width!, median: two(last.from - band.to), lanes: dual.lanes, traffic: true, ...(dual.from !== undefined && { from: dual.from, to: dual.to }) });
        continue;
      }
      const street = busy.find((s) => s.along === along && sameLine(s.at, band.at));
      out.push({
        along,
        at: band.at,
        width: street?.width ?? band.to - band.from,
        ...(street?.lanes && { lanes: street.lanes }),
        ...(street?.from !== undefined && { from: street.from, to: street.to }),
        traffic: street !== undefined,
      });
    }
  }
  // The one-way streets get arrows; where a road with no traffic is one-way, it has its lanes.
  for (const way of layout.map!.oneWays) {
    const road = out.find((r) => r.along === way.along && sameLine(r.at, way.at));
    if (!road) continue;
    road.arrows = true;
    if (!road.lanes && way.lanes) road.lanes = way.lanes;
  }
  return out;
}

/** The ground of the old town: what its blocks are covered with, its alleyways and paving, and the land beyond. */
function groundOf(blocks: readonly TownBlock[], parts: OldMapParts, site: Site, layout: OldLayout, roads: boolean, seaEnd: number | null): MapGround[] {
  const painted: MapGround[] = [];
  const flat: MapGround[] = [];
  for (const block of blocks) {
    const area = block.land ?? block.rect;
    if (area) {
      const kind: GroundKind = block.median ? 'grass' : block.ground;
      const edge = !block.land && block.ground !== 'water' && block.ground !== 'sand' && block.ground !== 'field';
      // (The row of blocks beyond the north edge of the drawing, i 200 and up, is no part of the grid.)
      painted.push({ kind, ...cornerOf(area), ...(edge && { edge: true as const }), ...(edge && block.i >= 200 && block.j === -1 && { outside: true as const }) });
    }
    for (const alley of block.alleys ?? []) flat.push({ kind: 'asphalt', ...cornerOf(alley) });
  }
  for (const r of parts.concrete) flat.push({ kind: 'concrete', ...boxOf(r) });
  for (const r of parts.driveways) flat.push({ kind: 'asphalt', ...boxOf(r) });
  // The land beyond: a field all round a town laid out by its roads; north and west of a town of cells; and the water in front of the last street.
  const far: MapGround[] = [];
  const grid = MAP_GRID;
  if (site.far && site.far !== 'grass') {
    if (roads) far.push({ kind: site.far, x: -grid, z: -grid, w: 2 * grid, d: 2 * grid });
    else {
      far.push({ kind: site.far, x: -grid, z: -grid, w: 2 * grid, d: layout.from.z + grid });
      far.push({ kind: site.far, x: -grid, z: -grid, w: layout.from.x + grid, d: 2 * grid });
    }
  }
  if (site.front && seaEnd !== null && seaEnd < grid) far.push({ kind: site.front, x: -grid, z: seaEnd, w: 2 * grid, d: grid - seaEnd });
  return [...far, ...painted, ...flat];
}

/** A map of the old format, as the new one: the town laid out as it always was, and everything that stood in it, written down. */
function convert(file: OldMapFile, seed: number, region: RegionId, given?: Building): MapFile {
  const look = LOOKS[region];
  const roads = byRoads(file.map);
  const house = oldHouseOf(file, given);
  const layout = oldLayoutFromMap(file, house);
  const parts = layout.map!;
  const site: Site = { ...look, train: file.settings.train.map((piece) => `train/${piece}.glb`), traffic: file.settings.traffic, map: file.id };
  const blocks = oldTownBlocks(seed, site, house, layout);

  const shift = roads ? { ...floorShift(file.map, true), x: westOf(house) - Math.min(...floorBoxes(file.map).map((w) => w.x)) } : floorShift(file.map, false);
  const shifted = (b: TileBox): MapBox => ({ x: b.x + shift.x, z: b.y + shift.z, w: b.w, d: b.h });

  const houses: MapHouse[] = [];
  const trees: MapTree[] = [];
  const lamps: MapSpot[] = [];
  const hills: MapHill[] = [];
  for (const block of blocks) {
    for (const item of block.items) {
      if (TREE_FILES.includes(item.building.file)) trees.push({ model: item.building.file, x: item.x, z: item.z });
      else houses.push({ model: item.building.file, x: item.x, z: item.z, turn: item.turn });
    }
    for (const piece of block.hill ?? []) hills.push({ model: piece.building.file, x: piece.x, z: piece.z, turn: piece.turn, scale: piece.scale });
    for (const lamp of block.lamps ?? []) lamps.push({ x: lamp.x, z: lamp.z });
  }
  // What the map puts down by hand.
  for (const p of parts.placed) houses.push({ model: p.model, x: p.x, z: p.z, turn: p.turn });
  for (const t of parts.trees) trees.push({ model: TREES[Math.abs(Math.floor(t.x) * 7 + Math.floor(t.z) * 13) % TREES.length]!.file, x: t.x, z: t.z });
  for (const l of parts.lamps) lamps.push({ x: l.x, z: l.z });

  const peaks: MapPeak[] = oldRange(seed, site, layout).map((p) => ({ x: p.x, z: p.z, radius: p.radius, height: p.height, sides: p.sides, angle: p.angle }));
  const seaEnd = parts.water.length > 0 ? Math.max(...parts.water.map((r) => r.z + r.d)) : layout.from.z + layout.length.z;
  const lot = layout.lot(house);
  const edge = layout.edge ?? null;
  const rail = layout.railway;

  const map: TownMap2 = {
    edge: edge ? boxOf(edge) : null,
    streetWidth: layout.streetWidth,
    // (A road is drawn 2 tiles wide and driven as one of `streetWidth`: the file says how wide it is drawn, and people keep off that.)
    roads: roads ? layout.streets(house).map((s): MapRoad => ({ along: s.along, at: s.at, from: s.from, to: s.to, width: Math.min(...file.map.lanes.map((l) => Math.min(l.w, l.h)).filter((n) => n >= 2)), traffic: true })) : gridRoads(layout, house),
    rail: { x: rail.from, z: rail.z - rail.width / 2, w: rail.length, d: rail.width },
    houses,
    trees,
    lamps,
    hills,
    peaks,
    ground: groundOf(blocks, parts, site, layout, roads, seaEnd),
    building: {
      wings: file.map.wings.map(shifted),
      reception: file.map.reception ? shifted(file.map.reception) : null,
      courtyard: { parking: file.map.courtyard.parking.map(shifted), green: file.map.courtyard.green.map(shifted) },
      faces: house.core.faces,
      own: boxOf(layout.own(house)),
    },
    stops: { bus: { ...layout.stops.bus }, taxi: { ...layout.stops.taxi } },
    lot: {
      block: boxOf(lot.block),
      street: lot.street,
      ...(lot.along && { along: lot.along }),
      ...(lot.side && { side: lot.side }),
      parking: parts.courtyard.parking.map(boxOf),
      green: parts.courtyard.green.map(boxOf),
      fountain: parts.courtyard.fountain ? { ...parts.courtyard.fountain } : null,
    },
  };
  const settings: MapSettings = {
    train: [...file.settings.train],
    traffic: { every: file.settings.traffic.every, mix: { ...file.settings.traffic.mix } },
    floors: file.settings.floors,
    railway: file.settings.railway,
    layout: roads ? 'roads' : 'grid',
    scale: look.scale,
    shore: look.front === 'water',
  };
  return { format: MAP_FORMAT, id: file.id, name: file.name, settings, map: trimmed(rounded(map)) };
}

/**
 * Everything of the map on the grid every map has (`MAP_GRID`): what lies outside it is left out, a road is cut at its edge and ground that
 * reaches over it is cut to it. The building, the stops and the lot are never touched; if one of them lies outside, the map has no town.
 */
function trimmed(map: TownMap2): TownMap2 {
  const g = MAP_GRID;
  const inside = (p: { x: number; z: number }) => Math.abs(p.x) <= g && Math.abs(p.z) <= g;
  const clip = <T extends MapBox>(b: T): T | null => {
    const [x0, z0, x1, z1] = [Math.max(b.x, -g), Math.max(b.z, -g), Math.min(b.x + b.w, g), Math.min(b.z + b.d, g)];
    return x1 > x0 && z1 > z0 ? { ...b, x: x0, z: z0, w: two(x1 - x0), d: two(z1 - z0) } : null;
  };
  const whole = (b: MapBox | null) => b === null || (b.x >= -g && b.z >= -g && b.x + b.w <= g && b.z + b.d <= g);
  const own = [...map.building.wings, ...(map.building.reception ? [map.building.reception] : []), map.building.own, map.lot.block];
  if (!own.every(whole)) throw new Error(`The town does not fit the grid every map has (${g * 2} tiles each way): move the building and the lot in.`);
  const cut = (v: number | undefined) => (v === undefined ? undefined : Math.min(g, Math.max(-g, v)));
  return {
    ...map,
    edge: map.edge ? clip(map.edge) : null,
    // (The railway is cut at the edge of the grid like a road.)
    rail: map.rail ? clip(map.rail) : null,
    roads: map.roads.map((r) => ({ ...r, ...(r.from !== undefined && { from: cut(r.from) }), ...(r.to !== undefined && { to: cut(r.to) }) })).filter((r) => Math.abs(r.at) <= g),
    houses: map.houses.filter(inside),
    trees: map.trees.filter(inside),
    lamps: map.lamps.filter(inside),
    hills: map.hills.filter(inside),
    peaks: map.peaks.filter(inside),
    ground: map.ground.flatMap((b) => clip(b) ?? []),
  };
}

/** The narrowest a railway on the ground may be drawn, in tiles (the same as the town check's, src/office/townCheck.ts). */
const TRACK_WIDTH = 4;

/**
 * What a drawing lacks that the layout code would crash on, in plain words; null if it has what it needs. These are the reasons only the older
 * format can have: the checks of a town written down (src/office/townCheck.ts) say the rest.
 */
export function drawingProblem(file: OldMapFile): string | null {
  const { map, settings } = file;
  const roads = byRoads(map);
  if (map.lanes.length === 0) return 'The map has no roads: draw at least one lane.';
  if (map.wings.length === 0) return 'The map has no wings: the office needs ground to stand on.';
  if (!roads && !map.wings.some((wing) => wing.w > wing.h)) return 'The map has no wing lying east to west: a town of streets in a grid needs one for the office to stand at.';
  if (!map.train) return 'The map has no railway.';
  if (map.parking.length + map.courtyard.parking.length === 0) return 'No lot: the map has no parking strip.';
  if (settings.railway === 'ground') {
    if (map.train.w < map.train.h) return 'The railway on the ground has to lie east to west: draw its box wider than it is high.';
    if (map.train.h < TRACK_WIDTH) return `The railway on the ground is too narrow: its box is ${map.train.h} tiles wide and must be at least ${TRACK_WIDTH}, so that the train fits between the blocks.`;
  }
  if (roads && settings.busStop.from === 'drawing') return 'A town laid out by its roads puts the bus stop at the entrance, not where the map draws it.';
  if (!roads && settings.busStop.from === 'drawing' && !map.busStop) return 'The bus stop is to be where the map draws it, and it draws none.';
  return null;
}

/** Converts a map of the old format into the new, the way a game of this seed in this region showed it. Returns the reason if the map cannot be converted. */
export function convertOldMap(file: OldMapFile, { seed, region, building }: { seed: number; region: RegionId; /** The building the town is laid out round, where it is not the region's or the drawing's own. */ building?: Building }): MapCheck {
  try {
    const lacks = drawingProblem(file);
    if (lacks) return { ok: false, reason: lacks };
    return checkMapFile(convert(file, seed, region, building));
  } catch (error) {
    return { ok: false, reason: `The game cannot lay out this town: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** The region whose look a map of the folder gets: the first that is laid out the same way (by its roads or as a grid). */
export function lookRegionOf(file: OldMapFile): RegionId {
  const roads = byRoads(file.map);
  const regions = Object.keys(LOOKS) as RegionId[];
  return regions.find((r) => {
    const own = LOOKS[r].map ? OLD_MAPS[LOOKS[r].map!] : undefined;
    return own !== undefined && byRoads(own.map) === roads;
  }) ?? 'capital';
}

/**
 * Reads a map file that comes in from outside (the mods folder, a save, a script): format 2 as it is, an older one converted with the seed of the
 * default towns and the look of the first region laid out the same way. Rejects a bad file with the reason in plain words.
 */
export function readMapFile(raw: unknown): MapCheck {
  if (typeof raw === 'object' && raw !== null && (raw as { format?: unknown }).format === OLD_MAP_FORMAT) {
    const old = checkOldMapFile(raw);
    if (!old.ok) return old;
    return convertOldMap(old.file, { seed: TOWN_SEED, region: lookRegionOf(old.file) });
  }
  return checkMapFile(raw);
}
