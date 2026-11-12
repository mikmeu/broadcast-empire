import { describe, expect, it } from 'vitest';
import { CONTENT } from '../config/balance';
import { SLOTS } from '../config/world';
import { buyLicense, buyTitle, createChannel, createShow, hire, scheduleShow, setChannelManager, setRoomType, type ActionResult } from './actions';
import { sensibleBot } from './bots';
import { appeal, simulateDay, slotFactors } from './broadcast';
import { addMissingEquipment, autoPlaceFurniture, rentRoom, setUpPostRoom, withoutRecordRooms } from './fixtures';
import { changesSince, channelGroups, reportLosses, settledFreshness, slotAudience, snapshotSlots, suitability, titleSupply, TITLES_FOR_FULL_FRESHNESS, warnAboutTitles } from './insight';
import { createInitialState } from './newGame';
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
  describe('why a slot draws what it draws (R100)', () => {
    it('the parts of a slot’s appeal multiply to its appeal; reruns have none', () => {
      const s = station();
      const factors = slotFactors(s, s.channels[0]!.id);
      expect(factors).toHaveLength(SLOTS.length);
      for (const f of factors) {
        expect(f).not.toBeNull();
        expect(f!.appeal).toBeCloseTo(appeal(f!.quality, f!.fit, f!.fame, f!.freshness, f!.reputation, f!.promotion, f!.bonus), 9);
        expect(f!.tunedIn).toBeGreaterThan(0);
      }
      const empty = structuredClone(s);
      empty.channels[0]!.schedule[0] = null;
      expect(slotFactors(empty, empty.channels[0]!.id)[0]).toBeNull();
    });

    it('a show that goes stale loses its audience, and the news says that freshness is why', () => {
      let s = station();
      s.weekAgo = snapshotSlots(s);
      const show = s.shows.find((x) => x.id === s.channels[0]!.schedule[0])!;
      s = structuredClone(s);
      s.shows.find((x) => x.id === show.id)!.freshness = 0.4;
      s.lastDay = simulateDay(s);
      const before = s.weekAgo[`${s.channels[0]!.id}:0`]!;
      const now = slotFactors(s, s.channels[0]!.id)[0]!;
      expect(changesSince(before, now)[0]).toMatchObject({ factor: 'freshness' });
      const losses = reportLosses(s);
      expect(losses[0]!.text).toMatch(new RegExp(`“${show.name}”.*fewer listeners than a week ago: its freshness fell`));
    });

    it('the week’s figures are taken every Monday', () => {
      const s = station(40);
      expect(Object.keys(s.weekAgo).length).toBe(SLOTS.length);
    });
  });

  describe('when to schedule what (R101)', () => {
    it('a slot names who is tuned in, and a genre suits it by the people there and what they are worth', () => {
      const s = station();
      const radio = s.channels[0]!;
      const morning = slotAudience(s, radio, 0);
      const late = slotAudience(s, radio, SLOTS.indexOf('lateNight'));
      expect(suitability(morning, 'morningShow').label).toBe('good');
      expect(suitability(late, 'rock').score).toBeGreaterThan(suitability(late, 'classical').score);
      expect(suitability(late, 'classical').label).toBe('poor');
    });

    it('a channel specializes with three slots of one kind, and the schedule says when one more would do it', () => {
      const s = station();
      const radio = s.channels[0]!;
      expect(channelGroups(s, radio).group).toBe('Music');
      // Penny's plan: a morning show, Top 40 twice, the news and rock. Without the rock there are two music slots.
      const two = structuredClone(s);
      const rock = two.channels[0]!.schedule.findIndex((id) => two.shows.find((x) => x.id === id)?.genre === 'rock');
      two.channels[0]!.schedule[rock] = null;
      expect(channelGroups(two, two.channels[0]!)).toMatchObject({ group: null, almost: 'Music' });
    });
  });

  describe('bought titles that run out or go stale (R88, R89)', () => {
    it('the news warns a week before the titles run out, and when they have', () => {
      let s: GameState & { lastId?: string; tvId?: string } = withTv(station());
      const tvId = s.tvId!;
      s = ok(addMissingEquipment(ok(setRoomType(ok(setUpPostRoom(ok(rentRoom(s, 'K')))), 'K', 'library')), 'K'));
      // The shelf of the new library is the only one: it holds no records here (0.18.0).
      s.records = [];
      s = ok(buyTitle(s, s.market.titles.find((t) => t.genre === 'series')!.id));
      s = ok(createShow(s, { name: 'Series Night', genre: 'series', hostId: null, staffIds: [], studioId: null }));
      s = ok(scheduleShow(s, tvId, 3, s.lastId!));
      s.library[0]!.airingsLeft = 9;
      const before = titleSupply(s);
      expect(before).toEqual([expect.objectContaining({ genre: 'series', left: 9, perDay: 1, days: 9 })]);
      let next = s;
      const warnings: string[] = [];
      for (let day = 0; day < 10; day++) {
        const was = titleSupply(next);
        next = structuredClone(next);
        next.library.forEach((t) => (t.airingsLeft -= 1));
        next.library = next.library.filter((t) => t.airingsLeft > 0);
        const count = next.messages.length;
        warnAboutTitles(next, was);
        warnings.push(...next.messages.slice(count).map((m) => m.text));
      }
      expect(warnings).toHaveLength(2);
      expect(warnings[0]).toMatch(/series in your library last 7 more days/);
      expect(warnings[1]).toMatch(/no series left/);
    });

    it('titles that take turns settle at a freshness that grows with how many there are', () => {
      expect(settledFreshness(1)).toBe(CONTENT.minFreshness);
      expect(settledFreshness(4)).toBeLessThan(settledFreshness(6));
      expect(settledFreshness(TITLES_FOR_FULL_FRESHNESS)).toBe(1);
      expect(settledFreshness(TITLES_FOR_FULL_FRESHNESS - 1)).toBeLessThan(1);
    });
  });
});
