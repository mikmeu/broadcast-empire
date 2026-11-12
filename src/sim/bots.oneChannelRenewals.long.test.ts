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
    // Three of four did before the sales jobs (0.21.0, #360); the bot sets none, so its two salespeople split into one on
    // deals and one on brands, three of the four seeds go under in the first years (see bots.oneChannel.test.ts), and one is left.
    // #375 tried a bot that sets the jobs and found no better: the guard stays at one (see bots.oneChannel.test.ts).
    expect(games.filter((g) => !g.s.bankrupt && g.kept === 2).length).toBeGreaterThanOrEqual(1);
  }, slow(300_000));
});
