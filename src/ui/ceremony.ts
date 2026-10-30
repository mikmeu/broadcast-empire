// The awards night as a list of steps (0.20.0): who speaks, what is said and what the card shows. The show
// (AwardShow.tsx) plays them one after the other; this file has no screen in it, so the order can be tested.

import { CEREMONY, getLine, type Presenter } from '../config/guide';
import { AWARD_CATEGORIES } from '../sim/awards';
import type { AwardCategory, AwardNight, Nominee } from '../sim/state';

/** How long a step stays, in milliseconds. */
export const PACE = {
  /** On the list of nominees, after the question has been asked. */
  nominees: 2500,
  /** On the winner. */
  winner: 3000,
  /** After a line that was heard to its end, before the next. */
  after: 500,
  /** A line nobody can hear (no recording yet, or the voice is off): the time it takes to read, a word at a time, and at least this long. */
  perWord: 330,
  least: 1800,
} as const;

/** How long to wait after a line: a little if it was heard, the time to read it if not. */
export function pauseAfter(lineId: string, heard: boolean): number {
  if (heard) return PACE.after;
  const words = getLine(lineId)?.say.split(/\s+/).length ?? 0;
  return Math.max(PACE.least, words * PACE.perWord);
}

export type StepKind = 'welcome' | 'intro' | 'nominees' | 'envelope' | 'winner' | 'goodnight';

export interface CeremonyStep {
  kind: StepKind;
  /** Who is on the stage with the word: the one who talks, or for a card without a line the one who just did. */
  who: Presenter;
  /** The line said in this step; none on the cards of the nominees and of the winner, which stay for `hold`. */
  lineId?: string;
  category?: AwardCategory;
  /** For the cards of a category: everyone up for it, and who won. */
  nominees?: Nominee[];
  winner?: Nominee;
  /** For a step without a line: how long it stays. */
  hold?: number;
}

/** The presenter who introduces an award, and the line that does it. The other opens the envelope. */
const INTRO: Record<AwardCategory, string> = {
  radioShow: 'lotta-radio-show',
  radioHost: 'sonny-radio-host',
  tvShow: 'lotta-tv-show',
  tvHost: 'sonny-tv-host',
};

const other = (who: Presenter): Presenter => (who === 'lotta' ? 'sonny' : 'lotta');
const presenterOf = (lineId: string): Presenter => CEREMONY.find((line) => line.id === lineId)!.speaker;

/**
 * The night in order: the welcome by both, then for each award, in the order it is given out, the introduction,
 * the nominees, “and the winner is…” by the other presenter and the winner, and at the end the goodnight by both.
 * An award with no nominees or no winner is left out, so the show never has an empty card.
 */
export function ceremonySteps(night: AwardNight): CeremonyStep[] {
  const steps: CeremonyStep[] = [
    { kind: 'welcome', who: 'lotta', lineId: 'lotta-welcome' },
    { kind: 'welcome', who: 'sonny', lineId: 'sonny-welcome' },
  ];
  for (const category of AWARD_CATEGORIES) {
    const nominees = night.nominees.filter((n) => n.category === category);
    const winner = nominees.find((n) => n.won);
    if (!winner) continue;
    const host = presenterOf(INTRO[category]);
    const opens = other(host);
    steps.push(
      { kind: 'intro', who: host, lineId: INTRO[category], category, nominees },
      { kind: 'nominees', who: host, category, nominees, hold: PACE.nominees },
      { kind: 'envelope', who: opens, lineId: `${opens}-winner`, category, nominees },
      { kind: 'winner', who: opens, category, nominees, winner, hold: PACE.winner },
    );
  }
  steps.push({ kind: 'goodnight', who: 'lotta', lineId: 'lotta-goodnight' }, { kind: 'goodnight', who: 'sonny', lineId: 'sonny-goodnight' });
  return steps;
}
