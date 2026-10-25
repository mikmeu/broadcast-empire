import { useState } from 'react';
import { AWARDS, THEME_WEEKS, THEME_WEEK_LIMITS, type ThemeWeekKind } from '../../config/balance';
import { bookThemeWeek, cancelThemeWeek } from '../../sim/actions';
import { isAwardsYear } from '../../sim/awards';
import { formatDate, toCalendarDate } from '../../sim/calendar';
import { sportsEventIn } from '../../sim/events';
import type { Channel, GameState } from '../../sim/state';
import { specialGroups, mondayOf, rivalWeeksBetween } from '../../sim/themeWeeks';
import { themeWeekBlocker, themeWeekCost, themeWeeksIn } from '../../sim/themeWeekBooking';
import { Empty, Panel, Tag } from '../components';
import { formatMoney } from '../format';
import { useOnAir } from '../onAir';
import { useGame, useGameStore } from '../store';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKS = 52;

/** What is going on in the week that starts on a Monday, for the strip. */
function markersOf(game: GameState, startDay: number): { campaign: boolean; sport: string | null; awards: boolean } {
  const { year, month } = toCalendarDate(startDay);
  const sport = specialGroups(game, startDay).includes('Sports') ? (sportsEventIn(year) ?? sportsEventIn(year - 1) ?? sportsEventIn(year + 1))?.name ?? 'Sport' : null;
  return { campaign: specialGroups(game, startDay).includes('News & Talk'), sport, awards: isAwardsYear(year) && month === AWARDS.nightMonth };
}

/** The year ahead of each radio channel, week by week: what the world is doing, and your theme weeks and the rivals’. */
export function YearPlanner() {
  const game = useGame();
  const radio = game.channels.filter((c) => c.medium === 'radio');
  const shown = useOnAir((s) => s.channelId);
  const [chosen, setChosen] = useState<string>(radio.find((c) => c.id === shown)?.id ?? radio[0]?.id ?? '');
  const channel = radio.find((c) => c.id === chosen) ?? radio[0];

  return (
    <div className="stack">
      <Panel title="Year planner" help="theme-weeks">
        <p className="muted small">
          A theme week lifts a radio channel’s audience for seven days, and its reputation a little for longer. Each radio channel can have {THEME_WEEK_LIMITS.perYear} a calendar year, booked up to a year ahead.
          A booked week can be cancelled for the full price until it starts.
        </p>
        {!channel ? (
          <Empty>Theme weeks are for radio. Start a radio channel to plan one.</Empty>
        ) : (
          <>
            <label>
              Channel
              <select value={channel.id} onChange={(e) => setChosen(e.target.value)}>
                {radio.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <Planner key={channel.id} game={game} channel={channel} />
          </>
        )}
      </Panel>
    </div>
  );
}

function Planner({ game, channel }: { game: GameState; channel: Channel }) {
  const run = useGameStore((s) => s.run);
  const first = mondayOf(game.day);
  const mondays = Array.from({ length: WEEKS }, (_, i) => first + 7 * i);
  const announced = rivalWeeksBetween(game, first, first + 7 * WEEKS).filter((w) => w.startDay <= game.day + THEME_WEEK_LIMITS.noticeDays);
  const mine = game.themeWeeks.filter((w) => w.channelId === channel.id);
  const [picked, setPicked] = useState<number | null>(null);
  const [kind, setKind] = useState<ThemeWeekKind>('hitList');
  const left = (year: number) => THEME_WEEK_LIMITS.perYear - themeWeeksIn(game, channel.id, year).length;

  // The weeks grouped by the month their Monday falls in.
  const months: { key: string; label: string; weeks: number[] }[] = [];
  for (const monday of mondays) {
    const { year, month } = toCalendarDate(monday);
    const key = `${year}-${month}`;
    if (months[months.length - 1]?.key !== key) months.push({ key, label: `${MONTHS[month - 1]} ${year}`, weeks: [] });
    months[months.length - 1]!.weeks.push(monday);
  }

  const booked = picked === null ? undefined : mine.find((w) => w.startDay === picked);
  const blocker = picked === null ? null : themeWeekBlocker(game, channel.id, kind, picked);
  let ringed = false;

  return (
    <>
      <div className="planner-key small">
        <span className="planner-swatch campaign" /> Election campaign
        <span className="planner-swatch sport" /> World Cup or Olympics
        <span className="planner-swatch awards" /> Awards night
        <span className="planner-swatch mine" /> Your theme week
        <span className="planner-swatch rival" /> A rival’s, announced
      </div>
      <div className="planner" role="group" aria-label={`The year ahead for ${channel.name}`}>
        {months.map((month) => (
          <div key={month.key} className="planner-month">
            <h3>{month.label}</h3>
            <div className="planner-weeks">
              {month.weeks.map((monday) => {
                const marks = markersOf(game, monday);
                const own = mine.find((w) => w.startDay === monday);
                const rival = announced.filter((w) => w.startDay === monday);
                const past = monday <= game.day;
                const notes = [
                  marks.campaign && 'election campaign',
                  marks.sport,
                  marks.awards && 'awards night',
                  own && `your ${THEME_WEEKS[own.kind].name.toLowerCase()} week`,
                  ...rival.map((w) => `${w.channelName}: ${THEME_WEEKS[w.kind].name.toLowerCase()}`),
                ].filter((n): n is string => Boolean(n));
                const classes = ['planner-week', marks.campaign && 'campaign', marks.sport && 'sport', marks.awards && 'awards', own && 'mine', rival.length > 0 && 'rival', picked === monday && 'active', past && 'past'].filter(Boolean).join(' ');
                // The tutorial's ring goes on the first week that can be booked.
                const ring = !ringed && !past && !own;
                if (ring) ringed = true;
                return (
                  <button key={monday} className={classes} data-guide={ring ? 'planner-week' : undefined} disabled={past && !own} aria-pressed={picked === monday} title={`Week of ${formatDate(monday)}${notes.length ? `: ${notes.join(', ')}` : ''}`} onClick={() => setPicked(picked === monday ? null : monday)}>
                    <span className="planner-day">{toCalendarDate(monday).dayOfMonth}</span>
                    <span className="planner-note small">{notes.length ? notes.join(', ') : 'Nothing on'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {picked !== null && (
        <article className="deal-card planner-detail">
          <header>
            <h3>Week of {formatDate(picked)}</h3>
            <span className="muted small">{left(toCalendarDate(picked).year)} left in {toCalendarDate(picked).year}</span>
          </header>
          {booked ? (
            <>
              <p>
                <Tag tone="good">{THEME_WEEKS[booked.kind].name}</Tag> booked on {channel.name} for {formatMoney(booked.paid)}.
              </p>
              <button onClick={() => run((s) => cancelThemeWeek(s, booked.id))} disabled={booked.startDay <= game.day}>
                Cancel it and get {formatMoney(booked.paid)} back
              </button>
            </>
          ) : (
            <>
              <div className="choices tones" role="radiogroup" aria-label="Kind of theme week">
                {(Object.keys(THEME_WEEKS) as ThemeWeekKind[]).map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'choice active' : 'choice'} onClick={() => setKind(k)}>
                    <strong>{THEME_WEEKS[k].name}</strong>
                    <span className="small">{formatMoney(themeWeekCost(game, channel.id, k))}</span>
                  </button>
                ))}
              </div>
              <p className="muted small">
                {THEME_WEEKS[kind].shows}: ×{THEME_WEEKS[kind].lift} listeners for the week, reputation +{Math.round(THEME_WEEKS[kind].reputation * 100)} in every region, fading over the months after.
              </p>
              <button className="primary" disabled={blocker !== null} title={blocker ?? undefined} onClick={() => run((s) => bookThemeWeek(s, channel.id, kind, picked))}>
                Book the {THEME_WEEKS[kind].name.toLowerCase()} week
              </button>
              {blocker && <p className="muted small">{blocker}</p>}
            </>
          )}
        </article>
      )}
    </>
  );
}
