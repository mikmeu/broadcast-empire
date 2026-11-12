import { describe, expect, it } from 'vitest';
import { LOAN } from '../config/balance';
import { repayLoan, takeLoan, type ActionResult } from './actions';
import { sensibleBot } from './bots';
import { companyValue, maxLoan, settleMonth } from './economy';
import { createInitialState } from './newGame';
import { unlockAll } from './unlocks';
import type { GameState } from './state';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}
const error = (result: ActionResult) => (result.ok ? 'no error' : result.error);

/** The sensible bot's day-0 station: one channel in the Capital, five shows, free desks for two more staff. */
const station = () => structuredClone(unlockAll(sensibleBot(createInitialState(1))));

describe('loans', () => {
  it('lends up to half the company value and is repaid monthly', () => {
    const s = station();
    expect(maxLoan(s)).toBe(Math.floor((companyValue(s) * LOAN.maxShare) / 1000) * 1000);
    expect(error(takeLoan(s, maxLoan(s) + 1000, 24))).toMatch(/at most/);

    let loaned = ok(takeLoan(s, 50_000, 24));
    expect(loaned.money).toBe(s.money + 50_000);
    expect(error(takeLoan(loaned, 10_000, 24))).toMatch(/current loan/);

    loaned = structuredClone(loaned);
    const balance = loaned.loan!.balance;
    settleMonth(loaned);
    expect(loaned.loan!.monthsLeft).toBe(23);
    expect(loaned.loan!.balance).toBeLessThan(balance);
    expect(loaned.monthlyReports.at(-1)!.loanPayments).toBe(loaned.loan!.monthlyPayment);

    const repaid = ok(repayLoan(loaned));
    expect(repaid.loan).toBeNull();
  });
});
