import { describe, expect, it } from 'vitest';
import { BUILDINGS, FLOOR, WEST, widthOf } from '../config/office';
import { CITY } from './assets';
import { busyStreets, clearance, hidesOffice, officeBlock, streets, townBlocks, townBuildings } from './city';
import { SITES } from './sites';
import { onPavement, strollerAt, strollers } from './street';
import { GRID } from './townLayout';
import { createTraffic, stepTraffic, vehiclesIn } from './traffic';

const LONG = BUILDINGS.long;
const STANDARD = BUILDINGS.standard;

describe('the town around the long building (Phase 13c)', () => {
  // (Amplify Hills was laid out as a grid when this was written; the grid is still how a town without a drawing is laid out, #218.)
  const site = { ...SITES.highlands, map: null, front: 'water' as const, shore: 'grass' as const };
  // (A grid of blocks; the capital's town, laid out from the map, is held to the same in townLayout.test.ts.)
  const OFFICE_BLOCK = officeBlock(STANDARD, GRID);

  it('gives it a block of its own that is one town block wider, with the same pavement around it', () => {
    const own = officeBlock(LONG, GRID);
    expect(own).toEqual({ ...OFFICE_BLOCK, w: OFFICE_BLOCK.w + CITY.block.w });
    // The same margin between the building and the kerb on both ends, as in town.
    for (const building of [STANDARD, LONG]) {
      const block = officeBlock(building, GRID);
      expect(WEST - block.x).toBe(block.x + block.w - (WEST + widthOf(building)));
    }
    // Nothing of the town stands on it.
    for (const _seed of [1, 7, 1970]) {
      for (const item of townBuildings(site, LONG)) {
        const on = item.x > own.x && item.x < own.x + own.w && item.z > own.z && item.z < own.z + own.d;
        expect(on, `${item.building.file} at ${item.x}, ${item.z}`).toBe(false);
      }
    }
    // (The town is written in the map file for the region's own building and is the same round either: it no longer leaves the fifth block out for the long one (#327).)
    expect(townBlocks(site, LONG)).toEqual(townBlocks(site, STANDARD));
  });

  it('lets nothing in town hide the far end of the building', () => {
    for (const _seed of [1, 7, 1970]) {
      for (const item of townBuildings(site, LONG)) expect(hidesOffice(item, 0, site.scale, LONG)).toBe(false);
    }
    // What may stand east of the standard building at a height is too tall there beside the long one.
    expect(clearance(26, 5, 2, 2, STANDARD)).toBeGreaterThan(0);
    expect(clearance(26, 5, 2, 2, LONG)).toBeLessThan(0);
  });

  it('has no traffic in the side street it stands on, and all of it everywhere else', () => {
    const closed = OFFICE_BLOCK.x + STANDARD.blocks * CITY.block.w;
    expect(streets(STANDARD, GRID).some((s) => s.along === 'z' && s.at === closed)).toBe(true);
    expect(streets(LONG, GRID).some((s) => s.along === 'z' && s.at === closed)).toBe(false);
    expect(busyStreets(LONG, GRID)).toEqual(busyStreets(STANDARD, GRID).filter((s) => !(s.along === 'z' && s.at === closed)));

    const traffic = createTraffic(3, 30, site.traffic, LONG, false, GRID);
    const inClosed = (t: typeof traffic, lane: number) => t.lanes[lane]!.along === 'z' && Math.abs(t.lanes[lane]!.at - closed) < CITY.streetWidth / 2;
    let seen = 0;
    for (let n = 0; n < 600; n++) {
      stepTraffic(traffic, 0.5, 30 + n / 240);
      for (const vehicle of vehiclesIn(traffic)) {
        seen++;
        expect(inClosed(traffic, vehicle.lane)).toBe(false);
      }
    }
    expect(seen).toBeGreaterThan(100);
    // Around the standard building that street is driven in like any other.
    const town = createTraffic(3, 30, SITES.capital.traffic, STANDARD, false, GRID);
    let there = 0;
    for (let n = 0; n < 600; n++) {
      stepTraffic(town, 0.5, 30 + n / 240);
      there += vehiclesIn(town).filter((v) => inClosed(town, v.lane)).length;
    }
    expect(there).toBeGreaterThan(0);
  });

  it('keeps the people out for a walk on the pavement, around the longer block too', () => {
    const walking = strollers(5, 12, LONG, GRID);
    expect(walking).toHaveLength(12);
    const own = officeBlock(LONG, GRID);
    // Every third goes round the office's own block, which is the longer one.
    expect(walking[0]!.w).toBeGreaterThan(strollers(5, 12, STANDARD, GRID)[0]!.w);
    expect(walking[0]!.x).toBe(own.x + own.w / 2);
    for (const stroller of walking) {
      for (let seconds = 0; seconds < 400; seconds += 7) {
        const at = strollerAt(stroller, seconds);
        expect(onPavement(at.x, at.z, LONG, GRID), `${at.x}, ${at.z}`).toBe(true);
      }
    }
    // Where the street was is pavement now; inside the longer building is not.
    const closed = OFFICE_BLOCK.x + STANDARD.blocks * CITY.block.w;
    expect(onPavement(closed, FLOOR.h + 0.5, STANDARD, GRID)).toBe(false);
    expect(onPavement(closed, FLOOR.h + 0.5, LONG, GRID)).toBe(true);
    expect(onPavement(closed, FLOOR.h / 2, LONG, GRID)).toBe(false);
    expect(GRID.from.x).toBeLessThan(own.x);
  });
});
