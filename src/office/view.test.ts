import { describe, expect, it } from 'vitest';
import { hidesOffice, townBuildings } from './city';

describe('the town from the four sides of the office (Phase 6)', () => {
  it('hides no building in the view the town was laid out for', () => {
    for (const seed of [1, 7, 12345]) {
      expect(townBuildings(seed).filter((b) => hidesOffice(b, 0))).toEqual([]);
    }
  });

  it('leaves out some buildings from each turned side, but never most of the town', () => {
    for (const turn of [1, 2, 3]) {
      const town = townBuildings(7);
      const hidden = town.filter((b) => hidesOffice(b, turn));
      expect(hidden.length).toBeGreaterThan(0);
      expect(hidden.length).toBeLessThan(town.length / 2);
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
