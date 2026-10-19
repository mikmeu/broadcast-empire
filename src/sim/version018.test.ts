import { describe, expect, it } from 'vitest';
import { SALARY, TALENT_MANAGER_CANDIDATES, TRAINING, WORKSHOP } from '../config/balance';
import { FURNITURE, ONE_DESK_ROOMS, STUDIO_REQUIREMENTS, type FurnitureType, type RoomType } from '../config/office';
import { buildRoom, hire, releaseRoom, sellFurniture, sendOnTraining, sendToTalentProgramme, type ActionResult } from './actions';
import { sensibleBot } from './bots';
import { addMissingEquipment, autoPlaceFurniture } from './fixtures';
import { generateCandidates } from './generate';
import { createInitialState } from './newGame';
import { deskFor, deskRoomFor, employeesWithDesk } from './office';
import { Rng } from './rng';
import { proposeRoom } from './rooms';
import { fromSaveFile, SAVE_VERSION, toSaveFile } from './save';
import { inHouseCourse, talentBlocker, trainingBlocker, trainingCost, workshops } from './staff';
import type { GameState, Person } from './state';
import { teamOf } from './teams';
import { advance } from './tick';
import { unlockAll } from './unlocks';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}
const error = (result: ActionResult) => (result.ok ? '' : result.error);

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
  describe('the workshop and the talent manager (R140)', () => {
    it('is a room of its own with a trainer’s desk, two training seats and a whiteboard on wheels', () => {
      expect(STUDIO_REQUIREMENTS.workshop).toEqual({ trainerDesk: 1, trainingSeat: 2, whiteboard: 1 });
      for (const type of ['trainerDesk', 'trainingSeat', 'whiteboard'] as const) expect(FURNITURE[type].rooms).toEqual(['workshop']);
      expect(ONE_DESK_ROOMS.workshop).toBe('trainerDesk');
      expect(deskFor('talentManager')).toBe('trainerDesk');
      expect(deskRoomFor('talentManager')).toBe('workshop');
      // Like the managers, they belong to no team.
      expect(teamOf('talentManager')).toBeNull();
    });

    it('comes to the hiring pool once a month, at a salary of their own', () => {
      const pool = generateCandidates(createInitialState(3), new Rng(7), 1980).filter((p) => p.role === 'talentManager');
      expect(pool).toHaveLength(TALENT_MANAGER_CANDIDATES);
      for (const p of pool) {
        expect(p.salary).toBeGreaterThanOrEqual(SALARY.talentManager.min);
        expect(p.salary).toBeLessThanOrEqual(SALARY.talentManager.max * 1.5);
      }
    });

    it('works at the trainer’s desk, and only in a workshop that has all it needs', () => {
      const s = withWorkshop(station());
      const manager = s.lastId!;
      expect(employeesWithDesk(s).get(manager)?.roomId).toBe(s.workshop);
      expect(workshops(s)).toHaveLength(1);
      expect(workshops(s)[0]).toMatchObject({ seats: 2, pupils: [] });
      // Without the whiteboard there is no workshop to teach in.
      const bare = structuredClone(s);
      const shop = bare.rooms.find((r) => r.roomId === s.workshop)!;
      shop.furniture = shop.furniture.filter((f) => f.type !== 'whiteboard');
      expect(employeesWithDesk(bare).has(manager)).toBe(false);
      expect(workshops(bare)).toHaveLength(0);
    });
  });

  describe('a course in the house (R140)', () => {
    it('needs no head of the department, and costs a month of salary instead of two', () => {
      const plain = station();
      const producer = plain.employees.find((e) => e.role === 'production')!;
      // Outside, as before: the head of Production arranges it.
      expect(trainingBlocker(plain, producer)).toMatch(/arranged by the head of Production/);
      expect(trainingCost(plain, producer)).toBe(Math.round((producer.salary * TRAINING.salaryMonths) / 100) * 100);

      const s = withWorkshop(plain);
      expect(trainingBlocker(s, producer)).toBeNull();
      expect(trainingCost(s, producer)).toBe(Math.round((producer.salary * WORKSHOP.salaryMonths) / 100) * 100);
      const sent = ok(sendOnTraining(s, producer.id));
      expect(s.money - sent.money).toBe(trainingCost(s, producer));
      expect(sent.ledger.training).toBe(trainingCost(s, producer));
      const away = sent.employees.find((e) => e.id === producer.id)!;
      expect(away).toMatchObject({ trainingUntil: s.day + TRAINING.days, courseIn: s.workshop });
    });

    it('takes one to a seat, from any job, and the next one waits', () => {
      let s = withWorkshop(station());
      const producers = s.employees.filter((e) => e.role === 'production');
      expect(producers.length).toBeGreaterThanOrEqual(2);
      const host = s.employees.find((e) => e.role === 'host')!;
      // Two of the same job at once, which a course outside does not allow.
      s = ok(sendOnTraining(s, producers[0]!.id));
      s = ok(sendOnTraining(s, producers[1]!.id));
      expect(workshops(s)[0]!.pupils).toHaveLength(2);
      expect(inHouseCourse(s)).toBeUndefined();
      // Every seat is taken: outside, a host still goes, with a channel manager, at the old price.
      expect(trainingCost(s, host)).toBe(Math.round((host.salary * TRAINING.salaryMonths) / 100) * 100);
      s = ok(sendOnTraining(s, host.id));
      expect(s.employees.find((e) => e.id === host.id)!.courseIn).toBeNull();
      // And a third producer has nowhere to go: there is no head of Production.
      if (producers[2]) expect(trainingBlocker(s, producers[2])).toMatch(/Every training seat is taken/);
      // A third seat makes room.
      const seated = ok(autoPlaceFurniture(s, s.workshop, 'trainingSeat'));
      expect(inHouseCourse(seated)).toBeDefined();
    });

    it('lets a course finish when the workshop is given up, and a new one is outside', () => {
      let s = withWorkshop(station());
      const producer = s.employees.find((e) => e.role === 'production')!;
      s = ok(sendOnTraining(s, producer.id));
      const shop = s.workshop;
      for (const piece of s.rooms.find((r) => r.roomId === shop)!.furniture) s = ok(sellFurniture(s, shop, piece.id));
      s = ok(releaseRoom(s, shop));
      expect(s.rooms.some((r) => r.roomId === shop)).toBe(false);
      expect(workshops(s)).toHaveLength(0);
      const away = s.employees.find((e) => e.id === producer.id)!;
      expect(away.trainingUntil).not.toBeNull();
      // Nobody else is sent outside without a head of Production.
      const other = s.employees.find((e) => e.role === 'production' && e.id !== producer.id)!;
      expect(error(sendOnTraining(s, other.id))).toMatch(/head of Production/);
      s = advance(s, TRAINING.days);
      const back = s.employees.find((e) => e.id === producer.id)!;
      expect(back).toMatchObject({ trainingUntil: null, courseIn: null });
      expect(back.skill).toBeGreaterThan(producer.skill);
    });
  });

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
  });

  describe('an older save (R140)', () => {
    it('loads with every running course outside', () => {
      const s = station();
      const old = JSON.parse(JSON.stringify(toSaveFile(s, 0)));
      old.state.employees[0].trainingUntil = s.day + 10;
      for (const e of old.state.employees) delete e.courseIn;
      const { state, version } = fromSaveFile({ ...old, version: 32 });
      expect(version).toBe(SAVE_VERSION);
      expect(SAVE_VERSION).toBe(33);
      expect(state.employees.every((e) => e.courseIn === null)).toBe(true);
      expect(state.employees[0]!.trainingUntil).toBe(s.day + 10);
    });
  });
});
