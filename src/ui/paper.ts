import type { Headline } from '../sim/state';

/** The paper that is on screen: the headlines of one day. Interface state, not saved (#129). */
export interface Paper {
  day: number;
  headlines: Headline[];
}

/** The headlines made after `before`, oldest first. It goes by date: the game keeps only the last few headlines, so a count would miss some. */
export function freshHeadlines(before: { day: number }, after: { headlines: Headline[] }): Headline[] {
  return after.headlines.filter((h) => h.day > before.day);
}

/** The issue number of the paper on a day: No. 18,263 on 1 January 1970, one more each day, as if it had been printed daily since 1920. */
export const FIRST_ISSUE = 18263;
export const issueNumber = (day: number) => FIRST_ISSUE + day;

/** How many headlines one paper carries: the first large, the others smaller. */
export const MAX_ON_PAPER = 3;
