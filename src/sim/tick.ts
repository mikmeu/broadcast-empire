import {
  FAME_DECAY_RATE,
  FLOOR_UNLOCK_VALUE,
  FAME_GROWTH_RATE,
  FAME_HALF_LISTENERS,
  FRESHNESS_DECAY,
  FRESHNESS_MIN,
  MAX_HEADLINES,
  MAX_MESSAGES,
  MAX_WEEKLY_REPORTS,
  POST,
  REPUTATION_RATE,
} from '../config/balance';
import { closeAuctions, issueLicenses, openRenewals } from './auctions';
import { resolveRaises, runAwards } from './awards';
import { engineeredShows, isMarketLeader, simulateDay } from './broadcast';
import { isFirstOfMonth, isStartOfWeek, toCalendarDate } from './calendar';
import { refreshMarket, updateLibrary } from './content';
import { companyValue, dividendDue, payDailyCosts, payEpisodes, payRoyalties, payTitles, settleMonth } from './economy';
import { reportLosses, type Loss, snapshotSlots, titleSupply, warnAboutTitles, watchOffAir } from './insight';
import { watchCrews } from './staffing';
import { runEvents } from './events';
import { fileLawsuits, hearLawsuits } from './legal';
import { generateCandidates } from './generate';
import { runCampaigns } from './marketing';
import { checkMilestones } from './milestones';
import { buildingOf, employeesWithDesk, type Desks } from './office';
import { runMeetings, runUnrest } from './morale';
import { resolvePoachOffers, rivalPoachAttempt } from './poaching';
import { findReplacements, recruitedCandidates } from './recruiting';
import { expandRivals, isSeasonStart, refreshRivalShows } from './rivals';
import { Rng } from './rng';
import { refreshOffers, showListeners, trackContracts, workOnRelations } from './sales';
import { departmentPower, finishTraining, gainExperience } from './staff';
import { researchable, techMultiplier } from './tech';
import { openRivalServices, runStreaming } from './streaming';
import { postCoverage, runFans, runUpkeep } from './upkeep';
import { isUnlocked } from './unlocks';
import type { TechId } from '../config/tech';
import { COUNTRY } from '../config/world';
import { MEDIUM_NAMES } from './licenses';
import { addMessage, type DayResult, type GameState, type Id, type SlotResult, type WeeklyReport } from './state';

/**
 * Advances the game by one day. Pure and deterministic: the same input state
 * always produces the same output state, and the input is never mutated.
 */
export function tick(state: GameState): GameState {
  if (state.bankrupt) return state;
  const draft = structuredClone(state);
  const rng = new Rng(draft.rngState);
  const inReach = new Set(researchable(state).map((tech) => tech.id));
  const desked = employeesWithDesk(draft);
  runMeetings(draft, desked);

  const result = simulateDay(draft);
  applyBroadcast(draft, result, desked);
  payEpisodes(draft, result);
  payRoyalties(draft, result);
  trackContracts(draft, result);
  workOnRelations(draft, desked);
  const aired = showListeners(result);
  const hostsOnAir = new Set(draft.shows.filter((s) => (aired.get(s.id) ?? 0) > 0 && s.hostId).map((s) => s.hostId!));
  gainExperience(draft, rng, desked, hostsOnAir);
  finishTraining(draft, rng);
  runCampaigns(draft, desked);
  draft.researchPoints += departmentPower(draft, 'researcher', desked);
  runUpkeep(draft, rng, desked);
  runFans(draft, rng, desked);
  runUnrest(draft);
  const titlesAired = new Set(result.channels.flatMap((c) => c.slots.map((s) => s.titleId)).filter((id): id is Id => id !== null));
  payTitles(draft, titlesAired);
  runStreaming(draft);
  const supply = titleSupply(draft);
  updateLibrary(draft, titlesAired);
  warnAboutTitles(draft, supply);
  watchOffAir(draft, desked);
  watchCrews(draft, desked);
  // Penny's December hint reads the cash before the last day's bills; settleMonth needs to know if it held.
  const dueBeforeBills = dividendDue(draft);
  payDailyCosts(draft);

  draft.day += 1;
  draft.offers = draft.offers.filter((o) => o.expiresOn >= draft.day);
  closeAuctions(draft, rng);
  openRenewals(draft);
  runEvents(draft, rng);
  hearLawsuits(draft, desked);
  resolvePoachOffers(draft);
  resolveRaises(draft);
  findReplacements(draft, desked);
  if (isStartOfWeek(draft.day)) {
    const losses = reportLosses(draft);
    if (draft.week.length > 0) fileWeeklyReport(draft, losses);
    else sendWeeklyRatings(draft, [], losses);
    draft.weekAgo = snapshotSlots(draft);
    if (draft.streaming) draft.streaming.weekAgo = draft.streaming.subscribers;
    refreshOffers(draft, rng, desked);
  }
  if (isFirstOfMonth(draft.day)) {
    settleMonth(draft, dueBeforeBills);
    const { year, month } = toCalendarDate(draft.day);
    // Whoever a recruiter found in the place of a leaving host stays in the pool (0.17.0).
    const found = draft.candidates.filter((c) => c.foundFor);
    draft.candidates = [...found, ...generateCandidates(draft, rng, year, false, recruitedCandidates(draft, desked))];
    fileLawsuits(draft);
    expandRivals(draft, rng);
    issueLicenses(draft);
    refreshMarket(draft, rng);
    if (isSeasonStart(month)) refreshRivalShows(draft, rng);
    rivalPoachAttempt(draft, rng);
    runAwards(draft, rng);
    unlockFloors(draft);
    openRivalServices(draft);
  }

  checkMilestones(draft);
  announceResearch(draft, inReach);

  draft.rngState = rng.state;
  draft.messages = draft.messages.slice(-MAX_MESSAGES);
  draft.headlines = draft.headlines.slice(-MAX_HEADLINES);
  return draft;
}

/** Advances the game by `days` days. */
export function advance(state: GameState, days: number): GameState {
  let next = state;
  for (let i = 0; i < days; i++) next = tick(next);
  return next;
}

/** News for the Research window: a technology came within reach today, in points or in time. */
function announceResearch(draft: GameState, before: ReadonlySet<TechId>): void {
  if (!isUnlocked(draft, 'research')) return;
  const fresh = researchable(draft).filter((tech) => !before.has(tech.id));
  if (fresh.length === 0) return;
  const more = fresh.length > 1 ? ` and ${fresh.length - 1} more` : '';
  addMessage(draft, 'info', `Your researchers have the points for ${fresh[0]!.name}${more}. It is yours to research.`, undefined, 'research');
}

/** A new office floor opens up once the company is worth enough. */
function unlockFloors(draft: GameState): void {
  const nextFloor = draft.floorsUnlocked + 1;
  const needed = FLOOR_UNLOCK_VALUE[nextFloor];
  if (needed === undefined || nextFloor > buildingOf(draft).floors || companyValue(draft) < needed) return;
  draft.floorsUnlocked = nextFloor;
  addMessage(draft, 'good', `Your company is growing: floor ${nextFloor} is now open to build on.`);
}

function applyBroadcast(draft: GameState, result: DayResult, desked: Desks): void {
  const byId = new Map(result.channels.map((c) => [c.channelId, c]));

  // Money
  const slots = result.channels.filter((c) => c.isPlayer).flatMap((c) => c.slots);
  const revenue = slots.reduce((sum, slot) => sum + slot.revenue, 0);
  draft.money += revenue;
  draft.ledger.revenue += revenue;
  draft.ledger.sponsorRevenue += slots.reduce((sum, slot) => sum + (slot.sponsorRevenue ?? 0), 0);
  draft.ledger.fees += slots.reduce((sum, slot) => sum + (slot.fee ?? 0), 0);

  // Reputation drifts toward the average quality of what a channel airs.
  for (const channel of draft.channels) {
    const day = byId.get(channel.id);
    if (!day) continue;
    const manager = draft.employees.find((e) => e.id === channel.managerId);
    const rate = REPUTATION_RATE * (1 + (manager?.skill ?? 0) / 200);
    const target = day.slots.reduce((sum, s) => sum + s.quality, 0) / day.slots.length;
    for (const license of draft.licenses.filter((l) => l.channelId === channel.id)) {
      const rep = channel.reputation[license.regionId] ?? 0;
      channel.reputation[license.regionId] = rep + (target - rep) * rate;
    }
  }
  for (const rc of draft.rivals.flatMap((r) => r.channels)) {
    const day = byId.get(rc.id);
    if (!day) continue;
    const target = day.slots.reduce((sum, s) => sum + s.quality, 0) / day.slots.length;
    for (const regionId of rc.regionIds) {
      const rep = rc.reputation[regionId] ?? 0;
      rc.reputation[regionId] = rep + (target - rep) * REPUTATION_RATE;
    }
  }

  // Shows that aired get a little staler; a radio show an audio engineer looks after, more slowly (0.15.0).
  const aired = new Map<string, number>();
  for (const slot of result.channels.filter((c) => c.isPlayer).flatMap((c) => c.slots)) {
    if (slot.showId) aired.set(slot.showId, Math.max(aired.get(slot.showId) ?? 0, slot.listeners));
  }
  const engineered = engineeredShows(draft, desked);
  for (const show of draft.shows) {
    if (aired.has(show.id)) show.freshness = Math.max(FRESHNESS_MIN, show.freshness - FRESHNESS_DECAY * (1 - (engineered.get(show.id)?.slower ?? 0)));
  }

  // Hosts become famous from big audiences and are slowly forgotten off air. Fan mail that reaches them speeds it up (0.15.0).
  const fanMail = postCoverage(draft, desked) > 0 ? POST.fameGrowth : 1;
  for (const host of draft.employees.filter((e) => e.role === 'host')) {
    const best = Math.max(0, ...draft.shows.filter((s) => s.hostId === host.id).map((s) => aired.get(s.id) ?? 0));
    if (best > 0) {
      const target = (100 * best) / (best + FAME_HALF_LISTENERS);
      host.fame += (target - host.fame) * Math.min(1, FAME_GROWTH_RATE * techMultiplier(draft, 'fameGrowth') * fanMail);
    } else {
      host.fame -= host.fame * FAME_DECAY_RATE;
    }
  }

  // Top bar KPIs
  const audience = (medium: 'radio' | 'tv') =>
    result.channels
      .filter((c) => c.isPlayer && c.medium === medium)
      .reduce((sum, c) => sum + c.slots.reduce((s, slot) => s + slot.listeners, 0) / c.slots.length, 0);
  draft.listeners = audience('radio');
  draft.viewers = audience('tv');
  const reps = draft.channels.flatMap((c) => Object.values(c.reputation));
  draft.reputation = reps.length > 0 ? (100 * reps.reduce((a, b) => a + b, 0)) / reps.length : 0;

  draft.lastDay = result;
  draft.week.push(result);
}

/** Averages daily totals (summed over a day's slots) into listeners per slot over the week; missing days count as zero. */
function perSlot<K extends string>(days: (Partial<Record<K, number>> | undefined)[], slots: number): Partial<Record<K, number>> {
  const totals: Partial<Record<K, number>> = {};
  for (const day of days) for (const key of Object.keys(day ?? {}) as K[]) totals[key] = (totals[key] ?? 0) + (day![key] ?? 0);
  for (const key of Object.keys(totals) as K[]) totals[key] = totals[key]! / (days.length * slots);
  return totals;
}

function fileWeeklyReport(draft: GameState, losses: Loss[]): void {
  const days = draft.week;
  const latest = days[days.length - 1]!;
  const report: WeeklyReport = {
    fromDay: days[0]!.day,
    days: days.length,
    channels: latest.channels.map((channel) => {
      // Days before the channel existed count as zero listeners.
      const history = days.map((d) => d.channels.find((c) => c.channelId === channel.channelId));
      return {
        channelId: channel.channelId,
        name: channel.name,
        ownerId: channel.ownerId,
        isPlayer: channel.isPlayer,
        medium: channel.medium,
        slots: channel.slots.map((slot, si) => {
          const avg = (pick: (s: SlotResult) => number) =>
            history.reduce((sum, c) => sum + (c?.slots[si] ? pick(c.slots[si]) : 0), 0) / days.length;
          return { programName: slot.programName, listeners: avg((s) => s.listeners), share: avg((s) => s.share) };
        }),
        regionListeners: perSlot(history.map((c) => c?.regionListeners), channel.slots.length),
        audienceListeners: perSlot(history.map((c) => c?.audienceListeners), channel.slots.length),
        revenue: history.reduce((sum, c) => sum + (c?.slots.reduce((s, x) => s + x.revenue, 0) ?? 0), 0),
      };
    }),
  };
  const previous = draft.weeklyReports[draft.weeklyReports.length - 1];
  for (const medium of ['radio', 'tv'] as const) {
    const leads = isMarketLeader(report, medium);
    if (!previous || leads === isMarketLeader(previous, medium)) continue;
    const name = MEDIUM_NAMES[medium];
    addMessage(
      draft,
      leads ? 'good' : 'warning',
      leads ? `You are now the biggest ${name} company in ${COUNTRY}!` : `You’ve lost the lead in the ${name} market.`,
      undefined,
      undefined,
      'channel',
    );
  }
  draft.weeklyReports = [...draft.weeklyReports, report].slice(-MAX_WEEKLY_REPORTS);
  draft.week = [];

  const average = (channels: WeeklyReport['channels']) => Math.round(channels.reduce((sum, c) => sum + c.slots.reduce((s, x) => s + x.listeners, 0) / c.slots.length, 0));
  const mine = report.channels.filter((c) => c.isPlayer);
  sendWeeklyRatings(draft, mine.map((c) => ({ name: c.name, medium: c.medium, average: average([c]) })), losses);
}

/**
 * The one e-mail of the week about the shows: the averages first, a line for
 * each channel, and a paragraph for each show that lost listeners. With losses
 * it is a warning with the Channels window behind it; without, plain news.
 */
function sendWeeklyRatings(draft: GameState, channels: { name: string; medium: 'radio' | 'tv'; average: number }[], losses: Loss[]): void {
  const total = (medium: 'radio' | 'tv') => {
    const of = channels.filter((c) => c.medium === medium);
    return of.length === 0 ? null : of.reduce((sum, c) => sum + c.average, 0).toLocaleString('en-IE');
  };
  const radio = total('radio');
  const tv = total('tv');
  const parts = [radio && `${radio} listeners`, tv && `${tv} viewers`].filter(Boolean);
  if (parts.length === 0 && losses.length === 0) return;
  const paragraphs = [parts.length > 0 ? `Weekly ratings are in: ${parts.join(' and ')} on average.` : 'Weekly ratings are in.'];
  if (channels.length > 1) paragraphs.push(channels.map((c) => `${c.name}: ${c.average.toLocaleString('en-IE')} ${c.medium === 'tv' ? 'viewers' : 'listeners'}`).join('\n'));
  paragraphs.push(...losses.map((l) => l.text));
  const text = paragraphs.join('\n\n');
  if (losses.length > 0) addMessage(draft, 'warning', text, undefined, 'broadcast:channels', 'channel');
  else addMessage(draft, 'info', text, undefined, undefined, 'channel');
}
