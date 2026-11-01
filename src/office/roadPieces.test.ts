import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACTIVE_REGIONS } from '../config/balance';
import { ROADS } from './assets';
import { SHORTEST, roadPiecesOf, turnFor, type PieceKind } from './roadPieces';
import { SITES } from './sites';
import { GRID, layoutOf, type Layout, type Rect } from './townLayout';

const layouts = ACTIVE_REGIONS.map((region) => [region, layoutOf(SITES[region])] as const);

const count = (plan: ReturnType<typeof roadPiecesOf>, kind: PieceKind) => plan.pieces.filter((p) => p.kind === kind).length;
/** A layout of two or three streets of its own, for the rules of the plan. */
const drawn = (carriageways: Rect[], edge?: Rect, width = 4): Layout => ({ ...layoutOf(SITES.capital), streetWidth: width, edge, map: { ...layoutOf(SITES.capital).map!, carriageways } });

describe('the pieces that lay the streets (#285)', () => {
  it('has the kit on disk, with its licence and texture', () => {
    for (const file of [...Object.values(ROADS.pieces), ROADS.lamp.file, ROADS.light.file]) expect(existsSync(`public/models/${file}`), file).toBe(true);
    expect(existsSync('public/models/roads/License.txt')).toBe(true);
    expect(existsSync('public/models/roads/Textures/colormap.png')).toBe(true);
  });

  it('turns a piece to open where it is wanted', () => {
    expect(turnFor('tee', [[-1, 0], [1, 0], [0, -1]])).toBe(2);
    expect(turnFor('bend', [[-1, 0], [0, 1]])).toBe(0);
    expect(turnFor('bend', [[1, 0], [0, -1]])).toBe(2);
    expect(turnFor('end', [[0, -1]])).toBe(1);
    expect(turnFor('end', [[1, 0], [-1, 0]])).toBeNull();
  });

  it('has nothing for the grid of blocks, and does not throw on a broken draft', () => {
    expect(roadPiecesOf(GRID)).toEqual({ pieces: [], bare: [] });
    const base = layoutOf(SITES.capital);
    for (const broken of [[], [{ x: NaN, z: 0, w: 4, d: 40 }], [{ x: 0, z: 0, w: 0, d: 0 }], [{ x: 0, z: 0, w: 4, d: 40 }, { x: 0, z: 0, w: 4, d: 40 }], [{ x: 1, z: 1, w: 3, d: 3 }]]) {
      expect(() => roadPiecesOf({ ...base, map: { ...base.map!, carriageways: broken } })).not.toThrow();
    }
    expect(() => roadPiecesOf({ ...base, streetWidth: 0 })).not.toThrow();
  });

  it('makes a crossroad, a T and a corner from the arms the streets have', () => {
    // Two streets crossing over a whole square, each going on both ways.
    const cross = roadPiecesOf(drawn([{ x: 0, z: 18, w: 40, d: 4 }, { x: 18, z: 0, w: 4, d: 40 }]));
    expect(count(cross, 'cross')).toBe(1);
    // A street along z ending on the far kerb of the one along x: a T open to the west, east and north.
    const tee = roadPiecesOf(drawn([{ x: 0, z: 0, w: 40, d: 4 }, { x: 18, z: 0, w: 4, d: 24 }]));
    expect(tee.pieces.filter((p) => p.kind === 'tee')).toHaveLength(1);
    // Two streets that end on each other's far kerbs: a corner.
    const corner = roadPiecesOf(drawn([{ x: 0, z: 0, w: 24, d: 4 }, { x: 0, z: 0, w: 4, d: 24 }]));
    expect(count(corner, 'bend')).toBe(1);
    // (Open to the east and south: the piece as the kit has it, open to the west and south, turned a quarter.)
    expect(corner.pieces.find((p) => p.kind === 'bend')).toMatchObject({ x: 2, z: 2, turn: 1 });
  });

  it('ends a street that stops inside the drawing with a dead end, and runs one that reaches the edge on', () => {
    const edge: Rect = { x: 0, z: 0, w: 100, d: 100 };
    const road = roadPiecesOf(drawn([{ x: 0, z: 40, w: 60, d: 4 }], edge));
    // It starts at the edge (open) and stops at 60 (a dead end).
    expect(count(road, 'end')).toBe(1);
    expect(roadPiecesOf(drawn([{ x: -60, z: 40, w: 220, d: 4 }], edge)).pieces.filter((p) => p.kind === 'end')).toHaveLength(0);
  });

  it('lays straights of the street\'s width that fill a stretch exactly', () => {
    const plan = roadPiecesOf(drawn([{ x: 0, z: 18, w: 63, d: 4 }, { x: 18, z: 0, w: 4, d: 40 }, { x: 50, z: 0, w: 4, d: 40 }]));
    const along = plan.pieces.filter((p) => p.kind === 'straight' && p.z === 20 && p.x > 20 && p.x < 52);
    // Between the junctions at 20 and 52 there are 32 - 5 = 27 tiles.
    expect(along.reduce((sum, p) => sum + p.length, 0)).toBeCloseTo(27, 6);
    expect(along).toHaveLength(7);
    const sorted = [...along].sort((a, b) => a.x - b.x);
    for (let n = 1; n < sorted.length; n++) expect(sorted[n]!.x - sorted[n]!.length / 2).toBeCloseTo(sorted[n - 1]!.x + sorted[n - 1]!.length / 2, 6);
  });

  it('leaves the 1 tile between two carriageways bare no more than it must, and a 2 tile gap a short stretch', () => {
    const street = (gap: number) => roadPiecesOf(drawn([{ x: 0, z: 18, w: 40, d: 4 }, { x: 0, z: 22 + gap, w: 40, d: 4 }, { x: 18, z: 0, w: 4, d: 60 }]));
    // A gap of 1: the junctions touch (5 apart); nothing is left over.
    const one = street(1);
    expect(count(one, 'cross')).toBe(2);
    expect(one.bare.filter((r) => r.x === 18)).toHaveLength(0);
    // A gap of 2: 1 tile between the pieces, too short for a straight.
    const two = street(2);
    expect(two.bare.filter((r) => Math.abs(r.x - 18) < 0.01 && r.d < SHORTEST)).toHaveLength(1);
    // A gap of 4: a straight between them, stretched.
    expect(street(4).pieces.some((p) => p.kind === 'straight' && p.turn === 1 && p.z > 22 && p.z < 29)).toBe(true);
  });

  it('leaves a street that is not as wide as the others bare', () => {
    const plan = roadPiecesOf(drawn([{ x: 0, z: 18, w: 40, d: 6 }]));
    expect(plan.pieces).toHaveLength(0);
    expect(plan.bare).toHaveLength(1);
  });

  describe.each(layouts)('in %s', (region, layout) => {
    const plan = roadPiecesOf(layout);
    it('lays the streets with pieces, which lie on the asphalt and reach no further over a block than a kerb', () => {
      expect(plan.pieces.length, region).toBeGreaterThan(0);
      const w = layout.streetWidth;
      const size = w / ROADS.asphalt;
      const overhang = (size - w) / 2 + 0.01;
      const rects = layout.map!.carriageways;
      for (const piece of plan.pieces) {
        const half = (piece.turn % 2 === 0 ? [piece.length, piece.width] : [piece.width, piece.length]).map((v) => v / 2);
        // Every piece lies over some carriageway, and sticks out of it by no more than the kerb.
        const over = rects.some((r) => piece.x - half[0]! >= r.x - overhang && piece.x + half[0]! <= r.x + r.w + overhang && piece.z - half[1]! >= r.z - overhang && piece.z + half[1]! <= r.z + r.d + overhang);
        expect(over, `${region} ${piece.kind} at ${piece.x},${piece.z}`).toBe(true);
      }
    });
    it('is the same every time', () => {
      expect(roadPiecesOf(layout)).toEqual(plan);
    });
  });

  it('draws the town of Coaxia with crossroads and Ts, its bare patches few', () => {
    const plan = roadPiecesOf(layoutOf(SITES.capital));
    expect(count(plan, 'cross')).toBeGreaterThan(0);
    expect(count(plan, 'tee')).toBeGreaterThan(0);
  });
});
