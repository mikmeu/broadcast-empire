import { describe, expect, it } from 'vitest';
import { ACTIVE_REGIONS, FLOOR_UNLOCK_VALUE } from '../config/balance';
import { BUILDINGS, CORE, FLOOR, RECEPTION, SERVICE_ROOMS, WEST, buildingFor, coreWalls, floorsOf, getPlot, plotsOf, serviceRoomsOf, widthOf } from '../config/office';
import type { RegionId } from '../config/world';
import { CITY } from '../office/assets';
import { busyStreets, clearance, hidesOffice, officeBlock, streets, townBlocks, townBuildings } from '../office/city';
import { CORRIDOR_Z, SERVICE, peopleOnFloor, roomAt, roomsOnFloor } from '../office/layout';
import { floorGrid, walkPath, wallsOn } from '../office/routes';
import { SITES } from '../office/sites';
import { onPavement, strollerAt, strollers } from '../office/street';
import { GRID } from '../office/townLayout';
import { createTraffic, stepTraffic, vehiclesIn } from '../office/traffic';
import { setRoomType, type ActionResult } from './actions';
import { autoPlaceFurniture, rentRoom } from './fixtures';
import { sensibleBot } from './bots';
import { runCheat } from './cheats';
import { createInitialState } from './newGame';
import { adjacentRooms, buildingOf, floorPlan } from './office';
import { SAVE_VERSION, fromSaveFile, toSaveFile } from './save';
import type { GameState } from './state';
import { tick } from './tick';

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
      ['north', 'standard'],
      ['coast', 'standard'],
      ['heartland', 'long'],
      ['highlands', 'long'],
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
    let s = { ...newGame('highlands'), money: 5_000_000 };
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

    // The floors open at the same company value as anywhere; there is no fifth to open.
    // (A floor opens with the month's bookkeeping, one at a time.)
    const months = (state: GameState, count: number) => {
      let next = { ...state, money: FLOOR_UNLOCK_VALUE[6]! * 2 };
      for (let day = 0; day < count * 31; day++) next = tick(next);
      return next;
    };
    const next = months(s, 1);
    expect(next.floorsUnlocked).toBe(2);
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
    expect(tick(state)).toEqual(tick(s));
    // A save with a building the game does not know is refused.
    expect(() => fromSaveFile({ ...JSON.parse(JSON.stringify(toSaveFile(s, 0))), state: { ...old.state, building: 'castle' } })).toThrow();
  });
});

describe('the town around the long building (Phase 13c)', () => {
  const site = SITES.highlands;
  // (A grid of blocks; the capital's town, laid out from the map, is held to the same in townLayout.test.ts.)
  const OFFICE_BLOCK = officeBlock(STANDARD, GRID);

  it('gives it a block of its own that is one town block wider, with the same pavement around it', () => {
    const own = officeBlock(LONG, GRID);
    expect(own).toEqual({ ...OFFICE_BLOCK, w: OFFICE_BLOCK.w + CITY.block.w });
    // The same margin between the building and the kerb on both ends, as in town.
    for (const building of [STANDARD, LONG]) {
      const block = officeBlock(building, GRID);
      expect(WEST - block.x).toBe(block.x + block.w - (WEST + widthOf(building)));
    }
    // Nothing of the town stands on it.
    for (const seed of [1, 7, 1970]) {
      for (const item of townBuildings(seed, site, LONG)) {
        const on = item.x > own.x && item.x < own.x + own.w && item.z > own.z && item.z < own.z + own.d;
        expect(on, `${item.building.file} at ${item.x}, ${item.z}`).toBe(false);
      }
    }
    // The rest of the town is where it is around the standard building: only the fifth block is gone.
    const key = (b: { i: number; j: number }) => `${b.i}:${b.j}`;
    const around = new Map(townBlocks(7, site, STANDARD).map((b) => [key(b), b]));
    const long = townBlocks(7, site, LONG);
    expect(long.length).toBe(around.size - 2);
    expect(long.some((b) => b.i === 4 && (b.j === 0 || b.j === 1))).toBe(false);
    for (const block of long.filter((b) => b.i < 4)) expect({ ...block, land: null }).toEqual({ ...around.get(key(block)), land: null });
    // Open land runs on over the far end of the street nobody drives in any more.
    const beside = (blocks: typeof long) => blocks.find((b) => b.i === 3 && b.land)!.land!.w;
    expect(beside(long)).toBeGreaterThan(beside([...around.values()]));
  });

  it('lets nothing in town hide the far end of the building', () => {
    for (const seed of [1, 7, 1970]) {
      for (const item of townBuildings(seed, site, LONG)) expect(hidesOffice(item, 0, site.scale, LONG)).toBe(false);
    }
    // What may stand east of the standard building at a height is too tall there beside the long one.
    expect(clearance(26, 5, 2, 2, STANDARD)).toBeGreaterThan(0);
    expect(clearance(26, 5, 2, 2, LONG)).toBeLessThan(0);
  });

  it('has no traffic in the side street it stands on, and all of it everywhere else', () => {
    const closed = OFFICE_BLOCK.x + STANDARD.blocks * CITY.block.w;
    expect(streets(STANDARD, GRID).some((s) => s.along === 'z' && s.at === closed)).toBe(true);
    expect(streets(LONG, GRID).some((s) => s.along === 'z' && s.at === closed)).toBe(false);
    expect(busyStreets(LONG, GRID)).toEqual(busyStreets(STANDARD, GRID).filter((s) => !(s.along === 'z' && s.at === closed)));

    const traffic = createTraffic(3, 30, site.traffic, LONG, false, GRID);
    const inClosed = (t: typeof traffic, lane: number) => t.lanes[lane]!.along === 'z' && Math.abs(t.lanes[lane]!.at - closed) < CITY.streetWidth / 2;
    let seen = 0;
    for (let n = 0; n < 600; n++) {
      stepTraffic(traffic, 0.5, 30 + n / 240);
      for (const vehicle of vehiclesIn(traffic)) {
        seen++;
        expect(inClosed(traffic, vehicle.lane)).toBe(false);
      }
    }
    expect(seen).toBeGreaterThan(100);
    // Around the standard building that street is driven in like any other.
    const town = createTraffic(3, 30, SITES.capital.traffic, STANDARD, false, GRID);
    let there = 0;
    for (let n = 0; n < 600; n++) {
      stepTraffic(town, 0.5, 30 + n / 240);
      there += vehiclesIn(town).filter((v) => inClosed(town, v.lane)).length;
    }
    expect(there).toBeGreaterThan(0);
  });

  it('keeps the people out for a walk on the pavement, around the longer block too', () => {
    const walking = strollers(5, 12, LONG, GRID);
    expect(walking).toHaveLength(12);
    const own = officeBlock(LONG, GRID);
    // Every third goes round the office's own block, which is the longer one.
    expect(walking[0]!.w).toBeGreaterThan(strollers(5, 12, STANDARD, GRID)[0]!.w);
    expect(walking[0]!.x).toBe(own.x + own.w / 2);
    for (const stroller of walking) {
      for (let seconds = 0; seconds < 400; seconds += 7) {
        const at = strollerAt(stroller, seconds);
        expect(onPavement(at.x, at.z, LONG, GRID), `${at.x}, ${at.z}`).toBe(true);
      }
    }
    // Where the street was is pavement now; inside the longer building is not.
    const closed = OFFICE_BLOCK.x + STANDARD.blocks * CITY.block.w;
    expect(onPavement(closed, FLOOR.h + 0.5, STANDARD, GRID)).toBe(false);
    expect(onPavement(closed, FLOOR.h + 0.5, LONG, GRID)).toBe(true);
    expect(onPavement(closed, FLOOR.h / 2, LONG, GRID)).toBe(false);
    expect(GRID.from.x).toBeLessThan(own.x);
  });
});
