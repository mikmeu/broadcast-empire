import { describe, expect, it } from 'vitest';
import { BUILDINGS, coreOf, type Rect } from '../config/office';
import { AIR_CONDITIONING_SIZE, airConditioningOf, ANTENNA_Z, DISH_Z, HELIPAD_SIZES, helipadSpot } from './helipad';

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const around = (x: number, z: number, w: number, h: number): Rect => ({ x: x - w / 2, y: z - h / 2, w, h });

describe('The helipad (0.22.0, #395)', () => {
  for (const [id, building] of Object.entries(BUILDINGS)) {
    describe(`on the roof of the ${id} building`, () => {
      const spot = helipadSpot(building);

      it('has a spot, and the pad is as big as it can be made', () => {
        expect(spot).not.toBeNull();
        expect(HELIPAD_SIZES).toContain(spot!.size);
        // The standard buildings have room for the full 4 by 4.
        expect(spot!.size).toBe(HELIPAD_SIZES[0]);
      });

      it('lies wholly on one wing, in from the wall', () => {
        const pad = around(spot!.x, spot!.z, spot!.size, spot!.size);
        expect(building.wings.some((w) => pad.x >= w.x + 1 && pad.y >= w.y + 1 && pad.x + pad.w <= w.x + w.w - 1 && pad.y + pad.h <= w.y + w.h - 1)).toBe(true);
      });

      it('stays clear of the housings, the antenna, the dish and the air conditioning', () => {
        const pad = around(spot!.x, spot!.z, spot!.size, spot!.size);
        const { stairs, lifts } = coreOf(building);
        expect(overlap(pad, stairs)).toBe(false);
        expect(overlap(pad, lifts)).toBe(false);
        expect(overlap(pad, around(building.w - 4, ANTENNA_Z, 1.6, 1.6))).toBe(false);
        expect(overlap(pad, around(building.w - 10, DISH_Z, 2, 2))).toBe(false);
        for (const [x, z] of airConditioningOf(building)) expect(overlap(pad, around(x, z, AIR_CONDITIONING_SIZE.w, AIR_CONDITIONING_SIZE.h))).toBe(false);
      });

      it('is the same each time', () => {
        expect(helipadSpot(building)).toEqual(spot);
      });
    });
  }
});
