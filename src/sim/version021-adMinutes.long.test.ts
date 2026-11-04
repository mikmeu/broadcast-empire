import { describe, expect, it } from 'vitest';
import { sensibleBot } from './bots';
import { toDay } from './calendar';
import { createInitialState } from './newGame';
import { slow } from './slow';
import type { GameState } from './state';
import { tick } from './tick';

// A long test: it runs in its own job, when a change touches game logic (see PIPELINE.md, "Testing: what runs where").

const END = toDay(1973, 1, 1);

/** The sensible test player to the end of 1972, with every channel's dial held at `minutes` (null: the dial is left alone). */
function play(seed: number, minutes: number | null) {
  let s: GameState = createInitialState(seed);
  const complaints = new Set<string>();
  while (s.day < END && !s.bankrupt) {
    s = sensibleBot(s);
    if (minutes !== null) for (const c of s.channels) c.adMinutes = minutes;
    s = tick(s);
    for (const c of s.complaints) if (c.rule === 'ads') complaints.add(c.id);
  }
  const listeners = s.weeklyReports.slice(-8).reduce((sum, r) => sum + r.channels.filter((c) => c.isPlayer).reduce((x, c) => x + c.slots.reduce((y, slot) => y + slot.listeners, 0), 0), 0);
  const reputation = s.channels.flatMap((c) => Object.values(c.reputation)).reduce((sum: number, r) => sum + (r ?? 0), 0);
  return { bankrupt: s.bankrupt, money: s.money, listeners, reputation, complaints: complaints.size };
}

describe('ad minutes (0.21.0, #358)', () => {
  it('five minutes plays the game as it was; six pays quickly and then stops paying; four earns less and draws more', () => {
    const SEEDS = [1, 2, 3];
    const total = { 4: 0, 5: 0, 6: 0 };
    const heard = { 4: 0, 5: 0 };
    let complained = 0;
    for (const seed of SEEDS) {
      const four = play(seed, 4);
      const five = play(seed, 5);
      const six = play(seed, 6);
      // A game that leaves the dial alone is the game at five minutes.
      expect(play(seed, null)).toEqual(five);
      for (const r of [four, five, six]) expect(r.bankrupt).toBe(false);
      // The reputation falls with every minute added; so do the listeners, though in one game the bot grows slower with less money, so four is compared over the three.
      expect(five.listeners).toBeGreaterThan(six.listeners);
      expect(four.reputation).toBeGreaterThan(five.reputation);
      expect(five.reputation).toBeGreaterThan(six.reputation);
      // Within the limit nobody complains; from 1972, six minutes is over it.
      expect(four.complaints).toBe(0);
      expect(five.complaints).toBe(0);
      complained += six.complaints;
      heard[4] += four.listeners;
      heard[5] += five.listeners;
      total[4] += four.money;
      total[5] += five.money;
      total[6] += six.money;
    }
    expect(heard[4]).toBeGreaterThan(heard[5]);
    expect(complained).toBeGreaterThan(0);
    // Measured (seeds 1 to 3, end of 1972): six ends 18% above five in cash, with the 1972 fines paid; four ends below it.
    // The guard is that six never runs away with the game, and that four is not the better choice.
    expect(total[6]).toBeLessThan(total[5] * 1.35);
    expect(total[4]).toBeLessThan(total[5]);
  }, slow(600_000));
});
