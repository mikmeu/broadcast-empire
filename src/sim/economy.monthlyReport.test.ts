import { describe, expect, it } from 'vitest';
import { DAYS_PER_YEAR } from '../config/balance';
import { capitalBot, sensibleBot } from './bots';
import { OTHER_SPENDING, RUNNING_COSTS, monthlyCosts, monthlyNet, otherSpending, outlook, runningCosts, runningResult } from './economy';
import { createInitialState } from './newGame';
import type { GameState, Ledger } from './state';
import { tick } from './tick';

function play(bot: typeof sensibleBot, days: number, seed = 1): GameState[] {
  const states = [createInitialState(seed)];
  for (let day = 0; day < days; day++) states.push(tick(bot(states[states.length - 1]!)));
  return states;
}

describe('the monthly report (Phase 12c)', () => {
  const ledgerKeys = (ledger: Ledger) => Object.keys(ledger).filter((key) => !['revenue', 'sponsorRevenue', 'fees', 'subscriptions', 'merchandise', 'votes', 'loanProceeds', 'dividends', 'gifts', 'showSales', 'studioLets'].includes(key));

  it('sorts everything that is paid into running costs and other spending, each once', () => {
    const ledger = createInitialState(1).ledger;
    expect([...RUNNING_COSTS, ...OTHER_SPENDING].sort()).toEqual(ledgerKeys(ledger).sort());
    expect(new Set([...RUNNING_COSTS, ...OTHER_SPENDING]).size).toBe(RUNNING_COSTS.length + OTHER_SPENDING.length);
    // What you buy is not a running cost.
    expect(OTHER_SPENDING).toContain('purchases');
    expect(RUNNING_COSTS).not.toContain('purchases');
  });

  it('makes the running result and the other spending add up to the month’s result', () => {
    const days = play(capitalBot, 150);
    const reports = days[days.length - 1]!.monthlyReports;
    expect(reports.length).toBeGreaterThanOrEqual(4);
    for (const report of reports) {
      // What Uncle Tabby sends for a milestone (0.12.0) is money in, but not earned.
      expect(runningResult(report) - otherSpending(report) + report.gifts).toBeCloseTo(report.net, 6);
      expect(runningResult(report)).toBeCloseTo(report.revenue - runningCosts(report), 6);
      expect(monthlyNet(report)).toBeCloseTo(report.net, 6);
    }
    // January is the month of the shopping: in the red, though the company itself runs better than that.
    const [january] = reports;
    expect(january!.purchases).toBeGreaterThan(0);
    expect(runningResult(january!)).toBeGreaterThan(january!.net);
  });

  it('says in the report’s message whether the company pays its own way, and what was spent besides', () => {
    const days = play(sensibleBot, 70);
    const reports = days.flatMap((state, n) => (n === 0 ? [] : state.messages.filter((m) => m.id >= days[n - 1]!.nextMessageId && /report:/.test(m.text))));
    expect(reports.length).toBe(2);
    const [january, february] = reports.map((m) => m.text);
    expect(january).toMatch(/^January report: a running (profit|loss) of €[\d,]+; with €[\d,]+ spent besides, the month closes €[\d,]+ (up|down)\.( .+ reached a new level(; wages up €[\d,]+ a month)?\.)?$/);
    expect(february).toMatch(/^February report: a running (profit|loss) of €[\d,]+/);
    const state = days[days.length - 1]!;
    const report = state.monthlyReports[0]!;
    expect(january!.includes('profit')).toBe(runningResult(report) >= 0);
    // The report is routine news: good when the company pays its own way.
    for (const [n, m] of reports.entries()) expect(m.kind).toBe(runningResult(state.monthlyReports[n]!) >= 0 ? 'good' : 'info');
  });

  it('looks a month ahead: yesterday’s income every day against what the company costs as it stands', () => {
    const fresh = outlook(createInitialState(1));
    expect(fresh).toEqual({ income: 0, sponsors: 0, fees: 0, subscriptions: 0, merchandise: 0, votes: 0, episodes: 0, titles: 0, royalties: 0, newsVans: 0, helicopter: 0, streaming: 0, sold: 0, lets: 0, loan: 0, costs: 0, result: 0, campaigns: 0 });

    const state = play(sensibleBot, 45).pop()!;
    const ahead = outlook(state);
    const bills = monthlyCosts(state);
    const yesterday = state.lastDay!.channels.filter((c) => c.isPlayer).flatMap((c) => c.slots).reduce((sum, slot) => sum + slot.revenue, 0);
    expect(yesterday).toBeGreaterThan(0);
    // Merchandise (0.20.0) is income on top of what the slots earned; since 0.21.0 the day's total stands on the day (a show off the air sells too).
    const merchandise = state.lastDay!.merchandise ?? 0;
    expect(ahead.income).toBeCloseTo(((yesterday + merchandise) * DAYS_PER_YEAR) / 12, 6);
    expect(ahead.costs).toBeCloseTo(bills.salaries + bills.rent + bills.licenseFees + ahead.episodes + ahead.titles + ahead.royalties + ahead.loan, 6);
    // The sensible player plays music, so royalties are among the costs ahead (0.18.0).
    expect(ahead.royalties).toBeGreaterThan(0);
    expect(ahead.result).toBeCloseTo(ahead.income - ahead.costs, 6);
    // A loan is a running cost from the day it is taken.
    const withLoan = { ...state, loan: { balance: 50_000, monthlyPayment: 2_500, monthsLeft: 24 } } as GameState;
    expect(outlook(withLoan).costs).toBeCloseTo(ahead.costs + 2_500, 6);
  });
});
