// Marketing campaigns and the events the player stages.

import { MARKETING, OWN_EVENTS, OWN_EVENT_LIMITS, type OwnEventKind } from '../../config/balance';
import { channelRegions } from '../broadcast';
import { spend, weeklyCost } from '../economy';
import { eventHost, ownEventBlocker, ownEventCost, ownEventPrestige } from '../ownEvents';
import { employeesWithDesk } from '../office';
import { isUnlocked, lockedReason } from '../unlocks';
import { addHeadline, addMessage, newId, type CampaignAudience, type GameState, type Id } from '../state';
import { type ActionResult, act, fail } from './core';

export interface CampaignInput {
  /** A channel or show id. */
  targetId: Id;
  audience: CampaignAudience;
  weeklyBudget: number;
  weeks: number;
  /** Start again by itself when it ends. */
  repeat?: boolean;
}

/** Starts a campaign, run by the most skilled marketer who isn't running one yet. */
export function startCampaign(state: GameState, input: CampaignInput): ActionResult {
  return act(state, (draft) => {
    if (!isUnlocked(draft, 'marketing')) return fail(lockedReason('marketing'));
    const isTarget = draft.channels.some((c) => c.id === input.targetId) || draft.shows.some((s) => s.id === input.targetId);
    if (!isTarget) return fail('Choose a channel or show to promote.');
    if (!MARKETING.budgets.includes(input.weeklyBudget)) return fail('Choose one of the weekly budgets.');
    if (!MARKETING.durations.includes(input.weeks)) return fail('Choose one of the campaign lengths.');
    if (draft.money < weeklyCost(draft, input.weeklyBudget)) return fail('Not enough money for the first week of the campaign.');
    const desked = employeesWithDesk(draft);
    const busy = new Set(draft.campaigns.map((c) => c.marketerId));
    const marketer = draft.employees
      .filter((e) => e.role === 'marketing' && desked.has(e.id) && !busy.has(e.id))
      .sort((a, b) => b.skill - a.skill)[0];
    if (!marketer) return fail('Every marketer is busy, or none has a desk. Hire marketing staff to run more campaigns.');
    const id = newId(draft, 'm');
    draft.campaigns.push({ id, ...input, repeat: input.repeat ?? false, marketerId: marketer.id, endDay: draft.day + input.weeks * 7 });
    return id;
  });
}

/** Makes a running campaign longer by one of the campaign lengths; it goes on at the same budget. */
export function extendCampaign(state: GameState, campaignId: Id, weeks: number): ActionResult {
  return act(state, (draft) => {
    const campaign = draft.campaigns.find((c) => c.id === campaignId);
    if (!campaign) return fail('That campaign isn’t running.');
    if (!MARKETING.durations.includes(weeks)) return fail('Choose one of the campaign lengths.');
    campaign.endDay += weeks * 7;
  });
}

/** Has a running campaign start again by itself when it ends, or not. */
export function setCampaignRepeat(state: GameState, campaignId: Id, repeat: boolean): ActionResult {
  return act(state, (draft) => {
    const campaign = draft.campaigns.find((c) => c.id === campaignId);
    if (!campaign) return fail('That campaign isn’t running.');
    campaign.repeat = repeat;
  });
}

export function stopCampaign(state: GameState, campaignId: Id): ActionResult {
  return act(state, (draft) => {
    if (!draft.campaigns.some((c) => c.id === campaignId)) return fail('That campaign isn’t running.');
    draft.campaigns = draft.campaigns.filter((c) => c.id !== campaignId);
  });
}

/** Stages a concert, gala or telethon on a channel: reputation, fame for its host, and prestige. */
export function stageEvent(state: GameState, channelId: Id, kind: OwnEventKind): ActionResult {
  return act(state, (draft) => {
    if (!isUnlocked(draft, 'events')) return fail(lockedReason('events'));
    const channel = draft.channels.find((c) => c.id === channelId);
    if (!channel) return fail('That channel doesn’t exist.');
    const blocker = ownEventBlocker(draft, channel, kind);
    if (blocker) return fail(blocker);
    const spec = OWN_EVENTS[kind];
    spend(draft, ownEventCost(draft, channel, kind), 'events');
    for (const regionId of channelRegions(draft, channel.id)) {
      channel.reputation[regionId] = Math.min(OWN_EVENT_LIMITS.maxReputation, (channel.reputation[regionId] ?? 0) + spec.reputation);
    }
    const host = eventHost(draft, channel);
    if (host) host.fame = Math.min(100, host.fame + spec.fame);
    const prestige = ownEventPrestige(draft, channel, kind);
    draft.prestige += prestige;
    channel.lastEventDay = draft.day;
    addHeadline(draft, `${channel.name} stages a ${spec.name.toLowerCase()}${host ? `, presented by ${host.name}` : ''}.`);
    addMessage(draft, 'good', `The ${spec.name.toLowerCase()} was a success: ${channel.name}’s reputation is up${host ? `, ${host.name} is more famous` : ''}, and you earned ${prestige} prestige.`, undefined, undefined, 'marketing');
  });
}
