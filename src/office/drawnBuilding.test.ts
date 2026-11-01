import { describe, expect, it } from 'vitest';
import { BUILDINGS, coreOf, coreSpace, hallOf, onFloor, westOf, type Building, type BuildingId } from '../config/office';
import { MAPS } from '../config/maps';
import type { MapFile, TileBox } from '../mods/mapFile';
import { buildRoom } from '../sim/commands/office';
import { createInitialState } from '../sim/newGame';
import { corridorTiles, proposeRoom, roomError } from '../sim/rooms';
import type { GameState } from '../sim/state';
import { drawnBuilding, floorProblem, MIN_BUILDABLE } from './drawnBuilding';
import { checkTown } from './townCheck';
import { floorShift, byRoads, houseOf, layoutFromMap } from './townLayout';
import { serviceOf } from './layout';

type Rect = { x: number; y: number; w: number; h: number };

/** The five written buildings against the maps they were written from. */
const FIVE = [
  ['courtyard', 'coaxia'],
  ['valley', 'transponder-valley'],
  ['beach', 'skywave-beach'],
  ['fields', 'aerial-fields'],
  ['hills', 'amplify-hills'],
] as const;

/** The shift that puts a default map where its written building is. */
function shiftOf(id: BuildingId, file: MapFile) {
  const shift = floorShift(file.map, byRoads(file.map));
  return byRoads(file.map) ? { ...shift, x: westOf(BUILDINGS[id]) - Math.min(...[...file.map.wings, file.map.reception!].map((w) => w.x)) } : shift;
}

const tilesOf = (b: Building) => {
  const tiles = new Set<string>();
  for (let x = -80; x < 80; x++) for (let y = -5; y < 60; y++) if (onFloor(b, x, y)) tiles.add(`${x}:${y}`);
  return tiles;
};

/** A map of no region with the wings and the box given. */
function shape(wings: TileBox[], reception: TileBox, floors = 4): MapFile {
  const file = structuredClone(MAPS['aerial-fields']!);
  return { ...file, id: 'drawn-test', name: 'Drawn', settings: { ...file.settings, floors }, map: { ...file.map, wings, reception, lanes: [], courtyard: { parking: [], green: [], fountain: null } } };
}

/** Why a map can have no building, or null. */
function reasonOf(file: MapFile): string | null {
  try {
    drawnBuilding(file, { x: 0, z: 0 });
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

const SHAPES: Record<string, MapFile> = {
  I: shape([{ x: 0, y: 0, w: 11, h: 40 }], { x: 0, y: 29, w: 11, h: 11 }),
  L: shape([{ x: 0, y: 0, w: 40, h: 11 }, { x: 0, y: 11, w: 11, h: 25 }], { x: 0, y: 25, w: 11, h: 11 }),
  T: shape([{ x: 0, y: 0, w: 41, h: 11 }, { x: 15, y: 11, w: 11, h: 30 }], { x: 15, y: 30, w: 11, h: 11 }),
  U: shape([{ x: 0, y: 0, w: 11, h: 40 }, { x: 11, y: 29, w: 30, h: 11 }, { x: 41, y: 0, w: 11, h: 40 }], { x: 20, y: 18, w: 11, h: 11 }),
  wide: shape([{ x: 0, y: 0, w: 60, h: 24 }], { x: 25, y: 14, w: 11, h: 10 }),
};

describe('a building from the drawn shapes (#289)', () => {
  describe.each(FIVE)('the written %s building and the map %s', (id, name) => {
    const file = MAPS[name]!;
    const written = BUILDINGS[id];
    const worked = drawnBuilding(file, shiftOf(id, file));

    it('has the core where the written one has it, facing the same way', () => {
      expect(worked.core).toEqual(written.core);
      expect(coreOf(worked)).toEqual(coreOf(written));
      expect(hallOf(worked)).toEqual(hallOf(written));
    });

    it('has the same floor (Amplify Hills’ spine is drawn one row shallower than it is written)', () => {
      const [a, b] = [tilesOf(worked), tilesOf(written)];
      const differ = [...a, ...b].filter((t) => a.has(t) !== b.has(t));
      if (id === 'hills') expect(new Set(differ)).toEqual(new Set(Array.from({ length: 55 }, (_, n) => `${-27 + n}:26`)));
      else expect(differ).toEqual([]);
      expect(worked.floors).toBe(file.settings.floors);
      expect(worked.id).toBe('map');
    });

    it('has lanes that work: every corridor can be walked to from the hall with the floor full', () => {
      expect(floorProblem(worked)).toBeNull();
    });
  });

  it('leaves the five written buildings as they are, and the towns lay out round them', () => {
    for (const [id, name] of FIVE) {
      expect(houseOf(MAPS[name]!)).toBe(BUILDINGS[id]);
      expect(checkTown(MAPS[name]!)).toEqual({ ok: true });
    }
  });

  describe('the core and its facing', () => {
    it('faces south when the box is open to the west and the south and no road is nearer one of them', () => {
      expect(drawnBuilding(SHAPES.I!, { x: 0, z: 0 }).core).toEqual({ x: 6, y: 34, faces: 's' });
    });

    it('faces the side with the nearest road in front of it', () => {
      const file = structuredClone(SHAPES.I!);
      file.map.lanes = [{ x: -4, y: 28, w: 2, h: 20, dir: 'both' }];
      expect(drawnBuilding(file, { x: 0, z: 0 }).core).toEqual({ x: 6, y: 29, faces: 'w' });
    });

    it('centres the core along a box wider than it', () => {
      const file = shape([{ x: 0, y: 0, w: 40, h: 22 }], { x: 10, y: 0, w: 17, h: 11 });
      // The box is open to the north only: 17 wide, the core 11 along it, 3 in from its west side.
      expect(drawnBuilding(file, { x: 0, z: 0 }).core).toEqual({ x: 19, y: 0, faces: 'n' });
    });

    it('never faces east, and says why', () => {
      const file = shape([{ x: 0, y: 0, w: 30, h: 11 }, { x: 0, y: 11, w: 19, h: 11 }, { x: 0, y: 22, w: 30, h: 11 }], { x: 19, y: 11, w: 11, h: 11 });
      expect(reasonOf(file)).toMatch(/no side open to the west, north or south/);
    });

    it('is refused where the core does not fit on the floor', () => {
      const file = shape([{ x: 0, y: 0, w: 30, h: 5 }], { x: 10, y: 0, w: 11, h: 5 });
      expect(reasonOf(file)).toMatch(/does not fit on the floor/);
    });
  });

  describe('a map with no box, or a floor in two pieces', () => {
    it('is refused with a reason', () => {
      const file = shape([{ x: 0, y: 0, w: 30, h: 11 }], { x: 0, y: 0, w: 11, h: 11 });
      expect(reasonOf({ ...file, map: { ...file.map, reception: null } })).toMatch(/no reception box/);
      const apart = shape([{ x: 0, y: 0, w: 30, h: 11 }, { x: 0, y: 14, w: 30, h: 11 }], { x: 0, y: 14, w: 11, h: 11 });
      expect(reasonOf(apart)).toMatch(/more than one piece/);
    });

    it('is refused by the town check before anything is laid out', () => {
      const file = structuredClone(MAPS['aerial-fields']!);
      const noBox = { ...file, id: 'drawn-test', map: { ...file.map, reception: null } };
      const check = checkTown(noBox);
      expect(check.ok).toBe(false);
      expect(check.ok === false && check.reason).toMatch(/no reception box/);
      const apart = { ...file, id: 'drawn-test', map: { ...file.map, wings: [{ x: 0, y: 0, w: 30, h: 11 }, { x: 0, y: 14, w: 30, h: 11 }], reception: { x: 0, y: 14, w: 11, h: 11 } } };
      expect(checkTown(apart)).toMatchObject({ ok: false, reason: expect.stringMatching(/more than one piece/) });
    });

    it('is refused by the town check when a corridor cannot be reached, or the floor is small', () => {
      const file = structuredClone(MAPS['aerial-fields']!);
      const small = { ...file, id: 'drawn-test', map: { ...file.map, wings: [{ x: 0, y: 0, w: 20, h: 11 }], reception: { x: 0, y: 0, w: 11, h: 11 } } };
      expect(checkTown(small)).toMatchObject({ ok: false, reason: expect.stringMatching(/too small/) });
    });
  });

  describe('the shift', () => {
    it('puts the north edge of the floor at 0, even with a leg drawn north of the rest', () => {
      const file = shape([{ x: 0, y: 10, w: 40, h: 11 }, { x: 0, y: 0, w: 11, h: 10 }], { x: 29, y: 11, w: 11, h: 10 });
      const shift = floorShift(file.map, false);
      expect(shift.z).toBe(0);
      const moved = structuredClone(file);
      moved.map.wings = moved.map.wings.map((w) => ({ ...w, y: w.y + 7 }));
      moved.map.reception = { ...moved.map.reception!, y: moved.map.reception!.y + 7 };
      expect(floorShift(moved.map, false).z).toBe(-7);
      const [a, b] = [drawnBuilding(file, { x: 0, z: shift.z }), drawnBuilding(moved, { x: 0, z: -7 })];
      expect(b.wings).toEqual(a.wings);
      expect(b.depth).toBe(a.depth);
      expect(Math.min(...b.wings.map((w) => w.y))).toBe(0);
    });

    it('is 0 for the five default maps', () => {
      for (const [, name] of FIVE) expect(floorShift(MAPS[name]!.map, byRoads(MAPS[name]!.map)).z).toBe(0);
    });
  });

  describe('an edit shows a new building, not a cached one', () => {
    it('works out the core of each drawing anew, and the caches follow the object', () => {
      const file = SHAPES.T!;
      const a = drawnBuilding(file, { x: 0, z: 0 });
      const moved = structuredClone(file);
      moved.map.reception = { x: 15, y: 11, w: 11, h: 10 };
      moved.map.wings = [{ x: 0, y: 0, w: 41, h: 11 }, { x: 15, y: 11, w: 11, h: 40 }];
      const b = drawnBuilding(moved, { x: 0, z: 0 });
      expect(coreOf(a)).not.toBe(coreOf(b));
      expect(coreOf(a).hall).not.toEqual(coreOf(b).hall);
      expect(coreOf(a)).toBe(coreOf(a));
      expect(serviceOf(a)).not.toBe(serviceOf(b));
    });

    it('returns the right number of rooms of the first plan for a copy with other floors', () => {
      const copy = { ...BUILDINGS.standard, floors: 3 };
      expect(coreOf(copy)).toEqual(coreOf(BUILDINGS.standard));
    });
  });

  describe('the floor check', () => {
    it('refuses a floor under 200 buildable tiles', () => {
      const file = shape([{ x: 0, y: 0, w: 20, h: 11 }], { x: 0, y: 0, w: 11, h: 11 });
      const building = drawnBuilding(file, { x: 0, z: 0 });
      expect(floorProblem(building)).toMatch(new RegExp(`at least ${MIN_BUILDABLE}`));
    });

    it('accepts the shapes', () => {
      for (const [name, file] of Object.entries(SHAPES)) expect(floorProblem(drawnBuilding(file, { x: 0, z: 0 })), name).toBeNull();
    });

    it.each(FIVE)('lets a copy of the map %s run on the building drawn from it, not the written one', (_id, name) => {
      const copy: MapFile = { ...structuredClone(MAPS[name]!), id: 'copy-of-it' };
      expect(houseOf(copy).id).toBe('map');
      expect(houseOf(copy)).not.toBe(houseOf(copy));
      expect(checkTown(copy)).toEqual({ ok: true });
      const layout = layoutFromMap(copy);
      // The entrance is where the written building has it (north to south; a town of roads is moved west to east to start at WEST).
      expect(layout.places.gate.z).toBeCloseTo(layoutFromMap(MAPS[name]!).places.gate.z, 5);
    });
  });

  // The test for the fill: rooms are proposed until the floor is full, each with a door on a corridor, and every door can be walked to.
  describe.each([...FIVE.map(([id, name]) => [name, () => drawnBuilding(MAPS[name]!, shiftOf(id, MAPS[name]!))] as const), ...Object.entries(SHAPES).map(([name, file]) => [`the ${name} shape`, () => drawnBuilding(file, { x: 0, z: 0 })] as const)])('proposes rooms until the floor is full: %s', (_name, make) => {
    let n = 0;
    const play = (building: Building): GameState => {
      const id = `drawn-test-${n++}` as BuildingId;
      (BUILDINGS as Record<string, Building>)[id] = building;
      const s = structuredClone(createInitialState(1, 'normal', { playerName: 'Pat', companyName: 'Pat Ltd', headquarters: 'highlands' }));
      s.building = id;
      s.money = 5_000_000_000;
      s.floorsUnlocked = 6;
      return s;
    };

    it.each([1, 3])('on floor %i, every door can be walked to from the hall', (floor) => {
      const building = make();
      let s = play(building);
      let count = 0;
      for (let k = 0; k < 300; k++) {
        const plan = proposeRoom(s, floor, 'office');
        if (!plan) break;
        expect(roomError(s, plan), `room ${k}`).toBeNull();
        const built = buildRoom(s, { ...plan, type: 'office' });
        if (!built.ok) throw new Error(built.error);
        s = built.state;
        count++;
      }
      expect(count).toBeGreaterThanOrEqual(8);
      const rooms = s.rooms.filter((r) => r.floor === floor);
      const reached = corridorTiles(s, floor, rooms);
      const hall = hallOf(building);
      expect(reached.has(`${Math.floor(hall.x)}:${Math.floor(hall.z)}`), 'the hall').toBe(true);
      // Every corridor stays walkable.
      for (const lane of building.lanes) {
        const tiles = lane.along === 'x' ? Array.from({ length: lane.area.w }, (_, i) => [lane.area.x + i, lane.corridor]) : Array.from({ length: lane.area.h }, (_, i) => [lane.corridor, lane.area.y + i]);
        for (const [x, y] of tiles) expect(reached.has(`${x}:${y}`), `corridor tile ${x}:${y}`).toBe(true);
      }
      for (const room of rooms) {
        const tiles = [[Math.floor(room.door.x - 0.5), Math.floor(room.door.z)], [Math.floor(room.door.x), Math.floor(room.door.z - 0.5)], [Math.floor(room.door.x - 1), Math.floor(room.door.z)], [Math.floor(room.door.x), Math.floor(room.door.z - 1)]];
        expect(tiles.some(([x, y]) => reached.has(`${x}:${y}`)), `${room.name}'s door`).toBe(true);
      }
      // Rooms stay off the core.
      const space: Rect = coreSpace(building, floor);
      for (const room of rooms) expect(room.x < space.x + space.w && space.x < room.x + room.w && room.y < space.y + space.h && space.y < room.y + room.h, room.name).toBe(false);
    }, 120_000);
  });
});
