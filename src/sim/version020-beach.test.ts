import { describe, expect, it } from 'vitest';
import { BUILDINGS, buildableAt, buildingFor, coreOf, coreSpace, hallOf, inRoom, onFloor, outerWalls, receptionOf, westOf, widthOf, type Rect } from '../config/office';
import { SITES } from '../office/sites';
import { serviceOf } from '../office/layout';
import { layoutOfMap } from '../office/townLayout';
import { MAPS } from '../config/maps';
import { buildRoom } from './commands/office';
import { autoPlaceFurniture } from './fixtures';
import { createInitialState } from './newGame';
import { buildingOf, doorways, footprint, newRoom } from './office';
import { corridorTiles, proposeRoom, roomError } from './rooms';
import { SAVE_VERSION, fromSaveFile, toSaveFile } from './save';
import type { GameState } from './state';

const B = BUILDINGS.beach;

/** A company in Skywave Beach with money to spare and every floor open. */
function beach(): GameState {
  const s = structuredClone(createInitialState(1, 'normal', { playerName: 'Pat', companyName: 'Pat Ltd', headquarters: 'coast' }));
  s.money = 50_000_000;
  s.floorsUnlocked = 6;
  return s;
}

const must = (r: ReturnType<typeof buildRoom>): GameState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

describe('Skywave Beach’s building (#224)', () => {
  it('is the beach building, for new companies there only', () => {
    expect(buildingFor('coast').id).toBe('beach');
    expect(buildingFor('north').id).toBe('valley');
    expect(buildingOf(beach()).id).toBe('beach');
    expect(B.floors).toBe(6);
  });

  it('is 63 by 21 tiles: two wings of 26 by 21 and the 11 by 21 between them, the old standard building in the east wing', () => {
    let tiles = 0;
    for (let x = -50; x < 30; x++) for (let y = -3; y < 25; y++) if (onFloor(B, x, y)) tiles++;
    expect(tiles).toBe(63 * 21);
    expect(westOf(B)).toBe(-43);
    expect(widthOf(B)).toBe(63);
    expect(B.depth).toBe(21);
    for (let x = -6; x < 20; x++) for (let y = 0; y < 11; y++) expect(onFloor(B, x, y)).toBe(onFloor(BUILDINGS.standard, x, y));
    expect(B.plan).toEqual(BUILDINGS.standard.plan);
  });

  it('stands where the town puts the east wing of the drawing: the first wide wing in its list is at the drawing x the layout shifts by 43', () => {
    const wings = MAPS['skywave-beach']!.map.wings;
    const wide = wings.filter((w) => w.w > w.h);
    const north = wide.reduce((a, b) => (b.y < a.y ? b : a));
    expect(north).toMatchObject({ x: 37, y: 0, w: 26, h: 21 });
    // The drawing's wings, shifted by -43, are the building's.
    const shifted = wings.map((w) => ({ x: w.x - 43, y: w.y, w: w.w, h: w.h }));
    for (const w of shifted) for (let x = w.x; x < w.x + w.w; x++) for (let y = w.y; y < w.y + w.h; y++) expect(onFloor(B, x, y)).toBe(true);
  });

  it('has its core on the north of the hall between the wings, the entrance on the north face', () => {
    const core = coreOf(B);
    expect(B.core).toEqual({ x: -11, y: 0, faces: 'n' });
    // Everything of the core is inside the 11 by 6 block at the north face, between the wings.
    for (const part of ['stairs', 'lifts', 'technician', 'cleaners', 'hall'] as const) {
      const r = core[part];
      expect(r.x, part).toBeGreaterThanOrEqual(-17);
      expect(r.x + r.w, part).toBeLessThanOrEqual(-6);
      expect(r.y, part).toBeGreaterThanOrEqual(0);
      expect(r.y + r.h, part).toBeLessThanOrEqual(6);
    }
    // The stairs and the lifts are in the two corners at the face; the hall is 5 wide and 4 deep, with the entrance strip in front of it.
    expect(core.stairs).toMatchObject({ y: 0, w: 3, h: 3 });
    expect(core.lifts).toMatchObject({ y: 0, w: 3, h: 3 });
    expect(core.hall).toMatchObject({ y: 2, w: 5, h: 4 });
    expect(hallOf(B).x).toBeCloseTo(-11.5);
    expect(receptionOf(B)).toMatchObject({ id: 'reception', floor: 1, ...core.hall });
    // The outer wall on the north is one run across the whole 63 tiles.
    expect(outerWalls(B)).toContainEqual({ wall: [-43, 0, 20, 0], faces: 'n' });
    expect(serviceOf(B).entrance.at.z).toBeLessThan(core.hall.y);
    expect(serviceOf(B).entrance.at.z).toBeGreaterThan(-2);
  });

  it('keeps rooms off the core: all 11 by 6 tiles on the ground floor, the 3 rows at the face above it', () => {
    expect(coreSpace(B, 1)).toEqual({ x: -17, y: 0, w: 11, h: 6 });
    expect(coreSpace(B, 2)).toEqual({ x: -17, y: 0, w: 11, h: 3 });
    expect(buildableAt(B, 1, -12, 4)).toBe(false);
    expect(buildableAt(B, 2, -12, 4)).toBe(true);
    expect(buildableAt(B, 2, -12, 1)).toBe(false);
    expect(buildableAt(B, 1, -12, 8)).toBe(true);
    // The old core's ground in the east wing is open floor now.
    expect(buildableAt(B, 1, -5, 5)).toBe(true);
    expect(buildableAt(B, 1, 21, 5)).toBe(false);
  });

  it('reaches every wing from the hall, on the ground floor and above', () => {
    for (const floor of [1, 2]) {
      const reached = corridorTiles(beach(), floor, []);
      const hall = hallOf(B);
      expect(reached.has(`${Math.floor(hall.x)}:${Math.floor(hall.z)}`), `the hall on floor ${floor}`).toBe(true);
      for (const tile of ['-12:14', '-12:8', '-40:14', '-30:14', '15:14', '-5:5', '-38:5', '-5:0', '-43:0', '19:20']) expect(reached.has(tile), `${tile} on floor ${floor}`).toBe(true);
    }
  });

  it('can have the rooms of the first plan on every floor, as before', () => {
    const s = beach();
    for (const plot of B.plan) expect(roomError(s, { floor: 1, ...plot, door: { x: plot.x + plot.w / 2, z: plot.y > 5 ? plot.y : plot.y + plot.h } })).toBeNull();
  });

  it('proposes rooms along its lanes, each with a door on a corridor that can be walked to from the hall', () => {
    for (const floor of [1, 3]) {
      let s = beach();
      const seen: Rect[] = [];
      for (let n = 0; n < 60; n++) {
        const plan = proposeRoom(s, floor, 'office');
        if (!plan) break;
        expect(roomError(s, plan), `room ${n} on floor ${floor}`).toBeNull();
        s = must(buildRoom(s, { ...plan, type: 'office' }));
        seen.push(plan);
      }
      expect(seen.length, `rooms on floor ${floor}`).toBeGreaterThanOrEqual(15);
      expect(seen.some((r) => r.y >= 11 && r.x < -17), 'the south-west').toBe(true);
      expect(seen.some((r) => r.y >= 11 && r.x >= -6), 'the south-east').toBe(true);
      expect(seen.some((r) => r.x >= -6 && r.y < 11), 'the east wing').toBe(true);
      const reached = corridorTiles(s, floor, s.rooms.filter((r) => r.floor === floor));
      expect(reached.has('-12:14')).toBe(true);
      expect(reached.size).toBeGreaterThan(40);
    }
  });

  it('keeps the floor in front of the reception’s two doors clear', () => {
    let s = beach();
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

describe('the town of Skywave Beach follows the north entrance (#224)', () => {
  it('has the bus stop on the street north of the building, level with the gate, and the gate in front of the entrance', () => {
    const layout = layoutOfMap('skywave-beach');
    const { gate, door } = layout.places;
    expect(layout.stops.bus.along).toBe('x');
    expect(layout.stops.bus.pos).toBeCloseTo(gate.x);
    expect(layout.stops.bus.at).toBeLessThan(-0.5);
    expect(gate.z).toBeLessThan(0);
    expect(door.x).toBeCloseTo(gate.x);
    expect(layout.places.round).toBeTruthy();
  });
});

describe('the save of a company in Skywave Beach (version 65)', () => {
  /** A company as it was before the beach building: in the standard building, with the reception desk in place. */
  function before(headquarters: 'coast' | 'north' | 'capital'): GameState {
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

  it('moves a company in Skywave Beach to the beach building, with its rooms where they were', () => {
    const { state, version } = load(before('coast'), 64);
    expect(version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(65);
    expect(state.building).toBe('beach');
    expect(state.rooms.find((r) => r.roomId === 'A')).toMatchObject({ x: 0, y: 0, w: 6, h: 5, floor: 1, door: { x: 3, z: 5 } });
    expect(state.messages.at(-1)!.text).toMatch(/entrance on the street to the north/);
  });

  it('moves the reception to the new hall, and puts its furniture in it again, each piece keeping its id', () => {
    let s = before('coast');
    for (const type of ['couch', 'planter', 'dresser'] as const) s = must(autoPlaceFurniture(s, 'reception', type));
    const was = s.rooms.find((r) => r.roomId === 'reception')!;
    expect(was).toMatchObject({ x: -4, y: 3, w: 4, h: 5 });
    const { state } = load(s, 64);
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
    expect(state.rooms.some((r) => r.roomId === 'reception' && r.furniture.some((f) => f.type === 'receptionDesk'))).toBe(true);
  });

  it('puts away what no longer fits, and says so', () => {
    let s = before('coast');
    for (const type of ['dresser', 'planter'] as const) {
      for (;;) {
        const done = autoPlaceFurniture(s, 'reception', type);
        if (!done.ok) break;
        s = done.state;
      }
    }
    const pieces = s.rooms.find((r) => r.roomId === 'reception')!.furniture;
    const { state } = load(s, 64);
    const hall = state.rooms.find((r) => r.roomId === 'reception')!;
    expect(hall.furniture.length + state.storage.length).toBe(pieces.length);
    expect(new Set([...hall.furniture, ...state.storage].map((f) => f.id)).size).toBe(pieces.length);
    if (state.storage.length > 0) expect(state.messages.some((m) => m.kind === 'warning' && /in storage/.test(m.text))).toBe(true);
  });

  it('leaves a company anywhere else as it was', () => {
    for (const where of ['north', 'capital'] as const) {
      const { state } = load(before(where), 64);
      expect(state.building).toBe('standard');
      expect(state.messages.some((m) => /entrance on the street to the north/.test(m.text))).toBe(false);
    }
  });

  it('loads a game saved by this version as it is, and a new game in Skywave Beach has the building', () => {
    const { state } = load(beach(), SAVE_VERSION);
    expect(state.building).toBe('beach');
    expect(SITES.coast.map).toBe('skywave-beach');
  });
});
