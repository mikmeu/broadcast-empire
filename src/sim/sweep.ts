// The sweep (0.23.0, #441): what `npm run simulate -- --sweep` keeps of a game, a year at a time, and how it
// sums a folder of games up. Pure functions; the scripts do the playing and the files.

import { levelOf } from '../config/levels';
import type { Medium } from '../config/world';
import { DAYS_PER_YEAR } from '../config/balance';
import { toCalendarDate } from './calendar';
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

// --- What the bot bought, and when (#475) ---

/** One new purchase: something bought once that the company did not already have. */
export interface Purchase {
  kind: 'licence' | 'channel' | 'van' | 'helicopter' | 'room' | 'floor' | 'streaming' | 'takeover' | 'transmitter';
  /** What it was, as the payback table finds it: 'radio channel 2', 'news van', 'helicopter', a room type, 'floor 3', 'takeover 1', 'transmitter 1'. */
  what: string;
  year: number;
  month: number;
  price: number;
}

/** The rooms that count as a purchase of their own when the company first has one. */
const PURCHASED_ROOMS = ['weatherStudio', 'callCentre', 'securityRoom', 'musicSchedulingOffice', 'canteen', 'giftShop'];

/**
 * What the bot bought in its move, from the state before to the state after: a licence in a medium and region not held before (a renewal is
 * not one), a channel (with its first licence's price), a news van, the helicopter, the first room of a kind in `PURCHASED_ROOMS`, the first
 * room on a higher floor and the streaming service (free to open). Rooms cost what the day's purchases rose by, less the other things bought.
 */
export function purchasesMade(before: GameState, after: GameState): Purchase[] {
  const date = toCalendarDate(after.day);
  const made: Purchase[] = [];
  const add = (kind: Purchase['kind'], what: string, price: number) => made.push({ kind, what, year: date.year, month: date.month, price });
  // A rival bought outright (#477) is one purchase, at its price: the licences and channels it brought are not counted again.
  const boughtBefore = before.boughtRivals ?? [];
  const wholeNow = (after.boughtRivals ?? []).filter((b) => !boughtBefore.some((x) => x.id === b.id));
  const fromWhole = (l: GameState['licenses'][number]) => l.takenOver !== undefined && wholeNow.some((b) => b.id === l.takenOver!.from);
  wholeNow.forEach((b, i) => add('takeover', `whole takeover ${boughtBefore.length + i + 1}`, b.price));
  const newChannels = after.channels.filter((c) => !before.channels.some((b) => b.id === c.id));
  for (const c of newChannels.filter((x) => !after.licenses.some((l) => l.channelId === x.id && fromWhole(l)))) {
    const n = before.channels.filter((x) => x.medium === c.medium).length + newChannels.filter((x) => x.medium === c.medium).indexOf(c) + 1;
    add('channel', `${c.medium} channel ${n}`, after.licenses.filter((l) => l.channelId === c.id).reduce((sum, l) => sum + l.price, 0));
  }
  const held = new Set(before.licenses.map((l) => `${l.medium}/${l.regionId}`));
  for (const l of after.licenses) {
    if (before.licenses.some((b) => b.id === l.id) || fromWhole(l)) continue;
    // A licence bought from a rival (#476) is a takeover, at what was paid, and counts whether or not another channel of the company held the region.
    if (l.takenOver) {
      add('takeover', `takeover ${before.licenses.filter((b) => b.takenOver).length + made.filter((p) => p.kind === 'takeover').length + 1}`, l.takenOver.paid);
      held.add(`${l.medium}/${l.regionId}`);
      continue;
    }
    if (held.has(`${l.medium}/${l.regionId}`) || newChannels.some((c) => c.id === l.channelId)) continue;
    held.add(`${l.medium}/${l.regionId}`);
    add('licence', `${l.medium} licence in ${l.regionId}`, l.price);
  }
  // A step of a transmitter (#478) is a purchase at the rise in what was paid on that licence; a licence taken over with its rival has none yet.
  const stepsBefore = before.licenses.reduce((n, l) => n + (l.transmitter?.tier ?? 0), 0);
  for (const l of after.licenses) {
    const was = before.licenses.find((b) => b.id === l.id)?.transmitter;
    if (l.transmitter && l.transmitter.paid > (was?.paid ?? 0)) {
      add('transmitter', `transmitter ${stepsBefore + made.filter((p) => p.kind === 'transmitter').length + 1}`, l.transmitter.paid - (was?.paid ?? 0));
    }
  }
  for (const v of after.vans.filter((x) => !before.vans.some((b) => b.id === x.id))) add('van', 'news van', v.price);
  if (after.helicopter && !before.helicopter) add('helicopter', 'helicopter', after.helicopter.price);
  if (after.streaming && !before.streaming) add('streaming', 'streaming', 0);
  const rooms: Purchase[] = [];
  const topFloor = Math.max(...before.rooms.map((r) => r.floor), 0);
  for (const r of after.rooms.filter((x) => !before.rooms.some((b) => b.roomId === x.roomId))) {
    const first = !before.rooms.some((b) => b.type === r.type) && !rooms.some((p) => p.what === r.type);
    if (r.type && PURCHASED_ROOMS.includes(r.type) && first) rooms.push({ kind: 'room', what: r.type, year: date.year, month: date.month, price: 0 });
    if (r.floor > topFloor && !rooms.some((p) => p.what === `floor ${r.floor}`)) rooms.push({ kind: 'floor', what: `floor ${r.floor}`, year: date.year, month: date.month, price: 0 });
  }
  if (rooms.length > 0) {
    const others = made.reduce((sum, p) => sum + p.price, 0);
    const each = Math.max(0, after.ledger.purchases - before.ledger.purchases - others) / rooms.length;
    for (const p of rooms) made.push({ ...p, price: Math.round(each) });
  }
  return made;
}

export interface GameRecord {
  setup: { bot: string; difficulty: string; region: string; seed: number; years: number; /** The feature the bot left out (#442); a record without it is a full game. */ without?: string };
  commit: string;
  runSeconds: number;
  years: YearRecord[];
  /** What the bot bought, in the order it bought it (#475). Older sweep files have no such field. */
  purchases?: Purchase[];
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

// --- Late money and payback (#475) ---

/** The targets of #433: a purchase after this year, cash under this many years of running costs after 1990, and a payback in this many years. */
export const LAST_PURCHASE_TARGET = 2000;
export const CASH_TARGET_YEARS = 2;
export const PAYBACK_TARGET = { low: 5, high: 8 };

/** The recurring ledger lines: what it costs to keep the company going for a year. One-off purchases, events, loans, dividends and gifts are left out. */
const RUNNING_COSTS = ['salaries', 'rent', 'licenseFees', 'marketing', 'content', 'titles', 'production', 'royalties', 'renewals', 'training', 'legal', 'streaming', 'revamps'] as const;
export const runningCosts = (y: YearRecord): number => RUNNING_COSTS.reduce((sum, line) => sum + (y.ledger?.[line] ?? 0), 0);

/** Cash at the end of a year as a multiple of that year's running costs; null without the year or without costs. */
const cashMultiple = (game: GameRecord, year: number): number | null => {
  const y = game.years.find((x) => x.year === year);
  return y && runningCosts(y) > 0 ? y.cash / runningCosts(y) : null;
};

const medianOf = (values: (number | null)[]): number | null => {
  const some = values.filter((v): v is number => v !== null);
  return some.length > 0 ? median(some) : null;
};
const times = (n: number | null) => (n === null ? '–' : n.toFixed(1));

/**
 * When the last purchase is made and how cash piles up late, over the full games of a folder, per bot, difficulty and region: the median year
 * of the last purchase and the games where it came after 2000; the median cash as a multiple of a year's running costs at the end of 1985, 2000
 * and 2015; the median of the highest multiple after 1990 and the games where it stays under two; the median dividend paid after 1985.
 */
export function lateMoneySummary(games: GameRecord[]): string {
  const groups = new Map<string, GameRecord[]>();
  for (const g of games) if (!g.setup.without) groups.set(`${g.setup.bot}|${g.setup.difficulty}|${g.setup.region}`, [...(groups.get(`${g.setup.bot}|${g.setup.difficulty}|${g.setup.region}`) ?? []), g]);
  if (groups.size === 0) return '';
  const head = ['bot', 'difficulty', 'region', 'games', 'last purchase', `after ${LAST_PURCHASE_TARGET}`, 'cash 1985', 'cash 2000', 'cash 2015', 'highest after 1990', `under ${CASH_TARGET_YEARS} after 1990`, 'dividends after 1985'];
  const lines = [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`];
  for (const [key, list] of [...groups].sort()) {
    const [bot, difficulty, region] = key.split('|');
    const withPurchases = list.filter((g) => g.purchases);
    const last = withPurchases.map((g) => Math.max(0, ...g.purchases!.map((p) => p.year)));
    const highest = list.map((g) => {
      const multiples = g.years.filter((y) => y.year > 1990).map((y) => cashMultiple(g, y.year));
      return multiples.some((v) => v !== null) ? Math.max(...multiples.filter((v): v is number => v !== null)) : null;
    });
    const dividends = list.map((g) => {
      const start = g.years.find((y) => y.year === 1985);
      const end = g.years[g.years.length - 1];
      return start && end && end.year > 1985 ? end.dividendsPaid - start.dividendsPaid : null;
    });
    const known = highest.filter((v) => v !== null);
    const dividend = medianOf(dividends);
    lines.push(
      `| ${bot} | ${difficulty} | ${region} | ${list.length} | ${last.length > 0 ? median(last) : '–'} | ${last.length > 0 ? `${last.filter((y) => y > LAST_PURCHASE_TARGET).length} of ${last.length}` : '–'} | ${times(medianOf(list.map((g) => cashMultiple(g, 1985))))} | ${times(medianOf(list.map((g) => cashMultiple(g, 2000))))} | ${times(medianOf(list.map((g) => cashMultiple(g, 2015))))} | ${times(medianOf(highest))} | ${known.length > 0 ? `${known.filter((v) => v! < CASH_TARGET_YEARS).length} of ${known.length}` : '–'} | ${dividend === null ? '–' : m(dividend)} |`,
    );
  }
  return `Late money, full games. Cash is a multiple of a year's running costs; the targets are a purchase after ${LAST_PURCHASE_TARGET} and cash under ${CASH_TARGET_YEARS} years of costs after 1990. Dividends in millions of euros:\n\n${lines.join('\n')}`;
}

/** The `--without` features that stand for one purchase, and the purchase's `what`. A feature with no one-off price has no payback. */
export const FEATURE_PURCHASE: Record<string, string> = {
  helicopter: 'helicopter',
  secondStation: 'radio channel 2',
  tv: 'tv channel 1',
  newsVan: 'news van',
  weather: 'weatherStudio',
  callCentre: 'callCentre',
  security: 'securityRoom',
  scheduling: 'musicSchedulingOffice',
  canteen: 'canteen',
  giftShop: 'giftShop',
  takeovers: 'takeover 1',
  transmitters: 'transmitter 1',
  wholeTakeover: 'whole takeover 1',
};

const profitFrom = (game: GameRecord, year: number, month: number) =>
  game.years.filter((y) => y.year >= year).reduce((sum, y) => sum + y.profitBeforeEvents * (y.year === year ? Math.min(1, (13 - month) / Math.max(1, y.months ?? 12)) : 1), 0);
const yearsFrom = (game: GameRecord, year: number, month: number) =>
  game.years.filter((y) => y.year >= year).reduce((sum, y) => sum + (y.months ?? 12) / 12, 0) - (month - 1) / 12;

/**
 * The payback in years of each purchase that a `--without` game stands for: the price against the yearly gain, which is the profit before
 * events of the full game less the game without it, from the purchase on, with the price added back, over the years it was held. "never"
 * when the gain is nothing or less. The median over the seeds, and how many fall inside the target of 5 to 8 years.
 */
export function paybackSummary(games: GameRecord[]): string {
  const full = new Map(games.filter((g) => !g.setup.without).map((g) => [gameKey(g), g]));
  const groups = new Map<string, { price: number; years: number }[]>();
  for (const g of games) {
    const what = FEATURE_PURCHASE[g.setup.without ?? ''];
    const whole = full.get(fullKey(g));
    const bought = what ? whole?.purchases?.find((p) => p.what === what) : undefined;
    if (!what || !whole || !bought || bought.price <= 0) continue;
    const held = yearsFrom(whole, bought.year, bought.month);
    const gain = held > 0 ? (profitFrom(whole, bought.year, bought.month) - profitFrom(g, bought.year, bought.month) + bought.price) / held : 0;
    const key = `${g.setup.bot}|${g.setup.difficulty}|${g.setup.region}|${g.setup.without}`;
    groups.set(key, [...(groups.get(key) ?? []), { price: bought.price, years: gain > 0 ? bought.price / gain : Infinity }]);
  }
  if (groups.size === 0) return '';
  const years = (n: number) => (n === Infinity ? 'never' : n.toFixed(1));
  const head = ['bot', 'difficulty', 'region', 'left out', 'seeds', 'price', 'payback in years (low–high)', `inside ${PAYBACK_TARGET.low} to ${PAYBACK_TARGET.high}`];
  const lines = [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`];
  for (const [key, list] of [...groups].sort()) {
    const [bot, difficulty, region, feature] = key.split('|');
    const paid = list.map((x) => x.years);
    const inside = paid.filter((n) => n >= PAYBACK_TARGET.low && n <= PAYBACK_TARGET.high).length;
    lines.push(`| ${bot} | ${difficulty} | ${region} | ${feature} | ${list.length} | ${m(median(list.map((x) => x.price)))} | ${years(median(paid))} (${years(Math.min(...paid))}–${years(Math.max(...paid))}) | ${inside} of ${list.length} |`);
  }
  return `Payback of what the --without games leave out (price in millions of euros). A gain of nothing or less is "never"; the seeds differ by tens of millions, so a cheap purchase reads as noise:\n\n${lines.join('\n')}`;
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
