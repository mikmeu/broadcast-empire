import { describe, expect, it } from 'vitest';
import { MEETINGS } from '../config/balance';
import { STUDIO_REQUIREMENTS, type FurnitureType, type RoomType, SEATS_PER_MEETING_TABLE } from '../config/office';
import { buildRoom, buyLicense, callChannelMeeting, callMeeting, createChannel, hire, setChannelManager, setMonthlyChannelMeeting, setMonthlyMeeting, type ActionResult } from './actions';
import { growthBot, sensibleBot } from './bots';
import { engineeredShows, showQuality } from './broadcast';
import { addMissingEquipment, autoPlaceFurniture, withoutRecordRooms } from './fixtures';
import { channelMeetingBlocker, channelMeetingLiftToday, meetingBlocker, meetingLiftToday } from './morale';
import { createInitialState } from './newGame';
import { employeesWithDesk } from './office';
import { proposeRoom } from './rooms';
import { fromSaveFile, toSaveFile } from './save';
import type { GameState, Id, Person, Show } from './state';
import { TEAMS, channelMembers, crewOf, departmentMembers, inMeeting, meetingFactor, meetingLift, teamMembers } from './teams';
import { advance, tick } from './tick';
import { unlockAll } from './unlocks';
import { moraleTarget } from './upkeep';
import { departmentPower } from './staff';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}
const error = (result: ActionResult) => (result.ok ? 'no error' : result.error);

/** A radio station from the sensible test player, a month on the air, with everything open, money to spare and two floors. Its channel has a manager at a desk. */
const station = (): GameState => {
  const s = structuredClone(unlockAll(advance(sensibleBot(createInitialState(1)), 30)));
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

/** Builds a room of a kind where the game proposes it, with everything on its checklist and more pieces. Its id is `lastId`. */
function room(state: GameState, type: RoomType, ...extra: FurnitureType[]): GameState & { lastId?: string } {
  const floor = [1, 2].find((f) => proposeRoom(state, f, type))!;
  let s = ok(buildRoom(state, { ...proposeRoom(state, floor, type)!, type }));
  const id = s.lastId!;
  if (STUDIO_REQUIREMENTS[type]) s = ok(addMissingEquipment(s, id));
  for (const piece of extra) s = ok(autoPlaceFurniture(s, id, piece));
  return Object.assign(s, { lastId: id });
}

/** A second radio channel with a license and a channel manager of its own at a desk, and nothing on its schedule. Its id is `lastId`. */
function secondChannel(state: GameState): GameState & { lastId?: string } {
  let s = ok(createChannel(state, { name: 'Second', logo: { shape: 'square', color: '#000', initials: 'S2' }, medium: 'radio' }));
  const id = s.lastId!;
  s = ok(buyLicense(s, id, 'capital'));
  s = hirePerson(s, { role: 'channelManager' });
  const manager = s.lastId!;
  s = ok(autoPlaceFurniture(s, s.rooms.find((r) => r.type === 'managementOffice')!.roomId, 'managerDesk'));
  return Object.assign(ok(setChannelManager(s, id, manager)), { lastId: id });
}

/** Puts a made-up show with these production staff in a slot of a channel. Who meets with whom reads only the shows and the schedules. */
function onSchedule(state: GameState, channelId: Id, slot: number, staffIds: Id[]): GameState {
  const s = structuredClone(state);
  const id = `show-${s.nextId++}`;
  const show: Show = { id, name: `Test show ${id}`, genre: s.shows.find((x) => x.studioId)!.genre, hostId: null, staffIds, writerIds: [], editorIds: [], studioId: null, freshness: 1, tone: 'normal' };
  s.shows.push(show);
  s.channels.find((c) => c.id === channelId)!.schedule[slot] = id;
  return s;
}

/** The station with a meeting room. */
const withMeetingRoom = () => room(station(), 'meetingRoom');

describe('version 0.17.0', () => {
  describe('the channel manager leads the production team of the channel (#47)', () => {
    it('the hosts have no meetings any more', () => {
      const s = withMeetingRoom();
      expect(TEAMS.hosts.ledBy).toBeNull();
      expect(meetingBlocker(s, 'hosts')).toMatch(/no meetings for the hosts/);
      expect(error(setMonthlyMeeting(s, 'hosts', true))).toMatch(/no meetings/);
      expect(error(callMeeting(s, 'hosts'))).toMatch(/no meetings/);
    });

    it('everyone in production on the channel’s shows meets with its manager; the rest with the manager of Production', () => {
      let s = station();
      const channel = s.channels[0]!;
      const scheduled = s.shows.filter((x) => channel.schedule.includes(x.id));
      const engineered = engineeredShows(s, employeesWithDesk(s));
      const onShows = new Set(scheduled.flatMap((x) => [...x.staffIds, ...x.writerIds, ...x.editorIds, ...(engineered.has(x.id) ? [engineered.get(x.id)!.engineerId] : [])]));
      expect(onShows.size).toBeGreaterThan(0);
      expect(new Set(channelMembers(s, channel.id).map((e) => e.id))).toEqual(onShows);
      // Someone on no show stays with the department.
      const hired = hirePerson(s, { role: 'production' });
      const spare = hired.lastId!;
      s = hired;
      expect(crewOf(s, s.employees.find((e) => e.id === spare)!)).toBeNull();
      const department = departmentMembers(s, 'production').map((e) => e.id);
      expect(department).toContain(spare);
      expect(department.filter((id) => onShows.has(id))).toEqual([]);
      // The hosts and the other teams meet with nobody's channel.
      const host = s.employees.find((e) => e.role === 'host')!;
      expect(crewOf(s, host)).toBeNull();
    });

    it('with everyone in production on a channel, Production has no meeting of its own', () => {
      let s = withMeetingRoom();
      s = hirePerson(s, { role: 'manager', department: 'production' });
      s = ok(autoPlaceFurniture(s, s.rooms.find((r) => r.type === 'managementOffice')!.roomId, 'managerDesk'));
      const spare = new Set(departmentMembers(s, 'production').map((e) => e.id));
      s = { ...s, employees: s.employees.filter((e) => !spare.has(e.id)) };
      expect(departmentMembers(s, 'production')).toEqual([]);
      expect(meetingBlocker(s, 'production')).toBe('Everyone in production meets with their channel manager.');
      expect(channelMeetingBlocker(s, s.channels[0]!.id)).toBeNull();
    });

    it('a channel manager with no desk leaves the channel’s staff to the manager of Production', () => {
      const s = withMeetingRoom();
      for (const r of s.rooms) r.furniture = r.furniture.filter((f) => f.type !== 'managerDesk');
      const channel = s.channels[0]!.id;
      expect(channelMembers(s, channel)).toEqual([]);
      expect(departmentMembers(s, 'production')).toEqual(teamMembers(s, 'production'));
      expect(channelMeetingBlocker(s, channel)).toMatch(/called by its channel manager, at a desk/);
      const unmanaged = structuredClone(s);
      unmanaged.channels[0]!.managerId = null;
      expect(channelMeetingBlocker(unmanaged, channel)).toMatch(/channel manager, at a desk/);
    });

    it('someone on two channels meets with the one with most of their shows, the first on a tie', () => {
      let s = secondChannel(station());
      const first = s.channels[0]!.id;
      const second = s.lastId!;
      s = hirePerson(s, { role: 'production' });
      const id = s.lastId!;
      const who = () => s.employees.find((e) => e.id === id)!;
      const tie = onSchedule(onSchedule(s, first, 0, [id]), second, 0, [id]);
      expect(crewOf(tie, who())).toBe(first);
      const more = onSchedule(tie, second, 1, [id]);
      expect(crewOf(more, who())).toBe(second);
      // A channel with nobody running it does not count.
      const unmanaged = structuredClone(more);
      unmanaged.channels.find((c) => c.id === second)!.managerId = null;
      expect(crewOf(unmanaged, who())).toBe(first);
    });

    it('the audio engineer who looks after a show is on its channel’s production team', () => {
      let s = room(station(), 'audioRoom');
      s = hirePerson(s, { role: 'engineer', skill: 60 });
      const engineer = s.lastId!;
      s = tick(s);
      const looked = [...engineeredShows(s, employeesWithDesk(s))].find(([, x]) => x.engineerId === engineer);
      expect(looked).toBeDefined();
      const channel = s.channels.find((c) => c.schedule.includes(looked![0]))!;
      expect(crewOf(s, s.employees.find((e) => e.id === engineer)!)).toBe(channel.id);
    });

    it('a channel’s meeting lifts its people and costs them half a day; the others are not in it', () => {
      let s = withMeetingRoom();
      s = hirePerson(s, { role: 'production' });
      const spare = s.lastId!;
      const channel = s.channels[0]!.id;
      const crew = channelMembers(s, channel).length;
      const lift = channelMeetingLiftToday(s, channel);
      expect(lift).toBeGreaterThan(0);
      const met = ok(callChannelMeeting(s, channel));
      expect(met.channelMeetings[channel]).toEqual({ on: s.day, lift, monthly: false, minutes: true });
      expect(met.meetings.production).toBeUndefined();
      expect(crew).toBe(channelMembers(met, channel).length);
      const producer = channelMembers(met, channel).find((e) => e.role === 'production')!;
      const other = met.employees.find((e) => e.id === spare)!;
      expect(inMeeting(met, producer)).toBe(true);
      expect(meetingFactor(met, producer)).toBe(MEETINGS.workOnTheDay);
      expect(meetingLift(met, producer)).toBe(lift);
      expect(inMeeting(met, other)).toBe(false);
      expect(meetingLift(met, other)).toBe(0);
      const desked = employeesWithDesk(met);
      expect(moraleTarget(met, producer, desked) - moraleTarget(s, producer, desked)).toBeCloseTo(lift);
      // The shows they make are worse that day.
      const show = met.shows.find((x) => met.channels[0]!.schedule.includes(x.id) && x.staffIds.includes(producer.id))!;
      expect(showQuality(met, show).production).toBeCloseTo(showQuality(s, show).production * MEETINGS.workOnTheDay);
      // The lift ends after MEETINGS.lasts days.
      expect(meetingLift({ ...met, day: met.day + MEETINGS.lasts }, producer)).toBe(0);
      expect(channelMeetingBlocker({ ...met, day: met.day + 1 }, channel)).toMatch(/next meeting/);
    });

    it('a meeting room holds one meeting a day, of a team or of a channel', () => {
      let s = withMeetingRoom();
      s = hirePerson(s, { role: 'production' });
      s = hirePerson(s, { role: 'manager', department: 'production' });
      s = ok(autoPlaceFurniture(s, s.rooms.find((r) => r.type === 'managementOffice')!.roomId, 'managerDesk'));
      const channel = s.channels[0]!.id;
      expect(meetingLiftToday(s, 'production')).toBeGreaterThan(0);
      const team = ok(callMeeting(s, 'production'));
      expect(channelMeetingBlocker(team, channel)).toMatch(/taken today/);
      const crew = ok(callChannelMeeting(s, channel));
      expect(meetingBlocker(crew, 'production')).toMatch(/taken today/);
      // A second meeting room holds the second meeting.
      expect(channelMeetingBlocker(room(team, 'meetingRoom'), channel)).toBeNull();
    });

    it('a channel’s production team meets every month by itself', () => {
      const ready = withMeetingRoom();
      const channel = ready.channels[0]!.id;
      const s = ok(setMonthlyChannelMeeting(ready, channel, true));
      const next = tick(s);
      expect(next.channelMeetings[channel]).toMatchObject({ on: s.day, monthly: true });
      expect(advance(next, MEETINGS.every).channelMeetings[channel]!.on).toBe(s.day + MEETINGS.every);
      expect(error(setMonthlyChannelMeeting(s, 'nowhere', true))).toMatch(/doesn’t exist/);
    });

    it('the test player that looks after its staff has the production team of every managed channel meet each month', () => {
      let s = createInitialState(1);
      // Every managed channel meets: the second station may come up in the same month as the meeting room, after the bot has looked at its staff (the library for its records, 0.18.0, moved the meeting room to the second floor), so the bot is given until the month after.
      const managed = (x: GameState) => x.channels.filter((c) => c.managerId);
      const meets = (x: GameState) => managed(x).length > 0 && managed(x).every((c) => x.channelMeetings[c.id]?.monthly);
      for (let day = 0; day < 3 * 365 && !s.bankrupt && !meets(s); day++) s = tick(growthBot(s));
      expect(s.bankrupt).toBe(false);
      expect(meets(s)).toBe(true);
      for (const channel of s.channels.filter((c) => c.managerId)) expect(s.channelMeetings[channel.id]?.monthly).toBe(true);
    });
  });

  it('loads a game saved in 0.16.0: the hosts’ meetings go, and no channel has met', () => {
    const s = station();
    s.meetings = { hosts: { on: s.day, lift: 8, monthly: true, minutes: true }, production: { on: s.day, lift: 5, monthly: true, minutes: true } };
    const old = JSON.parse(JSON.stringify(toSaveFile(s, 0)));
    delete old.state.channelMeetings;
    const { state } = fromSaveFile({ ...old, version: 32 });
    expect(state.channelMeetings).toEqual({});
    expect(state.meetings).toEqual({ production: { on: s.day, lift: 5, monthly: true, minutes: true } });
    expect(tick(state).day).toBe(state.day + 1);
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

describe('version 0.15.0', () => {
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
      expect(met.meetings.production).toEqual({ on: s.day, lift, monthly: false, minutes: true });
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
});
}
