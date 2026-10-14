// The living office (prompt.md sections 5.4 and 7): rooms get dirty, equipment
// wears out, the lighting or heating fails, and all of it shows in staff morale.
// Support staff are assigned automatically: every day each of them goes to the
// room or item in the worst state.

import { CLEANLINESS, COMFORT, ISSUES, MORALE, SUPPORT, WEAR } from '../config/balance';
import { FURNITURE, STAFF_PER_TABLE, isStudioType, type FurnitureType } from '../config/office';
import { SUPPORT_ROLES, findRoom, isBroken, isFurnished, missingFurniture, wearsOut, type Desks } from './office';
import type { Rng } from './rng';
import { ownsTech } from './tech';
import { addMessage, type Employee, type Furniture, type GameState, type RentedRoom, type Role } from './state';

// --- Factors in the quality and output formulas ---

/** How dirty a room is, from 0 (clean enough) to 1 (filthy). */
const dirtiness = (room: RentedRoom) => 1 - Math.min(1, room.cleanliness / CLEANLINESS.cleanEnough);

/** CleanlinessFactor: 1 in a clean room, down to CLEANLINESS.minFactor in a filthy one. */
export const cleanlinessFactor = (room: RentedRoom | undefined) => (room ? 1 - (1 - CLEANLINESS.minFactor) * dirtiness(room) : 1);

/** MoraleFactor: MORALE.minFactor at morale 0, 1 at neutral morale, MORALE.maxFactor at 100. */
export function moraleFactor(morale: number): number {
  const { neutral, minFactor, maxFactor } = MORALE;
  if (morale <= neutral) return minFactor + ((1 - minFactor) * Math.max(0, morale)) / neutral;
  return 1 + ((maxFactor - 1) * (Math.min(100, morale) - neutral)) / (100 - neutral);
}

/** How much of their normal work a desk worker gets done: their office's cleanliness × their morale. */
export function workFactor(state: GameState, employee: Employee, desked: Desks): number {
  const desk = desked.get(employee.id);
  return cleanlinessFactor(desk && findRoom(state, desk.roomId)) * moraleFactor(employee.morale);
}

// --- Canteen ---

/** Staff a canteen can serve; a dirty canteen serves fewer. Needs a coffee machine. */
export function canteenSeats(room: RentedRoom): number {
  if (room.type !== 'canteen' || !isFurnished(room)) return 0;
  return room.furniture.filter((f) => f.type === 'canteenTable').length * STAFF_PER_TABLE * (1 - dirtiness(room));
}

/** Share of the staff the canteens have a seat for (0–1). */
export function canteenCoverage(state: GameState): number {
  if (state.employees.length === 0) return 0;
  return Math.min(1, state.rooms.reduce((sum, r) => sum + canteenSeats(r), 0) / state.employees.length);
}

/** How the canteen stands: none, one that still lacks something, one too dirty to eat in, or one that serves a share of the staff. */
export type CanteenStatus =
  | { kind: 'none' }
  | { kind: 'incomplete'; roomId: string; missing: [FurnitureType, number][] }
  | { kind: 'filthy'; roomId: string }
  | { kind: 'open'; coverage: number };

export function canteenStatus(state: GameState): CanteenStatus {
  const canteens = state.rooms.filter((r) => r.type === 'canteen');
  if (canteens.some((r) => canteenSeats(r) > 0)) return { kind: 'open', coverage: canteenCoverage(state) };
  const filthy = canteens.find(isFurnished);
  if (filthy) return { kind: 'filthy', roomId: filthy.roomId };
  const [first] = canteens;
  return first ? { kind: 'incomplete', roomId: first.roomId, missing: missingFurniture(state, first) } : { kind: 'none' };
}

// --- Morale ---

/** The rooms someone works in: their office, or for hosts the studios of their shows. */
export function workplaces(state: GameState, employee: Employee, desked: Desks): RentedRoom[] {
  const ids =
    employee.role === 'host'
      ? state.shows.filter((s) => s.hostId === employee.id).map((s) => s.studioId)
      : [desked.get(employee.id)?.roomId];
  return [...new Set(ids)].map((id) => (id ? findRoom(state, id) : undefined)).filter((r): r is RentedRoom => r !== undefined);
}

/** Morale points from the comfort pieces in a room, up to the number that count. */
export const roomComfort = (room: RentedRoom) => Math.min(COMFORT.maxPieces, room.furniture.filter((f) => FURNITURE[f.type].comfort).length) * COMFORT.perPiece;

/** Morale points everyone gets from the nicest canteen, as far as the canteens have a seat for them. */
export function canteenComfort(state: GameState): number {
  const best = Math.max(0, ...state.rooms.filter((r) => canteenSeats(r) > 0).map(roomComfort));
  return best * canteenCoverage(state);
}

/** Whether a floor has toilets with everything on their checklist. */
export const hasToilets = (state: GameState, floor: number) => state.rooms.some((r) => r.type === 'toilets' && isFurnished(r) && r.floor === floor);

/** Morale points for what makes someone's own rooms nicer: comfort pieces there, and toilets on the same floor. */
export function comfort(state: GameState, employee: Employee, desked: Desks): number {
  const rooms = workplaces(state, employee, desked);
  const pieces = Math.max(0, ...rooms.map(roomComfort));
  const toilets = rooms.some((r) => hasToilets(state, r.floor)) ? COMFORT.toilets : 0;
  return pieces + toilets;
}

/** The level an employee's morale drifts toward. */
export function moraleTarget(state: GameState, employee: Employee, desked: Desks): number {
  const rooms = workplaces(state, employee, desked);
  const dirt = Math.max(0, ...rooms.map(dirtiness));
  const issue = rooms.some((r) => r.issue) ? MORALE.issuePenalty : 0;
  const nice = comfort(state, employee, desked) + canteenComfort(state);
  const target = MORALE.neutral + MORALE.canteenBonus * canteenCoverage(state) + nice - MORALE.dirtPenalty * dirt - issue;
  return Math.max(0, Math.min(100, target));
}

export const averageMorale = (state: GameState) =>
  state.employees.length > 0 ? state.employees.reduce((sum, e) => sum + e.morale, 0) / state.employees.length : MORALE.neutral;

// --- Workload ---

/** Cleanliness points a room loses per day. */
export function dirtPerDay(state: GameState, room: RentedRoom, desked: Desks): number {
  if (!room.type) return 0;
  if (room.type === 'office' || room.type === 'managementOffice') return CLEANLINESS.perWorker * [...desked.values()].filter((d) => d.roomId === room.roomId).length;
  if (room.type === 'canteen') return CLEANLINESS.perDiner * Math.min(state.employees.length, canteenSeats(room));
  if (!isStudioType(room.type)) return 0;
  const scheduled = state.channels.flatMap((c) => c.schedule).filter((id) => id !== null);
  return CLEANLINESS.perShow * scheduled.filter((id) => state.shows.find((s) => s.id === id)?.studioId === room.roomId).length;
}

/** Every item that wears out, with its room. */
function wearingItems(state: GameState): { room: RentedRoom; item: Furniture }[] {
  return state.rooms.flatMap((room) => room.furniture.filter((f) => wearsOut(f.type)).map((item) => ({ room, item })));
}

/** Daily work of one support staff member, in multiples of the listed amount. */
const workRate = (employee: Employee) => (SUPPORT.skillBase + employee.skill / 100) * moraleFactor(employee.morale);

const staffIn = (state: GameState, role: Role) => state.employees.filter((e) => e.role === role);
const capacity = (state: GameState, role: Role, perDay: number) => staffIn(state, role).reduce((sum, e) => sum + workRate(e) * perDay, 0);

export interface Workload {
  /** Work that comes up per day, on average. */
  needed: number;
  /** Work the current support staff can do per day. */
  capacity: number;
}

/** What the office needs per day against what the support staff can do (for the UI and the bots). */
export function upkeepLoad(state: GameState, desked: Desks): Record<'cleaning' | 'repairs' | 'maintenance', Workload> {
  return {
    cleaning: {
      needed: state.rooms.reduce((sum, r) => sum + dirtPerDay(state, r, desked), 0),
      capacity: capacity(state, 'cleaner', CLEANLINESS.cleanerPerDay),
    },
    repairs: { needed: wearingItems(state).length * WEAR.perDay, capacity: capacity(state, 'technician', WEAR.technicianPerDay) },
    maintenance: {
      needed: state.rooms.filter((r) => r.type).length * ISSUES.dailyChancePerRoom * ISSUES.work,
      capacity: capacity(state, 'maintenance', 1),
    },
  };
}

/** Technicians look after computers once there are any. */
export const technicianTitle = (state: GameState) => (ownsTech(state, 'personalComputer') ? 'IT technician' : 'Technician');
/** The same in the middle of a sentence: “a technician”, “an IT technician”. */
export const aTechnician = (state: GameState) => (ownsTech(state, 'personalComputer') ? 'an IT technician' : 'a technician');

// --- One day in the office ---

/**
 * Each worker in turn takes the job in the worst state and works down the list
 * until their day is used up. `work` does up to `points` of work on a job and
 * returns how much it used; a job is done when it uses less than it was given.
 */
function assign<T>(workers: Employee[], perDay: number, jobs: T[], roomOf: (job: T) => RentedRoom, work: (job: T, points: number) => number): void {
  let next = 0;
  for (const worker of workers) {
    let points = workRate(worker) * perDay;
    worker.location = next < jobs.length ? roomOf(jobs[next]!).roomId : null;
    while (next < jobs.length && points > 0) {
      const used = work(jobs[next]!, points);
      if (used < points) next += 1;
      points -= used;
    }
  }
}

function clean(draft: GameState): void {
  const dirty = draft.rooms.filter((r) => r.cleanliness < 100).sort((a, b) => a.cleanliness - b.cleanliness);
  assign(staffIn(draft, 'cleaner'), CLEANLINESS.cleanerPerDay, dirty, (room) => room, (room, points) => {
    const used = Math.min(points, 100 - room.cleanliness);
    room.cleanliness += used;
    return used;
  });
}

function repair(draft: GameState): void {
  const worn = wearingItems(draft)
    .filter(({ item }) => item.condition < 100)
    .sort((a, b) => a.item.condition - b.item.condition);
  assign(staffIn(draft, 'technician'), WEAR.technicianPerDay, worn, (job) => job.room, ({ item }, points) => {
    const used = Math.min(points, 100 - item.condition);
    item.condition += used;
    return used;
  });
}

function maintain(draft: GameState): void {
  const faulty = draft.rooms.filter((r) => r.issue);
  assign(staffIn(draft, 'maintenance'), 1, faulty, (room) => room, (room, points) => {
    if (!room.issue) return 0;
    const used = Math.min(points, room.issue.workLeft);
    room.issue.workLeft -= used;
    if (room.issue.workLeft <= 0) room.issue = null;
    return used;
  });
}

/** Now and then the lighting or heating fails in one of the rooms. */
function breakBuilding(draft: GameState, rng: Rng): void {
  const sound = draft.rooms.filter((r) => r.type && !r.issue);
  if (rng.next() >= sound.length * ISSUES.dailyChancePerRoom) return;
  const room = rng.pick(sound);
  room.issue = { kind: rng.pick(['lighting', 'heating'] as const), workLeft: ISSUES.work };
  if (staffIn(draft, 'maintenance').length > 0) return;
  addMessage(draft, 'warning', `The ${room.issue.kind} has failed in ${room.name}. Morale there suffers until maintenance staff fix it.`);
}

/**
 * Daily: rooms get dirtier and equipment wears, support staff put right what
 * they can, and everyone's morale drifts toward what their workplace deserves.
 */
export function runUpkeep(draft: GameState, rng: Rng, desked: Desks): void {
  const wasClean = new Set(draft.rooms.filter((r) => r.cleanliness >= CLEANLINESS.warnBelow));
  const worked = wearingItems(draft).filter(({ item }) => !isBroken(item));

  for (const room of draft.rooms) room.cleanliness = Math.max(0, room.cleanliness - dirtPerDay(draft, room, desked));
  for (const { item } of worked) item.condition = Math.max(0, item.condition - WEAR.perDay);
  breakBuilding(draft, rng);

  for (const e of draft.employees) if (SUPPORT_ROLES.includes(e.role)) e.location = null;
  clean(draft);
  repair(draft);
  maintain(draft);

  for (const room of draft.rooms) {
    if (wasClean.has(room) && room.cleanliness < CLEANLINESS.warnBelow) {
      const advice = staffIn(draft, 'cleaner').length > 0 ? 'your cleaners can’t keep up' : 'hire a cleaner';
      addMessage(draft, 'warning', `${room.name} is getting dirty. Work and morale there suffer: ${advice}.`);
    }
    const broken = worked.filter((w) => w.room === room && isBroken(w.item));
    if (broken.length === 0) continue;
    const what = broken.length === 1 ? 'An item has' : `${broken.length} items have`;
    const effect = room.type === 'office' ? 'Nobody can work at a broken workstation' : 'Shows made here lose quality';
    addMessage(draft, 'danger', `${what} broken down in ${room.name}. ${effect} until ${aTechnician(draft)} repairs it.`);
  }

  for (const e of draft.employees) e.morale += (moraleTarget(draft, e, desked) - e.morale) * MORALE.rate;
}
