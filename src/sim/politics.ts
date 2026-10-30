// Elections with people in them (0.18.0): every game makes up its own
// presidents and vice-presidents, a president serves at most two terms, and
// now and then the government falls and a snap election follows. The names are
// for reading only: what an election does to the news is in events.ts.
//
// The draws come from an Rng of their own, keyed on the seed and polling day,
// so a game always gets the same history and the main stream doesn't move.

import { ELECTIONS } from '../config/events';
import { toCalendarDate, toDay } from './calendar';
import { drawLastName, GIVEN_NAMES } from './names';
import { Rng } from './rng';
import type { Election, GameState, Politician, Politics } from './state';

/** The 1st of the month `months` after (or before) the month of a day. */
export function monthsAfter(day: number, months: number): number {
  const { year, month } = toCalendarDate(day);
  return toDay(year, month + months, 1);
}

/** Keeps the history of the world apart from the game's main stream of draws. */
const POLITICS_STREAM = 0x5e1ec7;

const politicsRng = (seed: number, day: number) => new Rng((seed ^ POLITICS_STREAM ^ Math.imul(day + 1, 0x9e3779b1)) >>> 0);

/** Everyone with a name in the game, so a politician never shares one with them. */
export function namesInUse(state: GameState, history: readonly Election[]): Set<string> {
  const names = new Set<string>([state.playerName]);
  for (const person of [...state.employees, ...state.candidates]) names.add(person.name);
  for (const rival of state.rivals) for (const channel of rival.channels) for (const show of channel.schedule) if (show.hostName) names.add(show.hostName);
  for (const e of history) names.add(e.president).add(e.vicePresident);
  return names;
}

export function newName(rng: Rng, taken: Set<string>): string {
  // Drawn as everyone's names are (0.17.0); the last draw stands if all of them are somehow taken.
  for (let tries = 0; ; tries++) {
    const name = `${rng.pick(GIVEN_NAMES)} ${drawLastName(rng)}`;
    if (!taken.has(name) || tries >= 100) {
      taken.add(name);
      return name;
    }
  }
}

/** Who governs when a game starts: a president in their first term, elected before 1970, and the next election in 1971. */
export function startingPolitics(state: GameState): Politics {
  const day = toDay(ELECTIONS.startElected, ELECTIONS.month, 1);
  const rng = politicsRng(state.seed, day);
  const taken = namesInUse(state, []);
  const president: Politician = { name: newName(rng, taken), terms: 1 };
  const vicePresident: Politician = { name: newName(rng, taken), terms: 0 };
  return {
    nextElection: toDay(ELECTIONS.firstYear, ELECTIONS.month, 1),
    snap: false,
    president,
    vicePresident,
    history: [{ day, president: president.name, vicePresident: vicePresident.name, snap: false }],
  };
}

/** How the winner came to office, for the headline. */
export type Outcome = 'reelected' | 'vicePresident' | 'new';

/**
 * Polling day: elects a president and a vice-president, adds the election to
 * the history and sets the next one, four years on or sooner if the government
 * is to fall. Only call on a draft state, on `politics.nextElection`.
 */
export function holdElection(draft: GameState): Outcome {
  const p = draft.politics;
  const day = p.nextElection;
  const rng = politicsRng(draft.seed, day);
  const taken = namesInUse(draft, p.history);
  let outcome: Outcome;
  if (p.president.terms < ELECTIONS.terms && rng.next() < ELECTIONS.reelected) {
    outcome = 'reelected';
    p.president = { ...p.president, terms: p.president.terms + 1 };
  } else if (p.president.terms >= ELECTIONS.terms && rng.next() < ELECTIONS.vicePresidentWins) {
    outcome = 'vicePresident';
    p.president = { name: p.vicePresident.name, terms: 1 };
    p.vicePresident = { name: newName(rng, taken), terms: 0 };
  } else {
    outcome = 'new';
    p.president = { name: newName(rng, taken), terms: 1 };
    p.vicePresident = { name: newName(rng, taken), terms: 0 };
  }
  p.history.push({ day, president: p.president.name, vicePresident: p.vicePresident.name, snap: p.snap });

  p.snap = rng.next() < ELECTIONS.snap;
  p.nextElection = p.snap
    ? monthsAfter(monthsAfter(day, rng.int(ELECTIONS.fallsAfter.min, ELECTIONS.fallsAfter.max)), ELECTIONS.noticeMonths)
    : monthsAfter(day, ELECTIONS.every * 12);
  return outcome;
}

/** Holds every election up to today that hasn't been held: for a save from before there were any. */
export function catchUpElections(draft: GameState): void {
  while (draft.politics.nextElection <= draft.day) holdElection(draft);
}

/** The first day of the campaign: the month before polling day. */
export const campaignStart = (p: Politics) => monthsAfter(p.nextElection, -1);

/** The day the government falls and the snap election is announced, or null if it holds. */
export const governmentFalls = (p: Politics) => (p.snap ? monthsAfter(p.nextElection, -ELECTIONS.noticeMonths) : null);

/** When the next election is due if the government lasts its term: what the wiki may say ahead. */
export const regularElection = (p: Politics) => monthsAfter(p.history[p.history.length - 1]!.day, ELECTIONS.every * 12);

/** A snap election that the news has announced, as of a day: its polling day, or null. */
export function snapElection(p: Politics, day: number): number | null {
  const falls = governmentFalls(p);
  return falls !== null && day >= falls ? p.nextElection : null;
}
