import { Fragment, useState } from 'react';
import { AWARDS, EDITORS, ENGINEERS, LEGAL, LIFE, MAX_SHOWS_PER_PERSON, MEETINGS, POACH, RECRUITING, SCHEDULERS, SECURITY, SEVERANCE_MONTHS, STRIKES, TALENT, TRAINING, WORKSHOP, WRITERS } from '../../config/balance';
import { getGenre } from '../../config/genres';
import { callChannelMeeting, callMeeting, declinePoachOffer, declineRaise, endStrike, endTemp, grantRaise, fire, hire, hireTemp, matchPoachOffer, poachHost, promote, sendOnTraining, sendToTalentProgramme, setChannelMeetingMinutes, setMeetingMinutes, setMonthlyChannelMeeting, setMonthlyMeeting } from '../../sim/actions';
import { formatDate } from '../../sim/calendar';
import { ageOf, retiresOn, tempPrice } from '../../sim/life';
import { poachCooldown, poachTargets } from '../../sim/poaching';
import { engineeredShows, scheduledChannels, showLoad } from '../../sim/broadcast';
import { noDesk } from '../../sim/staffing';
import { SUPPORT_ROLES, employeesWithDesk, needsDesk, ownDesk, roomName } from '../../sim/office';
import { channelMeetingBlocker, channelMeetingLiftToday, meetingBlocker, meetingLiftToday, strikeBonus, strikeDay, teamMorale } from '../../sim/morale';
import { TEAMS, TEAM_IDS, channelMembers, departmentMembers, isAway, isStriking, liftOf, notWorking, onStrike, teamMembers, teamOf } from '../../sim/teams';
import { moraleParts, sharedMorale, technicianTitle } from '../../sim/upkeep';
import { TALLY_NAMES, describeMorale, thoughtContext, thoughtTally, thoughtsOf, type Thought, type ThoughtContext } from '../../sim/thoughts';
import { FURNITURE } from '../../config/office';
import { DEPARTMENT_NAMES, hasCourses, inHouseCourse, promotionBlocker, promotionDepartment, talentBlocker, talentCost, trainingBlocker, trainingCost, workshops, xpForNextLevel } from '../../sim/staff';
import { salaryFor } from '../../sim/economy';
import type { Department, Employee, GameState, Meeting, Person, Role, TeamId } from '../../sim/state';
import { Avatar } from '../Avatar';
import { FEATURES } from '../../config/unlocks';
import { canHire, isUnlocked } from '../../sim/unlocks';
import { Empty, GroupedTabs, LockNote, Meter, Panel, Tag } from '../components';
import { formatMoney } from '../format';
import { CONTROLS_FROM, TEAM_TABS, groupOf, listStaff, needsAttention, openTop, sortsFor, topDots, useStaffList, visiblePoolGroups, visibleStaffGroups, type StaffSort, type StaffTop } from '../staffList';
import { useGame, useGameStore } from '../store';

const ROLE_NAMES: Record<Role, string> = {
  host: 'Hosts',
  production: 'Production',
  writer: 'Writers',
  editor: 'Video editors',
  engineer: 'Audio engineers',
  scheduler: 'Music schedulers',
  channelManager: 'Channel managers',
  manager: 'Department managers',
  sales: 'Sales',
  marketing: 'Marketing',
  researcher: 'R&D',
  cleaner: 'Cleaners',
  technician: 'Technicians',
  maintenance: 'Maintenance',
  cook: 'Cooks',
  clerk: 'Post room clerks',
  guard: 'Guards',
  talentManager: 'Talent managers',
  recruiter: 'Recruiters',
  lawyer: 'Lawyers',
};

/** Technicians look after computers once the personal computer is researched. */
const roleName = (game: GameState, role: Role) => (role === 'technician' ? `${technicianTitle(game)}s` : ROLE_NAMES[role]);

const ROLE_HELP: Record<Role, string> = {
  host: 'Present shows. Skill counts in full in their best genres.',
  production: 'Make shows. Each genre needs a number of them.',
  writer: 'Write sitcoms, soaps and reality TV, which have no host, and make kids’ shows and radio drama better. Each needs a place in a writers’ room.',
  editor: 'Edit produced TV shows, two each, and make them better. Each needs an editing desk in an editing room.',
  engineer: `Look after the sound of the radio shows on the air, ${ENGINEERS.showsEach} each, so that listeners tire of them more slowly. Each needs an audio desk in an audio room.`,
  scheduler: `Look after one radio station that specialises in music, so that its music shows are more appealing, up to ${Math.round(SCHEDULERS.bonus * 100)}% for the best. Each needs a scheduling desk in a music scheduling office.`,
  channelManager: 'Every channel needs one to broadcast.',
  manager: 'Boost the skill of up to 8 people in their department.',
  sales: 'Bring in sponsor offers every Monday.',
  marketing: 'Each runs one marketing campaign at a time.',
  researcher: 'Earn research points every day for the tech tree.',
  cleaner: 'Clean the dirtiest room each day. Dirty rooms lower morale, output and show quality.',
  technician: 'Repair the most worn workstation or studio item each day, before it breaks.',
  maintenance: 'Fix the lighting and heating when they fail.',
  cook: 'Cook hot meals at a stove in the canteen, which lifts everyone’s morale. Each needs a stove of their own.',
  clerk: 'Sort the post in the post room. Letters lift everyone’s morale, and fan mail makes the hosts famous faster. Each needs a sorting case.',
  guard: `Keep fans away from the famous hosts (fame ${SECURITY.minFame} or more), ${SECURITY.hostsEach} hosts each, the most famous first. A host nobody guards is on edge, and now and then a fan gets in. Each needs a security desk in a security room.`,
  talentManager: `Give courses in the workshop, for ${WORKSHOP.salaryMonths} month of salary instead of ${TRAINING.salaryMonths}, and as many at once as there are training seats. They run the talent programme for weak hosts too. Each needs a trainer’s desk in a workshop.`,
  recruiter: `Bring up to ${RECRUITING.extraEach} better candidates into the pool each month, for the jobs you have (${RECRUITING.max} count at most). They find someone in the place of a host who works out their notice. Each needs a workstation.`,
  lawyer: `Defend your shows when they are sued: each lawyer takes ${Math.round(LEGAL.lawyerCut * 100)} points off the chance of losing in court (${LEGAL.lawyers} count at most), and settling costs ${Math.round(LEGAL.settle.lawyer * 100)}% of the claim instead of ${Math.round(LEGAL.settle.alone * 100)}%. Each needs a workstation.`,
};

type TeamTab = (typeof TEAM_TABS)[number];

/**
 * The Staff window (0.18.0, #113): three tabs, Staff, Teams and Hiring. What needs a quick answer, strike
 * warnings and offers from rivals, stays above them, on every tab.
 */
export function StaffScreen() {
  const game = useGame();
  const payroll = game.employees.reduce((sum, e) => sum + e.salary, 0);
  const view = useStaffList();
  const top = openTop(game, view.top);
  const dots = topDots(game);
  const tops: { id: StaffTop; label: string; dot: string }[] = [
    { id: 'staff', label: 'Staff', dot: 'Someone here needs attention' },
    { id: 'teams', label: 'Teams', dot: 'A team is unhappy' },
    { id: 'hiring', label: 'Hiring', dot: 'Your recruiter has found someone' },
  ];

  return (
    <Panel title="Your team" help="staff" actions={<span className="muted">Payroll {formatMoney(payroll)} / month</span>}>
      <Unrest game={game} onTeams={() => view.setTop('teams')} />
      <PoachOffers game={game} />
      <AwardRaises game={game} />
      <div className="segmented top-tabs" role="tablist" aria-label="Staff window">
        {tops.map((t) => (
          <button key={t.id} role="tab" data-guide={`staff-tab-${t.id}`} aria-selected={t.id === top} className={t.id === top ? 'active' : undefined} onClick={() => view.setTop(t.id)}>
            {t.label}
            {dots[t.id] && <span className="dot" role="img" aria-label={t.dot} />}
          </button>
        ))}
      </div>
      {top === 'staff' && <StaffList game={game} />}
      {top === 'teams' && <Teams game={game} />}
      {top === 'hiring' && (
        <div className="two-col hiring-cols">
          <HiringPool game={game} />
          <RivalHosts game={game} />
        </div>
      )}
    </Panel>
  );
}

/** The people you employ, under groups: a row for the groups, and a second for the kinds of staff in a group that has several. */
function StaffList({ game }: { game: GameState }) {
  const view = useStaffList();
  const context = thoughtContext(game);
  const groups = visibleStaffGroups(game);
  const inTab = (tab: TeamTab) => game.employees.filter((e) => tab.roles.includes(e.role));
  const allTabs = groups.flatMap((g) => g.tabs);
  // Until the player picks a tab, the first one that has people in it is shown.
  const tab = allTabs.find((t) => t.id === view.tab) ?? allTabs.find((t) => inTab(t).length > 0) ?? allTabs[0]!;
  // The search, the sort and the toggles count only while they are on screen. A sort a tab does not offer leaves it in the order of hiring.
  const controls = game.employees.length > CONTROLS_FROM;
  const sortOf = (t: TeamTab) => (view.sort && sortsFor(t.roles).includes(view.sort) ? view.sort : null);
  const listed = (t: TeamTab) => (controls ? listStaff(game, inTab(t), { ...view, sort: sortOf(t) }) : inTab(t));
  const people = listed(tab);
  const filtering = controls && (view.query.trim() !== '' || view.attention || view.lowMorale);
  const elsewhere = filtering && people.length === 0 ? allTabs.filter((t) => t.id !== tab.id && listed(t).length > 0) : [];
  const attention = (t: TeamTab) => inTab(t).some((e) => needsAttention(game, e));
  const note = 'Someone here needs attention';
  const items = groups.map((g) => ({
    id: g.id,
    label: g.label,
    count: g.tabs.reduce((sum, t) => sum + listed(t).length, 0),
    dot: g.tabs.some(attention) ? note : undefined,
    tabs: g.tabs.map((t) => ({ id: t.id, label: t.label, count: listed(t).length, dot: attention(t) ? note : undefined })),
  }));

  return (
    <>
      <p className="small">
        <strong>{game.playerName}</strong> <span className="muted">· CEO of {game.companyName}. That’s you.</span>
      </p>
      {game.employees.length === 0 ? (
        <Empty>Nobody works here yet. Hire from the Hiring tab.</Empty>
      ) : (
        <>
          <GroupedTabs
            groups={items}
            group={groupOf(tab.roles)}
            tab={tab.id}
            onGroup={(id) => {
              const tabs = groups.find((g) => g.id === id)!.tabs;
              view.setTab((tabs.find((t) => inTab(t).length > 0) ?? tabs[0]!).id);
            }}
            onTab={view.setTab}
            groupLabel="Group of staff"
            tabLabel="Kind of staff"
            groupGuide="team-group"
            tabGuide="team"
          />
          {controls && <ListControls sorts={sortsFor(tab.roles)} sort={sortOf(tab)} />}
          {people.length === 0 ? (
            filtering && inTab(tab).length > 0 ? (
              <Empty>
                Nobody here matches.{' '}
                {elsewhere.length > 0 ? `${andList(elsewhere.map((t) => t.label))} ${elsewhere.length === 1 ? 'has' : 'have'} someone who does.` : 'Nobody on the other tabs does either.'}
              </Empty>
            ) : (
              <Empty>{tab.none}</Empty>
            )
          ) : (
            tab.roles.map((role) => {
              const group = people.filter((e) => e.role === role);
              return (
                group.length > 0 && (
                  <div key={role} className="person-group">
                    {tab.roles.length > 1 && <h3>{roleName(game, role)}</h3>}
                    {group.map((e) => <EmployeeRow key={e.id} game={game} employee={e} context={context} />)}
                  </div>
                )
              );
            })
          )}
        </>
      )}
    </>
  );
}

const SORT_LABELS: Record<StaffSort, string> = { name: 'Name', age: 'Age', skill: 'Skill', morale: 'Morale', shows: 'Shows', salary: 'Salary', hired: 'Hired', fame: 'Fame' };

/** Names in a sentence: “Hosts, Writers and Audio”. */
const andList = (names: string[]) => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/** The search, the sorts and the two toggles above the list of staff (0.17.0, #70). */
function ListControls({ sorts, sort }: { sorts: StaffSort[]; sort: StaffSort | null }) {
  const { query, dir, attention, lowMorale, setQuery, sortBy, toggleAttention, toggleLowMorale } = useStaffList();
  return (
    <div className="list-controls">
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find someone by name" aria-label="Find someone by name" />
      <div className="segmented" role="group" aria-label="Sort by">
        {sorts.map((s) => (
          <button key={s} className={s === sort ? 'active' : undefined} aria-pressed={s === sort} title={s === sort ? 'Click again to turn the order round' : undefined} onClick={() => sortBy(s)}>
            {SORT_LABELS[s]}
            {s === sort && (dir === 'up' ? ' ↑' : ' ↓')}
          </button>
        ))}
      </div>
      <div className="segmented" role="group" aria-label="Show only">
        <button className={attention ? 'active' : undefined} aria-pressed={attention} title="Only those without a desk, a show or a channel, or with an offer from a rival" onClick={toggleAttention}>
          Needs attention
        </button>
        <button className={lowMorale ? 'active' : undefined} aria-pressed={lowMorale} title={`Only those whose morale is under ${STRIKES.below}, where a team threatens to strike`} onClick={toggleLowMorale}>
          Low morale
        </button>
      </div>
    </div>
  );
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Teams that threaten to strike or are on strike (0.15.0): a strike can be ended with a bonus. */
function Unrest({ game, onTeams }: { game: GameState; onTeams: () => void }) {
  const run = useGameStore((s) => s.run);
  return TEAM_IDS.map((team) => {
    const unrest = game.unrest[team];
    const who = capital(TEAMS[team].inText);
    if (isStriking(game, team)) {
      const bonus = strikeBonus(game, team);
      return (
        <div key={team} className="banner danger" role="alert">
          <span>
            <strong>{who} are on strike</strong> until {formatDate(unrest!.strikeUntil!)}: nothing they do gets done. A bonus of {Math.round(STRIKES.bonusMonths * 100)}% of a month’s salary each ends it today.
          </span>
          <button className="primary" disabled={game.money < bonus} onClick={() => run((s) => endStrike(s, team))}>Pay {formatMoney(bonus)}</button>
        </div>
      );
    }
    if (unrest?.warnedOn == null) return null;
    return (
      <div key={team} className="banner warning" role="alert">
        <span>
          <strong>{who} threaten to strike</strong> on {formatDate(strikeDay(unrest.warnedOn))} unless their morale is back at {STRIKES.below} or more: it is {Math.round(teamMorale(game, team) ?? 0)} now. A meeting, a cleaner or a cook may help; see{' '}
          <button className="link" onClick={onTeams}>Teams</button>.
        </span>
      </div>
    );
  });
}

/**
 * The teams of the company (0.15.0): how they feel, whether they are calm,
 * and their meetings in a meeting room. What lifts everyone's morale is
 * listed under them.
 */
function Teams({ game }: { game: GameState }) {
  const run = useGameStore((s) => s.run);
  const desked = employeesWithDesk(game);
  const shared = sharedMorale(game, desked);
  const teams = TEAM_IDS.filter((team) => teamMembers(game, team).length > 0);
  if (teams.length === 0) return <Empty>No teams yet: they form as you hire people.</Empty>;
  const said = thoughtTally(game).filter((t) => TALLY_NAMES[t.kind]).slice(0, 4);
  const parts = [
    shared.canteen > 0 && `the canteen +${Math.round(shared.canteen)}`,
    shared.meals > 0 && `hot meals +${Math.round(shared.meals)}`,
    shared.post > 0 && `the post +${Math.round(shared.post)}`,
  ].filter(Boolean);
  return (
    <Panel title="Teams" help="morale">
      <ul className="teams">
        {teams.map((team) => {
          const { name, ledBy } = TEAMS[team];
          const people = teamMembers(game, team);
          const morale = teamMorale(game, team) ?? 0;
          const meeting = game.meetings[team];
          const blocked = ledBy ? meetingBlocker(game, team, desked) : null;
          // The production staff of a channel with a channel manager meet with them instead (0.17.0).
          const crews = team === 'production' ? game.channels.filter((c) => c.managerId) : [];
          const left = departmentMembers(game, team).length;
          return (
            <Fragment key={team}>
              <li>
                <span className="team-name">
                  <strong>{name}</strong> <span className="muted small">· {people.length}{crews.length > 0 && ` · ${left} meet with its manager`}</span>
                </span>
                <span className="stat">
                  Morale <Meter value={morale / 100} tone="green" label={`Morale ${Math.round(morale)}`} /> {Math.round(morale)}
                </span>
                <span className="tags">
                  <TeamTag game={game} team={team} />
                  <LiftTag game={game} meeting={meeting} />
                </span>
                {ledBy && (
                  <MeetingControls
                    blocked={blocked}
                    lift={() => meetingLiftToday(game, team)}
                    monthly={meeting?.monthly ?? false}
                    minutes={meeting?.minutes ?? true}
                    onCall={() => run((s) => callMeeting(s, team))}
                    onMonthly={(monthly) => run((s) => setMonthlyMeeting(s, team, monthly))}
                    onMinutes={(minutes) => run((s) => setMeetingMinutes(s, team, minutes))}
                  />
                )}
              </li>
              {crews.map((channel) => {
                const crew = channelMembers(game, channel.id);
                const crewMorale = crew.length > 0 ? crew.reduce((sum, e) => sum + e.morale, 0) / crew.length : null;
                const channelMeeting = game.channelMeetings[channel.id];
                return (
                  <li key={channel.id} className="team-channel">
                    <span className="team-name">
                      <strong>{name} · {channel.name}</strong> <span className="muted small">· {crew.length}</span>
                    </span>
                    <span className="stat">
                      {crewMorale !== null && (
                        <>
                          Morale <Meter value={crewMorale / 100} tone="green" label={`Morale ${Math.round(crewMorale)}`} /> {Math.round(crewMorale)}
                        </>
                      )}
                    </span>
                    <span className="tags">
                      <LiftTag game={game} meeting={channelMeeting} />
                    </span>
                    <MeetingControls
                      blocked={channelMeetingBlocker(game, channel.id, desked)}
                      lift={() => channelMeetingLiftToday(game, channel.id)}
                      monthly={channelMeeting?.monthly ?? false}
                      minutes={channelMeeting?.minutes ?? true}
                      onCall={() => run((s) => callChannelMeeting(s, channel.id))}
                      onMonthly={(monthly) => run((s) => setMonthlyChannelMeeting(s, channel.id, monthly))}
                      onMinutes={(minutes) => run((s) => setChannelMeetingMinutes(s, channel.id, minutes))}
                    />
                  </li>
                );
              })}
            </Fragment>
          );
        })}
      </ul>
      <p className="muted small">
        Morale lifted for everyone: {parts.length > 0 ? parts.join(', ') : 'nothing yet (a canteen, a cook and a post room each add to it)'}. A team whose morale stays under {STRIKES.below} for {STRIKES.warnAfter} days threatens to strike.
      </p>
      {said.length > 0 && (
        <p className="muted small">
          What people say: {said.map(({ kind, count }) => `${count} ${TALLY_NAMES[kind]}`).join(', ')}.
        </p>
      )}
    </Panel>
  );
}

/** When a team last met, and its lift while it lasts. */
function LiftTag({ game, meeting }: { game: GameState; meeting: Meeting | undefined }) {
  const lift = liftOf(meeting, game.day);
  if (lift <= 0 || meeting?.on == null) return null;
  return <Tag tone="good">Met on {formatDate(meeting.on).slice(4)} · +{lift} until {formatDate(meeting.on + MEETINGS.lasts).slice(4)}</Tag>;
}

/** The Meeting button and “Every month” of a team, or of a channel's production team. */
function MeetingControls({ blocked, lift, monthly, minutes, onCall, onMonthly, onMinutes }: { blocked: string | null; lift: () => number; monthly: boolean; minutes: boolean; onCall: () => void; onMonthly: (monthly: boolean) => void; onMinutes: (minutes: boolean) => void }) {
  return (
    <span className="team-meeting">
      <button disabled={blocked !== null} title={blocked ?? `+${lift()} morale for ${MEETINGS.lasts} days; today they get ${Math.round(MEETINGS.workOnTheDay * 100)}% of their work done.`} onClick={onCall}>
        Meeting
      </button>
      <label className="small" title="They meet by themselves as soon as they may, when a meeting room is free">
        <input type="checkbox" checked={monthly} onChange={(e) => onMonthly(e.target.checked)} /> Every month
      </label>
      <label className="small" title="After each meeting its leader e-mails you the minutes">
        <input type="checkbox" checked={minutes} onChange={(e) => onMinutes(e.target.checked)} /> Minutes
      </label>
    </span>
  );
}

function TeamTag({ game, team }: { game: GameState; team: TeamId }) {
  const unrest = game.unrest[team];
  if (isStriking(game, team)) return <Tag tone="danger">On strike until {formatDate(unrest!.strikeUntil!).slice(4)}</Tag>;
  if (unrest?.warnedOn != null) return <Tag tone="danger">Threatens to strike on {formatDate(strikeDay(unrest.warnedOn)).slice(4)}</Tag>;
  if (unrest) return <Tag tone="warning">Unhappy since {formatDate(unrest.since).slice(4)}</Tag>;
  return null;
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
          {formatMoney(host.salary)}). Unless you match it by {formatDate(offer.expiresOn).slice(4)}, they sign, work out a month and go.
        </span>
        <button className="primary" onClick={() => run((s) => matchPoachOffer(s, offer.id))}>Match {formatMoney(offer.salary)}/mo</button>
        <button className="link danger" onClick={() => run((s) => declinePoachOffer(s, offer.id))}>Let them go</button>
      </div>
    );
  });
}

/** Hosts who won an award and ask for the going rate at their new fame: pay it, or their morale drops. */
function AwardRaises({ game }: { game: GameState }) {
  const run = useGameStore((s) => s.run);
  return game.awards.raises.map((request) => {
    const host = game.employees.find((e) => e.id === request.hostId);
    if (!host) return null;
    return (
      <div key={request.id} className="banner warning poach-offer" role="alert">
        <span>
          <strong>{host.name}</strong> won an award and asks for {formatMoney(request.salary)}/mo (now {formatMoney(host.salary)}). Answer by{' '}
          {formatDate(request.expiresOn).slice(4)}, or their morale drops by {AWARDS.refusedMorale}.
        </span>
        <button className="primary" onClick={() => run((s) => grantRaise(s, request.id))}>Pay {formatMoney(request.salary)}/mo</button>
        <button className="link danger" onClick={() => run((s) => declineRaise(s, request.id))}>Say no</button>
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

/** `breakdown` is what their morale is made of, and `thought` the first thing on their mind (0.20.0). */
export function PersonDetails({ person, breakdown, thought }: { person: Person; breakdown?: string; thought?: Thought }) {
  const day = useGameStore((s) => s.game?.day ?? 0);
  const age = ageOf({ day }, person);
  return (
    <div className="person-main">
      <div className="person-name">
        {person.name}
        {age !== null && <span className="muted" title={isEmployee(person) && person.bornOn !== undefined ? `Retires on ${formatDate(retiresOn(person.bornOn))}` : undefined}> · {age}</span>}
        {person.department && <span className="muted"> · {DEPARTMENT_NAMES[person.department]} manager</span>}
        {isEmployee(person) && <LevelBadge employee={person} />}
      </div>
      <div className="person-stats">
        <span className="stat">
          Skill <Meter value={person.skill / 100} label={`Skill ${person.skill}`} /> {person.skill}
        </span>
        {isEmployee(person) && (
          <span className="stat" title={breakdown ?? 'Morale follows how clean and sound their workplace is, and rises with a canteen'}>
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
      {thought && (
        <div className={`person-thought ${thought.tone}`} title={`“${thought.text}”`}>
          “{thought.text}”
        </div>
      )}
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

/** Whether someone retires within the notice of it: the tag in the list says so. */
const retiresSoon = (game: GameState, employee: Employee) => employee.bornOn !== undefined && retiresOn(employee.bornOn) - game.day <= LIFE.retireNotice;

/** On leave or ill, or told they will be, and who stands in for them. */
function AwayTag({ game, employee }: { game: GameState; employee: Employee }) {
  const away = employee.away!;
  const ahead = game.day < away.from;
  const what = away.reason === 'leave' ? 'On leave' : 'Ill';
  const text = ahead ? `${what} from ${formatDate(away.from)} to ${formatDate(away.until - 1)}` : `${what} until ${formatDate(away.until - 1)}`;
  return <Tag tone={away.temp ? 'warning' : 'danger'}>{ahead ? text : away.temp ? `${text} · ${away.temp.name} stands in` : `${text} · nobody does their work`}</Tag>;
}

function EmployeeRow({ game, employee, context }: { game: GameState; employee: Employee; context: ThoughtContext }) {
  const run = useGameStore((s) => s.run);
  const thought = thoughtsOf(game, employee, context)[0];
  const breakdown = `Morale target: ${describeMorale(moraleParts(game, employee, context.desked, context.shared, context.guarded))}`;
  const load = showLoad(game, employee.id);
  const desk = employeesWithDesk(game).get(employee.id);
  const hasDesk = desk !== undefined;
  const own = ownDesk(game, employee);
  const manages = game.channels.find((c) => c.managerId === employee.id);
  const noCourse = hasCourses(employee.role) ? trainingBlocker(game, employee) : null;
  const noTalent = employee.role === 'host' ? talentBlocker(game, employee) : null;
  const workshop = noCourse === null ? inHouseCourse(game) : undefined;
  const away = `${TRAINING.days} days away, with a stand-in at ${Math.round(TRAINING.standIn * 100)}% of their skill. They come back ${TRAINING.skillGain.min} to ${TRAINING.skillGain.max} skill points better.`;
  const headOf = promotionDepartment(employee.role);
  const noPromotion = headOf ? promotionBlocker(game, employee) : null;

  return (
    <div className="person">
      <Avatar name={employee.name} />
      <PersonDetails person={employee} breakdown={breakdown} thought={thought} />
      <div className="person-meta">
        <div>{formatMoney(employee.salary)}/mo</div>
        <div className="tags">
          {onStrike(game, employee) && <Tag tone="danger">On strike until {formatDate(game.unrest[teamOf(employee.role)!]!.strikeUntil!)}</Tag>}
          {employee.away && <AwayTag game={game} employee={employee} />}
          {retiresSoon(game, employee) && <Tag tone="warning">Retires on {formatDate(retiresOn(employee.bornOn!))}</Tag>}
          {needsDesk(employee.role) && !hasDesk && !notWorking(game, employee) &&<Tag tone="danger">{noDesk(employee.role)}</Tag>}
          {desk && <Tag>{roomName(game, desk.roomId)}{own?.item.id === desk.itemId ? ' · own place' : ''}</Tag>}
          <AssignmentTag game={game} employee={employee} load={load} manages={manages?.name} />
          {employee.trainingUntil != null && (
            <Tag tone="warning">
              On a course {employee.courseIn != null ? 'in the workshop ' : ''}until {formatDate(employee.trainingUntil)} · a stand-in works
            </Tag>
          )}
          {employee.talentUntil != null && <Tag tone="warning">In the talent programme until {formatDate(employee.talentUntil)}</Tag>}
          {employee.leaving && <Tag tone="danger">Leaves for {game.rivals.find((r) => r.id === employee.leaving!.rivalId)?.name ?? 'a rival'} on {formatDate(employee.leaving.on)}</Tag>}
        </div>
      </div>
      {isAway(game, employee) && (
        employee.away!.temp ? (
          <button title={`${employee.away!.temp.name} stands in until ${employee.name} is back. Send them away to stop paying the agency; nobody does the work then.`} onClick={() => run((s) => endTemp(s, employee.id))}>
            Send temp away
          </button>
        ) : (
          <button
            title={`An agency sends a temp for ${formatMoney(tempPrice(employee))} a month while ${employee.name} is away, until they are back. The temp does ${Math.round(TRAINING.standIn * 100)}% of their skill${employee.role === 'host' ? ', and brings no fame' : ''}.`}
            onClick={() => run((s) => hireTemp(s, employee.id))}
          >
            Hire a temp · {formatMoney(tempPrice(employee))}/mo
          </button>
        )
      )}
      {hasCourses(employee.role) && employee.trainingUntil == null && (
        <button
          data-guide="send-on-course"
          disabled={noCourse !== null}
          title={noCourse ?? (workshop ? `In ${workshop.room.name}, with ${workshop.teacher.name}. ${away}` : `Outside. ${away}`)}
          onClick={() => run((s) => sendOnTraining(s, employee.id))}
        >
          Course · {formatMoney(trainingCost(game, employee))}
          {workshop && <span className="muted"> · in the workshop · {seatsFree(workshop.seats - workshop.pupils.length)}</span>}
        </button>
      )}
      {employee.role === 'host' && employee.skill <= TALENT.maxSkill && employee.talentUntil == null && (
        <button
          disabled={noTalent !== null}
          title={noTalent ?? `A year away, presenting nothing. They come back ${TALENT.skillGain.min} to ${TALENT.skillGain.max} skill points better.`}
          onClick={() => run((s) => sendToTalentProgramme(s, employee.id))}
        >
          Talent programme · {formatMoney(talentCost(employee))}
        </button>
      )}
      {headOf && !game.employees.some((e) => e.role === 'manager' && e.department === headOf) && (
        <button
          disabled={noPromotion !== null}
          title={noPromotion ?? 'They leave their work and their desk for a manager’s desk, and are paid as a manager.'}
          onClick={() => {
            if (window.confirm(promotionWarning(game, employee, headOf))) run((s) => promote(s, employee.id));
          }}
        >
          Make head of {DEPARTMENT_NAMES[headOf]}
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

/** The training seats left in a workshop, in words. */
const seatsFree = (n: number) => (n === 0 ? 'no seat free' : n === 1 ? '1 seat free' : `${n} seats free`);

/** The confirm before a promotion (0.17.0): what they leave, and what they will be paid. */
function promotionWarning(game: GameState, employee: Employee, department: Department): string {
  const leaves: string[] = [];
  const shows = game.shows.filter((s) => s.hostId === employee.id || [...s.staffIds, ...s.writerIds, ...s.editorIds].includes(employee.id));
  if (shows.length > 0) leaves.push(shows.map((s) => `“${s.name}”`).join(', '));
  const campaign = game.campaigns.find((c) => c.marketerId === employee.id);
  if (campaign) {
    const target = game.channels.find((c) => c.id === campaign.targetId)?.name ?? game.shows.find((s) => s.id === campaign.targetId)?.name;
    leaves.push(target ? `the campaign for ${target}, which ends` : 'their campaign, which ends');
  }
  const desk = employeesWithDesk(game).get(employee.id);
  if (desk) leaves.push(`their desk in ${roomName(game, desk.roomId)}`);
  const salary = Math.max(employee.salary, salaryFor('manager', employee.skill, employee.fame, game));
  return [
    `Make ${employee.name} head of ${DEPARTMENT_NAMES[department]}?`,
    leaves.length > 0 ? `They leave ${leaves.join('; ')}.` : null,
    `They need a ${FURNITURE.managerDesk.name.toLowerCase()}, and are paid ${formatMoney(salary)}/mo.`,
  ]
    .filter(Boolean)
    .join(' ');
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
      if (employee.talentUntil != null) return null;
      return shows.length === 0 ? <Tag tone="warning">No show</Tag> : <Tag>{shows.length === 1 ? `Presents “${shows[0]!.name}”` : `Presents ${shows.length} shows`}</Tag>;
    }
    case 'production':
      return (
        <Tag tone={load === 0 ? 'warning' : undefined}>
          {load}/{MAX_SHOWS_PER_PERSON} shows
        </Tag>
      );
    case 'writer':
      return (
        <Tag tone={load === 0 ? 'warning' : undefined}>
          Writes {load}/{WRITERS.showsEach} shows
        </Tag>
      );
    case 'editor':
      return (
        <Tag tone={load === 0 ? 'warning' : undefined}>
          Edits {load}/{EDITORS.showsEach} shows
        </Tag>
      );
    case 'engineer': {
      const desked = employeesWithDesk(game);
      if (!desked.has(employee.id)) return null;
      const shows = [...engineeredShows(game, desked).values()].filter((x) => x.engineerId === employee.id).length;
      return <Tag tone={shows === 0 ? 'warning' : undefined}>Looks after {shows}/{ENGINEERS.showsEach} radio shows</Tag>;
    }
    case 'scheduler': {
      const desked = employeesWithDesk(game);
      if (!desked.has(employee.id)) return null;
      const channelId = [...scheduledChannels(game, desked)].find(([, x]) => x.schedulerId === employee.id)?.[0];
      const channel = game.channels.find((c) => c.id === channelId);
      return channel ? <Tag>Looks after {channel.name}</Tag> : <Tag tone="warning">No music station to look after</Tag>;
    }
    case 'cook':
      return employeesWithDesk(game).has(employee.id) ? <Tag>Cooks for the canteen</Tag> : null;
    case 'clerk':
      return employeesWithDesk(game).has(employee.id) ? <Tag>Sorts the post</Tag> : null;
    case 'guard':
      return employeesWithDesk(game).has(employee.id) ? <Tag>Keeps the fans away</Tag> : null;
    case 'talentManager': {
      const workshop = workshops(game).find((w) => w.teacher.id === employee.id);
      if (!workshop) return null;
      return <Tag>{workshop.pupils.length === 0 ? 'Gives courses' : `Teaches ${workshop.pupils.length} on a course`} · {seatsFree(workshop.seats - workshop.pupils.length)}</Tag>;
    }
    case 'recruiter':
      return employeesWithDesk(game).has(employee.id) ? <Tag>Looks for people</Tag> : null;
    case 'lawyer':
      return employeesWithDesk(game).has(employee.id) ? <Tag>Defends the shows</Tag> : null;
    default:
      if (!SUPPORT_ROLES.includes(employee.role)) return null;
      return employee.location ? <Tag>Working in {roomName(game, employee.location)}</Tag> : <Tag>Nothing to do</Tag>;
  }
}

function HiringPool({ game }: { game: GameState }) {
  const run = useGameStore((s) => s.run);
  const { poolRole, setPoolRole } = useStaffList();
  // Only the jobs the company can hire for yet; the others are named under the list.
  const hirable = game.candidates.filter((c) => canHire(game, c.role, c.department));
  const groups = visiblePoolGroups(game);
  const roles = groups.flatMap((g) => g.tabs.map((t) => t.id));
  const role = roles.includes(poolRole) ? poolRole : roles[0]!;
  const inGroup = (roles: Role[]) => hirable.filter((c) => roles.includes(c.role));
  const found = (roles: Role[]) => (inGroup(roles).some((c) => c.foundFor) ? 'Your recruiter has found someone' : undefined);
  const items = groups.map((g) => ({
    id: g.id,
    label: g.label,
    count: inGroup(g.tabs.map((t) => t.id)).length,
    dot: found(g.tabs.map((t) => t.id)),
    tabs: g.tabs.map((t) => ({ id: t.id, label: roleName(game, t.id), count: inGroup([t.id]).length, dot: found([t.id]) })),
  }));
  const later = FEATURES.filter((feature) => !isUnlocked(game, feature) && ['sales', 'marketing', 'research'].includes(feature));
  // Whoever a recruiter found in the place of a leaving host comes first (0.17.0).
  const candidates = hirable.filter((c) => c.role === role).sort((a, b) => Number(!a.foundFor) - Number(!b.foundFor) || b.skill - a.skill);

  return (
    <Panel title="Hiring pool" help="staff" actions={<span className="muted small">New candidates on the 1st</span>}>
      <GroupedTabs
        groups={items}
        group={groupOf([role])}
        tab={role}
        onGroup={(id) => {
          const tabs = groups.find((g) => g.id === id)!.tabs;
          setPoolRole((tabs.find((t) => inGroup([t.id]).length > 0) ?? tabs[0]!).id);
        }}
        onTab={(id) => setPoolRole(id as Role)}
        groupLabel="Group of roles"
        tabLabel="Role"
        groupGuide="hire-group"
        tabGuide="role"
      />
      <p className="muted small">{ROLE_HELP[role]}</p>
      {candidates.length === 0 ? (
        <Empty>No candidates left this month.</Empty>
      ) : (
        candidates.map((c, index) => (
          <div key={c.id} className="person">
            <Avatar name={c.name} />
            <PersonDetails person={c} />
            <div className="person-meta">
              <div>{formatMoney(c.salary)}/mo</div>
              {c.foundFor && (
                <div className="tags">
                  <Tag tone="good">Found by your recruiter for {game.employees.find((e) => e.id === c.foundFor)?.name ?? 'a leaving host'}</Tag>
                </div>
              )}
            </div>
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
