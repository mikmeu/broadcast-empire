// The company's parking lot (0.20.0): where staff and hosts park their cars,
// with a marked zone for vans. Pure: it follows from the building and from how
// many floors are open, so nothing is saved. The lot levels up with the
// floors: a few bays at first, the whole lot once the top floor is open.
//
// In a grid of blocks the lot is the town block east of the office's own block
// (city.ts, `lotBlock`). Seen from above, with the street it opens onto on its
// west side:
//
//   - a pavement along its south edge, where people walk to the crossing;
//   - a drive-in at the south end: cars come in along its south lane and go out
//     along the north one, both from and into the street's eastern lane;
//   - an aisle along z with a lane each way, a column of bays on its west side
//     and one on its east side. The east column starts with the van zone.
//
// In a town laid out from a drawing the lot is the courtyard of the U: the two
// parking strips of the drawing with the green and the fountain between them,
// and the street it opens onto is the one east of the U, driven south:
//
//   - each strip has a row of bays along its outer side, nose to the wing, and a
//     lane each way beside it: westbound on the north side, eastbound on the south;
//   - each strip has its own way in and out, from and into the street's lane
//     beside the courtyard; the van zone is the east end of the south strip;
//   - people walk from their car across the green to the door on the courtyard
//     face of the west wing, and cross no street.
//
// What drives in and out is in traffic.ts, who walks to the door in street.ts.

import { BUILDINGS, type Building } from '../config/office';
import { CAPITAL, type Layout, type Rect } from './townLayout';

/** How far in from the kerb the lot's ground is used. */
const INSET = 0.15;
/** Rows of bays along the aisle, counted from the south, and how far one is from the next, in tiles. */
export const LOT_ROWS = 10;
const PITCH = 1.1;
/** How deep a car bay is and how deep a van bay is; the van zone is the deeper one. */
const DEPTH = { car: 1.8, van: 2 } as const;
/** The south end of the lot is a pavement for walking, this deep. */
const WALKWAY = 1.5;
/** The first rows of the west column are the drive-in. */
const DRIVE_ROWS = 2;
/** How many van bays a lot has, once every floor is open: the van zone is the east column from the south, or the east end of the south strip. */
const VANS = { standard: 6, long: 8, courtyard: 6 } as const;
/** How far a lane is from the middle of the aisle it is in. */
const LANE = 0.47;
/** Walking across the green, people keep this far from its edge, and turn towards the door this far from the west end. */
const GREEN_EDGE = 0.2;
const TURN_BEFORE_DOOR = 3.2;

export type BayKind = 'car' | 'van';

/** A place to park. */
export interface Bay {
  /** Its place in the list of all bays of the lot: the same whatever the level. */
  id: number;
  kind: BayKind;
  /** The side of the aisle a bay is on in a block, or the strip it is in in a courtyard. */
  side: 'west' | 'east' | 'north' | 'south';
  /**
   * The order the bays open in: counted from the south in a block; from the street in a courtyard, where a car bay
   * of the south strip is counted after the van zone.
   */
  row: number;
  /** Where the middle of a vehicle in it stands, in floor tiles. */
  x: number;
  z: number;
  /** The way a vehicle points that stands in it: the nose to the outside of the lot, as an angle around the vertical (0 points along +x). */
  angle: number;
  /** Where someone who gets out stands: on the aisle, in front of the door. */
  door: [x: number, z: number];
  /** Which of the lot's `gates` it is reached by. */
  gate: number;
  /** The points a car passes on the way in, after it leaves the lane at the gate, and the points on the way out after it has backed out of the bay. */
  approach: [number, number][];
  leave: [number, number][];
}

/** A strip of a courtyard: one row of bays and the aisle along it. */
export interface Strip {
  /** The side of the green it is on, and the way the noses of the cars point: -1 north, 1 south. */
  side: 'north' | 'south';
  nose: -1 | 1;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** The middle of the lane that goes west into the strip and of the one that comes back east, as z. */
  in: number;
  out: number;
}

/** The ground of a lot: its edges and where its lanes run. */
export interface Lot {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** The street it opens onto: the middle line of the street, along z. */
  street: number;
  /** Which side of the street the lot is on: 1 east of it, -1 west of it. The lane beside it runs north (-z) in the first case and south in the second. */
  side: 1 | -1;
  /** The line along which people walk on the south edge. */
  walkZ: number;
  /** The aisle: its edges, and the middle of its lane north and the lane south. In a courtyard it is the first strip's, with the middle of its two lanes as z. */
  aisle: { x0: number; x1: number; north: number; south: number };
  /** The drive-in: the middle of the lane that goes in and of the one that goes out, as z. */
  drive: { in: number; out: number };
  /** The ways in from the street: one in a block, one for each strip in a courtyard. */
  gates: { in: number; out: number }[];
  /** The strips of a courtyard; none in a block. */
  strips: Strip[];
  /** Where the ground of the bays ends in the north: rows are marked up to there. */
  top: number;
  bays: Bay[];
}

/** How many bays a strip of the courtyard holds, with the van zone counted. */
export const stripRows = (layout: Layout): number => Math.floor((layout.map!.courtyard.parking[0]!.w - 2 * INSET) / PITCH);

/**
 * The rows of the lot open for cars when this many floors are: the lot grows
 * with the building, from the south (from the street, in a courtyard, in both
 * strips at once). The drive-in is open from the start.
 */
export const rowsOpen = (building: Building, level: number, layout: Layout = CAPITAL): number => {
  if (level <= 0) return 0;
  if (layout.map) {
    const rows = stripRows(layout);
    return Math.min(rows, Math.ceil((rows * level) / building.floors));
  }
  return Math.min(LOT_ROWS, DRIVE_ROWS + Math.ceil(((LOT_ROWS - DRIVE_ROWS) * level) / building.floors));
};

/** How many bays of the van zone are open when this many floors are: the zone grows in the same steps, and is all open with the top floor. */
export const vansOpen = (building: Building, level: number): number => Math.min(VANS[building.id], Math.ceil((VANS[building.id] * Math.max(level, 0)) / building.floors));

/** The lot of a building: all of it, with every bay it will have. */
export function lotOf(building: Building = BUILDINGS.standard, layout: Layout = CAPITAL): Lot {
  return layout.map ? courtyardLot(building, layout) : blockLot(building, layout);
}

function blockLot(building: Building, layout: Layout): Lot {
  const { block, street } = layout.lot(building);
  const [x0, x1] = [block.x + INSET, block.x + block.w - INSET];
  const [z0, z1] = [block.z + INSET, block.z + block.d - INSET];
  const south = z1 - WALKWAY;
  const rowZ = (row: number) => south - PITCH * (row + 0.5);
  const aisle = { x0: x0 + DEPTH.car, x1: x1 - DEPTH.van, north: 0, south: 0 };
  const middle = (aisle.x0 + aisle.x1) / 2;
  aisle.north = middle + LANE;
  aisle.south = middle - LANE;
  const drive = { in: rowZ(0), out: rowZ(1) };
  const vans = VANS[building.id];
  const bays: Bay[] = [];
  // From the lane at the drive-in along the aisle to the bay, and from the bay along it to the drive-out.
  const approach = (z: number): [number, number][] => [[aisle.north, drive.in], ...(Math.abs(z - drive.in) > 0.01 ? [[aisle.north, z] as [number, number]] : [])];
  const leave = (z: number): [number, number][] => [[aisle.south, z], ...(Math.abs(z - drive.out) > 0.01 ? [[aisle.south, drive.out] as [number, number]] : [])];
  for (let row = 0; row < LOT_ROWS; row++) {
    const z = rowZ(row);
    if (row >= DRIVE_ROWS) bays.push({ id: bays.length, kind: 'car', side: 'west', row, x: x0 + DEPTH.car / 2, z, angle: Math.PI, door: [aisle.x0 + 0.1, z], gate: 0, approach: approach(z), leave: leave(z) });
    const kind: BayKind = row < vans ? 'van' : 'car';
    bays.push({ id: bays.length, kind, side: 'east', row, x: x1 - DEPTH[kind] / 2, z, angle: 0, door: [aisle.x1 - 0.1, z], gate: 0, approach: approach(z), leave: leave(z) });
  }
  return {
    x0,
    x1,
    z0,
    z1,
    street,
    side: 1,
    walkZ: z1 - 0.1,
    aisle,
    drive,
    gates: [drive],
    strips: [],
    top: rowZ(LOT_ROWS - 1) - PITCH / 2,
    bays,
  };
}

/** The lot in the courtyard of the U: a row of bays along the outer side of each strip, a lane each way beside it, and a way in and out for each strip. */
function courtyardLot(building: Building, layout: Layout): Lot {
  const { block, street } = layout.lot(building);
  const { parking, green } = layout.map!.courtyard;
  const rows = stripRows(layout);
  const vans = VANS[building.id];
  const bays: Bay[] = [];
  const strips: Strip[] = [...parking]
    .sort((a, b) => a.z - b.z)
    .map((r: Rect): Strip => {
      const north = green.every((g) => r.z + r.d <= g.z + 0.01);
      // The aisle is what the bays leave of the strip (the south strip has the deeper van bays); the lanes lie either side of its middle.
      const [lo, hi] = north ? [r.z + INSET + DEPTH.car, r.z + r.d] : [r.z, r.z + r.d - INSET - DEPTH.van];
      const middle = (lo + hi) / 2;
      // Driving west the right hand is the north side.
      return { side: north ? 'north' : 'south', nose: north ? -1 : 1, x0: r.x + INSET, x1: r.x + r.w - INSET, z0: r.z, z1: r.z + r.d, in: middle - LANE, out: middle + LANE };
    });
  strips.forEach((strip, gate) => {
    for (let place = 0; place < rows; place++) {
      const x = strip.x1 - PITCH * (place + 0.5);
      const kind: BayKind = strip.side === 'south' && place < vans ? 'van' : 'car';
      const depth = DEPTH[kind];
      const z = strip.nose < 0 ? strip.z0 + INSET + depth / 2 : strip.z1 - INSET - depth / 2;
      const edge = z - (strip.nose * depth) / 2;
      bays.push({
        id: bays.length,
        kind,
        side: strip.side,
        row: strip.side === 'south' && kind === 'car' ? place - vans : place,
        x,
        z,
        angle: strip.nose < 0 ? Math.PI / 2 : -Math.PI / 2,
        door: [x, edge - strip.nose * 0.1],
        gate,
        approach: [[x, strip.in]],
        leave: [[x, strip.out]],
      });
    }
  });
  const first = strips[0]!;
  return {
    x0: block.x + INSET,
    x1: block.x + block.w - INSET,
    z0: block.z + INSET,
    z1: block.z + block.d - INSET,
    street,
    side: -1,
    walkZ: block.z + block.d / 2,
    aisle: { x0: first.x0, x1: first.x1, north: first.in, south: first.out },
    drive: { in: first.in, out: first.out },
    gates: strips.map((strip) => ({ in: strip.in, out: strip.out })),
    strips,
    top: first.z0,
    bays,
  };
}

/** The bays that are open when `level` floors are: the rows from the south that the floors open so far give, and the first bays of the van zone. */
export const openBays = (building: Building, level: number, layout: Layout = CAPITAL): Bay[] => {
  const [rows, vans] = [rowsOpen(building, level, layout), vansOpen(building, level)];
  return lotOf(building, layout).bays.filter((bay) => bay.row < (bay.kind === 'van' ? vans : rows));
};

/** The bays for cars that are open. */
export const carBays = (building: Building, level: number, layout: Layout = CAPITAL): Bay[] => openBays(building, level, layout).filter((bay) => bay.kind === 'car');

/** The van zone: the bays for vans that are open on a floor, in the order vans fill them. */
export const vanBays = (building: Building = BUILDINGS.standard, level: number = building.floors, layout: Layout = CAPITAL): Bay[] => openBays(building, level, layout).filter((bay) => bay.kind === 'van');

/**
 * Which van stands in which bay: the vans in the order they are given, one to
 * a bay from the south. Whatever does not fit has no bay, and is parked out of
 * view; to fit more, the lot has to grow with the building. For #20 and #184:
 * the vans of the company are a plain list here, with no state of their own.
 */
export function parkedVans<T extends { id: string }>(vans: readonly T[], building: Building = BUILDINGS.standard, level: number = building.floors, layout: Layout = CAPITAL): { van: T; bay: Bay }[] {
  const bays = vanBays(building, level, layout);
  return vans.flatMap((van, n) => (bays[n] ? [{ van, bay: bays[n]! }] : []));
}

/** The lot, whether a point is on its ground. */
export const onLot = (x: number, z: number, building: Building = BUILDINGS.standard, layout: Layout = CAPITAL): boolean => {
  const lot = lotOf(building, layout);
  return x >= lot.x0 - 0.01 && x <= lot.x1 + 0.01 && z >= lot.z0 - 0.01 && z <= lot.z1 + 0.01;
};

/**
 * The way a car drives from the street into a bay, as points: in from the
 * lane at the gate, along the aisle, and into the bay. `from` is where it
 * leaves the lane.
 */
export function wayIn(bay: Bay, from: [number, number]): [number, number][] {
  return [from, ...bay.approach, [bay.x, bay.z]];
}

/**
 * The way a car drives out of a bay and into the street's lane: backs out into
 * the aisle, along it to the way out, and out to `to`, where it joins the lane.
 */
export function wayOut(bay: Bay, to: [number, number]): [number, number][] {
  return [[bay.x, bay.z], ...bay.leave, to];
}

/**
 * The way someone walks from a car to the corner of the lot, where the street is crossed; in a courtyard,
 * across the green's edge to the west end of the lot, from where the way goes on to the door.
 */
export function walkFrom(lot: Lot, bay: Bay): [number, number][] {
  const [x, z] = bay.door;
  if (lot.strips.length > 0) {
    // Out of the aisle onto the edge of the green nearest the car, and along it, clear of the fountain.
    const strip = lot.strips.find((s) => s.side === bay.side)!;
    const edge = strip.nose < 0 ? strip.z1 + GREEN_EDGE : strip.z0 - GREEN_EDGE;
    const turn = lot.x0 + TURN_BEFORE_DOOR;
    return [[x, z], [x, edge], ...(x > turn ? [[turn, edge] as [number, number]] : [])];
  }
  return [[x, z], [x, lot.walkZ], [lot.x0 + 0.1, lot.walkZ]];
}
