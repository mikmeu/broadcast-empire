import { Fragment } from 'react';
import { getGenre } from '../../config/genres';
import { SLOT_NAMES, SLOTS } from '../../config/world';
import { employeesWithDesk } from '../../sim/office';
import { crewReport, freeHands, studioDays, type Crew, type ShowCrew, type StudioDay } from '../../sim/staffing';
import type { Employee, GameState, Role } from '../../sim/state';
import { Empty, Panel, Tag } from '../components';
import { useOnAir } from '../onAir';
import { useGame } from '../store';

/** What a group of free people is called. */
const FREE_ROLES: Partial<Record<Role, string>> = { host: 'Hosts without a show', production: 'Producers', writer: 'Writers', editor: 'Video editors' };

/**
 * Who makes what, in one place (0.17.0): each studio's day, every produced show
 * with its host and crew and whether it has the producers it needs, and the
 * people who could take on another show. For when new people arrive and shows
 * are shuffled; the changes are made on the schedule.
 */
export function StaffingScreen() {
  const game = useGame();
  const desked = employeesWithDesk(game);
  const crews = crewReport(game, desked);
  const studios = studioDays(game);
  const free = freeHands(game);
  return (
    <div className="stack">
      <Panel title="Studios" help="studios">
        {studios.length === 0 ? (
          <Empty>No studios yet. Build one in the office.</Empty>
        ) : (
          <>
            <p className="muted small">The show in each studio in every slot of the day, and its channel. A studio makes one show per slot.</p>
            <div className="table-scroll studio-grid">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Studio</th>
                    {SLOTS.map((slot) => (
                      <th key={slot} scope="col">{SLOT_NAMES[slot]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {studios.map((day) => (
                    <tr key={day.room.roomId}>
                      <th scope="row">
                        {day.room.name}
                        <div className="muted small">{day.tv ? 'Television' : 'Radio'}</div>
                      </th>
                      {day.slots.map((cell, slot) => (
                        <td key={slot}>{cell ? <SlotCell show={cell.show.name} channel={cell.channel.name} /> : <span className="muted small">Free</span>}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="studio-list">
              {studios.map((day) => (
                <StudioList key={day.room.roomId} day={day} />
              ))}
            </div>
            {studios.some((d) => d.unscheduled.length > 0) && (
              <p className="muted small">
                Made in a studio but in no slot:{' '}
                {studios
                  .filter((d) => d.unscheduled.length > 0)
                  .map((d) => `${d.unscheduled.map((s) => `“${s.name}”`).join(', ')} (${d.room.name})`)
                  .join('; ')}
                .
              </p>
            )}
          </>
        )}
      </Panel>
      <div className="two-col">
        <Panel title="Shows" help="shows">
          {crews.length === 0 ? (
            <Empty>No produced shows yet. Make one on the schedule of a channel.</Empty>
          ) : (
            <>
              <p className="muted small">Who makes each show. Producers count when they are at a desk: with fewer than the genre needs, the show’s production drops in proportion.</p>
              <div className="stack-sm">
                {crews.map((crew) => (
                  <CrewCard key={crew.show.id} game={game} crew={crew} />
                ))}
              </div>
            </>
          )}
        </Panel>
        <Panel title="Free to assign" help="staff">
          {free.length === 0 ? (
            <Empty>Everyone who makes shows has as many as they can take.</Empty>
          ) : (
            <>
              <p className="muted small">Hosts without a show, and producers, writers and editors with room for another.</p>
              {(Object.keys(FREE_ROLES) as Role[]).map((role) => {
                const group = free.filter((f) => f.employee.role === role);
                return (
                  group.length > 0 && (
                    <div key={role} className="person-group">
                      <h3>{FREE_ROLES[role]}</h3>
                      <ul className="crew-list">
                        {group.map(({ employee, room }) => (
                          <li key={employee.id}>
                            <Person employee={employee} />
                            {role !== 'host' && <span className="muted small"> · room for {room} more</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                );
              })}
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}

function SlotCell({ show, channel }: { show: string; channel: string }) {
  return (
    <>
      {show}
      <div className="muted small">{channel}</div>
    </>
  );
}

/** One studio's day as a list, for a narrow window. */
function StudioList({ day }: { day: StudioDay }) {
  return (
    <div className="person-group">
      <h3>
        {day.room.name} <span className="muted small">· {day.tv ? 'Television' : 'Radio'}</span>
      </h3>
      <ul className="crew-list">
        {SLOTS.map((slot, i) => {
          const cell = day.slots[i];
          return (
            <li key={slot}>
              <span className="muted small">{SLOT_NAMES[slot]}:</span> {cell ? `${cell.show.name} · ${cell.channel.name}` : <span className="muted small">free</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A person's name, skill and level, and for a host the genres they are best at. */
function Person({ employee, note }: { employee: Employee; note?: string | null }) {
  return (
    <>
      <strong>{employee.name}</strong>{' '}
      <span className="muted small">
        skill {employee.skill} · level {employee.level}
        {employee.role === 'host' && employee.specialties.length > 0 && ` · best at ${employee.specialties.map((g) => getGenre(g).name.toLowerCase()).join(', ')}`}
      </span>
      {note && (
        <>
          {' '}
          <Tag tone="warning">{note}</Tag>
        </>
      )}
    </>
  );
}

/** What the tag of a show says about its producers. */
function verdictTag(crew: ShowCrew) {
  const { producers, extra, idle } = crew;
  if (crew.verdict === 'strike') return <Tag tone="danger">On strike</Tag>;
  if (crew.verdict === 'short') return <Tag tone="warning">Short: {producers.working} of {producers.needed} producers</Tag>;
  if (crew.verdict === 'more') return <Tag>{extra + idle} extra, {idle} {idle === 1 ? 'adds' : 'add'} nothing</Tag>;
  return <Tag tone="good">{extra > 0 ? `Enough, ${extra} extra` : 'Enough'}</Tag>;
}

function CrewCard({ game, crew }: { game: GameState; crew: ShowCrew }) {
  const genre = getGenre(crew.show.genre);
  // The form is on the schedule of the channel it airs on, or of the first channel of its medium.
  const channel = crew.airs[0]?.channel ?? game.channels.find((c) => c.medium === genre.medium);
  return (
    <article className="crew-card">
      <header>
        <h3>
          {crew.show.name} <span className="muted small">· {genre.name}</span>
        </h3>
        {verdictTag(crew)}
      </header>
      <div className="muted small">{crew.airs.length > 0 ? crew.airs.map((a) => `${a.channel.name}, ${SLOT_NAMES[SLOTS[a.slot]!].toLowerCase()}`).join('; ') : 'In no slot'}</div>
      <ul className="crew-list">
        {crew.hosted && (
          <li>
            <span className="muted small">Host: </span>
            {crew.host ? (
              <>
                <Person employee={crew.host.employee} note={crew.host.missing} />
                {!crew.host.fits && (
                  <>
                    {' '}
                    <Tag tone="warning">Off their genre</Tag>
                  </>
                )}
              </>
            ) : (
              <Tag tone="danger">None</Tag>
            )}
          </li>
        )}
        <CrewLines label="Producer" crew={crew.producers} />
        {crew.writers && <CrewLines label="Writer" crew={crew.writers} />}
        {crew.editors && <CrewLines label="Editor" crew={crew.editors} />}
      </ul>
      {channel && (
        <div>
          <button type="button" onClick={() => useOnAir.getState().edit(channel.id, crew.show.id)}>
            Change
          </button>
        </div>
      )}
    </article>
  );
}

/** The producers, writers or editor of a show, one line each, with how many it needs. */
function CrewLines({ label, crew }: { label: string; crew: Crew }) {
  if (crew.people.length === 0) {
    return (
      <li>
        <span className="muted small">{label}s: </span>
        <Tag tone="danger">None, needs {crew.needed}</Tag>
      </li>
    );
  }
  return (
    <>
      {crew.people.map((p, i) => (
        <Fragment key={p.employee.id}>
          <li>
            <span className="muted small">{label}: </span>
            <Person employee={p.employee} note={p.missing ?? (p.addsNothing ? 'Adds nothing' : null)} />
          </li>
          {i === crew.people.length - 1 && crew.working < crew.needed && (
            <li className="muted small">
              {crew.working} of the {crew.needed} {label.toLowerCase()}
              {crew.needed === 1 ? '' : 's'} it needs at work
            </li>
          )}
        </Fragment>
      ))}
    </>
  );
}
