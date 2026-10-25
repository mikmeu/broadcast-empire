// Phone lines (0.20.0): call agents at call desks in a call centre answer the calls of listeners and viewers.
// They take them in turn: listeners phoning in to radio talk shows (free, and the show is better for it), then
// viewers paying to vote on game shows and reality TV, then orders for the merchandise with what is left.
// A day with many votes unanswered may bring a complaint to the authority. The numbers are in CALLS, VOTES and
// MAIL in config/balance.ts. This file imports no broadcasting code; broadcast.ts and the others call into it.

import { CALLS, MAIL, VOTES } from '../config/balance';
import type { Desks } from './office';
import { ownsTech } from './tech';
import { helperRate } from './upkeep';
import type { CallsDay, GameState } from './state';

/** Whether the genre of a show gets listeners phoning in. */
export const takesCallIns = (genre: string) => (CALLS.callInGenres as readonly string[]).includes(genre);

/** Whether the genre of a show gets paid votes, once the technology is there. */
export const takesVotes = (genre: string) => (VOTES.genres as readonly string[]).includes(genre);

/** Whether viewers can vote for pay: needs "Premium-rate lines". */
export const votingOpen = (state: GameState) => ownsTech(state, 'premiumLines');

/** Calls the call agents at their desks can answer in a day (a weak or unhappy one answers fewer). */
export function callCapacity(state: GameState, desked: Desks): number {
  return state.employees.filter((e) => e.role === 'callAgent' && desked.has(e.id)).reduce((sum, e) => sum + CALLS.each * helperRate(state, e, desked), 0);
}

/** The share of today's call-ins that are answered (0–1), given how many call-in shows are on the air. */
export function callInShare(capacity: number, slots: number): number {
  return slots === 0 ? 0 : Math.min(1, capacity / (slots * CALLS.callIn));
}

/** What a show with this share of its call-ins answered is worth in appeal: 1 for none, CALLS.callInBonus for all. */
export const callInAppeal = (share: number) => 1 + (CALLS.callInBonus - 1) * share;

/** The viewers' votes a slot would have today, wanted: share of its viewers. */
export const votesWanted = (viewers: number) => viewers * VOTES.share;

/**
 * The day's calls, from what is wanted: `callInSlots` radio shows with call-ins on the air and the votes wanted in each
 * vote slot. Agents answer call-ins first, then votes; the spare capacity takes mail orders, up to MAIL.max.
 * Null where there are no agents at their desks.
 */
export function dayCalls(capacity: number, callInSlots: number, votes: readonly number[]): CallsDay | null {
  if (capacity <= 0) return null;
  const callInsWanted = callInSlots * CALLS.callIn;
  const callInsAnswered = Math.min(capacity, callInsWanted);
  const votesTotal = votes.reduce((sum, v) => sum + v, 0);
  const votesAnswered = Math.min(capacity - callInsAnswered, votesTotal);
  const spare = capacity - callInsAnswered - votesAnswered;
  return {
    capacity,
    callIns: { wanted: callInsWanted, answered: callInsAnswered },
    votes: { wanted: votesTotal, answered: votesAnswered },
    orders: Math.min(spare, (MAIL.max / MAIL.lift) * CALLS.each),
  };
}

/** What the mail orders add to merchandise sales on a day: MAIL.lift for every CALLS.each calls taken, up to MAIL.max. */
export const mailLift = (calls: CallsDay | undefined) => (calls ? Math.min(MAIL.max, (calls.orders / CALLS.each) * MAIL.lift) : 0);

/** The share of today's votes that went unanswered (0–1). */
export const unanswered = (calls: CallsDay) => (calls.votes.wanted === 0 ? 0 : 1 - calls.votes.answered / calls.votes.wanted);

/** Whether so many votes went unanswered today (more than VOTES.overload) that the authority may hear of it; see `checkVotes` in sim/regulator.ts. */
export const overloaded = (calls: CallsDay | undefined) => calls !== undefined && unanswered(calls) > VOTES.overload;
