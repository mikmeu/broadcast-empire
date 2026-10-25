import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { channelName, saleOf } from '../../sim/deals';
import { getGenre } from '../../config/genres';
import { AUDIENCES, SLOT_HOURS, SLOT_NAMES, SLOTS } from '../../config/world';
import { formatHours } from '../../sim/calendar';
import { scheduleShow } from '../../sim/actions';
import { channelOffAirReason, channelRegions, channelSpecialization, scheduledChannels, showQuality, simulateDay } from '../../sim/broadcast';
import type { Channel, GameState, Id, Show } from '../../sim/state';
import { reach } from '../../sim/world';
import { SPECIALIZATION } from '../../config/balance';
import { isLicensed, mayAir, pickTitles } from '../../sim/content';
import { REGULATOR } from '../../config/balance';
import { bestGenres, channelGroups, slotAudience, suitability, titleSupply, TITLES_LOW_DAYS, type Suitability } from '../../sim/insight';
import { genreAvailable } from '../../sim/tech';
import { employeesWithDesk } from '../../sim/office';
import { shortOfProducers } from '../../sim/staffing';

const SUIT_TONE: Record<Suitability, 'good' | 'warning' | 'danger'> = { good: 'good', fair: 'warning', poor: 'danger' };
/** Freshness under which the title that airs is called stale on the schedule. */
const STALE = 0.5;
import { Empty, LogoBadge, Meter, Panel, Tag } from '../components';
import { formatCompact, formatCount, formatPercent } from '../format';
import { Icon } from '../Icon';
import { useGame, useGameStore } from '../store';
import { useOnAir } from '../onAir';
import { GenreGuide, HostGuide, SORTS, ShowCard, ShowForm, type SortId } from './ShowForm';

/**
 * A channel's own page: its daily schedule, the shows of its medium that are
 * in no slot, and buttons to add a show of each sort. A show that is pressed
 * is shown in full beside the schedule, where it is changed, revamped or
 * cancelled, and the slots offer to take it.
 */
export function ScheduleScreen() {
  const game = useGame();
  const channelId = useOnAir((s) => s.channelId);
  const channel = game.channels.find((c) => c.id === channelId) ?? game.channels[0];
  if (!channel) {
    return (
      <Panel title="Schedule" help="schedule">
        <Empty>Start a channel first.</Empty>
      </Panel>
    );
  }
  return <ChannelSchedule key={channel.id} game={game} channel={channel} />;
}

function ChannelSchedule({ game, channel }: { game: GameState; channel: Channel }) {
  const run = useGameStore((s) => s.run);
  const offAir = channelOffAirReason(game, channel);
  const regions = channelRegions(game, channel.id);
  const specialization = channelSpecialization(game, channel);
  const scheduler = scheduledChannels(game, employeesWithDesk(game)).get(channel.id);
  const shows =game.shows.filter((s) => getGenre(s.genre).medium === channel.medium);
  const people = channel.medium === 'tv' ? 'viewers' : 'listeners';
  // What today's schedule would draw, for us and for the rivals: it updates as soon as a slot changes.
  const projected = useMemo(() => simulateDay(game), [game]);
  const ours = projected.channels.find((c) => c.channelId === channel.id);
  const [dragging, setDragging] = useState<Id | null>(null);
  const [over, setOver] = useState<number | 'tray' | null>(null);
  // A show that was pressed instead of dragged: it is shown in full beside the schedule, and the next slot that is pressed gets it.
  const [pressed, setPressed] = useState<Id | null>(null);
  const picked = shows.find((s) => s.id === pressed);
  const press = (showId: Id) => (setEditing(null), setPressed((now) => (now === showId ? null : showId)));
  /** A show being changed, or the sort of a new one being made. The Staffing section can open the schedule with a show's form. */
  const [editing, setEditing] = useState<Show | SortId | null>(() => shows.find((s) => s.id === useOnAir.getState().editShowId) ?? null);
  useEffect(() => useOnAir.setState({ editShowId: null }), []);
  const onAirSomewhere = (showId: Id) => game.channels.some((c) => c.schedule.includes(showId)) || saleOf(game, showId) !== undefined;
  /** The shows of this medium that are in no slot, and those in a slot of another channel. */
  const unplaced = shows.filter((s) => !onAirSomewhere(s.id));
  const elsewhere = shows.filter((s) => onAirSomewhere(s.id) && !channel.schedule.includes(s.id));

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
  // For the tutorial: the show that is waiting for a slot, and the slot that is waiting for a show. Penny points at
  // the first show in no slot, in the order they were made, and then at its slot, whatever show is pressed.
  const waiting = unplaced[0];
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
  const supplies = titleSupply(game);
  // The broadcasting authority's rules (0.19.0): what would break one if the schedule stays as it is.
  const picks = pickTitles(game);
  const shopping = channel.schedule.filter((id) => game.shows.find((s) => s.id === id)?.genre === 'teleshopping').length;
  const desked = employeesWithDesk(game);
  const groups = channelGroups(game, channel);

  const chip = (s: Show, where?: string) => (
    <button
      key={s.id}
      type="button"
      className={pressed === s.id ? 'show-chip picked' : 'show-chip'}
      data-sound="select"
      data-guide={s === waiting && picked !== waiting ? 'pick-show' : undefined}
      aria-pressed={pressed === s.id}
      draggable
      onDragStart={startDrag(s.id)}
      onDragEnd={endDrag}
      onClick={() => press(s.id)}
      title={`${getGenre(s.genre).name}${getGenre(s.genre).kind === 'licensed' ? ' (library)' : ''}`}
    >
      {s.name}
      {where && <span className="muted small"> · {where}</span>}
    </button>
  );

  return (
    <div className="stack">
      <div className="schedule-bar">
        <button type="button" onClick={() => useOnAir.getState().show('channels')}>‹ All channels</button>
        <span className="row">
          {SORTS.filter((x) => x.medium === channel.medium).map((x) => (
            <button key={x.id} type="button" className={editing === x.id ? 'add-channel active' : 'add-channel'} data-guide={`add-${x.id}`} title={x.note} onClick={() => (setPressed(null), setEditing(x.id))}>
              + {x.add}
            </button>
          ))}
        </span>
      </div>
      <div className="two-col">
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
          <p className="small">
            {groups.group
              ? `Specialized in ${groups.group.toLowerCase()}: ${groups.counts[groups.group]} of ${SLOTS.length} slots, so those shows are ${formatPercent(SPECIALIZATION.bonus - 1)} more appealing${scheduler ? ` and a music scheduler makes them ${formatPercent(scheduler.bonus)} more appealing` : ''}.`
              : groups.almost
                ? `One more ${groups.almost.toLowerCase()} slot and the channel specializes: ${SPECIALIZATION.minSlots} slots of one kind make those shows ${formatPercent(SPECIALIZATION.bonus - 1)} more appealing.`
                : `${SPECIALIZATION.minSlots} slots of one kind (music, fiction, news and talk…) make those shows ${formatPercent(SPECIALIZATION.bonus - 1)} more appealing.`}
            {' '}Press a show to see how well it suits each slot.
          </p>
          {shows.length > 0 && (
            <div className={over === 'tray' ? 'show-tray drag-over' : 'show-tray'} onDragOver={allow('tray')} onDragLeave={() => setOver(null)} onDrop={dropOnTray}>
              <span className="muted small">
                {unplaced.length > 0 ? 'In no slot yet. Drag a show into a slot, or press it and then its slot; drag it back here to take it off the air:' : 'Every show is in a slot. Drag one back here to take it off the air.'}
              </span>
              {unplaced.map((s) => chip(s))}
              {elsewhere.length > 0 && <span className="muted small">On your other channels:</span>}
              {elsewhere.map((s) => chip(s, game.channels.find((c) => c.schedule.includes(s.id))?.name ?? (saleOf(game, s.id) ? `sold to ${channelName(game, saleOf(game, s.id)!)}` : undefined)))}
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
              const problems = show ? showQuality(game, show, desked).problems : [];
              const short = show ? shortOfProducers(game, show, desked) : null;
              const audience = slotAudience(game, channel, slot);
              const crowd = [...audience].sort((a, b) => b.people - a.people);
              const everyone = crowd.reduce((sum, a) => sum + a.people, 0);
              const suits = (genre: Show['genre']) => suitability(audience, genre).label;
              const supply = show && isLicensed(show.genre) ? supplies.find((s) => s.genre === show.genre) : undefined;
              const aired = ours?.slots[slot]?.titleId ? game.library.find((t) => t.id === ours.slots[slot]!.titleId) : undefined;
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
                  <div
                    className="muted small"
                    title={crowd.map((a) => `${AUDIENCES.find((x) => x.id === a.audience)!.name}: ${formatPercent(everyone ? a.people / everyone : 0)}, worth ×${a.value} to advertisers`).join('\n')}
                  >
                    Mostly {crowd.slice(0, 3).map((a) => AUDIENCES.find((x) => x.id === a.audience)!.name.toLowerCase()).join(', ')}
                  </div>
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
                    <button type="button" className="primary" data-guide={slot === firstEmpty && picked === waiting ? 'place-show' : undefined} onClick={() => put(slot, picked.id)} aria-label={`Put “${picked.name}” in the ${SLOT_NAMES[slotId].toLowerCase()} slot`}>
                      {!show ? 'Put it here' : channel.schedule.includes(picked.id) ? 'Swap the two' : 'Put it here instead'}
                    </button>
                  )}
                  {problems.length > 0 && <Tag tone="danger">Can’t air: {problems[0]}</Tag>}
                  {short && problems.length === 0 && <Tag tone="warning">Short of producers: {short.working} of {short.needed}</Tag>}
                  <div className="slot-suits">
                    {picked && picked.id !== showId && getGenre(picked.genre).medium === channel.medium ? (
                      <Tag tone={SUIT_TONE[suits(picked.genre)]}>Suits it: {suits(picked.genre)}</Tag>
                    ) : show ? (
                      <span className="muted small">Suits this slot: {suits(show.genre)}</span>
                    ) : (
                      <span className="muted small">Would suit: {bestGenres(audience, channel.medium, (id) => genreAvailable(game, id), 2).map((id) => getGenre(id).name.toLowerCase()).join(', ')}</span>
                    )}
                  </div>
                  {supply && supply.left > 0 && supply.days <= TITLES_LOW_DAYS && <Tag tone="warning">Titles for {supply.days} more day{supply.days === 1 ? '' : 's'}</Tag>}
                  {aired && aired.freshness < STALE && <Tag tone="warning">Stale titles</Tag>}
                  {picks.get(`${channel.id}:${slot}`) && !mayAir(picks.get(`${channel.id}:${slot}`)!, slot) && <Tag tone="danger">A film for adults airs here: it breaks the authority’s rules</Tag>}
                  {show?.genre === 'teleshopping' && shopping > REGULATOR.teleshoppingSlots && <Tag tone="danger">Too much teleshopping: it breaks the authority’s rules</Tag>}
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
          {shows.length === 0 && <Empty>No {channel.medium === 'tv' ? 'TV programs' : 'radio shows'} yet. Add one with the buttons above, then put it in a slot here.</Empty>}
          <p className="muted small">Each slot shows the projected {people} and share, with the two biggest rivals in that slot underneath.</p>
        </Panel>
        <div className="stack">
          {editing ? (
            <ShowForm
              key={typeof editing === 'string' ? editing : editing.id}
              game={game}
              show={typeof editing === 'string' ? null : editing}
              sort={typeof editing === 'string' ? editing : undefined}
              onDone={(created) => {
                setEditing(null);
                // A new show is pressed at once, so that the slots offer to take it.
                if (created) setPressed(created);
              }}
            />
          ) : picked ? (
            <Panel
              title="Show"
              help="shows"
              actions={
                <button type="button" className="icon-button" onClick={() => setPressed(null)} aria-label="Close" title="Close">
                  <Icon name="close-button" size={20} />
                </button>
              }
            >
              <ShowCard game={game} show={picked} onEdit={() => setEditing(picked)} />
            </Panel>
          ) : (
            <>
              <GenreGuide medium={channel.medium} />
              <HostGuide game={game} medium={channel.medium} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
