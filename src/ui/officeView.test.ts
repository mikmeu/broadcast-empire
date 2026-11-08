import { describe, expect, it } from 'vitest';
import { floorLabel, stepFloor } from './officeView';

describe('floorLabel', () => {
  it('names an open floor', () => {
    expect(floorLabel(2, 6, 3)).toBe('Floor 2');
    expect(floorLabel(3, 6, 3)).toBe('Floor 3');
  });

  it('says a floor is locked', () => {
    expect(floorLabel(4, 6, 3)).toBe('Floor 4 · locked');
  });

  it('names the roof, above the last floor', () => {
    expect(floorLabel(7, 6, 6)).toBe('Roof');
    expect(floorLabel(5, 4, 4)).toBe('Roof');
  });
});

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
