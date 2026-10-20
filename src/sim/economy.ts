import {
  BAILOUT,
  BANKRUPTCY_MONTHS,
  DAYS_PER_YEAR,
  DIVIDEND,
  EPISODE_COST,
  LOAN,
  PRESTIGE,
  SALARY,
  DECOR,
} from '../config/balance';
import { getGenre } from '../config/genres';
import { toCalendarDate } from './calendar';
import { costFactor } from './difficulty';
import { licenseMonthly } from './licenses';
import { monthlyRent } from './office';
import { resaleValue } from './tech';
import { pickTitles } from './content';
import { streamingCosts, subscriptionIncome } from './streaming';

/** Whether the company has a printer in an office (0.16.0), which takes DECOR.printer off what every campaign costs. */
export const hasPrinter = (state: GameState) => state.rooms.some((r) => r.type === 'office' && r.furniture.some((f) => f.type === 'printer'));

/** What a campaign of a weekly budget costs a week: its budget, less what a printer saves. Its strength goes by the budget alone. */
export const weeklyCost = (state: GameState, weeklyBudget: number) => weeklyBudget * (hasPrinter(state) ? 1 - DECOR.printer : 1);
import { addMessage, emptyLedger, type DayResult, type GameState, type Id, type Ledger, type Role } from './state';

const formatEuro = (n: number) => `€${Math.round(n).toLocaleString('en-IE')}`;

/** The going rate for a job, by skill and fame, in a game of this difficulty. */
export function salaryFor(role: Role, skill: number, fame: number, game: Pick<GameState, 'difficulty'>): number {
  const round = (n: number) => Math.round((n * costFactor(game)) / 50) * 50;
  if (role === 'host') {
    const { min, skill: perSkill, fame: perFame, max } = SALARY.host;
    return round(Math.min(max, min + (perSkill * skill) / 100 + (perFame * fame) / 100));
  }
  const { min, max } = SALARY[role];
  return round(min + ((max - min) * (skill - 1)) / 99);
}

/** How strongly the company's prestige draws hosts: 0 without any, 1 from PRESTIGE.full up. */
export const prestigePull = (state: Pick<GameState, 'prestige'>) => Math.min(1, Math.max(0, state.prestige) / PRESTIGE.full);

/** What a host in the hiring pool asks: the going rate, less what the company's prestige is worth to them. */
export function hostAsking(state: Pick<GameState, 'prestige' | 'difficulty'>, skill: number, fame: number): number {
  return Math.round((salaryFor('host', skill, fame, state) * (1 - PRESTIGE.hostDiscount * prestigePull(state))) / 50) * 50;
}

export interface MonthlyCosts {
  salaries: number;
  rent: number;
  licenseFees: number;
}

/** What the company currently pays per month in recurring costs (excluding loan payments). */
export function monthlyCosts(state: GameState): MonthlyCosts {
  return {
    salaries: state.employees.reduce((sum, e) => sum + e.salary, 0),
    rent: state.rooms.reduce((sum, r) => sum + monthlyRent(r, state), 0),
    licenseFees: state.licenses.reduce((sum, l) => sum + licenseMonthly(l.medium, l.regionId, state), 0),
  };
}

/** Recurring costs are paid every day: a day's share of the month's salaries, rent and license fees. */
export function payDailyCosts(draft: GameState): void {
  const costs = monthlyCosts(draft);
  const perDay = 12 / DAYS_PER_YEAR;
  draft.ledger.salaries += costs.salaries * perDay;
  draft.ledger.rent += costs.rent * perDay;
  draft.ledger.licenseFees += costs.licenseFees * perDay;
  draft.money -= (costs.salaries + costs.rent + costs.licenseFees) * perDay;
}

/** Daily: every library title that aired today is paid for that airing. */
export function payTitles(draft: GameState, airedTitleIds: ReadonlySet<Id>): void {
  for (const title of draft.library) if (airedTitleIds.has(title.id) && title.perAiring > 0) spend(draft, title.perAiring, 'titles');
}

/** Daily: every produced TV show that aired today costs its episode budget. */
export function payEpisodes(draft: GameState, result: DayResult): void {
  for (const slot of result.channels.filter((c) => c.isPlayer).flatMap((c) => c.slots)) {
    const show = slot.showId && !slot.titleId ? draft.shows.find((s) => s.id === slot.showId) : undefined;
    const cost = show ? (EPISODE_COST[show.genre] ?? 0) : 0;
    if (cost > 0) spend(draft, cost, 'production');
  }
}

/** Episode budgets per day for a channel's current schedule (for the UI). */
export function dailyEpisodeCost(state: GameState, schedule: readonly (string | null)[]): number {
  return schedule.reduce((sum, id) => {
    const show = state.shows.find((s) => s.id === id);
    return sum + (show && getGenre(show.genre).kind === 'produced' ? (EPISODE_COST[show.genre] ?? 0) : 0);
  }, 0);
}

/** Salaries, rent and license fees paid so far this month. */
export function bills(ledger: Ledger): number {
  return ledger.salaries + ledger.rent + ledger.licenseFees;
}

type SpendCategory = 'purchases' | 'salaries' | 'severance' | 'revamps' | 'marketing' | 'content' | 'titles' | 'production' | 'sponsorPenalties' | 'loanPayments' | 'events' | 'renewals' | 'training';

/** Immediate payment, e.g. furniture or severance. */
export function spend(draft: GameState, amount: number, category: SpendCategory): void {
  draft.money -= amount;
  draft.ledger[category] += amount;
}

/**
 * What it costs to keep the company going, month in, month out: the bills, the
 * episode budgets of TV shows, the airings of bought titles and the loan.
 * Whether the income covers these is whether the company makes a profit as it stands.
 */
export const RUNNING_COSTS = ['salaries', 'rent', 'licenseFees', 'production', 'titles', 'streaming', 'loanPayments'] as const satisfies readonly (keyof Ledger)[];

/** Everything else that is paid: what the player bought or chose to spend, and the odd penalty. */
export const OTHER_SPENDING = ['purchases', 'severance', 'training', 'revamps', 'marketing', 'content', 'sponsorPenalties', 'events', 'renewals'] as const satisfies readonly (keyof Ledger)[];

export const runningCosts = (ledger: Ledger) => RUNNING_COSTS.reduce((sum, key) => sum + ledger[key], 0);
export const otherSpending = (ledger: Ledger) => OTHER_SPENDING.reduce((sum, key) => sum + ledger[key], 0);

/** Income less running costs: what the company earns or loses by simply carrying on. */
export const runningResult = (ledger: Ledger) => ledger.revenue - runningCosts(ledger);

/**
 * The month the company is heading for as it stands: yesterday's income every
 * day and the subscribers it has today, against what the staff, the rooms, the
 * licenses, the episodes on the schedule, the titles that air, the streaming
 * service and the loan cost per month; and apart from that, what the marketing
 * campaigns that run will still cost in that month.
 */
export function outlook(state: GameState): { income: number; sponsors: number; fees: number; subscriptions: number; episodes: number; titles: number; streaming: number; loan: number; costs: number; result: number; campaigns: number } {
  const perMonth = DAYS_PER_YEAR / 12;
  const slots = state.lastDay?.channels.filter((c) => c.isPlayer).flatMap((c) => c.slots) ?? [];
  // Of the income: what subscribers pay for the streaming service (0.18.0).
  const subscriptions = subscriptionIncome(state);
  const service = streamingCosts(state);
  const streaming = service.subscribers + service.titles;
  const income = slots.reduce((sum, slot) => sum + slot.revenue, 0) * perMonth + subscriptions;
  // Of the income: what sponsors add to the ad rate, and teleshopping fees.
  const sponsors = slots.reduce((sum, slot) => sum + (slot.sponsorRevenue ?? 0), 0) * perMonth;
  const fees = slots.reduce((sum, slot) => sum + (slot.fee ?? 0), 0) * perMonth;
  const episodes = state.channels.reduce((sum, channel) => sum + dailyEpisodeCost(state, channel.schedule), 0) * perMonth;
  const titles = [...pickTitles(state).values()].reduce((sum, title) => sum + title.perAiring, 0) * perMonth;
  const loan = state.loan?.monthlyPayment ?? 0;
  const monthly = monthlyCosts(state);
  const costs = monthly.salaries + monthly.rent + monthly.licenseFees + episodes + titles + streaming + loan;
  // Campaigns are not a running cost, but they are paid every day while they run: what they will still cost in the month ahead.
  const campaigns = state.campaigns.reduce((sum, c) => sum + (weeklyCost(state, c.weeklyBudget) / 7) * Math.min(perMonth, Math.max(0, c.endDay - state.day)), 0);
  return { income, sponsors, fees, subscriptions, episodes, titles, streaming, loan, costs, result: income - costs, campaigns };
}

/** What came in less everything that left the company this month, except borrowing: the month's result. */
export function monthlyNet(ledger: Ledger): number {
  return (
    ledger.revenue +
    ledger.gifts -
    bills(ledger) -
    ledger.purchases -
    ledger.severance -
    ledger.revamps -
    ledger.marketing -
    ledger.content -
    ledger.titles -
    ledger.production -
    ledger.sponsorPenalties -
    ledger.events -
    ledger.renewals -
    ledger.training -
    ledger.streaming -
    ledger.loanPayments
  );
}

// --- Company value and loans ---

/**
 * Money + furniture at resale value + licenses at purchase price
 * + LOAN.revenueMonths of average revenue (last 3 months) − loan still owed.
 */
export function companyValue(state: GameState): number {
  const furniture = state.rooms
    .flatMap((r) => r.furniture)
    .reduce((sum, f) => sum + resaleValue(f, state.day), 0);
  const licenses = state.licenses.reduce((sum, l) => sum + l.price, 0);
  const recent = state.monthlyReports.slice(-3);
  const avgRevenue = recent.length > 0 ? recent.reduce((sum, r) => sum + r.revenue, 0) / recent.length : 0;
  return Math.max(0, state.money) + furniture + licenses + LOAN.revenueMonths * avgRevenue - (state.loan?.balance ?? 0);
}

export function maxLoan(state: GameState): number {
  return Math.max(0, Math.floor((companyValue(state) * LOAN.maxShare) / 1000) * 1000);
}

/** Fixed monthly payment that repays `amount` over `months` at LOAN.monthlyRate. */
export function loanPayment(amount: number, months: number): number {
  const r = LOAN.monthlyRate;
  return Math.round((amount * r) / (1 - (1 + r) ** -months));
}

function payLoanInstallment(draft: GameState): void {
  const loan = draft.loan;
  if (!loan) return;
  const interest = loan.balance * LOAN.monthlyRate;
  const payment = Math.min(loan.monthlyPayment, loan.balance + interest);
  spend(draft, payment, 'loanPayments');
  loan.balance = Math.max(0, loan.balance + interest - payment);
  loan.monthsLeft -= 1;
  if (loan.monthsLeft <= 0 || loan.balance < 1) {
    draft.loan = null;
    addMessage(draft, 'good', 'Your loan is paid off.');
  }
}

// --- Dividends ---

/** Cash the owners leave in the company: DIVIDEND.reserveMonths of running costs. */
export function dividendReserve(state: GameState): number {
  const costs = monthlyCosts(state);
  return DIVIDEND.reserveMonths * (costs.salaries + costs.rent + costs.licenseFees);
}

/** What the owners would take if the year ended today: a share of the cash above the reserve. */
export function dividendDue(state: GameState): number {
  return Math.floor((DIVIDEND.payout * Math.max(0, state.money - dividendReserve(state))) / 100) * 100;
}

function payDividend(draft: GameState): void {
  const dividend = dividendDue(draft);
  if (dividend <= 0) return;
  draft.money -= dividend;
  draft.ledger.dividends += dividend;
  draft.dividendsPaid += dividend;
  addMessage(draft, 'info', `The owners take a dividend of ${formatEuro(dividend)}: ${Math.round(DIVIDEND.payout * 100)}% of the cash above your reserve of ${formatEuro(dividendReserve(draft))}.`, undefined, undefined, 'tabby');
}

/** The bank pulls the plug: the company is bankrupt and the game is over. */
export function goBankrupt(draft: GameState): void {
  draft.bankrupt = true;
  addMessage(draft, 'danger', 'The bank has pulled the plug, and I do not pay in twice. Your company is bankrupt.', undefined, undefined, 'tabby');
}

/** Run on the 1st: pay the loan, file last month's report, check for bankruptcy, and in January pay the dividend. */
export function settleMonth(draft: GameState): void {
  payLoanInstallment(draft);

  const { ledger } = draft;
  const { year, month } = toCalendarDate(draft.day - 1);
  const net = monthlyNet(ledger);
  draft.monthlyReports.push({ ...ledger, year, month, net, balance: draft.money });
  draft.ledger = emptyLedger();

  const monthName = new Date(Date.UTC(year, month - 1)).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
  // The report leads with whether the company pays its own way; what was bought on top comes second.
  const running = runningResult(ledger);
  const other = otherSpending(ledger);
  const amount = (n: number) => formatEuro(Math.abs(n));
  const closes = other > 0 ? `; with ${amount(other)} spent besides, the month closes ${amount(net)} ${net >= 0 ? 'up' : 'down'}` : '';
  addMessage(draft, running >= 0 ? 'good' : 'info', `${monthName} report: a running ${running >= 0 ? 'profit' : 'loss'} of ${amount(running)}${closes}.`, 'routine');

  if (draft.money >= 0) {
    draft.negativeMonths = 0;
    if (month === 12) payDividend(draft);
    return;
  }
  draft.negativeMonths += 1;
  if (draft.negativeMonths >= BANKRUPTCY_MONTHS && !draft.bailedOut) {
    // The first time, the uncle pays in. It is a gift, not income: no report counts it, and the bank starts counting again.
    // He writes it himself (0.17.0), as he writes everything about the money that is his.
    draft.bailedOut = true;
    draft.money += BAILOUT.amount;
    draft.negativeMonths = 0;
    addMessage(
      draft,
      'danger',
      `The bank was about to pull the plug, so I have paid in ${formatEuro(BAILOUT.amount)} to keep you on the air. I do that once${draft.money < 0 ? `. You are still in the red: get back above €0 within ${BANKRUPTCY_MONTHS} months` : ''}.`,
      undefined,
      undefined,
      'tabby',
    );
  } else if (draft.negativeMonths >= BANKRUPTCY_MONTHS) {
    goBankrupt(draft);
  } else {
    const left = BANKRUPTCY_MONTHS - draft.negativeMonths;
    addMessage(
      draft,
      'danger',
      `You're in the red. Get back above €0 within ${left} month${left === 1 ? '' : 's'} or the company goes bankrupt.`,
      undefined,
      undefined,
      'tabby',
    );
  }
}
