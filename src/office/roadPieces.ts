// Which pieces of Kenney's City Kit (Roads) lay a town's streets (#285): a pure plan, with no three.js, as `arrowsOf` is. Drawing only: nothing
// here steers a vehicle or a walker, who go by the cells and the lanes (Decisions: the street's looks steer nothing).

import { ROADS } from './assets';
import type { Layout, Rect } from './townLayout';

export type PieceKind = keyof typeof ROADS.pieces;

/** One piece laid on the ground: its middle, how many quarter turns it is turned (to the left, seen from above) and how much it is stretched, along its own x and across it. */
export interface RoadPiece {
  kind: PieceKind;
  x: number;
  z: number;
  turn: number;
  /** The piece's own x is its length: a straight is stretched to fit between two junctions, the others are as long as they are wide. */
  length: number;
  width: number;
}

export interface RoadPlan {
  pieces: RoadPiece[];
  /** What the kit cannot cover: the plain surface under the pieces shows there (and the dashes are painted on it). */
  bare: Rect[];
}

type Direction = readonly [dx: number, dz: number];
const EAST: Direction = [1, 0];
const WEST: Direction = [-1, 0];
const SOUTH: Direction = [0, 1];
const NORTH: Direction = [0, -1];

/** Where each piece is open, as it lies in the kit's file. */
const OPEN: Record<PieceKind, readonly Direction[]> = {
  straight: [WEST, EAST],
  cross: [WEST, EAST, SOUTH, NORTH],
  tee: [WEST, EAST, SOUTH],
  bend: [WEST, SOUTH],
  end: [EAST],
};

/** A direction after `turn` quarter turns: the piece turned by `turn` about y turns east into north. */
const turned = ([dx, dz]: Direction, turn: number): Direction => {
  const t = ((turn % 4) + 4) % 4;
  return t === 0 ? [dx, dz] : t === 1 ? [dz, -dx] : t === 2 ? [-dx, -dz] : [-dz, dx];
};

/** How many quarter turns bring the piece's openings to exactly these, or null if they cannot be. */
export function turnFor(kind: PieceKind, open: readonly Direction[]): number | null {
  const key = (list: readonly Direction[]) => list.map(([dx, dz]) => `${dx},${dz}`).sort().join(' ');
  const wanted = key(open);
  for (let turn = 0; turn < 4; turn++) if (key(OPEN[kind].map((d) => turned(d, turn))) === wanted) return turn;
  return null;
}

interface Road {
  along: 'x' | 'z';
  /** The middle line. */
  at: number;
  /** The two ends, along its axis. */
  lo: number;
  hi: number;
  width: number;
}

const EPS = 0.01;

/** The shortest stretch a straight piece is stretched to: shorter stretches are left bare. */
export const SHORTEST = 2;

const roadOf = (r: Rect): Road => (r.w >= r.d ? { along: 'x', at: r.z + r.d / 2, lo: r.x, hi: r.x + r.w, width: r.d } : { along: 'z', at: r.x + r.w / 2, lo: r.z, hi: r.z + r.d, width: r.w });
const rectOf = (along: 'x' | 'z', at: number, lo: number, hi: number, width: number): Rect => (along === 'x' ? { x: lo, z: at - width / 2, w: hi - lo, d: width } : { x: at - width / 2, z: lo, w: width, d: hi - lo });

/**
 * The pieces that lay the streets of a layout, and what is left bare.
 *  - Where two streets meet over a whole square (the street's width each way) there is a junction: a crossroad, a T or a corner by the arms it has.
 *  - Between junctions the street is laid with straights, as many as the stretch is long over the street's width, stretched to fit it exactly.
 *  - A street that stops inside the drawing ends with a dead end; one that reaches the edge runs on out of sight (it is drawn so long in the layout).
 *  - Bare: the squares that overlap another junction or that no piece fits, the stretches under `SHORTEST`, and every street not as wide as the layout's.
 * A layout with no map (the grid of blocks) has nothing; whatever a draft holds, this returns a plan.
 */
export function roadPiecesOf(layout: Layout): RoadPlan {
  try {
    return planOf(layout);
  } catch {
    // (A draft from the editor is anything: the streets are then all bare, as they were.)
    return { pieces: [], bare: layout.map?.carriageways ?? [] };
  }
}

function planOf(layout: Layout): RoadPlan {
  const plan: RoadPlan = { pieces: [], bare: [] };
  const rects = layout.map?.carriageways ?? [];
  const w = layout.streetWidth;
  if (!(w > 0) || rects.length === 0) return plan;
  const roads = rects.filter((r) => Number.isFinite(r.x + r.z + r.w + r.d) && r.w > 0 && r.d > 0).map(roadOf);
  // The street is drawn as wide as the asphalt of the kit is of its tile.
  const size = w / ROADS.asphalt;
  const kit = roads.filter((road) => Math.abs(road.width - w) < EPS);
  for (const road of roads) if (!kit.includes(road)) plan.bare.push(rectOf(road.along, road.at, road.lo, road.hi, road.width));

  // The junctions: where a street along x and one along z cross over a whole square.
  const junctions: { x: number; z: number }[] = [];
  for (const a of kit.filter((r) => r.along === 'x')) {
    for (const b of kit.filter((r) => r.along === 'z')) {
      if (b.at < a.lo + w / 2 - EPS || b.at > a.hi - w / 2 + EPS || a.at < b.lo + w / 2 - EPS || a.at > b.hi - w / 2 + EPS) continue;
      if (!junctions.some((j) => Math.abs(j.x - b.at) < EPS && Math.abs(j.z - a.at) < EPS)) junctions.push({ x: b.at, z: a.at });
    }
  }
  junctions.sort((p, q) => p.z - q.z || p.x - q.x);
  // A junction that would overlap an earlier one (two streets a tile or two apart that both cross a third) is left bare.
  const kept: typeof junctions = [];
  const square = (x: number, z: number): Rect => ({ x: x - w / 2, z: z - w / 2, w, d: w });
  for (const j of junctions) {
    if (kept.some((k) => Math.abs(k.x - j.x) < size - EPS && Math.abs(k.z - j.z) < size - EPS)) plan.bare.push(square(j.x, j.z));
    else kept.push(j);
  }
  // Where a street goes on from the junction: it reaches past the square, to where the arm of the piece ends.
  const reach = w / 2 + 0.25;
  const armsOf = (j: { x: number; z: number }): Direction[] => {
    const arms: Direction[] = [];
    for (const road of kit) {
      const [across, along] = road.along === 'x' ? [j.z, j.x] : [j.x, j.z];
      if (Math.abs(road.at - across) > EPS) continue;
      const axis = road.along === 'x' ? ([WEST, EAST] as const) : ([NORTH, SOUTH] as const);
      if (road.lo <= along - reach) arms.push(axis[0]);
      if (road.hi >= along + reach) arms.push(axis[1]);
    }
    return arms.filter((d, n) => arms.findIndex((e) => e[0] === d[0] && e[1] === d[1]) === n);
  };
  const placed: typeof junctions = [];
  for (const j of kept) {
    const arms = armsOf(j);
    const kind: PieceKind | null = arms.length === 4 ? 'cross' : arms.length === 3 ? 'tee' : arms.length === 2 && arms[0]![0] * arms[1]![0] + arms[0]![1] * arms[1]![1] === 0 ? 'bend' : null;
    const turn = kind ? turnFor(kind, arms) : null;
    if (kind === null || turn === null) plan.bare.push(square(j.x, j.z));
    else {
      plan.pieces.push({ kind, x: j.x, z: j.z, turn, length: size, width: size });
      placed.push(j);
    }
  }

  // Each street, between the junctions and the ends that stand on it.
  for (const road of kit) {
    const turn = road.along === 'x' ? 0 : 1;
    const spot = (along: number) => (road.along === 'x' ? { x: along, z: road.at } : { x: road.at, z: along });
    // What stands on the street: [from, to] along it. A junction takes a piece's length, centred on it.
    const taken: [number, number][] = placed
      .filter((j) => Math.abs((road.along === 'x' ? j.z : j.x) - road.at) < EPS)
      .map((j) => (road.along === 'x' ? j.x : j.z))
      .map((m): [number, number] => [m - size / 2, m + size / 2]);
    // A street ends in a junction if one stands within its last width; else it is open (it runs on out of the drawing) or it ends in a dead end.
    for (const [end, inward] of [[road.lo, 1], [road.hi, -1]] as const) {
      const closed = taken.some(([from, to]) => (inward === 1 ? from <= end + w / 2 + EPS : to >= end - w / 2 - EPS));
      if (closed || !isDeadEnd(layout, road, end)) continue;
      // The kerb of the piece's closed end lies beyond the street's end, and its open end faces down the street.
      const middle = end + inward * (size / 2 - ROADS.kerb * size);
      const t = turnFor('end', [road.along === 'x' ? (inward === 1 ? EAST : WEST) : inward === 1 ? SOUTH : NORTH]);
      if (t === null) continue;
      plan.pieces.push({ kind: 'end', ...spot(middle), turn: t, length: size, width: size });
      taken.push([middle - size / 2, middle + size / 2]);
    }
    // What is left of the street between them: straights of about its width each, or bare where too short.
    taken.sort((p, q) => p[0] - q[0]);
    let at = road.lo;
    const free: [number, number][] = [];
    for (const [from, to] of taken) {
      if (from > at) free.push([at, Math.min(from, road.hi)]);
      at = Math.max(at, to);
    }
    if (at < road.hi) free.push([at, road.hi]);
    for (const [from, to] of free) {
      const length = to - from;
      if (length < EPS) continue;
      if (length < SHORTEST) {
        plan.bare.push(rectOf(road.along, road.at, from, to, w));
        continue;
      }
      const count = Math.max(1, Math.round(length / w));
      for (let n = 0; n < count; n++) plan.pieces.push({ kind: 'straight', ...spot(from + ((n + 0.5) * length) / count), turn, length: length / count, width: size });
    }
  }
  return plan;
}

/** Whether an end of a street, not met by any junction, is a dead end: not one that runs out of the drawing, past the layout's edge. */
function isDeadEnd(layout: Layout, road: Road, end: number): boolean {
  const edge = layout.edge;
  if (!edge) return true;
  const [low, high] = road.along === 'x' ? [edge.x, edge.x + edge.w] : [edge.z, edge.z + edge.d];
  return end > low + EPS && end < high - EPS;
}
