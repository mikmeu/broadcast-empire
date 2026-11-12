import { describe, expect, it } from 'vitest';
import { MORALE, COOKS, POST, SUPPORT } from '../config/balance';
import { setRoomType, type ActionResult, buildRoom, hire } from './actions';
import { autoPlaceFurniture, rentRoom, addMissingEquipment, withoutRecordRooms } from './fixtures';
import { sensibleBot } from './bots';
import { createInitialState } from './newGame';
import type { GameState, Person } from './state';
import { tick, advance } from './tick';
import { canteenCoverage, canteenStatus, hotMealCoverage, moraleTarget, postCoverage, sharedMorale } from './upkeep';
import { STUDIO_REQUIREMENTS, type FurnitureType, type RoomType } from '../config/office';
import { peopleAt } from '../office/layout';
import { employeesWithDesk } from './office';
import { proposeRoom } from './rooms';
import { unlockAll } from './unlocks';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** The sensible bot's station after a month, with money to spend. */
function station(): GameState {
  let s = createInitialState(1);
  for (let day = 0; day < 30; day++) s = tick(sensibleBot(s));
  return { ...s, money: 5_000_000 };
}

describe('playtest fixes (Phase 12a)', () => {
  it('says what stands between the staff and their canteen, instead of asking for one that is there', () => {
    const base = station();
    const bare = { ...base, rooms: base.rooms.filter((r) => r.type !== 'canteen') };
    expect(canteenStatus(bare)).toEqual({ kind: 'none' });

    // A canteen that lacks a piece serves nobody, and says which piece.
    let s = ok(setRoomType(ok(rentRoom(bare, 'G')), 'G', 'canteen'));
    expect(canteenStatus(s)).toMatchObject({ kind: 'incomplete', roomId: 'G' });
    for (const type of ['canteenTable', 'coffeeMachine', 'fridge'] as const) s = ok(autoPlaceFurniture(s, 'G', type));
    expect(canteenStatus(s)).toEqual({ kind: 'incomplete', roomId: 'G', missing: [['counter', 1]] });
    expect(canteenCoverage(s)).toBe(0);

    s = ok(autoPlaceFurniture(s, 'G', 'counter'));
    const open = canteenStatus(s);
    expect(open.kind).toBe('open');
    expect(open).toEqual({ kind: 'open', coverage: canteenCoverage(s) });
    expect(canteenCoverage(s)).toBeGreaterThan(0);

    // One that nobody cleans ends up serving nobody too.
    const filthy = { ...s, rooms: s.rooms.map((r) => (r.roomId === 'G' ? { ...r, cleanliness: 0 } : r)) };
    expect(canteenStatus(filthy)).toEqual({ kind: 'filthy', roomId: 'G' });
    // A second canteen that is in order counts.
    expect(canteenStatus({ ...filthy, rooms: [...filthy.rooms, ...base.rooms.filter((r) => r.type === 'canteen')] }).kind).toBe('open');
  });

  it('raises morale within weeks once the canteen is complete', () => {
    const base = station();
    // (Without the library and the post room too, as `rentRoom` clears them from where room G stands: in the courtyard building they do not stand there, and morale lags a little with them.)
    let s: GameState = { ...base, rooms: base.rooms.filter((r) => r.type !== 'canteen' && r.type !== 'library' && r.type !== 'postRoom'), employees: base.employees.map((e) => ({ ...e, morale: 60 })) };
    const average = (state: GameState) => state.employees.reduce((sum, e) => sum + e.morale, 0) / state.employees.length;
    s = ok(setRoomType(ok(rentRoom(s, 'G')), 'G', 'canteen'));
    for (const type of ['canteenTable', 'coffeeMachine', 'fridge', 'counter', 'counter'] as const) s = ok(autoPlaceFurniture(s, 'G', type));
    for (let day = 0; day < 21; day++) s = tick(s);
    // Most of the way to what the canteen gives within three weeks (since 0.15.0 the canteen alone gives less).
    expect(average(s)).toBeGreaterThan(60 + 0.6 * MORALE.canteenBonus * canteenCoverage(s));
  });
});

// From version015.
{
function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}

/** A radio station from the sensible test player, a month on the air, with everything open, money to spare and two floors; without the cooks it may have hired. */
const station = (): GameState => {
  // Without the library and post room the bot keeps its records in (0.18.0): the tests below build rooms where the game proposes them.
  const s = structuredClone(withoutRecordRooms(unlockAll(advance(sensibleBot(createInitialState(1)), 30))));
  s.money = 5_000_000;
  s.floorsUnlocked = 2;
  s.employees = s.employees.filter((e) => e.role !== 'cook');
  for (const room of s.rooms) room.furniture = room.furniture.filter((f) => f.type !== 'stove');
  return s;
};

/** Hires a made-up person straight from the pool. */
function hirePerson(state: GameState, person: Partial<Person> & Pick<Person, 'role'>): GameState & { lastId?: string } {
  const s = structuredClone(state);
  const id = `p-${s.nextId++}`;
  s.candidates.push({ id, name: `Test ${person.role} ${id}`, skill: 50, salary: 2_000, specialties: [], fame: 0, department: null, ...person });
  return Object.assign(ok(hire(s, id)), { lastId: id });
}

/** Builds a room of a kind where the game proposes it, with everything on its checklist and more pieces. Its id is `lastId`. */
function room(state: GameState, type: RoomType, ...extra: FurnitureType[]): GameState & { lastId?: string } {
  const floor = [1, 2].find((f) => proposeRoom(state, f, type))!;
  let s = ok(buildRoom(state, { ...proposeRoom(state, floor, type)!, type }));
  const id = s.lastId!;
  if (STUDIO_REQUIREMENTS[type]) s = ok(addMissingEquipment(s, id));
  for (const piece of extra) s = ok(autoPlaceFurniture(s, id, piece));
  return Object.assign(s, { lastId: id });
}

/** The station with a canteen that seats everyone. */
function fed(state: GameState): GameState {
  let s = state.rooms.some((r) => r.type === 'canteen') ? state : room(state, 'canteen');
  const canteen = s.rooms.find((r) => r.type === 'canteen')!.roomId;
  while (canteenCoverage(s) < 1) s = ok(autoPlaceFurniture(s, canteen, 'canteenTable'));
  return s;
}

describe('version 0.15.0', () => {
  describe('morale (R48, R105)', () => {
    it('a canteen alone lifts morale by less than before', () => {
      const s = fed(station());
      expect(MORALE.canteenBonus).toBe(20);
      expect(sharedMorale(s, employeesWithDesk(s))).toEqual({ canteen: MORALE.canteenBonus, meals: 0, post: 0 });
    });

    it('a cook at a stove in the canteen cooks hot meals for everyone the canteen seats', () => {
      let s = hirePerson(fed(station()), { role: 'cook', skill: 50 });
      const cook = s.lastId!;
      // Without a stove the cook does nothing.
      expect(employeesWithDesk(s).has(cook)).toBe(false);
      expect(hotMealCoverage(s, employeesWithDesk(s))).toBe(0);
      s = ok(autoPlaceFurniture(s, s.rooms.find((r) => r.type === 'canteen')!.roomId, 'stove'));
      const desked = employeesWithDesk(s);
      expect(desked.get(cook)).toMatchObject({ roomId: s.rooms.find((r) => r.type === 'canteen')!.roomId });
      // A cook of skill 50 cooks COOKS.mealsEach meals, times how clean and happy they are.
      const meals = Math.min(1, (COOKS.mealsEach * (SUPPORT.skillBase + 0.5)) / s.employees.length);
      expect(hotMealCoverage(s, desked)).toBeCloseTo(Math.min(canteenCoverage(s), meals), 1);
      expect(sharedMorale(s, desked).meals).toBeGreaterThan(0);
      const worker = s.employees.find((e) => e.role === 'production')!;
      expect(moraleTarget(s, worker, desked)).toBeGreaterThan(moraleTarget({ ...s, employees: s.employees.filter((e) => e.id !== cook) }, worker, desked) - 1e-9);
      // In the office the cook stands at the stove.
      expect(peopleAt(s).get(cook)).toMatchObject({ activity: 'work', status: 'post' });
    });

    it('a stove in a canteen that lacks something is no workplace', () => {
      const built = room(station(), 'canteen', 'stove');
      const s = hirePerson(built, { role: 'cook' });
      expect(employeesWithDesk(s).has(s.lastId!)).toBe(true);
      const kitchen = s.rooms.find((r) => r.roomId === built.lastId)!;
      kitchen.furniture = kitchen.furniture.filter((f) => f.type !== 'fridge');
      expect(employeesWithDesk(s).has(s.lastId!)).toBe(false);
    });

    it('a clerk in a post room sorts the post: more morale, and hosts become famous faster', () => {
      const base = fed(station());
      let s = hirePerson(room(base, 'postRoom'), { role: 'clerk', skill: 50 });
      const desked = employeesWithDesk(s);
      expect(desked.has(s.lastId!)).toBe(true);
      expect(postCoverage(s, desked)).toBeCloseTo(Math.min(1, (POST.staffEach * (SUPPORT.skillBase + 0.5)) / s.employees.length), 1);
      expect(sharedMorale(s, desked).post).toBeCloseTo(POST.morale * postCoverage(s, desked));
      // The same hosts, a day later, with and without fan mail.
      const without = hirePerson(base, { role: 'clerk', skill: 50 });
      const fame = (x: GameState) => tick(x).employees.filter((e) => e.role === 'host').reduce((sum, e) => sum + e.fame, 0);
      s = { ...s, rngState: without.rngState };
      expect(fame(s) - fame(without)).toBeGreaterThan(0);
    });
  });
});
}
