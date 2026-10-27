// Shows sold to rival channels and studios let out (0.20.0, #148): the deals Sales makes with other people.
// A sold show airs in a slot of the buyer's, and you get a share of the ads it earns there. A studio is let to a tenant for a
// monthly fee. Both run for a year; ending one early costs a buy-out. They are laid out like a sponsor contract (see sales.ts).

import { DAYS_PER_YEAR, SHOW_SALES, STUDIO_LETS } from '../config/balance';
import { getGenre } from '../config/genres';
import { TENANTS } from '../config/names';
import { isStudioType } from '../config/office';
import { formatDate, toCalendarDate } from './calendar';
import { generateRivalShow, rivalStrength } from './generate';
import { employeesWithDesk, findRoom, isTvStudio, monthlyRent } from './office';
import type { Rng } from './rng';
import { isUnlocked, lockedReason } from './unlocks';
import { addMessage, type DayResult, type GameState, type Id, type RentedRoom, type RivalChannel, type Show, type ShowSale, type StudioLet } from './state';

const DAYS_PER_MONTH = DAYS_PER_YEAR / 12;
const formatEuro = (n: number) => `€${Math.round(n).toLocaleString('en-IE')}`;

/** How many days a deal of some months lasts. */
export const dealDays = (months: number) => Math.round(months * DAYS_PER_MONTH);

// --- Which shows are on the air ---

/** The sale a show is part of, if any. */
export const saleOf = (state: GameState, showId: Id): ShowSale | undefined => state.showSales.find((s) => s.showId === showId);

/** The letting a studio is part of, if any. */
export const letOf = (state: GameState, roomId: string): StudioLet | undefined => state.studioLets.find((l) => l.roomId === roomId);

/** Every place a show airs: a slot of one of your channels, or a slot of a rival's that bought it. `key` tells one channel from another. */
export function airings(state: GameState): { showId: Id; slot: number; key: Id; sold: boolean }[] {
  return [
    ...state.channels.flatMap((channel) => channel.schedule.flatMap((id, slot) => (id ? [{ showId: id, slot, key: channel.id, sold: false }] : []))),
    ...state.showSales.map((sale) => ({ showId: sale.showId, slot: sale.slot, key: sale.id, sold: true })),
  ];
}

/** The shows on the air, on your own channels or sold. */
export const onAirIds = (state: GameState): Set<Id> => new Set(airings(state).map((a) => a.showId));

/** The slots a show airs in, in order, on your own channels and sold. */
export const slotsOf = (state: GameState, showId: Id): number[] =>
  airings(state)
    .filter((a) => a.showId === showId)
    .map((a) => a.slot)
    .sort((a, b) => a - b);

// --- Selling a show ---

/** Whether someone in Sales is at a desk: both kinds of deal need them. */
export const salesAtDesk = (state: GameState) => {
  const desked = employeesWithDesk(state);
  return state.employees.some((e) => e.role === 'sales' && desked.has(e.id));
};

/** Why a show can't be sold, or null if it can. */
export function saleBlocker(state: GameState, show: Show): string | null {
  if (!isUnlocked(state, 'showSales')) return lockedReason('showSales');
  const genre = getGenre(show.genre);
  if (genre.kind !== 'produced') return 'Only a show you make yourself can be sold.';
  if (saleOf(state, show.id)) return `“${show.name}” is sold already.`;
  if (state.channels.some((c) => c.schedule.includes(show.id))) return `“${show.name}” is on your own channel. Take it off the schedule first.`;
  if (state.contracts.some((c) => c.showId === show.id)) return `“${show.name}” has a sponsor. A sold show can’t.`;
  return null;
}

/** The slot of a rival channel that would take a show: its weakest show that is not sold yet, or null if all are. */
export function slotToBuy(state: GameState, rc: RivalChannel): number | null {
  let weakest: number | null = null;
  rc.schedule.forEach((show, slot) => {
    if (state.showSales.some((s) => s.channelId === rc.id && s.slot === slot)) return;
    if (weakest === null || show.quality < rc.schedule[weakest]!.quality) weakest = slot;
  });
  return weakest;
}

/** The rival channels that could buy a show, with the slot each would give it. */
export function buyersFor(state: GameState, show: Show): { rivalId: Id; rival: string; channel: RivalChannel; slot: number }[] {
  const medium = getGenre(show.genre).medium;
  return state.rivals.flatMap((rival) =>
    rival.channels
      .filter((c) => c.medium === medium)
      .flatMap((channel) => {
        const slot = slotToBuy(state, channel);
        return slot === null ? [] : [{ rivalId: rival.id, rival: rival.name, channel, slot }];
      }),
  );
}

/** A month of a sale at yesterday's ads in that slot (what the buyer's own show earned there), as an estimate. */
export function estimateSale(state: GameState, channelId: Id, slot: number): number {
  const earned = state.lastDay?.channels.find((c) => c.channelId === channelId)?.slots[slot]?.revenue ?? 0;
  return earned * SHOW_SALES.share * DAYS_PER_MONTH;
}

/** What a sale brings in a day, as far as can be told: the better of yesterday and the average so far. */
function dailySale(state: GameState, sale: ShowSale): number {
  const yesterday = state.lastDay?.sold?.find((s) => s.saleId === sale.id)?.amount ?? 0;
  const run = Math.max(1, state.day - sale.startDay);
  return Math.max(yesterday, sale.earned / run);
}

// --- Letting a studio ---

/** The tenant a studio gets, by the period: someone who exists in the year, picked by the room and the day. */
export function tenantFor(state: GameState, room: RentedRoom): string {
  const medium = isTvStudio(room.type) ? 'tv' : 'radio';
  const year = toCalendarDate(state.day).year;
  const options = TENANTS.filter((t) => t.medium === medium && t.from <= year);
  const pick = [...room.roomId].reduce((n, c) => n + c.charCodeAt(0), state.day);
  return options[pick % options.length]!.name;
}

/** What a tenant would pay a month for a studio. */
export function letFee(state: GameState, room: RentedRoom): number {
  const medium = isTvStudio(room.type) ? 'tv' : 'radio';
  return Math.round(monthlyRent(room, state) * STUDIO_LETS.rentTimes[medium]);
}

/** Why a studio can't be let out, or null if it can. */
export function letBlocker(state: GameState, room: RentedRoom): string | null {
  if (!isUnlocked(state, 'showSales')) return lockedReason('showSales');
  if (!room.type || !isStudioType(room.type)) return 'Only a studio can be let out.';
  if (letOf(state, room.roomId)) return `${room.name} is let already.`;
  const used = state.shows.find((s) => s.studioId === room.roomId);
  if (used) return `“${used.name}” is made in ${room.name}. Move it to another studio first.`;
  if (state.studioLets.length >= STUDIO_LETS.max) return `You can let ${STUDIO_LETS.max} studios at a time.`;
  return null;
}

/** Why a room can't be changed while a deal runs, or null. Used by the commands that would take the room from its tenant. */
export function letRefusal(state: GameState, roomId: string): string | null {
  const deal = letOf(state, roomId);
  if (!deal) return null;
  return `${findRoom(state, roomId)?.name ?? 'The room'} is let to ${deal.tenant} until ${formatDate(deal.endDay)}. Buy the tenant out first (Sales).`;
}

/** Why a show can't change while it is sold, or null. */
export function saleRefusal(state: GameState, showId: Id): string | null {
  const sale = saleOf(state, showId);
  if (!sale) return null;
  const show = state.shows.find((s) => s.id === showId);
  return `“${show?.name ?? 'The show'}” is sold to ${channelName(state, sale)} until ${formatDate(sale.endDay)}. Buy it out first (Sales).`;
}

export const channelName = (state: GameState, sale: ShowSale) => state.rivals.flatMap((r) => r.channels).find((c) => c.id === sale.channelId)?.name ?? 'another channel';

// --- Buying out ---

/** What it costs to end a deal today: what is still to come, times the buy-out factor. */
export function buyOutCost(state: GameState, deal: ShowSale | StudioLet): number {
  const left = Math.max(0, deal.endDay - state.day);
  if ('monthly' in deal) return Math.round((deal.monthly * (left / DAYS_PER_MONTH) * STUDIO_LETS.buyOut) / 10) * 10;
  return Math.round((dailySale(state, deal) * left * SHOW_SALES.buyOut) / 10) * 10;
}

/** Takes a sale away and puts a new show of the buyer's own in its slot, as the seasons do (see rivals.ts). */
export function endSale(draft: GameState, sale: ShowSale, rng: Rng, text: string): void {
  draft.showSales = draft.showSales.filter((s) => s !== sale);
  const rival = draft.rivals.find((r) => r.id === sale.rivalId);
  const channel = rival?.channels.find((c) => c.id === sale.channelId);
  const old = channel?.schedule[sale.slot];
  if (rival && channel && old) {
    channel.schedule[sale.slot] = generateRivalShow(rng, rival.personality, old.genre, channel.schedule.map((s) => s.name), rivalStrength(draft));
  }
  addMessage(draft, 'info', text, undefined, undefined, 'sales');
}

export function endLet(draft: GameState, deal: StudioLet, text: string): void {
  draft.studioLets = draft.studioLets.filter((l) => l !== deal);
  addMessage(draft, 'info', text, undefined, undefined, 'sales');
}

/** Daily: the sales pay what they earned today, the tenants their rent; a deal that runs out ends. */
export function runDeals(draft: GameState, result: DayResult, rng: Rng): void {
  const pay = (amount: number, line: 'showSales' | 'studioLets', deal: ShowSale | StudioLet) => {
    draft.money += amount;
    draft.ledger.revenue += amount;
    draft.ledger[line] += amount;
    deal.earned += amount;
  };
  for (const sale of [...draft.showSales]) {
    const today = result.sold?.find((s) => s.saleId === sale.id)?.amount ?? 0;
    pay(today, 'showSales', sale);
    if (draft.day + 1 >= sale.endDay) {
      const show = draft.shows.find((s) => s.id === sale.showId);
      endSale(draft, sale, rng, `The year is up: “${show?.name ?? 'your show'}” has left ${channelName(draft, sale)}. It brought in ${formatEuro(sale.earned)}. It is yours again, off the air until you schedule it.`);
    }
  }
  for (const deal of [...draft.studioLets]) {
    pay((deal.monthly * 12) / DAYS_PER_YEAR, 'studioLets', deal);
    if (draft.day + 1 >= deal.endDay) {
      endLet(draft, deal, `The year is up: ${deal.tenant} has left ${findRoom(draft, deal.roomId)?.name ?? 'the studio'}. It paid ${formatEuro(deal.earned)}. The studio is yours again.`);
    }
  }
}

/** The slots of a rival channel that are sold, by slot. */
export const soldIn = (state: GameState, channelId: Id): Map<number, ShowSale> => new Map(state.showSales.filter((s) => s.channelId === channelId).map((s) => [s.slot, s]));
