import { describe, expect, it } from 'vitest';
import { BUILDINGS, buildableAt, buildingFor, coreOf, coreSpace, hallOf, inRoom, onFloor, outerWalls, receptionOf, westOf, widthOf, type Rect } from '../config/office';
import { serviceOf } from '../office/layout';
import { SITES } from '../office/sites';
import { layoutOf, layoutOfMap } from '../office/townLayout';
import { buildRoom } from './commands/office';
import { autoPlaceFurniture } from './fixtures';
import { createInitialState } from './newGame';
import { buildingOf, doorways, footprint, newRoom } from './office';
import { corridorTiles, proposeRoom, roomError } from './rooms';
import { SAVE_VERSION, fromSaveFile, toSaveFile } from './save';
import type { GameState } from './state';

const B = BUILDINGS.fields;

/** A company in Aerial Fields with money to spare and every floor open. */
function fields(): GameState {
  const s = structuredClone(createInitialState(1, 'normal', { playerName: 'Pat', companyName: 'Pat Ltd', headquarters: 'heartland' }));
  s.money = 500_000_000;
  s.floorsUnlocked = 4;
  return s;
}

const must = (r: ReturnType<typeof buildRoom>): GameState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

describe('Aerial Fields’ building (#225)', () => {
  it('is the fields building, for new companies there only; Amplify Hills has its own', () => {
    expect(buildingFor('heartland').id).toBe('fields');
    expect(buildingFor('highlands').id).toBe('hills');
    expect(buildingOf(fields()).id).toBe('fields');
    expect(B.floors).toBe(4);
  });

  it('is the drawing’s U, 101 by 36 tiles: two wings of 45 by 21, the 11 by 21 between them and two legs of 18 by 15', () => {
    let tiles = 0;
    for (let x = -70; x < 50; x++) for (let y = -3; y < 45; y++) if (onFloor(B, x, y)) tiles++;
    expect(tiles).toBe(2 * 45 * 21 + 11 * 21 + 2 * 18 * 15);
    expect(westOf(B)).toBe(-62);
    expect(widthOf(B)).toBe(101);
    expect(B.depth).toBe(36);
    // The mouth of the U is open ground.
    expect(onFloor(B, -30, 30)).toBe(false);
    expect(onFloor(B, 0, 30)).toBe(false);
    expect(onFloor(B, 30, 30)).toBe(true);
    expect(onFloor(B, -55, 30)).toBe(true);
  });

  it('has the floor of the long building inside the east wing, and its first plan', () => {
    for (let x = -6; x < 28; x++) for (let y = 0; y < 11; y++) expect(onFloor(B, x, y)).toBe(onFloor(BUILDINGS.long, x, y));
    expect(B.plan).toEqual(BUILDINGS.long.plan);
  });

  it('has its core in the south of the box between the wings, the entrance on the south face into the U', () => {
    const core = coreOf(B);
    expect(B.core).toEqual({ x: -11, y: 15, faces: 's' });
    for (const part of ['stairs', 'lifts', 'technician', 'cleaners', 'hall'] as const) {
      const r = core[part];
      expect(r.x, part).toBeGreaterThanOrEqual(-17);
      expect(r.x + r.w, part).toBeLessThanOrEqual(-6);
      expect(r.y, part).toBeGreaterThanOrEqual(15);
      expect(r.y + r.h, part).toBeLessThanOrEqual(21);
    }
    expect(core.hall).toMatchObject({ w: 5, h: 4 });
    expect(hallOf(B).x).toBeCloseTo(-11.5);
    expect(receptionOf(B)).toMatchObject({ id: 'reception', floor: 1, ...core.hall });
    // The outer wall of the box between the wings is a run on the south face; its entrance gap is in it.
    expect(outerWalls(B).some((w) => w.faces === 's' && w.wall[1] === 21 && w.wall[0] <= -17 && w.wall[2] >= -6)).toBe(true);
    expect(serviceOf(B).entrance.at.z).toBeGreaterThan(core.hall.y + core.hall.h - 1);
  });

  it('keeps rooms off the core: all 11 by 6 tiles on the ground floor, the 3 rows at the face above it', () => {
    expect(coreSpace(B, 1)).toEqual({ x: -17, y: 15, w: 11, h: 6 });
    expect(coreSpace(B, 2)).toEqual({ x: -17, y: 18, w: 11, h: 3 });
    expect(buildableAt(B, 1, -12, 17)).toBe(false);
    expect(buildableAt(B, 2, -12, 17)).toBe(true);
    expect(buildableAt(B, 1, -12, 12)).toBe(true);
    // The old core's ground in the east wing is open floor now, and the mouth of the U is not floor.
    expect(buildableAt(B, 1, -5, 5)).toBe(true);
    expect(buildableAt(B, 1, 0, 30)).toBe(false);
  });

  it('reaches every wing and both legs from the hall, on the ground floor and above', () => {
    for (const floor of [1, 3]) {
      const reached = corridorTiles(fields(), floor, []);
      const hall = hallOf(B);
      expect(reached.has(`${Math.floor(hall.x)}:${Math.floor(hall.z)}`), `the hall on floor ${floor}`).toBe(true);
      for (const tile of ['-12:14', '-12:8', '-40:14', '-55:30', '-54:35', '-62:21', '29:30', '29:35', '38:21', '-5:5', '-38:5', '-62:0', '38:20', '38:0']) expect(reached.has(tile), `${tile} on floor ${floor}`).toBe(true);
    }
  });

  it('can have the rooms of the first plan on every floor, as before', () => {
    const s = fields();
    for (const plot of B.plan) expect(roomError(s, { floor: 1, ...plot, door: { x: plot.x + plot.w / 2, z: plot.y > 5 ? plot.y : plot.y + plot.h } })).toBeNull();
  });

  it('proposes rooms until the floor is full, each with a door on a corridor, and every one can still be reached from the hall', () => {
    for (const floor of [1, 3]) {
      let s = fields();
      const seen: Rect[] = [];
      for (let n = 0; n < 200; n++) {
        const plan = proposeRoom(s, floor, 'office');
        if (!plan) break;
        expect(roomError(s, plan), `room ${n} on floor ${floor}`).toBeNull();
        s = must(buildRoom(s, { ...plan, type: 'office' }));
        seen.push(plan);
      }
      expect(seen.length, `rooms on floor ${floor}`).toBeGreaterThanOrEqual(40);
      expect(seen.some((r) => r.x >= -6 && r.y < 11), 'the east wing').toBe(true);
      expect(seen.some((r) => r.x + r.w <= -17 && r.y < 11), 'the west wing').toBe(true);
      expect(seen.some((r) => r.y >= 11 && r.x < -17 && r.y < 21), 'the south of the west wing').toBe(true);
      expect(seen.some((r) => r.x >= 21 && r.y >= 21), 'the east leg').toBe(true);
      expect(seen.some((r) => r.x + r.w <= -44 && r.y >= 21), 'the west leg').toBe(true);
      const rooms = s.rooms.filter((r) => r.floor === floor);
      const reached = corridorTiles(s, floor, rooms);
      expect(reached.has('-12:14')).toBe(true);
      // The tile column of each leg's corridor stays clear from the corridor across, with the floor full.
      for (const column of [-54, 29]) for (let y = 14; y < 36; y++) expect(reached.has(`${column}:${y}`), `${column}:${y} on floor ${floor}`).toBe(true);
      // Every door opens on a tile that can be walked to from the hall.
      for (const room of rooms) {
        const tiles = [[Math.floor(room.door.x - 0.5), Math.floor(room.door.z)], [Math.floor(room.door.x), Math.floor(room.door.z - 0.5)], [Math.floor(room.door.x - 1), Math.floor(room.door.z)], [Math.floor(room.door.x), Math.floor(room.door.z - 1)]];
        expect(tiles.some(([x, z]) => reached.has(`${x}:${z}`)), `${room.name}'s door on floor ${floor}`).toBe(true);
      }
    }
  }, 120_000);

  it('keeps the floor in front of the reception’s two doors clear', () => {
    let s = fields();
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

describe('the town of Aerial Fields follows the entrance in the U (#225)', () => {
  it('has the gate in front of the entrance, on the pavement between the strips, and the bus stop on the road south of the lot, west of the T-junction', () => {
    const layout = layoutOfMap('aerial-fields');
    const { gate, door } = layout.places;
    expect(gate.x).toBeCloseTo(-11.5);
    expect(gate.z).toBeCloseTo(22);
    expect(door.x).toBeCloseTo(gate.x);
    expect(door.z).toBeCloseTo(21.15);
    expect(layout.stops.bus.along).toBe('x');
    expect(layout.stops.bus.pos).toBeCloseTo(gate.x - 4);
    const lot = layout.lot(B);
    expect(layout.stops.bus.at).toBe(lot.street);
    // The T-junction is east of the stop: the road beside the lot is a dead end beyond it.
    const stem = layout.map!.roads.find((r) => r.along === 'z' && r.from! <= lot.street && r.to! >= lot.street)!;
    expect(layout.stops.bus.pos).toBeLessThan(stem.at);
  });

  it('keeps the lot in the parking strip east in the U, under the east wing', () => {
    const lot = layoutOf(SITES.heartland).lot(B);
    expect(lot.along).toBe('x');
    expect(lot.block.z).toBeGreaterThanOrEqual(23);
    expect(lot.block.x).toBeGreaterThan(-6);
    expect(lot.block.x + lot.block.w).toBeLessThanOrEqual(21);
    expect(lot.block.z + lot.block.d).toBeLessThan(lot.street);
    // The people out for a walk go away along the front pavement, west of the door.
    expect(layoutOf(SITES.heartland).places.away.x).toBeLessThan(layoutOf(SITES.heartland).places.gate.x);
  });
});

describe('the save of a company in Aerial Fields (version 66)', () => {
  /** A company as it was before the fields building: in the long building, with the reception desk in place. */
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

  it('moves a company in Aerial Fields to the fields building, with its rooms where they were', () => {
    const { state, version } = load(before('heartland'), 65);
    expect(version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(66);
    expect(state.building).toBe('fields');
    expect(state.rooms.find((r) => r.roomId === 'A')).toMatchObject({ x: 0, y: 0, w: 6, h: 5, floor: 1, door: { x: 3, z: 5 } });
    expect(state.rooms.find((r) => r.roomId === 'J')).toMatchObject({ floor: 3, door: { x: 22, z: 6 } });
    expect(state.messages.at(-1)!.text).toMatch(/entrance faces south, into the U/);
    // Every room is on floor in the new building.
    for (const room of state.rooms.filter((r) => r.roomId !== 'reception')) for (let x = room.x; x < room.x + room.w; x++) for (let y = room.y; y < room.y + room.h; y++) expect(onFloor(B, x, y)).toBe(true);
  });

  it('moves the reception to the new hall, and puts its furniture in it again, each piece keeping its id', () => {
    let s = before('heartland');
    for (const type of ['couch', 'planter', 'dresser'] as const) s = must(autoPlaceFurniture(s, 'reception', type));
    const was = s.rooms.find((r) => r.roomId === 'reception')!;
    const { state } = load(s, 65);
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
    let s = before('heartland');
    for (const type of ['dresser', 'planter'] as const) {
      for (;;) {
        const done = autoPlaceFurniture(s, 'reception', type);
        if (!done.ok) break;
        s = done.state;
      }
    }
    const pieces = s.rooms.find((r) => r.roomId === 'reception')!.furniture;
    const { state } = load(s, 65);
    const hall = state.rooms.find((r) => r.roomId === 'reception')!;
    expect(hall.furniture.length + state.storage.length).toBe(pieces.length);
    expect(new Set([...hall.furniture, ...state.storage].map((f) => f.id)).size).toBe(pieces.length);
    if (state.storage.length > 0) expect(state.messages.some((m) => m.kind === 'warning' && /in storage/.test(m.text))).toBe(true);
  });

  it('leaves a company anywhere else as it was', () => {
    const { state } = load(before('coast'), 65);
    expect(state.building).toBe('long');
    expect(state.messages.some((m) => /entrance faces south, into the U/.test(m.text))).toBe(false);
    expect(state.rooms.find((r) => r.roomId === 'reception')).toMatchObject({ x: -4, y: 3 });
  });

  it('loads a game saved by this version as it is, and a new game in Aerial Fields has the building', () => {
    const { state } = load(fields(), SAVE_VERSION);
    expect(state.building).toBe('fields');
    expect(SITES.heartland.map).toBe('aerial-fields');
  });
});
