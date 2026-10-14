// Events the player stages on a channel (a concert, a gala, a telethon): a
// large one-off expense that buys reputation and fame for a while, and prestige for good.

import { OWN_EVENTS, OWN_EVENT_LIMITS, type OwnEventKind } from '../config/balance';
import { channelOffAirReason, channelRegions } from './broadcast';
import type { Channel, Employee, GameState } from './state';

export const ownEventCost = (state: GameState, channel: Channel, kind: OwnEventKind) =>
  OWN_EVENTS[kind].costPerRegion * channelRegions(state, channel.id).length;

export const ownEventPrestige = (state: GameState, channel: Channel, kind: OwnEventKind) =>
  OWN_EVENTS[kind].prestigePerRegion * channelRegions(state, channel.id).length;

/** Days until the channel may stage another event (0 = now). */
export function ownEventCooldown(state: GameState, channel: Channel): number {
  return channel.lastEventDay === null ? 0 : Math.max(0, channel.lastEventDay + OWN_EVENT_LIMITS.cooldownDays - state.day);
}

/** The most famous host with a show on the channel's schedule fronts its events. */
export function eventHost(state: GameState, channel: Channel): Employee | undefined {
  const hostIds = channel.schedule.map((id) => state.shows.find((s) => s.id === id)?.hostId);
  return state.employees.filter((e) => hostIds.includes(e.id)).sort((a, b) => b.fame - a.fame)[0];
}

/** Why the channel can't stage this event now, or null. */
export function ownEventBlocker(state: GameState, channel: Channel, kind: OwnEventKind): string | null {
  const offAir = channelOffAirReason(state, channel);
  if (offAir) return `${channel.name} is off the air (${offAir.toLowerCase()}).`;
  const wait = ownEventCooldown(state, channel);
  if (wait > 0) return `${channel.name} staged an event less than a year ago; wait ${wait} more day${wait === 1 ? '' : 's'}.`;
  const cost = ownEventCost(state, channel, kind);
  if (state.money < cost) return `Not enough money (€${cost.toLocaleString('en-IE')} needed).`;
  return null;
}
