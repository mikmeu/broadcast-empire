// Breaking in (0.20.0, #21): when the player may give a slot of a channel to a bulletin, and what it costs. The lifts and
// the story are in breakingNews.ts, which imports no broadcasting code; this file does.

import { BREAKING } from '../config/balance';
import { getGenre } from '../config/genres';
import { channelOffAirReason, showQuality } from './broadcast';
import { isNewsGenre, leadStory } from './breakingNews';
import { employeesWithDesk } from './office';
import type { BreakingStory, GameState, Id } from './state';

/** Whether a news show of the player's own is on the air with its host at work: the one who reads the bulletin. */
export function hasNewsShowOnAir(state: GameState): boolean {
  const desked = employeesWithDesk(state);
  return state.channels.some(
    (channel) =>
      channelOffAirReason(state, channel, desked) === null &&
      channel.schedule.some((id) => {
        const show = state.shows.find((s) => s.id === id);
        return !!show && isNewsGenre(getGenre(show.genre)) && showQuality(state, show, desked).quality > 0;
      }),
  );
}

/** The story a channel has broken in on already, or undefined. */
const brokenIn = (state: GameState, channelId: Id, story: BreakingStory) => state.breakingNews.breakIns.find((b) => b.channelId === channelId && b.storyId === story.id && b.storyDay === story.day);

/** Why a slot of a channel can't be given to a bulletin today, or null. */
export function breakInBlocker(state: GameState, channelId: Id, slot: number): string | null {
  const story = leadStory(state);
  if (!story) return 'No story is breaking.';
  const channel = state.channels.find((c) => c.id === channelId);
  if (!channel) return 'That channel doesn’t exist.';
  const offAir = channelOffAirReason(state, channel);
  if (offAir) return `${channel.name} is off the air (${offAir.toLowerCase()}).`;
  if (brokenIn(state, channelId, story)) return `${channel.name} has broken in on this story already.`;
  const show = state.shows.find((s) => s.id === channel.schedule[slot]);
  if (!show) return 'There is no show in that slot to give way.';
  if (isNewsGenre(getGenre(show.genre))) return 'A news show is news already: pick another slot.';
  if (!hasNewsShowOnAir(state)) return 'A bulletin needs a news show of your own on the air, with its host at work, to read it.';
  return null;
}

/** What breaking in costs, for the screens: the share of the slot's ads that is lost. */
export const adsLost = () => Math.round((1 - BREAKING.adsKept) * 100);
