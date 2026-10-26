// The tabs of the Sales window (0.20.0, #187). The open tab is a window setting,
// kept while the game runs and not saved, like the Staff window's (staffList.ts).

import { create } from 'zustand';
import { hasMerchandiseDeal, merchandiseShare } from '../sim/merchandise';
import { employeesWithDesk } from '../sim/office';
import type { GameState, SponsorContract } from '../sim/state';

export type SalesTab = 'offers' | 'contracts' | 'merchandise' | 'deals' | 'sponsors';

export const SALES_TABS: { id: SalesTab; label: string; dot: string }[] = [
  { id: 'offers', label: 'Offers', dot: 'There are sponsor offers to answer' },
  { id: 'contracts', label: 'Contracts', dot: 'A contract is below its minimum' },
  { id: 'merchandise', label: 'Merchandise', dot: 'No sales employee is at a desk, so nothing sells' },
  { id: 'deals', label: 'Deals', dot: '' },
  { id: 'sponsors', label: 'Sponsors', dot: '' },
];

/** The tab the window opens on: the last one picked; until one is, Offers. */
export const openSalesTab = (picked: SalesTab | null): SalesTab => picked ?? 'offers';

/** Whether a contract is below its minimum, as the card tags it: it has run a day and its average is short. */
export const belowMinimum = (contract: SponsorContract): boolean => contract.daysRun > 0 && contract.listenerSum / contract.daysRun < contract.minListeners;

/** Which tabs have something to look at: open offers, a contract below its minimum, merchandise that cannot sell. */
export function salesDots(game: GameState): Record<SalesTab, boolean> {
  return {
    offers: game.offers.length > 0,
    contracts: game.contracts.some(belowMinimum),
    merchandise: game.shows.some((s) => merchandiseShare(s) > 0) && !hasMerchandiseDeal(game, employeesWithDesk(game)),
    deals: false,
    sponsors: false,
  };
}

interface SalesTabView {
  /** Null until a tab is picked. */
  tab: SalesTab | null;
  setTab(tab: SalesTab): void;
}

export const useSalesTab = create<SalesTabView>()((setState) => ({
  tab: null,
  setTab: (tab) => setState({ tab }),
}));
