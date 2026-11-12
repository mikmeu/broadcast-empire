import { describe, expect, it } from 'vitest';
import { FRESHNESS_DECAY, FRESHNESS_MIN } from '../config/balance';
import { sensibleBot } from './bots';
import { createInitialState } from './newGame';
import type { GameState } from './state';
import { tick } from './tick';

/** The sensible bot's station on its first day: five radio shows on the air. */
const station = () => sensibleBot(createInitialState(1));

describe('freshness (Phase 12d)', () => {
  it('wears a show down slowly: nine tenths after two months, just under half after a year', () => {
    let s = station();
    const show = s.shows.find((x) => x.hostId !== null)!;
    const fresh = (state: GameState) => state.shows.find((x) => x.id === show.id)!.freshness;
    expect(fresh(s)).toBe(1);
    // No bot from here on, so nobody revamps the show.
    const at: Record<number, number> = {};
    for (let day = 1; day <= 365; day++) {
      // Rivals' offers to its host are turned down, so the show keeps its host all year.
      // Nobody is ill or on leave (0.20.0), so the show airs every day.
      s = { ...tick({ ...s, employees: s.employees.map((e) => ({ ...e, away: null })) }), poachOffers: [] };
      at[day] = fresh(s);
    }
    expect(at[60]).toBeGreaterThan(0.9);
    expect(at[60]).toBeCloseTo(1 - 60 * FRESHNESS_DECAY, 6);
    expect(at[365]).toBeLessThan(0.5);
    expect(at[365]).toBeGreaterThan(0.47);
    // It never rises by itself, and falls a little every day it is on the air.
    for (let day = 2; day <= 365; day++) expect(at[day]).toBeLessThan(at[day - 1]!);
  });

  it('stops at a floor well under half, more than a year in', () => {
    expect(FRESHNESS_MIN).toBeLessThan(0.45);
    expect((1 - FRESHNESS_MIN) / FRESHNESS_DECAY).toBeGreaterThan(365);
    let s = station();
    s = { ...s, shows: s.shows.map((show) => ({ ...show, freshness: FRESHNESS_MIN + FRESHNESS_DECAY / 2 })) };
    s = tick(tick(s));
    for (const show of s.shows.filter((x) => x.hostId !== null)) expect(show.freshness).toBe(FRESHNESS_MIN);
  });
});
