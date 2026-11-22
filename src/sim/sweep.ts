// The sweep (0.23.0, #441): what `npm run simulate -- --sweep` keeps of a game, a year at a time, and how it
// sums a folder of games up. Pure functions; the scripts do the playing and the files.

import { levelOf } from '../config/levels';
import type { Medium } from '../config/world';
import { DAYS_PER_YEAR } from '../config/balance';
import { channelRegions, listenersByOwner, simulateDay } from './broadcast';
import { dividendReserve } from './economy';
import { averageReputation } from './adMinutes';
import { playerLicenseMonthly } from './licenses';
import { averageMorale } from './upkeep';
import { PLAYER, type DayResult, type GameState, type Ledger, type MonthlyReport, type SalesJob } from './state';

/** Every ledger line, in the order of the Ledger interface. */
export const LEDGER_LINES = [
  'revenue', 'sponsorRevenue', 'fees', 'subscriptions', 'merchandise', 'merchStock', 'votes', 'showSales', 'studioLets',
  'salaries', 'rent', 'licenseFees', 'purchases', 'severance', 'revamps', 'marketing', 'content', 'titles', 'production',
  'royalties', 'sponsorPenalties', 'loanPayments', 'loanProceeds', 'events', 'renewals', 'training', 'legal', 'fines',
  'streaming', 'newsVans', 'helicopter', 'dividends', 'gifts',
] as const satisfies readonly (keyof Ledger)[];

export interface MarketShare {
  player: number;
  rival: number;
  rivalName: string;
}

/** Player's and the biggest rival's average audience per slot in one medium, from the latest weekly report. */
export function market(state: GameState, medium: Medium): MarketShare {
  const report = state.weeklyReports[state.weeklyReports.length - 1];
  if (!report) return { player: 0, rival: 0, rivalName: '-' };
  const totals = listenersByOwner(report, medium);
  const [rivalId, rival] = [...totals].filter(([id]) => id !== PLAYER).sort((a, b) => b[1] - a[1])[0] ?? ['-', 0];
  return { player: totals.get(PLAYER) ?? 0, rival, rivalName: state.rivals.find((r) => r.id === rivalId)?.name ?? '-' };
}

export interface YearRecord {
  year: number;
  /** How many monthly reports the year holds: 12, or fewer in a part year. */
  months: number;
  /** Every ledger line summed over the year. */
  ledger: Record<(typeof LEDGER_LINES)[number], number>;
  net: number;
  /** Net less Uncle Tabby's gifts: what the business earned. */
  profit: number;
  /** Profit with what was spent on own events added back. */
  profitBeforeEvents: number;
  cash: number;
  dividendReserve: number;
  dividendsPaid: number;
  /** Staff by role; the salespeople are split by their job (sales:deals, sales:till ...). */
  staff: Record<string, number>;
  channels: Partial<Record<Medium, number>>;
  licenses: Partial<Record<Medium, number>>;
  level: number;
  xp: number;
  prestige: number;
  radio: MarketShare;
  tv: MarketShare;
  /** The average morale of the staff at the year's end (#455). Older sweep files have no such field. */
  morale?: number;
  /** The average skill of the company's hosts at the year's end, 0 with none (#455). Older sweep files have no such field. */
  hostSkill?: number;
  /** The average reputation of the player's channels at the year's end, 0 to 100, 0 with none (#458). Older sweep files have no such field. */
  reputation?: number;
  /** Each of the player's channels on its own (#436); only when the script kept them. Older sweep files have no such field. */
  channelFigures?: ChannelFigures[];
}

// --- Each channel's own figures (#436) ---

/**
 * What one of the player's channels earned and cost in a year, apart from the other channels. Wages count only the people who work for
 * this channel (its manager, hosts, producers and writers; someone on shows of two channels is split by show). Support staff, rooms and
 * the master control room are not counted: `--without secondStation` covers them.
 */
export interface ChannelFigures {
  name: string;
  medium: Medium;
  /** Slot revenue: ads, sponsors and fees. */
  revenue: number;
  /** The share of the ad minutes that advertisers did not buy, 0 to 1. */
  unsold: number;
  wages: number;
  licenseFees: number;
  /** What was paid for the licences bought in the year. */
  licensePurchases: number;
  /** The revenue the player's other channels lose because this one is on the air. */
  taken: number;
}

interface ChannelTally extends Omit<ChannelFigures, 'unsold'> {
  minutesRun: number;
  minutesUnsold: number;
}

/** A year's tally of the channels, kept by name; the script adds a day at a time and takes the figures at the year's end. */
export type ChannelTallies = Map<string, ChannelTally>;

const DAYS_PER_MONTH = DAYS_PER_YEAR / 12;

/** The monthly wages of the people who work for one channel, a person on shows of several channels split by show. */
export function channelWages(state: GameState, channelId: string): number {
  const onAir = (c: GameState['channels'][number]) => [...new Set(c.schedule.filter((id): id is string => id !== null))];
  const jobs = new Map<string, number>();
  const add = (map: Map<string, number>, id: string | null | undefined) => id && map.set(id, (map.get(id) ?? 0) + 1);
  const forShow = (showId: string, add2: (id: string) => void) => {
    const show = state.shows.find((x) => x.id === showId);
    if (!show) return;
    for (const id of [show.hostId, ...show.staffIds, ...show.writerIds, ...(show.editorIds ?? [])]) if (id) add2(id);
  };
  for (const c of state.channels) {
    if (c.managerId) add(jobs, c.managerId);
    for (const showId of onAir(c)) forShow(showId, (id) => add(jobs, id));
  }
  const mine = new Map<string, number>();
  const channel = state.channels.find((c) => c.id === channelId);
  if (!channel) return 0;
  add(mine, channel.managerId);
  for (const showId of onAir(channel)) forShow(showId, (id) => add(mine, id));
  let wages = 0;
  for (const [id, n] of mine) wages += ((state.employees.find((e) => e.id === id)?.salary ?? 0) * n) / (jobs.get(id) ?? n);
  return wages;
}

const playerRevenue = (day: DayResult, channelId: string) => day.channels.filter((c) => c.channelId === channelId).reduce((sum, c) => sum + c.slots.reduce((x, s) => x + s.revenue, 0), 0);

/**
 * Per channel, the revenue the player's other channels lose because it is on the air, on this one day: the day is played as it is and with the
 * channel's programmes taken off. `simulateDay` does not change the state, so the game is not touched.
 */
export function takenFromOthers(state: GameState): Record<string, number> {
  const others = (day: DayResult, channelId: string) => state.channels.filter((c) => c.id !== channelId).reduce((sum, c) => sum + playerRevenue(day, c.id), 0);
  const with_ = simulateDay(state);
  const taken: Record<string, number> = {};
  for (const channel of state.channels) {
    const off = simulateDay({ ...state, channels: state.channels.map((c) => (c.id === channel.id ? { ...c, schedule: c.schedule.map(() => null) } : c)) });
    taken[channel.id] = others(off, channel.id) - others(with_, channel.id);
  }
  return taken;
}

const emptyTally = (name: string, medium: Medium): ChannelTally => ({ name, medium, revenue: 0, wages: 0, licenseFees: 0, licensePurchases: 0, taken: 0, minutesRun: 0, minutesUnsold: 0 });

/** Adds one day to the tally: slot revenue, unsold minutes and the day's share of wages and licence fees. `state` is the state the day was played from. */
export function tallyChannelDay(tallies: ChannelTallies, state: GameState, day: DayResult) {
  for (const channel of state.channels) {
    const t = tallies.get(channel.name) ?? emptyTally(channel.name, channel.medium);
    tallies.set(channel.name, t);
    const result = day.channels.find((c) => c.channelId === channel.id);
    for (const slot of result?.slots ?? []) {
      t.revenue += slot.revenue;
      if (slot.listeners > 0) {
        t.minutesRun += channel.adMinutes;
        t.minutesUnsold += slot.unsold ?? 0;
      }
    }
    t.wages += channelWages(state, channel.id) / DAYS_PER_MONTH;
    t.licenseFees += state.licenses.filter((l) => l.channelId === channel.id).reduce((sum, l) => sum + playerLicenseMonthly(state, l.medium, l.regionId), 0) / DAYS_PER_MONTH;
  }
}

/** Adds a month's sample of what each channel takes from the others (`takenFromOthers`, one day) to the tally. */
export function tallyTaken(tallies: ChannelTallies, state: GameState) {
  const taken = takenFromOthers(state);
  for (const channel of state.channels) {
    const t = tallies.get(channel.name) ?? emptyTally(channel.name, channel.medium);
    tallies.set(channel.name, t);
    t.taken += (taken[channel.id] ?? 0) * DAYS_PER_MONTH;
  }
}

/** Adds what the licences bought since `before` cost to the channels that hold them. */
export function tallyPurchase(tallies: ChannelTallies, before: GameState, after: GameState) {
  const held = new Set(before.licenses.map((l) => l.id));
  for (const l of after.licenses.filter((x) => !held.has(x.id))) {
    const channel = after.channels.find((c) => c.id === l.channelId);
    if (!channel) continue;
    const t = tallies.get(channel.name) ?? emptyTally(channel.name, channel.medium);
    tallies.set(channel.name, t);
    t.licensePurchases += l.price;
  }
}

/** The figures of the year, rounded to whole euros; the tally starts again. */
export function takeChannelFigures(tallies: ChannelTallies): ChannelFigures[] {
  const figures = [...tallies.values()].map(({ minutesRun, minutesUnsold, ...t }) => ({
    ...t,
    revenue: Math.round(t.revenue),
    wages: Math.round(t.wages),
    licenseFees: Math.round(t.licenseFees),
    licensePurchases: Math.round(t.licensePurchases),
    taken: Math.round(t.taken),
    unsold: minutesRun > 0 ? Math.round((1000 * minutesUnsold) / minutesRun) / 1000 : 0,
  }));
  tallies.clear();
  return figures;
}

/** What a channel left the company in a year: its revenue less its wages and licences and what it took from the others. */
export const channelResult = (f: ChannelFigures) => f.revenue - f.wages - f.licenseFees - f.licensePurchases - f.taken;

/**
 * The channels on their own, over the full games of a folder (those without a feature left out): for each bot and channel name, the median
 * over the games of the whole-game sums, in millions of euros, and in how many games it left the company a positive result.
 */
export function channelSummary(games: GameRecord[]): string {
  const groups = new Map<string, ChannelFigures[]>();
  for (const game of games) {
    if (game.setup.without || !game.years.some((y) => y.channelFigures)) continue;
    const sums = new Map<string, ChannelFigures>();
    const unsold = new Map<string, number[]>();
    for (const y of game.years) {
      for (const f of y.channelFigures ?? []) {
        const s = sums.get(f.name) ?? { ...f, revenue: 0, wages: 0, licenseFees: 0, licensePurchases: 0, taken: 0, unsold: 0 };
        s.revenue += f.revenue;
        s.wages += f.wages;
        s.licenseFees += f.licenseFees;
        s.licensePurchases += f.licensePurchases;
        s.taken += f.taken;
        sums.set(f.name, s);
        unsold.set(f.name, [...(unsold.get(f.name) ?? []), f.unsold]);
      }
    }
    for (const [name, s] of sums) {
      s.unsold = median(unsold.get(name)!);
      const key = `${game.setup.bot}|${name}`;
      groups.set(key, [...(groups.get(key) ?? []), s]);
    }
  }
  if (groups.size === 0) return '';
  const m = (list: ChannelFigures[], pick: (f: ChannelFigures) => number) => (median(list.map(pick)) / 1e6).toFixed(1);
  const lines = ['| bot | channel | games | revenue | taken from others | wages | licences | unsold | result | games in profit |', '|---|---|---|---|---|---|---|---|---|---|'];
  for (const [key, list] of [...groups].sort()) {
    const [bot, name] = key.split('|');
    const unsoldMedian = (median(list.map((f) => f.unsold)) * 100).toFixed(0);
    lines.push(
      `| ${bot} | ${name} | ${list.length} | ${m(list, (f) => f.revenue)} | ${m(list, (f) => f.taken)} | ${m(list, (f) => f.wages)} | ${m(list, (f) => f.licenseFees + f.licensePurchases)} | ${unsoldMedian}% | ${m(list, channelResult)} | ${list.filter((f) => channelResult(f) > 0).length} |`,
    );
  }
  return `Each channel on its own, whole-game medians in millions of euros (wages only of the people who work for the channel; support staff, rooms and renewals are not counted):\n\n${lines.join('\n')}`;
}

const sumLedger = (reports: MonthlyReport[]): YearRecord['ledger'] => {
  const ledger = Object.fromEntries(LEDGER_LINES.map((line) => [line, 0])) as YearRecord['ledger'];
  for (const r of reports) for (const line of LEDGER_LINES) ledger[line] += r[line] ?? 0;
  return ledger;
};

const countBy = <T>(items: T[], key: (item: T) => string): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
  return counts;
};

/** The year the latest monthly reports belong to: the figures of those months, and the state as it stands now. */
export function yearRecord(state: GameState): YearRecord | null {
  const last = state.monthlyReports[state.monthlyReports.length - 1];
  if (!last) return null;
  const reports = state.monthlyReports.filter((r) => r.year === last.year).slice(-12);
  const ledger = sumLedger(reports);
  const net = reports.reduce((sum, r) => sum + r.net, 0);
  const hosts = state.employees.filter((e) => e.role === 'host');
  // The money borrowed is not income, but the repayment is booked as a cost: count it back in, so a loan shows only its interest (#452).
  const profit = net - ledger.gifts + ledger.loanProceeds;
  return {
    year: last.year,
    months: reports.length,
    ledger,
    net,
    profit,
    profitBeforeEvents: profit + ledger.events,
    cash: state.money,
    dividendReserve: dividendReserve(state),
    dividendsPaid: state.dividendsPaid,
    staff: countBy(state.employees, (e) => (e.role === 'sales' ? `sales:${(e.salesJob ?? 'deals') satisfies SalesJob}` : e.role)),
    channels: countBy(state.channels, (c) => c.medium),
    licenses: countBy(state.licenses, (l) => l.medium),
    level: levelOf(state.xp),
    xp: state.xp,
    prestige: state.prestige,
    radio: market(state, 'radio'),
    tv: market(state, 'tv'),
    morale: Math.round(averageMorale(state)),
    hostSkill: hosts.length > 0 ? Math.round(hosts.reduce((sum, e) => sum + e.skill, 0) / hosts.length) : 0,
    reputation: state.channels.length > 0 ? Math.round((state.channels.reduce((sum, c) => sum + averageReputation(c.reputation, channelRegions(state, c.id)), 0) / state.channels.length) * 100) : 0,
  };
}

export interface GameRecord {
  setup: { bot: string; difficulty: string; region: string; seed: number; years: number; /** The feature the bot left out (#442); a record without it is a full game. */ without?: string };
  commit: string;
  runSeconds: number;
  years: YearRecord[];
  /** The day and month ('YYYY-MM') the company went bankrupt, or null. */
  bankrupt: { day: number; month: string } | null;
  /** The month Uncle Tabby saved the company, or null. */
  bailedOut: string | null;
}

// --- The summary ---

export interface Row {
  bot: string;
  difficulty: string;
  region: string;
  /** The feature the games left out (#442), or null for full games. */
  without: string | null;
  games: number;
  bankrupt: number;
  profit: Spread;
  beforeEvents: Spread;
  dividends: number;
  cash: number;
  /** Median profit less the baseline's, over the games both have; null without a baseline or a match. A row that left a feature out is compared with the full games of its own folder (#442). */
  change: number | null;
  /** True when the change is smaller than the spread between the seeds. */
  withinNoise: boolean;
}

interface Spread {
  median: number;
  low: number;
  high: number;
}

export const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

const spread = (values: number[]): Spread => ({ median: median(values), low: Math.min(...values), high: Math.max(...values) });
const total = (game: GameRecord, pick: (y: YearRecord) => number) => game.years.reduce((sum, y) => sum + pick(y), 0);
const profitOf = (game: GameRecord) => total(game, (y) => y.profit);
const gameKey = (g: GameRecord) => `${g.setup.bot}/${g.setup.difficulty}/${g.setup.region}/${g.setup.without ?? ''}/${g.setup.seed}`;
const setupKey = (g: GameRecord) => `${g.setup.bot}/${g.setup.difficulty}/${g.setup.region}/${g.setup.without ?? ''}`;
/** The same game with nothing left out. */
const fullKey = (g: GameRecord) => gameKey({ ...g, setup: { ...g.setup, without: undefined } });

/**
 * One row per bot, difficulty, region and feature left out. With a baseline: the change in median profit, over the games both sweeps played.
 * A row that left a feature out is compared with the full games of the same folder, seed by seed (#442).
 */
export function summarise(games: GameRecord[], baseline: GameRecord[] = []): Row[] {
  const groups = new Map<string, GameRecord[]>();
  for (const g of games) groups.set(setupKey(g), [...(groups.get(setupKey(g)) ?? []), g]);
  const before = new Map(baseline.map((g) => [gameKey(g), g]));
  const full = new Map(games.filter((g) => !g.setup.without).map((g) => [gameKey(g), g]));
  const rows: Row[] = [];
  for (const group of groups.values()) {
    const first = group[0]!;
    const profits = group.map(profitOf);
    const profit = spread(profits);
    const left = first.setup.without ?? null;
    const reference = left ? full : before;
    const refKey = left ? fullKey : gameKey;
    const pairs = group.filter((g) => reference.has(refKey(g)));
    const change = (left || baseline.length > 0) && pairs.length > 0 ? median(pairs.map(profitOf)) - median(pairs.map((g) => profitOf(reference.get(refKey(g))!))) : null;
    rows.push({
      bot: first.setup.bot,
      difficulty: first.setup.difficulty,
      region: first.setup.region,
      without: left,
      games: group.length,
      bankrupt: group.filter((g) => g.bankrupt).length,
      profit,
      beforeEvents: spread(group.map((g) => total(g, (y) => y.profitBeforeEvents))),
      dividends: median(group.map((g) => g.years[g.years.length - 1]?.dividendsPaid ?? 0)),
      cash: median(group.map((g) => g.years[g.years.length - 1]?.cash ?? 0)),
      change,
      withinNoise: change !== null && Math.abs(change) < profit.high - profit.low,
    });
  }
  return rows.sort((a, b) => a.bot.localeCompare(b.bot) || a.difficulty.localeCompare(b.difficulty) || a.region.localeCompare(b.region) || (a.without ?? '').localeCompare(b.without ?? ''));
}

const m = (n: number) => `${(n / 1e6).toFixed(1)}`;

/** The summary as a Markdown table, in millions of euros. */
export function summaryTable(rows: Row[], withBaseline: boolean): string {
  const showChange = withBaseline || rows.some((r) => r.without);
  const head = ['bot', 'difficulty', 'region', 'left out', 'games', 'bankrupt', 'profit median (low–high)', 'before events', 'dividends', 'final cash'];
  if (showChange) head.push(rows.some((r) => r.without) ? 'vs baseline or full game' : 'vs baseline');
  const lines = [`Millions of euros; profit is the sum of the monthly results without Uncle Tabby's gifts.`, '', `| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`];
  for (const r of rows) {
    const cells = [r.bot, r.difficulty, r.region, r.without ?? '–', `${r.games}`, `${r.bankrupt}`, `${m(r.profit.median)} (${m(r.profit.low)}–${m(r.profit.high)})`, `${m(r.beforeEvents.median)}`, m(r.dividends), m(r.cash)];
    if (showChange) cells.push(r.change === null ? (withBaseline || r.without ? 'no match' : '–') : `${r.change >= 0 ? '+' : ''}${m(r.change)}${r.withinNoise ? ' (within seed noise)' : ''}`);
    lines.push(`| ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}
