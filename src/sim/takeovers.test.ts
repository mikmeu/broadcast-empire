import { describe, expect, it } from 'vitest';
import { ACTIVE_REGIONS, LICENSE_RAMP, TAKEOVER } from '../config/balance';
import type { RegionId } from '../config/world';
import { takeOverLicense } from './actions';
import { companyValue } from './economy';
import { licensePrice, licenseRamp, licensesTaken, startReputation } from './licenses';
import { createInitialState } from './newGame';
import { rivalCeiling } from './rivals';
import { sensibleBot } from './bots';
import { takeoverBlocker, takeoverChannels, takeoverPremium, takeoverPrice, takeoversForSale, regionValue } from './takeovers';
import { unlockAll } from './unlocks';
import type { GameState, Rival, RivalChannel } from './state';

/**
 * A company with a radio station, and a rival (not EPB) whose radio channel holds two regions the company's channel is not in, the second with a
 * reputation and an expiry. Money is plenty, and level 11 is open.
 */
function setup(): { s: GameState; rival: Rival; theirs: RivalChannel; mine: string; sale: RegionId; other: RegionId } {
  const s = structuredClone(unlockAll(sensibleBot(createInitialState(1))));
  s.money = 50_000_000;
  const mine = s.channels.find((c) => c.medium === 'radio')!;
  const held = new Set(s.licenses.filter((l) => l.channelId === mine.id).map((l) => l.regionId));
  const free = ACTIVE_REGIONS.filter((r) => !held.has(r));
  const rival = s.rivals.find((r) => r.personality !== 'highbrow')!;
  const theirs = rival.channels.find((c) => c.medium === 'radio')!;
  const [sale, other] = free as [RegionId, RegionId];
  theirs.regionIds = [sale, other];
  theirs.reputation = { [sale]: 0.6, [other]: 0.2 };
  theirs.licenseExpiry = { [sale]: s.day + 900, [other]: s.day + 1200 };
  rival.money = 100_000;
  rival.rivalry = 0;
  s.auctions = [];
  s.licenseBars = [];
  return { s, rival, theirs, mine: mine.id, sale, other };
}

describe('the price of a rival’s licence (#476)', () => {
  it('is the list price at least, times a premium that starts at the base', () => {
    const { s, rival, theirs, sale } = setup();
    rival.money = 0;
    expect(takeoverPremium(rival)).toBeCloseTo(TAKEOVER.premium.base);
    expect(regionValue(s, theirs, sale)).toBeGreaterThanOrEqual(TAKEOVER.worth * licensePrice('radio', sale, s));
    expect(takeoverPrice(s, rival, theirs, sale)).toBeGreaterThanOrEqual(Math.round(TAKEOVER.worth * licensePrice('radio', sale, s) * TAKEOVER.premium.base - 1000));
  });

  it('rises with its rivalry and with its money', () => {
    const { s, rival, theirs, sale } = setup();
    rival.money = 0;
    const calm = takeoverPrice(s, rival, theirs, sale);
    rival.rivalry = 1;
    const fighting = takeoverPrice(s, rival, theirs, sale);
    expect(fighting).toBeGreaterThan(calm);
    rival.money = rivalCeiling(rival.personality);
    expect(takeoverPrice(s, rival, theirs, sale)).toBeGreaterThan(fighting);
    expect(takeoverPremium(rival)).toBeCloseTo(TAKEOVER.premium.base + TAKEOVER.premium.rivalry + TAKEOVER.premium.purse);
  });

  it('counts the revenue the channel makes in that region, by its share of the listeners', () => {
    const { s, rival, theirs, sale, other } = setup();
    const base = takeoverPrice(s, rival, theirs, sale);
    s.weeklyReports = [{ fromDay: s.day - 7, days: 7, channels: [{ channelId: theirs.id, name: 'R', ownerId: rival.id, isPlayer: false, medium: 'radio', slots: [], regionListeners: { [sale]: 3000, [other]: 1000 }, audienceListeners: {}, revenue: 70_000 }] }];
    const withRevenue = takeoverPrice(s, rival, theirs, sale);
    expect(withRevenue).toBeGreaterThan(base);
    // Three quarters of the listeners are there: a quarter of the region's price for the other one.
    const revenuePart = (r: RegionId) => regionValue(s, theirs, r) / TAKEOVER.worth - licensePrice('radio', r, s);
    expect(revenuePart(sale)).toBeCloseTo(3 * revenuePart(other), -2);
  });
});

describe('what stops a takeover (#476)', () => {
  it('is open from level 11 and not before', () => {
    const { s, theirs, sale } = setup();
    expect(takeoverBlocker(s, theirs.id, sale)).toBeNull();
    s.unlocked = s.unlocked.filter((f) => f !== 'takeovers');
    expect(takeoverBlocker(s, theirs.id, sale)).toMatch(/level 11/);
    expect(takeoversForSale(s)).toEqual([]);
  });

  it('never sells EPB', () => {
    const { s, mine } = setup();
    const epb = s.rivals.find((r) => r.personality === 'highbrow')!;
    const channel = epb.channels.find((c) => c.medium === 'radio')!;
    channel.regionIds = ACTIVE_REGIONS.slice(0, 2);
    expect(takeoverBlocker(s, channel.id, channel.regionIds[0]!, mine)).toMatch(/not for sale/);
  });

  it('never sells a channel’s last region', () => {
    const { s, theirs, sale } = setup();
    theirs.regionIds = [sale];
    expect(takeoverBlocker(s, theirs.id, sale)).toMatch(/last region/);
  });

  it('waits out the renewal round of that licence', () => {
    const { s, rival, theirs, sale } = setup();
    s.auctions = [{ id: 'a1', medium: 'radio', regionId: sale, reserve: 1000, endsOn: s.day + 10, interested: 0, bid: null, holder: { ownerId: rival.id, channelId: theirs.id, value: 1 } }];
    expect(takeoverBlocker(s, theirs.id, sale)).toMatch(/renewal/);
  });

  it('wants a channel of the same medium that is not in the region yet', () => {
    const { s, theirs, sale, mine } = setup();
    s.channels = [{ ...s.channels.find((c) => c.id === mine)!, medium: 'tv' }];
    expect(takeoverBlocker(s, theirs.id, sale)).toMatch(/no radio channel/);
    s.channels = [];
    expect(takeoverChannels(s, theirs, sale)).toEqual([]);
  });

  it('is closed to a region the company was barred from', () => {
    const { s, theirs, sale, mine } = setup();
    s.licenseBars = [{ medium: 'radio', regionId: sale, until: s.day + 100 }];
    expect(takeoverBlocker(s, theirs.id, sale, mine)).toMatch(/won’t let you/);
  });

  it('asks for the money', () => {
    const { s, theirs, sale, mine } = setup();
    s.money = 100;
    expect(takeoverBlocker(s, theirs.id, sale, mine)).toMatch(/Not enough money/);
    expect(takeoversForSale(s).some((x) => x.channel.id === theirs.id)).toBe(true);
  });

  it('refuses a second TV licence before it is open', () => {
    const { s, rival, mine, sale } = setup();
    const tv = rival.channels.find((c) => c.medium === 'tv') ?? { ...rival.channels[0]!, id: 'rtv', medium: 'tv' as const, regionIds: [sale, ACTIVE_REGIONS[0]!] };
    tv.medium = 'tv';
    if (!rival.channels.includes(tv)) rival.channels.push(tv);
    tv.regionIds = [sale, ACTIVE_REGIONS.find((r) => r !== sale)!];
    s.channels.push({ ...s.channels.find((c) => c.id === mine)!, id: 'mytv', medium: 'tv' });
    s.licenses.push({ id: 'ltv', regionId: ACTIVE_REGIONS.find((r) => r !== sale)!, medium: 'tv', channelId: 'mytv', price: 1, expiresOn: s.day + 100 });
    s.unlocked = s.unlocked.filter((f) => f !== 'secondTvLicense');
    expect(takeoverBlocker(s, tv.id, sale, 'mytv')).toMatch(/TV license already/);
  });
});

describe('buying the licence (#476)', () => {
  it('moves the region, the reputation and the expiry, and pays the rival', () => {
    const { s, rival, theirs, mine, sale, other } = setup();
    const price = takeoverPrice(s, rival, theirs, sale);
    const expiry = theirs.licenseExpiry[sale]!;
    const result = takeOverLicense(s, theirs.id, sale, mine);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = result.state;
    const rivalAfter = after.rivals.find((r) => r.id === rival.id)!;
    const channelAfter = rivalAfter.channels.find((c) => c.id === theirs.id)!;
    expect(channelAfter.regionIds).toEqual([other]);
    expect(channelAfter.reputation[sale]).toBeUndefined();
    expect(channelAfter.licenseExpiry[sale]).toBeUndefined();
    expect(rivalAfter.money).toBe(rival.money + price);
    expect(after.money).toBe(s.money - price);
    const license = after.licenses.find((l) => l.channelId === mine && l.regionId === sale)!;
    expect(license).toMatchObject({ medium: 'radio', price: licensePrice('radio', sale, s), expiresOn: expiry, takenOver: { from: rival.id, paid: price, on: s.day } });
    // The listeners start at TAKEOVER.listeners of the region, and reach all of it after the ramp.
    expect(licenseRamp(license, s.day)).toBeCloseTo(TAKEOVER.listeners, 1);
    expect(licenseRamp(license, s.day + LICENSE_RAMP.days)).toBe(1);
    expect(after.channels.find((c) => c.id === mine)!.reputation[sale]).toBeCloseTo(Math.max(startReputation(s, sale), TAKEOVER.reputation * 0.6));
  });

  it('leaves the count of licences taken in the region as it was, and the company value at the list price', () => {
    const { s, rival, theirs, mine, sale } = setup();
    const taken = licensesTaken(s, 'radio', sale);
    const value = companyValue(s);
    const result = takeOverLicense(s, theirs.id, sale, mine);
    if (!result.ok) throw new Error(result.error);
    expect(licensesTaken(result.state, 'radio', sale)).toBe(taken);
    const price = takeoverPrice(s, rival, theirs, sale);
    // The money left the company; the licence is worth its list price, not what was paid.
    expect(companyValue(result.state)).toBeLessThan(value);
    expect(companyValue(result.state)).toBeGreaterThan(value - price);
  });

  it('says so in a headline and an e-mail from the rivals group', () => {
    const { s, theirs, mine, sale } = setup();
    const result = takeOverLicense(s, theirs.id, sale, mine);
    if (!result.ok) throw new Error(result.error);
    expect(result.state.headlines[result.state.headlines.length - 1]!.text).toContain(`buys ${theirs.name}’s licence`);
    expect(result.state.messages[result.state.messages.length - 1]!.text).toContain(theirs.name);
  });

  it('fails with the blocker’s words and changes nothing', () => {
    const { s, theirs, mine, sale } = setup();
    theirs.regionIds = [sale];
    const result = takeOverLicense(s, theirs.id, sale, mine);
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/last region/) });
  });

  it('cannot be done twice for the same region', () => {
    const { s, theirs, mine, sale } = setup();
    const once = takeOverLicense(s, theirs.id, sale, mine);
    if (!once.ok) throw new Error(once.error);
    expect(takeOverLicense(once.state, theirs.id, sale, mine).ok).toBe(false);
  });
});
