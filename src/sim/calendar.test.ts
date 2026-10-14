import { describe, expect, it } from 'vitest';
import { formatDate, isFirstOfMonth, isStartOfWeek, toCalendarDate } from './calendar';

describe('calendar', () => {
  it('starts on Thursday 1 January 1970', () => {
    expect(toCalendarDate(0)).toEqual({ year: 1970, month: 1, dayOfMonth: 1, weekday: 4 });
    expect(formatDate(0)).toBe('Thu 1 Jan 1970');
  });

  it('handles leap years', () => {
    // 1970 and 1971 have 365 days; 1972 is a leap year.
    const feb29_1972 = 365 + 365 + 31 + 28;
    expect(toCalendarDate(feb29_1972)).toMatchObject({ year: 1972, month: 2, dayOfMonth: 29 });
    expect(toCalendarDate(feb29_1972 + 1)).toMatchObject({ year: 1972, month: 3, dayOfMonth: 1 });
  });

  it('detects the first day of a month', () => {
    expect(isFirstOfMonth(0)).toBe(true);
    expect(isFirstOfMonth(30)).toBe(false); // 31 Jan
    expect(isFirstOfMonth(31)).toBe(true); // 1 Feb
  });

  it('starts weeks on Monday', () => {
    expect(isStartOfWeek(4)).toBe(true); // Mon 5 Jan 1970
    expect(isStartOfWeek(5)).toBe(false);
  });
});
