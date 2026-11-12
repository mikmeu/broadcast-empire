import { describe, expect, it } from 'vitest';
import { RENEWAL } from '../config/balance';
import { placeBid, type ActionResult } from './actions';
import { sensibleBot } from './bots';
import { licenseTermDays } from './licenses';
import { createInitialState } from './newGame';
import { slow } from './slow';
import { unlockAll } from './unlocks';
import { PLAYER, type GameState } from './state';
import { advance, tick } from './tick';

// A long test: it runs in its own job, when a change touches game logic (see PIPELINE.md, "Testing: what runs where").

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** The sensible bot's station in Coaxia after a week on the air, with money to spend. */
function station(): GameState {
  const s = structuredClone(advance(unlockAll(sensibleBot(createInitialState(1))), 8));
  s.money = 2_000_000;
  return s;
}

describe('renewal rounds', () => {
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
