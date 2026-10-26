// News vans (0.20.0, #20): a van, sent out on a shift with a journalist, makes the news shows of that shift more
// appealing, and every trip costs a fee. The day shift is the morning, lunch and afternoon slots, the evening shift
// the evening and late night. A van gives a lift to every radio and TV news show on the air in its shift; to sports
// shows only on a day with a sports event on, or in an election campaign. A van needs a journalist at a desk to go
// out: journalists are matched to the vans that have a shift, in the order they were bought. The numbers are in
// NEWS_VAN in config/balance.ts. This file imports no broadcasting code; broadcast.ts and the others call into it.

import { BREAKING, NEWS_VAN } from '../config/balance';
import { getGenre, type Genre, type GenreId } from '../config/genres';
import { SLOTS } from '../config/world';
import { isNewsGenre } from './breakingNews';
import type { EventContext } from './events';
import type { Desks } from './office';
import { ownsTech, worthAt } from './tech';
import { helperRate } from './upkeep';
import { PLAYER, type DayResult, type Employee, type GameState, type Id, type NewsVan, type VanShift } from './state';

export const VAN_SHIFTS: readonly VanShift[] = ['day', 'evening'];

export const SHIFT_NAMES: Record<VanShift, string> = { day: 'Day shift', evening: 'Evening shift' };

/** The shift a slot of the day belongs to. */
export const shiftOf = (slot: number): VanShift => (NEWS_VAN.shifts.day.includes(slot) ? 'day' : 'evening');

/** The slots of a shift, by name ("morning, lunch and afternoon"), for the screens. */
export const shiftSlots = (shift: VanShift) => NEWS_VAN.shifts[shift].map((i) => SLOTS[i]!);

/** What a van sells for on a day: all its price in the first days, then less as it ages, as furniture is. */
export function vanValue(van: NewsVan, day: number): number {
  return Math.round(van.price * worthAt(day - van.boughtOn));
}

/** Whether a show of this genre is worth a trip today: news always, sports during a sports event (on TV only if the player has the rights) or an election. */
export function vanCovers(genre: Genre, events: EventContext): boolean {
  if ((NEWS_VAN.newsGenres as readonly string[]).includes(genre.id)) return true;
  if (!(NEWS_VAN.sportsGenres as readonly string[]).includes(genre.id)) return false;
  return events.election || (events.sports !== null && (genre.medium === 'radio' || events.holderId === PLAYER));
}

/** The journalist at a desk who crews each van that has a shift: journalists in hiring order, vans in buying order. */
export function vanCrews(state: GameState, desked: Desks): Map<Id, Employee> {
  const journalists = state.employees.filter((e) => e.role === 'journalist' && desked.has(e.id));
  const crews = new Map<Id, Employee>();
  state.vans.filter((v) => v.shift !== null).forEach((van, i) => {
    const journalist = journalists[i];
    if (journalist) crews.set(van.id, journalist);
  });
  return crews;
}

/** How well each shift is crewed today: 0 for a shift without a van and a journalist, else the crew's rate (skill and morale; at most NEWS_VAN.maxCrew). */
export function crewRates(state: GameState, desked: Desks): Record<VanShift, number> {
  const rates: Record<VanShift, number> = { day: 0, evening: 0 };
  for (const [vanId, journalist] of vanCrews(state, desked)) {
    const shift = state.vans.find((v) => v.id === vanId)!.shift!;
    rates[shift] = Math.max(rates[shift], Math.min(NEWS_VAN.maxCrew, helperRate(state, journalist, desked)));
  }
  return rates;
}

/** The lift of a crewed van for a show in a slot, for a crew of this rate: 1 where the shift has no crew or the show is not covered. */
export function vanAppeal(state: GameState, rates: Record<VanShift, number>, genre: Genre, slot: number, events: EventContext): number {
  const rate = rates[shiftOf(slot)];
  if (rate <= 0 || !vanCovers(genre, events)) return 1;
  const lift = ownsTech(state, 'satelliteUplink') ? NEWS_VAN.uplinkLift : NEWS_VAN.lift;
  // A crewed van is worth more still while a breaking story runs (0.20.0, #21).
  const breaking = events.breaking && isNewsGenre(genre) ? 1 + (BREAKING.vanLift - 1) * rate : 1;
  return (1 + (lift - 1) * rate) * breaking;
}

/** The shifts whose van goes out on a day, from what the player's channels aired in them: those with a crew and a show worth the trip. */
export function vanTrips(state: GameState, desked: Desks, aired: readonly { slot: number; genre: string }[], events: EventContext): Map<VanShift, Id> {
  const out = new Map<VanShift, Id>();
  const crews = vanCrews(state, desked);
  for (const van of state.vans) {
    if (!van.shift || !crews.has(van.id) || out.has(van.shift)) continue;
    if (aired.some((a) => shiftOf(a.slot) === van.shift && vanCovers(getGenre(a.genre as GenreId), events))) out.set(van.shift, van.id);
  }
  return out;
}

/** What the player's channels aired today, by slot and genre (shows of their own, not titles bought). */
export function airedToday(state: GameState, result: DayResult): { slot: number; genre: string }[] {
  const aired: { slot: number; genre: string }[] = [];
  for (const channel of result.channels.filter((c) => c.isPlayer)) {
    channel.slots.forEach((slot, i) => {
      const show = slot.showId && !slot.titleId ? state.shows.find((s) => s.id === slot.showId) : undefined;
      if (show) aired.push({ slot: i, genre: show.genre });
    });
  }
  return aired;
}

/** What the vans that went out today cost: a trip fee each. */
export const tripCost = (trips: ReadonlyMap<VanShift, Id>) => trips.size * NEWS_VAN.trip;

/** Daily: every van that went out today costs its trip fee, a line of the books of its own. Returns the vans that went out. */
export function payTrips(draft: GameState, result: DayResult, desked: Desks, events: EventContext): Map<VanShift, Id> {
  const trips = vanTrips(draft, desked, airedToday(draft, result), events);
  const cost = tripCost(trips);
  draft.money -= cost;
  draft.ledger.newsVans += cost;
  return trips;
}

/** What a day's trips would cost from the schedules as they stand (for the screens): the shows on the air in a crewed shift that a trip is worth. */
export function plannedTrips(state: GameState, desked: Desks, events: EventContext): Map<VanShift, Id> {
  const aired: { slot: number; genre: string }[] = [];
  for (const channel of state.channels) {
    channel.schedule.forEach((id, slot) => {
      const show = state.shows.find((s) => s.id === id);
      if (show) aired.push({ slot, genre: show.genre });
    });
  }
  return vanTrips(state, desked, aired, events);
}
