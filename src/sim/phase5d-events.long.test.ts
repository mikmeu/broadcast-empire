import { describe, expect, it } from 'vitest';
import { RENEWAL } from '../config/balance';
import { tvBot } from './bots';
import { toDay } from './calendar';
import { createInitialState } from './newGame';
import { slow } from './slow';
import { tick } from './tick';

// A long test: it runs in its own job, when a change touches game logic (see PIPELINE.md, "Testing: what runs where").

// --- Phase 5d acceptance (prompt.md section 14) ---

describe('Phase 5d acceptance', () => {
  it('a growing company spends at least a quarter of its profit on events and renewals, and is warned a year before every expiry', () => {
    let s = createInitialState(1);
    const end = toDay(2030, 1, 1);
    const warned = new Map<string, number>();
    /** Days between each renewal round opening and the warning that came before it. */
    const notice: number[] = [];
    while (s.day < end && !s.bankrupt) {
      const seen = s.nextMessageId;
      s = tick(tvBot(s));
      for (const m of s.messages.filter((x) => x.id >= seen)) {
        const license = /^(.+’s (?:radio|TV) license in .+?) (runs out on|is up for renewal)/.exec(m.text);
        if (license?.[2] === 'runs out on') warned.set(license[1]!, m.day);
        if (license?.[2] === 'is up for renewal') notice.push(m.day - (warned.get(license[1]!) ?? Infinity));
      }
    }
    expect(s.bankrupt).toBe(false);
    const spent = s.monthlyReports.reduce((sum, r) => sum + r.events + r.renewals, 0);
    const profit = s.monthlyReports.reduce((sum, r) => sum + r.net, 0) + spent;
    expect(spent / profit).toBeGreaterThan(0.25);
    expect(s.monthlyReports.some((r) => r.renewals > 0)).toBe(true);
    expect(s.prestige).toBeGreaterThan(100);
    // Every renewal round was announced about a year before.
    expect(notice.length).toBeGreaterThan(20);
    expect(new Set(notice)).toEqual(new Set([RENEWAL.warnDays - RENEWAL.auctionDays]));
  }, slow(300_000));
});
