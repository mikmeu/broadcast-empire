// Small helpers the panels of the office screen share.

import { MS_PER_DAY } from '../../../config/balance';
import { officeHours } from '../../../sim/calendar';
import { useGameStore } from '../../store';
import { clock } from '../../useGameLoop';

/** The game's time in seconds at normal speed; it stands still while the game is paused. */
export const worldTime = () => ((useGameStore.getState().game?.day ?? 0) + clock.dayProgress) * (MS_PER_DAY / 1000);

/** The time on the office clock, in hours that keep counting. */
export const worldHours = () => officeHours(useGameStore.getState().game?.day ?? 0, clock.dayProgress);

/** "A, B or C": the choices in a sentence. */
export const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

export const listOf = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

export const either = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`);
