import { describe, expect, it } from 'vitest';
import { STUDIO_REQUIREMENTS, type FurnitureType, type RoomType } from '../config/office';
import { SLOTS } from '../config/world';
import { DAY_BEATS, castName, peopleAt, slotAt, whereabouts } from './layout';
import { buildRoom, buyLicense, createChannel, createShow, hire, scheduleShow, setChannelManager, type ActionResult } from '../sim/actions';
import { sensibleBot } from '../sim/bots';
import { addMissingEquipment, autoPlaceFurniture, withoutRecordRooms } from '../sim/fixtures';
import { createInitialState } from '../sim/newGame';
import { proposeRoom } from '../sim/rooms';
import type { GameState, Person } from '../sim/state';
import { advance } from '../sim/tick';
import { unlockAll } from '../sim/unlocks';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}

/** A radio station from the sensible test player, a month on the air, with everything open, money to spare and two floors. */
const station = (days = 30): GameState => {
  // Without the library and post room the bot keeps its records in (0.18.0): the tests below build rooms where the game proposes them.
  const s = structuredClone(withoutRecordRooms(unlockAll(advance(sensibleBot(createInitialState(1)), days))));
  s.money = 5_000_000;
  s.floorsUnlocked = 2;
  return s;
};

/** Hires a made-up person straight from the pool. */
function hirePerson(state: GameState, person: Partial<Person> & Pick<Person, 'role'>): GameState & { lastId?: string } {
  const s = structuredClone(state);
  const id = `p-${s.nextId++}`;
  s.candidates.push({ id, name: `Test ${person.role} ${id}`, skill: 80, salary: 2_000, specialties: [], fame: 0, department: null, ...person });
  return Object.assign(ok(hire(s, id)), { lastId: id });
}

/** A TV channel in Coaxia with a manager of its own, beside the radio station. */
function withTv(state: GameState): GameState {
  let s = ok(createChannel(state, { name: 'Test TV', logo: { shape: 'square', color: '#000', initials: 'TV' }, medium: 'tv' }));
  const tvId = s.lastId!;
  s = ok(buyLicense(s, tvId, 'capital'));
  s = hirePerson(s, { role: 'channelManager' });
  const manager = s.lastId!;
  s = ok(autoPlaceFurniture(s, s.rooms.find((r) => r.type === 'managementOffice')!.roomId, 'managerDesk'));
  return ok(setChannelManager(s, tvId, manager));
}

/** Builds a room of a kind where the game proposes it, on the lowest floor with room, with everything on its checklist. Its id is `lastId`. */
function room(state: GameState, type: RoomType, ...extra: FurnitureType[]): GameState & { lastId?: string } {
  const floor = [1, 2].find((f) => proposeRoom(state, f, type))!;
  let s = ok(buildRoom(state, { ...proposeRoom(state, floor, type)!, type }));
  const id = s.lastId!;
  if (STUDIO_REQUIREMENTS[type]) s = ok(addMissingEquipment(s, id));
  for (const piece of extra) s = ok(autoPlaceFurniture(s, id, piece));
  return Object.assign(s, { lastId: id });
}

/** A writers' room with places for `n` writers, and `n` writers of this skill at them. Their ids are `writers`. */
function writers(state: GameState, n: number, skill = 80): GameState & { writers: string[] } {
  let s = room(state, 'writersRoom', ...Array<FurnitureType>(n).fill('writingDesk'));
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    s = hirePerson(s, { role: 'writer', skill });
    ids.push(s.lastId!);
  }
  return Object.assign(s, { writers: ids });
}

/** Production staff with a workstation each. */
function producers(state: GameState, n: number): GameState & { staff: string[] } {
  let s = room(state, 'office', ...Array<FurnitureType>(n).fill('workstation'));
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    s = hirePerson(s, { role: 'production' });
    ids.push(s.lastId!);
  }
  return Object.assign(s, { staff: ids });
}

describe('version 0.14.0', () => {
  describe('a cast on the set (R87)', () => {
    it('plays a sitcom or reality show while it is on, one of them in the confession booth', () => {
      for (const [genre, type, cast] of [['sitcom', 'tvSitcomStudio', 3], ['reality', 'tvRealityStudio', 5]] as const) {
        let s: GameState & { lastId?: string } = withTv(structuredClone(station()));
        s.techs.push('realityFormat');
        s = room(s, type);
        const studio = s.lastId!;
        const team = writers(s, 2);
        s = producers(team, 5);
        const staff = (s as GameState & { staff: string[] }).staff;
        s = ok(createShow(s, { name: 'On the set', genre, hostId: null, staffIds: staff, writerIds: team.writers, studioId: studio }));
        const showId = s.lastId!;
        const tv = s.channels.find((c) => c.medium === 'tv')!;
        const slot = SLOTS.indexOf('evening');
        s = ok(scheduleShow(s, tv.id, slot, showId));
        const beat = Array.from({ length: DAY_BEATS }, (_, b) => b).find((b) => slotAt(b) === slot)!;
        const people = [...peopleAt(s, beat).values()].filter((p) => p.id.startsWith('visitor-cast-'));
        expect(people, genre).toHaveLength(cast);
        expect(people.every((p) => p.roomId === studio)).toBe(true);
        expect(people.map((p) => p.name)).toEqual(people.map((_, i) => castName(showId, i)));
        expect(whereabouts(s, people[0]!)).toMatch(/in the cast of “On the set”/);
        // Not while something else is on.
        const other = Array.from({ length: DAY_BEATS }, (_, b) => b).find((b) => slotAt(b) === 0)!;
        expect([...peopleAt(s, other).values()].some((p) => p.id.startsWith('visitor-cast-'))).toBe(false);
      }
    });
  });
});
