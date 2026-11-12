import { describe, expect, it } from 'vitest';
import { RENEWAL } from '../config/balance';
import { buyLicense, dropLicense, placeBid, type ActionResult } from './actions';
import { sensibleBot } from './bots';
import { toDay } from './calendar';
import { barredUntil, freeLicenses, licensePrice, licenseTermDays, licenseValue, renewalReserve } from './licenses';
import { createInitialState } from './newGame';
import { slow } from './slow';
import { unlockAll } from './unlocks';
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
    expect(renewalReserve('radio', 'capital', s, value)).toBe(Math.round((value * RENEWAL.reserveYears) / 1000) * 1000);
    expect(renewalReserve('radio', 'capital', s, 0)).toBe(licensePrice('radio', 'capital', s));
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
    expect(auction.reserve).toBe(renewalReserve('radio', 'capital', open, auction.holder!.value));
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
    }, slow(60_000));

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
    }, slow(60_000));
  });
});
