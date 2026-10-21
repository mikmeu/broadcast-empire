// Radio and TV awards (0.18.0): every five years the country picks its best
// radio and TV show and its best radio and TV host, from the player's shows
// and the rivals'. The numbers are in AWARDS in config/balance.ts.

import { AWARDS, OWN_EVENT_LIMITS } from '../config/balance';
import { getGenre, hasHost } from '../config/genres';
import type { Medium } from '../config/world';
import { channelRegions, showQuality } from './broadcast';
import { toCalendarDate, toDay } from './calendar';
import { isLicensed } from './content';
import { salaryFor } from './economy';
import { employeesWithDesk } from './office';
import type { Rng } from './rng';
import { addHeadline, addMessage, newId, PLAYER, type AwardCategory, type GameState, type Id, type Nominee } from './state';

const formatEuro = (n: number) => `€${Math.round(n).toLocaleString('en-IE')}`;

/** In the order they are given out on the night. */
export const AWARD_CATEGORIES: readonly AwardCategory[] = ['radioShow', 'radioHost', 'tvShow', 'tvHost'];

export const AWARD_NAMES: Record<AwardCategory, string> = {
  radioShow: 'Best radio show',
  radioHost: 'Best radio host',
  tvShow: 'Best TV show',
  tvHost: 'Best TV host',
};

const categoryOf = (medium: Medium, host: boolean): AwardCategory => (medium === 'radio' ? (host ? 'radioHost' : 'radioShow') : host ? 'tvHost' : 'tvShow');

/** Whether the country holds an awards night in a year. */
export const isAwardsYear = (year: number) => year >= AWARDS.firstYear && (year - AWARDS.firstYear) % AWARDS.everyYears === 0;

/** The year of the next awards night after a day (on the day of a night, it has been held). */
export function nextAwardsYear(day: number): number {
  for (let y = Math.max(toCalendarDate(day).year, AWARDS.firstYear); ; y++) if (isAwardsYear(y) && toDay(y, AWARDS.nightMonth, 1) > day) return y;
}

/** A show the jury looks at: the station's own production, with its host if it has one. */
interface Entry {
  medium: Medium;
  channelId: Id;
  channelName: string;
  ownerId: Id;
  showName: string;
  showId: Id | null;
  hostName: string | null;
  hostId: Id | null;
  fame: number;
  quality: number;
}

/** A show's average audience over the weekly reports, in its best slot each week, on the channel it airs on. Weeks it was not on count as none. */
function audienceOf(state: GameState, channelId: Id, showName: string): number {
  if (state.weeklyReports.length === 0) return 0;
  const total = state.weeklyReports.reduce((sum, report) => {
    const slots = report.channels.find((c) => c.channelId === channelId)?.slots ?? [];
    return sum + Math.max(0, ...slots.filter((s) => s.programName === showName).map((s) => s.listeners));
  }, 0);
  return total / state.weeklyReports.length;
}

/** Every show on the air that a station makes itself, the player's and the rivals'. Licensed titles and reruns are not in the running. */
function entries(state: GameState): Entry[] {
  const desked = employeesWithDesk(state);
  const list: Entry[] = [];
  for (const channel of state.channels) {
    for (const showId of new Set(channel.schedule)) {
      const show = state.shows.find((s) => s.id === showId);
      if (!show || isLicensed(show.genre)) continue;
      const host = hasHost(getGenre(show.genre)) ? state.employees.find((e) => e.id === show.hostId) : undefined;
      const quality = Math.min(1, showQuality(state, show, desked).quality);
      list.push({ medium: channel.medium, channelId: channel.id, channelName: channel.name, ownerId: PLAYER, showName: show.name, showId: show.id, hostName: host?.name ?? null, hostId: host?.id ?? null, fame: host?.fame ?? 0, quality });
    }
  }
  for (const rival of state.rivals) {
    for (const channel of rival.channels) {
      for (const show of channel.schedule) {
        if (isLicensed(show.genre)) continue;
        const hosted = hasHost(getGenre(show.genre)) && show.hostName !== '';
        list.push({ medium: channel.medium, channelId: channel.id, channelName: channel.name, ownerId: rival.id, showName: show.name, showId: null, hostName: hosted ? show.hostName : null, hostId: null, fame: hosted ? show.hostFame : 0, quality: show.quality });
      }
    }
  }
  return list;
}

/** Who is up for each award this year, by audience, quality and fame: the best `AWARDS.nominees` of each, those with an audience at all. */
export function chooseNominees(state: GameState): Nominee[] {
  const scored = entries(state).map((e) => ({ ...e, show: audienceOf(state, e.channelId, e.showName) * (AWARDS.qualityBase + e.quality) }));
  const nominees: Nominee[] = [];
  const nominee = (e: (typeof scored)[number], host: boolean, score: number): Nominee => ({
    category: categoryOf(e.medium, host),
    channelId: e.channelId,
    channelName: e.channelName,
    ownerId: e.ownerId,
    showName: e.showName,
    showId: e.showId,
    hostName: host ? e.hostName : null,
    hostId: host ? e.hostId : null,
    score,
  });
  for (const medium of ['radio', 'tv'] as const) {
    const ofMedium = scored.filter((e) => e.medium === medium && e.show > 0);
    const shows = ofMedium.map((e) => nominee(e, false, e.show));
    // A host is judged by their best show.
    const best = new Map<string, Nominee>();
    for (const e of ofMedium.filter((x) => x.hostName !== null)) {
      const n = nominee(e, true, e.show * (AWARDS.fameBase + e.fame / 100));
      const key = e.hostId ?? `${e.channelId}|${e.hostName}`;
      if (!best.has(key) || best.get(key)!.score < n.score) best.set(key, n);
    }
    for (const list of [shows, [...best.values()]]) nominees.push(...[...list].sort((a, b) => b.score - a.score).slice(0, AWARDS.nominees));
  }
  return nominees;
}

const isPlayers = (n: Nominee) => n.ownerId === PLAYER;
const label = (n: Nominee) => (n.hostName !== null ? n.hostName : `“${n.showName}”`);

/** A host of a rival's gains fame: on the show they present. */
function rivalFame(draft: GameState, n: Nominee, fame: number): void {
  const channel = draft.rivals.flatMap((r) => r.channels).find((c) => c.id === n.channelId);
  const show = channel?.schedule.find((s) => s.name === n.showName && s.hostName === n.hostName);
  if (show) show.hostFame = Math.min(100, show.hostFame + fame);
}

/** The nominations are out: prestige and fame for the player's nominees, fame for the rivals' hosts. */
function announceNominations(draft: GameState, year: number): void {
  const nominees = chooseNominees(draft);
  draft.awards.nominations = nominees;
  addHeadline(draft, `The nominations for the ${year} radio and TV awards are out.`);
  for (const n of nominees.filter((x) => x.hostName !== null)) {
    if (!isPlayers(n)) rivalFame(draft, n, AWARDS.fame.nomination);
    const host = n.hostId ? draft.employees.find((e) => e.id === n.hostId) : undefined;
    if (host) host.fame = Math.min(100, host.fame + AWARDS.fame.nomination);
  }
  const ours = nominees.filter(isPlayers);
  if (ours.length === 0) return;
  const prestige = ours.length * AWARDS.prestige.nomination;
  draft.prestige += prestige;
  const what = ours.map((n) => `${label(n)} for ${AWARD_NAMES[n.category].toLowerCase()}`);
  addMessage(
    draft,
    'good',
    `You have ${ours.length} nomination${ours.length === 1 ? '' : 's'} for the ${year} radio and TV awards: ${what.join(', ')}. That is ${prestige} prestige already; the winners are named on 1 November.`,
    undefined,
    'milestones',
  );
}

/** The night: a winner in every category, with what a win brings. */
function holdNight(draft: GameState, rng: Rng, year: number): void {
  const nominees = draft.awards.nominations ?? [];
  draft.awards.nominations = null;
  if (nominees.length === 0) return;
  const won: Nominee[] = [];
  for (const category of AWARD_CATEGORIES) {
    const up = nominees.filter((n) => n.category === category);
    if (up.length === 0) continue;
    // The jury's taste: the best usually wins, not always.
    const rolled = up.map((n) => n.score * (1 + (rng.next() * 2 - 1) * AWARDS.luck));
    const winner = up[rolled.indexOf(Math.max(...rolled))]!;
    winner.won = true;
    won.push(winner);
    addHeadline(draft, `${AWARD_NAMES[category]} of ${year}: ${label(winner)}${winner.hostName !== null ? ` of “${winner.showName}”` : ''}, on ${winner.channelName}.`);
  }
  draft.awards.past.push({ year, nominees });

  for (const n of won.filter((x) => !isPlayers(x) && x.hostName !== null)) rivalFame(draft, n, AWARDS.fame.win);
  const ours = won.filter(isPlayers);
  if (ours.length === 0) {
    addMessage(draft, 'info', `The ${year} radio and TV awards went to your rivals this time. The Milestones window has who won.`, 'event', 'milestones');
    return;
  }
  const prestige = ours.length * AWARDS.prestige.win;
  draft.prestige += prestige;
  for (const n of ours) win(draft, n);
  const what = ours.map((n) => `${AWARD_NAMES[n.category].toLowerCase()} for ${label(n)}`);
  addMessage(draft, 'good', `You won ${what.join(' and ')} at the ${year} radio and TV awards: ${prestige} prestige, and the channel’s reputation is up.`, 'event', 'milestones');
}

/** What one of the player's wins brings: reputation for the channel, morale for who made it, and for a host fame, and then a request for more pay. */
function win(draft: GameState, n: Nominee): void {
  const channel = draft.channels.find((c) => c.id === n.channelId);
  if (channel) {
    for (const regionId of channelRegions(draft, channel.id)) {
      channel.reputation[regionId] = Math.min(OWN_EVENT_LIMITS.maxReputation, (channel.reputation[regionId] ?? 0) + AWARDS.reputation);
    }
  }
  const show = draft.shows.find((s) => s.id === n.showId);
  const makers = n.hostId ? [n.hostId] : show ? [show.hostId, ...show.staffIds, ...show.writerIds, ...show.editorIds] : [];
  for (const e of draft.employees.filter((x) => makers.includes(x.id))) e.morale = Math.min(100, e.morale + AWARDS.morale);

  const host = n.hostId ? draft.employees.find((e) => e.id === n.hostId) : undefined;
  if (!host) return;
  host.fame = Math.min(100, host.fame + AWARDS.fame.win);
  const salary = salaryFor('host', host.skill, host.fame, draft);
  if (salary <= host.salary || host.leaving) return;
  draft.awards.raises = draft.awards.raises.filter((r) => r.hostId !== host.id);
  draft.awards.raises.push({ id: newId(draft, 'ar'), hostId: host.id, salary, expiresOn: draft.day + AWARDS.answerDays });
  addMessage(
    draft,
    'warning',
    `${host.name} has an award now, and asks for ${formatEuro(salary)} a month (now ${formatEuro(host.salary)}). Answer on the Staff screen within ${AWARDS.answerDays} days, or their morale drops.`,
    undefined,
    'staff',
  );
}

/** On the 1st of the month: the nominations on 1 October of an awards year, and the night on 1 November. */
export function runAwards(draft: GameState, rng: Rng): void {
  const { year, month } = toCalendarDate(draft.day);
  if (!isAwardsYear(year)) return;
  if (month === AWARDS.nominationMonth) announceNominations(draft, year);
  else if (month === AWARDS.nightMonth) holdNight(draft, rng, year);
}

/** A winner's raise turned down: their morale drops. */
export function refuseRaise(draft: GameState, requestId: Id): void {
  const request = draft.awards.raises.find((r) => r.id === requestId);
  if (!request) return;
  draft.awards.raises = draft.awards.raises.filter((r) => r !== request);
  const host = draft.employees.find((e) => e.id === request.hostId);
  if (!host) return;
  host.morale = Math.max(0, host.morale - AWARDS.refusedMorale);
  addMessage(draft, 'warning', `${host.name} stays on ${formatEuro(host.salary)} a month, and is not happy about it: their morale is down.`);
}

/** Daily: a winner's raise left unanswered counts as turned down. */
export function resolveRaises(draft: GameState): void {
  for (const request of draft.awards.raises.filter((r) => r.expiresOn <= draft.day)) refuseRaise(draft, request.id);
}
