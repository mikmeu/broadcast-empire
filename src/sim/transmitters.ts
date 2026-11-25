// Transmitters (0.23.0, #478): each licence can take up to three steps, each opened by a tech. A step reaches more of the region and makes the
// channel a little more appealing there. It imports licences, tech and the world, and only broadcast, commands, bots, the guide, the screens and the sweep import it.

import { LICENSE_BASE_POPULATION, TRANSMITTER } from '../config/balance';
import { getRegion } from '../config/world';
import { TECHS, type Tech } from '../config/tech';
import { toCalendarDate } from './calendar';
import { costFactor } from './difficulty';
import { licenseRamp, licenseValue, MEDIUM_NAMES } from './licenses';
import type { GameState, Id, License } from './state';
import { ownsTech } from './tech';
import { isUnlocked, lockedReason } from './unlocks';
import { population } from './world';

const roundTo = (n: number, step: number) => Math.round(n / step) * step;
const formatEuro = (n: number) => `€${n.toLocaleString('en-IE')}`;

export type TransmitterTier = 0 | 1 | 2 | 3;

/** The tier of a licence's transmitter, 0 to 3. */
export const transmitterTier = (license: Pick<License, 'transmitter'>): TransmitterTier => license.transmitter?.tier ?? 0;

/** The tech that opens a tier. */
export const transmitterTech = (tier: 1 | 2 | 3): Tech => TECHS.find((t) => t.effects.transmitter === tier)!;

/** How much of a region a licence reaches: its ramp (a new radio licence builds up) times what its transmitter adds. */
export function licenseReach(license: Pick<License, 'since' | 'transmitter'>, day: number): number {
  return licenseRamp(license, day) * (1 + TRANSMITTER.reach[transmitterTier(license)]!);
}

/** What the licence's transmitter does to the appeal of its channel in the region: 1 without one. */
export const licenseSignal = (license: Pick<License, 'transmitter'>): number => TRANSMITTER.appeal[transmitterTier(license)]!;

/** What the step from the licence's tier to the next costs, to the nearest €1,000: by the region's people and the age of the step's tech. 0 at tier 3. */
export function transmitterPrice(state: GameState, license: License): number {
  const tier = transmitterTier(license);
  if (tier >= 3) return 0;
  const base = TRANSMITTER.price[license.medium][tier]!;
  const people = Math.max(TRANSMITTER.minShare, population(license.regionId, state.day) / LICENSE_BASE_POPULATION);
  const years = Math.max(0, toCalendarDate(state.day).year - transmitterTech((tier + 1) as 1 | 2 | 3).year);
  const ageing = Math.max(TRANSMITTER.ageing.floor, 1 - TRANSMITTER.ageing.perYear * years);
  return roundTo(costFactor(state) * base * people * ageing, 1000);
}

/**
 * Why the licence cannot take its next step now, or null when it can. In order: locked, already at the top, the tech not researched, the money.
 */
export function transmitterBlocker(state: GameState, licenseId: Id): string | null {
  if (!isUnlocked(state, 'transmitters')) return lockedReason('transmitters');
  const license = state.licenses.find((l) => l.id === licenseId);
  if (!license) return 'That licence is not yours.';
  const tier = transmitterTier(license);
  if (tier >= 3) return `The ${MEDIUM_NAMES[license.medium]} transmitter in ${getRegion(license.regionId).name} is as strong as they come.`;
  const tech = transmitterTech((tier + 1) as 1 | 2 | 3);
  if (!ownsTech(state, tech.id)) return `Research ${tech.name} first.`;
  const price = transmitterPrice(state, license);
  if (state.money < price) return `Not enough money (${formatEuro(price)} needed).`;
  return null;
}

/**
 * What the next step adds to the licence's yearly earnings, for a test player: what the licence earns a year in ads (`licenseValue`, at the base
 * rate, without sponsors) times the rise in reach and appeal. Rough: the appeal acts on the share it wins, and the share rises by less than the appeal
 * does. 0 at tier 3.
 */
export function transmitterGain(state: GameState, license: License): number {
  const tier = transmitterTier(license);
  if (tier >= 3) return 0;
  const now = (1 + TRANSMITTER.reach[tier]!) * TRANSMITTER.appeal[tier]!;
  const next = (1 + TRANSMITTER.reach[tier + 1]!) * TRANSMITTER.appeal[tier + 1]!;
  return licenseValue(state, license.channelId, license.regionId, license.medium) * (next / now - 1);
}

/** The best transmitter among your licences in the home region, radio or TV: what the mast in the home town looks like. 0: none stands. */
export function homeMastTier(state: GameState): TransmitterTier {
  return Math.max(0, ...state.licenses.filter((l) => l.regionId === state.headquarters).map(transmitterTier)) as TransmitterTier;
}
