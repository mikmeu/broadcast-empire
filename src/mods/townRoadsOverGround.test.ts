// A street is never drawn under ground (#337): the ground is taller than the road, so it is cut away when a road is laid, moved or lengthened, and
// painting leaves roads clear.

import { describe, expect, it } from 'vitest';
import { MAPS } from '../config/maps';
import { toMapFile, type MapBox, type MapFile } from './mapFile';
import { copyOfMap, overlaps, paintGround, paintProblem, roadBox } from './townDraft';
import { DEFAULT_ROAD, addBlock, addRoad, editRoad, moveRoad, type RoadSpec } from './townStructure';

const spec = (changes: Partial<RoadSpec>): RoadSpec => ({ ...DEFAULT_ROAD, along: 'x', at: 0, direction: 1, ...changes });
const field = (file: MapFile, box: MapBox): MapFile => ({ ...file, map: { ...file.map, ground: [...file.map.ground, { kind: 'field', ...box }] } });
const hidden = (file: MapFile, kinds = ['field', 'grass', 'sand']) =>
  file.map.ground.filter((g) => !g.edge && kinds.includes(g.kind) && file.map.roads.some((r) => overlaps(g, roadBox(r))));

describe('ground under a road', () => {
  it('is cut when a road is laid across a field in a town of roads', () => {
    const base = copyOfMap('amplify-hills');
    const e = base.map.edge!;
    const box = { x: e.x + 4, z: e.z + 4, w: 20, d: 20 };
    const file = addRoad(field(base, box), spec({ along: 'z', at: box.x + 10, from: box.z - 3, to: box.z + box.d + 3 }));
    expect(hidden(file)).toEqual([]);
    expect(file.map.ground.some((g) => g.kind === 'field')).toBe(true);
  });

  it('is cut when a road moves across a field in a grid', () => {
    const base = copyOfMap('coaxia');
    const i = base.map.roads.findIndex((r) => r.along === 'x');
    const road = base.map.roads[i]!;
    const box = { x: -60, z: road.at + 4, w: 30, d: 4 };
    const moved = moveRoad(field(base, box), i, { x: 0, z: 4 });
    expect(moved.map.roads[i]!.at).toBeCloseTo(road.at + 4, 0);
    const now = roadBox(moved.map.roads[i]!);
    expect(moved.map.ground.filter((g) => g.kind === 'field' && overlaps(g, now))).toEqual([]);
    expect(moved.map.ground.some((g) => g.kind === 'field')).toBe(true);
  });

  it('is not cut when only the traffic setting changes', () => {
    const base = addRoad(field(copyOfMap('amplify-hills'), { x: 0, z: 0, w: 4, d: 4 }), spec({ along: 'x', at: 30, from: 0, to: 10 }));
    const i = base.map.roads.length - 1;
    const same = editRoad(field(base, { x: 0, z: 28, w: 6, d: 4 }), i, { traffic: false });
    expect(same.map.ground.length).toBe(base.map.ground.length + 1);
  });

  it('leaves water alone', () => {
    const base = copyOfMap('amplify-hills');
    const water = { kind: 'water' as const, x: 0, z: 0, w: 20, d: 20 };
    const file = addRoad({ ...base, map: { ...base.map, ground: [...base.map.ground, water] } }, spec({ along: 'x', at: 10, from: 0, to: 20 }));
    expect(file.map.ground).toContainEqual(water);
  });
});

describe('painting across a road', () => {
  it('leaves the road clear and writes nothing for a box wholly on a road', () => {
    const base = addRoad(copyOfMap('amplify-hills'), spec({ along: 'x', at: 0, from: -20, to: 20 }));
    const road = roadBox(base.map.roads[base.map.roads.length - 1]!);
    const across = paintGround(base, 'field', { x: -5, z: road.z - 3, w: 10, d: road.d + 6 });
    expect(hidden(across)).toEqual([]);
    expect(across.map.ground.filter((g) => g.kind === 'field' && g.x === -5 && g.w === 10)).toHaveLength(2);
    expect(paintGround(base, 'field', road)).toEqual(base);
  });

  it('lets water cross a road', () => {
    const base = addRoad(copyOfMap('amplify-hills'), spec({ along: 'x', at: 0, from: -20, to: 20 }));
    const file = paintGround(base, 'water', { x: -5, z: -4, w: 10, d: 8 });
    expect(file.map.ground).toContainEqual({ kind: 'water', x: -5, z: -4, w: 10, d: 8 });
  });

  it('cuts a new block into kerbed pieces around a road', () => {
    const base = addRoad(copyOfMap('amplify-hills'), spec({ along: 'x', at: 0, from: -20, to: 20 }));
    const file = addBlock(base, 'grass', { x: -4, z: -6, w: 8, d: 12 });
    const added = file.map.ground.slice(base.map.ground.length);
    expect(added.length).toBeGreaterThan(1);
    expect(added.every((g) => g.edge)).toBe(true);
    expect(added.some((g) => overlaps(g, roadBox(base.map.roads[base.map.roads.length - 1]!)))).toBe(false);
  });
});

describe('Remove', () => {
  it('says why it does nothing', () => {
    const file = copyOfMap('coaxia');
    const block = file.map.ground.find((g) => g.edge)!;
    expect(paintProblem(file, 'base', { x: block.x + 1, z: block.z + 1, w: 1, d: 1 })).toBe('That is a block with a kerb. Click it with the Block tool and press Delete.');
    expect(paintProblem({ ...file, map: { ...file.map, ground: [] } }, 'base', { x: 0, z: 0, w: 2, d: 2 })).toBe('Nothing is painted here. The green is the base of every map.');
  });
});

describe('the game maps', () => {
  it.each(Object.keys(MAPS))('a copy of %s exports the same bytes', (id) => {
    const copy = copyOfMap(id);
    expect(toMapFile({ ...copy, id: MAPS[id]!.id, name: MAPS[id]!.name })).toBe(toMapFile(MAPS[id]!));
  });
});
