// Buying a rival channel's licence in one region (0.23.0, #476). The price is that region's value to the rival times a premium that rises
// with its rivalry and its money. It imports licences and rivals both, and only commands, bots, the screens, the guide and the sweep import it.

import { ACTIVE_REGIONS, DAYS_PER_YEAR, LICENSE_RAMP, TAKEOVER } from '../config/balance';
import { getRegion, type RegionId } from '../config/world';
import { formatDate } from './calendar';
import { barredUntil, licensePrice, licenseRise, MEDIUM_NAMES, playerLicenseMonthly } from './licenses';
import { rivalCeiling } from './rivals';
import type { GameState, Id, Rival, RivalChannel } from './state';
import { isUnlocked, lockedReason, mayBuyTvLicense, regionOpen } from './unlocks';

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
export function regionRevenue(state: GameState, channel: RivalChannel, regionId: RegionId): number {
  const report = state.weeklyReports[state.weeklyReports.length - 1]?.channels.find((c) => c.channelId === channel.id);
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
  if (channel.medium === 'tv' && !mayBuyTvLicense(state)) return `You hold a TV license already. ${lockedReason('secondTvLicense')}`;
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
