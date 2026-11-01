// The office building of a map that belongs to no region (0.21.0, #289): worked out from the map's wings and reception box, so a new
// map gets a building that works. The five written buildings (BUILDINGS in config/office.ts) are not touched by this; their
// entries stay as they are, and `townLayout.ts` asks for this one only when a map has no region.
//
//   Floor: the drawn wings and the reception box. (The box is always one of the rectangles, even when it lies inside a wing.)
//   Core: at the box, facing the side of it that is open to the street (west, north or south: `Face` has no east).
//   Lanes: a stem from the hall's back door straight inward; each rectangle of floor cut along its long side into bands, each with
//          a corridor and a row of rooms on each side of it; links where a corridor has no way to the hall; every corridor cut
//          where another crosses it, so that the way stays clear however full the floor is.
//
// Pure: no three.js, nothing from the sim.

import { CORE, CORE_ALONG, ROOM_SIZES, coreFrame, coreOf, coreSpace, frameOf, onFloor, type Building, type Face, type Lane, type Rect } from '../config/office';
import type { MapFile, TileBox } from '../mods/mapFile';

/** How far the drawing is moved to become the floor grid, in tiles (`z` is the building's y). */
export interface Shift {
  x: number;
  z: number;
}

/** The fewest tiles a floor has to build on (the standard building has 220). */
export const MIN_BUILDABLE = 200;

type Worked = { ok: true; building: Building } | { ok: false; reason: string };
const no = (reason: string): Worked => ({ ok: false, reason });

const key = (x: number, y: number) => `${x}:${y}`;
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

// --- The floor ---

/** Whether two rectangles have floor in common or share a stretch of edge. */
function touch(a: Rect, b: Rect): boolean {
  const [alongX, alongY] = [a.x < b.x + b.w && b.x < a.x + a.w, a.y < b.y + b.h && b.y < a.y + a.h];
  return (alongX && a.y <= b.y + b.h && b.y <= a.y + a.h) || (alongY && a.x <= b.x + b.w && b.x <= a.x + a.w);
}

/** Whether the rectangles make one piece of floor: each reaches the next across an edge (a corner is not enough). */
function inOnePiece(rects: readonly Rect[]): boolean {
  const reached = new Set([0]);
  const queue = [0];
  for (let n = 0; n < queue.length; n++) {
    rects.forEach((r, i) => {
      if (!reached.has(i) && touch(rects[queue[n]!]!, r)) {
        reached.add(i);
        queue.push(i);
      }
    });
  }
  return reached.size === rects.length;
}

/** What is left of `a` when `b` is taken out of it: up to four rectangles. */
function without(a: Rect, b: Rect): Rect[] {
  const [x0, x1] = [Math.max(a.x, b.x), Math.min(a.x + a.w, b.x + b.w)];
  const [y0, y1] = [Math.max(a.y, b.y), Math.min(a.y + a.h, b.y + b.h)];
  if (x0 >= x1 || y0 >= y1) return [a];
  const left: Rect[] = [];
  if (a.y < y0) left.push({ x: a.x, y: a.y, w: a.w, h: y0 - a.y });
  if (y1 < a.y + a.h) left.push({ x: a.x, y: y1, w: a.w, h: a.y + a.h - y1 });
  if (a.x < x0) left.push({ x: a.x, y: y0, w: x0 - a.x, h: y1 - y0 });
  if (x1 < a.x + a.w) left.push({ x: x1, y: y0, w: a.x + a.w - x1, h: y1 - y0 });
  return left;
}

/** The floor as rectangles that do not overlap, with those that line up end to end made one. */
function piecesOf(wings: readonly Rect[]): Rect[] {
  const pieces = wings.flatMap((wing, n) => wings.slice(0, n).reduce((rest, before) => rest.flatMap((r) => without(r, before)), [wing]));
  for (let again = true; again; ) {
    again = false;
    for (let i = 0; i < pieces.length && !again; i++) {
      for (let j = i + 1; j < pieces.length && !again; j++) {
        const [a, b] = [pieces[i]!, pieces[j]!];
        const down = a.x === b.x && a.w === b.w && (a.y + a.h === b.y || b.y + b.h === a.y);
        const across = a.y === b.y && a.h === b.h && (a.x + a.w === b.x || b.x + b.w === a.x);
        if (!down && !across) continue;
        const [x, y] = [Math.min(a.x, b.x), Math.min(a.y, b.y)];
        pieces.splice(j, 1);
        pieces[i] = { x, y, w: down ? a.w : a.w + b.w, h: down ? a.h + b.h : a.h };
        again = true;
      }
    }
  }
  return pieces.sort((p, q) => p.y - q.y || p.x - q.x);
}

// --- The core ---

/**
 * Which way the entrance faces, of the sides of the box that are open (no floor just outside any of it): the side with the nearest
 * road in front of it, else south, north, west. Null if no side is open. (Never east: `Face` has no east.)
 */
function facing(box: Rect, floor: (x: number, y: number) => boolean, roads: readonly Rect[]): Face | null {
  const outside: Record<Face, [number, number][]> = {
    w: range(box.h).map((d) => [box.x - 1, box.y + d]),
    n: range(box.w).map((d) => [box.x + d, box.y - 1]),
    s: range(box.w).map((d) => [box.x + d, box.y + box.h]),
  };
  const open = (['s', 'n', 'w'] as const).filter((face) => outside[face].every(([x, y]) => !floor(x, y)));
  /** How far the nearest road is in front of the middle of the side, or infinity. */
  const gap = (face: Face): number => {
    const [mx, my] = [box.x + box.w / 2, box.y + box.h / 2];
    const gaps = roads.map((l) => {
      if (face === 'w') return my >= l.y && my <= l.y + l.h && l.x + l.w <= box.x ? box.x - (l.x + l.w) : Infinity;
      if (face === 'n') return mx >= l.x && mx <= l.x + l.w && l.y + l.h <= box.y ? box.y - (l.y + l.h) : Infinity;
      return mx >= l.x && mx <= l.x + l.w && l.y >= box.y + box.h ? l.y - (box.y + box.h) : Infinity;
    });
    return Math.min(...gaps, Infinity);
  };
  return open.reduce<Face | null>((best, face) => (best === null || gap(face) < gap(best) ? face : best), null);
}

// --- The lanes ---

/** A stretch of corridor: a row of tiles along x or a column along y, `from` to `to` (both tiles of it). */
interface Run {
  along: 'x' | 'y';
  at: number;
  from: number;
  to: number;
  /** The band of floor it runs in: its rows (or columns) from `start`, `size` of them. */
  start: number;
  size: number;
}

const tilesOf = (r: { along: 'x' | 'y'; at: number; from: number; to: number }): [number, number][] =>
  range(r.to - r.from + 1).map((n) => (r.along === 'x' ? [r.from + n, r.at] : [r.at, r.from + n]));

/** How many bands a rectangle of floor is cut into across its short side: one of up to 18 tiles, two of up to 29, and so on. */
const bandCount = (short: number) => Math.max(1, Math.floor((short + 3) / 11));

function lanesFor(building: Building): Lane[] {
  const core = coreSpace(building, 1);
  const inCore = (x: number, y: number) => x >= core.x && x < core.x + core.w && y >= core.y && y < core.y + core.h;
  const free = (x: number, y: number) => onFloor(building, x, y) && !inCore(x, y);

  // The stem: from the tile behind the hall's back door straight inward until the floor ends.
  const { faces } = building.core;
  const door = coreFrame(building).point(CORE.w, 5.5);
  const first: [number, number] = [Math.floor(door.x), Math.floor(door.z) - (faces === 's' ? 1 : 0)];
  const inward: [number, number] = faces === 'w' ? [1, 0] : faces === 'n' ? [0, 1] : [0, -1];
  const stem: [number, number][] = [];
  for (let [x, y] = first; free(x, y); x += inward[0], y += inward[1]) stem.push([x, y]);

  // The corridors: each band of each rectangle of floor has one in its middle, or at its edge if the band is too narrow for two rows.
  const runs: Run[] = [];
  for (const piece of piecesOf(building.wings)) {
    const along = piece.w >= piece.h ? 'x' : 'y';
    const short = along === 'x' ? piece.h : piece.w;
    const [from, to] = along === 'x' ? [piece.x, piece.x + piece.w - 1] : [piece.y, piece.y + piece.h - 1];
    const bands = bandCount(short);
    let start = along === 'x' ? piece.y : piece.x;
    for (let n = 0; n < bands; n++) {
      const size = Math.floor(short / bands) + (n >= bands - (short % bands) ? 1 : 0);
      if (size >= 3) {
        let at = size < 7 ? start : start + Math.floor((size - 1) / 2);
        // A corridor that would run through the core, with floor on both sides of it, moves to the first tile behind it.
        const through = along === 'x' ? at >= core.y && at < core.y + core.h && from < core.x && to >= core.x + core.w : at >= core.x && at < core.x + core.w && from < core.y && to >= core.y + core.h;
        const behind = faces === 'w' && along === 'y' ? core.x + core.w : faces === 'n' && along === 'x' ? core.y + core.h : faces === 's' && along === 'x' ? core.y - 1 : null;
        if (through && behind !== null && behind >= start && behind < start + size) at = behind;
        // What of it is not in the core: one stretch, or two where the core is in the middle of it.
        let open: number | null = null;
        for (let p = from; p <= to + 1; p++) {
          const here = p <= to && !(along === 'x' ? inCore(p, at) : inCore(at, p));
          if (here && open === null) open = p;
          if (!here && open !== null) {
            runs.push({ along, at, from: open, to: p - 1, start, size });
            open = null;
          }
        }
      }
      start += size;
    }
  }

  // The way from the hall: the stem, and the corridors that touch it, and the ones they touch. A corridor with no way gets the
  // shortest straight link across the floor to the ways there are, and is kept clear.
  const clear = new Set<string>(stem.map(([x, y]) => key(x, y)));
  for (const run of runs) for (const [x, y] of tilesOf(run)) clear.add(key(x, y));
  const reach = (): Set<string> => {
    const reached = new Set<string>();
    const queue = stem.map(([x, y]) => key(x, y));
    queue.forEach((k) => reached.add(k));
    for (let n = 0; n < queue.length; n++) {
      const [x, y] = queue[n]!.split(':').map(Number) as [number, number];
      for (const k of [key(x + 1, y), key(x - 1, y), key(x, y + 1), key(x, y - 1)]) {
        if (clear.has(k) && !reached.has(k)) {
          reached.add(k);
          queue.push(k);
        }
      }
    }
    return reached;
  };
  const links: [number, number][][] = [];
  let reached = reach();
  for (const run of runs) {
    if (reached.has(key(...(tilesOf(run)[0]!)))) continue;
    const middle = (run.from + run.to) / 2;
    const tiles = tilesOf(run).sort((a, b) => Math.abs((run.along === 'x' ? a[0] : a[1]) - middle) - Math.abs((run.along === 'x' ? b[0] : b[1]) - middle));
    let best: [number, number][] | null = null;
    for (const [x, y] of tiles) {
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
        const path: [number, number][] = [];
        let [px, py] = [x + dx, y + dy];
        while (free(px, py) && !reached.has(key(px, py))) {
          path.push([px, py]);
          [px, py] = [px + dx, py + dy];
        }
        if (free(px, py) && reached.has(key(px, py)) && path.length > 0 && (best === null || path.length < best.length)) best = path;
      }
    }
    if (!best) continue;
    links.push(best);
    for (const [x, y] of best) clear.add(key(x, y));
    reached = reach();
  }

  // Each corridor, cut at every stem, link and other corridor that stands in its rows, into the stretches rooms stand along.
  const lanes: Lane[] = [];
  runs.forEach((run, i) => {
    const others = [stem, ...links, ...runs.filter((_, j) => j !== i).map(tilesOf)].flat();
    // (A tile on the corridor's own line goes the same way, not across it: the stem often does.)
    const across = ([x, y]: [number, number]) => (run.along === 'x' ? y : x);
    const cut = new Set(others.filter((t) => across(t) >= run.start && across(t) < run.start + run.size && across(t) !== run.at).map(([x, y]) => (run.along === 'x' ? x : y)));
    const [low, high] = [run.at - run.start, run.start + run.size - 1 - run.at];
    const depth = low === ROOM_SIZES.office.h && high === ROOM_SIZES.office.h ? {} : { depth: [low, high] as const };
    let begin: number | null = null;
    for (let p = run.from; p <= run.to + 1; p++) {
      const here = p <= run.to && !cut.has(p);
      if (here && begin === null) begin = p;
      if (!here && begin !== null) {
        const length = p - begin;
        if (length >= 3) {
          const area: Rect = run.along === 'x' ? { x: begin, y: run.at - low, w: length, h: low + 1 + high } : { x: run.at - low, y: begin, w: low + 1 + high, h: length };
          lanes.push({ area, along: run.along, corridor: run.at, ...depth });
        }
        begin = null;
      }
    }
  });

  // The nearest the hall first.
  const hall = coreOf(building).entry;
  const near = (a: Rect) => Math.hypot(Math.max(a.x - hall.x, 0, hall.x - (a.x + a.w - 1)), Math.max(a.y - hall.y, 0, hall.y - (a.y + a.h - 1)));
  return lanes.map((lane, n) => ({ lane, n })).sort((p, q) => near(p.lane.area) - near(q.lane.area) || p.n - q.n).map(({ lane }) => lane);
}

// --- The building ---

function workOut(file: MapFile, shift: Shift): Worked {
  const { map, settings } = file;
  const at = (b: TileBox): Rect => ({ x: b.x + shift.x, y: b.y + shift.z, w: b.w, h: b.h });
  if (!map.reception) return no('The map has no reception box: draw the box where the entrance of the building is.');
  const box = at(map.reception);
  const wings = [...map.wings.map(at), box];
  if (!inOnePiece(wings)) return no('The floor of the building is in more than one piece: the wings and the reception box have to touch along an edge.');
  const floor = (x: number, y: number) => wings.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);

  const face = facing(box, floor, map.lanes.map(at));
  if (!face) return no('The reception box has no side open to the west, north or south for the entrance to face. (An entrance cannot face east.)');
  const along = face === 'w' ? box.h : box.w;
  const off = Math.max(0, Math.floor((along - CORE_ALONG) / 2));
  const core = face === 'w' ? { x: box.x + CORE.w, y: box.y + off, faces: face } : face === 'n' ? { x: box.x + off + CORE.w, y: box.y, faces: face } : { x: box.x + off + CORE.w, y: box.y + box.h - CORE.w, faces: face };

  // The core is 11 along the face and 6 deep, all of it on the floor.
  const block = frameOf(face, core.x, core.y).rect(0, 0, CORE.w, CORE_ALONG);
  if (!range(block.w).every((dx) => range(block.h).every((dy) => floor(block.x + dx, block.y + dy)))) {
    return no(`The core of the building, ${CORE_ALONG} tiles along its entrance and ${CORE.w} deep, does not fit on the floor at the reception box: make the box or the wing round it bigger.`);
  }

  const yard = [...map.courtyard.parking, ...map.courtyard.green].map(at);
  const courtyard = yard.length === 0 ? undefined : { x: Math.min(...yard.map((r) => r.x)), y: Math.min(...yard.map((r) => r.y)), w: Math.max(...yard.map((r) => r.x + r.w)) - Math.min(...yard.map((r) => r.x)), h: Math.max(...yard.map((r) => r.y + r.h)) - Math.min(...yard.map((r) => r.y)) };
  const building: Building = {
    id: 'map',
    floors: settings.floors,
    w: Math.max(...wings.map((r) => r.x + r.w)),
    blocks: 4,
    depth: Math.max(...wings.map((r) => r.y + r.h)),
    wings,
    ...(courtyard && { courtyard }),
    core,
    lanes: [],
    plan: [],
  };
  (building as { lanes: readonly Lane[] }).lanes = lanesFor(building);
  return { ok: true, building };
}

/**
 * The building of a drawn map, its drawing moved by `shift` onto the floor grid. Throws, with the reason in plain words, when the map
 * has none: no reception box, a floor in more than one piece, no side for the entrance to face, a core that does not fit. `floorProblem`
 * is for the lanes, once the building is worked out.
 */
export function drawnBuilding(file: MapFile, shift: Shift): Building {
  const worked = workOut(file, shift);
  if (!worked.ok) throw new Error(worked.reason);
  return worked.building;
}

/**
 * Why a drawn building is no good to work in, in plain words, or null: a corridor that cannot be walked to from the hall once every
 * room that fits is built, a floor too small, or no place for a room of the usual size.
 */
export function floorProblem(building: Building): string | null {
  const space = coreSpace(building, 1);
  const inSpace = (x: number, y: number) => x >= space.x && x < space.x + space.w && y >= space.y && y < space.y + space.h;
  let tiles = 0;
  for (let x = Math.min(...building.wings.map((r) => r.x)); x < building.w; x++) {
    for (let y = 0; y < building.depth; y++) if (onFloor(building, x, y) && !inSpace(x, y)) tiles++;
  }
  if (tiles < MIN_BUILDABLE) return `The floor is too small: ${tiles} tiles to build on, and it needs at least ${MIN_BUILDABLE} (the standard building has 220).`;

  const core = coreOf(building);
  const shut = [core.stairs, core.lifts, core.technician, core.cleaners];
  const rooms = new Set<string>();
  const corridors: [number, number][] = [];
  for (const { area, along, corridor } of building.lanes) {
    for (let x = area.x; x < area.x + area.w; x++) {
      for (let y = area.y; y < area.y + area.h; y++) {
        if ((along === 'x' ? y : x) === corridor) corridors.push([x, y]);
        else rooms.add(key(x, y));
      }
    }
  }
  const open = (x: number, y: number) => onFloor(building, x, y) && !rooms.has(key(x, y)) && !shut.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  const reached = new Set([key(core.entry.x, core.entry.y)]);
  const queue: [number, number][] = [[core.entry.x, core.entry.y]];
  for (let n = 0; n < queue.length; n++) {
    const [x, y] = queue[n]!;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
      if (reached.has(key(nx, ny)) || !open(nx, ny)) continue;
      reached.add(key(nx, ny));
      queue.push([nx, ny]);
    }
  }
  if (building.lanes.length === 0 || corridors.some(([x, y]) => !reached.has(key(x, y)))) {
    return 'Part of the floor cannot be walked to from the entrance hall once its rooms are built: the wings have to meet in a place wide enough for a way through, and there has to be floor behind the hall.';
  }

  // Room for one of the usual size: beside a corridor, on the floor, clear of the core.
  const { w, h } = ROOM_SIZES.office;
  const fits = building.lanes.some((lane) => {
    const turned = lane.along === 'y';
    return [0, 1].some((side) => {
      const deep = lane.depth?.[side] ?? h;
      if (deep < h) return false;
      const [length, from] = turned ? [lane.area.h, lane.area.y] : [lane.area.w, lane.area.x];
      return range(Math.max(0, length - w + 1)).some((n) => {
        const across = side === 0 ? lane.corridor - h : lane.corridor + 1;
        const room: Rect = turned ? { x: across, y: from + n, w: h, h: w } : { x: from + n, y: across, w, h };
        return range(room.w).every((dx) => range(room.h).every((dy) => onFloor(building, room.x + dx, room.y + dy) && !inSpace(room.x + dx, room.y + dy)));
      });
    });
  });
  if (!fits) return `The floor has no place for a room of the usual size (${w} by ${h} tiles) beside a corridor.`;
  return null;
}
