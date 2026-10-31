// The staffing report of On air (0.17.0): which show is in each studio when,
// who makes each show and whether it has enough people, and who has room for
// more work. It only reads the game; the one thing it keeps is which shows on
// the air were short yesterday, so that the player hears when one falls short.

import { EXTRA_PRODUCER } from '../config/balance';
import { getGenre, hasHost } from '../config/genres';
import { furnitureSpec, ROOM_TYPE_NAMES, inText, isStudioType } from '../config/office';
import { SLOTS } from '../config/world';
import { isEdited, producersAtWork, showLimit, showLoad } from './broadcast';
import { isLicensed } from './content';
import { fromChannel } from './inbox';
import { airings, onAirIds } from './deals';
import { deskFor, deskRoomFor, isTvStudio, type Desks } from './office';
import { addMessage, type Channel, type Employee, type GameState, type Id, type RentedRoom, type Role, type Show } from './state';
import { awayWithoutTemp, isStriking, onStrike } from './teams';

/** Someone on a show's crew: whether they count for it today, and why not. */
export interface CrewMember {
  employee: Employee;
  /** Why they do not count today, or null when they do. */
  missing: string | null;
  /** A producer at work beyond those that still make the show better (see EXTRA_PRODUCER). */
  addsNothing: boolean;
}

/** One kind of people on a show: how many it needs, and who is on it. */
export interface Crew {
  needed: number;
  /** Those who count today. */
  working: number;
  people: CrewMember[];
}

/** Whether a show has the producers it needs: fewer at work, as many or a few more, more than make it better, or none at work because they strike. */
export type Verdict = 'short' | 'enough' | 'more' | 'strike';

export interface ShowCrew {
  show: Show;
  /** Where it airs: the channel and the slot, for every slot it is in. */
  airs: { channel: Channel; slot: number }[];
  /** The host, for a genre that has one, and whether the genre is one they are best at. */
  host: { employee: Employee; fits: boolean; missing: string | null } | null;
  hosted: boolean;
  producers: Crew;
  /** Producers at work beyond the genre's need who make it better, up to EXTRA_PRODUCER.max. */
  extra: number;
  /** Producers at work beyond those. */
  idle: number;
  /** For a genre with writers. */
  writers: Crew | null;
  /** For a produced TV show. */
  editors: Crew | null;
  verdict: Verdict;
}

/** What a tag says when someone who works at a desk has none: the place they need, in the room it stands in. */
export const noDesk = (role: Role) => {
  if (role === 'production' || role === 'sales' || role === 'marketing' || role === 'researcher') return 'No workstation';
  const room = inText(ROOM_TYPE_NAMES[deskRoomFor(role)]);
  return `No ${furnitureSpec(deskFor(role)).name.toLowerCase()} in ${/^[aeiou]/i.test(room) ? 'an' : 'a'} ${room}`;
};

const person = (state: GameState, id: Id | null) => (id ? state.employees.find((e) => e.id === id) : undefined);

/** The writers or the editor of a show: those with a desk count, the best first. */
function crewOf(state: GameState, ids: readonly Id[], needed: number, desked: Desks, strike: boolean): Crew {
  const people = ids
    .map((id) => person(state, id))
    .filter((e): e is Employee => e !== undefined)
    .map((e) => ({ employee: e, missing: desked.has(e.id) ? null : strike ? 'On strike' : noDesk(e.role), addsNothing: false }))
    .sort((a, b) => Number(a.missing !== null) - Number(b.missing !== null) || b.employee.skill - a.employee.skill);
  return { needed, working: people.filter((p) => !p.missing).length, people };
}

/**
 * How a produced show is staffed today. Its producers count as the ratings
 * count them (`producersAtWork`): those at a desk. Whoever strikes stays at
 * home, so has no desk; a strike of the production team takes the show off the
 * air on its own, and does not make it short.
 */
export function showCrew(state: GameState, show: Show, desked: Desks): ShowCrew {
  const genre = getGenre(show.genre);
  const strike = isStriking(state, 'production');
  const needed = Math.max(1, genre.requiredStaff);
  const atWork = producersAtWork(state, show, desked).map((p) => p.employee);
  const extra = Math.min(EXTRA_PRODUCER.max, Math.max(0, atWork.length - needed));
  const idle = Math.max(0, atWork.length - needed - EXTRA_PRODUCER.max);
  const away = show.staffIds.map((id) => person(state, id)).filter((e): e is Employee => e !== undefined && !desked.has(e.id));
  const producers: Crew = {
    needed,
    working: atWork.length,
    people: [
      ...atWork.map((employee, i) => ({ employee, missing: null, addsNothing: i >= needed + EXTRA_PRODUCER.max })),
      ...away.map((employee) => ({ employee, missing: strike ? 'On strike' : awayWithoutTemp(state, employee) ? 'Away' : noDesk(employee.role), addsNothing: false })),
    ],
  };
  const hosted = hasHost(genre);
  const host = hosted ? person(state, show.hostId) : undefined;
  return {
    show,
    airs: state.channels.flatMap((channel) => channel.schedule.flatMap((id, slot) => (id === show.id ? [{ channel, slot }] : []))),
    host: host ? { employee: host, fits: host.specialties.includes(show.genre), missing: onStrike(state, host) ? 'On strike' : awayWithoutTemp(state, host) ? 'Away' : null } : null,
    hosted,
    producers,
    extra,
    idle,
    writers: genre.writers ? crewOf(state, show.writerIds, genre.writers.needed, desked, strike) : null,
    editors: isEdited(genre) ? crewOf(state, show.editorIds, 1, desked, strike) : null,
    verdict: strike ? 'strike' : atWork.length < needed ? 'short' : idle > 0 ? 'more' : 'enough',
  };
}

/** Every produced show of the player, those on the air first, in the order of the channels and their slots. Library programs have no crew. */
export function crewReport(state: GameState, desked: Desks): ShowCrew[] {
  const order = airings(state).map((a) => a.showId);
  const rank = (show: Show) => (order.includes(show.id) ? order.indexOf(show.id) : order.length);
  return state.shows
    .filter((s) => !isLicensed(s.genre))
    .sort((a, b) => rank(a) - rank(b))
    .map((s) => showCrew(state, s, desked));
}

/** A produced show that has fewer producers at work than its genre needs, with how many; not while the production team strikes (see `showCrew`). */
export function shortOfProducers(state: GameState, show: Show, desked: Desks): { working: number; needed: number } | null {
  if (isLicensed(show.genre) || isStriking(state, 'production')) return null;
  const needed = Math.max(1, getGenre(show.genre).requiredStaff);
  const working = producersAtWork(state, show, desked).length;
  return working < needed ? { working, needed } : null;
}

/** The player's shows on a schedule that are short of producers today. */
export function shortOnAir(state: GameState, desked: Desks): Show[] {
  const scheduled = onAirIds(state);
  return state.shows.filter((s) => scheduled.has(s.id) && shortOfProducers(state, s, desked) !== null);
}

/** One studio's day: the show in each slot, with its channel, and the shows made there that are in no slot. */
export interface StudioDay {
  room: RentedRoom;
  tv: boolean;
  slots: ({ show: Show; channel: Channel } | null)[];
  unscheduled: Show[];
}

/** Each studio's day, radio studios first, then television. A studio makes one show per slot (see `scheduleShow`). */
export function studioDays(state: GameState): StudioDay[] {
  const scheduled = onAirIds(state);
  return state.rooms
    .filter((r) => r.type !== null && isStudioType(r.type))
    .map((room) => {
      const made = state.shows.filter((s) => s.studioId === room.roomId);
      return {
        room,
        tv: isTvStudio(room.type),
        slots: SLOTS.map((_, slot) => {
          for (const channel of state.channels) {
            const show = made.find((s) => s.id === channel.schedule[slot]);
            if (show) return { show, channel };
          }
          return null;
        }),
        unscheduled: made.filter((s) => !scheduled.has(s.id)),
      };
    })
    .sort((a, b) => Number(a.tv) - Number(b.tv));
}

/** Someone who could take on another show: a host with none, or a producer, writer or editor with room for more. */
export interface FreeHand {
  employee: Employee;
  /** How many more shows they can take. */
  room: number;
}

/** Who could take on another show, by role, the best first: for when new people arrive and shows are shuffled. */
export function freeHands(state: GameState): FreeHand[] {
  const roles: Role[] = ['host', 'production', 'writer', 'editor'];
  return state.employees
    .filter((e) => roles.includes(e.role) && !(e.role === 'host' && (e.talentUntil != null || e.leaving !== null)))
    .map((employee) => ({ employee, room: showLimit(employee.role) - showLoad(state, employee.id) }))
    .filter((f) => f.room > 0)
    .sort((a, b) => roles.indexOf(a.employee.role) - roles.indexOf(b.employee.role) || b.employee.skill - a.employee.skill);
}

/**
 * Daily: tells the player once when a show on the air falls short of
 * producers (0.17.0), and why. One that has them all again is forgotten, and
 * told about again if it falls short once more. A strike changes nothing here:
 * it has news of its own.
 */
export function watchCrews(draft: GameState, desked: Desks): void {
  if (isStriking(draft, 'production')) return;
  const short = shortOnAir(draft, desked);
  for (const show of short.filter((s) => !draft.shortOfProducers.includes(s.id))) {
    const { working, needed } = shortOfProducers(draft, show, desked)!;
    const assigned = show.staffIds.filter((id) => person(draft, id)).length;
    const deskless = assigned - working;
    const why =
      assigned < needed
        ? `it has ${assigned} of the ${needed} producers it needs`
        : `${deskless === 1 ? 'one of its producers has' : `${deskless} of its producers have`} no workstation, so ${working} of the ${needed} it needs are at work`;
    // From the manager of its channel, who leads the channel's production team.
    // A show sold to a rival channel has no channel of yours to come from.
    const on = draft.channels.find((c) => c.schedule.includes(show.id));
    addMessage(draft, 'warning', `“${show.name}” is short of producers: ${why}. Its production counts for ${Math.round((working / needed) * 100)}% until it has them all.`, undefined, 'broadcast:staffing', fromChannel(on?.id));
  }
  draft.shortOfProducers = short.map((s) => s.id);
}
