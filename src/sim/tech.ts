// R&D: research points, the techs the player owns and what they do, and
// equipment tiers. Rivals always use the tier that is current for the year.

import { DAYS_PER_YEAR, FURNITURE_WORTH, RESEARCH, TIERS } from '../config/balance';
import { getGenre, type GenreId } from '../config/genres';
import { furnitureSpec, STUDIO_REQUIREMENTS, type FurnitureType } from '../config/office';
import { DECADES, TECHS, getTech, unlockingTech, type Tech, type TechEffects, type TechId, type TechLine } from '../config/tech';
import { toCalendarDate } from './calendar';
import { studioKit } from './office';
import type { Furniture, GameState, RentedRoom } from './state';

export const ownsTech = (state: GameState, id: TechId) => state.techs.includes(id);

const tierOf = (techs: readonly Tech[], line: TechLine) =>
  Math.max(1, ...techs.filter((t) => t.effects.tier?.line === line).map((t) => t.effects.tier!.tier));

/** The tier rivals use in a year: the best one whose historical year has come. */
export function eraTier(line: TechLine, year: number): number {
  return tierOf(TECHS.filter((t) => t.year <= year), line);
}

/** The best tier the player has researched. New equipment is bought at this tier. */
export function ownedTier(state: GameState, line: TechLine): number {
  return tierOf(TECHS.filter((t) => ownsTech(state, t.id)), line);
}

type Multiplier = 'licensedQuality' | 'contentPrice' | 'sportsPrice' | 'tvReach' | 'productionSkill' | 'marketing' | 'fameGrowth' | 'licensedRevenue';

/** Product of an effect over every tech the player owns (1 if none). */
export function techMultiplier(state: GameState, effect: Multiplier): number {
  return TECHS.filter((t) => ownsTech(state, t.id)).reduce((m, t) => m * ((t.effects as TechEffects)[effect] ?? 1), 1);
}

export function extraOffers(state: GameState): number {
  return TECHS.filter((t) => ownsTech(state, t.id)).reduce((n, t) => n + (t.effects.extraOffers ?? 0), 0);
}

/** The player can use a genre once it exists, and, for formats invented later, once it's researched. */
export function genreAvailable(state: GameState, genre: GenreId): boolean {
  const tech = unlockingTech(genre);
  if (tech) return ownsTech(state, tech.id);
  return getGenre(genre).unlockYear <= toCalendarDate(state.day).year;
}

// --- Research ---

export function researchCost(tech: Tech, year: number): number {
  const early = Math.max(0, tech.year - year);
  return Math.round(tech.cost * (1 + RESEARCH.earlyCostPerYear * early));
}

export const decadeOf = (year: number) => Math.floor(year / 10) * 10;

/** The last decade that is open: the one opened with points, or the one the calendar is in. */
export const decadeOpened = (state: GameState) => Math.max(state.decadeReached, decadeOf(toCalendarDate(state.day).year));

/** A decade is open once the calendar is in it or the player has opened it. A tech of a closed decade can't be researched early. */
export const decadeOpen = (state: GameState, decade: number) => decade <= decadeOpened(state);

/** Research points to open a decade: 500 for the 1980s, doubling after. */
export const decadeCost = (decade: number) => Math.round(RESEARCH.decadeCost * RESEARCH.decadeCostGrowth ** Math.max(0, (decade - 1980) / 10));

/** Why a decade can't be opened yet, or null. Decades open in order, from `maxYearsEarly` years before they start. */
export function decadeBlocker(state: GameState, decade: number): string | null {
  const year = toCalendarDate(state.day).year;
  if (decadeOpen(state, decade)) return 'Already open';
  if (decade > decadeOpened(state) + 10) return `Reach the ${decade - 10}s first`;
  if (year < decade - RESEARCH.maxYearsEarly) return `Can be opened from ${decade - RESEARCH.maxYearsEarly}`;
  if (state.researchPoints < decadeCost(decade)) return 'Not enough research points';
  return null;
}

/** The next decade to open, or null when all are open. */
export const nextDecade = (state: GameState): number | null => DECADES.find((d) => d > decadeOpened(state)) ?? null;

/** Why a tech can't be researched yet, or null. */
export function researchBlocker(state: GameState, tech: Tech): string | null {
  const year = toCalendarDate(state.day).year;
  if (ownsTech(state, tech.id)) return 'Already researched';
  if (year < tech.year - RESEARCH.maxYearsEarly) return `Can be researched from ${tech.year - RESEARCH.maxYearsEarly}`;
  if (year < tech.year && !decadeOpen(state, decadeOf(tech.year))) return `Reach the ${decadeOf(tech.year)}s first`;
  if (state.researchPoints < researchCost(tech, year)) return 'Not enough research points';
  return null;
}

/** The technologies that can be researched today: in reach in time, and paid for in points. */
export const researchable = (state: GameState): Tech[] => TECHS.filter((tech) => researchBlocker(state, tech) === null);

// --- Equipment tiers ---

/** Price of a piece of furniture at a tier. */
export function furniturePrice(type: FurnitureType, tier: number): number {
  return Math.round(furnitureSpec(type).cost * (1 + TIERS.costPerTier * (tier - 1)));
}

/** The tier a new piece of this furniture is bought at. */
export function purchaseTier(state: GameState, type: FurnitureType): number {
  const { line, versions } = furnitureSpec(type);
  if (line) return ownedTier(state, line);
  // A piece with versions of its own: the newest whose technology is researched.
  return 1 + (versions ?? []).reduce((best, id, i) => (ownsTech(state, id) ? i + 1 : best), 0);
}

/** Why a piece can't be bought, or null if it is for sale. */
export function saleBlocker(state: GameState, type: FurnitureType): string | null {
  const spec = furnitureSpec(type);
  if (spec.retired) return `The ${spec.name.toLowerCase()} is no longer sold.`;
  if (spec.unlock && !ownsTech(state, spec.unlock)) return `Research ${getTech(spec.unlock).name} first.`;
  return null;
}

/**
 * The newer versions of a piece of furniture that the player can't buy yet,
 * oldest first, each with the technology that brings it.
 */
export function lockedTiers(state: GameState, type: FurnitureType): { tier: number; tech: Tech }[] {
  const { line, versions, retired } = furnitureSpec(type);
  if (retired) return [];
  if (!line) return (versions ?? []).map((id, i) => ({ tier: i + 2, tech: getTech(id) })).filter((v) => v.tier > purchaseTier(state, type));
  return TECHS.filter((t) => t.effects.tier?.line === line && t.effects.tier.tier > ownedTier(state, line))
    .map((tech) => ({ tier: tech.effects.tier!.tier, tech }))
    .sort((a, b) => a.tier - b.tier);
}

export const itemValue = (item: Furniture) => furniturePrice(item.type, item.tier);

/** The share of its price a piece is still worth at an age in days: all of it at first, then less by the year (see FURNITURE_WORTH). */
export function worthAt(age: number): number {
  const { graceDays, used, floor, years } = FURNITURE_WORTH;
  if (age <= graceDays) return 1;
  return Math.max(floor, used - ((used - floor) * (age - graceDays)) / (years * DAYS_PER_YEAR));
}

/**
 * What an item sells for on a day. Straight after it was placed it gives its
 * price back. After that it brings a share of its price that falls with its
 * age, less the worse its condition.
 */
export function resaleValue(item: Furniture, day: number): number {
  const age = day - item.boughtOn;
  if (age <= FURNITURE_WORTH.graceDays) return itemValue(item);
  return Math.round((itemValue(item) * worthAt(age) * item.condition) / 100);
}

/** Tiered equipment in a room that is older than what the player can buy now. */
export function outdatedItems(state: GameState, room: RentedRoom): Furniture[] {
  return room.furniture.filter((f) => !furnitureSpec(f.type).retired && f.tier < purchaseTier(state, f.type));
}

/**
 * How up to date a studio is: (average tier of its tiered equipment / the tier
 * current for the year) ^ exponent, capped. 1 = current; below 1 = outdated.
 * A desk the studio uses in a control room next door counts as its own.
 */
export function equipmentLevel(state: GameState, room: RentedRoom, year: number): number {
  const items = studioKit(state, room).filter((f) => furnitureSpec(f.type).line && !furnitureSpec(f.type).retired);
  if (items.length === 0 || !room.type || !STUDIO_REQUIREMENTS[room.type]) return 1;
  const line = furnitureSpec(items[0]!.type).line!;
  const average = items.reduce((sum, f) => sum + f.tier, 0) / items.length;
  return Math.min(TIERS.studioLevelCap, (average / eraTier(line, year)) ** TIERS.studioLevelExponent);
}

/** Staff output by workstation tier. */
export const officeOutput = (tier: number) => TIERS.officeOutput[Math.min(tier, TIERS.officeOutput.length) - 1] ?? 1;
