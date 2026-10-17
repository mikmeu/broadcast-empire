// The living office (prompt.md sections 5.4 and 7): rooms get dirty, equipment
// wears out, the lighting or heating fails, and all of it shows in staff morale.
// Support staff are assigned automatically: every day each of them goes to the
// room or item in the worst state.

import { CLEANLINESS, COMFORT, COOKS, DECOR, ISSUES, MORALE, POST, SUPPORT, WEAR } from '../config/balance';
import { FURNITURE, STAFF_PER_TABLE, isStudioType, type FurnitureType } from '../config/office';
import { SUPPORT_ROLES, findRoom, isBroken, isFurnished, missingFurniture, wearsOut, type Desks } from './office';
import type { Rng } from './rng';
import { ownsTech } from './tech';
import { addMessage, type Employee, type Furniture, type GameState, type RentedRoom, type Role } from './state';
import { meetingFactor, meetingLift, onStrike } from './teams';
import { crewPosts, crewing } from './control';

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

/** How much of their normal work a desk worker gets done: their office's cleanliness × their morale, and less on the day of their team's meeting. */
export function workFactor(state: GameState, employee: Employee, desked: Desks): number {
  const desk = desked.get(employee.id);
  return cleanlinessFactor(desk && findRoom(state, desk.roomId)) * moraleFactor(employee.morale) * meetingFactor(state, employee);
}

// --- Canteen ---

/** Staff a canteen can serve; a dirty canteen serves fewer. Needs a coffee machine. */
export function canteenSeats(room: RentedRoom): number {
  if (room.type !== 'canteen' || !isFurnished(room)) return 0;
  return room.furniture.filter((f) => f.type === 'canteenTable').length * STAFF_PER_TABLE * (1 - dirtiness(room));
}

/** Share of the staff the canteens serve (0–1). */
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

// --- Hot meals and the post (0.15.0) ---

/** What one cook or clerk at their place gets done in a day, against one of skill 50 in a clean room in good spirits. */
const helperRate = (state: GameState, employee: Employee, desked: Desks) => (SUPPORT.skillBase + employee.skill / 100) * workFactor(state, employee, desked);

/** Hot meals the cooks at a stove make in a day. */
export function hotMeals(state: GameState, desked: Desks): number {
  return state.employees.filter((e) => e.role === 'cook' && desked.has(e.id)).reduce((sum, e) => sum + COOKS.mealsEach * helperRate(state, e, desked), 0);
}

/** Share of the staff who get a hot meal (0–1): no more than the canteens serve at all. */
export function hotMealCoverage(state: GameState, desked: Desks): number {
  if (state.employees.length === 0) return 0;
  return Math.min(canteenCoverage(state), hotMeals(state, desked) / state.employees.length);
}

/** Staff whose post the clerks at a sorting case sort in a day. */
export function postSorted(state: GameState, desked: Desks): number {
  return state.employees.filter((e) => e.role === 'clerk' && desked.has(e.id)).reduce((sum, e) => sum + POST.staffEach * helperRate(state, e, desked), 0);
}

/** Share of the staff whose post is sorted (0–1). */
export function postCoverage(state: GameState, desked: Desks): number {
  return state.employees.length === 0 ? 0 : Math.min(1, postSorted(state, desked) / state.employees.length);
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

/** What a piece adds to the comfort of its room, in pieces: 1 for most, more for an aquarium (0.16.0), 0 for one that is no comfort. */
export const comfortOf = (type: FurnitureType) => {
  const comfort = FURNITURE[type].comfort;
  return comfort === true ? 1 : comfort || 0;
};

/** Morale points from the comfort pieces in a room: the best of them, up to the number that count. */
export function roomComfort(room: RentedRoom): number {
  const pieces = room.furniture.map((f) => comfortOf(f.type)).filter((c) => c > 0).sort((a, b) => b - a);
  return pieces.slice(0, COMFORT.maxPieces).reduce((sum, c) => sum + c, 0) * COMFORT.perPiece;
}

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

/**
 * What the company does for everyone's morale, the same for all (0.15.0): the
 * canteen, hot meals from its cooks and the letters of the post room. The
 * comfort of the canteen and someone's own rooms, and their team's meeting,
 * come on top of it (see `moraleTarget`).
 */
export function sharedMorale(state: GameState, desked: Desks): { canteen: number; meals: number; post: number } {
  return { canteen: MORALE.canteenBonus * canteenCoverage(state), meals: COOKS.morale * hotMealCoverage(state, desked), post: POST.morale * postCoverage(state, desked) };
}

/** The level an employee's morale drifts toward. `shared` is `sharedMorale`, worked out once for everyone. */
export function moraleTarget(state: GameState, employee: Employee, desked: Desks, shared = sharedMorale(state, desked)): number {
  const rooms = workplaces(state, employee, desked);
  const dirt = Math.max(0, ...rooms.map(dirtiness));
  const issue = rooms.some((r) => r.issue) ? MORALE.issuePenalty : 0;
  const nice = comfort(state, employee, desked) + canteenComfort(state);
  const target = MORALE.neutral + shared.canteen + shared.meals + shared.post + meetingLift(state, employee) + nice - MORALE.dirtPenalty * dirt - issue;
  return Math.max(0, Math.min(100, target));
}

export const averageMorale = (state: GameState) =>
  state.employees.length > 0 ? state.employees.reduce((sum, e) => sum + e.morale, 0) / state.employees.length : MORALE.neutral;

// --- Workload ---

/** What a bin, and in a canteen a dishwasher, leave of the dirt a room gets (0.16.0): 1 without either. */
export function dirtFactor(room: RentedRoom): number {
  const has = (type: FurnitureType) => room.furniture.some((f) => f.type === type);
  return (has('bin') ? 1 - DECOR.bin : 1) * (room.type === 'canteen' && has('dishwasher') ? 1 - DECOR.dishwasher : 1);
}

/** Cleanliness points a room loses per day. */
export function dirtPerDay(state: GameState, room: RentedRoom, desked: Desks): number {
  return rawDirt(state, room, desked) * dirtFactor(room);
}

function rawDirt(state: GameState, room: RentedRoom, desked: Desks): number {
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

/** The support staff of a kind at work today: those on strike are not (0.15.0). */
const staffIn = (state: GameState, role: Role) => state.employees.filter((e) => e.role === role && !onStrike(state, e));
const capacity = (state: GameState, role: Role, perDay: number) => staffIn(state, role).reduce((sum, e) => sum + workRate(e) * perDay, 0);

/** The share of their day the technicians have left for repairs, after the desks they work (0.16.0). */
const repairShare = (state: GameState) => 1 - crewing(state).used;

export interface Workload {
  /** Work that comes up per day, on average. */
  needed: number;
  /** Work the current support staff can do per day. */
  capacity: number;
}

/** What the office needs per day against what the support staff can do (for the UI and the bots). */
export function upkeepLoad(state: GameState, desked: Desks): Record<'cleaning' | 'repairs' | 'maintenance' | 'crew', Workload> {
  return {
    cleaning: {
      needed: state.rooms.reduce((sum, r) => sum + dirtPerDay(state, r, desked), 0),
      capacity: capacity(state, 'cleaner', CLEANLINESS.cleanerPerDay),
    },
    repairs: { needed: wearingItems(state).length * WEAR.perDay, capacity: capacity(state, 'technician', WEAR.technicianPerDay) * repairShare(state) },
    // The desks technicians work (0.16.0), in technicians: half of one for each control room in use and for the master control room.
    crew: { needed: crewPosts(state).length / 2, capacity: staffIn(state, 'technician').length },
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
  const crew = crewing(draft);
  assign(staffIn(draft, 'technician'), WEAR.technicianPerDay * (1 - crew.used), worn, (job) => job.room, ({ item }, points) => {
    const used = Math.min(points, 100 - item.condition);
    item.condition += used;
    return used;
  });
  // A technician who works a desk is in its room (0.16.0).
  const posts = new Map(crewPosts(draft).map((post) => [post.key, post.roomId]));
  for (const [key, id] of crew.posts) {
    const technician = draft.employees.find((e) => e.id === id);
    if (technician) technician.location = posts.get(key) ?? technician.location;
  }
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

  const shared = sharedMorale(draft, desked);
  for (const e of draft.employees) e.morale += (moraleTarget(draft, e, desked, shared) - e.morale) * MORALE.rate;
}
