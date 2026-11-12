import { beforeAll, describe, expect, it } from 'vitest';
import { RENEWAL } from '../config/balance';
import { tvBot } from './bots';
import { mostCash } from './longGames';
import { slow } from './slow';
import type { GameState } from './state';

// A long test: it runs in its own job, when a change touches game logic (see PIPELINE.md, "Testing: what runs where").

// One game of the TV test player from 1970 to 2030, on seed 1, for two guards: they were two files that each played
// this same game. The game is played once, before the tests; each test checks what it always did.

let state: GameState;
/** The most cash the company ever held, in years of its revenue. */
let years = 0;
/** Days between each renewal round opening and the warning that came before it. */
const notice: number[] = [];

beforeAll(() => {
  const warned = new Map<string, number>();
  ({ state, years } = mostCash(tvBot, 1, (before, after) => {
    for (const m of after.messages.filter((x) => x.id >= before.nextMessageId)) {
      const license = /^(.+’s (?:radio|TV) license in .+?) (runs out on|is up for renewal)/.exec(m.text);
      if (license?.[2] === 'runs out on') warned.set(license[1]!, m.day);
      if (license?.[2] === 'is up for renewal') notice.push(m.day - (warned.get(license[1]!) ?? Infinity));
    }
  }));
}, slow(300_000));

describe('Phase 5a acceptance', () => {
  it('a growing TV company never sits on more than three years of revenue, 1970–2030', () => {
    expect(state.bankrupt).toBe(false);
    expect(years).toBeLessThan(3);
    // Much of the spare cash now goes into events (Phase 5d) before the owners can take it.
    expect(state.dividendsPaid).toBeGreaterThan(10_000_000);
  });
});

// --- Phase 5d acceptance (prompt.md section 14) ---

describe('Phase 5d acceptance', () => {
  it('a growing company spends at least a quarter of its profit on events and renewals, and is warned a year before every expiry', () => {
    const s = state;
    expect(s.bankrupt).toBe(false);
    const spent = s.monthlyReports.reduce((sum, r) => sum + r.events + r.renewals, 0);
    const profit = s.monthlyReports.reduce((sum, r) => sum + r.net, 0) + spent;
    expect(spent / profit).toBeGreaterThan(0.25);
    expect(s.monthlyReports.some((r) => r.renewals > 0)).toBe(true);
    expect(s.prestige).toBeGreaterThan(100);
    // Every renewal round was announced about a year before.
    expect(notice.length).toBeGreaterThan(20);
    expect(new Set(notice)).toEqual(new Set([RENEWAL.warnDays - RENEWAL.auctionDays]));
  });
});
