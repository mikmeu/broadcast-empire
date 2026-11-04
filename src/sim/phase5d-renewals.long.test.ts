import { describe, expect, it } from 'vitest';
import { capitalBot } from './bots';
import { createInitialState } from './newGame';
import { slow } from './slow';
import { tick } from './tick';

// A long test: it runs in its own job, when a change touches game logic (see PIPELINE.md, "Testing: what runs where").

describe('Phase 5d acceptance', () => {
  it('a well-run single channel in Coaxia keeps its license through two renewals', () => {
    const games = [2, 3, 4, 5].map((seed) => {
      let s = createInitialState(seed);
      let kept = 0;
      let lost = 0;
      while (s.day < 17 * 365 && !s.bankrupt) {
        const seen = s.nextMessageId;
        s = tick(capitalBot(s));
        for (const m of s.messages.filter((x) => x.id >= seen)) {
          if (/keeps its radio license in Coaxia/.test(m.text)) kept += 1;
          if (/has lost its|has lapsed/.test(m.text)) lost += 1;
        }
      }
      return { s, kept, lost };
    });
    // No company ever loses its license in a renewal round, and most are still on the air after their second.
    expect(games.every((g) => g.lost === 0)).toBe(true);
    expect(games.filter((g) => !g.s.bankrupt && g.kept === 2).length).toBeGreaterThanOrEqual(3);
  }, slow(300_000));
});
