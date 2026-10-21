// What the game tells the player about their schedule (0.13.0): who is tuned in
// to a slot and how well a show suits it, how the channel specializes, how long
// the bought titles last and how fresh they stay, and why a slot's audience
// moved since a week ago. None of it changes the simulation.

import { CONTENT, OFF_AIR_WARNING, SPECIALIZATION } from '../config/balance';
import { GENRES, getGenre, type GenreGroup, type GenreId } from '../config/genres';
import { AUDIENCES, SLOTS, SLOT_NAMES, type AudienceId } from '../config/world';
import { channelOffAirReason, channelRegions, showQuality, slotFactors } from './broadcast';
import type { Desks } from './office';
import { isLicensed } from './content';
import { fromChannel } from './inbox';
import { addMessage, PLAYER, type Channel, type GameState, type Id, type SlotFactors, type SlotSnapshot } from './state';
import { reach } from './world';

// --- What a show earns ---

/** What a show earned yesterday on the channel it is on: in all, what its sponsor added, and a teleshopping fee. */
export function showEarnings(state: GameState, showId: Id): { revenue: number; sponsor: number; fee: number } | null {
  for (const channel of state.lastDay?.channels.filter((c) => c.isPlayer) ?? []) {
    const slot = channel.slots.find((s) => s.showId === showId);
    if (slot) return { revenue: slot.revenue, sponsor: slot.sponsorRevenue ?? 0, fee: slot.fee ?? 0 };
  }
  return null;
}

// --- Who is tuned in, and what suits them ---

export interface SlotAudience {
  audience: AudienceId;
  /** People of this audience tuned in to the medium where the channel broadcasts. */
  people: number;
  /** What advertisers pay for them, against an average listener (1). */
  value: number;
}

/** Who is tuned in to a channel's medium in a slot, over the regions it broadcasts in (or its first region to come). */
export function slotAudience(state: GameState, channel: Channel, slot: number): SlotAudience[] {
  const regions = channelRegions(state, channel.id);
  const where = regions.length > 0 ? regions : [state.headquarters];
  return AUDIENCES.map((a) => ({
    audience: a.id,
    people: where.reduce((sum, regionId) => sum + reach(regionId, channel.medium, slot, a.id, state.day), 0),
    value: a.sponsorValue,
  }));
}

export type Suitability = 'good' | 'fair' | 'poor';

/** How well a genre suits who is tuned in to a slot: its fit for each audience, counted by people and what they are worth. */
export function suitability(audience: readonly SlotAudience[], genre: GenreId): { score: number; label: Suitability } {
  const fit = getGenre(genre).fit;
  const weight = audience.reduce((sum, a) => sum + a.people * a.value, 0);
  const score = weight > 0 ? audience.reduce((sum, a) => sum + a.people * a.value * fit[a.audience], 0) / weight : 0;
  return { score, label: score >= 0.75 ? 'good' : score >= 0.55 ? 'fair' : 'poor' };
}

/** The genres of a medium that suit a slot best, best first. */
export function bestGenres(audience: readonly SlotAudience[], medium: Channel['medium'], available: (genre: GenreId) => boolean, count = 3): GenreId[] {
  return GENRES.filter((g) => g.medium === medium && g.id !== 'teleshopping' && available(g.id))
    .map((g) => ({ id: g.id, score: suitability(audience, g.id).score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((g) => g.id);
}

// --- Specialization ---

export interface Specialization {
  /** The group that has the bonus, if one has enough slots. */
  group: GenreGroup | null;
  /** Slots per group on the schedule. */
  counts: Partial<Record<GenreGroup, number>>;
  /** A group one slot short of the bonus, if there is one and no group has it. */
  almost: GenreGroup | null;
}

export function channelGroups(state: GameState, channel: Channel): Specialization {
  const counts: Partial<Record<GenreGroup, number>> = {};
  for (const id of channel.schedule) {
    const show = state.shows.find((s) => s.id === id);
    if (!show) continue;
    const group = getGenre(show.genre).group;
    counts[group] = (counts[group] ?? 0) + 1;
  }
  const entries = Object.entries(counts) as [GenreGroup, number][];
  const group = entries.find(([, n]) => n >= SPECIALIZATION.minSlots)?.[0] ?? null;
  const almost = group ? null : (entries.find(([, n]) => n === SPECIALIZATION.minSlots - 1)?.[0] ?? null);
  return { group, counts, almost };
}

// --- Bought titles: how long they last, how fresh they stay ---

export interface TitleSupply {
  genre: GenreId;
  /** Airings left in the library. */
  left: number;
  /** Slots that air this genre every day, on all channels. */
  perDay: number;
  /** Days until the library has none left: Infinity when nothing airs them. */
  days: number;
  /** Titles of the genre in the library. */
  titles: number;
}

/** For every bought genre on a schedule: how many airings are left, and for how many days. */
export function titleSupply(state: GameState): TitleSupply[] {
  const perDay = new Map<GenreId, number>();
  for (const channel of state.channels) {
    for (const id of channel.schedule) {
      const show = state.shows.find((s) => s.id === id);
      if (show && isLicensed(show.genre)) perDay.set(show.genre, (perDay.get(show.genre) ?? 0) + 1);
    }
  }
  return [...perDay].map(([genre, n]) => {
    const titles = state.library.filter((t) => t.genre === genre);
    const left = titles.reduce((sum, t) => sum + t.airingsLeft, 0);
    return { genre, left, perDay: n, days: n > 0 ? Math.floor(left / n) : Infinity, titles: titles.length };
  });
}

/** Days of bought titles left at which the game warns. */
export const TITLES_LOW_DAYS = 7;

/**
 * The freshness a programme's titles settle at when it has this many and airs one
 * of them a day: each airs every `titles` days, losing CONTENT.freshnessPerAiring
 * and regaining CONTENT.freshnessRecovery a day in between.
 */
export function settledFreshness(titles: number): number {
  if (titles <= 0) return 0;
  const rest = CONTENT.freshnessRecovery * (titles - 1);
  return Math.max(CONTENT.minFreshness, Math.min(1, rest / (1 - CONTENT.freshnessPerAiring)));
}

/** The fewest titles that keep a programme that airs every day at full freshness. */
export const TITLES_FOR_FULL_FRESHNESS = Math.ceil(1 + (1 - CONTENT.freshnessPerAiring) / CONTENT.freshnessRecovery);

/** Daily: news when a bought genre has a week left, and when it has none left. */
export function warnAboutTitles(draft: GameState, before: readonly TitleSupply[]): void {
  for (const supply of titleSupply(draft)) {
    const was = before.find((b) => b.genre === supply.genre);
    if (!was || was.perDay !== supply.perDay) continue;
    const name = getGenre(supply.genre).name.toLowerCase();
    if (supply.left === 0 && was.left > 0) {
      addMessage(draft, 'warning', `Your library has no ${name} left: the ${name} programme airs reruns until you buy more.`, undefined, 'broadcast:content');
    } else if (supply.days <= TITLES_LOW_DAYS && was.days > TITLES_LOW_DAYS && supply.left > 0) {
      addMessage(draft, 'warning', `The ${name} in your library last ${supply.days} more day${supply.days === 1 ? '' : 's'}. Buy more on the content market before the programme falls back on reruns.`, undefined, 'broadcast:content');
    }
  }
}

// --- Why a slot's audience moved ---

const key = (channelId: Id, slot: number) => `${channelId}:${slot}`;

/** The figures of every slot of the player's channels as they stand, for the comparison a week later. */
export function snapshotSlots(state: GameState): Record<string, SlotSnapshot> {
  const snapshot: Record<string, SlotSnapshot> = {};
  for (const channel of state.channels) {
    const today = state.lastDay?.channels.find((c) => c.channelId === channel.id);
    slotFactors(state, channel.id).forEach((factors, slot) => {
      const showId = channel.schedule[slot];
      if (factors && showId) snapshot[key(channel.id, slot)] = { ...factors, showId, listeners: today?.slots[slot]?.listeners ?? 0 };
    });
  }
  return snapshot;
}

export const snapshotOf = (state: GameState, channelId: Id, slot: number): SlotSnapshot | undefined => state.weekAgo?.[key(channelId, slot)];

export interface Change {
  factor: 'quality' | 'freshness' | 'reputation' | 'fame' | 'promotion' | 'bonus' | 'rival' | 'tunedIn';
  /** What it does to the show's share, as a ratio of its appeal (or the audience): below 1 costs viewers. */
  effect: number;
}

/** How each part moved since the snapshot, as its effect on the show, the largest first. */
export function changesSince(before: SlotFactors, now: SlotFactors): Change[] {
  const ratio = (a: number, b: number) => (b > 0 ? a / b : 1);
  const changes: Change[] = [
    { factor: 'quality', effect: ratio(now.quality, before.quality) },
    { factor: 'freshness', effect: ratio(now.freshness, before.freshness) },
    { factor: 'reputation', effect: ratio(0.5 + now.reputation, 0.5 + before.reputation) },
    { factor: 'fame', effect: ratio(1 + now.fame / 200, 1 + before.fame / 200) },
    { factor: 'promotion', effect: ratio(1 + now.promotion, 1 + before.promotion) },
    { factor: 'bonus', effect: ratio(now.bonus, before.bonus) },
    // A stronger rival costs share as if our own appeal had fallen by as much.
    { factor: 'rival', effect: now.rival && before.rival ? ratio(before.rival.appeal, now.rival.appeal) : 1 },
    { factor: 'tunedIn', effect: ratio(now.tunedIn, before.tunedIn) },
  ];
  return changes.filter((c) => Math.abs(c.effect - 1) >= 0.01).sort((a, b) => Math.abs(Math.log(b.effect)) - Math.abs(Math.log(a.effect)));
}

/** A change in words: "its freshness fell from 80% to 62%". */
export function describeChange(change: Change, before: SlotFactors, now: SlotFactors, licensed: boolean): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const moved = (from: number, to: number) => `${to < from ? 'fell' : 'rose'} from ${pct(from)} to ${pct(to)}`;
  switch (change.factor) {
    case 'quality':
      return `its quality ${moved(before.quality, now.quality)}`;
    case 'freshness':
      return licensed ? `its titles' freshness ${moved(before.freshness, now.freshness)}` : `its freshness ${moved(before.freshness, now.freshness)}`;
    case 'reputation':
      return `the channel's reputation ${moved(before.reputation, now.reputation)}`;
    case 'fame':
      return `its host's fame ${change.effect < 1 ? 'fell' : 'rose'} from ${Math.round(before.fame)} to ${Math.round(now.fame)}`;
    case 'promotion':
      return change.effect < 1 ? 'its marketing is fading' : 'marketing lifts it';
    case 'bonus':
      return change.effect < 1 ? 'it lost a bonus (specialization, a music scheduler or sports rights)' : 'it gained a bonus (specialization, a music scheduler or sports rights)';
    case 'rival':
      return change.effect < 1 ? `a stronger rival: “${now.rival!.program}” on ${now.rival!.channel}` : `the rivals are weaker: “${now.rival!.program}” on ${now.rival!.channel} is the strongest now`;
    case 'tunedIn':
      return `${change.effect < 1 ? 'fewer' : 'more'} people are tuned in`;
  }
}

/** Share of its audience a slot has to lose in a week before the news says why. */
export const LOSS_WORTH_NEWS = 0.15;

/** A slot that lost much of its audience with the same show, in a sentence that says why. */
export interface Loss {
  text: string;
}

/**
 * Weekly, before the new snapshot: each slot that lost much of its audience
 * with the same show, and why. They go in the weekly ratings e-mail (see
 * `fileWeeklyReport` in tick.ts), not in one e-mail each.
 */
export function reportLosses(draft: GameState): Loss[] {
  const losses: Loss[] = [];
  if (!draft.weekAgo) return losses;
  for (const channel of draft.channels) {
    const today = draft.lastDay?.channels.find((c) => c.channelId === channel.id && c.ownerId === PLAYER);
    const now = slotFactors(draft, channel.id);
    SLOTS.forEach((slotId, slot) => {
      const before = draft.weekAgo![key(channel.id, slot)];
      const factors = now[slot];
      const listeners = today?.slots[slot]?.listeners ?? 0;
      if (!before || !factors || before.showId !== channel.schedule[slot] || before.listeners <= 0) return;
      if (listeners > before.listeners * (1 - LOSS_WORTH_NEWS)) return;
      const show = draft.shows.find((s) => s.id === before.showId);
      const why = changesSince(before, factors).find((c) => c.effect < 1);
      const lost = Math.round((1 - listeners / before.listeners) * 100);
      const reason = why ? `: ${describeChange(why, before, factors, show ? isLicensed(show.genre) : false)}` : '';
      losses.push({ text: `“${show?.name ?? 'A show'}” on ${channel.name} (${SLOT_NAMES[slotId].toLowerCase()}) drew ${lost}% fewer ${channel.medium === 'tv' ? 'viewers' : 'listeners'} than a week ago${reason}.` });
    });
  }
  return losses;
}

// --- Off the air (0.16.0) ---

/**
 * Why each of the player's channels and scheduled shows does not go out today,
 * by id: a channel that is off the air, and a show on the schedule of a
 * channel that is on the air but that can't go out itself.
 */
export function offAirToday(state: GameState, desked: Desks): Map<Id, string> {
  const off = new Map<Id, string>();
  for (const channel of state.channels) {
    const reason = channelOffAirReason(state, channel, desked);
    if (reason) {
      off.set(channel.id, reason);
      continue;
    }
    for (const id of new Set(channel.schedule)) {
      const show = id ? state.shows.find((s) => s.id === id) : undefined;
      const problem = show && showQuality(state, show, desked).problems[0];
      if (problem && !off.has(show.id)) off.set(show.id, problem);
    }
  }
  return off;
}

/**
 * Daily: keeps count of how long each channel and show has not gone out, and
 * warns once when it has been OFF_AIR_WARNING.days in a row (0.16.0). One that
 * goes out again is forgotten, and warned about again if it stops once more.
 */
export function watchOffAir(draft: GameState, desked: Desks): void {
  const off = offAirToday(draft, desked);
  const watched: GameState['offAir'] = {};
  for (const [id, reason] of off) {
    const known = draft.offAir[id] ?? { since: draft.day, warned: false };
    if (!known.warned && draft.day - known.since + 1 >= OFF_AIR_WARNING.days) {
      known.warned = true;
      const channel = draft.channels.find((c) => c.id === id);
      const show = draft.shows.find((s) => s.id === id);
      const why = reason.charAt(0).toLowerCase() + reason.slice(1);
      if (channel) addMessage(draft, 'danger', `${channel.name} has been off the air for a week: ${why}.`, undefined, 'broadcast:channels', fromChannel(channel.id));
      else if (show) {
        const on = draft.channels.find((c) => c.schedule.includes(show.id));
        addMessage(draft, 'warning', `“${show.name}” has not gone out for a week: ${why}. Its slot plays reruns.`, undefined, 'broadcast:channels', fromChannel(on?.id));
      }
    }
    watched[id] = known;
  }
  draft.offAir = watched;
}
