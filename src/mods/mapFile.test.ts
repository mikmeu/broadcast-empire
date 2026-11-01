import { describe, expect, it } from 'vitest';
import { MAPS } from '../config/maps';
import { MAP_FORMAT, checkMapFile, toMapFile, type MapFile } from './mapFile';

const good = (): MapFile => structuredClone(MAPS.coaxia!);
/** A file with one change, as text read back from disk. */
const changed = (change: (file: any) => void): unknown => {
  const file = JSON.parse(JSON.stringify(good()));
  change(file);
  return file;
};
const reason = (raw: unknown): string => {
  const checked = checkMapFile(raw);
  if (checked.ok) throw new Error('The file was accepted');
  return checked.reason;
};

describe('the map file', () => {
  it('accepts the default towns', () => {
    for (const file of Object.values(MAPS)) expect(checkMapFile(file).ok, file.id).toBe(true);
  });

  it('is written the same way every time, and reads back the same', () => {
    for (const file of Object.values(MAPS)) {
      const text = toMapFile(file);
      expect(toMapFile(file)).toBe(text);
      const back = checkMapFile(JSON.parse(text));
      expect(back).toEqual({ ok: true, file });
      expect(toMapFile((back as { file: MapFile }).file)).toBe(text);
    }
  });

  it('writes one box to a line', () => {
    expect(toMapFile(good())).toContain('\n      { "x": ');
  });

  it('refuses what it is not', () => {
    expect(reason('text')).toMatch(/file is missing/);
    expect(reason(changed((f) => delete f.map))).toMatch(/map is missing/);
    expect(reason(changed((f) => delete f.settings))).toMatch(/settings is missing/);
  });

  it('refuses a newer format', () => {
    expect(reason(changed((f) => (f.format = MAP_FORMAT + 1)))).toMatch(/format 2/);
    expect(reason(changed((f) => delete f.format))).toMatch(/format number/);
  });

  it('refuses a bad id or name', () => {
    expect(reason(changed((f) => (f.id = 'Coaxia!')))).toMatch(/id must be/);
    expect(reason(changed((f) => (f.name = '')))).toMatch(/needs a name/);
  });

  it('refuses boxes that are not whole tiles or have no size', () => {
    expect(reason(changed((f) => (f.map.buildings[0].x = 1.5)))).toMatch(/Building 1 must be on whole tiles/);
    expect(reason(changed((f) => (f.map.wings[0].w = 0)))).toMatch(/Wing 1 has no width or height/);
    expect(reason(changed((f) => (f.map.lanes[0].h = -2)))).toMatch(/Lane 1 has no width or height/);
    expect(reason(changed((f) => (f.map.busStop = { x: 1, y: 'a' })))).toMatch(/bus stop must be on whole tiles/);
  });

  it('refuses a lane that goes a way the game does not know', () => {
    expect(reason(changed((f) => (f.map.lanes[2].dir = 'up')))).toMatch(/Lane 3 goes "up"/);
  });

  it('refuses a train piece that is not in the Train Kit, and the wrong number of pieces', () => {
    expect(reason(changed((f) => (f.settings.train[1] = 'train-rocket')))).toMatch(/"train-rocket" is not in the Train Kit/);
    expect(reason(changed((f) => f.settings.train.pop(), ))).toMatch(/3 pieces; it takes 4 to 6/);
    expect(reason(changed((f) => f.settings.train.push('train-diesel-a', 'train-diesel-a', 'train-diesel-a')))).toMatch(/7 pieces/);
  });

  it('accepts four, five and six pieces', () => {
    for (const length of [4, 5, 6]) {
      expect(checkMapFile(changed((f) => (f.settings.train = Array.from({ length }, () => 'train-carriage-coal')))).ok).toBe(true);
    }
  });

  it('refuses a vehicle mix that does not add up to 1', () => {
    expect(reason(changed((f) => (f.settings.traffic.mix.car = 0.9)))).toMatch(/adds up to 1\.22; it must add up to 1/);
    expect(reason(changed((f) => delete f.settings.traffic.mix.van))).toMatch(/share of vans/);
    expect(reason(changed((f) => (f.settings.traffic.every = 0)))).toMatch(/seconds between/);
  });

  it('reads where the bus stops, and fills it in when the file has none', () => {
    expect(MAPS.coaxia!.settings.busStop).toEqual({ from: 'drawing' });
    expect(MAPS['aerial-fields']!.settings.busStop).toEqual({ from: 'entrance', shift: -6.5 });
    const read = (change: (f: any) => void) => (checkMapFile(changed(change)) as { file: MapFile }).file.settings.busStop;
    expect(read((f) => delete f.settings.busStop)).toEqual({ from: 'drawing' });
    expect(read((f) => (delete f.settings.busStop, (f.map.busStop = null)))).toEqual({ from: 'entrance', shift: 0 });
    expect(read((f) => (f.settings.busStop = { from: 'entrance', shift: 3 }))).toEqual({ from: 'entrance', shift: 3 });
  });

  it('refuses a bus stop rule it does not know', () => {
    expect(reason(changed((f) => (f.settings.busStop = { from: 'roof' })))).toMatch(/"roof".*drawing or entrance/);
    expect(reason(changed((f) => (f.settings.busStop = { from: 'entrance' })))).toMatch(/needs a shift/);
    expect(reason(changed((f) => (f.settings.busStop = { from: 'entrance', shift: 'left' })))).toMatch(/needs a shift/);
  });

  it('refuses floors outside 1 to 6', () => {
    expect(reason(changed((f) => (f.settings.floors = 0)))).toMatch(/floors/);
    expect(reason(changed((f) => (f.settings.floors = 7)))).toMatch(/floors/);
    expect(reason(changed((f) => (f.settings.floors = 2.5)))).toMatch(/floors/);
    expect(checkMapFile(changed((f) => (f.settings.floors = 1))).ok).toBe(true);
  });
});
