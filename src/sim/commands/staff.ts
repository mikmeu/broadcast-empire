// The staff: hiring, training, meetings, desks, poaching and pay.

import { LIFE, MORALE, SEVERANCE_MONTHS, TALENT, TRAINING } from '../../config/balance';
import { coachBlocker, isUnsafe, startCoaching } from '../conduct';
import { personName } from '../generate';
import { birthAt, lifeRng, tempBlocker, tempPrice } from '../life';
import { furnitureSpec, ROOM_TYPE_NAMES, inText, type FurnitureType } from '../../config/office';
import { salaryFor, spend } from '../economy';
import { refuseRaise } from '../awards';
import { workableBrands } from '../sales';
import { deskOf, deskRoomOf, employeesWithDesk, findRoom, isWorkplace, needsDesk, ownDesk, ownerOf, workplacesIn } from '../office';
import { hireBlocker } from '../unlocks';
import { hostGivesNotice, poachCooldown, poachTargets, replaceRivalHost } from '../poaching';
import { Rng } from '../rng';
import { DEPARTMENT_NAMES, brandLimit, inHouseCourse, onBrands, onDeals, salesGrade, promotionBlocker, promotionDepartment, removeEmployee, talentBlocker, talentCost, trainingBlocker, trainingCost, unassign } from '../staff';
import { addHeadline, addMessage, newId, type GameState, type Id, type Role, type SalesJob, type TeamId } from '../state';
import { channelMeetingBlocker, holdChannelMeeting, holdMeeting, meetingBlocker, payStrikeBonus } from '../morale';
import { TEAMS } from '../teams';
import { type ActionResult, act, fail, formatEuro } from './core';

export function hire(state: GameState, candidateId: Id): ActionResult {
  return act(state, (draft) => {
    const candidate = draft.candidates.find((c) => c.id === candidateId);
    if (!candidate) return fail('That candidate is no longer available.');
    const blocked = hireBlocker(draft, candidate.role, candidate.department);
    if (blocked) return fail(blocked);
    const department = candidate.department;
    if (department && draft.employees.some((e) => e.role === 'manager' && e.department === department)) {
      return fail(`You already have a ${DEPARTMENT_NAMES[department].toLowerCase()} manager.`);
    }
    draft.candidates = draft.candidates.filter((c) => c !== candidate);
    const { foundFor: _, ...person } = candidate;
    // A new salesperson goes to the job with fewer people, deals on a tie (0.21.0, #360).
    const salesJob = candidate.role === 'sales' ? (draft.employees.filter(onBrands).length < draft.employees.filter(onDeals).length ? 'brands' : 'deals') : undefined;
    draft.employees.push({ ...person, ...(salesJob && { salesJob }), hiredOn: draft.day, xp: 0, level: 1, morale: MORALE.neutral, location: null, desk: null, trainingUntil: null, courseIn: null, leaving: null, talentUntil: null, away: null });
    return candidate.id;
  });
}

/** Sets what a salesperson works on (0.21.0, #360). Moving to deals frees their brands. */
export function setSalesJob(state: GameState, employeeId: Id, job: SalesJob): ActionResult {
  return act(state, (draft) => {
    const employee = draft.employees.find((e) => e.id === employeeId);
    if (!employee || employee.role !== 'sales') return fail('Only a salesperson has a job to set.');
    // A different kind of desk: the place they were given as their own is not theirs any more.
    if (deskOf({ role: 'sales', salesJob: job }) !== deskOf(employee)) employee.desk = null;
    employee.salesJob = job;
    if (job === 'brands') employee.brands ??= [];
    else delete employee.brands;
  });
}

/**
 * Names the brands a salesperson on brands works on: contracted sponsors only, as many as their grade allows. A brand someone
 * else held moves to them.
 */
export function setBrands(state: GameState, employeeId: Id, brands: string[]): ActionResult {
  return act(state, (draft) => {
    const employee = draft.employees.find((e) => e.id === employeeId);
    if (!employee || !onBrands(employee)) return fail('Only a salesperson on brands works on brands.');
    const names = [...new Set(brands)];
    const open = workableBrands(draft);
    const unknown = names.find((b) => !open.includes(b));
    if (unknown) return fail(`${unknown} has no contract with you, or is as close as it gets already.`);
    const limit = brandLimit(salesGrade(draft, employee, employeesWithDesk(draft)));
    if (names.length > limit) return fail(`${employee.name} can work on ${limit} brand${limit === 1 ? '' : 's'} at a grade of ${salesGrade(draft, employee, employeesWithDesk(draft))}.`);
    for (const other of draft.employees) if (other.id !== employee.id && other.brands) other.brands = other.brands.filter((b) => !names.includes(b));
    employee.brands = names;
  });
}

/** Takes on a temp from an agency for someone who is on leave or ill: they do three quarters of the work until the person is back (see LIFE). */
export function hireTemp(state: GameState, employeeId: Id): ActionResult {
  return act(state, (draft) => {
    const employee = draft.employees.find((e) => e.id === employeeId);
    if (!employee) return fail('That person doesn’t work here.');
    const blocked = tempBlocker(draft, employee);
    if (blocked) return fail(blocked);
    employee.away!.temp = { name: personName(lifeRng(draft, employee.id, 'temp')), salary: tempPrice(employee) };
  });
}

/** Sends the temp away: the work waits for the person to be back. */
export function endTemp(state: GameState, employeeId: Id): ActionResult {
  return act(state, (draft) => {
    const employee = draft.employees.find((e) => e.id === employeeId);
    if (!employee?.away?.temp) return fail('There is no temp to send away.');
    employee.away.temp = null;
    // Sent away on purpose: no flex worker steps in again for this spell (0.20.2).
    employee.away.noFlex = true;
  });
}

/** Names another host as a host's back-up, or none (0.21.0, #352): they present the host's shows too while the host is ill (see LIFE.backup). */
export function setBackupHost(state: GameState, hostId: Id, backupId: Id | null): ActionResult {
  return act(state, (draft) => {
    const host = draft.employees.find((e) => e.id === hostId);
    if (!host || host.role !== 'host') return fail('Only a host has a back-up.');
    if (backupId !== null) {
      const backup = draft.employees.find((e) => e.id === backupId);
      if (!backup || backup.role !== 'host') return fail('A back-up has to be a host.');
      if (backup.id === host.id) return fail('A host cannot be their own back-up.');
    }
    host.backupId = backupId;
  });
}

/** Takes on a flex worker (0.20.2, #265): paid every month, and stands in for whoever is away (see LIFE.flex). */
export function hireFlexWorker(state: GameState): ActionResult {
  return act(state, (draft) => {
    const id = newId(draft, 'flex');
    draft.flexWorkers.push({ id, name: personName(lifeRng(draft, id, 'flex')), salary: LIFE.flex.salary, hiredOn: draft.day });
    return id;
  });
}

/** Lets a flex worker go, for severance. Whoever they stood in for has nobody then. */
export function letFlexWorkerGo(state: GameState, flexId: Id): ActionResult {
  return act(state, (draft) => {
    const flex = draft.flexWorkers.find((f) => f.id === flexId);
    if (!flex) return fail('That flex worker is gone already.');
    spend(draft, flex.salary * SEVERANCE_MONTHS, 'severance');
    for (const e of draft.employees) if (e.away?.temp?.flexId === flexId) e.away.temp = null;
    draft.flexWorkers = draft.flexWorkers.filter((f) => f !== flex);
  });
}

/** Sends someone on a course: they come back better, and a stand-in does their work until then (see TRAINING). */
export function sendOnTraining(state: GameState, employeeId: Id): ActionResult {
  return act(state, (draft) => {
    const employee = draft.employees.find((e) => e.id === employeeId);
    if (!employee) return fail('That person doesn’t work here.');
    const blocked = trainingBlocker(draft, employee);
    if (blocked) return fail(blocked);
    const cost = trainingCost(draft, employee);
    if (draft.money < cost) return fail(`Not enough money (${formatEuro(cost)} needed).`);
    // In a workshop with a free seat if there is one (0.18.0), outside if not.
    const workshop = inHouseCourse(draft);
    spend(draft, cost, 'training');
    employee.trainingUntil = draft.day + TRAINING.days;
    employee.courseIn = workshop?.room.roomId ?? null;
  });
}

/** Sends a weak host into the talent programme: a year away, presenting nothing, for TALENT.salaryMonths of their salary (0.14.0). */
export function sendToTalentProgramme(state: GameState, employeeId: Id): ActionResult {
  return act(state, (draft) => {
    const employee = draft.employees.find((e) => e.id === employeeId);
    if (!employee) return fail('That person doesn’t work here.');
    const blocked = talentBlocker(draft, employee);
    if (blocked) return fail(blocked);
    const cost = talentCost(employee);
    if (draft.money < cost) return fail(`Not enough money (${formatEuro(cost)} needed).`);
    spend(draft, cost, 'training');
    employee.talentUntil = draft.day + TALENT.days;
  });
}

/**
 * Makes someone head of their department (0.17.0): they leave their shows, their
 * campaign and their workstation, and are paid at least a manager's salary.
 */
export function promote(state: GameState, employeeId: Id): ActionResult {
  return act(state, (draft) => {
    const employee = draft.employees.find((e) => e.id === employeeId);
    if (!employee) return fail('That person doesn’t work here.');
    const blocked = promotionBlocker(draft, employee);
    if (blocked) return fail(blocked);
    const department = promotionDepartment(employee.role)!;
    unassign(draft, employee.id);
    employee.role = 'manager';
    employee.department = department;
    employee.desk = null;
    employee.location = null;
    employee.salary = Math.max(employee.salary, salaryFor('manager', employee.skill, employee.fame, draft));
    addMessage(draft, 'good', `${employee.name} is the head of ${DEPARTMENT_NAMES[department]} now.`, undefined, 'staff');
  });
}

export function fire(state: GameState, employeeId: Id): ActionResult {
  return act(state, (draft) => {
    const employee = draft.employees.find((e) => e.id === employeeId);
    if (!employee) return fail('That person doesn’t work here.');
    // A host who is unsafe to work with is let go for cause: no severance (0.22.0, #259).
    if (!isUnsafe(employee)) spend(draft, employee.salary * SEVERANCE_MONTHS, 'severance');
    removeEmployee(draft, employeeId);
  });
}

/** Has a psychologist coach a host who is unsafe to work with (0.22.0, #259): it takes PSYCHOLOGY.coachDays, and the host stays on the air. */
export function coachHost(state: GameState, hostId: Id): ActionResult {
  return act(state, (draft) => {
    const host = draft.employees.find((e) => e.id === hostId);
    if (!host) return fail('That person doesn’t work here.');
    const desked = employeesWithDesk(draft);
    const blocked = coachBlocker(draft, host, desked);
    if (blocked) return fail(blocked);
    startCoaching(draft, host, desked);
  });
}

/** Calls a team to a meeting in the meeting room: happier for a month, less done today (see MEETINGS). */
export function callMeeting(state: GameState, team: TeamId): ActionResult {
  return act(state, (draft) => {
    const blocked = meetingBlocker(draft, team);
    if (blocked) return fail(blocked);
    holdMeeting(draft, team);
  });
}

/** Has a team meet every month by itself, as soon as it may and a meeting room is free, or stops it. */
export function setMonthlyMeeting(state: GameState, team: TeamId, monthly: boolean): ActionResult {
  return act(state, (draft) => {
    if (TEAMS[team].ledBy === null) return fail(`There are no meetings for ${TEAMS[team].inText}.`);
    draft.meetings[team] = { on: draft.meetings[team]?.on ?? null, lift: draft.meetings[team]?.lift ?? 0, monthly, minutes: draft.meetings[team]?.minutes ?? true };
  });
}

/** Has the leader of a team send the minutes of its meetings, or stops it (0.20.0, #151). */
export function setMeetingMinutes(state: GameState, team: TeamId, minutes: boolean): ActionResult {
  return act(state, (draft) => {
    if (TEAMS[team].ledBy === null) return fail(`There are no meetings for ${TEAMS[team].inText}.`);
    const meeting = draft.meetings[team];
    draft.meetings[team] = { on: meeting?.on ?? null, lift: meeting?.lift ?? 0, monthly: meeting?.monthly ?? false, minutes };
  });
}

/** A channel manager calls the production staff of their channel to a meeting (0.17.0): as `callMeeting`. */
export function callChannelMeeting(state: GameState, channelId: Id): ActionResult {
  return act(state, (draft) => {
    const blocked = channelMeetingBlocker(draft, channelId);
    if (blocked) return fail(blocked);
    holdChannelMeeting(draft, channelId);
  });
}

/** Has a channel's production team meet every month by itself, as soon as it may and a meeting room is free, or stops it. */
export function setMonthlyChannelMeeting(state: GameState, channelId: Id, monthly: boolean): ActionResult {
  return act(state, (draft) => {
    if (!draft.channels.some((c) => c.id === channelId)) return fail('That channel doesn’t exist.');
    const meeting = draft.channelMeetings[channelId];
    draft.channelMeetings[channelId] = { on: meeting?.on ?? null, lift: meeting?.lift ?? 0, monthly, minutes: meeting?.minutes ?? true };
  });
}

/** As `setMeetingMinutes`, for a channel's production team. */
export function setChannelMeetingMinutes(state: GameState, channelId: Id, minutes: boolean): ActionResult {
  return act(state, (draft) => {
    if (!draft.channels.some((c) => c.id === channelId)) return fail('That channel doesn’t exist.');
    const meeting = draft.channelMeetings[channelId];
    draft.channelMeetings[channelId] = { on: meeting?.on ?? null, lift: meeting?.lift ?? 0, monthly: meeting?.monthly ?? false, minutes };
  });
}

/** Ends a strike at once by paying everyone on it a bonus (see STRIKES.bonusMonths). */
export function endStrike(state: GameState, team: TeamId): ActionResult {
  return act(state, (draft) => {
    const error = payStrikeBonus(draft, team);
    if (error) return fail(error);
  });
}

/**
 * Gives someone a workplace of their own: a workstation in an office, or for
 * a manager a manager's desk in a management office. Whoever had that place
 * goes back to taking what is free. With null the person does so themselves.
 */
export function assignDesk(state: GameState, employeeId: Id, furnitureId: Id | null): ActionResult {
  return act(state, (draft) => {
    const employee = draft.employees.find((e) => e.id === employeeId);
    if (!employee) return fail('That person doesn’t work here.');
    if (furnitureId === null) {
      employee.desk = null;
      return;
    }
    if (!needsDesk(employee.role)) return fail(`${employee.name} doesn’t work at a desk.`);
    const room = draft.rooms.find((r) => r.furniture.some((f) => f.id === furnitureId));
    const item = room?.furniture.find((f) => f.id === furnitureId);
    if (!room || !item || !isWorkplace(room, item)) return fail('That is no place to work at.');
    if (item.type !== deskOf(employee)) {
      const room = inText(ROOM_TYPE_NAMES[deskRoomOf(employee)]);
      return fail(`${employee.name} works at a ${inText(furnitureSpec(deskOf(employee)).name)}, in ${/^[aeiou]/.test(room) ? 'an' : 'a'} ${room}.`);
    }
    for (const other of draft.employees) if (other.desk === furnitureId) other.desk = null;
    employee.desk = furnitureId;
  });
}

/**
 * Gives the people of one job the workplaces of a room that are nobody's own
 * yet, as far as they go: so that a department has an office to itself. Those
 * who have a place of their own keep it.
 */
export function seatGroup(state: GameState, roomId: string, role: Role): ActionResult {
  return act(state, (draft) => {
    const room = findRoom(draft, roomId);
    if (!room) return fail('You don’t have this room.');
    if (!needsDesk(role)) return fail('They don’t work at a desk.');
    // A salesperson's desk goes by their job (0.21.0): the pieces of this room are for the people whose desk is of that kind.
    const mine = (item: { type: FurnitureType }) => draft.employees.some((e) => e.role === role && deskOf(e) === item.type);
    const places = workplacesIn(room).filter((item) => mine(item) && !ownerOf(draft, item.id));
    if (places.length === 0) return fail(workplacesIn(room).some(mine) ? 'Every workplace in this room is somebody’s own already.' : 'There is no workplace for them in this room.');
    const kind = places[0]!.type;
    const people = draft.employees.filter((e) => e.role === role && deskOf(e) === kind && !ownDesk(draft, e)).sort((a, b) => a.hiredOn - b.hiredOn);
    if (people.length === 0) return fail('Everyone in that job has a place of their own already.');
    // The newest desks first, as when nobody chooses.
    places.sort((a, b) => b.tier - a.tier);
    people.slice(0, places.length).forEach((employee, n) => (employee.desk = places[n]!.id));
  });
}

/** Keeps a host a rival wants by paying them what the rival offered. */
export function matchPoachOffer(state: GameState, offerId: Id): ActionResult {
  return act(state, (draft) => {
    const offer = draft.poachOffers.find((o) => o.id === offerId);
    const host = offer && draft.employees.find((e) => e.id === offer.hostId);
    if (!offer || !host) return fail('That offer is no longer open.');
    host.salary = Math.max(host.salary, offer.salary);
    draft.poachOffers = draft.poachOffers.filter((o) => o !== offer);
    addMessage(draft, 'good', `${host.name} stays, now on ${formatEuro(host.salary)} a month.`, undefined, undefined, 'staff');
  });
}

/** Lets a host go to the rival that made them an offer, without waiting for it to run out: they work out their notice and leave. */
export function declinePoachOffer(state: GameState, offerId: Id): ActionResult {
  return act(state, (draft) => {
    const offer = draft.poachOffers.find((o) => o.id === offerId);
    if (!offer) return fail('That offer is no longer open.');
    hostGivesNotice(draft, offer);
  });
}

/** Gives a host who won an award the salary they ask for. */
export function grantRaise(state: GameState, requestId: Id): ActionResult {
  return act(state, (draft) => {
    const request = draft.awards.raises.find((r) => r.id === requestId);
    const host = request && draft.employees.find((e) => e.id === request.hostId);
    if (!request || !host) return fail('That request is no longer open.');
    host.salary = Math.max(host.salary, request.salary);
    draft.awards.raises = draft.awards.raises.filter((r) => r !== request);
    addMessage(draft, 'good', `${host.name} is now on ${formatEuro(host.salary)} a month.`);
  });
}

/** Turns down a host who won an award and asks for more: they stay on their salary, and their morale drops. */
export function declineRaise(state: GameState, requestId: Id): ActionResult {
  return act(state, (draft) => {
    if (!draft.awards.raises.some((r) => r.id === requestId)) return fail('That request is no longer open.');
    refuseRaise(draft, requestId);
  });
}

/** Signs the host of a rival's show: a signing fee now and a premium salary. The rival's show suffers. */
export function poachHost(state: GameState, rivalChannelId: Id, slot: number): ActionResult {
  return act(state, (draft) => {
    const target = poachTargets(draft).find((t) => t.channel.id === rivalChannelId && t.slot === slot);
    if (!target) return fail('That host can’t be signed.');
    const wait = poachCooldown(draft);
    if (wait > 0) return fail(`Word gets around: wait ${wait} more day${wait === 1 ? '' : 's'} before approaching another rival host.`);
    if (draft.money < target.fee) return fail(`Not enough money (${formatEuro(target.fee)} signing fee).`);
    spend(draft, target.fee, 'severance');
    const id = newId(draft, 'p');
    const { show, rival } = target;
    draft.employees.push({
      id,
      name: show.hostName,
      role: 'host',
      skill: target.skill,
      salary: target.salary,
      specialties: [show.genre],
      fame: show.hostFame,
      department: null,
      // A rival's host has no age until they sign with you (0.20.0): between 25 and 45.
      bornOn: birthAt(draft, id, 25, 45),
      hiredOn: draft.day,
      xp: 0,
      level: 1,
      morale: MORALE.neutral,
      location: null,
      desk: null,
      trainingUntil: null,
      courseIn: null,
      leaving: null,
      talentUntil: null,
      away: null,
    });
    draft.lastPoachDay = draft.day;
    addHeadline(draft, `${show.hostName} leaves ${rival.name} to join your channels.`);
    const rng = new Rng(draft.rngState);
    replaceRivalHost(show, rng);
    draft.rngState = rng.state;
    return id;
  });
}
