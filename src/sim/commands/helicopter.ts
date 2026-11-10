// The traffic helicopter (0.22.0, #395): buying it and selling it.

import { HELICOPTER } from '../../config/balance';
import { helicopterBlocker, helicopterValue } from '../helicopter';
import type { GameState } from '../state';
import { type ActionResult, act, fail, pay } from './core';

/** Buys the traffic helicopter; it stands on the roof and flies on days with news in the rush hours. */
export function buyHelicopter(state: GameState): ActionResult {
  return act(state, (draft) => {
    const blocked = helicopterBlocker(draft);
    if (blocked) return fail(blocked);
    const paid = pay(draft, HELICOPTER.price, 'purchases');
    if (paid) return paid;
    draft.helicopter = { boughtOn: draft.day, price: HELICOPTER.price };
  });
}

/** Sells the helicopter for what it is worth (see `helicopterValue`). */
export function sellHelicopter(state: GameState): ActionResult {
  return act(state, (draft) => {
    if (!draft.helicopter) return fail('You don’t have a helicopter.');
    const refund = helicopterValue(draft.helicopter, draft.day);
    draft.helicopter = null;
    draft.money += refund;
    draft.ledger.purchases -= refund;
  });
}
