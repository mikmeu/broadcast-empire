import { describe, expect, it } from 'vitest';
import { BUILDINGS, FLOOR, FURNITURE, WEST, getPlot, widthOf } from '../config/office';
import { placeFurniture, setRoomType, type ActionResult } from '../sim/actions';
import { autoPlaceFurniture, rentRoom } from '../sim/fixtures';
import { sensibleBot } from '../sim/bots';
import { createInitialState } from '../sim/newGame';
import { footprint } from '../sim/office';
import type { GameState, RentedRoom } from '../sim/state';
import { tick } from '../sim/tick';
import { CORRIDOR_Z, DAY_BEATS, SERVICE, beatAt, liftQueue, peopleOnFloor } from './layout';
import { ROUTES, floorGrid, isOpen, walkPath, wallsOn } from './routes';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

const rich = (s: GameState): GameState => ({ ...s, money: 5_000_000, floorsUnlocked: 3 });
const rent = (s: GameState, id: string, type: Parameters<typeof setRoomType>[2]) => ok(setRoomType(ok(rentRoom(s, id)), id, type));

/** The sensible bot's station after six weeks, in the standard building (the capital's courtyard building is walked in version020-courtyard.test.ts). */
function station(): GameState {
  let s: GameState = { ...createInitialState(1), building: 'standard' };
  for (let day = 0; day < 40; day++) s = tick(sensibleBot(s));
  return rich(s);
}

type Point = { x: number; z: number };
type Leg = [Point, Point];
const legsOf = (from: Point, path: [number, number][]): Leg[] => path.map(([x, z], i) => [i === 0 ? from : { x: path[i - 1]![0], z: path[i - 1]![1] }, { x, z }]);
const lengthOf = (legs: Leg[]) => legs.reduce((sum, [a, b]) => sum + Math.hypot(b.x - a.x, b.z - a.z), 0);

/** Whether a straight stretch goes through a wall. */
function throughWall(state: GameState, floor: number, [a, b]: Leg): boolean {
  return wallsOn(state, floor).some(([x1, z1, x2, z2]) => {
    if (x1 === x2) {
      if ((a.x - x1) * (b.x - x1) >= 0) return false;
      const z = a.z + ((b.z - a.z) * (x1 - a.x)) / (b.x - a.x);
      return z >= z1 && z <= z2;
    }
    if ((a.z - z1) * (b.z - z1) >= 0) return false;
    const x = a.x + ((b.x - a.x) * (z1 - a.z)) / (b.z - a.z);
    return x >= x1 && x <= x2;
  });
}

/** How far a straight stretch goes through the inside of a rectangle, sampled. */
function inside(rect: { x: number; z: number; w: number; h: number }, [a, b]: Leg): number {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.05);
  let hits = 0;
  for (let k = 0; k <= steps; k++) {
    const x = a.x + ((b.x - a.x) * k) / Math.max(1, steps);
    const z = a.z + ((b.z - a.z) * k) / Math.max(1, steps);
    if (x > rect.x + 0.05 && x < rect.x + rect.w - 0.05 && z > rect.z + 0.05 && z < rect.z + rect.h - 0.05) hits++;
  }
  return hits * 0.05;
}

const piecesIn = (room: RentedRoom) => room.furniture.map((f) => ({ x: room.x + f.x, z: room.y + f.y, ...footprint(f.type, f.turn) }));

describe('finding the way (Phase 13b)', () => {
  it('never walks through a wall, wherever anyone goes from the entrance, the lifts or another person', () => {
    const s = station();
    for (const floor of [1, 2, 3]) {
      const places: Point[] = [SERVICE.entrance.at, SERVICE.lifts.at, SERVICE.stairs.at, SERVICE.technician.at, SERVICE.cleaners.at];
      for (let k = 0; k < DAY_BEATS; k += 4) for (const p of peopleOnFloor(s, floor, beatAt(s.day) + k)) places.push({ x: p.x, z: p.z });
      const seen = new Set<string>();
      const spots = places.filter((p) => !seen.has(`${p.x}:${p.z}`) && seen.add(`${p.x}:${p.z}`));
      if (floor === 1) expect(spots.length).toBeGreaterThan(15);
      for (const from of spots) {
        for (const to of spots) {
          const path = walkPath(s, floor, from, to);
          // It always arrives, exactly where it should.
          expect(path.at(-1)).toEqual([to.x, to.z]);
          for (const leg of legsOf(from, path)) expect(throughWall(s, floor, leg), `${JSON.stringify(leg)} on floor ${floor}`).toBe(false);
        }
      }
    }
  });

  it('goes out through one door, down the middle of the corridor and in through the other', () => {
    // Two rows of rooms with a corridor between them, as the bots build them.
    const s = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].reduce((game, id) => ok(rentRoom(game, id)), createInitialState(1));
    const a = getPlot('A');
    const g = getPlot('G');
    const from = { x: a.x + 1.5, z: a.y + 1.5 };
    const to = { x: g.x + 4.5, z: g.y + 3.5 };
    const path = walkPath(s, 1, from, to);
    const legs = legsOf(from, path);
    // Every stretch that crosses the line of a corridor wall does so in a doorway, near its middle.
    const crossing = (z: number) => legs.filter(([p, q]) => (p.z - z) * (q.z - z) <= 0 && p.z !== q.z).map(([p, q]) => p.x + ((q.x - p.x) * (z - p.z)) / (q.z - p.z));
    expect(crossing(a.door.z)).toHaveLength(1);
    expect(Math.abs(crossing(a.door.z)[0]! - a.door.x)).toBeLessThan(0.2);
    expect(crossing(g.door.z)).toHaveLength(1);
    expect(Math.abs(crossing(g.door.z)[0]! - g.door.x)).toBeLessThan(0.2);
    // In the corridor there is one line to walk: its middle.
    const along = legs.filter(([p, q]) => p.z === CORRIDOR_Z && q.z === CORRIDOR_Z);
    expect(lengthOf(along)).toBeGreaterThan(g.door.x - a.door.x - 1);
    // And it is no detour: not much longer than the shortest way through both doors.
    const shortest = Math.hypot(a.door.x - from.x, a.door.z - from.z) + Math.hypot(g.door.x - a.door.x, g.door.z - a.door.z) + Math.hypot(to.x - g.door.x, to.z - g.door.z);
    expect(lengthOf(legs)).toBeLessThan(shortest * 1.08);
    expect(lengthOf(legs)).toBeGreaterThanOrEqual(shortest - 1e-6);
  });

  it('walks straight across open floor, and in a few stretches rather than point by point', () => {
    const s = createInitialState(1);
    expect(walkPath(s, 1, { x: 1, z: 1 }, { x: 4.5, z: 3.5 })).toEqual([[4.5, 3.5]]);
    // Standing still is no journey.
    expect(walkPath(s, 1, { x: 2, z: 2 }, { x: 2, z: 2 })).toEqual([[2, 2]]);
    // From the entrance to the far end of the corridor: onto its middle line and along it.
    const far = { x: BUILDINGS.standard.w - 1, z: CORRIDOR_Z };
    const path = walkPath(s, 1, SERVICE.entrance.at, far);
    expect(path.length).toBeLessThanOrEqual(3);
    expect(path.at(-1)).toEqual([far.x, far.z]);
    // The way up the stairs and into the lifts is open from the hall.
    expect(walkPath(s, 2, SERVICE.lifts.at, SERVICE.stairs.at).length).toBeLessThanOrEqual(4);
  });

  it('walks around furniture that stands in the way', () => {
    let s = rent(rich(createInitialState(1)), 'E', 'canteen');
    // A table in the middle of the room, between the door and the far corner.
    s = ok(placeFurniture(s, 'E', 'canteenTable', 3, 1));
    const room = s.rooms[0]!;
    const table = piecesIn(room)[0]!;
    const from = { x: room.door.x, z: CORRIDOR_Z };
    const to = { x: room.x + 4, z: room.y + 4.5 };
    const path = walkPath(s, 1, from, to);
    const legs = legsOf(from, path);
    expect(legs.reduce((sum, leg) => sum + inside(table, leg), 0)).toBe(0);
    // It bends around the table instead of going through it, and loses little by it.
    expect(path.length).toBeGreaterThan(2);
    expect(lengthOf(legs)).toBeLessThan(Math.hypot(to.x - from.x, to.z - from.z) + 2);
    // Without the table the same walk is straight in from the door.
    const empty = { ...s, rooms: s.rooms.map((r) => ({ ...r, furniture: [] })) };
    expect(lengthOf(legsOf(from, walkPath(empty, 1, from, to)))).toBeLessThan(lengthOf(legs));
  });

  it('still gets there when furniture leaves no way around: through as little of it as it can', () => {
    let s = rent(rich(createInitialState(1)), 'D', 'office');
    // Room D is four tiles wide: two workstations side by side close it off from wall to wall, right inside the door.
    // Nobody can place them there any more, but a game from before that rule can have them so.
    s = ok(placeFurniture(s, 'D', 'workstation', 0, 0));
    s = ok(placeFurniture(s, 'D', 'workstation', 2, 0));
    for (const piece of s.rooms[0]!.furniture) piece.y = 3;
    const room = s.rooms[0]!;
    const from = { x: room.door.x, z: CORRIDOR_Z };
    const to = { x: room.x + 0.5, z: room.y + 1.5 };
    const path = walkPath(s, 1, from, to);
    const legs = legsOf(from, path);
    expect(path.at(-1)).toEqual([to.x, to.z]);
    for (const leg of legs) expect(throughWall(s, 1, leg)).toBe(false);
    const through = piecesIn(room).reduce((sum, piece) => sum + legs.reduce((n, leg) => n + inside(piece, leg), 0), 0);
    // Straight across the row of desks, which is two tiles deep, and no further through them than that.
    expect(through).toBeLessThanOrEqual(FURNITURE.workstation.h + 0.3);
  });

  it('brings everyone to their own seat past the furniture of others', () => {
    const s = station();
    const seated = peopleOnFloor(s, 1).filter((p) => p.activity === 'sit' && p.roomId);
    expect(seated.length).toBeGreaterThan(3);
    for (const person of seated) {
      const room = s.rooms.find((r) => r.roomId === person.roomId)!;
      const path = walkPath(s, 1, SERVICE.entrance.at, person);
      const legs = legsOf(SERVICE.entrance.at, path);
      expect(path.at(-1)).toEqual([person.x, person.z]);
      // The last steps are into their own room, through its door.
      const inRoom = legs.filter(([, b]) => b.x > room.x && b.x < room.x + room.w && b.z > room.y && b.z < room.y + room.h);
      expect(inRoom.length).toBeGreaterThan(0);
      for (const leg of legs) expect(throughWall(s, 1, leg)).toBe(false);
    }
  });

  it('keeps the grid of a floor while the days go by, and makes a new one when something is built', () => {
    let s = station();
    const grid = floorGrid(s, 1);
    expect(grid.cols).toBe(widthOf(BUILDINGS.standard) / ROUTES.step + 1);
    expect(grid.rows).toBe(FLOOR.h / ROUTES.step + 1);
    for (let day = 0; day < 3; day++) s = tick(s);
    expect(floorGrid(s, 1)).toBe(grid);
    // Another floor is another grid: the same walls up there, none of the furniture.
    expect(floorGrid(s, 2)).not.toBe(grid);
    expect(floorGrid(s, 2).cluttered.some(Boolean)).toBe(false);
    expect(grid.cluttered.some(Boolean)).toBe(true);
    const canteen = s.rooms.find((r) => r.type === 'canteen')!;
    const more = ok(autoPlaceFurniture(s, canteen.roomId, 'planter'));
    expect(floorGrid(more, 1)).not.toBe(grid);
    // The middle of a doorway can be stood on; the wall beside it can't.
    const door = s.rooms.find((r) => r.type === 'radioStudio')!.door;
    const at = (x: number, z: number) => Math.round(z / ROUTES.step) * grid.cols + Math.round((x - WEST) / ROUTES.step);
    expect(grid.closed[at(door.x, door.z)]).toBe(0);
    expect(grid.closed[at(door.x - 0.5, door.z)]).toBe(1);
    expect(grid.closed[at(door.x, CORRIDOR_Z)]).toBe(0);
    // Across the hall is the talk studio: its own doorway is open there, the wall beside it is not.
    expect(grid.closed[at(door.x + 1, CORRIDOR_Z + ROUTES.step)]).toBe(1);
  });

  it('has the line for the lifts on open floor on every floor: no place is in a wall, and the way into the lift from each is clear (0.20.0)', () => {
    const s = station();
    const places = [...liftQueue(Array.from({ length: 20 }, (_, i) => `p${String(i).padStart(2, '0')}`)).values()];
    for (const floor of [1, 2, 3]) {
      const grid = floorGrid(s, floor);
      for (const place of places) {
        const [i, j] = [Math.round((place.x - WEST) / ROUTES.step), Math.round(place.z / ROUTES.step)];
        expect(grid.closed[j * grid.cols + i], `${place.x}, ${place.z} on floor ${floor}`).toBe(0);
        // Straight in through the door of the lift, and in from the entrance or the corridor.
        for (const leg of [[place, SERVICE.lifts.at], [SERVICE.entrance.at, place]] as Leg[]) {
          if (floor === 1 || leg[0] === place) expect(throughWall(s, floor, leg), `${JSON.stringify(leg)} on floor ${floor}`).toBe(false);
        }
        // Not a room's inside either: it is in the hall in front of the lifts.
        expect(place.z).toBeLessThan(SERVICE.lifts.door.z);
        expect(place.z).toBeGreaterThan(FLOOR.corridorY - 1);
      }
    }
  });

  it('lets people step aside only on open floor: not beside a doorway or a wall (0.20.0)', () => {
    const s = station();
    const grid = floorGrid(s, 1);
    // The middle of a doorway is open but there is no room beside it.
    const room = s.rooms.find((r) => r.floor === 1)!;
    expect(isOpen(grid, room.door.x, CORRIDOR_Z)).toBe(true);
    expect(isOpen(grid, room.door.x + 0.5, room.door.z)).toBe(false);
    // Outside the building is no floor.
    expect(isOpen(grid, WEST - 2, CORRIDOR_Z)).toBe(false);
  });

  it('finds a whole office its way in well within a frame or two', () => {
    const s = station();
    const people = [1, 2, 3].flatMap((floor) => peopleOnFloor(s, floor));
    floorGrid(s, 1);
    const started = performance.now();
    for (let round = 0; round < 5; round++) for (const person of people) walkPath(s, person.floor, SERVICE.entrance.at, person);
    const each = (performance.now() - started) / (5 * people.length);
    // Generous: a slow machine under load should still pass. It is about a third of a millisecond here.
    expect(each).toBeLessThan(10);
  });
});
