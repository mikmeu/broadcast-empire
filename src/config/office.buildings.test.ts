import { describe, expect, it } from 'vitest';
import { xpForLevel } from './levels';
import { FLOOR_LEVEL, ACTIVE_REGIONS } from './balance';
import { BUILDINGS, CORE, FLOOR, RECEPTION, SERVICE_ROOMS, WEST, buildingFor, coreWalls, floorsOf, getPlot, plotsOf, serviceRoomsOf } from './office';
import { buildRoom, type ActionResult, setRoomType } from '../sim/actions';
import { sensibleBot } from '../sim/bots';
import { withoutRecordRooms, autoPlaceFurniture, rentRoom } from '../sim/fixtures';
import { createInitialState } from '../sim/newGame';
import { proposeRoom } from '../sim/rooms';
import type { GameState } from '../sim/state';
import { advance, tick } from '../sim/tick';
import { unlockAll } from '../sim/unlocks';
import type { RegionId } from './world';
import { CORRIDOR_Z, SERVICE, peopleOnFloor, roomAt, roomsOnFloor } from '../office/layout';
import { floorGrid, walkPath, wallsOn } from '../office/routes';
import { runCheat } from '../sim/cheats';
import { adjacentRooms, buildingOf, floorPlan } from '../sim/office';
import { SAVE_VERSION, fromSaveFile, toSaveFile } from '../sim/save';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}

/** A radio station from the sensible test player, a month on the air, with everything open, money to spare and two floors. */
const station = (days = 30): GameState => {
  // Without the library and post room the bot keeps its records in (0.18.0): the tests below build rooms where the game proposes them.
  const s = structuredClone(withoutRecordRooms(unlockAll(advance(sensibleBot(createInitialState(1)), days))));
  s.money = 5_000_000;
  s.floorsUnlocked = 2;
  return s;
};

describe('version 0.14.0', () => {
  describe('bigger buildings (R109)', () => {
    it('has six floors in town and four in the country, opened by the company’s level', () => {
      expect(BUILDINGS.standard.floors).toBe(6);
      expect(BUILDINGS.long.floors).toBe(4);
      expect(FLOOR_LEVEL[6]).toBeGreaterThan(FLOOR_LEVEL[5]!);
      expect(FLOOR_LEVEL[4]).toBeGreaterThan(FLOOR_LEVEL[3]!);
      let s = { ...structuredClone(station()), floorsUnlocked: 3, xp: xpForLevel(FLOOR_LEVEL[4]!), level: FLOOR_LEVEL[4]! };
      for (let day = 0; day < 31; day++) s = tick(s);
      expect(s.floorsUnlocked).toBe(4);
      expect(s.messages.some((m) => /floor 4 is now open/.test(m.text))).toBe(true);
      expect(ok(buildRoom(s, { ...proposeRoom(s, 4, 'office')!, type: 'office' })).rooms.at(-1)!.floor).toBe(4);
    });
  });
});

// From phase13c.
{
  function ok(result: ActionResult): GameState {
    if (!result.ok) throw new Error(result.error);
    return result.state;
  }

  const newGame = (headquarters: RegionId, seed = 1) => createInitialState(seed, 'normal', { playerName: 'Robin', companyName: 'Coax FM', headquarters });
  const LONG = BUILDINGS.long;
  const STANDARD = BUILDINGS.standard;
  /** A company in the standard building (0.20.0: the capital has the courtyard one), for what these tests say of its block at the head of the floor. */
  const standardGame = () => ({ ...newGame('capital'), building: 'standard' as const });

  describe('the block at the head of a floor (Phase 13c)', () => {
    it('has the stairs and the lifts at the front, on every floor, on either side of the entrance', () => {
      for (const corner of [CORE.stairs, CORE.lifts]) {
        expect(corner.x).toBe(WEST);
        expect(corner.x + corner.w).toBe(WEST + CORE.upper);
      }
      expect(CORE.stairs.y).toBe(0);
      expect(CORE.lifts.y + CORE.lifts.h).toBe(FLOOR.h);
      // The entrance is between them, in line with the corridor.
      expect(SERVICE.entrance.at.z).toBe(CORRIDOR_Z);
      expect(SERVICE.entrance.at.z).toBeGreaterThan(CORE.stairs.y + CORE.stairs.h);
      expect(SERVICE.entrance.at.z).toBeLessThan(CORE.lifts.y);
      const s = standardGame();
      for (const floor of floorsOf(STANDARD)) {
        expect(roomAt(s, floor, SERVICE.stairs.at.x, SERVICE.stairs.at.z)).toBe('stairs');
        expect(roomAt(s, floor, SERVICE.lifts.at.x, SERVICE.lifts.at.z)).toBe('lifts');
      }
    });

    it('has a room for the technicians and one for the cleaners on the ground floor only, behind the stairs and the lifts', () => {
      expect(SERVICE_ROOMS.technician).toMatchObject({ x: CORE.stairs.x + CORE.stairs.w, y: CORE.stairs.y, w: 3, h: 3 });
      expect(SERVICE_ROOMS.cleaners).toMatchObject({ x: CORE.lifts.x + CORE.lifts.w, y: CORE.lifts.y, w: 3, h: 3 });
      // Each has its door to the hall, which is the reception.
      for (const room of Object.values(SERVICE_ROOMS)) {
        expect(room.door.x).toBeGreaterThan(RECEPTION.x);
        expect(room.door.x).toBeLessThan(RECEPTION.x + RECEPTION.w);
        expect([RECEPTION.y, RECEPTION.y + RECEPTION.h]).toContain(room.door.z);
      }
      const s = standardGame();
      expect(roomAt(s, 1, SERVICE.technician.at.x, SERVICE.technician.at.z)).toBe('technician');
      expect(roomAt(s, 1, SERVICE.cleaners.at.x, SERVICE.cleaners.at.z)).toBe('cleaners');
      expect(roomAt(s, 2, SERVICE.technician.at.x, SERVICE.technician.at.z)).toBeNull();
      expect(roomAt(s, 3, SERVICE.cleaners.at.x, SERVICE.cleaners.at.z)).toBeNull();
      // Upstairs there are only the walls behind the stairs and the lifts.
      expect(coreWalls(1).length).toBeGreaterThan(coreWalls(2).length);
      expect(coreWalls(2)).toEqual(coreWalls(3));
      expect(coreWalls(2)).toEqual([
        [WEST + CORE.upper, 0, WEST + CORE.upper, 3],
        [WEST + CORE.upper, 8, WEST + CORE.upper, FLOOR.h],
      ]);
      // None of them is an outer wall of the building.
      for (const [x1, z1, x2, z2] of coreWalls(1)) {
        expect(z1 === z2 && (z1 === 0 || z1 === FLOOR.h)).toBe(false);
        expect(x1 === x2 && x1 === WEST).toBe(false);
      }
    });

    it('lets people walk from the entrance to every place on the ground floor, and upstairs across the open floor behind the stairs', () => {
      const s = standardGame();
      const legs = (floor: number, from: { x: number; z: number }, to: { x: number; z: number }) => {
        const path = walkPath(s, floor, from, to);
        return path.map(([x, z], i) => [i === 0 ? from : { x: path[i - 1]![0], z: path[i - 1]![1] }, { x, z }] as const);
      };
      const crosses = (floor: number, a: { x: number; z: number }, b: { x: number; z: number }) =>
        wallsOn(s, floor).some(([x1, z1, x2, z2]) => {
          if (x1 === x2) return (a.x - x1) * (b.x - x1) < 0 && ((z) => z >= z1 && z <= z2)(a.z + ((b.z - a.z) * (x1 - a.x)) / (b.x - a.x));
          return (a.z - z1) * (b.z - z1) < 0 && ((x) => x >= x1 && x <= x2)(a.x + ((b.x - a.x) * (z1 - a.z)) / (b.z - a.z));
        });
      for (const place of [SERVICE.stairs, SERVICE.lifts, SERVICE.technician, SERVICE.cleaners]) {
        const way = legs(1, SERVICE.entrance.at, place.at);
        expect(way.at(-1)![1]).toEqual(place.at);
        for (const [a, b] of way) expect(crosses(1, a, b)).toBe(false);
      }
      // The technicians' room is entered through its door, not through the wall it shares with the stairs.
      const in1 = legs(1, SERVICE.stairs.at, SERVICE.technician.at);
      expect(in1.length).toBeGreaterThan(1);
      expect(in1.some(([, b]) => Math.hypot(b.x - SERVICE.technician.door.x, b.z - SERVICE.technician.door.z) < 0.8)).toBe(true);
      // Upstairs the same spot is open floor: around the wall behind the stairs and straight on.
      const up = legs(2, SERVICE.stairs.at, SERVICE.technician.at);
      for (const [a, b] of up) expect(crosses(2, a, b)).toBe(false);
      expect(up.some(([, b]) => Math.hypot(b.x - SERVICE.technician.door.x, b.z - SERVICE.technician.door.z) < 0.8)).toBe(false);
      // The grid of a floor above has more open floor than the ground floor's.
      const open = (floor: number) => floorGrid(s, floor).closed.reduce((n, c) => n + (c ? 0 : 1), 0);
      expect(open(2)).toBeGreaterThan(open(1));
    });

    it('keeps support staff who have nothing to do in their rooms on the ground floor', () => {
      let s = newGame('capital');
      for (let day = 0; day < 20; day++) s = tick(sensibleBot(s));
      const idle = peopleOnFloor(s, 1).filter((p) => p.roomId === 'cleaners' || p.roomId === 'technician');
      for (const p of idle) {
        const room = serviceRoomsOf(buildingOf(s))[p.roomId as 'cleaners' | 'technician'];
        expect(p.x).toBeGreaterThan(room.x);
        expect(p.x).toBeLessThan(room.x + room.w);
        expect(p.z).toBeGreaterThan(room.y);
        expect(p.z).toBeLessThan(room.y + room.h);
      }
      for (const floor of [2, 3]) expect(peopleOnFloor(s, floor).filter((p) => p.roomId === 'cleaners' || p.roomId === 'technician')).toEqual([]);
    });
  });

  describe('a building per region (Phase 13c)', () => {
    it('gives a company in the countryside the long building of four floors, one in a town the standard one of six, and one in the capital the courtyard one (0.20.0)', () => {
      expect(ACTIVE_REGIONS.map((id) => [id, buildingFor(id).id])).toEqual([
        ['capital', 'courtyard'],
        ['north', 'valley'],
        ['coast', 'beach'],
        ['heartland', 'fields'],
        ['highlands', 'hills'],
      ]);
      for (const id of ACTIVE_REGIONS) expect(newGame(id).building).toBe(buildingFor(id).id);
      // One more floor each since 0.14.0, and two more in town and one more in the country since 0.18.0 (#110).
      expect(STANDARD).toMatchObject({ floors: 6, w: 20 });
      expect(LONG).toMatchObject({ floors: 4, w: 28 });
      expect(floorsOf(LONG)).toEqual([1, 2, 3, 4]);
      // Larger floors: more room on each than the standard building has, and about as much in all.
      const area = (b: typeof LONG) => b.plan.reduce((sum, r) => sum + r.w * r.h, 0);
      expect(area(LONG)).toBeGreaterThan(area(STANDARD) * 1.3);
      expect(area(LONG) * LONG.floors).toBeGreaterThan(area(STANDARD) * STANDARD.floors * 0.9);
      expect(area(LONG) * LONG.floors).toBeLessThanOrEqual(area(STANDARD) * STANDARD.floors * 1.1);
    });

    it('has ten rooms a floor in the long building, the first seven those of the standard one', () => {
      const long = plotsOf(LONG);
      expect(long.map((r) => r.id).join(' ')).toBe('A B C D E F G H I J K L M N O P Q R S T U V W X Y Z AA AB AC AD AE AF AG AH AI AJ AK AL AM AN');
      expect(long.filter((r) => r.floor === 1).map((r) => r.id).join('')).toBe('ABCDEFGHIJ');
      expect(long.filter((r) => r.floor === 2)).toHaveLength(10);
      expect(long.filter((r) => r.floor === 3)).toHaveLength(10);
      expect(long.filter((r) => r.floor === 4)).toHaveLength(10);
      for (const id of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) expect(getPlot(id, LONG)).toEqual(getPlot(id));
      // No two rooms overlap, all are inside the floor, and every door is on the corridor.
      for (const building of [STANDARD, LONG]) {
        const plots = plotsOf(building);
        for (const a of plots) {
          expect(a.x).toBeGreaterThanOrEqual(0);
          expect(a.x + a.w).toBeLessThanOrEqual(building.w);
          expect(Math.abs(a.door.z - CORRIDOR_Z)).toBe(0.5);
          for (const b of plots) if (a !== b && a.floor === b.floor) expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
        }
        // The two rows fill the floor from end to end.
        for (const row of [0, 6]) expect(building.plan.filter((r) => r.y === row).reduce((sum, r) => sum + r.w, 0)).toBe(building.w);
      }
    });

    it('plays in the long building: its rooms can be rented, and the fourth floor is the last', () => {
      // (No region has it since 0.20.0, but a game saved in it, or a company that never moved, still plays in it.)
      let s: GameState = { ...newGame('highlands'), building: 'long', money: 5_000_000 };
      expect(buildingOf(s)).toBe(LONG);
      expect(floorPlan(s).filter((r) => !r.fixed)).toEqual([]);
      // Room J is one of the three beyond where the standard building ends.
      s = ok(setRoomType(ok(rentRoom(s, 'J')), 'J', 'office'));
      expect(s.rooms[0]).toMatchObject({ roomId: 'J', floor: 1, x: 20, y: 6, w: 8, h: 5 });
      s = ok(autoPlaceFurniture(s, 'J', 'workstation'));
      expect(adjacentRooms(ok(rentRoom(s, 'G')), 'J').map((r) => r.id)).toEqual(['G']);
      expect(roomsOnFloor(s, 1).map((r) => r.id)).toEqual(['J', 'reception']);
      // In the standard building J is upstairs.
      expect(rentRoom({ ...newGame('capital'), money: 5_000_000 }, 'J')).toMatchObject({ ok: false, error: expect.stringMatching(/Floor 2/) });
      expect(rentRoom(s, 'K')).toMatchObject({ ok: false, error: expect.stringMatching(/Floor 2/) });
      expect(rentRoom(s, 'U')).toMatchObject({ ok: false, error: expect.stringMatching(/Floor 3/) });
      expect(rentRoom(s, 'AO')).toEqual({ ok: false, error: 'That room doesn’t exist.' });

      // The floors open at the same company level as anywhere; there is no fifth to open.
      const months = (state: GameState, count: number) => {
        let next = { ...state, xp: xpForLevel(FLOOR_LEVEL[6]!), level: FLOOR_LEVEL[6]! };
        for (let day = 0; day < count * 31; day++) next = tick(next);
        return next;
      };
      const next = months(s, 1);
      expect(next.floorsUnlocked).toBe(4);
      expect(months(next, 4).floorsUnlocked).toBe(4);
      expect(ok(rentRoom(next, 'K')).rooms.at(-1)).toMatchObject({ roomId: 'K', floor: 2 });
      const cheated = runCheat(s, 'floors');
      expect(cheated.ok && cheated.state.floorsUnlocked).toBe(4);
      // In town the fifth and the sixth floor follow.
      expect(months(newGame('capital'), 8).floorsUnlocked).toBe(6);
    });

    it('walks the whole length of the long floor', () => {
      const s = newGame('heartland');
      const grid = floorGrid(s, 1);
      expect(grid.cols).toBeGreaterThan(floorGrid(standardGame(), 1).cols);
      const far = { x: LONG.w - 1, z: CORRIDOR_Z };
      const path = walkPath(s, 1, SERVICE.entrance.at, far);
      expect(path.at(-1)).toEqual([far.x, far.z]);
      expect(path.length).toBeLessThanOrEqual(3);
      // Into the last room of the floor, through its door.
      const j = getPlot('J', LONG);
      const inside = walkPath(ok(rentRoom(s, 'J')), 1, SERVICE.entrance.at, { x: j.x + 4, z: j.y + 3 });
      expect(inside.some(([x, z]) => Math.hypot(x - j.door.x, z - j.door.z) < 0.8)).toBe(true);
    });

    it('leaves an older game in the building it has, wherever its headquarters are', () => {
      let s = newGame('highlands');
      // As it was saved before buildings differed: in the standard building, with a room upstairs on floor 3.
      s = { ...s, building: 'standard', money: 5_000_000, floorsUnlocked: 3 };
      s = ok(setRoomType(ok(rentRoom(s, 'U')), 'U', 'office'));
      const old = JSON.parse(JSON.stringify(toSaveFile(s, 0)));
      delete old.state.building;
      const { state, version } = fromSaveFile({ ...old, version: 21 });
      expect(version).toBe(SAVE_VERSION);
      expect(state.building).toBe('standard');
      expect(state.rooms).toEqual(s.rooms);
      expect(state.rooms[0]).toMatchObject({ roomId: 'U', floor: 3 });
      // The older game has everything open (levels, 0.20.0); apart from that it plays the same.
      expect(tick({ ...state, unlocked: s.unlocked, floorsUnlocked: s.floorsUnlocked })).toEqual(tick(s));
      // A save with a building the game does not know is refused.
      expect(() => fromSaveFile({ ...JSON.parse(JSON.stringify(toSaveFile(s, 0))), state: { ...old.state, building: 'castle' } })).toThrow();
    });
  });
}
