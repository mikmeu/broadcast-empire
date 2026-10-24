import { describe, expect, it } from 'vitest';
import { STRIKES } from '../config/balance';
import { STUDIO_REQUIREMENTS } from '../config/office';
import { buildRoom, hire, type ActionResult } from '../sim/actions';
import { sensibleBot } from '../sim/bots';
import { engineeredShows, showLoad } from '../sim/broadcast';
import { addMissingEquipment } from '../sim/fixtures';
import { createInitialState } from '../sim/newGame';
import { employeesWithDesk } from '../sim/office';
import { proposeRoom } from '../sim/rooms';
import type { Employee, GameState } from '../sim/state';
import { advance } from '../sim/tick';
import { unlockAll } from '../sim/unlocks';
import { ALL_STAFF, firstDirection, listStaff, needsAttention, showCount, sortsFor, useStaffList, type StaffListOptions } from './staffList';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}

/** A made-up member of staff: a cleaner, who needs no desk and is on no show, unless told otherwise. */
const person = (id: string, name: string, extra: Partial<Employee> = {}): Employee => ({
  id,
  name,
  role: 'cleaner',
  skill: 50,
  salary: 2_000,
  specialties: [],
  fame: 0,
  department: null,
  hiredOn: 0,
  xp: 0,
  level: 1,
  morale: 70,
  location: null,
  desk: null,
  trainingUntil: null,
  courseIn: null,
  leaving: null,
  talentUntil: null,
  ...extra,
});

const game = createInitialState(1);
const people = [
  person('a', 'Zoë Ward', { skill: 80, morale: 30, salary: 3_000, hiredOn: 1 }),
  person('b', 'Ann Price', { skill: 40, morale: 90, salary: 1_500, hiredOn: 2 }),
  person('c', 'Émile Roux', { skill: 60, morale: 20, salary: 2_500, hiredOn: 3 }),
  person('d', 'Bob Lane', { skill: 60, morale: 60, salary: 2_000, hiredOn: 4 }),
];
const names = (options: Partial<StaffListOptions>) => listStaff(game, people, { ...ALL_STAFF, ...options }).map((e) => e.name);

describe('the staff list (#70)', () => {
  it('keeps the order of hiring until a sort is picked', () => {
    expect(names({})).toEqual(['Zoë Ward', 'Ann Price', 'Émile Roux', 'Bob Lane']);
  });

  it('sorts by each field, both ways', () => {
    expect(names({ sort: 'name', dir: 'up' })).toEqual(['Ann Price', 'Bob Lane', 'Émile Roux', 'Zoë Ward']);
    expect(names({ sort: 'name', dir: 'down' })).toEqual(['Zoë Ward', 'Émile Roux', 'Bob Lane', 'Ann Price']);
    expect(names({ sort: 'morale', dir: 'down' })).toEqual(['Ann Price', 'Bob Lane', 'Zoë Ward', 'Émile Roux']);
    expect(names({ sort: 'morale', dir: 'up' })).toEqual(['Émile Roux', 'Zoë Ward', 'Bob Lane', 'Ann Price']);
    expect(names({ sort: 'salary', dir: 'down' })).toEqual(['Zoë Ward', 'Émile Roux', 'Bob Lane', 'Ann Price']);
    expect(names({ sort: 'hired', dir: 'up' })).toEqual(['Zoë Ward', 'Ann Price', 'Émile Roux', 'Bob Lane']);
    expect(names({ sort: 'hired', dir: 'down' })).toEqual(['Bob Lane', 'Émile Roux', 'Ann Price', 'Zoë Ward']);
  });

  it('breaks ties by name, whichever way the sort goes', () => {
    // Bob Lane and Émile Roux both have skill 60.
    expect(names({ sort: 'skill', dir: 'down' })).toEqual(['Zoë Ward', 'Bob Lane', 'Émile Roux', 'Ann Price']);
    expect(names({ sort: 'skill', dir: 'up' })).toEqual(['Ann Price', 'Bob Lane', 'Émile Roux', 'Zoë Ward']);
  });

  it('sorts hosts by fame and the others by their shows', () => {
    const s = structuredClone(game);
    const hosts = [person('h1', 'Host One', { role: 'host', fame: 10 }), person('h2', 'Host Two', { role: 'host', fame: 50 })];
    s.employees = hosts;
    expect(listStaff(s, hosts, { ...ALL_STAFF, sort: 'fame', dir: 'down' }).map((e) => e.id)).toEqual(['h2', 'h1']);
    const station = advance(sensibleBot(createInitialState(1)), 30);
    const crew = station.employees.filter((e) => e.role === 'production');
    const loads = listStaff(station, crew, { ...ALL_STAFF, sort: 'shows', dir: 'down' }).map((e) => showLoad(station, e.id));
    expect(loads.length).toBeGreaterThan(1);
    expect(loads).toEqual([...loads].sort((a, b) => b - a));
  });

  it('finds people by part of their name, without capitals or accents', () => {
    expect(names({ query: 'EMILE' })).toEqual(['Émile Roux']);
    expect(names({ query: ' zoe ' })).toEqual(['Zoë Ward']);
    expect(names({ query: 'a' })).toEqual(['Zoë Ward', 'Ann Price', 'Bob Lane']);
    expect(names({ query: 'nobody' })).toEqual([]);
  });

  it('shows only those with morale under the strike line', () => {
    expect(names({ lowMorale: true })).toEqual(people.filter((e) => e.morale < STRIKES.below).map((e) => e.name));
    expect(names({ lowMorale: true, sort: 'morale', dir: 'up' })).toEqual(['Émile Roux', 'Zoë Ward']);
  });

  it('shows only those who need attention, by the rule of the tab dots', () => {
    const s = structuredClone(game);
    const staff = [person('p1', 'Free Producer', { role: 'production' }), person('c1', 'A Cleaner')];
    s.employees = staff;
    expect(staff.map((e) => needsAttention(s, e))).toEqual([true, false]);
    expect(listStaff(s, staff, { ...ALL_STAFF, attention: true }).map((e) => e.id)).toEqual(['p1']);
  });

  it('offers Shows where people are on shows, and Fame for hosts only', () => {
    expect(sortsFor(['host'])).toEqual(['name', 'age', 'skill', 'morale', 'shows', 'salary', 'hired', 'fame']);
    expect(sortsFor(['engineer'])).toContain('shows');
    expect(sortsFor(['sales'])).toEqual(['name', 'age', 'skill', 'morale', 'salary', 'hired']);
    expect(sortsFor(['channelManager', 'manager'])).not.toContain('shows');
  });

  it('turns a sort round when it is picked again, and keeps the choices', () => {
    const { sortBy, setQuery, toggleLowMorale } = useStaffList.getState();
    sortBy('skill');
    expect(useStaffList.getState()).toMatchObject({ sort: 'skill', dir: firstDirection('skill') });
    expect(firstDirection('skill')).toBe('down');
    sortBy('skill');
    expect(useStaffList.getState().dir).toBe('up');
    sortBy('name');
    expect(useStaffList.getState()).toMatchObject({ sort: 'name', dir: 'up' });
    setQuery('ann');
    toggleLowMorale();
    expect(useStaffList.getState()).toMatchObject({ query: 'ann', lowMorale: true, attention: false });
    useStaffList.setState(ALL_STAFF);
  });

  it('counts the radio shows an audio engineer looks after, as their tag does', () => {
    let s: GameState & { lastId?: string } = structuredClone(unlockAll(advance(sensibleBot(createInitialState(1)), 30)));
    s.money = 5_000_000;
    s.floorsUnlocked = 2;
    const floor = [1, 2].find((f) => proposeRoom(s, f, 'audioRoom'))!;
    s = ok(buildRoom(s, { ...proposeRoom(s, floor, 'audioRoom')!, type: 'audioRoom' }));
    if (STUDIO_REQUIREMENTS.audioRoom) s = ok(addMissingEquipment(s, s.lastId!));
    const id = `p-${s.nextId++}`;
    s.candidates.push({ id, name: 'Test Engineer', role: 'engineer', skill: 60, salary: 2_000, specialties: [], fame: 0, department: null });
    s = ok(hire(s, id));
    const engineer = s.employees.find((e) => e.id === id)!;
    const looked = [...engineeredShows(s, employeesWithDesk(s)).values()].filter((x) => x.engineerId === id).length;
    expect(looked).toBeGreaterThan(0);
    expect(showLoad(s, id)).toBe(0);
    expect(showCount(s, engineer)).toBe(looked);
  });
});
