import { describe, expect, it } from 'vitest';
import { ADS } from '../config/balance';
import { setAdMinutes } from './actions';
import { AD_LAW_DAY, AD_LAW_NEWS_DAY, adAppeal, adComplaintChance, adIncome, adLimit, adReputation, adsIn } from './adMinutes';
import { simulateDay } from './broadcast';
import { sensibleBot } from './bots';
import { createInitialState } from './newGame';
import { checkRules, RULE_NAMES } from './regulator';
import { SAVE_VERSION, fromSaveFile, toSaveFile } from './save';
import type { ChannelDay, DayResult, GameState, SlotResult } from './state';
import { advance, tick } from './tick';

const base = () => structuredClone(advance(sensibleBot(createInitialState(1)), 30));

const withMinutes = (s: GameState, minutes: number): GameState => {
  const t = structuredClone(s);
  for (const c of t.channels) c.adMinutes = minutes;
  return t;
};

/** What the player's channels earned and drew in a day. */
function today(s: GameState) {
  const mine = simulateDay(s).channels.filter((c) => c.isPlayer);
  return {
    revenue: mine.reduce((sum, c) => sum + c.slots.reduce((x, slot) => x + slot.revenue, 0), 0),
    listeners: mine.reduce((sum, c) => sum + c.slots.reduce((x, slot) => x + slot.listeners, 0), 0),
  };
}

/** A quiet day of the player's first channel, for the rules to look at. */
function quietDay(s: GameState): DayResult {
  const channel = s.channels[0]!;
  const slots: SlotResult[] = Array.from({ length: 5 }, (_, i) => ({ showId: null, titleId: null, programName: `p${i}`, quality: 0.5, listeners: 100, share: 0.1, revenue: 1_000 }));
  const day: ChannelDay = { channelId: channel.id, name: channel.name, ownerId: 'player', isPlayer: true, medium: channel.medium, onAir: true, slots, regionListeners: { [s.licenses[0]!.regionId]: 100 }, audienceListeners: {} };
  return { day: s.day, channels: [day] };
}

describe('ad minutes (0.21.0, #358)', () => {
  it('five minutes is neutral, and the other settings move money, appeal and reputation target the right way', () => {
    expect(adIncome(5)).toBe(1);
    expect(adAppeal(5)).toBe(1);
    expect(adReputation(5)).toBe(1);
    expect(adIncome(6)).toBeGreaterThan(1);
    expect(adAppeal(6)).toBeLessThan(1);
    expect(adReputation(6)).toBeLessThan(1);
    expect(adIncome(3)).toBeLessThan(1);
    expect(adAppeal(3)).toBeGreaterThan(1);
    expect(adReputation(3)).toBeGreaterThan(1);
    expect(adsIn(5)).toBe(10);
    expect(adsIn(6)).toBe(12);
  });

  it('a new channel, and a game that leaves the dial alone, run five minutes', () => {
    const s = base();
    expect(s.channels.every((c) => c.adMinutes === ADS.neutral)).toBe(true);
  });

  it('longer breaks sell more ads and draw fewer listeners; shorter ones the reverse', () => {
    const s = base();
    const five = today(withMinutes(s, 5));
    const six = today(withMinutes(s, 6));
    const four = today(withMinutes(s, 4));
    expect(five.revenue).toBeGreaterThan(0);
    expect(six.revenue).toBeGreaterThan(five.revenue);
    expect(six.listeners).toBeLessThan(five.listeners);
    expect(four.revenue).toBeLessThan(five.revenue);
    expect(four.listeners).toBeGreaterThan(five.listeners);
  });

  it('long breaks wear the reputation down over time; short ones build it', () => {
    const reputation = (s: GameState) => Object.values(advance(s, 90).channels[0]!.reputation).reduce((sum, r) => sum + (r ?? 0), 0);
    const s = base();
    expect(reputation(withMinutes(s, 6))).toBeLessThan(reputation(withMinutes(s, 5)));
    expect(reputation(withMinutes(s, 4))).toBeGreaterThan(reputation(withMinutes(s, 5)));
  });

  it('the limit is six minutes until 1 January 1972, then five', () => {
    expect(adLimit(AD_LAW_DAY - 1)).toBe(6);
    expect(adLimit(AD_LAW_DAY)).toBe(5);
    expect(adLimit(AD_LAW_DAY + 3000)).toBe(5);
    expect(adComplaintChance({ adMinutes: 6 }, AD_LAW_DAY - 1)).toBe(0);
    expect(adComplaintChance({ adMinutes: 6 }, AD_LAW_DAY)).toBeCloseTo(ADS.complaint);
    expect(adComplaintChance({ adMinutes: 5 }, AD_LAW_DAY)).toBe(0);
  });

  it('a channel within the limit never draws a complaint; one over it does, now and then', () => {
    const s = base();
    s.day = AD_LAW_DAY + 10;
    const complaints = (minutes: number, seed: number) => {
      const t = withMinutes(s, minutes);
      t.seed = seed;
      checkRules(t, quietDay(t));
      return t.complaints.filter((c) => c.rule === 'ads').length;
    };
    let within = 0;
    let over = 0;
    for (let seed = 1; seed <= 1_500; seed++) {
      within += complaints(5, seed);
      over += complaints(6, seed);
    }
    expect(within).toBe(0);
    expect(over).toBeGreaterThan(5);
    expect(over).toBeLessThan(40);
    const t = withMinutes(s, 6);
    t.day = AD_LAW_DAY - 10;
    for (let seed = 1; seed <= 300; seed++) {
      t.seed = seed;
      checkRules(t, quietDay(t));
    }
    expect(t.complaints).toEqual([]);
  });

  it('the complaint roll leaves the main random stream alone', () => {
    const s = withMinutes(base(), 6);
    s.day = AD_LAW_DAY + 10;
    const before = s.rngState;
    for (let seed = 1; seed <= 200; seed++) {
      const t = structuredClone(s);
      t.seed = seed;
      checkRules(t, quietDay(t));
      expect(t.rngState).toBe(before);
    }
  });

  it('the authority names the rule', () => {
    expect(RULE_NAMES.ads).toMatch(/ad breaks/i);
  });

  it('the news comes on 1 December 1971, and the warning on 1 January 1972 names a channel still over', () => {
    const news = tick({ ...base(), day: AD_LAW_NEWS_DAY - 1 });
    expect(news.headlines.some((h) => /ad breaks/.test(h.text))).toBe(true);
    expect(news.messages.some((m) => /law of 1970/.test(m.text))).toBe(true);

    const over = withMinutes(base(), 6);
    over.day = AD_LAW_DAY - 1;
    const warned = tick(over);
    expect(warned.messages.some((m) => m.kind === 'warning' && m.text.includes(over.channels[0]!.name) && /shorter limit/.test(m.text))).toBe(true);

    const fine = withMinutes(base(), 5);
    fine.day = AD_LAW_DAY - 1;
    expect(tick(fine).messages.some((m) => /shorter limit/.test(m.text))).toBe(false);
  });

  it('setAdMinutes keeps to the steps and the range', () => {
    const s = base();
    const id = s.channels[0]!.id;
    const set = (n: number) => {
      const r = setAdMinutes(s, id, n);
      if (!r.ok) throw new Error(r.error);
      return r.state.channels[0]!.adMinutes;
    };
    expect(set(4)).toBe(4);
    expect(set(4.6)).toBe(4.5);
    expect(set(99)).toBe(ADS.max);
    expect(set(-3)).toBe(ADS.min);
    expect(setAdMinutes(s, id, Number.NaN).ok).toBe(false);
    expect(setAdMinutes(s, 'nope', 5).ok).toBe(false);
  });

  it('a save from version 75 loads with every channel at five minutes', () => {
    const old = JSON.parse(JSON.stringify(toSaveFile(base(), 1))) as { version: number; state: { channels: Record<string, unknown>[] } };
    for (const c of old.state.channels) delete c.adMinutes;
    old.version = 75;
    const { version, state } = fromSaveFile(old);
    expect(version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(76);
    expect(state.channels.length).toBeGreaterThan(0);
    expect(state.channels.every((c) => c.adMinutes === 5)).toBe(true);
  });

  it('keeps the dial in the save', () => {
    const s = withMinutes(base(), 3.5);
    expect(fromSaveFile(JSON.parse(JSON.stringify(toSaveFile(s, 1)))).state.channels[0]!.adMinutes).toBe(3.5);
  });
});
