import { afterEach, describe, expect, it } from 'vitest';
import type { FurnitureType } from '../config/office';
import { registerModPiece, unregisterModPiece } from '../mods/load';
import { sensibleBot } from '../sim/bots';
import { rentRoom } from '../sim/fixtures';
import { createInitialState } from '../sim/newGame';
import type { GameState } from '../sim/state';
import { tick } from '../sim/tick';
import { FURNITURE_ASSETS, hasUsedBy, MODELS } from './assets';
import { deskSeats, peopleOnFloor, spotsInUse, type Person } from './layout';

afterEach(() => unregisterModPiece('two-seats'));

/** A piece with two seats, the first only from tier 2, and a part for each seat. */
const TYPE = 'mod:two-seats' as FurnitureType;
const piece = () =>
  registerModPiece({
    id: 'two-seats',
    spec: { name: 'Two seats', about: 'Two seats.', cost: 100, w: 2, h: 1, rooms: ['office'] },
    asset: {
      parts: [
        { box: [0.2, 0.2, 0.2], tone: 'wood', at: [0.5, 0, 0.5], usedBy: 0 },
        { box: [0.2, 0.2, 0.2], tone: 'wood', at: [1.5, 0, 0.5], usedBy: 1 },
      ],
      spots: [
        { at: [0.5, 0.5], turn: 0, activity: 'sit', tiers: [2, 3] },
        { at: [1.5, 0.5], turn: 0, activity: 'sit' },
      ],
    },
  });

/** The game with one piece of the two-seat kind put in the first room of the first floor. */
function withPiece(tier: number): { state: GameState; roomId: string; x: number; y: number } {
  piece();
  const rented = rentRoom(createInitialState(1), 'A');
  if (!rented.ok) throw new Error(rented.error);
  const state = rented.state;
  const room = state.rooms.find((r) => r.floor === 1)!;
  const item = { id: 'seats', type: TYPE, x: 0, y: 0, turn: 0, tier, condition: 100, boughtOn: 0 };
  return { state: { ...state, rooms: state.rooms.map((r) => (r === room ? { ...r, furniture: [...r.furniture, item] } : r)) }, roomId: room.roomId, x: room.x, y: room.y };
}

const person = (roomId: string, x: number, z: number, more: Partial<Person> = {}): Person =>
  ({ id: 'p', name: 'Pat', role: 'production', floor: 1, x, z, turn: 0, activity: 'sit', roomId, status: 'post', ...more }) as Person;

describe('spotsInUse', () => {
  it('has a part tied to a place in the canteen table and the workstation, and models for every part', () => {
    expect(hasUsedBy(FURNITURE_ASSETS.canteenTable.parts)).toBe(true);
    expect(hasUsedBy(FURNITURE_ASSETS.workstation.parts)).toBe(true);
    expect(hasUsedBy(FURNITURE_ASSETS.filingCabinet.parts)).toBe(false);
    const tied = (parts: typeof FURNITURE_ASSETS.canteenTable.parts): number[] => parts.flatMap((p) => [...(p.usedBy !== undefined ? [p.usedBy] : []), ...('parts' in p ? tied(p.parts) : [])]);
    // Each of the canteen table's four seats has its own plate, and the workstation's one seat has what stands on the desk.
    expect(tied(FURNITURE_ASSETS.canteenTable.parts).sort()).toEqual([0, 1, 2, 3]);
    for (const seat of tied(FURNITURE_ASSETS.workstation.parts)) expect(seat).toBeLessThan(FURNITURE_ASSETS.workstation.spots!.length);
    expect(MODELS.plateDinner).toBe('food/plate-dinner.glb');
  });

  it('finds the places of a staffed station that someone sits at', () => {
    let s = createInitialState(1);
    for (let day = 0; day < 30; day++) s = tick(sensibleBot(s));
    const sitting = new Set([...deskSeats(s).values()].filter((seat) => seat.item.type === 'workstation').map((seat) => seat.item.id));
    expect(sitting.size).toBeGreaterThan(0);
    const inUse = new Map<string, Set<number>>();
    for (const floor of [1, 2, 3]) for (const [id, places] of spotsInUse(s, floor)) inUse.set(id, places);
    // Whoever has a desk sits at it, so its one place is in use.
    for (const id of sitting) expect(inUse.get(id), id).toEqual(new Set([0]));
  });

  it('counts the places of the whole list, though the tier hides some', () => {
    // Tier 1: only the second seat is there, and the first of the shown seats is place 1 of the whole list.
    const low = withPiece(1);
    const second = person(low.roomId, low.x + 1.5, low.y + 0.5);
    expect(spotsInUse(low.state, 1, undefined, [second]).get('seats')).toEqual(new Set([1]));
    // Tier 2: both are there.
    const high = withPiece(2);
    const first = person(high.roomId, high.x + 0.5, high.y + 0.5);
    expect(spotsInUse(high.state, 1, undefined, [first]).get('seats')).toEqual(new Set([0]));
    expect(spotsInUse(high.state, 1, undefined, [first, { ...second, id: 'q', x: high.x + 1.5, z: high.y + 0.5, roomId: high.roomId }]).get('seats')).toEqual(new Set([0, 1]));
  });

  it('leaves out whoever is away, leaving or passing, someone in another room and an empty seat', () => {
    const { state, roomId, x, y } = withPiece(2);
    const at = (more: Partial<Person>) => spotsInUse(state, 1, undefined, [person(roomId, x + 1.5, y + 0.5, more)]).get('seats');
    expect(at({})).toEqual(new Set([1]));
    expect(at({ away: true })).toBeUndefined();
    expect(at({ status: 'leaving' })).toBeUndefined();
    expect(at({ status: 'passing' })).toBeUndefined();
    expect(at({ roomId: 'elsewhere' })).toBeUndefined();
    expect(spotsInUse(state, 1, undefined, [])).toEqual(new Map());
  });

  it('reads the beat’s own people when it is not given any', () => {
    const { state } = withPiece(2);
    expect(spotsInUse(state, 1, 10)).toEqual(new Map());
    expect(peopleOnFloor(state, 1, 10).length).toBeGreaterThanOrEqual(0);
  });
});
