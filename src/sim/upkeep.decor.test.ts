import { describe, expect, it } from 'vitest';
import { COMFORT, DECOR } from '../config/balance';
import { FURNITURE, STUDIO_REQUIREMENTS, type FurnitureType, type RoomType } from '../config/office';
import { buildRoom, hire, type ActionResult } from './actions';
import { sensibleBot } from './bots';
import { weeklyCost } from './economy';
import { addMissingEquipment, autoPlaceFurniture } from './fixtures';
import { channelMeetingLiftToday } from './morale';
import { createInitialState } from './newGame';
import { employeesWithDesk, findRoom } from './office';
import { proposeRoom } from './rooms';
import { effectiveSkill } from './staff';
import type { GameState, Person } from './state';
import { advance } from './tick';
import { unlockAll } from './unlocks';
import { dirtPerDay, roomComfort } from './upkeep';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}

/** A radio station from the sensible test player, a month on the air, with everything open, money to spare and two floors. */
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

describe('version 0.16.0', () => {
  describe('decor that does something (R128)', () => {
    it('a production calendar and a sales chart help the staff in their office', () => {
      let s = hirePerson(station(), { role: 'sales', skill: 50 });
      const salesperson = s.lastId!;
      const office = s.rooms.find((r) => r.type === 'office')!.roomId;
      s = ok(autoPlaceFurniture(s, office, 'workstation'));
      const producer = s.employees.find((e) => e.role === 'production' && employeesWithDesk(s).get(e.id)?.roomId === office)!;
      const skill = (x: GameState, id: string) => effectiveSkill(x, x.employees.find((e) => e.id === id)!, employeesWithDesk(x));
      const before = [skill(s, producer.id), skill(s, salesperson)];
      s = ok(autoPlaceFurniture(ok(autoPlaceFurniture(s, office, 'calendar')), office, 'salesChart'));
      expect(skill(s, producer.id)).toBeCloseTo(before[0]! * (1 + DECOR.calendar));
      expect(skill(s, salesperson)).toBeCloseTo(before[1]! * (1 + DECOR.salesChart));
    });

    it('a printer makes campaigns cheaper; a bin and a dishwasher keep rooms clean for longer', () => {
      let s = station();
      const office = s.rooms.find((r) => r.type === 'office')!.roomId;
      expect(weeklyCost(s, 2_500)).toBe(2_500);
      s = ok(autoPlaceFurniture(s, office, 'printer'));
      expect(weeklyCost(s, 2_500)).toBeCloseTo(2_500 * (1 - DECOR.printer));
      const dirt = (x: GameState, id: string) => dirtPerDay(x, findRoom(x, id)!, employeesWithDesk(x));
      const before = dirt(s, office);
      s = ok(autoPlaceFurniture(s, office, 'bin'));
      expect(dirt(s, office)).toBeCloseTo(before * (1 - DECOR.bin));
      const canteen = s.rooms.find((r) => r.type === 'canteen')!.roomId;
      const messy = dirt(s, canteen);
      s = ok(autoPlaceFurniture(s, canteen, 'dishwasher'));
      expect(dirt(s, canteen)).toBeCloseTo(messy * (1 - DECOR.dishwasher));
    });

    it('an aquarium counts as three pieces of comfort, and a flip chart makes meetings better', () => {
      let s = station();
      const office = s.rooms.find((r) => r.type === 'office')!.roomId;
      s = ok(autoPlaceFurniture(s, office, 'aquarium'));
      expect(FURNITURE.aquarium.comfort).toBe(3);
      expect(roomComfort(findRoom(s, office)!)).toBe(3 * COMFORT.perPiece);
      for (let n = 0; n < 4; n++) s = ok(autoPlaceFurniture(s, office, 'planter'));
      // The best four pieces count.
      expect(roomComfort(findRoom(s, office)!)).toBe((3 + 3) * COMFORT.perPiece);

      const withRoom = room(s, 'meetingRoom');
      const meetingRoom = withRoom.lastId!;
      s = withRoom;
      // Its production staff meet with the channel manager (0.17.0).
      const channel = s.channels[0]!.id;
      const lift = channelMeetingLiftToday(s, channel);
      expect(lift).toBeGreaterThan(0);
      s = ok(autoPlaceFurniture(s, meetingRoom, 'flipChart'));
      expect(channelMeetingLiftToday(s, channel)).toBeCloseTo(lift * (1 + DECOR.flipChart), 0);
    });
  });
});
