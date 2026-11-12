import { describe, expect, it } from 'vitest';
import { buildRoom, moveFurniture, placeStored, releaseRoom, sellFurniture, sellStored, storeFurniture, type ActionResult } from './actions';
import { sensibleBot } from './bots';
import { companyValue } from './economy';
import { autoPlaceFurniture } from './fixtures';
import { createInitialState } from './newGame';
import { findFreeSpot, findRoom } from './office';
import { proposeRoom } from './rooms';
import { fromSaveFile, SAVE_VERSION, toSaveFile } from './save';
import type { GameState } from './state';
import { resaleValue } from './tech';
import { advance } from './tick';
import { unlockAll } from './unlocks';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}
const error = (result: ActionResult) => (result.ok ? '' : result.error);

/** A radio station from the sensible test player, a month on the air, with everything open, money to spare and two floors. */
const station = (days = 30): GameState => {
  const s = structuredClone(unlockAll(advance(sensibleBot(createInitialState(1)), days)));
  s.money = 5_000_000;
  s.floorsUnlocked = 2;
  return s;
};

describe('version 0.18.0', () => {
  describe('a store for furniture (#67)', () => {
    /** The station with a second office on the second floor: the ids of the one up there and of the one with the desks. */
    const twoFloors = () => {
      const base = station();
      const plan = proposeRoom(base, 2, 'office')!;
      const s = ok(buildRoom(base, { ...plan, type: 'office' }));
      const upstairs = s.rooms.find((r) => r.floor === 2 && r.type === 'office')!.roomId;
      const downstairs = s.rooms.find((r) => r.floor === 1 && r.type === 'office' && r.furniture.some((f) => f.type === 'workstation'))!.roomId;
      return { s, upstairs, downstairs };
    };
    const desk = (s: GameState, roomId: string) => findRoom(s, roomId)!.furniture.find((f) => f.type === 'workstation')!;

    it('puts a piece away for nothing, and it keeps its tier, wear and age', () => {
      const { s, downstairs } = twoFloors();
      const item = desk(s, downstairs);
      item.condition = 60;
      const before = { ...item };
      const stored = ok(storeFurniture(s, downstairs, item.id));
      expect(stored.money).toBe(s.money);
      expect(findRoom(stored, downstairs)!.furniture.some((f) => f.id === item.id)).toBe(false);
      expect(stored.storage).toEqual([before]);
    });

    it('frees the desk of whoever had it', () => {
      const { s, downstairs } = twoFloors();
      const item = desk(s, downstairs);
      s.employees[0]!.desk = item.id;
      const stored = ok(storeFurniture(s, downstairs, item.id));
      expect(stored.employees[0]!.desk).toBeNull();
    });

    it('places a stored piece in a room on another floor, free, as old and worn as it was', () => {
      const { s, upstairs, downstairs } = twoFloors();
      const item = desk(s, downstairs);
      item.condition = 70;
      const stored = ok(storeFurniture(s, downstairs, item.id));
      const spot = findFreeSpot(stored, findRoom(stored, upstairs)!, 'workstation')!;
      const placed = ok(placeStored(stored, item.id, upstairs, spot.x, spot.y, 1));
      expect(placed.storage).toHaveLength(0);
      expect(placed.money).toBe(stored.money);
      expect(findRoom(placed, upstairs)!.furniture.find((f) => f.id === item.id)).toMatchObject({ x: spot.x, y: spot.y, turn: 1, condition: 70, tier: item.tier, boughtOn: item.boughtOn });
    });

    it('keeps a piece in storage when it goes in the wrong kind of room or on a taken spot', () => {
      const { s, downstairs } = twoFloors();
      const item = desk(s, downstairs);
      const stored = ok(storeFurniture(s, downstairs, item.id));
      const studio = stored.rooms.find((r) => r.type === 'radioStudio')!;
      expect(error(placeStored(stored, item.id, studio.roomId, 0, 0))).not.toBe('');
      const other = desk(stored, downstairs);
      expect(error(placeStored(stored, item.id, downstairs, other.x, other.y))).not.toBe('');
      expect(error(placeStored(stored, 'f-nothing', downstairs, 0, 0))).toMatch(/isn’t in storage/);
      expect(stored.storage).toHaveLength(1);
    });

    it('sells a stored piece for what it is worth, as a piece in a room is sold', () => {
      const { s, downstairs } = twoFloors();
      const item = desk(s, downstairs);
      const inRoom = ok(sellFurniture(s, downstairs, item.id));
      const stored = ok(storeFurniture(s, downstairs, item.id));
      const sold = ok(sellStored(stored, item.id));
      expect(sold.storage).toHaveLength(0);
      expect(sold.money).toBe(stored.money + resaleValue(item, stored.day));
      expect(sold.money).toBe(inRoom.money);
      expect(sold.ledger.purchases).toBe(inRoom.ledger.purchases);
      expect(error(sellStored(sold, item.id))).toMatch(/isn’t in storage/);
    });

    it('counts stored pieces in the company’s value', () => {
      const { s, downstairs } = twoFloors();
      expect(companyValue(ok(storeFurniture(s, downstairs, desk(s, downstairs).id)))).toBe(companyValue(s));
    });

    it('lets a room be given up once its furniture is sold or stored', () => {
      const { s, upstairs } = twoFloors();
      const furnished = ok(autoPlaceFurniture(s, upstairs, 'workstation'));
      expect(error(releaseRoom(furnished, upstairs))).toBe('Sell or store the furniture in this room first.');
      const emptied = ok(storeFurniture(furnished, upstairs, findRoom(furnished, upstairs)!.furniture[0]!.id));
      expect(error(releaseRoom(emptied, upstairs))).toBe('');
    });

    it('moves a piece to a room on another floor', () => {
      const { s, upstairs, downstairs } = twoFloors();
      const item = desk(s, downstairs);
      const spot = findFreeSpot(s, findRoom(s, upstairs)!, 'workstation')!;
      const moved = ok(moveFurniture(s, downstairs, item.id, { roomId: upstairs, ...spot }));
      expect(findRoom(moved, upstairs)!.furniture.some((f) => f.id === item.id)).toBe(true);
      expect(findRoom(moved, upstairs)!.floor).toBe(2);
    });

    it('loads a game from before with nothing in storage', () => {
      const old = JSON.parse(JSON.stringify(toSaveFile(station(), 0)));
      delete old.state.storage;
      // 43 is the save version before storage, in 0.18.0.
      const { state, version } = fromSaveFile({ ...old, version: 43 });
      expect(version).toBe(SAVE_VERSION);
      expect(SAVE_VERSION).toBeGreaterThanOrEqual(43);
      expect(state.storage).toEqual([]);
    });
  });
});
