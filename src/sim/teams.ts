// The teams of the company (0.15.0): who meets together in a meeting room and
// who strikes together. Only types and config are imported, so the office and
// morale code can both use it.

import { MEETINGS } from '../config/balance';
import type { Department, Employee, GameState, Role, TeamId } from './state';

export interface Team {
  name: string;
  /** In the middle of a sentence: “the hosts”, “the sales team”. */
  inText: string;
  roles: readonly Role[];
  /** The department whose manager calls its meetings; for the hosts a channel manager does. Null for a team that does not meet. */
  ledBy: Department | 'channel' | null;
}

export const TEAMS: Record<TeamId, Team> = {
  hosts: { name: 'Hosts', inText: 'the hosts', roles: ['host'], ledBy: 'channel' },
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

/** Whether someone's team sits in a meeting today: they get only part of their work done (MEETINGS.workOnTheDay). */
export function inMeeting(state: Pick<GameState, 'meetings' | 'day'>, employee: Pick<Employee, 'role'>): boolean {
  const team = teamOf(employee.role);
  return team !== null && state.meetings[team]?.on === state.day;
}

/** What someone gets done today against a normal day: less on the day of their team's meeting. */
export const meetingFactor = (state: Pick<GameState, 'meetings' | 'day'>, employee: Pick<Employee, 'role'>) => (inMeeting(state, employee) ? MEETINGS.workOnTheDay : 1);

/** The morale someone gains from their team's last meeting, while it lasts. */
export function meetingLift(state: Pick<GameState, 'meetings' | 'day'>, employee: Pick<Employee, 'role'>): number {
  const team = teamOf(employee.role);
  const meeting = team ? state.meetings[team] : undefined;
  return meeting?.on != null && state.day - meeting.on < MEETINGS.lasts ? meeting.lift : 0;
}
