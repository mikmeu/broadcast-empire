// The list of the Staff window (0.17.0, #70): who it shows, and in what order.
// The search, the sort and the two toggles are kept apart from the window, so
// that they stay while the game runs, across tabs and when it is closed and
// opened again. They are not saved: they are window settings.

import { create } from 'zustand';
import { STRIKES } from '../config/balance';
import { engineeredShows, showLoad } from '../sim/broadcast';
import { employeesWithDesk, needsDesk } from '../sim/office';
import type { Employee, GameState, Role } from '../sim/state';
import { ageOf } from '../sim/life';
import { TEAM_IDS, awayWithoutTemp } from '../sim/teams';
import { canHire } from '../sim/unlocks';

/** What the list can be sorted by. */
export type StaffSort = 'name' | 'age' | 'skill' | 'morale' | 'shows' | 'salary' | 'hired' | 'fame';
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
  return (['name', 'age', 'skill', 'morale', 'shows', 'salary', 'hired', 'fame'] as StaffSort[]).filter(
    (sort) => (sort !== 'shows' || roles.some((r) => SHOW_ROLES.includes(r))) && (sort !== 'fame' || roles.includes('host')),
  );
}

/** Which way a sort goes when it is picked: names A to Z, the first hired first, and the most of everything else first (the oldest, for age). */
export const firstDirection = (sort: StaffSort): SortDirection => (sort === 'name' || sort === 'hired' ? 'up' : 'down');

/** Whether something about someone asks for the player's attention: no desk, no show, no channel, an offer from a rival, or away with nobody in their place. */
export function needsAttention(game: GameState, employee: Employee): boolean {
  if (awayWithoutTemp(game, employee)) return true;
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
      case 'age':
        return ageOf(game, e) ?? 0;
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

/** The three tabs of the Staff window (0.18.0, #113). */
export type StaffTop = 'staff' | 'teams' | 'hiring';

export type GroupId = 'hosts' | 'content' | 'management' | 'business' | 'support';

/** The headings the kinds of staff are grouped under, in the staff list and in the hiring pool; every role is in exactly one. */
export const GROUPS: { id: GroupId; label: string; roles: Role[] }[] = [
  { id: 'hosts', label: 'Hosts', roles: ['host'] },
  { id: 'content', label: 'Content', roles: ['production', 'writer', 'editor', 'engineer', 'scheduler'] },
  { id: 'management', label: 'Management', roles: ['channelManager', 'manager', 'talentManager'] },
  { id: 'business', label: 'Business', roles: ['sales', 'marketing', 'researcher'] },
  { id: 'support', label: 'Support', roles: ['cleaner', 'technician', 'maintenance', 'cook', 'clerk', 'guard', 'recruiter', 'lawyer'] },
];

/** The tabs of the team: one for each kind of staff, with those who keep the building going together. */
export const TEAM_TABS: { id: string; label: string; roles: Role[]; none: string }[] = [
  { id: 'host', label: 'Hosts', roles: ['host'], none: 'No hosts yet.' },
  { id: 'production', label: 'Production', roles: ['production'], none: 'No production staff yet.' },
  { id: 'writer', label: 'Writers', roles: ['writer'], none: 'No writers yet.' },
  { id: 'editor', label: 'Editors', roles: ['editor'], none: 'No video editors yet.' },
  { id: 'engineer', label: 'Audio', roles: ['engineer'], none: 'No audio engineers yet.' },
  { id: 'scheduler', label: 'Schedulers', roles: ['scheduler'], none: 'No music schedulers yet.' },
  { id: 'managers', label: 'Managers', roles: ['channelManager', 'manager', 'talentManager'], none: 'No managers yet.' },
  { id: 'sales', label: 'Sales', roles: ['sales'], none: 'Nobody in sales yet.' },
  { id: 'marketing', label: 'Marketing', roles: ['marketing'], none: 'Nobody in marketing yet.' },
  { id: 'researcher', label: 'R&D', roles: ['researcher'], none: 'No researchers yet.' },
  { id: 'other', label: 'Other', roles: ['cleaner', 'technician', 'maintenance', 'cook', 'clerk', 'guard', 'recruiter', 'lawyer'], none: 'No cleaners, technicians, maintenance staff, cooks, clerks, guards, recruiters or lawyers yet.' },
];

export interface GroupTabs<T> {
  id: GroupId;
  label: string;
  /** The tabs shown for the group; a second row of tabs is drawn only when there is more than one. */
  tabs: T[];
}

/** The group a tab of the staff list or a role of the pool belongs to. */
export const groupOf = (roles: Role[]): GroupId => GROUPS.find((g) => g.roles.includes(roles[0]!))!.id;

/**
 * The groups of the staff list, with the tabs in each that are shown: a kind of staff the company cannot hire
 * yet has no tab until it can, or until someone of that kind works there. A group without tabs is left out.
 */
export function visibleStaffGroups(game: GameState): GroupTabs<(typeof TEAM_TABS)[number]>[] {
  const shown = TEAM_TABS.filter((t) => game.employees.some((e) => t.roles.includes(e.role)) || t.roles.some((role) => canHire(game, role)));
  return GROUPS.map((g) => ({ id: g.id, label: g.label, tabs: shown.filter((t) => groupOf(t.roles) === g.id) })).filter((g) => g.tabs.length > 0);
}

/** The groups of the hiring pool, with one tab for each role the company can hire for (department managers always). */
export function visiblePoolGroups(game: GameState): GroupTabs<{ id: Role; roles: Role[] }>[] {
  return GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    tabs: g.roles.filter((r) => canHire(game, r) || r === 'manager').map((r) => ({ id: r, roles: [r] })),
  })).filter((g) => g.tabs.length > 0);
}

/** The top tab the window opens on: the last one used; until one is, Staff, or Hiring for a company with nobody yet. */
export const openTop = (game: GameState, picked: StaffTop | null): StaffTop => picked ?? (game.employees.length === 0 ? 'hiring' : 'staff');

/** Which top tabs have something to look at: someone needs attention, a team is unhappy, a recruiter has found someone. */
export function topDots(game: GameState): Record<StaffTop, boolean> {
  return {
    staff: game.employees.some((e) => needsAttention(game, e)),
    teams: TEAM_IDS.some((team) => game.unrest[team] != null),
    hiring: game.candidates.some((c) => c.foundFor),
  };
}

interface StaffListView extends StaffListOptions {
  /** Window settings, not saved: the top tab (null until picked), the tab of the staff list and the role of the pool. */
  top: StaffTop | null;
  tab: string | null;
  poolRole: Role;
  setTop(top: StaffTop): void;
  setTab(tab: string): void;
  setPoolRole(role: Role): void;
  setQuery(query: string): void;
  /** Sorts by this; picked again, it turns the other way. */
  sortBy(sort: StaffSort): void;
  toggleAttention(): void;
  toggleLowMorale(): void;
}

export const useStaffList = create<StaffListView>()((setState) => ({
  ...ALL_STAFF,
  top: null,
  tab: null,
  poolRole: 'host',
  setTop: (top) => setState({ top }),
  setTab: (tab) => setState({ tab }),
  setPoolRole: (poolRole) => setState({ poolRole }),
  setQuery: (query) => setState({ query }),
  sortBy: (sort) => setState((s) => (s.sort === sort ? { dir: s.dir === 'up' ? 'down' : 'up' } : { sort, dir: firstDirection(sort) })),
  toggleAttention: () => setState((s) => ({ attention: !s.attention })),
  toggleLowMorale: () => setState((s) => ({ lowMorale: !s.lowMorale })),
}));
