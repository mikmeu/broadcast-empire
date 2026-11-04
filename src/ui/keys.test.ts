import { describe, expect, it } from 'vitest';
import { floorStepForKey, isTextField, speedForKey } from './keys';

describe('floorStepForKey', () => {
  it('maps Page Up to one floor up and Page Down to one down', () => {
    expect(floorStepForKey('PageUp')).toBe(1);
    expect(floorStepForKey('PageDown')).toBe(-1);
  });

  it('gives nothing for other keys', () => {
    for (const key of ['ArrowUp', 'ArrowDown', 'Enter', 'w', 's', '1']) expect(floorStepForKey(key)).toBeUndefined();
  });
});

describe('speedForKey', () => {
  it('maps the digit row and the numpad by position', () => {
    expect(speedForKey('Digit1')).toBe(1);
    expect(speedForKey('Numpad1')).toBe(1);
    expect(speedForKey('Digit2')).toBe(2);
    expect(speedForKey('Digit3')).toBe(4);
    expect(speedForKey('Numpad3')).toBe(4);
  });

  it('gives nothing for other keys', () => {
    for (const code of ['Digit0', 'Digit4', 'Numpad0', 'KeyA', 'Space']) expect(speedForKey(code)).toBeUndefined();
  });
});

describe('isTextField', () => {
  it('blocks the keys only in fields you type into', () => {
    expect(isTextField({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTextField({ tagName: 'INPUT', type: 'text' })).toBe(true);
    expect(isTextField({ tagName: 'INPUT', type: 'number' })).toBe(true);
    expect(isTextField({ tagName: 'INPUT' })).toBe(true);
    expect(isTextField({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('lets the keys through on checkboxes, sliders, lists and buttons', () => {
    expect(isTextField({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
    expect(isTextField({ tagName: 'INPUT', type: 'radio' })).toBe(false);
    expect(isTextField({ tagName: 'INPUT', type: 'range' })).toBe(false);
    expect(isTextField({ tagName: 'SELECT' })).toBe(false);
    expect(isTextField({ tagName: 'BUTTON' })).toBe(false);
    expect(isTextField(null)).toBe(false);
  });
});
