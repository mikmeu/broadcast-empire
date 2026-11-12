import { describe, expect, it } from 'vitest';
import { BEYOND_PATH, MAP_SIZE, REGION_LABELS, REGION_PATHS } from './map';
import { REGIONS } from './world';

describe('the map of Etheria', () => {
  it('has a closed outline and a label on the map for every region', () => {
    for (const region of REGIONS) {
      expect(REGION_PATHS[region.id]).toMatch(/^M[\d.]+[ ,][\d.]+.*Z$/);
      const { x, y } = REGION_LABELS[region.id];
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(MAP_SIZE.width);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(MAP_SIZE.height);
    }
    expect(BEYOND_PATH).toMatch(/^M.*Z$/);
  });
});
