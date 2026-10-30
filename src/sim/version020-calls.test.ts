import { describe, expect, it } from 'vitest';
import { CALL_AGENT_CANDIDATES, CALLS, MAIL, SALARY, VOTES } from '../config/balance';
import { HINTS } from '../config/guide';
import { FURNITURE, ROOM_TYPE_NAMES } from '../config/office';
import { TO_RECORD } from '../config/voiceOver';
import { SLOTS } from '../config/world';
import { buildRoom, buyLicense, createChannel, createShow, hire, scheduleShow, setChannelManager, type ActionResult } from './actions';
import { sensibleBot } from './bots';
import { callCapacity, callInAppeal, callInShare, dayCalls, mailLift, overloaded, unanswered } from './calls';
import { callInSlots, simulateDay } from './broadcast';
import { addMissingEquipment, autoPlaceFurniture, withoutRecordRooms } from './fixtures';
import { generateCandidates } from './generate';
import { createInitialState } from './newGame';
import { employeesWithDesk } from './office';
import { checkVotes } from './regulator';
import { Rng } from './rng';
import { proposeRoom } from './rooms';
import { fromSaveFile, SAVE_VERSION, toSaveFile } from './save';
import { advance } from './tick';
import type { CallsDay, DayResult, GameState, Person } from './state';
import { unlockAll } from './unlocks';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}

/** A radio station from the sensible test player, a month on the air, with everything open and money to spare. */
const station = (): GameState => {
  const s = structuredClone(unlockAll(advance(sensibleBot(createInitialState(1)), 30)));
  s.money = 5_000_000;
  s.floorsUnlocked = Math.max(s.floorsUnlocked, 2);
  return s;
};

/** Hires a made-up person straight from the pool. */
function hirePerson(state: GameState, person: Partial<Person> & Pick<Person, 'role'>): GameState & { lastId?: string } {
  const s = structuredClone(state);
  const id = `p-${s.nextId++}`;
  s.candidates.push({ id, name: 'Test Person', skill: 80, salary: 2_000, specialties: [], fame: 0, department: null, foundFor: null, ...person });
  return Object.assign(ok(hire(s, id)), { lastId: id });
}

/** The station with a TV channel and a game show in the evening, in a studio of its own; researched, so that viewers may vote. */
function gameShowNight(): GameState & { showId: string; tvId: string } {
  const base = structuredClone(withoutRecordRooms(unlockAll(advance(sensibleBot(createInitialState(1)), 30))));
  base.money = 3_000_000;
  base.floorsUnlocked = 2;
  let s: GameState & { lastId?: string } = ok(createChannel(base, { name: 'Test TV', logo: { shape: 'square', color: '#000', initials: 'TV' }, medium: 'tv' }));
  const tvId = s.lastId!;
  s = ok(buyLicense(s, tvId, 'capital'));
  s = hirePerson(s, { role: 'channelManager' });
  const manager = s.lastId!;
  s = ok(autoPlaceFurniture(s, s.rooms.find((r) => r.type === 'managementOffice')!.roomId, 'managerDesk'));
  s = ok(setChannelManager(s, tvId, manager));
  s.techs.push('gameShowFormat');
  const place = proposeRoom(s, 2, 'tvGameStudio')!;
  s = ok(buildRoom(s, { ...place, w: 9, h: 7, door: { x: place.door.x, z: place.y + 7 }, type: 'tvGameStudio' }));
  const studio = s.lastId!;
  s = ok(addMissingEquipment(s, studio));
  s = hirePerson(s, { role: 'host', specialties: ['gameShow'] });
  const host = s.lastId!;
  s = hirePerson(s, { role: 'production' });
  const producer = s.lastId!;
  s = ok(autoPlaceFurniture(s, s.rooms.find((r) => r.type === 'office')!.roomId, 'workstation'));
  s = ok(createShow(s, { name: 'Quiz Night', genre: 'gameShow', hostId: host, staffIds: [producer], studioId: studio }));
  const showId = s.lastId!;
  s = ok(scheduleShow(s, tvId, SLOTS.indexOf('evening'), showId));
  return Object.assign(s, { showId, tvId });
}

/** The state with a call centre, its desks, and `agents` call agents hired at them. */
function withAgents(state: GameState, agents: number): GameState {
  const floor = Array.from({ length: state.floorsUnlocked }, (_, i) => i + 1).find((f) => proposeRoom(state, f, 'callCentre'))!;
  const built = ok(buildRoom(state, { ...proposeRoom(state, floor, 'callCentre')!, type: 'callCentre' }));
  let s: GameState = ok(addMissingEquipment(built, built.lastId!));
  const roomId = built.lastId!;
  for (let i = 0; i < agents; i++) {
    const hired = structuredClone(s);
    hired.candidates.push({ id: `agent-${i}`, name: `Agent ${i}`, role: 'callAgent', skill: 50, salary: 500, specialties: [], fame: 0, department: null, foundFor: null });
    s = ok(hire(hired, `agent-${i}`));
    if (i > 0) {
      const room = s.rooms.find((r) => r.roomId === roomId)!;
      const desk = { ...structuredClone(room.furniture.find((f) => f.type === 'callDesk')!), id: `desk-${i}` };
      room.furniture.push({ ...desk, x: room.furniture.at(-1)!.x, y: room.furniture.at(-1)!.y });
    }
  }
  return s;
}

describe('Phone lines (0.20.0, #31)', () => {
  it('has a room, a desk and a job of its own', () => {
    expect(ROOM_TYPE_NAMES.callCentre).toBe('Call centre');
    expect(FURNITURE.callDesk.rooms).toEqual(['callCentre']);
    expect(SALARY.callAgent.min).toBeLessThan(SALARY.callAgent.max);
    const pool = generateCandidates(station(), new Rng(5), 1980);
    const agents = pool.filter((p) => p.role === 'callAgent');
    expect(agents).toHaveLength(CALL_AGENT_CANDIDATES);
    for (const a of agents) expect(a.salary).toBeGreaterThanOrEqual(SALARY.callAgent.min);
  });

  describe('the day’s calls', () => {
    it('answers the call-ins first, then the votes, and the mail with what is left', () => {
      const calls = dayCalls(1_000, 2, [300, 200])!;
      expect(calls.callIns).toEqual({ wanted: 2 * CALLS.callIn, answered: 2 * CALLS.callIn });
      expect(calls.votes).toEqual({ wanted: 500, answered: 500 });
      expect(calls.orders).toBeCloseTo(Math.min(1_000 - 200 - 500, (MAIL.max / MAIL.lift) * CALLS.each));
    });

    it('loses votes before call-ins when the agents are short', () => {
      const calls = dayCalls(300, 2, [1_000])!;
      expect(calls.callIns.answered).toBe(2 * CALLS.callIn);
      expect(calls.votes.answered).toBe(100);
      expect(calls.orders).toBe(0);
      expect(unanswered(calls)).toBeCloseTo(0.9);
      expect(overloaded(calls)).toBe(true);
    });

    it('has no calls without an agent', () => {
      expect(dayCalls(0, 3, [100])).toBeNull();
      expect(overloaded(undefined)).toBe(false);
      expect(mailLift(undefined)).toBe(0);
    });

    it('lifts merchandise by MAIL.lift for every CALLS.each calls of spare time, up to MAIL.max', () => {
      const lift = (orders: number) => mailLift({ capacity: 0, callIns: { wanted: 0, answered: 0 }, votes: { wanted: 0, answered: 0 }, orders });
      expect(lift(CALLS.each)).toBeCloseTo(MAIL.lift);
      expect(lift(100 * CALLS.each)).toBe(MAIL.max);
    });

    it('makes a show better in proportion to the share of its call-ins answered', () => {
      expect(callInAppeal(0)).toBe(1);
      expect(callInAppeal(1)).toBe(CALLS.callInBonus);
      expect(callInShare(CALLS.callIn / 2, 1)).toBe(0.5);
      expect(callInShare(1_000, 0)).toBe(0);
    });
  });

  describe('on the air', () => {
    it('makes a radio call-in show more appealing, and the same without a call centre', () => {
      const s = station();
      expect(s.shows.some((x) => x.genre === 'morningShow')).toBe(true);
      const bare = simulateDay(s);
      expect(bare.calls).toBeUndefined();
      const staffed = withAgents(s, 1);
      expect(callCapacity(staffed, employeesWithDesk(staffed))).toBeGreaterThan(0);
      const day = simulateDay(staffed);
      const listeners = (r: DayResult) => r.channels.filter((c) => c.isPlayer).flatMap((c) => c.slots).reduce((sum, slot) => sum + slot.listeners, 0);
      expect(callInSlots(staffed, employeesWithDesk(staffed))).toBeGreaterThan(0);
      expect(listeners(day)).toBeGreaterThan(listeners(bare));
      expect(day.calls!.callIns.answered).toBeGreaterThan(0);
    });

    it('pays only the votes the agents answer, once Premium-rate lines is researched', () => {
      const night = gameShowNight();
      const s = withAgents(night, 1);
      const show = s.shows.find((x) => x.id === night.showId)!;
      const before = simulateDay(s);
      expect(before.channels.flatMap((c) => c.slots).every((slot) => !slot.votes)).toBe(true);
      s.techs.push('premiumLines');
      const day = simulateDay(s);
      const slots = day.channels.filter((c) => c.isPlayer).flatMap((c) => c.slots).filter((slot) => slot.showId === show.id);
      expect(slots.length).toBeGreaterThan(0);
      const answered = slots.reduce((sum, slot) => sum + (slot.voteCalls?.answered ?? 0), 0);
      const wanted = slots.reduce((sum, slot) => sum + (slot.voteCalls?.wanted ?? 0), 0);
      expect(wanted).toBeGreaterThan(0);
      expect(answered).toBeLessThanOrEqual(day.calls!.capacity + 1e-6);
      expect(slots.reduce((sum, slot) => sum + (slot.votes ?? 0), 0)).toBeCloseTo(answered * VOTES.price);
      // Part of the slot's revenue.
      for (const slot of slots) expect(slot.revenue).toBeGreaterThanOrEqual(slot.votes ?? 0);
    });

    it('books the votes in the ledger', () => {
      const s = withAgents(gameShowNight(), 1);
      s.techs.push('premiumLines');
      const next = advance(s, 1);
      const votes = next.lastDay!.channels.flatMap((c) => c.slots).reduce((sum, slot) => sum + (slot.votes ?? 0), 0);
      expect(votes).toBeGreaterThan(0);
      // The books settle on the first of the month: it is in this month's ledger, or in the report that closed the last.
      expect(next.ledger.votes + (next.monthlyReports.at(-1)?.votes ?? 0)).toBeGreaterThanOrEqual(votes - 1e-6);
    });
  });

  describe('the scandal', () => {
    const overload: CallsDay = { capacity: 10, callIns: { wanted: 0, answered: 0 }, votes: { wanted: 1_000, answered: 100 }, orders: 0 };

    it('files a complaint of the rule "votes" on some days of unanswered votes, and never on others', () => {
      const s = withAgents(station(), 1);
      const channel = s.channels[0]!;
      const slot = (voteCalls: { wanted: number; answered: number }) => ({ showId: null, titleId: null, programName: 'x', quality: 1, listeners: 1_000, share: 0.1, revenue: 100, voteCalls });
      const result = (calls: CallsDay): DayResult => ({
        day: s.day,
        calls,
        channels: [{ channelId: channel.id, name: channel.name, ownerId: 'player', isPlayer: true, medium: channel.medium, onAir: true, slots: [slot({ wanted: 1_000, answered: 100 })], regionListeners: { [s.licenses[0]!.regionId]: 1_000 }, audienceListeners: {} }],
      });
      let filed = 0;
      for (let day = 0; day < 1_500 && filed === 0; day++) {
        const draft = structuredClone(s);
        draft.day = s.day + day;
        draft.complaints = [];
        checkVotes(draft, result(overload));
        filed += draft.complaints.filter((c) => c.rule === 'votes').length;
      }
      expect(filed).toBe(1);
      // With the votes answered nobody complains.
      for (let day = 0; day < 300; day++) {
        const draft = structuredClone(s);
        draft.day = s.day + day;
        checkVotes(draft, result({ ...overload, votes: { wanted: 1_000, answered: 1_000 } }));
        expect(draft.complaints.filter((c) => c.rule === 'votes')).toHaveLength(0);
      }
    });
  });

  it('has Penny speak of it, and records the line', () => {
    const line = HINTS.find((h) => h.id === 'calls')!;
    expect(line.say).toContain('call centre');
    expect(TO_RECORD.calls).toBeUndefined();
  });

  describe('the save', () => {
    it('loads a save of version 55: a clean line in the books for the votes', () => {
      const s = createInitialState(1);
      s.monthlyReports = [{ ...s.ledger, year: 1970, month: 1, net: 0, balance: 0 }];
      const file = JSON.parse(JSON.stringify(toSaveFile(s, 0)));
      delete file.state.ledger.votes;
      delete file.state.monthlyReports[0].votes;
      const loaded = fromSaveFile({ ...file, version: 55 });
      expect(loaded.version).toBe(SAVE_VERSION);
      expect(SAVE_VERSION).toBeGreaterThanOrEqual(56);
      expect(loaded.state.ledger.votes).toBe(0);
      expect(loaded.state.monthlyReports[0]!.votes).toBe(0);
    });
  });
});
