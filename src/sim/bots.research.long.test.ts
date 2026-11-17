import { describe, expect, it } from 'vitest';
import { growthBot, researchBot, without } from './bots';
import { createInitialState } from './newGame';
import { slow } from './slow';
import { tick } from './tick';

// A long test: it runs in its own job, when a change touches game logic (see PIPELINE.md, "Testing: what runs where").

const jan1 = (year: number) => Math.round((Date.UTC(year, 0, 1) - Date.UTC(1970, 0, 1)) / 86_400_000);

describe('Phase 4a acceptance', () => {
  it('researching ahead gives a measurable edge (three games, 1970–1990)', () => {
    // One game says little: which hosts happen to be in the pool moves the listeners by a few percent either way.
    const edges = [1, 2, 3].map((seed) => {
      let ahead = createInitialState(seed);
      let onTime = createInitialState(seed);
      let aheadSum = 0;
      let onTimeSum = 0;
      // Both play without a bold tone (#458): bold shows draw more and are sued more, and with the growers' tone on the
      // two games part ways by lawsuits and reputation, not by research (mean 0.998 with it, 1.032 without; the other five
      // features of #458 left out one at a time gave 1.00 to 1.01 on three seeds, within the noise).
      const research = without('tone')(researchBot);
      const growth = without('tone')(growthBot);
      for (let day = 0; day < jan1(1990); day++) {
        ahead = tick(research(ahead));
        onTime = tick(growth(onTime));
        aheadSum += ahead.listeners;
        onTimeSum += onTime.listeners;
      }
      return aheadSum / onTimeSum;
    });
    // Smaller since 0.16.0 (about 1.7% against 3.5%): every manager has a room of their own, and the floor that takes is
    // floor the company that researches more would have grown on. With several managers to a room it is 2.5% again.
    expect(edges.reduce((sum, edge) => sum + edge, 0) / edges.length, edges.map((edge) => edge.toFixed(3)).join(', ')).toBeGreaterThan(1.01);
    // And it never costs listeners worth speaking of (one game in three comes out even since 0.16.0, at 0.02% short).
    // Since #455 both bots train and swap hosts, so their host pools part ways sooner: one game came out 2.4% short with the mean still above 1.01.
    for (const edge of edges) expect(edge).toBeGreaterThan(0.97);
  }, slow(240_000));
});
