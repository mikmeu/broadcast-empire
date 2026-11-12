import { describe, expect, it } from 'vitest';
import { setMailGroup } from './actions';
import { sensibleBot } from './bots';
import { MAIL_GROUPS, type MailGroup } from './inbox';
import { createInitialState } from './newGame';
import { SAVE_VERSION, fromSaveFile, toSaveFile } from './save';
import { addMessage, type GameState } from './state';
import { advance } from './tick';

const ALL = MAIL_GROUPS.map((g) => g.id);

function off(s: GameState, ...groups: MailGroup[]): GameState {
  let state = s;
  for (const group of groups) {
    const result = setMailGroup(state, group, false);
    if (!result.ok) throw new Error(result.error);
    state = result.state;
  }
  return state;
}

describe('e-mail filters (0.21.0, #349)', () => {
  it('starts with every group on', () => {
    expect(createInitialState(1).mailOff).toEqual([]);
  });

  it('switches a group off and on again, once', () => {
    const s = off(off(createInitialState(1), 'research'), 'research');
    expect(s.mailOff).toEqual(['research']);
    const back = setMailGroup(s, 'research', true);
    expect(back.ok && back.state.mailOff).toEqual([]);
  });

  it('sends nothing for a group that is off, and everything else', () => {
    const s = structuredClone(off(createInitialState(1), 'research'));
    addMessage(s, 'info', 'Points ready.', undefined, 'research', 'research', 'research');
    addMessage(s, 'info', 'Sales has offers.', undefined, 'sales', undefined, 'salesOffers');
    addMessage(s, 'info', 'No group.');
    expect(s.messages.map((m) => m.text)).toEqual(['Sales has offers.', 'No group.']);
  });

  it('lets trouble through even when its group is off', () => {
    const s = structuredClone(off(createInitialState(1), 'upkeep'));
    addMessage(s, 'danger', 'The camera has broken down.', undefined, undefined, 'technician', 'upkeep');
    addMessage(s, 'warning', 'The studio is dirty.', undefined, undefined, 'cleaner', 'upkeep');
    expect(s.messages.map((m) => m.text)).toEqual(['The camera has broken down.']);
  });

  it('rejects a group that does not exist', () => {
    expect(setMailGroup(createInitialState(1), 'nonsense' as MailGroup, false).ok).toBe(false);
  });

  it('a save from version 73 loads with every group on', () => {
    const old = JSON.parse(JSON.stringify(toSaveFile(createInitialState(1), 1))) as { version: number; state: Record<string, unknown> };
    delete old.state.mailOff;
    old.version = 73;
    const { version, state } = fromSaveFile(old);
    expect(version).toBe(SAVE_VERSION);
    expect(state.mailOff).toEqual([]);
  });

  it('keeps what is off in the save', () => {
    const s = off(createInitialState(1), 'minutes', 'rivals');
    expect(fromSaveFile(JSON.parse(JSON.stringify(toSaveFile(s, 1)))).state.mailOff).toEqual(['minutes', 'rivals']);
  });

  it('plays exactly the same with every group off, apart from the messages', () => {
    const run = (start: GameState) => {
      let s = start;
      for (let i = 0; i < 20 && !s.bankrupt; i++) s = sensibleBot(advance(s, 7));
      return s;
    };
    const quiet = run(off(createInitialState(1), ...ALL));
    const loud = run(createInitialState(1));
    expect(quiet.day).toBe(loud.day);
    expect(quiet.money).toBe(loud.money);
    expect(quiet.employees.map((e) => e.id)).toEqual(loud.employees.map((e) => e.id));
    expect(quiet.viewers).toBe(loud.viewers);
    expect(quiet.rngState).toBe(loud.rngState);
    expect(quiet.messages.length).toBeLessThan(loud.messages.length);
  });
});
