import { describe, expect, it } from 'vitest';
import { Rng } from './rng';

const sample = (rng: Rng, n: number) => Array.from({ length: n }, () => rng.next());

describe('Rng', () => {
  it('produces the same sequence for the same seed', () => {
    expect(sample(new Rng(42), 10)).toEqual(sample(new Rng(42), 10));
  });

  it('produces different sequences for different seeds', () => {
    expect(sample(new Rng(1), 10)).not.toEqual(sample(new Rng(2), 10));
  });

  it('resumes exactly from a stored state', () => {
    const a = new Rng(7);
    sample(a, 5);
    const b = new Rng(a.state);
    expect(sample(b, 5)).toEqual(sample(a, 5));
  });

  it('stays within range', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 10_000; i++) {
      const f = rng.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = rng.int(1, 6);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(6);
    }
  });

  it('throws when picking from an empty array', () => {
    expect(() => new Rng(1).pick([])).toThrow();
  });
});
