import { describe, expect, it } from 'vitest';
import { LICENSE_BASE_POPULATION, LICENSE_RAMP, RENEWAL, TRANSMITTER } from '../config/balance';
import { getTech } from '../config/tech';
import { UNLOCKS } from '../config/unlocks';
import { upgradeTransmitter, type ActionResult } from './actions';
import { sensibleBot, upgradeTransmitterWhenItPays } from './bots';
import { toDay } from './calendar';
import { costFactor } from './difficulty';
import { dividendReserve } from './economy';
import { licenseRamp, licenseValue } from './licenses';
import { createInitialState } from './newGame';
import type { GameState } from './state';
import { advance, tick } from './tick';
import { homeMastTier, licenseReach, licenseSignal, transmitterBlocker, transmitterGain, transmitterPrice, transmitterTech, transmitterTier } from './transmitters';
import { unlockAll } from './unlocks';
import { population } from './world';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** The sensible bot's radio station in its home region after a week on the air, in the year `year`, with money and all techs. */
function station(year = 1986): GameState {
  const s = structuredClone(advance(unlockAll(sensibleBot(createInitialState(1))), 8));
  s.money = 20_000_000;
  s.day = Math.max(s.day, toDay(year, 3, 1));
  s.techs = [...new Set([...s.techs, 'solidStateTransmitters', 'singleFrequency', 'digitalTerrestrial'] as const)];
  return s;
}

describe('the reach and the signal of a licence (#478)', () => {
  it('a licence without a transmitter reaches what its ramp says, and a tier adds to it', () => {
    const none = { since: 100 };
    expect(licenseReach(none, 100)).toBeCloseTo(licenseRamp(none, 100));
    for (const tier of [1, 2, 3] as const) {
      expect(licenseReach({ ...none, transmitter: { tier, paid: 1 } }, 100)).toBeCloseTo(licenseRamp(none, 100) * (1 + TRANSMITTER.reach[tier]!));
    }
    // A licence that has been there a while is established: the tier is all there is to it.
    expect(licenseReach({ transmitter: { tier: 3, paid: 1 } }, 100 + LICENSE_RAMP.days)).toBeCloseTo(1 + TRANSMITTER.reach[3]!);
    expect(licenseReach({}, 5)).toBe(1);
  });

  it('lifts the appeal a little, by tier', () => {
    expect(licenseSignal({})).toBe(1);
    expect(licenseSignal({ transmitter: { tier: 3, paid: 1 } })).toBe(TRANSMITTER.appeal[3]);
    expect(TRANSMITTER.appeal[3]).toBeLessThan(1.1);
  });
});

describe('the price of a step (#478)', () => {
  it('follows the region’s people and falls as the technology ages', () => {
    const s = station(1985);
    const l = s.licenses[0]!;
    const tech = transmitterTech(1);
    s.day = toDay(tech.year, 1, 1);
    const fresh = transmitterPrice(s, l);
    const people = population(l.regionId, s.day) / LICENSE_BASE_POPULATION;
    expect(fresh).toBeCloseTo(TRANSMITTER.price[l.medium][0]! * people * 1, -4);
    s.day = toDay(tech.year + 5, 1, 1);
    const older = transmitterPrice(s, l);
    expect(older).toBeLessThan(fresh);
    s.day = toDay(tech.year + 60, 1, 1);
    // Down to half, and not below.
    const half = TRANSMITTER.price[l.medium][0]! * TRANSMITTER.ageing.floor * (population(l.regionId, s.day) / LICENSE_BASE_POPULATION) * costFactor(s);
    expect(Math.abs(transmitterPrice(s, l) - half)).toBeLessThanOrEqual(500);
  });

  it('is dearer for a later step and for TV, and nothing at the top', () => {
    const s = station();
    const l = s.licenses[0]!;
    const first = transmitterPrice(s, l);
    l.transmitter = { tier: 1, paid: first };
    expect(transmitterPrice(s, l)).toBeGreaterThan(first);
    l.transmitter = { tier: 3, paid: 1 };
    expect(transmitterPrice(s, l)).toBe(0);
    expect(TRANSMITTER.price.tv[0]).toBeGreaterThan(TRANSMITTER.price.radio[0]!);
  });
});

describe('what stops a step (#478)', () => {
  it('says why, in order: locked, the technology, the money', () => {
    const s = station();
    const id = s.licenses[0]!.id;
    expect(transmitterBlocker(s, id)).toBeNull();

    const poor = structuredClone(s);
    poor.money = 0;
    expect(transmitterBlocker(poor, id)).toMatch(/Not enough money/);

    const untaught = structuredClone(poor);
    untaught.techs = untaught.techs.filter((t) => t !== 'solidStateTransmitters');
    expect(transmitterBlocker(untaught, id)).toBe(`Research ${getTech('solidStateTransmitters').name} first.`);

    const locked = structuredClone(untaught);
    locked.unlocked = locked.unlocked.filter((f) => f !== 'transmitters');
    expect(transmitterBlocker(locked, id)).toBe(`Transmitters open at level ${UNLOCKS.transmitters.level}.`);
  });

  it('wants each step’s own technology, and stops at tier 3', () => {
    const s = station();
    const l = s.licenses[0]!;
    l.transmitter = { tier: 1, paid: 1 };
    s.techs = s.techs.filter((t) => t !== 'singleFrequency');
    expect(transmitterBlocker(s, l.id)).toBe(`Research ${getTech('singleFrequency').name} first.`);
    l.transmitter = { tier: 3, paid: 1 };
    expect(transmitterBlocker(s, l.id)).toMatch(/as strong as they come/);
  });
});

describe('taking a step (#478)', () => {
  it('pays the price, raises the tier, keeps what was paid and says so', () => {
    const s = station();
    const l = s.licenses[0]!;
    const price = transmitterPrice(s, l);
    const money = s.money;
    const first = ok(upgradeTransmitter(s, l.id));
    expect(first.money).toBe(money - price);
    expect(transmitterTier(first.licenses[0]!)).toBe(1);
    expect(first.messages[first.messages.length - 1]!.text).toMatch(/now reaches more of/);
    const second = ok(upgradeTransmitter(first, l.id));
    expect(transmitterTier(second.licenses[0]!)).toBe(2);
    expect(second.licenses[0]!.transmitter!.paid).toBe(price + transmitterPrice(first, first.licenses[0]!));
    // The list price of the licence, and so the company's value, do not change.
    expect(second.licenses[0]!.price).toBe(l.price);
  });

  it('is refused without the money, and the state is left alone', () => {
    const s = station();
    s.money = 100;
    const result = upgradeTransmitter(s, s.licenses[0]!.id);
    expect(result.ok).toBe(false);
  });

  it('the mast in the home town is the best tier among the licences there, and none stands before the first', () => {
    const s = station();
    expect(homeMastTier(s)).toBe(0);
    s.licenses[0]!.regionId = s.headquarters;
    expect(homeMastTier(ok(upgradeTransmitter(s, s.licenses[0]!.id)))).toBe(1);
    const elsewhere = station();
    elsewhere.licenses[0]!.regionId = elsewhere.headquarters === 'capital' ? 'north' : 'capital';
    expect(homeMastTier(ok(upgradeTransmitter(elsewhere, elsewhere.licenses[0]!.id)))).toBe(0);
  });
});

describe('a transmitter and the licence’s term (#478)', () => {
  /** The station on the day its licence enters its renewal round, with a tier 2 transmitter and rivals without the money to challenge. */
  function atRenewal(money: number): GameState {
    const s = station(1971);
    s.techs = s.techs.slice();
    s.licenses[0]!.transmitter = { tier: 2, paid: 450_000 };
    s.rivals.forEach((r) => (r.money = 0));
    s.money = money;
    s.day = s.licenses[0]!.expiresOn - RENEWAL.auctionDays - 1;
    return tick(s);
  }
  const finish = (s: GameState): GameState => {
    const end = s.auctions.find((a) => a.holder)!.endsOn;
    const near = structuredClone(s);
    near.day = end - 1;
    return tick(near);
  };

  it('stays with the licence when it is renewed', () => {
    const renewed = finish(atRenewal(20_000_000));
    expect(renewed.licenses[0]!.transmitter).toEqual({ tier: 2, paid: 450_000 });
  });

  it('goes with the licence when it is lost', () => {
    const lost = finish(atRenewal(0));
    expect(lost.licenses.length).toBe(0);
  });
});

describe('the test players and transmitters (#478)', () => {
  it('a grower buys the step that pays back, once a month, and not before the first of the month', () => {
    const s = station();
    s.money = 30_000_000;
    const l = s.licenses[0]!;
    const gain = transmitterGain(s, l);
    expect(gain).toBeCloseTo(licenseValue(s, l.channelId, l.regionId, l.medium) * ((1 + TRANSMITTER.reach[1]!) * TRANSMITTER.appeal[1]! - 1));
    // Make the first step pay back for certain: cheap against what the licence earns.
    s.day = toDay(1990, 6, 1);
    s.lastDay = s.lastDay && { ...s.lastDay, channels: s.lastDay.channels.map((c) => ({ ...c, regionListeners: { ...c.regionListeners, [l.regionId]: 5_000_000 } })) };
    s.weeklyReports = [];
    expect(transmitterPrice(s, l)).toBeLessThanOrEqual(TRANSMITTER.paybackYears * transmitterGain(s, l));
    expect(s.money - transmitterPrice(s, l)).toBeGreaterThan(dividendReserve(s) + 1_500_000);
    const mid = structuredClone(s);
    mid.day = toDay(1990, 6, 2);
    expect(upgradeTransmitterWhenItPays(mid)).toBe(mid);
    const bought = upgradeTransmitterWhenItPays(s);
    expect(transmitterTier(bought.licenses.find((x) => x.id === l.id)!)).toBe(1);
    // Only one a month, even with money for more.
    expect(bought.licenses.reduce((n, x) => n + transmitterTier(x), 0)).toBe(1);
  });

  it('buys nothing when the licence earns too little to pay it back, or before the level opens', () => {
    const s = station();
    s.day = toDay(1990, 6, 1);
    s.lastDay = null;
    s.weeklyReports = [];
    expect(upgradeTransmitterWhenItPays(s)).toBe(s);
    const early = station();
    early.day = toDay(1990, 6, 1);
    early.unlocked = early.unlocked.filter((f) => f !== 'transmitters');
    expect(upgradeTransmitterWhenItPays(early)).toBe(early);
  });
});
