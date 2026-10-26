import { describe, expect, it } from 'vitest';
import { createInitialState } from '../sim/newGame';
import type { SponsorContract } from '../sim/state';
import { SALES_TABS, belowMinimum, openSalesTab, salesDots } from './salesTabs';

const contract = (extra: Partial<SponsorContract>): SponsorContract => ({ minListeners: 100, daysRun: 0, listenerSum: 0, ...extra }) as SponsorContract;

describe('the Sales window tabs', () => {
  it('has the five tabs, Offers first', () => {
    expect(SALES_TABS.map((t) => t.id)).toEqual(['offers', 'contracts', 'merchandise', 'deals', 'sponsors']);
  });

  it('opens on Offers until a tab is picked', () => {
    expect(openSalesTab(null)).toBe('offers');
    expect(openSalesTab('sponsors')).toBe('sponsors');
  });

  it('tags a contract below its minimum only once it has run a day', () => {
    expect(belowMinimum(contract({}))).toBe(false);
    expect(belowMinimum(contract({ daysRun: 2, listenerSum: 150 }))).toBe(true);
    expect(belowMinimum(contract({ daysRun: 2, listenerSum: 250 }))).toBe(false);
  });

  it('shows no dots in a new game', () => {
    const game = createInitialState(1);
    expect(Object.values(salesDots(game)).some(Boolean)).toBe(false);
  });

  it('puts a dot on Offers for an open offer and on Contracts for a short contract', () => {
    const game = createInitialState(1);
    game.offers = [{ id: 'o1' } as never];
    game.contracts = [contract({ daysRun: 2, listenerSum: 10 })];
    expect(salesDots(game)).toMatchObject({ offers: true, contracts: true });
  });
});
