// The sweep (0.23.0, #441): what `npm run simulate -- --sweep` keeps of a game, a year at a time, and how it
// sums a folder of games up. Pure functions; the scripts do the playing and the files.

import { levelOf } from '../config/levels';
import type { Medium } from '../config/world';
import { listenersByOwner } from './broadcast';
import { dividendReserve } from './economy';
import { PLAYER, type GameState, type Ledger, type MonthlyReport, type SalesJob } from './state';

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
