// Theme weeks (0.20.0, #180): a radio channel's hit list, listener game or event special. For a week (Monday to
// Sunday) its shows draw more listeners, and its reputation goes up a little and fades back over the months.
// The rivals' radio channels run two a year as well; theirs are not saved: they follow from a hash of the game's
// seed, the channel and the year, so the game's main stream of random numbers does not move.
// This file imports nothing of broadcast.ts, which asks it for the lift (see `themeWeekAppeal`).

import { THEME_WEEKS, THEME_WEEK_LIMITS, type ThemeWeekKind } from '../config/balance';
import type { Genre, GenreGroup } from '../config/genres';
import { getGenre } from '../config/genres';
import { toCalendarDate, toDay } from './calendar';
import { sportsEventIn } from './events';
import { campaignStart } from './politics';
import type { GameState, Id, RivalChannel } from './state';

const DAY = THEME_WEEK_LIMITS.days;

/** A theme week, the player's or a rival's. */
export interface WeekOnAir {
  channelId: Id;
  kind: ThemeWeekKind;
  startDay: number;
}

function hash(text: string): number {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
}

/** The Monday of the week a day falls in. */
export const mondayOf = (day: number) => day - ((toCalendarDate(day).weekday + 6) % 7);

/** The groups of shows an event special lifts for a week starting on `startDay`: none if no event is on in that week. */
export function specialGroups(state: GameState, startDay: number): GenreGroup[] {
  const endDay = startDay + DAY;
  const groups: GenreGroup[] = [];
  if (startDay < state.politics.nextElection && endDay > campaignStart(state.politics)) groups.push('News & Talk');
  for (const year of new Set([toCalendarDate(startDay).year, toCalendarDate(endDay - 1).year])) {
    const event = sportsEventIn(year);
    if (event && startDay < event.endDay && endDay > event.startDay) groups.push('Sports');
  }
  return groups;
}

/** The groups of shows a theme week of this kind lifts, or 'all'. */
export function themeWeekGroups(state: GameState, kind: ThemeWeekKind, startDay: number): GenreGroup[] | 'all' {
  if (kind === 'game') return 'all';
  return kind === 'hitList' ? ['Music'] : specialGroups(state, startDay);
}

// --- The rivals' weeks ---

const starts = new Map<string, number[]>();

/** The Mondays on which a rival channel runs its two theme weeks in a year: one in each half. */
function rivalStarts(state: GameState, channelId: Id, year: number): number[] {
  const key = `${state.seed}|${channelId}|${year}`;
  let found = starts.get(key);
  if (!found) {
    const h = hash(key);
    const jan1 = toDay(year, 1, 1);
    const firstMonday = jan1 + ((8 - toCalendarDate(jan1).weekday) % 7);
    found = [firstMonday + 7 * (h % 26), firstMonday + 7 * (26 + ((h >>> 8) % 26))];
    starts.set(key, found);
  }
  return found;
}

/** Radio channels of the rivals. */
function rivalRadio(state: GameState): { channel: RivalChannel; rivalName: string }[] {
  return state.rivals.flatMap((rival) => rival.channels.filter((c) => c.medium === 'radio').map((channel) => ({ channel, rivalName: rival.name })));
}

/** A music channel runs a hit list; the others a listener game, or an election special in a campaign. */
function rivalKind(state: GameState, channel: RivalChannel, startDay: number): ThemeWeekKind {
  const music = channel.schedule.filter((s) => getGenre(s.genre).group === 'Music').length;
  if (music * 2 >= channel.schedule.length && music > 0) return 'hitList';
  return specialGroups(state, startDay).includes('News & Talk') ? 'special' : 'game';
}

/** The theme weeks of the rivals' radio channels that start between two days (the first included, the last not). */
export function rivalWeeksBetween(state: GameState, from: number, to: number): (WeekOnAir & { channelName: string; rivalName: string })[] {
  const weeks: (WeekOnAir & { channelName: string; rivalName: string })[] = [];
  const years = [toCalendarDate(from).year, toCalendarDate(Math.max(from, to - 1)).year];
  for (const { channel, rivalName } of rivalRadio(state)) {
    for (const year of new Set(years)) {
      for (const startDay of rivalStarts(state, channel.id, year)) {
        if (startDay >= from && startDay < to) weeks.push({ channelId: channel.id, kind: rivalKind(state, channel, startDay), startDay, channelName: channel.name, rivalName });
      }
    }
  }
  return weeks.sort((a, b) => a.startDay - b.startDay);
}

/** The theme week a channel (the player's or a rival's) is running on a day, if any. */
export function themeWeekOn(state: GameState, channelId: Id, day = state.day): WeekOnAir | null {
  const mine = state.themeWeeks.find((w) => w.channelId === channelId && day >= w.startDay && day < w.startDay + DAY);
  if (mine) return mine;
  const start = mondayOf(day);
  if (!rivalStarts(state, channelId, toCalendarDate(start).year).includes(start)) return null;
  const channel = state.rivals.flatMap((r) => r.channels).find((c) => c.id === channelId && c.medium === 'radio');
  return channel ? { channelId, kind: rivalKind(state, channel, start), startDay: start } : null;
}

/** Appeal multiplier from the theme week a channel is running today for a show of this genre; 1 outside one. */
export function themeWeekAppeal(state: GameState, channelId: Id, genre: Genre): number {
  const week = themeWeekOn(state, channelId);
  if (!week) return 1;
  const groups = themeWeekGroups(state, week.kind, week.startDay);
  return groups === 'all' || groups.includes(genre.group) ? THEME_WEEKS[week.kind].lift : 1;
}
