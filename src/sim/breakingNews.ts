// Breaking news (0.20.0, #21): stories that break on a few days a year, and break-ins by the player. A running story
// lifts every news show (events.ts asks for the lift), the van gives a crewed news show more (newsVans.ts), and the
// player may break into a slot of a channel with a bulletin (breakingNewsBooking.ts): more listeners and reputation,
// fewer ads, and a day missed for the slot's sponsor. The numbers are in BREAKING in config/balance.ts, the stories in
// config/breakingNews.ts.
//
// The draws come from an Rng of their own, keyed on the seed and the day, as the politics do, so a game always gets the
// same news and the main stream does not move. This file imports no broadcasting code.

import { BREAKING, OWN_EVENT_LIMITS } from '../config/balance';
import { BREAKING_STORIES, KINGDOMS, LANDMARKS, NEIGHBOURS, type StorySpec } from '../config/breakingNews';
import type { Genre } from '../config/genres';
import { SLOTS, SLOT_NAMES } from '../config/world';
import { formatDate, toCalendarDate } from './calendar';
import { fromChannel } from './inbox';
import { namesInUse, newName } from './politics';
import { Rng } from './rng';
import { addHeadline, addMessage, type BreakIn, type BreakingStory, type DayResult, type GameState, type Id } from './state';

const BREAKING_STREAM = 0xb4ea41;

const newsRng = (seed: number, day: number) => new Rng((seed ^ BREAKING_STREAM ^ Math.imul(day + 1, 0x9e3779b1)) >>> 0);

/** Whether a genre is a news show, which a breaking story lifts. */
export const isNewsGenre = (genre: Genre) => genre.id === 'news' || genre.id === 'tvNews';

export const storyDays = (major: boolean) => (major ? BREAKING.majorDays : BREAKING.minorDays);

/** What a story does to every news show: the lift of a major or a minor story. */
export const storyLift = (story: Pick<BreakingStory, 'major'>) => (story.major ? BREAKING.majorLift : BREAKING.minorLift);

/** The stories running on a day. */
export const storiesRunning = (state: GameState, day = state.day): BreakingStory[] => state.breakingNews.stories.filter((s) => day >= s.day && day < s.until);

/** The story that counts today: the biggest running, the newest of those. */
export function leadStory(state: GameState, day = state.day): BreakingStory | null {
  return [...storiesRunning(state, day)].sort((a, b) => Number(b.major) - Number(a.major) || b.day - a.day)[0] ?? null;
}

/** The break-in on a channel's slot for today, if the player made one. */
export const breakInOn = (state: GameState, channelId: Id, slot: number): BreakIn | undefined =>
  state.breakingNews.breakIns.find((b) => b.day === state.day && b.channelId === channelId && b.slot === slot);

/** How much more appealing a slot is with a bulletin in it; the van adds when its shift is crewed. */
export const breakInLift = (breakIn: Pick<BreakIn, 'major'>, crewed: boolean) => BREAKING.breakInLift[breakIn.major ? 'major' : 'minor'] * (crewed ? BREAKING.breakInVanLift : 1);

/**
 * A story breaks: it is kept, makes a headline (red in the paper, unless the calendar made one already) and an e-mail,
 * from the journalist if there is one, otherwise Penny.
 */
export function startStory(draft: GameState, story: Omit<BreakingStory, 'day' | 'until'>, make: { headline?: boolean; message?: boolean } = {}): void {
  draft.breakingNews.stories.push({ ...story, day: draft.day, until: draft.day + storyDays(story.major) });
  if (make.headline ?? true) addHeadline(draft, story.headline, true);
  if (!(make.message ?? true)) return;
  const last = formatDate(draft.day + storyDays(story.major) - 1);
  const act = draft.channels.length > 0 ? ' You can break in on a channel, in the Channels window.' : '';
  const lift = story.major ? 'a lot' : 'a little';
  addMessage(draft, 'info', `Breaking news: ${story.headline}\n\nNews shows draw ${lift} more listeners until ${last}.${act}`, 'event', undefined, draft.employees.some((e) => e.role === 'journalist') ? 'journalist' : 'penny');
}

const fill = (spec: StorySpec, rng: Rng, draft: GameState): string =>
  spec.headline
    .replace('{place}', () => rng.pick(NEIGHBOURS))
    .replace('{kingdom}', () => rng.pick(KINGDOMS))
    .replace('{landmark}', () => rng.pick(LANDMARKS))
    .replace('{name}', () => newName(rng, namesInUse(draft, draft.politics.history)));

/** The stories that can break today: those of their time not yet told, and those of any time. */
export function eligibleStories(state: GameState, year: number): StorySpec[] {
  return BREAKING_STORIES.filter((s) => (s.from === undefined || (year >= s.from && year <= s.to! && !state.breakingNews.told.includes(s.id))));
}

/** Daily, on the new day: drops what is old and, on a few days a year, breaks a story. */
export function runBreakingNews(draft: GameState): void {
  const news = draft.breakingNews;
  news.stories = news.stories.filter((s) => s.until + BREAKING.keepDays > draft.day);
  news.breakIns = news.breakIns.filter((b) => b.day >= draft.day - 1);

  const rng = newsRng(draft.seed, draft.day);
  const last = Math.max(-Infinity, ...news.stories.map((s) => s.day));
  if (draft.day - last < BREAKING.gapDays || rng.next() >= BREAKING.chance) return;
  breakRandomStory(draft, rng);
}

/** Breaks a story of the day's choosing, whatever the chance: the draw of a day, and the cheat. Returns it, or null if none is left. */
export function breakRandomStory(draft: GameState, rng = newsRng(draft.seed, draft.day)): BreakingStory | null {
  const news = draft.breakingNews;
  const lastId = news.stories[news.stories.length - 1]?.id;
  const eligible = eligibleStories(draft, toCalendarDate(draft.day).year).filter((s) => s.id !== lastId);
  if (eligible.length === 0) return null;
  const spec = rng.pick(eligible);
  if (spec.from !== undefined) news.told.push(spec.id);
  startStory(draft, { id: spec.id, major: spec.major, light: spec.light, headline: fill(spec, rng, draft) });
  return news.stories[news.stories.length - 1]!;
}

/** Daily, once the day has been broadcast: a break-in lifts the reputation of its channel, and the player is told how it went. */
export function settleBreakIns(draft: GameState, result: DayResult): void {
  for (const breakIn of draft.breakingNews.breakIns.filter((b) => b.day === draft.day)) {
    const channel = draft.channels.find((c) => c.id === breakIn.channelId);
    if (!channel) continue;
    const rise = BREAKING.reputation[breakIn.major ? 'major' : 'minor'];
    for (const license of draft.licenses.filter((l) => l.channelId === channel.id)) {
      channel.reputation[license.regionId] = Math.min(OWN_EVENT_LIMITS.maxReputation, (channel.reputation[license.regionId] ?? 0) + rise);
    }
    const listeners = result.channels.find((c) => c.channelId === channel.id)?.slots[breakIn.slot]?.listeners ?? 0;
    addMessage(draft, 'good', `Our bulletin on ${channel.name} went out in the ${SLOT_NAMES[SLOTS[breakIn.slot]!].toLowerCase()} slot and drew ${Math.round(listeners).toLocaleString('en-IE')} listeners. The station’s reputation is up a little; the sponsor of the show we interrupted counts the day as missed.`, undefined, undefined, fromChannel(channel.id));
  }
}

/** The shows that were interrupted on a broadcast day: their sponsors count the day as missed (sales.ts). */
export function interruptedShows(state: GameState, result: DayResult): Set<Id> {
  const ids = new Set<Id>();
  for (const breakIn of state.breakingNews.breakIns.filter((b) => b.day === result.day)) {
    const showId = result.channels.find((c) => c.channelId === breakIn.channelId)?.slots[breakIn.slot]?.showId;
    if (showId) ids.add(showId);
  }
  return ids;
}
