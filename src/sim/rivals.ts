// What rivals do over time: refresh their weakest show each season and
// occasionally expand into a new region.

import { ACTIVE_REGIONS, DAYS_PER_YEAR, LOAN, RIVAL_EXPANSION_CHANCE, RIVAL_EXPANSION_FROM_YEAR, RIVAL_MIN_FREE_SLOTS, RIVAL_START_REPUTATION, RIVALRY } from '../config/balance';
import type { Personality } from '../config/rivals';
import { toCalendarDate } from './calendar';
import { getRegion } from '../config/world';
import { listenersByOwner } from './broadcast';
import { soldIn } from './deals';
import { generateRivalShow, rivalEraQuality, rivalStrength } from './generate';
import { freeLicenses, licenseTermDays, licensePrice } from './licenses';
import { hasMilestone } from './milestones';
import type { Rng } from './rng';
import { addMessage, PLAYER, type GameState, type Rival } from './state';
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

/**
 * Once a month rivalry moves toward its target, but only after the year of the
 * difficulty and once you have led a market. Your share is read from the last
 * weekly report, in the medium where you meet the rival. No random numbers.
 */
export function updateRivalry(draft: GameState): void {
  if (toCalendarDate(draft.day).year < RIVALRY.fromYear[draft.difficulty]) return;
  if (!hasMilestone(draft, 'radioLeader') && !hasMilestone(draft, 'tvLeader')) return;
  const report = draft.weeklyReports[draft.weeklyReports.length - 1];
  if (!report) return;
  const totals = (['radio', 'tv'] as const).map((medium) => listenersByOwner(report, medium));
  for (const rival of draft.rivals) {
    let share = 0;
    for (const owners of totals) {
      const mine = owners.get(PLAYER) ?? 0;
      const theirs = owners.get(rival.id) ?? 0;
      if (mine > 0 && theirs > 0) share = Math.max(share, mine / (mine + theirs));
    }
    const target = rivalryTarget(share);
    rival.rivalry += (target - rival.rivalry) * (target > rival.rivalry ? RIVALRY.rise : RIVALRY.fall);
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
