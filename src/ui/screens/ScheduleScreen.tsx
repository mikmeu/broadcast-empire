import { useMemo, useState, type DragEvent } from 'react';
import { getGenre } from '../../config/genres';
import { AUDIENCES, SLOT_HOURS, SLOT_NAMES, SLOTS } from '../../config/world';
import { formatHours } from '../../sim/calendar';
import { scheduleShow } from '../../sim/actions';
import { channelOffAirReason, channelRegions, channelSpecialization, showQuality, simulateDay } from '../../sim/broadcast';
import type { Channel, GameState, Id } from '../../sim/state';
import { reach } from '../../sim/world';
import { Empty, LogoBadge, Meter, Panel, Tag } from '../components';
import { formatCompact, formatCount, formatPercent } from '../format';
import { useGame, useGameStore } from '../store';

export function ScheduleScreen() {
  const game = useGame();
  const [channelId, setChannelId] = useState<string | null>(null);
  const channel = game.channels.find((c) => c.id === channelId) ?? game.channels[0];
  if (!channel) {
    return (
      <Panel title="Schedule" help="schedule">
        <Empty>Start a channel on the Channels screen first.</Empty>
      </Panel>
    );
  }
  return (
    <div className="stack">
      {game.channels.length > 1 && (
        <div className="segmented" role="tablist" aria-label="Channel">
          {game.channels.map((c) => (
            <button key={c.id} role="tab" data-guide={c.medium === 'tv' ? 'schedule-tv' : undefined} aria-selected={c.id === channel.id} className={c.id === channel.id ? 'active' : undefined} onClick={() => setChannelId(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
      )}
      <ChannelSchedule key={channel.id} game={game} channel={channel} />
    </div>
  );
}

function ChannelSchedule({ game, channel }: { game: GameState; channel: Channel }) {
  const run = useGameStore((s) => s.run);
  const offAir = channelOffAirReason(game, channel);
  const regions = channelRegions(game, channel.id);
  const specialization = channelSpecialization(game, channel);
  const shows = game.shows.filter((s) => getGenre(s.genre).medium === channel.medium);
  const people = channel.medium === 'tv' ? 'viewers' : 'listeners';
  // What today's schedule would draw, for us and for the rivals: it updates as soon as a slot changes.
  const projected = useMemo(() => simulateDay(game), [game]);
  const ours = projected.channels.find((c) => c.channelId === channel.id);
  const [dragging, setDragging] = useState<Id | null>(null);
  const [over, setOver] = useState<number | 'tray' | null>(null);
  // A show that was pressed instead of dragged: the next slot that is pressed gets it.
  const [pressed, setPressed] = useState<Id | null>(null);
  const picked = shows.find((s) => s.id === pressed);
  const press = (showId: Id) => setPressed((now) => (now === showId ? null : showId));

  const startDrag = (showId: Id) => (e: DragEvent) => {
    e.dataTransfer.setData('text/plain', showId);
    e.dataTransfer.effectAllowed = 'move';
    setDragging(showId);
  };
  const endDrag = () => {
    setDragging(null);
    setOver(null);
  };
  const allow = (target: number | 'tray') => (e: DragEvent) => {
    if (!dragging) return;
    e.preventDefault();
    setOver(target);
  };
  /** Puts a show in a slot; if it came from another slot of this channel, the two shows swap. */
  const put = (slot: number, showId: Id | null) => {
    setPressed(null);
    if (!showId || channel.schedule[slot] === showId) return;
    const from = channel.schedule.indexOf(showId);
    const displaced = channel.schedule[slot] ?? null;
    if (run((s) => scheduleShow(s, channel.id, slot, showId)) && from >= 0 && displaced) run((s) => scheduleShow(s, channel.id, from, displaced));
  };
  const takeOff = (showId: Id | null) => {
    setPressed(null);
    const from = showId ? channel.schedule.indexOf(showId) : -1;
    if (from >= 0) run((s) => scheduleShow(s, channel.id, from, null));
  };
  const dropOnSlot = (slot: number) => (e: DragEvent) => {
    e.preventDefault();
    const showId = e.dataTransfer.getData('text/plain') || dragging;
    endDrag();
    put(slot, showId);
  };
  const dropOnTray = (e: DragEvent) => {
    e.preventDefault();
    const showId = e.dataTransfer.getData('text/plain') || dragging;
    endDrag();
    takeOff(showId);
  };
  // For the tutorial: the show that is waiting for a slot, and the slot that is waiting for a show.
  const waiting = shows.find((s) => !game.channels.some((c) => c.schedule.includes(s.id)));
  // Where the tutorial points: the first free slot on radio, where the day starts with the morning; on television the
  // evening while that is free, because that is when people watch.
  const EVENING = SLOTS.indexOf('evening');
  const firstEmpty = channel.medium === 'tv' && !channel.schedule[EVENING] ? EVENING : SLOTS.findIndex((_, slot) => !channel.schedule[slot]);
  // Rival channels in the same medium that broadcast in at least one of this channel's regions.
  const competitors = new Set(
    game.rivals
      .flatMap((r) => r.channels)
      .filter((rc) => rc.medium === channel.medium && rc.regionIds.some((r) => regions.includes(r)))
      .map((rc) => rc.id),
  );
  const rivals = projected.channels.filter((c) => competitors.has(c.channelId));

  return (
    <Panel
      title={
        <span className="channel-title">
          <LogoBadge logo={channel.logo} size={32} /> {channel.name} · daily schedule
        </span>
      }
      help="schedule"
      actions={
        <span className="row">
          {specialization && <Tag>{specialization}</Tag>}
          {offAir ? <Tag tone="danger">Off air: {offAir}</Tag> : <Tag tone="good">On air</Tag>}
        </span>
      }
    >
      <p className="muted small">
        The schedule repeats every day. Your channel manager fills empty slots, and shows that can’t air, with reruns.
        {channel.medium === 'tv' && ' Library programs air a different title each day, the best ones in the biggest slots.'}{' '}
        Numbers are a projection for today’s schedule: yours across {regions.length} region{regions.length === 1 ? '' : 's'}, rivals’
        across every region they broadcast in.
      </p>
      {shows.length > 0 && (
        <div className={over === 'tray' ? 'show-tray drag-over' : 'show-tray'} onDragOver={allow('tray')} onDragLeave={() => setOver(null)} onDrop={dropOnTray}>
          <span className="muted small">Drag a show into a slot, or press a show and then its slot. Drag it back here to take it off the air:</span>
          {shows.map((s) => {
            const slot = channel.schedule.indexOf(s.id);
            const elsewhere = slot < 0 ? game.channels.find((c) => c.schedule.includes(s.id)) : undefined;
            const classes = ['show-chip', slot >= 0 && 'placed', pressed === s.id && 'picked'].filter(Boolean).join(' ');
            return (
              <button
                key={s.id}
                type="button"
                className={classes}
                data-sound="select"
                data-guide={s === waiting && !picked ? 'pick-show' : undefined}
                aria-pressed={pressed === s.id}
                draggable
                onDragStart={startDrag(s.id)}
                onDragEnd={endDrag}
                onClick={() => press(s.id)}
                title={`${getGenre(s.genre).name}${getGenre(s.genre).kind === 'licensed' ? ' (library)' : ''}`}
              >
                {s.name}
                <span className="muted small"> · {slot >= 0 ? SLOT_NAMES[SLOTS[slot]!].toLowerCase() : elsewhere ? elsewhere.name : 'not scheduled'}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="schedule">
        {SLOTS.map((slotId, slot) => {
          const tunedIn = regions.reduce(
            (sum, region) => sum + AUDIENCES.reduce((s, a) => s + reach(region, channel.medium, slot, a.id, game.day), 0),
            0,
          );
          const showId = channel.schedule[slot] ?? null;
          const show = game.shows.find((s) => s.id === showId);
          const problems = show ? showQuality(game, show).problems : [];
          const result = ours?.slots[slot];
          const topRivals = [...rivals].sort((a, b) => (b.slots[slot]?.listeners ?? 0) - (a.slots[slot]?.listeners ?? 0)).slice(0, 2);

          return (
            <article
              key={slotId}
              className={over === slot ? 'slot-card drag-over' : 'slot-card'}
              onDragOver={allow(slot)}
              onDragLeave={() => setOver(null)}
              onDrop={dropOnSlot(slot)}
            >
              <header>
                <h3 title={`On the office clock: ${formatHours(SLOT_HOURS[slotId])}`}>{SLOT_NAMES[slotId]}</h3>
                <span className="muted small">{formatCompact(tunedIn)} {channel.medium === 'tv' ? 'watching' : 'listening'}</span>
              </header>
              {show ? (
                <span className="slot-show">
                  <button
                    type="button"
                    className={pressed === show.id ? 'show-chip placed picked' : 'show-chip placed'}
                    data-sound="select"
                    aria-pressed={pressed === show.id}
                    draggable
                    onDragStart={startDrag(show.id)}
                    onDragEnd={endDrag}
                    onClick={() => press(show.id)}
                    title="Drag or press to move this show"
                  >
                    {show.name}
                  </button>
                  <button type="button" className="link" onClick={() => takeOff(show.id)} aria-label={`Take “${show.name}” off the air`} title="Take off the air">
                    Take off
                  </button>
                </span>
              ) : (
                <span className="slot-empty muted small">Reruns, until a show is put here</span>
              )}
              {picked && picked.id !== showId && (
                <button type="button" className="primary" data-guide={slot === firstEmpty ? 'place-show' : undefined} onClick={() => put(slot, picked.id)} aria-label={`Put “${picked.name}” in the ${SLOT_NAMES[slotId].toLowerCase()} slot`}>
                  {!show ? 'Put it here' : channel.schedule.includes(picked.id) ? 'Swap the two' : 'Put it here instead'}
                </button>
              )}
              {problems.length > 0 && <Tag tone="danger">Can’t air: {problems[0]}</Tag>}
              {show && game.contracts.some((c) => c.showId === show.id) && <Tag tone="good">Sponsored</Tag>}

              <div className="slot-result">
                {result ? (
                  <>
                    <div className="big-number" title={result.programName}>{formatCount(result.listeners)}</div>
                    {result.titleId && <div className="muted small">{result.programName.split(': ').slice(1).join(': ')}</div>}
                    <div className="stat">
                      <Meter value={result.share} /> {formatPercent(result.share)} share
                    </div>
                  </>
                ) : (
                  <span className="muted small">Off air</span>
                )}
              </div>
              {topRivals.map((rc) => {
                const r = rc.slots[slot];
                return (
                  r && (
                    <div key={rc.channelId} className="rival-slot muted small">
                      {rc.name}: {r.programName} · {formatCount(r.listeners)}
                    </div>
                  )
                );
              })}
            </article>
          );
        })}
      </div>
      {shows.length === 0 && <Empty>Create {channel.medium === 'tv' ? 'TV ' : ''}shows on the Shows screen, then put them in slots here.</Empty>}
      <p className="muted small">Each slot shows the projected {people} and share, with the two biggest rivals in that slot underneath.</p>
    </Panel>
  );
}
