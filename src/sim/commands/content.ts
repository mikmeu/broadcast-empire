// Sponsors, and the content market with its auctions.

import { getGenre, type GenreId } from '../../config/genres';
import { getRegion } from '../../config/world';
import { RECORDS } from '../../config/balance';
import { libraryCapacity, libraryUsed, postRoomNeeded, recordsBlocker } from '../content';
import { costFactor } from '../difficulty';
import { spend } from '../economy';
import { formatDate } from '../calendar';
import { barredUntil, MEDIUM_NAMES } from '../licenses';
import { checkMilestones } from '../milestones';
import { settleContract } from '../sales';
import { techMultiplier } from '../tech';
import { isUnlocked, lockedReason, regionOpen } from '../unlocks';
import { PLAYER, type GameState, type Id, type TitleOffer } from '../state';
import { regionsHeld } from './channels';
import { type ActionResult, act, fail, formatEuro } from './core';

/** Attaches a sponsor offer to a show. One contract per show. */
export function acceptOffer(state: GameState, offerId: Id, showId: Id): ActionResult {
  return act(state, (draft) => {
    const offer = draft.offers.find((o) => o.id === offerId);
    if (!offer || offer.expiresOn < draft.day) return fail('That offer is no longer available.');
    const show = draft.shows.find((s) => s.id === showId);
    if (!show) return fail('That show doesn’t exist.');
    if (getGenre(show.genre).medium !== offer.medium) return fail(`This sponsor wants a ${MEDIUM_NAMES[offer.medium]} show.`);
    if (draft.contracts.some((c) => c.showId === showId)) return fail(`“${show.name}” already has a sponsor.`);
    draft.offers = draft.offers.filter((o) => o !== offer);
    const { expiresOn: _expired, ...terms } = offer;
    draft.contracts.push({ ...terms, showId, startDay: draft.day, endDay: draft.day + offer.weeks * 7, listenerSum: 0, daysRun: 0 });
    // From today the sales staff have a sponsor to look after.
    draft.relations[offer.sponsor] ??= { level: 1, points: 0 };
    // A first contract is a milestone, and it opens Marketing: at once, not with tomorrow's news.
    checkMilestones(draft);
  });
}

/** Ends a sponsor contract early; the penalty is always charged. */
export function cancelContract(state: GameState, contractId: Id): ActionResult {
  return act(state, (draft) => {
    const contract = draft.contracts.find((c) => c.id === contractId);
    if (!contract) return fail('That contract doesn’t exist.');
    settleContract(draft, contract, 'you cancelled it');
  });
}

export function declineOffer(state: GameState, offerId: Id): ActionResult {
  return act(state, (draft) => {
    if (!draft.offers.some((o) => o.id === offerId)) return fail('That offer is no longer available.');
    draft.offers = draft.offers.filter((o) => o.id !== offerId);
  });
}

/** Market prices after library and satellite technology, and the difficulty. */
export const titlePrice = (state: GameState, listed: number) => Math.round(listed * techMultiplier(state, 'contentPrice') * costFactor(state));

export const rightsPrice = (state: GameState, listed: number) => Math.round(listed * techMultiplier(state, 'sportsPrice') * costFactor(state));

/** What one airing of a title on the market will cost: its price, spread over its airings. */
export const airingPrice = (state: GameState, offer: Pick<TitleOffer, 'price' | 'airings'>) => Math.round(titlePrice(state, offer.price) / offer.airings);

/**
 * Takes a licensed title from this month's market into the library. Nothing is
 * paid now: each airing is paid on the day it airs (payTitles in economy.ts).
 */
export function buyTitle(state: GameState, offerId: Id): ActionResult {
  return act(state, (draft) => {
    if (!isUnlocked(draft, 'content')) return fail(lockedReason('content'));
    const offer = draft.market.titles.find((t) => t.id === offerId);
    if (!offer) return fail('That title is no longer for sale.');
    if (postRoomNeeded(draft)) return fail('The titles come by post: set up a post room with a sorting case on the Office screen first.');
    const capacity = libraryCapacity(draft);
    if (capacity === 0) return fail('Set up a library with shelving on the Office screen first.');
    if (libraryUsed(draft) >= capacity) return fail('Your library is full. Add shelving or let titles run out.');
    if (draft.money < 0) return fail('Not while the company is in the red: the distributors want to see money in the bank.');
    draft.market.titles = draft.market.titles.filter((t) => t !== offer);
    draft.library.push({
      id: offer.id,
      name: offer.name,
      genre: offer.genre,
      quality: offer.quality,
      airingsLeft: offer.airings,
      freshness: 1,
      fee: offer.fee,
      perAiring: airingPrice(draft, offer),
      ...(offer.adult && { adult: true }),
    });
    return offer.id;
  });
}

/** What a genre's record collection costs, after the difficulty. */
export const recordsPrice = (state: GameState, genre: GenreId) => Math.round((RECORDS.price[genre] ?? 0) * costFactor(state));

/**
 * Buys the record collection of a music genre (0.18.0), once and for good: it
 * takes a shelf's worth of room in the library, and the shows of that genre
 * can go on the air. It needs no TV license, as the content market does.
 */
export function buyRecords(state: GameState, genre: GenreId): ActionResult {
  return act(state, (draft) => {
    const blocked = recordsBlocker(draft, genre);
    if (blocked) return fail(blocked);
    const price = recordsPrice(draft, genre);
    if (draft.money < price) return fail(`Not enough money (${formatEuro(price)} needed).`);
    // Like furniture and licenses, a thing bought once: it is not a running cost.
    spend(draft, price, 'purchases');
    draft.records.push(genre);
  });
}

/** Throws a title out of the library. Its airings were paid as they aired, so the ones left cost nothing. */
export function discardTitle(state: GameState, titleId: Id): ActionResult {
  return act(state, (draft) => {
    if (!draft.library.some((t) => t.id === titleId)) return fail('That title isn’t in your library.');
    draft.library = draft.library.filter((t) => t.id !== titleId);
  });
}

export function buyRights(state: GameState, offerId: Id): ActionResult {
  return act(state, (draft) => {
    if (!isUnlocked(draft, 'content')) return fail(lockedReason('content'));
    const offer = draft.market.rights.find((r) => r.id === offerId);
    if (!offer) return fail('Those rights are no longer for sale.');
    const price = rightsPrice(draft, offer.price);
    if (draft.money < price) return fail(`Not enough money (${formatEuro(price)} needed).`);
    spend(draft, price, 'content');
    draft.market.rights = draft.market.rights.filter((r) => r !== offer);
    draft.sportsRights.push({ id: offer.id, name: offer.name, prestige: offer.prestige, endDay: draft.day + Math.round(offer.months * 30.44) });
  });
}

/** Places (or replaces) the player's sealed bid. The money is only paid if the bid wins. */
export function placeBid(state: GameState, auctionId: Id, channelId: Id, amount: number): ActionResult {
  return act(state, (draft) => {
    const auction = draft.auctions.find((a) => a.id === auctionId);
    if (!auction) return fail('That auction has closed.');
    const channel = draft.channels.find((c) => c.id === channelId);
    if (!channel) return fail('Choose a channel for the license.');
    if (channel.medium !== auction.medium) return fail(`This is a ${MEDIUM_NAMES[auction.medium]} license; choose a ${MEDIUM_NAMES[auction.medium]} channel.`);
    const renewing = auction.holder?.channelId === channelId;
    if (auction.holder?.ownerId === PLAYER && !renewing) return fail('Only the channel that holds this license can renew it.');
    if (!renewing && !regionOpen(draft, auction.regionId)) return fail(`You can’t bid for a license outside ${regionsHeld(draft)} yet. ${lockedReason('regions')}`);
    if (!renewing && draft.licenses.some((l) => l.channelId === channelId && l.regionId === auction.regionId)) {
      return fail(`${channel.name} already broadcasts in ${getRegion(auction.regionId).name}.`);
    }
    const barred = renewing ? undefined : barredUntil(draft, auction.medium, auction.regionId);
    if (barred !== undefined) return fail(`The authority won’t give you a ${MEDIUM_NAMES[auction.medium]} license in ${getRegion(auction.regionId).name} until ${formatDate(barred)}.`);
    if (!Number.isFinite(amount) || amount < auction.reserve) return fail(`Bid at least the reserve of ${formatEuro(auction.reserve)}.`);
    if (amount > draft.money) return fail(`You can’t bid more than you have (${formatEuro(Math.floor(draft.money))}).`);
    auction.bid = { channelId, amount: Math.round(amount) };
  });
}

export function withdrawBid(state: GameState, auctionId: Id): ActionResult {
  return act(state, (draft) => {
    const auction = draft.auctions.find((a) => a.id === auctionId);
    if (!auction?.bid) return fail('You haven’t bid in that auction.');
    auction.bid = null;
  });
}
