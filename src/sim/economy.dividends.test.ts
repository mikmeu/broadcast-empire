import { describe, expect, it } from 'vitest';
import { DIVIDEND } from '../config/balance';
import { sensibleBot } from './bots';
import { toDay } from './calendar';
import { dividendDue, dividendReserve } from './economy';
import { createInitialState } from './newGame';
import type { GameState } from './state';
import { advance, tick } from './tick';

/** The sensible bot's station on a date. */
function station(year = 1970, month = 1, dayOfMonth = 1): GameState {
  const s = structuredClone(sensibleBot(createInitialState(1)));
  s.day = toDay(year, month, dayOfMonth);
  return s;
}

describe('dividends', () => {
  /** A station on 31 December with this much money. */
  const yearEnd = (money: number) => ({ ...station(1971, 12, 31), money });

  it('the owners take a share of the cash above a year of running costs each January', () => {
    const s = yearEnd(2_000_000);
    const after = tick(s);
    const paid = after.dividendsPaid;
    expect(paid).toBeGreaterThan(0);
    expect(after.ledger.dividends).toBe(paid);
    // What was left after December's bills, above the reserve; a milestone reached the same day brings money after that.
    const afterBills = after.money + paid - after.ledger.gifts;
    expect(paid).toBe(Math.floor((DIVIDEND.payout * (afterBills - dividendReserve(after))) / 100) * 100);
    expect(after.messages.some((m) => /dividend/.test(m.text))).toBe(true);
    // The notice is a pop-up to Finance.
    expect(after.messages.find((m) => /dividend/.test(m.text))!.about).toBe('finance');
    // A dividend is not a cost: December's result doesn't include it.
    const december = after.monthlyReports.at(-1)!;
    expect(december.dividends).toBe(0);
    expect(december.balance).toBe(afterBills);
  });

  it('says so when December\'s bills pull a company under the reserve, and only then', () => {
    // Above the reserve on 31 December before the bills, below it after.
    const s = yearEnd(0);
    s.money = dividendReserve(s) + 400;
    expect(dividendDue(s)).toBeGreaterThan(0);
    const after = tick(s);
    expect(after.dividendsPaid).toBe(0);
    const note = after.messages.find((m) => /No dividend this year/.test(m.text));
    expect(note?.about).toBe('finance');
    // A company that was already under the reserve is not told every year.
    const poor = tick(yearEnd(100_000));
    expect(poor.messages.some((m) => /No dividend this year/.test(m.text))).toBe(false);
  });

  it('leaves a company below its reserve alone, and is only paid in January', () => {
    const poor = yearEnd(100_000);
    expect(dividendDue(poor)).toBe(0);
    expect(tick(poor).dividendsPaid).toBe(0);
    const june = { ...station(1971, 6, 30), money: 2_000_000 };
    expect(dividendDue(june)).toBeGreaterThan(0);
    expect(tick(june).dividendsPaid).toBe(0);
    expect(advance(yearEnd(2_000_000), 400).dividendsPaid).toBeGreaterThan(tick(yearEnd(2_000_000)).dividendsPaid);
  });
});
