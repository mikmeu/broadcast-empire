import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SITES } from '../office/sites';
import { buildingFor } from './office';
import type { RegionId } from './world';
import { MAPS } from './maps';
import { TRAIN_PIECES } from '../mods/mapFile';

// (What the five towns hold is recorded in src/office/layout.fixture and traffic.fixture; the old drawings they were converted from are gone, #331.)
describe('the town maps', () => {
  it('has a map file for the town of every site', () => {
    for (const site of Object.values(SITES)) if (site.map) expect(MAPS[site.map], site.map).toBeDefined();
  });

  // Site.train and Site.traffic, and the floors of the region's building, are read from the files (#287).
  it('has the settings the game uses for the town', () => {
    for (const [region, site] of Object.entries(SITES)) {
      if (!site.map) continue;
      const { settings } = MAPS[site.map]!;
      expect(settings.train.map((piece) => `train/${piece}.glb`), site.map).toEqual(site.train);
      expect(settings.traffic, site.map).toEqual(site.traffic);
      expect(settings.floors, site.map).toBe(buildingFor(region as RegionId).floors);
    }
  });

  it('lists every file of the folder', () => {
    const files = readdirSync(new URL('./maps/', import.meta.url)).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
    expect(Object.keys(MAPS).sort()).toEqual(files.sort());
  });

  it('names train pieces that are files of public/models/train', () => {
    const files = readdirSync(new URL('../../public/models/train/', import.meta.url)).filter((f) => f.startsWith('train-')).map((f) => f.replace(/\.glb$/, ''));
    expect([...TRAIN_PIECES].sort()).toEqual(files.sort());
  });
});
