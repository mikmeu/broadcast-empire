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

describe('the map check for a railway on the ground (#288)', () => {
  /** A map with its railway on the ground, 4 tiles wide and `down` tiles further south, and `change` made to it. */
  const ground = (id: string, down: number, change: (file: MapFile) => void = () => undefined): MapFile =>
    copy(id, (f) => {
      f.settings.railway = 'ground';
      const t = f.map.train!;
      f.map.train = { ...t, y: t.y + down - 1, h: 4 };
      change(f);
    });
  const across = (f: MapFile) => f.map.lanes.push({ x: 97, y: 28, w: 2, h: 48, dir: 'both' });

  it('accepts a track on the ground that is wide enough and clear of the junctions', () => {
    expect(checkTown(ground('coaxia', 14))).toEqual({ ok: true });
    expect(checkTown(ground('skywave-beach', 0))).toEqual({ ok: true });
    expect(checkTown(ground('amplify-hills', 10, across))).toEqual({ ok: true });
  });

  it('refuses a box under 4 tiles wide, or one that does not lie east to west', () => {
    expect(reason(copy('coaxia', (f) => (f.settings.railway = 'ground')))).toMatch(/too narrow: its box is 2 tiles wide and must be at least 4/);
    expect(reason(copy('coaxia', (f) => ((f.settings.railway = 'ground'), (f.map.train = { x: 0, y: 70, w: 4, h: 40 }))))).toMatch(/east to west/);
  });

  it('refuses a road that crosses within 8 tiles of a junction', () => {
    // Coaxia's track, widened but not moved, is 3.5 tiles from the junction before it.
    expect(reason(ground('coaxia', 0))).toMatch(/within 8 tiles of a junction/);
  });

  it('refuses a road that crosses within 8 tiles of the edge of the map or of the end of a road', () => {
    // The road across the track ends 4 tiles beyond it, in the middle of the drawing (something else reaches further out).
    expect(reason(ground('amplify-hills', 10, (f) => (f.map.lanes.push({ x: 97, y: 28, w: 2, h: 46, dir: 'both' }), f.map.beach.push({ x: 0, y: 120, w: 10, h: 10 }))))).toMatch(/within 8 tiles of the end of the road/);
  });

  it('refuses a road that runs along the track', () => {
    expect(reason(ground('amplify-hills', 10, (f) => f.map.lanes.push({ x: -33, y: 66, w: 130, h: 2, dir: 'both' })))).toMatch(/runs along the track/);
    expect(reason(ground('amplify-hills', 10, (f) => f.map.lanes.push({ x: -33, y: 70, w: 130, h: 2, dir: 'both' })))).toMatch(/runs along the track|within 8 tiles of a junction/);
  });

  /** The track placed at a line of the drawing (4 tiles wide) instead of where the map has it. */
  const at = (id: string, y: number) => ground(id, 0, (f) => (f.map.train = { ...f.map.train!, y, h: 4 }));

  it('refuses a stop or the lot too near a crossing, or on the far side of the track from the door', () => {
    expect(reason(at('coaxia', 10))).toMatch(/The bus stop is within 8 tiles of a level crossing/);
    expect(reason(at('coaxia', 1))).toMatch(/The taxi stand is within 8 tiles of a level crossing/);
    expect(reason(at('skywave-beach', 4))).toMatch(/The gate of the lot is within 8 tiles of a level crossing/);
    expect(reason(at('aerial-fields', 22))).toMatch(/The bus stop is on the other side of the track from the door/);
    expect(reason(at('transponder-valley', 1))).toMatch(/The lot is on the other side of the track from the door/);
  });

  it('refuses a building on the track', () => {
    expect(reason(ground('coaxia', 14, (f) => f.map.buildings.push({ x: 0, y: 88, w: 20, h: 10 })))).toMatch(/building stands on the track/);
    expect(reason(at('coaxia', -29))).toMatch(/building stands on the track/);
  });

  it('accepts a track clear of the town on the side of the door, and leaves an elevated one to the rest of the check', () => {
    for (const id of Object.keys(MAPS)) expect(checkTown(at(id, -140)), id).toEqual({ ok: true });
    // (An elevated track keeps its box of 2 tiles and is checked for none of the above.)
    expect(checkTown(copy('coaxia', (f) => (f.map.train = { ...f.map.train!, y: 10 })))).toEqual({ ok: true });
  });

  it('gives every default town on the ground either a pass or a reason, and never throws', () => {
    for (const id of Object.keys(MAPS)) {
      for (const down of [-10, 0, 14]) {
        const file = ground(id, down);
        expect(() => checkTown(file), `${id} ${down}`).not.toThrow();
        const checked = checkTown(file);
        if (!checked.ok) expect(checked.reason.length, `${id} ${down}`).toBeGreaterThan(10);
      }
    }
  });
});
