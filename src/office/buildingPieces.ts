// The outside of the building laid out in the pieces of Kenney's Building Kit (#305), as roadPieces.ts does for the streets: a pure
// function from the outer walls of a building to a list of pieces, which scene/BuildingKit.tsx then draws.

import { CORE, coreFrame, outerWalls, type Building, type Face } from '../config/office';
import { BUILDING_KIT } from './assets';

export type WallKind = keyof typeof BUILDING_KIT.pieces;

/** A stretch of the outside of a floor with no entrance in it: `from` to `to` along x (`alongX`) or along z, on the line `line` of the other axis. */
export interface Run {
  /** Which of the `outerWalls` it is cut from, and which way the outside lies from it. */
  source: number;
  faces: 'n' | 's' | 'e' | 'w';
  alongX: boolean;
  line: number;
  from: number;
  to: number;
}

/** The entrance: a gap of 2 tiles in the face the core faces, level with the hall (west, north or south, 0.20.0). */
export interface Entrance {
  faces: Face;
  alongX: boolean;
  line: number;
  gap: [number, number];
}

export function entranceOf(building: Building): Entrance {
  const entrance = coreFrame(building).point(0, CORE.entry.y + 0.5);
  const faces = building.core.faces;
  const alongX = faces !== 'w';
  const at = alongX ? entrance.x : entrance.z;
  return { faces, alongX, line: alongX ? entrance.z : entrance.x, gap: [at - 1, at + 1] };
}

/** The outside of a floor in straight runs, the entrance left open: the one rule for the tall walls, the low ones and the kit's pieces. */
export function outerRuns(building: Building, shut = false): { runs: Run[]; entrance: Entrance } {
  const entrance = entranceOf(building);
  const runs = outerWalls(building).flatMap(({ wall: [x1, z1, x2, z2], faces }, source): Run[] => {
    const alongX = z1 === z2;
    const [from, to] = alongX ? [x1, x2] : [z1, z2];
    const line = alongX ? z1 : x1;
    const here = !shut && faces === entrance.faces && alongX === entrance.alongX && line === entrance.line;
    const cut: [number, number][] = here && from < entrance.gap[0] && to > entrance.gap[1] ? [[from, entrance.gap[0]], [entrance.gap[1], to]] : [[from, to]];
    return cut.map(([a, b]) => ({ source, faces, alongX, line, from: a, to: b }));
  });
  return { runs, entrance };
}

export interface WallPiece {
  kind: WallKind;
  /** Where its middle is. */
  x: number;
  z: number;
  /** 0 when it runs along z, 1 when along x (a quarter turn). */
  turn: 0 | 1;
  /** How many tiles of the wall it covers: the kit's own length, or stretched when a wall is a tile or less than a whole number of modules. */
  span: number;
  faces: Run['faces'];
}

const MODULE = BUILDING_KIT.pieces.window.length;

/** One run in pieces: a module of 2 tiles at a time (a window, or plain wall when `plain`), and what is left over in one plain piece. */
export function runPieces(run: Run, plain: boolean): WallPiece[] {
  const piece = (kind: WallKind, from: number, span: number): WallPiece => {
    const middle = from + span / 2;
    return { kind, x: run.alongX ? middle : run.line, z: run.alongX ? run.line : middle, turn: run.alongX ? 1 : 0, span, faces: run.faces };
  };
  const length = run.to - run.from;
  const modules = Math.floor(length / MODULE + 1e-9);
  const made: WallPiece[] = [];
  for (let i = 0; i < modules; i++) made.push(piece(plain ? 'wall' : 'window', run.from + i * MODULE, MODULE));
  const rest = length - modules * MODULE;
  if (rest > 1e-6) made.push(piece('half', run.from + modules * MODULE, rest));
  return made;
}

export interface WallOptions {
  /** Plain wall only, no windows. */
  plain?: boolean;
  /** Which runs to draw (the tall ones at the back of a view); all by default. */
  only?: (run: Run) => boolean;
  /** Put a door in the entrance, and a post at every end of a run. */
  door?: boolean;
  /** No entrance: the wall goes all the way round (the roof). */
  shut?: boolean;
}

/** The outside of the building in kit pieces. The entrance gap stays open (with a doorway in it when `door`). */
export function wallPieces(building: Building, options: WallOptions = {}): WallPiece[] {
  const { runs, entrance } = outerRuns(building, options.shut);
  const chosen = runs.filter((run) => options.only?.(run) ?? true);
  const pieces = chosen.flatMap((run) => runPieces(run, options.plain ?? false));
  const posts = new Map<string, WallPiece>();
  for (const run of chosen) {
    for (const end of [run.from, run.to]) {
      const [x, z] = run.alongX ? [end, run.line] : [run.line, end];
      posts.set(`${x},${z}`, { kind: 'post', x, z, turn: 0, span: BUILDING_KIT.pieces.post.length, faces: run.faces });
    }
  }
  pieces.push(...posts.values());
  if (options.door) {
    const open = runs.some((run) => run.faces === entrance.faces && run.alongX === entrance.alongX && run.line === entrance.line && (run.to === entrance.gap[0] || run.from === entrance.gap[1]));
    if (open) {
      const middle = (entrance.gap[0] + entrance.gap[1]) / 2;
      pieces.push({ kind: 'door', x: entrance.alongX ? middle : entrance.line, z: entrance.alongX ? entrance.line : middle, turn: entrance.alongX ? 1 : 0, span: MODULE, faces: entrance.faces });
    }
  }
  return pieces;
}

/** The awnings over the shop front: every four tiles along a run, never in front of the door. */
export function awningSpots(building: Building): { x: number; z: number; faces: Run['faces'] }[] {
  const { runs, entrance } = outerRuns(building);
  return runs.flatMap((run) => {
    const count = Math.floor((run.to - run.from - 2) / 4);
    return Array.from({ length: Math.max(0, count) }, (_, i) => {
      const at = run.from + 3 + i * 4;
      return { x: run.alongX ? at : run.line, z: run.alongX ? run.line : at, faces: run.faces };
    }).filter((spot) => {
      const along = run.alongX ? spot.x : spot.z;
      const atDoor = run.faces === entrance.faces && run.alongX === entrance.alongX && run.line === entrance.line;
      return !(atDoor && along > entrance.gap[0] - 1 && along < entrance.gap[1] + 1);
    });
  });
}
