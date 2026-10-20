// License auctions (prompt.md section 9): every license issued after the start
// of the game is sold by sealed bid over one week. Rivals that want it bid too.

import { ACTIVE_REGIONS, AUCTION, DAYS_PER_YEAR, RENEWAL, RIVAL_START_REPUTATION, RIVAL_TV_START_REPUTATION } from '../config/balance';
import { PERSONALITIES } from '../config/rivals';
import { getRegion, type Medium, type RegionId } from '../config/world';
import { formatDate, toCalendarDate } from './calendar';
import { spend } from './economy';
import { generateRivalChannel } from './generate';
import { barredUntil, licensePrice, licenseSlots, licenseTermDays, licenseValue, MEDIUM_NAMES, renewalReserve, startReputation } from './licenses';
import { fromChannel } from './inbox';
import type { Rng } from './rng';
import { PLAYER, addHeadline, addMessage, newId, type Auction, type GameState, type Id, type Rival } from './state';

const formatEuro = (n: number) => `€${Math.round(n).toLocaleString('en-IE')}`;

/** True if this rival would bid for a license of this medium in this region. */
export function rivalWants(state: GameState, rival: Rival, medium: Medium, regionId: RegionId): boolean {
  const channels = rival.channels.filter((c) => c.medium === medium);
  if (channels.length > 0) return channels.some((c) => !c.regionIds.includes(regionId));
  // No channel of this medium yet: only TV, from the rival's launch year.
  return medium === 'tv' && toCalendarDate(state.day).year >= PERSONALITIES[rival.personality].tv.launchYear;
}

/** Puts one newly issued license of this medium and region up for auction, for the usual week. */
export function openLicenseAuction(draft: GameState, medium: Medium, regionId: RegionId): Auction {
  const auction: Auction = {
    id: newId(draft, 'a'),
    medium,
    regionId,
    reserve: licensePrice(medium, regionId, draft),
    endsOn: draft.day + AUCTION.days,
    interested: draft.rivals.filter((r) => rivalWants(draft, r, medium, regionId)).length,
    bid: null,
    holder: null,
  };
  draft.auctions.push(auction);
  addMessage(
    draft,
    'info',
    `A new ${MEDIUM_NAMES[medium]} license in ${getRegion(regionId).name} is up for auction until ${formatDate(auction.endsOn)}. Reserve ${formatEuro(auction.reserve)}.`,
    undefined,
    undefined,
    'channel',
  );
  return auction;
}

/** Monthly: open an auction for every license the authority has issued since last month. */
export function issueLicenses(draft: GameState): void {
  for (const medium of ['radio', 'tv'] as const) {
    for (const regionId of ACTIVE_REGIONS) {
      const slots = licenseSlots(medium, regionId, draft.day);
      while ((draft.licensesIssued[medium][regionId] ?? 0) < slots) {
        draft.licensesIssued[medium][regionId] = (draft.licensesIssued[medium][regionId] ?? 0) + 1;
        openLicenseAuction(draft, medium, regionId);
      }
    }
  }
}

/** Gives a won license to the rival: extends a channel of that medium, or launches its TV channel. */
function awardToRival(draft: GameState, rng: Rng, rival: Rival, medium: Medium, regionId: RegionId): string {
  const channel = rival.channels.find((c) => c.medium === medium && !c.regionIds.includes(regionId));
  if (channel) {
    channel.regionIds.push(regionId);
    channel.reputation[regionId] = medium === 'tv' ? RIVAL_TV_START_REPUTATION : RIVAL_START_REPUTATION;
    channel.licenseExpiry[regionId] = draft.day + licenseTermDays();
    return channel.name;
  }
  const owner = { ...rival, logo: rival.channels[0]?.logo ?? { shape: 'square' as const, color: '#0b2a4f' } };
  const launched = generateRivalChannel(draft, rng, owner, PERSONALITIES[rival.personality].tv, 'tv', [regionId]);
  launched.reputation[regionId] = RIVAL_TV_START_REPUTATION;
  launched.licenseExpiry[regionId] = draft.day + licenseTermDays();
  rival.channels.push(launched);
  return launched.name;
}

/** Daily: close auctions whose week is over and hand out the licenses. */
export function closeAuctions(draft: GameState, rng: Rng): void {
  for (const auction of draft.auctions.filter((a) => a.endsOn <= draft.day)) {
    draft.auctions = draft.auctions.filter((a) => a !== auction);
    if (auction.holder) {
      closeRenewal(draft, rng, auction, auction.holder);
      continue;
    }
    const region = getRegion(auction.regionId).name;
    const what = `${MEDIUM_NAMES[auction.medium]} license in ${region}`;

    const rivalBids = draft.rivals
      .filter((r) => rivalWants(draft, r, auction.medium, auction.regionId))
      .map((rival) => {
        const { min, max } = AUCTION.aggression[auction.medium];
        const aggression = min + rng.next() * (max - min);
        return { rival, amount: Math.round((auction.reserve * (1 + aggression)) / 1000) * 1000 };
      })
      .sort((a, b) => b.amount - a.amount);
    const topRival = rivalBids[0];

    // The player's bid only counts if it's still valid and can be paid.
    const bid = auction.bid;
    const channel = bid && draft.channels.find((c) => c.id === bid.channelId);
    let playerBid = 0;
    if (bid && channel) {
      if (draft.licenses.some((l) => l.channelId === channel.id && l.regionId === auction.regionId)) {
        addMessage(draft, 'warning', `Your bid for the ${what} was withdrawn: ${channel.name} already broadcasts there.`, undefined, undefined, fromChannel(channel.id));
      } else if (draft.money < bid.amount) {
        addMessage(draft, 'danger', `Your bid for the ${what} was void: you couldn’t pay ${formatEuro(bid.amount)}.`, undefined, undefined, fromChannel(channel.id));
      } else {
        playerBid = bid.amount;
      }
    }

    if (playerBid > 0 && channel && playerBid > (topRival?.amount ?? 0)) {
      spend(draft, playerBid, 'purchases');
      draft.licenses.push({ id: newId(draft, 'l'), regionId: auction.regionId, medium: auction.medium, channelId: channel.id, price: playerBid, expiresOn: draft.day + licenseTermDays() });
      channel.reputation[auction.regionId] ??= startReputation(draft, auction.regionId);
      const runnerUp = topRival ? ` The highest rival bid was ${formatEuro(topRival.amount)}.` : ' No rival bid.';
      addMessage(draft, 'good', `You won the ${what} for ${formatEuro(playerBid)}: ${channel.name} now broadcasts there.${runnerUp}`, undefined, undefined, fromChannel(channel.id));
    } else if (topRival) {
      const name = awardToRival(draft, rng, topRival.rival, auction.medium, auction.regionId);
      const yours = playerBid > 0 ? ` Your bid was ${formatEuro(playerBid)}.` : '';
      addMessage(draft, 'warning', `${topRival.rival.name} won the ${what} with ${formatEuro(topRival.amount)}: ${name} now broadcasts there.${yours}`, undefined, undefined, fromChannel(channel?.id));
    } else {
      addMessage(draft, 'info', `Nobody bid for the ${what}. It can now be bought at the list price.`, undefined, undefined, fromChannel(channel?.id));
    }
  }
}

// --- Renewal rounds: every license runs for a fixed term and then returns to auction ---

/** The authority won't sell the player a license of this medium here for a while. */
export function barPlayer(draft: GameState, medium: Medium, regionId: RegionId): void {
  draft.licenseBars = draft.licenseBars.filter((b) => b.until > draft.day && !(b.medium === medium && b.regionId === regionId));
  draft.licenseBars.push({ medium, regionId, until: draft.day + Math.round(RENEWAL.barYears * DAYS_PER_YEAR) });
}

/**
 * Daily: warn the player a year before a license runs out, and open the
 * renewal round for every license, the player's and the rivals', that is in
 * its last weeks.
 */
export function openRenewals(draft: GameState): void {
  const open = (medium: Medium, regionId: RegionId, ownerId: Id, channelId: Id, expiresOn: number): Auction => {
    const value = licenseValue(draft, channelId, regionId, medium);
    const interested = ownerId === PLAYER ? draft.rivals.filter((r) => rivalWants(draft, r, medium, regionId)).length : 0;
    const auction: Auction = {
      id: newId(draft, 'a'),
      medium,
      regionId,
      reserve: renewalReserve(medium, regionId, draft, value),
      endsOn: expiresOn,
      interested,
      bid: null,
      holder: { ownerId, channelId, value },
    };
    draft.auctions.push(auction);
    return auction;
  };

  for (const license of draft.licenses) {
    const channel = draft.channels.find((c) => c.id === license.channelId);
    if (!channel) continue;
    const what = `${MEDIUM_NAMES[license.medium]} license in ${getRegion(license.regionId).name}`;
    const left = license.expiresOn - draft.day;
    if (left === RENEWAL.warnDays) {
      addMessage(draft, 'warning', `${channel.name}’s ${what} runs out on ${formatDate(license.expiresOn)}. It goes to auction for its last ${RENEWAL.auctionDays} days, and rivals may bid for it.`, undefined, 'licenses', fromChannel(channel.id));
    }
    if (left === RENEWAL.auctionDays) {
      const auction = open(license.medium, license.regionId, PLAYER, channel.id, license.expiresOn);
      const rivals = auction.interested === 0 ? 'No rival wants it' : `${auction.interested} rival${auction.interested === 1 ? '' : 's'} may bid`;
      addMessage(draft, 'warning', `${channel.name}’s ${what} is up for renewal until ${formatDate(license.expiresOn)}. Reserve ${formatEuro(auction.reserve)}. ${rivals}; unless you bid more, the reserve is paid for you.`, undefined, 'licenses', fromChannel(channel.id));
    }
  }
  for (const rival of draft.rivals) {
    for (const channel of rival.channels) {
      for (const regionId of channel.regionIds) {
        if ((channel.licenseExpiry[regionId] ?? Infinity) - draft.day === RENEWAL.auctionDays) open(channel.medium, regionId, rival.id, channel.id, channel.licenseExpiry[regionId]!);
      }
    }
  }
}

/** Settles a renewal round: the holder keeps the license unless a challenger clearly outbids them. */
function closeRenewal(draft: GameState, rng: Rng, auction: Auction, holder: NonNullable<Auction['holder']>): void {
  const { medium, regionId } = auction;
  const what = `${MEDIUM_NAMES[medium]} license in ${getRegion(regionId).name}`;
  const { min, max } = RENEWAL.challengeYears;
  const challenge = () => Math.round((holder.value * (min + rng.next() * (max - min))) / 1000) * 1000;

  if (holder.ownerId === PLAYER) {
    const license = draft.licenses.find((l) => l.channelId === holder.channelId && l.regionId === regionId && l.medium === medium);
    const channel = draft.channels.find((c) => c.id === holder.channelId);
    if (!license || !channel) return;
    const top = draft.rivals
      .filter((r) => rivalWants(draft, r, medium, regionId))
      .map((rival) => ({ rival, amount: challenge() }))
      .filter((b) => b.amount >= auction.reserve)
      .sort((a, b) => b.amount - a.amount)[0];
    // Without a bid of their own, or with one they can no longer pay, the holder pays the reserve if they can.
    const wanted = auction.bid?.amount ?? auction.reserve;
    const bid = draft.money >= wanted ? wanted : draft.money >= auction.reserve ? auction.reserve : 0;

    if (bid > 0 && bid * (1 + RENEWAL.holderAdvantage) >= (top?.amount ?? 0)) {
      spend(draft, bid, 'renewals');
      license.expiresOn += licenseTermDays();
      license.price = bid;
      const rivalBid = top ? ` ${top.rival.name} bid ${formatEuro(top.amount)}.` : ' No rival bid.';
      addMessage(draft, 'good', `${channel.name} keeps its ${what} until ${formatDate(license.expiresOn)} for ${formatEuro(bid)}.${rivalBid}`, undefined, undefined, fromChannel(channel.id));
      return;
    }
    draft.licenses = draft.licenses.filter((l) => l !== license);
    barPlayer(draft, medium, regionId);
    const why = bid > 0 ? `your ${formatEuro(bid)} wasn’t enough` : `you couldn’t pay the ${formatEuro(auction.reserve)} renewal`;
    if (top) {
      const name = awardToRival(draft, rng, top.rival, medium, regionId);
      addHeadline(draft, `${top.rival.name} takes over a ${what}.`);
      addMessage(draft, 'danger', `${channel.name} has lost its ${what}: ${top.rival.name} bid ${formatEuro(top.amount)} and ${why}. ${name} now broadcasts there.`, undefined, undefined, fromChannel(channel.id));
    } else {
      addMessage(draft, 'danger', `${channel.name}’s ${what} has lapsed: ${why}.`, undefined, undefined, fromChannel(channel.id));
    }
    return;
  }

  const rival = draft.rivals.find((r) => r.id === holder.ownerId);
  const held = rival?.channels.find((c) => c.id === holder.channelId);
  if (!rival || !held || !held.regionIds.includes(regionId)) return;
  const defence = Math.max(auction.reserve, Math.round(challenge() * (1 + RENEWAL.holderAdvantage)));
  const bid = auction.bid;
  const channel = bid ? draft.channels.find((c) => c.id === bid.channelId) : undefined;
  const valid =
    bid &&
    channel &&
    channel.medium === medium &&
    !draft.licenses.some((l) => l.channelId === channel.id && l.regionId === regionId) &&
    barredUntil(draft, medium, regionId) === undefined &&
    draft.money >= bid.amount;

  if (bid && channel && valid && bid.amount > defence) {
    held.regionIds = held.regionIds.filter((r) => r !== regionId);
    delete held.reputation[regionId];
    delete held.licenseExpiry[regionId];
    spend(draft, bid.amount, 'renewals');
    draft.licenses.push({ id: newId(draft, 'l'), regionId, medium, channelId: channel.id, price: bid.amount, expiresOn: draft.day + licenseTermDays() });
    channel.reputation[regionId] ??= startReputation(draft, regionId);
    addHeadline(draft, `${held.name} loses its ${what} to a higher bid.`);
    addMessage(draft, 'good', `You took over ${held.name}’s ${what} for ${formatEuro(bid.amount)}: ${channel.name} now broadcasts there, and ${held.name} is off the air in the region.`, undefined, undefined, fromChannel(channel.id));
    return;
  }
  held.licenseExpiry[regionId] = (held.licenseExpiry[regionId] ?? draft.day) + licenseTermDays();
  if (bid) addMessage(draft, 'warning', `${held.name} keeps its ${what}: your bid of ${formatEuro(bid.amount)} wasn’t enough.`, undefined, undefined, fromChannel(channel?.id));
}
