// Lawsuits (0.19.0): a talk show, a talk radio show or the news can be sued for libel, a reality show for an
// injury. A case is heard 60 days after it is filed; until then the company can settle. Lawyers at a desk
// make a loss less likely and a settlement cheaper. See LEGAL in balance.ts.
// The source of a case is a field of its own, so that music copyright and the regulator's fines can add theirs.

import { LEGAL, START_YEAR } from '../config/balance';
import { lawsuitSource } from '../config/genres';
import type { RegionId } from '../config/world';
import { formatDate, toCalendarDate } from './calendar';
import { spend } from './economy';
import { channelRegions } from './broadcast';
import type { From } from './inbox';
import type { Desks } from './office';
import { Rng } from './rng';
import { helperRate } from './upkeep';
import { addMessage, newId, type Employee, type GameState, type Id, type Lawsuit, type LawsuitSource, type Show } from './state';

const formatEuro = (n: number) => `€${Math.round(n).toLocaleString('en-IE')}`;

/** How a source reads in an e-mail. */
export const SOURCE_NAMES: Record<LawsuitSource, string> = { libel: 'libel', injury: 'an injury' };

/** The lawyers at a desk, the most productive first; no more than LEGAL.lawyers of them count. */
function workingLawyers(state: GameState, desked: Desks): Employee[] {
  return state.employees
    .filter((e) => e.role === 'lawyer' && desked.has(e.id))
    .sort((a, b) => helperRate(state, b, desked) - helperRate(state, a, desked))
    .slice(0, LEGAL.lawyers);
}

/** Whether a lawyer is at a desk today. */
export const hasLawyer = (state: GameState, desked: Desks) => state.employees.some((e) => e.role === 'lawyer' && desked.has(e.id));

/** The chance of losing a case in court today: LEGAL.loss, less LEGAL.lawyerCut for each lawyer at a desk (a weak or unhappy one cuts less). */
export function lossChance(state: GameState, desked: Desks): number {
  const cut = workingLawyers(state, desked).reduce((sum, e) => sum + LEGAL.lawyerCut * helperRate(state, e, desked), 0);
  return Math.max(LEGAL.minLoss, LEGAL.loss - cut);
}

/** What it costs to settle a case today: LEGAL.settle.alone of the claim, LEGAL.settle.lawyer with a lawyer at a desk. */
export function settlement(state: GameState, desked: Desks, lawsuit: Lawsuit): number {
  return Math.round(lawsuit.claim * (hasLawyer(state, desked) ? LEGAL.settle.lawyer : LEGAL.settle.alone));
}

/** What a lost case costs: the claim and the legal costs on top. */
export const lostCost = (lawsuit: Lawsuit) => Math.round(lawsuit.claim * (1 + LEGAL.costs));
/** What a won case costs: the legal costs. */
export const wonCost = (lawsuit: Lawsuit) => Math.round(lawsuit.claim * LEGAL.costs);

/** The claim for a show's channel in a year: for every region it reaches, in 1970 money, rising a year at a time. */
export function claimFor(source: LawsuitSource, regions: number, year: number): number {
  return Math.round((LEGAL.perRegion[source] * Math.max(1, regions) * (1 + LEGAL.growth) ** (year - START_YEAR)) / 1000) * 1000;
}

/** The chance a show is sued in a month: its source's chance, times its tone. 0 for a genre that can't be sued. */
export function suedChance(show: Pick<Show, 'genre' | 'tone'>): number {
  const source = lawsuitSource(show.genre);
  return source ? LEGAL.chance[source] * LEGAL.tone[show.tone] : 0;
}

/** The player's channel a show is on the air in, or nothing if it is not scheduled. */
const channelOf = (state: GameState, show: Show) => state.channels.find((c) => c.schedule.includes(show.id));

/** A 32-bit seed from a string (FNV-1a). */
function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Who writes about a case: a lawyer once there is one, otherwise the manager of the channel. */
const fromLegal = (channelId: Id | null): From => ({ desk: 'legal', channelId: channelId ?? '' });

/**
 * On the 1st of the month: each show on the air that can be sued is, with its chance. One case per show at a time.
 * From a stream of chance of its own for every show and day, so nothing else in the game moves.
 */
export function fileLawsuits(draft: GameState): void {
  const { year } = toCalendarDate(draft.day);
  for (const show of draft.shows) {
    const source = lawsuitSource(show.genre);
    const channel = channelOf(draft, show);
    if (!source || !channel || draft.offAir[show.id] || draft.lawsuits.some((l) => l.showId === show.id)) continue;
    if (new Rng(seedOf(`${draft.seed}:${show.id}@${draft.day}`)).next() >= suedChance(show)) continue;
    const claim = claimFor(source, channelRegions(draft, channel.id).length, year);
    const lawsuit: Lawsuit = { id: newId(draft, 'ls'), showId: show.id, showName: show.name, source, claim, filedOn: draft.day, courtOn: draft.day + LEGAL.courtDays, channelId: channel.id };
    draft.lawsuits.push(lawsuit);
    addMessage(
      draft,
      'danger',
      `“${show.name}” is being sued for ${SOURCE_NAMES[source]}: they claim ${formatEuro(claim)}. The case is heard on ${formatDate(lawsuit.courtOn)}. Settle before then, or go to court and take the chance. Settling and the lawsuits are on the Finance screen.`,
      undefined,
      'finance',
      fromLegal(channel.id),
    );
  }
}

/** Daily: every case whose court day has come is heard. Lost, the company pays the claim and the costs, and the channel loses reputation. */
export function hearLawsuits(draft: GameState, desked: Desks): void {
  const due = draft.lawsuits.filter((l) => l.courtOn <= draft.day);
  if (due.length === 0) return;
  for (const lawsuit of due) {
    const lost = new Rng(seedOf(`${draft.seed}:${lawsuit.id}@${draft.day}`)).next() < lossChance(draft, desked);
    if (lost) {
      spend(draft, lostCost(lawsuit), 'legal');
      const channel = draft.channels.find((c) => c.id === lawsuit.channelId);
      if (channel) {
        for (const [regionId, reputation] of Object.entries(channel.reputation) as [RegionId, number][]) channel.reputation[regionId] = Math.max(0, reputation - LEGAL.reputation);
      }
      addMessage(
        draft,
        'danger',
        `We lost the case against “${lawsuit.showName}”. The court gave the ${formatEuro(lawsuit.claim)} claim and ${formatEuro(lawsuit.claim * LEGAL.costs)} in costs against us, and the channel's name has suffered.`,
        undefined,
        'finance',
        fromLegal(lawsuit.channelId),
      );
    } else {
      spend(draft, wonCost(lawsuit), 'legal');
      addMessage(draft, 'good', `We won the case against “${lawsuit.showName}”. The claim was thrown out; the costs were ${formatEuro(lawsuit.claim * LEGAL.costs)}.`, undefined, 'finance', fromLegal(lawsuit.channelId));
    }
  }
  draft.lawsuits = draft.lawsuits.filter((l) => l.courtOn > draft.day);
}

/** Settles a case: the company pays the settlement and it is over. Returns an error if there is no such case or no money. */
export function settleLawsuit(draft: GameState, lawsuitId: Id, desked: Desks): { error: string } | void {
  const lawsuit = draft.lawsuits.find((l) => l.id === lawsuitId);
  if (!lawsuit) return { error: 'That case is not open any more.' };
  const price = settlement(draft, desked, lawsuit);
  if (draft.money < price) return { error: `Not enough money (${formatEuro(price)} needed).` };
  spend(draft, price, 'legal');
  draft.lawsuits = draft.lawsuits.filter((l) => l.id !== lawsuitId);
  addMessage(draft, 'info', `The case against “${lawsuit.showName}” is settled for ${formatEuro(price)}.`, undefined, 'finance', fromLegal(lawsuit.channelId));
}
