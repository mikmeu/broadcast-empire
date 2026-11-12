import { afterEach, describe, expect, it } from 'vitest';
import { ADS } from '../config/balance';
import { adDemand, adSold, averageReputation } from './adMinutes';
import { simulateDay } from './broadcast';
import { capitalBot, sensibleBot } from './bots';
import { createInitialState } from './newGame';
import { employeesWithDesk } from './office';
import { airtimeChannels, onAirtime } from './staff';
import { advance, tick } from './tick';
import type { GameState } from './state';

const original = { ...ADS.demand.fullAt };
/** Sets how many listeners a slot needs for full demand, so a test can ask for full or empty demand without a whole game. */
const fullAt = (radio: number, tv = radio) => {
  ADS.demand.fullAt.radio = radio;
  ADS.demand.fullAt.tv = tv;
};
afterEach(() => fullAt(original.radio, original.tv));

const base = () => structuredClone(advance(sensibleBot(createInitialState(1)), 30));

const withMinutes = (s: GameState, minutes: number): GameState => {
  const t = structuredClone(s);
  for (const c of t.channels) c.adMinutes = minutes;
  return t;
};

function today(s: GameState) {
  const mine = simulateDay(s).channels.filter((c) => c.isPlayer);
  const slots = mine.flatMap((c) => c.slots);
  return {
    revenue: slots.reduce((sum, x) => sum + x.revenue, 0),
    listeners: slots.reduce((sum, x) => sum + x.listeners, 0),
    unsold: slots.reduce((sum, x) => sum + (x.unsold ?? 0), 0),
    slots,
  };
}

describe('unsold ad minutes (0.21.0, #363)', () => {
  it('demand grows with listeners, reputation and salespeople, from the floor to the cap', () => {
    const { floor, full } = ADS.demand;
    expect(adDemand(0, 1, 0, 'radio')).toBe(floor);
    expect(adDemand(ADS.demand.fullAt.radio, 1, 0, 'radio')).toBe(full);
    expect(adDemand(10 * ADS.demand.fullAt.radio, 1, 0, 'radio')).toBe(full);
    expect(adDemand(ADS.demand.fullAt.radio / 2, 1, 0, 'radio')).toBeGreaterThan(floor);
    expect(adDemand(ADS.demand.fullAt.radio, 0, 0, 'radio')).toBeLessThan(adDemand(ADS.demand.fullAt.radio, 1, 0, 'radio'));
    expect(adDemand(ADS.demand.fullAt.radio, 1, 1, 'radio')).toBe(ADS.max);
    expect(adDemand(ADS.demand.fullAt.radio / 2, 0.5, 0, 'radio')).toBeLessThan(adDemand(ADS.demand.fullAt.radio / 2, 0.5, 1, 'radio'));
    expect(adDemand(ADS.demand.fullAt.tv / 2, 1, 0, 'tv')).toBeCloseTo(adDemand(ADS.demand.fullAt.radio / 2, 1, 0, 'radio'));
    expect(averageReputation({ capital: 0.2, north: 0.6 }, ['capital', 'north'])).toBeCloseTo(0.4);
    expect(averageReputation({}, [])).toBe(0);
  });

  it('what sells is the smaller of the dial and the demand', () => {
    expect(adSold(5, 3.5)).toBe(3.5);
    expect(adSold(3, 3.5)).toBe(3);
    expect(adSold(6, 6)).toBe(6);
  });

  it('at full demand the money goes by the dial, as before: nothing is unsold', () => {
    fullAt(1);
    const s = base();
    // A name as good as it gets: demand is full only then.
    for (const c of s.channels) for (const r of Object.keys(c.reputation)) c.reputation[r as keyof typeof c.reputation] = 1;
    const five = today(withMinutes(s, 5));
    const six = today(withMinutes(s, 6));
    expect(five.unsold).toBe(0);
    expect(six.unsold).toBe(0);
    expect(six.revenue / six.listeners / (five.revenue / five.listeners)).toBeCloseTo(6 / 5, 1);
  });

  it('with no audience, only the floor sells, and a shorter dial loses no money below it', () => {
    fullAt(1e12);
    const s = base();
    const five = today(withMinutes(s, 5));
    const two = today(withMinutes(s, ADS.demand.floor));
    const perListener = (x: { revenue: number; listeners: number }) => x.revenue / x.listeners;
    expect(five.unsold).toBeGreaterThan(0);
    expect(two.unsold).toBe(0);
    expect(perListener(five)).toBeCloseTo(perListener(two), 1);
    expect(two.listeners).toBeGreaterThan(five.listeners);
    expect(two.revenue).toBeGreaterThan(five.revenue);
  });

  it('a poor name sells fewer minutes than a good one', () => {
    const s = base();
    const median = s.lastDay!.channels.filter((c) => c.isPlayer).flatMap((c) => c.slots).map((x) => x.listeners).sort((a, b) => a - b)[2]!;
    fullAt(median);
    const named = (reputation: number) => {
      const t = structuredClone(s);
      for (const c of t.channels) for (const r of Object.keys(c.reputation)) c.reputation[r as keyof typeof c.reputation] = reputation;
      return today(t).unsold;
    };
    expect(named(0)).toBeGreaterThan(named(1));
  });

  it('a slot with a sponsor is always sold out', () => {
    fullAt(1e12);
    const s = withMinutes(base(), 5);
    const channel = s.channels[0]!;
    const slot = channel.schedule.findIndex((id) => id !== null);
    const showId = channel.schedule[slot]!;
    expect(today(s).slots[slot]!.unsold).toBeGreaterThan(0);
    s.contracts.push({ id: 'c1', sponsor: 'Beerstar', medium: channel.medium, cpmMultiplier: 1, preferredAudience: null, minListeners: 1, weeks: 8, penalty: 100, showId, startDay: s.day, endDay: s.day + 56, listenerSum: 0, daysRun: 0 });
    expect(today(s).slots[slot]!.unsold).toBeUndefined();
  });

  it('a salesperson on airtime raises demand on the channels with the most listeners first', () => {
    let s = createInitialState(1);
    for (let day = 0; day < 120 && !s.bankrupt; day++) s = tick(capitalBot(s));
    s = structuredClone(s);
    s.employees.filter((e) => e.role === 'sales').slice(-1).forEach((e) => (e.salesJob = 'airtime'));
    const desked = employeesWithDesk(s);
    const sellers = s.employees.filter((e) => onAirtime(e) && desked.has(e.id));
    expect(sellers.length).toBeGreaterThan(0);
    const looked = airtimeChannels(s, desked);
    expect(looked.size).toBe(Math.min(s.channels.length, sellers.length * ADS.sellers.channelsEach));
    for (const { minutes } of looked.values()) {
      expect(minutes).toBeGreaterThan(0);
      expect(minutes).toBeLessThanOrEqual(ADS.sellers.minutes);
    }
    // Nobody on airtime, nobody looked after.
    const without = structuredClone(s);
    for (const e of without.employees) if (onAirtime(e)) e.salesJob = 'deals';
    expect(airtimeChannels(without, employeesWithDesk(without)).size).toBe(0);
  });

  it('fees and rivals do not change, and the main random stream does not move', () => {
    fullAt(1);
    const a = tick(withMinutes(base(), 5));
    fullAt(1e12);
    const b = tick(withMinutes(base(), 5));
    expect(b.rngState).toBe(a.rngState);
    const rivals = (t: GameState) => simulateDay(t).channels.filter((c) => !c.isPlayer).flatMap((c) => c.slots.map((x) => [x.revenue, x.unsold ?? null]));
    fullAt(1);
    const full = rivals(base());
    fullAt(1e12);
    expect(rivals(base())).toEqual(full);
    expect(full.every(([, unsold]) => unsold === null)).toBe(true);
  });
});
