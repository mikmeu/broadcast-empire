import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MODS } from '../config/balance';
import { MAPS } from '../config/maps';
import { MAP_FORMAT, MAP_GRID, checkMapFile, toMapFile, type MapFile } from './mapFile';
import { OLD_MAPS } from './oldMaps';
import { readMapFile, TOWN_SEED, convertOldMap } from './oldMap';
import { toOldMapFile } from './oldMapFile';

const reason = (change: (f: any) => void): string => {
  const raw = structuredClone(JSON.parse(toMapFile(MAPS.coaxia!)));
  change(raw);
  const checked = checkMapFile(raw);
  if (checked.ok) throw new Error('The file was accepted');
  return checked.reason;
};

describe('map format 2 (#327)', () => {
  it('is what the five default files are, and reads back as the same text', () => {
    for (const [id, file] of Object.entries(MAPS)) {
      const text = readFileSync(new URL(`../config/maps/${id}.json`, import.meta.url), 'utf8');
      expect(file.format, id).toBe(MAP_FORMAT);
      expect(toMapFile(file), id).toBe(text);
      const back = checkMapFile(JSON.parse(text));
      expect(back.ok, id).toBe(true);
      expect(toMapFile((back as { file: MapFile }).file), id).toBe(text);
    }
  });

  it('writes the same text every time, an entry to a line', () => {
    const text = toMapFile(MAPS.coaxia!);
    expect(toMapFile(MAPS.coaxia!)).toBe(text);
    expect(text).toContain('\n    "roads": [\n      { "along"');
  });

  it('says how big each of the five files is, and keeps them far inside what a map may be (a size report)', () => {
    const sizes = Object.fromEntries(Object.entries(MAPS).map(([id, file]) => [id, toMapFile(file).length]));
    // eslint-disable-next-line no-console
    console.log(`Map file sizes (bytes): ${JSON.stringify(sizes)}`);
    for (const [id, size] of Object.entries(sizes)) expect(size, id).toBeLessThan(MODS.mapBytes / 4);
  });

  it('has every position on the grid every map has, to two decimals', () => {
    for (const [id, file] of Object.entries(MAPS)) {
      const numbers: number[] = [];
      const walk = (v: unknown, key = ''): void => {
        if (typeof v === 'number' && ['x', 'z', 'w', 'd', 'at', 'from', 'to', 'pos'].includes(key)) numbers.push(v);
        else if (Array.isArray(v)) v.forEach((e) => walk(e, key));
        else if (v && typeof v === 'object') Object.entries(v).forEach(([k, e]) => walk(e, k));
      };
      walk(file.map);
      for (const n of numbers) {
        expect(Math.abs(n), id).toBeLessThanOrEqual(MAP_GRID * 2);
        expect(Math.abs(n * 100 - Math.round(n * 100)), id).toBeLessThan(1e-6);
      }
    }
  });

  it('refuses a file in words: a newer or older format, positions with too many decimals, an unknown model, lane or ground', () => {
    expect(reason((f) => (f.format = MAP_FORMAT + 1))).toMatch(/format 3/);
    expect(reason((f) => (f.format = 1))).toMatch(/older one/);
    expect(reason((f) => (f.map.houses[0].x = 1.234))).toMatch(/at most 2 decimals/);
    expect(reason((f) => (f.map.houses[0].model = 'nope'))).toMatch(/model the game does not know/);
    expect(reason((f) => (f.map.houses[0].turn = 4))).toMatch(/quarter turns/);
    expect(reason((f) => (f.map.roads[0].lanes = [{ at: 0, direction: 2 }]))).toMatch(/lane 1 goes 2/);
    expect(reason((f) => (f.map.ground[0].kind = 'lava'))).toMatch(/does not know/);
    expect(reason((f) => (f.map.roads[0].traffic = 'yes'))).toMatch(/whether it carries traffic/);
    expect(reason((f) => (f.settings.layout = 'maze'))).toMatch(/grid or roads/);
    expect(reason((f) => (f.settings.shore = 1))).toMatch(/shore/);
    expect(reason((f) => (f.map.houses[0].x = 5000))).toMatch(/far off the grid/);
    expect(reason((f) => (f.map.building.faces = 'e'))).toMatch(/w, n or s/);
  });
});

describe('reading a file that comes in from outside (#327)', () => {
  it('reads format 2 as it is', () => {
    const read = readMapFile(JSON.parse(toMapFile(MAPS.coaxia!)));
    expect(read).toEqual({ ok: true, file: MAPS.coaxia });
  });

  it('converts format 1 with the seed of the default towns and the look of the first region laid out the same way', () => {
    const read = readMapFile(JSON.parse(toOldMapFile(OLD_MAPS.coaxia!)));
    expect(read.ok).toBe(true);
    // (Coax City under its own name is the capital's town as it is written.)
    expect(read).toEqual(convertOldMap(OLD_MAPS.coaxia!, { seed: TOWN_SEED, region: 'capital' }));
    expect((read as { file: MapFile }).file.map).toEqual(MAPS.coaxia!.map);
  });

  it('turns a bad older file away with its reason', () => {
    const raw = JSON.parse(toOldMapFile(OLD_MAPS.coaxia!));
    raw.map.wings = [{ x: 0.5, y: 0, w: 2, h: 2 }];
    const read = readMapFile(raw);
    expect(read.ok).toBe(false);
  });
});

describe('the five files are the five drawings converted once from the seed 1970 (#327)', () => {
  it.each(Object.keys(OLD_MAPS))('%s', (id) => {
    const region = { coaxia: 'capital', 'transponder-valley': 'north', 'skywave-beach': 'coast', 'aerial-fields': 'heartland', 'amplify-hills': 'highlands' }[id]! as 'capital';
    expect(convertOldMap(OLD_MAPS[id]!, { seed: TOWN_SEED, region })).toEqual({ ok: true, file: MAPS[id] });
  });
});

describe('go-via points and walking paths (#330)', () => {
  const withRoutes = (): MapFile => {
    const file = structuredClone(MAPS.coaxia!);
    file.map.stops.bus.via = [{ x: 25, z: 0.5 }, { x: 25, z: 30.5 }];
    file.map.walks = [[{ x: 10, z: 10 }, { x: 14.5, z: 10 }, { x: 14.5, z: 20 }]];
    return file;
  };

  it('are left out of the five files, which keep their text', () => {
    for (const [id, file] of Object.entries(MAPS)) {
      expect(file.map.stops.bus, id).not.toHaveProperty('via');
      expect(file.map, id).not.toHaveProperty('walks');
      expect(toMapFile(file), id).not.toMatch(/"via"|"walks"/);
    }
  });

  it('are written and read back as the same file, and an older file reads as it did', () => {
    const file = withRoutes();
    const text = toMapFile(file);
    expect(text).toContain('"via"');
    expect(text).toContain('"walks"');
    const back = checkMapFile(JSON.parse(text));
    expect(back.ok).toBe(true);
    expect((back as { file: MapFile }).file).toEqual(file);
    expect(toMapFile((back as { file: MapFile }).file)).toBe(text);
    // A file with neither is the file as it was.
    const plain = checkMapFile(JSON.parse(toMapFile(MAPS.coaxia!)));
    expect(plain.ok).toBe(true);
    expect((plain as { file: MapFile }).file.map.walks).toBeUndefined();
  });

  it('leave an empty list out, so the file stays the same', () => {
    const raw = JSON.parse(toMapFile(MAPS.coaxia!));
    raw.map.stops.bus.via = [];
    raw.map.walks = [];
    const read = checkMapFile(raw);
    expect(read.ok).toBe(true);
    expect(toMapFile((read as { file: MapFile }).file)).toBe(toMapFile(MAPS.coaxia!));
  });

  it('turn a bad list away with its reason', () => {
    expect(reason((f) => (f.map.stops.bus.via = Array.from({ length: 9 }, (_, n) => ({ x: n, z: 0 }))))).toMatch(/via 9 points; it takes up to 8/);
    expect(reason((f) => (f.map.stops.bus.via = [{ x: 1.234, z: 0 }]))).toMatch(/via 1: x must be a number with at most 2 decimals/);
    expect(reason((f) => (f.map.walks = [[{ x: 1, z: 1 }]]))).toMatch(/Walking path 1 needs at least 2 points/);
    expect(reason((f) => (f.map.walks = 'a'))).toMatch(/must be a list/);
  });
});
