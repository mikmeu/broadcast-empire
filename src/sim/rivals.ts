// What rivals do over time: refresh their weakest show each season and
// occasionally expand into a new region.

import { ACTIVE_REGIONS, RIVAL_EXPANSION_CHANCE, RIVAL_EXPANSION_FROM_YEAR, RIVAL_MIN_FREE_SLOTS, RIVAL_START_REPUTATION } from '../config/balance';
import { toCalendarDate } from './calendar';
import { getRegion } from '../config/world';
import { generateRivalShow, rivalStrength } from './generate';
import { freeLicenses, licenseTermDays } from './licenses';
import type { Rng } from './rng';
import { addMessage, type GameState } from './state';
import { population } from './world';

/** Seasons start on the 1st of March, June, September and December. */
export const isSeasonStart = (month: number) => month % 3 === 0;

/** Each rival channel replaces its weakest show with a new one in the same genre. */
export function refreshRivalShows(draft: GameState, rng: Rng): void {
  for (const rival of draft.rivals) {
    for (const channel of rival.channels) {
      let weakest = 0;
      channel.schedule.forEach((show, i) => {
        if (show.quality < channel.schedule[weakest]!.quality) weakest = i;
      });
      const genre = channel.schedule[weakest]!.genre;
      channel.schedule[weakest] = generateRivalShow(rng, rival.personality, genre, channel.schedule.map((s) => s.name), rivalStrength(draft));
    }
  }
}

/**
 * Now and then a rival's radio stations start broadcasting in its most populous
 * missing region, but only where enough licenses are free that the player is
 * never locked out. Rivals get new TV regions only through auctions.
 */
export function expandRivals(draft: GameState, rng: Rng): void {
  if (toCalendarDate(draft.day).year < RIVAL_EXPANSION_FROM_YEAR) return;
  for (const rival of draft.rivals) {
    if (rng.next() >= RIVAL_EXPANSION_CHANCE) continue;
    const radio = rival.channels.filter((c) => c.medium === 'radio');
    // A rival takes one license per channel when it expands.
    const target = ACTIVE_REGIONS.filter(
      (r) =>
        radio.some((c) => !c.regionIds.includes(r)) &&
        freeLicenses(draft, 'radio', r) >= RIVAL_MIN_FREE_SLOTS + radio.length - 1,
    ).sort((a, b) => population(b, draft.day) - population(a, draft.day))[0];
    if (!target) continue;
    for (const channel of radio.filter((c) => !c.regionIds.includes(target))) {
      channel.regionIds.push(target);
      channel.licenseExpiry[target] = draft.day + licenseTermDays();
      channel.reputation[target] = RIVAL_START_REPUTATION;
      addMessage(draft, 'warning', `${channel.name} starts broadcasting in ${getRegion(target).name}.`);
    }
  }
}
