// How the streets of a town lie: where they run, which of them carry traffic,
// where the office's own ground is and where the people walk. Pure.
//
// Most regions have the grid of blocks the town has always been laid out in:
// 8 by 7.5 tiles to a block, streets 2 tiles wide. Coaxia (the capital) is laid
// out from the drawing in design/towns (src/config/townMaps.ts): streets 4
// tiles wide, with blocks of 37 tiles and more between them, alleyways, green
// strips and the railway along the south. Everything that depends on where the
// streets are asks for it here, so that city.ts, traffic.ts, street.ts and
// parking.ts work out the rest in the same way for both.

import { BUILDINGS, CORE, FLOOR, WEST, buildingFor, coreFrame, westOf, widthOf, type Building } from '../config/office';
import type { RegionId } from '../config/world';
import { TOWN_MAPS } from '../config/townMaps';
import type { TileBox, TownMap } from '../config/townMapReader';
import { CITY } from './assets';
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
}

/** A place where a bus or taxi stops: the street, on the office's side of it, and how far along the street. */
export interface Stop extends Street {
  pos: number;
}

/** The parts of a town that is laid out from a drawing, in floor tiles. */
export interface MapParts {
  /** The bands of buildings, the alleyways and the green strips. */
  buildings: Rect[];
  alleys: Rect[];
  greens: Rect[];
  /** The company's own ground until the U is built: the U's box. */
  plot: Rect;
  /** The courtyard of the U (0.20.0): its two parking strips, the green between them and the fountain on it. */
  courtyard: { parking: Rect[]; green: Rect[]; fountain: Spot | null };
  /** The cells of the grid the streets make: from kerb to kerb. `i` counts the columns west to east, `j` the rows north to south. */
  cells: (Rect & { i: number; j: number })[];
  /** The bands of buildings beyond the drawing's north edge: the outermost row, mirrored over its streets. */
  beyond: Rect[];
  /** The water (the sea, a lake, a river) and the beach of the drawing. */
  water: Rect[];
  beach: Rect[];
  /**
   * For a town laid out by its roads (#218; none, the cells being its grid, in the others): the roads, with their own
   * ends; the 1-tile lanes, paving with no traffic, and the drawn parking strips the lot does not use; the mountains;
   * and the plots, one house with its garden each. The fields are `greens`.
   */
  roads: Street[];
  driveways: Rect[];
  mountains: Rect[];
  plots: Rect[];
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
  /** The elevated line, the strips of paving under it between the cross streets and how wide it is. */
  railway: { z: number; from: number; length: number; width: number; strips: { from: number; to: number }[] };
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
  strolling(building: Building): { own: Cell; others: Cell[] };
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
   * street elsewhere, and the rest of the town is where it always is.
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

// --- A town laid out from a drawing ---

/** Two streets whose kerbs are closer than this are one road in the drawing: only the first carries traffic, as a vehicle has no room to stand between their crossings. */
const TWIN = 4;

/** A street this close (kerb to the company's ground) is beside the office, and carries traffic even where it lies behind it. */
const NEAR = 14;

interface Band {
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

function mapLayout(id: string, map: TownMap, building: Building, stopFromDrawing = true): Layout {
  // The office stands at the north wing: the one wing that lies along x, furthest north.
  const wings = map.wings.filter((wing) => wing.w > wing.h);
  const north = wings.reduce((a, b) => (b.y < a.y ? b : a));
  const shift = { x: WEST - north.x, z: -north.y };
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
  const roads = (lines: Street[], along: 'x' | 'z'): Street[] => {
    const kept: Street[] = [];
    for (const line of lines.filter((l) => l.along === along).sort((a, b) => a.at - b.at)) {
      const before = kept[kept.length - 1];
      if (!before || line.at - before.at - sw >= TWIN) kept.push(line);
    }
    return kept;
  };

  // The grid the streets make, from kerb to kerb: the cells have the drawing's contents in them.
  const cells: MapParts['cells'] = [];
  // The ground of the drawing south of its last street (the company's own row, in a drawing whose streets end north of it) is one more row.
  const bottom = Math.max(...[...buildings, ...alleys, plot].map((r) => r.z + r.d));
  const lastZ = zs[zs.length - 1]!;
  const rows = bottom > lastZ.to + 1 ? [...zs, { at: bottom, from: bottom, to: bottom }] : zs;
  xs.slice(0, -1).forEach((a, i) => {
    rows.slice(0, -1).forEach((b, j) => {
      const next = [xs[i + 1]!, rows[j + 1]!] as const;
      cells.push({ i, j, x: a.to, z: b.to, w: next[0].from - a.to, d: next[1].from - b.to });
    });
  });
  const middleOf = (r: Rect): Cell => ({ x: r.x + r.w / 2, z: r.z + r.d / 2, w: r.w, d: r.d });
  /** Strollers walk round the cells that are blocks, not the strips between the two streets of a road. */
  const wide = (r: Rect) => Math.min(r.w, r.d) >= 6;
  /** The row of cells the company's ground is in. */
  const ownRow = cells.find((c) => plot.x + 1 >= c.x && plot.x + 1 <= c.x + c.w && plot.z + 1 >= c.z && plot.z + 1 <= c.z + c.d)?.j ?? 0;
  /** The cells that are the office's own block: those of its row between its streets. */
  const isOwn = (building: Building, c: MapParts['cells'][number]) => {
    const o = own(building);
    return c.j === ownRow && c.x >= o.x - 0.01 && c.x + c.w <= o.x + o.w + half + 0.01;
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
  const courtyard: MapParts['courtyard'] = {
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

  return {
    id,
    streetWidth: sw,
    from,
    length,
    railway: { z: rail.at, from: from.x, length: length.x, width: train.d, strips: railStrips },
    own,
    lot: () => ({ block: lotBlock, street: eastStreet.at }),
    streets,
    busy: (building) => {
      const o = own(building);
      const all = streets(building);
      const x = roads(all.filter((l) => l.along === 'z' && l.at >= o.x - 0.01 && l.at < lastEast.at - 0.01), 'z');
      const z = roads(all.filter((l) => l.along === 'x' && (l.at >= o.z - 0.01 || (onAcross && sameLine(l.at, nearest.band.at))) && !sameLine(l.at, rail.at)), 'x');
      return [...x, ...z];
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
      const x0 = Math.min(...mine.map((c) => c.x));
      const z0 = Math.min(...mine.map((c) => c.z));
      const outline: Rect = { x: x0, z: z0, w: Math.max(...mine.map((c) => c.x + c.w)) - x0, d: Math.max(...mine.map((c) => c.z + c.d)) - z0 };
      return { own: middleOf(outline), others: cells.filter((c) => wide(c) && !isOwn(building, c)).map(middleOf) };
    },
    cellAt: (building, x, z) => {
      const found = cells.find((c) => x >= c.x && x <= c.x + c.w && z >= c.z && z <= c.z + c.d);
      return found && wide(found) && !isOwn(building, found) ? middleOf(found) : null;
    },
    pavement: (_building, x, z) => !xs.some((band) => x > band.from + 0.001 && x < band.to - 0.001) && !zs.some((band) => z > band.from + 0.001 && z < band.to - 0.001),
    lotCrossing: () => null,
    map: { buildings, alleys, greens: map.greens.map(rect).filter((r) => r.x >= xs[0]!.to - 0.01 && r.x + r.w <= xs[xs.length - 1]!.from + 0.01), plot, courtyard, cells, beyond, water: map.water.map(rect), beach: map.beach.map(rect), roads: [], driveways: [], mountains: [], plots: [] },
  };
}

// --- A town laid out by its roads (#218) ---

/**
 * The drawings whose town is laid out by their roads, not as a grid of cells (Aerial Fields and Amplify Hills), and where
 * the bus stops on the road south of the lot, from the door's x. The building is the region's own (the long one in Amplify Hills, the U in Aerial Fields).
 */
const BY_ROADS: Record<string, { bus: number }> = {
  // (West of the T-junction beside the lot: east of it the road is a dead end, and buses are not sent into those. The entrance of the
  // building of Aerial Fields is 4.5 tiles west of where the long building's was, so the stop is 4 from it, not 8.5: the same place on the ground.)
  'aerial-fields': { bus: -4 },
  'amplify-hills': { bus: 0 },
};

/**
 * The drawings whose bus stop is not the one in the drawing: they draw BUS and STOP apart, and have always put the stops at the entrance (#200).
 * (Skywave Beach's building has its entrance north, by the drawn stop, so the two agree there since #224.)
 */
const STOPS_AT_ENTRANCE = ['transponder-valley', 'skywave-beach'];

/** How long a plot is along a band of houses, about, in tiles. */
const PLOT = 11;
/** The lot is this long along its road: the length of its bays and its walkway (parking.ts). */
const LOT_LENGTH = 13;
/** The lot stands this far from the end of a road it opens onto, so that a car can turn in. */
const LOT_END = 3;

function roadLayout(id: string, map: TownMap, house: Building): Layout {
  const face = westOf(house);
  const { point } = coreFrame(house);
  // The building stands on all the red shapes (0.20.0): the drawing is shifted so that its westmost wing is the building's west face,
  // and its north edge is the building's.
  const shift = { x: face - Math.min(...map.wings.map((w) => w.x)), z: 0 };
  const rect = (box: TileBox): Rect => ({ x: box.x + shift.x, z: box.y + shift.z, w: box.w, d: box.h });

  // The roads are the 2-tile lanes; the 1-tile ones are driveways. Lanes in a line, with no more than a junction between them, are one road.
  const lanes = map.lanes.map(rect);
  const sw = Math.min(...lanes.map((r) => Math.min(r.w, r.d)).filter((n) => n >= 2));
  const half = sw / 2;
  const isRoad = (r: Rect) => Math.min(r.w, r.d) >= 2;
  const lines = lanes.filter(isRoad).map((r): Required<Street> => (r.w > r.d ? { along: 'x', at: r.z + r.d / 2, from: r.x, to: r.x + r.w } : { along: 'z', at: r.x + r.w / 2, from: r.z, to: r.z + r.d }));
  const joined = (list: Required<Street>[]): Required<Street>[] => {
    const out: Required<Street>[] = [];
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

  // The stops: on the road south of the lot, the bus level with the entrance (see BY_ROADS) and the taxi west of it.
  const busPos = gate.x + BY_ROADS[id]!.bus;
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

  return {
    id,
    streetWidth: sw,
    from: { x: edge.x, z: edge.z },
    length: { x: edge.w, z: edge.d },
    edge,
    // The train runs where the drawing has it, on pillars between which no road passes: a plinth every 20 tiles.
    railway: {
      z: train.z + train.d / 2,
      from: train.x,
      length: train.w,
      width: train.d,
      strips: Array.from({ length: Math.floor(train.w / 20) }, (_, n) => ({ from: train.x + n * 20 + 8.5, to: train.x + n * 20 + 11.5 })),
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
    strolling: () => ({ own: { x: body.x + body.w / 2, z: body.z + body.d / 2, w: body.w + 2 * WALK, d: body.d + 2 * WALK }, others: [] }),
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
      beyond: [],
      water: map.water.map(rect),
      beach: map.beach.map(rect),
      roads,
      driveways: [...lanes.filter((r) => !isRoad(r)), ...strips.filter((r) => r !== strip)],
      mountains: map.mountains.map(rect),
      plots,
    },
  };
}

const maps = new Map<string, Layout>();

/** The layout of a town laid out from a drawing, by its file name. */
export function layoutOfMap(name: string): Layout {
  let layout = maps.get(name);
  if (!layout) {
    const map = TOWN_MAPS[name];
    if (!map) throw new Error(`No town map called ${name}`);
    // The building of the region this drawing is: a drawing is of one region (Coaxia: the U; Transponder Valley and Skywave Beach: their own).
    const region = (Object.keys(SITES) as RegionId[]).find((r) => SITES[r].map === name);
    layout = name in BY_ROADS ? roadLayout(name, map, region ? buildingFor(region) : BUILDINGS.hills) : mapLayout(name, map, region ? buildingFor(region) : BUILDINGS.standard, !STOPS_AT_ENTRANCE.includes(name));
    maps.set(name, layout);
  }
  return layout;
}

/** The layout of a region's town: its drawing, or the grid. */
export const layoutOf = (site: { map: string | null }): Layout => (site.map ? layoutOfMap(site.map) : GRID);

/** The capital's town (Coaxia): what the functions that take a layout work from when none is given. */
export const CAPITAL: Layout = layoutOf(SITES.capital);
