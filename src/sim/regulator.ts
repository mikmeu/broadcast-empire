// The broadcasting authority (0.19.0): three rules for the player's channels, complaints from viewers when one is
// broken, and a fine when the authority upholds a complaint. A license's record counts at its renewal round.
// A film for adults may air only in the late-night slot; a channel may air one slot of teleshopping a day; and
// a license airs news in a fifth of its slots. The rivals keep the rules, so nothing here looks at them.
// Lawyers at a desk make a complaint less likely to be upheld (see sim/legal.ts). See REGULATOR in balance.ts.

import { LEGAL, REGULATOR, RENEWAL } from '../config/balance';
import { getRegion, SLOTS, SLOT_NAMES, type RegionId } from '../config/world';
import { costFactor } from './difficulty';
import { ADULT_FROM } from './content';
import { spend } from './economy';
import type { From } from './inbox';
import { lawyerCut, seedOf } from './legal';
import type { Desks } from './office';
import { Rng } from './rng';
import { addMessage, newId, type Complaint, type DayResult, type GameState, type Id, type License, type LicenseRecord, type Rule, type Show } from './state';

const formatEuro = (n: number) => `€${Math.round(n).toLocaleString('en-IE')}`;

const NEWS_GENRES: readonly string[] = ['news', 'tvNews'];

/** What a rule says, for the messages and the Licenses window. */
export const RULE_NAMES: Record<Rule, string> = {
  adult: 'Films for adults only late at night',
  teleshopping: `No more than ${REGULATOR.teleshoppingSlots} slot of teleshopping a day`,
  news: `News in ${Math.round(REGULATOR.newsShare * 100)}% of the slots`,
};

/** A clean record: a license starts every term with one. */
export const newRecord = (): LicenseRecord => ({ upheld: 0, newsSlots: 0, slots: 0 });

/** A license's record; one made before 0.19.0 gets a clean one. */
export function recordOf(license: License): LicenseRecord {
  return (license.record ??= newRecord());
}

/** The share of its slots a license has aired news in this term, or null before it has aired enough to be judged. */
export function newsShare(license: License): number | null {
  const record = recordOf(license);
  return record.slots < REGULATOR.newsMinSlots ? null : record.newsSlots / record.slots;
}

/** Whether a license has missed the news rule this term. */
export const missedNews = (license: License) => (newsShare(license) ?? 1) < REGULATOR.newsShare;

/** The holder's advantage at renewal: RENEWAL.holderAdvantage, less what the record costs; never below nothing. */
export function holderAdvantage(license: License | undefined): number {
  if (!license) return RENEWAL.holderAdvantage;
  const cut = recordOf(license).upheld * REGULATOR.upheldCut + (missedNews(license) ? REGULATOR.newsCut : 0);
  return Math.max(0, RENEWAL.holderAdvantage - cut);
}

/** What the renewal message says about the record, or nothing when it is clean. */
export function recordNote(license: License): string {
  const { upheld } = recordOf(license);
  const missed = missedNews(license);
  if (upheld === 0 && !missed) return '';
  const parts = [upheld > 0 ? `${upheld} upheld complaint${upheld === 1 ? '' : 's'} this term` : '', missed ? 'too little news' : ''].filter(Boolean);
  return ` The authority’s record counts against you: ${parts.join(' and ')}. Your advantage is ${Math.round(holderAdvantage(license) * 100)}%.`;
}

const fromAuthority = (channelId: Id): From => ({ desk: 'legal', channelId });

/** The chance a complaint is upheld today: REGULATOR.upheld, less what the lawyers cut, and never below LEGAL.minLoss. */
export function upheldChance(state: GameState, desked: Desks): number {
  return Math.max(LEGAL.minLoss, REGULATOR.upheld - lawyerCut(state, desked));
}

/** The license a complaint counts against. */
const licenseOf = (state: GameState, channelId: Id, regionId: RegionId) => state.licenses.find((l) => l.channelId === channelId && l.regionId === regionId);

/** What a fine is today: REGULATOR.fine.min or some days of the channel's ad income, doubled for a repeat of the rule within a year. */
export function fineFor(state: GameState, channelId: Id, rule: Rule, adIncome: number): number {
  const repeat = state.complaints.some((c) => c.channelId === channelId && c.rule === rule && c.upheld !== false && c.filedOn > state.day - REGULATOR.repeatDays);
  const base = Math.max(REGULATOR.fine.min, adIncome * REGULATOR.fine.adDays) * costFactor(state);
  return Math.round((base * (repeat ? 2 : 1)) / 100) * 100;
}

function file(draft: GameState, rule: Rule, channelId: Id, regionId: RegionId, text: string, adIncome: number): void {
  if (draft.complaints.some((c) => c.channelId === channelId && c.rule === rule && c.upheld === null)) return;
  const complaint: Complaint = { id: newId(draft, 'cp'), rule, channelId, regionId, text, filedOn: draft.day, decideOn: draft.day + REGULATOR.decideDays, fine: fineFor(draft, channelId, rule, adIncome), upheld: null };
  draft.complaints.push(complaint);
  addMessage(draft, 'warning', `${text} The authority decides on it in ${REGULATOR.decideDays} days; a fine of ${formatEuro(complaint.fine)} is at stake. The record is on the Licenses screen.`, undefined, 'licenses', fromAuthority(channelId));
}

/** The region a channel's slot is mostly watched in: where the viewers who complain live. */
function mainRegion(state: GameState, channelId: Id, regionListeners: Partial<Record<RegionId, number>>): RegionId | undefined {
  const held = state.licenses.filter((l) => l.channelId === channelId).map((l) => l.regionId);
  return [...held].sort((a, b) => (regionListeners[b] ?? 0) - (regionListeners[a] ?? 0))[0];
}

const genreOf = (state: GameState, showId: Id | null): Show['genre'] | undefined => state.shows.find((s) => s.id === showId)?.genre;

/**
 * Daily, with the day's results and before the library is updated: the rules are checked for each of the player's
 * channels on the air, and each of its licenses adds the day's slots to its record. Call it before `updateLibrary`,
 * which drops a title that has aired its last.
 */
export function checkRules(draft: GameState, result: DayResult): void {
  for (const day of result.channels) {
    if (!day.isPlayer || !day.onAir) continue;
    const channel = draft.channels.find((c) => c.id === day.channelId);
    if (!channel) continue;
    const licenses = draft.licenses.filter((l) => l.channelId === channel.id);
    const news = day.slots.filter((s) => s.showId && NEWS_GENRES.includes(genreOf(draft, s.showId) ?? '')).length;
    for (const license of licenses) {
      const record = recordOf(license);
      record.slots += day.slots.length;
      record.newsSlots += news;
    }
    const region = mainRegion(draft, channel.id, day.regionListeners);
    if (!region) continue;
    const adIncome = day.slots.reduce((sum, s) => sum + s.revenue, 0);
    const name = `${channel.name}`;
    const where = `Viewers in ${getRegion(region).name} complained`;

    const late = day.slots.findIndex((s, i) => s.titleId && i < ADULT_FROM && draft.library.find((t) => t.id === s.titleId)?.adult);
    if (late >= 0) file(draft, 'adult', channel.id, region, `${where}: a film for adults aired in the ${SLOT_NAMES[SLOTS[late]!].toLowerCase()} slot on ${name}.`, adIncome);

    const shopping = day.slots.filter((s) => s.titleId && genreOf(draft, s.showId) === 'teleshopping').length;
    if (shopping > REGULATOR.teleshoppingSlots) file(draft, 'teleshopping', channel.id, region, `${where}: ${shopping} slots of teleshopping in one day on ${name}.`, adIncome);
  }
}

/** On 1 January: a channel whose license has aired too little news this term draws a complaint. */
export function checkNews(draft: GameState): void {
  for (const license of draft.licenses) {
    if (!missedNews(license)) continue;
    const channel = draft.channels.find((c) => c.id === license.channelId);
    if (!channel) continue;
    const adIncome = draft.lastDay?.channels.find((c) => c.channelId === channel.id)?.slots.reduce((sum, s) => sum + s.revenue, 0) ?? 0;
    const share = Math.round((newsShare(license) ?? 0) * 100);
    file(draft, 'news', channel.id, license.regionId, `Viewers in ${getRegion(license.regionId).name} complained: ${channel.name} airs hardly any news, ${share}% of its slots, and its license asks for ${Math.round(REGULATOR.newsShare * 100)}%.`, adIncome);
  }
}

/** Daily: every open complaint whose day has come is decided. Upheld, the fine is paid and the license's record shows it. */
export function decideComplaints(draft: GameState, desked: Desks): void {
  const chance = upheldChance(draft, desked);
  for (const complaint of draft.complaints) {
    if (complaint.upheld !== null || complaint.decideOn > draft.day) continue;
    complaint.upheld = new Rng(seedOf(`${draft.seed}:${complaint.id}@${draft.day}`)).next() < chance;
    if (complaint.upheld) {
      spend(draft, complaint.fine, 'fines');
      const license = licenseOf(draft, complaint.channelId, complaint.regionId);
      if (license) recordOf(license).upheld += 1;
      addMessage(draft, 'danger', `The authority has upheld the complaint and fined you ${formatEuro(complaint.fine)}. It goes on the license’s record, and counts at the renewal.`, undefined, 'licenses', fromAuthority(complaint.channelId));
    } else {
      addMessage(draft, 'good', 'The authority has thrown out the complaint. No fine, and nothing on the record.', undefined, 'licenses', fromAuthority(complaint.channelId));
    }
  }
  draft.complaints = draft.complaints.filter((c) => c.upheld === null || c.decideOn > draft.day - REGULATOR.keepDays);
}

/** A license starts a new term with a clean record. */
export function startTerm(license: License): void {
  license.record = newRecord();
}
