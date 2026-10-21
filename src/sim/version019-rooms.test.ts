import { describe, expect, it } from 'vitest';
import { inRoom, tileCount, wallsOf, type RoomType } from '../config/office';
import { buildRoom, joinRooms, placeFurniture, reshapeRoom, releaseRoom, type ActionResult } from './actions';
import { createInitialState } from './newGame';
import { doorTiles, monthlyRent, sharesWall } from './office';
import { buildCost, doorSpots } from './rooms';
import { SAVE_VERSION, fromSaveFile, toSaveFile } from './save';
import type { GameState } from './state';
import { wallsOn } from '../office/routes';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}
const error = (result: ActionResult) => (result.ok ? 'no error' : result.error);

const start = (): GameState => ({ ...createInitialState(1), money: 5_000_000, floorsUnlocked: 2 });

/** Builds a room of a kind in the north row of floor 1. */
function build(state: GameState, type: RoomType, x: number, y: number, w: number, h: number, doorX = x + 0.5): GameState & { lastId?: string } {
  return ok(buildRoom(state, { floor: 1, x, y, w, h, door: { x: doorX, z: y > 5 ? y : y + h }, type }));
}

/** Two canteens side by side, the second one shallower: together they are an L. Ids are `a` and `b`. */
function twoCanteens(): { s: GameState; a: string; b: string } {
  let s = build(start(), 'canteen', 4, 0, 6, 5);
  const a = s.lastId!;
  s = build(s, 'canteen', 10, 2, 4, 3);
  return { s, a, b: s.lastId! };
}

describe('0.19.0: joined rooms', () => {
  it('leaves the walls of a plain rectangle as they were', () => {
    const walls = wallsOf({ x: 4, y: 0, w: 6, h: 5, door: { x: 7.5, z: 5 } });
    expect(walls).toEqual([[4, 0, 10, 0], [4, 5, 7, 5], [8, 5, 10, 5], [4, 0, 4, 5], [10, 0, 10, 5]]);
    // The same rectangle as one part has the same walls, as a set.
    const asPart = wallsOf({ x: 4, y: 0, w: 6, h: 5, parts: [{ x: 4, y: 0, w: 6, h: 5 }], door: { x: 7.5, z: 5 } });
    const key = (w: number[]) => w.join(',');
    expect(asPart.map(key).sort()).toEqual(walls.map(key).sort());
  });

  it('joins two canteens into an L', () => {
    const { s, a, b } = twoCanteens();
    const before = s.money;
    const joined = ok(joinRooms(s, a, b));
    expect(joined.money).toBe(before);
    expect(joined.rooms.find((r) => r.roomId === b)).toBeUndefined();
    const room = joined.rooms.find((r) => r.roomId === a)!;
    expect(room).toMatchObject({ x: 4, y: 0, w: 10, h: 5, name: s.rooms.find((r) => r.roomId === a)!.name });
    expect(room.parts).toEqual([{ x: 4, y: 0, w: 6, h: 5 }, { x: 10, y: 2, w: 4, h: 3 }]);
    expect(tileCount(room)).toBe(6 * 5 + 4 * 3);
    expect(inRoom(room, 12, 0)).toBe(false);
    expect(inRoom(room, 12, 3)).toBe(true);
    // The rent of both rooms is the same as before.
    expect(monthlyRent(room, joined)).toBe(monthlyRent(s.rooms.find((r) => r.roomId === a)!, s) + monthlyRent(s.rooms.find((r) => r.roomId === b)!, s));
    expect(buildCost(room)).toBe(buildCost({ w: 6, h: 5 }) + buildCost({ w: 4, h: 3 }));
  });

  it('draws the walls round the L only, and leaves the shared wall open', () => {
    const { s, a, b } = twoCanteens();
    const room = ok(joinRooms(s, a, b)).rooms.find((r) => r.roomId === a)!;
    const walls = wallsOf(room);
    const length = walls.reduce((sum, [x1, z1, x2, z2]) => sum + Math.abs(x2 - x1) + Math.abs(z2 - z1), 0);
    // The round of an L of 10 by 5 with a 4 by 2 corner cut out, less the door: 30 less 1.
    expect(length).toBe(30 - 1);
    // Nothing runs along the line where the parts meet (x = 10, y 2 to 5).
    expect(walls.some(([x1, z1, x2, z2]) => x1 === 10 && x2 === 10 && Math.min(z1, z2) < 5 && Math.max(z1, z2) > 2 && Math.min(z1, z2) >= 2)).toBe(false);
    // The inner corner is walled: from (10, 0) down to (10, 2).
    expect(walls).toContainEqual([10, 0, 10, 2]);
    expect(walls).toContainEqual([10, 2, 14, 2]);
  });

  it('keeps people’s paths in the L: through the open wall, not the missing corner', () => {
    const { s, a, b } = twoCanteens();
    const joined = ok(joinRooms(s, a, b));
    const walls = wallsOn(joined, 1);
    const blocked = (x1: number, z1: number, x2: number, z2: number) => walls.some(([a1, b1, a2, b2]) => a1 === a2 ? x1 === x2 && x1 === a1 && Math.max(Math.min(b1, b2), Math.min(z1, z2)) < Math.min(Math.max(b1, b2), Math.max(z1, z2)) : z1 === z2 && z1 === b1 && Math.max(Math.min(a1, a2), Math.min(x1, x2)) < Math.min(Math.max(a1, a2), Math.max(x1, x2)));
    // The old wall between the two is gone.
    expect(blocked(10, 2, 10, 5)).toBe(false);
    // The missing corner is still walled off.
    expect(blocked(10, 0, 10, 2)).toBe(true);
    expect(blocked(10, 2, 14, 2)).toBe(true);
  });

  it('moves the furniture, the shows and the id of the room kept', () => {
    let { s, a, b } = twoCanteens();
    s = ok(placeFurniture(s, b, 'canteenTable', 11 - 10, 3 - 2, 0));
    const tableId = s.rooms.find((r) => r.roomId === b)!.furniture[0]!.id;
    s.rooms.find((r) => r.roomId === b)!.cleanliness = 50;
    const joined = ok(joinRooms(s, a, b));
    const room = joined.rooms.find((r) => r.roomId === a)!;
    const table = room.furniture.find((f) => f.id === tableId)!;
    // It stands where it stood on the floor: (11, 3), measured from the box (4, 0).
    expect({ x: room.x + table.x, y: room.y + table.y }).toEqual({ x: 11, y: 3 });
    expect(room.cleanliness).toBeCloseTo((100 * 30 + 50 * 12) / 42);
  });

  it('refuses what can’t be joined', () => {
    const { s, a, b } = twoCanteens();
    expect(error(joinRooms(s, a, a))).toMatch(/don’t have/);
    expect(error(joinRooms(s, a, 'nope'))).toMatch(/don’t have/);
    expect(error(joinRooms(s, 'reception', a))).toMatch(/building/);
    // Another kind.
    const office = build(s, 'office', 14, 0, 4, 5);
    expect(error(joinRooms(office, b, office.lastId!))).toMatch(/not the same kind/);
    // Less than three tiles of wall in common.
    const low = build(start(), 'canteen', 4, 0, 6, 3);
    const small = build(low, 'canteen', 10, 1, 4, 3);
    expect(error(joinRooms(small, low.lastId!, small.lastId!))).toMatch(/tiles of wall/);
    // Not next door.
    const far = build(s, 'canteen', 4, 6, 4, 5, 4.5 + 0);
    expect(error(joinRooms(far, a, far.lastId!))).toMatch(/tiles of wall/);
    // Already joined.
    const joined = ok(joinRooms(s, a, b));
    const third = build(joined, 'canteen', 14, 2, 3, 3);
    expect(sharesWall(third.rooms.find((r) => r.roomId === third.lastId)!, joined.rooms.find((r) => r.roomId === a)!)).toBe(true);
    expect(error(joinRooms(third, a, third.lastId!))).toMatch(/joined room/);
  });

  it('refuses a second desk in a room that holds one', () => {
    let s = build(start(), 'managementOffice', 4, 0, 3, 5);
    const a = s.lastId!;
    s = build(s, 'managementOffice', 7, 0, 3, 5);
    const b = s.lastId!;
    s = ok(placeFurniture(s, a, 'managerDesk', 0, 2, 0));
    s = ok(placeFurniture(s, b, 'managerDesk', 0, 2, 0));
    expect(error(joinRooms(s, a, b))).toMatch(/room for one/);
  });

  it('can’t be redrawn, but can be taken away', () => {
    const { s, a, b } = twoCanteens();
    const joined = ok(joinRooms(s, a, b));
    const room = joined.rooms.find((r) => r.roomId === a)!;
    expect(error(reshapeRoom(joined, a, { x: room.x, y: room.y, w: room.w, h: room.h, door: room.door }))).toBe('A joined room can’t be redrawn.');
    expect(ok(releaseRoom(joined, a)).rooms.some((r) => r.roomId === a)).toBe(false);
  });

  it('gives no door at the inner corner or along the line where the parts meet', () => {
    const { s, a, b } = twoCanteens();
    const room = ok(joinRooms(s, a, b)).rooms.find((r) => r.roomId === a)!;
    const spots = doorSpots(room);
    // The line where the parts meet is inside the room.
    expect(spots.some((d) => d.x === 10 && d.z > 2 && d.z < 5)).toBe(false);
    // Every spot has a door that opens outside the room.
    for (const d of spots) expect(doorTiles(room, d)!.outside.every(([x, y]) => !inRoom(room, x, y))).toBe(true);
    // A door on the line where the parts meet is no door.
    expect(doorTiles(room, { x: 10, z: 3.5 })).toBeNull();
  });

  it('loads a save of version 37', () => {
    const { s, a, b } = twoCanteens();
    const file = JSON.parse(JSON.stringify(toSaveFile(s, 0)));
    const { version, state } = fromSaveFile({ ...file, version: 37 });
    expect(version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(38);
    expect(state.rooms.every((r) => r.parts === undefined)).toBe(true);
    // And it can be joined.
    expect(ok(joinRooms(state, a, b)).rooms.find((r) => r.roomId === a)?.parts).toHaveLength(2);
  });
});
