import { describe, expect, it } from 'vitest';
import { COMFORT, MORALE } from '../config/balance';
import type { FurnitureType, RoomType } from '../config/office';
import { setRoomType, type ActionResult } from './actions';
import { addMissingEquipment, autoPlaceFurniture, rentRoom } from './fixtures';
import { sensibleBot } from './bots';
import { createInitialState } from './newGame';
import { employeesWithDesk } from './office';
import type { GameState } from './state';
import { tick } from './tick';
import { canteenComfort, canteenCoverage, comfort, hasToilets, moraleTarget } from './upkeep';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
const rich = (s: GameState): GameState => ({ ...s, money: 5_000_000 });
const rent = (s: GameState, id: string, type: RoomType) => ok(setRoomType(ok(rentRoom(s, id)), id, type));
const place = (s: GameState, id: string, ...types: FurnitureType[]) => types.reduce((next, type) => ok(autoPlaceFurniture(next, id, type)), s);

/** The sensible bot's station after a month, with money to spend and without its canteen, so morale has room to move. */
function station(): GameState {
  let s = createInitialState(1);
  for (let day = 0; day < 30; day++) s = tick(sensibleBot(s));
  return rich({ ...s, rooms: s.rooms.filter((r) => r.type !== 'canteen') });
}

describe('comfort', () => {
  it('comfort pieces lift the morale of those who work in the room, up to four of them', () => {
    const s = station();
    const worker = s.employees.find((e) => e.role === 'production')!;
    const desked = employeesWithDesk(s);
    const office = desked.get(worker.id)!.roomId;
    const before = moraleTarget(s, worker, desked);
    const one = place(s, office, 'planter');
    expect(moraleTarget(one, worker, employeesWithDesk(one))).toBe(before + COMFORT.perPiece);
    let many = s;
    for (let i = 0; i < 6; i++) many = place(many, office, 'planter');
    expect(comfort(many, worker, employeesWithDesk(many))).toBe(COMFORT.maxPieces * COMFORT.perPiece);
    // Someone who works elsewhere gets nothing from it.
    const host = s.employees.find((e) => e.role === 'host')!;
    expect(comfort(many, host, employeesWithDesk(many))).toBe(0);
  });

  it('a couch, a TV and a radio in the canteen count for everyone it has a seat for', () => {
    // One table: a seat for some, not for all.
    let s = ok(addMissingEquipment(rent(station(), 'G', 'canteen'), 'G'));
    const share = canteenCoverage(s);
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThan(1);
    expect(canteenComfort(s)).toBe(0);
    s = place(s, 'G', 'couch', 'tvScreen', 'radio');
    expect(canteenComfort(s)).toBeCloseTo(3 * COMFORT.perPiece * share);
    const worker = s.employees.find((e) => e.role === 'production')!;
    expect(moraleTarget(s, worker, employeesWithDesk(s))).toBeCloseTo(MORALE.neutral + (MORALE.canteenBonus + 3 * COMFORT.perPiece) * share);
    // With a seat for everyone, the canteen and its comfort count in full; since 0.15.0 that is no longer 100 by itself.
    const few = { ...s, employees: [worker, ...s.employees.filter((e) => e !== worker).slice(0, 5)] };
    expect(canteenCoverage(few)).toBe(1);
    expect(moraleTarget(few, worker, employeesWithDesk(few))).toBeCloseTo(MORALE.neutral + MORALE.canteenBonus + 3 * COMFORT.perPiece + comfort(few, worker, employeesWithDesk(few)));
    expect(moraleTarget(few, worker, employeesWithDesk(few))).toBeLessThan(100);
  });

  it('toilets with two toilets and two sinks lift morale on their floor', () => {
    // In G: the test player's own office stands where D is (0.16.0).
    let s = rent(station(), 'G', 'toilets');
    const worker = s.employees.find((e) => e.role === 'production')!;
    const before = moraleTarget(s, worker, employeesWithDesk(s));
    s = place(s, 'G', 'toilet', 'toilet', 'sink');
    expect(hasToilets(s, 1)).toBe(false);
    s = place(s, 'G', 'sink');
    expect(hasToilets(s, 1)).toBe(true);
    expect(hasToilets(s, 2)).toBe(false);
    expect(moraleTarget(s, worker, employeesWithDesk(s))).toBe(before + COMFORT.toilets);
  });
});
