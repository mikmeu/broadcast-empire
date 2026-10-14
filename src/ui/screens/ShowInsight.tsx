// What a show's card says beyond how it is made (0.13.0): what it earns and
// what its sponsor adds, why it draws the audience it draws compared with a
// week ago, and for a programme of bought titles, how long they last and how
// fresh they stay.

import { useMemo } from 'react';
import { DAYS_PER_YEAR } from '../../config/balance';
import { getGenre } from '../../config/genres';
import { slotFactors } from '../../sim/broadcast';
import { changesSince, describeChange, settledFreshness, showEarnings, snapshotOf, titleSupply, TITLES_FOR_FULL_FRESHNESS, TITLES_LOW_DAYS } from '../../sim/insight';
import type { GameState, Show, SlotFactors } from '../../sim/state';
import { Meter, Tag } from '../components';
import { formatMoney, formatPercent } from '../format';

/** The channel and slot a show is in, if it is in one. */
function placeOf(game: GameState, show: Show): { channelId: string; slot: number } | null {
  for (const channel of game.channels) {
    const slot = channel.schedule.indexOf(show.id);
    if (slot >= 0) return { channelId: channel.id, slot };
  }
  return null;
}

/** What the show earned yesterday, and what its sponsor added. */
export function ShowEarnings({ game, show }: { game: GameState; show: Show }) {
  const earned = showEarnings(game, show.id);
  if (!earned || earned.revenue <= 0) return null;
  const month = (n: number) => formatMoney(Math.round((n * DAYS_PER_YEAR) / 12 / 100) * 100);
  return (
    <p className="small show-earnings">
      Earns <strong>{formatMoney(Math.round(earned.revenue))}</strong> a day, about {month(earned.revenue)} a month
      {earned.fee > 0 ? ': a teleshopping fee, whoever watches.' : earned.sponsor > 0 ? <>, of which {formatMoney(Math.round(earned.sponsor))} a day is what its sponsor adds to the ads.</> : '. A sponsor would add to that (Sales).'}
    </p>
  );
}

type Row = { label: string; value: number; shown: string; before?: number; tone?: 'green' | 'yellow'; title: string };

/** The parts of the show's appeal where it airs, each against a week ago, and the strongest rival in its slot. */
export function ShowAppeal({ game, show }: { game: GameState; show: Show }) {
  const place = placeOf(game, show);
  const now = useMemo(() => (place ? slotFactors(game, place.channelId)[place.slot] : null), [game, place?.channelId, place?.slot]);
  if (!place || !now) return null;
  const snap = snapshotOf(game, place.channelId, place.slot);
  const before: SlotFactors | undefined = snap && snap.showId === show.id ? snap : undefined;
  const licensed = getGenre(show.genre).kind === 'licensed';
  const rows: Row[] = [
    { label: 'Quality', value: now.quality, shown: formatPercent(now.quality), before: before?.quality, tone: 'green', title: 'Host, producers, studio and conditions; for bought titles the title that airs' },
    { label: 'Suits who is tuned in', value: now.fit, shown: formatPercent(now.fit), before: before?.fit, tone: 'green', title: 'How much the audiences tuned in to this slot like the genre, counted by what advertisers pay for them' },
    { label: licensed ? 'Freshness of the title' : 'Freshness', value: now.freshness, shown: formatPercent(now.freshness), before: before?.freshness, tone: 'yellow', title: licensed ? 'A title loses freshness with each airing and gains some back while it rests' : 'Falls a little every day; a revamp makes the show new' },
    { label: 'Channel reputation', value: now.reputation, shown: formatPercent(now.reputation), before: before?.reputation, tone: 'yellow', title: 'Moves towards the average quality of all five slots: reruns and weak shows pull it down' },
  ];
  if (now.fame > 0 || (before?.fame ?? 0) > 0) rows.push({ label: 'Host’s fame', value: now.fame / 100, shown: String(Math.round(now.fame)), before: before && before.fame / 100, tone: 'yellow', title: 'Fame makes a show more appealing; it grows while the host is on the air' });
  if (now.promotion > 0.005 || (before?.promotion ?? 0) > 0.005) rows.push({ label: 'Marketing', value: now.promotion * 2, shown: `+${formatPercent(now.promotion)}`, before: before && before.promotion * 2, tone: 'green', title: 'What campaigns add; it fades after they end' });
  if (Math.abs(now.bonus - 1) > 0.001) rows.push({ label: 'Bonus', value: Math.min(1, now.bonus - 0.5), shown: `${now.bonus > 1 ? '+' : '−'}${formatPercent(Math.abs(now.bonus - 1))}`, title: 'Specialization of the channel, sports rights and big sports events' });

  const changes = before ? changesSince(before, now).slice(0, 2) : [];
  const against = now.rival ? now.appeal / Math.max(0.0001, now.rival.appeal) : null;
  return (
    <section className="show-appeal">
      <h4>Why it draws what it draws</h4>
      <div className="quality-grid">
        {rows.map((r) => (
          <AppealRow key={r.label} row={r} />
        ))}
      </div>
      {now.rival && against !== null && (
        <p className="small">
          Strongest rival here: “{now.rival.program}” on {now.rival.channel}.{' '}
          {against >= 1.05 ? <Tag tone="good">You are ahead</Tag> : against >= 0.95 ? <Tag tone="warning">Level</Tag> : <Tag tone="danger">It draws more</Tag>}
        </p>
      )}
      <p className="muted small">
        {!before
          ? 'Arrows compare with a week ago, from the next week on.'
          : changes.length === 0
            ? 'Nothing much changed since a week ago.'
            : `Since a week ago: ${changes.map((c) => describeChange(c, before, now, licensed)).join('; ')}.`}
      </p>
    </section>
  );
}

function AppealRow({ row }: { row: Row }) {
  const moved = row.before === undefined ? 0 : row.value - row.before;
  const arrow = Math.abs(moved) < 0.005 ? '' : moved > 0 ? '▲' : '▼';
  return (
    <>
      <span className="muted" title={row.title}>{row.label}</span>
      <Meter value={Math.max(0, Math.min(1, row.value))} tone={row.tone} />
      <span className="muted">
        {row.shown}
        {arrow && <span className={moved > 0 ? 'trend-up' : 'trend-down'} aria-label={moved > 0 ? 'up since a week ago' : 'down since a week ago'}> {arrow}</span>}
      </span>
    </>
  );
}

/** For a programme of bought titles: the titles, how fresh each is, how long they last, and how many keep it fresh. */
export function ShowTitles({ game, show }: { game: GameState; show: Show }) {
  const titles = game.library.filter((t) => t.genre === show.genre).sort((a, b) => b.freshness * b.quality - a.freshness * a.quality);
  const supply = titleSupply(game).find((s) => s.genre === show.genre);
  const name = getGenre(show.genre).name.toLowerCase();
  // Programmes of one genre share its titles: each title comes round once in so many days.
  const programmes = Math.max(1, supply?.perDay ?? 1);
  const every = titles.length / programmes;
  const settles = settledFreshness(every);
  return (
    <section className="show-titles">
      <h4>The {name} in the library</h4>
      {supply && supply.perDay > 0 && (
        <p className="small">
          {supply.left === 0 ? (
            <Tag tone="danger">None left: reruns until you buy more</Tag>
          ) : supply.days <= TITLES_LOW_DAYS ? (
            <Tag tone="warning">Enough for {supply.days} more day{supply.days === 1 ? '' : 's'}</Tag>
          ) : (
            <>Enough for {supply.days} more days.</>
          )}
        </p>
      )}
      {titles.length > 0 && (
        <div className="quality-grid">
          {titles.slice(0, 8).map((t) => (
            <TitleRow key={t.id} name={t.name} freshness={t.freshness} left={t.airingsLeft} />
          ))}
        </div>
      )}
      <p className="muted small">
        A title loses freshness with every airing and gains a little back each day it rests; a stale title draws fewer viewers.{' '}
        {titles.length > 0 && every < TITLES_FOR_FULL_FRESHNESS
          ? `${titles.length} title${titles.length === 1 ? '' : 's'}${programmes > 1 ? ` for ${programmes} programmes` : ''}: each airs about every ${Math.max(1, Math.round(every))} day${Math.round(every) <= 1 ? '' : 's'} and settles at about ${formatPercent(settles)} freshness. About ${TITLES_FOR_FULL_FRESHNESS} per programme keep it fresh.`
          : titles.length > 0
            ? `${titles.length} titles taking turns keep ${programmes > 1 ? 'these programmes' : 'a daily programme'} fresh.`
            : ''}
      </p>
      {settles < 0.6 && titles.length > 0 && <Tag tone="warning">Stale titles: buy more so each one can rest</Tag>}
    </section>
  );
}

function TitleRow({ name, freshness, left }: { name: string; freshness: number; left: number }) {
  return (
    <>
      <span className="muted">{name}</span>
      <Meter value={freshness} tone="yellow" label={`Freshness ${formatPercent(freshness)}`} />
      <span className="muted">
        {formatPercent(freshness)} · {left} left
      </span>
    </>
  );
}
