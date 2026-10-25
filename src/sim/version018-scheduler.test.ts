import { describe, expect, it } from 'vitest';
import { GUARD_CANDIDATES, SALARY, SCHEDULER_CANDIDATES, SCHEDULERS } from '../config/balance';
import { getGenre } from '../config/genres';
import { FURNITURE, ONE_DESK_ROOMS, STUDIO_REQUIREMENTS, type FurnitureType, type RoomType } from '../config/office';
import { buildRoom, hire, type ActionResult } from './actions';
import { sensibleBot } from './bots';
import { channelSpecialization, isMusicStation, scheduledChannels, simulateDay } from './broadcast';
import { addMissingEquipment, autoPlaceFurniture } from './fixtures';
import { generateCandidates } from './generate';
import { createInitialState } from './newGame';
import { deskFor, deskRoomFor, employeesWithDesk, fitError } from './office';
import { Rng } from './rng';
import { proposeRoom } from './rooms';
import type { GameState, Person } from './state';
import { teamOf } from './teams';
import { advance } from './tick';
import { unlockAll } from './unlocks';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}

/** A radio station from the sensible test player, a month on the air: its first channel plays music in three slots. */
const station = (): GameState => {
  const s = structuredClone(unlockAll(advance(sensibleBot(createInitialState(1)), 30)));
  s.money = 5_000_000;
  s.floorsUnlocked = 2;
  return s;
};

function hirePerson(state: GameState, person: Partial<Person> & Pick<Person, 'role'>): GameState & { lastId?: string } {
  const s = structuredClone(state);
  const id = `p-${s.nextId++}`;
  s.candidates.push({ id, name: `Test ${person.role} ${id}`, skill: 50, salary: 2_000, specialties: [], fame: 0, department: null, ...person });
  return Object.assign(ok(hire(s, id)), { lastId: id });
}

function room(state: GameState, type: RoomType, ...extra: FurnitureType[]): GameState & { lastId?: string } {
  const floor = [1, 2].find((f) => proposeRoom(state, f, type))!;
  let s = ok(buildRoom(state, { ...proposeRoom(state, floor, type)!, type }));
  const id = s.lastId!;
  if (STUDIO_REQUIREMENTS[type]) s = ok(addMissingEquipment(s, id));
  for (const piece of extra) s = ok(autoPlaceFurniture(s, id, piece));
  return Object.assign(s, { lastId: id });
}

/** A scheduler at a desk of their own. */
const withScheduler = (state: GameState, skill: number) => hirePerson(room(state, 'musicSchedulingOffice'), { role: 'scheduler', skill });

const listeners = (s: GameState, channelId: string, slot: number) => simulateDay(s).channels.find((c) => c.channelId === channelId)!.slots[slot]!.listeners;

describe('music schedulers (R44)', () => {
  const base = station();
  const channel = base.channels[0]!;

  it('works in a room of their own, at a desk, on the production team', () => {
    expect(STUDIO_REQUIREMENTS.musicSchedulingOffice).toEqual({ schedulingDesk: 1 });
    expect(FURNITURE.schedulingDesk.rooms).toEqual(['musicSchedulingOffice']);
    expect(FURNITURE.schedulingDesk.cost).toBe(FURNITURE.audioDesk.cost);
    expect(ONE_DESK_ROOMS.musicSchedulingOffice).toBe('schedulingDesk');
    expect(deskFor('scheduler')).toBe('schedulingDesk');
    expect(deskRoomFor('scheduler')).toBe('musicSchedulingOffice');
    expect(teamOf('scheduler')).toBe('production');
  });

  it('lifts the music shows of a music station and nothing else', () => {
    expect(channelSpecialization(base, channel)).toBe('Music');
    expect(isMusicStation(base, channel)).toBe(true);
    const s = withScheduler(base, 100);
    const looked = scheduledChannels(s, employeesWithDesk(s));
    expect(looked.get(channel.id)).toEqual({ schedulerId: s.lastId, bonus: SCHEDULERS.bonus });
    const slots = channel.schedule.map((id) => getGenre(base.shows.find((x) => x.id === id)!.genre).group);
    expect(slots.filter((g) => g === 'Music').length).toBeGreaterThanOrEqual(3);
    slots.forEach((group, slot) => {
      const before = listeners(base, channel.id, slot);
      const after = listeners(s, channel.id, slot);
      if (group === 'Music') expect(after).toBeGreaterThan(before);
      else expect(after).toBe(before);
    });
  });

  it('gets a talk station nothing', () => {
    const s = withScheduler(base, 100);
    const talk = structuredClone(s);
    for (const show of talk.shows) if (talk.channels[0]!.schedule.includes(show.id)) show.genre = 'news';
    expect(channelSpecialization(talk, talk.channels[0]!)).toBe('News & Talk');
    expect(scheduledChannels(talk, employeesWithDesk(talk)).size).toBe(0);
  });

  it('does nothing without a desk', () => {
    const s = hirePerson(base, { role: 'scheduler', skill: 100 });
    expect(employeesWithDesk(s).has(s.lastId!)).toBe(false);
    expect(scheduledChannels(s, employeesWithDesk(s)).size).toBe(0);
  });

  it('leaves a second scheduler idle when there is one music station, and the better one takes it', () => {
    let s = withScheduler(base, 40);
    const weak = s.lastId!;
    s = hirePerson(room(s, 'musicSchedulingOffice'), { role: 'scheduler', skill: 90 });
    const strong = s.lastId!;
    const looked = scheduledChannels(s, employeesWithDesk(s));
    expect(looked.size).toBe(1);
    expect(looked.get(channel.id)!.schedulerId).toBe(strong);
    expect(looked.get(channel.id)!.schedulerId).not.toBe(weak);
  });

  it('is worth less for a weaker scheduler', () => {
    const weak = withScheduler(base, 30);
    const strong = withScheduler(base, 90);
    const bonus = (s: GameState) => scheduledChannels(s, employeesWithDesk(s)).get(channel.id)!.bonus;
    expect(bonus(weak)).toBeGreaterThan(0);
    expect(bonus(weak)).toBeLessThan(bonus(strong));
    expect(bonus(strong)).toBeLessThanOrEqual(SCHEDULERS.bonus);
  });

  it('takes one desk to a room', () => {
    const s = room(base, 'musicSchedulingOffice');
    const office = s.rooms.find((r) => r.roomId === s.lastId)!;
    expect(office.furniture.filter((f) => f.type === 'schedulingDesk')).toHaveLength(1);
    expect(fitError(office, 'schedulingDesk', 0, 3)).toMatch(/room for one/);
  });

  it('comes to the hiring pool without changing who is drawn before them', () => {
    const s = createInitialState(1);
    const pool = generateCandidates(s, new Rng(7), 1980);
    const schedulers = pool.filter((p) => p.role === 'scheduler');
    expect(schedulers).toHaveLength(SCHEDULER_CANDIDATES);
    for (const p of schedulers) {
      expect(p.salary).toBeGreaterThanOrEqual(SALARY.scheduler.min);
      expect(p.salary).toBeLessThanOrEqual(SALARY.scheduler.max * 1.5);
    }
    // Everybody else comes in the order they did, with the schedulers right after the recruiters.
    // (The guards of 0.18.0 come right after the schedulers, and the lawyers of 0.19.0 after the guards.)
    const roles = pool.map((p) => p.role).filter((r) => r !== 'lawyer' && r !== 'callAgent').slice(0, -GUARD_CANDIDATES);
    expect(roles.slice(-SCHEDULER_CANDIDATES)).toEqual(Array(SCHEDULER_CANDIDATES).fill('scheduler'));
    expect(roles.slice(-SCHEDULER_CANDIDATES - 1)[0]).toBe('recruiter');
    expect(new Set(pool.map((p) => p.id)).size).toBe(pool.length);
  });
});
