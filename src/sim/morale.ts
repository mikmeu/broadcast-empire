// Meetings and strikes (0.15.0): what a team's morale comes to when it is
// looked after, and when it is not. The rest of morale is in upkeep.ts. The
// production staff of a channel meet with its channel manager (0.17.0).

import { DECOR, MEETINGS, STRIKES } from '../config/balance';
import { SEATS_PER_MEETING_TABLE } from '../config/office';
import { formatDate } from './calendar';
import { spend } from './economy';
import { employeesWithDesk, isFurnished, type Desks } from './office';
import { fromChannel, type From } from './inbox';
import { minutesOf, type MinutesFacts } from './minutes';
import { managerOf } from './staff';
import { addMessage, type Channel, type Employee, type GameState, type Id, type Meeting, type RentedRoom, type TeamId } from './state';
import { TEAMS, TEAM_IDS, channelMembers, departmentMembers, isStriking, teamMembers } from './teams';

// --- Meetings ---

/** People who sit at the tables of a meeting room. */
export const meetingSeats = (room: RentedRoom) => room.furniture.filter((f) => f.type === 'meetingTable').length * SEATS_PER_MEETING_TABLE;

/** Whether a meeting room has a flip chart (0.16.0), which makes its meetings lift morale DECOR.flipChart more. */
export const hasFlipChart = (room: RentedRoom) => room.furniture.some((f) => f.type === 'flipChart');

/** The meeting rooms that have a table, the largest first, and of the same size one with a flip chart first. */
export const meetingRooms = (state: GameState) =>
  state.rooms.filter((r) => r.type === 'meetingRoom' && isFurnished(r)).sort((a, b) => meetingSeats(b) - meetingSeats(a) || Number(hasFlipChart(b)) - Number(hasFlipChart(a)));

/** Who calls a team's meetings, at a desk: the manager of its department. */
export function meetingLeader(state: GameState, team: TeamId, desked: Desks = employeesWithDesk(state)): Employee | undefined {
  const { ledBy } = TEAMS[team];
  return ledBy === null ? undefined : managerOf(state, ledBy, desked);
}

/** The day a team may meet again. */
export const nextMeeting = (state: GameState, team: TeamId): number => nextAfter(state, state.meetings[team]);

const nextAfter = (state: GameState, meeting: Meeting | undefined) => (meeting?.on == null ? state.day : meeting.on + MEETINGS.every);

/** How many meetings are held today, of teams and of channels' production teams: each takes a meeting room. */
const heldToday = (state: GameState) =>
  TEAM_IDS.filter((id) => state.meetings[id]?.on === state.day).length + Object.values(state.channelMeetings).filter((m) => m?.on === state.day).length;

/** The morale a meeting of so many people today would lift them by: in full when everyone has a seat in the room it gets. */
function liftToday(state: GameState, people: number): number {
  const room = meetingRooms(state)[heldToday(state)];
  if (!room || people === 0) return 0;
  return Math.round(MEETINGS.morale * Math.min(1, meetingSeats(room) / people) * (hasFlipChart(room) ? 1 + DECOR.flipChart : 1) * 10) / 10;
}

/** The morale a meeting today would lift the team by: those of the team who meet with their department manager. */
export const meetingLiftToday = (state: GameState, team: TeamId): number => liftToday(state, departmentMembers(state, team).length);

/** Why a team can't meet today, or null if it can. */
export function meetingBlocker(state: GameState, team: TeamId, desked: Desks = employeesWithDesk(state)): string | null {
  const { ledBy, inText } = TEAMS[team];
  if (ledBy === null) return `There are no meetings for ${inText}.`;
  if (teamMembers(state, team).length === 0) return `There is nobody in ${inText} yet.`;
  if (departmentMembers(state, team).length === 0) return 'Everyone in production meets with their channel manager.';
  const blocked = roomBlocker(state, state.meetings[team], team, inText);
  if (blocked) return blocked;
  if (!meetingLeader(state, team, desked)) return `A meeting of ${inText} is called by its manager, at a desk: hire one first.`;
  return null;
}

/** Why a meeting can't be held today, for a strike, the last meeting or the meeting rooms, or null. */
function roomBlocker(state: GameState, meeting: Meeting | undefined, team: TeamId, inText: string): string | null {
  if (isStriking(state, team)) return `${capital(TEAMS[team].inText)} are on strike.`;
  if (meeting?.on === state.day) return `${capital(inText)} met today.`;
  if (nextAfter(state, meeting) > state.day) return `${capital(inText)} met on ${formatDate(meeting!.on!)}: the next meeting can be on ${formatDate(nextAfter(state, meeting))}.`;
  if (meetingRooms(state).length === 0) return 'Build a meeting room and put a meeting table in it first.';
  if (heldToday(state) >= meetingRooms(state).length) return 'Every meeting room is taken today.';
  return null;
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** A team meets today: it is happier for a month, and gets less done today. Call on a draft that `meetingBlocker` allows. */
export function holdMeeting(draft: GameState, team: TeamId): void {
  const lift = meetingLiftToday(draft, team);
  const previous = draft.meetings[team];
  const facts = minutesFacts(draft, { team }, TEAMS[team].inText, meetingLeader(draft, team), departmentMembers(draft, team), previous?.monthly ?? false);
  draft.meetings[team] = { on: draft.day, lift, monthly: previous?.monthly ?? false, minutes: previous?.minutes ?? true };
  if (facts && draft.meetings[team]!.minutes) sendMinutes(draft, facts, TEAMS[team].ledBy!);
}

/** What the minutes of a meeting held today in the next free meeting room need (call before the meeting is recorded), or null if there is no room or no leader. */
function minutesFacts(state: GameState, of: MinutesFacts['of'], inText: string, leader: Employee | undefined, members: Employee[], monthly: boolean): MinutesFacts | null {
  const room = meetingRooms(state)[heldToday(state)];
  if (!room || !leader) return null;
  return {
    of,
    inText,
    leader,
    members,
    room: { name: room.name, seats: meetingSeats(room), flipChart: hasFlipChart(room), cleanliness: room.cleanliness },
    next: monthly ? state.day + MEETINGS.every : null,
  };
}

/** The leader's minutes to the CEO: low priority, so only in the inbox. */
const sendMinutes = (draft: GameState, facts: MinutesFacts, from: From) => addMessage(draft, 'info', minutesOf(draft, facts), 'routine', undefined, from);

// --- The meetings of a channel's production team (0.17.0) ---

/** In the middle of a sentence: “the production team of Coaxia FM”. */
export const channelTeamText = (channel: Pick<Channel, 'name'>) => `the production team of ${channel.name}`;

/** Who calls the meetings of a channel's production team: its channel manager, at a desk. */
export function channelMeetingLeader(state: GameState, channelId: Id, desked: Desks = employeesWithDesk(state)): Employee | undefined {
  const managerId = state.channels.find((c) => c.id === channelId)?.managerId;
  return managerId ? state.employees.find((e) => e.id === managerId && e.role === 'channelManager' && desked.has(e.id)) : undefined;
}

/** The day a channel's production team may meet again. */
export const nextChannelMeeting = (state: GameState, channelId: Id): number => nextAfter(state, state.channelMeetings[channelId]);

/** The morale a meeting today would lift a channel's production team by. */
export const channelMeetingLiftToday = (state: GameState, channelId: Id): number => liftToday(state, channelMembers(state, channelId).length);

/** Why a channel's production team can't meet today, or null if it can. */
export function channelMeetingBlocker(state: GameState, channelId: Id, desked: Desks = employeesWithDesk(state)): string | null {
  const channel = state.channels.find((c) => c.id === channelId);
  if (!channel) return 'That channel doesn’t exist.';
  if (!channelMeetingLeader(state, channelId, desked)) return `A meeting of ${channelTeamText(channel)} is called by its channel manager, at a desk: give it one first.`;
  if (channelMembers(state, channelId).length === 0) return `Nobody in production works on the shows of ${channel.name} yet.`;
  return roomBlocker(state, state.channelMeetings[channelId], 'production', channelTeamText(channel));
}

/** A channel's production team meets today: happier for a month, less done today. Call on a draft that `channelMeetingBlocker` allows. */
export function holdChannelMeeting(draft: GameState, channelId: Id): void {
  const lift = channelMeetingLiftToday(draft, channelId);
  const previous = draft.channelMeetings[channelId];
  const channel = draft.channels.find((c) => c.id === channelId);
  const facts = channel && minutesFacts(draft, { channelId }, channelTeamText(channel), channelMeetingLeader(draft, channelId), channelMembers(draft, channelId), previous?.monthly ?? false);
  draft.channelMeetings[channelId] = { on: draft.day, lift, monthly: previous?.monthly ?? false, minutes: previous?.minutes ?? true };
  if (facts && draft.channelMeetings[channelId]!.minutes) sendMinutes(draft, facts, fromChannel(channelId));
}

/** Calls the meetings that are held every month and are due, as far as there are rooms: the teams first, then the channels in their order. */
export function runMeetings(draft: GameState, desked: Desks): void {
  for (const team of TEAM_IDS) {
    if (draft.meetings[team]?.monthly && meetingBlocker(draft, team, desked) === null) holdMeeting(draft, team);
  }
  for (const channel of draft.channels) {
    if (draft.channelMeetings[channel.id]?.monthly && channelMeetingBlocker(draft, channel.id, desked) === null) holdChannelMeeting(draft, channel.id);
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
