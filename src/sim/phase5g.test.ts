import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { furnitureTypes, BUILDINGS, FLOOR } from '../config/office';
import { furnitureAsset, CITY } from '../office/assets';
import { OFFICE_BLOCK, PAVEMENT, clearance, streetLevel, streets, townBuildings, trainAt, trainLength } from '../office/city';
import { CAPITAL } from '../office/townLayout';

/** The elevated line of the capital's town (Coaxia): along the south of the map. */
const RAILWAY = CAPITAL.railway;
import { peopleOnFloor, turned } from '../office/layout';
import { placeFurniture, rotateFurniture, setRoomType, type ActionResult } from './actions';
import { rentRoom } from './fixtures';
import { sensibleBot } from './bots';
import { createInitialState } from './newGame';
import { footprint, placementError } from './office';
import { SAVE_VERSION, fromSaveFile } from './save';
import type { GameState } from './state';
import { tick } from './tick';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
const error = (result: ActionResult) => (result.ok ? null : result.error);

/** Room C (4 × 5 tiles) as a radio studio, with money to furnish it. */
const studio = () => ({ ...ok(setRoomType(ok(rentRoom(createInitialState(1), 'C')), 'C', 'radioStudio')), money: 1_000_000 });
const items = (s: GameState) => s.rooms.find((r) => r.roomId === 'C')!.furniture;

describe('turning furniture', () => {
  it('swaps width and depth on a quarter turn', () => {
    expect(footprint('mixingDesk', 0)).toEqual({ w: 2, h: 1 });
    expect(footprint('mixingDesk', 1)).toEqual({ w: 1, h: 2 });
    expect(footprint('mixingDesk', 2)).toEqual({ w: 2, h: 1 });
    expect(footprint('workstation', 3)).toEqual({ w: 2, h: 2 });
  });

  it('places a turned piece where the unturned one would not fit', () => {
    const s = studio();
    // The last column: a 2 × 1 desk sticks out, a 1 × 2 one fits.
    expect(error(placeFurniture(s, 'C', 'mixingDesk', 3, 0))).toMatch(/doesn’t fit/);
    const placed = ok(placeFurniture(s, 'C', 'mixingDesk', 3, 0, 1));
    expect(items(placed)[0]).toMatchObject({ x: 3, y: 0, turn: 1 });
    // It now covers the tile below, and no longer the one beside it.
    expect(placementError(placed, placed.rooms[0]!, 'onAirLight', 3, 1)).toMatch(/already there/);
    expect(placementError(placed, placed.rooms[0]!, 'onAirLight', 2, 0)).toBeNull();
  });

  it('turns a piece where it stands, for free, through all four directions', () => {
    let s = ok(placeFurniture(studio(), 'C', 'mixingDesk', 1, 1));
    const money = s.money;
    const id = items(s)[0]!.id;
    for (const turn of [1, 2, 3, 0]) {
      s = ok(rotateFurniture(s, 'C', id));
      expect(items(s)[0]!.turn).toBe(turn);
    }
    expect(s.money).toBe(money);
    expect(items(s)[0]).toMatchObject({ x: 1, y: 1 });
  });

  it('refuses a turn that would hit a wall or another piece', () => {
    // Standing along the east wall: turned, the desk would need a fifth column.
    const atWall = ok(placeFurniture(studio(), 'C', 'mixingDesk', 3, 0, 1));
    expect(error(rotateFurniture(atWall, 'C', items(atWall)[0]!.id))).toMatch(/no room to turn/);
    // An on-air light right below it is in the way.
    let s = ok(placeFurniture(studio(), 'C', 'mixingDesk', 0, 0));
    s = ok(placeFurniture(s, 'C', 'onAirLight', 0, 1));
    expect(error(rotateFurniture(s, 'C', items(s)[0]!.id))).toMatch(/no room to turn/);
    // A square piece can always turn.
    expect(items(ok(rotateFurniture(s, 'C', items(s)[1]!.id)))[1]!.turn).toBe(1);
    expect(error(rotateFurniture(s, 'C', 'nothing'))).toMatch(/isn’t here/);
  });
});

describe('where people are at turned furniture', () => {
  it('turns points about the middle of the footprint', () => {
    // A 2 × 1 desk: its middle stays the middle, its right end becomes the far end.
    expect(turned('mixingDesk', 1, 1, 0.5)).toEqual([0.5, 1]);
    expect(turned('mixingDesk', 1, 2, 0.5)).toEqual([0.5, 0]);
    expect(turned('mixingDesk', 2, 2, 0.5)).toEqual([0, 0.5]);
    const [x, z] = turned('mixingDesk', 0, 0.3, 0.2);
    expect(x).toBeCloseTo(0.3);
    expect(z).toBeCloseTo(0.2);
  });

  it('keeps every spot of every piece inside its footprint, whichever way it is turned', () => {
    for (const type of furnitureTypes()) {
      for (const turn of [0, 1, 2, 3]) {
        const size = footprint(type, turn);
        for (const spot of furnitureAsset(type).spots ?? []) {
          const [x, z] = turned(type, turn, spot.at[0], spot.at[1]);
          // Someone at a desk or microphone may stand just outside its tiles, never far.
          expect(x, `${type} turn ${turn}`).toBeGreaterThan(-0.5);
          expect(x, `${type} turn ${turn}`).toBeLessThan(size.w + 0.5);
          expect(z, `${type} turn ${turn}`).toBeGreaterThan(-0.5);
          expect(z, `${type} turn ${turn}`).toBeLessThan(size.h + 0.5);
        }
      }
    }
  });

  it('seats staff at a workstation that was turned', () => {
    let s = createInitialState(1);
    for (let day = 0; day < 5; day++) s = tick(sensibleBot(s));
    const office = s.rooms.find((r) => r.type === 'office')!;
    const desk = office.furniture.find((f) => f.type === 'workstation')!;
    const before = peopleOnFloor(s, office.floor).filter((p) => p.activity === 'sit');
    s = ok(rotateFurniture(s, office.roomId, desk.id));
    const after = peopleOnFloor(s, office.floor).filter((p) => p.activity === 'sit');
    expect(after).toHaveLength(before.length);
    // Exactly one person moved, and faces a quarter turn further.
    const moved = after.filter((p) => { const was = before.find((b) => b.id === p.id)!; return was.x !== p.x || was.z !== p.z; });
    expect(moved).toHaveLength(1);
    expect(moved[0]!.turn - before.find((b) => b.id === moved[0]!.id)!.turn).toBe(1);
  });
});

describe('the town around the office', () => {
  const SEEDS = [1, 2, 3, 42, 987654321];

  it('keeps the office’s own block free and fills the rest', () => {
    for (const seed of SEEDS) {
      const town = townBuildings(seed);
      expect(town.length).toBeGreaterThan(50);
      for (const b of town) {
        const onOfficeBlock = b.x > OFFICE_BLOCK.x && b.x < OFFICE_BLOCK.x + OFFICE_BLOCK.w && b.z > OFFICE_BLOCK.z && b.z < OFFICE_BLOCK.z + OFFICE_BLOCK.d;
        expect(onOfficeBlock).toBe(false);
      }
    }
    // The floor sits inside its block with pavement all round.
    expect(OFFICE_BLOCK.x).toBeLessThan(0);
    expect(OFFICE_BLOCK.x + OFFICE_BLOCK.w).toBeGreaterThan(BUILDINGS.standard.w);
    expect(OFFICE_BLOCK.z + OFFICE_BLOCK.d).toBeGreaterThan(FLOOR.h);
  });

  it('puts floor 1 at street level and every floor above it one storey higher', () => {
    expect(streetLevel(1)).toBeLessThan(1);
    expect(streetLevel(2) - streetLevel(1)).toBeCloseTo(CITY.perFloor);
    expect(streetLevel(3) - streetLevel(2)).toBeCloseTo(CITY.perFloor);
  });

  it('never lets a building hide the ground floor (that every building stands on its own pavement is held in sites.test.ts)', () => {
    for (const seed of SEEDS) {
      const town = townBuildings(seed);
      for (const b of town) {
        const w = (b.turn % 2 === 0 ? b.building.w : b.building.d) * CITY.scale;
        const d = (b.turn % 2 === 0 ? b.building.d : b.building.w) * CITY.scale;
        expect(b.building.height * CITY.scale + PAVEMENT, b.building.file).toBeLessThanOrEqual(clearance(b.x, b.z, w, d));
      }
      // Behind the office nothing is in the way, so there is a skyline.
      expect(town.some((b) => b.building.height * CITY.scale > 10)).toBe(true);
    }
    expect(clearance(-10, -10, 3, 3)).toBe(Infinity);
    // Something as tall as it is far away is at the limit; anything taller would hide the front of the office.
    expect(clearance(10, FLOOR.h + 5, 2, 2)).toBe(4);
  });

  it('gives every game its own town, the same each time that game is opened', () => {
    expect(townBuildings(7)).toEqual(townBuildings(7));
    const layout = (seed: number) => townBuildings(seed).map((b) => `${b.building.file}:${b.turn}`).join();
    expect(new Set(SEEDS.map(layout)).size).toBe(SEEDS.length);
    // Consecutive seeds must not give near-copies: most blocks differ.
    const a = townBuildings(1);
    const b = townBuildings(2);
    expect(a.filter((x, i) => x.building.file !== b[i]?.building.file).length).toBeGreaterThan(a.length / 2);
  });
});

describe('the railway', () => {
  it('runs along a street in front of the office, high enough for cars and low enough not to hide the office', () => {
    expect(streets().some((s) => s.along === 'x' && s.at === RAILWAY.z)).toBe(true);
    expect(RAILWAY.z).toBeGreaterThan(FLOOR.h);
    // A car is under a tile high; the deck is well above it.
    expect(CITY.railway.height).toBeGreaterThan(2);
    // The top of a train on the deck (the tallest carriage is 2.3 of the kit's units with its pantograph).
    const top = CITY.railway.height + 2.3 * CITY.railway.scale;
    expect(top).toBeLessThanOrEqual(clearance(BUILDINGS.standard.w / 2, RAILWAY.z, 4, 2.2));
  });

  it('has every train and track file, and runs the yellow double-decker', () => {
    const files = new Set([CITY.railway.track, ...CITY.railway.train]);
    for (const file of files) expect(existsSync(`public/models/${file}`), file).toBe(true);
    expect(CITY.railway.train.every((file) => file.includes('electric-double'))).toBe(true);
    // A front, at least one carriage in between, and a rear.
    expect(CITY.railway.train.length).toBeGreaterThanOrEqual(3);
    expect(CITY.railway.train[0]).not.toBe(CITY.railway.train.at(-1));
  });

  it('sends a train by every now and then, in alternating directions, and nothing in between', () => {
    const cars = 4;
    const { every, speed } = CITY.railway;
    const passing = (RAILWAY.length + trainLength(cars)) / speed;
    // Much of the time there is no train. (The line is the map's whole width, 158 tiles, so a train takes longer to cross it than the 80 of the grid; the stretch in view is a part of that.)
    expect(passing).toBeLessThan(every * 0.6);
    expect(trainAt(0, cars)).toEqual({ x: RAILWAY.from, direction: 1 });
    expect(trainAt(1, cars)).toEqual({ x: RAILWAY.from + speed, direction: 1 });
    expect(trainAt(passing + 1, cars)).toBeNull();
    expect(trainAt(every - 1, cars)).toBeNull();
    // The next one comes from the other end.
    expect(trainAt(every + 1, cars)).toEqual({ x: RAILWAY.from + RAILWAY.length - speed, direction: -1 });
    expect(trainAt(2 * every + 1, cars)?.direction).toBe(1);
  });
});

describe('saves from before Phase 5g', () => {
  it('load with every piece of furniture unturned', () => {
    let s = createInitialState(1);
    for (let day = 0; day < 40; day++) s = tick(sensibleBot(s));
    const old = structuredClone(s) as unknown as Record<string, unknown> & GameState;
    for (const room of old.rooms) for (const item of room.furniture) delete (item as unknown as Record<string, unknown>).turn;
    const { state, version } = fromSaveFile({ version: 12, savedAt: 1, state: old });
    expect(version).toBe(SAVE_VERSION);
    const furniture = state.rooms.flatMap((r) => r.furniture);
    expect(furniture.length).toBeGreaterThan(0);
    expect(furniture.every((f) => f.turn === 0)).toBe(true);
    expect(tick(state).day).toBe(41);
  });
});
