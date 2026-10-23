// Department managers, effective skill and staff experience.

import { DECOR, MANAGER, TALENT, TRAINING, WORKSHOP, XP } from '../config/balance';
import type { FurnitureType } from '../config/office';
import { formatDate } from './calendar';
import { salaryFor } from './economy';
import { employeesWithDesk, findRoom, isFurnished, needsDesk, type Desks } from './office';
import type { Rng } from './rng';
import { onStrike } from './teams';
import { officeOutput } from './tech';
import { featureOfRole, isUnlocked, lockedReason } from './unlocks';
import { workFactor } from './upkeep';
import { addMessage, type Department, type Employee, type GameState, type Id, type RentedRoom, type Role } from './state';

/** Roles a department manager leads. */
const DEPARTMENT_ROLE: Record<Department, Role> = { production: 'production', sales: 'sales', marketing: 'marketing', research: 'researcher' };

export const DEPARTMENT_NAMES: Record<Department, string> = {
  production: 'Production',
  sales: 'Sales',
  marketing: 'Marketing',
  research: 'R&D',
};

/** The manager leading a department, if they have a desk. */
export function managerOf(state: GameState, department: Department, desked: Desks): Employee | undefined {
  return state.employees.find((e) => e.role === 'manager' && e.department === department && desked.has(e.id));
}

/**
 * Skill including the department manager's bonus (up to +20%, scaled by the
 * manager's skill, for the department's best `MANAGER.teamSize` members with a
 * desk), times the output of their workstation's tier.
 */
export function effectiveSkill(state: GameState, employee: Employee, desked: Desks): number {
  const desk = desked.get(employee.id);
  if (desk === undefined) return skillAtWork(employee);
  return managedSkill(state, employee, desked) * officeOutput(desk.tier) * decorLift(state, employee, desk.roomId);
}

/** The piece on the wall of an office that helps a job along (0.16.0), and by how much: see DECOR. */
const DESK_DECOR: Partial<Record<Role, { type: FurnitureType; lift: number }>> = {
  production: { type: 'calendar', lift: DECOR.calendar },
  sales: { type: 'salesChart', lift: DECOR.salesChart },
};

/** What the decor of their office adds to someone's work: a production calendar for production, a sales chart for sales (1 = nothing). */
export function decorLift(state: GameState, employee: Employee, roomId: string): number {
  const decor = DESK_DECOR[employee.role];
  return decor && findRoom(state, roomId)?.furniture.some((f) => f.type === decor.type) ? 1 + decor.lift : 1;
}

/** The skill that does someone's work today: their own, or their stand-in's while they are away on a course. */
export const skillAtWork = (person: { skill: number; trainingUntil?: number | null }) => person.skill * (person.trainingUntil != null ? TRAINING.standIn : 1);

/** The jobs there are courses for, each with the head who arranges one: a host's channel manager, or the manager of the department. */
const TRAINED_BY: Partial<Record<Role, { head: string; department?: Department }>> = {
  host: { head: 'a channel manager' },
  production: { head: 'the head of Production', department: 'production' },
  sales: { head: 'the head of Sales', department: 'sales' },
  marketing: { head: 'the head of Marketing', department: 'marketing' },
  researcher: { head: 'the head of Research', department: 'research' },
  writer: { head: 'the head of Production', department: 'production' },
  editor: { head: 'the head of Production', department: 'production' },
};

/** Whether there are courses for a job at all. */
export const hasCourses = (role: Role) => TRAINED_BY[role] !== undefined;

/** A workshop where courses are given, with its talent manager and its seats (0.18.0). */
export interface Workshop {
  room: RentedRoom;
  teacher: Employee;
  seats: number;
  /** Who sits a course there now. */
  pupils: Employee[];
}

/**
 * The workshops that give courses today (0.18.0): those that have all they
 * need, with a talent manager at work at the trainer's desk.
 */
export function workshops(state: GameState, desked: Desks = employeesWithDesk(state)): Workshop[] {
  return state.rooms.flatMap((room) => {
    if (room.type !== 'workshop' || !isFurnished(room)) return [];
    const teacher = state.employees.find((e) => e.role === 'talentManager' && desked.get(e.id)?.roomId === room.roomId);
    if (!teacher) return [];
    const seats = room.furniture.filter((f) => f.type === 'trainingSeat').length * WORKSHOP.seatsPerPiece;
    return [{ room, teacher, seats, pupils: state.employees.filter((e) => e.trainingUntil != null && e.courseIn === room.roomId) }];
  });
}

/** The workshop with a free seat where the next course is given, the emptiest first, or undefined: then a course is outside. */
export const inHouseCourse = (state: GameState): Workshop | undefined =>
  workshops(state)
    .filter((w) => w.pupils.length < w.seats)
    .sort((a, b) => b.seats - b.pupils.length - (a.seats - a.pupils.length))[0];

/** What a course for someone costs: the course and their stand-in, or in a workshop the stand-in alone. */
export const trainingCost = (state: GameState, employee: Employee) =>
  Math.round((employee.salary * (inHouseCourse(state) ? WORKSHOP.salaryMonths : TRAINING.salaryMonths)) / 100) * 100;

/**
 * Why someone can't be sent on a course today, or null if they can. In a
 * workshop with a free seat the talent manager arranges it (0.18.0); outside,
 * the head of the department does, for one of each job at a time.
 */
export function trainingBlocker(state: GameState, employee: Employee): string | null {
  const course = TRAINED_BY[employee.role];
  if (!course) return 'There are no courses for this job.';
  if (employee.trainingUntil != null) return `${employee.name} is on a course already, until ${formatDate(employee.trainingUntil)}.`;
  if (employee.skill >= XP.maxSkill) return `${employee.name} has nothing left to learn.`;
  const desked = employeesWithDesk(state);
  if (inHouseCourse(state)) return null;
  const full = workshops(state, desked).length > 0 ? 'Every training seat is taken. ' : '';
  const head = course.department ? managerOf(state, course.department, desked) : state.employees.find((e) => e.role === 'channelManager' && desked.has(e.id));
  if (!head) return `${full}A course outside is arranged by ${course.head}, at a desk: hire one first, or a talent manager for a workshop.`;
  const away = state.employees.find((e) => e.role === employee.role && e.trainingUntil != null && e.courseIn == null);
  if (away) return `${full}${away.name} is on a course outside until ${formatDate(away.trainingUntil!)}: one at a time.`;
  return null;
}

/** The department someone can be made head of, by their job (0.17.0): engineers are on the production team, so Production. */
const PROMOTED_TO: Partial<Record<Role, Department>> = {
  production: 'production',
  writer: 'production',
  editor: 'production',
  engineer: 'production',
  scheduler: 'production',
  sales: 'sales',
  marketing: 'marketing',
  researcher: 'research',
};

/** The department someone in this job can be made head of, or null. */
export const promotionDepartment = (role: Role): Department | null => PROMOTED_TO[role] ?? null;

/** Why someone can't be made head of their department today, or null if they can (0.17.0). */
export function promotionBlocker(state: GameState, employee: Employee): string | null {
  const department = promotionDepartment(employee.role);
  if (!department) return 'Only production, sales, marketing and R&D staff can be made head of a department.';
  const locked = featureOfRole('manager', department);
  if (locked && !isUnlocked(state, locked)) return lockedReason(locked);
  if (state.employees.some((e) => e.role === 'manager' && e.department === department)) return `You already have a ${DEPARTMENT_NAMES[department].toLowerCase()} manager.`;
  if (employee.trainingUntil != null) return `${employee.name} is on a course until ${formatDate(employee.trainingUntil)}.`;
  if (onStrike(state, employee)) return `${employee.name} is on strike.`;
  if (employee.leaving) return `${employee.name} is leaving.`;
  return null;
}

/** What the talent programme costs for a host: months of their salary. */
export const talentCost = (employee: Employee) => Math.round((employee.salary * TALENT.salaryMonths) / 100) * 100;

/** Why a host can't go into the talent programme today, or null if they can (0.14.0). */
export function talentBlocker(state: GameState, employee: Employee): string | null {
  if (employee.role !== 'host') return 'The talent programme is for hosts.';
  if (employee.talentUntil != null) return `${employee.name} is in the talent programme already, until ${formatDate(employee.talentUntil)}.`;
  if (employee.skill > TALENT.maxSkill) return `The talent programme is for hosts of skill ${TALENT.maxSkill} or less; ${employee.name} has ${employee.skill}.`;
  if (employee.trainingUntil != null) return `${employee.name} is on a course until ${formatDate(employee.trainingUntil)}.`;
  if (employee.leaving) return `${employee.name} is leaving.`;
  const show = state.shows.find((s) => s.hostId === employee.id);
  if (show) return `${employee.name} presents “${show.name}”: give the show another host first.`;
  // A talent manager at the trainer's desk of a workshop arranges it (0.18.0); a channel manager did before.
  if (workshops(state).length === 0) return 'The talent programme is arranged by a talent manager, at a trainer’s desk in a workshop that has all it needs: build one and hire one first.';
  const away = state.employees.find((e) => e.talentUntil != null);
  if (away) return `${away.name} is in the talent programme until ${formatDate(away.talentUntil!)}: one at a time.`;
  return null;
}

/** Brings back whoever's course ends today: better at their job, and paid for it. */
export function finishTraining(draft: GameState, rng: Rng): void {
  for (const e of draft.employees) {
    // The day that is ending is the last one away: tomorrow they are back at work.
    if (e.trainingUntil == null || e.trainingUntil > draft.day + 1) continue;
    e.trainingUntil = null;
    e.courseIn = null;
    e.skill = Math.min(XP.maxSkill, e.skill + rng.int(TRAINING.skillGain.min, TRAINING.skillGain.max));
    const oldSalary = e.salary;
    e.salary = Math.max(e.salary, salaryFor(e.role, e.skill, e.fame, draft));
    const raise = e.salary > oldSalary ? ` Their salary goes up to €${e.salary.toLocaleString('en-IE')}.` : '';
    addMessage(draft, 'good', `${e.name} is back from the course, with skill ${e.skill}.${raise}`, undefined, undefined, 'staff');
  }
  for (const e of draft.employees) {
    if (e.talentUntil == null || e.talentUntil > draft.day + 1) continue;
    e.talentUntil = null;
    e.skill = Math.min(XP.maxSkill, e.skill + rng.int(TALENT.skillGain.min, TALENT.skillGain.max));
    const oldSalary = e.salary;
    e.salary = Math.max(e.salary, salaryFor(e.role, e.skill, e.fame, draft));
    const raise = e.salary > oldSalary ? ` Their salary goes up to €${e.salary.toLocaleString('en-IE')}.` : '';
    addMessage(draft, 'good', `${e.name} is through the talent programme, with skill ${e.skill}, and ready to present a show.${raise}`, undefined, 'staff');
  }
}

function managedSkill(state: GameState, employee: Employee, desked: Desks): number {
  const department = (Object.keys(DEPARTMENT_ROLE) as Department[]).find((d) => DEPARTMENT_ROLE[d] === employee.role);
  const manager = department && managerOf(state, department, desked);
  if (!manager) return skillAtWork(employee);
  const team = state.employees
    .filter((e) => e.role === employee.role && desked.has(e.id))
    .sort((a, b) => b.skill - a.skill)
    .slice(0, MANAGER.teamSize);
  if (!team.some((e) => e.id === employee.id)) return skillAtWork(employee);
  return Math.min(100, skillAtWork(employee) * (1 + (MANAGER.maxBonus * manager.skill) / 100));
}

/**
 * Sum of effective skill / 100 over a department's staff with a desk (research:
 * points per day), less what a dirty office and low morale cost them.
 */
export function departmentPower(state: GameState, role: 'sales' | 'marketing' | 'researcher', desked: Desks): number {
  return state.employees
    .filter((e) => e.role === role && desked.has(e.id))
    .reduce((sum, e) => sum + (effectiveSkill(state, e, desked) / 100) * workFactor(state, e, desked), 0);
}

/** Takes someone off the payroll and out of every show, channel and campaign they worked on. */
export function removeEmployee(draft: GameState, employeeId: Id): void {
  draft.employees = draft.employees.filter((e) => e.id !== employeeId);
  unassign(draft, employeeId);
  draft.poachOffers = draft.poachOffers.filter((o) => o.hostId !== employeeId);
  draft.awards.raises = draft.awards.raises.filter((r) => r.hostId !== employeeId);
  // Whoever a recruiter found in their place goes with the next month's pool (0.17.0).
  for (const candidate of draft.candidates) if (candidate.foundFor === employeeId) candidate.foundFor = null;
}

/** Takes someone out of every show, channel and campaign they work on; their campaign ends (shared by firing and promotion, 0.17.0). */
export function unassign(draft: GameState, employeeId: Id): void {
  for (const show of draft.shows) {
    if (show.hostId === employeeId) show.hostId = null;
    show.staffIds = show.staffIds.filter((id) => id !== employeeId);
    show.writerIds = show.writerIds.filter((id) => id !== employeeId);
    show.editorIds = show.editorIds.filter((id) => id !== employeeId);
  }
  for (const channel of draft.channels) if (channel.managerId === employeeId) channel.managerId = null;
  draft.campaigns = draft.campaigns.filter((c) => c.marketerId !== employeeId);
  for (const channel of draft.channels) {
    if (channel.social?.marketerId !== employeeId) continue;
    channel.social.marketerId = null;
    addMessage(draft, 'warning', `${channel.name}’s social media account has no marketer now, and its following will fade until a free marketer with a desk takes it over.`, undefined, 'marketing');
  }
}

export const xpForNextLevel = (level: number) => XP.perLevel * level;

/**
 * Everyone who worked today earns XP: desk workers with a desk, hosts whose
 * show aired, and support staff. A level-up adds skill and raises the salary to match.
 */
export function gainExperience(draft: GameState, rng: Rng, desked: Desks, hostsOnAir: ReadonlySet<Id>): void {
  for (const e of draft.employees) {
    // Whoever is away on a course learns there: the days of the stand-in are not theirs.
    const worked = e.trainingUntil == null && (e.role === 'host' ? hostsOnAir.has(e.id) : !needsDesk(e.role) || desked.has(e.id));
    if (!worked) continue;
    e.xp += XP.perDay;
    if (e.xp < xpForNextLevel(e.level)) continue;

    e.xp -= xpForNextLevel(e.level);
    e.level += 1;
    const gain = rng.int(XP.skillGain.min, XP.skillGain.max);
    e.skill = Math.min(XP.maxSkill, e.skill + gain);
    const oldSalary = e.salary;
    e.salary = Math.max(Math.round((e.salary * (1 + XP.raisePerLevel)) / 50) * 50, salaryFor(e.role, e.skill, e.fame, draft));
    // No e-mail of its own: the monthly report tells it (settleMonth).
    draft.levelUps.count += 1;
    draft.levelUps.raise += e.salary - oldSalary;
    draft.levelUps.name = e.name;
  }
}
