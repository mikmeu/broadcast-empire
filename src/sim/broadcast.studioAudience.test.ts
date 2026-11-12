import { describe, expect, it } from 'vitest';
import { STUDIO_AUDIENCE } from '../config/balance';
import { SLOTS } from '../config/world';
import { AUDIENCE_PER_SEATING } from '../config/office';
import { airtimes, contestantName, tripsOf } from '../office/day';
import { DAY_BEATS, audienceBlocks, beatOfHour, peopleAt, slotAt, whereabouts } from '../office/layout';
import { buildRoom, buyLicense, createChannel, createShow, hire, scheduleShow, setChannelManager, type ActionResult } from './actions';
import { sensibleBot } from './bots';
import { showQuality } from './broadcast';
import { addMissingEquipment, autoPlaceFurniture, withoutRecordRooms } from './fixtures';
import { createInitialState } from './newGame';
import { proposeRoom } from './rooms';
import type { GameState, Person } from './state';
import { advance } from './tick';
import { unlockAll } from './unlocks';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}

/** A radio station from the sensible test player, a month on the air, with everything open and money to spare. */
const station = (days = 30): GameState => {
  // Without the library and post room the bot keeps its records in (0.18.0): the tests below build rooms where the game proposes them.
  const s = structuredClone(withoutRecordRooms(unlockAll(advance(sensibleBot(createInitialState(1)), days))));
  s.money = 3_000_000;
  s.floorsUnlocked = 2;
  return s;
};

/** Hires a made-up person straight from the pool. */
function hirePerson(state: GameState, person: Partial<Person> & Pick<Person, 'role'>): GameState & { lastId?: string } {
  const s = structuredClone(state);
  const id = `p-${s.nextId++}`;
  s.candidates.push({ id, name: 'Test Person', skill: 80, salary: 2_000, specialties: [], fame: 0, department: null, ...person });
  return Object.assign(ok(hire(s, id)), { lastId: id });
}

/** A TV channel in Coaxia with a manager, beside the radio station. */
function withTv(state: GameState): GameState & { tvId: string } {
  let s: GameState & { lastId?: string } = ok(createChannel(state, { name: 'Test TV', logo: { shape: 'square', color: '#000', initials: 'TV' }, medium: 'tv' }));
  const tvId = s.lastId!;
  s = ok(buyLicense(s, tvId, 'capital'));
  s = hirePerson(s, { role: 'channelManager' });
  const manager = s.lastId!;
  s = ok(autoPlaceFurniture(s, s.rooms.find((r) => r.type === 'managementOffice')!.roomId, 'managerDesk'));
  s = ok(setChannelManager(s, tvId, manager));
  return Object.assign(s, { tvId });
}

describe('version 0.13.0', () => {
  describe('a studio audience, and contestants (R91, R92)', () => {
    /** A game show with its host in a game show studio, on the TV channel's evening. */
    function gameShow(seats: number): GameState & { showId: string } {
      let s: GameState & { lastId?: string; tvId?: string } = withTv(station());
      s.techs.push('gameShowFormat');
      // A game show studio with room for an audience: bigger than usual.
      const place = proposeRoom(s, 2, 'tvGameStudio')!;
      s = ok(buildRoom(s, { ...place, w: 9, h: 7, door: { x: place.door.x, z: place.y + 7 }, type: 'tvGameStudio' }));
      const studio = s.lastId!;
      s = ok(addMissingEquipment(s, studio));
      for (let i = 0; i < seats; i++) s = ok(autoPlaceFurniture(s, studio, 'audienceSeating'));
      s = hirePerson(s, { role: 'host', specialties: ['gameShow'] });
      const host = s.lastId!;
      s = ok(createShow(s, { name: 'Quiz Night', genre: 'gameShow', hostId: host, staffIds: [], studioId: studio }));
      const showId = s.lastId!;
      s = ok(scheduleShow(s, s.tvId!, SLOTS.indexOf('evening'), showId));
      return Object.assign(s, { showId });
    }

    it('audience seating lifts a game show by a step per block, up to its most, and does nothing for the news', () => {
      const quality = (seats: number) => {
        const s = gameShow(seats);
        return showQuality(s, s.shows.find((x) => x.id === s.showId)!).audience;
      };
      expect(quality(0)).toBe(1);
      expect(quality(1)).toBeCloseTo(1 + STUDIO_AUDIENCE.perBlock, 9);
      expect(quality(STUDIO_AUDIENCE.maxBlocks + 1)).toBeCloseTo(1 + STUDIO_AUDIENCE.perBlock * STUDIO_AUDIENCE.maxBlocks, 9);
      const s = station();
      const news = s.shows.find((x) => x.genre !== 'gameShow')!;
      expect(showQuality(s, news).audience).toBe(1);
    });

    it('two contestants stand at the set while the game show is on, and none when it is not', () => {
      const s = gameShow(0);
      let seenLive = false;
      for (let beat = 0; beat < DAY_BEATS; beat++) {
        const contestants = [...peopleAt(s, beat).values()].filter((p) => p.id.startsWith('visitor-contestant'));
        const live = slotAt(beat) === SLOTS.indexOf('evening');
        expect(contestants.length, `beat ${beat}`).toBe(live ? 2 : 0);
        if (live) seenLive = true;
      }
      expect(seenLive).toBe(true);
    });

    it('the contestants have names of their own, and so has everyone on two blocks of seating (#72)', () => {
      const s = gameShow(2);
      const show = s.shows.find((x) => x.id === s.showId)!;
      const live = [...peopleAt(s, beatOfHour(airtimes(s, show)[0]![0])).values()];
      const contestants = live.filter((p) => p.id.startsWith('visitor-contestant'));
      expect(contestants.map((p) => p.name)).toEqual([contestantName(show.id, 0), contestantName(show.id, 1)]);
      for (const p of contestants) expect(whereabouts(s, p)).toMatch(/^A contestant on “Quiz Night”, in .+\.$/);

      // Twenty seats, twenty people: the second block does not bring the first one's ten again.
      const seated = live.filter((p) => p.id.startsWith('visitor-audience'));
      expect(seated).toHaveLength(2 * AUDIENCE_PER_SEATING);
      expect(new Set(seated.map((p) => p.name)).size).toBe(2 * AUDIENCE_PER_SEATING);
      const coming = tripsOf(s, 0, audienceBlocks(s)).filter((t) => t.id.startsWith('audience-') && t.way === 'in');
      expect(new Set(coming.map((t) => t.key)).size).toBe(coming.length);
      expect(new Set(coming.map((t) => t.id)).size).toBe(2 * AUDIENCE_PER_SEATING);
      // Whoever comes by bus is the one who sits down.
      expect(new Set(coming.map((t) => t.name))).toEqual(new Set(seated.map((p) => p.name)));
    });
  });
});
