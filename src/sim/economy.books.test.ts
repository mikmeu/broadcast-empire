import { describe, expect, it } from 'vitest';
import { SALES } from '../config/balance';
import { sensibleBot } from './bots';
import { simulateDay } from './broadcast';
import { outlook } from './economy';
import { withoutRecordRooms } from './fixtures';
import { createInitialState } from './newGame';
import type { GameState, SponsorContract } from './state';
import { advance } from './tick';
import { unlockAll } from './unlocks';

/** A radio station from the sensible test player, a month on the air, with everything open and money to spare. */
const station = (days = 30): GameState => {
  // Without the library and post room the bot keeps its records in (0.18.0): the tests below build rooms where the game proposes them.
  const s = structuredClone(withoutRecordRooms(unlockAll(advance(sensibleBot(createInitialState(1)), days))));
  s.money = 3_000_000;
  s.floorsUnlocked = 2;
  return s;
};

describe('version 0.13.0', () => {
  describe('what the company earns, apart (R99)', () => {
    it('a sponsor’s part of a show’s revenue is what its rate adds to the ads', () => {
      const s = station();
      const show = s.shows.find((x) => s.channels[0]!.schedule.includes(x.id))!;
      const plain = simulateDay(s).channels.find((c) => c.isPlayer)!.slots.find((x) => x.showId === show.id)!;
      expect(plain.sponsorRevenue).toBe(0);
      const contract: SponsorContract = { id: 'c', sponsor: 'Acme', medium: 'radio', cpmMultiplier: 1.5, preferredAudience: null, minListeners: 0, weeks: 4, penalty: 0, showId: show.id, startDay: s.day, endDay: s.day + 28, listenerSum: 0, daysRun: 0 } as unknown as SponsorContract;
      const sponsored = simulateDay({ ...s, contracts: [contract] }).channels.find((c) => c.isPlayer)!.slots.find((x) => x.showId === show.id)!;
      expect(sponsored.revenue).toBeCloseTo(plain.revenue * 1.5, 6);
      expect(sponsored.sponsorRevenue).toBeCloseTo(plain.revenue * 0.5, 6);
      expect(SALES.preferredAudienceBonus).toBeGreaterThan(1);
    });

    it('the books keep the sponsors’ part and teleshopping fees as part of the revenue', () => {
      // Mid-month, so that no report is filed in between.
      let s = station(10);
      const start = s.ledger.revenue;
      s = advance(s, 3);
      expect(s.ledger.revenue).toBeGreaterThan(start);
      expect(s.ledger.sponsorRevenue).toBeGreaterThanOrEqual(0);
      expect(s.ledger.sponsorRevenue + s.ledger.fees).toBeLessThanOrEqual(s.ledger.revenue);
      const ahead = outlook(s);
      expect(ahead.sponsors + ahead.fees).toBeLessThanOrEqual(ahead.income);
    });
  });
});
