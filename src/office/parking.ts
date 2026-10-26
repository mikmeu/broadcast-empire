// The company's parking lot (0.20.0): where staff and hosts park their cars,
// with a marked zone for vans. Pure: it follows from the building and from how
// many floors are open, so nothing is saved. The lot levels up with the
// floors: a few bays at first, the whole lot once the top floor is open.
//
// The lot is the town block east of the office's own block (city.ts, `lotBlock`).
// Seen from above, with the street it opens onto on its west side:
//
//   - a pavement along its south edge, where people walk to the crossing;
//   - a drive-in at the south end: cars come in along its south lane and go out
//     along the north one, both from and into the street's eastern lane;
//   - an aisle along z with a lane each way, a column of bays on its west side
//     and one on its east side. The east column starts with the van zone.
//
// What drives in and out is in traffic.ts, who walks to the door in street.ts.

import { BUILDINGS, type Building } from '../config/office';
import { CITY } from './assets';
import { lotBlock } from './city';

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
/** How many van bays a lot has, once every floor is open: the van zone is the east column from the south. */
const VANS = { standard: 6, long: 8 } as const;

export type BayKind = 'car' | 'van';

/** A place to park. */
export interface Bay {
  /** Its place in the list of all bays of the lot: the same whatever the level. */
  id: number;
  kind: BayKind;
  side: 'west' | 'east';
  /** Counted from the south; the rows open from there. */
  row: number;
  /** Where the middle of a vehicle in it stands, in floor tiles. */
  x: number;
  z: number;
  /** The way a vehicle points that stands in it: the nose to the outside of the lot, as an angle around the vertical (0 points along +x). */
  angle: number;
  /** Where someone who gets out stands: on the aisle, in front of the door. */
  door: [x: number, z: number];
}

/** The ground of a lot: its edges and where its lanes run. */
export interface Lot {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** The street it opens onto: the middle line of the street, along z, on its west side. */
  street: number;
  /** The line along which people walk on the south edge. */
  walkZ: number;
  /** The aisle: its edges, and the middle of its lane north and the lane south. */
  aisle: { x0: number; x1: number; north: number; south: number };
  /** The drive-in: the middle of the lane that goes in and of the one that goes out, as z. */
  drive: { in: number; out: number };
  /** Where the ground of the bays ends in the north: rows are marked up to there. */
  top: number;
  bays: Bay[];
}

/**
 * The rows of the lot open for cars when this many floors are: the lot grows
 * with the building, from the south. The drive-in is open from the start.
 */
export const rowsOpen = (building: Building, level: number): number =>
  level <= 0 ? 0 : Math.min(LOT_ROWS, DRIVE_ROWS + Math.ceil(((LOT_ROWS - DRIVE_ROWS) * level) / building.floors));

/** How many bays of the van zone are open when this many floors are: the zone grows in the same steps, and is all open with the top floor. */
export const vansOpen = (building: Building, level: number): number => Math.min(VANS[building.id], Math.ceil((VANS[building.id] * Math.max(level, 0)) / building.floors));

/** The lot of a building: all of it, with every bay it will have. */
export function lotOf(building: Building = BUILDINGS.standard): Lot {
  const block = lotBlock(building);
  const [x0, x1] = [block.x + INSET, block.x + block.w - INSET];
  const [z0, z1] = [block.z + INSET, block.z + block.d - INSET];
  const south = z1 - WALKWAY;
  const rowZ = (row: number) => south - PITCH * (row + 0.5);
  const aisle = { x0: x0 + DEPTH.car, x1: x1 - DEPTH.van, north: 0, south: 0 };
  const middle = (aisle.x0 + aisle.x1) / 2;
  aisle.north = middle + 0.47;
  aisle.south = middle - 0.47;
  const vans = VANS[building.id];
  const bays: Bay[] = [];
  for (let row = 0; row < LOT_ROWS; row++) {
    const z = rowZ(row);
    if (row >= DRIVE_ROWS) bays.push({ id: bays.length, kind: 'car', side: 'west', row, x: x0 + DEPTH.car / 2, z, angle: Math.PI, door: [aisle.x0 + 0.1, z] });
    const kind: BayKind = row < vans ? 'van' : 'car';
    bays.push({ id: bays.length, kind, side: 'east', row, x: x1 - DEPTH[kind] / 2, z, angle: 0, door: [aisle.x1 - 0.1, z] });
  }
  return {
    x0,
    x1,
    z0,
    z1,
    street: block.x - CITY.streetWidth / 2,
    walkZ: z1 - 0.1,
    aisle,
    drive: { in: rowZ(0), out: rowZ(1) },
    top: rowZ(LOT_ROWS - 1) - PITCH / 2,
    bays,
  };
}

/** The bays that are open when `level` floors are: the rows from the south that the floors open so far give, and the first bays of the van zone. */
export const openBays = (building: Building, level: number): Bay[] => {
  const [rows, vans] = [rowsOpen(building, level), vansOpen(building, level)];
  return lotOf(building).bays.filter((bay) => bay.row < (bay.kind === 'van' ? vans : rows));
};

/** The bays for cars that are open. */
export const carBays = (building: Building, level: number): Bay[] => openBays(building, level).filter((bay) => bay.kind === 'car');

/** The van zone: the bays for vans that are open on a floor, in the order vans fill them. */
export const vanBays = (building: Building = BUILDINGS.standard, level: number = building.floors): Bay[] => openBays(building, level).filter((bay) => bay.kind === 'van');

/**
 * Which van stands in which bay: the vans in the order they are given, one to
 * a bay from the south. Whatever does not fit has no bay, and is parked out of
 * view; to fit more, the lot has to grow with the building. For #20 and #184:
 * the vans of the company are a plain list here, with no state of their own.
 */
export function parkedVans<T extends { id: string }>(vans: readonly T[], building: Building = BUILDINGS.standard, level: number = building.floors): { van: T; bay: Bay }[] {
  const bays = vanBays(building, level);
  return vans.flatMap((van, n) => (bays[n] ? [{ van, bay: bays[n]! }] : []));
}

/** The lot, whether a point is on its ground. */
export const onLot = (x: number, z: number, building: Building = BUILDINGS.standard): boolean => {
  const lot = lotOf(building);
  return x >= lot.x0 - 0.01 && x <= lot.x1 + 0.01 && z >= lot.z0 - 0.01 && z <= lot.z1 + 0.01;
};

/**
 * The way a car drives from the street into a bay, as points: in from the
 * lane at the drive-in, along the aisle, and into the bay. `from` is where it
 * leaves the lane.
 */
export function wayIn(lot: Lot, bay: Bay, from: [number, number]): [number, number][] {
  const path: [number, number][] = [from, [lot.aisle.north, lot.drive.in]];
  if (Math.abs(bay.z - lot.drive.in) > 0.01) path.push([lot.aisle.north, bay.z]);
  path.push([bay.x, bay.z]);
  return path;
}

/**
 * The way a car drives out of a bay and into the street's lane: backs out into
 * the aisle, along it to the drive-out, and out to `to`, where it joins the lane.
 */
export function wayOut(lot: Lot, bay: Bay, to: [number, number]): [number, number][] {
  const path: [number, number][] = [[bay.x, bay.z], [lot.aisle.south, bay.z]];
  if (Math.abs(bay.z - lot.drive.out) > 0.01) path.push([lot.aisle.south, lot.drive.out]);
  path.push(to);
  return path;
}

/** The way someone walks from a car to the corner of the lot, where the street is crossed. */
export function walkFrom(lot: Lot, bay: Bay): [number, number][] {
  const [x, z] = bay.door;
  return [[x, z], [x, lot.walkZ], [lot.x0 + 0.1, lot.walkZ]];
}
