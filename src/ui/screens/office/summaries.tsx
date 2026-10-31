// What the office screen says about the desks, the upkeep and the load.

import { Fragment } from 'react';
import { CLEANLINESS } from '../../../config/balance';
import { furnitureSpec } from '../../../config/office';
import { CALLS, COOKS, ENGINEERS, MEETINGS, POST, SCHEDULERS, SECURITY, TRAINING, WORKSHOP } from '../../../config/balance';
import { countOf, isFurnished, deskFor, deskRoomFor, employeesWithDesk, isBroken, isManager, managerDeskCount, needsDesk, wearsOut, workstationCount } from '../../../sim/office';
import type { Employee, GameState, RentedRoom } from '../../../sim/state';
import { formatDate } from '../../../sim/calendar';
import { averageMorale, canteenStatus, guardedHosts, hotMeals, postSorted, targets, technicianTitle, upkeepLoad, type Workload } from '../../../sim/upkeep';
import { engineeredShows, isEngineered, isMusicStation, scheduledChannels } from '../../../sim/broadcast';
import { getGenre } from '../../../config/genres';
import { channelTeamText } from '../../../sim/morale';
import { TEAMS, TEAM_IDS, notWorking } from '../../../sim/teams';
import { workshops } from '../../../sim/staff';
import { votingOpen } from '../../../sim/calls';
import { Tag } from '../../components';
import { formatPercent } from '../../format';
import { OTHER_PLACES, ROLE_TITLES } from './people';
import { listOf, plural } from './shared';

export function DeskSummary({ game }: { game: GameState }) {
  const desked = employeesWithDesk(game);
  const deskWorkers = game.employees.filter((e) => needsDesk(e.role));
  const managers = deskWorkers.filter((e) => isManager(e.role));
  const staff = deskWorkers.filter((e) => deskFor(e.role) === 'workstation');
  // Whoever is on strike, or away with nobody in their place, is at home: they need no desk today.
  const without = (people: Employee[]) => people.filter((e) => !desked.has(e.id) && !notWorking(game, e)).length;
  const broken = game.rooms.flatMap((r) => r.furniture).filter((f) => f.type === 'workstation' && isBroken(f)).length;
  const others = OTHER_PLACES.map((kind) => ({
    ...kind,
    people: deskWorkers.filter((e) => e.role === kind.role),
    places: game.rooms.filter((r) => r.type === deskRoomFor(kind.role)).reduce((n, r) => n + countOf(r.furniture, deskFor(kind.role)), 0),
  }));
  return (
    <p className="muted small">
      {plural(workstationCount(game), 'workstation')}
      {broken > 0 && ` (${broken} broken)`} for {staff.length} office staff.{' '}
      {without(staff) > 0 && <Tag tone="danger">{without(staff)} without a working workstation: they can’t work</Tag>}{' '}
      {plural(managerDeskCount(game), 'manager’s desk')} for {plural(managers.length, 'manager')}.{' '}
      {without(managers) > 0 && <Tag tone="danger">{without(managers)} without a desk in a management office: they can’t work</Tag>}{' '}
      {others.map((kind) => (
        <Fragment key={kind.role}>
          {(kind.people.length > 0 || kind.places > 0) && <>{plural(kind.places, kind.place)} for {plural(kind.people.length, kind.whom)}.{' '}</>}
          {without(kind.people) > 0 && <Tag tone="danger">{without(kind.people)} {kind.without}</Tag>}{' '}
        </Fragment>
      ))}
      {without(deskWorkers) === 0 && 'Hosts and support staff don’t need a desk.'}
    </p>
  );
}

/** What the cooks make, against what the staff eat (0.15.0). */
export function hotMealsText(game: GameState): string {
  const cooks = game.employees.filter((e) => e.role === 'cook').length;
  if (cooks === 0) return `None: with a stove and a cook, everyone who gets a hot meal is happier (+${COOKS.morale} morale).`;
  return `${Math.floor(hotMeals(game, employeesWithDesk(game)))} a day for ${game.employees.length} staff, by ${plural(cooks, 'cook')} (+${COOKS.morale} morale for those who get one)`;
}

/** Which teams meet today (0.15.0), and which channels' production teams (0.17.0). */
export function meetingsToday(game: GameState): string {
  const met = [
    ...TEAM_IDS.filter((team) => game.meetings[team]?.on === game.day).map((team) => TEAMS[team].inText),
    ...game.channels.filter((c) => game.channelMeetings[c.id]?.on === game.day).map(channelTeamText),
  ];
  return met.length > 0 ? `A meeting of ${met.join(' and ')}.` : `No meeting. A team is called from the Staff window: +${MEETINGS.morale} morale for ${MEETINGS.lasts} days.`;
}

/** Whose post is sorted, and what fan mail does (0.15.0). */
export function postText(game: GameState): string {
  const sorted = postSorted(game, employeesWithDesk(game));
  if (sorted === 0) return `Nobody sorts it: a clerk at a sorting case sorts the post of ${POST.staffEach} staff (+${POST.morale} morale), and fan mail makes the hosts famous faster.`;
  return `Sorted for ${Math.min(game.employees.length, Math.floor(sorted))} of ${game.employees.length} staff (+${POST.morale} morale). Fan mail makes the hosts famous ${POST.fameGrowth} times as fast.`;
}

/** The calls the agents took yesterday: call-ins, votes and mail orders (0.20.0). */
export function callsText(game: GameState): string {
  const calls = game.lastDay?.calls;
  const open = votingOpen(game);
  if (!calls) {
    const how = `a call agent at a call desk answers about ${CALLS.each} calls a day: listeners phoning in to radio talk shows${open ? ', viewers paying to vote on game shows and reality TV' : ''}, then orders for the merchandise.`;
    return game.employees.some((e) => e.role === 'callAgent') ? `No calls were taken yesterday: ${how}` : `Nobody takes the calls: ${how}`;
  }
  const count = (n: number) => Math.round(n).toLocaleString('en-IE');
  const parts = [
    calls.callIns.wanted > 0 ? `call-ins ${count(calls.callIns.answered)} of ${count(calls.callIns.wanted)} answered` : 'no talk show on the air to phone in to',
    open ? (calls.votes.wanted > 0 ? `votes ${count(calls.votes.answered)} of ${count(calls.votes.wanted)} answered` : 'no votes: no game show or reality show on the air') : 'paid votes come with “Premium-rate lines”',
    `${count(calls.orders)} mail orders`,
  ];
  return `Yesterday ${count(calls.capacity)} calls could be taken: ${parts.join(', ')}.`;
}

/** How many of the hosts fans come after are guarded (0.18.0). */
export function securityText(game: GameState): string {
  const need = targets(game).length;
  const guarded = guardedHosts(game, employeesWithDesk(game)).size;
  if (need === 0) return `No host is famous enough yet (fame ${SECURITY.minFame}). A guard at a security desk looks after ${SECURITY.hostsEach} hosts, the most famous first.`;
  if (guarded >= need) return `All ${plural(need, 'famous host')} guarded.`;
  return `${guarded} of ${need} famous hosts guarded. The rest are on edge (−${SECURITY.penalty} morale), and now and then a fan gets in. A guard looks after ${SECURITY.hostsEach}.`;
}

/** Who sits a course in a workshop, and until when (0.18.0). */
export function WorkshopCourses({ game, room }: { game: GameState; room: RentedRoom }) {
  const workshop = workshops(game).find((w) => w.room.roomId === room.roomId);
  const seats = countOf(room.furniture, 'trainingSeat') * WORKSHOP.seatsPerPiece;
  const pupils = game.employees.filter((e) => e.trainingUntil != null && e.courseIn === room.roomId);
  if (!workshop) {
    const why = isFurnished(room) ? 'no talent manager works at the trainer’s desk' : 'it lacks something on its checklist';
    return <>None given: {why}.{pupils.length > 0 && ` Those on a course here finish it.`}</>;
  }
  return (
    <>
      {workshop.teacher.name} teaches. {pupils.length} of {plural(seats, 'seat')} taken. A course here costs {WORKSHOP.salaryMonths} month of the salary of whoever goes, against {TRAINING.salaryMonths} outside: send someone from the Staff window.
      {pupils.length > 0 && (
        <ul className="small">
          {pupils.map((e) => (
            <li key={e.id}>{e.name} · {ROLE_TITLES[e.role]} · until {formatDate(e.trainingUntil!)}</li>
          ))}
        </ul>
      )}
    </>
  );
}

/** The radio shows the audio engineers look after (0.15.0). */
export function engineeringText(game: GameState): string {
  const radio = game.shows.filter((s) => isEngineered(getGenre(s.genre)) && game.channels.some((c) => c.schedule.includes(s.id))).length;
  const looked = engineeredShows(game, employeesWithDesk(game)).size;
  return `${looked} of ${plural(radio, 'radio show')} on the air. Each engineer looks after ${ENGINEERS.showsEach}; a show they look after loses up to ${Math.round(ENGINEERS.slower * 100)}% less of its freshness.`;
}

/** The music stations the music schedulers look after (0.18.0). */
export function schedulingText(game: GameState): string {
  const stations = game.channels.filter((c) => isMusicStation(game, c)).length;
  const looked = scheduledChannels(game, employeesWithDesk(game)).size;
  return `${looked} of ${plural(stations, 'music station')}. Each scheduler looks after ${SCHEDULERS.channelsEach}; its music shows are up to ${Math.round(SCHEDULERS.bonus * 100)}% more appealing.`;
}

/** Whether the support staff keep up with the office, and how the staff feel about it. */
export function UpkeepSummary({ game }: { game: GameState }) {
  const load = upkeepLoad(game, employeesWithDesk(game));
  const staff = (role: string, one: string, many = `${one}s`) => {
    const n = game.employees.filter((e) => e.role === role).length;
    return `${n} ${n === 1 ? one : many}`;
  };
  const items = game.rooms.flatMap((r) => r.furniture);
  const worst = Math.min(100, ...items.filter((f) => wearsOut(f.type)).map((f) => f.condition));
  const dirtiest = Math.min(100, ...game.rooms.map((r) => r.cleanliness));
  const issues = game.rooms.filter((r) => r.issue).length;
  const morale = averageMorale(game);
  const canteen = canteenStatus(game);
  const technician = technicianTitle(game).toLowerCase();

  return (
    <dl className="upkeep small">
      <div>
        <dt>Cleaning</dt>
        <dd className="muted">{staff('cleaner', 'cleaner')} · dirtiest room {Math.round(dirtiest)}%</dd>
        <dd><LoadTag load={load.cleaning} bad={dirtiest < CLEANLINESS.cleanEnough} hire="cleaners" /></dd>
      </div>
      <div>
        <dt>Repairs</dt>
        <dd className="muted">{staff('technician', technician)} · worst item {Math.round(worst)}%</dd>
        <dd><LoadTag load={load.repairs} bad={worst < 50} hire={`${technician}s`} /></dd>
      </div>
      <div>
        <dt>Building</dt>
        <dd className="muted">{staff('maintenance', 'maintenance worker')} · {issues} open fault{issues === 1 ? '' : 's'}</dd>
        <dd><LoadTag load={load.maintenance} bad={issues > 0} hire="maintenance staff" /></dd>
      </div>
      <div>
        <dt>Morale</dt>
        <dd className="muted">Average {Math.round(morale)} of 100</dd>
        <dd>
          {game.employees.length === 0 ? null : canteen.kind === 'none' ? (
            <Tag>A canteen would raise it</Tag>
          ) : canteen.kind === 'incomplete' ? (
            <Tag tone="warning">The canteen still needs {listOf(canteen.missing.map(([type, n]) => plural(n, furnitureSpec(type).name.toLowerCase())))}</Tag>
          ) : canteen.kind === 'filthy' ? (
            <Tag tone="danger">The canteen is too dirty to eat in</Tag>
          ) : canteen.coverage < 1 ? (
            <Tag tone="warning">The canteen serves {formatPercent(canteen.coverage)} of staff</Tag>
          ) : (
            <Tag tone="good">The canteen serves everyone</Tag>
          )}
        </dd>
      </div>
    </dl>
  );
}

/** Whether the support staff can do the daily work, and whether something is already in a bad state (`bad`). */
function LoadTag({ load, bad, hire }: { load: Workload; bad: boolean; hire: string }) {
  if (load.needed === 0) return null;
  if (load.capacity >= load.needed) return bad ? <Tag>Catching up</Tag> : <Tag tone="good">Keeping up</Tag>;
  return <Tag tone={bad ? 'danger' : 'warning'}>{load.capacity === 0 ? `No ${hire}` : `Not enough ${hire}`}</Tag>;
}
