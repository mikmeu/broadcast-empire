import { describe, expect, it } from 'vitest';
import { DAYS_PER_YEAR } from '../config/balance';
import { capitalBot, sensibleBot } from './bots';
import { OTHER_SPENDING, RUNNING_COSTS, monthlyCosts, monthlyNet, otherSpending, outlook, runningCosts, runningResult } from './economy';
import { createInitialState } from './newGame';
import { addMessage, newAlerts, topMessage, type GameState, type Ledger } from './state';
import { tick } from './tick';
import { unlockAll } from './unlocks';

function play(bot: typeof sensibleBot, days: number, seed = 1): GameState[] {
  const states = [createInitialState(seed)];
  for (let day = 0; day < days; day++) states.push(tick(bot(states[states.length - 1]!)));
  return states;
}

describe('news about a window (Phase 12c)', () => {
  it('marks new sponsor offers as news about Sales and an ended campaign as news about Marketing', () => {
    const days = play(capitalBot, 200);
    const all = days[days.length - 1]!.messages;
    // Messages are kept for a while only, so look at every day as it happened.
    const fresh = days.slice(1).flatMap((after, n) => newAlerts(days[n]!, after));
    const offers = fresh.filter((m) => /new sponsor offer/.test(m.text));
    expect(offers.length).toBeGreaterThan(3);
    for (const m of offers) expect(m.about).toBe('sales');
    // The other news with a pop-up: something has opened (Phase 12e), since 0.9.0 a rival's offer to a host, a license
    // that runs out and a technology within reach, and since 0.10.0 a sponsor the company got to know better. A monthly
    // report or a milestone gets none.
    for (const m of fresh.filter((x) => !offers.includes(x))) expect(m.text, m.text).toMatch(/ (is|are) open: |has offered|runs out on|up for renewal|the points for |on better terms with |fewer (listeners|viewers) than a week ago/);
    expect(all.some((m) => m.about === undefined)).toBe(true);

    // A campaign on its last day: the next morning's news is about Marketing.
    const state = structuredClone(unlockAll(days[60]!));
    state.campaigns.push({ id: 'c-test', targetId: state.channels[0]!.id, audience: 'all', weeklyBudget: 0, marketerId: 'nobody', endDay: state.day + 1, weeks: 4, repeat: false });
    const ended = newAlerts(state, tick(state)).filter((m) => m.about === 'marketing');
    expect(ended).toHaveLength(1);
    expect(ended[0]!.text).toMatch(/campaign for “.+” has ended/);
  });

  it('gives each of them a pop-up of its own, the day it comes in', () => {
    const before = createInitialState(1);
    const after = structuredClone(before);
    addMessage(after, 'info', 'Sales brought in 2 new sponsor offers.', undefined, 'sales');
    addMessage(after, 'good', 'A milestone', 'milestone');
    addMessage(after, 'info', 'The campaign for “Coax FM” has ended; its effect will slowly fade.', undefined, 'marketing');
    expect(newAlerts(before, after).map((m) => m.about)).toEqual(['sales', 'marketing']);
    // The message with the most weight is still the milestone, which gets the usual notice.
    expect(topMessage(before, after)?.topic).toBe('milestone');
    // The next day they are no longer new.
    expect(newAlerts(after, after)).toEqual([]);
  });
});

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
    expect(fresh).toEqual({ income: 0, sponsors: 0, fees: 0, subscriptions: 0, merchandise: 0, votes: 0, episodes: 0, titles: 0, royalties: 0, streaming: 0, sold: 0, lets: 0, loan: 0, costs: 0, result: 0, campaigns: 0 });

    const state = play(sensibleBot, 45).pop()!;
    const ahead = outlook(state);
    const bills = monthlyCosts(state);
    const yesterday = state.lastDay!.channels.filter((c) => c.isPlayer).flatMap((c) => c.slots).reduce((sum, slot) => sum + slot.revenue, 0);
    expect(yesterday).toBeGreaterThan(0);
    // Merchandise (0.20.0) is income on top of what the slots earned.
    const merchandise = state.lastDay!.channels.filter((c) => c.isPlayer).flatMap((c) => c.slots).reduce((sum, slot) => sum + (slot.merchandise ?? 0), 0);
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
