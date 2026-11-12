import { describe, expect, it } from 'vitest';
import { BREAKING } from '../config/balance';
import { BREAKING_STORIES } from '../config/breakingNews';
import { getGenre } from '../config/genres';
import { SLOTS } from '../config/world';
import { breakIn } from './actions';
import { sensibleBot } from './bots';
import { simulateDay } from './broadcast';
import { breakInOn, breakRandomStory, eligibleStories, leadStory, runBreakingNews, startStory, storiesRunning } from './breakingNews';
import { breakInBlocker } from './breakingNewsBooking';
import { runCheat } from './cheats';
import { toDay } from './calendar';
import { eventAppeal, eventContext } from './events';
import { createInitialState } from './newGame';
import { Rng } from './rng';
import { fromSaveFile, SAVE_VERSION, toSaveFile } from './save';
import { trackContracts } from './sales';
import { advance } from './tick';
import type { GameState } from './state';
import { PLAYER } from './state';
import { unlockAll } from './unlocks';

const station = (): GameState => {
  const s = structuredClone(unlockAll(advance(sensibleBot(createInitialState(1)), 34)));
  // The days played may have brought a story of their own; these tests start with none.
  s.breakingNews = { stories: [], told: [], breakIns: [] };
  return s;
};

const story = { id: 'x', major: true, light: false, headline: 'Something happens.' };

/** The station's slots: one with its news show, one with another show. */
function slotsOf(s: GameState) {
  const channel = s.channels[0]!;
  const genreOf = (slot: number) => s.shows.find((x) => x.id === channel.schedule[slot])?.genre;
  const news = SLOTS.findIndex((_, i) => genreOf(i) === 'news');
  const other = SLOTS.findIndex((_, i) => genreOf(i) !== undefined && genreOf(i) !== 'news');
  return { channel, news, other };
}

/** Every story that broke in a number of days (the state keeps only recent ones), oldest first. */
function told(start: GameState, days: number): { id: string; day: number }[] {
  const seen = new Map<string, { id: string; day: number }>();
  let s = start;
  for (let i = 0; i < days && !s.bankrupt; i++) {
    s = advance(s, 1);
    for (const story of s.breakingNews.stories) seen.set(`${story.id}@${story.day}`, { id: story.id, day: story.day });
  }
  return [...seen.values()].sort((a, b) => a.day - b.day);
}

const slotListeners = (s: GameState, slot: number) => simulateDay(s).channels.find((c) => c.isPlayer)!.slots[slot]!;

describe('Breaking news (0.20.0, #21)', () => {
  describe('the stories', () => {
    it('come the same for the same seed, and leave the main stream of chance alone', () => {
      const a = told(sensibleBot(createInitialState(7)), 600);
      const b = told(sensibleBot(createInitialState(7)), 600);
      expect(a).toEqual(b);
      expect(a.length).toBeGreaterThan(0);
      // Breaking a story takes nothing from the main stream.
      const s = createInitialState(3);
      const rng = s.rngState;
      runBreakingNews(structuredClone(s));
      breakRandomStory(s);
      expect(s.rngState).toBe(rng);
    });

    it('come about five times a year, at least the gap apart', () => {
      // The calendar's own stories (a fall, polling day, a drama in a cup) come when they come.
      const days = told(sensibleBot(createInitialState(2)), 365 * 3).filter((x) => !['snap', 'polling', 'sports'].includes(x.id)).map((x) => x.day);
      expect(days.length).toBeGreaterThanOrEqual(4);
      for (let i = 1; i < days.length; i++) expect(days[i]! - days[i - 1]!).toBeGreaterThanOrEqual(BREAKING.gapDays);
    });

    it('never tell the story of a decade twice', () => {
      const s = createInitialState(5);
      const year = 1995;
      s.day = toDay(year, 3, 1);
      const eligible = eligibleStories(s, year);
      const first = eligible.find((x) => x.from !== undefined)!;
      s.breakingNews.told.push(first.id);
      expect(eligibleStories(s, year).some((x) => x.id === first.id)).toBe(false);
      // Stories of any time can come again, and stories of another decade cannot come now.
      expect(eligibleStories(s, year).some((x) => x.from === undefined)).toBe(true);
      expect(eligibleStories(s, 1972).every((x) => x.from === undefined || (x.from <= 1972 && x.to! >= 1972))).toBe(true);
    });

    it('give a famous person a name nobody else in the game has', () => {
      const s = station();
      const people = new Set([s.playerName, ...s.employees.map((e) => e.name), ...s.candidates.map((e) => e.name), s.politics.president.name]);
      for (let day = 0; day < 40; day++) {
        const draft = structuredClone(s);
        draft.day += day;
        const made = breakRandomStory(draft, new Rng(day + 1));
        const name = /^(?:The film world mourns )?(.+?)(?:,| the)/.exec(made?.headline ?? '')?.[1];
        if (made && (made.id === 'actorDies' || made.id === 'singerDies')) expect(people.has(name!)).toBe(false);
      }
      expect(BREAKING_STORIES.length).toBeGreaterThanOrEqual(45);
    });
  });

  describe('the lift', () => {
    it('lifts every news show, for as long as the story runs, and no other', () => {
      const s = station();
      startStory(s, story);
      expect(storiesRunning(s)).toHaveLength(1);
      const news = getGenre('tvNews');
      const context = eventContext(s);
      expect(eventAppeal(context, news, PLAYER)).toBe(BREAKING.majorLift);
      // A rival's news show gets it too; a music show does not.
      expect(eventAppeal(context, getGenre('news'), 'r1')).toBe(BREAKING.majorLift);
      expect(eventAppeal(context, getGenre('top40'), PLAYER)).toBe(1);
      const minor = station();
      startStory(minor, { ...story, major: false });
      expect(eventAppeal(eventContext(minor), news, PLAYER)).toBe(BREAKING.minorLift);
      const over = structuredClone(s);
      over.day += BREAKING.majorDays;
      expect(leadStory(over)).toBeNull();
      expect(eventAppeal(eventContext(over), news, PLAYER)).toBe(1);
    });

    it('draws more listeners to the news show of the station', () => {
      const s = station();
      const { news } = slotsOf(s);
      const plain = slotListeners(s, news).listeners;
      startStory(s, story);
      expect(slotListeners(s, news).listeners).toBeGreaterThan(plain);
    });
  });

  describe('breaking in', () => {
    const ready = () => {
      const s = station();
      startStory(s, story);
      return s;
    };

    it('is refused without a story, in a news slot, and twice for one story', () => {
      const s = station();
      const { channel, news, other } = slotsOf(s);
      expect(breakInBlocker(s, channel.id, other)).toMatch(/No story/);
      const r = ready();
      expect(breakInBlocker(r, channel.id, news)).toMatch(/news/i);
      expect(breakInBlocker(r, channel.id, other)).toBeNull();
      const done = breakIn(r, channel.id, other);
      expect(done.ok).toBe(true);
      if (done.ok) expect(breakInBlocker(done.state, channel.id, SLOTS.findIndex((_, i) => i !== news && i !== other && done.state.shows.some((x) => x.id === channel.schedule[i])))).toMatch(/already/);
    });

    it('is refused without a news show of your own on the air', () => {
      const r = ready();
      const { channel, news, other } = slotsOf(r);
      r.channels[0]!.schedule[news] = null as never;
      expect(breakInBlocker(r, channel.id, other)).toMatch(/news show of your own/);
      const result = breakIn(r, channel.id, other);
      expect(result.ok).toBe(false);
    });

    it('draws more listeners, loses ads and counts as a day missed for the sponsor', () => {
      const r = ready();
      const { channel, other } = slotsOf(r);
      const before = slotListeners(r, other);
      const done = breakIn(r, channel.id, other);
      if (!done.ok) throw new Error(done.error);
      const after = slotListeners(done.state, other);
      expect(breakInOn(done.state, channel.id, other)).toBeDefined();
      expect(after.listeners).toBeGreaterThan(before.listeners);
      // Revenue per listener falls to the share that stays.
      expect(after.revenue / after.listeners).toBeCloseTo((before.revenue / before.listeners) * BREAKING.adsKept, 4);
      // The sponsor hears nobody that day.
      const showId = after.showId!;
      const state = structuredClone(done.state);
      state.contracts.push({ id: 'c1', showId, sponsor: 'X', cpmMultiplier: 1, preferredAudience: null, minListeners: 1, endDay: state.day + 50, listenerSum: 0, daysRun: 0, penalty: 0 } as never);
      trackContracts(state, simulateDay(state));
      expect(state.contracts[0]!.listenerSum).toBe(0);
      expect(state.contracts[0]!.daysRun).toBe(1);
    });

    it('lifts the reputation of the channel when the day is played, and is forgotten after', () => {
      const r = ready();
      const { channel, other } = slotsOf(r);
      const done = breakIn(r, channel.id, other);
      if (!done.ok) throw new Error(done.error);
      const regions = done.state.licenses.filter((l) => l.channelId === channel.id).map((l) => l.regionId);
      const after = advance(done.state, 1);
      const rep = (s: GameState) => regions.reduce((sum, id) => sum + (s.channels[0]!.reputation[id] ?? 0), 0);
      const control = advance(r, 1);
      expect(rep(after)).toBeGreaterThan(rep(control));
      expect(advance(after, 3).breakingNews.breakIns).toHaveLength(0);
    });
  });

  describe('with the calendar', () => {
    it('breaks a story when the government falls and on polling day', () => {
      let s = station();
      s.politics.snap = true;
      const falls = toDay(2020, 1, 1);
      s.politics.nextElection = toDay(2020, 6, 1);
      s.day = falls - 2 - 0;
      s = structuredClone(s);
      for (let i = 0; i < 400 && !s.breakingNews.stories.some((x) => x.id === 'polling'); i++) s = advance(s, 1);
      expect(s.breakingNews.stories.some((x) => x.id === 'polling' || x.id === 'snap')).toBe(true);
    });

    it('breaks one drama during a World Cup', () => {
      let s = station();
      s.day = toDay(1974, 6, 1);
      for (let i = 0; i < 40 && !s.breakingNews.stories.some((x) => x.id === 'sports'); i++) s = advance(s, 1);
      expect(s.breakingNews.stories.some((x) => x.id === 'sports')).toBe(true);
      expect(s.headlines.some((h) => h.breaking)).toBe(true);
    });
  });

  describe('the cheat', () => {
    it('breaks a story today, without moving the calendar', () => {
      const s = station();
      const result = runCheat(s, 'event breaking');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.state.day).toBe(s.day);
        expect(leadStory(result.state)).not.toBeNull();
        expect(result.state.headlines.at(-1)?.breaking).toBe(true);
      }
    });

    it('moves a running story along with the calendar', () => {
      const s = station();
      startStory(s, story);
      const moved = runCheat(s, 'year 2000');
      if (!moved.ok) throw new Error(moved.error);
      expect(moved.state.breakingNews.stories[0]!.day).toBeGreaterThan(s.breakingNews.stories[0]!.day);
      expect(storiesRunning(moved.state)).toHaveLength(1);
    });
  });

  describe('the save', () => {
    it('loads a game from before breaking news with none told', () => {
      const s = station();
      const file = toSaveFile(s, 1);
      const old = structuredClone(file) as unknown as { version: number; state: Record<string, unknown> };
      old.version = 58;
      delete old.state.breakingNews;
      const { state, version } = fromSaveFile(old);
      expect(version).toBe(SAVE_VERSION);
      expect(state.breakingNews).toEqual({ stories: [], told: [], breakIns: [] });
    });
  });
});
