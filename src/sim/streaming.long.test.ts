import { describe, expect, it } from 'vitest';
import { simulateDay, watchedOnDemand } from './broadcast';
import { streamBot, tvBot, type Bot } from './bots';
import { runCheat } from './cheats';
import { createInitialState } from './newGame';
import { slow } from './slow';
import type { GameState } from './state';
import { tick } from './tick';

// A long test: it runs in its own job, when a change touches game logic (see PIPELINE.md, "Testing: what runs where").

const play = (bot: Bot, state: GameState, days: number) => {
  let s = state;
  for (let i = 0; i < days && !s.bankrupt; i++) s = tick(bot(s));
  return s;
};

describe('a streaming service (R74)', () => {
  describe('against the TV test player', () => {
    // The TV bot's company after a year, moved to 2014 with everything researched: a TV company of the streaming years.
    const start = (() => {
      const grown = play(tvBot, createInitialState(2), 900);
      const moved = runCheat(grown, 'year 2014');
      if (!moved.ok) throw new Error(moved.error);
      const all = runCheat(moved.state, 'research all');
      if (!all.ok) throw new Error(all.error);
      return all.state;
    })();

    it('a game without a service draws the viewers it did; one with a service draws fewer on its own TV, and rivals none fewer', () => {
      expect(watchedOnDemand(start)).toBe(1);
      const plain = simulateDay(start);
      const streaming = simulateDay({ ...start, streaming: { since: start.day, price: 8, subscribers: 20_000, weekAgo: 0, capped: false } });
      const total = (r: typeof plain, pick: (c: (typeof plain.channels)[number]) => boolean) =>
        r.channels.filter(pick).reduce((sum, c) => sum + c.slots.reduce((x, slot) => x + slot.listeners, 0), 0);
      const ownTv = (c: (typeof plain.channels)[number]) => c.isPlayer && c.medium === 'tv';
      expect(total(streaming, ownTv)).toBeLessThan(total(plain, ownTv));
      expect(total(streaming, ownTv)).toBeGreaterThan(total(plain, ownTv) * 0.98);
      expect(total(streaming, (c) => !ownTv(c))).toBeCloseTo(total(plain, (c) => !ownTv(c)));
    });

    it(
      'earns more with a service than without, the subscriptions a fair part of it',
      () => {
        const days = 730;
        const revenue = (s: GameState) => s.monthlyReports.reduce((sum, r) => sum + r.revenue, 0);
        const subscriptions = (s: GameState) => s.monthlyReports.reduce((sum, r) => sum + r.subscriptions, 0);
        const before = revenue(start);
        const tv = play(tvBot, start, days);
        const stream = play(streamBot, start, days);
        expect(tv.bankrupt || stream.bankrupt).toBe(false);
        expect(stream.streaming).not.toBeNull();
        expect(revenue(stream) - before).toBeGreaterThan(revenue(tv) - before);
        // Measured over three seeds from 1970 (npm run simulate -- --bot stream): 9% of revenue in 2012, 24–26% by 2029.
        const share = subscriptions(stream) / (revenue(stream) - before);
        expect(share).toBeGreaterThan(0.05);
        expect(share).toBeLessThan(0.3);
      },
      slow(120_000),
    );
  });
});
