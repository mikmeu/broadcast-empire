import { describe, expect, it } from 'vitest';
import { POACH, XP } from '../config/balance';
import { sensibleBot } from './bots';
import { toDay } from './calendar';
import { salaryFor } from './economy';
import { createInitialState } from './newGame';
import { xpForNextLevel } from './staff';
import type { GameState } from './state';
import { tick } from './tick';

/** The sensible bot's station on a date. */
function station(year = 1970, month = 1, dayOfMonth = 1): GameState {
  const s = structuredClone(sensibleBot(createInitialState(1)));
  s.day = toDay(year, month, dayOfMonth);
  return s;
}

describe('pay', () => {
  it('every level-up comes with a raise', () => {
    const s = station();
    const worker = s.employees.find((e) => e.role === 'production')!;
    worker.skill = 100;
    worker.salary = 4_000;
    worker.xp = xpForNextLevel(worker.level) - 1;
    const after = tick(s).employees.find((e) => e.id === worker.id)!;
    expect(after.level).toBe(worker.level + 1);
    expect(after.salary).toBe(Math.round((4_000 * (1 + XP.raisePerLevel)) / 50) * 50);
  });

  it('rivals offer hosts the going rate plus a premium, not ever more', () => {
    let s = station();
    const star = s.employees.find((e) => e.role === 'host')!.id;
    const offers: number[] = [];
    for (let i = 0; i < 4_000; i++) {
      for (const e of s.employees) if (e.role === 'host') e.fame = e.id === star ? 90 : 0;
      const offer = s.poachOffers[0];
      if (offer) {
        offers.push(offer.salary);
        s.employees.find((e) => e.id === star)!.salary = offer.salary;
        s.poachOffers = [];
      }
      s = tick(s);
    }
    const host = s.employees.find((e) => e.id === star)!;
    expect(offers.length).toBeGreaterThan(0);
    expect(Math.max(...offers)).toBeLessThanOrEqual(salaryFor('host', 100, 100, s) * POACH.premium.max);
    // Once matched, only a clearly better offer comes; pay doesn't ratchet up every time.
    expect(offers.length).toBeLessThan(8);
    expect(host.salary).toBeLessThan(15_000);
  });
});
