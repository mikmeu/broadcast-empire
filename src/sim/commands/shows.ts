// The shows and their place in the schedule.

import { MAX_SHOWS_PER_HOST, MAX_SHOWS_PER_PERSON, REVAMP_COST, WRITERS, EDITORS, FORMAT } from '../../config/balance';
import { ACTS, defaultFormat, getGenre, hasFormat, hasHost, validFormat, type Format, type GenreId } from '../../config/genres';
import { ROOM_TYPE_NAMES, inText } from '../../config/office';
import { SLOTS } from '../../config/world';
import { isEdited, showLoad, showQuality } from '../broadcast';
import { toCalendarDate } from '../calendar';
import { isLicensed } from '../content';
import { formatDate } from '../calendar';
import { airings, letRefusal, saleOf, saleRefusal } from '../deals';
import { settleLawsuit } from '../legal';
import { brainstormBlocker, holdBrainstorm } from '../morale';
import { clearanceOf } from '../merchandise';
import { employeesWithDesk, findRoom } from '../office';
import { endMakegoodsOf, exclusivityRefusal, settleContract } from '../sales';
import { genreAvailable } from '../tech';
import { addMessage, newId, type GameState, type Id, type Show, type Tone } from '../state';
import { type ActionResult, act, fail, formatEuro, pay } from './core';

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
  /** The format of a show its writers lead (0.22.0, #260), when it is made; the first option of each act if left out. A show's format changes only through `rewriteShow`. */
  format?: Format;
}

/**
 * Licensed programs air library titles: they have no host, staff, writers,
 * editor or studio. A show its writers lead has no host, a genre nobody writes
 * no writers, and only a produced TV show an editor.
 */
function normalize(input: ShowInput): Required<Omit<ShowInput, 'tone' | 'format'>> & Pick<ShowInput, 'tone' | 'format'> {
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
    // A studio let to a tenant is not the show's to use until the deal ends (0.20.0).
    if (showId === null || draft.shows.find((s) => s.id === showId)?.studioId !== room.roomId) {
      const refusal = letRefusal(draft, room.roomId);
      if (refusal) return refusal;
    }
  }
  return null;
}

function isOnShow(draft: GameState, showId: Id, personId: Id): boolean {
  const show = draft.shows.find((s) => s.id === showId);
  return show !== undefined && (show.hostId === personId || show.staffIds.includes(personId) || show.writerIds.includes(personId) || show.editorIds.includes(personId));
}

/** A studio or host can't be in two places at once: checks every slot this show is scheduled in. */
export function slotConflict(draft: GameState, show: Show): string | null {
  // Every slot the show is on the air in: on your channels, or sold to another (0.20.0).
  const all = airings(draft);
  for (const here of all.filter((a) => a.showId === show.id)) {
    for (const other of all.filter((a) => a.slot === here.slot && a.key !== here.key)) {
      const otherShow = draft.shows.find((s) => s.id === other.showId);
      if (!otherShow) continue;
      if (show.studioId && otherShow.studioId === show.studioId) {
        return `The studio is already in use by “${otherShow.name}” in that slot.`;
      }
      if (show.hostId && otherShow.hostId === show.hostId) {
        return `The host is already on air in “${otherShow.name}” in that slot.`;
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
    const { format, ...rest } = input;
    if (format && !validFormat(input.genre, format)) return fail('Pick one option for each act of the format.');
    const id = newId(draft, 's');
    // A new show is fresh, so its format starts on the cooldown.
    const written = hasFormat(input.genre) ? { format: format ?? defaultFormat(input.genre), formatChangedOn: draft.day } : {};
    draft.shows.push({ id, ...rest, ...written, name, freshness: 1, tone: input.tone ?? 'normal', fans: 0 });
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
    // A sold show stays the kind of show the buyer took (0.20.0).
    if (input.genre !== show.genre && saleOf(draft, showId)) return fail(saleRefusal(draft, showId)!);
    const error = staffingError(draft, input, showId);
    if (error) return fail(error);
    // Changing the kind of show makes it a new show for the audience.
    const { format: _format, ...rest } = input;
    if (input.genre !== show.genre) {
      show.freshness = 1;
      // A show that becomes one its writers lead gets that genre's first format, and one that stops being such a show loses it.
      show.format = defaultFormat(input.genre);
      show.formatChangedOn = hasFormat(input.genre) ? draft.day : undefined;
      if (!show.format) delete show.format;
      if (show.formatChangedOn === undefined) delete show.formatChangedOn;
    }
    Object.assign(show, { ...rest, name, tone: input.tone ?? show.tone });
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
    if (saleOf(draft, showId)) return fail(saleRefusal(draft, showId)!);
    const contract = draft.contracts.find((c) => c.showId === showId);
    if (contract) settleContract(draft, contract, `“${show.name}” was cancelled`);
    endMakegoodsOf(draft, showId);
    // Boxes left on a cancelled show clear at a fifth of what they cost (0.21.0, #362).
    const cleared = clearanceOf(show);
    if (cleared > 0) {
      draft.money += cleared;
      draft.ledger.revenue += cleared;
      draft.ledger.merchandise += cleared;
      addMessage(draft, 'info', `The leftover boxes of “${show.name}” cleared for ${formatEuro(Math.round(cleared))}.`, undefined, undefined, undefined, 'salesReports');
    }
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
    if (hasFormat(show.genre)) return fail('Its writers make this show: change its format instead.');
    if (show.freshness >= 1) return fail('This show is already fresh.');
    const paid = pay(draft, REVAMP_COST, 'revamps');
    if (paid) return paid;
    show.freshness = 1;
  });
}

/** How many acts the format changes, and what a rewrite of them brings back: `perAct` each, half to all of it by the writing (0.22.0, #260). */
export function rewriteGain(state: GameState, show: Show, format: Format): { changed: number; gain: number } {
  const old = show.format ?? defaultFormat(show.genre);
  const changed = old ? ACTS.filter((a) => old[a.id] !== format[a.id]).length : 0;
  const gain = Math.min(changed * FORMAT.perAct * (0.5 + 0.5 * showQuality(state, show).writing), 1 - show.freshness);
  return { changed, gain: Math.max(0, gain) };
}

/** The day a show's format can be rewritten again, or null if it can be now. */
export function nextRewrite(show: Show): number | null {
  return show.formatChangedOn == null ? null : show.formatChangedOn + FORMAT.cooldownDays;
}

/** Rewrites a show's acts (0.22.0, #260): the freshness comes back by what changed and how good the writing is, at most every `cooldownDays`. It costs no money. */
export function rewriteShow(state: GameState, showId: Id, format: Format): ActionResult {
  return act(state, (draft) => {
    const show = draft.shows.find((s) => s.id === showId);
    if (!show) return fail('That show doesn’t exist.');
    if (!hasFormat(show.genre)) return fail('This show has no format: revamp it instead.');
    if (!validFormat(show.genre, format)) return fail('Pick one option of this show’s own for each act.');
    const { changed, gain } = rewriteGain(draft, show, format);
    if (changed === 0) return fail('Change at least one act first.');
    const next = nextRewrite(show);
    if (next !== null && draft.day < next) return fail(`You can rewrite it again on ${formatDate(next)}.`);
    show.freshness = Math.min(1, show.freshness + gain);
    show.format = { ...format };
    show.formatChangedOn = draft.day;
  });
}

/** A consultant runs a brainstorm for a channel (0.21.0, #252): every show of yours in its slots is fresh again, for less than revamping them one by one. */
export function callBrainstorm(state: GameState, channelId: Id): ActionResult {
  return act(state, (draft) => {
    const blocked = brainstormBlocker(draft, channelId);
    if (blocked) return fail(blocked);
    holdBrainstorm(draft, channelId);
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
    if (saleOf(draft, showId)) return fail(saleRefusal(draft, showId)!);
    // A sponsor that is exclusive, or has an exclusive rival, can't be moved onto that rival's channel (0.21.0, #361).
    const contract = draft.contracts.find((c) => c.showId === showId);
    const rival = contract && exclusivityRefusal(draft, contract.sponsor, contract.exclusive, showId, channel);
    if (rival) return fail(rival);
    for (const c of draft.channels) c.schedule = c.schedule.map((id) => (id === showId ? null : id));
    channel.schedule[slot] = showId;
    const conflict = slotConflict(draft, show);
    if (conflict) return fail(conflict);
  });
}
