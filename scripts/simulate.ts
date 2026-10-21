// Headless balance check: a bot plays N in-game years without the UI, and the
// script prints a monthly (or yearly) summary.
//
// Usage: npm run simulate -- [--bot sensible|capital|neglectful|growth|network|nosupport|research|tv|stream] [--years 2] [--seed 42]
//        [--difficulty easy|normal|hard] [--yearly]

import { parseArgs } from 'node:util';
import { listenersByOwner } from '../src/sim/broadcast';
import { DIFFICULTIES, type Difficulty } from '../src/config/balance';
import { capitalBot, growthBot, networkBot, neglectfulBot, noSupportBot, researchBot, sensibleBot, streamBot, tvBot } from '../src/sim/bots';
import { toCalendarDate } from '../src/sim/calendar';
import { companyValue } from '../src/sim/economy';
import { createInitialState } from '../src/sim/newGame';
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

let state = createInitialState(seed, difficulty);
const started = performance.now();
const endDay = Math.round(years * 365.25);
const rows: Record<string, string | number>[] = [];
/** TV ad revenue since the last printed row, and in total. */
let tvRevenue = 0;
let periodRevenue = 0;
let tvTotal = 0;
let revenueTotal = 0;
let firstTvMonth = '';
while (state.day < endDay && !state.bankrupt) {
  state = tick(bot(state));
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
  });
  tvRevenue = 0;
  periodRevenue = 0;
}
const ms = performance.now() - started;

console.log(`${values.bot} bot, seed ${seed}, ${difficulty}: ${state.day} days in ${ms.toFixed(0)} ms`);
console.table(rows);
const firstProfit = state.monthlyReports.findIndex((r) => r.net > 0);
if (firstTvMonth) console.log(`First TV channel: ${firstTvMonth}; TV earned ${Math.round((100 * tvTotal) / Math.max(1, revenueTotal))}% of all ad revenue`);
const firstLead = rows.findIndex((r) => r.leader === 'yes');
console.log(`First profitable month: ${firstProfit === -1 ? 'never' : `month ${firstProfit + 1}`}`);
console.log(`First month as market leader: ${firstLead === -1 ? 'never' : rows[firstLead]!.month}`);
if (state.bankrupt) console.log(`BANKRUPT on day ${state.day}`);
