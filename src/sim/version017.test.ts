import { describe, expect, it } from 'vitest';
import { hire, promote, type ActionResult } from './actions';
import { sensibleBot } from './bots';
import { salaryFor } from './economy';
import { createInitialState } from './newGame';
import { advance } from './tick';
import { promotionBlocker, promotionDepartment } from './staff';
import type { GameState, Person } from './state';
import { isUnlocked, unlockAll } from './unlocks';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}
const error = (result: ActionResult) => (result.ok ? 'no error' : result.error);

/** A radio station from the sensible test player, a month on the air, with everything open and money to spare. */
const station = (): GameState => {
  const s = structuredClone(unlockAll(advance(sensibleBot(createInitialState(1)), 30)));
  s.money = 5_000_000;
  s.employees = s.employees.filter((e) => e.role !== 'manager' || e.department === null);
  return s;
};

/** Hires a made-up person straight from the pool. Their id is `lastId`. */
function hirePerson(state: GameState, person: Partial<Person> & Pick<Person, 'role'>): GameState & { lastId?: string } {
  const s = structuredClone(state);
  const id = `p-${s.nextId++}`;
  s.candidates.push({ id, name: `Test ${person.role} ${id}`, skill: 50, salary: 500, specialties: [], fame: 0, department: null, ...person });
  return Object.assign(ok(hire(s, id)), { lastId: id });
}

describe('Promotion to head of a department (0.17.0, #49)', () => {
  it('takes the department from the job; hosts, channel managers and support staff have none', () => {
    expect(promotionDepartment('engineer')).toBe('production');
    expect(promotionDepartment('writer')).toBe('production');
    expect(promotionDepartment('researcher')).toBe('research');
    expect(promotionDepartment('sales')).toBe('sales');
    for (const role of ['host', 'channelManager', 'cleaner', 'manager'] as const) expect(promotionDepartment(role)).toBeNull();
  });

  it('takes them off their shows and their desk, and pays them as a manager', () => {
    let s = hirePerson(station(), { role: 'production', skill: 70 });
    const id = s.lastId!;
    s.shows[0].staffIds.push(id);
    s.shows[0].writerIds.push(id);
    s.employees.find((e) => e.id === id)!.desk = 'some-desk';
    s = ok(promote(s, id));
    const head = s.employees.find((e) => e.id === id)!;
    expect(head.role).toBe('manager');
    expect(head.department).toBe('production');
    expect(head.desk).toBeNull();
    expect(head.skill).toBe(70);
    expect(head.salary).toBe(Math.max(500, salaryFor('manager', 70, 0, s)));
    expect(s.shows.some((show) => show.staffIds.includes(id) || show.writerIds.includes(id))).toBe(false);
    expect(s.messages.some((m) => m.text.includes('is the head of Production now'))).toBe(true);
  });

  it('never lowers the salary', () => {
    const s = hirePerson(station(), { role: 'sales', skill: 10, salary: 99_000 });
    expect(ok(promote(s, s.lastId!)).employees.find((e) => e.id === s.lastId)!.salary).toBe(99_000);
  });

  it('ends the campaign a marketer runs', () => {
    const s = hirePerson(station(), { role: 'marketing' });
    s.campaigns.push({ id: 'c-test', targetId: s.channels[0].id, audience: 'all', weeklyBudget: 1_000, marketerId: s.lastId!, endDay: s.day + 28, weeks: 4, repeat: false });
    expect(ok(promote(s, s.lastId!)).campaigns.some((c) => c.id === 'c-test')).toBe(false);
  });

  it('allows one head per department: a second promotion or hire fails', () => {
    let s = hirePerson(station(), { role: 'sales' });
    s = ok(promote(s, s.lastId!));
    const second = hirePerson(s, { role: 'sales' });
    expect(error(promote(second, second.lastId!))).toBe('You already have a sales manager.');
    const candidate = structuredClone(s);
    candidate.candidates.push({ id: 'p-head', name: 'Test head', role: 'manager', department: 'sales', skill: 50, salary: 3_000, specialties: [], fame: 0 });
    expect(error(hire(candidate, 'p-head'))).toBe('You already have a sales manager.');
  });

  it('is blocked for other jobs, on a course, on strike, while leaving, and in a locked department', () => {
    const s = station();
    const host = s.employees.find((e) => e.role === 'host')!;
    expect(promotionBlocker(s, host)).toMatch(/Only production/);

    const withWriter = hirePerson(s, { role: 'writer' });
    const writer = withWriter.employees.find((e) => e.id === withWriter.lastId)!;
    expect(promotionBlocker(withWriter, writer)).toBeNull();
    expect(promotionBlocker(withWriter, { ...writer, trainingUntil: s.day + 5 })).toMatch(/on a course/);
    expect(promotionBlocker(withWriter, { ...writer, leaving: { on: s.day + 5, rivalId: 'r' } })).toMatch(/is leaving/);
    const striking = structuredClone(withWriter);
    striking.unrest.production = { since: s.day - 30, warnedOn: s.day - 10, strikeUntil: s.day + 5 };
    expect(promotionBlocker(striking, writer)).toMatch(/on strike/);

    const fresh = createInitialState(1);
    expect(isUnlocked(fresh, 'research')).toBe(false);
    expect(promotionBlocker(fresh, { ...writer, role: 'researcher' })).not.toBeNull();
  });
});
