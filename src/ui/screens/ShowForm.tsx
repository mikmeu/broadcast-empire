import { useState } from 'react';
import { DECOR, DRESSING, EDITORS, EPISODE_COST, EXTRA_PRODUCER, MAX_SHOWS_PER_PERSON, OFF_SPECIALTY_SKILL, REVAMP_COST, WRITERS } from '../../config/balance';
import { GENRES, getGenre, hasHost, type Genre } from '../../config/genres';
import { ROOM_TYPE_NAMES, inText, type RoomType } from '../../config/office';
import { AUDIENCES, SLOT_NAMES, SLOTS, type Medium } from '../../config/world';
import { createShow, deleteShow, revampShow, updateShow, type ShowInput } from '../../sim/actions';
import { bestFreeHost, hostSkill, hostTaken, isEdited, showLoad, showQuality, talksOnly } from '../../sim/broadcast';
import { airingsByGenre, hasRecords, isLicensed, libraryCapacity, playsRecords } from '../../sim/content';
import { royaltyShare } from '../../sim/economy';
import { isStudioReady, roomName } from '../../sim/office';
import { genreAvailable } from '../../sim/tech';
import { unlockingTech } from '../../config/tech';
import { onStrike } from '../../sim/teams';
import type { Employee, GameState, Show } from '../../sim/state';
import { Empty, Meter, Panel, Tag } from '../components';
import { formatMoney, formatPercent } from '../format';
import { Avatar } from '../Avatar';
import { Icon } from '../Icon';
import { roomPicture } from '../RoomKinds';
import { useGameStore } from '../store';
import { ShowAppeal, ShowEarnings, ShowTitles } from './ShowInsight';

function slotOf(game: GameState, showId: string): string | null {
  for (const channel of game.channels) {
    const slot = channel.schedule.indexOf(showId);
    if (slot >= 0) return `${channel.name} · ${SLOT_NAMES[SLOTS[slot]!]}`;
  }
  return null;
}

/** A show in full: what it is made of, how good it is, and the buttons to change, revamp or cancel it. */
export function ShowCard({ game, show, onEdit }: { game: GameState; show: Show; onEdit: () => void }) {
  const run = useGameStore((s) => s.run);
  const q = showQuality(game, show);
  const host = game.employees.find((e) => e.id === show.hostId);
  const slot = slotOf(game, show.id);
  const studio = show.studioId ? roomName(game, show.studioId) : 'none';
  const sponsor = game.contracts.find((c) => c.showId === show.id);
  const genre = getGenre(show.genre);
  const licensed = isLicensed(show.genre);
  const episode = EPISODE_COST[show.genre];
  const hosted = hasHost(genre);
  const writers = show.writerIds.length;
  const people = hosted ? `host ${host?.name ?? 'none'}` : `${writers === 0 ? 'no' : writers} writer${writers === 1 ? '' : 's'}`;

  return (
    <article className="show-card">
      <header>
        <div>
          <h3>
            {show.name} <Tag>{genre.medium === 'tv' ? 'TV' : 'Radio'}</Tag>
          </h3>
          <div className="muted small">
            {licensed
              ? `${genre.name} from the library · ${airingsByGenre(game).get(show.genre) ?? 0} airings left`
              : `${genre.name} · ${people} · ${show.staffIds.length} staff · studio ${studio}`}
            {episode ? ` · ${formatMoney(episode)} per episode` : ''}
          </div>
        </div>
        <div className="tags">
          {sponsor && <Tag tone="good">Sponsored by {sponsor.sponsor}</Tag>}
          {talksOnly(game, genre) && <Tag tone="warning">No sports rights: talk only</Tag>}
          {slot ? <Tag>{slot}</Tag> : <Tag tone="warning">Not scheduled</Tag>}
        </div>
      </header>
      {q.problems.length > 0 ? (
        <div className="tags">{q.problems.map((p) => <Tag key={p} tone="danger">{p}</Tag>)}</div>
      ) : licensed ? (
        <div className="quality-grid">
          <span>Best title</span>
          <Meter value={q.quality} label={`Quality ${formatPercent(q.quality)}`} />
          <span>{formatPercent(q.quality)}</span>
        </div>
      ) : (
        <div className="quality-grid">
          <span>Quality</span>
          <Meter value={q.quality} label={`Quality ${formatPercent(q.quality)}`} />
          <span>{formatPercent(q.quality)}</span>
          <span className="muted" title={hosted ? undefined : 'A show its writers make has no host: their writing counts in its place'}>{hosted ? 'Host' : 'Writers'}</span>
          <Meter value={q.host} tone="green" />
          <span className="muted">{formatPercent(q.host)}</span>
          <span className="muted">Production</span>
          <Meter value={q.production} tone="green" />
          <span className="muted">{formatPercent(q.production)}</span>
          <span className="muted" title="How up to date the studio's equipment is; halved while any of it is broken, and lower for a TV studio whose control room no technician works">Studio</span>
          <Meter value={q.studio} tone="green" />
          <span className="muted">{formatPercent(q.studio)}</span>
          <span className="muted">Freshness</span>
          <Meter value={show.freshness} tone="yellow" />
          <span className="muted">{formatPercent(show.freshness)}</span>
          <span className="muted" title="A clean studio and the morale of the host and staff">Conditions</span>
          <Meter value={q.conditions} tone="yellow" />
          <span className="muted">{formatPercent(q.conditions)}</span>
          {genre.writers && !genre.writers.lead && (
            <>
              <span className="muted" title={`Its writers make it up to ${formatPercent(WRITERS.bonus)} better, by how good they are`}>Writers</span>
              <Meter value={q.writing} tone="green" />
              <span className="muted">+{formatPercent(q.writers - 1)}</span>
            </>
          )}
          {isEdited(genre) && (
            <>
              <span className="muted" title={`Its video editor makes it up to ${formatPercent(EDITORS.bonus)} better, by how good they are`}>Editing</span>
              <Meter value={(q.edited - 1) / EDITORS.bonus} tone="green" />
              <span className="muted">+{formatPercent(q.edited - 1)}</span>
            </>
          )}
          {q.madeUp > 1 && (
            <>
              <span className="muted" title="The host is made up in a dressing room before the show">Make-up</span>
              <Meter value={1} tone="green" />
              <span className="muted">+{formatPercent(q.madeUp - 1)}</span>
            </>
          )}
          {q.recorded > 1 && (
            <>
              <span className="muted" title="Its audio engineer records jingles and promos for it in a recording booth">Jingles</span>
              <Meter value={1} tone="green" />
              <span className="muted">+{formatPercent(q.recorded - 1)}</span>
            </>
          )}
          {q.records > 1 && (
            <>
              <span className="muted" title="Record shelves in its studio give the host the records to choose from">Records</span>
              <Meter value={1} tone="green" />
              <span className="muted">+{formatPercent(q.records - 1)}</span>
            </>
          )}
          {q.audience > 1 && (
            <>
              <span className="muted" title="Audience seating in the studio lifts a sitcom, a kids' show or a game show">Studio audience</span>
              <Meter value={(q.audience - 1) * 10} tone="green" />
              <span className="muted">+{formatPercent(q.audience - 1)}</span>
            </>
          )}
        </div>
      )}
      <ShowEarnings game={game} show={show} />
      {licensed && <ShowTitles game={game} show={show} />}
      <ShowAppeal game={game} show={show} />
      <footer className="row">
        <button onClick={onEdit}><Icon name="edit" size={13} /> Edit</button>
        {!licensed && (
          <button
            onClick={() => run((s) => revampShow(s, show.id))}
            disabled={show.freshness >= 1}
            title="Resets freshness to 100%"
          >
            Revamp · {formatMoney(REVAMP_COST)}
          </button>
        )}
        <button
          className="link danger"
          onClick={() => {
            const penalty = sponsor ? ` ${sponsor.sponsor} will charge the ${formatMoney(sponsor.penalty)} penalty.` : '';
            if (window.confirm(`Cancel “${show.name}”?${penalty}`)) run((s) => deleteShow(s, show.id));
          }}
        >
          Cancel show
        </button>
      </footer>
    </article>
  );
}

export type SortId = 'radio' | 'talk' | 'tv' | 'library';

/**
 * The sorts of show, each made in its own kind of place. A channel's schedule
 * has a button to add each sort of its medium (`add` is its label there).
 */
export const SORTS: { id: SortId; medium: Medium; label: string; add: string; note: string; picture: RoomType; has: (g: Genre) => boolean }[] = [
  { id: 'radio', medium: 'radio', label: 'Live radio', add: 'Radio show', note: 'Music and a morning show, from a radio studio', picture: 'radioStudio', has: (g) => g.studio === 'radioStudio' },
  { id: 'talk', medium: 'radio', label: 'Talk radio', add: 'Radio talk show', note: 'News, call-ins and sport, from a radio talk studio', picture: 'radioTalkStudio', has: (g) => g.studio === 'radioTalkStudio' },
  { id: 'tv', medium: 'tv', label: 'Produced TV', add: 'Produced TV show', note: 'Your own shows, each from its kind of TV studio', picture: 'tvSitcomStudio', has: (g) => g.medium === 'tv' && g.kind === 'produced' },
  { id: 'library', medium: 'tv', label: 'TV from the library', add: 'From the library', note: 'Series, films and other titles you bought', picture: 'library', has: (g) => g.kind === 'licensed' },
];
const sortOf = (genre: Genre) => SORTS.find((sort) => sort.has(genre))!;
const NEW_TITLES: Record<SortId, string> = { radio: 'New radio show', talk: 'New radio talk show', tv: 'New TV show', library: 'New program from the library' };

/** Why a genre can't be made today, or null if it can: it has yet to be invented or researched, or the place it is made in is not there. */
function genreBlocker(game: GameState, genre: Genre): string | null {
  if (!genreAvailable(game, genre.id)) {
    const tech = unlockingTech(genre.id);
    return tech ? `research ${tech.name}` : `from ${genre.unlockYear}`;
  }
  if (genre.kind === 'licensed') return libraryCapacity(game) > 0 ? null : 'build a library with shelving';
  if (!game.rooms.some((r) => r.type === genre.studio)) return `build a ${inText(ROOM_TYPE_NAMES[genre.studio])}`;
  return playsRecords(genre.id) && !hasRecords(game, genre.id) ? 'no records in the library: buy them on the Content screen' : null;
}

/**
 * A new show of one sort (`sort`), or a show that is there being changed: then
 * any sort of its medium can be chosen. `onDone` gets the id of a new show.
 */
export function ShowForm({ game, show, sort: only, onDone }: { game: GameState; show: Show | null; sort?: SortId; onDone: (created?: string) => void }) {
  const run = useGameStore((s) => s.run);
  /** The studio a show of a genre gets when nothing was chosen: the one there is, if there is only one. */
  const onlyStudio = (genre: Genre) => {
    const rooms = game.rooms.filter((r) => r.type === genre.studio);
    return genre.kind === 'produced' && rooms.length === 1 ? rooms[0]!.roomId : null;
  };
  /** The sorts on offer: the one asked for, or every sort of the show's medium. */
  const sorts = show ? SORTS.filter((x) => x.medium === getGenre(show.genre).medium) : SORTS.filter((x) => x.id === (only ?? 'radio'));
  const [input, setInput] = useState<ShowInput>(() => {
    if (show) return { name: show.name, genre: show.genre, hostId: show.hostId, staffIds: show.staffIds, writerIds: show.writerIds, editorIds: show.editorIds, studioId: show.studioId };
    // A new show starts on the first genre of its sort that can be made today.
    const inSort = GENRES.filter(sorts[0]!.has);
    const first = inSort.find((g) => genreBlocker(game, g) === null) ?? inSort[0]!;
    return { name: '', genre: first.id, hostId: null, staffIds: [], writerIds: [], editorIds: [], studioId: onlyStudio(first) };
  });
  const genre = getGenre(input.genre);
  const [sortId, setSortId] = useState(() => sortOf(genre).id);
  const sort = SORTS.find((x) => x.id === sortId)!;
  const set = (patch: Partial<ShowInput>) => setInput((prev) => ({ ...prev, ...patch }));
  const pickGenre = (next: Genre) =>
    // The studio stays only if it suits the new genre; a host, staff or writers the new genre has no use for go.
    set({
      genre: next.id,
      studioId: next.studio === genre.studio && input.studioId ? input.studioId : onlyStudio(next),
      ...(next.kind === 'licensed' ? { hostId: null, staffIds: [] } : {}),
      ...(!hasHost(next) ? { hostId: null } : {}),
      ...(!next.writers ? { writerIds: [] } : {}),
      ...(!isEdited(next) ? { editorIds: [] } : {}),
    });

  const inSort = GENRES.filter(sort.has);
  const offered = inSort.filter((g) => genreBlocker(game, g) === null);
  const waiting = inSort.filter((g) => genreBlocker(game, g) !== null);
  /** The genre is one of the sort that is open, and can be made: otherwise there is nothing to create yet. */
  const chosen = offered.includes(genre);

  // Load excluding this show, so people already on it don't count against it.
  const loadElsewhere = (id: string) =>
    showLoad(game, id) - (show && (show.hostId === id || show.staffIds.includes(id) || show.writerIds.includes(id) || show.editorIds.includes(id)) ? 1 : 0);
  // Those who are free first, and among them the best for this genre. A host in the talent programme presents nothing.
  const busy = (host: Employee) => hostTaken(game, host, show?.id);
  const hosts = game.employees.filter((e) => e.role === 'host').sort((a, b) => Number(busy(a)) - Number(busy(b)) || hostSkill(b, input.genre) - hostSkill(a, input.genre));
  /** The free host who would present a genre best, said on its tile. */
  const bestHost = (g: Genre) => {
    if (!hasHost(g) || hosts.length === 0) return '';
    const best = bestFreeHost(game, g.id, show?.id);
    return best ? ` · Best host: ${best.name} ${formatPercent(hostSkill(best, g.id))}` : ' · no host free';
  };
  const staff = game.employees.filter((e) => e.role === 'production').sort((a, b) => b.skill - a.skill);
  const writerPool = game.employees.filter((e) => e.role === 'writer').sort((a, b) => b.skill - a.skill);
  const writerIds = input.writerIds ?? [];
  const editorPool = game.employees.filter((e) => e.role === 'editor').sort((a, b) => b.skill - a.skill);
  const editorIds = input.editorIds ?? [];
  const studios = game.rooms.filter((r) => r.type === genre.studio);

  const preview = showQuality(game, { id: show?.id ?? 'preview', freshness: show?.freshness ?? 1, ...input, hostId: hasHost(genre) ? input.hostId : null, writerIds, editorIds });

  return (
    <Panel title={show ? `Edit “${show.name}”` : NEW_TITLES[sorts[0]!.id]} help="shows">
      <form
        className="stack-sm show-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!chosen) return;
          const ok = run((s) => (show ? updateShow(s, show.id, input) : createShow(s, input)));
          if (ok) onDone(!show && typeof ok === 'string' ? ok : undefined);
        }}
      >
        <label>
          Name
          <input value={input.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. The Breakfast Club" />
        </label>

        {sorts.length > 1 && (
          <div className="field">
            <span className="field-label">What sort of show</span>
            <div className="choices sorts" role="radiogroup" aria-label="Sort of show">
              {sorts.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  role="radio"
                  aria-checked={x.id === sortId}
                  className={x.id === sortId ? 'choice active' : 'choice'}
                  data-guide={`sort-${x.id}`}
                  title={x.note}
                  onClick={() => {
                    setSortId(x.id);
                    // The first genre of the sort that can be made is chosen with it.
                    const first = GENRES.filter(x.has).find((g) => genreBlocker(game, g) === null);
                    if (first && !x.has(genre)) pickGenre(first);
                  }}
                >
                  {roomPicture(x.picture) && <img src={roomPicture(x.picture)} alt="" width={56} height={42} />}
                  <span>{x.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="field">
          <span className="field-label">The genre</span>
          {offered.length > 0 ? (
            <div className="choices genres" role="radiogroup" aria-label="Genre">
              {offered.map((g) => (
                <button key={g.id} type="button" role="radio" aria-checked={chosen && g.id === genre.id} className={chosen && g.id === genre.id ? 'choice active' : 'choice'} data-guide={`genre-${g.id}`} onClick={() => pickGenre(g)}>
                  <strong>{g.name}</strong>
                  <span className="small">{g.kind === 'licensed' ? `${airingsByGenre(game).get(g.id) ?? 0} airings in the library` : `${g.writers?.lead ? `No host · ${g.writers.needed} writers · ` : ''}${g.requiredStaff} producer${g.requiredStaff === 1 ? '' : 's'} · ${ROOM_TYPE_NAMES[g.studio]}${bestHost(g)}`}</span>
                </button>
              ))}
            </div>
          ) : (
            <Empty>Nothing of this sort can be made yet.</Empty>
          )}
          {waiting.length > 0 && (
            <span className="muted small">
              Not yet: {waiting.map((g) => `${g.name} (${genreBlocker(game, g)})`).join(', ')}.
            </span>
          )}
          {chosen && (
            <span className="muted small">
              {genre.kind === 'licensed' ? `Airs a ${genre.name.toLowerCase()} title from your library every day. Buy titles on the Content screen.` : ''}
              {genre.usesRights ? ' With sports broadcast rights it shows the games; without them it can only talk about sport, and fewer people watch.' : ''}
              {EPISODE_COST[genre.id] ? ` Costs ${formatMoney(EPISODE_COST[genre.id]!)} per episode.` : ''}
              {royaltyShare(game, genre.id) > 0 ? ` Pays ${Math.round(royaltyShare(game, genre.id) * 1000) / 10}% of what it earns in music royalties; record shelves in its studio make it ${formatPercent(DECOR.recordShelves)} better.` : ''}
            </span>
          )}
        </div>

        {chosen && genre.kind === 'produced' && (
          <>
            {hasHost(genre) && (
              <div className="field">
                <span className="field-label">The host</span>
                {hosts.length === 0 && <span className="muted small">Hire a host on the Staff screen.</span>}
                <div className="choices hosts" role="radiogroup" aria-label="Host">
                  {hosts.map((h) => {
                    // A host presents one show a day; the show they are on already is named.
                    const other = game.shows.find((x) => x.hostId === h.id && x.id !== show?.id);
                    const taken = busy(h);
                    const best = genresIn(h, genre.medium);
                    const star = h.specialties.includes(input.genre);
                    return (
                      <button
                        key={h.id}
                        type="button"
                        role="radio"
                        aria-checked={h.id === input.hostId}
                        className={h.id === input.hostId ? 'choice active' : 'choice'}
                        data-guide={`host-${h.id}`}
                        data-star={star || undefined}
                        disabled={taken}
                        title={`Skill ${h.skill} · ${other ? `Presents “${other.name}”` : star ? `${genre.name} is their genre` : `Not their genre: they are at ${formatPercent(OFF_SPECIALTY_SKILL)} of their skill`}`}
                        onClick={() => set({ hostId: h.id === input.hostId ? null : h.id })}
                      >
                        <Avatar name={h.name} />
                        <strong>{h.name}</strong>
                        <span className="small">
                          {formatPercent(hostSkill(h, input.genre))}
                          {star ? ' ★' : ''} · {other ? `on “${other.name}”` : 'free'}
                        </span>
                        {best && <span className="small muted">{best}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {genre.writers && (
              <fieldset>
                <legend>
                  Writers ({writerIds.length} of the {genre.writers.needed} {genre.writers.lead ? 'it needs' : 'it can use'})
                </legend>
                {writerPool.length === 0 && <span className="muted small">Hire writers on the Staff screen, and give them places in a writers’ room.</span>}
                {writerPool.map((w) => {
                  const checked = writerIds.includes(w.id);
                  const full = loadElsewhere(w.id) >= WRITERS.showsEach;
                  return (
                    <label key={w.id} className="checkbox">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!checked && full}
                        onChange={() => set({ writerIds: checked ? writerIds.filter((id) => id !== w.id) : [...writerIds, w.id] })}
                      />
                      {w.name} · skill {w.skill} · {loadElsewhere(w.id)}/{WRITERS.showsEach} shows
                    </label>
                  );
                })}
                <span className="muted small">
                  {genre.writers.lead
                    ? `A ${genre.name.toLowerCase()} has no host: a cast plays it, and its writers count where a host would.`
                    : `Without writers it goes on the air all the same; good ones make it up to ${formatPercent(WRITERS.bonus)} better.`}
                </span>
              </fieldset>
            )}
            {isEdited(genre) && (
              <fieldset>
                <legend>Video editor ({editorIds.length === 0 ? 'none' : 'one'})</legend>
                {editorPool.length === 0 && <span className="muted small">Hire a video editor on the Staff screen, and give them an editing desk in an editing room.</span>}
                {editorPool.map((ed) => {
                  const checked = editorIds.includes(ed.id);
                  const full = loadElsewhere(ed.id) >= EDITORS.showsEach;
                  return (
                    <label key={ed.id} className="checkbox">
                      <input type="checkbox" checked={checked} disabled={!checked && full} onChange={() => set({ editorIds: checked ? [] : [ed.id] })} />
                      {ed.name} · skill {ed.skill} · {loadElsewhere(ed.id)}/{EDITORS.showsEach} shows
                    </label>
                  );
                })}
                <span className="muted small">Without one it goes on the air all the same; a good editor makes it up to {formatPercent(EDITORS.bonus)} better.{hasHost(genre) ? ` A host made up in a dressing room adds ${formatPercent(DRESSING.bonus)}.` : ''}</span>
              </fieldset>
            )}
            <fieldset>
              <legend>Production staff ({input.staffIds.length} of the {genre.requiredStaff} it needs)</legend>
              {staff.length === 0 && <span className="muted small">Hire production staff on the Staff screen.</span>}
              {staff.map((p) => {
                const checked = input.staffIds.includes(p.id);
                const full = loadElsewhere(p.id) >= MAX_SHOWS_PER_PERSON;
                return (
                  <label key={p.id} className="checkbox">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!checked && full}
                      onChange={() =>
                        set({ staffIds: checked ? input.staffIds.filter((id) => id !== p.id) : [...input.staffIds, p.id] })
                      }
                    />
                    {p.name} · skill {p.skill} · {loadElsewhere(p.id)}/{MAX_SHOWS_PER_PERSON} shows
                  </label>
                );
              })}
              <span className="muted small">Every one beyond the {genre.requiredStaff} makes the show a little better, up to {EXTRA_PRODUCER.max} more.</span>
            </fieldset>
            <div className="field">
              <span className="field-label">The studio</span>
              <div className="choices studios" role="radiogroup" aria-label="Studio">
                {studios.map((r) => (
                  <button key={r.roomId} type="button" role="radio" aria-checked={r.roomId === input.studioId} className={r.roomId === input.studioId ? 'choice active' : 'choice'} data-guide={`studio-${r.roomId}`} onClick={() => set({ studioId: r.roomId === input.studioId ? null : r.roomId })}>
                    {roomPicture(genre.studio) && <img src={roomPicture(genre.studio)} alt="" width={56} height={42} />}
                    <strong>{r.name}</strong>
                    {!isStudioReady(game, r) && <span className="small">not ready yet</span>}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* What the show will be and the button that makes it stay in sight, however long the form is. */}
        <div className="form-actions">
        <div className="preview">
          {!chosen ? (
            <span className="muted small">Choose a genre first.</span>
          ) : preview.problems.length > 0 ? (
            <span className="muted small">Still needed: {preview.problems.join(', ').toLowerCase()}.</span>
          ) : (
            <span className="stat">
              Expected quality <Meter value={preview.quality} /> {formatPercent(preview.quality)}
            </span>
          )}
        </div>

        <div className="row">
          <button className="primary" type="submit" disabled={!chosen} data-guide={show ? undefined : 'create-show'}>{show ? 'Save show' : 'Create show'}</button>
          <button type="button" onClick={() => onDone()}>Cancel</button>
        </div>
        </div>
      </form>
    </Panel>
  );
}

/** The genres of a medium a host is best at, as a line of text ("Top 40, rock"), or '' if none. */
export function genresIn(host: Pick<Employee, 'specialties'>, medium: Medium): string {
  const names = host.specialties.map(getGenre).filter((g) => g.medium === medium).map((g) => g.name);
  return names.map((name, i) => (i === 0 ? name : name.charAt(0).toLowerCase() + name.slice(1))).join(', ');
}

/** Why a host is not at their best today, said after their name, or null. */
function hostStatus(game: GameState, host: Employee): string | null {
  if (onStrike(game, host)) return 'on strike';
  if (host.leaving) {
    const days = Math.max(0, host.leaving.on - game.day);
    return `leaving in ${days} day${days === 1 ? '' : 's'}`;
  }
  if (host.talentUntil != null) return 'in the talent programme';
  if (host.trainingUntil != null) return 'on a course';
  return null;
}

/**
 * The hosts beside a channel's schedule (0.17.0): their skill, the genres of
 * its medium they are best at, and the show they present. For reading only.
 * A host with no genre of the medium is left out unless they present a show
 * of it; with hosts but none for the medium, the panel is not there.
 */
export function HostGuide({ game, medium }: { game: GameState; medium: Medium }) {
  const all = game.employees.filter((e) => e.role === 'host');
  const showOf = (host: Employee) => game.shows.find((s) => s.hostId === host.id);
  const hosts = all
    .filter((h) => {
      const on = showOf(h);
      return genresIn(h, medium) !== '' || (on !== undefined && getGenre(on.genre).medium === medium);
    })
    .sort((a, b) => Number(hostTaken(game, a)) - Number(hostTaken(game, b)) || b.skill - a.skill);
  if (all.length > 0 && hosts.length === 0) return null;
  return (
    <Panel title="Your hosts" help="hosts">
      {hosts.length === 0 ? (
        <p className="muted small">Hire a host on the Staff screen.</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Host</th>
                <th scope="col">Skill</th>
                <th scope="col">Best at</th>
                <th scope="col">Presents</th>
              </tr>
            </thead>
            <tbody>
              {hosts.map((h) => {
                const status = hostStatus(game, h);
                const on = showOf(h);
                return (
                  <tr key={h.id}>
                    <th scope="row">
                      {h.name}
                      {status && <span className="muted small"> · {status}</span>}
                    </th>
                    <td>
                      <span className="stat"><Meter value={h.skill / 100} label={`Skill ${h.skill}`} /> {h.skill}</span>
                    </td>
                    <td>{genresIn(h, medium) || <span className="muted">none</span>}</td>
                    <td>{on ? on.name : <span className="muted">free</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

const FIT_LABEL = (fit: number) => (fit >= 1 ? 'High' : fit >= 0.6 ? 'Mid' : 'Low');

/** How much each audience likes each genre of a medium. */
export function GenreGuide({ medium }: { medium: Medium }) {
  return (
    <Panel title={medium === 'tv' ? 'Who watches what' : 'Who listens to what'} help="genres">
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Genre</th>
              {AUDIENCES.map((a) => <th key={a.id} scope="col">{a.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {GENRES.filter((g) => g.medium === medium).map((g) => (
              <tr key={g.id}>
                <th scope="row">{g.name}</th>
                {AUDIENCES.map((a) => (
                  <td key={a.id} className={`fit fit-${FIT_LABEL(g.fit[a.id]).toLowerCase()}`}>{FIT_LABEL(g.fit[a.id])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        {medium === 'tv'
          ? 'TV is all about the evening: more than half of every audience watches then.'
          : 'Morning has the most radio listeners, especially workers and families. Late night belongs to students and teens.'}
      </p>
    </Panel>
  );
}
