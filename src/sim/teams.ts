// The teams of the company (0.15.0): who meets together in a meeting room and
// who strikes together. The production staff of a channel whose manager is at
// a desk meet with that channel manager instead (0.17.0): see `channelCrews`.
// Besides types and config, only functions are imported (office.ts and
// broadcast.ts import this file), and they are called only inside functions.

import { MEETINGS } from '../config/balance';
import { engineerRota } from './broadcast';
import { employeesWithDesk } from './office';
import type { Department, Employee, GameState, Id, Meeting, Role, TeamId } from './state';

export interface Team {
  name: string;
  /** In the middle of a sentence: “the hosts”, “the sales team”. */
  inText: string;
  roles: readonly Role[];
  /** The department whose manager calls its meetings. Null for a team that does not meet (since 0.17.0 the hosts too). */
  ledBy: Department | null;
}

export const TEAMS: Record<TeamId, Team> = {
  hosts: { name: 'Hosts', inText: 'the hosts', roles: ['host'], ledBy: null },
  production: { name: 'Production', inText: 'the production team', roles: ['production', 'writer', 'editor', 'engineer'], ledBy: 'production' },
  sales: { name: 'Sales', inText: 'the sales team', roles: ['sales'], ledBy: 'sales' },
  marketing: { name: 'Marketing', inText: 'the marketing team', roles: ['marketing'], ledBy: 'marketing' },
  research: { name: 'R&D', inText: 'the researchers', roles: ['researcher'], ledBy: 'research' },
  support: { name: 'Support staff', inText: 'the support staff', roles: ['cleaner', 'technician', 'maintenance', 'cook', 'clerk', 'recruiter'], ledBy: null },
};

export const TEAM_IDS = Object.keys(TEAMS) as TeamId[];

/** The team someone of a role belongs to; managers belong to none. */
export const teamOf = (role: Role): TeamId | null => TEAM_IDS.find((id) => TEAMS[id].roles.includes(role)) ?? null;

/** Everyone on a team. */
export const teamMembers = (state: Pick<GameState, 'employees'>, team: TeamId): Employee[] => state.employees.filter((e) => TEAMS[team].roles.includes(e.role));

/** Whether a team is on strike today. */
export const isStriking = (state: Pick<GameState, 'unrest' | 'day'>, team: TeamId) => {
  const until = state.unrest[team]?.strikeUntil;
  return until != null && state.day < until;
};

/** Whether someone is on strike today, with their team. */
export function onStrike(state: Pick<GameState, 'unrest' | 'day'>, employee: Pick<Employee, 'role'>): boolean {
  const team = teamOf(employee.role);
  return team !== null && isStriking(state, team);
}

// --- The production team of a channel (0.17.0) ---

const crewCache = new WeakMap<object, { key: readonly unknown[]; crews: ReadonlyMap<Id, Id> }>();

/**
 * The production staff who meet with a channel manager, with the channel they
 * meet for, by the person's id. Someone belongs to a channel whose manager is
 * at a desk when they work on a show on its schedule: as its production staff,
 * writer or video editor, or as the audio engineer who looks after it. On
 * shows of more than one such channel, to the one with most of their shows,
 * the first channel on a tie. Everyone else on the production team meets with
 * the manager of Production.
 *
 * Built once for a state (cached on its arrays), since the broadcast asks it
 * for everyone on every show.
 */
export function channelCrews(state: GameState): ReadonlyMap<Id, Id> {
  const key = [state.employees, state.shows, state.channels, state.rooms, state.lastDay] as const;
  const cached = crewCache.get(state.employees);
  if (cached && cached.key.every((part, i) => part === key[i])) return cached.crews;
  const crews = buildCrews(state);
  crewCache.set(state.employees, { key, crews });
  return crews;
}

function buildCrews(state: GameState): Map<Id, Id> {
  const crews = new Map<Id, Id>();
  if (!state.channels.some((c) => c.managerId !== null)) return crews;
  const desked = employeesWithDesk(state);
  const led = state.channels.filter((c) => c.managerId !== null && desked.has(c.managerId) && state.employees.some((e) => e.id === c.managerId && e.role === 'channelManager'));
  if (led.length === 0) return crews;
  const engineers = engineerRota(state, desked);
  const production = new Set(teamMembers(state, 'production').map((e) => e.id));
  const shows = new Map<Id, Map<Id, number>>();
  for (const channel of led) {
    for (const showId of new Set(channel.schedule)) {
      const show = showId ? state.shows.find((s) => s.id === showId) : undefined;
      if (!show) continue;
      const engineer = engineers.get(show.id)?.engineer.id;
      for (const id of new Set([...show.staffIds, ...show.writerIds, ...show.editorIds, ...(engineer ? [engineer] : [])])) {
        if (!production.has(id)) continue;
        const counts = shows.get(id) ?? new Map<Id, number>();
        counts.set(channel.id, (counts.get(channel.id) ?? 0) + 1);
        shows.set(id, counts);
      }
    }
  }
  for (const [id, counts] of shows) {
    // `led` keeps the order of the channels, and only more shows win: a tie goes to the first.
    let best: Id | null = null;
    for (const channel of led) if ((counts.get(channel.id) ?? 0) > (best ? counts.get(best)! : 0)) best = channel.id;
    if (best) crews.set(id, best);
  }
  return crews;
}

/** The channel someone meets for, or null if they meet with their team (or not at all). */
export function crewOf(state: GameState, employee: Pick<Employee, 'id' | 'role'>): Id | null {
  return teamOf(employee.role) === 'production' ? (channelCrews(state).get(employee.id) ?? null) : null;
}

/** The production staff who meet with a channel's manager. */
export const channelMembers = (state: GameState, channelId: Id): Employee[] => {
  const crews = channelCrews(state);
  return state.employees.filter((e) => crews.get(e.id) === channelId);
};

/** The people on a team who meet with its department manager: on the production team, those who meet with no channel manager. */
export const departmentMembers = (state: GameState, team: TeamId): Employee[] => {
  if (team !== 'production') return teamMembers(state, team);
  const crews = channelCrews(state);
  return teamMembers(state, team).filter((e) => !crews.has(e.id));
};

// --- Meetings ---

/** Whether any channel's production team sits in a meeting today. */
const channelMeetingToday = (state: GameState) => Object.values(state.channelMeetings).some((m) => m?.on === state.day);

/** The meeting someone sits in: their channel's, or their team's. */
function meetingOf(state: GameState, employee: Pick<Employee, 'id' | 'role'>, team: TeamId): Meeting | undefined {
  const channel = team === 'production' ? crewOf(state, employee) : null;
  return channel ? state.channelMeetings[channel] : state.meetings[team];
}

/** Whether someone's team, or their channel's production team, sits in a meeting today: they get only part of their work done (MEETINGS.workOnTheDay). */
export function inMeeting(state: GameState, employee: Pick<Employee, 'id' | 'role'>): boolean {
  const team = teamOf(employee.role);
  if (team === null) return false;
  // Most days nobody meets: then there is no need to ask who meets with whom.
  if (state.meetings[team]?.on !== state.day && !(team === 'production' && channelMeetingToday(state))) return false;
  return meetingOf(state, employee, team)?.on === state.day;
}

/** What someone gets done today against a normal day: less on the day of their meeting. */
export const meetingFactor = (state: GameState, employee: Pick<Employee, 'id' | 'role'>) => (inMeeting(state, employee) ? MEETINGS.workOnTheDay : 1);

/** The morale a meeting lifts by on a day: its lift, while it lasts. */
export const liftOf = (meeting: Meeting | undefined, day: number): number => (meeting?.on != null && day - meeting.on < MEETINGS.lasts ? meeting.lift : 0);

/** The morale someone gains from their last meeting, while it lasts. */
export function meetingLift(state: GameState, employee: Pick<Employee, 'id' | 'role'>): number {
  const team = teamOf(employee.role);
  if (team === null) return 0;
  return liftOf(meetingOf(state, employee, team), state.day);
}
