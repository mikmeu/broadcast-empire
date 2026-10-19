// Sponsor offers from the Sales department, and the contracts attached to shows.

import { CPM, RELATIONS, SALES } from '../config/balance';
import { getGenre } from '../config/genres';
import { SPONSOR_NAMES } from '../config/names';
import { AUDIENCES, type Medium } from '../config/world';
import { spend } from './economy';
import type { Rng } from './rng';
import type { Desks } from './office';
import { departmentPower } from './staff';
import { extraOffers } from './tech';
import { addMessage, newId, type DayResult, type GameState, type Id, type Show, type SponsorContract, type SponsorOffer } from './state';

const formatEuro = (n: number) => `€${Math.round(n).toLocaleString('en-IE')}`;
const DEFAULT_REFERENCE_LISTENERS = 50_000;

/**
 * The shows an offer can go to: those in the sponsor's medium that have no
 * sponsor yet, the one with the most listeners yesterday first.
 */
export function showsForOffer(state: GameState, offer: SponsorOffer): Show[] {
  const listeners = state.lastDay ? showListeners(state.lastDay) : new Map<Id, number>();
  return state.shows
    .filter((show) => getGenre(show.genre).medium === offer.medium && !state.contracts.some((c) => c.showId === show.id))
    .sort((a, b) => (listeners.get(b.id) ?? 0) - (listeners.get(a.id) ?? 0));
}

/** How well the company knows a sponsor: level 1 for one it never worked with. */
export const relationOf = (state: GameState, sponsor: string) => state.relations[sponsor] ?? { level: 1, points: 0 };

/** What a sponsor pays, as a multiple of the normal ad rate, by the level of the relationship. */
export const sponsorRate = (level: number) => Math.round((1 + RELATIONS.firstBonus + RELATIONS.bonusPerLevel * (Math.min(level, RELATIONS.levels) - 1)) * 100) / 100;

/** The points that take a relationship from a level to the next. */
export const pointsForLevel = (level: number) => RELATIONS.pointsPerLevel * level;

/**
 * Daily: the sales staff work on the sponsors under contract. Their points are
 * shared among those sponsors; a sponsor that reaches a new level pays its
 * better rate from then on, on the contracts that run as well.
 */
export function workOnRelations(draft: GameState, desked: Desks): void {
  const sponsors = [...new Set(draft.contracts.map((c) => c.sponsor))];
  const power = departmentPower(draft, 'sales', desked);
  if (sponsors.length === 0 || power <= 0) return;
  const allTaken = !hasFreeShow(draft, 'radio') && !hasFreeShow(draft, 'tv');
  const share = (power * (allTaken ? RELATIONS.fullTime : 1)) / sponsors.length;
  for (const sponsor of sponsors) {
    const relation = (draft.relations[sponsor] ??= { level: 1, points: 0 });
    if (relation.level >= RELATIONS.levels) continue;
    relation.points += share;
    while (relation.level < RELATIONS.levels && relation.points >= pointsForLevel(relation.level)) {
      relation.points -= pointsForLevel(relation.level);
      relation.level += 1;
      const rate = sponsorRate(relation.level);
      for (const contract of draft.contracts) if (contract.sponsor === sponsor) contract.cpmMultiplier = Math.max(contract.cpmMultiplier, rate);
      addMessage(draft, 'good', `Sales is on better terms with ${sponsor}: level ${relation.level}. It now pays ${Math.round((rate - 1) * 100)}% over the normal ad rate.`, 'routine', 'sales');
    }
    if (relation.level >= RELATIONS.levels) relation.points = 0;
  }
}

/** Whether a sponsor could still be given a show on radio or on TV: one there has none yet. */
export const hasFreeShow = (state: GameState, medium: Medium) =>
  state.shows.some((show) => getGenre(show.genre).medium === medium && !state.contracts.some((c) => c.showId === show.id));

/** The show an offer card stands on: the one the player picked while it is still free, or else the best one that is. */
export const showForOffer = (state: GameState, offer: SponsorOffer, picked: Id | null): Id | null => {
  const free = showsForOffer(state, offer);
  return free.some((show) => show.id === picked) ? picked : free[0]?.id ?? null;
};

/** Today's listeners per player show, summed over every slot it aired in. */
export function showListeners(result: DayResult): Map<Id, number> {
  const listeners = new Map<Id, number>();
  for (const slot of result.channels.filter((c) => c.isPlayer).flatMap((c) => c.slots)) {
    if (slot.showId) listeners.set(slot.showId, (listeners.get(slot.showId) ?? 0) + slot.listeners);
  }
  return listeners;
}

/**
 * Run each Monday: add new offers (expired ones are dropped daily). The number of offers
 * grows with the Sales department's total skill, and their rates with its
 * average skill.
 */
export function refreshOffers(draft: GameState, rng: Rng, desked: Desks): void {
  const salesStaff = draft.employees.filter((e) => e.role === 'sales' && desked.has(e.id)).length;
  if (salesStaff === 0) return;
  const power = departmentPower(draft, 'sales', desked);
  let count = Math.floor(power) + (rng.next() < power % 1 ? 1 : 0) + extraOffers(draft);
  count = Math.min(count, SALES.maxOpenOffers - draft.offers.length);

  // Sponsors size their minimum on one of the player's better shows in the
  // offer's medium (the top half by listeners).
  const aired = draft.lastDay ? [...showListeners(draft.lastDay)].filter(([, l]) => l > 0) : [];
  const mediumOf = (showId: Id): Medium | undefined => {
    const show = draft.shows.find((s) => s.id === showId);
    return show && getGenre(show.genre).medium;
  };
  const onAir = [...new Set(aired.map(([id]) => mediumOf(id)).filter((m): m is Medium => m !== undefined))];
  // A sponsor comes for a show that is free: none come for radio or for TV while every show there has one.
  const media = (onAir.length > 0 ? onAir : (['radio'] as Medium[])).filter((medium) => hasFreeShow(draft, medium));
  if (media.length === 0) return;
  const known = Object.keys(draft.relations);
  for (let i = 0; i < count; i++) {
    const medium: Medium = rng.pick(media);
    const listeners = aired.filter(([id]) => mediumOf(id) === medium).map(([, l]) => l).sort((a, b) => b - a);
    const references = listeners.slice(0, Math.ceil(listeners.length / 2));
    const reference = references.length > 0 ? rng.pick(references) : DEFAULT_REFERENCE_LISTENERS;
    const factor = SALES.minListeners.min + rng.next() * (SALES.minListeners.max - SALES.minListeners.min);
    const minListeners = Math.max(1_000, Math.round((reference * factor) / 1_000) * 1_000);
    // Half the offers come from sponsors the company knows; the rate goes by how well.
    const sponsor = known.length > 0 && rng.next() < RELATIONS.returnChance ? rng.pick(known) : rng.pick(SPONSOR_NAMES);
    const cpmMultiplier = sponsorRate(relationOf(draft, sponsor).level);
    draft.offers.push({
      id: newId(draft, 'o'),
      sponsor,
      medium,
      cpmMultiplier,
      preferredAudience: rng.next() < SALES.preferredAudienceChance ? rng.pick(AUDIENCES).id : null,
      minListeners,
      weeks: rng.int(SALES.durationWeeks.min, SALES.durationWeeks.max),
      penalty: Math.round(((minListeners / 1000) * CPM[medium] * cpmMultiplier * 7 * SALES.penaltyWeeks) / 100) * 100,
      expiresOn: draft.day + SALES.offerLifetimeDays,
    });
  }
  if (count > 0) addMessage(draft, 'info', `Sales brought in ${count} new sponsor offer${count === 1 ? '' : 's'}.`, undefined, 'sales');
}

/** Ends a contract: pays the penalty if the show averaged too few listeners. */
export function settleContract(draft: GameState, contract: SponsorContract, reason?: string): void {
  draft.contracts = draft.contracts.filter((c) => c !== contract);
  const show = draft.shows.find((s) => s.id === contract.showId);
  const average = contract.daysRun > 0 ? contract.listenerSum / contract.daysRun : 0;
  const what = `${contract.sponsor} contract${show ? ` for “${show.name}”` : ''}`;
  if (!reason && average >= contract.minListeners) {
    addMessage(draft, 'good', `The ${what} ended successfully.`, 'routine', undefined, 'sales');
    return;
  }
  spend(draft, contract.penalty, 'sponsorPenalties');
  // A broken promise costs goodwill: the sponsor remembers.
  const relation = draft.relations[contract.sponsor];
  if (relation) Object.assign(relation, { level: Math.max(1, relation.level - RELATIONS.lostOnPenalty), points: 0 });
  const outcome = reason
    ? `ended early (${reason})`
    : `fell short: the show averaged ${Math.round(average).toLocaleString('en-IE')} listeners, below the ${contract.minListeners.toLocaleString('en-IE')} agreed`;
  addMessage(draft, 'danger', `The ${what} ${outcome}. Penalty ${formatEuro(contract.penalty)}.`, undefined, undefined, 'sales');
}

/** Daily: track each contract's listeners and settle the ones that end today. */
export function trackContracts(draft: GameState, result: DayResult): void {
  const listeners = showListeners(result);
  for (const contract of [...draft.contracts]) {
    contract.listenerSum += listeners.get(contract.showId) ?? 0;
    contract.daysRun += 1;
    if (draft.day + 1 >= contract.endDay) settleContract(draft, contract);
  }
}
