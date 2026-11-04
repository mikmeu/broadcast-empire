// Ad minutes an hour (0.21.0, #358): each of the player's channels has a dial for how long its ad breaks are. More
// minutes bring more ad money today; listeners like the channel less at once, and its reputation drifts down slowly.
// The law limits the minutes (6, and 5 from 1 January 1972); a channel over it risks a complaint to the authority
// (see sim/regulator.ts). At ADS.neutral the game earns what it earned before the dial. See ADS in balance.ts.

import { ADS } from '../config/balance';
import { toCalendarDate, toDay } from './calendar';
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

/** How many minutes a channel runs over the limit on a day; 0 within it. */
export const minutesOver = (channel: Pick<Channel, 'adMinutes'>, day: number) => Math.max(0, channel.adMinutes - adLimit(day));

/** The chance of a complaint about the breaks today. */
export const adComplaintChance = (channel: Pick<Channel, 'adMinutes'>, day: number) => Math.min(1, minutesOver(channel, day) * ADS.complaint);
