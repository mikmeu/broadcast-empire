import { describe, expect, it } from 'vitest';
import { LINES } from '../config/guide';
import { TO_RECORD } from '../config/voiceOver';
import type { ActionResult } from './actions';
import { sensibleBot } from './bots';
import { simulateDay } from './broadcast';
import { setUpMasterControl, withoutRecordRooms } from './fixtures';
import { guideView } from './guide';
import { createInitialState } from './newGame';
import type { GameState } from './state';
import { advance } from './tick';
import { unlockAll } from './unlocks';
import { ARTICLES } from '../wiki/articles';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}

/** A radio station from the sensible test player, a month on the air, with everything open and money to spare. */
const station = (days = 30): GameState => {
  // Without the library and post room the bot keeps its records in (0.18.0): the tests below build rooms where the game proposes them.
  const s = structuredClone(withoutRecordRooms(unlockAll(advance(sensibleBot(createInitialState(1)), days))));
  s.money = 3_000_000;
  s.floorsUnlocked = 2;
  return s;
};

describe('version 0.13.0', () => {
  describe('a test player that grows the way the wiki says (R102)', () => {
    it('your own channels share the audience: a second channel like the first takes from it', () => {
      const s = station();
      const alone = simulateDay(s).channels.find((c) => c.isPlayer)!;
      // Every channel after the first goes out through a master control room (0.16.0).
      const twin = structuredClone(ok(setUpMasterControl(s)));
      twin.channels.push({ ...structuredClone(s.channels[0]!), id: 'twin', name: 'Twin FM' });
      for (const license of s.licenses) twin.licenses.push({ ...license, id: `${license.id}-twin`, channelId: 'twin' });
      const both = simulateDay(twin).channels.filter((c) => c.isPlayer);
      const total = (c: { slots: { listeners: number }[] }) => c.slots.reduce((sum, x) => sum + x.listeners, 0);
      expect(total(both.find((c) => c.channelId === s.channels[0]!.id)!)).toBeLessThan(total(alone));
      expect(total(both[0]!) + total(both[1]!)).toBeLessThan(2 * total(alone));
    });

    // (The second station for other audiences, over three games, is a long test now: bots.secondStation.long.test.ts.)

    it('the wiki has an article on growing, and Penny brings up audiences once the first weeks are over', () => {
      expect(ARTICLES.some((a) => a.id === 'market-leader')).toBe(true);
      const s = { ...station(130), guide: { stage: 'on' as const, quiet: 0, seen: [...LINES.map((l) => l.id).filter((id) => id !== 'audiences'), 'television-later'] } };
      expect(guideView(s)).toMatchObject({ kind: 'hint', line: { id: 'audiences' } });
      for (const id of ['audiences', 'titles-low', 'stale-titles']) expect(TO_RECORD[id]).toBeUndefined();
    });
  });
});
