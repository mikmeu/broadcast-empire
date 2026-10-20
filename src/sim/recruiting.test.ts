import { describe, expect, it } from 'vitest';
import { CLERK_CANDIDATES, POACH, RECRUITER_CANDIDATES, RECRUITING } from '../config/balance';
import { buildRoom, hire, promote, type ActionResult } from './actions';
import { sensibleBot } from './bots';
import { isFirstOfMonth, toCalendarDate } from './calendar';
import { autoPlaceFurniture } from './fixtures';
import { generateCandidates } from './generate';
import { createInitialState } from './newGame';
import { employeesWithDesk } from './office';
import { recruitedCandidates } from './recruiting';
import { Rng } from './rng';
import { proposeRoom } from './rooms';
import { SAVE_VERSION, fromSaveFile, toSaveFile } from './save';
import { promotionDepartment, talentBlocker } from './staff';
import type { GameState, Person } from './state';
import { advance, tick } from './tick';
import { unlockAll } from './unlocks';
import { ARTICLES } from '../wiki/articles';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}

/** A radio station from the sensible test player, a month on the air, with everything open, money to spare and two floors. */
const station = (seed = 1): GameState => {
  const s = structuredClone(unlockAll(advance(sensibleBot(createInitialState(seed)), 30)));
  s.money = 5_000_000;
  s.floorsUnlocked = 2;
  return s;
};

/** Hires a made-up person straight from the pool. Their id is `lastId`. */
function hirePerson(state: GameState, person: Partial<Person> & Pick<Person, 'role'>): GameState & { lastId?: string } {
  const s = structuredClone(state);
  const id = `p-${s.nextId++}`;
  s.candidates.push({ id, name: `Test ${person.role} ${id}`, skill: 50, salary: 2_000, specialties: [], fame: 0, department: null, ...person });
  return Object.assign(ok(hire(s, id)), { lastId: id });
}

/** A new office with free workstations, and `count` recruiters of skill 50 at them. Their ids are `recruiters`. */
function withRecruiters(state: GameState, count: number): GameState & { recruiters: string[] } {
  const floor = [1, 2].find((f) => proposeRoom(state, f, 'office'))!;
  let s = ok(buildRoom(state, { ...proposeRoom(state, floor, 'office')!, type: 'office' }));
  const office = s.lastId!;
  for (let i = 0; i < count + 1; i++) s = ok(autoPlaceFurniture(s, office, 'workstation'));
  const recruiters: string[] = [];
  for (let i = 0; i < count; i++) {
    s = hirePerson(s, { role: 'recruiter' });
    recruiters.push(s.lastId!);
  }
  return Object.assign(s, { recruiters });
}

/** Today's hiring pool drawn afresh from a seed, with `recruited` more candidates. */
function pool(state: GameState, seed: number, recruited: number) {
  const rng = new Rng(seed);
  const people = generateCandidates(structuredClone(state), rng, toCalendarDate(state.day).year, false, recruited);
  return { people, rngState: rng.state };
}

const average = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('Recruiters (0.17.0, R123)', () => {
  describe('the hiring pool', () => {
    it('come last in the pool, after the clerks, and change nothing before them or in the game’s chance', () => {
      const s = station();
      const plain = pool(s, 42, 0);
      const recruited = pool(s, 42, 6);
      // The game's own stream of chance is where it was; the side stream is thrown away.
      expect(recruited.rngState).toBe(plain.rngState);
      expect(recruited.people.slice(0, plain.people.length)).toEqual(plain.people);
      expect(recruited.people).toHaveLength(plain.people.length + 6);
      const roles = plain.people.map((p) => p.role);
      expect(roles.slice(-RECRUITER_CANDIDATES)).toEqual(Array(RECRUITER_CANDIDATES).fill('recruiter'));
      expect(roles.slice(-RECRUITER_CANDIDATES - CLERK_CANDIDATES, -RECRUITER_CANDIDATES)).toEqual(Array(CLERK_CANDIDATES).fill('clerk'));
      expect(plain.people.every((p) => p.foundFor === null)).toBe(true);
      // Hosts first, then the jobs the company has, never a department's manager.
      const extra = recruited.people.slice(plain.people.length);
      expect(extra[0]!.role).toBe('host');
      const employed = new Set(s.employees.map((e) => e.role));
      expect(extra.every((p) => p.role === 'host' || (employed.has(p.role) && p.role !== 'manager'))).toBe(true);
      expect(new Set(extra.map((p) => p.id)).size).toBe(extra.length);
    });

    it('bring in four a month each at skill 50, two recruiters at most counting', () => {
      const s = station();
      expect(recruitedCandidates(s, employeesWithDesk(s))).toBe(0);
      const one = withRecruiters(s, 1);
      expect(employeesWithDesk(one).has(one.recruiters[0]!)).toBe(true);
      expect(recruitedCandidates(one, employeesWithDesk(one))).toBe(RECRUITING.extraEach);
      const three = withRecruiters(s, 3);
      expect(three.recruiters.every((id) => employeesWithDesk(three).has(id))).toBe(true);
      expect(recruitedCandidates(three, employeesWithDesk(three))).toBe(RECRUITING.extraEach * RECRUITING.max);
    });

    it('find better people than the pool has: the better of two draws', () => {
      const s = station();
      const ordinary: number[] = [];
      const found: number[] = [];
      for (let seed = 1; seed <= 60; seed++) {
        const { people } = pool(s, seed, 4);
        const extra = people.slice(-4);
        found.push(...extra.map((p) => p.skill));
        ordinary.push(...people.slice(0, -4).map((p) => p.skill));
      }
      // The better of two draws of skill lifts the average by about 8 points.
      expect(average(found) - average(ordinary)).toBeGreaterThan(5);
      expect(average(found) - average(ordinary)).toBeLessThan(12);
    });

    it('make the next month’s pool longer', () => {
      let plain = station();
      let recruited: GameState = withRecruiters(plain, 1);
      plain = withRecruiters(plain, 0);
      do {
        plain = tick(plain);
        recruited = tick(recruited);
      } while (!isFirstOfMonth(plain.day));
      // About four: a recruiter's morale drifts in the meantime, as everyone's does.
      const more = recruited.candidates.length - plain.candidates.length;
      expect(more).toBeGreaterThanOrEqual(RECRUITING.extraEach - 1);
      expect(more).toBeLessThanOrEqual(RECRUITING.extraEach + 1);
    });

    it('are support staff, and are not made head of a department', () => {
      expect(promotionDepartment('recruiter')).toBeNull();
      const s = withRecruiters(station(), 1);
      expect(promote(s, s.recruiters[0]!)).toMatchObject({ ok: false });
    });
  });

  describe('someone in the place of a leaving host', () => {
    function leaving(state: GameState) {
      const s = structuredClone(state);
      const host = s.employees.find((e) => e.role === 'host')!;
      host.leaving = { on: s.day + POACH.noticeDays, rivalId: s.rivals[0]!.id };
      return { s, host };
    }

    it('is found on day 7 of the notice, best at the same genres and about as good', () => {
      const { s: start, host } = leaving(withRecruiters(station(), 1));
      let s = advance(start, RECRUITING.replaceDays - 1);
      expect(s.candidates.some((c) => c.foundFor === host.id)).toBe(false);
      s = tick(s);
      const found = s.candidates.filter((c) => c.foundFor === host.id);
      expect(found).toHaveLength(1);
      expect(found[0]!.role).toBe('host');
      expect(found[0]!.specialties).toEqual(host.specialties);
      expect(Math.abs(found[0]!.skill - host.skill)).toBeLessThanOrEqual(RECRUITING.skillSpread);
      expect(s.messages.some((m) => m.text.includes(`has found ${found[0]!.name} in the place of ${host.name}`))).toBe(true);
      // Only once.
      s = advance(s, 3);
      expect(s.candidates.filter((c) => c.foundFor === host.id)).toHaveLength(1);
    });

    it('stays in the pool past the 1st until the host has gone, and is hired as anyone is', () => {
      const { s: start, host } = leaving(withRecruiters(station(), 1));
      let s = advance(start, RECRUITING.replaceDays);
      const found = s.candidates.find((c) => c.foundFor === host.id)!;
      // Through the month's new pool.
      while (!isFirstOfMonth(s.day)) s = tick(s);
      expect(s.day).toBeLessThan(host.leaving!.on);
      expect(s.candidates.some((c) => c.id === found.id && c.foundFor === host.id)).toBe(true);
      const hired = ok(hire(s, found.id));
      const employee = hired.employees.find((e) => e.id === found.id)!;
      expect(employee).toBeDefined();
      expect('foundFor' in employee).toBe(false);
      // Not hired: once the host has gone, they go with the next pool.
      s = advance(s, host.leaving!.on - s.day);
      expect(s.employees.some((e) => e.id === host.id)).toBe(false);
      expect(s.candidates.find((c) => c.id === found.id)?.foundFor ?? null).toBeNull();
      while (!isFirstOfMonth(s.day)) s = tick(s);
      expect(s.candidates.some((c) => c.id === found.id)).toBe(false);
    });

    it('is not found without a recruiter at a desk', () => {
      const { s: start, host } = leaving(station());
      const s = advance(start, RECRUITING.replaceDays + 1);
      expect(s.candidates.some((c) => c.foundFor === host.id)).toBe(false);
    });
  });

  describe('the talent programme', () => {
    it('can be arranged by a recruiter in place of a channel manager', () => {
      let s: GameState & { lastId?: string } = hirePerson(station(), { role: 'host', skill: 30 });
      const host = s.lastId!;
      s.employees = s.employees.filter((e) => e.role !== 'channelManager');
      expect(talentBlocker(s, s.employees.find((e) => e.id === host)!)).toMatch(/a channel manager or a recruiter, at a desk/);
      s = withRecruiters(s, 1);
      expect(talentBlocker(s, s.employees.find((e) => e.id === host)!)).toBeNull();
    });
  });

  describe('the save', () => {
    it('loads a game from version 33: nobody in the pool was found by a recruiter', () => {
      const s = station();
      const save = JSON.parse(JSON.stringify(toSaveFile(s, 0)));
      for (const c of save.state.candidates) delete c.foundFor;
      const { state, version } = fromSaveFile({ ...save, version: 33 });
      expect(version).toBe(SAVE_VERSION);
      expect(SAVE_VERSION).toBeGreaterThanOrEqual(34);
      expect(state.candidates.length).toBe(s.candidates.length);
      expect(state.candidates.every((c) => c.foundFor === null)).toBe(true);
      expect(() => tick(state)).not.toThrow();
    });
  });

  it('the wiki tells of recruiters', () => {
    const text = JSON.stringify(ARTICLES.find((a) => a.id === 'staff'));
    expect(text).toMatch(/Recruiter/);
    expect(text).toMatch(new RegExp(`day ${RECRUITING.replaceDays}`));
  });
});
