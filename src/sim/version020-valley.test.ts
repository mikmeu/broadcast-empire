import { describe, expect, it } from 'vitest';
import { BUILDINGS, CORE, RECEPTION, SERVICE_ROOMS, buildableAt, buildingFor, coreOf, coreSpace, coreWalls, frameOf, hallOf, inRoom, onFloor, outerWalls, receptionOf, serviceRoomsOf, westOf, widthOf, type Rect } from '../config/office';
import { SITES } from '../office/sites';
import { serviceOf } from '../office/layout';
import { buildRoom } from './commands/office';
import { autoPlaceFurniture } from './fixtures';
import { createInitialState } from './newGame';
import { buildingOf, doorways, footprint, newRoom } from './office';
import { corridorTiles, proposeRoom, roomError } from './rooms';
import { SAVE_VERSION, fromSaveFile, toSaveFile } from './save';
import type { GameState } from './state';

const V = BUILDINGS.valley;

/** A company in Transponder Valley with money to spare and every floor open. */
function valley(): GameState {
  const s = structuredClone(createInitialState(1, 'normal', { playerName: 'Pat', companyName: 'Pat Ltd', headquarters: 'north' }));
  s.money = 50_000_000;
  s.floorsUnlocked = 6;
  return s;
}

const must = (r: ReturnType<typeof buildRoom>): GameState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

describe('a core that faces west is as it always was (#223)', () => {
  it('gives exactly the coordinates of CORE for the standard, long and courtyard buildings, moved by the core’s offset', () => {
    for (const building of [BUILDINGS.standard, BUILDINGS.long, BUILDINGS.courtyard]) {
      const { x: dx, y: dy } = building.core;
      const core = coreOf(building);
      for (const part of ['hall', 'stairs', 'lifts', 'technician', 'cleaners'] as const) expect(core[part], `${building.id} ${part}`).toEqual({ ...CORE[part], x: CORE[part].x + dx, y: CORE[part].y + dy });
      expect(core.entry).toEqual({ x: CORE.entry.x + dx, y: CORE.entry.y + dy });
      expect(hallOf(building)).toEqual({ x: CORE.entry.x + dx + 0.5, z: CORE.entry.y + dy + 0.5 });
      expect(receptionOf(building)).toEqual({ ...RECEPTION, ...core.hall, door: { x: RECEPTION.door.x + dx, z: RECEPTION.door.z + dy } });
      expect(coreSpace(building, 1)).toEqual({ x: CORE.stairs.x + dx, y: CORE.stairs.y + dy, w: 6, h: 11 });
      expect(coreSpace(building, 2)).toEqual({ x: CORE.stairs.x + dx, y: CORE.stairs.y + dy, w: 3, h: 11 });
    }
    expect(serviceRoomsOf(BUILDINGS.standard)).toEqual(SERVICE_ROOMS);
    expect(SERVICE_ROOMS.technician.door).toEqual({ x: -1.5, z: 3 });
    expect(SERVICE_ROOMS.cleaners.door).toEqual({ x: -1.5, z: 8 });
  });

  it('has the walls of the core of the standard building where they were', () => {
    expect(coreWalls(2, BUILDINGS.standard)).toEqual([[-3, 0, -3, 3], [-3, 8, -3, 11]]);
    const ground = coreWalls(1, BUILDINGS.standard);
    expect(ground.slice(0, 2)).toEqual([[-3, 0, -3, 3], [-3, 8, -3, 11]]);
    // The technicians' room: its south wall with the door to the hall (a gap of one tile), its east wall, its north wall is the building's.
    expect(ground).toContainEqual([-3, 3, -2, 3]);
    expect(ground).toContainEqual([-1, 3, 0, 3]);
    expect(ground).toContainEqual([0, 0, 0, 3]);
    expect(ground).not.toContainEqual([-3, 0, 0, 0]);
    expect(serviceOf(BUILDINGS.standard).entrance).toMatchObject({ door: { x: -4, z: 5.5 }, at: { x: -5.7, z: 5.5 } });
    expect(serviceOf(BUILDINGS.standard).lifts).toMatchObject({ door: { x: -5.25, z: 7.6 }, at: { x: -5.25, z: 8.3 } });
  });

  it('turns a quarter for a core that faces north or south, and keeps its parts in the same order', () => {
    // The hall is 4 deep and 5 along the face, whichever face it is on.
    const south = frameOf('s', 26, 15).rect(2, 3, 4, 5);
    const north = frameOf('n', 26, 15).rect(2, 3, 4, 5);
    expect(south).toEqual({ x: 23, y: 15, w: 5, h: 4 });
    expect(north).toEqual({ x: 23, y: 17, w: 5, h: 4 });
    // The face itself is the south side (z 21) or the north side (z 15) of the block, and its middle is the same x.
    expect(frameOf('s', 26, 15).point(0, 5.5)).toEqual({ x: 25.5, z: 21 });
    expect(frameOf('n', 26, 15).point(0, 5.5)).toEqual({ x: 25.5, z: 15 });
    expect(frameOf('w', 26, 15).point(0, 5.5)).toEqual({ x: 20, z: 20.5 });
    // A quarter turn, not a mirror: going along the face from the stairs to the lifts is going the same way round.
    const turn = (f: ReturnType<typeof frameOf>) => {
      const [a, b, c] = [f.point(0, 0), f.point(1, 0), f.point(0, 1)];
      return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    };
    expect(Math.sign(turn(frameOf('w', 0, 0)))).toBe(Math.sign(turn(frameOf('s', 0, 0))));
    expect(Math.sign(turn(frameOf('w', 0, 0)))).toBe(Math.sign(turn(frameOf('n', 0, 0))));
  });
});

describe('Transponder Valley’s building (#223)', () => {
  it('is the valley building, for new companies there only', () => {
    expect(buildingFor('north').id).toBe('valley');
    expect(buildingFor('coast').id).toBe('standard');
    expect(buildingFor('capital').id).toBe('courtyard');
    expect(buildingFor('heartland').id).toBe('long');
    expect(buildingOf(valley()).id).toBe('valley');
    expect(V.floors).toBe(6);
  });

  it('is 37 by 21 tiles, the old standard building in its north-west corner', () => {
    let tiles = 0;
    for (let x = -10; x < 40; x++) for (let y = -3; y < 25; y++) if (onFloor(V, x, y)) tiles++;
    expect(tiles).toBe(37 * 21);
    expect(westOf(V)).toBe(-6);
    expect(widthOf(V)).toBe(37);
    expect(V.depth).toBe(21);
    for (let x = -6; x < 20; x++) for (let y = 0; y < 11; y++) expect(onFloor(V, x, y)).toBe(onFloor(BUILDINGS.standard, x, y));
    expect(V.plan).toEqual(BUILDINGS.standard.plan);
    // The wings are the drawing's red shapes (26 by 21 and 11 by 11) and the reception box (11 by 10).
    expect(V.wings).toEqual([{ x: -6, y: 0, w: 26, h: 21 }, { x: 20, y: 0, w: 11, h: 11 }, { x: 20, y: 11, w: 11, h: 10 }]);
  });

  it('has its core in the south-east corner, the entrance on the south face', () => {
    const core = coreOf(V);
    expect(V.core).toEqual({ x: 26, y: 15, faces: 's' });
    expect(core.stairs).toEqual({ x: 20, y: 18, w: 3, h: 3 });
    expect(core.lifts).toEqual({ x: 28, y: 18, w: 3, h: 3 });
    expect(core.technician).toEqual({ x: 20, y: 15, w: 3, h: 3 });
    expect(core.cleaners).toEqual({ x: 28, y: 15, w: 3, h: 3 });
    expect(core.hall).toEqual({ x: 23, y: 15, w: 5, h: 4 });
    expect(core.entry).toEqual({ x: 25, y: 18 });
    expect(hallOf(V)).toEqual({ x: 25.5, z: 18.5 });
    // The reception's door is in the back of the hall, onto the corridor to the north of it.
    expect(receptionOf(V)).toMatchObject({ id: 'reception', floor: 1, ...core.hall, door: { x: 25.5, z: 15 } });
    expect(serviceRoomsOf(V).technician.door).toEqual({ x: 23, z: 16.5 });
    expect(serviceRoomsOf(V).cleaners.door).toEqual({ x: 28, z: 16.5 });
    // The core is against the south face: the outer wall there is one run, the whole 37 tiles.
    expect(outerWalls(V)).toContainEqual({ wall: [-6, 21, 31, 21], faces: 's' });
    expect(serviceOf(V).entrance.at.z).toBeGreaterThan(core.hall.y + core.hall.h);
    expect(serviceOf(V).entrance.at.z).toBeLessThan(21);
  });

  it('keeps rooms off the core: all 11 by 6 tiles on the ground floor, the 3 rows at the face above it', () => {
    expect(coreSpace(V, 1)).toEqual({ x: 20, y: 15, w: 11, h: 6 });
    expect(coreSpace(V, 2)).toEqual({ x: 20, y: 18, w: 11, h: 3 });
    expect(buildableAt(V, 1, 25, 16)).toBe(false);
    expect(buildableAt(V, 2, 25, 16)).toBe(true);
    expect(buildableAt(V, 2, 25, 18)).toBe(false);
    expect(buildableAt(V, 1, 25, 14)).toBe(true);
    // The old core's ground is open floor now.
    expect(buildableAt(V, 1, -5, 5)).toBe(true);
    expect(buildableAt(V, 1, 32, 5)).toBe(false);
  });

  it('closes the stairs and the lifts towards the rooms, and walls the two small rooms in', () => {
    const upper = coreWalls(2, V);
    expect(upper).toContainEqual([20, 18, 23, 18]);
    expect(upper).toContainEqual([28, 18, 31, 18]);
    // The stairs are in the corner beside the west wing: closed towards it too. The lifts are against the outer wall.
    expect(upper).toContainEqual([20, 18, 20, 21]);
    expect(upper).toHaveLength(3);
    const ground = coreWalls(1, V);
    // The technicians' room, behind the stairs: closed on the west towards the wing, open (a door) on the east to the hall, not doubled on the stairs' wall.
    expect(ground).toContainEqual([20, 15, 20, 18]);
    expect(ground).toContainEqual([20, 15, 23, 15]);
    expect(ground.filter((w) => w.join() === '20,18,23,18')).toHaveLength(1);
    expect(ground).toContainEqual([23, 15, 23, 16]);
    expect(ground).toContainEqual([23, 17, 23, 18]);
  });

  it('reaches every wing from the hall, on the ground floor and above', () => {
    for (const floor of [1, 2]) {
      const reached = corridorTiles(valley(), floor, []);
      for (const tile of ['25:18', '25:14', '25:5', '-5:20', '-5:0', '30:0', '19:19', '24:11']) expect(reached.has(tile), `${tile} on floor ${floor}`).toBe(true);
      expect(reached.has('21:19')).toBe(false);
      expect(reached.has('32:5')).toBe(false);
    }
  });

  it('can have the rooms of the first plan on every floor, as before', () => {
    const s = valley();
    for (const plot of V.plan) expect(roomError(s, { floor: 1, ...plot, door: { x: plot.x + plot.w / 2, z: plot.y > 5 ? plot.y : plot.y + plot.h } })).toBeNull();
  });

  it('proposes rooms along its lanes, each with a door on a corridor that can be walked to from the hall', () => {
    for (const floor of [1, 3]) {
      let s = valley();
      const seen: Rect[] = [];
      for (let n = 0; n < 40; n++) {
        const plan = proposeRoom(s, floor, 'office');
        if (!plan) break;
        expect(roomError(s, plan), `room ${n} on floor ${floor}`).toBeNull();
        s = must(buildRoom(s, { ...plan, type: 'office' }));
        seen.push(plan);
      }
      expect(seen.length, `rooms on floor ${floor}`).toBeGreaterThanOrEqual(10);
      // Every lane gets a room: the corridor from the hall, the east wing, the two old rows.
      expect(seen.some((r) => r.y >= 11 && r.x < 20), 'the south-west').toBe(true);
      expect(seen.some((r) => r.x >= 20 && r.y < 11), 'the east wing').toBe(true);
      expect(seen.some((r) => r.x < 20 && r.y < 11), 'the north-west').toBe(true);
      // And everyone can still get to every door, from the hall.
      const reached = corridorTiles(s, floor, s.rooms.filter((r) => r.floor === floor));
      expect(reached.has('25:14')).toBe(true);
      expect(reached.size).toBeGreaterThan(20);
    }
  });

  it('keeps the floor in front of the reception’s two doors clear', () => {
    let s = valley();
    s = must(autoPlaceFurniture(s, 'reception', 'receptionDesk'));
    const hall = s.rooms.find((r) => r.roomId === 'reception')!;
    const clear = doorways(s, hall).map((t) => t.join(':'));
    // The tile inside the door at the back, and the one where people come in from the entrance.
    expect(clear).toEqual(expect.arrayContaining(['25:15', '25:18']));
    for (const f of hall.furniture) {
      const size = footprint(f.type, f.turn);
      expect(clear.some((t) => inRoom({ x: hall.x + f.x, y: hall.y + f.y, ...size }, ...(t.split(':').map(Number) as [number, number])))).toBe(false);
    }
  });
});

describe('the save of a company in Transponder Valley (version 64)', () => {
  /** A company as it was before the valley building: in the standard building, with the reception desk in place. */
  function before(headquarters: 'north' | 'coast' | 'capital'): GameState {
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

  it('moves a company in Transponder Valley to the valley building, with its rooms where they were', () => {
    const { state, version } = load(before('north'), 63);
    expect(version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(64);
    expect(state.building).toBe('valley');
    expect(state.rooms.find((r) => r.roomId === 'A')).toMatchObject({ x: 0, y: 0, w: 6, h: 5, floor: 1, door: { x: 3, z: 5 } });
    expect(state.messages.at(-1)!.text).toMatch(/entrance on the street to the south/);
  });

  it('moves the reception to the new hall, and puts its furniture in it again, each piece keeping its id', () => {
    let s = before('north');
    // A couch and a planter beside the desk.
    for (const type of ['couch', 'planter', 'dresser'] as const) s = must(autoPlaceFurniture(s, 'reception', type));
    const was = s.rooms.find((r) => r.roomId === 'reception')!;
    expect(was).toMatchObject({ x: -4, y: 3, w: 4, h: 5 });
    const { state } = load(s, 63);
    const hall = state.rooms.find((r) => r.roomId === 'reception')!;
    const want = receptionOf(V);
    expect(hall).toMatchObject({ x: want.x, y: want.y, w: want.w, h: want.h, floor: 1, door: want.door });
    expect(hall.furniture.map((f) => f.id).sort()).toEqual(was.furniture.map((f) => f.id).sort());
    expect(state.storage).toHaveLength(0);
    // Every piece is inside the hall, none over the way in or the door at the back, and none on another.
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
    // The game finds the desk where the building has the reception.
    expect(state.rooms.some((r) => r.roomId === 'reception' && r.furniture.some((f) => f.type === 'receptionDesk'))).toBe(true);
  });

  it('puts away what no longer fits, and says so', () => {
    let s = before('north');
    // Fill the old hall to the last tile that will take a dresser.
    for (;;) {
      const done = autoPlaceFurniture(s, 'reception', 'dresser');
      if (!done.ok) break;
      s = done.state;
    }
    for (;;) {
      const done = autoPlaceFurniture(s, 'reception', 'planter');
      if (!done.ok) break;
      s = done.state;
    }
    const pieces = s.rooms.find((r) => r.roomId === 'reception')!.furniture;
    const { state } = load(s, 63);
    const hall = state.rooms.find((r) => r.roomId === 'reception')!;
    // Nothing is lost: a piece is in the hall or in storage.
    expect(hall.furniture.length + state.storage.length).toBe(pieces.length);
    expect(new Set([...hall.furniture, ...state.storage].map((f) => f.id)).size).toBe(pieces.length);
    expect(hall.furniture.length).toBeGreaterThan(5);
    if (state.storage.length > 0) expect(state.messages.some((m) => m.kind === 'warning' && /in storage/.test(m.text))).toBe(true);
  });

  it('leaves a company anywhere else as it was', () => {
    for (const where of ['coast', 'capital'] as const) {
      // (Loaded as a version-63 save: Coax City's move to the courtyard was step 59, long done.)
      const { state } = load(before(where), 63);
      expect(state.building).toBe('standard');
      expect(state.messages.some((m) => /entrance on the street to the south/.test(m.text))).toBe(false);
    }
    const { state } = load(before('coast'), 63);
    expect(state.rooms.find((r) => r.roomId === 'reception')).toMatchObject({ x: -4, y: 3 });
  });

  it('loads a game saved by this version as it is', () => {
    const { state } = load(valley(), SAVE_VERSION);
    expect(state.building).toBe('valley');
  });

  it('is the building of a new game in Transponder Valley', () => {
    expect(SITES.north.map).toBe('transponder-valley');
    expect(valley().building).toBe('valley');
  });
});
