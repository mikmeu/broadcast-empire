// Breaking news (0.20.0, #21): breaking in on a channel while a story runs.

import { breakInBlocker } from '../breakingNewsBooking';
import { leadStory } from '../breakingNews';
import type { GameState, Id } from '../state';
import { type ActionResult, act, fail } from './core';

/** Gives a slot of a channel to a bulletin on the next day that is broadcast. */
export function breakIn(state: GameState, channelId: Id, slot: number): ActionResult {
  return act(state, (draft) => {
    const blocker = breakInBlocker(draft, channelId, slot);
    if (blocker) return fail(blocker);
    const story = leadStory(draft)!;
    draft.breakingNews.breakIns.push({ day: draft.day, channelId, slot, storyId: story.id, storyDay: story.day, major: story.major });
  });
}
