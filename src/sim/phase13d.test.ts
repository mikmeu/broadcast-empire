import { describe, expect, it } from 'vitest';
import { BUILD_COST_PER_TILE, RENT_PER_TILE } from '../config/balance';
import { BUILDINGS, CORE, FLOOR, RENTABLE_ROOM_TYPES, ROOM_MIN_LONG, ROOM_MIN_SHORT, ROOM_SIZES, ROOM_TYPE_NAMES, WEST, buildable, getPlot, plotsOf, type RoomType } from '../config/office';
import { SERVICE } from '../office/layout';
import { floorGrid, walkPath, wallsOn } from '../office/routes';
import { buildRoom, placeFurniture, releaseRoom, reshapeRoom, setRoomType, type ActionResult } from './actions';
import { autoPlaceFurniture, rentRoom, setUpPostRoom } from './fixtures';
import { sensibleBot } from './bots';
import { monthlyCosts } from './economy';
import { createInitialState } from './newGame';
import { floorPlan, monthlyRent } from './office';
import { Rng } from './rng';
import { buildCost, corridorTiles, doorSpots, doorTiles, proposeDoor, proposeRoom, reshapeCost, roomError, type RoomPlan } from './rooms';
import { fromSaveFile, toSaveFile } from './save';
import type { GameState } from './state';
import { tick } from './tick';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
const error = (result: ActionResult) => (result.ok ? null : result.error);

const rich = (s: GameState): GameState => ({ ...s, money: 5_000_000, floorsUnlocked: 6 });
const fresh = () => rich(createInitialState(1));
/** A plan with its door in the middle of one of its walls. */
const plan = (floor: number, x: number, y: number, w: number, h: number, side: 'n' | 's' | 'w' | 'e' = 's'): RoomPlan & { door: { x: number; z: number } } => ({
  floor,
  x,
  y,
  w,
  h,
  door: side === 'n' ? { x: x + Math.floor(w / 2) + 0.5, z: y } : side === 's' ? { x: x + Math.floor(w / 2) + 0.5, z: y + h } : side === 'w' ? { x, z: y + Math.floor(h / 2) + 0.5 } : { x: x + w, z: y + Math.floor(h / 2) + 0.5 },
});
const build = (s: GameState, p: RoomPlan, type: RoomType = 'office') => ok(buildRoom(s, { ...p, type }));

describe('drawing rooms (Phase 13d)', () => {
  it('builds a room where it is drawn, of the kind that was chosen, for a sum by its size', () => {
    const before = fresh();
    const result = buildRoom(before, { ...plan(1, 2, 0, 7, 4), type: 'radioStudio' });
    if (!result.ok) throw new Error(result.error);
    const s = result.state;
    expect(s.rooms).toEqual([{ roomId: result.id, name: 'Radio studio 1', floor: 1, x: 2, y: 0, w: 7, h: 4, door: { x: 5.5, z: 4 }, type: 'radioStudio', furniture: [], cleanliness: 100, issue: null }]);
    // Once, for building it; and rent by the tile from then on, as ever.
    expect(buildCost({ w: 7, h: 4 })).toBe(28 * BUILD_COST_PER_TILE);
    expect(before.money - s.money).toBe(28 * BUILD_COST_PER_TILE);
    expect(s.ledger.purchases).toBe(28 * BUILD_COST_PER_TILE);
    expect(monthlyRent(s.rooms[0]!, s)).toBe(28 * RENT_PER_TILE);
    expect(monthlyCosts(s).rent).toBe(28 * RENT_PER_TILE);
    // It takes furniture like any room of its kind, and is on the floor plan.
    expect(ok(autoPlaceFurniture(s, result.id!, 'mixingDesk')).rooms[0]!.furniture).toHaveLength(1);
    expect(floorPlan(s).map((r) => r.name)).toEqual(['Radio studio 1', 'Reception']);
    // Not without the money.
    expect(error(buildRoom({ ...before, money: 1_000 }, { ...plan(1, 2, 0, 7, 4), type: 'radioStudio' }))).toMatch(/Not enough money \(€1,400 needed\)/);
  });

  it('names a room after its kind, with the first number that is free', () => {
    let s = fresh();
    s = build(s, plan(1, 0, 0, 4, 5), 'office');
    s = build(s, plan(1, 4, 0, 4, 5), 'office');
    s = build(s, plan(1, 8, 0, 4, 5), 'canteen');
    expect(s.rooms.map((r) => r.name)).toEqual(['Office 1', 'Office 2', 'Canteen 1']);
    // The first office goes: its number is free again.
    s = ok(releaseRoom(s, s.rooms[0]!.roomId));
    s = build(s, plan(1, 12, 0, 4, 5), 'office');
    expect(s.rooms.map((r) => r.name)).toEqual(['Office 2', 'Canteen 1', 'Office 1']);
    // A room that becomes another kind is called after that; one with a letter keeps its letter.
    s = ok(setRoomType(s, s.rooms[1]!.roomId, 'office'));
    expect(s.rooms[1]!.name).toBe('Office 3');
    s = ok(setRoomType(ok(setUpPostRoom(ok(rentRoom(s, 'E')))), 'E', 'library'));
    expect(s.rooms.find((r) => r.roomId === 'E')).toMatchObject({ roomId: 'E', name: 'Room E', type: 'library' });
    for (const type of RENTABLE_ROOM_TYPES) expect(ROOM_TYPE_NAMES[type]).toMatch(/^[A-Za-z’ ]+$/);
  });

  it('wants a room of whole tiles, at least two by three, on the floor and clear of other rooms', () => {
    const s = build(fresh(), plan(1, 4, 0, 6, 5));
    const why = (p: RoomPlan, game = s) => roomError(game, p);
    expect(why(plan(1, 11, 0, 4, 5))).toBeNull();
    expect(why(plan(1, 11, 0, ROOM_MIN_LONG, ROOM_MIN_LONG))).toBeNull();
    expect(why(plan(1, 11, 0, 2, 3))).toBeNull();
    expect(why(plan(1, 11, 0, 3, 2))).toBeNull();
    expect(why(plan(1, 11, 0, 2, 2))).toBe('A room is at least 2 by 3 tiles.');
    expect(why(plan(1, 11, 0, 1, 5))).toBe('A room is at least 2 by 3 tiles.');
    expect(why(plan(1, 11, 0, 5, 1))).toBe('A room is at least 2 by 3 tiles.');
    expect(why({ ...plan(1, 11, 0, 4, 5), x: 11.5 })).toBe('A room is made of whole tiles.');
    // Not over the block with the stairs and the lifts, nor past the outer walls.
    expect(why(plan(1, -2, 0, 5, 3))).toMatch(/clear of the stairs and the lifts/);
    expect(why(plan(1, 17, 0, 4, 5))).toMatch(/has to stay on the floor/);
    expect(why(plan(1, 11, 7, 4, 5))).toMatch(/has to stay on the floor/);
    expect(why(plan(1, 16, 0, 4, 5))).toBeNull();
    // Not through another room; wall to wall is fine.
    expect(why(plan(1, 9, 0, 4, 5))).toBe('Office 1 is in the way.');
    expect(why(plan(1, 5, 1, 3, 3))).toBe('Office 1 is in the way.');
    expect(why(plan(1, 10, 0, 4, 5))).toBeNull();
    expect(why(plan(1, 0, 0, 4, 5))).toBeNull();
    // Only on a floor the company has.
    expect(why(plan(2, 4, 0, 6, 5), { ...s, floorsUnlocked: 1 })).toMatch(/Floor 2 isn’t available yet/);
    expect(why(plan(7, 4, 0, 6, 5))).toBe('That floor doesn’t exist.');
    expect(why(plan(2, 4, 0, 6, 5))).toBeNull();
    // The reception is no kind of room to build.
    expect(error(buildRoom(s, { ...plan(1, 11, 0, 4, 5), type: 'reception' }))).toMatch(/only the one/);
  });

  it('has more floor to build on upstairs, where the block at the head of the floor is half as deep', () => {
    const building = BUILDINGS.standard;
    expect(buildable(building, 1)).toEqual({ x: 0, y: 0, w: building.w, h: FLOOR.h });
    expect(buildable(building, 2)).toEqual({ x: WEST + CORE.upper, y: 0, w: building.w + CORE.upper, h: FLOOR.h });
    const s = fresh();
    // Behind the stairs: a room on the floor above, not on the ground floor, where the technicians are.
    expect(roomError(s, plan(2, -3, 0, 4, 3))).toBeNull();
    expect(roomError(s, plan(1, -3, 0, 4, 3))).toMatch(/clear of the stairs/);
    // The hallway between the stairs and the lifts is never built on.
    expect(roomError(s, plan(2, -5, 3, 4, 4))).toMatch(/clear of the stairs/);
    // The long building has a longer floor.
    const long = rich(createInitialState(1, 'normal', { playerName: 'Robin', companyName: 'Coax FM', headquarters: 'heartland' }));
    expect(roomError(long, plan(1, 22, 0, 6, 5))).toBeNull();
    expect(roomError(s, plan(1, 22, 0, 6, 5))).toMatch(/has to stay on the floor/);
  });

  it('wants the door in a wall of the room, opening onto the corridor', () => {
    const s = build(fresh(), plan(1, 4, 0, 6, 5));
    const room = { floor: 1, x: 10, y: 0, w: 4, h: 5 };
    const why = (door: { x: number; z: number }) => roomError(s, { ...room, door });
    expect(why({ x: 12.5, z: 5 })).toBeNull();
    expect(why({ x: 14, z: 2.5 })).toBeNull();
    // A door on the line between two tiles is as good as one in the middle of a tile.
    expect(why({ x: 12, z: 5 })).toBeNull();
    // Not in mid-air, not in a corner, not in an outer wall, not into the room next door.
    expect(why({ x: 12.5, z: 3 })).toMatch(/in one of the room’s walls/);
    expect(why({ x: 10.25, z: 5 })).toMatch(/in one of the room’s walls/);
    expect(why({ x: 10, z: 5 })).toMatch(/in one of the room’s walls/);
    expect(why({ x: 12.5, z: 0 })).toBe('A door can’t be in an outer wall of the building.');
    expect(why({ x: 10, z: 2.5 })).toBe('A door has to open onto the corridor, not into Office 1.');
    expect(error(buildRoom(s, { ...room, door: null, type: 'office' }))).toBe('Give the room a door.');
    // Every wall tile is a place for a door: twice the width and twice the depth of them.
    expect(doorSpots(room)).toHaveLength(2 * (4 + 5));
    expect(doorTiles(room, { x: 12.5, z: 5 })).toEqual({ inside: [[12, 4]], outside: [[12, 5]] });
    expect(doorTiles(room, { x: 12, z: 5 })).toEqual({ inside: [[11, 4], [12, 4]], outside: [[11, 5], [12, 5]] });
    expect(doorTiles(room, { x: 10, z: 2.5 })).toEqual({ inside: [[10, 2]], outside: [[9, 2]] });
  });

  it('keeps every room within reach of the stairs and the lifts', () => {
    let s = fresh();
    // A room across the whole depth of the floor, a little way in, with its door towards the hall.
    const across = plan(1, 6, 0, 4, FLOOR.h, 'w');
    expect(roomError(s, across)).toBeNull();
    // The same room with its door on the far side: nobody could get round it.
    expect(roomError(s, { ...across, door: { x: 10, z: 5.5 } })).toBe('Nobody could get to that door from the stairs and the lifts.');
    // With a room behind it, the wall of a room would cut that one off.
    s = build(s, plan(1, 14, 0, 4, 5));
    expect(roomError(s, across)).toBe('That would cut Office 1 off from the stairs and the lifts.');
    // One tile of corridor past it is enough.
    expect(roomError(s, { ...across, h: FLOOR.h - 1 })).toBeNull();
    // A room in a dead end behind two others: fine while the way in is open, not when a third closes it.
    s = build(s, plan(1, 6, 0, 4, 5, 's'));
    s = build(s, plan(1, 6, 6, 4, 5, 'n'));
    // (Between those two the corridor is one tile wide, and the only way on.)
    expect(roomError(s, plan(1, 10, 6, 3, 3, 'n'))).toBeNull();
    expect(roomError(s, plan(1, 10, 5, 3, 3, 'e'))).toBe('That would cut Office 1 off from the stairs and the lifts.');
    expect(roomError(s, { floor: 1, x: 3, y: 4, w: 3, h: 3, door: { x: 3, z: 5.5 } })).toMatch(/cut .* off/);

    // The corridor is one piece: every tile of it can be walked to from the hall, and no tile of a room is in it.
    const corridor = corridorTiles(s, 1, s.rooms);
    expect(corridor.has(`${WEST + CORE.upper - 1}:${FLOOR.corridorY}`)).toBe(true);
    for (const room of s.rooms) for (let x = room.x; x < room.x + room.w; x++) for (let y = room.y; y < room.y + room.h; y++) expect(corridor.has(`${x}:${y}`)).toBe(false);
    for (const block of [CORE.stairs, CORE.lifts, CORE.technician, CORE.cleaners]) expect(corridor.has(`${block.x}:${block.y}`)).toBe(false);
  });

  it('agrees with the way people walk: a room that may be built can be walked to, whatever is drawn', () => {
    const rng = new Rng(13);
    let built = 0;
    let refused = 0;
    for (let round = 0; round < 12; round++) {
      let s = fresh();
      for (let n = 0; n < 40; n++) {
        const floor = 1 + Math.floor(rng.next() * 2);
        const area = buildable(BUILDINGS.standard, floor);
        const w = ROOM_MIN_SHORT + Math.floor(rng.next() * 6);
        const h = ROOM_MIN_SHORT + Math.floor(rng.next() * 5);
        const rect = { floor, x: area.x + Math.floor(rng.next() * (area.w - w + 1)), y: Math.floor(rng.next() * (FLOOR.h - h + 1)), w, h };
        const door = proposeDoor(s, rect);
        if (!door) {
          refused++;
          continue;
        }
        s = build(s, { ...rect, door });
        built++;
      }
      // Everyone can get from the lifts to the middle of every room, through its door and no wall.
      for (const room of s.rooms) {
        const to = { x: room.x + room.w / 2, z: room.y + room.h / 2 };
        const path = walkPath(s, room.floor, SERVICE.lifts.at, to);
        expect(path.at(-1)).toEqual([to.x, to.z]);
        expect(path.length, `${room.name} on floor ${room.floor} at ${room.x}, ${room.y}`).toBeGreaterThan(1);
        // Through no wall: so through the door.
        const walls = wallsOn(s, room.floor);
        let at = SERVICE.lifts.at as { x: number; z: number };
        for (const [x, z] of path) {
          const crossed = walls.some(([x1, z1, x2, z2]) =>
            x1 === x2
              ? (at.x - x1) * (x - x1) < 0 && ((cz) => cz >= z1 && cz <= z2)(at.z + ((z - at.z) * (x1 - at.x)) / (x - at.x))
              : (at.z - z1) * (z - z1) < 0 && ((cx) => cx >= x1 && cx <= x2)(at.x + ((x - at.x) * (z1 - at.z)) / (z - at.z)),
          );
          expect(crossed, `${room.name} on floor ${room.floor}: through a wall`).toBe(false);
          at = { x, z };
        }
        // The door stands open in the grid people walk on.
        const grid = floorGrid(s, room.floor);
        expect(grid.closed[Math.round(room.door.z / 0.25) * grid.cols + Math.round((room.door.x - WEST) / 0.25)]).toBe(0);
      }
    }
    expect(built).toBeGreaterThan(60);
    expect(refused).toBeGreaterThan(60);
  });

  it('gives a room another shape: larger costs, smaller brings nothing back, and the furniture stays where it stands', () => {
    let s = build(fresh(), plan(1, 4, 0, 6, 5), 'office');
    const id = s.rooms[0]!.roomId;
    s = ok(placeFurniture(s, id, 'workstation', 2, 1));
    const money = s.money;
    // Two tiles wider to the east, and the door moved along.
    let next = ok(reshapeRoom(s, id, { x: 4, y: 0, w: 8, h: 5, door: { x: 10.5, z: 5 } }));
    expect(next.rooms[0]).toMatchObject({ roomId: id, name: 'Office 1', x: 4, w: 8, door: { x: 10.5, z: 5 } });
    expect(money - next.money).toBe(10 * BUILD_COST_PER_TILE);
    expect(reshapeCost({ w: 6, h: 5 }, { w: 8, h: 5 })).toBe(10 * BUILD_COST_PER_TILE);
    expect(next.rooms[0]!.furniture[0]).toMatchObject({ x: 2, y: 1 });
    // Two tiles wider to the west: the workstation stands where it stood on the floor, which is further into the room.
    next = ok(reshapeRoom(s, id, { x: 2, y: 0, w: 8, h: 5, door: { x: 5.5, z: 5 } }));
    expect(next.rooms[0]!.furniture[0]).toMatchObject({ x: 4, y: 1 });
    expect(next.rooms[0]!.x + next.rooms[0]!.furniture[0]!.x).toBe(s.rooms[0]!.x + s.rooms[0]!.furniture[0]!.x);
    // Smaller: nothing to pay, and nothing back.
    const smaller = ok(reshapeRoom(s, id, { x: 5, y: 0, w: 5, h: 4, door: { x: 7.5, z: 4 } }));
    expect(smaller.money).toBe(money);
    expect(reshapeCost({ w: 6, h: 5 }, { w: 5, h: 4 })).toBe(0);
    expect(monthlyRent(smaller.rooms[0]!, s)).toBe(20 * RENT_PER_TILE);
    // Not so small that the workstation is left outside, and not with the door where it stands.
    expect(error(reshapeRoom(s, id, { x: 4, y: 0, w: 3, h: 5, door: { x: 5.5, z: 5 } }))).toBe('The workstation would be left outside the room. Move or sell it first.');
    expect(error(reshapeRoom(s, id, { x: 4, y: 0, w: 6, h: 3, door: { x: 6.5, z: 3 } }))).toBe('The workstation stands where the door would be. Move or sell it first.');
    // Only the door moves: free.
    const door = ok(reshapeRoom(s, id, { x: 4, y: 0, w: 6, h: 5, door: { x: 10, z: 2.5 } }));
    expect(door.money).toBe(money);
    expect(door.rooms[0]!.door).toEqual({ x: 10, z: 2.5 });
    // The same rules as for a new room; its own place is not in its way.
    expect(error(reshapeRoom(s, id, { x: 4, y: 0, w: 6, h: 5, door: { x: 6.5, z: 0 } }))).toMatch(/outer wall/);
    expect(error(reshapeRoom(s, 'nowhere', { x: 4, y: 0, w: 6, h: 5, door: { x: 6.5, z: 5 } }))).toBe('You don’t have this room.');
    expect(error(reshapeRoom(ok(autoPlaceFurniture(s, 'reception', 'receptionDesk')), 'reception', { x: 4, y: 0, w: 6, h: 5, door: { x: 6.5, z: 5 } }))).toBe('This room comes with the building.');
  });

  it('takes a room away once it is empty, for nothing back', () => {
    let s = build(fresh(), plan(1, 4, 0, 6, 5), 'office');
    const id = s.rooms[0]!.roomId;
    const furnished = ok(placeFurniture(s, id, 'workstation', 0, 0));
    expect(error(releaseRoom(furnished, id))).toBe('Sell or store the furniture in this room first.');
    const money = s.money;
    s = ok(releaseRoom(s, id));
    expect(s.rooms).toEqual([]);
    expect(s.money).toBe(money);
    // The floor is free again.
    expect(roomError(s, plan(1, 4, 0, 6, 5))).toBeNull();
  });

  it('proposes a place for a room of each kind: in two rows along the hall, nearest the stairs first', () => {
    let s = fresh();
    const first = proposeRoom(s, 1, 'radioStudio')!;
    expect(first).toEqual({ floor: 1, x: 0, y: 0, ...ROOM_SIZES.radioStudio, door: { x: 2.5, z: 5 } });
    s = build(s, first, 'radioStudio');
    // The next goes across the corridor from it, and the one after that beside it.
    const second = proposeRoom(s, 1, 'office')!;
    expect(second).toMatchObject({ x: 0, y: 6, w: 8, h: 5, door: { x: 4.5, z: 6 } });
    s = build(s, second, 'office');
    expect(proposeRoom(s, 1, 'managementOffice')).toMatchObject({ x: 4, y: 0 });
    // Every kind has a usual size that can be built, and a proposal on an empty floor.
    for (const type of RENTABLE_ROOM_TYPES) {
      expect(ROOM_SIZES[type].w).toBeGreaterThanOrEqual(ROOM_MIN_LONG);
      expect(roomError(fresh(), proposeRoom(fresh(), 2, type)!)).toBeNull();
    }
    // Upstairs the first place is behind the stairs.
    expect(proposeRoom(s, 2, 'office')).toMatchObject({ floor: 2, x: -3, y: 0 });
    // A floor that is full in that way has no proposal left; nor has a floor that is not open yet.
    let full = fresh();
    for (let next = proposeRoom(full, 1, 'office'); next; next = proposeRoom(full, 1, 'office')) full = build(full, next, 'office');
    expect(full.rooms).toHaveLength(4);
    expect(proposeRoom(full, 1, 'tvSitcomStudio')).toBeNull();
    expect(proposeRoom(full, 1, 'toilets')).not.toBeNull();
    expect(proposeRoom({ ...s, floorsUnlocked: 1 }, 2, 'office')).toBeNull();
  });

  it('proposes the door nearest the stairs and the lifts, and none where a room can have no door', () => {
    const s = fresh();
    expect(proposeDoor(s, { floor: 1, x: 4, y: 0, w: 6, h: 5 })).toEqual({ x: 4, z: 4.5 });
    // A room against the hall gets its door straight into the hall.
    expect(proposeDoor(s, { floor: 1, x: 0, y: 6, w: 8, h: 5 })).toEqual({ x: 0, z: 6.5 });
    expect(proposeDoor(s, { floor: 1, x: 12, y: 6, w: 8, h: 5 })).toEqual({ x: 12, z: 6.5 });
    // A room where another is: no door, because no room.
    const taken = build(s, plan(1, 4, 0, 6, 5));
    expect(proposeDoor(taken, { floor: 1, x: 5, y: 1, w: 3, h: 3 })).toBeNull();
    // For a room that exists the door it has is as good as any, but furniture inside a doorway is not.
    const id = taken.rooms[0]!.roomId;
    const desk = ok(placeFurniture(taken, id, 'workstation', 0, 3));
    expect(proposeDoor(desk, { floor: 1, x: 4, y: 0, w: 6, h: 5 }, id)).toEqual({ x: 4, z: 2.5 });
  });

  it('still builds the rooms of the first plan by their letter, at the same cost, for the bots', () => {
    const before = fresh();
    const s = ok(rentRoom(before, 'E'));
    const plot = getPlot('E');
    expect(s.rooms[0]).toMatchObject({ roomId: 'E', name: 'Room E', type: null, x: plot.x, y: plot.y, w: plot.w, h: plot.h });
    expect(before.money - s.money).toBe(buildCost(plot));
    // The whole plan fits together: every room of it can be built, on every floor, in both buildings.
    for (const headquarters of ['capital', 'heartland'] as const) {
      let game = rich(createInitialState(1, 'normal', { playerName: 'Robin', companyName: 'Coax FM', headquarters }));
      for (const p of plotsOf(BUILDINGS[game.building])) game = ok(rentRoom(game, p.id));
      expect(game.rooms).toHaveLength(BUILDINGS[game.building].plan.length * BUILDINGS[game.building].floors);
    }
    // A lettered room can't go where a drawn one stands.
    const drawn = build(before, plan(1, 2, 7, 4, 4, 'n'));
    expect(error(rentRoom(drawn, 'E'))).toBe('Office 1 is in the way.');
    // The bots pay for their rooms like anyone.
    const bot = tick(sensibleBot(createInitialState(1)));
    expect(bot.ledger.purchases).toBeGreaterThan(bot.rooms.reduce((sum, r) => sum + buildCost(r), 0) - 1);
  });

  it('keeps drawn rooms through a save and a load, and an older save its rooms and its corridor', () => {
    let s = build(fresh(), plan(1, 2, 0, 7, 4), 'radioStudio');
    s = build(s, plan(2, -3, 6, 5, 5, 'n'), 'canteen');
    const { state } = fromSaveFile(JSON.parse(JSON.stringify(toSaveFile(s, 0))));
    expect(state.rooms).toEqual(s.rooms);
    // The sensible bot's company, as a save from before rooms were drawn: all its rooms are within reach as they stand.
    let old = createInitialState(1);
    for (let day = 0; day < 40; day++) old = tick(sensibleBot(old));
    // (The bots put desks in their doorways, which a door may not be moved to; so the rooms are judged empty.)
    // The reception, which comes with the building, is no drawn room (it is in the rooms once it has its desk).
    for (const room of old.rooms.filter((r) => !r.fixed)) expect(roomError({ ...old, rooms: old.rooms.map((r) => ({ ...r, furniture: [] })) }, room, room.roomId)).toBeNull();
    // And between its two rows of rooms there is room to draw nothing: the corridor stays a corridor.
    expect(roomError(rich(old), plan(1, 8, 5, 3, 3))).toMatch(/in the way|cut .* off|at least/);
  });

  it('gives Penny’s pupil the three rooms she asks for, where the game proposes them: two rows with a corridor between', () => {
    let s = createInitialState(1);
    const money = s.money;
    for (const type of ['radioStudio', 'office', 'managementOffice'] as const) s = build(s, proposeRoom(s, 1, type)!, type);
    expect(s.rooms.map((r) => r.name)).toEqual(['Radio studio 1', 'Office 1', 'Management office 1']);
    // A management office is 3 by 5 since 0.16.0: one desk to a room.
    expect(s.rooms.map((r) => [r.x, r.y, r.w, r.h])).toEqual([[0, 0, 4, 5], [0, 6, 8, 5], [4, 0, 3, 5]]);
    for (const room of s.rooms) expect(roomError(s, room, room.roomId)).toBeNull();
    // The floor of the three rooms is what the rent goes by; and the building of them on top.
    const tiles = 20 + 40 + 15;
    expect(monthlyCosts(s).rent).toBe(tiles * RENT_PER_TILE);
    expect(money - s.money).toBe(tiles * BUILD_COST_PER_TILE);
  });
});
