// Regional radio and TV licenses: limited per region, priced by population.
// Licenses issued after the start of the game are auctioned (see auctions.ts).

import { ACTIVE_REGIONS, CPM, DAYS_PER_YEAR, HOME_REGION, LICENSE, LICENSE_BASE_POPULATION, RADIO_LICENSE_SLOTS, RENEWAL, TV_LICENSE_YEARS } from '../config/balance';
import { SLOTS, type Medium, type RegionId } from '../config/world';
import { toCalendarDate } from './calendar';
import { population } from './world';
import type { GameState, Id } from './state';

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

export const MEDIUM_NAMES: Record<Medium, string> = { radio: 'radio', tv: 'TV' };

export function licensePrice(medium: Medium, regionId: RegionId, day: number): number {
  const { basePrice, minPrice } = LICENSE[medium];
  return Math.max(minPrice, roundTo((basePrice * population(regionId, day)) / LICENSE_BASE_POPULATION, 500));
}

export function licenseMonthly(medium: Medium, regionId: RegionId, day: number): number {
  const { baseMonthly, minMonthly } = LICENSE[medium];
  return Math.max(minMonthly, roundTo((baseMonthly * population(regionId, day)) / LICENSE_BASE_POPULATION, 50));
}

/** The reputation (0–1) a channel of the player starts with in a region: a head start at home, none elsewhere. */
export const startReputation = (state: GameState, regionId: RegionId) => (regionId === state.headquarters ? HOME_REGION.startReputation : 0);

/**
 * Licenses the authority has made available by this day: radio grows with the
 * population, TV follows a fixed schedule.
 */
export function licenseSlots(medium: Medium, regionId: RegionId, day: number): number {
  if (medium === 'radio') return RADIO_LICENSE_SLOTS.base + Math.floor(population(regionId, day) / RADIO_LICENSE_SLOTS.peoplePerSlot);
  const year = toCalendarDate(day).year;
  return TV_LICENSE_YEARS[regionId].filter((y) => y <= year).length;
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
export function renewalReserve(medium: Medium, regionId: RegionId, day: number, value: number): number {
  return Math.max(licensePrice(medium, regionId, day), roundTo(value * RENEWAL.reserveYears, 1000));
}

/** The day until which the player can't buy a license of this medium in this region, if any. */
export function barredUntil(state: GameState, medium: Medium, regionId: RegionId): number | undefined {
  return state.licenseBars.find((b) => b.medium === medium && b.regionId === regionId && b.until > state.day)?.until;
}
