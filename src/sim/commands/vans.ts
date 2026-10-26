// The news vans (0.20.0): buying one, sending it out on a shift, selling it.

import { NEWS_VAN } from '../../config/balance';
import { vanValue } from '../newsVans';
import { newId, type GameState, type Id, type VanShift } from '../state';
import { type ActionResult, act, fail, pay } from './core';

/** Buys a news van; it stands parked until it is sent out on a shift. The id of the van comes back with the result. */
export function buyNewsVan(state: GameState): ActionResult {
  return act(state, (draft) => {
    const paid = pay(draft, NEWS_VAN.price, 'purchases');
    if (paid) return paid;
    const id = newId(draft, 'v');
    draft.vans.push({ id, boughtOn: draft.day, price: NEWS_VAN.price, shift: null });
    return id;
  });
}

/** Sells a van for what it is worth (see `vanValue`). */
export function sellNewsVan(state: GameState, vanId: Id): ActionResult {
  return act(state, (draft) => {
    const van = draft.vans.find((v) => v.id === vanId);
    if (!van) return fail('You don’t have this van.');
    draft.vans = draft.vans.filter((v) => v !== van);
    const refund = vanValue(van, draft.day);
    draft.money += refund;
    draft.ledger.purchases -= refund;
  });
}

/** Sends a van out on a shift, or parks it (null). A shift has one van: the one that had it before is parked. */
export function assignVan(state: GameState, vanId: Id, shift: VanShift | null): ActionResult {
  return act(state, (draft) => {
    const van = draft.vans.find((v) => v.id === vanId);
    if (!van) return fail('You don’t have this van.');
    if (shift) for (const other of draft.vans) if (other.shift === shift) other.shift = null;
    van.shift = shift;
  });
}
