// Meetings and strikes (0.15.0): what a team's morale comes to when it is
// looked after, and when it is not. The rest of morale is in upkeep.ts.

import { DECOR, MEETINGS, STRIKES } from '../config/balance';
import { SEATS_PER_MEETING_TABLE } from '../config/office';
import { formatDate } from './calendar';
import { spend } from './economy';
import { employeesWithDesk, isFurnished, type Desks } from './office';
import { managerOf } from './staff';
import { addMessage, type Employee, type GameState, type RentedRoom, type TeamId } from './state';
import { TEAMS, TEAM_IDS, isStriking, teamMembers } from './teams';

// --- Meetings ---

/** People who sit at the tables of a meeting room. */
export const meetingSeats = (room: RentedRoom) => room.furniture.filter((f) => f.type === 'meetingTable').length * SEATS_PER_MEETING_TABLE;

/** Whether a meeting room has a flip chart (0.16.0), which makes its meetings lift morale DECOR.flipChart more. */
export const hasFlipChart = (room: RentedRoom) => room.furniture.some((f) => f.type === 'flipChart');

/** The meeting rooms that have a table, the largest first, and of the same size one with a flip chart first. */
export const meetingRooms = (state: GameState) =>
  state.rooms.filter((r) => r.type === 'meetingRoom' && isFurnished(r)).sort((a, b) => meetingSeats(b) - meetingSeats(a) || Number(hasFlipChart(b)) - Number(hasFlipChart(a)));

/** Who calls a team's meetings, at a desk: the manager of its department, or for the hosts a channel manager. */
export function meetingLeader(state: GameState, team: TeamId, desked: Desks = employeesWithDesk(state)): Employee | undefined {
  const { ledBy } = TEAMS[team];
  if (ledBy === null) return undefined;
  if (ledBy === 'channel') return state.employees.find((e) => e.role === 'channelManager' && desked.has(e.id));
  return managerOf(state, ledBy, desked);
}

/** The day a team may meet again. */
export function nextMeeting(state: GameState, team: TeamId): number {
  const on = state.meetings[team]?.on;
  return on == null ? state.day : on + MEETINGS.every;
}

/** The morale a meeting today would lift the team by: in full when everyone has a seat in the room it gets. */
export function meetingLiftToday(state: GameState, team: TeamId): number {
  const used = TEAM_IDS.filter((id) => state.meetings[id]?.on === state.day).length;
  const room = meetingRooms(state)[used];
  const people = teamMembers(state, team).length;
  if (!room || people === 0) return 0;
  return Math.round(MEETINGS.morale * Math.min(1, meetingSeats(room) / people) * (hasFlipChart(room) ? 1 + DECOR.flipChart : 1) * 10) / 10;
}

/** Why a team can't meet today, or null if it can. */
export function meetingBlocker(state: GameState, team: TeamId, desked: Desks = employeesWithDesk(state)): string | null {
  const { ledBy, inText } = TEAMS[team];
  if (ledBy === null) return `There are no meetings for ${inText}.`;
  if (teamMembers(state, team).length === 0) return `There is nobody in ${inText} yet.`;
  if (isStriking(state, team)) return `${capital(inText)} are on strike.`;
  if (state.meetings[team]?.on === state.day) return `${capital(inText)} met today.`;
  if (nextMeeting(state, team) > state.day) return `${capital(inText)} met on ${formatDate(state.meetings[team]!.on!)}: the next meeting can be on ${formatDate(nextMeeting(state, team))}.`;
  if (meetingRooms(state).length === 0) return 'Build a meeting room and put a meeting table in it first.';
  if (meetingLiftToday(state, team) === 0) return 'Every meeting room is taken today.';
  if (!meetingLeader(state, team, desked)) return ledBy === 'channel' ? 'A meeting of the hosts is called by a channel manager, at a desk: hire one first.' : `A meeting of ${inText} is called by its manager, at a desk: hire one first.`;
  return null;
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** A team meets today: it is happier for a month, and gets less done today. Call on a draft that `meetingBlocker` allows. */
export function holdMeeting(draft: GameState, team: TeamId): void {
  const lift = meetingLiftToday(draft, team);
  draft.meetings[team] = { on: draft.day, lift, monthly: draft.meetings[team]?.monthly ?? false };
}

/** Calls the meetings that are held every month and are due, as far as there are rooms. */
export function runMeetings(draft: GameState, desked: Desks): void {
  for (const team of TEAM_IDS) {
    if (draft.meetings[team]?.monthly && meetingBlocker(draft, team, desked) === null) holdMeeting(draft, team);
  }
}

// --- Strikes ---

/** A team's average morale, or null for a team with nobody in it. */
export function teamMorale(state: GameState, team: TeamId): number | null {
  const members = teamMembers(state, team);
  return members.length === 0 ? null : members.reduce((sum, e) => sum + e.morale, 0) / members.length;
}

/** The day a team that threatened to strike walks out, if its morale is still low then. */
export const strikeDay = (warnedOn: number) => warnedOn + STRIKES.strikeAfter;

/** What it costs to end a strike at once: a bonus for each striker. */
export const strikeBonus = (state: GameState, team: TeamId) =>
  Math.round(teamMembers(state, team).reduce((sum, e) => sum + e.salary * STRIKES.bonusMonths, 0) / 100) * 100;

/** A strike is over: the team comes back, a little happier for having been heard. */
function endOf(draft: GameState, team: TeamId): void {
  delete draft.unrest[team];
  for (const e of teamMembers(draft, team)) e.morale = Math.min(100, e.morale + STRIKES.moraleAfter);
}

/** Ends a strike at once by paying the strikers a bonus. Call on a draft. Returns an error, or null. */
export function payStrikeBonus(draft: GameState, team: TeamId): string | null {
  if (!isStriking(draft, team)) return `${capital(TEAMS[team].inText)} are not on strike.`;
  const cost = strikeBonus(draft, team);
  if (draft.money < cost) return `Not enough money (€${cost.toLocaleString('en-IE')} needed).`;
  spend(draft, cost, 'salaries');
  endOf(draft, team);
  addMessage(draft, 'good', `${capital(TEAMS[team].inText)} took the bonus and are back at work.`, undefined, 'staff');
  return null;
}

/**
 * Daily, after morale has moved: a team whose morale stays low first
 * threatens to strike and then walks out, unless its morale recovers in time.
 * A strike ends by itself after STRIKES.days.
 */
export function runUnrest(draft: GameState): void {
  for (const team of TEAM_IDS) {
    const { inText } = TEAMS[team];
    const unrest = draft.unrest[team];
    if (unrest?.strikeUntil != null) {
      if (draft.day + 1 < unrest.strikeUntil) continue;
      endOf(draft, team);
      addMessage(draft, 'good', `The strike is over: ${inText} are back at work tomorrow.`, undefined, 'staff');
      continue;
    }
    const morale = teamMorale(draft, team);
    if (morale === null || morale >= STRIKES.recover) {
      if (unrest?.warnedOn != null) addMessage(draft, 'good', `The threat of a strike is off: ${inText} are happier again.`, undefined, 'staff');
      delete draft.unrest[team];
      continue;
    }
    if (morale >= STRIKES.below) continue;
    if (!unrest) {
      draft.unrest[team] = { since: draft.day, warnedOn: null, strikeUntil: null };
      continue;
    }
    if (unrest.warnedOn === null && draft.day - unrest.since >= STRIKES.warnAfter) {
      unrest.warnedOn = draft.day;
      addMessage(
        draft,
        'warning',
        `${capital(inText)} threaten to strike: their morale is ${Math.round(morale)}. If it is still under ${STRIKES.below} on ${formatDate(strikeDay(draft.day))}, they walk out for ${STRIKES.days} days.`,
        undefined,
        'staff',
      );
    } else if (unrest.warnedOn !== null && draft.day >= strikeDay(unrest.warnedOn)) {
      unrest.strikeUntil = draft.day + 1 + STRIKES.days;
      addMessage(draft, 'danger', `${capital(inText)} are on strike until ${formatDate(unrest.strikeUntil)}. Nothing they do gets done; a bonus ends it at once.`, undefined, 'staff');
    }
  }
}
