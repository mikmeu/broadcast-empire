// The streaming service (0.18.0): the company's shows and titles on demand,
// for a monthly price the player sets. People who pay for streaming share
// themselves among the services that are open by how much each is worth to
// them: a big catalogue, good and fresh, at a fair price. Subscribers drift
// toward that, as far as the server racks can serve them. The numbers are in
// STREAMING in config/balance.ts; what the service takes from the company's
// own TV channels is `watchedOnDemand` in broadcast.ts.

import { DAYS_PER_YEAR, START_YEAR, STREAMING } from '../config/balance';
import { getGenre } from '../config/genres';
import { toCalendarDate } from './calendar';
import { titleQuality } from './content';
import { isBroken } from './office';
import { addHeadline, addMessage, type GameState, type Id, type Title } from './state';
import { countryPopulation } from './world';

/** A monthly price as the player sets it, with its cents when it has any. */
export const formatPrice = (price: number) => `€${Number.isInteger(price) ? price : price.toFixed(2)}`;

// --- What it offers ---

/** The titles of the library that go on the service: all but teleshopping, which nobody watches by choice. */
export const onDemandTitles = (state: GameState): Title[] => state.library.filter((t) => t.genre !== 'teleshopping' && t.airingsLeft > 0);

export interface Catalogue {
  /** Shows that went out yesterday: the TV shows, and the radio shows once Podcasting is researched. */
  shows: number;
  titles: number;
  size: number;
  /** Their average quality and freshness, 0 for an empty catalogue. */
  quality: number;
  freshness: number;
}

/**
 * What the service offers today: every produced show that went out yesterday
 * (bought titles are counted from the library, not from the programme that
 * airs them), at the quality it went out at, and the titles in the library.
 */
export function streamingCatalogue(state: GameState): Catalogue {
  const podcasts = state.techs.includes('podcasting');
  const aired = new Map<Id, number>();
  for (const slot of (state.lastDay?.channels ?? []).filter((c) => c.isPlayer).flatMap((c) => c.slots)) {
    if (!slot.showId || slot.titleId || slot.quality <= 0) continue;
    aired.set(slot.showId, Math.max(aired.get(slot.showId) ?? 0, slot.quality));
  }
  const shows = state.shows.filter((s) => aired.has(s.id) && (getGenre(s.genre).medium === 'tv' || podcasts));
  const titles = onDemandTitles(state);
  const items = [
    ...shows.map((s) => ({ quality: aired.get(s.id)!, freshness: s.freshness })),
    ...titles.map((t) => ({ quality: titleQuality(state, t.quality), freshness: t.freshness })),
  ];
  const average = (pick: (item: (typeof items)[number]) => number) => (items.length > 0 ? items.reduce((sum, item) => sum + pick(item), 0) / items.length : 0);
  return { shows: shows.length, titles: titles.length, size: items.length, quality: average((i) => i.quality), freshness: average((i) => i.freshness) };
}

/** Server racks in the company's libraries: each serves its subscribers by its tier, unless it is broken. */
export const serverRacks = (state: GameState) => state.rooms.filter((r) => r.type === 'library').flatMap((r) => r.furniture.filter((f) => f.type === 'serverRack'));

/** How many subscribers the racks can serve. */
export const streamingCapacity = (state: GameState) =>
  serverRacks(state)
    .filter((f) => !isBroken(f))
    .reduce((sum, f) => sum + (STREAMING.subscribersPerRack[Math.min(f.tier, STREAMING.subscribersPerRack.length) - 1] ?? 0), 0);

// --- What it is worth ---

/** How much the size of a catalogue counts: in full up to STREAMING.fullCatalogue, a quarter as much for each one beyond. */
export function sizeFactor(size: number): number {
  const full = STREAMING.fullCatalogue;
  return size <= full ? size / full : Math.min(STREAMING.maxSize, 1 + (STREAMING.beyond * (size - full)) / full);
}

/** The monthly price people find fair in a year. */
export const fairPrice = (year: number) => STREAMING.fairPrice.base + STREAMING.fairPrice.perYear * Math.max(0, year - STREAMING.fairPrice.fromYear);

/** What a price does to the service's appeal: 1 at the fair price, less above it, a little more below. */
export function priceFactor(price: number, fair: number): number {
  return price >= fair ? Math.max(STREAMING.floor, 1 - STREAMING.dearer * (price - fair)) : 1 + STREAMING.cheaper * (fair - price);
}

/** The share of the country's people who pay for streaming at all on a day: nobody before the first year. */
export function streamingShare(day: number): number {
  const { from, to } = STREAMING.market;
  const year = START_YEAR + day / DAYS_PER_YEAR;
  if (year < from.year) return 0;
  return from.share + (to.share - from.share) * Math.min(1, (year - from.year) / (to.year - from.year));
}

/** The rival services that are open in a year, with their appeal then. */
export function rivalServices(year: number): { name: string; appeal: number }[] {
  return STREAMING.rivals.filter((r) => r.opens <= year).map((r) => ({ name: r.name, appeal: r.appeal + r.growth * (year - r.opens) }));
}

export interface StreamingTarget {
  catalogue: Catalogue;
  /** The parts of the appeal: the catalogue's size, its quality and freshness (in `catalogue`), and the price. */
  size: number;
  price: number;
  fair: number;
  appeal: number;
  rivals: { name: string; appeal: number }[];
  /** The service's share of the people who pay for streaming. */
  share: number;
  /** People who pay for streaming. */
  market: number;
  /** Who would subscribe, and how many the racks can serve. */
  demand: number;
  capacity: number;
  /** Where the subscribers are heading: the demand, as far as the racks serve it. */
  target: number;
}

/** What the service would draw today at a price (by default the one it has): its subscribers drift toward the target. */
export function streamingTarget(state: GameState, price = state.streaming?.price ?? STREAMING.price.start): StreamingTarget {
  const year = toCalendarDate(state.day).year;
  const catalogue = streamingCatalogue(state);
  const size = sizeFactor(catalogue.size);
  const fair = fairPrice(year);
  const priced = priceFactor(price, fair);
  const appeal = size * catalogue.quality * catalogue.freshness * priced;
  const rivals = rivalServices(year);
  const share = appeal / (appeal + STREAMING.baseline + rivals.reduce((sum, r) => sum + r.appeal, 0));
  const market = countryPopulation(state.day) * streamingShare(state.day);
  const demand = market * share;
  const capacity = streamingCapacity(state);
  return { catalogue, size, price: priced, fair, appeal, rivals, share, market, demand, capacity, target: Math.min(demand, capacity) };
}

/** What the service costs a month as it stands: its subscribers, and every title it offers. */
export function streamingCosts(state: GameState): { subscribers: number; titles: number } {
  if (!state.streaming) return { subscribers: 0, titles: 0 };
  return {
    subscribers: state.streaming.subscribers * STREAMING.costPerSubscriber,
    titles: onDemandTitles(state).reduce((sum, t) => sum + t.perAiring * STREAMING.titleMonths, 0),
  };
}

/** What subscribers pay a month as the service stands. */
export const subscriptionIncome = (state: GameState) => (state.streaming ? state.streaming.subscribers * state.streaming.price : 0);

// --- Opening it ---

/** What the lock on the Streaming section of On air says until it is researched. */
export const STREAMING_LOCK = 'A streaming service opens with the research “Streaming”.';

/** Why the company can't open a service now, or null. */
export function streamingBlocker(state: GameState): string | null {
  if (state.streaming) return 'Your streaming service is open already.';
  if (!state.techs.includes('streaming')) return 'Research Streaming first.';
  if (serverRacks(state).length < STREAMING.minRacks) return `Needs ${STREAMING.minRacks} server racks in a library.`;
  if (streamingCatalogue(state).size < STREAMING.minCatalogue) return `Needs ${STREAMING.minCatalogue} shows on the air or titles in the library.`;
  return null;
}

/** Why a price can't be asked, or null. */
export function priceError(price: number): string | null {
  const { min, max } = STREAMING.price;
  return Number.isFinite(price) && price >= min && price <= max ? null : `Pick a price from ${formatPrice(min)} to ${formatPrice(max)} a month.`;
}

/** A price as it is kept: in steps of STREAMING.price.step. */
export const roundPrice = (price: number) => Math.round(price / STREAMING.price.step) * STREAMING.price.step;

// --- Every day ---

/**
 * Daily: subscribers drift toward the target, at most as many as the racks
 * serve; they pay a day's share of the month's price, and the service costs
 * a day's share of its month. Warns once when the racks are full.
 */
export function runStreaming(draft: GameState): void {
  const service = draft.streaming;
  if (!service) return;
  const target = streamingTarget(draft);
  service.subscribers = Math.min(target.capacity, service.subscribers + (target.target - service.subscribers) * STREAMING.drift);
  if (!service.capped && target.demand > target.capacity) {
    service.capped = true;
    addMessage(draft, 'warning', 'Your streaming service is full: more people want it than your server racks can serve. Put more racks in a library.', undefined, 'broadcast:streaming');
  } else if (service.capped && target.demand < target.capacity * STREAMING.roomAgain) {
    service.capped = false;
  }
  const perDay = 12 / DAYS_PER_YEAR;
  const income = subscriptionIncome(draft) * perDay;
  const costs = streamingCosts(draft);
  const cost = (costs.subscribers + costs.titles) * perDay;
  draft.money += income - cost;
  draft.ledger.revenue += income;
  draft.ledger.subscriptions += income;
  draft.ledger.streaming += cost;
}

/** On the 1st of January: a rival service that opens that year is in the news, and the player who streams is told. */
export function openRivalServices(draft: GameState): void {
  const { year, month, dayOfMonth } = toCalendarDate(draft.day);
  if (month !== 1 || dayOfMonth !== 1) return;
  for (const rival of STREAMING.rivals.filter((r) => r.opens === year)) {
    addHeadline(draft, rival.news);
    if (draft.streaming) addMessage(draft, 'warning', `${rival.name} has opened. People who stream now share themselves among more services: watch your subscribers.`, undefined, 'broadcast:streaming');
  }
}

/** The news when the service opens. */
export function announceService(draft: GameState): void {
  const price = draft.streaming!.price;
  addHeadline(draft, `${draft.companyName} opens a streaming service: its shows on demand, at ${formatPrice(price)} a month.`);
  addMessage(draft, 'good', `Your streaming service is open, at ${formatPrice(price)} a month. Subscribers come over the weeks ahead.`);
}
