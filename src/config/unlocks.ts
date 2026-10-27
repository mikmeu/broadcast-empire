// What a new company cannot do yet, and the company level that opens each
// thing (Phase 12e, levels 0.20.0). A game starts with the office, the staff
// who make radio, one channel's worth of broadcasting and the books; the rest
// comes one level at a time. The levels are in config/levels.ts.

import type { MilestoneId } from './milestones';

export const FEATURES = ['regions', 'sales', 'marketing', 'research', 'events', 'content', 'sportsRights', 'merchandise', 'showSales', 'themeWeeks', 'secondTvLicense'] as const;
export type Feature = (typeof FEATURES)[number];

/** A window of the game, or one of the sections of the broadcasting window: where news about something is to be found. */
export type WindowRef = 'finance' | 'sales' | 'marketing' | 'research' | 'licenses' | 'staff' | 'milestones' | 'broadcast:content' | 'broadcast:channels' | 'broadcast:staffing' | 'broadcast:streaming';

export interface Unlock {
  /** The company level that opens it. */
  level: number;
  /** A milestone that opens it earlier. */
  milestone?: MilestoneId;
  name: string;
  /** Whether the name is a plural, for the sentences it stands in. */
  plural?: boolean;
  /** What it is, for the lock and for the message when it opens. */
  opens: string;
  /** Where it is found once it is open. */
  window: WindowRef;
}

/** In the order a company usually opens them. */
export const UNLOCKS: Record<Feature, Unlock> = {
  regions: { level: 1, name: 'More regions', plural: true, opens: 'licenses in other regions, and the auctions of new licenses', window: 'licenses' },
  sales: { level: 1, name: 'Sales', opens: 'sales staff and sponsor offers', window: 'sales' },
  marketing: { level: 2, name: 'Marketing', opens: 'marketing staff and campaigns', window: 'marketing' },
  research: { level: 3, name: 'Research', opens: 'researchers and the tech tree', window: 'research' },
  content: { level: 4, milestone: 'tvLicense', name: 'The content market', opens: 'bought titles for television', window: 'broadcast:content' },
  events: { level: 5, name: 'Events of your own', plural: true, opens: 'concerts, galas and telethons, and the prestige they earn', window: 'marketing' },
  sportsRights: { level: 5, name: 'Sports rights', plural: true, opens: 'bidding for sports rights and the rights to big events', window: 'broadcast:content' },
  merchandise: { level: 6, name: 'Merchandise', opens: 'tapes, toys and shirts from your own shows', window: 'sales' },
  showSales: { level: 7, name: 'Selling shows', plural: true, opens: 'selling a show to a rival channel, and renting out a studio', window: 'sales' },
  secondTvLicense: { level: 7, name: 'A second TV license', opens: 'more than one TV license', window: 'licenses' },
  themeWeeks: { level: 8, name: 'Theme weeks', plural: true, opens: 'booking a theme week on a radio channel', window: 'marketing' },
};
