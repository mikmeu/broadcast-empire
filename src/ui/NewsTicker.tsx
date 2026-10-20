import { EVENTS } from '../config/balance';
import { formatDate } from '../sim/calendar';
import { electionOn, eventRightsHolder, recessionIn, sportsEventOn } from '../sim/events';
import { toCalendarDate } from '../sim/calendar';
import { PLAYER, type GameState } from '../sim/state';

/** What is going on in the world today, as short labels. */
function happeningNow(game: GameState): string[] {
  const now: string[] = [];
  const sports = sportsEventOn(game.day);
  if (sports) {
    const holder = eventRightsHolder(game, sports);
    const where = holder === PLAYER ? 'on your channels' : game.rivals.find((r) => r.id === holder)?.name;
    now.push(where ? `${sports.name} · ${holder === PLAYER ? where : `on ${where}`}` : sports.name);
  }
  if (electionOn(game.day)) now.push('Election campaign · news is up');
  if (recessionIn(toCalendarDate(game.day).year)) now.push(`Recession · ad rates −${Math.round((1 - EVENTS.recessionAdRate) * 100)}%`);
  return now;
}

/**
 * World news, in the bottom right corner: what is on now, then the latest
 * headlines, scrolling past together so they fit a small space.
 */
export function NewsTicker({ game }: { game: GameState }) {
  const now = happeningNow(game).map((text) => (
    <span key={text} className="ticker-now">{text}</span>
  ));
  const headlines = [...game.headlines].reverse();
  const items = headlines.map((h) => (
    <span key={`${h.day}:${h.text}`} className="ticker-item">
      <span className="ticker-date">{formatDate(h.day).slice(4)}</span> {h.text}
    </span>
  ));

  return (
    <section className="ticker" aria-label="News">
      <span className="ticker-label">News</span>
      <div className="ticker-window">
        {headlines.length === 0 ? (
          <>
            {now}
            <span className="ticker-item muted">No news yet. It’s a quiet start to 1970 in Etheria.</span>
          </>
        ) : (
          // The list is doubled so the loop has no gap; restarting on a new headline brings it into view.
          <div key={headlines[0]!.day} className="ticker-track" style={{ animationDuration: `${Math.max(40, headlines.length * 14)}s` }}>
            {now}
            {items}
            <span aria-hidden="true">
              {now}
              {items}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
