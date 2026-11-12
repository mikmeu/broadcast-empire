import { describe, expect, it } from 'vitest';
import { POACH } from '../config/balance';
import { LINES, STEPS } from '../config/guide';
import { STUDIO_REQUIREMENTS, type FurnitureType, type RoomType } from '../config/office';
import { TO_RECORD } from '../config/voiceOver';
import { buildRoom, hire, type ActionResult } from './actions';
import { sensibleBot } from './bots';
import { addMissingEquipment, autoPlaceFurniture, withoutRecordRooms } from './fixtures';
import { guideView } from './guide';
import { createInitialState } from './newGame';
import { proposeRoom } from './rooms';
import type { GameState, Person } from './state';
import { advance } from './tick';
import { unlockAll } from './unlocks';
import { canteenCoverage } from './upkeep';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}

/** A radio station from the sensible test player, a month on the air, with everything open, money to spare and two floors. */
const station = (days = 30): GameState => {
  // Without the library and post room the bot keeps its records in (0.18.0): the tests below build rooms where the game proposes them.
  const s = structuredClone(withoutRecordRooms(unlockAll(advance(sensibleBot(createInitialState(1)), days))));
  s.money = 5_000_000;
  s.floorsUnlocked = 2;
  return s;
};

/** Hires a made-up person straight from the pool. */
function hirePerson(state: GameState, person: Partial<Person> & Pick<Person, 'role'>): GameState & { lastId?: string } {
  const s = structuredClone(state);
  const id = `p-${s.nextId++}`;
  s.candidates.push({ id, name: `Test ${person.role} ${id}`, skill: 80, salary: 2_000, specialties: [], fame: 0, department: null, ...person });
  return Object.assign(ok(hire(s, id)), { lastId: id });
}

/** Builds a room of a kind where the game proposes it, on the lowest floor with room, with everything on its checklist. Its id is `lastId`. */
function room(state: GameState, type: RoomType, ...extra: FurnitureType[]): GameState & { lastId?: string } {
  const floor = [1, 2].find((f) => proposeRoom(state, f, type))!;
  let s = ok(buildRoom(state, { ...proposeRoom(state, floor, type)!, type }));
  const id = s.lastId!;
  if (STUDIO_REQUIREMENTS[type]) s = ok(addMissingEquipment(s, id));
  for (const piece of extra) s = ok(autoPlaceFurniture(s, id, piece));
  return Object.assign(s, { lastId: id });
}

/** A writers' room with places for `n` writers, and `n` writers of this skill at them. Their ids are `writers`. */
function writers(state: GameState, n: number, skill = 80): GameState & { writers: string[] } {
  let s = room(state, 'writersRoom', ...Array<FurnitureType>(n).fill('writingDesk'));
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    s = hirePerson(s, { role: 'writer', skill });
    ids.push(s.lastId!);
  }
  return Object.assign(s, { writers: ids });
}

describe('version 0.14.0', () => {
  describe('Penny (0.14.0)', () => {
    const asked = (s: GameState, id: string) => ({ ...s, guide: { stage: 'on' as const, quiet: 0, seen: [...LINES.map((l) => l.id).filter((x) => x !== id), 'television-later'] } });

    it('says that a sitcom needs writers, that a host works out a month, and that the top floor is open', () => {
      const base = station(130);
      const sitcom = room(base, 'tvSitcomStudio');
      expect(guideView(asked(sitcom, 'writers'))).toMatchObject({ kind: 'hint', line: { id: 'writers' } });
      expect(guideView(asked(writers(sitcom, 1), 'writers'))).toBeNull();

      const leaving = structuredClone(base);
      leaving.employees.find((e) => e.role === 'host')!.leaving = { on: leaving.day + POACH.noticeDays, rivalId: leaving.rivals[0]!.id };
      expect(guideView(asked(leaving, 'notice'))).toMatchObject({ kind: 'hint', line: { id: 'notice' } });

      expect(guideView(asked({ ...base, floorsUnlocked: 6 }, 'top-floor'))).toMatchObject({ kind: 'hint', line: { id: 'top-floor' } });
      expect(guideView(asked({ ...base, floorsUnlocked: 5 }, 'top-floor'))).toBeNull();
      for (const id of ['writers', 'notice', 'top-floor']) expect(TO_RECORD[id]).toBeUndefined();
    });
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
  it('has Penny say something about a cook and a threatened strike', () => {
    const asked = (s: GameState, id: string) => ({ ...s, guide: { stage: 'on' as const, quiet: 0, seen: [...LINES.map((l) => l.id).filter((x) => x !== id), 'television-later'] } });
    let big = fed(station());
    while (big.employees.length < 15) big = hirePerson(big, { role: 'production' });
    expect(guideView(asked(big, 'cook'))).toMatchObject({ kind: 'hint', line: { id: 'cook' } });
    expect(guideView(asked(hirePerson(big, { role: 'cook' }), 'cook'))).toBeNull();
    const warned = { ...station(), unrest: { sales: { since: 0, warnedOn: 14, strikeUntil: null } } };
    expect(guideView(asked(warned, 'strike'))).toMatchObject({ kind: 'hint', line: { id: 'strike' } });
    for (const id of ['cook', 'strike']) expect(TO_RECORD[id]).toBeUndefined();
  });
});
}

// From version017.
describe('Penny points out the cables (0.17.0, #46)', () => {
  it('says in the master control step that the cables lay themselves and that Cables shows them', () => {
    const mcr = STEPS.find((line) => line.id === 'mcr')!;
    expect(mcr.say).toMatch(/the cables lay themselves/);
    expect(mcr.say).toMatch(/Cables, in the menu, shows them/);
    expect(mcr.say).toMatch(/a red one is a channel that cannot go out/);
    expect(mcr.how?.at(-1)).toMatch(/“Cables” in the menu on the left/);
    // The words changed in 0.21.0 (the window is in the menu), and were recorded again for it.
    expect(TO_RECORD.mcr).toBeUndefined();
  });
});
