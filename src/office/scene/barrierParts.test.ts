import { describe, expect, it } from 'vitest';
import { ARM_PIVOT, BARRIER, armBoxes, lampBoxes, postBoxes } from './barrierParts';

describe('barrier parts', () => {
  it('has boxes of a positive, finite size at finite places', () => {
    for (const box of [...postBoxes(), ...armBoxes(2.2), ...lampBoxes()]) {
      for (const n of [...box.at, ...box.size]) expect(Number.isFinite(n)).toBe(true);
      for (const s of box.size) expect(s).toBeGreaterThan(0);
    }
  });

  it('stands about 1.6 tiles tall, on the ground', () => {
    const tops = postBoxes().map((b) => b.at[1] + b.size[1] / 2);
    const feet = postBoxes().map((b) => b.at[1] - b.size[1] / 2);
    expect(Math.max(...tops)).toBeCloseTo(1.64, 1);
    expect(Math.min(...feet)).toBeCloseTo(0, 5);
    expect(ARM_PIVOT[1]).toBeLessThan(Math.max(...tops));
  });

  it('has an arm as long as asked, from the pivot', () => {
    for (const length of [1.6, 2.2, 3]) {
      const reach = Math.max(...armBoxes(length).map((b) => b.at[0] + b.size[0] / 2));
      expect(reach).toBeCloseTo(length, 5);
    }
  });

  it('raises the arm further than it lies', () => {
    expect(BARRIER.arm.up).toBeGreaterThan(BARRIER.arm.down);
  });

  it('puts the lamps on the arm', () => {
    for (const lamp of lampBoxes()) {
      expect(lamp.at[0]).toBeGreaterThan(ARM_PIVOT[0]);
      expect(lamp.at[0]).toBeLessThan(ARM_PIVOT[0] + BARRIER.length);
    }
  });
});
