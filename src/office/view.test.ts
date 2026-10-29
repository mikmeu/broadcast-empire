import { describe, expect, it } from 'vitest';
import { BUILDINGS, buildingFor } from '../config/office';
import type { RegionId } from '../config/world';
import { hidesOffice, townBuildings } from './city';
import { SITES } from './sites';

describe('the town from the four sides of the office (Phase 6)', () => {
  it('hides no building in the view the town was laid out for', () => {
    for (const seed of [1, 7, 12345]) {
      expect(townBuildings(seed).filter((b) => hidesOffice(b, 0))).toEqual([]);
    }
  });

  it('keeps the ground floor in view on every site with the standard building and its own, at the kit’s scale of 6 (5.2 for industry): nothing in front of it is taller than it lets through (0.20.0)', () => {
    expect(SITES.capital.scale).toBe(6);
    expect(SITES.north.scale).toBe(5.2);
    for (const [id, site] of Object.entries(SITES)) {
      for (const building of new Set([BUILDINGS.standard, buildingFor(id as RegionId)])) {
        for (const seed of [1, 7, 12345]) {
          const hiding = townBuildings(seed, site, building).filter((b) => hidesOffice(b, 0, site.scale, building));
          expect(hiding.map((b) => `${b.building.file} at ${b.x.toFixed(1)}, ${b.z.toFixed(1)}`), `${id}, ${building.id} building, seed ${seed}`).toEqual([]);
        }
      }
    }
  });

  it('leaves out some buildings from each turned side, but never most of the town', () => {
    // (In the towns laid out from a map the blocks are far from the office and little is in the way from the turned sides; in the fields the blocks are close.)
    let leftOut = 0;
    for (const turn of [1, 2, 3]) {
      for (const site of Object.values(SITES)) {
        const town = townBuildings(7, site);
        const hidden = town.filter((b) => hidesOffice(b, turn, site.scale)).length;
        leftOut += hidden;
        expect(hidden).toBeLessThan(town.length / 2);
      }
    }
    expect(leftOut).toBeGreaterThan(0);
  });

  it('treats a full turn as no turn, in either direction', () => {
    const town = townBuildings(7);
    for (const turn of [1, 2, 3]) {
      expect(town.map((b) => hidesOffice(b, turn + 4))).toEqual(town.map((b) => hidesOffice(b, turn)));
      expect(town.map((b) => hidesOffice(b, turn - 4))).toEqual(town.map((b) => hidesOffice(b, turn)));
    }
  });
});
