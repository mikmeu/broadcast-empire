import { describe, expect, it } from 'vitest';
import { hidesOffice, townBuildings } from './city';
import { SITES } from './sites';

describe('the town from the four sides of the office (Phase 6)', () => {
  it('hides no building in the view the town was laid out for', () => {
    for (const seed of [1, 7, 12345]) {
      expect(townBuildings(seed).filter((b) => hidesOffice(b, 0))).toEqual([]);
    }
  });

  it('leaves out some buildings from each turned side, but never most of the town', () => {
    // (In the capital, laid out from the map, the blocks are far from the office and little is in the way from the turned sides; by the sea the blocks are close.)
    for (const turn of [1, 2, 3]) {
      const town = townBuildings(7, SITES.coast);
      const hidden = town.filter((b) => hidesOffice(b, turn, SITES.coast.scale));
      expect(hidden.length).toBeGreaterThan(0);
      expect(hidden.length).toBeLessThan(town.length / 2);
      const capital = townBuildings(7);
      expect(capital.filter((b) => hidesOffice(b, turn)).length).toBeLessThan(capital.length / 2);
    }
  });

  it('treats a full turn as no turn, in either direction', () => {
    const town = townBuildings(7);
    for (const turn of [1, 2, 3]) {
      expect(town.map((b) => hidesOffice(b, turn + 4))).toEqual(town.map((b) => hidesOffice(b, turn)));
      expect(town.map((b) => hidesOffice(b, turn - 4))).toEqual(town.map((b) => hidesOffice(b, turn)));
    }
  });
});
