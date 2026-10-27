import { isUnlocked } from '../../sim/unlocks';
import { useEffect, useRef, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DIVIDEND, FLOOR_LEVEL, LEGAL, LOAN } from '../../config/balance';
import { repayLoan, settleCase, takeLoan } from '../../sim/actions';
import { formatDate } from '../../sim/calendar';
import { hasLawyer, lossChance, settlement } from '../../sim/legal';
import { OTHER_SPENDING, RUNNING_COSTS, companyValue, monthlyNet, dividendDue, dividendReserve, loanPayment, maxLoan, monthlyCosts, outlook, runningCosts, runningResult } from '../../sim/economy';
import { buildingOf, employeesWithDesk } from '../../sim/office';
import type { GameState, Ledger, MonthlyReport } from '../../sim/state';
import { Empty, Panel, TOOLTIP_STYLE } from '../components';
import { formatCompact, formatMoney, formatMonthYear, formatPercent } from '../format';
import { useGame, useGameStore } from '../store';

const LEDGER_LABELS: Partial<Record<keyof Ledger, string>> = {
  salaries: 'Salaries',
  rent: 'Rent',
  licenseFees: 'License fees',
  production: 'TV episode budgets',
  titles: 'Airings of bought titles',
  royalties: 'Music royalties',
  newsVans: 'News van trips',
  streaming: 'Streaming service',
  loanPayments: 'Loan repayments',
  purchases: 'Furniture & licenses bought',
  severance: 'Severance and signing fees',
  training: 'Courses for staff',
  revamps: 'Show revamps',
  marketing: 'Marketing campaigns',
  content: 'Sports rights',
  sponsorPenalties: 'Sponsor penalties',
  events: 'Your own events',
  renewals: 'License renewal rounds',
  legal: 'Lawsuits and legal costs',
  fines: 'Fines of the broadcasting authority',
};

/**
 * What the company earns, in its four parts: ads at the plain rate, what
 * sponsors add to the rate of the shows they are on, teleshopping fees, and
 * what subscribers pay for the streaming service (0.18.0).
 */
function IncomeRows({ ads, sponsors, fees, votes, subscriptions, merchandise, sold, lets, when }: { ads: number; sponsors: number; fees: number; votes: number; subscriptions: number; merchandise: number; sold: number; lets: number; when: string }) {
  return (
    <>
      <tr><th scope="row">Ad revenue, {when}</th><td className="num"><Money value={ads} /></td></tr>
      {sponsors > 0 && <tr><th scope="row" title="A sponsor raises the ad rate of the show it is on">Sponsors on top of the ads</th><td className="num"><Money value={sponsors} /></td></tr>}
      {fees > 0 && <tr><th scope="row">Teleshopping fees</th><td className="num"><Money value={fees} /></td></tr>}
      {votes > 0 && <tr><th scope="row" title="Viewers paying to vote on game shows and reality TV (call centre)">Phone votes</th><td className="num"><Money value={votes} /></td></tr>}
      {subscriptions > 0 && <tr><th scope="row">Streaming subscriptions</th><td className="num"><Money value={subscriptions} /></td></tr>}
      {merchandise > 0 && <tr><th scope="row" title="Tapes, toys, shirts and mugs from your own shows (Sales)">Merchandise</th><td className="num"><Money value={merchandise} /></td></tr>}
      {sold > 0 && <tr><th scope="row" title="Your share of the ads that shows you sold to other channels earn there (Sales)">Shows sold</th><td className="num"><Money value={sold} /></td></tr>}
      {lets > 0 && <tr><th scope="row" title="Rent from tenants of studios you let out (Sales)">Studios let out</th><td className="num"><Money value={lets} /></td></tr>}
    </>
  );
}

/** Of a month's revenue, what the ads brought at the plain rate: the rest is the sponsors', teleshopping's and the subscribers'. */
const adsOf = (ledger: Ledger) => ledger.revenue - (ledger.sponsorRevenue ?? 0) - (ledger.fees ?? 0) - (ledger.votes ?? 0) - (ledger.subscriptions ?? 0) - (ledger.merchandise ?? 0) - (ledger.showSales ?? 0) - (ledger.studioLets ?? 0);

function Money({ value, signed }: { value: number; signed?: boolean }) {
  const rounded = Math.round(value);
  // Avoid "-€0" for amounts that round to zero.
  const text = formatMoney(rounded === 0 ? 0 : rounded);
  return <span className={rounded < 0 ? 'negative' : undefined}>{signed && rounded > 0 ? `+${text}` : text}</span>;
}

export function FinanceScreen() {
  const game = useGame();
  const costs = monthlyCosts(game);
  const ahead = outlook(game);
  const { ledger } = game;
  const spent = OTHER_SPENDING.filter((key) => ledger[key] !== 0);

  return (
    <div className="stack">
      <div className="two-col">
        <Panel title="The month ahead" help="money" actions={<span className="muted small">As the company stands today</span>}>
          <table className="data-table">
            <tbody>
              <IncomeRows ads={ahead.income - ahead.sponsors - ahead.fees - ahead.votes - ahead.subscriptions - ahead.merchandise - ahead.sold - ahead.lets} sponsors={ahead.sponsors} fees={ahead.fees} votes={ahead.votes} subscriptions={ahead.subscriptions} merchandise={ahead.merchandise} sold={ahead.sold} lets={ahead.lets} when="at yesterday’s rate" />
              <tr><th scope="row">Salaries</th><td className="num"><Money value={-costs.salaries} /></td></tr>
              <tr><th scope="row">Rent</th><td className="num"><Money value={-costs.rent} /></td></tr>
              <tr><th scope="row">License fees</th><td className="num"><Money value={-costs.licenseFees} /></td></tr>
              {ahead.episodes > 0 && <tr><th scope="row">TV episode budgets</th><td className="num"><Money value={-ahead.episodes} /></td></tr>}
              {ahead.titles > 0 && <tr><th scope="row">Airings of bought titles</th><td className="num"><Money value={-ahead.titles} /></td></tr>}
              {ahead.royalties > 0 && <tr><th scope="row" title="A share of what your Top 40, rock and classical shows earn">Music royalties</th><td className="num"><Money value={-ahead.royalties} /></td></tr>}
              {ahead.newsVans > 0 && <tr><th scope="row" title="Each day a crewed news van goes out">News van trips</th><td className="num"><Money value={-ahead.newsVans} /></td></tr>}
              {ahead.streaming > 0 && <tr><th scope="row">Streaming service</th><td className="num"><Money value={-ahead.streaming} /></td></tr>}
              {ahead.loan > 0 && <tr><th scope="row">Loan repayment</th><td className="num"><Money value={-ahead.loan} /></td></tr>}
              <tr className="total"><th scope="row">Running costs</th><td className="num"><Money value={-ahead.costs} /></td></tr>
              <tr className="total result">
                <th scope="row">{ahead.result >= 0 ? 'Profit a month, as it runs' : 'Loss a month, as it runs'}</th>
                <td className="num"><Money value={ahead.result} signed /></td>
              </tr>
              {ahead.campaigns > 0 && (
                <>
                  <tr><th scope="row">Marketing campaigns and social media, while they run</th><td className="num"><Money value={-ahead.campaigns} /></td></tr>
                  <tr className="total">
                    <th scope="row">After the campaigns</th>
                    <td className="num"><Money value={ahead.result - ahead.campaigns} signed /></td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
          <p className="muted small">
            {!game.lastDay
              ? 'Nothing has been on the air yet, so there is no income to count on.'
              : ahead.result - ahead.campaigns < 0 && ahead.result >= 0
                ? 'The income covers the running costs, but not the campaigns on top: while they run, the money goes down.'
                : ahead.result >= 0
                  ? 'The income covers the running costs. What you buy on top comes out of this.'
                  : 'The income does not cover the running costs: every month costs you this much before you buy anything.'}
          </p>
        </Panel>
        <Panel title="This month so far" help="money">
          <table className="data-table">
            <tbody>
              <IncomeRows ads={adsOf(ledger)} sponsors={ledger.sponsorRevenue} fees={ledger.fees} votes={ledger.votes ?? 0} subscriptions={ledger.subscriptions} merchandise={ledger.merchandise} sold={ledger.showSales ?? 0} lets={ledger.studioLets ?? 0} when="paid daily" />
              {RUNNING_COSTS.filter((key) => ledger[key] !== 0 || key === 'salaries' || key === 'rent' || key === 'licenseFees').map((key) => (
                <tr key={key}>
                  <th scope="row">{LEDGER_LABELS[key]}</th>
                  <td className="num"><Money value={-ledger[key]} /></td>
                </tr>
              ))}
              <tr className="total result">
                <th scope="row">Running result so far</th>
                <td className="num"><Money value={runningResult(ledger)} signed /></td>
              </tr>
              {spent.map((key) => (
                <tr key={key}>
                  <th scope="row">{LEDGER_LABELS[key]}</th>
                  <td className="num"><Money value={-ledger[key]} /></td>
                </tr>
              ))}
              {ledger.gifts > 0 && <tr><th scope="row">From Uncle Tabby, for milestones</th><td className="num"><Money value={ledger.gifts} signed /></td></tr>}
              {(spent.length > 0 || ledger.gifts > 0) && (
                <tr className="total result">
                  <th scope="row">Result so far, after all spending</th>
                  <td className="num"><Money value={monthlyNet(ledger)} signed /></td>
                </tr>
              )}
              {ledger.dividends > 0 && <tr><th scope="row">Dividend to the owners</th><td className="num"><Money value={-ledger.dividends} /></td></tr>}
            </tbody>
          </table>
          <p className="muted small">
            Salaries, rent and license fees are paid every day, a bought title on each day it airs, and music royalties on what each music show earned that day.
            {spent.length === 0 && ' Nothing bought or spent besides this month.'}
            {ledger.loanProceeds > 0 && <> Borrowed this month: {formatMoney(ledger.loanProceeds)}.</>}
          </p>
        </Panel>
      </div>

      <LawsuitsPanel game={game} />

      <div className="two-col">
        <CompanyValuePanel game={game} />
        <LoanPanel game={game} />
        <DividendPanel game={game} />
      </div>

      <MoneyChart reports={game.monthlyReports} />

      <Panel title="Monthly reports" actions={<span className="muted small">Arrows compare with the month before</span>}>
        {game.monthlyReports.length === 0 ? (
          <Empty>Your first monthly report arrives on 1 February.</Empty>
        ) : (
          <MonthColumns reports={game.monthlyReports} />
        )}
      </Panel>
    </div>
  );
}

/** The lawsuits against your shows (0.19.0): what they claim, when they are heard, and the choice to settle. Not there while there are none. */
function LawsuitsPanel({ game }: { game: GameState }) {
  const run = useGameStore((s) => s.run);
  if (game.lawsuits.length === 0) return null;
  const desked = employeesWithDesk(game);
  const lawyer = hasLawyer(game, desked);
  const chance = lossChance(game, desked);
  return (
    <Panel title="Lawsuits" help="lawsuits" actions={<span className="muted small">{lawyer ? 'A lawyer defends you' : 'No lawyer: hire one on the Staff screen'}</span>}>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Show</th>
              <th scope="col">About</th>
              <th scope="col">Claim</th>
              <th scope="col">Heard</th>
              <th scope="col">Chance of losing</th>
              <th scope="col" aria-label="Settle"></th>
            </tr>
          </thead>
          <tbody>
            {game.lawsuits.map((lawsuit) => {
              const price = settlement(game, desked, lawsuit);
              return (
                <tr key={lawsuit.id}>
                  <th scope="row">{lawsuit.showName}</th>
                  <td>{lawsuit.source === 'libel' ? 'Libel' : 'An injury'}</td>
                  <td className="num">{formatMoney(lawsuit.claim)}</td>
                  <td>{formatDate(lawsuit.courtOn)}</td>
                  <td className="num">{formatPercent(chance)}</td>
                  <td>
                    <button onClick={() => run((s) => settleCase(s, lawsuit.id))} disabled={game.money < price} title={`Pay ${formatMoney(price)} now and the case is over`}>
                      Settle for {formatMoney(price)}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Lose in court and you pay the claim and {formatPercent(LEGAL.costs)} on top, and the channel’s name suffers; win and you pay only the {formatPercent(LEGAL.costs)}. Settling costs {formatPercent(LEGAL.settle.alone)} of the claim, or {formatPercent(LEGAL.settle.lawyer)} with a lawyer.
      </p>
    </Panel>
  );
}

const SHOWN_MONTHS = 12;

/** The last year of monthly reports side by side, oldest first, scrolled to the newest. */
function MonthColumns({ reports }: { reports: MonthlyReport[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const first = Math.max(0, reports.length - SHOWN_MONTHS);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, [reports.length]);

  return (
    <div className="ledger-scroll" ref={scroller} tabIndex={0} role="group" aria-label="Monthly reports, oldest first">
      {reports.slice(first).map((report, i) => (
        <MonthColumn key={`${report.year}-${report.month}`} report={report} previous={reports[first + i - 1]} />
      ))}
    </div>
  );
}

function MonthColumn({ report, previous }: { report: MonthlyReport; previous: MonthlyReport | undefined }) {
  // Only what was paid in either month, so a quiet month stays short.
  const paid = (keys: readonly (keyof Ledger)[]) => keys.filter((key) => report[key] !== 0 || (previous?.[key] ?? 0) !== 0);
  const other = paid(OTHER_SPENDING);
  return (
    <section className="ledger-month">
      <h3>{formatMonthYear(report.year, report.month)}</h3>
      <h4>Income</h4>
      <LedgerRow label="Ad revenue" value={adsOf(report)} before={previous && adsOf(previous)} higherIsBetter />
      {(report.sponsorRevenue > 0 || (previous?.sponsorRevenue ?? 0) > 0) && <LedgerRow label="Sponsors on top" value={report.sponsorRevenue} before={previous?.sponsorRevenue} higherIsBetter />}
      {(report.fees > 0 || (previous?.fees ?? 0) > 0) && <LedgerRow label="Teleshopping fees" value={report.fees} before={previous?.fees} higherIsBetter />}
      {((report.votes ?? 0) > 0 || (previous?.votes ?? 0) > 0) && <LedgerRow label="Phone votes" value={report.votes ?? 0} before={previous?.votes} higherIsBetter />}
      {(report.subscriptions > 0 || (previous?.subscriptions ?? 0) > 0) && <LedgerRow label="Streaming subscriptions" value={report.subscriptions} before={previous?.subscriptions} higherIsBetter />}
      {((report.merchandise ?? 0) > 0 || (previous?.merchandise ?? 0) > 0) && <LedgerRow label="Merchandise" value={report.merchandise ?? 0} before={previous?.merchandise} higherIsBetter />}
      {((report.showSales ?? 0) > 0 || (previous?.showSales ?? 0) > 0) && <LedgerRow label="Shows sold" value={report.showSales ?? 0} before={previous?.showSales} higherIsBetter />}
      {((report.studioLets ?? 0) > 0 || (previous?.studioLets ?? 0) > 0) && <LedgerRow label="Studios let out" value={report.studioLets ?? 0} before={previous?.studioLets} higherIsBetter />}
      <h4>Running costs</h4>
      {paid(RUNNING_COSTS).map((key) => (
        <LedgerRow key={key} label={LEDGER_LABELS[key]!} value={-report[key]} before={previous && -previous[key]} higherIsBetter />
      ))}
      <LedgerRow className="sum" label="Total running costs" value={-runningCosts(report)} before={previous && -runningCosts(previous)} higherIsBetter />
      <LedgerRow
        className="sum result"
        label={runningResult(report) >= 0 ? 'Running profit' : 'Running loss'}
        value={runningResult(report)}
        before={previous && runningResult(previous)}
        higherIsBetter
      />
      {other.length > 0 && (
        <>
          <h4>Bought and spent besides</h4>
          {other.map((key) => (
            <LedgerRow key={key} label={LEDGER_LABELS[key]!} value={-report[key]} before={previous && -previous[key]} higherIsBetter />
          ))}
        </>
      )}
      <h4>The month</h4>
      {report.gifts > 0 && <LedgerRow label="From Uncle Tabby" value={report.gifts} />}
      <LedgerRow className="sum" label="Result after all spending" value={report.net} before={previous?.net} higherIsBetter />
      {report.dividends > 0 && <LedgerRow label="Dividend paid" value={-report.dividends} />}
      <LedgerRow label="Money at month-end" value={report.balance} before={previous?.balance} higherIsBetter />
    </section>
  );
}

/** One line of a monthly report; the arrow shows whether the amount rose or fell and its color whether that is good. */
function LedgerRow({ label, value, before, higherIsBetter, className }: {
  label: string;
  value: number;
  before?: number;
  higherIsBetter?: boolean;
  className?: string;
}) {
  const change = before === undefined ? 0 : Math.round(value) - Math.round(before);
  const trend = change === 0 ? 'flat' : `${change > 0 ? 'up' : 'down'} ${change > 0 === Boolean(higherIsBetter) ? 'better' : 'worse'}`;
  return (
    <div className={className ? `ledger-row ${className}` : 'ledger-row'}>
      <span>{label}</span>
      {before === undefined ? <span /> : <span className={`trend ${trend}`} role="img" aria-label={change === 0 ? 'unchanged' : change > 0 ? 'up' : 'down'} />}
      <Money value={value} />
    </div>
  );
}

/** Money in the bank at each month-end, with the month's result as bars. */
function MoneyChart({ reports }: { reports: MonthlyReport[] }) {
  if (reports.length < 2) return null;
  const data = reports.map((r) => ({ month: `${r.month}/${r.year}`, label: formatMonthYear(r.year, r.month), balance: Math.round(r.balance), net: Math.round(r.net) }));
  const every = Math.max(1, Math.ceil(data.length / 8));
  return (
    <Panel title="Money over time" actions={<span className="muted small">Line: money at month-end · bars: the month’s result</span>}>
      <div className="chart">
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" interval={every - 1} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} stroke="var(--border)" />
            <YAxis tickFormatter={(v: number) => `€${formatCompact(v)}`} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} stroke="var(--border)" width={64} />
            <Tooltip
              formatter={(value, name) => [formatMoney(Number(value)), name === 'balance' ? 'Money' : 'Result']}
              labelFormatter={(_, items) => items[0]?.payload.label ?? ''}
              contentStyle={TOOLTIP_STYLE}
            />
            <ReferenceLine y={0} stroke="var(--text-muted)" />
            <Bar dataKey="net" fill="var(--chart-bar)" isAnimationActive={false} />
            <Line dataKey="balance" stroke="var(--accent)" strokeWidth={3} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

/** What the owners have taken out so far (the company's score) and what they'd take this January. */
function DividendPanel({ game }: { game: GameState }) {
  const due = dividendDue(game);
  return (
    <Panel title="Dividends" help="dividends">
      <div className="big-number">{formatMoney(game.dividendsPaid)}</div>
      <p className="muted small">
        Paid to the owners so far. Every 1 January they take {Math.round(DIVIDEND.payout * 100)}% of the cash above a
        reserve of {DIVIDEND.reserveMonths} months of running costs ({formatMoney(dividendReserve(game))} today), so
        money you don’t reinvest leaves the company.
      </p>
      <p>
        {due > 0 ? <>On 1 January, after December’s bills: about <strong>{formatMoney(due)}</strong>.</> : 'Nothing is due while your cash is below the reserve.'}
      </p>
      <p className="muted small">A dividend is money taken out of the company. It is your score, not a cost.</p>
      {isUnlocked(game, 'events') && (
        <p className="muted small">
          Your other score is <strong>{game.prestige} prestige</strong>, earned by staging events on the Marketing screen. It makes hosts want to work for you.
        </p>
      )}
    </Panel>
  );
}

function CompanyValuePanel({ game }: { game: GameState }) {
  const value = companyValue(game);
  const nextFloor = game.floorsUnlocked + 1;
  const needed = nextFloor <= buildingOf(game).floors ? FLOOR_LEVEL[nextFloor] : undefined;
  return (
    <Panel title="Company value" help="dividends">
      <div className="big-number">{formatMoney(value)}</div>
      <p className="muted small">
        Money, furniture (at resale value), licenses (at purchase price) and {LOAN.revenueMonths} months of average
        revenue, minus what you still owe the bank.
      </p>
      {needed !== undefined && (
        <p className="small">
          Floor {nextFloor} of the office opens at company level {needed}.
        </p>
      )}
    </Panel>
  );
}

function LoanPanel({ game }: { game: GameState }) {
  const run = useGameStore((s) => s.run);
  const limit = maxLoan(game);
  const [amount, setAmount] = useState(Math.min(50_000, limit));
  const [months, setMonths] = useState(LOAN.terms[0]!);
  const loan = game.loan;

  if (loan) {
    return (
      <Panel title="Your loan">
        <dl className="facts">
          <dt>Borrowed</dt>
          <dd>{formatMoney(loan.amount)}</dd>
          <dt>Still owed</dt>
          <dd>{formatMoney(loan.balance)}</dd>
          <dt>Monthly payment</dt>
          <dd>{formatMoney(loan.monthlyPayment)} · {loan.monthsLeft} months left</dd>
        </dl>
        <button onClick={() => run((s) => repayLoan(s))} disabled={game.money < loan.balance}>
          Pay off now · {formatMoney(loan.balance)}
        </button>
      </Panel>
    );
  }

  return (
    <Panel title="Bank loan" help="loans">
      <p className="muted small">
        Borrow up to half your company value at {LOAN.monthlyRate * 100}% interest a month. One loan at a time; you can
        pay it off early without a fee.
      </p>
      {limit < LOAN.minAmount ? (
        <Empty>The bank won’t lend yet: your company is worth too little.</Empty>
      ) : (
        <form
          className="stack-sm"
          onSubmit={(e) => {
            e.preventDefault();
            run((s) => takeLoan(s, amount, months));
          }}
        >
          <label>
            Amount: {formatMoney(amount)}
            <input
              type="range"
              min={LOAN.minAmount}
              max={limit}
              step={5_000}
              value={Math.min(amount, limit)}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </label>
          <label>
            Term
            <select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
              {LOAN.terms.map((t) => <option key={t} value={t}>{t} months</option>)}
            </select>
          </label>
          <p className="small">
            You’d pay <strong>{formatMoney(loanPayment(Math.min(amount, limit), months))}</strong> a month for {months} months.
          </p>
          <button className="primary" type="submit">Take the loan</button>
        </form>
      )}
    </Panel>
  );
}
