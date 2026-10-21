// Population and audience reach: the size of the market in each region.

import { ACTIVE_REGIONS, AUDIENCE_SHIFT_YEARS, DAYS_PER_YEAR, REGIONAL_AUDIENCES } from '../config/balance';
import { AUDIENCES, TUNED_IN, getRegion, type AudienceId, type Medium, type RegionId } from '../config/world';

export function population(regionId: RegionId, day: number): number {
  const region = getRegion(regionId);
  return region.population1970 * (1 + region.growth) ** (day / DAYS_PER_YEAR);
}

/** Everyone in the regions in play. */
export const countryPopulation = (day: number) => ACTIVE_REGIONS.reduce((sum, id) => sum + population(id, day), 0);

/** An audience's share of the country's population before regional differences, which shifts slowly from its 1970 to its 2030 level. */
export function audienceShare(audience: AudienceId, day: number): number {
  const a = AUDIENCES.find((x) => x.id === audience);
  if (!a) return 0;
  const progress = Math.max(0, Math.min(1, day / (DAYS_PER_YEAR * AUDIENCE_SHIFT_YEARS)));
  return a.share + (a.share2030 - a.share) * progress;
}

/** An audience's share of one region's population: larger where it is a main audience, smaller elsewhere. */
export function regionShare(regionId: RegionId, audience: AudienceId, day: number): number {
  const main = getRegion(regionId).mainAudiences;
  const weight = (a: AudienceId) => audienceShare(a, day) * (main.includes(a) ? REGIONAL_AUDIENCES.main : REGIONAL_AUDIENCES.other);
  return weight(audience) / AUDIENCES.reduce((sum, a) => sum + weight(a.id), 0);
}

/** People in this audience who are listening/watching this medium during this slot. */
export function reach(regionId: RegionId, medium: Medium, slot: number, audience: AudienceId, day: number): number {
  return population(regionId, day) * regionShare(regionId, audience, day) * (TUNED_IN[medium][audience][slot] ?? 0);
}
