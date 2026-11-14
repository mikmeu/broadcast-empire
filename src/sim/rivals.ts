// What rivals do over time: refresh their weakest show each season and
// occasionally expand into a new region.

import { ACTIVE_REGIONS, DAYS_PER_YEAR, LOAN, RIVAL_EXPANSION_CHANCE, RIVAL_EXPANSION_FROM_YEAR, RIVAL_MIN_FREE_SLOTS, RIVAL_START_REPUTATION, RIVALRY } from '../config/balance';
import { PERSONALITIES, type Personality } from '../config/rivals';
import { daysInMonth, toCalendarDate } from './calendar';
import { getRegion, SLOTS, SLOT_NAMES } from '../config/world';
import { channelRegions, listenersByOwner } from './broadcast';
import { soldIn } from './deals';
import { generateRivalShow, rivalEraQuality, rivalStrength } from './generate';
import { freeLicenses, licenseTermDays, licensePrice } from './licenses';
import { hasMilestone } from './milestones';
import type { Rng } from './rng';
import { addHeadline, addMessage, PLAYER, type GameState, type Rival } from './state';
import { population } from './world';

/** Seasons start on the 1st of March, June, September and December. */
export const isSeasonStart = (month: number) => month % 3 === 0;

/** Each rival channel replaces its weakest show with a new one in the same genre. */
export function refreshRivalShows(draft: GameState, rng: Rng): void {
  for (const rival of draft.rivals) {
    for (const channel of rival.channels) {
      // A slot that bought one of the player's shows keeps it until the deal ends (0.20.0).
      const sold = soldIn(draft, channel.id);
      let weakest = -1;
      channel.schedule.forEach((show, i) => {
        if (!sold.has(i) && (weakest < 0 || show.quality < channel.schedule[weakest]!.quality)) weakest = i;
      });
      if (weakest < 0) continue;
      const genre = channel.schedule[weakest]!.genre;
      channel.schedule[weakest] = generateRivalShow(rng, rival.personality, genre, channel.schedule.map((s) => s.name), rivalStrength(draft));
    }
  }
}

/** A rival's money stops growing here. */
export const rivalCeiling = (personality: Personality) => RIVALRY.startMoney[personality] * RIVALRY.ceilingTimesStart;

/** What a rival earns today, from the ad money its channels made (EPB gets its public grant instead). */
export function rivalIncome(state: Pick<GameState, 'day'>, rival: Rival, adRevenue: number): number {
  if (rival.personality === 'highbrow') return RIVALRY.grantPerDay * rivalEraQuality(toCalendarDate(state.day).year);
  return adRevenue * RIVALRY.keptShare;
}

/** Adds a day's income to a rival's money, up to its ceiling (money already above it stays), and never below 0. */
export function payRival(state: Pick<GameState, 'day'>, rival: Rival, adRevenue: number): void {
  const ceiling = rivalCeiling(rival.personality);
  rival.money = Math.max(0, Math.max(rival.money, Math.min(ceiling, rival.money + rivalIncome(state, rival, adRevenue))));
}

/** How closely a rival should watch you: nothing below watchShare of the listeners, `fight` at fightShare, 1 at most. */
export function rivalryTarget(share: number): number {
  return share < RIVALRY.watchShare ? 0 : Math.min(1, (RIVALRY.fight * share) / RIVALRY.fightShare);
}

export type RivalStance = 'ignores' | 'watches' | 'fights';
export type RivalPurse = 'short' | 'comfortable' | 'flush';

/** How a rival regards you, from its rivalry. */
export function rivalStance(rival: Pick<Rival, 'rivalry'>): RivalStance {
  return rival.rivalry >= RIVALRY.fight ? 'fights' : rival.rivalry >= RIVALRY.watch ? 'watches' : 'ignores';
}

/** A rival's money in three words, against its start money. */
export function rivalPurse(rival: Pick<Rival, 'money' | 'personality'>): RivalPurse {
  const times = rival.money / RIVALRY.startMoney[rival.personality];
  return times < RIVALRY.shortBelow ? 'short' : times >= RIVALRY.flushFrom ? 'flush' : 'comfortable';
}

/** Why rivalry is still held back, or null when it is not: the year of the difficulty, then leading a market. */
export function rivalryWaits(state: GameState): string | null {
  const year = RIVALRY.fromYear[state.difficulty];
  if (toCalendarDate(state.day).year < year) return `until ${year}`;
  if (!hasMilestone(state, 'radioLeader') && !hasMilestone(state, 'tvLeader')) return 'until you lead a market';
  return null;
}

/** Your share of the listeners where you meet this rival (yours / yours + its), in the medium where it is highest, from the last weekly report. 0 if you do not meet. */
export function shareAgainst(state: GameState, rival: Pick<Rival, 'id'>): number {
  const report = state.weeklyReports[state.weeklyReports.length - 1];
  if (!report) return 0;
  let share = 0;
  for (const medium of ['radio', 'tv'] as const) {
    const owners = listenersByOwner(report, medium);
    const mine = owners.get(PLAYER) ?? 0;
    const theirs = owners.get(rival.id) ?? 0;
    if (mine > 0 && theirs > 0) share = Math.max(share, mine / (mine + theirs));
  }
  return share;
}

/**
 * Once a month rivalry moves toward its target, but only after the year of the
 * difficulty and once you have led a market. Your share is read from the last
 * weekly report, in the medium where you meet the rival. No random numbers.
 * Penny e-mails when a rival starts to watch you, and when it starts to fight you.
 */
export function updateRivalry(draft: GameState): void {
  if (rivalryWaits(draft) !== null) return;
  if (!draft.weeklyReports[draft.weeklyReports.length - 1]) return;
  for (const rival of draft.rivals) {
    const before = rivalStance(rival);
    const share = shareAgainst(draft, rival);
    const target = rivalryTarget(share);
    rival.rivalry += (target - rival.rivalry) * (target > rival.rivalry ? RIVALRY.rise : RIVALRY.fall);
    const after = rivalStance(rival);
    if (after === before || before === 'fights' || (before === 'watches' && after === 'ignores')) continue;
    const percent = `${Math.round(share * 100)}%`;
    const text =
      after === 'fights'
        ? `${rival.name} now sees you as the one to beat. You hold ${percent} of the listeners where you meet it, and it will answer what you do.`
        : `${rival.name} has noticed you. You hold ${percent} of the listeners where you meet it, and from here on it watches what you do.`;
    addMessage(draft, 'warning', text, undefined, undefined, 'penny', 'rivals');
  }
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The slot's name in the sentence: "the evening". */
const slotWord = (slot: number) => `the ${SLOT_NAMES[SLOTS[slot]!].toLowerCase()}`;

/** "1 March": the day a move begins, for the news and the Schedule screen. */
export function moveDate(day: number): string {
  const { month, dayOfMonth } = toCalendarDate(day);
  return `${dayOfMonth} ${MONTH_NAMES[month - 1]}`;
}

/** What a rival's planned move says, for the Schedule screen and the Competition panel: "From 1 March: Radio Nova puts “Morning Mix” here". Null without a move. */
export function moveNote(rival: Rival, here = true): string | null {
  const move = rival.move;
  if (!move || move.kind !== 'move' || move.from === undefined) return null;
  const channel = rival.channels.find((c) => c.id === move.channelId);
  const show = channel?.schedule[move.from];
  if (!channel || !show) return null;
  const where = here ? 'here' : `in ${slotWord(move.slot)}, against “${move.against.show}”`;
  return `From ${moveDate(move.on)}: ${channel.name} puts “${show.name}” ${where}`;
}

/**
 * On the 1st of the month before a season starts, each rival that watches you
 * (and has no move planned) picks the show of yours that draws most where you
 * meet it, and plans to move its best show into that slot at the season start.
 * Two rivals never take one slot. Announced with a headline and a Penny e-mail.
 * No random numbers. EPB moves only the genres in `counters`.
 */
export function planRivalMoves(draft: GameState): void {
  const report = draft.weeklyReports[draft.weeklyReports.length - 1];
  if (!report) return;
  const on = draft.day + daysInMonth(draft.day);
  const claimed = new Set<string>();
  for (const rival of draft.rivals) if (rival.move) claimed.add(`${rival.move.against.channelId}:${rival.move.slot}`);
  const listeners = (channelId: string, slot: number) => report.channels.find((c) => c.channelId === channelId)?.slots[slot]?.listeners ?? 0;
  const planners = draft.rivals.filter((r) => !r.move && r.rivalry >= RIVALRY.watch).sort((a, b) => b.rivalry - a.rivalry || a.id.localeCompare(b.id));
  for (const rival of planners) {
    const counters = PERSONALITIES[rival.personality].counters;
    const targets: { channelId: string; slot: number; showName: string; heard: number; channels: Rival['channels'] }[] = [];
    for (const mine of draft.channels) {
      const regions = channelRegions(draft, mine.id);
      const meets = rival.channels.filter((c) => c.medium === mine.medium && c.regionIds.some((r) => regions.includes(r)));
      if (meets.length === 0) continue;
      mine.schedule.forEach((showId, slot) => {
        const show = showId ? draft.shows.find((s) => s.id === showId) : undefined;
        if (show && !claimed.has(`${mine.id}:${slot}`)) targets.push({ channelId: mine.id, slot, showName: show.name, heard: listeners(mine.id, slot), channels: meets });
      });
    }
    const target = targets.sort((a, b) => b.heard - a.heard)[0];
    if (!target) continue;
    if (soldIn(draft, target.channelId).has(target.slot)) continue;
    let best: { channel: Rival['channels'][number]; from: number; quality: number; heard: number } | null = null;
    for (const channel of target.channels) {
      const sold = soldIn(draft, channel.id);
      if (sold.has(target.slot)) continue;
      let from = -1;
      channel.schedule.forEach((show, i) => {
        if (sold.has(i) || (counters && !counters.includes(show.genre))) return;
        if (from < 0 || show.quality > channel.schedule[from]!.quality) from = i;
      });
      if (from < 0) continue;
      const heard = report.channels.find((c) => c.channelId === channel.id)?.slots.reduce((sum, s) => sum + s.listeners, 0) ?? 0;
      if (!best || heard > best.heard) best = { channel, from, quality: channel.schedule[from]!.quality, heard };
    }
    if (!best || best.from === target.slot) continue;
    const { channel, from } = best;
    const show = channel.schedule[from]!;
    rival.move = { kind: 'move', channelId: channel.id, slot: target.slot, from, against: { channelId: target.channelId, show: target.showName }, on };
    claimed.add(`${target.channelId}:${target.slot}`);
    const yours = draft.channels.find((c) => c.id === target.channelId)!;
    addHeadline(draft, `${channel.name} moves “${show.name}” to ${slotWord(target.slot)}, against “${target.showName}”.`);
    addMessage(
      draft,
      'warning',
      `${rival.name} is moving “${show.name}” on ${channel.name} to ${slotWord(target.slot)} from ${moveDate(on)}. It is aimed at “${target.showName}” on ${yours.name}. You can move your show, or make it stronger before then.`,
      undefined,
      undefined,
      'penny',
      'rivals',
    );
  }
}

/**
 * On the season start, before the refresh: each planned move swaps the two
 * slots on the rival's channel. Dropped without news if the channel is gone or a
 * slot now holds one of your sold shows. It happens even if you moved your show.
 */
export function applyRivalMoves(draft: GameState): void {
  for (const rival of draft.rivals) {
    const move = rival.move;
    if (!move || move.kind !== 'move') continue;
    rival.move = null;
    const channel = rival.channels.find((c) => c.id === move.channelId);
    if (!channel || move.from === undefined) continue;
    const sold = soldIn(draft, channel.id);
    if (sold.has(move.slot) || sold.has(move.from)) continue;
    const a = channel.schedule[move.from];
    const b = channel.schedule[move.slot];
    if (!a || !b) continue;
    channel.schedule[move.from] = b;
    channel.schedule[move.slot] = a;
  }
}

/** What a rival is worth: its money, its licenses at today's prices and LOAN.revenueMonths of the revenue of its last week, as `companyValue` counts the player's. EPB gets a value too, though it is not for sale. */
export function rivalValue(state: GameState, rival: Rival): number {
  const licenses = rival.channels.reduce((sum, c) => sum + c.regionIds.reduce((s, r) => s + licensePrice(c.medium, r, state), 0), 0);
  const report = state.weeklyReports[state.weeklyReports.length - 1];
  const ids = new Set(rival.channels.map((c) => c.id));
  const revenue = report ? report.channels.filter((c) => ids.has(c.channelId)).reduce((sum, c) => sum + c.revenue, 0) : 0;
  const monthly = report ? (revenue / Math.max(1, report.days)) * (DAYS_PER_YEAR / 12) : 0;
  return Math.max(0, rival.money) + licenses + LOAN.revenueMonths * monthly;
}

/** The hosts on its schedules, each once. Licensed programs have no host and are left out. */
export function rivalHosts(_state: GameState, rival: Rival): { name: string; fame: number }[] {
  const hosts = new Map<string, number>();
  for (const show of rival.channels.flatMap((c) => c.schedule)) {
    if (show.hostName) hosts.set(show.hostName, Math.max(hosts.get(show.hostName) ?? 0, show.hostFame));
  }
  return [...hosts].map(([name, fame]) => ({ name, fame }));
}

/**
 * Now and then a rival's radio stations start broadcasting in its most populous
 * missing region, but only where enough licenses are free that the player is
 * never locked out. Rivals get new TV regions only through auctions.
 */
export function expandRivals(draft: GameState, rng: Rng): void {
  if (toCalendarDate(draft.day).year < RIVAL_EXPANSION_FROM_YEAR) return;
  for (const rival of draft.rivals) {
    if (rng.next() >= RIVAL_EXPANSION_CHANCE) continue;
    const radio = rival.channels.filter((c) => c.medium === 'radio');
    // A rival takes one license per channel when it expands.
    const target = ACTIVE_REGIONS.filter(
      (r) =>
        radio.some((c) => !c.regionIds.includes(r)) &&
        freeLicenses(draft, 'radio', r) >= RIVAL_MIN_FREE_SLOTS + radio.length - 1,
    ).sort((a, b) => population(b, draft.day) - population(a, draft.day))[0];
    if (!target) continue;
    for (const channel of radio.filter((c) => !c.regionIds.includes(target))) {
      channel.regionIds.push(target);
      channel.licenseExpiry[target] = draft.day + licenseTermDays();
      channel.reputation[target] = RIVAL_START_REPUTATION;
      addMessage(draft, 'warning', `${channel.name} starts broadcasting in ${getRegion(target).name}.`, undefined, undefined, undefined, 'rivals');
    }
  }
}
