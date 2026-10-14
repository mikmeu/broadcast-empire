// Which jingle, if any, a step of the game deserves. Pure: it compares the
// game before and after, so it works the same for a day that passes and for
// something the player does.

import { topMessage, type GameState } from '../sim/state';
import type { SoundId } from './sounds';

export type Jingle = Extract<SoundId, 'milestone' | 'win' | 'event' | 'trouble' | 'bankrupt' | 'start'>;

/**
 * How much a jingle matters. One plays at a time: a more important one cuts
 * in, anything else waits its turn and is dropped.
 */
export const JINGLE_RANK: Record<Jingle, number> = { bankrupt: 5, milestone: 4, trouble: 3, win: 2, start: 2, event: 1 };

/**
 * The jingle for what happened between two states of the same game: going
 * bankrupt, a milestone, or else whatever suits the message the player is
 * shown (`topMessage`): bad news, something starting in the country, or good
 * news. So the tune always fits the words on screen. Warnings, the weekly
 * ratings, the monthly report and other routine news stay quiet: they come
 * round too often.
 */
export function jingleFor(before: GameState, after: GameState): Jingle | null {
  if (after.bankrupt && !before.bankrupt) return 'bankrupt';
  if (after.messages.some((m) => m.id >= before.nextMessageId && m.topic === 'milestone')) return 'milestone';
  const top = topMessage(before, after);
  if (!top) return null;
  if (top.kind === 'danger') return 'trouble';
  if (top.topic === 'event') return 'event';
  if (top.kind === 'good' && top.topic !== 'routine') return 'win';
  return null;
}
