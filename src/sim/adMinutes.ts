// Ad minutes an hour (0.21.0, #358): each of the player's channels has a dial for how long its ad breaks are. More
// minutes bring more ad money today; listeners like the channel less at once, and its reputation drifts down slowly.
// The law limits the minutes (6, and 5 from 1 January 1972); a channel over it risks a complaint to the authority
// (see sim/regulator.ts). At ADS.neutral the game earns what it earned before the dial. See ADS in balance.ts.

import { ADS } from '../config/balance';
import { toCalendarDate, toDay } from './calendar';
import type { Medium, RegionId } from '../config/world';
import type { Channel } from './state';

/** The day the shorter limit takes effect: 1 January of ADS.lawYear. */
export const AD_LAW_DAY = toDay(ADS.lawYear, 1, 1);
/** The day Parliament passes it: a month before. */
export const AD_LAW_NEWS_DAY = toDay(ADS.lawYear - 1, 12, 1);

/** The most minutes of ads an hour the law allows on a day. */
export const adLimit = (day: number) => (toCalendarDate(day).year >= ADS.lawYear ? ADS.lawLimit : ADS.limit);

/** How many ads of ADS.adMinutes fit in the minutes of an hour. */
export const adsIn = (minutes: number) => Math.round(minutes / ADS.adMinutes);

/** Ad money against the neutral dial: 1 at ADS.neutral. */
export const adIncome = (minutes: number) => minutes / ADS.neutral;

/** What listeners make of the breaks, as a multiplier on appeal: 1 at ADS.neutral, less above it. */
export const adAppeal = (minutes: number) => 1 - ADS.appeal * (minutes - ADS.neutral);

/** What the breaks do to the reputation a channel works towards: 1 at ADS.neutral, less above it. */
export const adReputation = (minutes: number) => 1 - ADS.reputation * (minutes - ADS.neutral);

/**
 * The minutes an hour advertisers want to buy in a slot (0.21.0, #363): ADS.demand.floor, plus the rest up to ADS.demand.full by the
 * slot's listeners and the channel's reputation (0 to 1), plus what salespeople on airtime find; ADS.max at the most.
 */
export function adDemand(listeners: number, reputation: number, sellers: number, medium: Medium): number {
  const { floor, full, fullAt, reputationShare } = ADS.demand;
  const audience = Math.min(1, listeners / fullAt[medium]);
  const name = 1 - reputationShare + reputationShare * Math.max(0, Math.min(1, reputation));
  return Math.min(ADS.max, floor + (full - floor) * audience * name + sellers);
}

/** The minutes that sell: the dial, or what advertisers want if that is less. */
export const adSold = (dial: number, demand: number) => Math.min(dial, demand);

/** A channel's reputation, 0 to 1: its average over the regions it reaches. */
export function averageReputation(reputation: Partial<Record<RegionId, number>>, regionIds: readonly RegionId[]): number {
  if (regionIds.length === 0) return 0;
  return regionIds.reduce((sum, r) => sum + (reputation[r] ?? 0), 0) / regionIds.length;
}

/** How many minutes a channel runs over the limit on a day; 0 within it. */
export const minutesOver = (channel: Pick<Channel, 'adMinutes'>, day: number) => Math.max(0, channel.adMinutes - adLimit(day));

/** The chance of a complaint about the breaks today. */
export const adComplaintChance = (channel: Pick<Channel, 'adMinutes'>, day: number) => Math.min(1, minutesOver(channel, day) * ADS.complaint);
