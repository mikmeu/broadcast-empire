// What a new company cannot do yet, and the milestone that opens each thing
// (Phase 12e). A game starts with the office, the staff who make radio, one
// channel's worth of broadcasting and the books; the rest comes one at a time.

import type { MilestoneId } from './milestones';

export const FEATURES = ['regions', 'sales', 'marketing', 'research', 'events', 'content'] as const;
export type Feature = (typeof FEATURES)[number];

/** A window of the game, or one of the sections of the broadcasting window: where news about something is to be found. */
export type WindowRef = 'sales' | 'marketing' | 'research' | 'licenses' | 'staff' | 'broadcast:content' | 'broadcast:channels' | 'broadcast:streaming';

export interface Unlock {
  /** Reaching any one of these milestones opens it. */
  milestones: readonly MilestoneId[];
  name: string;
  /** Whether the name is a plural, for the sentences it stands in. */
  plural?: boolean;
  /** What it is, for the lock and for the message when it opens. */
  opens: string;
  /** Where it is found once it is open. */
  window: WindowRef;
}

/**
 * In the order a company usually opens them.
 *
 * Research comes with a second region, or with being the biggest channel in
 * one, so a company that stays at home is not left without it: without
 * research its studios fall behind and it does not last.
 */
export const UNLOCKS: Record<Feature, Unlock> = {
  regions: { milestones: ['firstMonth'], name: 'More regions', plural: true, opens: 'licenses in other regions, and the auctions of new licenses', window: 'licenses' },
  sales: { milestones: ['firstProfit'], name: 'Sales', opens: 'sales staff and sponsor offers', window: 'sales' },
  marketing: { milestones: ['firstSponsor'], name: 'Marketing', opens: 'marketing staff and campaigns', window: 'marketing' },
  research: { milestones: ['twoRegions', 'regionNumberOne'], name: 'Research', opens: 'researchers and the tech tree', window: 'research' },
  content: { milestones: ['tvLicense'], name: 'The content market', opens: 'bought titles and sports rights for television', window: 'broadcast:content' },
  events: { milestones: ['radioLeader'], name: 'Events of your own', plural: true, opens: 'concerts, galas and telethons, and the prestige they earn', window: 'marketing' },
};
