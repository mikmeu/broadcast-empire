// Headless balance check: a bot plays N in-game years without the UI, and the
// script prints a monthly (or yearly) summary.
//
// Usage: npm run simulate -- [--bot sensible|capital|neglectful|growth|network|nosupport|research|tv|stream] [--years 2] [--seed 42]
//        [--difficulty easy|normal|hard] [--yearly] [--map <map file>]
//        [--region capital|north|coast|heartland|highlands] [--at-home] [--unlock-all] [--json <file>] [--without <feature>]
// --unlock-all opens the whole tree and every feature from the first day, as the whole-tree long test does (a single game only).
//
// --region alone moves the headquarters: the first licence is still bought in the Capital. --at-home buys it in the headquarters
// region, with a first station for that region's audiences, as a player who skips Penny's advice does (#429). Not with --map.
// --without <feature> leaves one thing out of the bot's play, to show what it is worth (src/sim/bots.ts, LEAVE_OUT):
//   events, themeWeeks, helicopter, giftShop, secondStation, sponsors, canteen, marketing, lawyer, newsVan, weather,
//   callCentre, security, scheduling, tv, streaming. A bot that never plays the feature is refused.
// --json <file> also writes the game's yearly figures and what the bot bought, and when, to a file (see src/sim/sweep.ts).
//   Each year also keeps a TV breakdown (tvBreakdown): viewers, revenue and cost for each TV slot, bought titles against own
//   productions and reruns, the average title quality and the rival TV channels in the bot's regions; --summary prints it by decade.
//   The summary of a folder also prints when the last purchase is made, how cash piles up late (a multiple of a year's
//   running costs at 1985, 2000 and 2015, the dividend after 1985) and each purchase's payback against its --without game.
//
// Many games at once, for the server or GitHub Actions (a whole game takes three to five minutes):
//   npm run simulate -- --sweep [--seeds 1,2,3] [--bots a,b] [--difficulties a,b] [--regions a,b] [--years 60]
//        [--without a,b] [--at-home] [--jobs <n>] [--out <dir>] [--yes]
//     --at-home plays every game as a start at home; the files get -athome in their names, and the summary keeps them apart.
//     plays every bot x difficulty x region x seed, one JSON file per game in <dir> (default sweeps/<commit>), then
//     prints the summary. --without plays, besides the full game, one game per feature left out, for the bots that play it,
//     and the summary compares each with the full game of the same bot, difficulty, region and seed.
//     prints the summary. A game whose file is there is skipped, so a stopped sweep goes on where it stopped.
//   npm run simulate -- --summary <dir> [--baseline <dir>]
//     sums up a finished folder, against an earlier one game by game.

import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { yearRecord, market, purchasesMade, takeChannelFigures, takeTvFigures, tallyChannelDay, tallyPurchase, tallyTaken, tallyTvDay, type ChannelTallies, type TvTallies, type GameRecord, type Purchase, type YearRecord } from '../src/sim/sweep';
import { ACTIVE_REGIONS, DIFFICULTIES, type Difficulty } from '../src/config/balance';
import type { RegionId } from '../src/config/world';
import { atHome, capitalBot, growthBot, leaveOutProblem, networkBot, neglectfulBot, noSupportBot, researchBot, sensibleBot, streamBot, tvBot, without, type LeftOut } from '../src/sim/bots';
import { toCalendarDate } from '../src/sim/calendar';
import { oldShareToday, ordersBlocker } from '../src/sim/merchandise';
import { onOrders } from '../src/sim/staff';
import { companyValue } from '../src/sim/economy';
import { readFileSync } from 'node:fs';
import { runSweep, summariseFolder } from './sweep';
import type { MapFile } from '../src/mods/mapFile';
import { checkMapFile } from '../src/mods/mapFile';
import { checkPlayable, useMapFor } from '../src/mods/playMap';
import { DEFAULT_SETUP, createInitialState } from '../src/sim/newGame';
import { tick } from '../src/sim/tick';
import { unlockAll } from '../src/sim/unlocks';
import { averageMorale } from '../src/sim/upkeep';

const { values } = parseArgs({
  options: {
    bot: { type: 'string', default: 'sensible' },
    years: { type: 'string', default: '2' },
    seed: { type: 'string', default: '42' },
    difficulty: { type: 'string', default: 'normal' },
    yearly: { type: 'boolean', default: false },
    map: { type: 'string' },
    region: { type: 'string', default: 'capital' },
    'at-home': { type: 'boolean', default: false },
    'unlock-all': { type: 'boolean', default: false },
    json: { type: 'string' },
    without: { type: 'string' },
    sweep: { type: 'boolean', default: false },
    seeds: { type: 'string', default: '1,2,3' },
    bots: { type: 'string' },
    difficulties: { type: 'string' },
    regions: { type: 'string' },
    jobs: { type: 'string' },
    out: { type: 'string' },
    yes: { type: 'boolean', default: false },
    summary: { type: 'string' },
    baseline: { type: 'string' },
  },
});
if (values.summary) {
  summariseFolder(values.summary, values.baseline);
  process.exit(0);
}
const botNames = ['sensible', 'capital', 'neglectful', 'growth', 'network', 'nosupport', 'research', 'tv', 'stream'];
if (values.sweep) {
  // `years` has the single game's default of 2; a sweep plays to 2030 unless told otherwise.
  const list = (text: string | undefined, all: readonly string[]) => (text ? text.split(',').map((s) => s.trim()).filter(Boolean) : [...all]);
  const sweepYears = process.argv.includes('--years') ? Number(values.years) : 60;
  await runSweep({
    bots: list(values.bots, botNames),
    difficulties: list(values.difficulties, DIFFICULTIES),
    regions: list(values.regions, ACTIVE_REGIONS),
    without: list(values.without, []),
    atHome: values['at-home'],
    seeds: list(values.seeds, []).map(Number),
    years: sweepYears,
    jobs: values.jobs ? Number(values.jobs) : undefined,
    out: values.out,
    yes: values.yes,
    botNames,
  });
  process.exit(0);
}
const bots = { sensible: sensibleBot, capital: capitalBot, neglectful: neglectfulBot, growth: growthBot, network: networkBot, nosupport: noSupportBot, research: researchBot, tv: tvBot, stream: streamBot };
const plain = bots[values.bot as keyof typeof bots];
if (!plain) throw new Error(`Unknown bot "${values.bot}". Use: ${Object.keys(bots).join(', ')}`);
const leftOutFeature = values.without as LeftOut | undefined;
if (leftOutFeature) {
  const problem = leaveOutProblem(leftOutFeature, values.bot!);
  if (problem) throw new Error(problem);
}
const startAtHome = values['at-home'];
const bot = startAtHome ? atHome(leftOutFeature ? without(leftOutFeature)(plain) : plain) : leftOutFeature ? without(leftOutFeature)(plain) : plain;
const years = Number(values.years);
const seed = Number(values.seed);
const difficulty = values.difficulty as Difficulty;
if (!DIFFICULTIES.includes(difficulty)) throw new Error(`Unknown difficulty "${values.difficulty}". Use: ${DIFFICULTIES.join(', ')}`);
const region = values.region as RegionId;
if (!ACTIVE_REGIONS.includes(region)) throw new Error(`Unknown region "${values.region}". Use: ${ACTIVE_REGIONS.join(', ')}`);
if (values.map && startAtHome) throw new Error('--map replaces the Capital\'s town: --at-home needs the regions as they are.');
if (values.map && region !== 'capital') throw new Error('--map replaces the Capital\'s town: use it without --region, or with --region capital.');

const euro =(n: number) => Math.round(n).toLocaleString('en-IE');
const k = (n: number) => `${Math.round(n / 1000)}k`;

// --map <file>: the bot plays in the capital on a custom map (a map file as the editor saves it), not on Coaxia's own town.
let customMap: MapFile | undefined;
if (values.map) {
  const checked = checkMapFile(JSON.parse(readFileSync(values.map, 'utf8')));
  if (!checked.ok) throw new Error(`${values.map}: ${checked.reason}`);
  const playable = checkPlayable(checked.file);
  if (!playable.ok) throw new Error(`${values.map} cannot be played: ${playable.reason}`);
  customMap = checked.file;
  useMapFor({ ...DEFAULT_SETUP, customMap });
}
if (values['unlock-all'] && values.sweep) throw new Error('--unlock-all is for a single game, not a sweep.');
// --unlock-all (#470): the whole tree open from the first day, as bots.wholeTree.long.test.ts plays it.
const begun = createInitialState(seed, difficulty, { ...DEFAULT_SETUP, headquarters: region, customMap });
let state = values['unlock-all'] ? unlockAll(begun) : begun;
const started = performance.now();
const endDay = Math.round(years * 365.25);
const rows: Record<string, string | number>[] = [];
/** TV ad revenue since the last printed row, and in total. */
let tvRevenue = 0;
let periodRevenue = 0;
let tvTotal = 0;
let revenueTotal = 0;
let firstTvMonth = '';
/** The gift shop (0.21.0, #380): sold, boxes bought and what the old daily share would have paid, since the last row and in total; and the same for the days with orders open. */
type MerchTally = { sold: number; boxes: number; old: number };
const tally = (): MerchTally => ({ sold: 0, boxes: 0, old: 0 });
let merchPeriod = tally();
const merchTotal = tally();
const merchOrders = tally();
let ordersOpen = '';
/** For --json: the yearly figures, and the month Uncle Tabby saved the company. */
const yearRecords: YearRecord[] = [];
/** For --json: each channel's own revenue and costs in the year so far (#436). */
const channelTallies: ChannelTallies = new Map();
/** For --json: each TV slot's viewers, revenue and costs in the year so far, by kind of programme (#467). */
const tvTallies: TvTallies = new Map();
/** For --json: what the bot bought and when (#475). */
const purchases: Purchase[] = [];
let bailedOut: string | null = null;
while (state.day < endDay && !state.bankrupt) {
  // The ledger starts again each month, so the boxes are what the bot bought before the day ran.
  const played = bot(state);
  const boxes = played.ledger.merchStock - state.ledger.merchStock;
  if (values.json) {
    tallyPurchase(channelTallies, state, played);
    purchases.push(...purchasesMade(state, played));
    if (toCalendarDate(played.day).dayOfMonth === 1) tallyTaken(channelTallies, played);
  }
  const before = played;
  state = tick(played);
  if (values.json && state.lastDay) {
    tallyChannelDay(channelTallies, before, state.lastDay);
    tallyTvDay(tvTallies, before, state.lastDay);
  }
  const merchToday: MerchTally = { sold: state.lastDay?.merchandise ?? 0, boxes, old: state.lastDay ? oldShareToday(state, state.lastDay) : 0 };
  const packing = state.employees.some(onOrders) && ordersBlocker(state) === null;
  if (packing && !ordersOpen) ordersOpen = `${toCalendarDate(state.day).year}-${String(toCalendarDate(state.day).month).padStart(2, '0')}`;
  for (const t of packing ? [merchPeriod, merchTotal, merchOrders] : [merchPeriod, merchTotal]) {
    t.sold += merchToday.sold;
    t.boxes += merchToday.boxes;
    t.old += merchToday.old;
  }
  const tvToday = state.lastDay?.channels.filter((c) => c.isPlayer && c.medium === 'tv').reduce((sum, c) => sum + c.slots.reduce((x, slot) => x + slot.revenue, 0), 0) ?? 0;
  const allToday = state.lastDay?.channels.filter((c) => c.isPlayer).reduce((sum, c) => sum + c.slots.reduce((x, slot) => x + slot.revenue, 0), 0) ?? 0;
  tvRevenue += tvToday;
  periodRevenue += allToday;
  tvTotal += tvToday;
  revenueTotal += allToday;
  const date = toCalendarDate(state.day);
  if (!firstTvMonth && state.channels.some((c) => c.medium === 'tv')) firstTvMonth = `${date.year}-${String(date.month).padStart(2, '0')}`;
  const monthKey = `${date.year}-${String(date.month).padStart(2, '0')}`;
  if (!bailedOut && state.bailedOut) bailedOut = monthKey;
  if (date.dayOfMonth === 1 && date.month === 1) {
    const record = yearRecord(state);
    if (record) yearRecords.push({ ...record, channelFigures: takeChannelFigures(channelTallies), tvBreakdown: takeTvFigures(tvTallies, state) });
  }
  if (date.dayOfMonth !== 1 || (values.yearly && date.month !== 1)) continue;
  const r = state.monthlyReports[state.monthlyReports.length - 1]!;
  const m = market(state, 'radio');
  const tv = market(state, 'tv');
  rows.push({
    month: `${r.year}-${String(r.month).padStart(2, '0')}`,
    revenue: euro(r.revenue),
    costs: euro(r.salaries + r.rent + r.licenseFees),
    other: euro(r.purchases + r.severance + r.revamps + r.marketing + r.content + r.production + r.sponsorPenalties + r.events + r.renewals + r.loanPayments),
    // What sponsors paid on top of the ads, and the penalties and refunds to them (0.21.0, #361); both are in revenue and other.
    sponsors: euro(r.sponsorRevenue),
    penalties: euro(r.sponsorPenalties),
    net: euro(r.net),
    balance: euro(r.balance),
    dividends: k(state.dividendsPaid),
    prestige: state.prestige,
    value: k(companyValue(state)),
    channels: state.channels.length,
    licenses: state.licenses.length,
    staff: state.employees.length,
    techs: state.techs.length,
    clean: Math.round(state.rooms.reduce((sum, room) => sum + room.cleanliness, 0) / Math.max(1, state.rooms.length)),
    broken: state.rooms.flatMap((room) => room.furniture).filter((f) => f.condition <= 0).length,
    morale: Math.round(averageMorale(state)),
    you: k(m.player),
    topRival: `${k(m.rival)} ${m.rivalName.split(' ')[0]}`,
    leader: m.player > m.rival ? 'yes' : '',
    tvShare: tvRevenue > 0 ? `${Math.round((100 * tvRevenue) / periodRevenue)}%` : '',
    viewers: tv.player > 0 ? `${k(tv.player)} / ${k(tv.rival)}` : '',
    // The streaming service (0.18.0): its subscribers, and what they paid as a share of the month's revenue.
    subs: state.streaming ? `${k(state.streaming.subscribers)} ${Math.round((100 * r.subscriptions) / Math.max(1, r.revenue))}%` : '',
    // The gift shop: sold / boxes bought / what the old share would have paid, since the last row.
    merch: merchPeriod.sold > 0 || merchPeriod.boxes > 0 || merchPeriod.old > 0 ? `${k(merchPeriod.sold)} / ${k(merchPeriod.boxes)} / ${k(merchPeriod.old)}` : '',
  });
  merchPeriod = tally();
  tvRevenue = 0;
  periodRevenue = 0;
}
const ms = performance.now() - started;

console.log(`${values.bot} bot${leftOutFeature ? ` without ${leftOutFeature}` : ''}, seed ${seed}, ${difficulty}, ${region}${startAtHome ? ' (at home)' : ''}: ${state.day} days in ${ms.toFixed(0)} ms`);
if (region !== 'capital' && !startAtHome) console.log('The test players still buy their licences in the Capital.');
console.table(rows);
const firstProfit = state.monthlyReports.findIndex((r) => r.net > 0);
if (firstTvMonth) console.log(`First TV channel: ${firstTvMonth}; TV earned ${Math.round((100 * tvTotal) / Math.max(1, revenueTotal))}% of all ad revenue`);
console.log(`Gift shop, whole run: sold ${euro(merchTotal.sold)}, boxes bought ${euro(merchTotal.boxes)}, old share ${euro(merchTotal.old)}`);
if (ordersOpen) console.log(`Gift shop, since orders opened (${ordersOpen}): sold ${euro(merchOrders.sold)}, boxes ${euro(merchOrders.boxes)}, net ${euro(merchOrders.sold - merchOrders.boxes)}, old share ${euro(merchOrders.old)}, net / old ${(((merchOrders.sold - merchOrders.boxes)) / Math.max(1, merchOrders.old)).toFixed(2)}`);
const firstLead = rows.findIndex((r) => r.leader === 'yes');
console.log(`First profitable month: ${firstProfit === -1 ? 'never' : `month ${firstProfit + 1}`}`);
console.log(`First month as market leader: ${firstLead === -1 ? 'never' : rows[firstLead]!.month}`);
if (state.bankrupt) console.log(`BANKRUPT on day ${state.day}`);

if (values.json) {
  // A game that ended mid-year (bankrupt, or years that are not whole) gets a record for the part year.
  const last = yearRecord(state);
  if (last && last.year !== yearRecords[yearRecords.length - 1]?.year) yearRecords.push({ ...last, channelFigures: takeChannelFigures(channelTallies), tvBreakdown: takeTvFigures(tvTallies, state) });
  const date = toCalendarDate(state.day);
  const record: GameRecord = {
    setup: { bot: values.bot!, difficulty, region, seed, years, ...(startAtHome ? { atHome: true } : {}), ...(leftOutFeature ? { without: leftOutFeature } : {}) },
    commit: (() => { try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return 'unknown'; } })(),
    runSeconds: Math.round(ms / 1000),
    years: yearRecords,
    purchases,
    bankrupt: state.bankrupt ? { day: state.day, month: `${date.year}-${String(date.month).padStart(2, '0')}` } : null,
    bailedOut,
  };
  mkdirSync(dirname(values.json), { recursive: true });
  writeFileSync(values.json, JSON.stringify(record));
}
