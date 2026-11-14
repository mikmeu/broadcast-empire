// What a rival can spend, and how rivalry pushes its bids (0.23.0, #408). It imports only config and state,
// so events.ts can use it without a cycle through rivals.ts.

import { RIVALRY } from '../config/balance';
import type { Rival } from './state';

/** A rival's bid or challenge, pushed up by rivalry: at or over `watch` it is x times (1 + bidPush × rivalry); under it, x as it was. */
export const pushed = (rival: Pick<Rival, 'rivalry'>, x: number) => (rival.rivalry >= RIVALRY.watch ? x * (1 + RIVALRY.bidPush * rival.rivalry) : x);

/** A rival pays only if it still has `shortBelow` times its start money afterwards: it never makes itself short of money. */
export const canAfford = (rival: Pick<Rival, 'money' | 'personality'>, cost: number) =>
  rival.money - cost >= RIVALRY.shortBelow * RIVALRY.startMoney[rival.personality];

/** What a rival will spend on growth: its money less the cushion `canAfford` keeps. */
export const growthLimit = (rival: Pick<Rival, 'money' | 'personality'>) => Math.max(0, rival.money - RIVALRY.shortBelow * RIVALRY.startMoney[rival.personality]);

/** Takes an amount from a rival's money, never below 0. */
export function chargeRival(rival: Rival, amount: number): void {
  rival.money = Math.max(0, rival.money - amount);
}
