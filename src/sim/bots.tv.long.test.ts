import { describe, expect, it } from 'vitest';
import { growthBot, tvBot } from './bots';
import { companyValue } from './economy';
import { createInitialState } from './newGame';
import { slow } from './slow';
import { tick } from './tick';

// A long test: it runs in its own job, when a change touches game logic (see PIPELINE.md, "Testing: what runs where").
// The three seeds stay in one file: together they take less than the longest of the other long tests.

describe('Phase 3 acceptance', () => {
  it.each([1, 2, 3])('TV is an expensive mid-game step that pays off (seed %i)', (seed) => {
    let tv = createInitialState(seed);
    let radio = createInitialState(seed);
    let launch: number | null = null;
    let launchCost = 0;
    for (let day = 0; day < Math.round(10 * 365.25); day++) {
      const before = tv.money;
      tv = tick(tvBot(tv));
      radio = tick(growthBot(radio));
      if (launch === null && tv.channels.some((c) => c.medium === 'tv')) {
        launch = tv.day;
        launchCost = before - tv.money;
      }
    }
    expect(tv.bankrupt).toBe(false);
    // Mid-game: radio has to pay for it first.
    expect(launch).not.toBeNull();
    expect(launch!).toBeGreaterThan(180);
    // Expensive: the launch takes studios, a library and staff at once, before the license. (Until 0.12.0 the TV company
    // was also still behind the one that stayed in radio a year later; since titles are paid by the airing it catches up sooner.)
    expect(launchCost).toBeGreaterThan(100_000);
    // Meaningful: after ten years it's worth clearly more, and TV earns a large part of the revenue.
    // (1.3 until 0.22.0: the TV bot now also builds a weather studio and hires a meteorologist, about €40k and a salary
    // for a small lift, and on seed 3 it ended at 1.286 times the radio company.)
    expect(companyValue(tv)).toBeGreaterThan(1.25 * companyValue(radio));
    const week = tv.weeklyReports.at(-1)!.channels.filter((c) => c.isPlayer);
    const tvShare = week.filter((c) => c.medium === 'tv').reduce((s, c) => s + c.revenue, 0) / week.reduce((s, c) => s + c.revenue, 0);
    expect(tvShare).toBeGreaterThan(0.4);
  }, slow(60_000));
});
