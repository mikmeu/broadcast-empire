import { describe, expect, it } from 'vitest';
import { OFF_SPECIALTY_SKILL } from '../config/balance';
import type { GenreId } from '../config/genres';
import { bestFreeHost, hostSkill, hostTaken } from './broadcast';
import { createInitialState } from './newGame';
import type { Employee, GameState } from './state';

/** A host of the given skill and genres. */
const host = (id: string, skill: number, specialties: GenreId[]): Employee => ({
  id,
  name: `Host ${id}`,
  role: 'host',
  skill,
  salary: 2_000,
  specialties,
  fame: 0,
  department: null,
  hiredOn: 0,
  xp: 0,
  level: 1,
  morale: 70,
  location: null,
  desk: null,
  trainingUntil: null,
  leaving: null,
  talentUntil: null,
});

/** A new game whose only hosts are the ones given, and no shows. */
function station(hosts: Employee[]): GameState {
  const s = createInitialState(1);
  s.employees = [...s.employees.filter((e) => e.role !== 'host'), ...hosts];
  s.shows = [];
  return s;
}

/** A show with a host, and nothing else. */
const showFor = (id: string, hostId: string): GameState['shows'][number] => ({
  id,
  name: `Show ${id}`,
  genre: 'news',
  hostId,
  staffIds: [],
  writerIds: [],
  editorIds: [],
  studioId: null,
  freshness: 1,
});

describe('the best free host for a genre (0.17.0)', () => {
  it('prefers a host whose genre it is over a stronger one from another genre', () => {
    // 70 in rock beats 90 outside it: 90 counts for OFF_SPECIALTY_SKILL of itself.
    const s = station([host('a', 90, ['news']), host('b', 70, ['rock'])]);
    expect(90 * OFF_SPECIALTY_SKILL).toBeLessThan(70);
    expect(bestFreeHost(s, 'rock')?.id).toBe('b');
    expect(bestFreeHost(s, 'news')?.id).toBe('a');
    expect(hostSkill(bestFreeHost(s, 'rock')!, 'rock')).toBeCloseTo(0.7);
  });

  it('skips a host who presents another show, or is in the talent programme', () => {
    const s = station([host('a', 90, ['rock']), host('b', 80, ['rock']), host('c', 40, ['rock'])]);
    s.shows = [{ ...showFor('s1', 'a') }];
    s.employees.find((e) => e.id === 'b')!.talentUntil = s.day + 10;
    expect(hostTaken(s, s.employees.find((e) => e.id === 'a')!)).toBe(true);
    expect(bestFreeHost(s, 'rock')?.id).toBe('c');
    // While their own show is being changed, its host is free for it.
    expect(bestFreeHost(s, 'rock', 's1')?.id).toBe('a');
  });

  it('is null when no host is free', () => {
    const s = station([host('a', 90, ['rock'])]);
    s.shows = [showFor('s1', 'a')];
    expect(bestFreeHost(s, 'rock')).toBeNull();
    expect(bestFreeHost(station([]), 'rock')).toBeNull();
  });
});
