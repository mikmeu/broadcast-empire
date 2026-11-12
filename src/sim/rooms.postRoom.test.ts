import { describe, expect, it } from 'vitest';
import { GRACE } from '../config/balance';
import { TV_STEPS } from '../config/guide';
import { TO_RECORD } from '../config/voiceOver';
import { buildRoom, buyTitle, sellFurniture, setRoomType, type ActionResult } from './actions';
import { sensibleBot } from './bots';
import { postRoomNeeded } from './content';
import { autoPlaceFurniture, setUpPostRoom } from './fixtures';
import { stepDone } from './guide';
import { createInitialState } from './newGame';
import { proposeRoom, kindError } from './rooms';
import { SAVE_VERSION, fromSaveFile, toSaveFile } from './save';
import { advance } from './tick';
import type { GameState } from './state';
import { unlockAll } from './unlocks';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}
const error = (result: ActionResult) => (result.ok ? 'no error' : result.error);

/** A radio station from the sensible test player, a month on the air, with everything open and money to spare. */
const station = (): GameState => {
  const s = structuredClone(unlockAll(advance(sensibleBot(createInitialState(1)), 30)));
  s.money = 5_000_000;
  s.employees = s.employees.filter((e) => e.role !== 'manager' || e.department === null);
  return s;
};

describe('A post room before the library (0.17.0, #42)', () => {
  /** The station on two floors, without a post room. */
  const noPost = (): GameState => {
    const s = station();
    s.floorsUnlocked = 2;
    // And without the library and records the bot keeps (0.18.0): this is a company that has none yet.
    s.rooms = s.rooms.filter((r) => r.type !== 'postRoom' && r.type !== 'library');
    s.records = [];
    return s;
  };
  /** Builds a library where the game proposes one, with a shelf. Its id is `lastId`. */
  function library(state: GameState): GameState & { lastId?: string } {
    const floor = [1, 2].find((f) => proposeRoom(state, f, 'library'))!;
    const built = ok(buildRoom(state, { ...proposeRoom(state, floor, 'library')!, type: 'library' }));
    return Object.assign(ok(autoPlaceFurniture(built, built.lastId!, 'shelving')), { lastId: built.lastId });
  }
  const series = (s: GameState) => s.market.titles.find((t) => t.genre === 'series')!.id;
  /** The company without its post rooms, as one that closed them. */
  const withoutPost = (s: GameState): GameState => ({ ...s, rooms: s.rooms.filter((r) => r.type !== 'postRoom') });

  it('a library can’t be built, nor a room made into one, without a post room with its sorting case', () => {
    const s = noPost();
    expect(postRoomNeeded(s)).toBe(true);
    expect(kindError(s, 'library')).toMatch(/needs a post room with a sorting case/);
    const floor = [1, 2].find((f) => proposeRoom(s, f, 'library'))!;
    expect(error(buildRoom(s, { ...proposeRoom(s, floor, 'library')!, type: 'library' }))).toMatch(/post room/);
    // An empty office, to be made into a library.
    const empty = ok(buildRoom(s, { ...proposeRoom(s, floor, 'library')!, type: 'office' }));
    const office = empty.lastId!;
    expect(error(setRoomType(empty, office, 'library'))).toMatch(/post room/);
    // A post room with nothing in it is not enough.
    const bare = ok(buildRoom(empty, { ...proposeRoom(empty, [1, 2].find((f) => proposeRoom(empty, f, 'postRoom'))!, 'postRoom')!, type: 'postRoom' }));
    expect(kindError(bare, 'library')).not.toBeNull();
    const post = ok(setUpPostRoom(empty));
    expect(kindError(post, 'library')).toBeNull();
    expect(ok(setRoomType(post, office, 'library')).rooms.find((r) => r.roomId === office)!.type).toBe('library');
  });

  it('titles can be bought only with a post room; a post room emptied or closed stops counting', () => {
    const s = library(ok(setUpPostRoom(noPost())));
    expect(ok(buyTitle(s, series(s))).library).toHaveLength(1);
    expect(error(buyTitle(withoutPost(s), series(s)))).toMatch(/come by post/);
    const post = s.rooms.find((r) => r.type === 'postRoom')!;
    const emptied = ok(sellFurniture(s, post.roomId, post.furniture.find((f) => f.type === 'sortingCase')!.id));
    expect(postRoomNeeded(emptied)).toBe(true);
    expect(error(buyTitle(emptied, series(emptied)))).toMatch(/come by post/);
    // The library keeps what it has.
    expect(emptied.rooms.some((r) => r.type === 'library')).toBe(true);
  });

  it('a server rack in a library lifts the rule, and selling it brings it back', () => {
    let s = library(ok(setUpPostRoom(noPost())));
    const libraryId = s.lastId!;
    s = { ...s, techs: [...s.techs, 'personalComputer'] };
    s = ok(autoPlaceFurniture(s, libraryId, 'serverRack'));
    const closed = withoutPost(s);
    expect(postRoomNeeded(closed)).toBe(false);
    expect(kindError(closed, 'library')).toBeNull();
    expect(ok(buyTitle(closed, series(closed))).library).toHaveLength(1);
    expect(stepDone(closed, 'tv-post')).toBe(true);
    const rack = closed.rooms.find((r) => r.roomId === libraryId)!.furniture.find((f) => f.type === 'serverRack')!;
    const sold = ok(sellFurniture(closed, libraryId, rack.id));
    expect(postRoomNeeded(sold)).toBe(true);
  });

  it('an older game with a library and no post room gets a month, then the rule holds', () => {
    const s = withoutPost(library(ok(setUpPostRoom(noPost()))));
    const save = JSON.parse(JSON.stringify(toSaveFile(s, 0)));
    const { state, version } = fromSaveFile({ ...save, version: 32 });
    expect(version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(35);
    expect(state.grace.postRoom).toBe(s.day + GRACE.days);
    expect(state.messages.at(-1)!.text).toMatch(/^Titles come by post now\. Build a post room with a sorting case before .+ to keep buying titles\. Your library goes on airing what it has\.$/);
    expect(postRoomNeeded(state)).toBe(false);
    expect(ok(buyTitle(state, series(state))).library).toHaveLength(1);
    const later = { ...state, day: state.day + GRACE.days };
    expect(error(buyTitle(later, series(later)))).toMatch(/come by post/);
  });

  it('a game without a library, or with a post room, gets no grace and no warning', () => {
    for (const s of [noPost(), library(ok(setUpPostRoom(noPost())))]) {
      const { state } = fromSaveFile({ ...JSON.parse(JSON.stringify(toSaveFile(s, 0))), version: 32 });
      expect(state.grace.postRoom).toBeUndefined();
      expect(state.messages.some((m) => /Titles come by post/.test(m.text))).toBe(false);
    }
  });

  it('Penny has the post room built before the library, and the line is recorded', () => {
    const ids = TV_STEPS.map((line) => line.id);
    expect(ids.indexOf('tv-post')).toBe(ids.indexOf('tv-library') - 1);
    expect(TO_RECORD['tv-post']).toBeUndefined();
    const s = noPost();
    expect(stepDone(s, 'tv-post')).toBe(false);
    expect(stepDone(ok(setUpPostRoom(s)), 'tv-post')).toBe(true);
  });
});
