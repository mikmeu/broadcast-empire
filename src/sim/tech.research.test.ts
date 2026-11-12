import { describe, expect, it } from 'vitest';
import { TECHS, getTech } from '../config/tech';
import { openDecade, research } from './actions';
import { toDay } from './calendar';
import { runCheat } from './cheats';
import { createInitialState } from './newGame';
import { SAVE_VERSION, fromSaveFile, toSaveFile } from './save';
import type { GameState } from './state';
import { tick } from './tick';
import { decadeBlocker, decadeCost, decadeOpen, nextDecade, researchBlocker } from './tech';

/** A game on a date, with the Research window open and points to spend. */
const at = (year: number, points = 0, techs: GameState['techs'] = []): GameState => ({
  ...createInitialState(1),
  day: toDay(year, 6, 1),
  unlocked: ['research' as const, ...createInitialState(1).unlocked],
  researchPoints: points,
  techs,
});

describe('research by decade (#206)', () => {
  it('gives every technology a category, and starts a new game in the 1970s', () => {
    expect(TECHS.every((t) => ['genres', 'upgrades', 'jobs'].includes(t.category))).toBe(true);
    expect(TECHS.filter((t) => t.category === 'genres')).toHaveLength(9);
    expect(TECHS.filter((t) => t.category === 'jobs')).toHaveLength(9);
    expect(createInitialState(1).decadeReached).toBe(1970);
  });

  it('prices the decades at 500 points for the 1980s, doubling', () => {
    expect([1980, 1990, 2000, 2010, 2020].map(decadeCost)).toEqual([500, 1000, 2000, 4000, 8000]);
  });

  it('keeps a decade closed to an early technology until it is opened', () => {
    const musicVideo = getTech('musicVideoFormat');
    const s = at(1977, 5000);
    expect(researchBlocker(s, musicVideo)).toBe('Reach the 1980s first');
    const failed = research(s, 'musicVideoFormat');
    expect(failed.ok).toBe(false);
    const opened = openDecade(s, 1980);
    if (!opened.ok) throw new Error(opened.error);
    expect(opened.state.researchPoints).toBe(4500);
    expect(opened.state.decadeReached).toBe(1980);
    expect(researchBlocker(opened.state, musicVideo)).toBeNull();
    expect(research(opened.state, 'musicVideoFormat').ok).toBe(true);
  });

  it('opens decades in order, from five years before, and only with the points', () => {
    expect(decadeBlocker(at(1970, 5000), 1980)).toBe('Can be opened from 1975');
    expect(decadeBlocker(at(1977, 100), 1980)).toBe('Not enough research points');
    expect(decadeBlocker(at(1977, 9000), 1990)).toBe('Reach the 1980s first');
    expect(nextDecade(at(1977))).toBe(1980);
    expect(openDecade(at(1977, 100), 1980).ok).toBe(false);
  });

  it('does not ask for a decade once the calendar is in it', () => {
    const s = at(1985, 0);
    expect(decadeOpen(s, 1980)).toBe(true);
    expect(researchBlocker(s, getTech('cableDistribution'))).toBe('Not enough research points');
    expect(nextDecade(s)).toBe(1990);
  });

  it('says once when the points for the next decade are in', () => {
    // The points are in; the day the 1980s come within five years (1 January 1975) it can be opened.
    let s = { ...at(1974, 5000), day: toDay(1974, 12, 31) };
    const before = s.messages.length;
    s = tick(s);
    s = tick(s);
    const news = s.messages.slice(before).filter((m) => m.text.includes('open up the 1980s'));
    expect(news).toHaveLength(1);
  });

  it('opens every decade with the cheat', () => {
    const result = runCheat(at(1972), 'research all');
    if (!result.ok) throw new Error(result.error);
    expect(result.state.decadeReached).toBe(2020);
  });

  it('opens the decades of an older save up to its year and its newest technology', () => {
    const load = (state: GameState) => {
      const file = JSON.parse(JSON.stringify(toSaveFile(state, 0)));
      delete file.state.decadeReached;
      return fromSaveFile({ ...file, version: 61 });
    };
    const early = load(at(1977, 0, ['musicVideoFormat']));
    expect(early.version).toBe(SAVE_VERSION);
    expect(early.state.decadeReached).toBe(1980);
    expect(load(at(1977)).state.decadeReached).toBe(1970);
    expect(load(at(1995, 0, ['gameShowFormat'])).state.decadeReached).toBe(1990);
  });
});
