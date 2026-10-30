import { describe, expect, it } from 'vitest';
import { RENT_PER_TILE } from '../config/balance';
import { BUILDINGS, RECEPTION, getPlot, plotsOf, receptionOf } from '../config/office';

const PLOTS = plotsOf(BUILDINGS.standard);
import { doorway, peopleOnFloor, roomAt, roomsOnFloor, CORRIDOR_Z } from '../office/layout';
import { walkPath } from '../office/routes';
import { placeFurniture, releaseRoom, setRoomType, type ActionResult } from './actions';
import { autoPlaceFurniture, onLetteredPlan, rentRoom } from './fixtures';
import { sensibleBot } from './bots';
import { monthlyCosts } from './economy';
import { createInitialState } from './newGame';
import { adjacentRooms, allRooms, borrowedDesks, buildingOf, findRoom, floorPlan, inOrder, monthlyRent, roomLayout, roomName, sharesWall } from './office';
import { SAVE_VERSION, SaveError, fromSaveFile, toSaveFile } from './save';
import type { GameState, RentedRoom } from './state';
import { tick } from './tick';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

const rich = (s: GameState): GameState => ({ ...s, money: 5_000_000, floorsUnlocked: 3 });

/** The sensible bot's station after a month, with money to spend. */
function station(): GameState {
  let s = createInitialState(1);
  for (let day = 0; day < 30; day++) s = tick(sensibleBot(s));
  // In the lettered rooms of the building's first plan: these tests are about games from before rooms were drawn.
  return rich(onLetteredPlan(s));
}

/** The same game with one of its rooms somewhere else. */
const moved = (s: GameState, roomId: string, change: Partial<RentedRoom>): GameState => ({ ...s, rooms: s.rooms.map((r) => (r.roomId === roomId ? { ...r, ...change } : r)) });

/** What a save looked like before rooms had a place of their own. */
function oldSave(state: GameState) {
  const old = JSON.parse(JSON.stringify(toSaveFile(state, 0)));
  old.state.rooms = old.state.rooms.map(({ roomId, type, furniture, cleanliness, issue }: RentedRoom) => ({ roomId, type, furniture, cleanliness, issue }));
  return { ...old, version: 20 };
}

describe('rooms in the save (Phase 13a)', () => {
  it('gives a rented room its own name, floor, rectangle and door: those of the room in the building', () => {
    const s = ok(rentRoom(rich(createInitialState(1)), 'F'));
    const plot = getPlot('F');
    expect(s.rooms).toEqual([{ roomId: 'F', name: 'Room F', floor: 1, x: plot.x, y: plot.y, w: plot.w, h: plot.h, door: plot.door, type: null, furniture: [], cleanliness: 100, issue: null }]);
    // The door is a copy: the game's room does not hang on to the building's.
    expect(s.rooms[0]!.door).not.toBe(plot.door);
    // Every room that is for rent has its door in the middle of the wall on the corridor.
    for (const p of PLOTS) {
      expect(p.door.x).toBe(p.x + p.w / 2);
      expect(Math.abs(p.door.z - CORRIDOR_Z)).toBe(0.5);
      expect(doorway(p).along).toEqual([1, 0]);
      expect(doorway(p).into).toEqual([0, p.y === 0 ? -1 : 1]);
    }
    expect(doorway(RECEPTION)).toEqual({ into: [-1, 0], along: [0, 1] });
  });

  it('has on the floor plan the rooms the player has, in the order of the building, and the reception', () => {
    const fresh = createInitialState(1);
    expect(floorPlan(fresh)).toEqual([receptionOf(buildingOf(fresh))]);
    const s = station();
    // In the order of the building, in whatever order the rooms were built.
    expect(s.rooms.map((r) => r.roomId)).not.toEqual(inOrder(s.rooms).map((r) => r.roomId));
    // The reception is in the rooms of the station: it has its desk (0.16.0).
    expect(floorPlan(s).map((r) => r.id)).toEqual([...inOrder(s.rooms.filter((r) => !r.fixed)).map((r) => r.roomId), RECEPTION.id]);
    for (const layout of floorPlan(s).filter((r) => !r.fixed)) expect(layout).toEqual(getPlot(layout.id));
    expect(roomsOnFloor(s, 2)).toEqual([]);
    expect(allRooms(s).map((r) => r.roomId)).toEqual([...inOrder(s.rooms.filter((r) => !r.fixed)).map((r) => r.roomId), RECEPTION.id]);
    expect(roomName(s, 'C')).toBe('Room C');
    expect(roomLayout(s, 'K')).toBeUndefined();
    expect(roomLayout(s, 'nowhere')).toBeUndefined();
  });

  it('keeps the reception with the building until something is placed in it', () => {
    const fresh = rich(createInitialState(1));
    expect(fresh.rooms).toEqual([]);
    // (Where the hall is depends on the building: in the middle of the west wing of the courtyard building.)
    const hall = receptionOf(buildingOf(fresh));
    expect(hall).toMatchObject({ x: -15, y: 16 });
    expect(findRoom(fresh, RECEPTION.id)).toMatchObject({ roomId: 'reception', name: 'Reception', fixed: true, type: 'reception', x: hall.x, y: hall.y, w: hall.w, h: hall.h, door: hall.door });
    const s = ok(autoPlaceFurniture(fresh, RECEPTION.id, 'receptionDesk'));
    expect(s.rooms).toHaveLength(1);
    expect(s.rooms[0]).toMatchObject({ roomId: 'reception', fixed: true, floor: 1, w: hall.w, h: hall.h });
    expect(monthlyRent(s.rooms[0]!, s)).toBe(0);
    expect(floorPlan(s)).toEqual([hall]);
  });

  it('goes by where the game has a room, not by where the building had it', () => {
    const base = station();
    const office = base.rooms.find((r) => r.type === 'office')!;
    const plot = getPlot(office.roomId);
    // The office, one tile smaller on every side that is not on the corridor, and its door a tile along.
    const change = { x: plot.x + 1, w: plot.w - 2, h: plot.h - 1, y: plot.y === 0 ? 1 : plot.y, door: { x: plot.door.x + 1, z: plot.door.z } };
    const s = moved(base, office.roomId, change);

    expect(roomLayout(s, office.roomId)).toMatchObject(change);
    expect(roomAt(s, office.floor, plot.x + 0.5, plot.y + 2)).toBeNull();
    expect(roomAt(s, office.floor, plot.x + 1.5, plot.y + 2)).toBe(office.roomId);
    // The rent is for the floor it has now.
    expect(monthlyRent(findRoom(s, office.roomId)!, s)).toBe(change.w * change.h * RENT_PER_TILE);
    expect(monthlyCosts(base).rent - monthlyCosts(s).rent).toBe((plot.w * plot.h - change.w * change.h) * RENT_PER_TILE);
    // People sit at their desks where the room is.
    const seated = (state: GameState) => peopleOnFloor(state, office.floor).filter((p) => p.roomId === office.roomId && p.activity === 'sit');
    const before = seated(base);
    const after = seated(s);
    expect(after.length).toBeGreaterThan(0);
    expect(after.map((p) => [p.id, p.x - 1, p.z - (change.y - plot.y)])).toEqual(before.map((p) => [p.id, p.x, p.z]));
    // And the way there is through the door where it is now.
    const path = walkPath({ ...s, rooms: s.rooms.map((r) => ({ ...r, furniture: [] })) }, office.floor, { x: 3, z: CORRIDOR_Z }, { x: change.x + 1.5, z: change.y + 1.5 });
    expect(path.at(-1)).toEqual([change.x + 1.5, change.y + 1.5]);
    expect(path.some(([x, z]) => Math.hypot(x - change.door.x, z - change.door.z) <= 0.75)).toBe(true);
    expect(path.some(([x, z]) => Math.hypot(x - plot.door.x, z - plot.door.z) <= 0.5)).toBe(false);
    // Furniture fits by the size the room has.
    const empty = ok(setRoomType(ok(rentRoom(base, 'U')), 'U', 'office'));
    expect(ok(placeFurniture(empty, 'U', 'workstation', 4, 3)).rooms.at(-1)!.furniture).toHaveLength(1);
    expect(placeFurniture(moved(empty, 'U', { w: 5 }), 'U', 'workstation', 4, 3)).toEqual({ ok: false, error: 'It doesn’t fit there.' });
  });

  it('knows the rooms next door by the walls they share', () => {
    const fresh = createInitialState(1);
    const ids = (s: GameState, id: string) => adjacentRooms(s, id).map((r) => r.id);
    // With the seven rooms of the ground floor built.
    const full = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].reduce((game, id) => ok(rentRoom(game, id)), fresh);
    expect(ids(full, 'B')).toEqual(['A', 'C']);
    // The hall of the building is no room next door, though rooms A and E stand against it.
    expect(sharesWall(getPlot('A'), RECEPTION)).toBe(true);
    expect(ids(full, 'A')).toEqual(['B']);
    expect(ids(full, 'E')).toEqual(['F']);
    // A room that is not built is nobody's neighbour.
    expect(ids(ok(rentRoom(fresh, 'B')), 'B')).toEqual([]);
    // Across the corridor, on another floor or corner to corner is not next door.
    expect(sharesWall(getPlot('A'), getPlot('E'))).toBe(false);
    expect(sharesWall(getPlot('A'), getPlot('H'))).toBe(false);
    expect(sharesWall({ ...getPlot('A') }, { ...getPlot('A'), x: 6, y: 5 })).toBe(false);

    // A control room serves the studio it stands against, wherever the two are.
    let s = rich(fresh);
    s = ok(setRoomType(ok(rentRoom(s, 'A')), 'A', 'radioStudio'));
    s = ok(autoPlaceFurniture(s, 'A', 'onAirLight'));
    s = ok(setRoomType(ok(rentRoom(s, 'B')), 'B', 'controlRoom'));
    s = ok(autoPlaceFurniture(s, 'B', 'audioMixer'));
    expect(borrowedDesks(s).get('A')).toMatchObject({ roomId: 'B' });
    // Pulled a tile away from the studio, it serves nobody.
    const apart = moved(s, 'B', { x: 7, w: 5 });
    expect(borrowedDesks(apart).size).toBe(0);
    expect(ids(apart, 'A')).toEqual([]);
    // Set behind the studio instead of beside it, it does.
    const behind = moved(moved(s, 'A', { h: 3 }), 'B', { x: 0, y: 3, w: 6, h: 2 });
    expect(borrowedDesks(behind).get('A')).toMatchObject({ roomId: 'B' });
  });

  it('takes a room off the floor when it is given up, and lets it be built again', () => {
    const base = ok(rentRoom(rich(createInitialState(1)), 'C'));
    const s = moved(base, 'C', { x: 13, w: 3 });
    expect(roomLayout(s, 'C')).toMatchObject({ x: 13, w: 3 });
    const released = ok(releaseRoom(s, 'C'));
    expect(released.rooms).toEqual([]);
    expect(roomLayout(released, 'C')).toBeUndefined();
    // Built again by its letter, it is where the building's first plan has it.
    const { id, ...place } = getPlot('C');
    expect(ok(rentRoom(released, 'C')).rooms[0]).toMatchObject({ ...place, roomId: id });
    expect(rentRoom(s, 'C')).toEqual({ ok: false, error: 'You already rent this room.' });
    expect(rentRoom(s, 'ZZ')).toEqual({ ok: false, error: 'That room doesn’t exist.' });
    expect(rentRoom(s, RECEPTION.id)).toEqual({ ok: false, error: 'The reception comes with the building.' });
  });

  it('survives a save and a load with every room where it was', () => {
    const s = moved(station(), 'E', { x: 1, w: 7, door: { x: 5, z: 6 } });
    const { state } = fromSaveFile(JSON.parse(JSON.stringify(toSaveFile(s, 0))));
    expect(state.rooms).toEqual(s.rooms);
  });

  it('gives the rooms of an older save the place they had in the building', () => {
    let before = station();
    before = ok(autoPlaceFurniture(before, RECEPTION.id, 'receptionDesk'));
    const old = oldSave(before);
    expect(old.state.rooms[0]).not.toHaveProperty('x');
    const { state, version } = fromSaveFile(old);
    expect(version).toBe(SAVE_VERSION);
    // Every room is back exactly as the game has it today, the reception with it. Only the age of the furniture
    // is a guess: a save that old did not know it.
    const boughtOn = state.rooms[0]!.furniture[0]!.boughtOn;
    expect(boughtOn).toBeLessThan(before.day);
    before = { ...before, rooms: before.rooms.map((r) => ({ ...r, furniture: r.furniture.map((f) => ({ ...f, boughtOn })) })) };
    expect(state.rooms).toEqual(before.rooms);
    expect(state.rooms.find((r) => r.roomId === RECEPTION.id)).toMatchObject({ fixed: true, name: 'Reception' });
    for (const room of state.rooms.filter((r) => !r.fixed)) {
      const { id, ...place } = getPlot(room.roomId);
      expect(room).toMatchObject({ ...place, roomId: id });
    }
    // And the game goes on as it would have, once the month's bills that a save from before 0.12.0 still owed are paid.
    before = { ...before, money: before.money - before.ledger.salaries - before.ledger.rent - before.ledger.licenseFees };
    // To the cent: the bills are paid in another order, which can leave a last digit of a fraction different.
    const [after, expected] = [tick(state), tick(before)];
    expect(after.money).toBeCloseTo(expected.money, 6);
    // (The save from before the courtyard (0.20.0) is told that its building has grown: that message is left out.)
    // (And it has everything open, as every save from before the levels (0.20.0) does: that is left out too.)
    const rounded = (s: GameState) => ({
      ...s,
      unlocked: [],
      floorsUnlocked: 0,
      money: Math.round(s.money * 100),
      monthlyReports: s.monthlyReports.map((r) => ({ ...r, balance: Math.round(r.balance * 100) })),
      messages: s.messages.filter((m) => !/U around a courtyard/.test(m.text)).map((m) => ({ ...m, id: 0 })),
      nextMessageId: 0,
    });
    expect(rounded(after)).toEqual(rounded(expected));
  });

  it('refuses a save with a room the building never had', () => {
    const old = oldSave(station());
    old.state.rooms.push({ roomId: 'Z', type: 'office', furniture: [], cleanliness: 100, issue: null });
    expect(() => fromSaveFile(old)).toThrow(SaveError);
  });
});
