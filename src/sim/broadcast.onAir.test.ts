import { describe, expect, it } from 'vitest';
import { GRACE, OFF_AIR_WARNING } from '../config/balance';
import { STEPS } from '../config/guide';
import { RECEPTION } from '../config/office';
import { TO_RECORD } from '../config/voiceOver';
import { setChannelManager, type ActionResult } from './actions';
import { sensibleBot } from './bots';
import { channelOffAirReason } from './broadcast';
import { headquartersMissing } from './control';
import { createInitialState } from './newGame';
import type { GameState } from './state';
import { advance, tick } from './tick';
import { unlockAll } from './unlocks';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}

/** A radio station from the sensible test player, a month on the air, with everything open, money to spare and two floors. */
const station = (): GameState => {
  const s = structuredClone(unlockAll(advance(sensibleBot(createInitialState(1)), 30)));
  s.money = 5_000_000;
  s.floorsUnlocked = 2;
  return s;
};

describe('version 0.16.0', () => {
  describe('the company itself (R136)', () => {
    it('goes on the air only with a CEO’s office and a reception desk', () => {
      const s = station();
      const channel = s.channels[0]!;
      expect(headquartersMissing(s)).toEqual([]);
      expect(channelOffAirReason(s, channel)).toBeNull();
      const noDesk = { ...s, rooms: s.rooms.filter((r) => r.roomId !== RECEPTION.id) };
      expect(channelOffAirReason(noDesk, channel)).toBe('No reception desk');
      const noOffice = { ...s, rooms: s.rooms.filter((r) => r.type !== 'ceoOffice') };
      expect(channelOffAirReason(noOffice, channel)).toBe('No CEO’s office with its desk');
      const neither = { ...noOffice, rooms: noOffice.rooms.filter((r) => r.roomId !== RECEPTION.id) };
      expect(channelOffAirReason(neither, channel)).toBe('No CEO’s office and no reception desk');
      // An empty CEO's office is not enough.
      const empty = { ...s, rooms: s.rooms.map((r) => (r.type === 'ceoOffice' ? { ...r, furniture: [] } : r)) };
      expect(channelOffAirReason(empty, channel)).toBe('No CEO’s office with its desk');
      // A game from before 0.16.0 waits for it.
      expect(channelOffAirReason({ ...neither, grace: { headquarters: s.day + GRACE.days } }, channel)).toBeNull();
    });

    it('is where Penny starts, and the test players too', () => {
      expect(STEPS.slice(0, 6).map((line) => line.id)).toEqual(['look-around', 'ceo-office', 'reception', 'studio', 'equipment', 'mcr']);
      expect(STEPS.findIndex((line) => line.id === 'technician-hire')).toBe(STEPS.findIndex((line) => line.id === 'cleaner') + 1);
      expect(STEPS.findIndex((line) => line.id === 'clock')).toBe(STEPS.findIndex((line) => line.id === 'play') + 1);
      // `mcr` is left out: it gets new words in 0.17.0 (#46).
      for (const id of ['look-around', 'ceo-office', 'reception', 'technician-hire', 'clock', 'master-control']) expect(TO_RECORD[id]).toBeUndefined();
      const bot = sensibleBot(createInitialState(2));
      expect(headquartersMissing(bot)).toEqual([]);
      expect(bot).not.toHaveProperty('lastId');
    });
  });

  describe('a warning after a week off the air (R138)', () => {
    it('for a channel, once, and again when it stops once more', () => {
      let s = station();
      const channel = s.channels[0]!;
      const manager = channel.managerId!;
      s.channels[0]!.managerId = null;
      const warnings = (x: GameState) => x.messages.filter((m) => /off the air for a week/.test(m.text));
      s = advance(s, OFF_AIR_WARNING.days - 1);
      expect(warnings(s)).toHaveLength(0);
      s = tick(s);
      expect(warnings(s).map((m) => m.text)).toEqual([`${channel.name} has been off the air for a week: no channel manager.`]);
      s = advance(s, OFF_AIR_WARNING.days);
      expect(warnings(s)).toHaveLength(1);
      // On the air again, it is forgotten; off again, it is told again.
      s = ok(setChannelManager(s, channel.id, manager));
      s = tick(s);
      expect(s.offAir[channel.id]).toBeUndefined();
      s.channels[0]!.managerId = null;
      s = advance(s, OFF_AIR_WARNING.days);
      expect(warnings(s)).toHaveLength(2);
    });

    it('for a show on the schedule that does not go out', () => {
      let s = station();
      const show = s.shows.find((x) => x.hostId)!;
      show.hostId = null;
      s = advance(s, OFF_AIR_WARNING.days);
      expect(s.messages.filter((m) => m.text.includes(`“${show.name}” has not gone out for a week: no host.`))).toHaveLength(1);
    });
  });
});
