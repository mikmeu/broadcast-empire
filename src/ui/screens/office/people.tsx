// The panels of a person and of the CEO, and where they sit.

import { assignDesk } from '../../../sim/actions';
import { employeesWithDesk, ownDesk, needsDesk, roomName } from '../../../sim/office';
import type { Employee, GameState, Role } from '../../../sim/state';
import { CEO_ID, whereaboutsOf } from '../../../office/layout';
import { DEPARTMENT_NAMES } from '../../../sim/staff';
import { describeMorale, thoughtContext, thoughtsOf } from '../../../sim/thoughts';
import { moraleParts } from '../../../sim/upkeep';
import { Avatar } from '../../Avatar';
import { Panel, Tag } from '../../components';
import { Icon } from '../../Icon';
import { formatMoney } from '../../format';
import { useGameStore } from '../../store';
import { PersonDetails } from '../StaffScreen';

/** Who was clicked in the office: who they are and what they are doing right now. */
export function PersonPanel({ game, person, beat, onClose }: { game: GameState; person: Employee; beat: number; onClose: () => void }) {
  const context = thoughtContext(game);
  const thoughts = thoughtsOf(game, person, context);
  const breakdown = `Morale target: ${describeMorale(moraleParts(game, person, context.desked, context.shared, context.guarded))}`;

  return (
    <Panel
      title={ROLE_TITLES[person.role]}
      actions={
        <button className="icon-button" onClick={onClose} aria-label="Close" title="Close">
          <Icon name="close-button" size={20} />
        </button>
      }
    >
      <div className="person-card">
        <Avatar name={person.name} size={72} />
        <PersonDetails person={person} breakdown={breakdown} />
      </div>
      <dl className="facts">
        <dt>Salary</dt>
        <dd>{formatMoney(person.salary)} / month</dd>
        <dt>Now</dt>
        <dd>{whereaboutsOf(game, person.id, beat)}</dd>
        {needsDesk(person.role) && (
          <>
            <dt>Workplace</dt>
            <dd><Seat game={game} person={person} /></dd>
          </>
        )}
      </dl>
      <h3>Thoughts</h3>
      <ul className="thoughts">
        {thoughts.length > 0 ? thoughts.map((t) => <li key={t.kind} className={t.tone}>“{t.text}”</li>) : <li className="muted">“Nothing much on my mind.”</li>}
      </ul>
      <p className="muted small">Hire, fire and assign people in the Staff window. A workplace is given out in the panel of an office.</p>
    </Panel>
  );
}

/** The player's own character, clicked in the office. */
export function CeoPanel({ game, beat, onClose }: { game: GameState; beat: number; onClose: () => void }) {
  return (
    <Panel
      title="CEO"
      actions={
        <button className="icon-button" onClick={onClose} aria-label="Close" title="Close">
          <Icon name="close-button" size={20} />
        </button>
      }
    >
      <p>
        <strong>{game.playerName}</strong> <span className="muted">· CEO of {game.companyName}. That’s you.</span>
      </p>
      <dl className="facts">
        <dt>Now</dt>
        <dd>{whereaboutsOf(game, CEO_ID, beat)}</dd>
      </dl>
      <p className="muted small">Your name and your character can be changed in Settings.</p>
    </Panel>
  );
}

export const ROLE_TITLES: Record<Role, string> = {
  host: 'Host',
  production: 'Production',
  channelManager: 'Channel manager',
  manager: 'Department manager',
  sales: 'Sales',
  marketing: 'Marketing',
  researcher: 'R&D',
  cleaner: 'Cleaner',
  technician: 'Technician',
  maintenance: 'Maintenance',
  writer: 'Writer',
  editor: 'Video editor',
  engineer: 'Audio engineer',
  scheduler: 'Music scheduler',
  cook: 'Cook',
  clerk: 'Post room clerk',
  guard: 'Guard',
  talentManager: 'Talent manager',
  recruiter: 'Recruiter',
  lawyer: 'Lawyer',
  callAgent: 'Call agent',
  journalist: 'Journalist',
};

/**
 * The places of the desk workers who are not office staff or managers, by
 * job: the piece they work at and what they can't do without it.
 */
export const OTHER_PLACES: { role: Role; place: string; whom: string; without: string }[] = [
  { role: 'writer', place: 'writer’s place', whom: 'writer', without: 'without a place in a writers’ room with a story board: they can’t write' },
  { role: 'editor', place: 'editing desk', whom: 'video editor', without: 'without a working editing desk: they can’t edit' },
  { role: 'engineer', place: 'audio desk', whom: 'audio engineer', without: 'without a working audio desk in an audio room' },
  { role: 'scheduler', place: 'scheduling desk', whom: 'music scheduler', without: 'without a working scheduling desk in a music scheduling office' },
  { role: 'cook', place: 'stove', whom: 'cook', without: 'without a stove in a canteen that has all it needs: they can’t cook' },
  { role: 'clerk', place: 'sorting case', whom: 'clerk', without: 'without a sorting case in a post room' },
  { role: 'callAgent', place: 'call desk', whom: 'call agent', without: 'without a call desk in a call centre: the calls go unanswered' },
  { role: 'guard', place: 'security desk', whom: 'guard', without: 'without a security desk in a security room: the hosts are not safe from fans' },
  { role: 'talentManager', place: 'trainer’s desk', whom: 'talent manager', without: 'without a trainer’s desk in a workshop that has all it needs: they can’t teach' },
];

/** What someone does, in a few words: a department manager with their department. */
export const jobOf = (person: Employee) => (person.role === 'manager' && person.department ? `${DEPARTMENT_NAMES[person.department]} manager` : ROLE_TITLES[person.role]);

/** Where someone works: the room of their desk today, and whether that place is their own. */
function Seat({ game, person }: { game: GameState; person: Employee }) {
  const run = useGameStore((s) => s.run);
  const desk = employeesWithDesk(game).get(person.id);
  const own = ownDesk(game, person);
  if (!desk) return <Tag tone="danger">{own ? `Their own desk in ${own.room.name} is broken, and no other is free` : 'None: they can’t work'}</Tag>;
  return (
    <>
      {roomName(game, desk.roomId)}
      <span className="muted small"> · {own ? (own.item.id === desk.itemId ? 'their own place' : `for now: their own desk in ${own.room.name} is broken`) : 'no place of their own'}</span>
      {own && (
        <>
          {' '}
          <button className="link" onClick={() => run((s) => assignDesk(s, person.id, null))} title="They take whatever desk is free again">Let it go</button>
        </>
      )}
    </>
  );
}
