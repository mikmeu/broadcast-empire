import { describe, expect, it } from 'vitest';
import { FURNITURE } from '../config/office';
import { OFFICE_DAY, SLOTS, SLOT_HOURS } from '../config/world';
import { daysInMonth, formatHour, formatHours, hourAt, toDay } from '../sim/calendar';
import { FURNITURE_ASSETS } from './assets';
import { DAY_BEATS, ROUTINE, beatAt, hourOfBeat, spotsAt } from './layout';

describe('studio furniture (Phase 8a)', () => {
  it('gives the mixing desk a chair to sit on, inside the tiles the desk takes', () => {
    const desk = FURNITURE_ASSETS.mixingDesk;
    expect(desk.parts.some((p) => 'model' in p && p.model === 'chair')).toBe(true);
    // One seat at tier 1; from tier 2 two guests sit across from the presenter.
    expect(spotsAt('mixingDesk', 1)).toHaveLength(1);
    expect(spotsAt('mixingDesk', 2)).toHaveLength(3);
    expect(spotsAt('mixingDesk', 4)).toHaveLength(3);
    const [seat] = desk.spots!;
    expect(seat!.activity).toBe('sit');
    expect(seat!.at[0]).toBeGreaterThan(0);
    expect(seat!.at[0]).toBeLessThan(FURNITURE.mixingDesk.w);
    expect(seat!.at[1]).toBeGreaterThan(0);
    expect(seat!.at[1]).toBeLessThan(FURNITURE.mixingDesk.h);
  });

  it('puts a microphone on the talk table for each of its two seats', () => {
    const table = FURNITURE_ASSETS.talkTable;
    expect(table.spots).toHaveLength(2);
    // Each microphone is a foot, a stem and a head: three shapes per seat, one set on either side of the middle.
    const shapes = table.parts.filter((p) => !('model' in p));
    expect(shapes).toHaveLength(6);
    expect(shapes.filter((p) => p.at[2] < 1)).toHaveLength(3);
    expect(shapes.filter((p) => p.at[2] > 1)).toHaveLength(3);
  });

  it('has a seat at every chair of a canteen table', () => {
    const table = FURNITURE_ASSETS.canteenTable;
    const chairs = table.parts.filter((p) => 'model' in p && p.model === 'chair');
    expect(table.spots).toHaveLength(chairs.length);
    for (const chair of chairs) expect(table.spots!.some((s) => s.at[0] === chair.at[0] && s.at[1] === chair.at[2] && s.activity === 'sit')).toBe(true);
  });
});

describe('the clock (Phase 11a)', () => {
  it('runs from 8 in the morning on the first of the month to 10 at night on the last', () => {
    for (const [year, month] of [[1970, 1], [1970, 2], [1972, 2], [1999, 12], [2030, 6]] as const) {
      const first = toDay(year, month, 1);
      const last = first + daysInMonth(first) - 1;
      expect(hourAt(first)).toBe(OFFICE_DAY.from);
      expect(hourAt(last, 1)).toBeCloseTo(OFFICE_DAY.to, 9);
      expect(hourAt(last + 1)).toBe(OFFICE_DAY.from);
    }
    expect(daysInMonth(toDay(1970, 2, 10))).toBe(28);
    expect(daysInMonth(toDay(1972, 2, 10))).toBe(29);
  });

  it('never runs back within a month, and reads as a time of day', () => {
    let before = -Infinity;
    for (let day = 0; day < 31; day++) {
      for (const progress of [0, 0.25, 0.5, 0.99]) {
        const hour = hourAt(day, progress);
        expect(hour).toBeGreaterThan(before);
        before = hour;
      }
    }
    expect(formatHour(8)).toBe('8:00 am');
    expect(formatHour(8.99)).toBe('8:55 am');
    expect(formatHour(12)).toBe('12:00 pm');
    expect(formatHour(12.5)).toBe('12:30 pm');
    expect(formatHour(21.75)).toBe('9:45 pm');
    expect(formatHours(SLOT_HOURS.morning)).toBe('8:30 am–11:30 am');
  });

  it('has the slots follow each other from half past eight to half past nine, inside the day', () => {
    expect(SLOT_HOURS[SLOTS[0]][0]).toBe(8.5);
    expect(SLOT_HOURS[SLOTS[SLOTS.length - 1]!][1]).toBe(21.5);
    SLOTS.slice(1).forEach((slot, i) => expect(SLOT_HOURS[slot][0]).toBe(SLOT_HOURS[SLOTS[i]!][1]));
    // Each begins and ends on a beat.
    for (const slot of SLOTS) for (const hour of SLOT_HOURS[slot]) expect(Number.isInteger((hour - OFFICE_DAY.from) * ROUTINE.beatsPerHour)).toBe(true);
  });

  it('counts the beats of the office on through the months, one day’s worth each', () => {
    let before = beatAt(0);
    expect(before).toBe(0);
    for (let day = 0; day < 800; day++) {
      for (const progress of [0, 0.3, 0.6, 0.9]) {
        const beat = beatAt(day, progress);
        expect(beat).toBeGreaterThanOrEqual(before);
        expect(beat - before).toBeLessThanOrEqual(1);
        expect(hourOfBeat(beat)).toBeLessThanOrEqual(hourAt(day, progress) + 1e-6);
        expect(hourAt(day, progress) - hourOfBeat(beat)).toBeLessThan(1 / ROUTINE.beatsPerHour + 1e-6);
        before = beat;
      }
    }
    expect(beatAt(toDay(1971, 1, 1))).toBe(12 * DAY_BEATS);
  });
});
