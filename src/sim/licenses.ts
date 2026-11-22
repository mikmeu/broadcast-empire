// Regional radio and TV licenses: limited per region, priced by population.
// Licenses issued after the start of the game are auctioned (see auctions.ts).

import { ACTIVE_REGIONS, CPM, DAYS_PER_YEAR, HOME_REGION, LICENSE, LICENSE_BASE_POPULATION, LICENSE_RAMP, LICENSE_RISE, RADIO_LICENSE_SLOTS, RENEWAL, SISTER_REPUTATION, TV_LICENSE_YEARS } from '../config/balance';
import { SLOTS, type Medium, type RegionId } from '../config/world';
import { toCalendarDate } from './calendar';
import { costFactor } from './difficulty';
import { population } from './world';
import type { GameState, Id } from './state';

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

export const MEDIUM_NAMES: Record<Medium, string> = { radio: 'radio', tv: 'TV' };

/** A day in a game: prices go by the population then, and by the game's difficulty. */
export type PriceDay = Pick<GameState, 'day' | 'difficulty'>;
/** The prices of 1970 on normal, as the wiki lists them. */
export const LIST_PRICES: PriceDay = { day: 0, difficulty: 'normal' };

export function licensePrice(medium: Medium, regionId: RegionId, at: PriceDay): number {
  const { basePrice, minPrice } = LICENSE[medium];
  return roundTo(costFactor(at) * Math.max(minPrice, (basePrice * population(regionId, at.day)) / LICENSE_BASE_POPULATION), 500);
}

export function licenseMonthly(medium: Medium, regionId: RegionId, at: PriceDay): number {
  const { baseMonthly, minMonthly } = LICENSE[medium];
  return roundTo(costFactor(at) * Math.max(minMonthly, (baseMonthly * population(regionId, at.day)) / LICENSE_BASE_POPULATION), 50);
}

const radioHeld = (state: GameState) => state.licenses.filter((l) => l.medium === 'radio').length;

/** What a license costs the player: the list price, and for radio more for each radio license already held (0.23.0, #430). */
export function playerLicensePrice(state: GameState, medium: Medium, regionId: RegionId): number {
  const rise = medium === 'radio' ? 1 + LICENSE_RISE.price * radioHeld(state) : 1;
  return roundTo(licensePrice(medium, regionId, state) * rise, 500);
}

/** The least the player can bid for a license up for auction: the reserve, and for a new radio license the same rise (#430). A renewal keeps its reserve. */
export function playerAuctionReserve(state: GameState, auction: GameState['auctions'][number]): number {
  if (auction.holder || auction.medium !== 'radio') return auction.reserve;
  return roundTo(auction.reserve * (1 + LICENSE_RISE.price * radioHeld(state)), 500);
}

/** The multiplier on every radio fee the player pays: 1 for the first license, more with each one after (0.23.0, #430). */
export function licenseRise(state: GameState, more = 0): number {
  return Math.min(LICENSE_RISE.maxMonthly, 1 + LICENSE_RISE.monthly * Math.max(0, radioHeld(state) + more - 1));
}

/** The monthly fee of one of the player's licenses; `more` counts radio licenses not bought yet, to show what a purchase would cost. */
export function playerLicenseMonthly(state: GameState, medium: Medium, regionId: RegionId, more = 0): number {
  return roundTo(licenseMonthly(medium, regionId, state) * (medium === 'radio' ? licenseRise(state, more) : 1), 50);
}

/**
 * How much of a region's people a radio license reaches (0.23.0, #430): LICENSE_RAMP.start on the day it was bought,
 * 1 after LICENSE_RAMP.days. A license without a `since` (one from the start, or a saved one) is established.
 */
export function licenseRamp(license: Pick<GameState['licenses'][number], 'since'>, day: number): number {
  if (license.since === undefined) return 1;
  return Math.min(1, LICENSE_RAMP.start + ((1 - LICENSE_RAMP.start) * Math.max(0, day - license.since)) / LICENSE_RAMP.days);
}

/**
 * The reputation (0–1) a channel of the player starts with in a region: a head start at home, none elsewhere, or SISTER_REPUTATION times the
 * best reputation another of the player's channels has there, whichever is more (0.23.0, #436).
 */
export function startReputation(state: GameState, regionId: RegionId): number {
  const own = regionId === state.headquarters ? HOME_REGION.startReputation : 0;
  const sister = Math.max(0, ...state.channels.map((c) => c.reputation[regionId] ?? 0));
  return Math.max(own, SISTER_REPUTATION * sister);
}

/**
 * Licenses the authority has made available by this day: radio grows with the
 * population, TV follows a fixed schedule.
 */
export function licenseSlots(medium: Medium, regionId: RegionId, day: number): number {
  if (medium === 'radio') return RADIO_LICENSE_SLOTS.base + Math.floor(population(regionId, day) / RADIO_LICENSE_SLOTS.peoplePerSlot);
  const year = toCalendarDate(day).year;
  return TV_LICENSE_YEARS[regionId].filter((y) => y <= year).length;
}

/** The year of the next TV license the authority issues in a region, or undefined when none is left. */
export function nextTvLicenseYear(regionId: RegionId, day: number): number | undefined {
  const year = toCalendarDate(day).year;
  return TV_LICENSE_YEARS[regionId].find((y) => y > year);
}

/** Licenses issued so far, per medium and region: what licenseSlots gave at the start, plus later issues. */
export function initialIssued(day: number): GameState['licensesIssued'] {
  const issued = (medium: Medium) => Object.fromEntries(ACTIVE_REGIONS.map((r) => [r, licenseSlots(medium, r, day)]));
  return { radio: issued('radio'), tv: issued('tv') };
}

/** Licenses held by the player and by rival channels in a region. */
export function licensesTaken(state: GameState, medium: Medium, regionId: RegionId): number {
  const player = state.licenses.filter((l) => l.medium === medium && l.regionId === regionId).length;
  const rivals = state.rivals
    .flatMap((r) => r.channels)
    .filter((c) => c.medium === medium && c.regionIds.includes(regionId)).length;
  return player + rivals;
}

/** Licenses that can be bought at the list price right now (not taken and not up for auction). */
export function freeLicenses(state: GameState, medium: Medium, regionId: RegionId): number {
  const issued = state.licensesIssued[medium][regionId] ?? 0;
  // Renewal rounds are for licenses that are still held, so only newly issued ones count here.
  const auctioned = state.auctions.filter((a) => !a.holder && a.medium === medium && a.regionId === regionId).length;
  return Math.max(0, issued - licensesTaken(state, medium, regionId) - auctioned);
}

// --- Renewal rounds ---

/** How long a license runs, in days. */
export const licenseTermDays = () => Math.round(RENEWAL.termYears * DAYS_PER_YEAR);

/**
 * First expiry of a license that exists when a game starts: spread by `index`
 * over the years of the first-term range and over the days of the year, so
 * renewal rounds come one or two at a time.
 */
export function staggeredExpiry(day: number, index: number): number {
  const { min, max } = RENEWAL.firstTermYears;
  return day + Math.round((min + (index % (max - min))) * DAYS_PER_YEAR) + ((index * 53) % 365);
}

/**
 * What a channel's license in a region earns a year in ads at the base rate:
 * its average listeners per slot there in the latest weekly ratings (or
 * yesterday's, before the first report).
 */
export function licenseValue(state: GameState, channelId: Id, regionId: RegionId, medium: Medium): number {
  const report = state.weeklyReports[state.weeklyReports.length - 1]?.channels.find((c) => c.channelId === channelId);
  const yesterday = state.lastDay?.channels.find((c) => c.channelId === channelId);
  const perSlot = report?.regionListeners[regionId] ?? (yesterday?.regionListeners[regionId] ?? 0) / SLOTS.length;
  return ((perSlot * SLOTS.length) / 1000) * CPM[medium] * DAYS_PER_YEAR;
}

/** The least a renewal costs: a share of what the license earns, and never less than a new license. */
export function renewalReserve(medium: Medium, regionId: RegionId, at: PriceDay, value: number): number {
  return Math.max(licensePrice(medium, regionId, at), roundTo(value * RENEWAL.reserveYears, 1000));
}

/** The day until which the player can't buy a license of this medium in this region, if any. */
export function barredUntil(state: GameState, medium: Medium, regionId: RegionId): number | undefined {
  return state.licenseBars.find((b) => b.medium === medium && b.regionId === regionId && b.until > state.day)?.until;
}
