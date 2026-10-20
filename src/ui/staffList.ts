// The list of the Staff window (0.17.0, #70): who it shows, and in what order.
// The search, the sort and the two toggles are kept apart from the window, so
// that they stay while the game runs, across tabs and when it is closed and
// opened again. They are not saved: they are window settings.

import { create } from 'zustand';
import { STRIKES } from '../config/balance';
import { engineeredShows, showLoad } from '../sim/broadcast';
import { employeesWithDesk, needsDesk } from '../sim/office';
import type { Employee, GameState, Role } from '../sim/state';

/** What the list can be sorted by. */
export type StaffSort = 'name' | 'skill' | 'morale' | 'shows' | 'salary' | 'hired' | 'fame';
export type SortDirection = 'up' | 'down';

export interface StaffListOptions {
  /** Part of a name; capitals and accents do not count. */
  query: string;
  /** Null for the order people were hired in. */
  sort: StaffSort | null;
  dir: SortDirection;
  /** Only those who need attention: see `needsAttention`. */
  attention: boolean;
  /** Only those whose morale is under the line where a team threatens to strike. */
  lowMorale: boolean;
}

export const ALL_STAFF: StaffListOptions = { query: '', sort: null, dir: 'up', attention: false, lowMorale: false };

/** The controls show once the company has more than this many people; a new company does not need them. */
export const CONTROLS_FROM = 5;

/** The roles whose number of shows means something: those on shows, and audio engineers for the radio shows they look after. */
export const SHOW_ROLES: Role[] = ['host', 'production', 'writer', 'editor', 'engineer'];

/** The sorts of a tab, by the roles on it: Shows where they are on shows, Fame for hosts. */
export function sortsFor(roles: Role[]): StaffSort[] {
  return (['name', 'skill', 'morale', 'shows', 'salary', 'hired', 'fame'] as StaffSort[]).filter(
    (sort) => (sort !== 'shows' || roles.some((r) => SHOW_ROLES.includes(r))) && (sort !== 'fame' || roles.includes('host')),
  );
}

/** Which way a sort goes when it is picked: names A to Z, the first hired first, and the most of everything else first. */
export const firstDirection = (sort: StaffSort): SortDirection => (sort === 'name' || sort === 'hired' ? 'up' : 'down');

/** Whether something about someone asks for the player's attention: no desk, no show, no channel, or an offer from a rival. */
export function needsAttention(game: GameState, employee: Employee): boolean {
  if (needsDesk(employee.role) && !employeesWithDesk(game).has(employee.id)) return true;
  if (employee.role === 'channelManager') return !game.channels.some((c) => c.managerId === employee.id);
  if (employee.role === 'host')
    return (
      (showLoad(game, employee.id) === 0 && employee.talentUntil == null) ||
      game.poachOffers.some((offer) => offer.hostId === employee.id) ||
      game.awards.raises.some((request) => request.hostId === employee.id) ||
      employee.leaving !== null
    );
  return (employee.role === 'production' || employee.role === 'writer' || employee.role === 'editor') && showLoad(game, employee.id) === 0;
}

/**
 * How many shows someone is on, as the Staff window tags them: for an audio engineer the radio shows they look
 * after, which takes a desk; for the others `showLoad`.
 */
export function showCount(game: GameState, employee: Employee, engineered = engineerShows(game)): number {
  return employee.role === 'engineer' ? (engineered.get(employee.id) ?? 0) : showLoad(game, employee.id);
}

/** The number of radio shows each audio engineer with a desk looks after, by their id. */
function engineerShows(game: GameState): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { engineerId } of engineeredShows(game, employeesWithDesk(game)).values()) counts.set(engineerId, (counts.get(engineerId) ?? 0) + 1);
  return counts;
}

/** A name as the search compares it: without capitals or accents. */
export const plain = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const byName = (a: Employee, b: Employee) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });

/**
 * The people of a list that match the search and the toggles, in the order asked for. People with the same
 * value are in the order of their names, and then of when they were hired, so that the list never jumps.
 */
export function listStaff(game: GameState, people: Employee[], options: StaffListOptions): Employee[] {
  const query = plain(options.query.trim());
  const shown = people.filter(
    (e) => (query === '' || plain(e.name).includes(query)) && (!options.attention || needsAttention(game, e)) && (!options.lowMorale || e.morale < STRIKES.below),
  );
  const { sort } = options;
  if (sort === null) return shown;
  const engineered = sort === 'shows' ? engineerShows(game) : undefined;
  const value = (e: Employee): number => {
    switch (sort) {
      case 'skill':
        return e.skill;
      case 'morale':
        return e.morale;
      case 'shows':
        return showCount(game, e, engineered);
      case 'salary':
        return e.salary;
      case 'hired':
        return e.hiredOn;
      case 'fame':
        return e.fame;
      case 'name':
        return 0;
    }
  };
  const sign = options.dir === 'up' ? 1 : -1;
  const hired = new Map(people.map((e, i) => [e.id, i]));
  return shown.sort((a, b) => {
    const named = sort === 'name' ? sign * byName(a, b) : sign * (value(a) - value(b)) || byName(a, b);
    return named || hired.get(a.id)! - hired.get(b.id)!;
  });
}

interface StaffListView extends StaffListOptions {
  setQuery(query: string): void;
  /** Sorts by this; picked again, it turns the other way. */
  sortBy(sort: StaffSort): void;
  toggleAttention(): void;
  toggleLowMorale(): void;
}

export const useStaffList = create<StaffListView>()((setState) => ({
  ...ALL_STAFF,

  setQuery: (query) => setState({ query }),
  sortBy: (sort) => setState((s) => (s.sort === sort ? { dir: s.dir === 'up' ? 'down' : 'up' } : { sort, dir: firstDirection(sort) })),
  toggleAttention: () => setState((s) => ({ attention: !s.attention })),
  toggleLowMorale: () => setState((s) => ({ lowMorale: !s.lowMorale })),
}));
