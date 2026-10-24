// The way out to the antenna (0.16.0): the control rooms of the TV studios, the
// master control room every channel goes out from, the
// technicians who work their desks, and the cables between them.

import { CONTROL_ROOM, MASTER_CONTROL } from '../config/balance';
import { getGenre } from '../config/genres';
import type { RoomType } from '../config/office';
import { RECEPTION } from '../config/office';
import { findRoom, inGrace, inOrder, isFurnished, isTvStudio, tvControlRooms } from './office';
import { ownsTech } from './tech';
import type { Channel, GameState, Id, RentedRoom } from './state';
import { notWorking } from './teams';

// --- The master control room ---

/** The player's channels that have a license, in the order they were started. */
export const licensedChannels = (state: GameState): Channel[] => state.channels.filter((c) => state.licenses.some((l) => l.channelId === c.id));

/** Whether the company has a channel on a license, which goes out through a master control room. */
export const needsMasterControl = (state: GameState) => licensedChannels(state).length > 0;

/** Whether a channel is one that goes out through the master control room: every channel with a license. */
export const throughMasterControl = (state: GameState, channel: Channel): boolean => licensedChannels(state).some((c) => c.id === channel.id);

/** The master control room that has all it needs, the first in the order of the building; one serves every channel. Every channel goes out through it. */
export const masterControlRoom = (state: GameState): RentedRoom | undefined => inOrder(state.rooms).find((r) => r.type === 'masterControl' && isFurnished(r));

// --- The technicians at the desks ---

/** A desk a technician has to work: the master control desk, or the control room of a TV studio that has shows on the schedule. */
export interface CrewPost {
  /** `mcr`, or the id of the TV studio. */
  key: 'mcr' | string;
  /** The room the desks are in. */
  roomId: string;
}

/** The ids of the studios that have a show on the schedule of one of the player's channels. */
function studiosInUse(state: GameState): Set<string> {
  const scheduled = new Set(state.channels.flatMap((c) => c.schedule).filter((id): id is Id => id !== null));
  return new Set(state.shows.filter((s) => scheduled.has(s.id) && s.studioId && getGenre(s.genre).kind === 'produced').map((s) => s.studioId!));
}

/** Whether a control room has the control desk and the audio mixer. */
const hasControlKit = (room: RentedRoom) => room.furniture.some((f) => f.type === 'controlDesk') && room.furniture.some((f) => f.type === 'audioMixer');

/**
 * The desks that need a technician today, the most needed first: the master
 * control desk while a channel goes out through it, then the control
 * rooms of the TV studios that have shows on the schedule, in the order of the building.
 */
export function crewPosts(state: GameState): CrewPost[] {
  const posts: CrewPost[] = [];
  const mcr = masterControlRoom(state);
  if (mcr && needsMasterControl(state)) posts.push({ key: 'mcr', roomId: mcr.roomId });
  const inUse = studiosInUse(state);
  for (const [studioId, control] of tvControlRooms(state)) {
    if (inUse.has(studioId) && hasControlKit(control)) posts.push({ key: studioId, roomId: control.roomId });
  }
  return posts;
}

/** The technicians at work today, the longest hired first: those on strike are not. */
const technicians = (state: GameState) => state.employees.filter((e) => e.role === 'technician' && !notWorking(state, e)).sort((a, b) => a.hiredOn - b.hiredOn || a.id.localeCompare(b.id));

/** Shares of a technician's day each post takes, by its key. */
const shareOf = (post: CrewPost) => (post.key === 'mcr' ? MASTER_CONTROL.crew : CONTROL_ROOM.crew);

/**
 * Who works which desk today, by the key of the post, and how much of the
 * technicians' day that takes, from 0 (none) to 1 (all of it). Each
 * technician takes posts in turn until their day is full; a post nobody can
 * take is left without anyone, and the rest of their day goes to repairs.
 */
export function crewing(state: GameState): { posts: Map<string, Id>; used: number } {
  const crew = technicians(state);
  const posts = new Map<string, Id>();
  if (crew.length === 0) return { posts, used: 0 };
  let n = 0;
  let left = 1;
  let used = 0;
  for (const post of crewPosts(state)) {
    const share = shareOf(post);
    if (left < share - 1e-9) {
      n += 1;
      left = 1;
    }
    if (n >= crew.length) break;
    posts.set(post.key, crew[n]!.id);
    left -= share;
    used += share;
  }
  return { posts, used: used / crew.length };
}

/** Whether a technician works the control room of a TV studio today. */
export const isManned = (state: GameState, studioId: string) => crewing(state).posts.has(studioId);

/** Why a channel that goes out through the master control room can't, or null if it can (or needs none). */
export function masterControlProblem(state: GameState, channel: Channel): string | null {
  if (!throughMasterControl(state, channel) || inGrace(state, 'masterControl')) return null;
  if (!masterControlRoom(state)) return 'No master control room: every channel goes out through one';
  if (!crewing(state).posts.has('mcr')) return 'Nobody works the master control room: hire a technician';
  return null;
}

// --- The company itself ---

/** What the company still lacks before anything can go on the air (0.16.0): a CEO's office with its desk, and a reception desk. */
export function headquartersMissing(state: GameState): ('ceoOffice' | 'receptionDesk')[] {
  const missing: ('ceoOffice' | 'receptionDesk')[] = [];
  if (!state.rooms.some((r) => r.type === 'ceoOffice' && isFurnished(r))) missing.push('ceoOffice');
  if (!findRoom(state, RECEPTION.id)?.furniture.some((f) => f.type === 'receptionDesk')) missing.push('receptionDesk');
  return missing;
}

/** Why the company as a whole can't broadcast, or null if it can. */
export function headquartersProblem(state: GameState): string | null {
  if (inGrace(state, 'headquarters')) return null;
  const missing = headquartersMissing(state);
  if (missing.length === 2) return 'No CEO’s office and no reception desk';
  if (missing[0] === 'ceoOffice') return 'No CEO’s office with its desk';
  if (missing[0] === 'receptionDesk') return 'No reception desk';
  return null;
}

// --- The cables ---

/** Where a cable goes: the master control room, or the roof. */
export type CableEnd = 'mcr' | 'antenna' | 'dish';

/**
 * One cable of the building. `live` while what goes through it is on the air,
 * `idle` while nothing does, and `cut` where it should carry a channel that
 * can't go out because of what is missing at the other end.
 */
export interface Cable {
  /** The room it starts in: a studio, or for a TV studio its control room; or the master control room. */
  from: string;
  to: CableEnd;
  status: 'live' | 'idle' | 'cut';
}

/** The kinds of room that send a signal: every studio, and the control rooms of the TV studios. */
const SENDING: readonly RoomType[] = ['radioStudio', 'radioTalkStudio'];

/**
 * The cables the building has (0.16.0). They are laid by themselves: from every
 * studio (for a TV studio, from its control room) to the master control room,
 * or while there is none straight up to the antenna, where they carry nothing that goes out; and from the master
 * control room to the antenna, and to the dish once the satellite uplink is
 * researched. `onAir` says which channels go out, by id; the studios that make
 * a show for one of them carry it.
 */
export function cables(state: GameState, onAir: (channel: Channel) => boolean): Cable[] {
  const mcr = inOrder(state.rooms).find((r) => r.type === 'masterControl');
  const controls = tvControlRooms(state);
  const channelOf = new Map<Id, Channel[]>();
  for (const channel of state.channels) {
    for (const id of channel.schedule) if (id) channelOf.set(id, [...(channelOf.get(id) ?? []), channel]);
  }
  const statusOf = (channels: Channel[]): Cable['status'] => (channels.length === 0 ? 'idle' : channels.some(onAir) ? 'live' : 'cut');
  const fed = (studioId: string) => [...new Set(state.shows.filter((s) => s.studioId === studioId).flatMap((s) => channelOf.get(s.id) ?? []))];

  const out: Cable[] = [];
  for (const room of inOrder(state.rooms)) {
    const tv = isTvStudio(room.type);
    if (!tv && !(room.type && SENDING.includes(room.type))) continue;
    const from = tv ? controls.get(room.roomId)?.roomId : room.roomId;
    if (!from) continue;
    out.push({ from, to: mcr ? 'mcr' : 'antenna', status: statusOf(fed(room.roomId)) });
  }
  if (mcr) {
    const all = state.channels.filter((c) => c.schedule.some(Boolean));
    out.push({ from: mcr.roomId, to: 'antenna', status: statusOf(all) });
    if (ownsTech(state, 'satelliteUplink')) out.push({ from: mcr.roomId, to: 'dish', status: statusOf(all) });
  }
  return out;
}
