// Event rights, licenses and channels.

import { ACTIVE_REGIONS, MAX_PLAYER_CHANNELS } from '../../config/balance';
import { SLOTS, getRegion, type Medium, type RegionId } from '../../config/world';
import { barPlayer } from '../auctions';
import { formatDate } from '../calendar';
import { barredUntil, freeLicenses, licensePrice, licenseTermDays, MEDIUM_NAMES, startReputation } from '../licenses';
import { checkMilestones } from '../milestones';
import { isUnlocked, lockedReason, regionOpen } from '../unlocks';
import { newId, type GameState, type Id, type Logo } from '../state';
import { type ActionResult, act, fail, formatEuro, pay } from './core';

/** Places (or replaces) the player's sealed bid for an event's TV rights. The money is only paid if the bid wins. */
export function placeRightsBid(state: GameState, auctionId: Id, amount: number): ActionResult {
  return act(state, (draft) => {
    if (!isUnlocked(draft, 'content')) return fail(lockedReason('content'));
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
    const price = licensePrice(channel.medium, regionId, draft);
    const paid = pay(draft, price, 'purchases');
    if (paid) return paid;
    draft.licenses.push({ id: newId(draft, 'l'), regionId, medium: channel.medium, channelId, price, expiresOn: draft.day + licenseTermDays() });
    channel.reputation[regionId] ??= startReputation(draft, regionId);
    // A first TV license opens the content market: at once, so the channel's library can be stocked the same day.
    if (channel.medium === 'tv') checkMilestones(draft);
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
      lastEventDay: null,
    });
    return id;
  });
}

/** Closes a channel: its licenses are given back and its campaigns stop. Its shows stay. */
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
