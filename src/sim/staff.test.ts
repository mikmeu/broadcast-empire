import { describe, expect, it } from 'vitest';
import { hire, type ActionResult } from './actions';
import { autoPlaceFurniture } from './fixtures';
import { showQuality } from './broadcast';
import { sensibleBot } from './bots';
import { createInitialState } from './newGame';
import { unlockAll } from './unlocks';
import { deskFor, deskRoomFor, employeesWithDesk } from './office';
import { Rng } from './rng';
import { effectiveSkill, gainExperience, xpForNextLevel } from './staff';
import type { GameState, Person } from './state';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}
const error = (result: ActionResult) => (result.ok ? 'no error' : result.error);

/** The sensible bot's day-0 station: one channel in the Capital, five shows, free desks for two more staff. */
const station = () => structuredClone(unlockAll(sensibleBot(createInitialState(1))));

/** Adds a made-up candidate to the pool, so tests don't depend on the random pool. */
function withCandidate(state: GameState, person: Partial<Person> & Pick<Person, 'role'>): GameState & { lastId?: string } {
  const s = structuredClone(state);
  const candidate: Person = { id: `p-test-${s.candidates.length}`, name: 'Test Person', skill: 80, salary: 2_000, specialties: [], fame: 0, department: null, ...person };
  s.candidates.push(candidate);
  return Object.assign(s, { lastId: candidate.id });
}

/** Hires a made-up person and gives them a desk: a workstation, or for a manager a desk in the management office. */
function hireTest(state: GameState, person: Partial<Person> & Pick<Person, 'role'>): GameState & { lastId?: string } {
  const s = withCandidate(state, person);
  const id = s.lastId!;
  const room = s.rooms.find((r) => r.type === deskRoomFor(person.role))!.roomId;
  return Object.assign(ok(autoPlaceFurniture(ok(hire(s, id)), room, deskFor(person.role))), { lastId: id });
}

describe('managers and experience', () => {
  it('a production manager raises effective skill and show quality', () => {
    const s = station();
    const show = s.shows[0]!;
    const staff = s.employees.find((e) => e.id === show.staffIds[0])!;
    const before = showQuality(s, show).quality;
    const managed = hireTest(s, { role: 'manager', department: 'production', skill: 100 });
    const desked = employeesWithDesk(managed);
    expect(effectiveSkill(managed, staff, desked)).toBeCloseTo(Math.min(100, staff.skill * 1.2));
    expect(showQuality(managed, show).quality).toBeGreaterThan(before);
  });

  it('allows one manager per department', () => {
    const s = hireTest(station(), { role: 'manager', department: 'sales' });
    const second = withCandidate(s, { role: 'manager', department: 'sales' });
    expect(error(hire(second, second.lastId!))).toMatch(/already have a sales manager/);
  });

  it('levels people up with more skill and a matching salary', () => {
    const s = station();
    const person = s.employees.find((e) => e.role === 'production')!;
    person.xp = xpForNextLevel(person.level) - 1;
    const skill = person.skill;
    gainExperience(s, new Rng(1), employeesWithDesk(s), new Set());
    expect(person.level).toBe(2);
    expect(person.skill).toBeGreaterThan(skill);
    // No e-mail of its own: the month's report tells it.
    expect(s.messages.some((m) => /reached level/.test(m.text))).toBe(false);
    expect(s.levelUps.count).toBe(1);
    expect(s.levelUps.name).toBe(person.name);
    expect(s.levelUps.raise).toBeGreaterThan(0);
  });
});
