// What the difficulty chosen at the start does to money: what things cost and
// what a new company has. How good the rivals are is in generate.ts.

import { DIFFICULTY_COSTS, STARTING_MONEY, type Difficulty } from '../config/balance';
import type { GameState } from './state';

/** Saves from before difficulty existed count as normal. */
const known = (difficulty: Difficulty | undefined): Difficulty => (difficulty && difficulty in DIFFICULTY_COSTS ? difficulty : 'normal');

/** Multiplies rent, salaries, license prices and fees, and the content market's prices. */
export const costFactor = (state: Pick<GameState, 'difficulty'>) => DIFFICULTY_COSTS[known(state.difficulty)];

/** What Uncle Tabby puts up for a new company. */
export const startingMoney = (difficulty: Difficulty) => STARTING_MONEY[known(difficulty)];
