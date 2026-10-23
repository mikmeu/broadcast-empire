import { describe, expect, it } from 'vitest';
import { ASIDE, asideFor, easeAside, placedAside, type Foot } from './aside';

/** Someone at a place facing a way: 0 faces +z, a half turn faces -z. */
const at = (x: number, z: number, angle: number): Foot => ({ x, z, angle });

describe('stepping aside (0.20.0)', () => {
  it('moves two people who come face to face to their own right, so they pass on opposite sides', () => {
    const [a, b] = [at(0, 0, 0), at(0, 0.6, Math.PI)];
    const [sa, sb] = [asideFor(a, [b]), asideFor(b, [a])];
    expect(sa).toBeGreaterThan(0);
    expect(sb).toBeGreaterThan(0);
    expect(sa).toBeLessThanOrEqual(ASIDE.offset);
    const [pa, pb] = [placedAside(a, sa), placedAside(b, sb)];
    // Each goes to their own right, which is not the same side of the way.
    expect(Math.sign(pa.x - a.x)).toBe(-Math.sign(pb.x - b.x));
    expect(Math.abs(pa.x - pb.x)).toBeGreaterThan(ASIDE.offset);
  });

  it('leaves alone those who are far off, walk the same way, walk past, or are well to the side', () => {
    const me = at(0, 0, 0);
    expect(asideFor(me, [at(0, ASIDE.reach + 0.5, Math.PI)])).toBe(0);
    // Behind someone, going the same way.
    expect(asideFor(me, [at(0, 0.5, 0)])).toBe(0);
    // Already past each other.
    expect(asideFor(me, [at(0, -ASIDE.past - 0.1, Math.PI)])).toBe(0);
    // Coming the other way in another lane of the street.
    expect(asideFor(me, [at(ASIDE.across + 0.3, 0.5, Math.PI)])).toBe(0);
    // Crossing their way, not coming towards them.
    expect(asideFor(me, [at(0.4, 0.5, Math.PI / 2)])).toBe(0);
    expect(asideFor(me, [])).toBe(0);
  });

  it('steps further aside the closer the other comes, and goes back as they pass', () => {
    const me = at(0, 0, 0);
    const far = asideFor(me, [at(0, 0.7, Math.PI)]);
    const near = asideFor(me, [at(0, 0.3, Math.PI)]);
    expect(near).toBeGreaterThan(far);
    expect(near).toBeCloseTo(ASIDE.offset, 6);
    expect(asideFor(me, [at(0, -0.2, Math.PI)])).toBeGreaterThan(0);
    expect(asideFor(me, [at(0, -ASIDE.past - 0.2, Math.PI)])).toBe(0);
  });

  it('works whichever way they walk: along x as well as along z', () => {
    const [a, b] = [at(0, 0, Math.PI / 2), at(0.5, 0, -Math.PI / 2)];
    const [pa, pb] = [placedAside(a, asideFor(a, [b])), placedAside(b, asideFor(b, [a]))];
    expect(Math.abs(pa.z - pb.z)).toBeGreaterThan(ASIDE.offset);
    expect(pa.x).toBeCloseTo(0, 6);
  });

  it('eases the offset in and out, and never overshoots', () => {
    let aside = 0;
    for (let frame = 0; frame < 100; frame++) {
      const next = easeAside(aside, ASIDE.offset, 1 / 30);
      expect(next).toBeGreaterThanOrEqual(aside);
      expect(next).toBeLessThanOrEqual(ASIDE.offset);
      aside = next;
    }
    expect(aside).toBeCloseTo(ASIDE.offset, 3);
    expect(easeAside(0, 1, 10)).toBe(1);
  });
});
