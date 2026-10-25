// Selling a show to a rival channel and letting out a studio (0.20.0, #148). See sim/deals.ts.

import { SHOW_SALES, STUDIO_LETS } from '../../config/balance';
import { buyOutCost, channelName, dealDays, endLet, endSale, letBlocker, letFee, saleBlocker, salesAtDesk, slotToBuy, tenantFor } from '../deals';
import { Rng } from '../rng';
import { findRoom } from '../office';
import { newId, type GameState, type Id } from '../state';
import { getGenre } from '../../config/genres';
import { type ActionResult, act, fail, formatEuro, pay } from './core';
import { slotConflict } from './shows';

const NO_SALES = 'Nobody in Sales is at a desk. Selling a show or letting a studio takes a salesperson with a workstation.';

/** Sells a show to a rival channel of its medium for a year: it airs in the slot they give it, and you get a share of the ads it earns there. */
export function sellShow(state: GameState, showId: Id, channelId: Id): ActionResult {
  return act(state, (draft) => {
    const show = draft.shows.find((s) => s.id === showId);
    if (!show) return fail('That show doesn’t exist.');
    const blocked = saleBlocker(draft, show);
    if (blocked) return fail(blocked);
    if (!salesAtDesk(draft)) return fail(NO_SALES);
    const rival = draft.rivals.find((r) => r.channels.some((c) => c.id === channelId));
    const channel = rival?.channels.find((c) => c.id === channelId);
    if (!rival || !channel) return fail('That channel doesn’t exist.');
    if (channel.medium !== getGenre(show.genre).medium) return fail('That show is for a different medium.');
    const slot = slotToBuy(draft, channel);
    if (slot === null) return fail(`${channel.name} has no slot left to give.`);
    const id = newId(draft, 'ss');
    draft.showSales.push({ id, showId, rivalId: rival.id, channelId, slot, startDay: draft.day, endDay: draft.day + dealDays(SHOW_SALES.months), earned: 0 });
    // The host and the studio have to be free in that slot on your own channels.
    const conflict = slotConflict(draft, show);
    if (conflict) return fail(conflict);
    return id;
  });
}

/** Lets an unused studio to a tenant for a year. */
export function letStudio(state: GameState, roomId: string): ActionResult {
  return act(state, (draft) => {
    const room = findRoom(draft, roomId);
    if (!room) return fail('You don’t have this room.');
    const blocked = letBlocker(draft, room);
    if (blocked) return fail(blocked);
    if (!salesAtDesk(draft)) return fail(NO_SALES);
    const id = newId(draft, 'sl');
    draft.studioLets.push({ id, roomId, tenant: tenantFor(draft, room), monthly: letFee(draft, room), startDay: draft.day, endDay: draft.day + dealDays(STUDIO_LETS.months), earned: 0 });
    return id;
  });
}

/** Ends a sale or a letting early, for the money still to come plus a quarter. */
export function buyOut(state: GameState, dealId: Id): ActionResult {
  return act(state, (draft) => {
    const sale = draft.showSales.find((s) => s.id === dealId);
    const deal = draft.studioLets.find((l) => l.id === dealId);
    if (!sale && !deal) return fail('That deal doesn’t exist.');
    const cost = buyOutCost(draft, (sale ?? deal)!);
    const paid = pay(draft, cost, 'purchases');
    if (paid) return paid;
    if (sale) {
      const show = draft.shows.find((s) => s.id === sale.showId);
      const rng = new Rng(draft.rngState);
      endSale(draft, sale, rng, `You bought “${show?.name ?? 'your show'}” back from ${channelName(draft, sale)} for ${formatEuro(cost)}. It is yours again, off the air until you schedule it.`);
      draft.rngState = rng.state;
    } else {
      endLet(draft, deal!, `You bought ${deal!.tenant} out of ${findRoom(draft, deal!.roomId)?.name ?? 'the studio'} for ${formatEuro(cost)}. The studio is yours again.`);
    }
  });
}
