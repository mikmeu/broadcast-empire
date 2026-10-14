// History (prompt.md section 11): World Cups and Olympics with auctioned TV
// rights, election campaigns and recessions. The calendar is fixed
// (config/events.ts), so everything here follows from the date; the state only
// holds the rights auctions, who won them, and the news ticker.

import { AUCTION, EVENTS, START_YEAR } from '../config/balance';
import { ELECTIONS, RECESSIONS, SPORTS_EVENTS, type SportsEventKind } from '../config/events';
import type { Genre } from '../config/genres';
import { TECHS } from '../config/tech';
import { COUNTRY } from '../config/world';
import { formatDate, toCalendarDate, toDay } from './calendar';
import { spend } from './economy';
import type { Rng } from './rng';
import { PLAYER, addHeadline, addMessage, newId, type GameState, type Id, type Rival } from './state';

const formatEuro = (n: number) => `€${Math.round(n).toLocaleString('en-IE')}`;

// --- The calendar ---

export interface SportsEvent {
  /** e.g. "worldCup-1974" */
  id: string;
  kind: SportsEventKind;
  /** e.g. "World Cup 1974" */
  name: string;
  startDay: number;
  /** First day after the event. */
  endDay: number;
}

/** The World Cup or Olympics held in a year, if any. */
export function sportsEventIn(year: number): SportsEvent | null {
  for (const kind of Object.keys(SPORTS_EVENTS) as SportsEventKind[]) {
    const spec = SPORTS_EVENTS[kind];
    if (year < spec.firstYear || (year - spec.firstYear) % spec.every !== 0) continue;
    const startDay = toDay(year, spec.month, spec.dayOfMonth);
    return { id: `${kind}-${year}`, kind, name: `${spec.name} ${year}`, startDay, endDay: startDay + spec.days };
  }
  return null;
}

/** The sports event going on today, if any. */
export function sportsEventOn(day: number): SportsEvent | null {
  const event = sportsEventIn(toCalendarDate(day).year);
  return event && day >= event.startDay && day < event.endDay ? event : null;
}

/** The next sports event that hasn't finished yet. */
export function nextSportsEvent(day: number): SportsEvent {
  for (let year = toCalendarDate(day).year; ; year++) {
    const event = sportsEventIn(year);
    if (event && event.endDay > day) return event;
  }
}

export const isElectionYear = (year: number) => year >= ELECTIONS.firstYear && (year - ELECTIONS.firstYear) % ELECTIONS.every === 0;

/** True during an election campaign. */
export function electionOn(day: number): boolean {
  const { year, month } = toCalendarDate(day);
  return isElectionYear(year) && month === ELECTIONS.month;
}

export const recessionIn = (year: number) => RECESSIONS.find((r) => r.year === year);

/** Multiplies every ad rate: lower during a recession. */
export const adRateFactor = (day: number) => (recessionIn(toCalendarDate(day).year) ? EVENTS.recessionAdRate : 1);

// --- Effects on appeal ---

export const eventRightsHolder = (state: GameState, event: SportsEvent) => state.eventRights.find((r) => r.eventId === event.id)?.holderId;

/** The sports event on today whose TV rights the player holds, if any. */
export function playerEvent(state: GameState): SportsEvent | null {
  const event = sportsEventOn(state.day);
  return event && eventRightsHolder(state, event) === PLAYER ? event : null;
}

/** What is going on today, worked out once per broadcast day. */
export interface EventContext {
  election: boolean;
  sports: SportsEvent | null;
  /** Who may show the sports event on TV. */
  holderId: Id | undefined;
}

export function eventContext(state: GameState): EventContext {
  const sports = sportsEventOn(state.day);
  return { election: electionOn(state.day), sports, holderId: sports ? eventRightsHolder(state, sports) : undefined };
}

/**
 * Appeal multiplier from today's events for a show of this genre: news during
 * an election campaign; sports during a World Cup or Olympics, on radio for
 * everyone and on TV only for the holder of the event's rights.
 */
export function eventAppeal(context: EventContext, genre: Genre, ownerId: Id): number {
  let multiplier = 1;
  if (context.election && (genre.id === 'news' || genre.id === 'tvNews')) multiplier *= EVENTS.electionNewsAppeal;
  if (context.sports && genre.group === 'Sports' && (genre.medium === 'radio' || context.holderId === ownerId)) multiplier *= EVENTS.sportsAppeal;
  return multiplier;
}

// --- Rights auctions ---

export function rightsReserve(kind: SportsEventKind, year: number): number {
  return Math.round((EVENTS.reserve[kind] * (1 + EVENTS.reserveGrowth) ** (year - START_YEAR)) / 1000) * 1000;
}

const tvRivals = (state: GameState): Rival[] => state.rivals.filter((r) => r.channels.some((c) => c.medium === 'tv'));

function openAuction(draft: GameState, event: SportsEvent): void {
  const reserve = rightsReserve(event.kind, toCalendarDate(event.startDay).year);
  const endsOn = draft.day + AUCTION.days;
  draft.rightsAuctions.push({ id: newId(draft, 'ra'), eventId: event.id, name: event.name, reserve, endsOn, interested: tvRivals(draft).length, bid: null });
  addHeadline(draft, `The TV rights to the ${event.name} go to auction.`);
  addMessage(draft, 'info', `The TV rights to the ${event.name} are up for auction until ${formatDate(endsOn)}. Reserve ${formatEuro(reserve)}; bid on the Content screen.`);
}

function closeAuctions(draft: GameState, rng: Rng): void {
  for (const auction of draft.rightsAuctions.filter((a) => a.endsOn <= draft.day)) {
    draft.rightsAuctions = draft.rightsAuctions.filter((a) => a !== auction);
    const what = `TV rights to the ${auction.name}`;
    const { min, max } = EVENTS.aggression;
    const topRival = tvRivals(draft)
      .filter(() => rng.next() < EVENTS.rivalInterest)
      .map((rival) => ({ rival, amount: Math.round((auction.reserve * (1 + min + rng.next() * (max - min))) / 1000) * 1000 }))
      .sort((a, b) => b.amount - a.amount)[0];

    let playerBid = auction.bid ?? 0;
    if (playerBid > draft.money) {
      addMessage(draft, 'danger', `Your bid for the ${what} was void: you couldn’t pay ${formatEuro(playerBid)}.`);
      playerBid = 0;
    }

    if (playerBid > 0 && playerBid > (topRival?.amount ?? 0)) {
      spend(draft, playerBid, 'content');
      draft.eventRights.push({ eventId: auction.eventId, holderId: PLAYER });
      const runnerUp = topRival ? ` The highest rival bid was ${formatEuro(topRival.amount)}.` : ' No rival bid.';
      addHeadline(draft, `The ${auction.name} will be shown on your channels.`);
      addMessage(draft, 'good', `You won the ${what} for ${formatEuro(playerBid)}.${runnerUp} Schedule a TV sports show to make the most of it.`);
    } else if (topRival) {
      draft.eventRights.push({ eventId: auction.eventId, holderId: topRival.rival.id });
      const yours = playerBid > 0 ? ` Your bid was ${formatEuro(playerBid)}.` : '';
      addHeadline(draft, `${topRival.rival.name} wins the TV rights to the ${auction.name}.`);
      addMessage(draft, playerBid > 0 ? 'warning' : 'info', `${topRival.rival.name} won the ${what} with ${formatEuro(topRival.amount)}.${yours}`);
    } else {
      addHeadline(draft, `Nobody bids for the TV rights to the ${auction.name}.`);
    }
  }
}

// --- One day of history ---

/** Daily, on the new day: open and close rights auctions and report what is happening in the world. */
export function runEvents(draft: GameState, rng: Rng): void {
  const { day } = draft;
  const { year, month, dayOfMonth } = toCalendarDate(day);
  closeAuctions(draft, rng);

  const next = nextSportsEvent(day);
  if (next.startDay - EVENTS.auctionLeadDays === day) openAuction(draft, next);
  if (next.startDay === day) {
    const holder = eventRightsHolder(draft, next);
    const where = holder === PLAYER ? ' Your channels have the TV rights.' : '';
    addHeadline(draft, `The ${next.name} begins: ${COUNTRY} tunes in to sport.`);
    addMessage(draft, 'info', `The ${next.name} has begun: sports shows draw bigger audiences until ${formatDate(next.endDay - 1)}.${where}`, 'event');
  }
  const ended = sportsEventIn(year);
  if (ended?.endDay === day) {
    addHeadline(draft, `The ${ended.name} is over.`);
    draft.eventRights = draft.eventRights.filter((r) => r.eventId !== ended.id);
  }

  if (dayOfMonth !== 1) return;
  if (isElectionYear(year) && month === ELECTIONS.month) {
    addHeadline(draft, `The election campaign is under way: ${COUNTRY} is glued to the news.`);
    addMessage(draft, 'info', 'An election campaign has begun: news shows draw bigger audiences this month.', 'event');
  }
  if (isElectionYear(year) && month === ELECTIONS.month + 1) addHeadline(draft, 'Election day: the votes are in and a new government takes office.');
  // A recession is not known years ahead (the wiki only lists those that have happened), but the economists see it a month before.
  if (month === 12 && recessionIn(year + 1) && !recessionIn(year)) {
    const cut = Math.round((1 - EVENTS.recessionAdRate) * 100);
    addHeadline(draft, 'Economists warn of a recession next year: advertisers are drawing up smaller budgets.');
    addMessage(draft, 'warning', `Economists expect a recession from January: ad rates would be ${cut}% lower all next year.`, 'event');
  }
  if (month !== 1) return;

  const recession = recessionIn(year);
  if (recession && !recessionIn(year - 1)) {
    const cut = Math.round((1 - EVENTS.recessionAdRate) * 100);
    addHeadline(draft, `${recession.name} hits the economy: advertisers cut their budgets.`);
    addMessage(draft, 'warning', `${recession.name} has begun: ad rates are ${cut}% lower this year.`, 'event');
  }
  if (!recession && recessionIn(year - 1)) {
    addHeadline(draft, 'The economy recovers: advertisers are spending again.');
    addMessage(draft, 'good', 'The recession is over: ad rates are back to normal.', 'event');
  }
  const arrivals = TECHS.filter((t) => t.year === year).map((t) => t.name);
  if (arrivals.length > 0) addHeadline(draft, `New in ${year}: ${arrivals.join(' and ')}. Broadcasters across ${COUNTRY} are adopting it.`);
}
