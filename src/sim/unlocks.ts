// What the company can do so far (config/unlocks.ts). The features that are
// open are kept in the state; sim/milestones.ts opens one when the company
// reaches its level.

import { getMilestone } from '../config/milestones';
import { FEATURES, UNLOCKS, type Feature } from '../config/unlocks';
import type { Department, GameState, Role } from './state';

export const isUnlocked = (state: GameState, feature: Feature) => state.unlocked.includes(feature);

/** Why something can't be done yet: the level that opens it. */
export function lockedReason(feature: Feature): string {
  const { name, plural, level, milestone } = UNLOCKS[feature];
  return `${name} ${plural ? 'open' : 'opens'} at level ${level}${milestone ? ` or with the milestone “${getMilestone(milestone).name}”` : ''}.`;
}

/** Whether the company may hold another TV license: its first needs nothing, a second one a level (0.20.0). */
export const mayBuyTvLicense = (state: GameState) => !state.licenses.some((l) => l.medium === 'tv') || isUnlocked(state, 'secondTvLicense');

/** The feature someone's job belongs to, if it is one that has to be opened first. */
export function featureOfRole(role: Role, department?: Department | null): Feature | null {
  const of: Partial<Record<Role | Department, Feature>> = { sales: 'sales', marketing: 'marketing', researcher: 'research', research: 'research' };
  return (role === 'manager' ? department && of[department] : of[role]) || null;
}

/** Whether someone in this job can be hired yet. */
export const canHire = (state: GameState, role: Role, department?: Department | null) => {
  const feature = featureOfRole(role, department);
  return feature === null || isUnlocked(state, feature);
};

/** The regions the company may buy a license in: any for its first license, and until more regions open only the ones it is in. */
export function regionOpen(state: GameState, regionId: string): boolean {
  return isUnlocked(state, 'regions') || state.licenses.length === 0 || state.licenses.some((l) => l.regionId === regionId);
}

/** Everything open: for games from before there were locks, and for tests and cheats. */
export const unlockAll = (state: GameState): GameState => ({ ...state, unlocked: [...FEATURES] });
