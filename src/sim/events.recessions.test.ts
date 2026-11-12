import { describe, expect, it } from 'vitest';
import { RECESSIONS } from '../config/events';
import { LINES } from '../config/guide';
import { ARTICLES, getArticle, stringsOf } from '../wiki/articles';
import type { Block } from '../wiki/types';
import { toDay } from './calendar';
import { runEvents } from './events';
import { createInitialState } from './newGame';
import { Rng } from './rng';

/** Everything Penny shows and says, and every article as it reads before a game is open. */
const words = () =>
  [...LINES.flatMap((line) => [line.title ?? '', line.say, ...(line.how ?? []), line.when ?? '']), ...ARTICLES.flatMap((a) => a.sections.flatMap((s) => s.body.flatMap(stringsOf)))].join('\n');

/** The blocks of an article's section that are written from the game that is open. */
const asOfBlocks = (id: Parameters<typeof getArticle>[0], heading: string) =>
  getArticle(id).sections.find((s) => s.heading === heading)!.body.filter((b): b is Extract<Block, { asOf: unknown }> => typeof b !== 'string' && 'asOf' in b);

describe('version 0.11.0', () => {
  describe('no recessions known in advance (R72)', () => {
    it('lists only the recessions that have happened in the game that is open', () => {
      const [table] = asOfBlocks('history', 'Recessions');
      expect(table).toBeDefined();
      const shown = (day: number | null) => table!.asOf(day, null).flatMap(stringsOf).join(' ');
      // Before a game is open, and in its first year, there is none to show.
      for (const day of [null, 0]) for (const r of RECESSIONS) expect(shown(day)).not.toContain(r.name);
      const in1982 = shown(toDay(1982, 6, 1));
      expect(in1982).toContain(RECESSIONS[0]!.name);
      expect(in1982).toContain(RECESSIONS[1]!.name);
      for (const r of RECESSIONS.slice(2)) expect(in1982).not.toContain(r.name);
      // Search does not give them away either.
      expect(words()).not.toContain(RECESSIONS[2]!.name);
    });

    it('still names World Cups, Olympics and elections ahead, as a calendar would', () => {
      const text = getArticle('history').sections.flatMap((s) => s.body.flatMap(stringsOf)).join(' ');
      expect(text).toMatch(/World Cup/);
      expect(text).toMatch(/general election every/);
    });

    it('has the news warn of a recession a month before it begins', () => {
      const first = RECESSIONS[0]!.year;
      const draft = createInitialState(1);
      draft.day = toDay(first - 1, 12, 1);
      runEvents(draft, new Rng(1));
      expect(draft.messages.some((m) => /recession from January/.test(m.text))).toBe(true);
      expect(draft.headlines.some((h) => /Economists warn of a recession/.test(h.text))).toBe(true);
      // A month without one coming says nothing.
      const quiet = createInitialState(1);
      quiet.day = toDay(first - 2, 12, 1);
      runEvents(quiet, new Rng(1));
      expect(quiet.messages.some((m) => /recession/.test(m.text))).toBe(false);
    });
  });
});
