import { describe, expect, it } from 'vitest';
import { growthBot, tvBot } from './bots';
import { createInitialState } from './newGame';
import { tick } from './tick';

// A long test: it runs in its own job, when a change touches game logic (see PIPELINE.md, "Testing: what runs where").

describe('The broadcasting authority (0.19.0, R120)', () => {
  it('the test players keep the rules: no complaint in four years, on radio or on television', () => {
    for (const bot of [growthBot, tvBot]) {
      let s = createInitialState(1);
      const seen = new Set<string>();
      while (s.day < 365 * 4 && !s.bankrupt) {
        s = tick(bot(s));
        for (const c of s.complaints) seen.add(c.id);
      }
      expect(s.bankrupt).toBeFalsy();
      expect([...seen]).toEqual([]);
    }
  }, 120_000);
});
