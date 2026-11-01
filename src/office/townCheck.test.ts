import { describe, expect, it } from 'vitest';
import { MAPS } from '../config/maps';
import type { MapFile } from '../mods/mapFile';
import { DOOR_REACH, checkTown } from './townCheck';
import { houseOf, layoutFromMap } from './townLayout';
import { roadsOf } from './traffic';

const copy = (id: string, change: (file: MapFile) => void): MapFile => {
  const file = structuredClone(MAPS[id]!);
  change(file);
  return file;
};
const reason = (file: MapFile): string => {
  const checked = checkTown(file);
  if (checked.ok) throw new Error('The town was accepted');
  return checked.reason;
};

describe('the map check (#283)', () => {
  it('accepts the five default towns', () => {
    for (const file of Object.values(MAPS)) expect(checkTown(file), file.id).toEqual({ ok: true });
  });

  it('keeps the doors of the five towns well inside its reach', () => {
    for (const file of Object.values(MAPS)) {
      const layout = layoutFromMap(file);
      const wait = roadsOf(layout).busStop.wait;
      const walk = Math.hypot(layout.places.gate.x - wait.x, layout.places.gate.z - wait.z);
      expect(walk, file.id).toBeLessThan(DOOR_REACH);
    }
    expect(houseOf(MAPS.coaxia!).id).toBeDefined();
  });

  it('refuses a map without roads, wings, a railway or a parking strip', () => {
    expect(reason(copy('coaxia', (f) => (f.map.lanes = [])))).toMatch(/no roads/);
    expect(reason(copy('coaxia', (f) => (f.map.wings = [])))).toMatch(/no wings/);
    expect(reason(copy('amplify-hills', (f) => (f.map.wings = [])))).toMatch(/no wings/);
    expect(reason(copy('coaxia', (f) => (f.map.wings = f.map.wings.map((w) => ({ ...w, w: 3, h: 9 })))))).toMatch(/east to west/);
    expect(reason(copy('coaxia', (f) => (f.map.train = null)))).toMatch(/no railway/);
    expect(reason(copy('coaxia', (f) => ((f.map.parking = []), (f.map.courtyard.parking = []))))).toMatch(/No lot.*parking strip/);
    expect(reason(copy('amplify-hills', (f) => ((f.map.parking = []), (f.map.courtyard.parking = []))))).toMatch(/No lot.*parking strip/);
  });

  it('refuses a drawn bus stop on a town of roads, and a drawn stop that is not drawn', () => {
    expect(reason(copy('amplify-hills', (f) => (f.settings.busStop = { from: 'drawing' })))).toMatch(/by its roads/);
    expect(reason(copy('coaxia', (f) => (f.map.busStop = null)))).toMatch(/draws none/);
  });

  it('refuses roads that stop short of the edge of the map', () => {
    // The drawing reaches far beyond every road, so none of them is where vehicles come in.
    expect(reason(copy('amplify-hills', (f) => f.map.beach.push({ x: -300, y: -300, w: 700, h: 700 })))).toMatch(/No road reaches the edge/);
  });

  it('refuses a stop that no road from the edge leads to', () => {
    // The road the stops are on, and a road at the edge that does not meet it.
    const reasonFor = reason(
      copy('amplify-hills', (f) => {
        f.map.lanes = [
          { x: -33, y: 48, w: 130, h: 2, dir: 'both' },
          { x: -100, y: -95, w: 30, h: 2, dir: 'both' },
        ];
      }),
    );
    expect(reasonFor).toMatch(/No stop: no bus can reach/);
  });

  it('refuses a town whose roads do not run south of the lot', () => {
    const text = reason(copy('amplify-hills', (f) => (f.map.lanes = [{ x: -36, y: -58, w: 2, h: 34, dir: 'both' }, { x: -36, y: -58, w: 40, h: 2, dir: 'both' }])));
    expect(text).toMatch(/cannot lay out this town/);
  });

  it('refuses a door far from every road', () => {
    // The bus stop far off along its street.
    expect(reason(copy('aerial-fields', (f) => (f.settings.busStop = { from: 'entrance', shift: -DOOR_REACH - 20 })))).toMatch(/No door onto a road: the entrance is \d+ tiles from the bus stop/);
  });

  it('tells a bad map from a good one without throwing', () => {
    const odd = copy('coaxia', (f) => {
      f.map.lanes = [{ x: 0, y: 0, w: 2, h: 2, dir: 'both' }];
    });
    expect(() => checkTown(odd)).not.toThrow();
    expect(checkTown(odd).ok).toBe(false);
  });
});
