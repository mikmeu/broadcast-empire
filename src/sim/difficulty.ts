// What the difficulty chosen at the start does to money: what things cost and
// what a new company has. How good the rivals are is in generate.ts.

import { DIFFICULTY_COSTS, REGION_COSTS, STARTING_MONEY, type Difficulty } from '../config/balance';
import { getRegion } from '../config/world';
import type { GameState } from './state';

/** Saves from before difficulty existed count as normal. */
const known = (difficulty: Difficulty | undefined): Difficulty => (difficulty && difficulty in DIFFICULTY_COSTS ? difficulty : 'normal');

/** Multiplies rent, salaries, license prices and fees, and the content market's prices. */
export const costFactor = (state: Pick<GameState, 'difficulty'>) => DIFFICULTY_COSTS[known(state.difficulty)];

/**
 * Multiplies wages and rent by the region of the headquarters (#428): its people in 1970
 * against the Capital's, not less than REGION_COSTS.floor. Not license prices, which follow
 * the people of the region they are for. Without a headquarters (an old test state) it is 1.
 */
export function regionCostFactor(state: Partial<Pick<GameState, 'headquarters'>>): number {
  if (!state.headquarters) return 1;
  const capital = getRegion('capital').population1970;
  return Math.min(1, Math.max(REGION_COSTS.floor, (getRegion(state.headquarters).population1970 / capital) ** REGION_COSTS.power));
}

/** What Uncle Tabby puts up for a new company. */
export const startingMoney = (difficulty: Difficulty) => STARTING_MONEY[known(difficulty)];
