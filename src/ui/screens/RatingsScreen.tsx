import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AUDIENCES, REGIONS, SLOT_NAMES, SLOTS } from '../../config/world';
import { listenersByOwner } from '../../sim/broadcast';
import { formatDate } from '../../sim/calendar';
import { PLAYER, type GameState, type WeeklyReport } from '../../sim/state';
import type { Medium } from '../../config/world';
import { Empty, Meter, Panel, Tag, TOOLTIP_STYLE } from '../components';
import { formatCompact, formatCount, formatMoney, formatPercent } from '../format';
import { useGame } from '../store';

const avgListeners = (slots: { listeners: number }[]) => slots.reduce((s, x) => s + x.listeners, 0) / slots.length;

function ownerName(game: GameState, ownerId: string): string {
  return ownerId === PLAYER ? game.companyName : game.rivals.find((r) => r.id === ownerId)?.name ?? 'Unknown';
}

export function RatingsScreen() {
  const game = useGame();
  const reports = game.weeklyReports;
  const latest = reports[reports.length - 1];

  if (!latest) {
    return (
      <Panel title="Ratings" help="ratings">
        <Empty>The first weekly ratings arrive on Monday.</Empty>
      </Panel>
    );
  }

  const hasTv = game.channels.some((c) => c.medium === 'tv');
  return (
    <div className="stack">
      <div className={hasTv ? 'two-col' : undefined}>
        <MarketOverview game={game} report={latest} medium="radio" />
        {hasTv && <MarketOverview game={game} report={latest} medium="tv" />}
      </div>
      {reports.length > 1 && <TrendChart game={game} reports={reports} medium="radio" />}
      {reports.length > 1 && hasTv && <TrendChart game={game} reports={reports} medium="tv" />}
      <Breakdown game={game} report={latest} medium="radio" />
      {hasTv && <Breakdown game={game} report={latest} medium="tv" />}
      <WeekTable report={latest} medium="radio" />
      {hasTv && <WeekTable report={latest} medium="tv" />}
      {reports.length > 1 && <History game={game} reports={reports} hasTv={hasTv} />}
    </div>
  );
}

const PEOPLE: Record<Medium, string> = { radio: 'listeners', tv: 'viewers' };

/** Every company's listeners (or viewers), as a share of the whole market. */
function MarketOverview({ game, report, medium }: { game: GameState; report: WeeklyReport; medium: Medium }) {
  const totals = [...listenersByOwner(report, medium)].sort((a, b) => b[1] - a[1]);
  const all = totals.reduce((sum, [, n]) => sum + n, 0);
  const leader = totals[0]?.[0];
  return (
    <Panel
      title={`${medium === 'tv' ? 'TV' : 'Radio'} market · week of ${formatDate(report.fromDay)}`}
      help="ratings"
      actions={leader === PLAYER ? <Tag tone="good">You lead the market</Tag> : undefined}
    >
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Company</th>
            <th scope="col" className="num">{medium === 'tv' ? 'Viewers' : 'Listeners'} per slot</th>
            <th scope="col">Market share</th>
          </tr>
        </thead>
        <tbody>
          {totals.map(([owner, listeners], i) => (
            <tr key={owner} className={owner === PLAYER ? 'ours-row' : undefined}>
              <td>{i + 1}</td>
              <th scope="row">{ownerName(game, owner)}</th>
              <td className="num">{formatCount(listeners)}</td>
              <td>
                <span className="stat">
                  <Meter value={all > 0 ? listeners / all : 0} tone={owner === PLAYER ? 'accent' : 'green'} /> {formatPercent(all > 0 ? listeners / all : 0)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">Average {PEOPLE[medium]} per slot over the week, all channels and regions together.</p>
    </Panel>
  );
}

const LINE_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

/** Each company's listeners per slot over the last weeks. */
function TrendChart({ game, reports, medium }: { game: GameState; reports: WeeklyReport[]; medium: Medium }) {
  const owners = [...new Set(reports.flatMap((r) => [...listenersByOwner(r, medium).keys()]))].sort((a, b) => Number(b === PLAYER) - Number(a === PLAYER));
  const data = reports.map((r) => {
    const totals = listenersByOwner(r, medium);
    return { week: formatDate(r.fromDay).slice(4, -5), ...Object.fromEntries(owners.map((o) => [o, Math.round(totals.get(o) ?? 0)])) };
  });
  return (
    <Panel title={`${medium === 'tv' ? 'TV viewers' : 'Radio listeners'} per slot, last ${reports.length} weeks`}>
      <div className="chart">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="week" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} stroke="var(--border)" />
            <YAxis tickFormatter={(v: number) => formatCompact(v)} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} stroke="var(--border)" width={48} />
            <Tooltip
              formatter={(value, name) => [formatCount(Number(value)), ownerName(game, String(name))]}
              contentStyle={TOOLTIP_STYLE}
            />
            <Legend formatter={(value) => ownerName(game, String(value))} />
            {owners.map((owner, i) => (
              <Line
                key={owner}
                dataKey={owner}
                stroke={owner === PLAYER ? 'var(--accent)' : LINE_COLORS[(i - 1 + LINE_COLORS.length) % LINE_COLORS.length]}
                strokeWidth={owner === PLAYER ? 3 : 1.5}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

/** Each company's share of the listening in every region and among every audience. */
function Breakdown({ game, report, medium }: { game: GameState; report: WeeklyReport; medium: Medium }) {
  const channels = report.channels.filter((c) => c.medium === medium);
  const owners = [...listenersByOwner(report, medium)].sort((a, b) => b[1] - a[1]).map(([owner]) => owner);
  const table = <K extends string>(title: string, columns: readonly { id: K; name: string }[], pick: (c: (typeof channels)[number]) => Partial<Record<K, number>>) => {
    const total = (id: K, owner?: string) => channels.filter((c) => !owner || c.ownerId === owner).reduce((sum, c) => sum + (pick(c)[id] ?? 0), 0);
    return (
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">{title}</th>
              {columns.map((col) => <th key={col.id} scope="col" className="num">{col.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {owners.map((owner) => (
              <tr key={owner} className={owner === PLAYER ? 'ours-row' : undefined}>
                <th scope="row">{ownerName(game, owner)}</th>
                {columns.map((col) => {
                  const all = total(col.id);
                  const own = total(col.id, owner);
                  return (
                    <td key={col.id} className="num">
                      {all > 0 ? formatPercent(own / all) : '–'}
                      <div className="muted small">{formatCompact(own)}</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };
  return (
    <Panel title={`${medium === 'tv' ? 'TV' : 'Radio'} by region and audience`}>
      {table('By region', REGIONS, (c) => c.regionListeners)}
      {table('By audience', AUDIENCES, (c) => c.audienceListeners)}
      <p className="muted small">
        Each company’s share of everyone tuned in to a broadcaster, with its average {PEOPLE[medium]} per slot underneath.
      </p>
    </Panel>
  );
}

function WeekTable({ report, medium }: { report: WeeklyReport; medium: Medium }) {
  const channels = report.channels
    .filter((c) => c.medium === medium)
    .sort((a, b) => Number(b.isPlayer) - Number(a.isPlayer) || avgListeners(b.slots) - avgListeners(a.slots));
  return (
    <Panel title={`${medium === 'tv' ? 'TV' : 'Radio'} channels by slot`}>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Channel</th>
              {SLOTS.map((slot) => <th key={slot} scope="col" className="num">{SLOT_NAMES[slot]}</th>)}
              <th scope="col" className="num">Average</th>
            </tr>
          </thead>
          <tbody>
            {channels.map((c) => (
              <tr key={c.channelId} className={c.isPlayer ? 'ours-row' : undefined}>
                <th scope="row">{c.name}</th>
                {c.slots.map((slot, i) => (
                  <td key={i} className="num" title={slot.programName}>
                    {formatCount(slot.listeners)}
                    <div className="muted small">{formatPercent(slot.share)}</div>
                  </td>
                ))}
                <td className="num"><strong>{formatCount(avgListeners(c.slots))}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Average daily {PEOPLE[medium]}, with each channel’s share of everyone {medium === 'tv' ? 'watching TV' : 'listening to the radio'} in its
        regions. Hover a number to see the program.
      </p>
    </Panel>
  );
}

function History({ game, reports, hasTv }: { game: GameState; reports: WeeklyReport[]; hasTv: boolean }) {
  return (
    <Panel title="Previous weeks">
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Week of</th>
              <th scope="col" className="num">Your listeners</th>
              <th scope="col">Biggest radio rival</th>
              {hasTv && <th scope="col" className="num">Your viewers</th>}
              {hasTv && <th scope="col">Biggest TV rival</th>}
              <th scope="col" className="num">Your ad revenue</th>
            </tr>
          </thead>
          <tbody>
            {[...reports].reverse().map((r) => {
              const market = (medium: Medium) => {
                const totals = listenersByOwner(r, medium);
                const [rivalId, rival] = [...totals].filter(([id]) => id !== PLAYER).sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
                return { you: totals.get(PLAYER) ?? 0, rivalId, rival };
              };
              const radio = market('radio');
              const tv = market('tv');
              return (
                <tr key={r.fromDay}>
                  <th scope="row">{formatDate(r.fromDay)}</th>
                  <td className="num">{formatCount(radio.you)} {radio.you > radio.rival && <Tag tone="good">#1</Tag>}</td>
                  <td>{ownerName(game, radio.rivalId)} · {formatCount(radio.rival)}</td>
                  {hasTv && <td className="num">{formatCount(tv.you)} {tv.you > tv.rival && <Tag tone="good">#1</Tag>}</td>}
                  {hasTv && <td>{ownerName(game, tv.rivalId)} · {formatCount(tv.rival)}</td>}
                  <td className="num">{formatMoney(r.channels.filter((c) => c.isPlayer).reduce((s, c) => s + c.revenue, 0))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
