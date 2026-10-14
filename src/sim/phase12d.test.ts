import { describe, expect, it } from 'vitest';
import { FRESHNESS_DECAY, FRESHNESS_MIN, MAX_SHOWS_PER_HOST, MAX_SHOWS_PER_PERSON, SALARY } from '../config/balance';
import { createShow, updateShow, type ActionResult } from './actions';
import { sensibleBot } from './bots';
import { hasCapacity, showLimit, showLoad } from './broadcast';
import { salaryFor } from './economy';
import { createInitialState } from './newGame';
import { SAVE_VERSION, fromSaveFile, toSaveFile } from './save';
import type { GameState } from './state';
import { tick } from './tick';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
const error = (result: ActionResult) => (result.ok ? '' : result.error);

/** The sensible bot's station on its first day: five radio shows on the air. */
const station = () => sensibleBot(createInitialState(1));

describe('freshness (Phase 12d)', () => {
  it('wears a show down slowly: nine tenths after two months, just under half after a year', () => {
    let s = station();
    const show = s.shows.find((x) => x.hostId !== null)!;
    const fresh = (state: GameState) => state.shows.find((x) => x.id === show.id)!.freshness;
    expect(fresh(s)).toBe(1);
    // No bot from here on, so nobody revamps the show.
    const at: Record<number, number> = {};
    for (let day = 1; day <= 365; day++) {
      s = tick(s);
      at[day] = fresh(s);
    }
    expect(at[60]).toBeGreaterThan(0.9);
    expect(at[60]).toBeCloseTo(1 - 60 * FRESHNESS_DECAY, 6);
    expect(at[365]).toBeLessThan(0.5);
    expect(at[365]).toBeGreaterThan(0.47);
    // It never rises by itself, and falls a little every day it is on the air.
    for (let day = 2; day <= 365; day++) expect(at[day]).toBeLessThan(at[day - 1]!);
  });

  it('stops at a floor well under half, more than a year in', () => {
    expect(FRESHNESS_MIN).toBeLessThan(0.45);
    expect((1 - FRESHNESS_MIN) / FRESHNESS_DECAY).toBeGreaterThan(365);
    let s = station();
    s = { ...s, shows: s.shows.map((show) => ({ ...show, freshness: FRESHNESS_MIN + FRESHNESS_DECAY / 2 })) };
    s = tick(tick(s));
    for (const show of s.shows.filter((x) => x.hostId !== null)) expect(show.freshness).toBe(FRESHNESS_MIN);
  });
});

describe('one show per host (Phase 12d)', () => {
  it('lets a host present one show, and someone in production work on two', () => {
    expect(MAX_SHOWS_PER_HOST).toBe(1);
    expect(showLimit('host')).toBe(1);
    expect(showLimit('production')).toBe(MAX_SHOWS_PER_PERSON);
    const s = station();
    const hosted = s.shows.filter((show) => show.hostId !== null);
    // A full day of five shows has five different hosts.
    expect(hosted).toHaveLength(5);
    expect(new Set(hosted.map((show) => show.hostId)).size).toBe(5);
    for (const host of s.employees.filter((e) => e.role === 'host')) {
      expect(showLoad(s, host.id)).toBeLessThanOrEqual(1);
      expect(hasCapacity(s, host.id)).toBe(showLoad(s, host.id) === 0);
    }
    expect(s.employees.some((e) => e.role === 'production' && showLoad(s, e.id) === 2)).toBe(true);
    expect(hasCapacity(s, 'nobody')).toBe(false);
  });

  it('refuses a second show for a host who has one, and says why', () => {
    const s = station();
    const first = s.shows.find((show) => show.hostId !== null)!;
    const input = { name: 'Second helping', genre: first.genre, hostId: first.hostId, staffIds: [], studioId: first.studioId };
    expect(error(createShow(s, input))).toMatch(/already presents a show: a host is on the air once a day/);
    // Giving another show this host is refused too.
    const other = s.shows.find((show) => show.hostId !== null && show.id !== first.id)!;
    expect(error(updateShow(s, other.id, { name: other.name, genre: other.genre, hostId: first.hostId, staffIds: other.staffIds, studioId: other.studioId }))).toMatch(/already presents a show/);
    // The show a host is on can be changed with them still on it.
    const renamed = ok(updateShow(s, first.id, { name: 'A new name', genre: first.genre, hostId: first.hostId, staffIds: first.staffIds, studioId: first.studioId }));
    expect(renamed.shows.find((show) => show.id === first.id)!.name).toBe('A new name');
  });

  it('pays a host for one show a day: five hosts cost about what three did', () => {
    const before = (skill: number, fame: number) => Math.min(6_000, 1_000 + (3_500 * skill) / 100 + (1_500 * fame) / 100);
    for (const [skill, fame] of [[50, 5], [70, 25], [90, 60]] as const) {
      const now = salaryFor('host', skill, fame, { difficulty: 'normal' });
      expect(now).toBeGreaterThanOrEqual(SALARY.host.min);
      expect(now).toBeLessThanOrEqual(SALARY.host.max);
      expect(5 * now).toBeLessThanOrEqual(3 * before(skill, fame) * 1.2);
      expect(5 * now).toBeGreaterThanOrEqual(3 * before(skill, fame) * 0.9);
    }
  });
});

describe('a game from before the rule (Phase 12d)', () => {
  /** A save of version 18 in which one host presents two shows, as was allowed then. */
  function old(): { file: { version: number; savedAt: number; state: GameState }; hostId: string; showIds: string[] } {
    const state = structuredClone(station());
    const [a, b] = state.shows.filter((show) => show.hostId !== null);
    b!.hostId = a!.hostId;
    const file = JSON.parse(JSON.stringify(toSaveFile(state, 0)));
    return { file: { ...file, version: 18 }, hostId: a!.hostId!, showIds: [a!.id, b!.id] };
  }

  it('loads with its hosts on the shows they had, and a message that says what changed', () => {
    const { file, hostId, showIds } = old();
    const { version, state } = fromSaveFile(file);
    expect(version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(19);
    expect(state.shows.filter((show) => show.hostId === hostId).map((show) => show.id)).toEqual(showIds);
    const host = state.employees.find((e) => e.id === hostId)!;
    const message = state.messages[state.messages.length - 1]!;
    expect(message.text).toMatch(/A host now presents one show a day/);
    expect(message.text).toContain(host.name);
    // Their salary is what they were hired at.
    expect(host.salary).toBe(file.state.employees.find((e) => e.id === hostId)!.salary);
  });

  it('keeps those shows as they are when they are edited, but gives that host no third', () => {
    const { file, hostId, showIds } = old();
    const { state } = fromSaveFile(file);
    const second = state.shows.find((show) => show.id === showIds[1])!;
    const edited = ok(updateShow(state, second.id, { name: 'Still on', genre: second.genre, hostId, staffIds: second.staffIds, studioId: second.studioId }));
    expect(edited.shows.find((show) => show.id === second.id)).toMatchObject({ name: 'Still on', hostId });
    expect(error(createShow(state, { name: 'A third', genre: second.genre, hostId, staffIds: [], studioId: second.studioId }))).toMatch(/already presents a show/);
    // The game plays on.
    let s = state;
    for (let day = 0; day < 10; day++) s = tick(s);
    expect(s.day).toBe(state.day + 10);
  });

  it('says nothing to a game in which no host presents two shows', () => {
    const file = JSON.parse(JSON.stringify(toSaveFile(station(), 0)));
    const { state } = fromSaveFile({ ...file, version: 18 });
    expect(state.messages.some((m) => /A host now presents one show a day/.test(m.text))).toBe(false);
  });
});
