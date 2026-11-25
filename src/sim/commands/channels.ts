// Event rights, licenses and channels.

import { ACTIVE_REGIONS, ADS, MAX_PLAYER_CHANNELS, TAKEOVER } from '../../config/balance';
import { defaultFormat, getGenre, hasFormat, hasHost } from '../../config/genres';
import { SLOTS, getRegion, type Medium, type RegionId } from '../../config/world';
import { barPlayer } from '../auctions';
import { formatDate } from '../calendar';
import { barredUntil, freeLicenses, licensePrice, licenseTermDays, MEDIUM_NAMES, playerLicensePrice, startReputation } from '../licenses';
import { checkMilestones } from '../milestones';
import { rivalHostEmployee } from '../poaching';
import { findRivalChannel, keptRegions, takeoverBlocker, takeoverPrice, takeoverSince, wholeTakeoverBlocker, wholeTakeoverHosts, wholeTakeoverPrice } from '../takeovers';
import { isUnlocked, lockedReason, mayBuyTvLicense, regionOpen } from '../unlocks';
import { addHeadline, addMessage, newId, PLAYER, type Channel, type GameState, type Id, type Logo } from '../state';
import { type ActionResult, act, fail, formatEuro, pay } from './core';

/** Places (or replaces) the player's sealed bid for an event's TV rights. The money is only paid if the bid wins. */
export function placeRightsBid(state: GameState, auctionId: Id, amount: number): ActionResult {
  return act(state, (draft) => {
    if (!isUnlocked(draft, 'content')) return fail(lockedReason('content'));
    if (!isUnlocked(draft, 'sportsRights')) return fail(lockedReason('sportsRights'));
    const auction = draft.rightsAuctions.find((a) => a.id === auctionId);
    if (!auction) return fail('That auction has closed.');
    if (!Number.isFinite(amount) || amount < auction.reserve) return fail(`Bid at least the reserve of ${formatEuro(auction.reserve)}.`);
    if (amount > draft.money) return fail(`You can’t bid more than you have (${formatEuro(Math.floor(draft.money))}).`);
    auction.bid = Math.round(amount);
  });
}

export function withdrawRightsBid(state: GameState, auctionId: Id): ActionResult {
  return act(state, (draft) => {
    const auction = draft.rightsAuctions.find((a) => a.id === auctionId);
    if (auction?.bid == null) return fail('You haven’t bid in that auction.');
    auction.bid = null;
  });
}

/** The regions the company has a license in, by name, for a message. */
export function regionsHeld(state: GameState): string {
  const names = [...new Set(state.licenses.map((l) => getRegion(l.regionId).name))];
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Buys a license in a region for a channel (in the channel's medium), so the channel broadcasts there. */
export function buyLicense(state: GameState, channelId: Id, regionId: RegionId): ActionResult {
  return act(state, (draft) => {
    const channel = draft.channels.find((c) => c.id === channelId);
    if (!channel) return fail('That channel doesn’t exist.');
    const region = getRegion(regionId);
    if (!ACTIVE_REGIONS.includes(regionId)) return fail(`${region.name} isn’t open yet.`);
    if (!regionOpen(draft, regionId)) return fail(`You can’t buy a license outside ${regionsHeld(draft)} yet. ${lockedReason('regions')}`);
    if (draft.licenses.some((l) => l.channelId === channelId && l.regionId === regionId)) {
      return fail(`${channel.name} already broadcasts in ${region.name}.`);
    }
    if (channel.medium === 'tv' && !mayBuyTvLicense(draft)) return fail(`You hold a TV license already. ${lockedReason('secondTvLicense')}`);
    const barred = barredUntil(draft, channel.medium, regionId);
    if (barred !== undefined) {
      return fail(`You gave up or lost a ${MEDIUM_NAMES[channel.medium]} license in ${region.name}; the authority won’t sell you another there until ${formatDate(barred)}.`);
    }
    if (freeLicenses(draft, channel.medium, regionId) === 0) {
      const auctioned = draft.auctions.some((a) => !a.holder && a.medium === channel.medium && a.regionId === regionId);
      return fail(
        auctioned
          ? `The new ${MEDIUM_NAMES[channel.medium]} license in ${region.name} is being auctioned: place a bid instead.`
          : `All ${MEDIUM_NAMES[channel.medium]} licenses in ${region.name} are taken.`,
      );
    }
    const price = playerLicensePrice(draft, channel.medium, regionId);
    const paid = pay(draft, price, 'purchases');
    if (paid) return paid;
    draft.licenses.push({ id: newId(draft, 'l'), regionId, medium: channel.medium, channelId, price, expiresOn: draft.day + licenseTermDays(), ...(channel.medium === 'radio' && draft.licenses.some((l) => l.medium === 'radio') ? { since: draft.day } : {}) });
    channel.reputation[regionId] ??= startReputation(draft, regionId);
    // A first TV license opens the content market: at once, so the channel's library can be stocked the same day.
    if (channel.medium === 'tv') checkMilestones(draft);
  });
}

/**
 * Buys a rival channel's licence in one region for one of your channels of that medium (0.23.0, #476). The rival is paid the price and loses
 * the region (its reputation and renewal date go with it). Your channel gets the licence on the rival's renewal date, part of the rival's
 * reputation there and a head start on its listeners. The list price is kept as the licence's `price`, so the premium does not swell the company's value.
 */
export function takeOverLicense(state: GameState, rivalChannelId: Id, regionId: RegionId, channelId: Id): ActionResult {
  return act(state, (draft) => {
    const blocker = takeoverBlocker(draft, rivalChannelId, regionId, channelId);
    if (blocker) return fail(blocker);
    const { rival, channel: theirs } = findRivalChannel(draft, rivalChannelId)!;
    const channel = draft.channels.find((c) => c.id === channelId)!;
    const price = takeoverPrice(draft, rival, theirs, regionId);
    const paid = pay(draft, price, 'purchases');
    if (paid) return paid;
    rival.money += price;
    const expiry = theirs.licenseExpiry[regionId] ?? draft.day + licenseTermDays();
    const reputation = theirs.reputation[regionId] ?? 0;
    theirs.regionIds = theirs.regionIds.filter((r) => r !== regionId);
    delete theirs.reputation[regionId];
    delete theirs.licenseExpiry[regionId];
    draft.licenses.push({
      id: newId(draft, 'l'),
      regionId,
      medium: channel.medium,
      channelId,
      price: licensePrice(channel.medium, regionId, draft),
      expiresOn: expiry,
      ...(channel.medium === 'radio' ? { since: takeoverSince(draft.day) } : {}),
      takenOver: { from: rival.id, paid: price, on: draft.day },
    });
    channel.reputation[regionId] = Math.max(channel.reputation[regionId] ?? 0, startReputation(draft, regionId), TAKEOVER.reputation * reputation);
    const text = `${draft.companyName} buys ${theirs.name}’s licence in ${getRegion(regionId).name} for ${formatEuro(price)}.`;
    addHeadline(draft, text);
    addMessage(draft, 'info', `${text} ${channel.name} takes it over, with part of its reputation and many of its listeners. ${rival.name} now has the money to spend on you.`, undefined, undefined, undefined, 'rivals');
    if (channel.medium === 'tv') checkMilestones(draft);
  });
}

/**
 * Buys a whole rival (0.23.0, #477). You pay the price and get the rival's money. Each channel in `keep` becomes one of yours, with its
 * licences (a region you are barred from is dropped), its reputation and its schedule: a hosted show keeps its host but has no studio or crew
 * until you give it one, a licensed slot airs from your library. The other channels close and their licences are free. Every host joins at the
 * going rate, with their fame. The rival leaves the game, and everything that named it is cleared or handed to you.
 */
export function takeOverRival(state: GameState, rivalId: Id, keep: Id[]): ActionResult {
  return act(state, (draft) => {
    const blocker = wholeTakeoverBlocker(draft, rivalId, keep);
    if (blocker) return fail(blocker);
    const rival = draft.rivals.find((r) => r.id === rivalId)!;
    const price = wholeTakeoverPrice(draft, rival);
    const hosts = wholeTakeoverHosts(draft, rival);
    const paid = pay(draft, price, 'purchases');
    if (paid) return paid;
    draft.money += Math.max(0, rival.money);

    // The hosts, each once. A host presents one show of yours.
    const people = new Map<string, Id>();
    for (const host of hosts) people.set(host.name, rivalHostEmployee(draft, host.name, host.fame, host.genre, host.skill, host.salary));
    const presenting = new Set<Id>();

    let kept = 0;
    for (const theirs of rival.channels.filter((c) => keep.includes(c.id))) {
      const regions = keptRegions(draft, theirs);
      if (regions.length === 0) continue;
      const channelId = newId(draft, 'c');
      const schedule: (Id | null)[] = SLOTS.map(() => null);
      theirs.schedule.forEach((rs, slot) => {
        const genre = getGenre(rs.genre);
        const hostId = genre.kind !== 'licensed' && hasHost(genre) && rs.hostName ? (people.get(rs.hostName) ?? null) : null;
        const host = hostId !== null && !presenting.has(hostId) ? hostId : null;
        if (host) presenting.add(host);
        const id = newId(draft, 's');
        draft.shows.push({
          id,
          name: rs.name,
          genre: rs.genre,
          hostId: host,
          staffIds: [],
          writerIds: [],
          editorIds: [],
          studioId: null,
          ...(hasFormat(rs.genre) ? { format: defaultFormat(rs.genre), formatChangedOn: draft.day } : {}),
          freshness: 1,
          tone: 'normal',
          fans: 0,
        });
        schedule[slot] = id;
      });
      const reputation: Channel['reputation'] = {};
      for (const regionId of regions) {
        draft.licenses.push({
          id: newId(draft, 'l'),
          regionId,
          medium: theirs.medium,
          channelId,
          price: licensePrice(theirs.medium, regionId, draft),
          expiresOn: theirs.licenseExpiry[regionId] ?? draft.day + licenseTermDays(),
          ...(theirs.medium === 'radio' ? { since: takeoverSince(draft.day) } : {}),
          takenOver: { from: rival.id, paid: price, on: draft.day },
        });
        reputation[regionId] = Math.max(startReputation(draft, regionId), theirs.reputation[regionId] ?? 0);
      }
      draft.channels.push({ id: channelId, name: theirs.name, logo: { ...theirs.logo }, medium: theirs.medium, managerId: null, schedule, reputation, lastEvent: null, social: null, adMinutes: ADS.neutral });
      kept++;
    }

    // Everything that named the rival: its offers, the hosts who were to leave for it, its show buyers and its rights.
    draft.poachOffers = draft.poachOffers.filter((o) => o.rivalId !== rival.id);
    for (const employee of draft.employees) {
      if (employee.leaving?.rivalId !== rival.id) continue;
      const hostId = employee.id;
      employee.leaving = null;
      draft.candidates = draft.candidates.filter((c) => c.foundFor !== hostId);
    }
    for (const candidate of draft.candidates) if (candidate.rivalOffer?.rivalId === rival.id) delete candidate.rivalOffer;
    draft.showSales = draft.showSales.filter((s) => s.rivalId !== rival.id);
    for (const rights of draft.eventRights) if (rights.holderId === rival.id) rights.holderId = PLAYER;

    draft.rivals = draft.rivals.filter((r) => r !== rival);
    (draft.boughtRivals ??= []).push({ id: rival.id, name: rival.name, on: draft.day, price });

    const text = `${draft.companyName} buys ${rival.name} outright.`;
    addHeadline(draft, text);
    const wage = hosts.reduce((sum, h) => sum + h.salary, 0);
    const shows = kept > 0 ? ` ${kept === 1 ? 'The channel you kept has' : 'The channels you kept have'} its shows and hosts, but no studios or crews yet: they will not air properly until you give them some.` : '';
    addMessage(
      draft,
      'info',
      `${text} You paid ${formatEuro(price)} and got its ${formatEuro(Math.max(0, rival.money))}. ${hosts.length} host${hosts.length === 1 ? '' : 's'} joined your staff at ${formatEuro(wage)} a month in all.${shows} I expect it to pay.`,
      undefined,
      undefined,
      'tabby',
      'rivals',
    );
    checkMilestones(draft);
  });
}

/** Gives a license back: no refund, no more monthly fees, and no new license there for a few years. */
export function dropLicense(state: GameState, licenseId: Id): ActionResult {
  return act(state, (draft) => {
    const license = draft.licenses.find((l) => l.id === licenseId);
    if (!license) return fail('That license doesn’t exist.');
    draft.licenses = draft.licenses.filter((l) => l !== license);
    draft.auctions = draft.auctions.filter((a) => !(a.holder?.channelId === license.channelId && a.regionId === license.regionId));
    barPlayer(draft, license.medium, license.regionId);
  });
}

export interface ChannelInput {
  name: string;
  logo: Logo;
}

export function createChannel(state: GameState, input: ChannelInput & { medium?: Medium }): ActionResult {
  return act(state, (draft) => {
    if (draft.channels.length >= MAX_PLAYER_CHANNELS) return fail(`You can run up to ${MAX_PLAYER_CHANNELS} channels.`);
    const name = input.name.trim();
    if (!name) return fail('Give your channel a name.');
    const id = newId(draft, 'c');
    draft.channels.push({
      id,
      name,
      logo: { ...input.logo, initials: input.logo.initials.trim().slice(0, 3).toUpperCase() },
      medium: input.medium ?? 'radio',
      managerId: null,
      schedule: SLOTS.map(() => null),
      reputation: {},
      lastEvent: null,
      social: null,
      adMinutes: ADS.neutral,
    });
    return id;
  });
}

/** Closes a channel: its licenses are given back and its campaigns and social media account stop. Its shows stay. */
export function closeChannel(state: GameState, channelId: Id): ActionResult {
  return act(state, (draft) => {
    if (!draft.channels.some((c) => c.id === channelId)) return fail('That channel doesn’t exist.');
    draft.channels = draft.channels.filter((c) => c.id !== channelId);
    draft.licenses = draft.licenses.filter((l) => l.channelId !== channelId);
    draft.campaigns = draft.campaigns.filter((c) => c.targetId !== channelId);
    delete draft.promotion[channelId];
    draft.auctions = draft.auctions.filter((a) => a.holder?.channelId !== channelId);
    for (const auction of draft.auctions) if (auction.bid?.channelId === channelId) auction.bid = null;
  });
}

export function updateChannel(state: GameState, channelId: Id, patch: Partial<ChannelInput>): ActionResult {
  return act(state, (draft) => {
    const channel = draft.channels.find((c) => c.id === channelId);
    if (!channel) return fail('That channel doesn’t exist.');
    if (patch.name !== undefined) {
      if (!patch.name.trim()) return fail('Give your channel a name.');
      channel.name = patch.name.trim();
    }
    if (patch.logo) channel.logo = { ...patch.logo, initials: patch.logo.initials.trim().slice(0, 3).toUpperCase() };
  });
}

/** Sets the minutes of ads an hour on a channel (0.21.0), in steps of one ad, between ADS.min and ADS.max. It costs nothing and counts from the next day. */
export function setAdMinutes(state: GameState, channelId: Id, minutes: number): ActionResult {
  return act(state, (draft) => {
    const channel = draft.channels.find((c) => c.id === channelId);
    if (!channel) return fail('That channel doesn’t exist.');
    if (!Number.isFinite(minutes)) return fail('Choose a number of minutes.');
    channel.adMinutes = Math.min(ADS.max, Math.max(ADS.min, Math.round(minutes / ADS.step) * ADS.step));
  });
}

export function setChannelManager(state: GameState, channelId: Id, employeeId: Id | null): ActionResult {
  return act(state, (draft) => {
    const channel = draft.channels.find((c) => c.id === channelId);
    if (!channel) return fail('That channel doesn’t exist.');
    if (employeeId !== null) {
      const employee = draft.employees.find((e) => e.id === employeeId);
      if (employee?.role !== 'channelManager') return fail('Only a channel manager can run a channel.');
      if (draft.channels.some((c) => c.id !== channelId && c.managerId === employeeId)) {
        return fail(`${employee.name} already runs another channel.`);
      }
    }
    channel.managerId = employeeId;
  });
}
