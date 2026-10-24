import { describe, expect, it } from 'vitest';
import { STUDIO_REQUIREMENTS, type FurnitureType, type RoomType } from '../config/office';
import { buildRoom, callChannelMeeting, callMeeting, hire, setChannelMeetingMinutes, setMeetingMinutes, setMonthlyChannelMeeting, type ActionResult } from './actions';
import { sensibleBot } from './bots';
import { addMissingEquipment, autoPlaceFurniture } from './fixtures';
import { priorityOf, subjectOf } from './inbox';
import { minutesOf, type MinutesFacts } from './minutes';
import { createInitialState } from './newGame';
import { proposeRoom } from './rooms';
import { fromSaveFile, SAVE_VERSION, toSaveFile } from './save';
import type { Employee, GameState, Person } from './state';
import { TEAMS, TEAM_IDS } from './teams';
import { advance, tick } from './tick';
import { unlockAll } from './unlocks';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}

/** A radio station a month on the air, with everything open and money to spare. Its channel has a manager at a desk. */
const station = (): GameState => {
  const s = structuredClone(unlockAll(advance(sensibleBot(createInitialState(1)), 30)));
  s.money = 5_000_000;
  s.floorsUnlocked = 2;
  return s;
};

function hirePerson(state: GameState, person: Partial<Person> & Pick<Person, 'role'>): GameState {
  const s = structuredClone(state);
  const id = `p-${s.nextId++}`;
  s.candidates.push({ id, name: `Test ${person.role} ${id}`, skill: 50, salary: 2_000, specialties: [], fame: 0, department: null, ...person });
  return ok(hire(s, id));
}

function room(state: GameState, type: RoomType, ...extra: FurnitureType[]): GameState {
  const floor = [1, 2].find((f) => proposeRoom(state, f, type))!;
  let s = ok(buildRoom(state, { ...proposeRoom(state, floor, type)!, type }));
  const id = s.lastId!;
  if (STUDIO_REQUIREMENTS[type]) s = ok(addMissingEquipment(s, id));
  for (const piece of extra) s = ok(autoPlaceFurniture(s, id, piece));
  return s;
}

const withMeetingRoom = () => room(station(), 'meetingRoom');

/** The station with a manager of Sales at a desk and a salesman, and a meeting room. */
function withSales(): GameState {
  let s = hirePerson(withMeetingRoom(), { role: 'manager', department: 'sales' });
  s = ok(autoPlaceFurniture(s, s.rooms.find((r) => r.type === 'managementOffice')!.roomId, 'managerDesk'));
  return hirePerson(s, { role: 'sales' });
}

const person = (n: number): Employee => ({ id: `e-${n}`, name: `Person ${n}`, role: 'sales', morale: 60 }) as Employee;

const facts = (members: Employee[], over: Partial<MinutesFacts> = {}): MinutesFacts => ({
  of: { team: 'sales' },
  inText: TEAMS.sales.inText,
  leader: person(0),
  members,
  room: { name: 'Meeting room 1', seats: 6, flipChart: false, cleanliness: 100 },
  next: null,
  ...over,
});

describe('the minutes of a meeting (0.20.0, #151)', () => {
  it('a channel’s meeting sends one low-priority e-mail, from the channel manager', () => {
    const s = withMeetingRoom();
    const before = s.messages.length;
    const met = ok(callChannelMeeting(s, s.channels[0]!.id));
    expect(met.messages).toHaveLength(before + 1);
    const mail = met.messages.at(-1)!;
    const manager = met.employees.find((e) => e.id === met.channels[0]!.managerId)!;
    expect(mail.from.name).toBe(manager.name);
    expect(priorityOf(mail)).toBe('low');
    expect(mail.about).toBeUndefined();
    expect(mail.text).toMatch(/^Minutes of the meeting of the production team of /);
    expect(mail.text).toMatch(/Present: .*with me in the chair/);
  });

  it('a team’s meeting is minuted by the head of its department', () => {
    const s = withSales();
    const met = ok(callMeeting(s, 'sales'));
    const mail = met.messages.at(-1)!;
    const head = met.employees.find((e) => e.role === 'manager' && e.department === 'sales')!;
    expect(mail.from.name).toBe(head.name);
    expect(mail.from.title).toBe('Head of Sales');
    expect(mail.text).toMatch(/Item 1: .*(offer|tray)/);
  });

  it('the tick turns them off, and an older save has them on', () => {
    const s = withMeetingRoom();
    const channel = s.channels[0]!.id;
    const before = s.messages.length;
    const quiet = ok(callChannelMeeting(ok(setChannelMeetingMinutes(s, channel, false)), channel));
    expect(quiet.messages).toHaveLength(before);
    expect(quiet.channelMeetings[channel]!.minutes).toBe(false);
    const sales = withSales();
    expect(ok(callMeeting(ok(setMeetingMinutes(sales, 'sales', false)), 'sales')).messages).toHaveLength(sales.messages.length);

    const old = JSON.parse(JSON.stringify(toSaveFile(ok(setMonthlyChannelMeeting(s, channel, true)), 1)));
    old.version = SAVE_VERSION - 1;
    delete old.state.channelMeetings[channel].minutes;
    expect(fromSaveFile(old).state.channelMeetings[channel]!.minutes).toBe(true);
  });

  it('a monthly meeting sends minutes that name the next date', () => {
    const ready = withMeetingRoom();
    const next = tick(ok(setMonthlyChannelMeeting(ready, ready.channels[0]!.id, true)));
    expect(next.messages.find((m) => m.text.startsWith('Minutes of'))!.text).toMatch(/Next meeting: /);
  });

  it('the same state always gives the same text and draws no random numbers', () => {
    const s = withMeetingRoom();
    const rng = s.rngState;
    const a = ok(callChannelMeeting(s, s.channels[0]!.id));
    const b = ok(callChannelMeeting(s, s.channels[0]!.id));
    expect(a.messages.at(-1)!.text).toBe(b.messages.at(-1)!.text);
    expect(a.rngState).toBe(rng);
  });

  it('a team of 2 and a team of 30 both read correctly', () => {
    const s = createInitialState(1);
    expect(minutesOf(s, facts([person(1), person(2)]))).toContain('Present: Person 1 and Person 2, with me in the chair. 6 seats for 2 of us.');
    const many = Array.from({ length: 30 }, (_, i) => person(i + 1));
    expect(minutesOf(s, facts(many))).toContain('Present: Person 1, Person 2, Person 3 and 27 others, with me in the chair. 6 seats for 30 of us, so some stood.');
    expect(minutesOf(s, facts(many.slice(0, 4)))).toContain('and 1 other,');
  });

  it('the subject stays short for every team, and for a channel with a long name', () => {
    const s = createInitialState(1);
    for (const team of TEAM_IDS) expect(subjectOf(minutesOf(s, facts([person(1)], { of: { team }, inText: TEAMS[team].inText }))).length).toBeLessThanOrEqual(60);
    const long = facts([person(1)], { of: { channelId: 'c-1' }, inText: 'the production team of The Very Long Named Broadcasting Company' });
    expect(subjectOf(minutesOf(s, long)).length).toBeLessThanOrEqual(60);
  });

  it('the leader’s morale and the room show in the text', () => {
    const s = createInitialState(1);
    const low = minutesOf(s, facts([person(1)], { leader: { ...person(0), morale: 10 } }));
    const high = minutesOf(s, facts([person(1)], { leader: { ...person(0), morale: 95 } }));
    expect(low).not.toBe(high);
    expect(minutesOf(s, facts([person(1)], { next: s.day + 30 }))).toContain('Next meeting: ');
    expect(minutesOf(s, facts([person(1)]))).toContain('No date set for the next one.');
  });
});
