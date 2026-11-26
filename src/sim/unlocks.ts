// What the company can do so far (config/unlocks.ts). The features that are
// open are kept in the state; sim/milestones.ts opens one when the company
// reaches its level.

import { getMilestone } from '../config/milestones';
import { techFor, type TechId } from '../config/tech';
import { FEATURES, UNLOCKS, type Feature } from '../config/unlocks';
import type { Department, GameState, Role } from './state';
import { ownsTech } from './tech';

export const isUnlocked = (state: GameState, feature: Feature) => state.unlocked.includes(feature);

/** Why something can't be done yet: the level that opens it. */
export function lockedReason(feature: Feature): string {
  const { name, plural, level, milestone } = UNLOCKS[feature];
  return `${name} ${plural ? 'open' : 'opens'} at level ${level}${milestone ? ` or with the milestone “${getMilestone(milestone).name}”` : ''}.`;
}

/** The most TV channels the authority allows one company (0.23.0, #479). */
export const MAX_TV_CHANNELS = 3;

/** How many of your channels hold at least one TV license: an empty TV channel does not count until it wins its first. */
export const tvChannelsOnAir = (state: GameState) => new Set(state.licenses.filter((l) => l.medium === 'tv').map((l) => l.channelId)).size;

/**
 * Why a TV license can't be bought for this channel, or null when it can. A channel that holds one already may take more regions once a second
 * TV channel is open (0.20.0); a channel with none would be a new TV channel: a second one needs level 7, a third level 12, and there is no fourth (0.23.0, #479).
 * Games that hold more than their level allows keep them: the rule only stops a new TV channel.
 */
export function tvLicenseBlocker(state: GameState, channelId: string): string | null {
  if (state.licenses.some((l) => l.medium === 'tv' && l.channelId === channelId)) {
    return isUnlocked(state, 'secondTvLicense') ? null : `You hold a TV license already. ${lockedReason('secondTvLicense')}`;
  }
  return newTvChannelBlocker(state, tvChannelsOnAir(state));
}

/** Why one more TV channel can't go on air when `onAir` run already, or null when it can. */
export function newTvChannelBlocker(state: GameState, onAir: number): string | null {
  if (onAir === 0) return null;
  if (onAir === 1) return isUnlocked(state, 'secondTvLicense') ? null : `You hold a TV license already. ${lockedReason('secondTvLicense')}`;
  if (onAir === 2) return isUnlocked(state, 'thirdTvChannel') ? null : `You run two TV channels already. ${lockedReason('thirdTvChannel')}`;
  return 'You run three TV channels, the most the authority allows.';
}

/** The feature someone's job belongs to, if it is one that has to be opened first. */
export function featureOfRole(role: Role, department?: Department | null): Feature | null {
  const of: Partial<Record<Role | Department, Feature>> = { sales: 'sales', marketing: 'marketing', researcher: 'research', research: 'research', meteorologist: 'weather' };
  return (role === 'manager' ? department && of[department] : of[role]) || null;
}

/** Why someone in this job can't be hired yet: the level that opens it, or the technology to research (0.20.0, #207). Null if they can. */
export function hireBlocker(state: GameState, role: Role, department?: Department | null): string | null {
  const feature = featureOfRole(role, department);
  if (feature !== null && !isUnlocked(state, feature)) return lockedReason(feature);
  const tech = techFor(role);
  return tech && !ownsTech(state, tech.id) ? `Research ${tech.name} first.` : null;
}

/** Whether someone in this job can be hired yet. */
export const canHire = (state: GameState, role: Role, department?: Department | null) => hireBlocker(state, role, department) === null;

/** The regions the company may buy a license in: any for its first license, and until more regions open only the ones it is in. */
export function regionOpen(state: GameState, regionId: string): boolean {
  return isUnlocked(state, 'regions') || state.licenses.length === 0 || state.licenses.some((l) => l.regionId === regionId);
}

/** The technologies that open a job, the news van or a staged format (#207). */
const GATING_TECHS: readonly TechId[] = ['talkShowFormat', 'sitcomFormat', 'kidsFormat', 'multitrack', 'phoneIns', 'videotapeEditing', 'newsGathering', 'computerPlaylists'];

/** Everything open: for games from before there were locks, and for tests and cheats. It holds the technologies that open jobs, the van and formats too. */
export const unlockAll = (state: GameState): GameState => ({ ...state, unlocked: [...FEATURES], techs: [...new Set([...state.techs, ...GATING_TECHS])] });
