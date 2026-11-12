import { describe, expect, it } from 'vitest';
import { LINES } from '../config/guide';
import { ARTICLES, stringsOf } from '../wiki/articles';
import { growthBot, type Bot } from './bots';
import { acknowledge, guideView, setGuide } from './guide';
import { createInitialState } from './newGame';
import { slow } from './slow';
import type { GameState } from './state';
import { tick } from './tick';

const play = (bot: Bot, seed: number, days: number, start: Partial<GameState> = {}) => {
  let s: GameState = { ...createInitialState(seed), ...start };
  for (let day = 0; day < days && !s.bankrupt; day++) s = tick(bot(s));
  return s;
};

/** Everything the game has to say to a player in words that can be checked: Penny's lines and the wiki. */
const words = () => [...LINES.flatMap((line) => [line.title ?? '', line.say, ...(line.how ?? []), line.when ?? '']), JSON.stringify(ARTICLES)].join('\n');

describe('Penny, the test bot and the wiki (Phase 13g)', () => {
  describe('Penny and the wiki', () => {
    it('say nothing about renting rooms, lettered rooms or buttons that are gone', () => {
      const text = words();
      for (const gone of [/Buy what’s missing/i, /Put one in/i, /\brent (a|the|another) room/i, /\brooms? [A-U]\b/, /\bto rent on\b/i, /\bPiece\b list/]) expect(text).not.toMatch(gone);
      // What took their place is there.
      for (const there of [/“Room”/, /Propose a place/, /Furnishing tray/, /in front of (a|the) door/, /CEO’s office/, /place of their \*\*own\*\*|place of their own/]) expect(text).toMatch(there);
    });

    it('Penny points out who sits where once there is a second office', () => {
      const line = LINES.find((l) => l.id === 'places')!;
      expect(line.say).toMatch(/place of their own/);
      // A company that is past the first weeks and has heard every other hint.
      let s = setGuide(play(growthBot, 1, 200), true);
      s = { ...s, guide: { ...s.guide, stage: 'on', quiet: 0, seen: [...LINES.map((l) => l.id).filter((id) => id !== 'places'), 'television-later'] } };
      const offices = s.rooms.filter((r) => r.type === 'office');
      const one: GameState = { ...s, rooms: s.rooms.filter((r) => r.type !== 'office' || r === offices[0]) };
      expect(guideView(one)).toBeNull();
      const two: GameState = offices.length > 1 ? s : { ...s, rooms: [...s.rooms, { ...offices[0]!, roomId: 'second', name: 'Office 2', floor: 3, furniture: [] }] };
      expect(guideView(two)).toMatchObject({ kind: 'hint', line: { id: 'places' } });
      expect(guideView(acknowledge(two, 'places'))).toBeNull();
    }, slow(120_000));
  });
});

// From version011.
{
  /** Everything Penny shows and says, and every article as it reads before a game is open. */
  const words = () =>
    [...LINES.flatMap((line) => [line.title ?? '', line.say, ...(line.how ?? []), line.when ?? '']), ...ARTICLES.flatMap((a) => a.sections.flatMap((s) => s.body.flatMap(stringsOf)))].join('\n');

  describe('version 0.11.0', () => {
    describe('the words of this version', () => {
      it('say nothing about buttons and pages that are gone, nor a seat for everyone in the canteen (R77, R80, R81, R82)', () => {
        const text = words();
        for (const gone of [/buttons? above the office/i, /“Furniture catalog” above/, /go to Shows/, /Shows page/, /Schedule tab/, /seat for everyone/i, /Canteen seats/]) expect(text).not.toMatch(gone);
        // Since 0.16.0 the window of the furniture was called Rooms; since 0.21.0 it is Catalog, a button in the bar.
        for (const there of [/“Schedule” on/, /“\+ Radio show”/, /Furnishing tray opens at the bottom/, /serves/]) expect(text).toMatch(there);
        expect(text).not.toMatch(/“Furniture” in the menu/);
        expect(text).not.toMatch(/“Rooms” in the menu/);
      });
    });
  });
}
