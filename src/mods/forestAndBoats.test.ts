// The Mini Forest and Watercraft Pack models of the map editor (0.21.0, #365): their files and sizes, where they may stand, and that they survive a save.

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FOREST_TREES, modelOf, placedAt } from '../office/city';
import { FOREST, WATERCRAFT, PLACEABLE } from '../office/siteLooks';
import { BRUSHES, fillPlan, placeHouse, placeProblem, copyOfMap } from './townDraft';
import { checkMapFile, toMapFile } from './mapFile';

const NEW = [...FOREST.trees, ...FOREST.props, ...WATERCRAFT.boats, ...WATERCRAFT.cargo];

/** The bounds of a model's file in its own units, with the translations of its nodes (the sails and the cargo of the ships sit on nodes of their own). */
function bounds(file: string) {
  const buffer = readFileSync(`public/models/${file}`);
  const json = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString());
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  for (const node of json.nodes) {
    if (node.mesh === undefined) continue;
    const t = node.translation ?? [0, 0, 0];
    for (const p of json.meshes[node.mesh].primitives) {
      const { min, max } = json.accessors[p.attributes.POSITION];
      for (let k = 0; k < 3; k++) {
        low[k] = Math.min(low[k]!, min[k] + t[k]);
        high[k] = Math.max(high[k]!, max[k] + t[k]);
      }
    }
  }
  return { w: high[0]! - low[0]!, height: high[1]! - low[1]!, d: high[2]! - low[2]!, cx: (high[0]! + low[0]!) / 2, cz: (high[2]! + low[2]!) / 2, foot: -low[1]! };
}

describe('the new models', () => {
  it('has 21 models, each with its file, and a licence and colormap beside each folder', () => {
    expect(NEW).toHaveLength(21);
    for (const m of NEW) expect(existsSync(`public/models/${m.file}`), m.file).toBe(true);
    for (const folder of ['forest', 'watercraft']) {
      expect(existsSync(`public/models/${folder}/License.txt`)).toBe(true);
      expect(existsSync(`public/models/${folder}/Textures/colormap.png`)).toBe(true);
    }
  });

  it('has the size and the middle the file has, times its own size', () => {
    for (const m of NEW) {
      const b = bounds(m.file);
      const size = m.size!;
      expect(m.w, `${m.file} w`).toBeCloseTo(b.w * size, 1);
      expect(m.height, `${m.file} height`).toBeCloseTo(b.height * size, 1);
      expect(m.d, `${m.file} d`).toBeCloseTo(b.d * size, 1);
      expect(m.cx ?? 0, `${m.file} cx`).toBeCloseTo(b.cx, 1);
      expect(m.cz ?? 0, `${m.file} cz`).toBeCloseTo(b.cz, 1);
      expect(m.foot ?? 0, `${m.file} foot`).toBeCloseTo(b.foot, 1);
    }
  });

  it('is found by modelOf; the trees are not placeable as houses; only boats float', () => {
    for (const m of NEW) expect(modelOf(m.file)).toBe(m);
    for (const t of FOREST_TREES) expect(PLACEABLE).not.toContain(t);
    expect(NEW.filter((m) => m.floats).map((m) => m.file)).toEqual(WATERCRAFT.boats.map((m) => m.file));
  });

  it('is drawn at map scale times its size, and a boat at the water, not the pavement', () => {
    const ship = placedAt(WATERCRAFT.boats.at(-1)!, 6);
    expect(ship.scale).toBeCloseTo(6 * 0.395);
    expect(ship.y).toBeLessThan(0.06);
    expect(placedAt(FOREST.props[0]!, 6).y).toBe(0.2);
    expect(placedAt(FOREST.props[2]!, 6).y).toBeGreaterThan(0.2);
  });
});

describe('where they may stand', () => {
  // Skywave Beach: the sea is two boxes of water, one in front of the other (z 41 to 71, and 71 to 140).
  const town = copyOfMap('skywave-beach');
  const rowing = WATERCRAFT.boats[1]!.file;
  const tent = FOREST.props[4]!.file;

  it('puts a boat on water, even where it lies across two boxes of water', () => {
    expect(placeProblem(town, 'house', { model: rowing, x: 0, z: 90, turn: 0 })).toBeNull();
    expect(placeProblem(town, 'house', { model: rowing, x: 0, z: 71, turn: 0 })).toBeNull();
  });

  it('refuses a boat on land or half on land, by name', () => {
    expect(placeProblem(town, 'house', { model: rowing, x: -100, z: 20, turn: 0 })).toBe('A boat must stand on water.');
    expect(placeProblem(town, 'house', { model: rowing, x: 0, z: 41, turn: 0 })).toBe('A boat must stand on water.');
  });

  it('refuses a ship where the water is too narrow', () => {
    const ship = WATERCRAFT.boats.at(-1)!.file;
    expect(placeProblem(town, 'house', { model: ship, x: -139, z: 100, turn: 0 })).toMatch(/must stand on water|off the edge/);
  });

  it('refuses a prop in water, and calls it a prop', () => {
    expect(placeProblem(town, 'house', { model: tent, x: 0, z: 90, turn: 0 })).toBe('A prop cannot stand in water.');
    expect(placeProblem(town, 'house', { model: WATERCRAFT.cargo[0]!.file, x: 0, z: 90, turn: 0 })).toBe('A prop cannot stand in water.');
  });
});

describe('in the file', () => {
  it('keeps no new model out of the fill brushes', () => {
    const town = copyOfMap('skywave-beach');
    const files = new Set(NEW.map((m) => m.file));
    for (const { id } of BRUSHES) {
      const plan = fillPlan(town, { x: -100, z: 0, w: 60, d: 30 }, id, 7);
      for (const t of [...plan.houses, ...plan.trees]) expect(files.has(t.model), `${id}: ${t.model}`).toBe(false);
    }
  });

  it('survives toMapFile and checkMapFile with the new models in it', () => {
    let town = copyOfMap('skywave-beach');
    town = placeHouse(town, { model: WATERCRAFT.boats[0]!.file, x: 0, z: 90, turn: 1 });
    town = placeHouse(town, { model: FOREST.props[1]!.file, x: -60, z: 20, turn: 0 });
    const text = toMapFile(town);
    expect(checkMapFile(JSON.parse(text))).toMatchObject({ ok: true });
    expect(text).toContain('watercraft/boat-fishing-small.glb');
  });
});
