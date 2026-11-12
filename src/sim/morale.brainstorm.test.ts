import { describe, expect, it } from 'vitest';
import { BRAINSTORM, MEETINGS, REVAMP_COST } from '../config/balance';
import { STUDIO_REQUIREMENTS, type FurnitureType, type RoomType } from '../config/office';
import { buildRoom, callBrainstorm, type ActionResult } from './actions';
import { sensibleBot } from './bots';
import { addMissingEquipment, autoPlaceFurniture } from './fixtures';
import { brainstormBlocker, brainstormCost, brainstormShows } from './morale';
import { createInitialState } from './newGame';
import { proposeRoom } from './rooms';
import { fromSaveFile, SAVE_VERSION, toSaveFile } from './save';
import type { GameState } from './state';
import { channelMembers, inMeeting, meetingFactor } from './teams';
import { advance } from './tick';
import { unlockAll } from './unlocks';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}
const error = (result: ActionResult) => (result.ok ? 'no error' : result.error);

/** A radio station a month on the air with everything open, money to spare and two floors. */
const station = (): GameState => {
  const s = structuredClone(unlockAll(advance(sensibleBot(createInitialState(1)), 30)));
  s.money = 5_000_000;
  s.floorsUnlocked = 2;
  return s;
};

function room(state: GameState, type: RoomType, ...extra: FurnitureType[]): GameState {
  const floor = [1, 2].find((f) => proposeRoom(state, f, type))!;
  let s = ok(buildRoom(state, { ...proposeRoom(state, floor, type)!, type }));
  const id = s.lastId!;
  if (STUDIO_REQUIREMENTS[type]) s = ok(addMissingEquipment(s, id));
  for (const piece of extra) s = ok(autoPlaceFurniture(s, id, piece));
  return s;
}

/** The station with a meeting room and every show of its channel stale. */
function stale(): GameState {
  const s = room(station(), 'meetingRoom');
  for (const show of brainstormShows(s, s.channels[0]!.id)) show.freshness = 0.5;
  for (const id of s.channels[0]!.schedule) {
    const show = s.shows.find((x) => x.id === id);
    if (show) show.freshness = 0.5;
  }
  return s;
}

describe('brainstorms (0.21.0, #252)', () => {
  it('is a feature that opens at level 6', () => {
    const s = stale();
    s.unlocked = s.unlocked.filter((f) => f !== 'brainstorms');
    expect(brainstormBlocker(s, s.channels[0]!.id)).toMatch(/Brainstorms open at level 6/);
    expect(error(callBrainstorm(s, s.channels[0]!.id))).toMatch(/level 6/);
  });

  it('costs the consultant and each stale show of yours, which is less than separate revamps from three up', () => {
    const s = stale();
    const channel = s.channels[0]!;
    const shows = brainstormShows(s, channel.id);
    expect(shows.length).toBeGreaterThan(0);
    expect(brainstormCost(s, channel.id)).toBe(BRAINSTORM.consultant + BRAINSTORM.perShow * shows.length);
    expect(BRAINSTORM.consultant + 3 * BRAINSTORM.perShow).toBeLessThan(3 * REVAMP_COST);
    expect(BRAINSTORM.consultant + 2 * BRAINSTORM.perShow).toBeGreaterThan(2 * REVAMP_COST - 1);
  });

  it('makes the shows fresh, pays under revamps and leaves out fresh shows, other channels and bought titles', () => {
    const s = stale();
    const channel = s.channels[0]!;
    const [first, second] = brainstormShows(s, channel.id);
    expect(second).toBeDefined();
    second!.freshness = 1;
    const other = structuredClone(first!);
    other.id = 'elsewhere';
    other.freshness = 0.3;
    s.shows.push(other);
    const before = s.money;
    const revamps = s.ledger.revamps;
    const price = brainstormCost(s, channel.id);
    const covered = brainstormShows(s, channel.id).map((x) => x.id);
    expect(covered).not.toContain(second!.id);
    expect(covered).not.toContain('elsewhere');
    const done = ok(callBrainstorm(s, channel.id));
    expect(done.money).toBe(before - price);
    expect(done.ledger.revamps).toBe(revamps + price);
    for (const id of covered) expect(done.shows.find((x) => x.id === id)!.freshness).toBe(1);
    expect(done.shows.find((x) => x.id === 'elsewhere')!.freshness).toBe(0.3);
    expect(done.brainstorms[channel.id]).toBe(done.day);
    expect(done.messages.at(-1)!.text).toMatch(/A consultant ran a brainstorm for .*fresh again/);
  });

  it('leaves bought titles out: they get fresh by resting', () => {
    const s = stale();
    const channel = s.channels[0]!;
    const before = brainstormShows(s, channel.id).length;
    const bought = { ...structuredClone(s.shows[0]!), id: 'bought', genre: 'movies' as const, freshness: 0.2 };
    s.shows.push(bought);
    channel.schedule[channel.schedule.findIndex((id) => id === null)] = 'bought';
    expect(brainstormShows(s, channel.id)).toHaveLength(before);
  });

  describe('is refused when', () => {
    it('no show of yours in the channel is stale', () => {
      const s = stale();
      for (const show of s.shows) show.freshness = 1;
      expect(brainstormBlocker(s, s.channels[0]!.id)).toMatch(/needs freshening up/);
    });

    it('the channel had one today', () => {
      const start = stale();
      const s = ok(callBrainstorm(start, start.channels[0]!.id));
      for (const show of s.shows) show.freshness = 0.5;
      expect(brainstormBlocker(s, s.channels[0]!.id)).toMatch(/had a brainstorm today/);
      expect(brainstormBlocker(advance(s, 1), s.channels[0]!.id) ?? '').not.toMatch(/had a brainstorm today/);
    });

    it('there is no meeting room', () => {
      const s = station();
      for (const id of s.channels[0]!.schedule) {
        const show = s.shows.find((x) => x.id === id);
        if (show) show.freshness = 0.5;
      }
      expect(brainstormBlocker(s, s.channels[0]!.id)).toMatch(/Build a meeting room/);
    });

    it('every meeting room is taken today', () => {
      // A brainstorm for another channel has the only room.
      const s = stale();
      const done = ok(callBrainstorm(s, s.channels[0]!.id));
      const twin = { ...structuredClone(done.channels[0]!), id: 'second' };
      done.channels.push(twin);
      for (const show of done.shows) show.freshness = 0.5;
      done.brainstorms[done.channels[0]!.id] = done.day;
      expect(brainstormBlocker(done, 'second')).toMatch(/Every meeting room is taken/);
    });

    it('there is not enough money', () => {
      const s = stale();
      s.money = 100;
      expect(brainstormBlocker(s, s.channels[0]!.id)).toMatch(/Not enough money/);
    });
  });

  it('takes a meeting room and halves the work of the channel’s production team for the day', () => {
    const s = stale();
    const channel = s.channels[0]!;
    const crew = channelMembers(s, channel.id);
    expect(crew.length).toBeGreaterThan(0);
    expect(crew.every((e) => !inMeeting(s, e))).toBe(true);
    const done = ok(callBrainstorm(s, channel.id));
    expect(crew.every((e) => inMeeting(done, e))).toBe(true);
    expect(meetingFactor(done, crew[0]!)).toBe(MEETINGS.workOnTheDay);
    const next = advance(done, 1);
    expect(crew.every((e) => !inMeeting(next, e))).toBe(true);
  });

  it('loads from save version 79 with no brainstorms held', () => {
    const file = JSON.parse(JSON.stringify(toSaveFile(stale(), 0)));
    delete file.state.brainstorms;
    const loaded = fromSaveFile({ ...file, version: 79 });
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.state.brainstorms).toEqual({});
  });
});
