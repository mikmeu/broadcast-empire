// How the streets of a town lie: where they run, which of them carry traffic,
// where the office's own ground is and where the people walk. Pure.
//
// Most regions have the grid of blocks the town has always been laid out in:
// 8 by 7.5 tiles to a block, streets 2 tiles wide. Coaxia (the capital) is laid
// out from its map file (src/config/maps/coaxia.json): streets 4
// tiles wide, with blocks of 37 tiles and more between them, alleyways, green
// strips and the railway along the south. Everything that depends on where the
// streets are asks for it here, so that city.ts, traffic.ts, street.ts and
// parking.ts work out the rest in the same way for both.

import { BUILDINGS, CORE, FLOOR, WEST, buildingFor, coreFrame, westOf, widthOf, type Building } from '../config/office';
import type { RegionId } from '../config/world';
import { MAPS } from '../config/maps';
import { MAP_GRID, type MapBox, type MapFile, type MapGround, type MapHill, type MapHouse, type MapPeak, type MapRoad, type MapSpot, type MapTree } from '../mods/mapFile';
import { CITY } from './assets';
import { drawnBuilding } from './drawnBuilding';
import { SITES } from './sites';

/** A rectangle of the ground by its north-west corner and its size, in floor tiles. */
export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

/** A rectangle of the ground by its middle and its size: the line a stroller walks round. */
export type Cell = Rect;

export interface Spot {
  x: number;
  z: number;
}

/** The middle line of a street: along x it runs east to west at `z = at`, along z north to south at `x = at`. */
export interface Street {
  along: 'x' | 'z';
  at: number;
  /**
   * Where the street begins and ends along its own axis (#217). A street without them runs from `layout.from` to
   * `layout.from + layout.length`, as the streets of a grid and of the map towns do.
   */
  from?: number;
  to?: number;
  /**
   * The lanes the drawing gives the street (#194), when it gives them a direction: where each lane lies across the street and which way it
   * is driven, 1 or -1 along the street's axis. A street without them has a lane each way, as the streets of the grid and of the towns whose lanes
   * are drawn both ways. `width` is then the street from kerb to kerb, which is more than the layout's `streetWidth` for a dual carriageway
   * (two carriageways with a strip between them, driven as one road: nobody stands between its two crossings).
   */
  lanes?: { at: number; direction: 1 | -1 }[];
  width?: number;
}

/** A place where a bus or taxi stops: the street, on the office's side of it, and how far along the street. */
export interface Stop extends Street {
  pos: number;
  /** For the bus (0.21.0, #330): points on the roads that it drives past, in this order, on its way to the stop. None where the map has none. */
  via?: Spot[];
}

/** The parts of a town laid out from its map file, in floor tiles: the layout's own and what the file writes (ground, houses, trees, lamps, foothills, peaks). */
export interface MapParts {
  /** The company's own ground until the U is built: the box of its wings. */
  plot: Rect;
  /** The courtyard of the U (0.20.0): its two parking strips, the green between them and the fountain on it. */
  courtyard: { parking: Rect[]; green: Rect[]; fountain: Spot | null };
  /** The cells of the grid the streets make (grid layout): the blocks of ground with an edge, from kerb to kerb. `i` counts the columns west to east, `j` the rows north to south. */
  cells: (Rect & { i: number; j: number })[];
  /** The strips down the middle of a dual carriageway: the narrow cells of grass between two of its streets. */
  medians: Rect[];
  /** The streets whose lanes all run the same way (#235), with their lanes as they are driven: the ones that get arrows. */
  oneWays: Street[];
  /**
   * The asphalt of the streets from kerb to kerb (#285), one rectangle for each street (a dual carriageway is two): the road pieces of the kit are laid over them.
   * A street ends beyond the middle of the last street it meets, as far as that street's far kerb, and one that reaches the edge of the town runs on out of sight.
   */
  carriageways: Rect[];
  /** For a town laid out by its roads (#218; none, the cells being its grid, in the others): the roads, with their own ends. */
  roads: Street[];
  ground: MapGround[];
  houses: MapHouse[];
  trees: MapTree[];
  lamps: MapSpot[];
  hills: MapHill[];
  peaks: MapPeak[];
}

export interface Layout {
  id: string;
  /** How wide a street is, kerb to kerb. */
  streetWidth: number;
  /** Where the streets begin on each axis and how long they are. */
  from: Spot;
  length: Spot;
  /**
   * The edge of the drawing (#217): vehicles come in only from lanes that start on it, and a street that reaches it runs
   * on past it, out of sight. A layout without one has its streets run out of sight at both ends, and every lane is an entry.
   */
  edge?: Rect;
  /**
   * The line, the strips of paving under it between the cross streets and how wide it is. Elevated, unless the map says `ground` (0.21.0, #288): then it
   * lies on the street level, the roads that cross it have level crossings with barriers (traffic.ts) and it has no strips.
   */
  railway: { z: number; from: number; length: number; width: number; strips: { from: number; to: number }[]; ground?: true };
  /** The office's own block: for a longer building it reaches over the street beside the standard one. */
  own(building: Building): Rect;
  /**
   * The company's parking lot: the block it stands on, and the middle line of the street it opens onto. In a grid
   * of blocks it is east of that street; in a town laid out from a drawing it is in the courtyard of the U, west of the street.
   */
  lot(building: Building): { block: Rect; street: number; /** Along which axis the street runs: 'z' (north to south) unless it says otherwise (#217). `street` is then the middle line of a street along x, at its z. */ along?: 'x' | 'z'; /** Which side of the street the lot is on, on the other axis: 1 where that axis is larger. East of a street along z by default. */ side?: 1 | -1 };
  /** The middle lines of the streets: every street but the ones inside the office's own block. */
  streets(building: Building): Street[];
  /** The streets that carry traffic. */
  busy(building: Building): Street[];
  stops: { bus: Stop; taxi: Stop };
  /** The places people walk to on the office's own ground (street.ts). */
  places: { door: Spot; gate: Spot; corner(stop: Spot): Spot; stop(wait: Spot): Spot; away: Spot; /** The door on the courtyard side of the entrance, where the people of the lot go in (a town with a courtyard), or null. */ court: Spot | null; /** For an entrance on the far side of the building from the lot (0.20.0): the corner they go round, on the line of the gate. */ round?: Spot | null };
  /** The blocks strollers walk round: the office's own and the others, each from kerb to kerb. */
  /** `paths` (the towns laid out by their roads): lines that people walk to the end of and back, instead of a loop. `drawn` (0.21.0, #330): the paths the map draws by hand, which some of the people walk in any town; none where it has none. */
  strolling(building: Building): { own: Cell; others: Cell[]; paths?: [number, number][][]; drawn?: [number, number][][] };
  /** The block of the street grid a point is on, if strollers may cross into it. */
  cellAt(building: Building, x: number, z: number): Cell | null;
  /** Whether a point is on a pavement and not on a street. The office and the lot are left to the caller. */
  pavement(building: Building, x: number, z: number): boolean;
  /** The crossing the people of the lot cross the street at on their way to the entrance, or null where they walk on over the company's own ground. */
  lotCrossing(building: Building): Spot | null;
  /** For a town laid out from a drawing. */
  map?: MapParts;
}

/** The standard building: the town is laid out round it. */
const STANDARD = BUILDINGS.standard;

const sameLine = (a: number, b: number) => Math.abs(a - b) < 0.01;

// --- The grid of blocks ---

/** Town blocks around the office that can be in view on some floor. */
export const BLOCKS = { fromX: -4, toX: 5, fromZ: -5, toZ: 3 };

/** How many town blocks deep the office's own block is. How many it is wide depends on the building. */
export const OFFICE_ROWS = 2;

function gridLayout(): Layout {
  const sw = CITY.streetWidth;
  const half = sw / 2;
  const { block } = CITY;
  /**
   * The office's own block, with the building in the middle of it: two town
   * blocks deep, and four wide for the standard building. The long building
   * takes a fifth: its block reaches one further east, over what is a side
   * street elsewhere, and the rest of the town is where it always is. This
   * grid is for the tests now: every region has a drawing.
   */
  const own = (building: Building): Rect => ({
    x: WEST + (widthOf(building) - building.blocks * block.w) / 2,
    z: (FLOOR.h - OFFICE_ROWS * block.d) / 2,
    w: building.blocks * block.w,
    d: OFFICE_ROWS * block.d,
  });
  const base = own(STANDARD);
  const from = { x: base.x + BLOCKS.fromX * block.w, z: base.z + BLOCKS.fromZ * block.d };
  const length = { x: (BLOCKS.toX - BLOCKS.fromX + 1) * block.w, z: (BLOCKS.toZ - BLOCKS.fromZ + 1) * block.d };
  const railwayZ = base.z + 3 * block.d;
  const last = from.x + length.x;
  const streets = (building: Building): Street[] => {
    const lines: Street[] = [];
    for (let i = BLOCKS.fromX; i <= BLOCKS.toX + 1; i++) if (i <= 0 || i >= building.blocks) lines.push({ along: 'z', at: base.x + i * block.w });
    for (let j = BLOCKS.fromZ; j <= BLOCKS.toZ + 1; j++) if (j <= 0 || j >= OFFICE_ROWS) lines.push({ along: 'x', at: base.z + j * block.d });
    return lines;
  };
  /** The cell of the grid with these indices, as a stroller's line: from kerb to kerb. */
  const cell = (i: number, j: number): Cell => ({ x: base.x + (i + 0.5) * block.w, z: base.z + (j + 0.5) * block.d, w: block.w - sw, d: block.d - sw });
  /** Whether the cell is the office's own, the lot's or the one the railway runs along: strollers don't go there. */
  const kept = (building: Building, i: number, j: number) => (i >= 0 && i <= building.blocks && j >= 0 && j < OFFICE_ROWS) || (j === OFFICE_ROWS && i >= 0);
  const walkWest = base.x + half + 0.9;
  const front = base.z + base.d - half - 0.25;
  return {
    id: 'grid',
    streetWidth: sw,
    from,
    length,
    railway: {
      z: railwayZ,
      from: from.x,
      length: length.x,
      width: sw,
      strips: Array.from({ length: Math.floor(length.x / block.w) }, (_, i) => ({ from: from.x + i * block.w + half, to: from.x + (i + 1) * block.w - half })),
    },
    own,
    lot: (building) => {
      const o = own(building);
      return { block: { x: o.x + o.w + half, z: o.z + half, w: block.w - sw, d: o.d - sw }, street: o.x + o.w };
    },
    streets,
    busy: (building) =>
      streets(building).filter((street) => street.at >= (street.along === 'x' ? base.z : base.x) && !(street.along === 'x' && street.at === railwayZ) && !(street.along === 'z' && street.at === last)),
    stops: {
      bus: { along: 'x', at: base.z + base.d, pos: WEST + 6 },
      taxi: { along: 'z', at: base.x, pos: CORE.hall.y + CORE.hall.h / 2 + 0.9 },
    },
    places: {
      door: { x: WEST - 0.15, z: CORE.hall.y + CORE.hall.h / 2 },
      gate: { x: walkWest, z: CORE.hall.y + CORE.hall.h / 2 },
      corner: () => ({ x: walkWest, z: front }),
      stop: (wait) => ({ x: wait.x, z: front }),
      away: { x: walkWest, z: base.z + half + 0.3 },
      court: null,
    },
    strolling: (building) => {
      const o = own(building);
      const others: Cell[] = [];
      for (let i = -1; i <= 4; i++) for (let j = 0; j <= 2; j++) if (!kept(building, i, j)) others.push(cell(i, j));
      return { own: { x: o.x + o.w / 2, z: o.z + o.d / 2, w: o.w - sw, d: o.d - sw }, others };
    },
    cellAt: (building, x, z) => {
      const i = Math.round((x - base.x) / block.w - 0.5);
      const j = Math.round((z - base.z) / block.d - 0.5);
      return kept(building, i, j) ? null : cell(i, j);
    },
    pavement: (building, x, z) => {
      const o = own(building);
      if (x > o.x + half && x < o.x + o.w - half && z > o.z + half && z < o.z + o.d - half) return true;
      /** How far a point is from the nearest street's middle line. */
      const fromLine = (value: number, origin: number, step: number) => {
        const off = (((value - origin) % step) + step) % step;
        return Math.min(off, step - off);
      };
      return fromLine(x, base.x, block.w) >= half && fromLine(z, base.z, block.d) >= half;
    },
    lotCrossing: (building) => {
      const o = own(building);
      return { x: o.x + o.w, z: o.z + o.d };
    },
  };
}

export const GRID: Layout = gridLayout();

// --- A town laid out from its map file ---

/** How far a road that runs on past the edge of the town goes out of sight, in tiles. */
const OUT = 60;

/** The kerbs of a street, and the middle line between them. */
export interface Band {
  at: number;
  from: number;
  to: number;
}

/** The streets of a road along one axis as bands, in the order the file has them: a dual carriageway is two, with its median between them. */
export function bandsOf(roads: readonly MapRoad[], along: 'x' | 'z'): Band[] {
  return roads
    .filter((r) => r.along === along)
    .flatMap((r): Band[] => {
      const [from, to] = [r.at - r.width / 2, r.at + r.width / 2];
      if (r.median === undefined || r.median <= 0) return [{ at: r.at, from, to }];
      const carriageway = (r.width - r.median) / 2;
      return [
        { at: from + carriageway / 2, from, to: from + carriageway },
        { at: to - carriageway / 2, from: to - carriageway, to },
      ];
    });
}

/** The box that holds all of these rectangles. */
function holding(rects: readonly Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x));
  const z = Math.min(...rects.map((r) => r.z));
  return { x, z, w: Math.max(...rects.map((r) => r.x + r.w)) - x, d: Math.max(...rects.map((r) => r.z + r.d)) - z };
}

const middleOf = (r: Rect): Cell => ({ x: r.x + r.w / 2, z: r.z + r.d / 2, w: r.w, d: r.d });

/** Whether a ground box reaches the edge of the grid every map has: it runs on out of sight. */
export const touchesGrid = (r: Rect) => r.x <= -MAP_GRID + 0.01 || r.z <= -MAP_GRID + 0.01 || r.x + r.w >= MAP_GRID - 0.01 || r.z + r.d >= MAP_GRID - 0.01;

/**
 * The layout of a town from its map file (#327): everything stands where the file writes it, and the layout is worked out from that alone. Where
 * the roads lie as a grid (`settings.layout: grid`) the ground is cut into blocks between them (the cells: the ground boxes with an edge), and the
 * company's block, the lot and the stops are written; where they run on their own (`roads`) the plots lie beside them.
 * With no building given, the region this map is of has its own; a map of no region has one worked out from what it writes (see `houseOf`).
 * Not kept: `layoutOfMap` keeps those of the default towns.
 */
export function layoutFromMap(file: MapFile, building?: Building): Layout {
  const house = houseOf(file, building);
  const { map, settings } = file;
  if (!map.rail) throw new Error('The map has no railway.');
  const grid = settings.layout === 'grid';
  const sw = map.streetWidth;
  const half = sw / 2;
  const wings = map.building.wings;
  if (wings.length === 0) throw new Error('The map has no wings: the office needs ground to stand on.');
  const plot = holding(wings);
  const rail = map.rail;
  const railAt = rail.z + rail.d / 2;
  const lot = map.lot;
  const lotBlock = lot.block;
  const stops = { bus: { ...map.stops.bus }, taxi: { ...map.stops.taxi } };
  // The paths drawn by hand (0.21.0, #330).
  const drawn = drawnWalks(map);

  // The entrance: the gate on the pavement in front of it and the door in the wall.
  const facing = house.core.faces;
  const { point } = coreFrame(house);
  const mid = CORE.entry.y + 0.5;
  const gate: Spot = point(-1, mid);
  const doorAt: Spot = point(-0.15, mid);

  const railway: Layout['railway'] = { z: railAt, from: rail.x, length: rail.w, width: rail.d, strips: [], ...(settings.railway === 'ground' && { ground: true as const }) };
  const parts: Pick<MapParts, 'ground' | 'houses' | 'trees' | 'lamps' | 'hills' | 'peaks'> = { ground: map.ground, houses: map.houses, trees: map.trees, lamps: map.lamps, hills: map.hills, peaks: map.peaks };
  const courtyard: MapParts['courtyard'] = { parking: lot.parking.map((b) => ({ ...b })), green: lot.green.map((b) => ({ ...b })), fountain: lot.fountain ? { ...lot.fountain } : null };

  if (!grid) return roadsLayout(file, house, { plot, rail, railway, parts, courtyard, stops, gate, doorAt });

  // --- Streets in a grid, with blocks of ground between them ---
  const verticals = bandsOf(map.roads, 'z');
  const horizontals = bandsOf(map.roads, 'x');
  if (verticals.length === 0 || horizontals.length === 0) throw new Error('The map has no roads: a town of streets in a grid needs at least one each way.');
  const railBand: Band = { at: railAt, from: rail.z, to: rail.z + rail.d };
  // The railway is one of the streets along x, at the south of the town unless the map has it elsewhere (behind the office, in the north).
  const xs = verticals;
  const zs = [...horizontals, railBand].sort((a, b) => a.at - b.at);
  const from = { x: xs[0]!.at, z: zs[0]!.at };
  const length = { x: xs[xs.length - 1]!.at - from.x, z: zs[zs.length - 1]!.at - from.z };
  railway.strips = settings.railway === 'ground' ? [] : xs.slice(0, -1).map((band, i) => ({ from: band.to, to: xs[i + 1]!.from }));

  // The company's block, from alley to alley across the plot; a longer building reaches over the street east of it.
  const written = map.building.own;
  const own = (b: Building): Rect => (b.blocks > BUILDINGS.standard.blocks ? { ...written, w: (xs.find((band) => band.at > written.x + written.w + 0.01) ?? xs[xs.length - 1]!).at - written.x } : written);
  const inside = (road: { along: 'x' | 'z'; at: number }, o: Rect) => (road.along === 'z' ? road.at > o.x + 0.01 && road.at < o.x + o.w - 0.01 : road.at > o.z + 0.01 && road.at < o.z + o.d - 0.01);
  const streets = (b: Building): Street[] => {
    const o = own(b);
    return [
      ...xs.map((band): Street => ({ along: 'z', at: band.at })),
      ...zs.map((band): Street => ({ along: 'x', at: band.at })),
    ].filter((street) => !inside(street, o));
  };
  /** The streets that carry traffic, as they are driven: a road with lanes has them, and its width from kerb to kerb. */
  const busy = (b: Building): Street[] => {
    const o = own(b);
    const driven = map.roads.filter((r) => r.traffic && !inside(r, o));
    return [...driven.filter((r) => r.along === 'z').sort((p, q) => p.at - q.at), ...driven.filter((r) => r.along === 'x').sort((p, q) => p.at - q.at)].map(
      (r): Street => ({ along: r.along, at: r.at, ...(r.lanes && { width: r.width, lanes: r.lanes.map((l) => ({ ...l })) }), ...(r.from !== undefined && { from: r.from, to: r.to }) }),
    );
  };

  // The grid the streets make, from kerb to kerb: the cells are the blocks of ground with an edge. `i` counts the columns west to east, `j` the rows north to south.
  const blocks = map.ground.filter((g) => g.edge && !g.outside && (g.kind === 'pavement' || g.kind === 'grass'));
  const columns = [...new Set(blocks.map((g) => g.x))].sort((a, b) => a - b);
  const rows = [...new Set(blocks.map((g) => g.z))].sort((a, b) => a - b);
  const cells: MapParts['cells'] = blocks.map((g) => ({ i: columns.indexOf(g.x), j: rows.indexOf(g.z), x: g.x, z: g.z, w: g.w, d: g.d })).sort((a, b) => a.i - b.i || a.j - b.j);
  // The strips between the two carriageways of a road: narrow cells of grass.
  const medians: Rect[] = blocks.filter((g) => g.kind === 'grass' && Math.min(g.w, g.d) < 6).map((g) => ({ x: g.x, z: g.z, w: g.w, d: g.d }));
  /** Strollers walk round the cells that are blocks, not the strips between the two streets of a road. */
  const wide = (r: Rect) => Math.min(r.w, r.d) >= 6;
  /** The row of cells the company's ground is in. */
  const ownRow = cells.find((c) => plot.x + 1 >= c.x && plot.x + 1 <= c.x + c.w && plot.z + 1 >= c.z && plot.z + 1 <= c.z + c.d)?.j ?? 0;
  /** The cells that are the office's own block: those of its row between its streets. */
  const isOwn = (b: Building, c: MapParts['cells'][number]) => {
    const o = own(b);
    return c.j === ownRow && c.x >= o.x - 0.01 && c.x + c.w <= o.x + o.w + half + 0.01;
  };
  /** A cell cut short at a street that runs through it. */
  const clipped = (c: Rect): Rect => {
    const through = xs.filter((band) => band.from > c.x + 0.01 && band.from < c.x + c.w - 0.01);
    return through.length === 0 ? c : { ...c, w: Math.min(...through.map((band) => band.from)) - c.x };
  };
  /** A cell of the office's row that reaches over all of the office's ground (one big cell, in a map without streets round it): no block of other people's. */
  const holdsOffice = (b: Building, c: MapParts['cells'][number]) => {
    const o = own(b);
    return c.j === ownRow && c.x < o.x + half + 0.01 && c.x + c.w > o.x + o.w - half - 0.01;
  };

  // The streets as asphalt: the streets along z run from the first street along x to the last, those along x from the first to the last along z. The railway is not a street.
  const carriageways: Rect[] =
    horizontals.length === 0
      ? []
      : [
          ...xs.map((band): Rect => ({ x: band.from, z: horizontals[0]!.from, w: band.to - band.from, d: horizontals[horizontals.length - 1]!.to - horizontals[0]!.from })),
          ...horizontals.map((band): Rect => ({ x: xs[0]!.from, z: band.from, w: xs[xs.length - 1]!.to - xs[0]!.from, d: band.to - band.from })),
        ];
  const oneWays: Street[] = [...map.roads.filter((r) => r.arrows && r.along === 'z').sort((p, q) => p.at - q.at), ...map.roads.filter((r) => r.arrows && r.along === 'x').sort((p, q) => p.at - q.at)].map(
    (r): Street => ({ along: r.along, at: r.at, width: r.width, lanes: (r.lanes ?? []).map((l) => ({ ...l })) }),
  );

  // The street the lot opens onto: its stops and the pavement east of the office are by it.
  const eastFrom = (xs.find((band) => sameLine(band.at, lot.street)) ?? { from: lot.street - half }).from;
  // With the entrance on the south or the north face and the lot on the other side of the building: the people of the lot go round the
  // building's east corner, along the pavement between it and the street east of it.
  const round: Spot | null = facing === 'w' ? null : { x: (plot.x + plot.w + eastFrom) / 2, z: gate.z };

  return {
    id: file.id,
    streetWidth: sw,
    from,
    length,
    railway,
    own,
    lot: () => ({ block: lotBlock, street: lot.street }),
    streets,
    busy,
    stops,
    places: {
      door: doorAt,
      gate,
      corner: (stop) => (facing === 'w' ? { x: gate.x, z: stop.z } : { x: stop.x, z: gate.z }),
      stop: (wait) => wait,
      // Round the back of the office, out of sight: down the alleyway behind it, in line with the entrance. With the entrance on the
      // south face the alley behind is the lot's: along the pavement in front, from the street east of it.
      away: facing === 'w' ? { x: gate.x, z: plot.z - 2.5 } : { x: eastFrom - 0.4, z: gate.z },
      // Their door in: on the courtyard face of the west wing, level with the reception.
      court: facing === 'w' ? { x: lotBlock.x + 0.15, z: gate.z } : null,
      round,
    },
    strolling: (b) => {
      const mine = cells.filter((c) => isOwn(b, c));
      // (A map whose row is one cell reaching far past the office's streets has none of its own: the block is then the office's
      // ground, from kerb to kerb, and that big cell is no block of other people's.)
      const o = own(b);
      // Where no street or alley runs beside the building, it is walked round 1.6 tiles out from its walls.
      const clear = 1.6;
      const x0w = Math.min(o.x + half, ...b.wings.map((r) => r.x - clear));
      const x1w = Math.max(o.x + o.w - half, ...b.wings.map((r) => r.x + r.w + clear));
      const z0w = Math.min(o.z, ...b.wings.map((r) => r.y - clear));
      const z1w = Math.max(o.z + o.d, ...b.wings.map((r) => r.y + r.h + clear));
      const ground: Rect = { x: x0w, z: z0w, w: x1w - x0w, d: z1w - z0w };
      const outline: Rect = mine.length > 0 ? holding(mine) : ground;
      return { own: middleOf(outline), others: cells.filter((c) => wide(c) && !isOwn(b, c) && !holdsOffice(b, c)).map((c) => middleOf(clipped(c))), ...(drawn.length > 0 && { drawn }) };
    },
    cellAt: (b, x, z) => {
      const found = cells.find((c) => x >= c.x && x <= c.x + c.w && z >= c.z && z <= c.z + c.d);
      return found && wide(found) && !isOwn(b, found) && !holdsOffice(b, found) ? middleOf(found) : null;
    },
    pavement: (_b, x, z) => !xs.some((band) => x > band.from + 0.001 && x < band.to - 0.001) && !zs.some((band) => z > band.from + 0.001 && z < band.to - 0.001),
    lotCrossing: () => null,
    map: { plot, courtyard, cells, medians, oneWays, carriageways, roads: [], ...parts },
  };
}

/** How long a plot is along a band of houses, about, in tiles. */
const WALK = 1.6;
const STEP = 0.25;

/** The walking paths a map draws by hand, as lines of corners. */
const drawnWalks = (map: { walks?: MapSpot[][] }): [number, number][][] => (map.walks ?? []).map((path) => path.map((p): [number, number] => [p.x, p.z]));

/** The layout of a town whose roads run on their own, each with the ends the file gives it (#218). */
function roadsLayout(
  file: MapFile,
  house: Building,
  have: { plot: Rect; rail: MapBox; railway: Layout['railway']; parts: Pick<MapParts, 'ground' | 'houses' | 'trees' | 'lamps' | 'hills' | 'peaks'>; courtyard: MapParts['courtyard']; stops: Layout['stops']; gate: Spot; doorAt: Spot },
): Layout {
  const { map, settings } = file;
  const { plot, rail, railway, parts, courtyard, stops, gate, doorAt } = have;
  const byHand = drawnWalks(map);
  const edge = map.edge;
  if (!edge) throw new Error('A town laid out by its roads needs an edge: the box the town lies in.');
  const driven = map.streetWidth;
  const roads = map.roads.map((r): Street => {
    if (r.from === undefined || r.to === undefined) throw new Error('A road of a town laid out by its roads needs the ends it runs between.');
    return { along: r.along, at: r.at, from: r.from, to: r.to };
  });
  // The roads that carry traffic (0.21.0, #329): a road says whether it does, and may give its lanes (a one-way road) with the width they lie in.
  // Where every road carries traffic and none has lanes, which is how the two towns of the game are, they are the roads themselves.
  const driving = map.roads.every((r) => r.traffic && !r.lanes)
    ? roads
    : map.roads.flatMap((r, n): Street[] => (!r.traffic ? [] : r.lanes ? [{ ...roads[n]!, width: r.width, lanes: r.lanes.map((l) => ({ ...l })) }] : [roads[n]!]));
  const arrowed = map.roads.flatMap((r, n): Street[] => (r.arrows ? [{ ...roads[n]!, width: r.width, lanes: (r.lanes ?? []).map((l) => ({ ...l })) }] : []));
  railway.strips = settings.railway === 'ground' ? [] : Array.from({ length: Math.floor(rail.w / 20) }, (_, n) => ({ from: rail.x + n * 20 + 8.5, to: rail.x + n * 20 + 11.5 }));

  // (People keep off a road as wide as it is drawn: `width` is that, `streetWidth` how wide it is driven.)
  const drawn = new Map(map.roads.map((r, n) => [roads[n]!, r.width / 2]));
  const onRoad = (x: number, z: number) =>
    roads.some((r) => {
      const h = drawn.get(r)!;
      return r.along === 'x' ? Math.abs(z - r.at) < h - 0.001 && x > r.from! - h && x < r.to! + h : Math.abs(x - r.at) < h - 0.001 && z > r.from! - h && z < r.to! + h;
    });

  // The people out for a walk go round the building.
  const face = westOf(house);
  // (Where open water lies against the building, as the lake does in Amplify Hills between the legs, they keep to its front instead, the
  // reception's rows and the pavement south of them: a loop round the whole of it would be walking on the lake.)
  const reception = map.building.reception;
  const waters = parts.ground.filter((g) => g.kind === 'water' && !touchesGrid(g));
  const lakeside = reception !== null && waters.some((w) => w.x < face + widthOf(house) && w.x + w.w > face && w.z < house.depth && w.z + w.d > 0);
  const body: Rect = reception && lakeside ? { x: face, z: reception.z, w: widthOf(house), d: house.depth - reception.z } : { x: face, z: 0, w: widthOf(house), d: house.depth };
  // The corner the people out for a walk go to when they leave: the inner corner of the west leg of a U; with none, the reception's own corner.
  const westFront = house.wings.filter((w) => w.y + w.h === house.depth && w.x + w.w <= gate.x).map((w) => w.x + w.w);
  const awayX = westFront.length > 0 ? Math.max(...westFront) + 1.5 : Math.min(...house.wings.filter((w) => w.y + w.h === house.depth && w.x <= gate.x && w.x + w.w > gate.x).map((w) => w.x)) - 1.5;

  // The walking paths: the ring round the whole building, 1.6 tiles out, cut where it would run over a road as drawn (half the driven
  // width and a little more), over open water or into a wing. What is left in stretches of 8 tiles and more are the paths: people walk
  // to the end of one, turn and walk back.
  const wingRects = house.wings.map((w): Rect => ({ x: w.x, z: w.y, w: w.w, d: w.h }));
  const ringBox = {
    x0: Math.min(...wingRects.map((r) => r.x)) - WALK,
    z0: Math.min(...wingRects.map((r) => r.z)) - WALK,
    x1: Math.max(...wingRects.map((r) => r.x + r.w)) + WALK,
    z1: Math.max(...wingRects.map((r) => r.z + r.d)) + WALK,
  };
  const ring: [number, number][] = [];
  for (let x = ringBox.x0; x < ringBox.x1 - 1e-9; x += STEP) ring.push([x, ringBox.z0]);
  for (let z = ringBox.z0; z < ringBox.z1 - 1e-9; z += STEP) ring.push([ringBox.x1, z]);
  for (let x = ringBox.x1; x > ringBox.x0 + 1e-9; x -= STEP) ring.push([x, ringBox.z1]);
  for (let z = ringBox.z1; z > ringBox.z0 + 1e-9; z -= STEP) ring.push([ringBox.x0, z]);
  const kerb = driven / 2 + 0.5;
  const blocked = ([x, z]: [number, number]) =>
    roads.some((r) => (r.along === 'x' ? Math.abs(z - r.at) < kerb && x > r.from! - kerb && x < r.to! + kerb : Math.abs(x - r.at) < kerb && z > r.from! - kerb && z < r.to! + kerb)) ||
    waters.some((w) => x > w.x - 0.5 && x < w.x + w.w + 0.5 && z > w.z - 0.5 && z < w.z + w.d + 0.5) ||
    // (A track on the ground is walked over only at a level crossing, by those who stop for its barrier, 0.21.0: the paths are cut at it.)
    (settings.railway === 'ground' && x > rail.x - 0.5 && x < rail.x + rail.w + 0.5 && z > rail.z - 0.5 && z < rail.z + rail.d + 0.5) ||
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

  // The roads as asphalt, each over its own length: the ends beside another road reach its far kerb, those at the edge of the town run on out of sight.
  const carriageways = roads.map((road): Rect => {
    const [low, high] = road.along === 'x' ? [edge.x, edge.x + edge.w] : [edge.z, edge.z + edge.d];
    const start = road.from! - (Math.abs(road.from! - low) < 0.01 ? OUT : driven / 2);
    const end = road.to! + (Math.abs(road.to! - high) < 0.01 ? OUT : driven / 2);
    return road.along === 'x' ? { x: start, z: road.at - driven / 2, w: end - start, d: driven } : { x: road.at - driven / 2, z: start, w: driven, d: end - start };
  });
  const lot = map.lot;

  return {
    id: file.id,
    streetWidth: driven,
    from: { x: edge.x, z: edge.z },
    length: { x: edge.w, z: edge.d },
    edge: { ...edge },
    railway,
    own: () => plot,
    lot: () => ({ block: lot.block, street: lot.street, along: lot.along ?? 'x', side: lot.side ?? -1 }),
    streets: () => roads,
    busy: () => driving,
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
    strolling: () => ({ own: { x: body.x + body.w / 2, z: body.z + body.d / 2, w: body.w + 2 * WALK, d: body.d + 2 * WALK }, others: [], paths: walks, ...(byHand.length > 0 && { drawn: byHand }) }),
    cellAt: () => null,
    pavement: (_b, x, z) => !onRoad(x, z),
    lotCrossing: () => null,
    map: { plot, courtyard, cells: [], medians: [], oneWays: arrowed, carriageways, roads, ...parts },
  };
}

/**
 * The building a map is laid out round: the one given, the region's own, or (a map of no region) the one worked out from the wings and
 * reception box the file writes (#289, src/office/drawnBuilding.ts), with the floors the map's settings say (#287). The default towns' own buildings have those
 * floors already, and are returned as they are. Throws, with the reason, when a map can have no building (see `buildingProblem`).
 */
export function houseOf(file: MapFile, building?: Building): Building {
  const region = (Object.keys(SITES) as RegionId[]).find((r) => SITES[r].map === file.id);
  const house = building ?? (region ? buildingFor(region) : undefined);
  if (!house) return drawnBuilding(file);
  return house.floors === file.settings.floors ? house : { ...house, floors: file.settings.floors };
}

const maps = new Map<string, Layout>();

/** The layout of a town laid out from its map file, by the file's name. */
export function layoutOfMap(name: string): Layout {
  let layout = maps.get(name);
  if (!layout) {
    const file = MAPS[name];
    if (!file) throw new Error(`No town map called ${name}`);
    layout = layoutFromMap(file);
    maps.set(name, layout);
  }
  return layout;
}

/** The name the map editor's draft is drawn under (src/mods/mapPreview.ts); `layoutOfMap` finds it with the others and it is taken off when the editor closes. */
export const PREVIEW_MAP = 'editor-preview';

/** Puts the layout of the map editor's draft on the list under `PREVIEW_MAP`, or takes it off. */
export function setPreviewLayout(layout: Layout | null): void {
  if (layout) maps.set(PREVIEW_MAP, layout);
  else maps.delete(PREVIEW_MAP);
}

/**
 * Replaces the decor of the preview's layout, on the same `Layout` object (0.21.0, #328): the ground that lies flat, houses, trees, lamps,
 * hills and peaks. Everything else of a layout is worked out from the structure of the file (`structureKey`, src/mods/townDraft.ts), and the
 * roads, lots and places are cached by the layout object, so while the structure stays the same this leaves the traffic alone. Returns
 * whether there was a layout to change.
 */
export function setPreviewDecor(file: MapFile): boolean {
  const parts = maps.get(PREVIEW_MAP)?.map;
  if (!parts) return false;
  const { ground, houses, trees, lamps, hills, peaks } = file.map;
  Object.assign(parts, { ground, houses, trees, lamps, hills, peaks });
  return true;
}

/** The name the custom map a game is played on is drawn under (0.21.0, #290; src/mods/playMap.ts). */
export const PLAYED_MAP = 'played-map';

/** Puts the layout of the map being played on the list under `PLAYED_MAP`, or takes it off. */
export function setPlayedLayout(layout: Layout | null): void {
  if (layout) maps.set(PLAYED_MAP, layout);
  else maps.delete(PLAYED_MAP);
}

/** The layout of a region's town: its drawing, or the grid. */
export const layoutOf = (site: { map: string | null }): Layout => (site.map ? layoutOfMap(site.map) : GRID);

/** The capital's town (Coaxia): what the functions that take a layout work from when none is given. */
export const CAPITAL: Layout = layoutOf(SITES.capital);
