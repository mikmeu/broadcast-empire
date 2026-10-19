import { describe, expect, it } from 'vitest';
import { ELECTIONS } from '../config/events';
import { getArticle, stringsOf } from '../wiki/articles';
import type { Block } from '../wiki/types';
import { toCalendarDate, toDay } from './calendar';
import { electionOn, runEvents } from './events';
import { createInitialState } from './newGame';
import { campaignStart, catchUpElections, governmentFalls, holdElection, monthsAfter, regularElection } from './politics';
import { Rng } from './rng';
import { fromSaveFile, SAVE_VERSION, toSaveFile } from './save';
import type { GameState } from './state';

/** A new game with its elections held up to a day. */
function worldOn(seed: number, day: number): GameState {
  const s = { ...createInitialState(seed), day };
  catchUpElections(s);
  return s;
}

/** The first seed whose world has a snap election before 2000. */
function seedWithSnap(): number {
  for (let seed = 1; ; seed++) if (worldOn(seed, toDay(2000, 1, 1)).politics.history.some((e) => e.snap)) return seed;
}

describe('version 0.18.0', () => {
  describe('elections with people in them (R76)', () => {
    it('starts a game with a president in their first term, elected in 1967, and an election in June 1971', () => {
      const { politics } = createInitialState(1);
      expect(politics.president.terms).toBe(1);
      expect(politics.president.name).not.toBe(politics.vicePresident.name);
      expect(politics.history).toEqual([{ day: toDay(1967, 6, 1), president: politics.president.name, vicePresident: politics.vicePresident.name, snap: false }]);
      expect(politics.nextElection).toBe(toDay(1971, 6, 1));
      expect(politics.snap).toBe(false);
    });

    it('gives a seed the same presidents every time, and other seeds others', () => {
      const day = toDay(2010, 1, 1);
      expect(worldOn(5, day).politics).toEqual(worldOn(5, day).politics);
      const firsts = new Set([1, 2, 3, 4, 5, 6].map((seed) => worldOn(seed, day).politics.history.map((e) => e.president).join()));
      expect(firsts.size).toBeGreaterThan(1);
    });

    it('never names a politician after someone in the game, or after an earlier one', () => {
      const s = worldOn(3, toDay(2040, 1, 1));
      const people = new Set([...s.candidates.map((c) => c.name), ...s.rivals.flatMap((r) => r.channels.flatMap((c) => c.schedule.map((show) => show.hostName)))]);
      const names = s.politics.history.flatMap((e) => [e.president, e.vicePresident]);
      for (const name of names) expect(people.has(name)).toBe(false);
      // A vice-president who becomes president keeps their name; nobody else comes back.
      const firstSeen = new Map<string, number>();
      s.politics.history.forEach((e, n) => {
        for (const name of [e.president, e.vicePresident]) if (!firstSeen.has(name)) firstSeen.set(name, n);
      });
      expect(firstSeen.size).toBeGreaterThan(s.politics.history.length);
    });

    it('lets nobody serve a third term', () => {
      let thirds = 0;
      let seconds = 0;
      let vicePresidents = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const { history } = worldOn(seed, toDay(2100, 1, 1)).politics;
        for (let n = 2; n < history.length; n++) if (history[n]!.president === history[n - 1]!.president && history[n]!.president === history[n - 2]!.president) thirds++;
        for (let n = 1; n < history.length; n++) {
          if (history[n]!.president === history[n - 1]!.president) seconds++;
          if (history[n]!.president === history[n - 1]!.vicePresident) vicePresidents++;
        }
      }
      expect(thirds).toBe(0);
      expect(seconds).toBeGreaterThan(0);
      expect(vicePresidents).toBeGreaterThan(0);
    });

    it('holds a snap election now and then, and counts the four years from it', () => {
      let elections = 0;
      let snaps = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const { history } = worldOn(seed, toDay(2100, 1, 1)).politics;
        history.slice(1).forEach((e, n) => {
          const before = history[n]!.day;
          const months = Math.round((e.day - before) / 30.44);
          if (e.snap) expect(months).toBeLessThan(ELECTIONS.every * 12);
          else expect(e.day).toBe(monthsAfter(before, ELECTIONS.every * 12));
        });
        elections += history.length - 1;
        snaps += history.filter((e) => e.snap).length;
      }
      // About one term in five is cut short.
      expect(snaps / elections).toBeGreaterThan(0.1);
      expect(snaps / elections).toBeLessThan(0.3);
    });

    it('announces a snap election in the news two months ahead, with the campaign the month before it', () => {
      const seed = seedWithSnap();
      const draft = createInitialState(seed);
      const rng = new Rng(1);
      let announced: { day: number; polling: number } | null = null;
      while (!announced) {
        draft.day++;
        const falls = governmentFalls(draft.politics);
        runEvents(draft, rng);
        if (falls === draft.day) announced = { day: draft.day, polling: draft.politics.nextElection };
      }
      expect(announced.polling).toBe(monthsAfter(announced.day, ELECTIONS.noticeMonths));
      expect(draft.headlines.at(-1)!.text).toMatch(/falls: a snap election is called/);
      const message = draft.messages.at(-1)!;
      expect(message.text).toMatch(/snap election on/);
      expect(message.topic).toBe('event');
      expect(electionOn(draft)).toBe(false);
      expect(electionOn({ ...draft, day: campaignStart(draft.politics) })).toBe(true);

      // Polling day names the winners, and the next election is four years on unless it falls again.
      while (draft.day < announced.polling) {
        draft.day++;
        runEvents(draft, rng);
      }
      const { president, vicePresident } = draft.politics;
      expect(draft.headlines.at(-1)!.text).toContain(`Election day: `);
      expect(draft.headlines.at(-1)!.text).toContain(president.name);
      expect(draft.headlines.at(-1)!.text).toContain(`with ${vicePresident.name} as vice-president`);
      expect(draft.politics.history.at(-1)).toMatchObject({ day: announced.polling, snap: true });
      expect(regularElection(draft.politics)).toBe(monthsAfter(announced.polling, ELECTIONS.every * 12));
    });

    it('draws nothing from the main stream of the game', () => {
      const draft = createInitialState(1);
      draft.day = draft.politics.nextElection;
      const before = draft.rngState;
      holdElection(draft);
      expect(draft.rngState).toBe(before);
    });
  });

  describe('a save from 0.17.0', () => {
    it('loads with the elections the seed would have had, held up to its day', () => {
      const day = toDay(1993, 3, 12);
      const s = { ...createInitialState(11), day };
      const save = JSON.parse(JSON.stringify(toSaveFile(s, 0)));
      delete save.state.politics;
      const { state, version } = fromSaveFile({ ...save, version: 32 });
      expect(version).toBe(SAVE_VERSION);
      expect(SAVE_VERSION).toBe(33);
      expect(state.politics).toEqual(worldOn(11, day).politics);
      expect(state.politics.history[0]!.day).toBe(toDay(1967, 6, 1));
      expect(toCalendarDate(state.politics.history[1]!.day).year).toBe(1971);
      for (const e of state.politics.history) expect(e.day).toBeLessThanOrEqual(day);
      expect(state.politics.nextElection).toBeGreaterThan(day);
    });
  });

  describe('the wiki', () => {
    const block = () =>
      getArticle('history')
        .sections.find((s) => s.heading === 'Elections')!
        .body.find((b): b is Extract<Block, { asOf: unknown }> => typeof b !== 'string' && 'asOf' in b)!;
    const shown = (game: GameState | null) => block().asOf(game?.day ?? null, game).flatMap(stringsOf).join(' ');

    it('names who is in office in the game that is open, and nobody elected later', () => {
      const then = worldOn(2, toDay(1985, 1, 1));
      const later = worldOn(2, toDay(2030, 1, 1));
      const text = shown(then);
      expect(text).toContain(then.politics.president.name);
      expect(text).toContain(then.politics.vicePresident.name);
      for (const e of then.politics.history) expect(text).toContain(e.president);
      const inOffice = [then.politics.president.name, then.politics.vicePresident.name];
      const newcomers = later.politics.history.slice(then.politics.history.length).flatMap((e) => [e.president, e.vicePresident]).filter((name) => !inOffice.includes(name));
      expect(newcomers.length).toBeGreaterThan(0);
      for (const name of newcomers) expect(text).not.toContain(name);
    });

    it('gives the date of the next regular election, and a snap one only once it is announced', () => {
      const seed = seedWithSnap();
      let s = worldOn(seed, 0);
      while (!s.politics.snap) s = worldOn(seed, s.politics.nextElection);
      const falls = governmentFalls(s.politics)!;
      const regular = regularElection(s.politics);
      const before = shown({ ...s, day: falls - 1 });
      expect(before).toMatch(/Next election/);
      expect(before).toContain(String(toCalendarDate(regular).year));
      expect(before).not.toMatch(/Snap election:/);
      expect(shown({ ...s, day: falls })).toMatch(/Snap election:/);
    });

    it('reads as at the start before a game is open, with no names', () => {
      const text = shown(null);
      expect(text).toContain(String(ELECTIONS.startElected));
      expect(text).not.toContain(createInitialState(1).politics.president.name);
    });
  });
});
