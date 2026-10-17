import { describe, expect, it } from 'vitest';
import { PRESTIGE, POACH } from '../config/balance';
import { RECESSIONS } from '../config/events';
import { LINES } from '../config/guide';
import { ARTICLES, getArticle, stringsOf } from '../wiki/articles';
import type { Block } from '../wiki/types';
import { toDay } from './calendar';
import { hostAsking, prestigePull, salaryFor } from './economy';
import { runEvents } from './events';
import { generateCandidates } from './generate';
import { createInitialState } from './newGame';
import { rivalPoachAttempt } from './poaching';
import { Rng } from './rng';
import type { GameState } from './state';

/** Everything Penny shows and says, and every article as it reads before a game is open. */
const words = () =>
  [...LINES.flatMap((line) => [line.title ?? '', line.say, ...(line.how ?? []), line.when ?? '']), ...ARTICLES.flatMap((a) => a.sections.flatMap((s) => s.body.flatMap(stringsOf)))].join('\n');

/** The blocks of an article's section that are written from the game that is open. */
const asOfBlocks = (id: Parameters<typeof getArticle>[0], heading: string) =>
  getArticle(id).sections.find((s) => s.heading === heading)!.body.filter((b): b is Extract<Block, { asOf: unknown }> => typeof b !== 'string' && 'asOf' in b);

describe('version 0.11.0', () => {
  describe('what prestige does (R73)', () => {
    it('draws hosts in proportion, up to its full size', () => {
      const at = (prestige: number) => prestigePull({ prestige });
      expect(at(0)).toBe(0);
      expect(at(PRESTIGE.full / 2)).toBeCloseTo(0.5, 9);
      expect(at(PRESTIGE.full)).toBe(1);
      expect(at(PRESTIGE.full * 3)).toBe(1);
    });

    it('makes hosts in the hiring pool ask less, and nobody else', () => {
      expect(hostAsking({ prestige: 0, difficulty: 'normal' }, 60, 20)).toBe(salaryFor('host', 60, 20, { difficulty: 'normal' }));
      expect(hostAsking({ prestige: PRESTIGE.full, difficulty: 'normal' }, 60, 20)).toBeCloseTo(salaryFor('host', 60, 20, { difficulty: 'normal' }) * (1 - PRESTIGE.hostDiscount), -2);
      const pool = (prestige: number) => {
        const s: GameState = { ...createInitialState(4), prestige };
        return generateCandidates(s, new Rng(9), 1975);
      };
      const [plain, famous] = [pool(0), pool(PRESTIGE.full)];
      plain.forEach((person, n) => {
        const other = famous[n]!;
        expect(other.skill).toBe(person.skill);
        if (person.role === 'host') expect(other.salary).toBeLessThan(person.salary);
        else expect(other.salary).toBe(person.salary);
      });
    });

    it('has rivals court your hosts less often', () => {
      const offers = (prestige: number) => {
        let count = 0;
        for (let seed = 1; seed <= 400; seed++) {
          const s = createInitialState(seed);
          const host = { ...s.candidates.find((c) => c.role === 'host')!, fame: POACH.minFame + 10, salary: 600, hiredOn: 0, morale: 70, deskId: null } as unknown as GameState['employees'][number];
          const draft: GameState = { ...s, prestige, employees: [host], poachOffers: [] };
          rivalPoachAttempt(draft, new Rng(seed));
          count += draft.poachOffers.length;
        }
        return count;
      };
      const [none, full] = [offers(0), offers(PRESTIGE.full)];
      expect(none).toBeGreaterThan(20);
      expect(full).toBeLessThan(none * (1 - PRESTIGE.poachCut / 2));
    });

    it('is explained in the wiki, with what it does', () => {
      const article = getArticle('prestige');
      const text = article.sections.flatMap((s) => [s.heading ?? '', ...s.body.flatMap(stringsOf)]).join(' ');
      expect(text).toMatch(/What prestige does/);
      expect(text).toMatch(/court your hosts less often/);
      expect(text).toMatch(/ask less/);
    });
  });

  describe('no recessions known in advance (R72)', () => {
    it('lists only the recessions that have happened in the game that is open', () => {
      const [table] = asOfBlocks('history', 'Recessions');
      expect(table).toBeDefined();
      const shown = (day: number | null) => table!.asOf(day).flatMap(stringsOf).join(' ');
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

  describe('the words of this version', () => {
    it('say nothing about buttons and pages that are gone, nor a seat for everyone in the canteen (R77, R80, R81, R82)', () => {
      const text = words();
      for (const gone of [/buttons? above the office/i, /“Furniture catalog” above/, /go to Shows/, /Shows page/, /Schedule tab/, /seat for everyone/i, /Canteen seats/]) expect(text).not.toMatch(gone);
      // Since 0.16.0 the window of the furniture is called Rooms.
      for (const there of [/“Schedule” on/, /“\+ Radio show”/, /“Rooms” in the menu/, /serves/]) expect(text).toMatch(there);
      expect(text).not.toMatch(/“Furniture” in the menu/);
    });
  });
});
