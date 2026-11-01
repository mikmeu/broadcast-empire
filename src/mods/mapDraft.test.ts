import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAPS } from '../config/maps';
import { checkTown } from '../office/townCheck';
import { byRoads, houseOf, layoutFromMap } from '../office/townLayout';
import { roadsOf } from '../office/traffic';
import { addStreet, checkDraft, copyOfDefault, drop, edit, forTheGame, itemsOf, move, newMap, put, resize, strokeOf, streetOf, stretchStreet, textOf, townKindOf, type Kind, type StreetKind } from './mapDraft';
import { checkMapFile, type MapFile } from './mapFile';

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

/** A small town of roads made only with the tools, on the wings of the hills building. */
function townOfRoads(): MapFile {
  let file = newMap();
  for (const wing of [box(18, 27, 55, 10), box(73, 0, 18, 37), box(0, 0, 18, 37)]) file = put(file, 'wing', wing);
  file = put(file, 'reception', box(40, 37, 11, 10));
  file = put(file, 'parking', box(51, 37, 40, 10));
  file = put(file, 'parking', box(0, 37, 40, 10));
  file = put(file, 'railway', box(-54, 57, 200, 2));
  file = addStreet(file, { x: -36, y: -22 }, { x: -36, y: 49 }, 'road');
  file = addStreet(file, { x: -33, y: 48 }, { x: 96, y: 48 }, 'road');
  file = addStreet(file, { x: 97, y: 28 }, { x: 97, y: 49 }, 'road');
  file = addStreet(file, { x: 97, y: 26 }, { x: 145, y: 26 }, 'road');
  return file;
}

/** A small town in a grid made only with the tools, on the wings of Transponder Valley. */
function townInAGrid(): MapFile {
  let file = newMap();
  for (const wing of [box(0, 0, 26, 21), box(26, 0, 11, 11)]) file = put(file, 'wing', wing);
  file = put(file, 'reception', box(26, 11, 11, 10));
  file = put(file, 'parking', box(0, -12, 37, 12));
  file = put(file, 'railway', box(-83, 62, 200, 2));
  file = addStreet(file, { x: 39, y: -51 }, { x: 39, y: 57 }, 'two-way');
  file = addStreet(file, { x: -83, y: -51 }, { x: 116, y: -51 }, 'two-way');
  file = addStreet(file, { x: -83, y: 51 }, { x: 116, y: 51 }, 'dual');
  file = addStreet(file, { x: 86, y: 107 }, { x: 86, y: -79 }, 'one-way');
  file = put(file, 'building', box(-65, 27, 37, 23));
  file = put(file, 'building', box(45, 7, 37, 42));
  return file;
}

describe('the five default maps in the draft', () => {
  // The editor's "Export for the game" must give back the files of src/config/maps, byte for byte (they replace the drawings).
  it.each(Object.keys(MAPS))('%s comes back from the draft as the file it is', (id) => {
    const original = MAPS[id]!;
    const copy = copyOfDefault(original, []);
    expect(copy.id).toBe(`${id}-copy`);
    expect(copy.name).toBe(`${original.name} (copy)`);
    expect(textOf(forTheGame(copy, original.id, original.name))).toBe(readFileSync(new URL(`../config/maps/${id}.json`, import.meta.url), 'utf8'));
  });

  it('keeps the name the player gave a copy', () => {
    const copy = { ...copyOfDefault(MAPS.coaxia!), name: 'Big Coaxia' };
    expect(forTheGame(copy, 'coaxia', 'Coaxia').name).toBe('Big Coaxia');
  });

  it('gives a copy a free id', () => {
    expect(copyOfDefault(MAPS.coaxia!, ['coaxia-copy']).id).toBe('coaxia-copy-2');
  });
});

describe('a town made only with the tools', () => {
  it('in a grid passes the check the game runs on a town', () => {
    const file = townInAGrid();
    expect(checkDraft(file)).toEqual({ ok: true });
    expect(byRoads(file.map)).toBe(false);
    expect(townKindOf(file)).toBe('grid');
  });

  it('of roads passes it too', () => {
    const file = townOfRoads();
    expect(checkDraft(file)).toEqual({ ok: true });
    expect(byRoads(file.map)).toBe(true);
    expect(townKindOf(file)).toBe('roads');
  });

  it('is a file the game reads back, the same text', () => {
    for (const file of [townInAGrid(), townOfRoads()]) {
      const read = checkMapFile(JSON.parse(textOf(file)));
      expect(read).toEqual({ ok: true, file });
    }
  });

  it('says what is missing from a map that is not finished', () => {
    expect(checkDraft(newMap())).toMatchObject({ ok: false, reason: expect.stringMatching(/no roads/) });
    const noRailway = { ...townInAGrid(), map: { ...townInAGrid().map, train: null } };
    expect(checkDraft(noRailway)).toMatchObject({ ok: false, reason: expect.stringMatching(/no railway/) });
  });

  it('refuses an id the folder cannot hold', () => {
    expect(checkDraft({ ...townInAGrid(), id: 'Big Town!' })).toMatchObject({ ok: false, reason: expect.stringMatching(/id must be/) });
  });
});

describe('the street tools', () => {
  const laneKinds: Record<'grid' | 'roads', StreetKind[]> = { grid: ['two-way', 'one-way', 'dual'], roads: ['road'] };

  it.each(laneKinds.grid)('%s leaves a town in a grid a grid', (kind) => {
    const file = addStreet(townInAGrid(), { x: -60, y: 20 }, { x: 100, y: 20 }, kind);
    expect(byRoads(file.map)).toBe(false);
    const across = addStreet(townInAGrid(), { x: -20, y: -60 }, { x: -20, y: 40 }, kind);
    expect(byRoads(across.map)).toBe(false);
  });

  it.each(laneKinds.roads)('%s leaves a town of roads a town of roads', (kind) => {
    expect(byRoads(addStreet(townOfRoads(), { x: 10, y: 48 }, { x: 10, y: 20 }, kind).map)).toBe(true);
  });

  it('puts down whole streets: pairs of 2-tile lanes in a grid, one lane in a town of roads', () => {
    const blank = newMap();
    expect(addStreet(blank, { x: 0, y: 5 }, { x: 9, y: 5 }, 'two-way').map.lanes).toEqual([
      { x: 0, y: 5, w: 10, h: 2, dir: 'both' },
      { x: 0, y: 7, w: 10, h: 2, dir: 'both' },
    ]);
    expect(addStreet(blank, { x: 3, y: 0 }, { x: 3, y: 4 }, 'road').map.lanes).toEqual([{ x: 3, y: 0, w: 2, h: 5, dir: 'both' }]);
    expect(addStreet(blank, { x: 3, y: 0 }, { x: 3, y: 4 }, 'driveway').map.lanes).toEqual([{ x: 3, y: 0, w: 1, h: 5, dir: 'both' }]);
    expect(addStreet(blank, { x: 0, y: 0 }, { x: 0, y: 0 }, 'dual').map.lanes).toHaveLength(4);
  });

  it('sends a one-way street the way the stroke went', () => {
    const dirs = (from: [number, number], to: [number, number]) => addStreet(newMap(), { x: from[0], y: from[1] }, { x: to[0], y: to[1] }, 'one-way').map.lanes.map((l) => l.dir);
    expect(dirs([0, 0], [9, 0])).toEqual(['east', 'east']);
    expect(dirs([9, 0], [0, 0])).toEqual(['west', 'west']);
    expect(dirs([0, 0], [0, 9])).toEqual(['south', 'south']);
    expect(dirs([0, 9], [0, 0])).toEqual(['north', 'north']);
  });

  it('follows the longer way of a drag', () => {
    expect(strokeOf({ x: 2, y: 2 }, { x: 8, y: 3 })).toMatchObject({ vertical: false, start: 2, length: 7, at: 2 });
    expect(strokeOf({ x: 2, y: 2 }, { x: 3, y: 8 })).toMatchObject({ vertical: true, start: 2, length: 7, at: 2 });
  });

  /** The lanes of the busy streets as they are driven, of one axis, by their place across the street, north to south or west to east. */
  const driven = (file: MapFile, along: 'x' | 'z') => roadsOf(layoutFromMap(file, houseOf(file))).lanes.filter((l) => l.along === along).sort((p, q) => p.at - q.at);

  it('drives a dual carriageway on the right, however it is drawn', () => {
    // East is +1: the carriageway on the south side (larger z) of a road heads east, the north side west.
    expect(driven(townInAGrid(), 'x').filter((l) => l.at > 51 && l.at < 60).map((l) => l.direction)).toEqual([-1, -1, 1, 1]);
    // South is +1: the west side of a road heads south, the east side north (the street beside the office keeps a lane each way).
    const beside = townInAGrid();
    const dual = { ...beside, map: { ...beside.map, lanes: beside.map.lanes.filter((l) => l.x !== 39) } };
    expect(driven(addStreet(dual, { x: 39, y: -51 }, { x: 39, y: 57 }, 'dual'), 'z').map((l) => l.direction)).toEqual([1, -1]);
  });

  it('drives a one-way street one way', () => {
    const oneWays = (file: MapFile) => layoutFromMap(file, houseOf(file)).map!.oneWays.filter((s) => s.along === 'z');
    // The street at x = 86 was dragged from south to north.
    expect(oneWays(townInAGrid()).map((s) => s.lanes!.map((l) => l.direction))).toEqual([[-1, -1]]);
    const south = addStreet(townInAGrid(), { x: 120, y: -79 }, { x: 120, y: 107 }, 'one-way');
    expect(oneWays(south).map((s) => s.lanes!.map((l) => l.direction))).toEqual([[-1, -1], [1, 1]]);
  });
});

describe('putting things down, moving and removing them', () => {
  it('puts a box in its list, and replaces the one of a kind a map has only one of', () => {
    let file = put(newMap(), 'green', box(0, 0, 4, 4));
    file = put(file, 'green', box(5, 0, 4, 4));
    expect(file.map.greens).toHaveLength(2);
    file = put(file, 'reception', box(1, 1, 2, 2));
    file = put(file, 'reception', box(3, 3, 2, 2));
    expect(file.map.reception).toEqual(box(3, 3, 2, 2));
    file = put(file, 'busStop', { x: 1, y: 1 });
    file = put(file, 'fountain', { x: 2, y: 2 });
    expect(file.map.busStop).toEqual({ x: 1, y: 1 });
    expect(file.map.courtyard.fountain).toEqual({ x: 2, y: 2 });
  });

  it('keeps every kind in the list the file has for it', () => {
    const kinds: [Kind, (f: MapFile) => unknown][] = [
      ['building', (f) => f.map.buildings], ['alley', (f) => f.map.alleys], ['mountains', (f) => f.map.mountains], ['green', (f) => f.map.greens],
      ['concrete', (f) => f.map.concrete], ['beach', (f) => f.map.beach], ['water', (f) => f.map.water], ['parking', (f) => f.map.parking],
      ['wing', (f) => f.map.wings], ['courtyardParking', (f) => f.map.courtyard.parking], ['courtyardGreen', (f) => f.map.courtyard.green],
    ];
    for (const [kind, list] of kinds) {
      const file = put(newMap(), kind, box(2, 3, 4, 5));
      expect(list(file), kind).toEqual([box(2, 3, 4, 5)]);
      expect(itemsOf(file.map, kind), kind).toEqual([box(2, 3, 4, 5)]);
    }
    expect(put(newMap(), 'tree', { x: 1, y: 2 }).map.trees).toEqual([{ x: 1, y: 2 }]);
    expect(put(newMap(), 'lamp', { x: 1, y: 2 }).map.lamps).toEqual([{ x: 1, y: 2 }]);
    const model = { x: 4, y: 4, model: 'suburban/building-type-a.glb', turn: 1 };
    expect(put(newMap(), 'model', model).map.placed).toEqual([model]);
    expect(checkMapFile(JSON.parse(textOf(put(newMap(), 'model', model)))).ok).toBe(true);
  });

  it('moves, resizes and removes', () => {
    let file = put(put(newMap(), 'green', box(0, 0, 4, 4)), 'green', box(10, 10, 2, 2));
    file = move(file, { kind: 'green', index: 0 }, 3, -1);
    expect(file.map.greens[0]).toEqual(box(3, -1, 4, 4));
    file = resize(file, { kind: 'green', index: 1 }, box(10, 10, 0, 6));
    expect(file.map.greens[1]).toEqual(box(10, 10, 1, 6));
    file = drop(file, { kind: 'green', index: 0 });
    expect(file.map.greens).toEqual([box(10, 10, 1, 6)]);
    file = drop(put(file, 'reception', box(0, 0, 2, 2)), { kind: 'reception', index: 0 });
    expect(file.map.reception).toBeNull();
  });

  it('changes a model or the way a lane goes without touching the rest', () => {
    const file = addStreet(newMap(), { x: 0, y: 0 }, { x: 9, y: 0 }, 'one-way');
    const turned = edit(file, { kind: 'lane', index: 0 }, { dir: 'west' });
    expect(turned.map.lanes.map((l) => l.dir)).toEqual(['west', 'east']);
  });

  it('treats the lanes of a street as one: they move, shorten and go together', () => {
    let file = addStreet(addStreet(newMap(), { x: 0, y: 0 }, { x: 9, y: 0 }, 'dual'), { x: 0, y: 20 }, { x: 9, y: 20 }, 'two-way');
    expect(streetOf(file.map, 0)).toEqual([0, 1, 2, 3]);
    expect(streetOf(file.map, 5)).toEqual([4, 5]);
    file = move(file, { kind: 'lane', index: 1 }, 0, 2);
    expect(file.map.lanes.slice(0, 4).map((l) => l.y)).toEqual([2, 4, 7, 9]);
    file = stretchStreet(file, 4, 0, 4);
    expect(file.map.lanes.slice(4).map((l) => l.w)).toEqual([4, 4]);
    expect(file.map.lanes[0]!.w).toBe(10);
    file = drop(file, { kind: 'lane', index: 2 });
    expect(file.map.lanes).toHaveLength(2);
  });

  it('does not change the file it was given', () => {
    const file = townInAGrid();
    const before = textOf(file);
    put(file, 'green', box(0, 0, 3, 3));
    drop(file, { kind: 'lane', index: 0 });
    move(file, { kind: 'wing', index: 0 }, 5, 5);
    expect(textOf(file)).toBe(before);
    expect(checkTown(file).ok).toBe(true);
  });
});
