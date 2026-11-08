// Sponsor offers from the Sales department, and the contracts attached to shows.

import { BRANDS, CPM, RELATIONS, SALES, SPONSOR_TERMS } from '../config/balance';
import { getGenre, isEdgy } from '../config/genres';
import { groupOf, isFamilyFriendly, SPONSOR_NAMES } from '../config/names';
import { AUDIENCES, type Medium } from '../config/world';
import { interruptedShows } from './breakingNews';
import { saleOf } from './deals';
import { spend } from './economy';
import { MEDIUM_NAMES } from './licenses';
import { Rng } from './rng';
import type { Desks } from './office';
import { brandLimit, dealsPower, effectiveSkill, onBrands, onDeals, salesGrade } from './staff';
import { extraOffers } from './tech';
import { workFactor } from './upkeep';
import { addMessage, newId, type Channel, type DayResult, type Employee, type GameState, type Id, type Makegood, type Show, type SponsorContract, type SponsorOffer } from './state';

const formatEuro = (n: number) => `€${Math.round(n).toLocaleString('en-IE')}`;
const DEFAULT_REFERENCE_LISTENERS = 50_000;

/** Mixed into the state of the game's chance to start the stream the new terms of an offer (exclusive, strings, a replaced brand) are drawn from, so the main stream's draws stay as they were. */
const TERMS_STREAM = 0x5eed_0361;

/** The terms that change what a deal pays (0.21.0, #361): on an offer or a contract. */
export type Terms = Pick<SponsorOffer, 'exclusive' | 'strings' | 'length'> & { renegotiated?: boolean };

/** Whether a number of weeks is a short contract, a long one, or neither. */
export const lengthOfWeeks = (weeks: number): SponsorOffer['length'] =>
  weeks <= SPONSOR_TERMS.length.shortWeeks ? 'short' : weeks >= SPONSOR_TERMS.length.longWeeks ? 'long' : undefined;

/** What the terms do to the rate a sponsor pays: exclusive and strings pay more, a short contract less (more once renegotiated), a long one more. 1 for none. */
export function termsFactor(terms: Terms): number {
  const { length, exclusive, strings } = SPONSOR_TERMS;
  const byLength = terms.length === 'short' ? (terms.renegotiated ? length.longPay : length.shortPay) : terms.length === 'long' ? length.longPay : 1;
  return (terms.exclusive ? exclusive.pay : 1) * (terms.strings ? strings.kinds[terms.strings].pay : 1) * byLength;
}

/** The rate a sponsor pays at a level of the relationship, with the terms of the deal, as a multiple of the normal ad rate. */
export const rateWithTerms = (level: number, terms: Terms) => Math.round(sponsorRate(level) * termsFactor(terms) * 100) / 100;

/** The penalty for a minimum, a medium and a rate: `SALES.penaltyWeeks` of the minimum revenue. */
export const penaltyFor = (minListeners: number, medium: Medium, cpmMultiplier: number) =>
  Math.round(((minListeners / 1000) * CPM[medium] * cpmMultiplier * 7 * SALES.penaltyWeeks) / 100) * 100;

// --- Who can take a deal ---

/** The make-good a show still owes a sponsor, if any: a choice waiting, or free airtime still to give. */
export const makegoodOn = (state: GameState, showId: Id): Makegood | undefined => state.makegoods.find((m) => m.showId === showId);

/** The channel a show is scheduled on, if any. A show sits in one slot only. */
export const channelOf = (state: GameState, showId: Id): Channel | undefined => state.channels.find((c) => c.schedule.includes(showId));

/** Whether a show has no sponsor, is not sold and owes no make-good. */
export const showIsFree = (state: GameState, show: Show) => !state.contracts.some((c) => c.showId === show.id) && !saleOf(state, show.id) && !makegoodOn(state, show.id);

/**
 * Why a sponsor can't be put on a channel: a brand of its group already has a deal there and one of the two is exclusive.
 * `showId` is the show to be put there, which is not counted. Null if it can.
 */
export function exclusivityRefusal(state: GameState, sponsor: string, exclusive: boolean | undefined, showId: Id, channel: Channel): string | null {
  const group = groupOf(sponsor);
  if (!group) return null;
  for (const id of channel.schedule) {
    const contract = id && id !== showId ? state.contracts.find((c) => c.showId === id) : undefined;
    if (!contract || contract.sponsor === sponsor || groupOf(contract.sponsor) !== group) continue;
    if (contract.exclusive) return `${contract.sponsor} is exclusive on ${channel.name}: no other ${group.toLowerCase()} brand can sign there.`;
    if (exclusive) return `${sponsor} is exclusive: ${contract.sponsor} is on ${channel.name} already, and ${sponsor} wants it to itself.`;
  }
  return null;
}

/** Why a show can't take a deal, or null if it can. The one place that knows, for the offer cards, `acceptOffer` and the test players. */
export function sponsorRefusal(state: GameState, offer: Pick<SponsorOffer, 'sponsor' | 'medium' | 'exclusive'>, show: Show): string | null {
  if (getGenre(show.genre).medium !== offer.medium) return `This sponsor wants a ${MEDIUM_NAMES[offer.medium]} show.`;
  if (state.contracts.some((c) => c.showId === show.id)) return `“${show.name}” already has a sponsor.`;
  if (saleOf(state, show.id)) return `“${show.name}” is sold to another channel. A sold show can’t have a sponsor.`;
  const owed = makegoodOn(state, show.id);
  if (owed) return `“${show.name}” still owes ${owed.sponsor} a make-good. It can’t take a sponsor until that is settled.`;
  if (isFamilyFriendly(offer.sponsor) && isEdgy(show.genre)) return `${offer.sponsor} is family-friendly and won’t sponsor ${getGenre(show.genre).name}.`;
  const channel = channelOf(state, show.id);
  return channel ? exclusivityRefusal(state, offer.sponsor, offer.exclusive, show.id, channel) : null;
}

/**
 * The shows an offer can go to: those in the sponsor's medium that nothing refuses (see `sponsorRefusal`),
 * the one with the most listeners yesterday first.
 */
export function showsForOffer(state: GameState, offer: SponsorOffer): Show[] {
  const listeners = state.lastDay ? showListeners(state.lastDay) : new Map<Id, number>();
  return state.shows.filter((show) => sponsorRefusal(state, offer, show) === null).sort((a, b) => (listeners.get(b.id) ?? 0) - (listeners.get(a.id) ?? 0));
}

/** The shows of an offer's medium that are free but that this offer can't take, and why: for the offer card. */
export const refusedShows = (state: GameState, offer: SponsorOffer): { show: Show; reason: string }[] =>
  state.shows.flatMap((show) => {
    const reason = getGenre(show.genre).medium === offer.medium && showIsFree(state, show) ? sponsorRefusal(state, offer, show) : null;
    return reason ? [{ show, reason }] : [];
  });

/** How well the company knows a sponsor: level 1 for one it never worked with. */
export const relationOf = (state: GameState, sponsor: string) => state.relations[sponsor] ?? { level: 1, points: 0 };

/** What a sponsor pays, as a multiple of the normal ad rate, by the level of the relationship. */
export const sponsorRate = (level: number) => Math.round((1 + RELATIONS.firstBonus + RELATIONS.bonusPerLevel * (Math.min(level, RELATIONS.levels) - 1)) * 100) / 100;

/** The points that take a relationship from a level to the next. */
export const pointsForLevel = (level: number) => RELATIONS.pointsPerLevel * level;

/** The sponsors under contract, once each. */
export const contractedBrands = (state: GameState): string[] => [...new Set(state.contracts.map((c) => c.sponsor))];

/** The brands a contracted sponsor could still be taken from: those under contract below the top level, in order. */
export const workableBrands = (state: GameState): string[] => contractedBrands(state).filter((b) => relationOf(state, b).level < RELATIONS.levels);

/** The person on brands who holds a brand, if anyone. */
export const brandHolder = (state: GameState, brand: string): Employee | undefined => state.employees.find((e) => onBrands(e) && e.brands?.includes(brand));

/** The brands a person works on today: the first ones their grade allows; the rest wait (paused). */
export const activeBrands = (employee: Employee, grade: number): string[] => (employee.brands ?? []).slice(0, brandLimit(grade));

/** The contracted brands below the top level that nobody works on today: held by nobody, paused, or held by someone without a desk. */
export const unworkedBrands = (state: GameState, desked: Desks): string[] =>
  workableBrands(state).filter((brand) => {
    const holder = brandHolder(state, brand);
    return !holder || !desked.has(holder.id) || !activeBrands(holder, salesGrade(state, holder, desked)).includes(brand);
  });

/** Drops the brands nobody can work on any more, then lets people on brands with a desk and room take the ones nobody holds. */
function seatBrands(draft: GameState, desked: Desks): void {
  const workable = new Set(workableBrands(draft));
  const people = draft.employees.filter(onBrands);
  for (const e of people) e.brands = (e.brands ?? []).filter((b) => workable.has(b));
  const free = [...workable].filter((b) => !brandHolder(draft, b));
  const takers = people.filter((e) => desked.has(e.id)).sort((a, b) => b.skill - a.skill);
  // One brand each in turn, the most skilled first, so that one person doesn't hold them all.
  for (let pass = 0; pass < BRANDS.bands.length + BRANDS.base && free.length > 0; pass++) {
    for (const e of takers) {
      const held = (e.brands ??= []);
      if (free.length === 0 || held.length >= brandLimit(salesGrade(draft, e, desked))) continue;
      held.push(free.shift()!);
    }
  }
}

/**
 * Daily: the sales staff on brands work on the sponsors under contract (0.21.0, #360). Each person's power, their grade / 100, is
 * shared among the brands they work today; a brand with nobody earns nothing. A sponsor that reaches a new level pays its
 * better rate from then on, on the contracts that run as well.
 */
export function workOnRelations(draft: GameState, desked: Desks): void {
  seatBrands(draft, desked);
  for (const e of draft.employees.filter(onBrands)) {
    if (!desked.has(e.id)) continue;
    const grade = salesGrade(draft, e, desked);
    const working = activeBrands(e, grade);
    if (working.length === 0) continue;
    const share = ((effectiveSkill(draft, e, desked) / 100) * workFactor(draft, e, desked)) / working.length;
    for (const sponsor of working) addPoints(draft, sponsor, share);
  }
}

function addPoints(draft: GameState, sponsor: string, share: number): void {
  const relation = (draft.relations[sponsor] ??= { level: 1, points: 0 });
  if (relation.level >= RELATIONS.levels) return;
  relation.points += share;
  while (relation.level < RELATIONS.levels && relation.points >= pointsForLevel(relation.level)) {
    relation.points -= pointsForLevel(relation.level);
    relation.level += 1;
    const rate = sponsorRate(relation.level);
    // A long contract is locked at its rate (0.21.0, #361); the others rise with the terms they were signed on.
    for (const contract of draft.contracts) {
      if (contract.sponsor === sponsor && contract.length !== 'long') contract.cpmMultiplier = Math.max(contract.cpmMultiplier, rateWithTerms(relation.level, contract));
    }
    addMessage(draft, 'good', `Sales is on better terms with ${sponsor}: level ${relation.level}. It now pays ${Math.round((rate - 1) * 100)}% over the normal ad rate.`, 'routine', 'sales', undefined, 'salesReports');
  }
  if (relation.level >= RELATIONS.levels) relation.points = 0;
}

/** Whether a sponsor could still be given a show on radio or on TV: one there has none yet. */
export const hasFreeShow = (state: GameState, medium: Medium) => state.shows.some((show) => getGenre(show.genre).medium === medium && showIsFree(state, show));

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
  const salesStaff = draft.employees.filter((e) => onDeals(e) && desked.has(e.id)).length;
  if (salesStaff === 0) return;
  const power = dealsPower(draft, desked);
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
  // The terms of an offer are drawn from a stream of their own. Until the first contract the offers are plain, to keep the start simple.
  const side = new Rng((rng.state ^ TERMS_STREAM) >>> 0);
  const plain = known.length === 0;
  const { exclusive: exclusiveTerms, strings: stringsTerms } = SPONSOR_TERMS;
  const stringKinds = Object.entries(stringsTerms.kinds) as [NonNullable<SponsorOffer['strings']>, { weight: number }][];
  const totalWeight = stringKinds.reduce((sum, [, kind]) => sum + kind.weight, 0);
  for (let i = 0; i < count; i++) {
    const medium: Medium = rng.pick(media);
    const listeners = aired.filter(([id]) => mediumOf(id) === medium).map(([, l]) => l).sort((a, b) => b - a);
    const references = listeners.slice(0, Math.ceil(listeners.length / 2));
    const reference = references.length > 0 ? rng.pick(references) : DEFAULT_REFERENCE_LISTENERS;
    const factor = SALES.minListeners.min + rng.next() * (SALES.minListeners.max - SALES.minListeners.min);
    const minListeners = Math.max(1_000, Math.round((reference * factor) / 1_000) * 1_000);
    // Half the offers come from sponsors the company knows; the rate goes by how well.
    let sponsor: string = known.length > 0 && rng.next() < RELATIONS.returnChance ? rng.pick(known) : rng.pick(SPONSOR_NAMES);
    const preferredAudience = rng.next() < SALES.preferredAudienceChance ? rng.pick(AUDIENCES).id : null;
    const weeks = rng.int(SALES.durationWeeks.min, SALES.durationWeeks.max);
    // A family-friendly brand comes only for a medium with a show it would take; else another brand comes.
    if (isFamilyFriendly(sponsor) && !draft.shows.some((s) => getGenre(s.genre).medium === medium && showIsFree(draft, s) && !isEdgy(s.genre))) {
      sponsor = side.pick(SPONSOR_NAMES.filter((name) => !isFamilyFriendly(name)));
    }
    const exclusive = side.next() < exclusiveTerms.chance && !plain;
    let roll = side.next();
    const strings = plain ? undefined : stringKinds.find(([, kind]) => (roll -= (stringsTerms.chance * kind.weight) / totalWeight) < 0)?.[0];
    const length = lengthOfWeeks(weeks);
    const terms: Terms = { ...(exclusive && { exclusive }), ...(strings && { strings }), ...(length && { length }) };
    const cpmMultiplier = rateWithTerms(relationOf(draft, sponsor).level, terms);
    draft.offers.push({
      id: newId(draft, 'o'),
      sponsor,
      medium,
      cpmMultiplier,
      preferredAudience,
      minListeners,
      weeks,
      penalty: penaltyFor(minListeners, medium, cpmMultiplier),
      expiresOn: draft.day + SALES.offerLifetimeDays,
      ...terms,
    });
  }
  if (count > 0) addMessage(draft, 'info', `Sales brought in ${count} new sponsor offer${count === 1 ? '' : 's'}.`, undefined, 'sales', undefined, 'salesOffers');
}

/** Charges a penalty, and a broken promise costs goodwill: the sponsor remembers. */
function chargePenalty(draft: GameState, sponsor: string, penalty: number): void {
  spend(draft, penalty, 'sponsorPenalties');
  const relation = draft.relations[sponsor];
  if (relation) Object.assign(relation, { level: Math.max(1, relation.level - RELATIONS.lostOnPenalty), points: 0 });
}

/**
 * Ends a contract. One that ran out under its minimum gives the player a make-good to settle (0.21.0, #361); one ended early
 * (`reason`: cancelled, or its show was) pays the penalty at once.
 */
export function settleContract(draft: GameState, contract: SponsorContract, reason?: string): void {
  draft.contracts = draft.contracts.filter((c) => c !== contract);
  const show = draft.shows.find((s) => s.id === contract.showId);
  const average = contract.daysRun > 0 ? contract.listenerSum / contract.daysRun : 0;
  const what = `${contract.sponsor} contract${show ? ` for “${show.name}”` : ''}`;
  if (!reason && average >= contract.minListeners) {
    addMessage(draft, 'good', `The ${what} ended successfully.`, 'routine', undefined, 'sales', 'salesReports');
    return;
  }
  if (reason) {
    chargePenalty(draft, contract.sponsor, contract.penalty);
    addMessage(draft, 'danger', `The ${what} ended early (${reason}). Penalty ${formatEuro(contract.penalty)}.`, undefined, undefined, 'sales');
    return;
  }
  const { decideDays, maxAirtimeDays } = SPONSOR_TERMS.makegood;
  const short = (contract.minListeners - average) / contract.minListeners;
  const days = Math.min(maxAirtimeDays, Math.max(1, Math.ceil(contract.daysRun * short)));
  draft.makegoods.push({ id: newId(draft, 'm'), showId: contract.showId, sponsor: contract.sponsor, penalty: contract.penalty, days, decideBy: draft.day + 1 + decideDays });
  addMessage(
    draft,
    'danger',
    `The ${what} fell short: the show averaged ${Math.round(average).toLocaleString('en-IE')} listeners, below the ${contract.minListeners.toLocaleString('en-IE')} agreed. ` +
      `Choose in Sales within ${decideDays} days: a refund of ${formatEuro(contract.penalty)} (and the brand drops a level), or ${days} day${days === 1 ? '' : 's'} of free airtime. With no choice it is a refund.`,
    undefined,
    'sales',
    'sales',
  );
}

/** Takes the refund of a make-good: the penalty is paid and the brand drops a level. `late` when nothing was chosen in time. */
export function refundMakegood(draft: GameState, makegood: Makegood, late = false): void {
  draft.makegoods = draft.makegoods.filter((m) => m !== makegood);
  chargePenalty(draft, makegood.sponsor, makegood.penalty);
  const show = draft.shows.find((s) => s.id === makegood.showId);
  const what = `${makegood.sponsor} make-good${show ? ` for “${show.name}”` : ''}`;
  addMessage(draft, 'danger', `${late ? `Nothing was chosen in time, so the ${what} is a refund` : `You chose the refund for the ${what}`}. Penalty ${formatEuro(makegood.penalty)}.`, undefined, undefined, 'sales');
}

/**
 * A show deleted while it owes a make-good (0.21.0, #361): a choice still waiting is the refund; free airtime part given
 * costs the rest of the penalty, in proportion, and the level.
 */
export function endMakegoodsOf(draft: GameState, showId: Id): void {
  for (const makegood of draft.makegoods.filter((m) => m.showId === showId)) {
    if (makegood.daysLeft === undefined) {
      refundMakegood(draft, makegood);
      continue;
    }
    draft.makegoods = draft.makegoods.filter((m) => m !== makegood);
    const owed = Math.round((makegood.penalty * makegood.daysLeft) / makegood.days / 100) * 100;
    chargePenalty(draft, makegood.sponsor, owed);
    addMessage(draft, 'danger', `The ${makegood.sponsor} make-good was left unfinished when its show was cancelled. Penalty ${formatEuro(owed)}, the rest of the free airtime.`, undefined, undefined, 'sales');
  }
}

/** Daily: the refund comes when nothing was chosen in time, and the free airtime counts down on the days its show airs. */
function runMakegoods(draft: GameState, listeners: Map<Id, number>, interrupted: Set<Id>): void {
  for (const makegood of [...draft.makegoods]) {
    if (makegood.daysLeft === undefined) {
      if (draft.day + 1 >= makegood.decideBy) refundMakegood(draft, makegood, true);
      continue;
    }
    // A day off the air, or taken over by a bulletin, gives nothing.
    if ((listeners.get(makegood.showId) ?? 0) <= 0 || interrupted.has(makegood.showId)) continue;
    makegood.daysLeft -= 1;
    if (makegood.daysLeft > 0) continue;
    draft.makegoods = draft.makegoods.filter((m) => m !== makegood);
    const show = draft.shows.find((s) => s.id === makegood.showId);
    addMessage(draft, 'info', `The free airtime for ${makegood.sponsor}${show ? ` on “${show.name}”` : ''} is given. Its ads are back.`, undefined, 'sales', 'sales', 'salesReports');
  }
}

/** Why a contract can't be renegotiated now, or null if it can (0.21.0, #361): a short one, once, after a ratings bump. */
export function renegotiationBlocker(state: GameState, contract: SponsorContract): string | null {
  const { minDays, minDaysLeft, rise } = SPONSOR_TERMS.renegotiate;
  if (contract.length !== 'short') return 'Only a short contract can be renegotiated.';
  if (contract.renegotiated) return 'This contract was renegotiated already.';
  if (contract.daysRun < minDays) return `Wait until it has run ${minDays} days.`;
  if (contract.endDay - state.day < minDaysLeft) return `Too late: less than ${minDaysLeft} days are left.`;
  const average = contract.listenerSum / contract.daysRun;
  const signed = contract.signedListeners ?? 0;
  if (signed <= 0 || average < signed * rise) return `The show must average ${Math.round(rise * 100 - 100)}% more than the ${Math.round(signed).toLocaleString('en-IE')} it had when you signed.`;
  return null;
}

/** The minimum a renegotiated contract would ask: 85% of the average so far, to the thousand, never lower than before. */
export function renegotiatedMinimum(contract: SponsorContract): number {
  const average = contract.daysRun > 0 ? contract.listenerSum / contract.daysRun : 0;
  return Math.max(contract.minListeners, Math.round((average * SPONSOR_TERMS.renegotiate.newMinimum) / 1_000) * 1_000);
}

/** Renegotiates a short contract: the discount becomes a premium, the minimum goes up, the penalty is worked out again and the average starts afresh. */
export function renegotiate(draft: GameState, contract: SponsorContract): void {
  contract.minListeners = renegotiatedMinimum(contract);
  contract.renegotiated = true;
  contract.cpmMultiplier = Math.max(contract.cpmMultiplier, rateWithTerms(relationOf(draft, contract.sponsor).level, contract));
  contract.penalty = penaltyFor(contract.minListeners, contract.medium, contract.cpmMultiplier);
  contract.listenerSum = 0;
  contract.daysRun = 0;
}

/** Daily: track each contract's listeners and settle the ones that end today. */
export function trackContracts(draft: GameState, result: DayResult): void {
  const listeners = showListeners(result);
  // A show interrupted by a bulletin (0.20.0, #21) counts as a day off the air: its sponsor hears no listeners.
  const interrupted = interruptedShows(draft, result);
  runMakegoods(draft, listeners, interrupted);
  for (const contract of [...draft.contracts]) {
    contract.listenerSum += interrupted.has(contract.showId) ? 0 : listeners.get(contract.showId) ?? 0;
    contract.daysRun += 1;
    if (draft.day + 1 >= contract.endDay) settleContract(draft, contract);
  }
}
