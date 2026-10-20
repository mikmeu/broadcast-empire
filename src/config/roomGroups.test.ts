import { describe, expect, it } from 'vitest';
import { ROOM_GROUP, ROOM_GROUP_NAMES, ROOM_TYPE_NAMES, type RoomType } from './office';

describe('the groups of the Rooms window (0.18.0, #103)', () => {
  const types = Object.keys(ROOM_TYPE_NAMES) as RoomType[];

  it('gives every kind of room a group that exists', () => {
    for (const t of types) expect(Object.keys(ROOM_GROUP_NAMES)).toContain(ROOM_GROUP[t]);
  });

  it('has at least one kind of room in every group', () => {
    for (const g of Object.keys(ROOM_GROUP_NAMES)) expect(types.some((t) => ROOM_GROUP[t] === g)).toBe(true);
  });

  it('puts the TV news studio under Studios and the canteen under Morale', () => {
    expect(ROOM_GROUP.tvNewsStudio).toBe('studios');
    expect(ROOM_GROUP.canteen).toBe('morale');
  });
});
