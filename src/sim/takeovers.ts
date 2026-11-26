// Buying a rival channel's licence in one region (0.23.0, #476). The price is that region's value to the rival times a premium that rises
// with its rivalry and its money. It imports licences and rivals both, and only commands, bots, the screens, the guide and the sweep import it.

import { ACTIVE_REGIONS, DAYS_PER_YEAR, LICENSE_RAMP, MAX_PLAYER_CHANNELS, TAKEOVER, WHOLE_TAKEOVER } from '../config/balance';
import type { GenreId } from '../config/genres';
import { getRegion, type RegionId } from '../config/world';
import { formatDate } from './calendar';
import { salaryFor } from './economy';
import { barredUntil, licensePrice, licenseRise, MEDIUM_NAMES, playerLicenseMonthly } from './licenses';
import { rivalHostSkill } from './poaching';
import { rivalCeiling, rivalHosts } from './rivals';
import type { GameState, Id, Rival, RivalChannel } from './state';
import { isUnlocked, lockedReason, newTvChannelBlocker, regionOpen, tvChannelsOnAir, tvLicenseBlocker } from './unlocks';

const roundTo = (n: number, step: number) => Math.round(n / step) * step;
const formatEuro = (n: number) => `€${n.toLocaleString('en-IE')}`;

/** The rival that owns a channel, and the channel. */
export function findRivalChannel(state: GameState, rivalChannelId: Id): { rival: Rival; channel: RivalChannel } | null {
  for (const rival of state.rivals) {
    const channel = rival.channels.find((c) => c.id === rivalChannelId);
    if (channel) return { rival, channel };
  }
  return null;
}

/** What a rival channel earns a year in one region, from its last weekly report: its revenue, in the region's share of its listeners. 0 without a report. */
export const regionRevenue = (state: GameState, channel: RivalChannel, regionId: RegionId): number => channelRegionRevenue(state, channel.id, regionId);

/** The same for any channel, one of yours too (#479). */
export function channelRegionRevenue(state: GameState, channelId: Id, regionId: RegionId): number {
  const report = state.weeklyReports[state.weeklyReports.length - 1]?.channels.find((c) => c.channelId === channelId);
  const all = report ? Object.values(report.regionListeners).reduce((sum, n) => sum + (n ?? 0), 0) : 0;
  if (!report || all <= 0) return 0;
  const weekly = state.weeklyReports[state.weeklyReports.length - 1]!;
  return (report.revenue / Math.max(1, weekly.days)) * DAYS_PER_YEAR * ((report.regionListeners[regionId] ?? 0) / all);
}

/** What the licence is worth to the rival: its list price and `revenueMonths` of what the channel earns there. `rivalValue` for one region, without the rival's money. */
export function regionValue(state: GameState, channel: RivalChannel, regionId: RegionId): number {
  return TAKEOVER.worth * (licensePrice(channel.medium, regionId, state) + (TAKEOVER.revenueMonths * regionRevenue(state, channel, regionId)) / 12);
}

/** How much more than its value a rival asks: more the more it minds you and the richer it is. */
export function takeoverPremium(rival: Pick<Rival, 'rivalry' | 'money' | 'personality'>): number {
  const { base, rivalry, purse } = TAKEOVER.premium;
  return base + rivalry * rival.rivalry + purse * Math.min(1, Math.max(0, rival.money) / rivalCeiling(rival.personality));
}

/** What you pay for a rival channel's licence in a region, to the nearest €1,000. */
export function takeoverPrice(state: GameState, rival: Rival, channel: RivalChannel, regionId: RegionId): number {
  return roundTo(regionValue(state, channel, regionId) * takeoverPremium(rival), 1000);
}

/** The channels of yours that could take a licence of that medium in that region. */
export const takeoverChannels = (state: GameState, channel: RivalChannel, regionId: RegionId) =>
  state.channels.filter((c) => c.medium === channel.medium && !state.licenses.some((l) => l.channelId === c.id && l.regionId === regionId));

/** The licence's renewal round is open: it is not for sale until that is over. */
const inRenewal = (state: GameState, rival: Rival, channelId: Id, regionId: RegionId) =>
  state.auctions.some((a) => a.holder?.ownerId === rival.id && a.holder.channelId === channelId && a.regionId === regionId);

/**
 * Why a rival channel's licence in a region cannot be bought now, or null when it can. `channelId` is the channel of yours that would take it;
 * without one, the first channel that could. In order: locked, EPB, a channel's last region, a renewal round, no channel of yours that could take it,
 * a region or a bar, a second TV licence, and the money.
 */
export function takeoverBlocker(state: GameState, rivalChannelId: Id, regionId: RegionId, channelId?: Id): string | null {
  if (!isUnlocked(state, 'takeovers')) return lockedReason('takeovers');
  const found = findRivalChannel(state, rivalChannelId);
  if (!found || !found.channel.regionIds.includes(regionId)) return 'That licence is not for sale.';
  const { rival, channel } = found;
  if (rival.personality === 'highbrow') return `${rival.name} is a public broadcaster and is not for sale.`;
  if (channel.regionIds.length <= 1) return `That is ${channel.name}’s last region: only a whole takeover buys it.`;
  if (inRenewal(state, rival, channel.id, regionId)) return `${channel.name}’s licence in ${getRegion(regionId).name} is up for renewal: bid for it there.`;
  const medium = MEDIUM_NAMES[channel.medium];
  const mine = channelId === undefined ? takeoverChannels(state, channel, regionId)[0] : state.channels.find((c) => c.id === channelId);
  if (!mine) return `You have no ${medium} channel that could take it.`;
  if (mine.medium !== channel.medium) return `That is a ${medium} licence: only a ${medium} channel can take it.`;
  if (state.licenses.some((l) => l.channelId === mine.id && l.regionId === regionId)) return `${mine.name} already broadcasts in ${getRegion(regionId).name}.`;
  if (!ACTIVE_REGIONS.includes(regionId)) return `${getRegion(regionId).name} isn’t open yet.`;
  if (!regionOpen(state, regionId)) return `You can’t buy a license outside your regions yet. ${lockedReason('regions')}`;
  const barred = barredUntil(state, channel.medium, regionId);
  if (barred !== undefined) return `You gave up or lost a ${medium} license in ${getRegion(regionId).name}; the authority won’t let you hold another there until ${formatDate(barred)}.`;
  const tvBlocker = channel.medium === 'tv' ? tvLicenseBlocker(state, mine.id) : null;
  if (tvBlocker) return tvBlocker;
  const price = takeoverPrice(state, rival, channel, regionId);
  if (state.money < price) return `Not enough money (${formatEuro(price)} needed).`;
  return null;
}

/** Where the licence's ramp starts, so a bought licence reaches `TAKEOVER.listeners` of the region on the first day: the day it counts from. */
export function takeoverSince(day: number): number {
  return day - Math.round(((TAKEOVER.listeners - LICENSE_RAMP.start) / (1 - LICENSE_RAMP.start)) * LICENSE_RAMP.days);
}

/** What a takeover costs and brings, for a bot or a card: the price, the yearly revenue the rival makes there and the yearly fees it adds on your side (its own, and for radio the rise in your other radio fees). */
export function takeoverTerms(state: GameState, rival: Rival, channel: RivalChannel, regionId: RegionId) {
  const price = takeoverPrice(state, rival, channel, regionId);
  // What the region earns in your hands, on the same scale as its value.
  const revenue = TAKEOVER.worth * regionRevenue(state, channel, regionId);
  // The new fee, and for radio the rise in every radio fee you already pay.
  const held = state.licenses.filter((l) => l.medium === 'radio').reduce((sum, l) => sum + playerLicenseMonthly(state, 'radio', l.regionId), 0);
  const rise = channel.medium === 'radio' ? held * (licenseRise(state, 1) / licenseRise(state, 0) - 1) : 0;
  const fee = 12 * (playerLicenseMonthly(state, channel.medium, regionId, 1) + rise);
  return { price, revenue, fee };
}

// --- A whole rival (0.23.0, #477) ---

/** What a whole rival costs, to the nearest €1,000: its money and what each of its regions is worth to you, times the takeover premium and a little more. Above its regions bought one at a time. */
export function wholeTakeoverPrice(state: GameState, rival: Rival): number {
  const regions = rival.channels.reduce((sum, c) => sum + c.regionIds.reduce((s, r) => s + regionValue(state, c, r), 0), 0);
  return roundTo((Math.max(0, rival.money) + regions) * (takeoverPremium(rival) + WHOLE_TAKEOVER.extraPremium), 1000);
}

/** A rival's regions that would come to you with its channel: those where you are not barred from the licence. */
export const keptRegions = (state: GameState, channel: RivalChannel): RegionId[] => channel.regionIds.filter((r) => barredUntil(state, channel.medium, r) === undefined);

/** A host who would join you with the rival: the fame and genre of their best show, the skill that shows, and the monthly salary at the going rate (no poaching premium). */
export interface TakeoverHost {
  name: string;
  fame: number;
  genre: GenreId;
  skill: number;
  salary: number;
}

export function wholeTakeoverHosts(state: GameState, rival: Rival): TakeoverHost[] {
  return rivalHosts(state, rival).map(({ name, fame }) => {
    const shows = rival.channels.flatMap((c) => c.schedule).filter((s) => s.hostName === name);
    const best = shows.reduce((a, b) => (b.quality > a.quality ? b : a));
    const skill = rivalHostSkill(best, state);
    return { name, fame, genre: best.genre, skill, salary: salaryFor('host', skill, fame, state) };
  });
}

/** A rival's name, also once you have bought it; undefined for an id that was never a rival. */
export const rivalNameOf = (state: GameState, id: Id): string | undefined => state.rivals.find((r) => r.id === id)?.name ?? state.boughtRivals?.find((r) => r.id === id)?.name;

/** Whether the rival is EPB, the public broadcaster: not for sale. */
export const isPublic = (rival: Rival) => rival.personality === 'highbrow';

/**
 * Why a whole rival cannot be bought now, or null when it can. `keep` is the rival's channels (by id) you would run on: the others close.
 * In order: locked, EPB, a licence in a renewal round, more channels than you can run, a second TV licence, and the money.
 */
export function wholeTakeoverBlocker(state: GameState, rivalId: Id, keep: Id[]): string | null {
  if (!isUnlocked(state, 'wholeTakeover')) return lockedReason('wholeTakeover');
  const rival = state.rivals.find((r) => r.id === rivalId);
  if (!rival) return 'That rival is not for sale.';
  if (isPublic(rival)) return `${rival.name} is a public broadcaster and is not for sale.`;
  if (state.auctions.some((a) => a.holder?.ownerId === rival.id)) return `One of ${rival.name}’s licences is up for renewal: wait until that round is over.`;
  if (keep.some((id) => !rival.channels.some((c) => c.id === id)) || new Set(keep).size !== keep.length) return 'That is not one of its channels.';
  if (state.channels.length + keep.length > MAX_PLAYER_CHANNELS) return `You can run up to ${MAX_PLAYER_CHANNELS} channels: close ${state.channels.length + keep.length - MAX_PLAYER_CHANNELS} of theirs.`;
  const keptTv = rival.channels.filter((c) => keep.includes(c.id) && c.medium === 'tv' && keptRegions(state, c).length > 0);
  // Each kept TV channel is a new TV channel on air.
  for (let i = 0; i < keptTv.length; i++) {
    const tvBlocker = newTvChannelBlocker(state, tvChannelsOnAir(state) + i);
    if (tvBlocker) return tvBlocker;
  }
  const price = wholeTakeoverPrice(state, rival);
  if (state.money < price) return `Not enough money (${formatEuro(price)} needed).`;
  return null;
}

/** What a whole takeover costs and brings, for a card or a bot: the price, the rival's money that comes with it, the yearly revenue of the kept channels, the yearly fees they add and the hosts' yearly salaries. */
export function wholeTakeoverTerms(state: GameState, rival: Rival, keep: Id[]) {
  const price = wholeTakeoverPrice(state, rival);
  const kept = rival.channels.filter((c) => keep.includes(c.id));
  const revenue = kept.reduce((sum, c) => sum + keptRegions(state, c).reduce((s, r) => s + TAKEOVER.worth * regionRevenue(state, c, r), 0), 0);
  const added = kept.reduce((n, c) => n + (c.medium === 'radio' ? keptRegions(state, c).length : 0), 0);
  const held = state.licenses.filter((l) => l.medium === 'radio').reduce((sum, l) => sum + playerLicenseMonthly(state, 'radio', l.regionId), 0);
  const rise = added > 0 ? held * (licenseRise(state, added) / licenseRise(state, 0) - 1) : 0;
  const fees = 12 * (rise + kept.reduce((sum, c) => sum + keptRegions(state, c).reduce((s, r) => s + playerLicenseMonthly(state, c.medium, r, added), 0), 0));
  const hosts = wholeTakeoverHosts(state, rival);
  const salaries = 12 * hosts.reduce((sum, h) => sum + h.salary, 0);
  return { price, money: Math.max(0, rival.money), revenue, fees, salaries, hosts };
}

/** The private rival that costs least to buy, or null when none is for sale (only EPB is left). */
export function weakestRival(state: GameState): Rival | null {
  const priced = state.rivals.filter((r) => !isPublic(r)).map((rival) => ({ rival, price: wholeTakeoverPrice(state, rival) }));
  priced.sort((a, b) => a.price - b.price || a.rival.id.localeCompare(b.rival.id));
  return priced[0]?.rival ?? null;
}

/** Every licence a rival has for sale that you could buy, if you had the money: (rival channel, region), with the first channel of yours that could take it. */
export function takeoversForSale(state: GameState): { rival: Rival; channel: RivalChannel; regionId: RegionId; mine: Id }[] {
  const sale: { rival: Rival; channel: RivalChannel; regionId: RegionId; mine: Id }[] = [];
  if (!isUnlocked(state, 'takeovers')) return sale;
  for (const rival of state.rivals) {
    for (const channel of rival.channels) {
      for (const regionId of channel.regionIds) {
        const blocker = takeoverBlocker(state, channel.id, regionId);
        // Only the money may be missing.
        if (blocker !== null && !blocker.startsWith('Not enough money')) continue;
        const mine = takeoverChannels(state, channel, regionId)[0];
        if (mine) sale.push({ rival, channel, regionId, mine: mine.id });
      }
    }
  }
  return sale;
}
