import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, SaveError, fromSaveFile, toSaveFile } from './save';
import { createInitialState } from './newGame';
import { advance } from './tick';

describe('save files', () => {
  it('round-trips a game state through JSON', () => {
    const state = advance(createInitialState(123), 45);
    const restored = fromSaveFile(JSON.parse(JSON.stringify(toSaveFile(state, 1000))));
    expect(restored).toEqual({ version: SAVE_VERSION, savedAt: 1000, state });
  });

  it.each([null, 42, 'save', [], {}, { version: 1, savedAt: 0 }])('rejects garbage: %j', (data) => {
    expect(() => fromSaveFile(data)).toThrow(SaveError);
  });

  it('rejects saves with missing or invalid fields', () => {
    const save = toSaveFile(createInitialState(1), 0);
    expect(() => fromSaveFile({ ...save, state: { ...save.state, money: 'lots' } })).toThrow(SaveError);
    expect(() => fromSaveFile({ ...save, state: { ...save.state, day: Number.NaN } })).toThrow(SaveError);
  });

  it('rejects saves from a newer version', () => {
    const save = toSaveFile(createInitialState(1), 0);
    expect(() => fromSaveFile({ ...save, version: SAVE_VERSION + 1 })).toThrow(/newer version/);
  });
});

describe('save migrations', () => {
  it('upgrades a Phase 0 save to a fresh company on the same day', () => {
    const v1 = { version: 1, savedAt: 5, state: { day: 40, seed: 7, rngState: 7, money: 150_000, listeners: 0, researchPoints: 0, reputation: 0 } };
    const { state } = fromSaveFile(v1);
    expect(state.day).toBe(40);
    expect(state.seed).toBe(7);
    expect(state.candidates.length).toBeGreaterThan(0);
  });
});
