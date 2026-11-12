// Events the player stages on a channel (a concert, a gala, a telethon): a
// large one-off expense that buys reputation and fame for a while, and prestige for good.
// An event is held at a venue (0.22.0, #404): one of three outside, which charge rent, or the player's own event
// hall, which doesn't and needs a technician on the staff. The host the player picks gets the fame.

import { EVENT_COSTS, OWN_EVENTS, OWN_EVENT_LIMITS, type OwnEventKind } from '../config/balance';
import { ROOM_TYPE_NAMES } from '../config/office';
import { VENUES, VENUE_SIZES, hallSize, venueFits, type VenueSize } from '../config/venues';
import { channelOffAirReason, channelRegions } from './broadcast';
import { letOf } from './deals';
import { isStudioReady } from './office';
import { notWorking } from './teams';
import type { Channel, Employee, GameState, Id, RentedRoom } from './state';

/** A venue is 'small', 'medium' or 'large' (outside, with rent), or the room id of an event hall of the company. */
export type EventVenue = string;

export const isOutside = (venue: EventVenue): venue is VenueSize => (VENUE_SIZES as readonly string[]).includes(venue);

/** What an event costs, in its parts. */
export interface EventCost {
  rent: number;
  catering: number;
  host: number;
  total: number;
}

/** The event halls of the company, in the order of the building. */
export const eventHalls = (state: GameState): RentedRoom[] => state.rooms.filter((r) => r.type === 'eventHall');

/** How many blocks of audience seating a hall has. */
export const hallSeating = (room: RentedRoom): number => room.furniture.filter((f) => f.type === 'audienceSeating').length;

/** The size of a venue: the outside one it is, or the event hall by its seats. Null for a room that is no event hall. */
export function venueSize(state: GameState, venue: EventVenue): VenueSize | null {
  if (isOutside(venue)) return venue;
  const room = eventHalls(state).find((r) => r.roomId === venue);
  return room ? hallSize(hallSeating(room)) : null;
}

/** The name of a venue, for the headline and the window. */
export function venueName(state: GameState, venue: EventVenue): string {
  if (isOutside(venue)) return VENUES[venue].name;
  return state.rooms.find((r) => r.roomId === venue)?.name ?? 'an event hall';
}

/** The month of salary a host is paid for fronting an event. */
export const hostFee = (host: Employee | undefined): number => (host ? host.salary * EVENT_COSTS.hostMonths : 0);

/** What an event costs: the rent (outside only), the catering and the host's fee. A venue that doesn't exist costs the outside price. */
export function ownEventCost(state: GameState, channel: Channel, kind: OwnEventKind, venue: EventVenue, hostId: Id | null): EventCost {
  const full = OWN_EVENTS[kind].costPerRegion * channelRegions(state, channel.id).length;
  const outside = isOutside(venue);
  const rent = outside ? Math.round(full * EVENT_COSTS.rentShare) : 0;
  const catering = outside ? full - rent : Math.round(full * EVENT_COSTS.homeCatering);
  const host = hostFee(state.employees.find((e) => e.id === hostId));
  return { rent, catering, host, total: rent + catering + host };
}

export const ownEventPrestige = (state: GameState, channel: Channel, kind: OwnEventKind) =>
  OWN_EVENTS[kind].prestigePerRegion * channelRegions(state, channel.id).length;

/** Days until the channel may stage another event (0 = now). */
export function ownEventCooldown(state: GameState, channel: Channel): number {
  return channel.lastEvent === null ? 0 : Math.max(0, channel.lastEvent.day + OWN_EVENT_LIMITS.cooldownDays - state.day);
}

/** The hosts with a show on the channel's schedule, the most famous first: any of them can front an event. */
export function eventHosts(state: GameState, channel: Channel): Employee[] {
  const hostIds = channel.schedule.map((id) => state.shows.find((s) => s.id === id)?.hostId);
  return state.employees.filter((e) => hostIds.includes(e.id)).sort((a, b) => b.fame - a.fame || a.id.localeCompare(b.id));
}

/** Why an event hall can't be used now, or null: it must be ready, not let out, and have a technician on the staff. */
export function hallBlocker(state: GameState, room: RentedRoom): string | null {
  if (!isStudioReady(state, room)) return `${room.name} isn’t ready: its checklist is not complete.`;
  if (letOf(state, room.roomId)) return `${room.name} is let out.`;
  if (!state.employees.some((e) => e.role === 'technician' && !notWorking(state, e))) return `${room.name} needs a technician on the staff to run its control room.`;
  return null;
}

/** Why the channel can't stage this event at this venue with this host now, or null. */
export function ownEventBlocker(state: GameState, channel: Channel, kind: OwnEventKind, venue: EventVenue, hostId: Id | null): string | null {
  const offAir = channelOffAirReason(state, channel);
  if (offAir) return `${channel.name} is off the air (${offAir.toLowerCase()}).`;
  const wait = ownEventCooldown(state, channel);
  if (wait > 0) return `${channel.name} staged an event less than a year ago; wait ${wait} more day${wait === 1 ? '' : 's'}.`;
  const size = venueSize(state, venue);
  if (!size) return 'That venue doesn’t exist.';
  if (!venueFits(size, kind)) return `${venueName(state, venue)} is too small for a ${OWN_EVENTS[kind].name.toLowerCase()}.`;
  if (!isOutside(venue)) {
    const hall = hallBlocker(state, state.rooms.find((r) => r.roomId === venue)!);
    if (hall) return hall;
  }
  if (hostId !== null && !eventHosts(state, channel).some((e) => e.id === hostId)) return `That host has no show on ${channel.name}.`;
  const cost = ownEventCost(state, channel, kind, venue, hostId).total;
  if (state.money < cost) return `Not enough money (€${cost.toLocaleString('en-IE')} needed).`;
  return null;
}

/** The event held in an event hall today, evening included: the channel's, its kind and its host. Null on any other day. */
export function eventAt(state: GameState, roomId: string): { channel: Channel; kind: OwnEventKind; hostId: Id | null } | null {
  for (const channel of state.channels) {
    const last = channel.lastEvent;
    if (last && last.day === state.day && last.venue === roomId) return { channel, kind: last.kind, hostId: last.hostId };
  }
  return null;
}

/** What the window calls a hall: its name and its size. */
export const hallLabel = (room: RentedRoom): string => `${room.name} (${ROOM_TYPE_NAMES.eventHall.toLowerCase()}, ${hallSize(hallSeating(room))})`;
