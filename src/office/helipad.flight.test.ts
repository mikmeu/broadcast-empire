import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../config/office';
import { SLOT_HOURS } from '../config/world';
import { buyHelicopter } from '../sim/actions';
import { createInitialState } from '../sim/newGame';
import type { GameState } from '../sim/state';
import { unlockAll } from '../sim/unlocks';
import { helicopterHoursOf } from './day';
import { circuitOf, FLIGHT_HEIGHT, flightAt, helipadSpot } from './helipad';

function withNews(slots: number[], owned = true): GameState {
  const base = { ...unlockAll(createInitialState(1)), money: 5_000_000 };
  const s = structuredClone(owned ? ((buyHelicopter(base) as { ok: true; state: GameState }).state) : base);
  s.shows.push({ id: 'news1', genre: 'news' } as unknown as GameState['shows'][number]);
  s.channels.push({ id: 'ch1', schedule: Array.from({ length: 5 }, (_, i) => (slots.includes(i) ? 'news1' : '')) } as unknown as GameState['channels'][number]);
  return s;
}

describe('The helicopter over the roof (0.22.0, #395)', () => {
  it('flies in the hours of the rush slots that have news, and never without a helicopter', () => {
    expect(helicopterHoursOf(withNews([0, 3]))).toEqual([[...SLOT_HOURS.morning], [...SLOT_HOURS.evening]]);
    expect(helicopterHoursOf(withNews([3]))).toEqual([[...SLOT_HOURS.evening]]);
    expect(helicopterHoursOf(withNews([1, 2, 4]))).toEqual([]);
    expect(helicopterHoursOf(withNews([0, 3], false))).toEqual([]);
  });

  describe('its flight', () => {
    const building = BUILDINGS.standard;
    const pad = helipadSpot(building)!;
    const windows: [number, number][] = [[8.5, 11.5]];

    it('stands on the pad outside the hours it flies, and when there are none', () => {
      expect(flightAt(building, pad, windows, 8)).toMatchObject({ x: pad.x, y: 0, z: pad.z, airborne: false });
      expect(flightAt(building, pad, windows, 15)).toMatchObject({ x: pad.x, y: 0, z: pad.z, airborne: false });
      expect(flightAt(building, pad, [], 9)).toMatchObject({ y: 0, airborne: false });
    });

    it('leaves the pad, circles the town at height, and comes down on the pad again', () => {
      expect(flightAt(building, pad, windows, 8.5).y).toBe(0);
      const middle = flightAt(building, pad, windows, 10);
      expect(middle).toMatchObject({ y: FLIGHT_HEIGHT, airborne: true });
      const { x, z, radius } = circuitOf(building);
      expect(Math.hypot(middle.x - x, middle.z - z)).toBeCloseTo(radius, 5);
      const end = flightAt(building, pad, windows, 11.5);
      expect(end.x).toBeCloseTo(pad.x, 5);
      expect(end.z).toBeCloseTo(pad.z, 5);
      expect(end.y).toBeCloseTo(0, 5);
    });

    it('turns as it flies, for every building', () => {
      for (const b of Object.values(BUILDINGS)) {
        const p = helipadSpot(b)!;
        const a = flightAt(b, p, windows, 9.5);
        const c = flightAt(b, p, windows, 10);
        expect(a.yaw).not.toBeCloseTo(c.yaw, 3);
      }
    });
  });
});
