import { describe, expect, it } from 'vitest';
import { CLERK_CANDIDATES, COOK_CANDIDATES, COOKS, ENGINEER_CANDIDATES, ENGINEERS, FRESHNESS_DECAY, MEETINGS, MORALE, POST, STRIKES, SUPPORT } from '../config/balance';
import { getGenre } from '../config/genres';
import { LINES } from '../config/guide';
import { SEATS_PER_MEETING_TABLE, STUDIO_REQUIREMENTS, type FurnitureType, type RoomType } from '../config/office';
import { TO_RECORD } from '../config/voiceOver';
import { ROOF_ASSETS } from '../office/assets';
import { peopleAt, whereaboutsOf } from '../office/layout';
import { buildRoom, callMeeting, endStrike, hire, setMonthlyMeeting, type ActionResult } from './actions';
import { sensibleBot } from './bots';
import { engineeredShows, isEngineered, showQuality } from './broadcast';
import { runCheat } from './cheats';
import { addMissingEquipment, autoPlaceFurniture, withoutRecordRooms } from './fixtures';
import { generateCandidates } from './generate';
import { guideView } from './guide';
import { meetingBlocker, runUnrest, strikeBonus, strikeDay } from './morale';
import { createInitialState } from './newGame';
import { employeesWithDesk } from './office';
import { Rng } from './rng';
import { proposeRoom } from './rooms';
import { fromSaveFile, toSaveFile } from './save';
import { departmentPower } from './staff';
import type { GameState, Person, TeamId } from './state';
import { TEAMS, TEAM_IDS, isStriking, teamMembers, teamOf } from './teams';
import { advance, tick } from './tick';
import { unlockAll } from './unlocks';
import { canteenCoverage, hotMealCoverage, moraleTarget, postCoverage, sharedMorale, upkeepLoad } from './upkeep';

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

/** Everyone in a team at this morale. */
function setMorale(state: GameState, team: TeamId, morale: number): void {
  for (const e of teamMembers(state, team)) e.morale = morale;
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

  describe('meetings (R106)', () => {
    /** The station with nobody running its channel, so that its production staff meet with the manager of Production (0.17.0). */
    const unmanaged = () => {
      const s = station();
      for (const channel of s.channels) channel.managerId = null;
      return s;
    };

    /** That station with a meeting room and a production manager at a desk. */
    const ready = () => {
      let s = room(unmanaged(), 'meetingRoom');
      s = hirePerson(s, { role: 'manager', department: 'production', skill: 60 });
      return ok(autoPlaceFurniture(s, s.rooms.find((r) => r.type === 'managementOffice')!.roomId, 'managerDesk'));
    };

    it('need a meeting room, and a manager to call them', () => {
      const s = unmanaged();
      expect(meetingBlocker(s, 'production')).toMatch(/meeting room/);
      expect(meetingBlocker(room(s, 'meetingRoom'), 'production')).toMatch(/manager/);
      expect(meetingBlocker(ready(), 'production')).toBeNull();
      expect(meetingBlocker(ready(), 'support')).toMatch(/no meetings/);
      expect(TEAMS.support.ledBy).toBeNull();
    });

    it('lift the team’s morale for a month, and cost part of the day’s work', () => {
      const s = ready();
      const met = ok(callMeeting(s, 'production'));
      const people = teamMembers(met, 'production').length;
      const lift = Math.round(MEETINGS.morale * Math.min(1, SEATS_PER_MEETING_TABLE / people) * 10) / 10;
      expect(met.meetings.production).toEqual({ on: s.day, lift, monthly: false });
      const producer = met.employees.find((e) => e.role === 'production')!;
      const salesperson = met.employees.find((e) => e.role === 'sales');
      const desked = employeesWithDesk(met);
      expect(moraleTarget(met, producer, desked) - moraleTarget(s, producer, desked)).toBeCloseTo(lift);
      if (salesperson) expect(moraleTarget(met, salesperson, desked)).toBeCloseTo(moraleTarget(s, salesperson, desked));
      // While they sit, the shows they make are worse that day.
      const show = met.shows.find((x) => x.staffIds.length > 0)!;
      expect(showQuality(met, show).production).toBeCloseTo(showQuality(s, show).production * MEETINGS.workOnTheDay);
      // The lift ends after MEETINGS.lasts days.
      const later = { ...met, day: met.day + MEETINGS.lasts };
      expect(moraleTarget(later, producer, desked)).toBeCloseTo(moraleTarget({ ...s, day: later.day }, producer, desked));
    });

    it('come once a month, one a day in each meeting room', () => {
      let s = ready();
      s = hirePerson(s, { role: 'manager', department: 'sales' });
      s = ok(autoPlaceFurniture(s, s.rooms.find((r) => r.type === 'managementOffice')!.roomId, 'managerDesk'));
      if (teamMembers(s, 'sales').length === 0) s = hirePerson(s, { role: 'sales' });
      const met = ok(callMeeting(s, 'production'));
      expect(meetingBlocker(met, 'production')).toMatch(/met today/);
      expect(meetingBlocker(met, 'sales')).toMatch(/taken today/);
      expect(meetingBlocker({ ...met, day: met.day + 1 }, 'production')).toMatch(/next meeting/);
      expect(meetingBlocker({ ...met, day: met.day + MEETINGS.every }, 'production')).toBeNull();
      // A second meeting room holds a second meeting.
      expect(meetingBlocker(room(met, 'meetingRoom'), 'sales')).toBeNull();
    });

    it('can be held every month by themselves', () => {
      const s = ok(setMonthlyMeeting(ready(), 'production', true));
      const next = tick(s);
      expect(next.meetings.production).toMatchObject({ on: s.day, monthly: true });
      const month = advance(next, MEETINGS.every);
      expect(month.meetings.production!.on).toBe(s.day + MEETINGS.every);
    });

    it('cost a department part of its work on the day', () => {
      let s = room(station(), 'meetingRoom');
      s = hirePerson(s, { role: 'manager', department: 'sales' });
      s = ok(autoPlaceFurniture(s, s.rooms.find((r) => r.type === 'managementOffice')!.roomId, 'managerDesk'));
      s = hirePerson(s, { role: 'sales' });
      s = ok(autoPlaceFurniture(s, s.rooms.find((r) => r.type === 'office')!.roomId, 'workstation'));
      const before = departmentPower(s, 'sales', employeesWithDesk(s));
      expect(before).toBeGreaterThan(0);
      const met = ok(callMeeting(s, 'sales'));
      expect(departmentPower(met, 'sales', employeesWithDesk(met))).toBeCloseTo(before * MEETINGS.workOnTheDay);
    });
  });

  describe('strikes (R122)', () => {
    /** Runs the daily check for strikes `days` times with a team's morale held where it is. */
    const unrest = (state: GameState, team: TeamId, morale: number, days: number) => {
      const s = structuredClone(state);
      for (let i = 0; i < days; i++) {
        setMorale(s, team, morale);
        runUnrest(s);
        s.day += 1;
      }
      return s;
    };

    it('come after a warning, unless morale recovers', () => {
      const s = station();
      const low = unrest(s, 'production', 20, STRIKES.warnAfter + 1);
      expect(low.unrest.production).toMatchObject({ since: s.day, warnedOn: s.day + STRIKES.warnAfter, strikeUntil: null });
      expect(low.messages.at(-1)).toMatchObject({ kind: 'warning', about: 'staff' });
      expect(low.messages.at(-1)!.text).toMatch(/threaten to strike/);
      // Better in time: the threat is off.
      const calm = unrest(low, 'production', STRIKES.recover, 1);
      expect(calm.unrest.production).toBeUndefined();
      expect(calm.messages.at(-1)!.text).toMatch(/threat of a strike is off/);
      // Still low on the day: they walk out.
      const out = unrest(low, 'production', 20, STRIKES.strikeAfter);
      expect(isStriking(out, 'production')).toBe(true);
      expect(out.unrest.production!.strikeUntil).toBe(strikeDay(low.unrest.production!.warnedOn!) + 1 + STRIKES.days);
      expect(out.messages.at(-1)).toMatchObject({ kind: 'danger', about: 'staff' });
      // Morale between the two lines keeps the team where it is.
      expect(unrest(low, 'production', (STRIKES.below + STRIKES.recover) / 2, 30).unrest.production).toMatchObject({ strikeUntil: null });
    });

    it('stop everything the team does', () => {
      const start = station();
      const s = start.employees.some((e) => e.role === 'cleaner') ? start : hirePerson(start, { role: 'cleaner' });
      const out = (team: TeamId) => ok(runCheat(s, `strike ${team}`) as ActionResult);
      // Production: nothing is made, and nobody sits at a workstation.
      const production = out('production');
      const show = production.shows.find((x) => x.staffIds.length > 0)!;
      expect(showQuality(production, show).problems).toContain('The production team is on strike');
      expect(teamMembers(production, 'production').some((e) => employeesWithDesk(production).has(e.id))).toBe(false);
      // Hosts: their shows go to reruns.
      const hosts = out('hosts');
      const hosted = hosts.shows.find((x) => x.hostId)!;
      expect(showQuality(hosts, hosted).problems).toContain('The host is on strike');
      const aired = tick(hosts).lastDay!.channels.filter((c) => c.isPlayer).flatMap((c) => c.slots);
      expect(aired.some((slot) => slot.showId === hosted.id)).toBe(false);
      // Support: nobody cleans.
      const support = out('support');
      expect(upkeepLoad(support, employeesWithDesk(support)).cleaning.capacity).toBe(0);
      // Strikers stay at home.
      const striker = teamMembers(production, 'production')[0]!;
      expect(peopleAt(production).has(striker.id)).toBe(false);
      expect(whereaboutsOf(production, striker.id, 0)).toMatch(/On strike/);
    });

    it('end with a bonus, or by themselves, and leave the team happier', () => {
      const s = ok(runCheat(station(), 'strike production') as ActionResult);
      const bonus = strikeBonus(s, 'production');
      expect(bonus).toBe(Math.round(teamMembers(s, 'production').reduce((sum, e) => sum + e.salary * STRIKES.bonusMonths, 0) / 100) * 100);
      const paid = ok(endStrike(s, 'production'));
      expect(paid.money).toBe(s.money - bonus);
      expect(paid.ledger.salaries).toBe(s.ledger.salaries + bonus);
      expect(isStriking(paid, 'production')).toBe(false);
      const before = teamMembers(s, 'production')[0]!;
      expect(paid.employees.find((e) => e.id === before.id)!.morale).toBeCloseTo(Math.min(100, before.morale + STRIKES.moraleAfter));
      expect(endStrike(paid, 'production').ok).toBe(false);
      // Left alone, it is over after STRIKES.days.
      const waited = advance(s, STRIKES.days);
      expect(isStriking(waited, 'production')).toBe(false);
      expect(waited.messages.some((m) => /strike is over/.test(m.text))).toBe(true);
    });

    it('do not touch the managers', () => {
      expect(teamOf('manager')).toBeNull();
      expect(teamOf('channelManager')).toBeNull();
      expect(TEAM_IDS.flatMap((t) => TEAMS[t].roles)).toHaveLength(new Set(TEAM_IDS.flatMap((t) => TEAMS[t].roles)).size);
    });
  });

  describe('audio engineers (R47)', () => {
    it('make the radio shows they look after wear more slowly', () => {
      const base = station();
      let s = room(base, 'audioRoom');
      s = hirePerson(s, { role: 'engineer', skill: 60 });
      const engineer = s.lastId!;
      const desked = employeesWithDesk(s);
      expect(desked.has(engineer)).toBe(true);
      const looked = engineeredShows(s, desked);
      const radio = s.shows.filter((x) => isEngineered(getGenre(x.genre)) && s.channels.some((c) => c.schedule.includes(x.id)));
      expect(looked.size).toBe(Math.min(ENGINEERS.showsEach, radio.length));
      const [showId, { slower }] = [...looked][0]!;
      expect(slower).toBeGreaterThan(0);
      expect(slower).toBeLessThanOrEqual(ENGINEERS.slower);
      // The show loses that much less freshness the next day it airs.
      const fresh = (x: GameState) => x.shows.find((y) => y.id === showId)!.freshness;
      const lost = fresh(s) - fresh(tick(s));
      expect(lost).toBeCloseTo(FRESHNESS_DECAY * (1 - slower), 6);
      // The shows with the most listeners first.
      const heard = new Map<string, number>();
      for (const slot of s.lastDay!.channels.filter((c) => c.isPlayer).flatMap((c) => c.slots)) if (slot.showId) heard.set(slot.showId, Math.max(heard.get(slot.showId) ?? 0, slot.listeners));
      const least = Math.min(...[...looked.keys()].map((id) => heard.get(id) ?? 0));
      expect(radio.filter((x) => !looked.has(x.id)).every((x) => (heard.get(x.id) ?? 0) <= least)).toBe(true);
    });

    it('do nothing without an audio desk', () => {
      const s = hirePerson(station(), { role: 'engineer' });
      expect(engineeredShows(s, employeesWithDesk(s)).size).toBe(0);
    });
  });

  it('brings audio engineers, cooks and clerks into the hiring pool', () => {
    const s = createInitialState(1);
    const pool = generateCandidates(s, new Rng(7), 1980);
    expect(pool.filter((p) => p.role === 'engineer')).toHaveLength(ENGINEER_CANDIDATES);
    expect(pool.filter((p) => p.role === 'cook')).toHaveLength(COOK_CANDIDATES);
    expect(pool.filter((p) => p.role === 'clerk')).toHaveLength(CLERK_CANDIDATES);
    expect(new Set(pool.map((p) => p.id)).size).toBe(pool.length);
  });

  it('has a roof with an antenna, and a dish for the satellite uplink (R44)', () => {
    expect(ROOF_ASSETS.antenna.length).toBeGreaterThan(0);
    expect(ROOF_ASSETS.dish.length).toBeGreaterThan(0);
  });

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

  it('loads a game saved in 0.14.0 with no meetings and nobody unhappy', () => {
    const old = JSON.parse(JSON.stringify(toSaveFile(station(), 0)));
    delete old.state.meetings;
    delete old.state.unrest;
    const { state } = fromSaveFile({ ...old, version: 30 });
    expect(state.meetings).toEqual({});
    expect(state.unrest).toEqual({});
    expect(tick(state).day).toBe(state.day + 1);
  });
});
