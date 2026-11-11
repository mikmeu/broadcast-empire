// The traffic helicopter (0.22.0, #395): every roof has a helipad, and from level 10 the company can buy one helicopter
// for it. It needs no crew. On a day when one of the company's own radio or TV news shows is on the air in a rush slot
// (the morning or the evening) it flies: that day costs a fee, and the news shows of the rush slots are more appealing.
// Sports shows never gain, and nor do titles bought. The numbers are in HELICOPTER in config/balance.ts. Like
// newsVans.ts, this file imports no broadcasting code; broadcast.ts and the others call into it.

import { HELICOPTER } from '../config/balance';
import { isUnlocked, lockedReason } from './unlocks';
import { airedToday } from './newsVans';
import { worthAt } from './tech';
import type { DayResult, GameState, Helicopter } from './state';

/** A show of a genre that the helicopter reports on, in a slot it flies in. */
const isRush = (a: { slot: number; genre: string }) => HELICOPTER.slots.includes(a.slot) && (HELICOPTER.newsGenres as readonly string[]).includes(a.genre);

/** Why a helicopter can't be bought: the level that opens it, or the one the company has. Null if it can. */
export function helicopterBlocker(state: GameState): string | null {
  if (!isUnlocked(state, 'helicopter')) return lockedReason('helicopter');
  if (state.helicopter) return 'You have a traffic helicopter already.';
  return null;
}

/** What the helicopter sells for on a day: all its price in the first days, then less as it ages, like a van. */
export function helicopterValue(heli: Helicopter, day: number): number {
  return Math.round(heli.price * worthAt(day - heli.boughtOn));
}

/** Whether it flies on a day, from what the player's channels aired (shows of their own) in the rush slots. */
export const flies = (state: GameState, aired: readonly { slot: number; genre: string }[]) => state.helicopter !== null && aired.some(isRush);

/** The lift of a helicopter for a show in a slot: 1 without one, outside the rush slots, for sports and talk, and for a title bought. */
export function helicopterAppeal(state: GameState, genreId: string, slot: number, ownShow = true): number {
  if (!state.helicopter || !ownShow || !isRush({ slot, genre: genreId })) return 1;
  return HELICOPTER.lift;
}

/** Daily: on a day the helicopter flies it costs its fee, a line of the books of its own. Returns whether it flew. */
export function payFlight(draft: GameState, result: DayResult): boolean {
  const flew = flies(draft, airedToday(draft, result));
  if (flew) {
    draft.money -= HELICOPTER.flight;
    draft.ledger.helicopter += HELICOPTER.flight;
  }
  return flew;
}

/** The rush slots with a news show of the company's own in a channel's schedule, as they stand (for the screens and the bot). */
export function rushShows(state: GameState): { slot: number; genre: string }[] {
  const aired: { slot: number; genre: string }[] = [];
  for (const channel of state.channels) {
    for (const slot of HELICOPTER.slots) {
      const show = state.shows.find((s) => s.id === channel.schedule[slot]);
      if (show) aired.push({ slot, genre: show.genre });
    }
  }
  return aired.filter(isRush);
}

/** Whether a day's flight would happen from the schedules as they stand (for the screens, the guide and the bot). */
export const plannedFlight = (state: GameState) => state.helicopter !== null && rushShows(state).length > 0;

/** Whether any news show is in a rush slot, helicopter or not: what makes one worth buying. */
export const hasRushNews = (state: GameState) => rushShows(state).length > 0;
