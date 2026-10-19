import { isUnlocked } from '../../sim/unlocks';
import { useEffect, useRef, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DIVIDEND, FLOOR_UNLOCK_VALUE, LOAN } from '../../config/balance';
import { repayLoan, takeLoan } from '../../sim/actions';
import { OTHER_SPENDING, RUNNING_COSTS, companyValue, monthlyNet, dividendDue, dividendReserve, loanPayment, maxLoan, monthlyCosts, outlook, runningCosts, runningResult } from '../../sim/economy';
import { buildingOf } from '../../sim/office';
import type { GameState, Ledger, MonthlyReport } from '../../sim/state';
import { Empty, Panel, TOOLTIP_STYLE } from '../components';
import { formatCompact, formatMoney, formatMonthYear } from '../format';
import { useGame, useGameStore } from '../store';

const LEDGER_LABELS: Partial<Record<keyof Ledger, string>> = {
  salaries: 'Salaries',
  rent: 'Rent',
  licenseFees: 'License fees',
  production: 'TV episode budgets',
  titles: 'Airings of bought titles',
  royalties: 'Music royalties',
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
};

/**
 * What the company earns on the air, in its three parts: ads at the plain rate,
 * what sponsors add to the rate of the shows they are on, and teleshopping fees.
 */
function IncomeRows({ ads, sponsors, fees, when }: { ads: number; sponsors: number; fees: number; when: string }) {
  return (
    <>
      <tr><th scope="row">Ad revenue, {when}</th><td className="num"><Money value={ads} /></td></tr>
      {sponsors > 0 && <tr><th scope="row" title="A sponsor raises the ad rate of the show it is on">Sponsors on top of the ads</th><td className="num"><Money value={sponsors} /></td></tr>}
      {fees > 0 && <tr><th scope="row">Teleshopping fees</th><td className="num"><Money value={fees} /></td></tr>}
    </>
  );
}

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
              <IncomeRows ads={ahead.income - ahead.sponsors - ahead.fees} sponsors={ahead.sponsors} fees={ahead.fees} when="at yesterday’s rate" />
              <tr><th scope="row">Salaries</th><td className="num"><Money value={-costs.salaries} /></td></tr>
              <tr><th scope="row">Rent</th><td className="num"><Money value={-costs.rent} /></td></tr>
              <tr><th scope="row">License fees</th><td className="num"><Money value={-costs.licenseFees} /></td></tr>
              {ahead.episodes > 0 && <tr><th scope="row">TV episode budgets</th><td className="num"><Money value={-ahead.episodes} /></td></tr>}
              {ahead.titles > 0 && <tr><th scope="row">Airings of bought titles</th><td className="num"><Money value={-ahead.titles} /></td></tr>}
              {ahead.royalties > 0 && <tr><th scope="row" title="A share of what your Top 40, rock and classical shows earn">Music royalties</th><td className="num"><Money value={-ahead.royalties} /></td></tr>}
              {ahead.loan > 0 && <tr><th scope="row">Loan repayment</th><td className="num"><Money value={-ahead.loan} /></td></tr>}
              <tr className="total"><th scope="row">Running costs</th><td className="num"><Money value={-ahead.costs} /></td></tr>
              <tr className="total result">
                <th scope="row">{ahead.result >= 0 ? 'Profit a month, as it runs' : 'Loss a month, as it runs'}</th>
                <td className="num"><Money value={ahead.result} signed /></td>
              </tr>
              {ahead.campaigns > 0 && (
                <>
                  <tr><th scope="row">Marketing campaigns, while they run</th><td className="num"><Money value={-ahead.campaigns} /></td></tr>
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
              <IncomeRows ads={ledger.revenue - ledger.sponsorRevenue - ledger.fees} sponsors={ledger.sponsorRevenue} fees={ledger.fees} when="paid daily" />
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
      <LedgerRow label="Ad revenue" value={report.revenue - (report.sponsorRevenue ?? 0) - (report.fees ?? 0)} before={previous && previous.revenue - (previous.sponsorRevenue ?? 0) - (previous.fees ?? 0)} higherIsBetter />
      {(report.sponsorRevenue > 0 || (previous?.sponsorRevenue ?? 0) > 0) && <LedgerRow label="Sponsors on top" value={report.sponsorRevenue} before={previous?.sponsorRevenue} higherIsBetter />}
      {(report.fees > 0 || (previous?.fees ?? 0) > 0) && <LedgerRow label="Teleshopping fees" value={report.fees} before={previous?.fees} higherIsBetter />}
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
        {due > 0 ? <>If the year ended today: <strong>{formatMoney(due)}</strong>.</> : 'Nothing is due while your cash is below the reserve.'}
      </p>
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
  const needed = nextFloor <= buildingOf(game).floors ? FLOOR_UNLOCK_VALUE[nextFloor] : undefined;
  return (
    <Panel title="Company value" help="dividends">
      <div className="big-number">{formatMoney(value)}</div>
      <p className="muted small">
        Money, furniture (at resale value), licenses (at purchase price) and {LOAN.revenueMonths} months of average
        revenue, minus what you still owe the bank.
      </p>
      {needed !== undefined && (
        <p className="small">
          Floor {nextFloor} of the office opens at {formatMoney(needed)}.
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
