// What staff say (0.20.0, #154).

import { describe, expect, it } from 'vitest';
import { MORALE, THOUGHTS } from '../config/balance';
import { roomOfKind } from './fixtures';
import { sensibleBot } from './bots';
import { createInitialState } from './newGame';
import { employeesWithDesk, findRoom } from './office';
import type { Employee, GameState, Role } from './state';
import { describeMorale, thoughtContext, thoughtTally, thoughtsOf } from './thoughts';
import { unlockAll } from './unlocks';
import { moraleParts, moraleTarget } from './upkeep';

function station(): GameState {
  const s = structuredClone(unlockAll(sensibleBot(createInitialState(1))));
  s.employees = s.employees.filter((e) => !['cleaner', 'technician', 'maintenance', 'cook'].includes(e.role));
  s.rooms = s.rooms.filter((r) => r.type !== 'canteen');
  return s;
}

function add(s: GameState, role: Role): Employee {
  const person: Employee = { id: `p-${role}-${s.employees.length}`, name: `Test ${role}`, role, skill: 50, salary: 1_000, specialties: [], fame: 0, department: null, hiredOn: 0, xp: 0, level: 1, morale: MORALE.neutral, location: null, desk: null, trainingUntil: null, courseIn: null, leaving: null, talentUntil: null };
  s.employees.push(person);
  return person;
}

const OFFICE = roomOfKind(station(), 'office');
const kinds = (s: GameState, e: Employee) => thoughtsOf(s, e).map((t) => t.kind);

describe('thoughts', () => {
  it('a dirty office gives the dirt thought, and cleaning it takes it away', () => {
    const s = station();
    const worker = s.employees.find((e) => e.role === 'production')!;
    findRoom(s, OFFICE)!.cleanliness = 0;
    const dirty = thoughtsOf(s, worker).find((t) => t.kind === 'dirt');
    expect(dirty?.tone).toBe('bad');
    findRoom(s, OFFICE)!.cleanliness = 100;
    expect(kinds(s, worker)).not.toContain('dirt');
  });

  it('a host with no shows says so', () => {
    const s = station();
    s.shows = [];
    const host = s.employees.find((e) => e.role === 'host')!;
    expect(kinds(s, host)).toContain('noShow');
  });

  it('someone without a desk says so', () => {
    const s = station();
    const worker = add(s, 'production');
    expect(employeesWithDesk(s).has(worker.id)).toBe(false);
    expect(kinds(s, worker)).toContain('noDesk');
  });

  it('the same state gives the same thoughts', () => {
    const s = station();
    findRoom(s, OFFICE)!.cleanliness = 0;
    for (const e of s.employees) expect(thoughtsOf(s, e)).toEqual(thoughtsOf(structuredClone(s), e));
  });

  it('never more than the most, and the problems come before the good things', () => {
    const s = station();
    findRoom(s, OFFICE)!.cleanliness = 0;
    findRoom(s, OFFICE)!.issue = { kind: 'heating', workLeft: 3 };
    const worker = add(s, 'production');
    worker.trainingUntil = s.day + 10;
    const context = thoughtContext(s);
    for (const e of s.employees) {
      const said = thoughtsOf(s, e, context);
      expect(said.length).toBeLessThanOrEqual(THOUGHTS.max);
      const firstGood = said.findIndex((t) => t.tone === 'good');
      if (firstGood >= 0) expect(said.slice(firstGood).every((t) => t.tone === 'good' || t.kind === 'course')).toBe(true);
    }
    expect(thoughtsOf(s, worker)[0]!.tone).toBe('bad');
  });

  it('says something about the mood when nothing else applies', () => {
    const s = station();
    const worker = s.employees.find((e) => e.role === 'production')!;
    worker.morale = 90;
    expect(thoughtsOf(s, worker).every((t) => t.tone === 'good')).toBe(true);
  });

  it('counts the problems across the company', () => {
    const s = station();
    findRoom(s, OFFICE)!.cleanliness = 0;
    expect(thoughtTally(s).find((t) => t.kind === 'dirt')?.count).toBeGreaterThan(0);
  });
});

describe('the parts of morale', () => {
  it('moraleTarget is the clamped sum of the parts', () => {
    const s = station();
    findRoom(s, OFFICE)!.cleanliness = 20;
    findRoom(s, OFFICE)!.issue = { kind: 'lighting', workLeft: 2 };
    const desked = employeesWithDesk(s);
    for (const e of s.employees) {
      const p = moraleParts(s, e, desked);
      const sum = MORALE.neutral + p.canteen + p.meals + p.post + p.meeting + p.comfort + p.canteenComfort - p.dirt - p.issue - p.fans;
      expect(moraleTarget(s, e, desked)).toBeCloseTo(Math.max(0, Math.min(100, sum)));
    }
  });

  it('describes them in words, leaving out the nil ones', () => {
    const s = station();
    findRoom(s, OFFICE)!.cleanliness = 0;
    const worker = s.employees.find((e) => e.role === 'production')!;
    const text = describeMorale(moraleParts(s, worker, employeesWithDesk(s)));
    expect(text).toContain(`${MORALE.neutral} base`);
    expect(text).toContain(`−${MORALE.dirtPenalty} dirt`);
    expect(text).not.toContain('canteen');
  });
});
