import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { BUILDINGS, FLOOR } from '../config/office';
import { CITY } from './assets';
import { OFFICE_BLOCK, PAVEMENT, clearance, streetLevel, streets, townBuildings, trainAt, trainLength, carSpots } from './city';
import { CAPITAL, layoutOf } from './townLayout';
import { SITES } from './sites';
import { TRAIN_LENGTH, TRAIN_PIECES } from '../mods/mapFile';

/** The elevated line of the capital's town (Coaxia): along the south of the map. */
const RAILWAY = CAPITAL.railway;

/** How long a model of public/models is along its longer horizontal side, in the kit's units: from the bounds of the meshes in the file (the pieces of the Train Kit have no transforms). */
function glbLength(file: string): number {
  const buffer = readFileSync(`public/models/${file}`);
  const json = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString());
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  for (const mesh of json.meshes) {
    for (const primitive of mesh.primitives) {
      const { min, max } = json.accessors[primitive.attributes.POSITION];
      for (let k = 0; k < 3; k++) {
        low[k] = Math.min(low[k]!, min[k]);
        high[k] = Math.max(high[k]!, max[k]);
      }
    }
  }
  return Math.max(high[0]! - low[0]!, high[2]! - low[2]!);
}

describe('the town around the office', () => {
  const SEEDS = [1, 2, 3, 42, 987654321];

  it('keeps the office’s own block free and fills the rest', () => {
    for (const _seed of SEEDS) {
      const town = townBuildings();
      expect(town.length).toBeGreaterThan(50);
      for (const b of town) {
        const onOfficeBlock = b.x > OFFICE_BLOCK.x && b.x < OFFICE_BLOCK.x + OFFICE_BLOCK.w && b.z > OFFICE_BLOCK.z && b.z < OFFICE_BLOCK.z + OFFICE_BLOCK.d;
        expect(onOfficeBlock).toBe(false);
      }
    }
    // The floor sits inside its block with pavement all round.
    expect(OFFICE_BLOCK.x).toBeLessThan(0);
    expect(OFFICE_BLOCK.x + OFFICE_BLOCK.w).toBeGreaterThan(BUILDINGS.standard.w);
    expect(OFFICE_BLOCK.z + OFFICE_BLOCK.d).toBeGreaterThan(FLOOR.h);
  });

  it('puts floor 1 at street level and every floor above it one storey higher', () => {
    expect(streetLevel(1)).toBeLessThan(1);
    expect(streetLevel(2) - streetLevel(1)).toBeCloseTo(CITY.perFloor);
    expect(streetLevel(3) - streetLevel(2)).toBeCloseTo(CITY.perFloor);
  });

  it('never lets a building hide the ground floor (that every building stands on its own pavement is held in sites.test.ts)', () => {
    for (const _seed of SEEDS) {
      const town = townBuildings();
      for (const b of town) {
        const w = (b.turn % 2 === 0 ? b.building.w : b.building.d) * CITY.scale;
        const d = (b.turn % 2 === 0 ? b.building.d : b.building.w) * CITY.scale;
        expect(b.building.height * CITY.scale + PAVEMENT, b.building.file).toBeLessThanOrEqual(clearance(b.x, b.z, w, d));
      }
      // Behind the office nothing is in the way, so there is a skyline.
      expect(town.some((b) => b.building.height * CITY.scale > 10)).toBe(true);
    }
    expect(clearance(-10, -10, 3, 3)).toBe(Infinity);
    // Something as tall as it is far away is at the limit; anything taller would hide the front of the office.
    expect(clearance(10, FLOOR.h + 5, 2, 2)).toBe(4);
  });

  // (Since #327 the town is written in the map file: every game in a region has the same one, whatever its seed.)
  it('gives every game in a region the same town, the same each time it is opened', () => {
    expect(townBuildings()).toEqual(townBuildings());
    expect(townBuildings().length).toBeGreaterThan(50);
  });
});

describe('the railway', () => {
  it('runs along a street in front of the office, high enough for cars and low enough not to hide the office', () => {
    expect(streets().some((s) => s.along === 'x' && s.at === RAILWAY.z)).toBe(true);
    expect(RAILWAY.z).toBeGreaterThan(FLOOR.h);
    // A car is under a tile high; the deck is well above it.
    expect(CITY.railway.height).toBeGreaterThan(2);
    // The top of a train on the deck (the tallest carriage is 2.3 of the kit's units with its pantograph).
    const top = CITY.railway.height + 2.3 * CITY.railway.scale;
    expect(top).toBeLessThanOrEqual(clearance(BUILDINGS.standard.w / 2, RAILWAY.z, 4, 2.2));
  });

  it('has every train and track file, and runs the yellow double-decker in the capital', () => {
    const train = SITES.capital.train;
    const files = new Set([CITY.railway.track, ...train]);
    for (const file of files) expect(existsSync(`public/models/${file}`), file).toBe(true);
    expect(train.every((file) => file.includes('electric-double'))).toBe(true);
    // A front, at least one carriage in between, and a rear.
    expect(train.length).toBeGreaterThanOrEqual(3);
    expect(train[0]).not.toBe(train.at(-1));
  });

  it('has a length for every piece of the Train Kit that a map can name, and it covers the piece', () => {
    for (const piece of TRAIN_PIECES) {
      const file = `train/${piece}.glb`;
      const length = CITY.railway.cars[file];
      expect(length, file).toBeDefined();
      // The length of the body in the file (the kit's units along its x axis), couplings not included.
      expect(length!, file).toBeGreaterThanOrEqual(glbLength(file));
    }
  });

  it('puts the pieces of a train one behind the other, without overlap', () => {
    for (const site of Object.values(SITES)) {
      const spots = carSpots(site.train);
      expect(spots).toHaveLength(site.train.length);
      spots.forEach((spot, i) => {
        if (i > 0) expect(spot.at + spot.length / 2, site.map!).toBeLessThanOrEqual(spots[i - 1]!.at - spots[i - 1]!.length / 2 + 1e-9);
      });
      const last = spots.at(-1)!;
      expect(last.at - last.length / 2).toBeCloseTo(-trainLength(site.train));
    }
  });

  it('spaces the five towns trains as they always were: 2.75 of the kit for every piece', () => {
    for (const site of Object.values(SITES)) {
      const spots = carSpots(site.train);
      spots.forEach((spot, i) => expect(spot.at).toBeCloseTo(-(i + 0.5) * 2.75 * CITY.railway.scale));
      expect(trainLength(site.train)).toBeCloseTo(site.train.length * 2.75 * CITY.railway.scale);
    }
  });

  it('lets the longest train possible clear the line before the next one comes', () => {
    const longest = Math.max(...Object.values(CITY.railway.cars));
    const length = TRAIN_LENGTH.max * longest * CITY.railway.scale;
    for (const site of Object.values(SITES)) {
      const layout = layoutOf(site);
      expect((layout.railway.length + length) / CITY.railway.speed, site.map!).toBeLessThan(CITY.railway.every);
    }
  });

  it('sends a train by every now and then, in alternating directions, and nothing in between', () => {
    const cars = SITES.capital.train;
    const { every, speed } = CITY.railway;
    const passing = (RAILWAY.length + trainLength(cars)) / speed;
    // Much of the time there is no train. (The line is the map's whole width, 158 tiles, so a train takes longer to cross it than the 80 of the grid; the stretch in view is a part of that.)
    expect(passing).toBeLessThan(every * 0.6);
    expect(trainAt(0, cars)).toEqual({ x: RAILWAY.from, direction: 1 });
    expect(trainAt(1, cars)).toEqual({ x: RAILWAY.from + speed, direction: 1 });
    expect(trainAt(passing + 1, cars)).toBeNull();
    expect(trainAt(every - 1, cars)).toBeNull();
    // The next one comes from the other end.
    expect(trainAt(every + 1, cars)).toEqual({ x: RAILWAY.from + RAILWAY.length - speed, direction: -1 });
    expect(trainAt(2 * every + 1, cars)?.direction).toBe(1);
  });
});
