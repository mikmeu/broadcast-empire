import { describe, expect, it } from 'vitest';
import { GRACE } from '../config/balance';
import { STEPS, TV_STEPS } from '../config/guide';
import { TO_RECORD } from '../config/voiceOver';
import { buildRoom, buyTitle, hire, promote, sellFurniture, setRoomType, type ActionResult } from './actions';
import { sensibleBot } from './bots';
import { postRoomNeeded } from './content';
import { salaryFor } from './economy';
import { autoPlaceFurniture, setUpPostRoom } from './fixtures';
import { stepDone } from './guide';
import { createInitialState } from './newGame';
import { proposeRoom, kindError } from './rooms';
import { SAVE_VERSION, fromSaveFile, toSaveFile } from './save';
import { advance } from './tick';
import { promotionBlocker, promotionDepartment } from './staff';
import type { GameState, Person } from './state';
import { isUnlocked, unlockAll } from './unlocks';

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

/** Hires a made-up person straight from the pool. Their id is `lastId`. */
function hirePerson(state: GameState, person: Partial<Person> & Pick<Person, 'role'>): GameState & { lastId?: string } {
  const s = structuredClone(state);
  const id = `p-${s.nextId++}`;
  s.candidates.push({ id, name: `Test ${person.role} ${id}`, skill: 50, salary: 500, specialties: [], fame: 0, department: null, ...person });
  return Object.assign(ok(hire(s, id)), { lastId: id });
}

describe('Promotion to head of a department (0.17.0, #49)', () => {
  it('takes the department from the job; hosts, channel managers and support staff have none', () => {
    expect(promotionDepartment('engineer')).toBe('production');
    expect(promotionDepartment('writer')).toBe('production');
    expect(promotionDepartment('researcher')).toBe('research');
    expect(promotionDepartment('sales')).toBe('sales');
    for (const role of ['host', 'channelManager', 'cleaner', 'manager'] as const) expect(promotionDepartment(role)).toBeNull();
  });

  it('takes them off their shows and their desk, and pays them as a manager', () => {
    let s = hirePerson(station(), { role: 'production', skill: 70 });
    const id = s.lastId!;
    s.shows[0]!.staffIds.push(id);
    s.shows[0]!.writerIds.push(id);
    s.employees.find((e) => e.id === id)!.desk = 'some-desk';
    s = ok(promote(s, id));
    const head = s.employees.find((e) => e.id === id)!;
    expect(head.role).toBe('manager');
    expect(head.department).toBe('production');
    expect(head.desk).toBeNull();
    expect(head.skill).toBe(70);
    expect(head.salary).toBe(Math.max(500, salaryFor('manager', 70, 0, s)));
    expect(s.shows.some((show) => show.staffIds.includes(id) || show.writerIds.includes(id))).toBe(false);
    expect(s.messages.some((m) => m.text.includes('is the head of Production now'))).toBe(true);
  });

  it('never lowers the salary', () => {
    const s = hirePerson(station(), { role: 'sales', skill: 10, salary: 99_000 });
    expect(ok(promote(s, s.lastId!)).employees.find((e) => e.id === s.lastId)!.salary).toBe(99_000);
  });

  it('ends the campaign a marketer runs', () => {
    const s = hirePerson(station(), { role: 'marketing' });
    s.campaigns.push({ id: 'c-test', targetId: s.channels[0]!.id, audience: 'all', weeklyBudget: 1_000, marketerId: s.lastId!, endDay: s.day + 28, weeks: 4, repeat: false });
    expect(ok(promote(s, s.lastId!)).campaigns.some((c) => c.id === 'c-test')).toBe(false);
  });

  it('allows one head per department: a second promotion or hire fails', () => {
    let s = hirePerson(station(), { role: 'sales' });
    s = ok(promote(s, s.lastId!));
    const second = hirePerson(s, { role: 'sales' });
    expect(error(promote(second, second.lastId!))).toBe('You already have a sales manager.');
    const candidate = structuredClone(s);
    candidate.candidates.push({ id: 'p-head', name: 'Test head', role: 'manager', department: 'sales', skill: 50, salary: 3_000, specialties: [], fame: 0 });
    expect(error(hire(candidate, 'p-head'))).toBe('You already have a sales manager.');
  });

  it('is blocked for other jobs, on a course, on strike, while leaving, and in a locked department', () => {
    const s = station();
    const host = s.employees.find((e) => e.role === 'host')!;
    expect(promotionBlocker(s, host)).toMatch(/Only production/);

    const withWriter = hirePerson(s, { role: 'writer' });
    const writer = withWriter.employees.find((e) => e.id === withWriter.lastId)!;
    expect(promotionBlocker(withWriter, writer)).toBeNull();
    expect(promotionBlocker(withWriter, { ...writer, trainingUntil: s.day + 5 })).toMatch(/on a course/);
    expect(promotionBlocker(withWriter, { ...writer, leaving: { on: s.day + 5, rivalId: 'r' } })).toMatch(/is leaving/);
    const striking = structuredClone(withWriter);
    striking.unrest.production = { since: s.day - 30, warnedOn: s.day - 10, strikeUntil: s.day + 5 };
    expect(promotionBlocker(striking, writer)).toMatch(/on strike/);

    const fresh = createInitialState(1);
    expect(isUnlocked(fresh, 'research')).toBe(false);
    expect(promotionBlocker(fresh, { ...writer, role: 'researcher' })).not.toBeNull();
  });
});

describe('A post room before the library (0.17.0, #42)', () => {
  /** The station on two floors, without a post room. */
  const noPost = (): GameState => {
    const s = station();
    s.floorsUnlocked = 2;
    s.rooms = s.rooms.filter((r) => r.type !== 'postRoom');
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

  it('Penny has the post room built before the library, and the line waits for its recording', () => {
    const ids = TV_STEPS.map((line) => line.id);
    expect(ids.indexOf('tv-post')).toBe(ids.indexOf('tv-library') - 1);
    expect(TO_RECORD['tv-post']).toBe('new');
    const s = noPost();
    expect(stepDone(s, 'tv-post')).toBe(false);
    expect(stepDone(ok(setUpPostRoom(s)), 'tv-post')).toBe(true);
  });
});

describe('Penny points out the cables (0.17.0, #46)', () => {
  it('says in the master control step that the cables lay themselves and that Cables shows them', () => {
    const mcr = STEPS.find((line) => line.id === 'mcr')!;
    expect(mcr.say).toMatch(/the cables lay themselves/);
    expect(mcr.say).toMatch(/Cables, beside the floors, shows them/);
    expect(mcr.say).toMatch(/a red one is a channel that cannot go out/);
    expect(mcr.how?.at(-1)).toMatch(/“Cables” beside the floors/);
    // The recording has the old words until Mike records the new ones.
    expect(TO_RECORD.mcr).toBe('changed');
  });
});
