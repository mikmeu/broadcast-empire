import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BUILDINGS, outerWalls, type Building } from '../config/office';
import { BUILDING_KIT } from './assets';
import { awningSpots, entranceOf, outerRuns, wallPieces, type WallPiece } from './buildingPieces';

/** A building drawn by hand: an L of two wings, with an inside corner and short runs. */
const drawn: Building = {
  ...BUILDINGS.standard,
  id: 'map',
  w: 20,
  depth: 21,
  wings: [{ x: -6, y: 0, w: 26, h: 11 }, { x: -6, y: 11, w: 13, h: 10 }],
};

const all = [...Object.entries(BUILDINGS), ['drawn', drawn] as const];
const sized = (piece: WallPiece) => piece.kind !== 'post' && piece.kind !== 'door';

describe('the outside of the building in kit pieces (#305)', () => {
  it('has the kit on disk, with its licence and texture, and its pieces as long as it says', () => {
    for (const { file, length } of Object.values(BUILDING_KIT.pieces)) {
      expect(existsSync(`public/models/${file}`), file).toBe(true);
      const bytes = readFileSync(`public/models/${file}`);
      const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
      const sizes = json.meshes.flatMap((m: { primitives: { attributes: { POSITION: number } }[] }) => m.primitives.map((p) => json.accessors[p.attributes.POSITION]));
      const along = Math.max(...sizes.map((a: { max: number[]; min: number[] }) => a.max[2]! - a.min[2]!));
      expect(along, file).toBeCloseTo(length, 1);
      expect(Math.max(...sizes.map((a: { max: number[] }) => a.max[1]!))).toBeCloseTo(BUILDING_KIT.height, 3);
    }
    expect(existsSync('public/models/building/License.txt')).toBe(true);
    expect(existsSync('public/models/building/Textures/colormap.png')).toBe(true);
  });

  for (const [name, building] of all) {
    it(`covers every outer run of the ${name} building exactly, with the entrance open`, () => {
      const { runs, entrance } = outerRuns(building);
      const pieces = wallPieces(building, { door: true });
      let gap = 0;
      for (const run of runs) {
        const mine = pieces
          .filter((p) => sized(p) && p.faces === run.faces && (run.alongX ? p.z === run.line && p.turn === 1 : p.x === run.line && p.turn === 0))
          .map((p) => [(run.alongX ? p.x : p.z) - p.span / 2, (run.alongX ? p.x : p.z) + p.span / 2] as const)
          .filter(([a, b]) => a >= run.from - 1e-9 && b <= run.to + 1e-9)
          .sort((a, b) => a[0] - b[0]);
        let at = run.from;
        for (const [a, b] of mine) {
          expect(a, `${name} ${run.faces}`).toBeCloseTo(at, 6);
          at = b;
        }
        expect(at, `${name} ${run.faces}`).toBeCloseTo(run.to, 6);
      }
      // The runs add up to the outer walls less the entrance: 2 tiles, in the one run it is in.
      const whole = outerWalls(building).reduce((sum, { wall: [x1, z1, x2, z2] }) => sum + (x2 - x1) + (z2 - z1), 0);
      gap = whole - runs.reduce((sum, run) => sum + (run.to - run.from), 0);
      expect(gap).toBeCloseTo(entrance.gap[1] - entrance.gap[0], 6);
      // Nothing but the doorway stands in the gap.
      const [lo, hi] = entrance.gap;
      for (const p of pieces.filter((q) => q.faces === entrance.faces && q.kind !== 'post' && (entrance.alongX ? q.z === entrance.line : q.x === entrance.line))) {
        const [a, b] = [(entrance.alongX ? p.x : p.z) - p.span / 2, (entrance.alongX ? p.x : p.z) + p.span / 2];
        if (p.kind === 'door') expect([a, b]).toEqual([lo, hi]);
        else expect(b <= lo + 1e-9 || a >= hi - 1e-9).toBe(true);
      }
      expect(pieces.filter((p) => p.kind === 'door')).toHaveLength(1);
    });

    it(`has no door when it is not asked for, and shuts the wall when asked (${name})`, () => {
      expect(wallPieces(building).some((p) => p.kind === 'door')).toBe(false);
      const shut = outerRuns(building, true).runs.reduce((sum, run) => sum + (run.to - run.from), 0);
      const whole = outerWalls(building).reduce((sum, { wall: [x1, z1, x2, z2] }) => sum + (x2 - x1) + (z2 - z1), 0);
      expect(shut).toBeCloseTo(whole, 6);
    });

    it(`keeps the awnings of the ${name} building off the door`, () => {
      const entrance = entranceOf(building);
      for (const spot of awningSpots(building)) {
        if (spot.faces !== entrance.faces) continue;
        const along = entrance.alongX ? spot.x : spot.z;
        const line = entrance.alongX ? spot.z : spot.x;
        if (line === entrance.line) expect(along <= entrance.gap[0] - 1 || along >= entrance.gap[1] + 1).toBe(true);
      }
    });
  }

  it('includes the courtyard faces of the U, and the faces on all four sides', () => {
    const U = BUILDINGS.courtyard;
    const faces = new Set(wallPieces(U).map((p) => p.faces));
    expect(faces).toEqual(new Set(['n', 's', 'e', 'w']));
    const { runs } = outerRuns(U);
    // The courtyard is in the middle of the building: a run of its own on every side inside the outer edges.
    expect(runs.some((run) => run.faces === 'n' && run.line > 0 && run.line < U.depth)).toBe(true);
  });

  it('can pick which runs it draws, as the tall walls of a view do', () => {
    const north = wallPieces(BUILDINGS.standard, { only: (run) => run.faces === 'n' });
    expect(north.every((p) => p.faces === 'n')).toBe(true);
    expect(north.some((p) => p.kind === 'window')).toBe(true);
    expect(wallPieces(BUILDINGS.standard, { plain: true }).some((p) => p.kind === 'window')).toBe(false);
  });

  it('leaves a short run as one plain piece, stretched', () => {
    const odd: Building = { ...BUILDINGS.standard, id: 'map', w: 3, depth: 3, wings: [{ x: 0, y: 0, w: 3, h: 3 }] };
    const pieces = wallPieces(odd, { shut: true }).filter(sized);
    expect(pieces.some((p) => p.kind === 'half' && p.span === 1)).toBe(true);
    expect(pieces.some((p) => p.kind === 'window' && p.span === 2)).toBe(true);
  });
});
