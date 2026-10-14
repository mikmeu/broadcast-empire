import { describe, expect, it } from 'vitest';
import { createInitialState } from './newGame';
import { advance, tick } from './tick';

describe('tick', () => {
  it('advances one day', () => {
    expect(tick(createInitialState(1)).day).toBe(1);
  });

  it('does not mutate its input', () => {
    const state = createInitialState(1);
    const copy = structuredClone(state);
    tick(state);
    expect(state).toEqual(copy);
  });

  it('is deterministic', () => {
    expect(advance(createInitialState(99), 400)).toEqual(advance(createInitialState(99), 400));
  });

  it('gives the same result whether advanced in one go or in steps', () => {
    const steps = advance(advance(createInitialState(5), 150), 250);
    expect(steps).toEqual(advance(createInitialState(5), 400));
  });
});
