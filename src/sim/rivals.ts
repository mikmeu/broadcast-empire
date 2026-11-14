// What rivals do over time: refresh their weakest show each season and
// occasionally expand into a new region.

import { ACTIVE_REGIONS, DAYS_PER_YEAR, LOAN, POACH, RIVAL_EXPANSION_CHANCE, RIVAL_EXPANSION_FROM_YEAR, RIVAL_MIN_FREE_SLOTS, RIVAL_START_REPUTATION, RIVALRY } from '../config/balance';
import { getGenre, type GenreId } from '../config/genres';
import { PERSONALITIES, type Personality } from '../config/rivals';
import { daysInMonth, toCalendarDate } from './calendar';
import { getRegion, SLOTS, SLOT_NAMES } from '../config/world';
import { channelRegions, listenersByOwner } from './broadcast';
import { soldIn } from './deals';
import { generateRivalShow, rivalEraQuality, rivalStrength } from './generate';
import { freeLicenses, licenseTermDays, licensePrice } from './licenses';
import { hasMilestone } from './milestones';
import { canAfford, chargeRival } from './rivalMoney';
import { Rng } from './rng';
import { addHeadline, addMessage, PLAYER, type GameState, type Rival } from './state';
import { population } from './world';

/** Seasons start on the 1st of March, June, September and December. */
export const isSeasonStart = (month: number) => month % 3 === 0;

/** Each rival channel replaces its weakest show with a new one in the same genre. A slot in `copied` (`channelId:slot`) just got a copy and is left alone. */
export function refreshRivalShows(draft: GameState, rng: Rng, copied: ReadonlySet<string> = new Set()): void {
  for (const rival of draft.rivals) {
    for (const channel of rival.channels) {
      // A slot that bought one of the player's shows keeps it until the deal ends (0.20.0).
      const sold = soldIn(draft, channel.id);
      let weakest = -1;
      channel.schedule.forEach((show, i) => {
        if (copied.has(`${channel.id}:${i}`)) return;
        if (!sold.has(i) && (weakest < 0 || show.quality < channel.schedule[weakest]!.quality)) weakest = i;
      });
      if (weakest < 0) continue;
      const genre = channel.schedule[weakest]!.genre;
      const old = channel.schedule[weakest]!;
      const show = generateRivalShow(rng, rival.personality, genre, channel.schedule.map((s) => s.name), rivalStrength(draft));
      // A star host (0.23.0, #413) stays when their show is replaced.
      if (old.hostName !== '' && old.hostFame >= POACH.starFame && show.hostName !== '') {
        show.hostName = old.hostName;
        show.hostFame = old.hostFame;
      }
      channel.schedule[weakest] = show;
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

/** What a planned or running move says, for the Schedule screen and the Competition panel: "From 1 March: Radio Nova puts “Morning Mix” here". Pass `day` to tell a running spend from one that is planned. Null without a move. */
export function moveNote(rival: Rival, here = true, day?: number): string | null {
  const move = rival.move;
  if (!move) return null;
  const channel = rival.channels.find((c) => c.id === move.channelId);
  const show = channel?.schedule[move.kind === 'move' ? (move.from ?? -1) : move.slot];
  if (!channel || !show) return null;
  const where = here ? 'here' : `in ${slotWord(move.slot)}, against “${move.against.show}”`;
  if (move.kind === 'copy') return move.genre ? `From ${moveDate(move.on)}: ${channel.name} puts a new ${getGenre(move.genre).name.toLowerCase()} ${where}` : null;
  if (move.kind === 'spend') {
    const until = move.until === undefined ? '' : ` to ${moveDate(move.until)}`;
    if (day !== undefined && day >= move.on) return `Until ${moveDate(move.until ?? move.on)}: ${channel.name} spends on “${show.name}” ${where}`;
    return `From ${moveDate(move.on)}${until}: ${channel.name} spends on “${show.name}” ${where}`;
  }
  return `From ${moveDate(move.on)}: ${channel.name} puts “${show.name}” ${where}`;
}

/** What copying or spending costs a rival today: the base price in 1970 money times rivalEraQuality. */
export const answerCost = (state: Pick<GameState, 'day'>, kind: 'copy' | 'spend') =>
  (kind === 'copy' ? RIVALRY.copyCost : RIVALRY.spendCost) * rivalEraQuality(toCalendarDate(state.day).year);

export { canAfford };

/** The day of the season start after `day` (the 1st of a month): three months on. */
function nextSeasonStart(day: number): number {
  let d = day;
  for (let i = 0; i < 3; i++) d += daysInMonth(d);
  return d;
}

/** Mixed into the state of the game's chance to start the stream of the copies a rival makes, so the main stream stays as it was. */
const COPY_STREAM = 0x5eed_0412;

/**
 * On the 1st of the month before a season starts, each rival that watches you
 * (and has no move planned) picks the show of yours that draws most where you
 * meet it. A rival that only watches plans to move its best show into that slot
 * at the season start. One that fights you tries what `answers` of its
 * personality lists, in order, and takes the first that works: a copy of your
 * genre in that slot, a budget on its own show there for a season, or the move.
 * Two rivals never take one slot. Announced with a headline and a Penny e-mail.
 * No random numbers. EPB moves and spends only on the genres in `counters`.
 */
export function planRivalMoves(draft: GameState): void {
  const report = draft.weeklyReports[draft.weeklyReports.length - 1];
  if (!report) return;
  const on = draft.day + daysInMonth(draft.day);
  const claimed = new Set<string>();
  for (const rival of draft.rivals) if (rival.move) claimed.add(`${rival.move.against.channelId}:${rival.move.slot}`);
  const listeners = (channelId: string, slot: number) => report.channels.find((c) => c.channelId === channelId)?.slots[slot]?.listeners ?? 0;
  const channelHeard = (channelId: string) => report.channels.find((c) => c.channelId === channelId)?.slots.reduce((sum, s) => sum + s.listeners, 0) ?? 0;
  const planners = draft.rivals.filter((r) => !r.move && r.rivalry >= RIVALRY.watch).sort((a, b) => b.rivalry - a.rivalry || a.id.localeCompare(b.id));
  for (const rival of planners) {
    const spec = PERSONALITIES[rival.personality];
    const counters = spec.counters;
    const targets: { channelId: string; slot: number; showName: string; genre: GenreId; heard: number; channels: Rival['channels'] }[] = [];
    for (const mine of draft.channels) {
      const regions = channelRegions(draft, mine.id);
      const meets = rival.channels.filter((c) => c.medium === mine.medium && c.regionIds.some((r) => regions.includes(r)));
      if (meets.length === 0) continue;
      mine.schedule.forEach((showId, slot) => {
        const show = showId ? draft.shows.find((s) => s.id === showId) : undefined;
        if (show && !claimed.has(`${mine.id}:${slot}`)) targets.push({ channelId: mine.id, slot, showName: show.name, genre: show.genre, heard: listeners(mine.id, slot), channels: meets });
      });
    }
    const target = targets.sort((a, b) => b.heard - a.heard)[0];
    if (!target) continue;
    if (soldIn(draft, target.channelId).has(target.slot)) continue;
    // Of the rival's channels that meet you, the one with most listeners whose slot is free and that `ok` takes.
    const bestChannel = (ok: (channel: Rival['channels'][number]) => boolean) => {
      let best: Rival['channels'][number] | null = null;
      for (const channel of target.channels) {
        if (soldIn(draft, channel.id).has(target.slot) || !ok(channel)) continue;
        if (!best || channelHeard(channel.id) > channelHeard(best.id)) best = channel;
      }
      return best;
    };
    const aimed = { channelId: target.channelId, show: target.showName };
    let planned: { channel: Rival['channels'][number]; move: NonNullable<Rival['move']>; headline: string; text: (yours: string) => string } | null = null;
    for (const answer of rivalStance(rival) === 'fights' ? spec.answers : (['move'] as const)) {
      if (answer === 'copy') {
        const genre = getGenre(target.genre);
        const cost = answerCost(draft, 'copy');
        if (genre.kind !== 'produced' || genre.id === 'talentShow' || !canAfford(rival, cost)) continue;
        const channel = bestChannel(() => true);
        if (!channel) continue;
        const name = genre.name.toLowerCase();
        planned = {
          channel,
          move: { kind: 'copy', channelId: channel.id, slot: target.slot, genre: genre.id, against: aimed, on },
          headline: `${channel.name} is putting a new ${name} show in ${slotWord(target.slot)}, against “${target.showName}”.`,
          text: (yours) => `${rival.name} is putting a new ${name} show in ${slotWord(target.slot)} on ${channel.name} from ${moveDate(on)}. It is aimed at “${target.showName}” on ${yours}. You can move your show, or make it stronger before then.`,
        };
      } else if (answer === 'spend') {
        if (!canAfford(rival, answerCost(draft, 'spend'))) continue;
        const channel = bestChannel((c) => !counters || counters.includes(c.schedule[target.slot]!.genre));
        if (!channel) continue;
        const show = channel.schedule[target.slot]!;
        const until = nextSeasonStart(on);
        planned = {
          channel,
          move: { kind: 'spend', channelId: channel.id, slot: target.slot, against: aimed, on, until },
          headline: `${channel.name} is spending on “${show.name}” in ${slotWord(target.slot)}, against “${target.showName}”.`,
          text: (yours) => `${rival.name} is spending on “${show.name}” in ${slotWord(target.slot)} on ${channel.name} from ${moveDate(on)} to ${moveDate(until)}. It is aimed at “${target.showName}” on ${yours}. You can move your show, or make it stronger before then.`,
        };
      } else {
        let best: { channel: Rival['channels'][number]; from: number; heard: number } | null = null;
        for (const channel of target.channels) {
          const sold = soldIn(draft, channel.id);
          if (sold.has(target.slot)) continue;
          let from = -1;
          channel.schedule.forEach((show, i) => {
            if (sold.has(i) || (counters && !counters.includes(show.genre))) return;
            if (from < 0 || show.quality > channel.schedule[from]!.quality) from = i;
          });
          if (from < 0) continue;
          const heard = channelHeard(channel.id);
          if (!best || heard > best.heard) best = { channel, from, heard };
        }
        if (!best || best.from === target.slot) continue;
        const { channel, from } = best;
        const show = channel.schedule[from]!;
        planned = {
          channel,
          move: { kind: 'move', channelId: channel.id, slot: target.slot, from, against: aimed, on },
          headline: `${channel.name} moves “${show.name}” to ${slotWord(target.slot)}, against “${target.showName}”.`,
          text: (yours) => `${rival.name} is moving “${show.name}” on ${channel.name} to ${slotWord(target.slot)} from ${moveDate(on)}. It is aimed at “${target.showName}” on ${yours}. You can move your show, or make it stronger before then.`,
        };
      }
      if (planned) break;
    }
    if (!planned) continue;
    rival.move = planned.move;
    claimed.add(`${target.channelId}:${target.slot}`);
    const yours = draft.channels.find((c) => c.id === target.channelId)!;
    addHeadline(draft, planned.headline);
    addMessage(draft, 'warning', planned.text(yours.name), undefined, undefined, 'penny', 'rivals');
  }
}

/**
 * On the season start, before the refresh. A planned move swaps the two slots on
 * the rival's channel. A copy pays and puts a new show of your genre in the slot,
 * made from a stream of chance of its own. A spend pays and stays until its
 * `until`, when it is cleared. Dropped without news if the channel is gone, a
 * slot now holds one of your sold shows or the rival can no longer pay. It happens
 * even if you moved your show. Returns the slots a copy filled (`channelId:slot`),
 * which the refresh leaves alone that season.
 */
export function applyRivalMoves(draft: GameState, rng: Rng): Set<string> {
  const copied = new Set<string>();
  let side: Rng | null = null;
  for (const rival of draft.rivals) {
    const move = rival.move;
    if (!move) continue;
    if (move.kind === 'spend' && move.until !== undefined && draft.day >= move.until) {
      rival.move = null;
      continue;
    }
    if (move.kind === 'spend' && draft.day !== move.on) continue;
    if (move.kind !== 'spend') rival.move = null;
    const channel = rival.channels.find((c) => c.id === move.channelId);
    const sold = channel ? soldIn(draft, channel.id) : new Set<number>();
    if (move.kind === 'move') {
      if (!channel || move.from === undefined || sold.has(move.slot) || sold.has(move.from)) continue;
      const a = channel.schedule[move.from];
      const b = channel.schedule[move.slot];
      if (!a || !b) continue;
      channel.schedule[move.from] = b;
      channel.schedule[move.slot] = a;
      continue;
    }
    const cost = answerCost(draft, move.kind);
    if (!channel || sold.has(move.slot) || !canAfford(rival, cost)) {
      rival.move = null;
      continue;
    }
    rival.money -= cost;
    if (move.kind === 'copy' && move.genre) {
      side ??= new Rng((rng.state ^ COPY_STREAM) >>> 0);
      channel.schedule[move.slot] = generateRivalShow(side, rival.personality, move.genre, channel.schedule.map((s) => s.name), rivalStrength(draft));
      copied.add(`${channel.id}:${move.slot}`);
    }
  }
  return copied;
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
    // It pays the list price for each channel it extends (#414), and waits if that would leave it short.
    const extending = radio.filter((c) => !c.regionIds.includes(target));
    const total = extending.length * licensePrice('radio', target, draft);
    if (!canAfford(rival, total)) continue;
    chargeRival(rival, total);
    for (const channel of extending) {
      channel.regionIds.push(target);
      channel.licenseExpiry[target] = draft.day + licenseTermDays();
      channel.reputation[target] = RIVAL_START_REPUTATION;
      addMessage(draft, 'warning', `${channel.name} starts broadcasting in ${getRegion(target).name}.`, undefined, undefined, undefined, 'rivals');
    }
  }
}
