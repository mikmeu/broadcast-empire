import { isUnlocked } from '../sim/unlocks';
import { useEffect, useRef } from 'react';
import { SPEEDS, type Speed } from '../config/balance';
import { levelProgress } from '../sim/levels';
import { formatDate, formatHour, hourAt } from '../sim/calendar';
import { listenersByOwner } from '../sim/broadcast';
import { monthlyNet } from '../sim/economy';
import { PLAYER, type GameState } from '../sim/state';
import type { Medium } from '../config/world';
import { formatAmount, formatCount } from './format';
import { Icon, type IconName } from './Icon';
import { useGameStore } from './store';
import { clock } from './useGameLoop';

const SPEED_NAMES: Record<Speed, string> = { 0: 'Pause', 1: 'Normal speed', 2: 'Fast', 4: 'Fastest' };

/** The two windows that have a small button in the bar, not a place in the menu. */
const BAR_WINDOWS = {
  office: { label: 'Office', icon: 'construction-helmet' },
  wiki: { label: 'Wiki', icon: 'wiki' },
} as const satisfies Record<string, { label: string; icon: IconName }>;

/** The bar along the bottom of the screen: the date and time controls, the company's figures, and the Office and Wiki buttons. */
export function StatusBar({ game, open, onToggle }: { game: GameState; open: string[]; onToggle: (id: 'office' | 'wiki') => void }) {
  const attention = useGameStore((s) => s.attention);
  const speed = useGameStore((s) => s.speed);
  const setSpeed = useGameStore((s) => s.setSpeed);
  const hasTv = game.channels.some((c) => c.medium === 'tv');
  const result = Math.round(monthlyNet(game.ledger));
  const reputation = Math.round(game.reputation);

  return (
    <footer className="statusbar">
      <div className="clock" title="The date, and the time at the office: a month is one working day there, from 8 in the morning on the 1st to 10 at night on the last day. The screen turns dark when the sun is down on this clock (Settings can keep it light or dark).">
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
      <LevelBadge game={game} />
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
      <div className="statusbar-windows" role="group" aria-label="Office and wiki">
        {(['office', 'wiki'] as const).map((id) => (
          <button
            key={id}
            data-guide={`dock-${id}`}
            className={open.includes(id) ? 'bar-button active' : 'bar-button'}
            aria-pressed={open.includes(id)}
            title={BAR_WINDOWS[id].label}
            onClick={() => onToggle(id)}
          >
            <Icon name={BAR_WINDOWS[id].icon} size={20} />
            <span>{BAR_WINDOWS[id].label}</span>
            {attention.some((about) => about.split(':')[0] === id) && <span className="dot" role="img" aria-label="Something new" />}
          </button>
        ))}
      </div>
    </footer>
  );
}

/** The company level with a thin XP bar; on a narrow screen only "Lv 4" shows. */
function LevelBadge({ game }: { game: GameState }) {
  const { level, have, need, fraction } = levelProgress(game);
  return (
    <div className="level-badge" title={`Company level ${level}: ${have} / ${need} XP to level ${level + 1}`}>
      <span>Lv {level}</span>
      <div className="level-bar" aria-hidden="true"><div className="level-bar-fill" style={{ width: `${fraction * 100}%` }} /></div>
    </div>
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
