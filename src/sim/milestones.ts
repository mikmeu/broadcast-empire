// Milestones: each is reached once, recorded in the state with the day, and
// announced. See config/milestones.ts for the list.

import { ACTIVE_REGIONS, MAX_PLAYER_CHANNELS, MILESTONES } from '../config/balance';
import { MILESTONE_LIST, getMilestone, type MilestoneId } from '../config/milestones';
import { TECHS, getTech } from '../config/tech';
import { FEATURES, UNLOCKS } from '../config/unlocks';
import type { Medium, RegionId } from '../config/world';
import { isMarketLeader } from './broadcast';
import { toCalendarDate } from './calendar';
import { runningResult } from './economy';
import { playerEvent } from './events';
import { PLAYER, addMessage, type ChannelDay, type GameState } from './state';
import { averageMorale } from './upkeep';

const formatEuro = (n: number) => `€${Math.round(n).toLocaleString('en-IE')}`;

/** The player's channels that broadcast yesterday. */
const onAir = (state: GameState, medium?: Medium): ChannelDay[] =>
  state.lastDay?.channels.filter((c) => c.isPlayer && c.onAir && (!medium || c.medium === medium)) ?? [];

const leads = (state: GameState, medium: Medium) => {
  const report = state.weeklyReports[state.weeklyReports.length - 1];
  return report !== undefined && isMarketLeader(report, medium);
};

const radioIn = (state: GameState, regionId: RegionId) =>
  (state.lastDay?.channels ?? []).filter((c) => c.medium === 'radio').map((c) => ({ channel: c, listeners: c.regionListeners[regionId] ?? 0 }));

/** True if one of the player's radio channels had the most listeners of any channel in the region yesterday. */
function hasTopChannel(state: GameState, regionId: RegionId): boolean {
  const top = radioIn(state, regionId).sort((a, b) => b.listeners - a.listeners)[0];
  return top !== undefined && top.listeners > 0 && top.channel.isPlayer;
}

/** True if the player's radio channels together had more listeners in the region than each rival's. */
function leadsRegion(state: GameState, regionId: RegionId): boolean {
  const totals = new Map<string, number>();
  for (const { channel, listeners } of radioIn(state, regionId)) totals.set(channel.ownerId, (totals.get(channel.ownerId) ?? 0) + listeners);
  const player = totals.get(PLAYER) ?? 0;
  return player > 0 && [...totals].every(([owner, n]) => owner === PLAYER || n < player);
}

const year = (state: GameState) => toCalendarDate(state.day).year;
const stillOnAir = (from: number) => (state: GameState) => year(state) >= from && onAir(state).length > 0;

const CHECKS: Record<MilestoneId, (state: GameState) => boolean> = {
  onAir: (s) => onAir(s).length > 0,
  firstMonth: (s) => {
    const first = s.milestones.find((m) => m.id === 'onAir');
    return first !== undefined && s.day - first.day >= MILESTONES.firstMonthDays;
  },
  // By the running result, like the monthly report and Penny: a month of shopping can still be one that pays its way.
  firstProfit: (s) => s.monthlyReports.some((r) => runningResult(r) > 0),
  firstSponsor: (s) => s.contracts.length > 0,
  regionNumberOne: (s) => ACTIVE_REGIONS.some((r) => hasTopChannel(s, r)),
  radioLeader: (s) => leads(s, 'radio'),
  everyRegion: (s) => ACTIVE_REGIONS.every((r) => leadsRegion(s, r)),
  twoRegions: (s) => new Set(onAir(s).flatMap((c) => s.licenses.filter((l) => l.channelId === c.channelId).map((l) => l.regionId))).size >= 2,
  nationwide: (s) => onAir(s).some((c) => ACTIVE_REGIONS.every((r) => s.licenses.some((l) => l.channelId === c.channelId && l.regionId === r))),
  bigAudience: (s) => s.listeners >= MILESTONES.listeners,
  tvLicense: (s) => s.licenses.some((l) => l.medium === 'tv'),
  firstTv: (s) => onAir(s, 'tv').length > 0,
  tvLeader: (s) => leads(s, 'tv'),
  fullNetwork: (s) => onAir(s).length >= MAX_PLAYER_CHANNELS,
  householdName: (s) => s.employees.some((e) => e.role === 'host' && e.fame >= MILESTONES.hostFame),
  headhunter: (s) => s.lastPoachDay !== null,
  // Awards bring prestige too (0.18.0): the event itself is what counts.
  firstEvent: (s) => s.channels.some((c) => c.lastEventDay !== null),
  prestigious: (s) => s.prestige >= MILESTONES.prestige,
  awardWinner: (s) => s.awards.past.some((night) => night.nominees.some((n) => n.won && n.ownerId === PLAYER)),
  happyOffice: (s) => s.employees.length >= MILESTONES.happyStaff && averageMorale(s) >= MILESTONES.happyMorale,
  aheadOfItsTime: (s) => s.techs.some((id) => getTech(id).year > year(s)),
  fullTechTree: (s) => s.techs.length >= TECHS.length,
  eventBroadcaster: (s) => playerEvent(s) !== null,
  firstDividend: (s) => s.dividendsPaid > 0,
  dividendsSmall: (s) => s.dividendsPaid >= MILESTONES.dividends[0],
  dividendsMedium: (s) => s.dividendsPaid >= MILESTONES.dividends[1],
  dividendsLarge: (s) => s.dividendsPaid >= MILESTONES.dividends[2],
  year1980: stillOnAir(1980),
  year1990: stillOnAir(1990),
  year2000: stillOnAir(2000),
  year2010: stillOnAir(2010),
  year2020: stillOnAir(2020),
  year2030: stillOnAir(2030),
};

export const hasMilestone = (state: GameState, id: MilestoneId) => state.milestones.some((m) => m.id === id);

/** What Uncle Tabby sends for a milestone in this game. */
export function milestoneReward(state: Pick<GameState, 'difficulty'>, id: MilestoneId): number {
  const scale = MILESTONES.rewardScale[state.difficulty] ?? 1;
  return Math.round((getMilestone(id).reward * scale) / 1000) * 1000;
}

/** Daily: record and announce every milestone reached for the first time, and take what Uncle Tabby sends for it. */
export function checkMilestones(draft: GameState): void {
  for (const milestone of MILESTONE_LIST) {
    if (hasMilestone(draft, milestone.id) || !CHECKS[milestone.id](draft)) continue;
    draft.milestones.push({ id: milestone.id, day: draft.day });
    const reward = milestoneReward(draft, milestone.id);
    draft.money += reward;
    draft.ledger.gifts += reward;
    const wired = reward > 0 ? ` I’ve wired you ${formatEuro(reward)}.` : '';
    addMessage(draft, 'good', `Milestone reached: ${milestone.name}.\n\n${milestone.thanks}${wired}`, 'milestone');
  }
  openFeatures(draft);
}

/** Opens what the milestones reached so far open, each with news about the window it is in. */
function openFeatures(draft: GameState): void {
  for (const feature of FEATURES) {
    const unlock = UNLOCKS[feature];
    if (draft.unlocked.includes(feature) || !unlock.milestones.some((id) => hasMilestone(draft, id))) continue;
    draft.unlocked.push(feature);
    addMessage(draft, 'good', `${unlock.name} ${unlock.plural ? 'are' : 'is'} open: ${unlock.opens}.`, undefined, unlock.window);
  }
}
