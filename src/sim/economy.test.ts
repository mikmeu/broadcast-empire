import { describe, expect, it } from 'vitest';
import { BANKRUPTCY_MONTHS } from '../config/balance';
import { hire } from './actions';
import { billsDue, monthlyCosts } from './economy';
import { createInitialState } from './newGame';
import type { GameState } from './state';
import { advance } from './tick';

function withEmployee(): GameState {
  const state = createInitialState(1);
  const result = hire(state, state.candidates[0]!.id);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

describe('monthly bills', () => {
  it('accrues costs daily and pays about one month of them on the 1st', () => {
    const state = withEmployee();
    const salary = monthlyCosts(state).salaries;
    const lastDayOfJanuary = advance(state, 30);
    expect(lastDayOfJanuary.money).toBe(state.money);
    expect(billsDue(lastDayOfJanuary.ledger)).toBeGreaterThan(0);

    const february = advance(lastDayOfJanuary, 1);
    const report = february.monthlyReports[0]!;
    expect(report).toMatchObject({ year: 1970, month: 1 });
    // 31 days of a monthly salary is a little more than one month.
    expect(report.salaries).toBeCloseTo((salary * 12 * 31) / 365.25);
    expect(february.money).toBeCloseTo(state.money - report.salaries);
    expect(billsDue(february.ledger)).toBe(0);
  });

  it(`goes bankrupt after ${BANKRUPTCY_MONTHS} month-ends in the red, and stops the clock`, () => {
    // A company that has had its one rescue (version 0.9.0) already.
    const broke = { ...withEmployee(), money: -1, bailedOut: true };
    const after2 = advance(broke, 31 + 28);
    expect(after2.negativeMonths).toBe(2);
    expect(after2.bankrupt).toBe(false);

    const after3 = advance(after2, 31);
    expect(after3.bankrupt).toBe(true);
    expect(advance(after3, 10).day).toBe(after3.day);
  });

  it('resets the warning count after a month back in the black', () => {
    const recovered = { ...advance({ ...withEmployee(), money: -1 }, 31), money: 1_000_000 };
    expect(recovered.negativeMonths).toBe(1);
    expect(advance(recovered, 28).negativeMonths).toBe(0);
  });
});
