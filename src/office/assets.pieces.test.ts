import { describe, expect, it } from 'vitest';
import { FURNITURE } from '../config/office';
import { FURNITURE_ASSETS, ROOF_ASSETS } from './assets';

describe('playtest fixes (Phase 12a)', () => {
  it('turns the chairs of the canteen table, and the people on them, towards the table', () => {
    const table = FURNITURE_ASSETS.canteenTable;
    const middle = FURNITURE.canteenTable.w / 2;
    const chairs = table.parts.filter((p) => 'model' in p && p.model === 'chair');
    expect(chairs).toHaveLength(4);
    for (const chair of chairs) {
      // A chair that is not turned faces south (+z); a quarter turn brings it round to the east (+x).
      expect(chair.turn, `chair at ${chair.at[0]}`).toBe(chair.at[0] < middle ? 1 : 3);
      // A person faces north unturned, so sits half a turn further round than the chair.
      const seat = table.spots!.find((spot) => spot.at[0] === chair.at[0] && spot.at[1] === chair.at[2])!;
      expect(seat.turn).toBe(((chair.turn ?? 0) + 2) % 4);
    }
  });

  it('closes a toilet cubicle with a door', () => {
    const parts = FURNITURE_ASSETS.toilet.parts;
    const panels = parts.filter((p) => 'box' in p && p.box[1] > 1);
    // A back wall, two sides and the door across the front.
    expect(panels).toHaveLength(4);
    const door = panels.find((p) => 'box' in p && p.box[0] > 0.5 && p.at[2] > 0.5);
    expect(door).toBeDefined();
    // The door hangs clear of the floor and stays inside the tile.
    expect(door!.at[1]).toBeGreaterThan(0);
    expect(door!.at[2]).toBeLessThan(FURNITURE.toilet.h);
  });
});

// From version014.
describe('version 0.14.0', () => {
  describe('the reality set', () => {
    it('has its turned armchair facing the low table, and whoever sits in it too', () => {
      const sofa = FURNITURE_ASSETS.realitySet.parts.filter((p) => 'model' in p && p.model === 'sofa');
      const chair = FURNITURE_ASSETS.realitySet.parts.filter((p) => 'model' in p && p.model === 'armchair');
      // Seats face south unturned; the sofa is as it comes and three quarter turns face the armchair west, towards the table.
      expect(sofa.map((p) => p.turn ?? 0)).toEqual([0]);
      expect(chair.map((p) => p.turn ?? 0)).toEqual([3]);
      expect(FURNITURE_ASSETS.realitySet.spots![2]).toMatchObject({ turn: 1 });
    });
  });
});

// From version015.
describe('version 0.15.0', () => {
  it('has a roof with an antenna, and a dish for the satellite uplink (R44)', () => {
    expect(ROOF_ASSETS.antenna.length).toBeGreaterThan(0);
    expect(ROOF_ASSETS.dish.length).toBeGreaterThan(0);
  });
});
