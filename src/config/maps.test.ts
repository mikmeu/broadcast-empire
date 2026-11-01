import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SITES } from '../office/sites';
import { buildingFor } from './office';
import type { RegionId } from './world';
import { MAPS } from './maps';
import { TRAIN_PIECES } from '../mods/mapFile';

const TOWN_MAPS = Object.fromEntries(Object.entries(MAPS).map(([id, file]) => [id, file.map]));

describe('the town maps', () => {
  it('has a map file for the town of every site', () => {
    for (const site of Object.values(SITES)) if (site.map) expect(MAPS[site.map], site.map).toBeDefined();
  });

  // The game reads Site.train, Site.traffic and the floors of the building until #287 reads the files.
  it('has the settings the game uses for the town', () => {
    for (const [region, site] of Object.entries(SITES)) {
      if (!site.map) continue;
      const { settings } = MAPS[site.map]!;
      expect(settings.train.map((piece) => `train/${piece}.glb`), site.map).toEqual(site.train);
      expect(settings.traffic, site.map).toEqual(site.traffic);
      expect(settings.floors, site.map).toBe(buildingFor(region as RegionId).floors);
    }
  });

  it('names train pieces that are files of public/models/train', () => {
    const files = readdirSync(new URL('../../public/models/train/', import.meta.url)).filter((f) => f.startsWith('train-')).map((f) => f.replace(/\.glb$/, ''));
    expect([...TRAIN_PIECES].sort()).toEqual(files.sort());
  });

  describe('Coaxia', () => {
    const town = TOWN_MAPS.coaxia!;

    it('has the U: two wings and the spine, from (0, 0)', () => {
      expect(town.wings).toHaveLength(3);
      const spine = town.wings.reduce((a, b) => (b.h > a.h ? b : a));
      const wings = town.wings.filter((w) => w !== spine);
      expect(spine).toMatchObject({ x: 0, y: 0 });
      expect(Math.min(...wings.map((w) => w.y))).toBe(0);
      for (const w of wings) expect(w.x).toBe(spine.x + spine.w);
    });

    it('has the courtyard between the wings', () => {
      const wings = town.wings.filter((w) => w.w > w.h);
      const top = Math.min(...wings.map((w) => w.y + w.h));
      const bottom = Math.max(...wings.map((w) => w.y));
      const inner = [...town.courtyard.parking, ...town.courtyard.green];
      expect(town.courtyard.parking).toHaveLength(2);
      expect(town.courtyard.green).toHaveLength(1);
      for (const b of inner) {
        expect(b.y).toBeGreaterThanOrEqual(top);
        expect(b.y + b.h).toBeLessThanOrEqual(bottom);
      }
      expect(town.courtyard.fountain).not.toBeNull();
    });

    it('has lanes 2 tiles wide, each with a direction', () => {
      expect(town.lanes.length).toBeGreaterThan(0);
      for (const lane of town.lanes) {
        expect(Math.min(lane.w, lane.h)).toBe(2);
        // Along its length: north or south, or east or west; `both` where the drawing has no arrow on it.
        expect([...(lane.w > lane.h ? ['east', 'west'] : ['north', 'south']), 'both']).toContain(lane.dir);
      }
    });

    it('has the bus stop on the kerb of the street beside reception', () => {
      const { reception, busStop } = town;
      expect(reception).not.toBeNull();
      expect(busStop).not.toBeNull();
      expect(busStop!.y).toBeGreaterThanOrEqual(reception!.y);
      expect(busStop!.y).toBeLessThan(reception!.y + reception!.h);
      const kerb = town.lanes.filter((l) => l.h > l.w && l.x + l.w === busStop!.x);
      expect(kerb.length).toBeGreaterThan(0);
      // The street is on reception's side of the U, outside it.
      expect(busStop!.x).toBeLessThan(reception!.x);
    });

    it('has the train line, bands of buildings, alleys and green strips', () => {
      expect(town.train).not.toBeNull();
      expect(town.buildings.length).toBeGreaterThan(0);
      expect(town.alleys.length).toBeGreaterThan(0);
      expect(town.greens.length).toBeGreaterThan(0);
    });
  });

  describe('the other regions', () => {
    const wingsOf = (name: string) => TOWN_MAPS[name]!.wings;
    it('have red shapes for the building, and a train', () => {
      for (const name of ['transponder-valley', 'skywave-beach', 'aerial-fields', 'amplify-hills']) {
        expect(wingsOf(name).length, name).toBeGreaterThan(0);
        expect(TOWN_MAPS[name]!.train, name).not.toBeNull();
      }
    });

    it('have water and a beach south of the office at Skywave Beach', () => {
      const { water, beach, wings } = TOWN_MAPS['skywave-beach']!;
      const south = Math.max(...wings.map((w) => w.y + w.h));
      expect(water).toHaveLength(1);
      expect(beach).toHaveLength(1);
      expect(beach[0]!.y).toBeGreaterThanOrEqual(south);
      expect(water[0]!.y).toBe(beach[0]!.y + beach[0]!.h);
    });

    it('have water at Amplify Hills, fields at Aerial Fields, and a lane without an arrow is two-way', () => {
      expect(TOWN_MAPS['amplify-hills']!.water.length).toBeGreaterThan(0);
      expect(TOWN_MAPS['aerial-fields']!.greens.length).toBeGreaterThan(0);
      expect(TOWN_MAPS['aerial-fields']!.lanes.every((l) => l.dir === 'both')).toBe(true);
    });

    it('have mountains only at Amplify Hills: two grey rects with the word in them, which are not alleyways (#218)', () => {
      for (const [name, map] of Object.entries(TOWN_MAPS)) expect(map.mountains.length, name).toBe(name === 'amplify-hills' ? 2 : 0);
      const { mountains, alleys } = TOWN_MAPS['amplify-hills']!;
      expect(mountains).toEqual([
        { x: -44, y: -92, w: 183, h: 32 },
        { x: -5, y: -61, w: 98, h: 37 },
      ]);
      expect(alleys).toHaveLength(0);
    });

    it('read the bus stop when BUS and STOP are drawn as two texts, one under the other (#218)', () => {
      // Aerial Fields has its stop on the kerb of a lane of the loop in front of reception.
      const { busStop, lanes } = TOWN_MAPS['aerial-fields']!;
      expect(busStop).not.toBeNull();
      expect(lanes.some((l) => busStop!.x >= l.x && busStop!.x <= l.x + l.w && busStop!.y >= l.y && busStop!.y <= l.y + l.h)).toBe(true);
    });
  });
});
