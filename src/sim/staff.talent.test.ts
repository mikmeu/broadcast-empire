import { describe, expect, it } from 'vitest';
import { TALENT } from '../config/balance';
import { STUDIO_REQUIREMENTS, type FurnitureType, type RoomType } from '../config/office';
import { buildRoom, createShow, hire, sendToTalentProgramme, type ActionResult, sendOnTraining } from './actions';
import { talentBlocker, talentCost, trainingBlocker, workshops } from './staff';
import { sensibleBot } from './bots';
import { addMissingEquipment, autoPlaceFurniture, withoutRecordRooms } from './fixtures';
import { createInitialState } from './newGame';
import { proposeRoom } from './rooms';
import type { GameState, Person } from './state';
import { advance } from './tick';
import { unlockAll } from './unlocks';

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

describe('version 0.14.0', () => {
  describe('the talent programme (R108)', () => {
    it('takes a weak host without a show away for a year, and brings them back much better', () => {
      // A talent manager in a workshop arranges it (0.18.0).
      let s: GameState & { lastId?: string } = hirePerson(hirePerson(room(station(), 'workshop'), { role: 'talentManager' }), { role: 'host', skill: 30 });
      const host = s.lastId!;
      expect(talentBlocker(s, s.employees.find((e) => e.id === host)!)).toBeNull();
      const strong = s.employees.find((e) => e.role === 'host' && e.skill > TALENT.maxSkill);
      if (strong) expect(talentBlocker(s, strong)).toMatch(/skill 40 or less/);
      const money = s.money;
      s = ok(sendToTalentProgramme(s, host));
      const away = s.employees.find((e) => e.id === host)!;
      expect(away.talentUntil).toBe(s.day + TALENT.days);
      expect(money - s.money).toBe(talentCost(away));
      // Nobody else meanwhile, and no show for them.
      s = hirePerson(s, { role: 'host', skill: 20 });
      expect(talentBlocker(s, s.employees.find((e) => e.id === s.lastId)!)).toMatch(/one at a time/);
      expect(createShow(s, { name: 'Too soon', genre: 'top40', hostId: host, staffIds: [], studioId: null })).toMatchObject({ ok: false, error: expect.stringMatching(/talent programme/) });
      s = advance(s, TALENT.days);
      const back = s.employees.find((e) => e.id === host)!;
      expect(back.talentUntil).toBeNull();
      expect(back.skill).toBeGreaterThanOrEqual(30 + TALENT.skillGain.min);
      expect(s.messages.some((m) => m.text.includes('through the talent programme'))).toBe(true);
    });
  });
});

// From version018.
{
function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}

/** A radio station from the sensible test player, a month on the air, with everything open, money to spare and two floors. */
const station = (days = 30): GameState => {
  const s = structuredClone(unlockAll(advance(sensibleBot(createInitialState(1)), days)));
  s.money = 5_000_000;
  s.floorsUnlocked = 2;
  return s;
};

/** Hires a made-up person straight from the pool. */
function hirePerson(state: GameState, person: Partial<Person> & Pick<Person, 'role'>): GameState & { lastId?: string } {
  const s = structuredClone(state);
  const id = `p-${s.nextId++}`;
  s.candidates.push({ id, name: `Test ${person.role} ${id}`, skill: 50, salary: 2_000, specialties: [], fame: 0, department: null, ...person });
  return Object.assign(ok(hire(s, id)), { lastId: id });
}

/** Builds a room of a kind where the game proposes it, with everything on its checklist and the extra pieces. Its id is `lastId`. */
function room(state: GameState, type: RoomType, ...extra: FurnitureType[]): GameState & { lastId?: string } {
  const floor = [1, 2].find((f) => proposeRoom(state, f, type))!;
  let s = ok(buildRoom(state, { ...proposeRoom(state, floor, type)!, type }));
  const id = s.lastId!;
  if (STUDIO_REQUIREMENTS[type]) s = ok(addMissingEquipment(s, id));
  for (const piece of extra) s = ok(autoPlaceFurniture(s, id, piece));
  return Object.assign(s, { lastId: id });
}

/** A workshop with everything it needs (two training seats) and a talent manager at its desk. Its id is `workshop`. */
function withWorkshop(state: GameState, ...extra: FurnitureType[]): GameState & { workshop: string; lastId?: string } {
  const built = room(state, 'workshop', ...extra);
  const id = built.lastId!;
  return Object.assign(hirePerson(built, { role: 'talentManager' }), { workshop: id });
}

describe('version 0.18.0', () => {
  describe('the talent programme (R140)', () => {
    it('is arranged by the talent manager, no longer by a channel manager', () => {
      let s: GameState & { lastId?: string } = hirePerson(station(), { role: 'host', skill: 30 });
      const host = s.lastId!;
      expect(s.employees.some((e) => e.role === 'channelManager')).toBe(true);
      expect(talentBlocker(s, s.employees.find((e) => e.id === host)!)).toMatch(/arranged by a talent manager/);
      s = withWorkshop(s);
      expect(talentBlocker(s, s.employees.find((e) => e.id === host)!)).toBeNull();
      s = ok(sendToTalentProgramme(s, host));
      // It takes no training seat.
      expect(workshops(s)[0]!.pupils).toHaveLength(0);
    });

    it('refuses a course for a host in the programme (#143)', () => {
      let s: GameState & { lastId?: string } = hirePerson(station(), { role: 'host', skill: 30 });
      const host = s.lastId!;
      s = ok(sendToTalentProgramme(withWorkshop(s), host));
      const find = (st: GameState) => st.employees.find((e) => e.id === host)!;
      expect(trainingBlocker(s, find(s))).toMatch(/in the talent programme/);
      const refused = sendOnTraining(s, host);
      expect(refused.ok).toBe(false);
      const later = advance(s, 400);
      expect(find(later).talentUntil ?? null).toBeNull();
      expect(trainingBlocker(later, find(later)) ?? '').not.toMatch(/talent programme/);
    });
  });
});
}
