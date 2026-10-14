import { isUnlocked } from '../sim/unlocks';
import { useEffect, useRef } from 'react';
import { SPEEDS, type Speed } from '../config/balance';
import { formatDate, formatHour, hourAt } from '../sim/calendar';
import { listenersByOwner } from '../sim/broadcast';
import { monthlyNet } from '../sim/economy';
import { PLAYER, type GameState } from '../sim/state';
import type { Medium } from '../config/world';
import { formatAmount, formatCount } from './format';
import { Icon, type IconName } from './Icon';
import { NewsTicker } from './NewsTicker';
import { useGameStore } from './store';
import { clock } from './useGameLoop';

const SPEED_NAMES: Record<Speed, string> = { 0: 'Pause', 1: 'Normal speed', 2: 'Fast', 4: 'Fastest' };

/** The bar along the bottom of the screen: the date and time controls, the company's figures, and the news. */
export function StatusBar({ game }: { game: GameState }) {
  const speed = useGameStore((s) => s.speed);
  const setSpeed = useGameStore((s) => s.setSpeed);
  const hasTv = game.channels.some((c) => c.medium === 'tv');
  const result = Math.round(monthlyNet(game.ledger));
  const reputation = Math.round(game.reputation);

  return (
    <footer className="statusbar">
      <div className="clock" title="The date, and the time at the office: a month is one day there, from 8 in the morning to 10 at night">
        <Icon name="calendar" label="Date" />
        <span>{formatDate(game.day)}</span>
        <HourClock day={game.day} />
        <DayProgress />
      </div>
      <div className="speeds" role="group" aria-label="Game speed">
        {SPEEDS.map((s) => (
          <button
            key={s}
            className={s === speed ? 'speed active' : 'speed'}
            data-guide={`speed-${s}`}
            onClick={() => setSpeed(s)}
            title={`${SPEED_NAMES[s]} (${s === 0 ? 'Space' : SPEEDS.indexOf(s)})`}
            aria-label={SPEED_NAMES[s]}
            aria-pressed={s === speed}
          >
            <SpeedIcon speed={s} />
          </button>
        ))}
      </div>
      <dl className="kpis">
        <Kpi icon="euro" label="Money" value={formatAmount(game.money)} tone={game.money < 0 ? 'negative' : undefined} />
        <Kpi
          icon={result < 0 ? 'downward-trend' : 'upward-trend'}
          label="This month’s result so far"
          value={`${result > 0 ? '+' : result < 0 ? '−' : ''}${formatAmount(Math.abs(result))}`}
          tone={result < 0 ? 'negative' : result > 0 ? 'good' : undefined}
        />
        <Kpi icon="listeners" label="Listeners" value={formatCount(game.listeners)} />
        {hasTv && <Kpi icon="viewers" label="Viewers" value={formatCount(game.viewers)} />}
        {isUnlocked(game, 'research') && <Kpi icon="research" label="Research points" value={formatCount(game.researchPoints)} />}
        {game.channels.length === 0 ? (
          <Kpi icon="happy-face" label="Reputation (0–100)" value="–" />
        ) : (
          <Kpi icon={reputation < 40 ? 'sad-face' : 'happy-face'} label="Reputation (0–100)" value={`${reputation}`} tone={reputation < 40 ? 'negative' : 'good'} />
        )}
        {isUnlocked(game, 'events') && <Kpi icon="quality" label="Prestige" value={formatCount(game.prestige)} />}
        <Kpi icon="rank" label={hasTv ? 'Radio market rank' : 'Market rank'} value={marketRank(game, 'radio')} />
        {hasTv && <Kpi icon="rank" label="TV market rank" value={marketRank(game, 'tv')} />}
      </dl>
      <NewsTicker game={game} />
    </footer>
  );
}

function SpeedIcon({ speed }: { speed: Speed }) {
  const arrows = SPEEDS.indexOf(speed);
  const width = arrows === 0 ? 10 : arrows * 8 + 2;
  return (
    <svg width={width} height="10" viewBox={`0 0 ${width} 10`} aria-hidden="true">
      {arrows === 0 ? (
        <>
          <rect x="1" y="0" width="3" height="10" fill="currentColor" />
          <rect x="6" y="0" width="3" height="10" fill="currentColor" />
        </>
      ) : (
        Array.from({ length: arrows }, (_, i) => (
          <path key={i} d={`M${i * 8 + 1} 0 L${i * 8 + 9} 5 L${i * 8 + 1} 10 Z`} fill="currentColor" />
        ))
      )}
    </svg>
  );
}

/** The player's rank among radio or TV companies in the latest weekly ratings, e.g. "#2 of 5". */
function marketRank(game: GameState, medium: Medium): string {
  const report = game.weeklyReports[game.weeklyReports.length - 1];
  if (!report || !game.channels.some((c) => c.medium === medium)) return '–';
  const totals = [...listenersByOwner(report, medium)].sort((a, b) => b[1] - a[1]);
  const rank = totals.findIndex(([owner]) => owner === PLAYER) + 1;
  return rank > 0 ? `#${rank} of ${totals.length}` : '–';
}

/** One field of the status bar: an icon that says what it is, and the value. */
function Kpi({ icon, label, value, tone }: { icon: IconName; label: string; value: string; tone?: 'good' | 'negative' }) {
  return (
    <div className="kpi" title={label}>
      <dt><Icon name={icon} label={label} /></dt>
      <dd className={tone}>{value}</dd>
    </div>
  );
}

/**
 * The time at the office (see OFFICE_DAY): it moves on within a game day, so it
 * is written outside React, and only when the five minutes it shows change.
 */
function HourClock({ day }: { day: number }) {
  const text = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      const now = formatHour(hourAt(day, clock.dayProgress));
      if (text.current && text.current.textContent !== now) text.current.textContent = now;
      frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [day]);

  return <span ref={text} className="clock-hour" aria-label="Time at the office">{formatHour(hourAt(day))}</span>;
}

/** Updated outside React every frame, so the bar moves smoothly without re-rendering. */
function DayProgress() {
  const fill = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      if (fill.current) fill.current.style.transform = `scaleX(${clock.dayProgress})`;
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="day-progress" aria-hidden="true">
      <div ref={fill} className="day-progress-fill" />
    </div>
  );
}
