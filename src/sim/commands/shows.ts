// The shows and their place in the schedule.

import { MAX_SHOWS_PER_HOST, MAX_SHOWS_PER_PERSON, REVAMP_COST, WRITERS, EDITORS } from '../../config/balance';
import { getGenre, hasHost, type GenreId } from '../../config/genres';
import { ROOM_TYPE_NAMES, inText } from '../../config/office';
import { SLOTS } from '../../config/world';
import { isEdited, showLoad } from '../broadcast';
import { toCalendarDate } from '../calendar';
import { isLicensed } from '../content';
import { formatDate } from '../calendar';
import { settleLawsuit } from '../legal';
import { employeesWithDesk, findRoom } from '../office';
import { settleContract } from '../sales';
import { genreAvailable } from '../tech';
import { newId, type GameState, type Id, type Show, type Tone } from '../state';
import { type ActionResult, act, fail, pay } from './core';

export interface ShowInput {
  name: string;
  genre: GenreId;
  hostId: Id | null;
  staffIds: Id[];
  /** The writers, for a genre that is written (see `writers` in config/genres.ts); none if left out. */
  writerIds?: Id[];
  /** The video editor, for a produced TV show; none if left out. */
  editorIds?: Id[];
  studioId: string | null;
  /** How bold the show is (0.19.0); normal if left out, and unchanged when a show is edited. */
  tone?: Tone;
}

/**
 * Licensed programs air library titles: they have no host, staff, writers,
 * editor or studio. A show its writers lead has no host, a genre nobody writes
 * no writers, and only a produced TV show an editor.
 */
function normalize(input: ShowInput): Required<Omit<ShowInput, 'tone'>> & Pick<ShowInput, 'tone'> {
  if (isLicensed(input.genre)) return { ...input, hostId: null, staffIds: [], writerIds: [], editorIds: [], studioId: null };
  const genre = getGenre(input.genre);
  return { ...input, hostId: hasHost(genre) ? input.hostId : null, writerIds: genre.writers ? (input.writerIds ?? []) : [], editorIds: isEdited(genre) ? (input.editorIds ?? []) : [] };
}

/** Checks a show's host, staff and studio. `showId` is the show being edited, if any. */
function staffingError(draft: GameState, input: ShowInput, showId: Id | null): string | null {
  const genre = getGenre(input.genre);
  const year = toCalendarDate(draft.day).year;
  if (!genreAvailable(draft, genre.id)) {
    return genre.unlockYear > year ? `${genre.name} shows don’t exist until ${genre.unlockYear}.` : `Research the ${genre.name.toLowerCase()} format first.`;
  }
  if (genre.kind === 'licensed') return null;
  const load = (personId: Id) => showLoad(draft, personId) - (showId && isOnShow(draft, showId, personId) ? 1 : 0);

  if (input.hostId) {
    const host = draft.employees.find((e) => e.id === input.hostId);
    if (host?.role !== 'host') return 'Pick a host for the show.';
    // A host who presents more than one show since before the rule keeps them; only a new pairing is checked.
    const keeps = showId !== undefined && draft.shows.some((s) => s.id === showId && s.hostId === host.id);
    if (!keeps && load(host.id) >= MAX_SHOWS_PER_HOST) return `${host.name} already presents a show: a host is on the air once a day.`;
    if (host.talentUntil != null) return `${host.name} is in the talent programme until ${formatDate(host.talentUntil)}.`;
  }
  if (new Set(input.staffIds).size !== input.staffIds.length) return 'The same person is listed twice.';
  for (const staffId of input.staffIds) {
    const staff = draft.employees.find((e) => e.id === staffId);
    if (staff?.role !== 'production') return 'Only production staff can produce a show.';
    if (load(staff.id) >= MAX_SHOWS_PER_PERSON) return `${staff.name} already works on ${MAX_SHOWS_PER_PERSON} shows.`;
  }
  const writerIds = input.writerIds ?? [];
  if (new Set(writerIds).size !== writerIds.length) return 'The same writer is listed twice.';
  for (const writerId of writerIds) {
    const writer = draft.employees.find((e) => e.id === writerId);
    if (writer?.role !== 'writer') return 'Only writers can write a show.';
    if (load(writer.id) >= WRITERS.showsEach) return `${writer.name} already writes ${WRITERS.showsEach} shows.`;
  }
  const editorIds = input.editorIds ?? [];
  if (editorIds.length > 1) return 'A show has one editor.';
  for (const editorId of editorIds) {
    const editor = draft.employees.find((e) => e.id === editorId);
    if (editor?.role !== 'editor') return 'Only a video editor can edit a show.';
    if (load(editor.id) >= EDITORS.showsEach) return `${editor.name} already edits ${EDITORS.showsEach} shows.`;
  }
  if (input.studioId) {
    const room = findRoom(draft, input.studioId);
    if (!room) return 'You don’t have that room.';
    if (room.type !== genre.studio) return `${genre.name} needs a ${inText(ROOM_TYPE_NAMES[genre.studio])}.`;
  }
  return null;
}

function isOnShow(draft: GameState, showId: Id, personId: Id): boolean {
  const show = draft.shows.find((s) => s.id === showId);
  return show !== undefined && (show.hostId === personId || show.staffIds.includes(personId) || show.writerIds.includes(personId) || show.editorIds.includes(personId));
}

/** A studio or host can't be in two places at once: checks every slot this show is scheduled in. */
function slotConflict(draft: GameState, show: Show): string | null {
  for (const channel of draft.channels) {
    for (let slot = 0; slot < channel.schedule.length; slot++) {
      if (channel.schedule[slot] !== show.id) continue;
      for (const other of draft.channels) {
        if (other === channel) continue;
        const otherShow = draft.shows.find((s) => s.id === other.schedule[slot]);
        if (!otherShow) continue;
        if (show.studioId && otherShow.studioId === show.studioId) {
          return `The studio is already in use by “${otherShow.name}” in that slot.`;
        }
        if (show.hostId && otherShow.hostId === show.hostId) {
          return `The host is already on air in “${otherShow.name}” in that slot.`;
        }
      }
    }
  }
  return null;
}

export function createShow(state: GameState, showInput: ShowInput): ActionResult {
  const input = normalize(showInput);
  return act(state, (draft) => {
    const name = input.name.trim();
    if (!name) return fail('Give the show a name.');
    const error = staffingError(draft, input, null);
    if (error) return fail(error);
    const id = newId(draft, 's');
    draft.shows.push({ id, ...input, name, freshness: 1, tone: input.tone ?? 'normal', fans: 0 });
    return id;
  });
}

export function updateShow(state: GameState, showId: Id, showInput: ShowInput): ActionResult {
  const input = normalize(showInput);
  return act(state, (draft) => {
    const show = draft.shows.find((s) => s.id === showId);
    if (!show) return fail('That show doesn’t exist.');
    const name = input.name.trim();
    if (!name) return fail('Give the show a name.');
    const error = staffingError(draft, input, showId);
    if (error) return fail(error);
    // Changing the format makes it a new show for the audience.
    if (input.genre !== show.genre) show.freshness = 1;
    Object.assign(show, { ...input, name, tone: input.tone ?? show.tone });
    const conflict = slotConflict(draft, show);
    if (conflict) return fail(conflict);
  });
}

/** Changes how bold a show is, at any time (0.19.0). It costs nothing and counts from the next airing and the next 1st of the month. */
export function setShowTone(state: GameState, showId: Id, tone: Tone): ActionResult {
  return act(state, (draft) => {
    const show = draft.shows.find((s) => s.id === showId);
    if (!show) return fail('That show doesn’t exist.');
    show.tone = tone;
  });
}

/** Settles a lawsuit for its price (0.19.0). */
export function settleCase(state: GameState, lawsuitId: Id): ActionResult {
  return act(state, (draft) => settleLawsuit(draft, lawsuitId, employeesWithDesk(draft)) ?? undefined);
}

export function deleteShow(state: GameState, showId: Id): ActionResult {
  return act(state, (draft) => {
    const show = draft.shows.find((s) => s.id === showId);
    if (!show) return fail('That show doesn’t exist.');
    const contract = draft.contracts.find((c) => c.showId === showId);
    if (contract) settleContract(draft, contract, `“${show.name}” was cancelled`);
    draft.shows = draft.shows.filter((s) => s.id !== showId);
    draft.campaigns = draft.campaigns.filter((c) => c.targetId !== showId);
    delete draft.promotion[showId];
    for (const channel of draft.channels) {
      channel.schedule = channel.schedule.map((id) => (id === showId ? null : id));
    }
  });
}

export function revampShow(state: GameState, showId: Id): ActionResult {
  return act(state, (draft) => {
    const show = draft.shows.find((s) => s.id === showId);
    if (!show) return fail('That show doesn’t exist.');
    if (show.freshness >= 1) return fail('This show is already fresh.');
    const paid = pay(draft, REVAMP_COST, 'revamps');
    if (paid) return paid;
    show.freshness = 1;
  });
}

/** Puts a show in a slot (moving it if it was scheduled elsewhere), or clears the slot with null. */
export function scheduleShow(state: GameState, channelId: Id, slot: number, showId: Id | null): ActionResult {
  return act(state, (draft) => {
    const channel = draft.channels.find((c) => c.id === channelId);
    if (!channel) return fail('That channel doesn’t exist.');
    if (slot < 0 || slot >= SLOTS.length) return fail('That time slot doesn’t exist.');
    if (showId === null) {
      channel.schedule[slot] = null;
      return;
    }
    const show = draft.shows.find((s) => s.id === showId);
    if (!show) return fail('That show doesn’t exist.');
    if (getGenre(show.genre).medium !== channel.medium) return fail('That show is for a different medium.');
    for (const c of draft.channels) c.schedule = c.schedule.map((id) => (id === showId ? null : id));
    channel.schedule[slot] = showId;
    const conflict = slotConflict(draft, show);
    if (conflict) return fail(conflict);
  });
}
