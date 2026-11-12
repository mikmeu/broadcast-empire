import { describe, expect, it } from 'vitest';
import { AWARDS } from '../config/balance';
import { getGenre } from '../config/genres';
import { HINTS, STEPS, TV_STEPS } from '../config/guide';
import { MILESTONE_LIST } from '../config/milestones';
import { AWARD_CATEGORIES, isAwardsYear, nextAwardsYear, resolveRaises, runAwards } from './awards';
import { guideView } from './guide';
import { checkMilestones, hasMilestone } from './milestones';
import { getArticle, stringsOf } from '../wiki/articles';
import { declineRaise, grantRaise, type ActionResult } from './actions';
import { sensibleBot } from './bots';
import { toCalendarDate, toDay } from './calendar';
import { salaryFor } from './economy';
import { createInitialState } from './newGame';
import { Rng } from './rng';
import { fromSaveFile, SAVE_VERSION, toSaveFile } from './save';
import { removeEmployee } from './staff';
import { PLAYER, waitingFor, type GameState } from './state';
import { advance, tick } from './tick';
import { unlockAll } from './unlocks';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}
const error = (result: ActionResult) => (result.ok ? '' : result.error);

/** A radio station from the sensible test player, a month on the air, with everything open, money to spare and two floors. */
const station = (days = 30): GameState => {
  const s = structuredClone(unlockAll(advance(sensibleBot(createInitialState(1)), days)));
  s.money = 5_000_000;
  s.floorsUnlocked = 2;
  return s;
};

describe('version 0.18.0', () => {
  describe('radio and TV awards (R121)', () => {
    /** The radio station on a day, with the ratings of its first month on file. */
    const onDay = (day: number): GameState => ({ ...station(), day });
    /** Runs the awards of the 1st of a month on a copy, with a seed. */
    const awardsOn = (state: GameState, seed = 7): GameState => {
      const draft = structuredClone(state);
      runAwards(draft, new Rng(seed));
      return draft;
    };
    const nominated = () => awardsOn(onDay(toDay(1976, 10, 1)));
    /** The player's best host up for best radio host on their own, so that they win on the night. */
    const playerHostAlone = (): GameState & { hostId: string } => {
      const s = nominated();
      const nominee = s.awards.nominations!.find((n) => n.category === 'radioHost' && n.ownerId === PLAYER) ?? s.awards.nominations!.find((n) => n.category === 'radioHost')!;
      const host = s.employees.find((e) => e.role === 'host')!;
      const show = s.shows.find((x) => x.hostId === host.id)!;
      const channel = s.channels.find((c) => c.schedule.includes(show.id))!;
      s.awards.nominations = [{ ...nominee, ownerId: PLAYER, channelId: channel.id, channelName: channel.name, showId: show.id, showName: show.name, hostId: host.id, hostName: host.name }];
      return Object.assign(s, { day: toDay(1976, 11, 1), hostId: host.id });
    };

    it('is held every two years from 1972', () => {
      expect([1970, 1971, 1972, 1973, 1974, 1975, 1976, 1979, 1980, 2030].filter(isAwardsYear)).toEqual([1972, 1974, 1976, 1980, 2030]);
      expect(nextAwardsYear(toDay(1970, 1, 1))).toBe(1972);
      expect(nextAwardsYear(toDay(1976, 10, 15))).toBe(1976);
      expect(nextAwardsYear(toDay(1976, 11, 1))).toBe(1978);
    });

    it('names the nominees on 1 October, the best four of each award at most, from the player and the rivals', () => {
      const s = nominated();
      const nominees = s.awards.nominations!;
      for (const category of AWARD_CATEGORIES) {
        const up = nominees.filter((n) => n.category === category);
        expect(up.length, category).toBeLessThanOrEqual(AWARDS.nominees);
        expect(up.map((n) => n.score)).toEqual([...up.map((n) => n.score)].sort((a, b) => b - a));
      }
      expect(nominees.filter((n) => n.category === 'radioShow')).toHaveLength(AWARDS.nominees);
      expect(nominees.some((n) => n.ownerId !== PLAYER)).toBe(true);
      expect(nominees.filter((n) => n.category.endsWith('Host')).every((n) => n.hostName)).toBe(true);
      expect(s.headlines.at(-1)!.text).toMatch(/nominations for the 1976 Media Times Awards/);
    });

    it('holds nothing in the years between, nor in other months', () => {
      for (const day of [toDay(1977, 10, 1), toDay(1977, 11, 1), toDay(1976, 9, 1), toDay(1976, 12, 1)]) {
        const s = onDay(day);
        expect(awardsOn(s).awards).toEqual(s.awards);
      }
    });

    it('never nominates a licensed title, only what a station makes itself', () => {
      const s = nominated();
      const rivalShows = s.rivals.flatMap((r) => r.channels.flatMap((c) => c.schedule.map((show) => ({ channelId: c.id, show }))));
      for (const n of s.awards.nominations!) {
        const genre =
          n.ownerId === PLAYER ? s.shows.find((x) => x.id === n.showId)!.genre : rivalShows.find((x) => x.channelId === n.channelId && x.show.name === n.showName)!.show.genre;
        expect(getGenre(genre).kind, n.showName).toBe('produced');
      }
    });

    it('gives the player prestige for a nomination and their host fame', () => {
      const before = onDay(toDay(1976, 10, 1));
      // A field with only the player's channel in it: everything up is theirs.
      before.rivals = [];
      const after = awardsOn(before);
      const ours = after.awards.nominations!;
      expect(ours.length).toBeGreaterThan(0);
      expect(after.prestige - before.prestige).toBe(ours.length * AWARDS.prestige.nomination);
      for (const n of ours.filter((x) => x.hostId)) {
        const was = before.employees.find((e) => e.id === n.hostId)!.fame;
        expect(after.employees.find((e) => e.id === n.hostId)!.fame).toBeCloseTo(Math.min(100, was + AWARDS.fame.nomination));
      }
      expect(after.messages.at(-1)!.about).toBe('milestones');
    });

    it('names the winners on 1 November: prestige, fame, reputation and morale for a win of the player’s, and a raise to ask for', () => {
      const before = playerHostAlone();
      const host = () => before.employees.find((e) => e.id === before.hostId)!;
      host().salary = 500;
      host().morale = 50;
      const after = awardsOn(before);
      const winner = after.employees.find((e) => e.id === before.hostId)!;
      expect(after.awards.nominations).toBeNull();
      expect(after.awards.past).toHaveLength(1);
      expect(after.awards.past[0]!.nominees[0]!.won).toBe(true);
      expect(after.prestige - before.prestige).toBe(AWARDS.prestige.win);
      expect(winner.fame).toBeCloseTo(Math.min(100, host().fame + AWARDS.fame.win));
      expect(winner.morale).toBe(50 + AWARDS.morale);
      const channel = after.channels.find((c) => c.id === before.awards.nominations![0]!.channelId)!;
      const was = before.channels.find((c) => c.id === channel.id)!;
      for (const [region, rep] of Object.entries(channel.reputation)) expect(rep).toBeCloseTo(Math.min(1.5, was.reputation[region as keyof typeof was.reputation]! + AWARDS.reputation));
      // The raise is asked for, not given.
      expect(winner.salary).toBe(500);
      expect(after.awards.raises).toEqual([expect.objectContaining({ hostId: winner.id, salary: salaryFor('host', winner.skill, winner.fame, after), expiresOn: after.day + AWARDS.answerDays })]);
      expect(waitingFor(after)).toContain('staff');
      expect(after.messages.some((m) => m.topic === 'event' && m.about === 'milestones' && /You won best radio host/.test(m.text))).toBe(true);
    });

    it('lets the player pay the winner what they ask, or say no at a cost to their morale', () => {
      const won = awardsOn(playerHostAlone());
      const request = won.awards.raises[0]!;
      const paid = ok(grantRaise(won, request.id));
      expect(paid.employees.find((e) => e.id === request.hostId)!.salary).toBe(request.salary);
      expect(paid.awards.raises).toEqual([]);

      const morale = won.employees.find((e) => e.id === request.hostId)!.morale;
      const refused = ok(declineRaise(won, request.id));
      expect(refused.employees.find((e) => e.id === request.hostId)!.morale).toBe(Math.max(0, morale - AWARDS.refusedMorale));
      expect(refused.employees.find((e) => e.id === request.hostId)!.salary).toBe(won.employees.find((e) => e.id === request.hostId)!.salary);
      expect(error(grantRaise(refused, request.id))).toMatch(/no longer open/);

      // Left unanswered, it counts as a no.
      const late = { ...structuredClone(won), day: request.expiresOn };
      resolveRaises(late);
      expect(late.awards.raises).toEqual([]);
      expect(late.employees.find((e) => e.id === request.hostId)!.morale).toBe(Math.max(0, morale - AWARDS.refusedMorale));
    });

    it('makes a rival’s winning host more famous', () => {
      const s = nominated();
      const nominee = s.awards.nominations!.find((n) => n.category === 'radioHost' && n.ownerId !== PLAYER)!;
      s.awards.nominations = [nominee];
      const show = () => s.rivals.flatMap((r) => r.channels).find((c) => c.id === nominee.channelId)!.schedule.find((x) => x.name === nominee.showName)!;
      const fame = show().hostFame;
      const after = awardsOn({ ...s, day: toDay(1976, 11, 1) });
      const shown = after.rivals.flatMap((r) => r.channels).find((c) => c.id === nominee.channelId)!.schedule.find((x) => x.name === nominee.showName)!;
      expect(shown.hostFame).toBe(Math.min(100, fame + AWARDS.fame.win));
      expect(after.prestige).toBe(s.prestige);
    });

    it('is the same under the same seed', () => {
      const s = { ...nominated(), day: toDay(1976, 11, 1) };
      expect(awardsOn(s, 3).awards).toEqual(awardsOn(s, 3).awards);
    });

    it('runs in the game itself: the nominations on 1 October, the winners on 1 November', () => {
      let s = onDay(toDay(1976, 9, 30));
      s = tick(s);
      expect(s.awards.nominations).not.toBeNull();
      s = advance(s, 31);
      expect(toCalendarDate(s.day)).toMatchObject({ month: 11, dayOfMonth: 1 });
      expect(s.awards.nominations).toBeNull();
      expect(s.awards.past[0]!.year).toBe(1976);
      expect(AWARD_CATEGORIES.filter((c) => s.awards.past[0]!.nominees.some((n) => n.category === c)).every((c) => s.awards.past[0]!.nominees.filter((n) => n.category === c && n.won).length === 1)).toBe(true);
    });

    it('still holds the night of a game saved in the old rhythm, with nominations out in a year without awards', () => {
      const s = { ...nominated(), day: toDay(1977, 11, 1) };
      const after = awardsOn(s);
      expect(after.awards.nominations).toBeNull();
      expect(after.awards.past[0]!.year).toBe(1977);
    });

    it('is a milestone the first time the player wins, and award prestige does not count as an event of their own', () => {
      expect(MILESTONE_LIST).toHaveLength(33);
      const won = awardsOn(playerHostAlone());
      won.prestige = Math.max(won.prestige, 1);
      checkMilestones(won);
      expect(hasMilestone(won, 'awardWinner')).toBe(true);
      expect(hasMilestone(won, 'firstEvent')).toBe(false);
    });

    it('has Penny point at the Milestones window the first time the player is nominated', () => {
      const s = nominated();
      // Every other line of hers has been said.
      s.guide = { stage: 'on', seen: [...STEPS, ...TV_STEPS, ...HINTS].map((line) => line.id).filter((id) => id !== 'awards'), quiet: 0 };
      s.awards.nominations = s.awards.nominations!.map((n, i) => (i === 0 ? { ...n, ownerId: PLAYER } : n));
      expect(guideView(s)).toMatchObject({ kind: 'hint', line: { id: 'awards', to: 'milestones', wiki: 'awards' } });
      s.awards.nominations = s.awards.nominations!.map((n) => ({ ...n, ownerId: 'r-somebody' }));
      expect(guideView(s)?.line.id).not.toBe('awards');
    });

    it('takes a host who leaves off the raises', () => {
      const won = awardsOn(playerHostAlone());
      const gone = structuredClone(won);
      removeEmployee(gone, won.awards.raises[0]!.hostId);
      expect(gone.awards.raises).toEqual([]);
    });

    it('loads an older save with no awards held yet', () => {
      const s = station();
      const old = JSON.parse(JSON.stringify(toSaveFile(s, 0)));
      delete old.state.awards;
      const { state, version } = fromSaveFile({ ...old, version: 39 });
      expect(version).toBe(SAVE_VERSION);
      expect(SAVE_VERSION).toBeGreaterThanOrEqual(41);
      expect(state.awards).toEqual({ nominations: null, past: [], raises: [] });
    });

    it('has a wiki article with the figures from the game', () => {
      const text = getArticle('awards').sections.flatMap((section) => section.body.flatMap(stringsOf)).join(' ');
      for (const figure of [AWARDS.everyYears, AWARDS.firstYear, AWARDS.nominees, AWARDS.prestige.nomination, AWARDS.prestige.win, AWARDS.fame.win, AWARDS.refusedMorale, AWARDS.answerDays]) {
        expect(text).toContain(String(figure));
      }
      for (const id of ['prestige', 'hosts', 'rivals'] as const) expect(getArticle(id).sections.flatMap((section) => section.body.flatMap(stringsOf)).join(' ')).toContain('[[awards]]');
    });
  });
});
