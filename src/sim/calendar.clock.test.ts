import { describe, expect, it } from 'vitest';
import { MS_PER_DAY, SPEEDS } from '../config/balance';
import { isNight } from '../ui/theme';
import { ARTICLES } from '../wiki/articles';

describe('version 0.16.0', () => {
  it('runs four times slower, at the same speeds (R135)', () => {
    expect(MS_PER_DAY).toBe(16_000);
    expect(SPEEDS).toEqual([0, 1, 2, 4]);
  });

  it('a new game opens in the light, and the wiki says how the clock and the cables go (R137, R139)', () => {
    expect(isNight(0)).toBe(false);
    const text = ARTICLES.map((a) => JSON.stringify(a.sections)).join('\n');
    expect(text).toMatch(/second half of the month/);
    expect(text).toMatch(/“Cables”/);
    expect(text).toMatch(/\*\*Catalog\*\* in the bar/);
    expect(ARTICLES.some((a) => a.id === 'headquarters')).toBe(true);
  });
});
