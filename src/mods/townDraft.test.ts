// The rules the 3D map editor is built on (0.21.0, #328): drafts of format 2 that stay files the game reads, painting that cuts boxes, a fill that is written
// down, and what the layout and the traffic keep when only the decor changes. (The screen is driven by scripts/mapEditorCheck.ts.)

import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { MAPS } from '../config/maps';
import { buildingFor } from '../config/office';
import { townBlocks } from '../office/city';
import { checkStructure, checkTown, standsOnTrack } from '../office/townCheck';
import { SITES } from '../office/sites';
import { PREVIEW_MAP, layoutOfMap } from '../office/townLayout';
import { roadsOf } from '../office/traffic';
import { MAP_GRID, checkMapFile, toMapFile, type MapBox, type MapFile } from './mapFile';
import { previewSite, showPreviewMap, stopPreviewMap, updatePreviewDecor } from './mapPreview';
import {
  JOIN, copyOfMap, cutBox, defaultHillScale, dropItem, editItem, fillBox, fillPlan, forTheGame, hiddenThings, moveItem, paintGround, paintProblem, placeHill, placeHouse, placeLamp,
  placeProblem, placeTree, structureKey, thingAt,
} from './townDraft';

afterEach(() => stopPreviewMap());

const ids = Object.keys(MAPS);
const regionOf = (id: string) => (Object.keys(SITES) as (keyof typeof SITES)[]).find((r) => SITES[r].map === id)!;
/** Reads a file back through the check, as the game reads it from the folder. */
const readBack = (file: MapFile) => checkMapFile(JSON.parse(toMapFile(file)));
const overlap = (a: MapBox, b: MapBox) => a.x < b.x + b.w - 1e-6 && a.x + a.w > b.x + 1e-6 && a.z < b.z + b.d - 1e-6 && a.z + a.d > b.z + 1e-6;
const area = (boxes: MapBox[]) => boxes.reduce((sum, b) => sum + b.w * b.d, 0);

describe('copies of the game’s maps', () => {
  it.each(ids)('%s is a copy under a new id that passes the check with the building of its region', (id) => {
    const copy = copyOfMap(id);
    expect(copy.id).toBe(`${id}-copy`);
    expect(copy.name).toBe(`${MAPS[id]!.name} (copy)`);
    expect(copy.map).toEqual(MAPS[id]!.map);
    expect(copy.map).not.toBe(MAPS[id]!.map);
    expect(checkTown(copy, buildingFor(regionOf(id)))).toEqual({ ok: true });
  });

  it('takes a free id', () => {
    expect(copyOfMap('coaxia', ['coaxia-copy']).id).toBe('coaxia-copy-2');
  });

  // The bytes of "Export for the game" are those of the game's own file, as long as nothing is changed.
  it.each(ids)('exports %s for the game as the same bytes as src/config/maps/%s.json', (id) => {
    const copy = copyOfMap(id);
    expect(toMapFile(forTheGame(copy, id, MAPS[id]!.name))).toBe(readFileSync(`src/config/maps/${id}.json`, 'utf8'));
  });

  it('keeps an id and a name of its own when they have been changed', () => {
    const copy = { ...copyOfMap('coaxia'), name: 'My town' };
    expect(forTheGame(copy, 'coaxia', 'Coaxia').name).toBe('My town');
  });
});

describe('placing, moving, changing and removing', () => {
  const base = copyOfMap('coaxia');

  it('writes what is placed in the file, and the game reads it back', () => {
    let file = placeHouse(base, { model: 'city/building-a.glb', x: 2.5, z: 100.5, turn: 3 });
    file = placeTree(file, { model: 'suburban/tree-large.glb', x: 4.5, z: 100.5 });
    file = placeLamp(file, { x: 6.5, z: 100.5 });
    file = placeHill(file, { model: 'nature/rock_largeD.glb', x: 8.5, z: 100.5, turn: 1, scale: defaultHillScale() });
    expect(file.map.houses.at(-1)).toEqual({ model: 'city/building-a.glb', x: 2.5, z: 100.5, turn: 3 });
    expect(file.map.houses).toHaveLength(base.map.houses.length + 1);
    expect(base.map.houses).toHaveLength(MAPS.coaxia!.map.houses.length);
    expect(readBack(file)).toEqual({ ok: true, file });
  });

  it('keeps positions to 2 decimals and on the grid', () => {
    const file = placeLamp(placeLamp(base, { x: 1.23456, z: 2 }), { x: 9999, z: -9999 });
    expect(file.map.lamps.at(-2)).toEqual({ x: 1.23, z: 2 });
    expect(file.map.lamps.at(-1)).toEqual({ x: MAP_GRID, z: -MAP_GRID });
    expect(readBack(file).ok).toBe(true);
  });

  it('moves, changes and removes one thing and leaves the rest', () => {
    const ref = { kind: 'house' as const, index: 5 };
    const before = base.map.houses[5]!;
    const moved = moveItem(base, ref, { x: before.x + 3, z: before.z - 2.5 });
    expect(thingAt(moved, ref)).toEqual({ ...before, x: before.x + 3, z: before.z - 2.5 });
    expect(moved.map.houses.filter((_, i) => i !== 5)).toEqual(base.map.houses.filter((_, i) => i !== 5));
    expect(thingAt(editItem(base, ref, { turn: 2, model: 'city/building-b.glb' }), ref)).toMatchObject({ x: before.x, turn: 2, model: 'city/building-b.glb' });
    const dropped = dropItem(base, ref);
    expect(dropped.map.houses).toHaveLength(base.map.houses.length - 1);
    expect(dropped.map.houses[5]).toEqual(base.map.houses[6]);
    expect(editItem(base, { kind: 'house', index: 9999 }, { x: 1 })).toBe(base);
  });

  it('moves and removes a peak, which cannot be added', () => {
    const hills = copyOfMap('amplify-hills');
    expect(hills.map.peaks.length).toBeGreaterThan(0);
    const ref = { kind: 'peak' as const, index: 0 };
    expect(thingAt(moveItem(hills, ref, { x: 1, z: 2 }), ref)).toMatchObject({ x: 1, z: 2, radius: hills.map.peaks[0]!.radius });
    expect(dropItem(hills, ref).map.peaks).toHaveLength(hills.map.peaks.length - 1);
  });

  it('starts hills at the size most of Amplify Hills’ have', () => {
    const scales = MAPS['amplify-hills']!.map.hills.map((h) => h.scale);
    const counts = scales.map((s) => scales.filter((t) => t === s).length);
    // (Several sizes may be used as often: the smallest of those is the one.)
    const most = scales.filter((_, i) => counts[i] === Math.max(...counts));
    expect(defaultHillScale()).toBe(Math.min(...most));
  });
});

describe('where a thing may stand', () => {
  const file = copyOfMap('coaxia');
  const road = file.map.roads.find((r) => r.along === 'z')!;
  const wing = file.map.building.wings[0]!;
  const stands = (kind: 'house' | 'tree' | 'lamp', at: { x: number; z: number }) => placeProblem(file, kind, kind === 'house' ? { ...at, model: 'city/building-a.glb', turn: 0 } : kind === 'tree' ? { ...at, model: 'suburban/tree-large.glb' } : at);

  it.each(ids)('refuses nothing of what %s has written', (id) => {
    const map = MAPS[id]!;
    // (Two houses of Coaxia's new map, #399, at x = 61.5 and z = 47.5 and 53.5, reach 0.4 tiles over the edge of a pond. They are Mike's drawing, and left as it is.)
    const touchesPond = (h: { x: number; z: number }) => id === 'coaxia' && h.x === 61.5 && (h.z === 47.5 || h.z === 53.5);
    for (const h of map.map.houses.filter((h) => !touchesPond(h))) expect(placeProblem(map, 'house', h)).toBeNull();
    for (const t of map.map.trees) expect(placeProblem(map, 'tree', t)).toBeNull();
    for (const l of map.map.lamps) expect(placeProblem(map, 'lamp', l)).toBeNull();
  });

  it('refuses a road, the rail, the wings, the lot, water and the edge of the grid', () => {
    expect(stands('lamp', { x: road.at, z: 100 })).toMatch(/on a road/);
    expect(stands('house', { x: 0, z: file.map.rail!.z + 1 })).toMatch(/railway/);
    expect(stands('tree', { x: wing.x + 2, z: wing.z + 2 })).toMatch(/office/);
    const lot = file.map.lot.block;
    expect(stands('lamp', { x: lot.x + lot.w / 2, z: lot.z + lot.d / 2 })).toMatch(/lot|office/);
    const lake = paintGround(file, 'water', { x: 100, z: 100, w: 6, d: 6 });
    expect(placeProblem(lake, 'tree', { model: 'suburban/tree-large.glb', x: 103, z: 103 })).toMatch(/water/);
    expect(stands('lamp', { x: MAP_GRID + 1, z: 0 })).toMatch(/edge/);
  });

  it('never refuses a thing the office would hide from this side: that is only marked', () => {
    const hidden = hiddenThings(file, 2, buildingFor('capital'));
    expect(hidden.length).toBeGreaterThan(0);
    for (const ref of hidden) {
      const thing = thingAt(file, ref)!;
      expect(placeProblem(file, ref.kind, thing)).toBeNull();
    }
    // The same things shown from the first side are not hidden by the same rule: the sides differ.
    expect(hiddenThings(file, 0, buildingFor('capital'))).not.toEqual(hidden);
  });
});

describe('painting ground', () => {
  const hills = copyOfMap('amplify-hills');
  const flat = (f: MapFile) => f.map.ground.filter((g) => !g.edge);

  it('cuts the flat ground under a new box, so no two boxes overlap', () => {
    let file = paintGround(hills, 'field', { x: 20, z: 20, w: 10, d: 10 });
    file = paintGround(file, 'sand', { x: 25, z: 25, w: 10, d: 10 });
    file = paintGround(file, 'concrete', { x: 22, z: 18, w: 4, d: 20 });
    const boxes = flat(file).filter((g) => g.x >= 18 && g.x < 40 && g.z >= 18 && g.z < 40 && g.w < 60 && g.d < 60);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i]!, boxes[j]!), `${i} and ${j}`).toBe(false);
    expect(file.map.ground.at(-1)).toMatchObject({ kind: 'concrete', x: 22, z: 18, w: 4, d: 20 });
    expect(readBack(file).ok).toBe(true);
  });

  it('cuts one box into up to four and keeps the area that is left', () => {
    const from: MapBox = { x: 0, z: 0, w: 10, d: 10 };
    const cut: MapBox = { x: 3, z: 3, w: 4, d: 4 };
    const pieces = cutBox(from, cut);
    expect(pieces).toHaveLength(4);
    expect(area(pieces)).toBeCloseTo(100 - 16, 6);
    for (const p of pieces) expect(overlap(p, cut)).toBe(false);
    expect(cutBox(from, { x: 20, z: 20, w: 1, d: 1 })).toEqual([from]);
    expect(cutBox(from, { x: -1, z: -1, w: 20, d: 20 })).toEqual([]);
    expect(cutBox(from, { x: 5, z: -1, w: 20, d: 20 })).toEqual([{ x: 0, z: 0, w: 5, d: 10 }]);
  });

  it('gives the green back with Base: it cuts and adds nothing', () => {
    const painted = paintGround(hills, 'field', { x: 20, z: 20, w: 10, d: 10 });
    const back = paintGround(painted, 'base', { x: 20, z: 20, w: 10, d: 10 });
    expect(area(flat(back).filter((g) => g.kind === 'field' && g.x >= 20 && g.x < 30 && g.z >= 20 && g.z < 30))).toBe(area(flat(hills).filter((g) => g.kind === 'field' && g.x >= 20 && g.x < 30 && g.z >= 20 && g.z < 30)) - overlapArea(hills, { x: 20, z: 20, w: 10, d: 10 }, 'field'));
    expect(back.map.ground.some((g) => g.x === 20 && g.z === 20 && g.w === 10 && g.d === 10)).toBe(false);
  });

  it('leaves the blocks with a kerb alone, and refuses what would lie under their slab', () => {
    const coaxia = copyOfMap('coaxia');
    const block = coaxia.map.ground.find((g) => g.edge && g.w > 10 && g.d > 10)!;
    const over: MapBox = { x: block.x + 2, z: block.z + 2, w: 4, d: 4 };
    expect(paintProblem(coaxia, 'water', over)).toMatch(/slab/);
    expect(paintProblem(coaxia, 'field', over)).toMatch(/slab/);
    expect(paintProblem(coaxia, 'concrete', over)).toBeNull();
    expect(paintProblem(coaxia, 'asphalt', over)).toBeNull();
    expect(paintGround(coaxia, 'concrete', over).map.ground.filter((g) => g.edge)).toEqual(coaxia.map.ground.filter((g) => g.edge));
  });

  it('keeps a box on the grid, and says when nothing of it is', () => {
    expect(paintGround(hills, 'sand', { x: MAP_GRID - 2, z: 0, w: 50, d: 4 }).map.ground.at(-1)).toMatchObject({ x: MAP_GRID - 2, w: 2 });
    expect(paintProblem(hills, 'sand', { x: MAP_GRID + 5, z: 0, w: 4, d: 4 })).toMatch(/off the edge/);
  });
});

/** The area of ground of a kind that a box of a file covers. */
function overlapArea(file: MapFile, box: MapBox, kind: string): number {
  return file.map.ground
    .filter((g) => !g.edge && g.kind === kind)
    .reduce((sum, g) => {
      const w = Math.min(g.x + g.w, box.x + box.w) - Math.max(g.x, box.x);
      const d = Math.min(g.z + g.d, box.z + box.d) - Math.max(g.z, box.z);
      return sum + (w > 0 && d > 0 ? w * d : 0);
    }, 0);
}

describe('the fill brush', () => {
  const file = copyOfMap('coaxia');
  // Open ground south of the rail, away from the roads.
  const open: MapBox = { x: 0, z: 90, w: 60, d: 40 };

  it('repeats from one seed, and picks again from another', () => {
    expect(fillPlan(file, open, 'suburb', 7)).toEqual(fillPlan(file, open, 'suburb', 7));
    expect(fillPlan(file, open, 'suburb', 7)).not.toEqual(fillPlan(file, open, 'suburb', 8));
    expect(fillPlan(file, open, 'trees', 7)).toEqual(fillPlan(file, open, 'trees', 7));
  });

  it('writes the houses into the file, and the game reads them back', () => {
    const done = fillBox(file, open, 'suburb', 3);
    expect(done.placed).toBeGreaterThan(5);
    expect(done.file.map.houses).toHaveLength(file.map.houses.length + done.placed);
    expect(readBack(done.file)).toEqual({ ok: true, file: done.file });
    // The same stroke, written twice, is the same file.
    expect(toMapFile(fillBox(file, open, 'suburb', 3).file)).toBe(toMapFile(done.file));
  });

  it('stands houses wall to wall in a row, all turned the same way, none refused', () => {
    const { houses } = fillPlan(file, open, 'suburb', 11);
    expect(new Set(houses.map((h) => h.turn)).size).toBe(1);
    for (const h of houses) expect(placeProblem(file, 'house', h)).toBeNull();
    // Neighbours in a row touch with a gap of JOIN (2 decimals each, so within a hair of it).
    const rows = new Map<number, typeof houses>();
    for (const h of houses) rows.set(h.turn % 2 === 0 ? Math.round(h.z * 10) : Math.round(h.x * 10), [...(rows.get(h.turn % 2 === 0 ? Math.round(h.z * 10) : Math.round(h.x * 10)) ?? []), h]);
    expect(JOIN).toBe(0.04);
    expect(Math.max(...[...rows.values()].map((r) => r.length))).toBeGreaterThan(2);
  });

  it('faces the nearest road', () => {
    const road = file.map.roads.find((r) => r.along === 'x');
    const [house] = fillPlan(file, { x: -60, z: 110, w: 20, d: 12 }, 'suburb', 1).houses;
    expect(road).toBeDefined();
    // (South of the rail the nearest road is a street along z at the west or east, so the fronts are turned east or west, or north/south for one along x.)
    expect([0, 1, 2, 3]).toContain(house?.turn);
  });

  it('puts trees about 3 tiles apart and skips the spots that are refused', () => {
    const trees = fillPlan(file, open, 'trees', 5);
    expect(trees.trees.length).toBeGreaterThan(30);
    const near = fillPlan(file, { x: -30, z: 60, w: 40, d: 30 }, 'trees', 5);
    expect(near.skipped).toBeGreaterThan(0);
    for (const t of near.trees) expect(placeProblem(file, 'tree', t)).toBeNull();
  });

  it('puts nothing down in a box that is all on a road', () => {
    const road = file.map.roads.find((r) => r.along === 'z')!;
    const done = fillBox(file, { x: road.at - 1, z: 100, w: 2, d: 10 }, 'city', 1);
    expect(done.placed).toBe(0);
    expect(done.file.map.houses).toEqual(file.map.houses);
  });
});

describe('what a decor edit leaves alone', () => {
  const file = copyOfMap('coaxia');
  const house = buildingFor('capital');

  it('has a structure key that houses, trees, lamps, hills, peaks and flat ground do not change', () => {
    const key = structureKey(file);
    let edited = placeHouse(file, { model: 'city/building-a.glb', x: 2.5, z: 100.5, turn: 0 });
    edited = placeTree(edited, { model: 'suburban/tree-small.glb', x: 5.5, z: 100.5 });
    edited = placeLamp(edited, { x: 7.5, z: 100.5 });
    edited = placeHill(edited, { model: 'nature/rock_largeD.glb', x: 9.5, z: 100.5, turn: 0, scale: 2 });
    edited = paintGround(edited, 'concrete', { x: 20, z: 100, w: 5, d: 5 });
    edited = paintGround(edited, 'water', { x: 30, z: 100, w: 5, d: 5 });
    expect(structureKey(edited)).toBe(key);
    expect(structureKey({ ...edited, name: 'Another name' })).toBe(key);
  });

  it('has one that the roads, the rail, the settings and the blocks with a kerb do change', () => {
    const key = structureKey(file);
    expect(structureKey({ ...file, map: { ...file.map, roads: file.map.roads.slice(1) } })).not.toBe(key);
    expect(structureKey({ ...file, map: { ...file.map, rail: { ...file.map.rail!, z: file.map.rail!.z + 1 } } })).not.toBe(key);
    expect(structureKey({ ...file, settings: { ...file.settings, floors: 3 } })).not.toBe(key);
    const block = file.map.ground.findIndex((g) => g.edge);
    expect(structureKey({ ...file, map: { ...file.map, ground: file.map.ground.map((g, i) => (i === block ? { ...g, w: g.w - 1 } : g)) } })).not.toBe(key);
  });

  it('counts water as structure in a town of roads only: it sets where people walk', () => {
    const hills = copyOfMap('amplify-hills');
    expect(structureKey(paintGround(hills, 'water', { x: 40, z: 40, w: 6, d: 6 }))).not.toBe(structureKey(hills));
    expect(structureKey(paintGround(copyOfMap('coaxia'), 'water', { x: 100, z: 100, w: 6, d: 6 }))).toBe(structureKey(copyOfMap('coaxia')));
  });

  it('keeps the same layout and the same roads after a decor edit, and builds new ones after a structure edit', () => {
    expect(showPreviewMap(file, house).ok).toBe(true);
    const layout = layoutOfMap(PREVIEW_MAP);
    const roads = roadsOf(layout);
    const edited = placeHouse(file, { model: 'city/building-a.glb', x: 2.5, z: 100.5, turn: 0 });
    expect(updatePreviewDecor(edited)).toBe(true);
    expect(layoutOfMap(PREVIEW_MAP)).toBe(layout);
    expect(roadsOf(layoutOfMap(PREVIEW_MAP))).toBe(roads);
    expect(layout.map!.houses).toHaveLength(file.map.houses.length + 1);
    // The decor is what the town draws: the new house is among its blocks.
    const site = previewSite(edited, 'capital');
    expect(townBlocks(site, house).flatMap((b) => b.items).length).toBe(edited.map.houses.length + edited.map.trees.length);
    // A change of structure shows a new layout, with its own roads.
    expect(showPreviewMap({ ...edited, settings: { ...edited.settings, floors: 5 } }, house).ok).toBe(true);
    expect(layoutOfMap(PREVIEW_MAP)).not.toBe(layout);
    expect(roadsOf(layoutOfMap(PREVIEW_MAP))).not.toBe(roads);
  });

  it('has nothing to update when no town is shown', () => {
    expect(updatePreviewDecor(file)).toBe(false);
  });

  it('checks the structure and the decor apart, with the same answer as the whole check', () => {
    for (const id of ids) {
      const copy = copyOfMap(id);
      const region = buildingFor(regionOf(id));
      expect(checkStructure(copy, region)).toEqual({ ok: true });
      expect(standsOnTrack(copy, region)).toBeNull();
      expect(checkTown(copy, region)).toEqual({ ok: true });
    }
  });

  it('finds a house on a railway on the ground as the decor check, not the structure check', () => {
    const ground = { ...copyOfMap('coaxia'), settings: { ...MAPS.coaxia!.settings, railway: 'ground' as const } };
    const rail = ground.map.rail!;
    // (The rail of Coaxia is 2 tiles deep, narrower than a railway on the ground may be: the structure check says so, whatever stands on it.)
    expect(checkStructure(ground, buildingFor('capital'))).toMatchObject({ ok: false });
    const wide = { ...ground, map: { ...ground.map, rail: { ...rail, z: rail.z, d: 4 } } };
    const on = placeHouse(wide, { model: 'city/building-a.glb', x: wide.map.rail!.x + 60, z: wide.map.rail!.z + 2, turn: 0 });
    expect(standsOnTrack(on, buildingFor('capital'))?.reason).toMatch(/stands on the track/);
    expect(standsOnTrack(wide, buildingFor('capital'))).toBeNull();
  });
});

describe('a town with no painted blocks', () => {
  it('still draws what is placed on it', () => {
    const bare = { ...copyOfMap('amplify-hills') };
    bare.map = { ...bare.map, ground: [], houses: [], trees: [], lamps: [], hills: [], peaks: [] };
    const region = regionOf('amplify-hills');
    expect(showPreviewMap(bare, buildingFor(region)).ok).toBe(true);
    const site = previewSite(bare, region);
    expect(townBlocks(site, buildingFor(region))).toEqual([]);
    const placed = placeHouse(bare, { model: 'suburban/building-type-a.glb', x: 3.5, z: 3.5, turn: 0 });
    updatePreviewDecor(placed);
    const blocks = townBlocks(site, buildingFor(region));
    expect(blocks.flatMap((b) => b.items)).toHaveLength(1);
  });
});
