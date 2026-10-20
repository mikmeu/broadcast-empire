// The content market: licensed TV titles (movies, series, …) and sports rights.
// Titles live in the library; a licensed program airs the best available title
// of its genre each day.

import { CONTENT, RECORDS, ROYALTIES, SPORTS_RIGHTS } from '../config/balance';
import { GENRES, getGenre, type GenreId } from '../config/genres';
import { TITLES_PER_RACK, TITLES_PER_SHELF } from '../config/office';
import { SPORTS_LEAGUES, TITLE_NAMES } from '../config/names';
import { SLOTS, TUNED_IN } from '../config/world';
import { Rng } from './rng';
import { inGrace, isFurnished } from './office';
import { genreAvailable, techMultiplier } from './tech';
import { addMessage, newId, type Furniture, type GameState, type Id, type RightsOffer, type Title, type TitleOffer } from './state';

export const isLicensed = (genre: GenreId) => getGenre(genre).kind === 'licensed';

/** A licensed title's quality on air, after library technology. */
export const titleQuality = (state: GameState, quality: number) => Math.min(1, quality * techMultiplier(state, 'licensedQuality'));

/** Titles one piece of a library holds: a shelf, or a server rack by its tier. */
const titlesHeld = (f: Furniture) => (f.type === 'shelving' ? TITLES_PER_SHELF : f.type === 'serverRack' ? (TITLES_PER_RACK[Math.min(f.tier, TITLES_PER_RACK.length) - 1] ?? 0) : 0);

/** Titles the player's libraries can hold. */
export function libraryCapacity(state: GameState): number {
  return state.rooms
    .filter((r) => r.type === 'library')
    .reduce((n, r) => n + r.furniture.reduce((titles, f) => titles + titlesHeld(f), 0), 0);
}

/** Whether a genre's shows play records, so that they need a collection in the library (0.18.0). */
export const playsRecords = (genre: GenreId) => ROYALTIES.genres.includes(genre);

/** Whether the library holds the record collection of a genre. */
export const hasRecords = (state: GameState, genre: GenreId) => state.records.includes(genre);

/** Places in the library taken: the titles, and a shelf's worth for each record collection. */
export const libraryUsed = (state: GameState) => state.library.length + state.records.length * RECORDS.libraryUnits;

/** Why a record collection can't be bought today, or null if it can. */
export function recordsBlocker(state: GameState, genre: GenreId): string | null {
  if (!playsRecords(genre)) return 'That genre plays no records.';
  if (!genreAvailable(state, genre)) return 'That music is not on the air yet.';
  if (hasRecords(state, genre)) return `You already hold the ${getGenre(genre).name} records.`;
  if (postRoomNeeded(state)) return 'The records come by post: set up a post room with a sorting case on the Office screen first.';
  if (libraryCapacity(state) === 0) return 'Set up a library with shelving on the Office screen first.';
  if (libraryUsed(state) + RECORDS.libraryUnits > libraryCapacity(state)) return 'Your library is full. Add shelving or let titles run out.';
  return null;
}

/** Whether the company has a post room with its sorting case: where the titles come in (0.17.0). */
export const hasPostRoom = (state: GameState) => state.rooms.some((r) => r.type === 'postRoom' && isFurnished(r));

/** Whether any library holds a server rack: titles that come over the wire need no post room. */
export const hasServerRack = (state: GameState) => state.rooms.some((r) => r.type === 'library' && r.furniture.some((f) => f.type === 'serverRack'));

/**
 * Whether the lack of a post room stands in the way of a library and of
 * buying titles: until the first server rack, titles come by post. A game
 * from before 0.17.0 that has a library gets time for it (`GameState.grace`).
 */
export const postRoomNeeded = (state: GameState) => !hasServerRack(state) && !hasPostRoom(state) && !inGrace(state, 'postRoom');

export function titlePrice(genre: GenreId, quality: number, airings: number): number {
  const perAiring = CONTENT.pricePerAiring[genre] ?? 0;
  return Math.round((perAiring * airings * quality ** 1.5) / 500) * 500;
}

function titleName(rng: Rng, genre: GenreId, taken: Set<string>): string {
  const pool = TITLE_NAMES[genre];
  if (!pool) return getGenre(genre).name;
  for (let i = 0; i < 20; i++) {
    const name = `${rng.pick(pool.first)} ${rng.pick(pool.second)}`;
    if (!taken.has(name)) return name;
  }
  return `${rng.pick(pool.first)} ${rng.pick(pool.second)} ${rng.int(2, 9)}`;
}

/** Mixed into the state of the game's chance to start the stream of the cartoons on the market. */
const CARTOON_STREAM = 0x5eed_0016;

/** Monthly: a fresh selection of titles and sports rights. Unsold offers are gone. */
export function refreshMarket(draft: GameState, main: Rng): void {
  const taken = new Set([...draft.library.map((t) => t.name)]);
  const titles: TitleOffer[] = [];
  // Cartoons (0.16.0) come from a stream of chance of their own, so the rest of the market is what it was.
  const side = new Rng((main.state ^ CARTOON_STREAM) >>> 0);
  for (const genre of GENRES.filter((g) => g.kind === 'licensed' && genreAvailable(draft, g.id))) {
    const count = CONTENT.titlesPerMonth[genre.id] ?? 0;
    const [minAirings, maxAirings] = CONTENT.airings[genre.id] ?? [5, 10];
    const rng = genre.id === 'cartoons' ? side : main;
    for (let i = 0; i < count; i++) {
      const isTeleshopping = genre.id === 'teleshopping';
      const quality = isTeleshopping
        ? CONTENT.teleshopping.maxQuality * (0.6 + 0.4 * rng.next())
        : CONTENT.quality.min + rng.next() * (CONTENT.quality.max - CONTENT.quality.min);
      const airings = rng.int(minAirings, maxAirings);
      const name = titleName(rng, genre.id, taken);
      taken.add(name);
      const { min, max } = CONTENT.teleshopping.feePerAiring;
      titles.push({
        id: newId(draft, 't'),
        name,
        genre: genre.id,
        quality: Math.round(quality * 100) / 100,
        airings,
        price: titlePrice(genre.id, quality, airings),
        fee: isTeleshopping ? Math.round(rng.int(min, max) / 50) * 50 : 0,
      });
    }
  }

  const rights: RightsOffer[] = [];
  const leagues = SPORTS_LEAGUES.filter((l) => !draft.sportsRights.some((r) => r.name === l));
  for (let i = 0; i < SPORTS_RIGHTS.offersPerMonth && leagues.length > 0; i++) {
    const name = leagues.splice(main.int(0, leagues.length - 1), 1)[0]!;
    const prestige = Math.round((SPORTS_RIGHTS.prestige.min + main.next() * (SPORTS_RIGHTS.prestige.max - SPORTS_RIGHTS.prestige.min)) * 100) / 100;
    const months = main.pick(SPORTS_RIGHTS.months);
    rights.push({
      id: newId(draft, 'sr'),
      name,
      prestige,
      months,
      price: Math.round((SPORTS_RIGHTS.pricePerMonth * months * prestige ** 2) / 1000) * 1000,
    });
  }
  draft.market = { titles, rights };
}

/** Best sports rights the player holds today, or null. */
export function activeRights(state: GameState): { name: string; prestige: number } | null {
  return state.sportsRights.filter((r) => r.endDay > state.day).sort((a, b) => b.prestige - a.prestige)[0] ?? null;
}

/** Slot indexes from most to fewest TV viewers, so the best titles go to the biggest slots. */
const SLOTS_BY_VIEWERS = SLOTS.map((_, i) => i).sort(
  (a, b) =>
    Object.values(TUNED_IN.tv).reduce((sum, row) => sum + (row[b] ?? 0), 0) -
    Object.values(TUNED_IN.tv).reduce((sum, row) => sum + (row[a] ?? 0), 0),
);

/**
 * Which title each licensed program airs today: the freshest-best title of its
 * genre that still has airings and isn't already used elsewhere today.
 * Returns a map from `${channelId}:${slot}` to the title.
 */
export function pickTitles(state: GameState): Map<string, Title> {
  const picks = new Map<string, Title>();
  if (libraryCapacity(state) === 0) return picks;
  const used = new Set<Id>();
  const score = (t: Title) => t.quality * t.freshness;
  for (const slot of SLOTS_BY_VIEWERS) {
    for (const channel of state.channels) {
      const show = state.shows.find((s) => s.id === channel.schedule[slot]);
      if (!show || !isLicensed(show.genre)) continue;
      const title = state.library
        .filter((t) => t.genre === show.genre && t.airingsLeft > 0 && !used.has(t.id))
        .sort((a, b) => score(b) - score(a))[0];
      if (!title) continue;
      used.add(title.id);
      picks.set(`${channel.id}:${slot}`, title);
    }
  }
  return picks;
}

/** Daily: titles that aired lose freshness and an airing; the rest recover. Used-up titles leave the library. */
export function updateLibrary(draft: GameState, airedTitleIds: Set<Id>): void {
  for (const title of draft.library) {
    if (airedTitleIds.has(title.id)) {
      title.airingsLeft -= 1;
      title.freshness = Math.max(CONTENT.minFreshness, title.freshness * CONTENT.freshnessPerAiring);
    } else {
      title.freshness = Math.min(1, title.freshness + CONTENT.freshnessRecovery);
    }
  }
  const finished = draft.library.filter((t) => t.airingsLeft <= 0);
  for (const title of finished) addMessage(draft, 'info', `“${title.name}” has used up its airings and leaves the library.`, undefined, undefined, 'production');
  draft.library = draft.library.filter((t) => t.airingsLeft > 0);

  const expired = draft.sportsRights.filter((r) => r.endDay <= draft.day + 1);
  for (const rights of expired) addMessage(draft, 'warning', `Your ${rights.name} broadcast rights have run out.`, undefined, undefined, 'production');
  draft.sportsRights = draft.sportsRights.filter((r) => r.endDay > draft.day + 1);
}

/** Total airings left in the library per genre (for the UI and the bots). */
export function airingsByGenre(state: GameState): Map<GenreId, number> {
  const totals = new Map<GenreId, number>();
  for (const t of state.library) totals.set(t.genre, (totals.get(t.genre) ?? 0) + t.airingsLeft);
  return totals;
}
