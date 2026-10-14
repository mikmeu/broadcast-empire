import { describe, expect, it } from 'vitest';
import { DAYS_PER_YEAR, FURNITURE_WORTH } from '../config/balance';
import { CORE, FLOOR, FURNITURE, RECEPTION, type RoomType } from '../config/office';
import { buildRoom, moveFurniture, placeFurniture, reshapeRoom, rotateFurniture, sellFurniture, upgradeEquipment, type ActionResult } from './actions';
import { autoPlaceFurniture } from './fixtures';
import { sensibleBot } from './bots';
import { companyValue } from './economy';
import { createInitialState } from './newGame';
import { doorways, findFreeSpot, findRoom, placementError } from './office';
import { roomError, type RoomPlan } from './rooms';
import { SAVE_VERSION, fromSaveFile, toSaveFile } from './save';
import type { GameState } from './state';
import { furniturePrice, resaleValue, worthAt } from './tech';
import { tick } from './tick';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
const error = (result: ActionResult) => (result.ok ? null : result.error);

const fresh = (): GameState => ({ ...createInitialState(1), money: 5_000_000, floorsUnlocked: 3 });
/** A room with its door in the middle of its south wall, or of another one. */
const plan = (x: number, y: number, w: number, h: number, side: 's' | 'w' = 's'): RoomPlan & { door: { x: number; z: number } } => ({
  floor: 1,
  x,
  y,
  w,
  h,
  door: side === 's' ? { x: x + Math.floor(w / 2) + 0.5, z: y + h } : { x, z: y + Math.floor(h / 2) + 0.5 },
});
/** A game with one room of a kind, and the id of that room. */
function withRoom(type: RoomType, at = plan(2, 0, 6, 5)): { s: GameState; id: string } {
  const result = buildRoom(fresh(), { ...at, type });
  if (!result.ok) throw new Error(result.error);
  return { s: result.state, id: String(result.id) };
}
const pieces = (s: GameState, id: string) => findRoom(s, id)!.furniture;
const later = (s: GameState, days: number): GameState => ({ ...s, day: s.day + days });

describe('furniture and the room panel (Phase 13e)', () => {
  describe('what a piece is worth', () => {
    it('gives its whole price back when it is sold straight after it was placed', () => {
      const { s: before, id } = withRoom('office');
      const s = ok(placeFurniture(before, id, 'workstation', 0, 0));
      const item = pieces(s, id)[0]!;
      expect(item.boughtOn).toBe(s.day);
      expect(resaleValue(item, s.day)).toBe(FURNITURE.workstation.cost);
      // Placed by mistake and sold again: nothing is lost, in money or on the books.
      const sold = ok(sellFurniture(s, id, item.id));
      expect(sold.money).toBe(before.money);
      expect(sold.ledger.purchases).toBe(before.ledger.purchases);
      // And so it is for the rest of its first week, also when it has worn a little by then.
      const week = later(s, FURNITURE_WORTH.graceDays);
      pieces(week, id)[0]!.condition = 90;
      expect(ok(sellFurniture(week, id, item.id)).money).toBe(before.money);
    });

    it('is worth less as it gets older, down to a floor', () => {
      const { graceDays, used, floor, years } = FURNITURE_WORTH;
      expect(worthAt(0)).toBe(1);
      expect(worthAt(graceDays)).toBe(1);
      // Second-hand from the day after, and less by the year from there on.
      expect(worthAt(graceDays + 1)).toBeLessThan(used);
      expect(worthAt(graceDays + 1)).toBeCloseTo(used, 3);
      expect(worthAt(graceDays + (years * DAYS_PER_YEAR) / 2)).toBeCloseTo((used + floor) / 2);
      expect(worthAt(graceDays + years * DAYS_PER_YEAR)).toBeCloseTo(floor);
      expect(worthAt(40 * DAYS_PER_YEAR)).toBe(floor);
      for (let age = graceDays; age < 8 * DAYS_PER_YEAR; age += 30) expect(worthAt(age + 30)).toBeLessThanOrEqual(worthAt(age));

      const { s: before, id } = withRoom('office');
      const s = ok(placeFurniture(before, id, 'workstation', 0, 0));
      const item = pieces(s, id)[0]!;
      const price = FURNITURE.workstation.cost;
      expect(resaleValue(item, s.day + graceDays + 1)).toBe(Math.round(price * worthAt(graceDays + 1)));
      expect(resaleValue(item, s.day + 3 * DAYS_PER_YEAR)).toBeLessThan(resaleValue(item, s.day + DAYS_PER_YEAR));
      // Wear comes on top of age.
      expect(resaleValue({ ...item, condition: 50 }, s.day + 400)).toBe(Math.round(price * worthAt(400) * 0.5));
      // The company is worth what its furniture would bring.
      expect(companyValue(later(s, 400))).toBe(s.money + resaleValue(item, s.day + 400));
    });

    it('makes a piece new again when it is upgraded', () => {
      let s: GameState = { ...createInitialState(3), money: 5_000_000 };
      for (let day = 0; day < 40; day++) s = tick(sensibleBot(s));
      const studio = s.rooms.find((r) => r.type === 'radioStudio')!;
      const desk = studio.furniture.find((f) => f.type === 'mixingDesk')!;
      expect(s.day - desk.boughtOn).toBeGreaterThan(FURNITURE_WORTH.graceDays);
      s = { ...s, techs: [...s.techs, 'fmStereo'], money: 5_000_000 };
      const upgraded = ok(upgradeEquipment(s, studio.roomId));
      const now = pieces(upgraded, studio.roomId).find((f) => f.id === desk.id)!;
      expect(now).toMatchObject({ tier: 2, condition: 100, boughtOn: s.day });
      // The old desk went for what it was worth that day.
      expect(s.money - upgraded.money).toBe(furniturePrice('mixingDesk', 2) - resaleValue(desk, s.day));
    });

    it('takes the pieces of an older save to be as old as half their price says', () => {
      const { s: before, id } = withRoom('office');
      const s = later(ok(placeFurniture(before, id, 'workstation', 0, 0)), 50);
      const old = JSON.parse(JSON.stringify(toSaveFile(s, 0)));
      for (const room of old.state.rooms) for (const item of room.furniture) delete item.boughtOn;
      const { state, version } = fromSaveFile({ ...old, version: 22 });
      expect(version).toBe(SAVE_VERSION);
      const item = pieces(state, id)[0]!;
      // What it sold for until now, give or take a euro of rounding.
      expect(Math.abs(resaleValue(item, state.day) - FURNITURE.workstation.cost / 2)).toBeLessThanOrEqual(1);
      expect(resaleValue(item, state.day + 365)).toBeLessThan(resaleValue(item, state.day));
      // A save of today keeps the day every piece was bought.
      expect(pieces(fromSaveFile(JSON.parse(JSON.stringify(toSaveFile(s, 0)))).state, id)[0]!.boughtOn).toBe(s.day - 50);
    });
  });

  describe('moving a piece', () => {
    it('moves it within its room for nothing, and it stays the piece it was', () => {
      const { s: before, id } = withRoom('office');
      let s = later(ok(placeFurniture(before, id, 'workstation', 0, 0)), 30);
      pieces(s, id)[0]!.condition = 70;
      const item = { ...pieces(s, id)[0]! };
      const moved = ok(moveFurniture(s, id, item.id, { roomId: id, x: 4, y: 1, turn: 1 }));
      expect(pieces(moved, id)).toEqual([{ ...item, x: 4, y: 1, turn: 1 }]);
      expect(moved.money).toBe(s.money);
      // It keeps the way it is turned unless it is given another; and it may overlap where it stood itself.
      s = ok(moveFurniture(moved, id, item.id, { roomId: id, x: 3, y: 1 }));
      expect(pieces(s, id)[0]).toMatchObject({ x: 3, y: 1, turn: 1 });
    });

    it('refuses a place where it does not fit', () => {
      const { s: before, id } = withRoom('office');
      let s = ok(placeFurniture(before, id, 'workstation', 0, 0));
      s = ok(placeFurniture(s, id, 'workstation', 2, 0));
      const second = pieces(s, id)[1]!;
      expect(error(moveFurniture(s, id, second.id, { roomId: id, x: 1, y: 1 }))).toMatch(/already there/);
      expect(error(moveFurniture(s, id, second.id, { roomId: id, x: 5, y: 0 }))).toMatch(/doesn’t fit/);
      expect(error(moveFurniture(s, id, second.id, { roomId: id, x: 2, y: 3 }))).toMatch(/in front of a door/);
      expect(error(moveFurniture(s, id, 'nothing', { roomId: id, x: 0, y: 3 }))).toMatch(/isn’t here/);
      expect(error(moveFurniture(s, id, second.id, { roomId: 'nowhere', x: 0, y: 0 }))).toMatch(/don’t have this room/);
    });

    it('moves it to another room that takes its kind, and to no other', () => {
      const { s: before, id } = withRoom('office');
      const second = buildRoom(before, { ...plan(8, 0, 6, 5), type: 'office' });
      const studio = buildRoom(ok(second), { ...plan(14, 0, 4, 5), type: 'radioStudio' });
      let s = ok(placeFurniture(ok(studio), id, 'workstation', 0, 0));
      const item = pieces(s, id)[0]!;
      s = ok(moveFurniture(s, id, item.id, { roomId: String(second.ok && second.id), x: 1, y: 2 }));
      expect(pieces(s, id)).toEqual([]);
      expect(pieces(s, String(second.ok && second.id))).toEqual([{ ...item, x: 1, y: 2 }]);
      expect(error(moveFurniture(s, String(second.ok && second.id), item.id, { roomId: String(studio.ok && studio.id), x: 0, y: 0 }))).toMatch(/doesn't belong/);
      // A planter goes anywhere, the hall of the building included.
      s = ok(placeFurniture(s, id, 'planter', 0, 0));
      const planter = pieces(s, id)[0]!;
      s = ok(moveFurniture(s, id, planter.id, { roomId: RECEPTION.id, x: 0, y: 0 }));
      expect(pieces(s, RECEPTION.id)).toEqual([planter]);
    });
  });

  describe('the floor in front of a door', () => {
    it('stays clear: nothing is placed, moved or turned onto it', () => {
      // A room of 6 by 5 with its door in the middle of the south wall: the tile inside it is (3, 4).
      const { s, id } = withRoom('office');
      const room = findRoom(s, id)!;
      expect(doorways(s, room)).toEqual([[5, 4]]);
      expect(placementError(s, room, 'planter', 3, 4)).toMatch(/in front of a door/);
      expect(error(placeFurniture(s, id, 'planter', 3, 4))).toMatch(/in front of a door/);
      // A workstation of 2 by 2 that would cover it, from either side.
      expect(error(placeFurniture(s, id, 'workstation', 2, 3))).toMatch(/in front of a door/);
      expect(error(placeFurniture(s, id, 'workstation', 3, 3))).toMatch(/in front of a door/);
      // Right beside it is fine.
      let placed = ok(placeFurniture(s, id, 'workstation', 4, 3));
      placed = ok(placeFurniture(placed, id, 'planter', 2, 4));
      // A couch beside the door that would lie across it when turned.
      const { s: manager, id: office } = withRoom('managementOffice');
      const couch = ok(placeFurniture(manager, office, 'couch', 3, 3));
      expect(error(rotateFurniture(couch, office, pieces(couch, office)[0]!.id))).toMatch(/no room to turn/);
    });

    it('is skipped by whoever looks for the first free spot', () => {
      const west = withRoom('office', plan(2, 1, 6, 4, 'w'));
      const room = findRoom(west.s, west.id)!;
      // The door is in the west wall, beside the third row: a room fills up from the wall across from its door.
      expect(doorways(west.s, room)).toEqual([[2, 3]]);
      expect(findFreeSpot(west.s, room, 'planter')).toEqual({ x: 5, y: 0 });
      let filled = west.s;
      for (let n = 0; n < 23; n++) filled = ok(autoPlaceFurniture(filled, west.id, 'planter'));
      expect(pieces(filled, west.id).some((f) => f.x === 0 && f.y === 2)).toBe(false);
      expect(error(autoPlaceFurniture(filled, west.id, 'planter'))).toMatch(/no room left/);
    });

    it('fills a room from the back, so that the door costs no workplaces', () => {
      // An office of 8 by 5 south of the corridor, its door in the north wall: four workstations in a row, twice.
      const north = { floor: 1, x: 2, y: 6, w: 8, h: 5, door: { x: 6, z: 6 } };
      let { s, id } = withRoom('office', north);
      expect(doorways(s, findRoom(s, id)!)).toEqual([[5, 6], [6, 6]]);
      expect(findFreeSpot(s, findRoom(s, id)!, 'workstation')).toEqual({ x: 0, y: 3 });
      for (let n = 0; n < 8; n++) s = ok(autoPlaceFurniture(s, id, 'workstation'));
      expect(pieces(s, id).every((f) => f.y > 0)).toBe(true);
      expect(error(autoPlaceFurniture(s, id, 'workstation'))).toMatch(/no room left/);
      // With its door in the south wall it fills from the north, as rooms always did.
      const south = withRoom('office');
      expect(findFreeSpot(south.s, findRoom(south.s, south.id)!, 'workstation')).toEqual({ x: 0, y: 0 });
    });

    it('holds in the hall too: at its own door, at the entrance, and at the door of a room that opens into it', () => {
      const s = fresh();
      const hall = findRoom(s, RECEPTION.id)!;
      // The way in from the entrance and the way out to the corridor, both in line with the entrance.
      const inLine = FLOOR.corridorY - CORE.hall.y;
      expect(doorways(s, hall)).toEqual([[CORE.hall.x + CORE.hall.w - 1, FLOOR.corridorY], [CORE.hall.x, FLOOR.corridorY]]);
      expect(error(placeFurniture(s, RECEPTION.id, 'planter', 0, inLine))).toMatch(/in front of a door/);
      expect(error(placeFurniture(s, RECEPTION.id, 'planter', CORE.hall.w - 1, inLine))).toMatch(/in front of a door/);
      expect(error(placeFurniture(s, RECEPTION.id, 'receptionDesk', 1, inLine))).toMatch(/in front of a door/);
      ok(placeFurniture(s, RECEPTION.id, 'receptionDesk', 1, 0));

      // A room against the hall with its door into it: the tile of the hall it opens onto stays clear as well.
      const beside = { floor: 1, x: 0, y: 0, w: 4, h: 5, door: { x: 0, z: 3.5 } };
      const built = buildRoom(s, { ...beside, type: 'office' });
      const withDoor = ok(built);
      expect(doorways(withDoor, findRoom(withDoor, RECEPTION.id)!)).toContainEqual([-1, 3]);
      expect(error(placeFurniture(withDoor, RECEPTION.id, 'planter', CORE.hall.w - 1, 3 - CORE.hall.y))).toMatch(/in front of a door/);

      // And the other way round: no door where something in the hall stands in front of it.
      const planted = ok(placeFurniture(s, RECEPTION.id, 'planter', CORE.hall.w - 1, 3 - CORE.hall.y));
      expect(roomError(planted, beside)).toMatch(/planter in the reception stands where the door would open/);
      expect(error(buildRoom(planted, { ...beside, type: 'office' }))).toMatch(/planter in the reception/);
      expect(roomError(planted, { ...beside, door: { x: 2.5, z: 5 } })).toBeNull();
    });

    it('leaves a piece of an older game where it stands, and no door is moved to where a piece stands', () => {
      // A desk in front of the door, from before the rule: it stays, and can be moved away or sold.
      const { s: before, id } = withRoom('office');
      const s = ok(placeFurniture(before, id, 'planter', 0, 0));
      pieces(s, id)[0]!.x = 3;
      pieces(s, id)[0]!.y = 4;
      const item = pieces(s, id)[0]!;
      expect(fromSaveFile(JSON.parse(JSON.stringify(toSaveFile(s, 0)))).state.rooms[0]!.furniture).toEqual([item]);
      expect(pieces(ok(moveFurniture(s, id, item.id, { roomId: id, x: 0, y: 0 })), id)[0]).toMatchObject({ x: 0, y: 0 });
      expect(error(moveFurniture(ok(moveFurniture(s, id, item.id, { roomId: id, x: 0, y: 0 })), id, item.id, { roomId: id, x: 3, y: 4 }))).toMatch(/in front of a door/);
      ok(sellFurniture(s, id, item.id));
      // The door of 13d: it does not go where the planter is.
      const room = findRoom(s, id)!;
      const elsewhere = ok(moveFurniture(s, id, item.id, { roomId: id, x: 1, y: 4 }));
      expect(error(reshapeRoom(elsewhere, id, { x: room.x, y: room.y, w: room.w, h: room.h, door: { x: room.x + 1.5, z: room.y + room.h } }))).toMatch(/planter stands where the door would be/);
    });
  });

  it('lets the bots furnish their rooms as before, with nothing in front of a door', () => {
    let s = createInitialState(7);
    for (let day = 0; day < 200; day++) s = tick(sensibleBot(s));
    expect(s.rooms.flatMap((r) => r.furniture).length).toBeGreaterThan(8);
    for (const room of s.rooms) {
      const clear = doorways(s, room);
      for (const item of room.furniture) expect(placementError(s, { ...room, furniture: [] }, item.type, item.x, item.y, item.turn)).toBeNull();
      expect(clear.length).toBeGreaterThan(0);
    }
  });
});
