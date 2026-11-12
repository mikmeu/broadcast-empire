import { describe, expect, it } from 'vitest';
import { growthBot, networkBot } from './bots';
import { createInitialState } from './newGame';
import { slow } from './slow';
import type { GameState } from './state';
import { tick } from './tick';

// A long test: it runs in its own job, when a change touches game logic (see PIPELINE.md, "Testing: what runs where").

describe('version 0.13.0', () => {
  describe('a test player that grows the way the wiki says (R102)', () => {
    // Over three games together (0.16.0): in one of them, seed 1, the station for the same audience draws a few per cent more.
    it('a second station for other audiences draws more than a second one for the same', () => {
      const play = (bot: typeof growthBot, seed: number) => {
        let s = createInitialState(seed);
        while (s.day < 4 * 365) s = tick(bot(s));
        return s;
      };
      const second = (s: GameState) => s.channels.find((c) => c.name === 'Bot Talk' || c.name === 'Bot Rock');
      const listeners = (s: GameState) => s.weeklyReports.slice(-8).reduce((sum, r) => sum + r.channels.filter((c) => c.isPlayer && c.medium === 'radio').reduce((x, c) => x + c.slots.reduce((y, slot) => y + slot.listeners, 0), 0), 0);
      let [growthTotal, networkTotal] = [0, 0];
      for (const seed of [1, 2, 3]) {
        const growth = play(growthBot, seed);
        const network = play(networkBot, seed);
        expect(second(growth)?.name).toBe('Bot Rock');
        expect(second(network)?.name).toBe('Bot Talk');
        growthTotal += listeners(growth);
        networkTotal += listeners(network);
      }
      expect(networkTotal).toBeGreaterThan(growthTotal);
    }, slow(300_000));
  });
});
