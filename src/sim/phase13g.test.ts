import { describe, expect, it } from 'vitest';
import { LINES } from '../config/guide';
import { FLOOR, ROOM_SIZES, ROOM_TYPE_NAMES, buildable } from '../config/office';
import { walkPath } from '../office/routes';
import { SERVICE } from '../office/layout';
import { ARTICLES } from '../wiki/articles';
import * as actions from './actions';
import { growthBot, sensibleBot, tvBot, type Bot } from './bots';
import { rentRoom } from './fixtures';
import { acknowledge, guideView, setGuide } from './guide';
import { createInitialState } from './newGame';
import { buildingOf, isStudioReady, placementError } from './office';
import { roomError } from './rooms';
import type { GameState } from './state';
import { tick } from './tick';

const play = (bot: Bot, seed: number, days: number, start: Partial<GameState> = {}) => {
  let s: GameState = { ...createInitialState(seed), ...start };
  for (let day = 0; day < days && !s.bankrupt; day++) s = tick(bot(s));
  return s;
};

/** Everything the game has to say to a player in words that can be checked: Penny's lines and the wiki. */
const words = () => [...LINES.flatMap((line) => [line.title ?? '', line.say, ...(line.how ?? []), line.when ?? '']), JSON.stringify(ARTICLES)].join('\n');

describe('Penny, the test bot and the wiki (Phase 13g)', () => {
  describe('the test bot', () => {
    it('builds its rooms the way a player does: where the game proposes them, named after their kind', () => {
      const s = sensibleBot(createInitialState(1));
      const rooms = s.rooms.filter((r) => !r.fixed);
      expect(rooms.map((r) => r.name).sort()).toEqual(['Canteen 1', 'Management office 1', 'Office 1', 'Radio studio 1', 'Radio talk studio 1']);
      for (const room of rooms) {
        // No letters any more: every room got its id from the game when it was built, and has the usual size.
        expect(room.roomId).toMatch(/^r\d+$/);
        expect({ w: room.w, h: room.h }).toEqual(ROOM_SIZES[room.type!]);
        expect(room.floor).toBe(1);
        // In one of the two rows along the hall, with its door on it.
        expect([0, FLOOR.corridorY + 1]).toContain(room.y);
        expect(room.door.z === FLOOR.corridorY || room.door.z === FLOOR.corridorY + 1).toBe(true);
      }
      // It paid for building them like anyone, and they are in use.
      expect(s.ledger.purchases).toBeGreaterThan(0);
      expect(s.shows.every((show) => rooms.some((r) => r.roomId === show.studioId))).toBe(true);
      for (const room of rooms.filter((r) => r.type !== 'office')) expect(isStudioReady(s, room), room.name).toBe(true);
    });

    it('keeps to the rules of building and furnishing for years, on every floor it gets', () => {
      const s = play(tvBot, 3, 2200);
      expect(s.bankrupt).toBe(false);
      const rooms = s.rooms.filter((r) => !r.fixed);
      expect(rooms.length).toBeGreaterThan(7);
      expect(new Set(rooms.map((r) => r.floor)).size).toBeGreaterThan(1);
      expect(rooms.some((r) => r.type === 'tvKidsStudio')).toBe(true);
      // Its soap and its kids' show are written (0.14.0).
      expect(rooms.some((r) => r.type === 'writersRoom')).toBe(true);
      expect(s.shows.some((show) => show.writerIds.length > 0)).toBe(true);
      for (const room of rooms) {
        // Each room could be built again where it stands: on the floor, clear of the others, within reach.
        expect(roomError(s, { floor: room.floor, x: room.x, y: room.y, w: room.w, h: room.h, door: room.door }, room.roomId), room.name).toBeNull();
        const area = buildable(buildingOf(s), room.floor);
        expect(room.x).toBeGreaterThanOrEqual(area.x);
        expect(room.name).toMatch(new RegExp(`^${ROOM_TYPE_NAMES[room.type!]} \\d+$`));
        // Nothing stands in front of a door, through a wall or on top of something else.
        for (const item of room.furniture) {
          const others = { ...room, furniture: room.furniture.filter((f) => f !== item) };
          expect(placementError(s, others, item.type, item.x, item.y, item.turn), `${item.type} in ${room.name}`).toBeNull();
        }
        // And people can walk to it from the entrance or the lifts.
        const from = room.floor === 1 ? SERVICE.entrance.at : SERVICE.lifts.at;
        const path = walkPath(s, room.floor, from, { x: room.x + room.w / 2, z: room.y + room.h / 2 });
        expect(path.at(-1)).toEqual([room.x + room.w / 2, room.y + room.h / 2]);
      }
    }, 120_000);

    it('stops building when no floor has a place left, and plays on', () => {
      // A growing company that never gets a second floor: the ground floor fills up and that is that.
      let s: GameState = createInitialState(2);
      for (let day = 0; day < 1500 && !s.bankrupt; day++) s = tick(growthBot({ ...s, floorsUnlocked: 1 }));
      expect(s.rooms.every((r) => r.floor === 1)).toBe(true);
      expect(s.day).toBe(1500);
    }, 120_000);

    it('no longer has short cuts in the game itself: lettered rooms and furnishing in one go are for tests', () => {
      for (const name of ['rentRoom', 'addMissingEquipment', 'autoPlaceFurniture', 'missingCost']) expect(name in actions, name).toBe(false);
      // The fixture that stands in for the old plan still obeys the rules and costs the same.
      const s = createInitialState(1);
      const rented = rentRoom(s, 'C');
      expect(rented.ok && s.money - rented.state.money).toBe(4 * 5 * 50);
      expect(rentRoom(sensibleBot(s), 'A')).toMatchObject({ ok: false, error: expect.stringMatching(/is in the way/) });
    });
  });

  describe('Penny and the wiki', () => {
    it('say nothing about renting rooms, lettered rooms or buttons that are gone', () => {
      const text = words();
      for (const gone of [/Buy what’s missing/i, /Put one in/i, /\brent (a|the|another) room/i, /\brooms? [A-U]\b/, /\bto rent on\b/i, /\bPiece\b list/]) expect(text).not.toMatch(gone);
      // What took their place is there.
      for (const there of [/Build a room/, /Propose a place/, /“Place”/, /in front of (a|the) door/, /CEO’s office/, /place of their \*\*own\*\*|place of their own/]) expect(text).toMatch(there);
    });

    it('Penny points out who sits where once there is a second office', () => {
      const line = LINES.find((l) => l.id === 'places')!;
      expect(line.say).toMatch(/place of their own/);
      // A company that is past the first weeks and has heard every other hint.
      let s = setGuide(play(growthBot, 1, 200), true);
      s = { ...s, guide: { ...s.guide, stage: 'on', quiet: 0, seen: [...LINES.map((l) => l.id).filter((id) => id !== 'places'), 'television-later'] } };
      const offices = s.rooms.filter((r) => r.type === 'office');
      const one: GameState = { ...s, rooms: s.rooms.filter((r) => r.type !== 'office' || r === offices[0]) };
      expect(guideView(one)).toBeNull();
      const two: GameState = offices.length > 1 ? s : { ...s, rooms: [...s.rooms, { ...offices[0]!, roomId: 'second', name: 'Office 2', floor: 3, furniture: [] }] };
      expect(guideView(two)).toMatchObject({ kind: 'hint', line: { id: 'places' } });
      expect(guideView(acknowledge(two, 'places'))).toBeNull();
    }, 120_000);
  });
});
