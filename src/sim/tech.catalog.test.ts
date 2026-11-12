import { describe, expect, it } from 'vitest';
import { FURNITURE, ROOM_TYPE_NAMES, ROOM_TYPE_NOTES, type RoomType } from '../config/office';
import { createInitialState } from './newGame';
import { lockedTiers, purchaseTier } from './tech';

describe('the furniture catalog (Phase 8b)', () => {
  it('has something for every kind of room, and a line about each room and each piece', () => {
    for (const type of Object.keys(ROOM_TYPE_NAMES) as RoomType[]) {
      expect(Object.values(FURNITURE).some((spec) => spec.rooms.includes(type)), type).toBe(true);
      expect(ROOM_TYPE_NOTES[type].length, type).toBeGreaterThan(10);
    }
    for (const [type, spec] of Object.entries(FURNITURE)) expect(spec.about.length, type).toBeGreaterThan(10);
  });
});

describe('locked versions in the catalog (Phase 8b)', () => {
  it('lists the newer versions of a piece that still have to be researched, oldest first', () => {
    const s = createInitialState(1);
    expect(lockedTiers(s, 'workstation').map((l) => [l.tier, l.tech.id])).toEqual([[2, 'electricTypewriter'], [3, 'personalComputer'], [4, 'cloudProduction']]);
    expect(lockedTiers(s, 'mixingDesk').map((l) => l.tier)).toEqual([2, 3, 4]);
    expect(lockedTiers(s, 'camera').map((l) => l.tech.id)).toEqual(['satelliteUplink', 'hdBroadcasting']);
    // Pieces that come in one version have nothing locked.
    expect(lockedTiers(s, 'onAirLight')).toEqual([]);
    expect(lockedTiers(s, 'canteenTable')).toEqual([]);
  });

  it('drops a version once it is researched, and the older ones with it', () => {
    const s = { ...createInitialState(1), techs: ['personalComputer' as const] };
    expect(purchaseTier(s, 'workstation')).toBe(3);
    expect(lockedTiers(s, 'workstation').map((l) => l.tier)).toEqual([4]);
    expect(lockedTiers(s, 'mixingDesk').map((l) => l.tier)).toEqual([2, 3, 4]);
  });
});
