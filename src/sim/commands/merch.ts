// The gift shop: buying boxes of stock for a show (0.21.0, #362).

import { MERCH, MERCH_LINES, type MerchLine } from '../../config/balance';
import { toCalendarDate } from '../calendar';
import { LINE_NAMES, boxPrice, lineTerms, roomLeft, shopHolds, shops, sellsMerchandise } from '../merchandise';
import { isUnlocked, lockedReason } from '../unlocks';
import type { GameState, Id } from '../state';
import { type ActionResult, act, fail, formatEuro, pay } from './core';

/** Why boxes of a line cannot be bought for a show, or null. A count is checked as well when given. */
export function buyBlocker(state: GameState, showId: Id, line: MerchLine, count = 1): string | null {
  const show = state.shows.find((s) => s.id === showId);
  if (!show) return 'That show doesn’t exist.';
  if (!isUnlocked(state, 'merchandise')) return lockedReason('merchandise');
  if (!sellsMerchandise(show)) return 'The rights to a bought title are not yours: it sells no merchandise.';
  if (shops(state).length === 0) return 'Build a gift shop with a till and baskets first.';
  if (shopHolds(state, line) === 0) return `The shop has no piece for ${LINE_NAMES[line].toLowerCase()} yet.`;
  if (!lineTerms(line, toCalendarDate(state.day).year, show)) return 'There are no tapes of TV shows yet: the first come in 1978.';
  if (roomLeft(state, line) < count * MERCH.box) return 'There is no room left on the pieces or in storage: add a piece for it, or a stack of boxes in a storage room.';
  return null;
}

/** Buys boxes of a line for a show: each holds MERCH.box units. They stand in the shop and in storage until they sell. */
export function buyBoxes(state: GameState, showId: Id, line: MerchLine, count: number): ActionResult {
  return act(state, (draft) => {
    if (!Number.isInteger(count) || count < 1) return fail('Buy at least one box.');
    if (!MERCH_LINES.includes(line)) return fail('There is no such line.');
    const blocked = buyBlocker(draft, showId, line, count);
    if (blocked) return fail(blocked);
    const show = draft.shows.find((s) => s.id === showId)!;
    const cost = boxPrice(draft, show, line)! * count;
    const paid = pay(draft, cost, 'merchStock');
    if (paid) return fail(`Not enough money (${formatEuro(cost)} needed).`);
    show.stock ??= {};
    const stock = (show.stock[line] ??= { units: 0, paid: 0 });
    stock.units += count * MERCH.box;
    stock.paid += cost;
  });
}
