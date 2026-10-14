import { START_YEAR } from '../config/balance';
import { OFFICE_DAY } from '../config/world';

// Game time is stored as a single integer: days since 1 January of START_YEAR.
// Calendar fields are derived from it with UTC dates, so leap years come for free.

const MS_PER_CALENDAR_DAY = 86_400_000;
const EPOCH_MS = Date.UTC(START_YEAR, 0, 1);

export interface CalendarDate {
  year: number;
  /** 1–12 */
  month: number;
  /** 1–31 */
  dayOfMonth: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
}

export function toCalendarDate(day: number): CalendarDate {
  const d = new Date(EPOCH_MS + day * MS_PER_CALENDAR_DAY);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    dayOfMonth: d.getUTCDate(),
    weekday: d.getUTCDay(),
  };
}

/** The game day of a calendar date (month 1–12). */
export function toDay(year: number, month: number, dayOfMonth: number): number {
  return Math.round((Date.UTC(year, month - 1, dayOfMonth) - EPOCH_MS) / MS_PER_CALENDAR_DAY);
}

export function isFirstOfMonth(day: number): boolean {
  return toCalendarDate(day).dayOfMonth === 1;
}

/** Weeks start on Monday. */
export function isStartOfWeek(day: number): boolean {
  return toCalendarDate(day).weekday === 1;
}

/** How many days the month of a game day has. */
export function daysInMonth(day: number): number {
  const { year, month } = toCalendarDate(day);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Months since January of START_YEAR: counts the days at the office (see OFFICE_DAY). */
export function monthNumber(day: number): number {
  const { year, month } = toCalendarDate(day);
  return (year - START_YEAR) * 12 + month - 1;
}

/**
 * The time on the office clock, in hours: 8 on the first of the month, 22 as
 * the last day ends. `progress` is how far the day itself is, 0–1.
 */
export function hourAt(day: number, progress = 0): number {
  const { from, to } = OFFICE_DAY;
  const done = (toCalendarDate(day).dayOfMonth - 1 + Math.min(Math.max(progress, 0), 1)) / daysInMonth(day);
  return from + (to - from) * done;
}

/**
 * The time on the office clock in hours that keep counting: every month adds
 * a day's worth, and the first hour of a day follows the last of the one before.
 */
export function officeHours(day: number, progress = 0): number {
  const { from, to } = OFFICE_DAY;
  return monthNumber(day) * (to - from) + hourAt(day, progress) - from;
}

/** e.g. "8:05 am", in steps of five minutes. */
export function formatHour(hour: number): string {
  const minutes = Math.floor((hour * 60) / 5 + 1e-6) * 5;
  const h = Math.floor(minutes / 60) % 24;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(minutes % 60).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** e.g. "8:30 am–11:30 am". */
export const formatHours = (hours: readonly [from: number, to: number]) => `${formatHour(hours[0])}–${formatHour(hours[1])}`;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** e.g. "Thu 1 Jan 1970" */
export function formatDate(day: number): string {
  const { year, month, dayOfMonth, weekday } = toCalendarDate(day);
  return `${WEEKDAYS[weekday]} ${dayOfMonth} ${MONTHS[month - 1]} ${year}`;
}
