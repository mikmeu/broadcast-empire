import { describe, expect, it } from 'vitest';
import { OWN_EVENTS, OWN_EVENT_LIMITS, RENEWAL } from '../config/balance';
import { buyLicense, dropLicense, placeBid, stageEvent, type ActionResult } from './actions';
import { channelRegions } from './broadcast';
import { capitalBot, sensibleBot, tvBot } from './bots';
import { toDay } from './calendar';
import { barredUntil, freeLicenses, licensePrice, licenseTermDays, licenseValue, renewalReserve } from './licenses';
import { hasMilestone } from './milestones';
import { createInitialState } from './newGame';
import { unlockAll } from './unlocks';
import { eventHost, ownEventCooldown, ownEventCost } from './ownEvents';
import { fromSaveFile, SAVE_VERSION } from './save';
import { PLAYER, type GameState } from './state';
import { advance, tick } from './tick';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
const error = (result: ActionResult) => (result.ok ? 'no error' : result.error);

/** The sensible bot's station in Coaxia after a week on the air, with money to spend. */
function station(): GameState {
  const s = structuredClone(advance(unlockAll(sensibleBot(createInitialState(1))), 8));
  s.money = 2_000_000;
  return s;
}

describe('staging your own events', () => {
  it('costs per region and lifts reputation, the host’s fame and prestige', () => {
    const s = station();
    const channel = s.channels[0]!;
    const host = eventHost(s, channel)!;
    const regions = channelRegions(s, channel.id);
    expect(ownEventCost(s, channel, 'gala')).toBe(OWN_EVENTS.gala.costPerRegion * regions.length);

    const after = ok(stageEvent(s, channel.id, 'gala'));
    expect(s.money - after.money).toBe(OWN_EVENTS.gala.costPerRegion);
    expect(after.ledger.events).toBe(OWN_EVENTS.gala.costPerRegion);
    expect(after.channels[0]!.reputation.capital).toBeCloseTo(channel.reputation.capital! + OWN_EVENTS.gala.reputation);
    expect(after.employees.find((e) => e.id === host.id)!.fame).toBeCloseTo(Math.min(100, host.fame + OWN_EVENTS.gala.fame));
    expect(after.prestige).toBe(OWN_EVENTS.gala.prestigePerRegion);
    expect(after.headlines.at(-1)!.text).toMatch(/stages a gala/);
    expect(hasMilestone(tick(after), 'firstEvent')).toBe(true);
  });

  it('is limited to one a year per channel, and needs the channel on air and the money', () => {
    const s = station();
    const id = s.channels[0]!.id;
    const after = ok(stageEvent(s, id, 'concert'));
    expect(ownEventCooldown(after, after.channels[0]!)).toBe(OWN_EVENT_LIMITS.cooldownDays);
    expect(error(stageEvent(after, id, 'concert'))).toMatch(/less than a year ago/);
    expect(stageEvent({ ...after, day: after.day + OWN_EVENT_LIMITS.cooldownDays }, id, 'concert').ok).toBe(true);
    expect(error(stageEvent({ ...s, money: 1_000 }, id, 'telethon'))).toMatch(/Not enough money/);
    expect(error(stageEvent({ ...s, licenses: [] }, id, 'concert'))).toMatch(/off the air/);
  });

  it('the lift fades again, the prestige stays', () => {
    const s = station();
    const before = advance(s, 300).channels[0]!.reputation.capital!;
    const staged = ok(stageEvent(s, s.channels[0]!.id, 'telethon'));
    const after = advance(staged, 300);
    expect(staged.channels[0]!.reputation.capital!).toBeGreaterThan(s.channels[0]!.reputation.capital! + 0.15);
    expect(after.channels[0]!.reputation.capital! - before).toBeLessThan(0.04);
    expect(after.prestige).toBe(OWN_EVENTS.telethon.prestigePerRegion);
  });
});

describe('license terms', () => {
  it('a new license runs for the full term; licenses that exist at the start expire a few years apart', () => {
    const s = station();
    expect(s.licenses[0]!.expiresOn).toBe(licenseTermDays());
    const expiries = createInitialState(1).rivals.flatMap((r) => r.channels).flatMap((c) => c.regionIds.map((r) => c.licenseExpiry[r]!));
    expect(expiries.length).toBeGreaterThan(10);
    expect(Math.min(...expiries)).toBeGreaterThanOrEqual(toDay(1970 + RENEWAL.firstTermYears.min, 1, 1) - 2);
    expect(Math.max(...expiries)).toBeLessThanOrEqual(toDay(1970 + RENEWAL.firstTermYears.max, 1, 1) + 2);
    expect(new Set(expiries).size).toBeGreaterThanOrEqual(3);
  });

  it('what a license earns sets the least a renewal costs', () => {
    const s = station();
    const value = licenseValue(s, s.channels[0]!.id, 'capital', 'radio');
    expect(value).toBeGreaterThan(200_000);
    expect(renewalReserve('radio', 'capital', s.day, value)).toBe(Math.round((value * RENEWAL.reserveYears) / 1000) * 1000);
    expect(renewalReserve('radio', 'capital', s.day, 0)).toBe(licensePrice('radio', 'capital', s.day));
  });
});

describe('renewal rounds', () => {
  /** The station on the day its Coaxia license enters its renewal round. */
  function atRenewal(): GameState {
    const s = station();
    s.day = s.licenses[0]!.expiresOn - RENEWAL.auctionDays - 1;
    return tick(s);
  }
  const license = (s: GameState) => s.licenses.find((l) => l.regionId === 'capital');

  it('the holder is warned a year ahead, and the round opens for the last month', () => {
    const s = station();
    s.day = s.licenses[0]!.expiresOn - RENEWAL.warnDays - 1;
    expect(tick(s).messages.some((m) => m.kind === 'warning' && /radio license in Coaxia runs out on/.test(m.text))).toBe(true);

    const open = atRenewal();
    const auction = open.auctions.find((a) => a.holder)!;
    expect(auction).toMatchObject({ regionId: 'capital', medium: 'radio', endsOn: open.licenses[0]!.expiresOn });
    expect(auction.holder).toMatchObject({ ownerId: PLAYER, channelId: open.channels[0]!.id });
    expect(auction.reserve).toBe(renewalReserve('radio', 'capital', open.day, auction.holder!.value));
    expect(open.messages.some((m) => /up for renewal/.test(m.text))).toBe(true);
    // A renewal round is for a license that is still held, so it doesn't count as a free one being auctioned.
    expect(freeLicenses(open, 'radio', 'capital')).toBe(freeLicenses(station(), 'radio', 'capital'));
  });

  it('without a bid the reserve is paid and the license runs another term', () => {
    const open = atRenewal();
    open.rivals = [];
    const auction = open.auctions.find((a) => a.holder)!;
    const after = advance(open, RENEWAL.auctionDays);
    expect(license(after)!.expiresOn).toBe(license(open)!.expiresOn + licenseTermDays());
    expect(license(after)!.price).toBe(auction.reserve);
    expect(after.ledger.renewals + after.monthlyReports.reduce((sum, r) => sum + r.renewals, 0)).toBe(auction.reserve);
    expect(after.auctions.some((a) => a.holder?.ownerId === PLAYER)).toBe(false);
  });

  it('a challenger that clearly outbids the holder takes the license, and the holder is barred', () => {
    const open = atRenewal();
    const auction = open.auctions.find((a) => a.holder)!;
    // The license is worth far more than the holder bids, and three rivals are not in Coaxia yet.
    auction.reserve = 1_000;
    auction.holder!.value = 1_000_000;
    const after = advance(open, RENEWAL.auctionDays);
    expect(license(after)).toBeUndefined();
    expect(after.messages.some((m) => m.kind === 'danger' && /has lost its radio license in Coaxia/.test(m.text))).toBe(true);
    expect(after.rivals.filter((r) => r.channels.some((c) => c.regionIds.includes('capital'))).length).toBe(2);
    expect(barredUntil(after, 'radio', 'capital')).toBeGreaterThan(after.day + 4 * 365);
    expect(error(buyLicense(after, after.channels[0]!.id, 'capital'))).toMatch(/won’t sell you another/);
  });

  it('bidding the most a challenger would, less the holder’s advantage, always keeps it', () => {
    const open = atRenewal();
    const auction = open.auctions.find((a) => a.holder)!;
    auction.reserve = 1_000;
    auction.holder!.value = 1_000_000;
    const safe = Math.ceil((1_000_000 * RENEWAL.challengeYears.max) / (1 + RENEWAL.holderAdvantage));
    const after = advance(ok(placeBid(open, auction.id, auction.holder!.channelId, safe)), RENEWAL.auctionDays);
    expect(license(after)!.expiresOn).toBe(license(open)!.expiresOn + licenseTermDays());
    expect(open.money - after.money).toBeGreaterThanOrEqual(safe);
  });

  it('a holder that can’t pay loses the license', () => {
    const open = atRenewal();
    open.rivals = [];
    open.auctions.find((a) => a.holder)!.reserve = 50_000_000;
    const after = advance(open, RENEWAL.auctionDays);
    expect(license(after)).toBeUndefined();
    expect(after.messages.some((m) => /has lapsed/.test(m.text))).toBe(true);
  });

  it('giving a license up also bars the company from that region', () => {
    const s = station();
    const dropped = ok(dropLicense(s, s.licenses[0]!.id));
    expect(error(buyLicense(dropped, dropped.channels[0]!.id, 'capital'))).toMatch(/won’t sell you another/);
    const later = { ...dropped, day: dropped.day + Math.round(RENEWAL.barYears * 365.25) + 1 };
    expect(buyLicense(later, later.channels[0]!.id, 'capital').ok).toBe(true);
  });

  describe('a rival’s license', () => {
    /** The day a rival radio license in Transponder Valley enters its renewal round. */
    function rivalRound() {
      let s = station();
      for (let i = 0; i < 9 * 366 && !s.auctions.some((a) => a.holder && a.holder.ownerId !== PLAYER && a.medium === 'radio' && a.regionId === 'north'); i++) {
        s = tick(sensibleBot(s));
      }
      s = { ...structuredClone(s), money: 50_000_000 };
      const auction = s.auctions.find((a) => a.holder && a.holder.ownerId !== PLAYER && a.medium === 'radio' && a.regionId === 'north')!;
      const held = s.rivals.flatMap((r) => r.channels).find((c) => c.id === auction.holder!.channelId)!;
      return { s, auction, held };
    }

    it('can be taken over by clearly outbidding the holder', () => {
      const { s, auction, held } = rivalRound();
      expect(held.regionIds).toContain('north');
      const most = Math.max(auction.reserve, auction.holder!.value * RENEWAL.challengeYears.max * (1 + RENEWAL.holderAdvantage));
      const bid = ok(placeBid(s, auction.id, s.channels[0]!.id, Math.ceil(most) + 1_000));
      const after = advance(bid, RENEWAL.auctionDays + 1);
      expect(after.licenses.some((l) => l.regionId === 'north' && l.channelId === s.channels[0]!.id)).toBe(true);
      expect(after.rivals.flatMap((r) => r.channels).find((c) => c.id === held.id)!.regionIds).not.toContain('north');
      expect(after.messages.some((m) => /You took over/.test(m.text))).toBe(true);
      // Simulates up to nine years, which takes about as long as the default limit.
    }, 60_000);

    it('stays with the rival for another term when nobody bids enough', () => {
      const { s, auction, held } = rivalRound();
      const expiry = held.licenseExpiry.north!;
      const low = advance(ok(placeBid(s, auction.id, s.channels[0]!.id, auction.reserve)), RENEWAL.auctionDays + 1);
      const after = low.rivals.flatMap((r) => r.channels).find((c) => c.id === held.id)!;
      // A bid at the reserve can only win if the holder's own (secret) bid is no higher.
      if (after.regionIds.includes('north')) expect(after.licenseExpiry.north).toBe(expiry + licenseTermDays());
      const none = advance(s, RENEWAL.auctionDays + 1).rivals.flatMap((r) => r.channels).find((c) => c.id === held.id)!;
      expect(none.regionIds).toContain('north');
      expect(none.licenseExpiry.north).toBe(expiry + licenseTermDays());
    }, 60_000);
  });
});

describe('saves from before Phase 5d', () => {
  it('upgrade with staggered expiry dates and no prestige', () => {
    const s = structuredClone(advance(unlockAll(sensibleBot(createInitialState(1))), 40)) as unknown as Record<string, unknown> & GameState;
    for (const key of ['prestige', 'licenseBars']) delete (s as Record<string, unknown>)[key];
    for (const l of s.licenses) delete (l as unknown as Record<string, unknown>).expiresOn;
    for (const c of s.channels) delete (c as unknown as Record<string, unknown>).lastEventDay;
    for (const c of s.rivals.flatMap((r) => r.channels)) delete (c as unknown as Record<string, unknown>).licenseExpiry;
    delete (s.ledger as unknown as Record<string, unknown>).events;
    delete (s.ledger as unknown as Record<string, unknown>).renewals;
    const { state, version } = fromSaveFile({ version: 11, savedAt: 1, state: s });
    expect(version).toBe(SAVE_VERSION);
    expect(state).toMatchObject({ prestige: 0, licenseBars: [] });
    const first = state.day + Math.round(RENEWAL.firstTermYears.min * 365.25);
    expect(state.licenses.every((l) => l.expiresOn >= first)).toBe(true);
    expect(state.rivals.flatMap((r) => r.channels).every((c) => c.regionIds.every((r) => c.licenseExpiry[r]! >= first))).toBe(true);
    expect(state.ledger.events + state.ledger.renewals).toBe(0);
    expect(tick(state).day).toBe(41);
  });
});

// --- Phase 5d acceptance (prompt.md section 14) ---

describe('Phase 5d acceptance', () => {
  it('a growing company spends at least a quarter of its profit on events and renewals, and is warned a year before every expiry', () => {
    let s = createInitialState(1);
    const end = toDay(2030, 1, 1);
    const warned = new Map<string, number>();
    /** Days between each renewal round opening and the warning that came before it. */
    const notice: number[] = [];
    while (s.day < end && !s.bankrupt) {
      const seen = s.nextMessageId;
      s = tick(tvBot(s));
      for (const m of s.messages.filter((x) => x.id >= seen)) {
        const license = /^(.+’s (?:radio|TV) license in .+?) (runs out on|is up for renewal)/.exec(m.text);
        if (license?.[2] === 'runs out on') warned.set(license[1]!, m.day);
        if (license?.[2] === 'is up for renewal') notice.push(m.day - (warned.get(license[1]!) ?? Infinity));
      }
    }
    expect(s.bankrupt).toBe(false);
    const spent = s.monthlyReports.reduce((sum, r) => sum + r.events + r.renewals, 0);
    const profit = s.monthlyReports.reduce((sum, r) => sum + r.net, 0) + spent;
    expect(spent / profit).toBeGreaterThan(0.25);
    expect(s.monthlyReports.some((r) => r.renewals > 0)).toBe(true);
    expect(s.prestige).toBeGreaterThan(100);
    // Every renewal round was announced about a year before.
    expect(notice.length).toBeGreaterThan(20);
    expect(new Set(notice)).toEqual(new Set([RENEWAL.warnDays - RENEWAL.auctionDays]));
  }, 300_000);

  it('a well-run single channel in Coaxia keeps its license through two renewals', () => {
    const games = [2, 3, 4, 5].map((seed) => {
      let s = createInitialState(seed);
      let kept = 0;
      let lost = 0;
      while (s.day < 17 * 365 && !s.bankrupt) {
        const seen = s.nextMessageId;
        s = tick(capitalBot(s));
        for (const m of s.messages.filter((x) => x.id >= seen)) {
          if (/keeps its radio license in Coaxia/.test(m.text)) kept += 1;
          if (/has lost its|has lapsed/.test(m.text)) lost += 1;
        }
      }
      return { s, kept, lost };
    });
    // No company ever loses its license in a renewal round, and most are still on the air after their second.
    expect(games.every((g) => g.lost === 0)).toBe(true);
    expect(games.filter((g) => !g.s.bankrupt && g.kept === 2).length).toBeGreaterThanOrEqual(3);
  }, 300_000);
});
