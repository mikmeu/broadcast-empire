import { describe, expect, it } from 'vitest';
import { BUILDINGS, buildableAt, buildingFor, coreOf, coreWalls, innerPieces, onFloor, outerWalls, receptionOf, westOf, widthOf, type Rect } from '../config/office';
import { townBlocks } from '../office/city';
import { lotOf } from '../office/parking';
import { SITES } from '../office/sites';
import { CAPITAL } from '../office/townLayout';
import { walkPath } from '../office/routes';
import { serviceOf } from '../office/layout';
import { buildRoom } from './commands/office';
import { autoPlaceFurniture } from './fixtures';
import { createInitialState } from './newGame';
import { buildingOf, newRoom } from './office';
import { corridorTiles, proposeRoom, roomError } from './rooms';
import { SAVE_VERSION, fromSaveFile, toSaveFile } from './save';
import type { GameState } from './state';

const U = BUILDINGS.courtyard;

/** A company in Coax City with money to spare and every floor open. */
function capital(): GameState {
  const s = structuredClone(createInitialState(1));
  s.money = 50_000_000;
  s.floorsUnlocked = 6;
  return s;
}

const must = (r: ReturnType<typeof buildRoom>): GameState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

const door = (x: number, z: number) => ({ x, z });

describe('the building of Coax City (#193)', () => {
  it('is the courtyard building, and the other regions keep theirs', () => {
    expect(buildingFor('capital').id).toBe('courtyard');
    expect(buildingFor('coast').id).toBe('beach');
    expect(buildingFor('heartland').id).toBe('fields');
    expect(buildingFor('highlands').id).toBe('hills');
    expect(buildingOf(capital()).id).toBe('courtyard');
    expect(U.floors).toBe(6);
  });

  it('is a U of 37 by 37 tiles around a courtyard of 26 by 15', () => {
    let tiles = 0;
    for (let x = -20; x < 24; x++) for (let y = -2; y < 40; y++) if (onFloor(U, x, y)) tiles++;
    expect(tiles).toBe(37 * 37 - 26 * 15);
    expect(westOf(U)).toBe(-17);
    expect(widthOf(U)).toBe(37);
    expect(onFloor(U, -17, 0)).toBe(true);
    expect(onFloor(U, 19, 36)).toBe(true);
    expect(onFloor(U, 0, 15)).toBe(false);
    expect(onFloor(U, -18, 5)).toBe(false);
    expect(onFloor(U, 20, 5)).toBe(false);
    expect(U.courtyard).toEqual({ x: -6, y: 11, w: 26, h: 15 });
  });

  it('keeps the north wing where the standard building stands, and the other buildings as they were', () => {
    for (let x = -6; x < 20; x++) for (let y = 0; y < 11; y++) expect(onFloor(U, x, y)).toBe(onFloor(BUILDINGS.standard, x, y));
    expect(U.plan).toEqual(BUILDINGS.standard.plan);
    expect(coreOf(BUILDINGS.standard).hall).toEqual({ x: -4, y: 3, w: 4, h: 5 });
    expect(westOf(BUILDINGS.long)).toBe(-6);
    expect(widthOf(BUILDINGS.long)).toBe(34);
  });

  it('has its core in the middle of the west wing, the entrance on the west face', () => {
    const core = coreOf(U);
    expect(core.stairs).toMatchObject({ x: -17, y: 13 });
    expect(core.lifts).toMatchObject({ x: -17, y: 21 });
    expect(core.hall).toEqual({ x: -15, y: 16, w: 4, h: 5 });
    expect(core.stairs.x).toBe(westOf(U));
    // Level with the middle of the 37 tiles.
    expect(core.stairs.y + (core.lifts.y + core.lifts.h - core.stairs.y) / 2).toBe(18.5);
    expect(receptionOf(U)).toMatchObject({ id: 'reception', floor: 1, ...core.hall, door: { x: -11, z: 18.5 } });
    expect(serviceOf(U).entrance.at.x).toBeLessThan(core.hall.x);
  });

  it('draws the outside round the building and round the courtyard', () => {
    const walls = outerWalls(U);
    // The courtyard is walled on its west, north and south sides, and open to the east.
    expect(walls.some(({ wall, faces }) => faces === 'e' && wall[0] === -6 && wall[1] === 11 && wall[3] === 26)).toBe(true);
    expect(walls.some(({ wall, faces }) => faces === 's' && wall[1] === 11 && wall[0] === -6 && wall[2] === 20)).toBe(true);
    expect(walls.some(({ wall, faces }) => faces === 'n' && wall[1] === 26 && wall[0] === -6 && wall[2] === 20)).toBe(true);
    expect(outerWalls(BUILDINGS.standard).length).toBe(4);
    // A wall of a room that runs along the courtyard is left to the building.
    expect(innerPieces(U, [-6, 8, -6, 14])).toEqual([[-6, 8, -6, 11]]);
  });

  it('closes the stairs and the lifts towards the floor beside them', () => {
    const walls = coreWalls(2, U);
    expect(walls).toContainEqual([-17, 13, -14, 13]);
    expect(walls).toContainEqual([-17, 24, -14, 24]);
    // On the ground floor the two small rooms are walled in on all sides but the hall.
    expect(coreWalls(1, U)).toContainEqual([-14, 13, -11, 13]);
    expect(coreWalls(1, BUILDINGS.standard).length).toBe(coreWalls(1).length);
  });
});

describe('where a room may be in the U', () => {
  it('can be anywhere in the wings, not in the courtyard and not over the core', () => {
    const s = capital();
    const room = (floor: number, x: number, y: number, w: number, h: number) => roomError(s, { floor, x, y, w, h, door: null });
    expect(room(1, 0, 0, 8, 5)).toBeNull();
    // The old core, now open floor in the north wing.
    expect(room(1, -6, 0, 6, 5)).toBeNull();
    expect(room(1, 0, 26, 8, 5)).toBeNull();
    expect(room(1, -10, 0, 4, 6)).toBeNull();
    expect(room(1, 0, 13, 6, 5)).toMatch(/courtyard/);
    expect(room(1, 8, 9, 6, 5)).toMatch(/courtyard/);
    expect(room(1, -17, 14, 3, 5)).toMatch(/stairs and the lifts/);
    expect(room(1, -13, 14, 3, 5)).toMatch(/stairs and the lifts/);
    // Above the ground floor only the stairs, the lifts and the hallway are in the way.
    expect(room(2, -17, 14, 3, 5)).toMatch(/stairs and the lifts/);
    expect(room(2, -13, 14, 3, 5)).toBeNull();
    expect(room(1, 0, 0, 8, 38)).toMatch(/floor/);
  });

  it('tells a standard building what it always told it', () => {
    const s = { ...capital(), building: 'standard' as const };
    expect(roomError(s, { floor: 1, x: -2, y: 0, w: 4, h: 5, door: null })).toBe('A room has to stay on the floor, clear of the stairs and the lifts.');
  });

  it('refuses a door in an outer wall, also one of the courtyard', () => {
    const s = capital();
    expect(roomError(s, { floor: 1, x: 0, y: 6, w: 6, h: 5, door: door(3, 11) })).toBe('A door can’t be in an outer wall of the building.');
    expect(roomError(s, { floor: 1, x: 0, y: 0, w: 6, h: 5, door: door(3, 0) })).toBe('A door can’t be in an outer wall of the building.');
    expect(roomError(s, { floor: 1, x: 0, y: 26, w: 6, h: 5, door: door(3, 26) })).toBe('A door can’t be in an outer wall of the building.');
    expect(roomError(s, { floor: 1, x: 0, y: 6, w: 6, h: 5, door: door(3, 6) })).toBeNull();
  });

  it('reaches every wing from the hall', () => {
    for (const floor of [1, 2]) {
      const reached = corridorTiles(capital(), floor, []);
      for (const tile of ['-11:18', '-11:3', '-11:34', '10:5', '10:31', '-8:30']) expect(reached.has(tile), `${tile} on floor ${floor}`).toBe(true);
      expect(reached.has('0:15')).toBe(false);
      expect(reached.has('-16:14')).toBe(false);
    }
  });

  it('can have the rooms of the first plan on every floor, as before', () => {
    let s = capital();
    for (const plot of BUILDINGS.courtyard.plan) expect(roomError(s, { floor: 1, ...plot, door: { x: plot.x + plot.w / 2, z: plot.y > 5 ? plot.y : plot.y + plot.h } })).toBeNull();
    s = { ...s, money: 0 };
    expect(s.building).toBe('courtyard');
  });

  it('proposes the north wing first, then the south wing, then the west wing', () => {
    let s = capital();
    const north: Rect[] = [];
    let first: { x: number; y: number } | null = null;
    let sawWest = false;
    for (let n = 0; n < 60; n++) {
      const plan = proposeRoom(s, 1, 'office');
      if (!plan) break;
      s = must(buildRoom(s, { ...plan, type: 'office' }));
      if (plan.y < 11 && plan.x >= -6) {
        // Nothing in the south or the west wing before the north wing is full.
        expect(first, 'the north wing came after another').toBeNull();
        north.push(plan);
      } else if (!first) {
        first = plan;
      }
      if (plan.y >= 26 && plan.x >= -6) expect(plan.y === 26 || plan.y === 32).toBe(true);
      if (plan.x < -6) sawWest = true;
    }
    // Floor 1 holds more than the first plan's seven rooms.
    expect(north.length).toBeGreaterThanOrEqual(6);
    expect(first).not.toBeNull();
    expect(first!.y >= 26 && first!.x >= -6).toBe(true);
    expect(sawWest).toBe(true);
    // Every room it built is where a room can be, with a door on a corridor that can be walked to.
    const reached = corridorTiles(s, 1, s.rooms.filter((r) => r.floor === 1));
    expect(s.rooms.length).toBeGreaterThan(14);
    expect(reached.size).toBeGreaterThan(20);
  });

  it('turns the rooms of the west wing, with their doors on its corridor', () => {
    let s = capital();
    // Fill the north and south wings first.
    for (let n = 0; n < 60; n++) {
      const plan = proposeRoom(s, 1, 'office');
      if (!plan || plan.x < -6) break;
      s = must(buildRoom(s, { ...plan, type: 'office' }));
    }
    const plan = proposeRoom(s, 1, 'office')!;
    expect(plan.x).toBeLessThan(-6);
    // Turned: the 8 tiles of an office run along the wing, and the door is on the corridor at x = -11.
    expect(plan.h).toBe(8);
    expect([6, 4]).toContain(plan.w);
    expect(plan.door.x === -11 || plan.door.x === -10).toBe(true);
    expect(roomError(s, plan)).toBeNull();
  });
});

describe('walking in the U', () => {
  it('finds the way from the entrance to a room in the south wing, round the courtyard', () => {
    let s = capital();
    s = must(buildRoom(s, { floor: 1, x: 8, y: 26, w: 6, h: 5, door: door(11, 31), type: 'office' }));
    const from = serviceOf(U).entrance.at;
    const path = walkPath(s, 1, from, { x: 11, z: 29 });
    expect(path.length).toBeGreaterThan(2);
    // Never through the courtyard.
    for (const [x, z] of path) expect(x < -6 || z < 11 || z > 26, `(${x}, ${z}) is in the courtyard`).toBe(true);
  });

  it('keeps the places of the core where they were in the standard building', () => {
    const s = { ...capital(), building: 'standard' as const };
    const places = serviceOf(buildingOf(s));
    expect(places.lifts.at).toEqual({ x: -5.25, z: 8.3 });
    expect(places.entrance.at).toEqual({ x: -5.7, z: 5.5 });
    expect(places.stairs.at).toEqual({ x: -4.5, z: 1.2 });
  });
});

describe('the town round the U', () => {
  it('has the lot in the courtyard', () => {
    const lot = lotOf(U, CAPITAL);
    const yard = U.courtyard!;
    expect(lot.x0).toBeGreaterThanOrEqual(yard.x);
    expect(lot.x1).toBeLessThanOrEqual(yard.x + yard.w);
    expect(lot.z0).toBeGreaterThanOrEqual(yard.y);
    expect(lot.z1).toBeLessThanOrEqual(yard.y + yard.h);
  });

  it('has no building of the town on a wing of the U', () => {
    const blocks = townBlocks(1, SITES.capital, U);
    for (const block of blocks) {
      for (const item of block.items) {
        const scale = SITES.capital.scale;
        const half = { w: ((item.turn % 2 === 0 ? item.building.w : item.building.d) * scale) / 2, d: ((item.turn % 2 === 0 ? item.building.d : item.building.w) * scale) / 2 };
        for (const wing of U.wings) {
          const apart = item.x + half.w <= wing.x || item.x - half.w >= wing.x + wing.w || item.z + half.d <= wing.y || item.z - half.d >= wing.y + wing.h;
          expect(apart, `a building of the town at (${item.x}, ${item.z}) is on a wing`).toBe(true);
        }
      }
    }
  });
});

describe('the save of a company in Coax City (version 60)', () => {
  /** A company as it was before the courtyard: in the standard building, with the reception desk in place. */
  function before(headquarters: 'capital' | 'heartland'): GameState {
    const s = structuredClone(createInitialState(1, 'normal', { playerName: 'Pat', companyName: 'Pat Ltd', headquarters }));
    s.money = 1_000_000;
    s.building = 'standard';
    s.floorsUnlocked = 3;
    s.rooms.push({ ...newRoom({ id: 'A', name: 'Room A', floor: 1, ...BUILDINGS.standard.plan[0]!, door: { x: 3, z: 5 } }), type: 'office' });
    const done = autoPlaceFurniture(s, 'reception', 'receptionDesk');
    if (!done.ok) throw new Error(done.error);
    return done.state;
  }
  const load = (s: GameState, version: number) => fromSaveFile({ ...JSON.parse(JSON.stringify(toSaveFile(s, 0))), version });

  it('moves a company in Coax City to the courtyard building, with its rooms where they were', () => {
    const s = before('capital');
    const hall = s.rooms.find((r) => r.roomId === 'reception')!;
    expect(hall).toMatchObject({ x: -4, y: 3, door: { x: 0, z: 5.5 } });
    const { state, version } = load(s, 59);
    expect(version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(60);
    expect(state.building).toBe('courtyard');
    const office = state.rooms.find((r) => r.roomId === 'A')!;
    expect(office).toMatchObject({ x: 0, y: 0, w: 6, h: 5, floor: 1, door: { x: 3, z: 5 } });
    expect(state.messages.at(-1)!.text).toMatch(/U around a courtyard/);
  });

  it('moves the reception with the core, and its furniture with it', () => {
    const s = before('capital');
    const hall = s.rooms.find((r) => r.roomId === 'reception')!;
    const { state } = load(s, 59);
    const moved = state.rooms.find((r) => r.roomId === 'reception')!;
    const want = receptionOf(U);
    expect(moved).toMatchObject({ x: want.x, y: want.y, w: want.w, h: want.h, floor: 1, door: want.door });
    // The desk stands where it stood in the room.
    expect(moved.furniture.map((f) => [f.type, f.x, f.y])).toEqual(hall.furniture.map((f) => [f.type, f.x, f.y]));
    // And the game finds it where the building has the reception.
    expect(moved.x).toBe(-15);
    expect(moved.y).toBe(16);
  });

  it('leaves a company anywhere else as it was', () => {
    const s = before('heartland');
    const { state } = load(s, 59);
    expect(state.building).toBe('standard');
    expect(state.rooms.find((r) => r.roomId === 'reception')).toMatchObject({ x: -4, y: 3 });
    expect(state.messages.some((m) => /U around a courtyard/.test(m.text))).toBe(false);
  });

  it('loads a game saved by this version as it is', () => {
    const s = capital();
    const { state } = load(s, SAVE_VERSION);
    expect(state.building).toBe('courtyard');
  });

  it('is clear of the old core when it moves: a floor 1 room may stand where the stairs were', () => {
    const { state } = load(before('capital'), 59);
    expect(buildableAt(buildingOf(state), 1, -3, 2)).toBe(true);
  });
});
