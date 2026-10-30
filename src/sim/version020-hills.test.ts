import { describe, expect, it } from 'vitest';
import { BUILDINGS, buildableAt, buildingFor, coreOf, coreSpace, hallOf, inRoom, onFloor, outerWalls, receptionOf, westOf, widthOf, type Rect } from '../config/office';
import { SITES } from '../office/sites';
import { layoutOf, layoutOfMap } from '../office/townLayout';
import { buildRoom } from './commands/office';
import { autoPlaceFurniture } from './fixtures';
import { createInitialState } from './newGame';
import { buildingOf, doorways, footprint, newRoom } from './office';
import { corridorTiles, proposeRoom, roomError } from './rooms';
import { SAVE_VERSION, fromSaveFile, toSaveFile } from './save';
import type { GameState } from './state';

const B = BUILDINGS.hills;

/** A company in Amplify Hills with money to spare and every floor open. */
function hills(): GameState {
  const s = structuredClone(createInitialState(1, 'normal', { playerName: 'Pat', companyName: 'Pat Ltd', headquarters: 'highlands' }));
  s.money = 500_000_000;
  s.floorsUnlocked = 4;
  return s;
}

const must = (r: ReturnType<typeof buildRoom>): GameState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

describe('Amplify Hills’ building (#226)', () => {
  it('is the hills building, for new companies there; no region has the long one any more', () => {
    expect(buildingFor('highlands').id).toBe('hills');
    expect(buildingOf(hills()).id).toBe('hills');
    expect((['capital', 'north', 'coast', 'heartland', 'highlands'] as const).some((r) => buildingFor(r).id === 'long')).toBe(false);
    expect(B.floors).toBe(4);
  });

  it('is the drawing: a spine of 55 by 11, two legs of 18 by 37 and the reception box of 11 by 10, 91 by 47 tiles', () => {
    let tiles = 0;
    for (let x = -50; x < 50; x++) for (let y = -3; y < 52; y++) if (onFloor(B, x, y)) tiles++;
    expect(tiles).toBe(55 * 11 + 2 * 18 * 37 + 11 * 10);
    expect(westOf(B)).toBe(-45);
    expect(widthOf(B)).toBe(91);
    expect(B.depth).toBe(47);
    // The lake between the legs, north of the spine, is not floor.
    expect(onFloor(B, 0, 10)).toBe(false);
    expect(onFloor(B, -36, 10)).toBe(true);
    expect(onFloor(B, 36, 10)).toBe(true);
    expect(onFloor(B, 0, 30)).toBe(true);
  });

  it('has the rows of the long building in the east end of the spine, and its first plan 26 south', () => {
    for (let x = -6; x < 28; x++) for (let y = 0; y < 11; y++) expect(onFloor(B, x, y + 26)).toBe(onFloor(BUILDINGS.long, x, y));
    expect(B.plan).toEqual(BUILDINGS.long.plan.map((p) => ({ ...p, y: p.y + 26 })));
  });

  it('has its core in the south of the reception box, the entrance on the south face onto the road', () => {
    const core = coreOf(B);
    expect(B.core).toEqual({ x: 1, y: 41, faces: 's' });
    for (const part of ['stairs', 'lifts', 'technician', 'cleaners', 'hall'] as const) {
      const r = core[part];
      expect(r.x, part).toBeGreaterThanOrEqual(-5);
      expect(r.x + r.w, part).toBeLessThanOrEqual(6);
      expect(r.y, part).toBeGreaterThanOrEqual(41);
      expect(r.y + r.h, part).toBeLessThanOrEqual(47);
    }
    expect(receptionOf(B)).toMatchObject({ id: 'reception', floor: 1, ...core.hall });
    expect(hallOf(B).z).toBeGreaterThan(41);
    expect(outerWalls(B).some((w) => w.faces === 's' && w.wall[1] === 47 && w.wall[0] <= -5 && w.wall[2] >= 6)).toBe(true);
    expect(coreSpace(B, 1)).toEqual({ x: -5, y: 41, w: 11, h: 6 });
    expect(coreSpace(B, 2)).toEqual({ x: -5, y: 44, w: 11, h: 3 });
    expect(buildableAt(B, 1, 0, 43)).toBe(false);
    expect(buildableAt(B, 2, 0, 43)).toBe(true);
  });

  it('reaches every part of the spine and both legs from the hall, on the ground floor and above', () => {
    for (const floor of [1, 3]) {
      const reached = corridorTiles(hills(), floor, []);
      const hall = hallOf(B);
      expect(reached.has(`${Math.floor(hall.x)}:${Math.floor(hall.z)}`), `the hall on floor ${floor}`).toBe(true);
      for (const tile of ['-3:31', '-3:39', '-30:31', '-37:30', '-37:1', '-37:25', '36:30', '36:1', '36:25', '45:31', '-45:31']) expect(reached.has(tile), `${tile} on floor ${floor}`).toBe(true);
    }
  });

  it('can have the rooms of the first plan on every floor, as before', () => {
    const s = hills();
    for (const plot of B.plan) expect(roomError(s, { floor: 1, ...plot, door: { x: plot.x + plot.w / 2, z: plot.y > 31 ? plot.y : plot.y + plot.h } })).toBeNull();
  });

  it('proposes rooms until the floor is full, each with a door on a corridor, and every one can still be reached from the hall', () => {
    for (const floor of [1, 3]) {
      let s = hills();
      const seen: Rect[] = [];
      for (let n = 0; n < 200; n++) {
        const plan = proposeRoom(s, floor, 'office');
        if (!plan) break;
        expect(roomError(s, plan), `room ${n} on floor ${floor}`).toBeNull();
        s = must(buildRoom(s, { ...plan, type: 'office' }));
        seen.push(plan);
      }
      expect(seen.length, `rooms on floor ${floor}`).toBeGreaterThanOrEqual(30);
      // The first proposals are where the long building made them.
      expect(seen[0]!.x).toBeGreaterThanOrEqual(0);
      expect(seen.some((r) => r.x >= 0 && r.y >= 26), 'the east end of the spine').toBe(true);
      expect(seen.some((r) => r.x + r.w <= -7 && r.y >= 26 && r.x >= -36), 'the west end of the spine').toBe(true);
      expect(seen.some((r) => r.x >= 28 && r.y < 26), 'the east leg').toBe(true);
      expect(seen.some((r) => r.x + r.w <= -27 && r.y < 26), 'the west leg').toBe(true);
      const rooms = s.rooms.filter((r) => r.floor === floor);
      const reached = corridorTiles(s, floor, rooms);
      const hall = hallOf(B);
      expect(reached.has(`${Math.floor(hall.x)}:${Math.floor(hall.z)}`), 'the hall').toBe(true);
      // The gap over the reception box, and the tile column of each leg's corridor, stay clear with the floor full.
      for (let x = -6; x < 0; x++) expect(reached.has(`${x}:31`), `${x}:31 on floor ${floor}`).toBe(true);
      for (const column of [-37, 36]) for (let y = 0; y <= 31; y++) expect(reached.has(`${column}:${y}`), `${column}:${y} on floor ${floor}`).toBe(true);
      // Every door opens on a tile that can be walked to from the hall.
      for (const room of rooms) {
        const tiles = [[Math.floor(room.door.x - 0.5), Math.floor(room.door.z)], [Math.floor(room.door.x), Math.floor(room.door.z - 0.5)], [Math.floor(room.door.x - 1), Math.floor(room.door.z)], [Math.floor(room.door.x), Math.floor(room.door.z - 1)]];
        expect(tiles.some(([x, z]) => reached.has(`${x}:${z}`)), `${room.name}'s door on floor ${floor}`).toBe(true);
      }
    }
  }, 120_000);

  it('keeps the floor in front of the reception’s two doors clear', () => {
    let s = hills();
    s = must(autoPlaceFurniture(s, 'reception', 'receptionDesk'));
    const hall = s.rooms.find((r) => r.roomId === 'reception')!;
    const clear = doorways(s, hall).map((t) => t.join(':'));
    expect(clear.length).toBeGreaterThanOrEqual(2);
    for (const f of hall.furniture) {
      const size = footprint(f.type, f.turn);
      expect(clear.some((t) => inRoom({ x: hall.x + f.x, y: hall.y + f.y, ...size }, ...(t.split(':').map(Number) as [number, number])))).toBe(false);
    }
  });
});

describe('the town of Amplify Hills follows the entrance on the road (#226)', () => {
  it('has the door in the middle of the box’s south face, the gate in front of it and the bus stop on the road', () => {
    const layout = layoutOfMap('amplify-hills');
    const { gate, door, away } = layout.places;
    expect(door.x).toBeCloseTo(0.5);
    expect(door.z).toBeCloseTo(47.15);
    expect(gate.x).toBeCloseTo(0.5);
    expect(gate.z).toBeCloseTo(48);
    expect(layout.stops.bus.pos).toBeCloseTo(gate.x);
    expect(layout.stops.bus.at).toBe(layout.lot(B).street);
    // The people who leave go along the front, to the reception's corner.
    expect(away.x).toBeCloseTo(-6.5);
    expect(Number.isFinite(away.x)).toBe(true);
  });

  it('keeps the lot in the west parking strip, beside the reception, and the people out for a walk off the lake', () => {
    const layout = layoutOf(SITES.highlands);
    const lot = layout.lot(B);
    expect(lot.along).toBe('x');
    expect(lot.block.x + lot.block.w).toBeLessThanOrEqual(-5);
    expect(lot.block.x).toBeGreaterThanOrEqual(-45);
    expect(lot.block.z).toBeGreaterThanOrEqual(39);
    expect(lot.block.z + lot.block.d).toBeLessThan(lot.street);
    const { paths } = layout.strolling(B);
    // Their paths are outside the building and off the lake.
    expect(paths?.length ?? 0).toBeGreaterThan(0);
    for (const path of paths ?? []) {
      for (const [x, z] of path) {
        expect(B.wings.some((w) => x > w.x && x < w.x + w.w && z > w.y && z < w.y + w.h)).toBe(false);
        expect((layout.map?.water ?? []).some((w) => x > w.x && x < w.x + w.w && z > w.z && z < w.z + w.d)).toBe(false);
      }
    }
  });
});

describe('the save of a company in Amplify Hills (version 67)', () => {
  /** A company as it was before the hills building: in the long building, with the reception desk in place. */
  function before(headquarters: 'heartland' | 'highlands' | 'coast'): GameState {
    const s = structuredClone(createInitialState(1, 'normal', { playerName: 'Pat', companyName: 'Pat Ltd', headquarters }));
    s.money = 1_000_000;
    s.building = 'long';
    s.floorsUnlocked = 3;
    s.rooms.push({ ...newRoom({ id: 'J', name: 'Room J', floor: 3, ...BUILDINGS.long.plan[9]!, door: { x: 22, z: 6 } }), type: 'office' });
    s.rooms.push({ ...newRoom({ id: 'A', name: 'Room A', floor: 1, ...BUILDINGS.long.plan[0]!, door: { x: 3, z: 5 } }), type: 'office' });
    const done = autoPlaceFurniture(s, 'reception', 'receptionDesk');
    if (!done.ok) throw new Error(done.error);
    return done.state;
  }
  const load = (s: GameState, version: number) => fromSaveFile({ ...JSON.parse(JSON.stringify(toSaveFile(s, 0))), version });

  it('moves a company in Amplify Hills to the hills building, its rooms 26 south on the grid, where they were in the long wing', () => {
    const { state, version } = load(before('highlands'), 66);
    expect(version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(67);
    expect(state.building).toBe('hills');
    expect(state.rooms.find((r) => r.roomId === 'A')).toMatchObject({ x: 0, y: 26, w: 6, h: 5, floor: 1, door: { x: 3, z: 31 } });
    expect(state.rooms.find((r) => r.roomId === 'J')).toMatchObject({ x: 20, y: 32, floor: 3, door: { x: 22, z: 32 } });
    expect(state.messages.at(-1)!.text).toMatch(/Amplify Hills has grown/);
    for (const room of state.rooms.filter((r) => r.roomId !== 'reception')) for (let x = room.x; x < room.x + room.w; x++) for (let y = room.y; y < room.y + room.h; y++) expect(onFloor(B, x, y)).toBe(true);
  });

  it('moves the parts of a joined room and its door too', () => {
    const s = before('highlands');
    const room = s.rooms.find((r) => r.roomId === 'A')!;
    room.parts = [{ x: 0, y: 0, w: 6, h: 5 }, { x: 0, y: 5, w: 3, h: 3 }];
    const { state } = load(s, 66);
    expect(state.rooms.find((r) => r.roomId === 'A')!.parts).toEqual([{ x: 0, y: 26, w: 6, h: 5 }, { x: 0, y: 31, w: 3, h: 3 }]);
  });

  it('moves the reception to the new hall, and puts its furniture in it again, each piece keeping its id', () => {
    let s = before('highlands');
    for (const type of ['couch', 'planter', 'dresser'] as const) s = must(autoPlaceFurniture(s, 'reception', type));
    const was = s.rooms.find((r) => r.roomId === 'reception')!;
    const { state } = load(s, 66);
    const hall = state.rooms.find((r) => r.roomId === 'reception')!;
    const want = receptionOf(B);
    expect(hall).toMatchObject({ x: want.x, y: want.y, w: want.w, h: want.h, floor: 1, door: want.door });
    expect(hall.furniture.map((f) => f.id).sort()).toEqual(was.furniture.map((f) => f.id).sort());
    expect(state.storage).toHaveLength(0);
    const keep = doorways(state, hall).map((t) => t.join(':'));
    const tiles = new Set<string>();
    for (const f of hall.furniture) {
      const size = footprint(f.type, f.turn);
      for (let dx = 0; dx < size.w; dx++) {
        for (let dy = 0; dy < size.h; dy++) {
          expect(f.x + dx >= 0 && f.x + dx < hall.w && f.y + dy >= 0 && f.y + dy < hall.h, `${f.type} at ${f.x}, ${f.y} is inside`).toBe(true);
          const key = `${hall.x + f.x + dx}:${hall.y + f.y + dy}`;
          expect(keep.includes(key), `${f.type} on a doorway`).toBe(false);
          expect(tiles.has(key), `${f.type} on another piece`).toBe(false);
          tiles.add(key);
        }
      }
    }
  });

  it('puts away what no longer fits, and says so', () => {
    let s = before('highlands');
    for (const type of ['dresser', 'planter'] as const) {
      for (;;) {
        const done = autoPlaceFurniture(s, 'reception', type);
        if (!done.ok) break;
        s = done.state;
      }
    }
    const pieces = s.rooms.find((r) => r.roomId === 'reception')!.furniture;
    const { state } = load(s, 66);
    const hall = state.rooms.find((r) => r.roomId === 'reception')!;
    expect(hall.furniture.length + state.storage.length).toBe(pieces.length);
    expect(new Set([...hall.furniture, ...state.storage].map((f) => f.id)).size).toBe(pieces.length);
    if (state.storage.length > 0) expect(state.messages.some((m) => m.kind === 'warning' && /in storage/.test(m.text))).toBe(true);
  });

  it('leaves a company anywhere else as it was', () => {
    const { state } = load(before('coast'), 66);
    expect(state.building).toBe('long');
    expect(state.messages.some((m) => /Amplify Hills has grown/.test(m.text))).toBe(false);
    expect(state.rooms.find((r) => r.roomId === 'A')).toMatchObject({ y: 0 });
    expect(state.rooms.find((r) => r.roomId === 'reception')).toMatchObject({ x: -4, y: 3 });
  });

  it('keeps the whole plan rentable with the hall still reaching every room', () => {
    const { state } = load(before('highlands'), 66);
    let s = { ...state, money: 500_000_000, floorsUnlocked: 4 };
    for (const plot of B.plan) {
      if (s.rooms.some((r) => r.floor === 2 && r.x === plot.x && r.y === plot.y)) continue;
      const result = buildRoom(s, { floor: 2, ...plot, door: { x: plot.x + plot.w / 2, z: plot.y > 31 ? plot.y : plot.y + plot.h }, type: 'office' });
      if (result.ok) s = result.state;
    }
    const reached = corridorTiles(s, 2, s.rooms.filter((r) => r.floor === 2));
    const hall = hallOf(B);
    expect(reached.has(`${Math.floor(hall.x)}:${Math.floor(hall.z)}`)).toBe(true);
    expect(reached.has('-3:31')).toBe(true);
  });

  it('loads a game saved by this version as it is, and a new game in Amplify Hills has the building', () => {
    const { state } = load(hills(), SAVE_VERSION);
    expect(state.building).toBe('hills');
    expect(SITES.highlands.map).toBe('amplify-hills');
  });
});
