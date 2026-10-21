import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RENTABLE_ROOM_TYPES } from '../config/office';

describe('the pictures of the kinds of room', () => {
  it('has one for every room you can build (draw it with scripts/rooms.html)', () => {
    const missing = RENTABLE_ROOM_TYPES.filter((type) => !existsSync(new URL(`../assets/rooms/${type}.png`, import.meta.url)));
    expect(missing).toEqual([]);
  });
});
