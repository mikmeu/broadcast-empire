// Headless balance check: a bot plays N in-game years without the UI, and the
// script prints a monthly (or yearly) summary.
//
// Usage: npm run simulate -- [--bot sensible|capital|neglectful|growth|network|nosupport|research|tv|stream] [--years 2] [--seed 42]
//        [--difficulty easy|normal|hard] [--yearly] [--map <map file>]

import { parseArgs } from 'node:util';
import { listenersByOwner } from '../src/sim/broadcast';
import { DIFFICULTIES, type Difficulty } from '../src/config/balance';
import { capitalBot, growthBot, networkBot, neglectfulBot, noSupportBot, researchBot, sensibleBot, streamBot, tvBot } from '../src/sim/bots';
import { toCalendarDate } from '../src/sim/calendar';
import { oldShareToday, ordersBlocker } from '../src/sim/merchandise';
import { onOrders } from '../src/sim/staff';
import { companyValue } from '../src/sim/economy';
import { readFileSync } from 'node:fs';
import type { MapFile } from '../src/mods/mapFile';
import { checkMapFile } from '../src/mods/mapFile';
import { checkPlayable, useMapFor } from '../src/mods/playMap';
import { DEFAULT_SETUP, createInitialState } from '../src/sim/newGame';
import { PLAYER, type GameState } from '../src/sim/state';
import type { Medium } from '../src/config/world';
import { tick } from '../src/sim/tick';
import { averageMorale } from '../src/sim/upkeep';

const { values } = parseArgs({
  options: {
    bot: { type: 'string', default: 'sensible' },
    years: { type: 'string', default: '2' },
    seed: { type: 'string', default: '42' },
    difficulty: { type: 'string', default: 'normal' },
    yearly: { type: 'boolean', default: false },
    map: { type: 'string' },
  },
});
const bots = { sensible: sensibleBot, capital: capitalBot, neglectful: neglectfulBot, growth: growthBot, network: networkBot, nosupport: noSupportBot, research: researchBot, tv: tvBot, stream: streamBot };
const bot = bots[values.bot as keyof typeof bots];
if (!bot) throw new Error(`Unknown bot "${values.bot}". Use: ${Object.keys(bots).join(', ')}`);
const years = Number(values.years);
const seed = Number(values.seed);
const difficulty = values.difficulty as Difficulty;
if (!DIFFICULTIES.includes(difficulty)) throw new Error(`Unknown difficulty "${values.difficulty}". Use: ${DIFFICULTIES.join(', ')}`);

const euro = (n: number) => Math.round(n).toLocaleString('en-IE');
const k = (n: number) => `${Math.round(n / 1000)}k`;

/** Player's and the biggest rival's average audience per slot in one medium, from the latest weekly report. */
function market(state: GameState, medium: Medium) {
  const report = state.weeklyReports[state.weeklyReports.length - 1];
  if (!report) return { player: 0, rival: 0, rivalName: '-' };
  const totals = listenersByOwner(report, medium);
  const [rivalId, rival] = [...totals].filter(([id]) => id !== PLAYER).sort((a, b) => b[1] - a[1])[0] ?? ['-', 0];
  return { player: totals.get(PLAYER) ?? 0, rival, rivalName: state.rivals.find((r) => r.id === rivalId)?.name ?? '-' };
}

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
let state = createInitialState(seed, difficulty, { ...DEFAULT_SETUP, customMap });
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
while (state.day < endDay && !state.bankrupt) {
  // The ledger starts again each month, so the boxes are what the bot bought before the day ran.
  const played = bot(state);
  const boxes = played.ledger.merchStock - state.ledger.merchStock;
  state = tick(played);
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

console.log(`${values.bot} bot, seed ${seed}, ${difficulty}: ${state.day} days in ${ms.toFixed(0)} ms`);
console.table(rows);
const firstProfit = state.monthlyReports.findIndex((r) => r.net > 0);
if (firstTvMonth) console.log(`First TV channel: ${firstTvMonth}; TV earned ${Math.round((100 * tvTotal) / Math.max(1, revenueTotal))}% of all ad revenue`);
console.log(`Gift shop, whole run: sold ${euro(merchTotal.sold)}, boxes bought ${euro(merchTotal.boxes)}, old share ${euro(merchTotal.old)}`);
if (ordersOpen) console.log(`Gift shop, since orders opened (${ordersOpen}): sold ${euro(merchOrders.sold)}, boxes ${euro(merchOrders.boxes)}, net ${euro(merchOrders.sold - merchOrders.boxes)}, old share ${euro(merchOrders.old)}, net / old ${(((merchOrders.sold - merchOrders.boxes)) / Math.max(1, merchOrders.old)).toFixed(2)}`);
const firstLead = rows.findIndex((r) => r.leader === 'yes');
console.log(`First profitable month: ${firstProfit === -1 ? 'never' : `month ${firstProfit + 1}`}`);
console.log(`First month as market leader: ${firstLead === -1 ? 'never' : rows[firstLead]!.month}`);
if (state.bankrupt) console.log(`BANKRUPT on day ${state.day}`);
