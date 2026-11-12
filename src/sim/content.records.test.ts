import { describe, expect, it } from 'vitest';
import { RECORDS } from '../config/balance';
import { STEPS } from '../config/guide';
import { TO_RECORD } from '../config/voiceOver';
import { buildRoom, buyRecords, buyTitle, recordsPrice, type ActionResult } from './actions';
import { showQuality } from './broadcast';
import { sensibleBot } from './bots';
import { hasRecords, libraryCapacity, libraryUsed, recordsBlocker } from './content';
import { autoPlaceFurniture, setUpPostRoom } from './fixtures';
import { stepDone } from './guide';
import { createInitialState } from './newGame';
import { proposeRoom } from './rooms';
import { fromSaveFile, SAVE_VERSION, toSaveFile } from './save';
import type { GameState } from './state';
import { advance } from './tick';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}
const error = (result: ActionResult) => (result.ok ? '' : result.error);

/** The sensible bot's radio station on its first day, with its records taken away and its library and post room cleared: a company that has to start them. */
function bare(): GameState {
  const s = structuredClone(sensibleBot(createInitialState(1)));
  s.rooms = s.rooms.filter((r) => r.type !== 'library' && r.type !== 'postRoom');
  s.records = [];
  s.money = 1_000_000;
  return s;
}

/** A library with `shelves` sets of shelves, behind a post room. */
function withLibrary(state: GameState, shelves: number): GameState {
  let s = ok(setUpPostRoom(state));
  const built = ok(buildRoom(s, { ...proposeRoom(s, 1, 'library')!, type: 'library' }));
  s = built;
  for (let i = 0; i < shelves; i++) s = ok(autoPlaceFurniture(s, built.lastId!, 'shelving'));
  return s;
}

describe('music needs its records in the library (#43)', () => {
  it('a music show with no records in the library cannot go on the air; with them it can', () => {
    const s = bare();
    const show = s.shows.find((x) => x.genre === 'top40')!;
    expect(showQuality(s, show).problems).toContain('No Top 40 records in the library');
    expect(showQuality(s, show).quality).toBe(0);

    const stocked = ok(buyRecords(withLibrary(s, 1), 'top40'));
    expect(hasRecords(stocked, 'top40')).toBe(true);
    expect(showQuality(stocked, show).problems).not.toContain('No Top 40 records in the library');
    expect(showQuality(stocked, show).quality).toBeGreaterThan(0);
    // The collection is the genre's: the rock show still has nothing to play.
    const rock = s.shows.find((x) => x.genre === 'rock')!;
    expect(showQuality(stocked, rock).problems).toContain('No Rock records in the library');
  });

  it('talk and the morning show play no records', () => {
    const s = bare();
    for (const show of s.shows.filter((x) => x.genre === 'morningShow' || x.genre === 'news')) {
      expect(showQuality(s, show).problems.join()).not.toMatch(/records/);
    }
    expect(recordsBlocker(withLibrary(s, 1), 'morningShow')).toMatch(/plays no records/);
  });

  it('is bought once, for a price, and takes a shelf’s worth of the library', () => {
    const s = withLibrary(bare(), 2);
    expect(libraryCapacity(s)).toBe(2 * RECORDS.libraryUnits);
    const bought = ok(buyRecords(s, 'rock'));
    expect(bought.money).toBe(s.money - recordsPrice(s, 'rock'));
    expect(libraryUsed(bought)).toBe(RECORDS.libraryUnits);
    expect(error(buyRecords(bought, 'rock'))).toMatch(/already hold/);
    // Not part of the running costs: it is bought once, like furniture.
    expect(bought.ledger.purchases).toBeGreaterThan(s.ledger.purchases);
  });

  it('is refused without a library, with a full one, and without the money', () => {
    expect(error(buyRecords(bare(), 'top40'))).toMatch(/library with shelving/);
    const one = withLibrary(bare(), 1);
    const first = ok(buyRecords(one, 'top40'));
    expect(error(buyRecords(first, 'rock'))).toMatch(/full/);
    expect(error(buyRecords({ ...withLibrary(bare(), 2), money: 100 }, 'top40'))).toMatch(/Not enough money/);
  });

  it('shares the shelves with the titles: records fill a library a title can then not enter', () => {
    const s = ok(buyRecords(withLibrary({ ...bare(), unlocked: ['content'] }, 1), 'top40'));
    s.market.titles.push({ id: 'offer', name: 'A Film', genre: 'movies', quality: 0.7, airings: 5, price: 5_000, fee: 0 });
    expect(error(buyTitle(s, 'offer'))).toMatch(/library is full/);
  });

  it('a game saved before it keeps the records its stations play, so none goes silent', () => {
    const s = advance(sensibleBot(createInitialState(1)), 5);
    const save = JSON.parse(JSON.stringify(toSaveFile(s, 0)));
    delete save.state.records;
    const { state, version } = fromSaveFile({ ...save, version: 42 });
    expect(version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(43);
    expect([...state.records].sort()).toEqual(['rock', 'top40']);
    for (const show of state.shows.filter((x) => x.genre === 'top40' || x.genre === 'rock')) {
      expect(showQuality(state, show).problems.join()).not.toMatch(/records/);
    }
  });

  it('the test player builds the library and buys the records before it goes on air, and its first shows play', () => {
    const s = sensibleBot(createInitialState(1));
    expect([...s.records].sort()).toEqual(['rock', 'top40']);
    expect(libraryUsed(s)).toBeLessThanOrEqual(libraryCapacity(s));
    for (const show of s.shows) expect(showQuality(s, show).problems.join(), show.name).not.toMatch(/records/);
  });

  describe('Penny', () => {
    it('has the library and the records before the channel, in the order the player needs them, with lines to record', () => {
      const ids = STEPS.map((line) => line.id);
      expect(ids.indexOf('music-post')).toBe(ids.indexOf('music-library') - 1);
      expect(ids.indexOf('music-library')).toBe(ids.indexOf('music-records') - 1);
      expect(ids.indexOf('music-records')).toBeLessThan(ids.indexOf('channel'));
      for (const id of ['music-post', 'music-library', 'music-records']) expect(TO_RECORD[id], id).toBeUndefined();
      // The recorded line about the license (“music is the cheapest thing to make”) is untouched.
      expect(TO_RECORD.license).toBeUndefined();
    });

    it('counts the steps done by what the company has', () => {
      const s = bare();
      expect(stepDone(s, 'music-post')).toBe(false);
      const post = ok(setUpPostRoom(s));
      expect(stepDone(post, 'music-post')).toBe(true);
      expect(stepDone(post, 'music-library')).toBe(false);
      // One shelf is not enough for two collections.
      const one = withLibrary(s, 1);
      expect(stepDone(one, 'music-library')).toBe(false);
      const two = withLibrary(s, 2);
      expect(stepDone(two, 'music-library')).toBe(true);
      expect(stepDone(two, 'music-records')).toBe(false);
      expect(stepDone(ok(buyRecords(ok(buyRecords(two, 'top40')), 'rock')), 'music-records')).toBe(true);
    });
  });
});
