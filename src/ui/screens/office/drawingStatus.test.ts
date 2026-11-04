import { describe, expect, it } from 'vitest';
import { stepBack, redraw } from './drawingStatus';
import type { Drawing } from '../../officeView';

const rect = { x: 3, y: 2, w: 4, h: 3 };
const door = { x: 3, z: 3 };

describe('stepBack', () => {
  it('has no step before a kind is chosen, or for a room that exists', () => {
    expect(stepBack({ roomId: null, kind: null, rect: null, door: null })).toBeNull();
    expect(stepBack({ roomId: 'r1', kind: null, rect, door })).toBeNull();
  });

  it('clears the kind and an outline the game proposed', () => {
    const drawing: Drawing = { roomId: null, kind: 'office', rect, door, proposed: true };
    expect(stepBack(drawing)).toEqual({ roomId: null, kind: null, rect: null, door: null, proposed: false });
  });

  it('keeps an outline the player drew by hand', () => {
    const drawing: Drawing = { roomId: null, kind: 'office', rect, door, proposed: false };
    expect(stepBack(drawing)).toEqual({ roomId: null, kind: null, rect, door, proposed: false });
  });
});

describe('redraw', () => {
  it('clears the outline and the door and keeps the kind', () => {
    expect(redraw({ roomId: null, kind: 'office', rect, door })).toEqual({ roomId: null, kind: 'office', rect: null, door: null, proposed: false });
  });
});
