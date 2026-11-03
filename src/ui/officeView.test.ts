import { describe, expect, it } from 'vitest';
import { stepFloor } from './officeView';

describe('stepFloor', () => {
  it('goes one floor up or down, through locked floors', () => {
    expect(stepFloor(1, 1, 6)).toBe(2);
    expect(stepFloor(3, 1, 6)).toBe(4);
    expect(stepFloor(4, -1, 6)).toBe(3);
  });

  it('stops at floor 1 and at the roof', () => {
    expect(stepFloor(1, -1, 6)).toBe(1);
    expect(stepFloor(7, 1, 6)).toBe(7);
    expect(stepFloor(6, 1, 6)).toBe(7);
  });

  it('works for a building of four floors', () => {
    expect(stepFloor(4, 1, 4)).toBe(5);
    expect(stepFloor(5, 1, 4)).toBe(5);
    expect(stepFloor(5, -1, 4)).toBe(4);
  });
});
