import { useState } from 'react';
import { MAX_SHOWS_PER_PERSON, POACH, SEVERANCE_MONTHS, TRAINING } from '../../config/balance';
import { getGenre } from '../../config/genres';
import { declinePoachOffer, fire, hire, matchPoachOffer, poachHost, sendOnTraining } from '../../sim/actions';
import { formatDate } from '../../sim/calendar';
import { poachCooldown, poachTargets } from '../../sim/poaching';
import { showLoad } from '../../sim/broadcast';
import { SUPPORT_ROLES, employeesWithDesk, isManager, needsDesk, ownDesk, roomName } from '../../sim/office';
import { technicianTitle } from '../../sim/upkeep';
import { DEPARTMENT_NAMES, hasCourses, trainingBlocker, trainingCost, xpForNextLevel } from '../../sim/staff';
import type { Employee, GameState, Person, Role } from '../../sim/state';
import { Avatar } from '../Avatar';
import { FEATURES } from '../../config/unlocks';
import { canHire, isUnlocked } from '../../sim/unlocks';
import { Empty, LockNote, Meter, Panel, Tag } from '../components';
import { formatMoney } from '../format';
import { useGame, useGameStore } from '../store';

const ROLE_NAMES: Record<Role, string> = {
  host: 'Hosts',
  production: 'Production',
  channelManager: 'Channel managers',
  manager: 'Department managers',
  sales: 'Sales',
  marketing: 'Marketing',
  researcher: 'R&D',
  cleaner: 'Cleaners',
  technician: 'Technicians',
  maintenance: 'Maintenance',
};

/** Technicians look after computers once the personal computer is researched. */
const roleName = (game: GameState, role: Role) => (role === 'technician' ? `${technicianTitle(game)}s` : ROLE_NAMES[role]);

const ROLE_HELP: Record<Role, string> = {
  host: 'Present shows. Skill counts in full in their best genres.',
  production: 'Make shows. Each genre needs a number of them.',
  channelManager: 'Every channel needs one to broadcast.',
  manager: 'Boost the skill of up to 8 people in their department.',
  sales: 'Bring in sponsor offers every Monday.',
  marketing: 'Each runs one marketing campaign at a time.',
  researcher: 'Earn research points every day for the tech tree.',
  cleaner: 'Clean the dirtiest room each day. Dirty rooms lower morale, output and show quality.',
  technician: 'Repair the most worn workstation or studio item each day, before it breaks.',
  maintenance: 'Fix the lighting and heating when they fail.',
};
const ROLES = Object.keys(ROLE_NAMES) as Role[];

/** The tabs of the team: one for each kind of staff, with those who keep the building going together. */
const TEAM_TABS: { id: string; label: string; roles: Role[]; none: string }[] = [
  { id: 'host', label: 'Hosts', roles: ['host'], none: 'No hosts yet.' },
  { id: 'production', label: 'Production', roles: ['production'], none: 'No production staff yet.' },
  { id: 'managers', label: 'Managers', roles: ['channelManager', 'manager'], none: 'No managers yet.' },
  { id: 'sales', label: 'Sales', roles: ['sales'], none: 'Nobody in sales yet.' },
  { id: 'marketing', label: 'Marketing', roles: ['marketing'], none: 'Nobody in marketing yet.' },
  { id: 'researcher', label: 'R&D', roles: ['researcher'], none: 'No researchers yet.' },
  { id: 'other', label: 'Other', roles: ['cleaner', 'technician', 'maintenance'], none: 'No cleaners, technicians or maintenance staff yet.' },
];

/** Whether something about someone asks for the player's attention: no desk, no show, no channel, or an offer from a rival. */
function needsAttention(game: GameState, employee: Employee): boolean {
  if (needsDesk(employee.role) && !employeesWithDesk(game).has(employee.id)) return true;
  if (employee.role === 'channelManager') return !game.channels.some((c) => c.managerId === employee.id);
  if (employee.role === 'host') return showLoad(game, employee.id) === 0 || game.poachOffers.some((offer) => offer.hostId === employee.id);
  return employee.role === 'production' && showLoad(game, employee.id) === 0;
}

export function StaffScreen() {
  const game = useGame();
  const payroll = game.employees.reduce((sum, e) => sum + e.salary, 0);
  const [picked, setPicked] = useState<string | null>(null);
  const inTab = (tab: (typeof TEAM_TABS)[number]) => game.employees.filter((e) => tab.roles.includes(e.role));
  // A kind of staff the company cannot hire yet has no tab until it can.
  const tabs = TEAM_TABS.filter((t) => inTab(t).length > 0 || t.roles.some((role) => canHire(game, role)));
  // Until the player picks a tab, the first one that has people in it is shown.
  const tab = tabs.find((t) => t.id === picked) ?? tabs.find((t) => inTab(t).length > 0) ?? tabs[0]!;
  const people = inTab(tab);

  return (
    <div className="two-col">
      <Panel title="Your team" help="staff" actions={<span className="muted">Payroll {formatMoney(payroll)} / month</span>}>
        <PoachOffers game={game} />
        <p className="small">
          <strong>{game.playerName}</strong> <span className="muted">· CEO of {game.companyName}. That’s you.</span>
        </p>
        {game.employees.length === 0 ? (
          <Empty>Nobody works here yet. Hire from the pool on the right.</Empty>
        ) : (
          <>
            <div className="segmented" role="tablist" aria-label="Kind of staff">
              {tabs.map((t) => (
                <button key={t.id} role="tab" data-guide={`team-${t.id}`} aria-selected={t.id === tab.id} className={t.id === tab.id ? 'active' : undefined} onClick={() => setPicked(t.id)}>
                  {t.label} ({inTab(t).length})
                  {inTab(t).some((e) => needsAttention(game, e)) && <span className="dot" role="img" aria-label="Someone here needs attention" />}
                </button>
              ))}
            </div>
            {people.length === 0 ? (
              <Empty>{tab.none}</Empty>
            ) : (
              tab.roles.map((role) => {
                const group = people.filter((e) => e.role === role);
                return (
                  group.length > 0 && (
                    <div key={role} className="person-group">
                      {tab.roles.length > 1 && <h3>{roleName(game, role)}</h3>}
                      {group.map((e) => <EmployeeRow key={e.id} game={game} employee={e} />)}
                    </div>
                  )
                );
              })
            )}
          </>
        )}
      </Panel>
      <div className="stack">
        <HiringPool game={game} />
        <RivalHosts game={game} />
      </div>
    </div>
  );
}

/** Offers rivals have made to the player's hosts: match the salary or lose the host. */
function PoachOffers({ game }: { game: GameState }) {
  const run = useGameStore((s) => s.run);
  return game.poachOffers.map((offer) => {
    const host = game.employees.find((e) => e.id === offer.hostId);
    const rival = game.rivals.find((r) => r.id === offer.rivalId);
    if (!host || !rival) return null;
    return (
      <div key={offer.id} className="banner warning poach-offer" role="alert">
        <span>
          <strong>{rival.name}</strong> has offered <strong>{host.name}</strong> {formatMoney(offer.salary)}/mo (now{' '}
          {formatMoney(host.salary)}). They leave on {formatDate(offer.expiresOn).slice(4)} unless you match it.
        </span>
        <button className="primary" onClick={() => run((s) => matchPoachOffer(s, offer.id))}>Match {formatMoney(offer.salary)}/mo</button>
        <button className="link danger" onClick={() => run((s) => declinePoachOffer(s, offer.id))}>Let them go</button>
      </div>
    );
  });
}

/** The most famous hosts on rival channels, who can be signed for a fee. */
function RivalHosts({ game }: { game: GameState }) {
  const run = useGameStore((s) => s.run);
  const [medium, setMedium] = useState<'radio' | 'tv'>('radio');
  const targets = poachTargets(game).filter((t) => t.channel.medium === medium).slice(0, 6);
  const wait = poachCooldown(game);

  return (
    <Panel title="Rival hosts" help="poaching" actions={wait > 0 && <span className="muted small">Next signing in {wait} day{wait === 1 ? '' : 's'}</span>}>
      <p className="muted small">
        Sign a rival’s host for a signing fee of {POACH.signingMonths} months’ salary. Their old show gets worse; you can
        sign one host every {POACH.cooldownDays} days.
      </p>
      <div className="segmented" role="tablist" aria-label="Medium">
        {(['radio', 'tv'] as const).map((m) => (
          <button key={m} role="tab" aria-selected={m === medium} className={m === medium ? 'active' : undefined} onClick={() => setMedium(m)}>
            {m === 'tv' ? 'TV' : 'Radio'}
          </button>
        ))}
      </div>
      {targets.map((t) => (
        <div key={`${t.channel.id}:${t.slot}`} className="person">
          <Avatar name={t.show.hostName} />
          <div className="person-main">
            <div className="person-name">
              {t.show.hostName} <span className="muted">· “{t.show.name}” on {t.channel.name}</span>
            </div>
            <div className="person-stats">
              <span className="stat">Skill <Meter value={t.skill / 100} label={`Skill ${t.skill}`} /> {t.skill}</span>
              <span className="stat">Fame <Meter value={t.show.hostFame / 100} tone="yellow" label={`Fame ${t.show.hostFame}`} /> {t.show.hostFame}</span>
              <span className="stat">Best at {getGenre(t.show.genre).name}</span>
            </div>
          </div>
          <div className="person-meta">
            <div>{formatMoney(t.salary)}/mo</div>
            <div className="muted small">{formatMoney(t.fee)} fee</div>
          </div>
          <button className="primary" disabled={wait > 0} onClick={() => run((s) => poachHost(s, t.channel.id, t.slot))}>Sign</button>
        </div>
      ))}
    </Panel>
  );
}

export function PersonDetails({ person }: { person: Person }) {
  return (
    <div className="person-main">
      <div className="person-name">
        {person.name}
        {person.department && <span className="muted"> · {DEPARTMENT_NAMES[person.department]} manager</span>}
        {isEmployee(person) && <LevelBadge employee={person} />}
      </div>
      <div className="person-stats">
        <span className="stat">
          Skill <Meter value={person.skill / 100} label={`Skill ${person.skill}`} /> {person.skill}
        </span>
        {isEmployee(person) && (
          <span className="stat" title="Morale follows how clean and sound their workplace is, and rises with a canteen">
            Morale <Meter value={person.morale / 100} tone="green" label={`Morale ${Math.round(person.morale)}`} /> {Math.round(person.morale)}
          </span>
        )}
        {person.role === 'host' && (
          <>
            <span className="stat">
              Fame <Meter value={person.fame / 100} tone="yellow" label={`Fame ${Math.round(person.fame)}`} /> {Math.round(person.fame)}
            </span>
            <span className="stat">Best at {person.specialties.map((g) => getGenre(g).name).join(', ')}</span>
          </>
        )}
      </div>
    </div>
  );
}

const isEmployee = (person: Person): person is Employee => 'level' in person;

function LevelBadge({ employee }: { employee: Employee }) {
  const next = xpForNextLevel(employee.level);
  return (
    <span className="level" title={`${employee.xp} / ${next} XP to level ${employee.level + 1}`}>
      {' '}Lv {employee.level} <Meter value={employee.xp / next} tone="green" label={`${employee.xp} of ${next} XP`} />
    </span>
  );
}

function EmployeeRow({ game, employee }: { game: GameState; employee: Employee }) {
  const run = useGameStore((s) => s.run);
  const load = showLoad(game, employee.id);
  const desk = employeesWithDesk(game).get(employee.id);
  const hasDesk = desk !== undefined;
  const own = ownDesk(game, employee);
  const manages = game.channels.find((c) => c.managerId === employee.id);
  const noCourse = hasCourses(employee.role) ? trainingBlocker(game, employee) : null;

  return (
    <div className="person">
      <Avatar name={employee.name} />
      <PersonDetails person={employee} />
      <div className="person-meta">
        <div>{formatMoney(employee.salary)}/mo</div>
        <div className="tags">
          {needsDesk(employee.role) && !hasDesk && <Tag tone="danger">{isManager(employee.role) ? 'No desk in a management office' : 'No workstation'}</Tag>}
          {desk && <Tag>{roomName(game, desk.roomId)}{own?.item.id === desk.itemId ? ' · own place' : ''}</Tag>}
          <AssignmentTag game={game} employee={employee} load={load} manages={manages?.name} />
          {employee.trainingUntil != null && <Tag tone="warning">On a course until {formatDate(employee.trainingUntil)} · a stand-in works</Tag>}
        </div>
      </div>
      {hasCourses(employee.role) && employee.trainingUntil == null && (
        <button
          data-guide="send-on-course"
          disabled={noCourse !== null}
          title={noCourse ?? `${TRAINING.days} days away, with a stand-in at ${Math.round(TRAINING.standIn * 100)}% of their skill. They come back ${TRAINING.skillGain.min} to ${TRAINING.skillGain.max} skill points better.`}
          onClick={() => run((s) => sendOnTraining(s, employee.id))}
        >
          Course · {formatMoney(trainingCost(employee))}
        </button>
      )}
      <button
        className="link danger"
        onClick={() => {
          const severance = formatMoney(employee.salary * SEVERANCE_MONTHS);
          if (window.confirm(`Fire ${employee.name}? Severance is ${severance}.`)) run((s) => fire(s, employee.id));
        }}
      >
        Fire
      </button>
    </div>
  );
}

function AssignmentTag({ game, employee, load, manages }: { game: GameState; employee: Employee; load: number; manages?: string }) {
  switch (employee.role) {
    case 'channelManager':
      return manages ? <Tag>Runs {manages}</Tag> : <Tag tone="warning">Unassigned</Tag>;
    case 'marketing':
      return game.campaigns.some((c) => c.marketerId === employee.id) ? <Tag>Running a campaign</Tag> : <Tag>Free</Tag>;
    case 'host': {
      // A host presents one show; one from an older game may still present more.
      const shows = game.shows.filter((s) => s.hostId === employee.id);
      return shows.length === 0 ? <Tag tone="warning">No show</Tag> : <Tag>{shows.length === 1 ? `Presents “${shows[0]!.name}”` : `Presents ${shows.length} shows`}</Tag>;
    }
    case 'production':
      return (
        <Tag tone={load === 0 ? 'warning' : undefined}>
          {load}/{MAX_SHOWS_PER_PERSON} shows
        </Tag>
      );
    default:
      if (!SUPPORT_ROLES.includes(employee.role)) return null;
      return employee.location ? <Tag>Working in {roomName(game, employee.location)}</Tag> : <Tag>Nothing to do</Tag>;
  }
}

function HiringPool({ game }: { game: GameState }) {
  const run = useGameStore((s) => s.run);
  const [role, setRole] = useState<Role>('host');
  // Only the jobs the company can hire for yet; the others are named under the list.
  const hirable = game.candidates.filter((c) => canHire(game, c.role, c.department));
  const roles = ROLES.filter((r) => canHire(game, r) || r === 'manager');
  const later = FEATURES.filter((feature) => !isUnlocked(game, feature) && ['sales', 'marketing', 'research'].includes(feature));
  const candidates = hirable.filter((c) => c.role === role).sort((a, b) => b.skill - a.skill);

  return (
    <Panel title="Hiring pool" help="staff" actions={<span className="muted small">New candidates on the 1st</span>}>
      <div className="segmented" role="tablist" aria-label="Role">
        {roles.map((r) => (
          <button key={r} role="tab" data-guide={`role-${r}`} aria-selected={r === role} className={r === role ? 'active' : undefined} onClick={() => setRole(r)}>
            {roleName(game, r)} ({hirable.filter((c) => c.role === r).length})
          </button>
        ))}
      </div>
      <p className="muted small">{ROLE_HELP[role]}</p>
      {candidates.length === 0 ? (
        <Empty>No candidates left this month.</Empty>
      ) : (
        candidates.map((c, index) => (
          <div key={c.id} className="person">
            <Avatar name={c.name} />
            <PersonDetails person={c} />
            <div className="person-meta">{formatMoney(c.salary)}/mo</div>
            <button className="primary" data-guide={index === 0 ? `hire-${role}` : undefined} onClick={() => run((s) => hire(s, c.id))}>Hire</button>
          </div>
        ))
      )}
      {later.map((feature) => (
        <LockNote key={feature} feature={feature} />
      ))}
    </Panel>
  );
}
