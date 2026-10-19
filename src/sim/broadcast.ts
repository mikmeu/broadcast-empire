// The ratings model (prompt.md section 7).

import {
  ACTIVE_REGIONS,
  BASELINE_APPEAL,
  EXTRA_PRODUCER,
  FAME_APPEAL,
  MAX_SHOWS_PER_HOST,
  MAX_SHOWS_PER_PERSON,
  OFF_SPECIALTY_SKILL,
  CPM,
  EVENTS,
  QUALITY_WEIGHTS,
  RERUN,
  RIVAL_QUALITY_CAP,
  SALES,
  SHARE_EXPONENT,
  SPECIALIZATION,
  STUDIO_AUDIENCE,
  SPORTS_RIGHTS,
  WEAR,
  WRITERS,
  EDITORS,
  ENGINEERS,
  DRESSING,
  CONTROL_ROOM,
  DECOR,
  ROYALTIES,
} from '../config/balance';
import { getGenre, hasHost, type Genre, type GenreGroup, type GenreId } from '../config/genres';
import { FURNITURE, type FurnitureType } from '../config/office';
import { AUDIENCES, SLOTS, type AudienceId, type Medium, type RegionId } from '../config/world';
import { activeRights, isLicensed, libraryCapacity, pickTitles } from './content';
import { promotionFor } from './marketing';
import { toCalendarDate } from './calendar';
import { adRateFactor, eventAppeal, eventContext, playerEvent, type EventContext } from './events';
import { rivalStrength } from './generate';
import { equipmentLevel, techMultiplier } from './tech';
import { borrowedDesks, controlRoomOf, employeesWithDesk, findRoom, isBroken, isFurnished, isStudioReady, isTvStudio, studioKit, type Desks } from './office';
import { crewing, headquartersProblem, masterControlProblem } from './control';
import { effectiveSkill, skillAtWork } from './staff';
import { PLAYER, type Channel, type ChannelDay, type DayResult, type Employee, type GameState, type Id, type RivalShow, type Role, type Show, type SlotFactors, type Title } from './state';
import { cleanlinessFactor, moraleFactor } from './upkeep';
import { isStriking, meetingFactor, onStrike } from './teams';
import { reach } from './world';

// --- Quality ---

export function hostSkill(host: Pick<Employee, 'skill' | 'specialties'> & { trainingUntil?: number | null }, genre: GenreId): number {
  return (skillAtWork(host) / 100) * (host.specialties.includes(genre) ? 1 : OFF_SPECIALTY_SKILL);
}

/**
 * The work of the show's staff who have a desk. The best ones count, as many
 * as the genre needs: their average effective skill, scaled down if the show
 * is understaffed. Everyone beyond that adds a little, so that an extra pair
 * of hands never makes a show worse (see EXTRA_PRODUCER).
 */
export function productionSkill(state: GameState, show: Show, desked: Desks): number {
  const skills = show.staffIds
    .map((id) => state.employees.find((e) => e.id === id))
    .filter((e): e is Employee => e !== undefined && desked.has(e.id))
    .map((e) => effectiveSkill(state, e, desked) * meetingFactor(state, e))
    .sort((a, b) => b - a);
  if (skills.length === 0) return 0;
  const needed = Math.max(1, getGenre(show.genre).requiredStaff);
  const core = skills.slice(0, needed);
  const avgSkill = core.reduce((sum, skill) => sum + skill, 0) / core.length / 100;
  const extra = 1 + EXTRA_PRODUCER.bonus * Math.min(EXTRA_PRODUCER.max, skills.length - core.length);
  return Math.min(1, avgSkill * Math.min(1, core.length / needed) * extra) * techMultiplier(state, 'productionSkill');
}

/**
 * The work of the show's writers who have a place in a writers' room: their
 * average effective skill, the best as many as the genre needs, scaled down
 * when there are fewer of them. 0 for a show nobody writes.
 */
export function writingSkill(state: GameState, show: Show, desked: Desks): number {
  const needed = getGenre(show.genre).writers?.needed;
  return needed ? crewSkill(state, show.writerIds, needed, desked) : 0;
}

/** The work of people at a desk on a show: the average effective skill of the best `needed` of them, 0–1, scaled down when there are fewer. */
function crewSkill(state: GameState, ids: readonly Id[], needed: number, desked: Desks): number {
  const skills = ids
    .map((id) => state.employees.find((e) => e.id === id))
    .filter((e): e is Employee => e !== undefined && desked.has(e.id))
    .map((e) => effectiveSkill(state, e, desked) * meetingFactor(state, e))
    .sort((a, b) => b - a)
    .slice(0, needed);
  if (skills.length === 0) return 0;
  const avgSkill = skills.reduce((sum, skill) => sum + skill, 0) / skills.length / 100;
  return Math.min(1, avgSkill * (skills.length / needed));
}

/** What writing adds to a show it does not lead: up to WRITERS.bonus for the best (1 = nothing). */
export const writersLift = (genre: Genre, writing: number) => (genre.writers && !genre.writers.lead ? 1 + WRITERS.bonus * writing : 1);

/** Whether a show is one a video editor can edit: a produced TV show (0.14.0). */
export const isEdited = (genre: Genre) => genre.medium === 'tv' && genre.kind === 'produced';

/** What its editor adds to a produced TV show: up to EDITORS.bonus with the best editing (1 = nothing). */
export function editingLift(state: GameState, show: Show, desked: Desks): number {
  return isEdited(getGenre(show.genre)) ? 1 + EDITORS.bonus * crewSkill(state, show.editorIds, 1, desked) : 1;
}

/** Whether a show is one an audio engineer looks after: a produced radio show (0.15.0). */
export const isEngineered = (genre: Genre) => genre.medium === 'radio' && genre.kind === 'produced';

/**
 * The audio engineer who looks after each produced radio show, by the show's
 * id, with how much more slowly the show loses its freshness for it (0.15.0):
 * ENGINEERS.slower for the best engineering. Each engineer at an audio desk
 * looks after ENGINEERS.showsEach shows on the air, the best engineers taking
 * the shows with the most listeners yesterday.
 */
export function engineeredShows(state: GameState, desked: Desks): Map<Id, { engineerId: Id; slower: number; booth: boolean }> {
  const scheduled = new Set(state.channels.flatMap((c) => c.schedule));
  const listened = new Map<Id, number>();
  for (const slot of (state.lastDay?.channels ?? []).filter((c) => c.isPlayer).flatMap((c) => c.slots)) {
    if (slot.showId) listened.set(slot.showId, Math.max(listened.get(slot.showId) ?? 0, slot.listeners));
  }
  const shows = state.shows
    .filter((s) => scheduled.has(s.id) && isEngineered(getGenre(s.genre)))
    .sort((a, b) => (listened.get(b.id) ?? 0) - (listened.get(a.id) ?? 0));
  // An engineer with a recording booth in their audio room records jingles and promos for their shows too (0.16.0).
  const booth = (id: Id) => findRoom(state, desked.get(id)?.roomId ?? '')?.furniture.some((f) => f.type === 'recordingBooth') ?? false;
  const engineers = state.employees
    .filter((e) => e.role === 'engineer' && desked.has(e.id))
    .map((e) => ({ engineerId: e.id, skill: Math.min(1, (effectiveSkill(state, e, desked) * meetingFactor(state, e)) / 100), booth: booth(e.id) }))
    .sort((a, b) => b.skill - a.skill);
  const looked = new Map<Id, { engineerId: Id; slower: number; booth: boolean }>();
  shows.slice(0, engineers.length * ENGINEERS.showsEach).forEach((show, i) => {
    const engineer = engineers[Math.floor(i / ENGINEERS.showsEach)]!;
    looked.set(show.id, { engineerId: engineer.engineerId, slower: ENGINEERS.slower * engineer.skill, booth: engineer.booth });
  });
  return looked;
}

/**
 * The hosts of TV shows who are made up in a dressing room before they go on
 * (0.14.0): two for every make-up table in a dressing room that has all it
 * needs, the most famous first.
 */
export function madeUpHosts(state: GameState): Set<Id> {
  const tables = state.rooms.filter((r) => r.type === 'dressingRoom' && isFurnished(r)).reduce((n, r) => n + r.furniture.filter((f) => f.type === 'makeupTable').length, 0);
  if (tables === 0) return new Set();
  const hosts = new Set(state.shows.filter((s) => s.hostId && getGenre(s.genre).medium === 'tv').map((s) => s.hostId!));
  return new Set(
    state.employees
      .filter((e) => hosts.has(e.id))
      .sort((a, b) => b.fame - a.fame || a.hiredOn - b.hiredOn)
      .slice(0, tables * DRESSING.hostsPerTable)
      .map((e) => e.id),
  );
}

/**
 * The set a show needs that does not stand in its studio, if any: a soap opera
 * is made on the soap opera decor, a game show on the game show decor and a
 * talk show on the talk show set.
 */
export function missingSet(state: GameState, show: Show): FurnitureType | null {
  const set = getGenre(show.genre).set;
  const room = show.studioId ? findRoom(state, show.studioId) : undefined;
  return set && room && !room.furniture.some((f) => f.type === set) ? set : null;
}

/**
 * 0 without a complete studio; otherwise how up to date its equipment is
 * (1 = current for the year), halved while any of it is broken, a little
 * higher for a radio studio whose desk stands in a control room next door, and
 * lower for a TV studio whose control room no technician works (0.16.0).
 */
export function studioLevel(state: GameState, show: Show): number {
  const room = show.studioId ? findRoom(state, show.studioId) : undefined;
  if (!room || room.type !== getGenre(show.genre).studio || !isStudioReady(state, room) || missingSet(state, show)) return 0;
  const broken = studioKit(state, room).some(isBroken) ? WEAR.brokenStudioLevel : 1;
  const apart = borrowedDesks(state).has(room.roomId) ? CONTROL_ROOM.studioLevel : 1;
  return equipmentLevel(state, room, toCalendarDate(state.day).year) * broken * apart * crewFactor(state, room.roomId);
}

/** What the crew in its control room does for a TV studio (0.16.0): 1 while a technician works it, or while it has no control room yet in a game that waits for the rule. */
export function crewFactor(state: GameState, studioId: string): number {
  const room = findRoom(state, studioId);
  if (!room || !isTvStudio(room.type) || !controlRoomOf(state, studioId)) return 1;
  return crewing(state).posts.has(studioId) ? 1 : CONTROL_ROOM.unmanned;
}

/** What jingles and promos from a recording booth add to a radio show (1 = nothing): see `engineeredShows`. */
export const recordedLift = (state: GameState, show: Show, desked: Desks) => (engineeredShows(state, desked).get(show.id)?.booth ? 1 + DECOR.recordingBooth : 1);

/** What record shelves in its studio add to a music show that pays royalties (1 = nothing, 0.18.0); one set counts. */
export function recordsLift(state: GameState, show: Show): number {
  if (!ROYALTIES.genres.includes(show.genre) || !show.studioId) return 1;
  return findRoom(state, show.studioId)?.furniture.some((f) => f.type === 'recordShelves') ? 1 + DECOR.recordShelves : 1;
}

/** Conditions: the studio's CleanlinessFactor × the MoraleFactor of the host, the production staff and the writers at work. */
export function showConditions(state: GameState, show: Show, desked: Desks): number {
  const team = [show.hostId, ...[...show.staffIds, ...show.writerIds, ...show.editorIds].filter((id) => desked.has(id))]
    .map((id) => state.employees.find((e) => e.id === id))
    .filter((e): e is Employee => e !== undefined);
  const morale = team.length > 0 ? moraleFactor(team.reduce((sum, e) => sum + e.morale, 0) / team.length) : 1;
  return cleanlinessFactor(show.studioId ? findRoom(state, show.studioId) : undefined) * morale;
}

export interface QualityBreakdown {
  /** The host's skill; on a show its writers lead, which has no host, their writing. */
  host: number;
  /** The writers' work, 0–1 (0 for a show nobody writes). */
  writing: number;
  /** What writing adds to a show it does not lead (1 = nothing): see `writersLift`. */
  writers: number;
  /** What its video editor adds to a produced TV show (1 = nothing): see `editingLift`. */
  edited: number;
  /** What a host made up in a dressing room adds (1 = nothing): see `madeUpHosts`. */
  madeUp: number;
  /** What jingles and promos from a recording booth add to a radio show (1 = nothing): see `recordedLift`. */
  recorded: number;
  /** What record shelves in its studio add to a music show (1 = nothing): see `recordsLift`. */
  records: number;
  production: number;
  studio: number;
  /** Cleanliness × morale; 1 for licensed programs. */
  conditions: number;
  /** What a studio audience adds (1 = nothing): see STUDIO_AUDIENCE. */
  audience: number;
  quality: number;
  /** Reasons the show can't go on air; empty if it can. */
  problems: string[];
}

/** A licensed title's quality on air, after library technology. */
export const titleQuality = (state: GameState, quality: number) => Math.min(1, quality * techMultiplier(state, 'licensedQuality'));

/** Quality of the best title a licensed program can air today. */
function licensedQuality(state: GameState, show: Show): QualityBreakdown {
  const problems: string[] = [];
  const titles = state.library.filter((t) => t.genre === show.genre && t.airingsLeft > 0);
  if (libraryCapacity(state) === 0) problems.push('No library with shelving');
  else if (titles.length === 0) problems.push(`No ${getGenre(show.genre).name.toLowerCase()} left in the library: buy more on the content market`);
  const best = problems.length > 0 ? 0 : titleQuality(state, Math.max(...titles.map((t) => t.quality)));
  return { host: 0, writing: 0, writers: 1, edited: 1, madeUp: 1, recorded: 1, records: 1, production: 0, studio: best > 0 ? 1 : 0, conditions: 1, audience: 1, quality: best, problems };
}

/** Whether a show that could show the games has no rights to any today, so that it only talks about sport. */
export const talksOnly = (state: GameState, genre: Genre) => genre.usesRights === true && !activeRights(state) && !playerEvent(state);

/**
 * What sports rights do for a show's appeal: with rights for the season it
 * shows the games, and draws by their prestige; during an event the player
 * holds it shows that; without either it can only talk about sport.
 */
export function rightsBonus(state: GameState, genre: Genre): number {
  if (!genre.usesRights) return 1;
  return activeRights(state)?.prestige ?? (playerEvent(state) ? 1 : SPORTS_RIGHTS.talkOnly);
}

/** What the audience seating in a show's studio adds to its quality: 1 for none, or for a genre that has no use for an audience. */
export function studioAudience(state: GameState, show: Show): number {
  if (!STUDIO_AUDIENCE.genres.includes(show.genre) || !show.studioId) return 1;
  const blocks = findRoom(state, show.studioId)?.furniture.filter((f) => f.type === 'audienceSeating').length ?? 0;
  return 1 + STUDIO_AUDIENCE.perBlock * Math.min(STUDIO_AUDIENCE.maxBlocks, blocks);
}

export function showQuality(state: GameState, show: Show, desked = employeesWithDesk(state)): QualityBreakdown {
  if (isLicensed(show.genre)) return licensedQuality(state, show);
  const genre = getGenre(show.genre);
  const hosted = hasHost(genre);
  const host = hosted ? state.employees.find((e) => e.id === show.hostId) : undefined;
  const writing = writingSkill(state, show, desked);
  const breakdown = {
    // A show its writers lead has no host: their work counts in the host's place.
    host: hosted ? (host ? hostSkill(host, show.genre) * meetingFactor(state, host) : 0) : writing,
    writing,
    writers: writersLift(genre, writing),
    edited: editingLift(state, show, desked),
    madeUp: host && genre.medium === 'tv' && madeUpHosts(state).has(host.id) ? 1 + DRESSING.bonus : 1,
    recorded: recordedLift(state, show, desked),
    records: recordsLift(state, show),
    production: productionSkill(state, show, desked),
    studio: studioLevel(state, show),
    conditions: showConditions(state, show, desked),
    audience: studioAudience(state, show),
  };
  const problems: string[] = [];
  // Production staff, writers and editors are one team: when it strikes, nothing is made (0.15.0).
  const strike = isStriking(state, 'production');
  if (hosted && !host) problems.push('No host');
  else if (host && onStrike(state, host)) problems.push('The host is on strike');
  if (!hosted && show.writerIds.length === 0) problems.push('No writers');
  else if (!hosted && writing === 0 && !strike) problems.push('Writers have no place in a writers’ room');
  if (show.staffIds.length === 0) problems.push('No production staff');
  else if (strike) problems.push('The production team is on strike');
  else if (breakdown.production === 0) problems.push('Production staff have no workstation');
  if (!show.studioId) problems.push('No studio');
  else if (missingSet(state, show)) problems.push(`Its studio has no ${FURNITURE[missingSet(state, show)!].name.toLowerCase()}`);
  else if (breakdown.studio === 0) problems.push('Studio is missing equipment');

  const quality =
    problems.length > 0
      ? 0
      : breakdown.host ** QUALITY_WEIGHTS.host *
        breakdown.production ** QUALITY_WEIGHTS.production *
        breakdown.studio ** QUALITY_WEIGHTS.studio *
        breakdown.conditions *
        breakdown.audience *
        breakdown.writers *
        breakdown.edited *
        breakdown.madeUp *
        breakdown.recorded *
        breakdown.records;
  return { ...breakdown, quality, problems };
}

/** Why a channel is off air, or null if it broadcasts. */
export function channelOffAirReason(state: GameState, channel: Channel, desked = employeesWithDesk(state)): string | null {
  if (!state.licenses.some((l) => l.channelId === channel.id)) return 'No license';
  const headquarters = headquartersProblem(state);
  if (headquarters) return headquarters;
  if (!channel.managerId) return 'No channel manager';
  if (!desked.has(channel.managerId)) return 'Channel manager has no desk in a management office';
  return masterControlProblem(state, channel);
}

export function channelRegions(state: GameState, channelId: Id): RegionId[] {
  return state.licenses.filter((l) => l.channelId === channelId && ACTIVE_REGIONS.includes(l.regionId)).map((l) => l.regionId);
}

/** Number of shows a person is assigned to (as host, production staff, writer or editor). Audio engineers are not assigned: see `engineeredShows`. */
export function showLoad(state: GameState, personId: Id): number {
  return state.shows.filter((s) => s.hostId === personId || s.staffIds.includes(personId) || s.writerIds.includes(personId) || s.editorIds.includes(personId)).length;
}

/** How many shows someone can be on: one for a host, more for production staff, writers and editors. */
export const showLimit = (role: Role) => (role === 'host' ? MAX_SHOWS_PER_HOST : role === 'writer' ? WRITERS.showsEach : role === 'editor' ? EDITORS.showsEach : MAX_SHOWS_PER_PERSON);

export const hasCapacity = (state: GameState, personId: Id) => {
  const person = state.employees.find((e) => e.id === personId);
  return person !== undefined && showLoad(state, personId) < showLimit(person.role);
};

/** A channel specializes in a genre group when at least SPECIALIZATION.minSlots slots belong to it. */
export function specializationOf(genres: readonly (GenreId | null)[]): GenreGroup | null {
  const counts = new Map<GenreGroup, number>();
  for (const genre of genres) {
    if (!genre) continue;
    const group = getGenre(genre).group;
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  for (const [group, count] of counts) if (count >= SPECIALIZATION.minSlots) return group;
  return null;
}

export function channelSpecialization(state: GameState, channel: Channel): GenreGroup | null {
  return specializationOf(channel.schedule.map((id) => state.shows.find((s) => s.id === id)?.genre ?? null));
}

// --- Appeal & share ---

/** Everything the share formula needs to know about one program in one slot. */
interface Program {
  showId: Id | null;
  titleId: Id | null;
  name: string;
  quality: number;
  fit: Record<AudienceId, number>;
  fame: number;
  freshness: number;
  /** Specialization bonus (1 or SPECIALIZATION.bonus). */
  bonus: number;
  /** Channel and show ids whose marketing promotion applies. */
  promotedIds: Id[];
  cpmMultiplier: number;
  preferredAudience: AudienceId | null;
  /** Teleshopping: paid per airing instead of ad revenue. */
  fixedFee: number;
  /** Multiplies listeners (cable TV) and ad revenue (streaming) from technology. */
  reachBoost: number;
  revenueBoost: number;
}

const RERUN_FIT = Object.fromEntries(AUDIENCES.map((a) => [a.id, RERUN.fit])) as Record<AudienceId, number>;

export function appeal(
  quality: number,
  fit: number,
  hostFame: number,
  freshness: number,
  reputation: number,
  promotion = 0,
  bonus = 1,
): number {
  return quality * fit * (1 + promotion) * (1 + (FAME_APPEAL * hostFame) / 100) * freshness * (0.5 + reputation) * bonus;
}

/** Share of the audience for each appeal, given the "switched off" baseline. */
export function shares(appeals: readonly number[]): number[] {
  const powered = appeals.map((a) => a ** SHARE_EXPONENT);
  const total = powered.reduce((sum, p) => sum + p, 0) + BASELINE_APPEAL ** SHARE_EXPONENT;
  return powered.map((p) => p / total);
}

// --- One day of broadcasting ---

interface BroadcastingChannel {
  id: Id;
  name: string;
  ownerId: Id;
  medium: Medium;
  regionIds: RegionId[];
  reputation: Partial<Record<RegionId, number>>;
  /** Null when off air. */
  programs: (Program | null)[];
}

function playerChannel(state: GameState, channel: Channel, desked: Desks, titles: Map<string, Title>, events: EventContext): BroadcastingChannel {
  const offAir = channelOffAirReason(state, channel, desked) !== null;
  const specialization = channelSpecialization(state, channel);
  const reachBoost = channel.medium === 'tv' ? techMultiplier(state, 'tvReach') : 1;
  const licensedRevenue = techMultiplier(state, 'licensedRevenue');
  return {
    id: channel.id,
    name: channel.name,
    ownerId: PLAYER,
    medium: channel.medium,
    regionIds: channelRegions(state, channel.id),
    reputation: channel.reputation,
    programs: channel.schedule.map((showId, slot): Program | null => {
      if (offAir) return null;
      const show = state.shows.find((s) => s.id === showId);
      const title = titles.get(`${channel.id}:${slot}`);
      const quality = !show ? 0 : title ? titleQuality(state, title.quality) : isLicensed(show.genre) ? 0 : showQuality(state, show, desked).quality;
      if (!show || quality === 0) {
        return {
          showId: null,
          titleId: null,
          name: 'Rerun',
          quality: RERUN.quality,
          fit: RERUN_FIT,
          fame: 0,
          freshness: 1,
          bonus: 1,
          promotedIds: [channel.id],
          cpmMultiplier: 1,
          preferredAudience: null,
          fixedFee: 0,
          reachBoost,
          revenueBoost: 1,
        };
      }
      const host = state.employees.find((e) => e.id === show.hostId);
      const genre = getGenre(show.genre);
      const contract = state.contracts.find((c) => c.showId === show.id);
      const prestige = rightsBonus(state, genre);
      return {
        showId: show.id,
        titleId: title?.id ?? null,
        name: title ? `${show.name}: ${title.name}` : show.name,
        quality,
        fit: genre.fit,
        fame: host?.fame ?? 0,
        freshness: title ? title.freshness : show.freshness,
        bonus: (genre.group === specialization ? SPECIALIZATION.bonus : 1) * prestige * eventAppeal(events, genre, PLAYER),
        promotedIds: [channel.id, show.id],
        cpmMultiplier: contract?.cpmMultiplier ?? 1,
        preferredAudience: contract?.preferredAudience ?? null,
        fixedFee: title?.fee ?? 0,
        reachBoost,
        revenueBoost: title ? licensedRevenue : 1,
      };
    }),
  };
}

/** A rival that holds the TV rights to today's sports event shows it live instead of its usual evening program. */
function eventCoverage(state: GameState, events: EventContext): RivalShow | null {
  if (!events.sports) return null;
  const quality = Math.min(RIVAL_QUALITY_CAP, EVENTS.rivalCoverageQuality * rivalStrength(state));
  return { name: `${events.sports.name} Live`, genre: 'tvSports', quality, hostFame: 0, hostName: '' };
}

function rivalChannels(state: GameState, events: EventContext): BroadcastingChannel[] {
  const coverage = eventCoverage(state, events);
  return state.rivals.flatMap((rival) =>
    rival.channels.map((rc) => {
      const live = coverage && events.holderId === rival.id && rc.medium === 'tv';
      const schedule = live ? rc.schedule.map((s, slot) => (slot === EVENTS.rivalSlot ? coverage : s)) : rc.schedule;
      const specialization = specializationOf(rc.schedule.map((s) => s.genre));
      return {
        id: rc.id,
        name: rc.name,
        ownerId: rival.id,
        medium: rc.medium,
        regionIds: rc.regionIds.filter((r) => ACTIVE_REGIONS.includes(r)),
        reputation: rc.reputation,
        programs: schedule.map(
          (s): Program => ({
            showId: null,
            titleId: null,
            name: s.name,
            quality: s.quality,
            fit: getGenre(s.genre).fit,
            fame: s.hostFame,
            freshness: 1,
            bonus: (getGenre(s.genre).group === specialization ? SPECIALIZATION.bonus : 1) * eventAppeal(events, getGenre(s.genre), rival.id),
            promotedIds: [],
            cpmMultiplier: 1,
            preferredAudience: null,
            fixedFee: 0,
            reachBoost: 1,
            revenueBoost: 1,
          }),
        ),
      };
    }),
  );
}

/** Computes everyone's listeners and revenue for today. Does not change the state. */
export function simulateDay(state: GameState): DayResult {
  const desked = employeesWithDesk(state);
  const titles = pickTitles(state);
  const events = eventContext(state);
  const adRate = adRateFactor(state.day);
  const channels = [...state.channels.map((c) => playerChannel(state, c, desked, titles, events)), ...rivalChannels(state, events)];

  const results: ChannelDay[] = channels.map((c) => ({
    channelId: c.id,
    name: c.name,
    ownerId: c.ownerId,
    isPlayer: c.ownerId === PLAYER,
    medium: c.medium,
    onAir: c.programs.some((p) => p !== null),
    slots: SLOTS.map((_, slot) => ({
      showId: c.programs[slot]?.showId ?? null,
      titleId: c.programs[slot]?.titleId ?? null,
      programName: c.programs[slot]?.name ?? 'Off air',
      quality: c.programs[slot]?.quality ?? 0,
      listeners: 0,
      share: 0,
      revenue: 0,
      sponsorRevenue: 0,
      fee: 0,
    })),
    regionListeners: {},
    audienceListeners: {},
  }));

  // Everyone tuned in where each channel broadcasts, per slot, for its share.
  const audienceReached = results.map(() => SLOTS.map(() => 0));

  for (const regionId of ACTIVE_REGIONS) {
    for (const medium of ['radio', 'tv'] as const) {
      SLOTS.forEach((_, slot) => {
        const competing = channels
          .map((channel, i) => ({ channel, index: i, result: results[i]!, program: channel.programs[slot] }))
          .filter(
            (x): x is typeof x & { program: Program } =>
              x.channel.medium === medium && x.channel.regionIds.includes(regionId) && x.program != null,
          );
        if (competing.length === 0) return;

        let tunedIn = 0;
        for (const audience of AUDIENCES) {
          const people = reach(regionId, medium, slot, audience.id, state.day);
          tunedIn += people;
          const audienceShares = shares(
            competing.map(({ channel, program }) =>
              appeal(
                program.quality,
                program.fit[audience.id],
                program.fame,
                program.freshness,
                channel.reputation[regionId] ?? 0,
                promotionFor(state, program.promotedIds, audience.id),
                program.bonus,
              ),
            ),
          );
          competing.forEach(({ result, program }, i) => {
            const listeners = people * audienceShares[i]! * program.reachBoost;
            const preferred = program.preferredAudience === audience.id ? SALES.preferredAudienceBonus : 1;
            const slotResult = result.slots[slot]!;
            slotResult.listeners += listeners;
            result.regionListeners[regionId] = (result.regionListeners[regionId] ?? 0) + listeners;
            result.audienceListeners[audience.id] = (result.audienceListeners[audience.id] ?? 0) + listeners;
            if (program.fixedFee === 0) {
              // Ads at the plain rate, and what a sponsor adds on top of it.
              const ads = (listeners / 1000) * CPM[medium] * adRate * audience.sponsorValue * program.revenueBoost;
              slotResult.revenue += ads * program.cpmMultiplier * preferred;
              slotResult.sponsorRevenue! += ads * (program.cpmMultiplier * preferred - 1);
            }
          });
        }
        for (const { index } of competing) audienceReached[index]![slot]! += tunedIn;
      });
    }
  }

  results.forEach((result, i) =>
    result.slots.forEach((slotResult, slot) => {
      const reached = audienceReached[i]![slot]!;
      slotResult.share = reached > 0 ? slotResult.listeners / reached : 0;
      // Teleshopping pays its fee once per airing, however many regions it reaches.
      const fee = channels[i]!.programs[slot]?.fixedFee ?? 0;
      if (fee > 0 && reached > 0) slotResult.revenue = slotResult.fee = fee;
    }),
  );

  return { day: state.day, channels: results };
}

// --- Why a slot draws what it draws ---

/** The parts of each slot's appeal on one of the player's channels, as it would air today; null for a slot off the air or in reruns. */
export function slotFactors(state: GameState, channelId: Id, desked = employeesWithDesk(state)): (SlotFactors | null)[] {
  const channel = state.channels.find((c) => c.id === channelId);
  if (!channel) return SLOTS.map(() => null);
  const events = eventContext(state);
  const ours = playerChannel(state, channel, desked, pickTitles(state), events);
  const rivals = rivalChannels(state, events).filter((rc) => rc.medium === channel.medium);
  return SLOTS.map((_, slot) => {
    const program = ours.programs[slot];
    if (!program || !program.showId) return null;
    let weight = 0;
    let tunedIn = 0;
    const sum = { fit: 0, reputation: 0, promotion: 0 };
    const rivalSums = new Map<BroadcastingChannel, number>();
    let rivalWeight = 0;
    for (const regionId of ours.regionIds) {
      for (const audience of AUDIENCES) {
        const people = reach(regionId, channel.medium, slot, audience.id, state.day);
        const w = people * audience.sponsorValue;
        tunedIn += people;
        weight += w;
        sum.fit += w * program.fit[audience.id];
        sum.reputation += w * (ours.reputation[regionId] ?? 0);
        sum.promotion += w * promotionFor(state, program.promotedIds, audience.id);
        for (const rc of rivals.filter((r) => r.regionIds.includes(regionId))) {
          const p = rc.programs[slot];
          if (!p) continue;
          rivalSums.set(rc, (rivalSums.get(rc) ?? 0) + w * appeal(p.quality, p.fit[audience.id], p.fame, p.freshness, rc.reputation[regionId] ?? 0, 0, p.bonus));
        }
        rivalWeight += w;
      }
    }
    if (weight === 0) return null;
    const fit = sum.fit / weight;
    const reputation = sum.reputation / weight;
    const promotion = sum.promotion / weight;
    const best = [...rivalSums].sort((x, y) => y[1] - x[1])[0];
    return {
      quality: program.quality,
      fit,
      freshness: program.freshness,
      reputation,
      fame: program.fame,
      promotion,
      bonus: program.bonus,
      appeal: appeal(program.quality, fit, program.fame, program.freshness, reputation, promotion, program.bonus),
      rival: best ? { channel: best[0].name, program: best[0].programs[slot]!.name, appeal: best[1] / rivalWeight } : null,
      tunedIn,
    };
  });
}

type MarketResult = { channels: readonly { ownerId: Id; medium: Medium; slots: readonly { listeners: number }[] }[] };

/** Average listeners (or viewers) per slot in one medium, summed over each owner's channels. */
export function listenersByOwner(result: MarketResult, medium: Medium): Map<Id, number> {
  const totals = new Map<Id, number>();
  for (const c of result.channels.filter((x) => x.medium === medium)) {
    const avg = c.slots.reduce((sum, s) => sum + s.listeners, 0) / Math.max(1, c.slots.length);
    totals.set(c.ownerId, (totals.get(c.ownerId) ?? 0) + avg);
  }
  return totals;
}

/** True when the player has more listeners (or viewers) in this medium than every rival. */
export function isMarketLeader(result: MarketResult, medium: Medium): boolean {
  const totals = listenersByOwner(result, medium);
  const player = totals.get(PLAYER) ?? 0;
  return player > 0 && [...totals].every(([owner, n]) => owner === PLAYER || n < player);
}
