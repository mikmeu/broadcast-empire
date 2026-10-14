import { describe, expect, it } from 'vitest';
import { BASELINE_APPEAL } from '../config/balance';
import { appeal, channelOffAirReason, shares, showQuality, simulateDay } from './broadcast';
import { population, reach, regionShare } from './world';
import { sensibleBot } from './bots';
import { createInitialState } from './newGame';

describe('ratings model', () => {
  it('grows the population every year', () => {
    expect(population('capital', 0)).toBe(2_500_000);
    expect(population('capital', 365.25)).toBeCloseTo(2_537_500);
  });

  it('computes reach from population, audience share and tuned-in rate', () => {
    // Workers: 45% listen to the radio in the morning. They are not a main audience in Coaxia, so fewer than the national 25% live there.
    expect(reach('capital', 'radio', 0, 'workers', 0)).toBeCloseTo(2_500_000 * regionShare('capital', 'workers', 0) * 0.45);
    expect(regionShare('capital', 'workers', 0)).toBeLessThan(0.25);
  });

  it('multiplies appeal factors', () => {
    expect(appeal(0.5, 1, 0, 1, 0.5)).toBeCloseTo(0.5);
    expect(appeal(0.5, 0.6, 100, 0.8, 1)).toBeCloseTo(0.5 * 0.6 * 1.5 * 0.8 * 1.5);
  });

  it('splits the audience by appeal squared, leaving some switched off', () => {
    const [a, b] = shares([0.6, 0.3]);
    expect(a! / b!).toBeCloseTo(4);
    expect(a! + b!).toBeLessThan(1);
    // Nobody worth listening to: almost everyone is switched off.
    expect(shares([0.01])[0]).toBeLessThan(0.01);
    // A single excellent program still doesn't get everyone.
    expect(shares([1])[0]).toBeCloseTo(1 / (1 + BASELINE_APPEAL ** 2));
  });

  it('gives a fully staffed show quality and explains what blocks an empty one', () => {
    const state = sensibleBot(createInitialState(1));
    const show = state.shows[0]!;
    const quality = showQuality(state, show);
    expect(quality.problems).toEqual([]);
    expect(quality.quality).toBeGreaterThan(0.3);
    expect(quality.quality).toBeLessThanOrEqual(1);

    const empty = showQuality(state, { ...show, hostId: null, staffIds: [], studioId: null });
    expect(empty.quality).toBe(0);
    expect(empty.problems).toEqual(['No host', 'No production staff', 'No studio']);
  });
});

describe('when things are missing', () => {
  /** A fully staffed station with five scheduled shows (the sensible bot's day 0), safe to modify. */
  const station = () => structuredClone(sensibleBot(createInitialState(1)));
  const playerDay = (state: ReturnType<typeof station>) => simulateDay(state).channels.find((c) => c.isPlayer)!;

  it('broadcasts normally when everything is in place', () => {
    const s = station();
    expect(channelOffAirReason(s, s.channels[0]!)).toBeNull();
    expect(playerDay(s).slots.every((slot) => slot.showId !== null && slot.listeners > 0)).toBe(true);
  });

  it.each([
    ['No license', (s: ReturnType<typeof station>) => (s.licenses = [])],
    ['No channel manager', (s: ReturnType<typeof station>) => (s.channels[0]!.managerId = null)],
    ['Channel manager has no desk in a management office', (s: ReturnType<typeof station>) => (s.rooms.find((r) => r.type === 'managementOffice')!.furniture = [])],
  ])('goes off air with "%s" and earns nothing', (reason, breakIt) => {
    const s = station();
    breakIt(s);
    expect(channelOffAirReason(s, s.channels[0]!)).toBe(reason);
    const day = playerDay(s);
    expect(day.onAir).toBe(false);
    expect(day.slots.every((slot) => slot.listeners === 0 && slot.revenue === 0)).toBe(true);
  });

  it('airs a rerun instead of a show whose staff have no desks', () => {
    const s = station();
    s.rooms.find((r) => r.type === 'office')!.furniture = [];
    // The channel manager has a desk in the management office, so only the shows are affected.
    expect(showQuality(s, s.shows[0]!).problems).toEqual(['Production staff have no workstation']);
    const day = playerDay(s);
    expect(day.onAir).toBe(true);
    expect(day.slots.every((slot) => slot.showId === null && slot.programName === 'Rerun')).toBe(true);
  });

  it('airs a rerun instead of shows from a studio that is missing equipment', () => {
    const s = station();
    const studio = s.rooms.find((r) => r.type === 'radioStudio')!;
    studio.furniture = studio.furniture.filter((f) => f.type !== 'mixingDesk');
    const day = playerDay(s);
    // The music shows (slots 0–2 and 4) use studio C; the news (slot 3) uses studio D.
    expect(day.slots.map((slot) => slot.programName === 'Rerun')).toEqual([true, true, true, false, true]);
    const broken = s.shows.find((sh) => sh.studioId === studio.roomId)!;
    expect(showQuality(s, broken).problems).toEqual(['Studio is missing equipment']);
  });
});
