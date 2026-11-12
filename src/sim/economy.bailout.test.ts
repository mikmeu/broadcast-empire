import { describe, expect, it } from 'vitest';
import { BAILOUT, BANKRUPTCY_MONTHS } from '../config/balance';
import { HINTS } from '../config/guide';
import { ARTICLES } from '../wiki/articles';
import { sensibleBot } from './bots';
import { toCalendarDate } from './calendar';
import { acknowledge, guideView, setGuide } from './guide';
import { createInitialState } from './newGame';
import { fromSaveFile, SAVE_VERSION, toSaveFile } from './save';
import type { GameState } from './state';
import { tick } from './tick';

/** A company with nothing but debts, on 1 January 1970. */
const broke = (): GameState => ({ ...createInitialState(1), money: -200_000 });
/** Plays up to the next first of the month. */
const toNextMonth = (state: GameState) => {
  let s = tick(state);
  while (toCalendarDate(s.day).dayOfMonth !== 1) s = tick(s);
  return s;
};
const months = (state: GameState, count: number) => Array.from({ length: count }).reduce<GameState>((s) => toNextMonth(s), state);

describe('version 0.9.0', () => {
  describe('the bail-out (R6)', () => {
    it('Uncle Tabby pays in once, when the bank would close the company down', () => {
      const before = months(broke(), BANKRUPTCY_MONTHS - 1);
      expect(before).toMatchObject({ negativeMonths: BANKRUPTCY_MONTHS - 1, bailedOut: false, bankrupt: false });

      const saved = toNextMonth(before);
      expect(saved).toMatchObject({ bailedOut: true, bankrupt: false, negativeMonths: 0 });
      expect(saved.money - before.money).toBe(BAILOUT.amount);
      expect(BAILOUT.amount).toBe(50_000);
      expect(saved.messages.at(-1)).toMatchObject({ kind: 'danger', text: expect.stringMatching(/I have paid in €50,000.*once.*still in the red/), from: { kind: 'tabby' } });
      // A gift, not income: no report counts it.
      expect(saved.monthlyReports.at(-1)!.net).toBe(0);
      expect(saved.ledger.revenue).toBe(0);
    });

    it('does not happen twice: the bank counts again and then the game is over', () => {
      const saved = months(broke(), BANKRUPTCY_MONTHS);
      const later = months(saved, BANKRUPTCY_MONTHS - 1);
      expect(later).toMatchObject({ negativeMonths: BANKRUPTCY_MONTHS - 1, bankrupt: false });
      const over = toNextMonth(later);
      expect(over).toMatchObject({ bankrupt: true, bailedOut: true });
      expect(over.money).toBe(later.money);
    });

    it('a company that the sum puts back above zero is simply back in business', () => {
      const s = months({ ...createInitialState(1), money: -20_000 }, BANKRUPTCY_MONTHS);
      expect(s).toMatchObject({ money: 30_000, negativeMonths: 0, bailedOut: true });
      expect(s.messages.at(-1)!.text).not.toMatch(/still in the red/);
    });

    it('Penny says so, also in the middle of the first weeks, before her word about being in the red', () => {
      const line = HINTS.find((hint) => hint.id === 'bailout')!;
      // What is spoken names no figure, so a recording stays right.
      expect(line.say).not.toMatch(/\d|fifty/i);
      const s = setGuide(months(broke(), BANKRUPTCY_MONTHS), true);
      expect(guideView(s)).toMatchObject({ kind: 'hint', line: { id: 'bailout' } });
      expect(guideView(acknowledge(s, 'bailout'))).toMatchObject({ kind: 'hint', line: { id: 'red' } });
      expect(guideView(setGuide(months(broke(), 1), true))).toMatchObject({ kind: 'hint', line: { id: 'red' } });
    });

    it('a game from before has the rescue still to come, and the wiki explains it', () => {
      const old = toSaveFile(sensibleBot(createInitialState(1)), 1) as unknown as { version: number; state: Record<string, unknown> };
      old.version = 24;
      delete old.state.bailedOut;
      expect(fromSaveFile(old)).toMatchObject({ version: SAVE_VERSION, state: { bailedOut: false } });
      expect(SAVE_VERSION).toBeGreaterThanOrEqual(25);
      expect(JSON.stringify(ARTICLES)).toMatch(/your uncle steps in.*€50,000/i);
    });
  });
});
