// Booking and running the player's theme weeks (0.20.0, #180); the lift itself is in themeWeeks.ts.

import { OWN_EVENT_LIMITS, THEME_WEEKS, THEME_WEEK_LIMITS, type ThemeWeekKind } from '../config/balance';
import { formatDate, toCalendarDate, toDay } from './calendar';
import { channelOffAirReason, channelRegions } from './broadcast';
import { fromChannel } from './inbox';
import { mondayOf, rivalWeeksBetween, specialGroups } from './themeWeeks';
import { addHeadline, addMessage, type Channel, type GameState, type Id, type ThemeWeek } from './state';

const DAY = THEME_WEEK_LIMITS.days;
const yearOf = (day: number) => toCalendarDate(day).year;

export const themeWeekCost = (state: GameState, channelId: Id, kind: ThemeWeekKind) => THEME_WEEKS[kind].costPerRegion * channelRegions(state, channelId).length;

/** The last day a theme week may start on: a year from today. */
export function lastBookableDay(state: GameState): number {
  const { year, month, dayOfMonth } = toCalendarDate(state.day);
  return toDay(year + 1, month, dayOfMonth);
}

/** The first Monday after today. */
export const nextBookableDay = (state: GameState) => mondayOf(state.day) + DAY;

/** The weeks a channel has booked in a calendar year. */
export const themeWeeksIn = (state: GameState, channelId: Id, year: number) => state.themeWeeks.filter((w) => w.channelId === channelId && yearOf(w.startDay) === year);

/** The channel's next booked week that has not finished, if any. */
export const nextThemeWeek = (state: GameState, channelId: Id): ThemeWeek | undefined =>
  state.themeWeeks.filter((w) => w.channelId === channelId && w.startDay + DAY > state.day).sort((a, b) => a.startDay - b.startDay)[0];

/** Why a theme week of this kind can't be booked for the week starting on `startDay`, or null. */
export function themeWeekBlocker(state: GameState, channelId: Id, kind: ThemeWeekKind, startDay: number): string | null {
  const channel: Channel | undefined = state.channels.find((c) => c.id === channelId);
  if (!channel) return 'That channel doesn’t exist.';
  if (channel.medium !== 'radio') return 'Only a radio channel can run a theme week.';
  const offAir = channelOffAirReason(state, channel);
  if (offAir) return `${channel.name} is off the air (${offAir.toLowerCase()}).`;
  if (toCalendarDate(startDay).weekday !== 1) return 'A theme week starts on a Monday.';
  if (startDay <= state.day) return 'A theme week has to start in the future.';
  if (startDay > lastBookableDay(state)) return 'A theme week can be booked up to a year ahead.';
  if (themeWeeksIn(state, channelId, yearOf(startDay)).length >= THEME_WEEK_LIMITS.perYear) return `${channel.name} has ${THEME_WEEK_LIMITS.perYear} theme weeks in ${yearOf(startDay)} already.`;
  if (state.themeWeeks.some((w) => w.channelId === channelId && Math.abs(w.startDay - startDay) < DAY)) return `${channel.name} has a theme week that overlaps this one.`;
  if (kind === 'special' && specialGroups(state, startDay).length === 0) return 'An event special needs an election campaign, a World Cup or the Olympics that week.';
  const cost = themeWeekCost(state, channelId, kind);
  if (state.money < cost) return `Not enough money (€${cost.toLocaleString('en-IE')} needed).`;
  return null;
}

/** The channel's average listeners per slot over the days of the week starting on `from`, from the daily results kept, or null. */
function averageListeners(state: GameState, channelId: Id, from: number): number | null {
  const days = state.week.filter((d) => d.day >= from && d.day < from + DAY);
  if (days.length < DAY) return null;
  const perDay = days.map((d) => d.channels.find((c) => c.channelId === channelId)).map((c) => (c ? c.slots.reduce((sum, s) => sum + s.listeners, 0) / c.slots.length : 0));
  return perDay.reduce((sum, n) => sum + n, 0) / perDay.length;
}

/** The average listeners per slot in the weekly report of the week starting on `from`, or null. */
function reportedListeners(state: GameState, channelId: Id, from: number): number | null {
  const channel = state.weeklyReports.find((r) => r.fromDay === from)?.channels.find((c) => c.channelId === channelId);
  return channel ? channel.slots.reduce((sum, s) => sum + s.listeners, 0) / channel.slots.length : null;
}

function startWeek(draft: GameState, week: ThemeWeek): void {
  const channel = draft.channels.find((c) => c.id === week.channelId);
  if (!channel) return;
  const spec = THEME_WEEKS[week.kind];
  addHeadline(draft, `${channel.name} starts a ${spec.name.toLowerCase()} week.`);
  addMessage(draft, 'info', `Our ${spec.name.toLowerCase()} week begins today on ${channel.name}: ${spec.shows} draw a bigger audience until ${formatDate(week.startDay + DAY - 1)}.`, undefined, undefined, fromChannel(channel.id));
}

function endWeek(draft: GameState, week: ThemeWeek): void {
  const channel = draft.channels.find((c) => c.id === week.channelId);
  if (!channel) return;
  const spec = THEME_WEEKS[week.kind];
  for (const regionId of channelRegions(draft, channel.id)) {
    channel.reputation[regionId] = Math.min(OWN_EVENT_LIMITS.maxReputation, (channel.reputation[regionId] ?? 0) + spec.reputation);
  }
  const during = averageListeners(draft, channel.id, week.startDay);
  const before = reportedListeners(draft, channel.id, week.startDay - DAY);
  const result = during !== null && before !== null && before > 0 ? ` It drew ${Math.round(during).toLocaleString('en-IE')} listeners a slot against ${Math.round(before).toLocaleString('en-IE')} the week before (${during >= before ? '+' : '−'}${Math.round((Math.abs(during - before) / before) * 100)}%).` : '';
  addMessage(draft, 'good', `Our ${spec.name.toLowerCase()} week on ${channel.name} is over.${result} The station’s reputation is up a little, and will fade slowly.`, undefined, undefined, fromChannel(channel.id));
}

/** Daily, on the new day: starts and ends the player's theme weeks, and announces the rivals'. */
export function runThemeWeeks(draft: GameState): void {
  for (const week of draft.themeWeeks) {
    if (week.startDay === draft.day) startWeek(draft, week);
    if (week.startDay + DAY === draft.day) endWeek(draft, week);
  }
  draft.themeWeeks = draft.themeWeeks.filter((w) => yearOf(w.startDay) >= yearOf(draft.day) - 1);

  const radio = draft.channels.some((c) => c.medium === 'radio');
  for (const week of rivalWeeksBetween(draft, draft.day, draft.day + THEME_WEEK_LIMITS.noticeDays + 1)) {
    const spec = THEME_WEEKS[week.kind];
    // Only the e-mail: a dozen rival weeks a year would fill the headlines.
    if (week.startDay === draft.day + THEME_WEEK_LIMITS.noticeDays && radio) {
      addMessage(draft, 'info', `${week.rivalName} has a ${spec.name.toLowerCase()} week coming up on ${week.channelName}, starting ${formatDate(week.startDay)}. Its ${spec.shows} will draw more listeners that week; you may want a theme week of your own.`, undefined, undefined, 'penny');
    }
  }
}
