import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { townMapsSource } from './townMapReader';
import { TOWN_MAPS } from './townMaps';

const dir = new URL('../../design/towns/', import.meta.url);
const svgs: Record<string, string> = {};
for (const file of readdirSync(dir).filter((f) => f.endsWith('.svg'))) {
  svgs[file.replace(/\.svg$/, '')] = readFileSync(new URL(file, dir), 'utf8');
}

describe('the town maps', () => {
  it('src/config/townMaps.ts matches design/towns/*.svg (npm run town-maps)', () => {
    const file = readFileSync(new URL('./townMaps.ts', import.meta.url), 'utf8');
    expect(file).toBe(townMapsSource(svgs).source);
  });

  it('has a map for every drawing', () => {
    expect(Object.keys(TOWN_MAPS).sort()).toEqual(Object.keys(svgs).sort());
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
        expect(['north', 'east', 'south', 'west']).toContain(lane.dir);
        // Along its length: north or south, or east or west.
        expect(lane.w > lane.h ? ['east', 'west'] : ['north', 'south']).toContain(lane.dir);
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
});
