// Merchandise (0.20.0), a gift shop since 0.21.0: tapes, clothes and gifts from the shows a station makes itself.
// You buy boxes up front per show and line, they stand on the pieces of the gift shop and in the boxes of a storage
// room, and they sell at the till and by order. What sells follows a show's devoted fans and its hype, not just its
// listeners. The numbers are in MERCH, MERCH_ERAS and ORDERS in config/balance.ts.

import { MERCH, MERCH_ERAS, MERCH_LINES, ORDERS, TAPE_PAY, type MerchLine } from '../config/balance';
import { furnitureSpec } from '../config/office';
import { getGenre } from '../config/genres';
import { toCalendarDate } from './calendar';
import { mailLift } from './calls';
import { hasPostRoom, isLicensed } from './content';
import { findRoom, isBroken, isFurnished, sharesWall, type Desks } from './office';
import { onOrders, onTill, salesGrade } from './staff';
import { ownsTech } from './tech';
import { isUnlocked } from './unlocks';
import { addMessage, type DayResult, type GameState, type Show } from './state';

// --- The era, the prices and what a show can sell ---

/** Whether a show's goods are the player's to sell: a bought title's are not. */
export const sellsMerchandise = (show: Pick<Show, 'genre'>) => !isLicensed(show.genre);

/** The medium of a show's genre. */
const mediumOf = (show: Pick<Show, 'genre'>) => (getGenre(show.genre).medium === 'tv' ? 'tv' : 'radio');

/** The tapes a show's medium sells in a year (cassettes, VHS, DVD), or null where there are none yet. */
export function tapeEra(year: number, show: Pick<Show, 'genre'>) {
  const era = [...MERCH_ERAS].reverse().find((e) => e.from <= year) ?? MERCH_ERAS[0]!;
  return era[mediumOf(show)];
}

/** What the show's goods of a line cost for a unit and what they sell for, in a year; null where the line does not exist (no TV tapes before 1978). */
export function lineTerms(line: MerchLine, year: number, show: Pick<Show, 'genre'>): { pay: number; price: number; name: string } | null {
  if (line === 'tapes') {
    const era = tapeEra(year, show);
    return era ? { pay: era.price * TAPE_PAY, price: era.price, name: era.name } : null;
  }
  return { ...MERCH.lines[line], name: line };
}

export const LINE_NAMES: Record<MerchLine, string> = { tapes: 'Tapes', clothes: 'Clothes', gifts: 'Gifts' };

export const showHype = (show: Pick<Show, 'hype'>) => show.hype ?? MERCH.hype.start;

/** What it costs to buy a box of a line for a show now, or null if there is none. */
export function boxPrice(state: GameState, show: Pick<Show, 'genre'>, line: MerchLine): number | null {
  const terms = lineTerms(line, toCalendarDate(state.day).year, show);
  return terms ? terms.pay * MERCH.box : null;
}

// --- The shop: what it holds, and who works in it ---

/** The gift shops with everything on their checklist. */
export const shops = (state: GameState) => state.rooms.filter((r) => r.type === 'giftShop' && isFurnished(r));

/** Units of a line the pieces of the shops can hold on show; pieces that are broken hold nothing. */
export function shopHolds(state: GameState, line: MerchLine): number {
  return shops(state).reduce((sum, r) => sum + r.furniture.reduce((n, f) => {
    const holds = furnitureSpec(f.type).holds;
    return holds && holds.line === line && !isBroken(f) ? n + holds.units : n;
  }, 0), 0);
}

/** Units the boxes in the storage rooms keep, besides what the shop floor holds. */
export function storageHolds(state: GameState): number {
  return state.rooms.filter((r) => r.type === 'storageRoom' && isFurnished(r)).reduce((sum, r) => sum + r.furniture.reduce((n, f) => {
    const holds = furnitureSpec(f.type).holds;
    return holds && holds.line === 'any' && !isBroken(f) ? n + holds.units : n;
  }, 0), 0);
}

/** Units of a line in stock, for all the shows. */
export const stockOf = (state: GameState, line: MerchLine) => state.shows.reduce((sum, s) => sum + (s.stock?.[line]?.units ?? 0), 0);

/** Units of a line on show: the stock, up to what the pieces of the shop hold. The rest is in storage. */
export const onShow = (state: GameState, line: MerchLine) => Math.min(stockOf(state, line), shopHolds(state, line));

/** Units in storage: the stock that does not fit on the pieces. */
export const inStorage = (state: GameState) => MERCH_LINES.reduce((sum, line) => sum + Math.max(0, stockOf(state, line) - shopHolds(state, line)), 0);

/** How many units a line has room for on top of what it has: its pieces, and the storage that is left. */
export function roomLeft(state: GameState, line: MerchLine): number {
  const shelf = Math.max(0, shopHolds(state, line) - stockOf(state, line));
  const spare = Math.max(0, storageHolds(state) - inStorage(state));
  return shelf + (shopHolds(state, line) > 0 ? spare : 0);
}

/** Salespeople on the till who have a place at a till of a shop that works. */
export const tillStaff = (state: GameState, desked: Desks) => state.employees.filter((e) => onTill(e) && desked.has(e.id));

/** Whether the shop has goods but cannot sell them: nobody is at a till, or nothing stands on the shop floor (the dot on the Merchandise tab). */
export const merchandiseStuck = (state: GameState, desked: Desks) =>
  isUnlocked(state, 'merchandise') && shops(state).length > 0 && state.shows.some((s) => MERCH_LINES.some((l) => (s.stock?.[l]?.units ?? 0) > 0)) && (tillStaff(state, desked).length === 0 || MERCH_LINES.every((l) => onShow(state, l) === 0));

/** Why orders cannot be taken yet, or null: Phone-in lines, a post room, a gift shop. */
export function ordersBlocker(state: GameState): string | null {
  if (!ownsTech(state, 'phoneIns')) return 'Orders open with Phone-in lines (research).';
  if (!hasPostRoom(state)) return 'Orders come by post: build a post room with a sorting case.';
  if (shops(state).length === 0) return 'Orders need a gift shop.';
  return null;
}

/** Whether the storage room a hand truck stands in shares a wall with a gift shop that works. */
export function storageNextToShop(state: GameState, roomId: string): boolean {
  const room = findRoom(state, roomId);
  return room !== undefined && shops(state).some((shop) => sharesWall(room, shop));
}

/** Why a person on orders cannot pack today, or null. */
export function packingBlocker(state: GameState, employeeId: string, desked: Desks): string | null {
  const desk = desked.get(employeeId);
  if (!desk) return 'No hand truck in a storage room';
  const general = ordersBlocker(state);
  if (general) return general;
  return storageNextToShop(state, desk.roomId) ? null : 'The storage room is not next to the gift shop';
}

/** Orders a person on orders handles a week, and the share of the money that comes back, by grade. */
export function ordersBand(grade: number) {
  return ORDERS.bands.reduce((best, band) => (grade >= band.from ? band : best), ORDERS.bands[0]!);
}

/** Whether the orders double: the Internet and a server rack that works. */
export const ordersDoubled = (state: GameState) =>
  ownsTech(state, 'internet') && state.rooms.some((r) => r.type === 'library' && r.furniture.some((f) => f.type === 'serverRack' && !isBroken(f)));

/** The people who pack orders today, with their orders a day and refund share. */
export function orderPackers(state: GameState, desked: Desks): { id: string; units: number; refund: number }[] {
  const factor = (ordersDoubled(state) ? ORDERS.internetFactor : 1) * (1 + mailLift(state.lastDay?.calls));
  return state.employees
    .filter((e) => onOrders(e) && packingBlocker(state, e.id, desked) === null)
    .map((e) => {
      const band = ordersBand(salesGrade(state, e, desked));
      return { id: e.id, units: ((band.perWeek * ORDERS.units) / 7) * factor, refund: band.refund };
    });
}

/** Units a day the tills can sell: each person at a till sells MERCH.tillUnits scaled by their grade. */
export const tillCapacity = (state: GameState, desked: Desks) => tillStaff(state, desked).reduce((sum, e) => sum + (MERCH.tillUnits * salesGrade(state, e, desked)) / 100, 0);

// --- What a show sells ---

/** The part of the demand that walks in: more with audience seating in the show's studio. */
function walkInShare(state: GameState, show: Show): number {
  const room = show.studioId ? state.rooms.find((r) => r.roomId === show.studioId) : undefined;
  const blocks = Math.min(MERCH.maxSeating, room?.furniture.filter((f) => f.type === 'audienceSeating').length ?? 0);
  return Math.min(1, MERCH.walkIn + blocks * MERCH.seatingWalkIn);
}

/** The listeners term of the demand: the square root of the show's listeners, capped, with a floor so a show off the air still sells a little. */
export const listenersFactor = (listeners: number) => Math.max(MERCH.listeners.floor, Math.sqrt(Math.min(MERCH.listeners.cap, listeners) / MERCH.listeners.per));

/** Units a day that a show's fans want of a line, before the shop and its staff limit them. */
export function demandFor(show: Show, line: MerchLine, year: number, listeners: number): number {
  if (!sellsMerchandise(show)) return 0;
  const terms = lineTerms(line, year, show);
  if (!terms) return 0;
  const devotion = MERCH.devotion[show.genre] ?? MERCH.devotionOther;
  const fit = (show.genre === 'kids' ? MERCH.fit.kids : MERCH.fit[mediumOf(show)])![line];
  const era = line === 'tapes' ? (tapeEra(year, show)?.demand ?? 0) : 1;
  return MERCH.base * (show.fans ?? 0) * devotion * (0.5 + showHype(show)) * listenersFactor(listeners) * fit * era;
}

/** Units a week the fans of a show want, all lines, for the tab: from yesterday's listeners. */
export function weeklyDemand(state: GameState, show: Show): number {
  const year = toCalendarDate(state.day).year;
  const listeners = showListenersOn(state.lastDay, show.id);
  return 7 * MERCH_LINES.reduce((sum, line) => sum + demandFor(show, line, year, listeners), 0);
}

/** The listeners a show had yesterday: its best slot. */
export function showListenersOn(result: DayResult | null | undefined, showId: string): number {
  return Math.max(0, ...(result?.channels ?? []).filter((c) => c.isPlayer).flatMap((c) => c.slots).filter((s) => s.showId === showId && !s.titleId).map((s) => s.listeners));
}

/** The slots of the player's channels that aired a show of their own today. */
function ownSlots(draft: GameState, result: DayResult) {
  return result.channels
    .filter((c) => c.isPlayer)
    .flatMap((c) => c.slots)
    .flatMap((slot) => {
      const show = slot.showId && !slot.titleId ? draft.shows.find((s) => s.id === slot.showId) : undefined;
      return show ? [{ show, slot }] : [];
    });
}

// --- Fans and hype ---

/** Daily: a show that aired moves its fans towards its quality; one off the air loses them slowly. The hype fades, and a good run and a campaign lift it. */
export function growFans(draft: GameState, result: DayResult): void {
  const aired = new Map<string, number>();
  for (const { show, slot } of ownSlots(draft, result)) aired.set(show.id, Math.max(aired.get(show.id) ?? 0, Math.min(1, slot.quality)));
  for (const show of draft.shows) {
    const quality = aired.get(show.id);
    const fans = show.fans ?? 0;
    const hype = showHype(show);
    const campaign = draft.campaigns.some((c) => c.targetId === show.id) ? MERCH.hype.campaign : 0;
    if (quality === undefined) {
      show.hype = Math.max(0, hype * (1 - MERCH.hype.fadeOffAir));
      show.fans = Math.max(0, fans - MERCH.fade);
    } else {
      show.hype = Math.min(1, Math.max(0, hype + (quality * MERCH.hype.rest - hype) * MERCH.hype.fade + Math.max(0, quality - fans) * MERCH.hype.gain + campaign));
      show.fans = fans + (quality - fans) * MERCH.grow;
    }
  }
}

/** Fans an award brings a show of the player's, and hype. */
export function awardFans(draft: GameState, showId: string | null, kind: keyof typeof MERCH.awardFans): void {
  const show = draft.shows.find((s) => s.id === showId);
  if (!show) return;
  show.fans = Math.min(1, (show.fans ?? 0) + MERCH.awardFans[kind]);
  show.hype = Math.min(1, showHype(show) + MERCH.hype.award[kind]);
}

// --- Selling ---

/** Takes units out of a show's stock; returns what they cost. */
function takeFromStock(show: Show, line: MerchLine, units: number): void {
  const stock = show.stock?.[line];
  if (!stock) return;
  const taken = Math.min(units, stock.units);
  stock.paid -= stock.units > 0 ? (stock.paid * taken) / stock.units : 0;
  stock.units -= taken;
  if (stock.units <= 0.0001) delete show.stock![line];
}

/**
 * Daily: the gift shop sells what the fans of each show want of each line, from the stock of that show. At the till: at most
 * what is on show × MERCH.turnover, at most what the people at the tills can ring up. By order: from all the stock, at most what
 * the people packing orders handle, less the refunds. No shop, no sales, and nothing here draws from the random stream.
 * A game in its days of grace after the 0.21.0 update keeps the old daily share until then.
 */
export function sellMerchandise(draft: GameState, result: DayResult, desked: Desks): void {
  if ((draft.merchGraceUntil ?? -1) > draft.day) {
    sellOldShare(draft, result, desked);
    return;
  }
  if (!isUnlocked(draft, 'merchandise') || shops(draft).length === 0) return;
  const year = toCalendarDate(draft.day).year;
  const walkable = new Map<string, number>();
  let tillLeft = tillCapacity(draft, desked);
  const packers = orderPackers(draft, desked);
  let ordersLeft = packers.reduce((sum, p) => sum + p.units, 0);
  const refund = ordersLeft > 0 ? packers.reduce((sum, p) => sum + p.units * p.refund, 0) / ordersLeft : 0;
  let total = 0;
  const units: Record<string, number> = {};
  for (const line of MERCH_LINES) {
    const rows = draft.shows
      .filter((s) => (s.stock?.[line]?.units ?? 0) > 0)
      .map((show) => {
        const demand = demandFor(show, line, year, showListenersOn(result, show.id));
        const walk = walkInShare(draft, show);
        return { show, walk: demand * walk, order: demand * (1 - walk) };
      });
    if (rows.length === 0) continue;
    const walkDemand = rows.reduce((s, r) => s + r.walk, 0);
    const floor = onShow(draft, line) * MERCH.turnover;
    const walkSold = Math.min(walkDemand, floor, tillLeft);
    tillLeft -= walkSold;
    const orderDemand = rows.reduce((s, r) => s + r.order, 0);
    const orderSold = ordersLeft > 0 ? Math.min(orderDemand, ordersLeft) : 0;
    ordersLeft -= orderSold;
    for (const r of rows) {
      const terms = lineTerms(line, year, r.show);
      if (!terms) continue;
      const stock = r.show.stock![line]!;
      const wanted = (walkDemand > 0 ? (walkSold * r.walk) / walkDemand : 0) + (orderDemand > 0 ? (orderSold * r.order) / orderDemand : 0);
      const sold = Math.min(stock.units, wanted);
      if (sold <= 0) continue;
      const orderPart = orderDemand > 0 ? Math.min(sold, (orderSold * r.order) / orderDemand) : 0;
      const money = terms.price * (sold - orderPart * refund);
      takeFromStock(r.show, line, sold);
      total += money;
      units[r.show.id] = (units[r.show.id] ?? 0) + sold;
      walkable.set(r.show.id, (walkable.get(r.show.id) ?? 0) + money);
    }
  }
  if (total <= 0) return;
  draft.money += total;
  draft.ledger.revenue += total;
  draft.ledger.merchandise += total;
  result.merchandise = (result.merchandise ?? 0) + total;
  result.merchUnits = units;
  for (const id of walkable.keys()) {
    const show = draft.shows.find((s) => s.id === id);
    if (show && !show.sells) {
      show.sells = true;
      addMessage(draft, 'good', `Merchandise from “${show.name}” is selling in the gift shop.`, 'routine', undefined, undefined, 'salesReports');
    }
  }
}

// --- Games from before the shop: the old daily share, for the days of grace ---

const oldShare = (show: Pick<Show, 'genre'>) => (isLicensed(show.genre) ? 0 : (MERCH.oldShare.genre[show.genre] ?? MERCH.oldShare.medium[getGenre(show.genre).medium] ?? 0));
const oldCurve = (quality: number) => Math.max(0, Math.min(1, (quality - MERCH.oldShare.minQuality) / (1 - MERCH.oldShare.minQuality)));

function sellOldShare(draft: GameState, result: DayResult, desked: Desks): void {
  if (!draft.employees.some((e) => e.role === 'sales' && desked.has(e.id))) return;
  const mail = 1 + mailLift(result.calls);
  let total = 0;
  for (const { show, slot } of ownSlots(draft, result)) {
    const amount = slot.revenue * oldShare(show) * oldCurve(slot.quality) * (show.fans ?? 0) * mail;
    if (amount <= 0) continue;
    total += amount;
  }
  if (total <= 0) return;
  draft.money += total;
  draft.ledger.revenue += total;
  draft.ledger.merchandise += total;
  result.merchandise = (result.merchandise ?? 0) + total;
}

/** What boxes left on a show clear at: a part of what they cost. */
export function clearanceOf(show: Show): number {
  return MERCH_LINES.reduce((sum, line) => sum + (show.stock?.[line]?.paid ?? 0), 0) * MERCH.clearance;
}
