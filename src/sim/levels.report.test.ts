import { describe, expect, it } from 'vitest';
import { settleMonth } from './economy';
import { createInitialState } from './newGame';
import { SAVE_VERSION, fromSaveFile, toSaveFile } from './save';
import type { GameState } from './state';

/** The text of the report that settleMonth files on a new game. */
function report(s: GameState): string {
  settleMonth(s);
  return s.messages.find((m) => /report:/.test(m.text))!.text;
}

describe('level-ups in the monthly report', () => {
  it('names the person when there was one, with the raise', () => {
    const s = createInitialState(1);
    s.levelUps = { count: 1, raise: 150, name: 'Anna' };
    const text = report(s);
    expect(text).toMatch(/ Anna reached a new level; wages up €150 a month\.$/);
    expect(s.levelUps).toEqual({ count: 0, raise: 0, name: null });
  });

  it('counts them when there were more', () => {
    const s = createInitialState(1);
    s.levelUps = { count: 3, raise: 1250, name: 'Anna' };
    expect(report(s)).toMatch(/ 3 people reached a new level; wages up €1,250 a month\.$/);
    expect(s.levelUps.count).toBe(0);
  });

  it('leaves the wages out when there was no raise', () => {
    const s = createInitialState(1);
    s.levelUps = { count: 2, raise: 0, name: 'Anna' };
    expect(report(s)).toMatch(/ 2 people reached a new level\.$/);
  });

  it('says nothing in a month without level-ups', () => {
    const s = createInitialState(1);
    expect(report(s)).not.toMatch(/new level/);
  });
});

describe('the save', () => {
  it('loads a save of version 48 with an empty count', () => {
    const file = JSON.parse(JSON.stringify(toSaveFile(createInitialState(1), 0)));
    delete file.state.levelUps;
    const { version, state } = fromSaveFile({ ...file, version: 48 });
    expect(version).toBe(SAVE_VERSION);
    expect(state.levelUps).toEqual({ count: 0, raise: 0, name: null });
  });
});
