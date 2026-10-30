// How people get from one place on a floor to another. Pure: it reads the
// rooms and the furniture from the game state and finds a way across the
// floor, through the doors and around what stands in the way.

import { coreWalls, wallsOf, westOf, widthOf, type Wall } from '../config/office';
import { buildingOf, floorPlan, footprint } from '../sim/office';
import type { GameState } from '../sim/state';

/**
 * People walk over a fine grid of points, a quarter of a tile apart. A point
 * too close to a wall can't be stood on; the middle of a doorway can. A point
 * in or right beside a piece of furniture can be crossed, but it counts as a
 * long way, so a route only goes through furniture when there is no way
 * around it: a desk in front of a door slows nobody down for good.
 */
export const ROUTES = {
  /** The distance between two points of the grid, in tiles. */
  step: 0.25,
  /** How far people stay from a wall, in tiles. With doors and corridors a tile wide that leaves the line through their middle. */
  clearance: 0.3,
  /** How close to a piece of furniture counts as brushing past it, in tiles. */
  beside: 0.25,
  /** How many times longer a step through or past furniture counts than a step over free floor. */
  through: 6,
  /** How far from where someone stands the grid is looked at for a point to start from, or to end at. */
  reach: 0.75,
};

type Point = { x: number; z: number };

/** The floors of the game as people can walk them: for every point of the grid whether it is closed, and whether furniture is in the way there. */
export interface FloorGrid {
  cols: number;
  rows: number;
  /** The x of the first column: the west face of the building. */
  west: number;
  /** Too close to a wall, or outside. */
  closed: Uint8Array;
  /** In or beside a piece of furniture. */
  cluttered: Uint8Array;
  walls: Wall[];
}

const xOf = (grid: Pick<FloorGrid, 'west'>, i: number) => grid.west + i * ROUTES.step;
const zOf = (j: number) => j * ROUTES.step;
const colOf = (grid: Pick<FloorGrid, 'west'>, x: number) => Math.round((x - grid.west) / ROUTES.step);
const rowOf = (z: number) => Math.round(z / ROUTES.step);

/** Every wall on a floor: around the building and its courtyard, inside the block at its head, and around the rooms (rented or not). The hall has none of its own. */
export function wallsOn(state: GameState, floor: number): Wall[] {
  const building = buildingOf(state);
  const outside = { x: westOf(building), y: 0, w: widthOf(building), h: building.depth, parts: [...building.wings], door: { x: NaN, z: NaN } };
  const rooms = floorPlan(state).filter((r) => r.floor === floor && !r.fixed);
  return [...wallsOf(outside), ...coreWalls(floor, building), ...rooms.flatMap(wallsOf)];
}

/** The pieces of furniture on a floor, as rectangles on the floor. */
function furnitureOn(state: GameState, floor: number): { x: number; z: number; w: number; h: number }[] {
  return state.rooms
    .filter((r) => r.floor === floor)
    .flatMap((room) => room.furniture.map((f) => ({ x: room.x + f.x, z: room.y + f.y, ...footprint(f.type, f.turn) })));
}

/** What a floor's grid depends on, as a word: the same for as long as no wall and no piece of furniture moves. */
function signature(state: GameState, floor: number): string {
  const rooms = floorPlan(state).filter((r) => r.floor === floor && !r.fixed);
  const walls = rooms.map((r) => `${r.x},${r.y},${r.w},${r.h},${r.door.x},${r.door.z}${r.parts ? `,${r.parts.map((p) => `${p.x}.${p.y}.${p.w}.${p.h}`).join('+')}` : ''}`).join(';');
  const pieces = furnitureOn(state, floor).map((f) => `${f.x},${f.z},${f.w},${f.h}`).join(';');
  return `${state.building}|${floor}|${walls}|${pieces}`;
}

const grids = new Map<string, FloorGrid>();

/** The grid of a floor. It is worked out once for a layout of walls and furniture and kept while the days go by. */
export function floorGrid(state: GameState, floor: number): FloorGrid {
  const key = signature(state, floor);
  const known = grids.get(key);
  if (known) return known;
  // A handful is plenty: a floor's layout only changes when the player builds.
  if (grids.size >= 12) grids.clear();

  const building = buildingOf(state);
  const west = westOf(building);
  const rows = Math.round(building.depth / ROUTES.step) + 1;
  const cols = Math.round(widthOf(building) / ROUTES.step) + 1;
  const closed = new Uint8Array(cols * rows);
  const cluttered = new Uint8Array(cols * rows);
  const walls = wallsOn(state, floor);
  /** Marks every point within `margin` of a rectangle (a wall is a rectangle without width). */
  const mark = (into: Uint8Array, x1: number, z1: number, x2: number, z2: number, margin: number) => {
    for (let j = Math.max(0, rowOf(z1 - margin) - 1); j <= Math.min(rows - 1, rowOf(z2 + margin) + 1); j++) {
      for (let i = Math.max(0, colOf({ west }, x1 - margin) - 1); i <= Math.min(cols - 1, colOf({ west }, x2 + margin) + 1); i++) {
        const dx = Math.max(x1 - xOf({ west }, i), 0, xOf({ west }, i) - x2);
        const dz = Math.max(z1 - zOf(j), 0, zOf(j) - z2);
        if (Math.hypot(dx, dz) < margin + 1e-9) into[j * cols + i] = 1;
      }
    }
  };
  for (const [x1, z1, x2, z2] of walls) mark(closed, x1, z1, x2, z2, ROUTES.clearance);
  for (const f of furnitureOn(state, floor)) mark(cluttered, f.x, f.z, f.x + f.w, f.z + f.h, ROUTES.beside);

  const grid = { cols, rows, west, closed, cluttered, walls };
  grids.set(key, grid);
  return grid;
}

/**
 * Whether a point is open floor: far enough from every wall, and clear of
 * furniture. Beside a doorway, in a narrow corridor or next to a desk it is
 * not, so that is where nobody steps aside (aside.ts).
 */
export function isOpen(grid: FloorGrid, x: number, z: number): boolean {
  const [i, j] = [colOf(grid, x), rowOf(z)];
  if (i < 0 || j < 0 || i >= grid.cols || j >= grid.rows) return false;
  return !grid.closed[j * grid.cols + i] && !grid.cluttered[j * grid.cols + i];
}

/** Whether the straight line between two points goes through a wall. */
function crossesWall(walls: Wall[], a: Point, b: Point): boolean {
  for (const [x1, z1, x2, z2] of walls) {
    if (x1 === x2) {
      if ((a.x - x1) * (b.x - x1) >= 0) continue;
      const z = a.z + ((b.z - a.z) * (x1 - a.x)) / (b.x - a.x);
      if (z >= z1 && z <= z2) return true;
    } else {
      if ((a.z - z1) * (b.z - z1) >= 0) continue;
      const x = a.x + ((b.x - a.x) * (z1 - a.z)) / (b.z - a.z);
      if (x >= x1 && x <= x2) return true;
    }
  }
  return false;
}

/**
 * The point of the grid that someone at a place steps onto, or off: the
 * nearest one that can be stood on with no wall in between, by preference one
 * that is clear of furniture. Null if there is none within reach.
 */
function nearestPoint(grid: FloorGrid, at: Point): number | null {
  const COLS = grid.cols;
  let best: number | null = null;
  let bestScore = Infinity;
  const span = Math.ceil(ROUTES.reach / ROUTES.step);
  const i0 = colOf(grid, at.x);
  const j0 = rowOf(at.z);
  for (let j = Math.max(0, j0 - span); j <= Math.min(grid.rows - 1, j0 + span); j++) {
    for (let i = Math.max(0, i0 - span); i <= Math.min(COLS - 1, i0 + span); i++) {
      const n = j * COLS + i;
      if (grid.closed[n]) continue;
      const point = { x: xOf(grid, i), z: zOf(j) };
      const distance = Math.hypot(point.x - at.x, point.z - at.z);
      const score = distance + (grid.cluttered[n] ? ROUTES.reach : 0);
      if (distance > ROUTES.reach || score >= bestScore || crossesWall(grid.walls, at, point)) continue;
      best = n;
      bestScore = score;
    }
  }
  return best;
}

/** The eight steps from a point of the grid: [columns, rows, length]. */
const STEPS: readonly [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/** The shortest way over the grid from one point to another (A*), as the points it passes; null if there is none. */
function overGrid(grid: FloorGrid, from: number, to: number): number[] | null {
  const { closed, cluttered, cols: COLS, rows: ROWS } = grid;
  const size = COLS * ROWS;
  const cost = new Float32Array(size).fill(Infinity);
  const cameFrom = new Int32Array(size).fill(-1);
  const done = new Uint8Array(size);
  const toI = to % COLS;
  const toJ = Math.floor(to / COLS);
  /** At least as far as it is from a point to the end. */
  const ahead = (n: number) => {
    const di = Math.abs((n % COLS) - toI);
    const dj = Math.abs(Math.floor(n / COLS) - toJ);
    return Math.max(di, dj) + (Math.SQRT2 - 1) * Math.min(di, dj);
  };
  // A heap of the points still to look at, the most promising first.
  const heap: [score: number, point: number][] = [];
  const push = (score: number, point: number) => {
    let k = heap.push([score, point]) - 1;
    while (k > 0) {
      const parent = (k - 1) >> 1;
      if (heap[parent]![0] <= heap[k]![0]) break;
      [heap[parent], heap[k]] = [heap[k]!, heap[parent]!];
      k = parent;
    }
  };
  const pop = (): number => {
    const top = heap[0]![1];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      for (let k = 0; ; ) {
        const left = 2 * k + 1;
        const right = left + 1;
        let least = k;
        if (left < heap.length && heap[left]![0] < heap[least]![0]) least = left;
        if (right < heap.length && heap[right]![0] < heap[least]![0]) least = right;
        if (least === k) break;
        [heap[least], heap[k]] = [heap[k]!, heap[least]!];
        k = least;
      }
    }
    return top;
  };

  cost[from] = 0;
  push(ahead(from), from);
  while (heap.length > 0) {
    const n = pop();
    if (n === to) break;
    if (done[n]) continue;
    done[n] = 1;
    const i = n % COLS;
    const j = Math.floor(n / COLS);
    for (const [di, dj, length] of STEPS) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= COLS || nj >= ROWS) continue;
      const next = nj * COLS + ni;
      if (closed[next] || done[next]) continue;
      // No cutting a corner of a wall.
      if (di !== 0 && dj !== 0 && (closed[j * COLS + ni] || closed[nj * COLS + i])) continue;
      const total = cost[n]! + length * (cluttered[next] ? ROUTES.through : 1);
      if (total >= cost[next]!) continue;
      cost[next] = total;
      cameFrom[next] = n;
      push(total + ahead(next), next);
    }
  }
  if (cameFrom[to] === -1 && to !== from) return null;
  const points = [to];
  while (points[0] !== from) points.unshift(cameFrom[points[0]!]!);
  return points;
}

/** Whether someone can walk straight from one point to another: over free floor all the way, clear of walls and furniture. */
function inSight(grid: FloorGrid, a: Point, b: Point): boolean {
  const COLS = grid.cols;
  const samples = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (ROUTES.step / 2));
  for (let k = 0; k <= samples; k++) {
    const t = samples === 0 ? 0 : k / samples;
    const n = rowOf(a.z + (b.z - a.z) * t) * COLS + colOf(grid, a.x + (b.x - a.x) * t);
    if (grid.closed[n] || grid.cluttered[n]) return false;
  }
  return true;
}

/**
 * The way from one place on a floor to another, as the points to walk to in
 * turn, the last of them the place itself: through the doors, clear of the
 * walls, and around the furniture where there is a way around it. Someone who
 * can't get onto the grid where they are, or whose way is walled off, walks
 * straight there.
 */
export function walkPath(state: GameState, floor: number, from: Point, to: Point): [x: number, z: number][] {
  const straight: [number, number][] = [[to.x, to.z]];
  if (Math.hypot(to.x - from.x, to.z - from.z) <= ROUTES.step) return straight;
  const grid = floorGrid(state, floor);
  const first = nearestPoint(grid, from);
  const last = nearestPoint(grid, to);
  if (first === null || last === null) return straight;
  const over = overGrid(grid, first, last);
  if (!over) return straight;

  const points: Point[] = [{ x: from.x, z: from.z }, ...over.map((n) => ({ x: xOf(grid, n % grid.cols), z: zOf(Math.floor(n / grid.cols)) })), { x: to.x, z: to.z }];
  // Pull the way taut: from each point straight to the furthest one that can be seen from it.
  const taut: Point[] = [points[0]!];
  for (let at = 0; at < points.length - 1; ) {
    let next = points.length - 1;
    while (next > at + 1 && !inSight(grid, points[at]!, points[next]!)) next--;
    taut.push(points[next]!);
    at = next;
  }
  // And leave out the points in the middle of a straight stretch.
  const turns = taut.filter((p, k) => {
    const before = taut[k - 1];
    const after = taut[k + 1];
    return !before || !after || Math.abs((p.x - before.x) * (after.z - p.z) - (p.z - before.z) * (after.x - p.x)) > 1e-9;
  });
  return turns.slice(1).map((p) => [p.x, p.z]);
}
