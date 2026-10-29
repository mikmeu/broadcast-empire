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

// (0.20.0: vehicles are drawn twice as large (assets.ts), and the lots of the drawn towns are the size they were drawn at. A bay
// is parallel to its lane, not across it: a car is 3 tiles long and 1.6 wide, so a bay is 3.2 long and 1.8 deep, and a lane 1.9
// wide. That fits the shallowest lot (4 tiles deep) with one lane; the lots hold fewer bays than they did.)

/** How far in from the kerb the lot's ground is used. */
const INSET = 0.15;
/** How far a bay is from the next along its lane, by what it holds, and in a lot that is a block of rows, for both. */
const PITCH = { car: 3.2, van: 4 } as const;
export const ROW_PITCH = 4;
/** How deep a car bay is and how deep a van bay is (across its lane). */
const DEPTH = { car: 1.8, van: 1.9 } as const;
/** How wide a lane is, and how far the middle of a lane is from the middle of an aisle of two. */
export const LANE_WIDTH = 1.9;
const LANE = LANE_WIDTH / 2;
/** The south end of the lot is a pavement for walking, this deep. */
export const WALKWAY = 1.5;
/** The first rows of a block's bays are the drive-in. */
const DRIVE_ROWS = 1;
/** How many van bays a lot has at most, once every floor is open: the van zone is the east column from the south, or the east end of the south strip. */
const VANS = { standard: 6, long: 8, courtyard: 6, valley: 6, beach: 6, fields: 8, hills: 8 } as const;
/** In a lot with a loop (the courtyard of the U), the cars turn at the west end of the strips, this far from it. */
const LOOP_END = 2.4;
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
  /** The way a vehicle points that stands in it: the way the lane beside it runs, as an angle around the vertical (0 points along +x). */
  angle: number;
  /** How far the bay is from the next along its lane, and how deep it is across it. */
  pitch: number;
  depth: number;
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
  /** The middle of the lane that goes west into the strip and of the one that comes back east, as z. In a loop the strip has one lane, and both are it. */
  in: number;
  out: number;
  /** Whether the strip has one lane only: a loop (see `Lot.loop`). */
  loop: boolean;
}

/** The ground of a lot: its edges and where its lanes run. */
export interface Lot {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /**
   * Along which axis the street it opens onto runs (#217): 'z' for a street north to south, as in a grid and in a
   * courtyard, 'x' for one east to west, north or south of the lot. Everything below that reads "z" or "north" is
   * for 'z'; for 'x' the lot is that one turned a quarter round (see `lotAlongX`): what is a position along z there
   * is a position along x here, and the other way round.
   */
  along: 'x' | 'z';
  /** The street it opens onto: the middle line of the street, along z (at its x), or along x (at its z). */
  street: number;
  /**
   * Which side of the street the lot is on: 1 where the other axis is larger (east of a street along z, south of one
   * along x), -1 where it is smaller. The lane beside it runs north (-z) in the first case and south in the second
   * for a street along z; east (+x) and west for a street along x.
   */
  side: 1 | -1;
  /** The line along which people walk on the south edge (on the west edge for a street along x: its x). */
  walkZ: number;
  /** The aisle: its edges, and the middle of its lane north and the lane south. In a courtyard it is the first strip's, with the middle of its two lanes as z. */
  aisle: { x0: number; x1: number; north: number; south: number };
  /** The drive-in: the middle of the lane that goes in and of the one that goes out, as z (as x for a street along x). */
  drive: { in: number; out: number };
  /** The ways in from the street: one in a block, one for each strip in a courtyard. Positions along the street, so z, or x for a street along x. */
  gates: { in: number; out: number }[];
  /** The strips of a courtyard; none in a block. */
  strips: Strip[];
  /** Where the ground of the bays ends in the north: rows are marked up to there. */
  top: number;
  /** How many rows of bays it has, and how many bays of the van zone. */
  rows: number;
  vans: number;
  /**
   * A one-way loop (the courtyard of the U, whose strips are too shallow for a lane each way): in along the first strip,
   * round the west end of the green, and out along the second. `x` is the middle of the way across, `z0` and `z1` the middles of the two lanes.
   */
  loop: { x: number; z0: number; z1: number } | null;
  bays: Bay[];
}

/** Whether the lot is the courtyard of a U (a town laid out from a drawing with one), and not a block that opens onto a street: a town laid out by its roads has a block (#218). */
export const inCourtyard = (layout: Layout): boolean => (layout.map?.courtyard.parking.length ?? 0) > 0;

/**
 * The rows of the lot open for cars when this many floors are: the lot grows
 * with the building, from the south (from the street, in a courtyard, in both
 * strips at once). The drive-in is open from the start.
 */
export const rowsOpen = (building: Building, level: number, layout: Layout = CAPITAL): number => {
  if (level <= 0) return 0;
  const rows = lotOf(building, layout).rows;
  if (inCourtyard(layout)) return Math.min(rows, Math.ceil((rows * level) / building.floors));
  return Math.min(rows, DRIVE_ROWS + Math.ceil(((rows - DRIVE_ROWS) * level) / building.floors));
};

/** How many bays of the van zone are open when this many floors are: the zone grows in the same steps, and is all open with the top floor. */
export const vansOpen = (building: Building, level: number, layout: Layout = CAPITAL): number => {
  const vans = lotOf(building, layout).vans;
  return Math.min(vans, Math.ceil((vans * Math.max(level, 0)) / building.floors));
};

const lots = new WeakMap<Layout, Map<string, Lot>>();

/** The lot of a building: all of it, with every bay it will have. */
export function lotOf(building: Building = BUILDINGS.standard, layout: Layout = CAPITAL): Lot {
  let byBuilding = lots.get(layout);
  if (!byBuilding) lots.set(layout, (byBuilding = new Map()));
  let lot = byBuilding.get(building.id);
  if (!lot) {
    if (inCourtyard(layout)) lot = courtyardLot(building, layout);
    else {
      const { block, street, along, side } = layout.lot(building);
      lot = along === 'x' ? lotAlongX(building, block, street, side ?? 1) : blockLot(building, block, street);
    }
    byBuilding.set(building.id, lot);
  }
  return lot;
}

/**
 * The lot of a block that opens onto a street along x (#217), north or south of it: the lot of a block laid out as
 * for a street along z, in a frame of its own with its street on the west, and turned a quarter round onto the
 * ground, so that the street is the south side of the lot (`side` 1) or its north side (-1) and the lane beside the
 * lot runs east (side 1) or west.
 */
function lotAlongX(building: Building, block: Rect, street: number, side: 1 | -1): Lot {
  // The frame: x runs away from the street (it is z on the ground), z runs along it, from the lot's east end (x on the ground).
  const frame = blockLot(building, { x: 0, z: 0, w: block.d, d: block.w }, side > 0 ? street - block.z : block.z + block.d - street);
  const ax = (lz: number) => (side > 0 ? block.x + block.w - lz : block.x + lz);
  const az = (lx: number) => (side > 0 ? block.z + lx : block.z + block.d - lx);
  const span = (a: number, b: number): [number, number] => [Math.min(a, b), Math.max(a, b)];
  const turn = (angle: number) => angle + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
  const point = ([x, z]: [number, number]): [number, number] => [ax(z), az(x)];
  const [x0, x1] = span(ax(frame.z0), ax(frame.z1));
  const [z0, z1] = span(az(frame.x0), az(frame.x1));
  const [a0, a1] = span(az(frame.aisle.x0), az(frame.aisle.x1));
  return {
    x0,
    x1,
    z0,
    z1,
    along: 'x',
    street,
    side,
    walkZ: ax(frame.walkZ),
    aisle: { x0: a0, x1: a1, north: az(frame.aisle.north), south: az(frame.aisle.south) },
    drive: { in: ax(frame.drive.in), out: ax(frame.drive.out) },
    gates: frame.gates.map((gate) => ({ in: ax(gate.in), out: ax(gate.out) })),
    strips: [],
    top: ax(frame.top),
    rows: frame.rows,
    vans: frame.vans,
    loop: null,
    bays: frame.bays.map((bay) => {
      const [x, z] = point([bay.x, bay.z]);
      return { ...bay, x, z, angle: turn(bay.angle), door: point(bay.door), approach: bay.approach.map(point), leave: bay.leave.map(point) };
    }),
  };
}

const frames = new WeakMap<Layout, { layout: Layout; position: [x: number, z: number]; turn: number }>();

/**
 * The lot of a block that opens onto a street along x, in the frame it is laid out in (see `lotAlongX`): a town with that one lot,
 * for the code that draws a lot as a block, and where on the ground that frame stands (its origin) and how it is turned round the vertical.
 */
export function lotFrame(layout: Layout, building: Building = BUILDINGS.standard): { layout: Layout; position: [x: number, z: number]; turn: number } {
  let frame = frames.get(layout);
  if (!frame) {
    const { block, street, side = 1 } = layout.lot(building);
    const { map: _map, ...rest } = layout;
    frame = {
      layout: { ...rest, lot: () => ({ block: { x: 0, z: 0, w: block.d, d: block.w }, street: side > 0 ? street - block.z : block.z + block.d - street }) },
      position: side > 0 ? [block.x + block.w, block.z] : [block.x, block.z + block.d],
      turn: side > 0 ? -Math.PI / 2 : Math.PI / 2,
    };
    frames.set(layout, frame);
  }
  return frame;
}

function blockLot(building: Building, block: Rect, street: number): Lot {
  const [x0, x1] = [block.x + INSET, block.x + block.w - INSET];
  const [z0, z1] = [block.z + INSET, block.z + block.d - INSET];
  const south = z1 - WALKWAY;
  const rows = Math.max(1, Math.floor((z1 - z0 - WALKWAY) / ROW_PITCH));
  const rowZ = (row: number) => south - ROW_PITCH * (row + 0.5);
  // The two columns of bays and the aisle between them stand together in the middle of the ground.
  const gx = x0 + Math.max(0, (x1 - x0 - (DEPTH.car + 2 * LANE_WIDTH + DEPTH.van)) / 2);
  const aisle = { x0: gx + DEPTH.car, x1: gx + DEPTH.car + 2 * LANE_WIDTH, north: 0, south: 0 };
  const middle = (aisle.x0 + aisle.x1) / 2;
  aisle.north = middle + LANE;
  aisle.south = middle - LANE;
  // The drive-in and the drive-out are the two lanes of the first row (the south lane in, the north lane out).
  const drive = { in: rowZ(0) + LANE, out: rowZ(0) - LANE };
  const vans = Math.min(VANS[building.id], rows);
  const bays: Bay[] = [];
  // From the lane at the drive-in along the aisle to the bay, and from the bay along it to the drive-out.
  const approach = (z: number): [number, number][] => [[aisle.north, drive.in], ...(Math.abs(z - drive.in) > 0.01 ? [[aisle.north, z] as [number, number]] : [])];
  const leave = (z: number): [number, number][] => [[aisle.south, z], ...(Math.abs(z - drive.out) > 0.01 ? [[aisle.south, drive.out] as [number, number]] : [])];
  for (let row = 0; row < rows; row++) {
    const z = rowZ(row);
    // (The west column faces the way its lane runs, south; the east column north.)
    if (row >= DRIVE_ROWS) bays.push({ id: bays.length, kind: 'car', side: 'west', row, x: gx + DEPTH.car / 2, z, angle: -Math.PI / 2, pitch: ROW_PITCH, depth: DEPTH.car, door: [aisle.x0 + 0.1, z], gate: 0, approach: approach(z), leave: leave(z) });
    const kind: BayKind = row < vans ? 'van' : 'car';
    bays.push({ id: bays.length, kind, side: 'east', row, x: aisle.x1 + DEPTH[kind] / 2, z, angle: Math.PI / 2, pitch: ROW_PITCH, depth: DEPTH[kind], door: [aisle.x1 - 0.1, z], gate: 0, approach: approach(z), leave: leave(z) });
  }
  return {
    x0,
    x1,
    z0,
    z1,
    along: 'z',
    street,
    side: 1,
    walkZ: z1 - 0.1,
    aisle,
    drive,
    gates: [drive],
    strips: [],
    top: rowZ(rows - 1) - ROW_PITCH / 2,
    rows,
    vans,
    loop: null,
    bays,
  };
}

/** The lot in the courtyard of the U: a row of bays along the outer side of each strip, a lane each way beside it, and a way in and out for each strip. */
function courtyardLot(building: Building, layout: Layout): Lot {
  const { block, street } = layout.lot(building);
  const { parking, green } = layout.map!.courtyard;
  const bays: Bay[] = [];
  const sorted = [...parking].sort((a, b) => a.z - b.z);
  const isNorth = (r: Rect) => green.every((g) => r.z + r.d <= g.z + 0.01);
  // Strips too shallow for a lane each way beside the bays (the courtyard of the U) are a loop: in along the first, round the west end of the green, out along the second.
  const shallow = (r: Rect) => r.d - INSET - DEPTH.car - 2 * LANE_WIDTH < 0;
  const loop = sorted.length === 2 && sorted.every(shallow);
  const strips: Strip[] = sorted.map((r: Rect): Strip => {
    const north = isNorth(r);
    // The lanes lie beside the bays, on the side of the green. Driving west the right hand is the north side.
    const edge = north ? r.z + INSET + DEPTH.car : r.z + r.d - INSET - DEPTH.van;
    const [lane0, lane1] = north ? [edge + LANE, edge + 3 * LANE] : [edge - 3 * LANE, edge - LANE];
    const one = north ? lane0 : lane1;
    return {
      side: north ? 'north' : 'south',
      nose: north ? -1 : 1,
      x0: r.x + INSET,
      x1: r.x + r.w - INSET,
      z0: r.z,
      z1: r.z + r.d,
      in: loop ? one : lane0,
      out: loop ? one : lane1,
      loop,
    };
  });
  // Vans stand in the south strip (the van zone is the east end of it), as many as there is room for; the rest of it and the other strips hold cars.
  const placesIn = (strip: Strip, vans: number) => {
    const places: { kind: BayKind; x: number }[] = [];
    const end = strip.x0 + (loop ? LOOP_END : 0);
    let at = strip.x1;
    for (;;) {
      const kind: BayKind = strip.side === 'south' && places.length < vans ? 'van' : 'car';
      if (at - PITCH[kind] < end - 0.01) break;
      places.push({ kind, x: at - PITCH[kind] / 2 });
      at -= PITCH[kind];
    }
    return places;
  };
  const south = strips.find((s) => s.side === 'south');
  const vans = south ? Math.min(VANS[building.id], placesIn(south, VANS[building.id]).filter((p) => p.kind === 'van').length) : 0;
  let rows = 0;
  const wayAcross = strips[0]!.x0 + LOOP_END / 2;
  const laneIn = strips[0]!.in;
  const laneOut = strips[strips.length - 1]!.out;
  strips.forEach((strip, n) => {
    const gate = loop ? 0 : n;
    const places = placesIn(strip, vans);
    places.forEach(({ kind, x }, place) => {
      const depth = DEPTH[kind];
      const z = strip.nose < 0 ? strip.z0 + INSET + depth / 2 : strip.z1 - INSET - depth / 2;
      const edge = z - (strip.nose * depth) / 2;
      const row = strip.side === 'south' && kind === 'car' ? place - vans : place;
      rows = Math.max(rows, kind === 'car' ? row + 1 : 0);
      // The north strip's lane runs west and the south strip's east, so the cars point that way; a loop goes the whole way round.
      const west = strip.side === 'north';
      bays.push({
        id: bays.length,
        kind,
        side: strip.side,
        row,
        x,
        z,
        angle: west ? Math.PI : 0,
        pitch: PITCH[kind],
        depth,
        door: [x, edge - strip.nose * 0.1],
        gate,
        // (In a loop a car for the south strip drives the whole way round first, and one that leaves a bay of the north strip too.)
        approach: loop && !west ? [[wayAcross, laneIn], [wayAcross, laneOut], [x, laneOut]] : [[x, strip.in]],
        leave: loop && west ? [[x, laneIn], [wayAcross, laneIn], [wayAcross, laneOut]] : [[x, strip.out]],
      });
    });
  });
  const first = strips[0]!;
  return {
    x0: block.x + INSET,
    x1: block.x + block.w - INSET,
    z0: block.z + INSET,
    z1: block.z + block.d - INSET,
    along: 'z',
    street,
    side: -1,
    walkZ: block.z + block.d / 2,
    aisle: { x0: first.x0, x1: first.x1, north: first.in, south: first.out },
    drive: { in: laneIn, out: laneOut },
    gates: loop ? [{ in: laneIn, out: laneOut }] : strips.map((strip) => ({ in: strip.in, out: strip.out })),
    strips,
    top: first.z0,
    rows,
    vans,
    loop: loop ? { x: wayAcross, z0: laneIn, z1: laneOut } : null,
    bays,
  };
}

/** The bays that are open when `level` floors are: the rows from the south that the floors open so far give, and the first bays of the van zone. */
export const openBays = (building: Building, level: number, layout: Layout = CAPITAL): Bay[] => {
  const [rows, vans] = [rowsOpen(building, level, layout), vansOpen(building, level, layout)];
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
 * The way someone walks from a car to the corner of the lot, where the street is crossed; in a lot on a street along x,
 * along the aisle to the lot's west end; in a courtyard,
 * across the green's edge to the west end of the lot, from where the way goes on to the door.
 */
export function walkFrom(lot: Lot, bay: Bay): [number, number][] {
  const [x, z] = bay.door;
  // A lot on a street along x (#218): along the aisle to its west end, away from the street's end, where the way goes on to the door.
  if (lot.along === 'x') return [[x, z], [lot.x0 - 0.3, z]];
  if (lot.strips.length > 0) {
    // Out of the aisle onto the edge of the green nearest the car, and along it, clear of the fountain.
    const strip = lot.strips.find((s) => s.side === bay.side)!;
    const edge = strip.nose < 0 ? strip.z1 + GREEN_EDGE : strip.z0 - GREEN_EDGE;
    const turn = lot.x0 + TURN_BEFORE_DOOR;
    return [[x, z], [x, edge], ...(x > turn ? [[turn, edge] as [number, number]] : [])];
  }
  return [[x, z], [x, lot.walkZ], [lot.x0 + 0.1, lot.walkZ]];
}
