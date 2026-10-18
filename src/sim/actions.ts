// Player commands. Each takes the current state and returns a new state or an
// error message for the player; the input state is never mutated.

import { cleanLook, isLook, type Look } from '../config/looks';
import {
  ACTIVE_REGIONS,
  LOAN,
  MARKETING,
  MORALE,
  OWN_EVENTS,
  OWN_EVENT_LIMITS,
  type OwnEventKind,
  MAX_PLAYER_CHANNELS,
  MAX_SHOWS_PER_HOST,
  MAX_SHOWS_PER_PERSON,
  REVAMP_COST,
  SEVERANCE_MONTHS,
  TALENT,
  TRAINING,
  WRITERS,
  EDITORS,
} from '../config/balance';
import { getGenre, hasHost, type GenreId } from '../config/genres';
import { FURNITURE, RENTABLE_ROOM_TYPES, ROOM_TYPE_NAMES, type FurnitureType, type RoomType, inText } from '../config/office';
import { SLOTS, getRegion, type Medium, type RegionId } from '../config/world';
import { channelRegions, isEdited, showLoad } from './broadcast';
import { toCalendarDate } from './calendar';
import { isLicensed, libraryCapacity } from './content';
import { costFactor } from './difficulty';
import { loanPayment, maxLoan, spend, weeklyCost } from './economy';
import { barPlayer } from './auctions';
import { formatDate } from './calendar';
import { barredUntil, freeLicenses, licensePrice, licenseTermDays, MEDIUM_NAMES, startReputation } from './licenses';
import { cleanName } from './newGame';
import { eventHost, ownEventBlocker, ownEventCost, ownEventPrestige } from './ownEvents';
import { deskFor, deskRoomFor, employeesWithDesk, findRoom, isWorkplace, needsDesk, ownDesk, ownerOf, placementError, workplacesIn } from './office';
import { checkMilestones } from './milestones';
import { buildCost, hasOwnKindOfName, kindError, reshapeCost, roomError, roomNameFor, type RoomPlan } from './rooms';
import { settleContract } from './sales';
import { furniturePrice, genreAvailable, outdatedItems, purchaseTier, resaleValue, researchBlocker, researchCost, saleBlocker, techMultiplier } from './tech';
import { featureOfRole, isUnlocked, lockedReason, regionOpen } from './unlocks';
import { getTech, type TechId } from '../config/tech';
import { hostGivesNotice, poachCooldown, poachTargets, replaceRivalHost } from './poaching';
import { Rng } from './rng';
import { DEPARTMENT_NAMES, removeEmployee, talentBlocker, talentCost, trainingBlocker, trainingCost } from './staff';
import { PLAYER, addHeadline, addMessage, newId, type CampaignAudience, type GameState, type Id, type Logo, type RentedRoom, type Role, type Show, type TeamId, type TitleOffer } from './state';
import { channelMeetingBlocker, holdChannelMeeting, holdMeeting, meetingBlocker, payStrikeBonus } from './morale';
import { TEAMS } from './teams';

export type ActionResult = { ok: true; state: GameState; id?: Id } | { ok: false; error: string };

/** Runs `fn` on a copy of the state. `fn` returns an error string to abort, or an id it created. */
function act(state: GameState, fn: (draft: GameState) => { error: string } | Id | void): ActionResult {
  if (state.bankrupt) return { ok: false, error: 'The company is bankrupt.' };
  const draft = structuredClone(state);
  const out = fn(draft);
  if (typeof out === 'object') return { ok: false, error: out.error };
  return { ok: true, state: draft, id: out ?? undefined };
}

const fail = (error: string) => ({ error });
const formatEuro = (n: number) => `€${n.toLocaleString('en-IE')}`;

function pay(draft: GameState, amount: number, category: 'purchases' | 'revamps'): { error: string } | void {
  if (draft.money < amount) return fail(`Not enough money (${formatEuro(amount)} needed).`);
  spend(draft, amount, category);
}

// --- The company ---

/** Changes the name of the player and of the company. The headquarters stay where they are. */
export function renameCompany(state: GameState, playerName: string, companyName: string): ActionResult {
  return act(state, (draft) => {
    if (!cleanName(playerName)) return fail('Fill in your name.');
    if (!cleanName(companyName)) return fail('Give your company a name.');
    draft.playerName = cleanName(playerName);
    draft.companyName = cleanName(companyName);
  });
}

/** Changes what the player looks like: the CEO in the office. */
export function setLook(state: GameState, look: Look): ActionResult {
  return act(state, (draft) => {
    if (!isLook(look)) return fail('Choose a character.');
    draft.look = cleanLook(look);
  });
}

// --- Office ---

/**
 * A room of the draft to change. A room that comes with the building gets its
 * entry in the state the first time it is needed.
 */
function ownRoom(draft: GameState, roomId: string): RentedRoom | undefined {
  const stored = draft.rooms.find((r) => r.roomId === roomId);
  const room = stored ?? findRoom(draft, roomId);
  if (room && !stored) draft.rooms.push(room);
  return room;
}

/**
 * Builds a room: a rectangle of floor with a door, for one kind of use. It
 * costs a sum once, by its size, and rent from then on. The id of the new
 * room comes back with the result.
 */
export function buildRoom(state: GameState, plan: RoomPlan & { type: RoomType }): ActionResult {
  return act(state, (draft) => {
    if (!RENTABLE_ROOM_TYPES.includes(plan.type)) return fail('The reception is at the entrance; there is only the one.');
    if (!plan.door) return fail('Give the room a door.');
    const error = kindError(draft, plan.type) ?? roomError(draft, plan);
    if (error) return fail(error);
    const paid = pay(draft, buildCost(plan), 'purchases');
    if (paid) return paid;
    const { floor, x, y, w, h, door, type } = plan;
    const roomId = newId(draft, 'r');
    draft.rooms.push({ roomId, name: roomNameFor(draft, type), floor, x, y, w, h, door: { ...door }, type, furniture: [], cleanliness: 100, issue: null });
    return roomId;
  });
}

/**
 * Gives a room another shape, another door, or both. Its furniture stays
 * where it stands on the floor, so it has to fit inside the new walls. Floor
 * that the room gains is paid for like a new room; floor it loses brings
 * nothing back.
 */
export function reshapeRoom(state: GameState, roomId: string, shape: Omit<RoomPlan, 'floor'>): ActionResult {
  return act(state, (draft) => {
    const room = draft.rooms.find((r) => r.roomId === roomId);
    if (!room) return fail('You don’t have this room.');
    if (room.fixed) return fail('This room comes with the building.');
    if (!shape.door) return fail('Give the room a door.');
    const plan = { floor: room.floor, x: shape.x, y: shape.y, w: shape.w, h: shape.h, door: shape.door };
    const error = roomError(draft, plan, roomId);
    if (error) return fail(error);
    const paid = pay(draft, reshapeCost(room, plan), 'purchases');
    if (paid) return paid;
    for (const item of room.furniture) Object.assign(item, { x: item.x + room.x - plan.x, y: item.y + room.y - plan.y });
    Object.assign(room, { x: plan.x, y: plan.y, w: plan.w, h: plan.h, door: { ...plan.door } });
  });
}

/** Takes a room away: its walls go, and its floor is corridor again. Nothing of what it cost to build comes back. */
export function releaseRoom(state: GameState, roomId: string): ActionResult {
  return act(state, (draft) => {
    const room = findRoom(draft, roomId);
    if (!room) return fail('You don’t have this room.');
    if (room.fixed) return fail('This room comes with the building.');
    if (room.furniture.length > 0) return fail('Sell the furniture in this room first.');
    draft.rooms = draft.rooms.filter((r) => r !== room);
    for (const show of draft.shows) if (show.studioId === roomId) show.studioId = null;
  });
}

export function setRoomType(state: GameState, roomId: string, type: RoomType): ActionResult {
  return act(state, (draft) => {
    const room = findRoom(draft, roomId);
    if (!room) return fail('You don’t have this room.');
    if (room.fixed || !RENTABLE_ROOM_TYPES.includes(type)) return fail('The reception is at the entrance; it can’t be moved.');
    if (room.furniture.length > 0) return fail('Sell the furniture before changing the room type.');
    const taken = kindError(draft, type, roomId);
    if (taken) return fail(taken);
    // A room that is called after its kind is called after its new one.
    if (hasOwnKindOfName(room)) room.name = roomNameFor(draft, type, roomId);
    room.type = type;
    for (const show of draft.shows) if (show.studioId === roomId && getGenre(show.genre).studio !== type) show.studioId = null;
  });
}

/** Gives a room a name of the player's own. No two rooms go by the same name. */
export function renameRoom(state: GameState, roomId: string, name: string): ActionResult {
  return act(state, (draft) => {
    const room = findRoom(draft, roomId);
    if (!room) return fail('You don’t have this room.');
    if (room.fixed) return fail('The reception keeps its name.');
    const clean = cleanName(name);
    if (!clean) return fail('Give the room a name.');
    const other = draft.rooms.find((r) => r.roomId !== roomId && r.name.toLowerCase() === clean.toLowerCase());
    if (other) return fail(`Another room is called ${other.name} already.`);
    room.name = clean;
  });
}

/** `turn` is in quarter turns, counter-clockwise seen from above. */
export function placeFurniture(state: GameState, roomId: string, type: FurnitureType, x: number, y: number, turn = 0): ActionResult {
  return act(state, (draft) => {
    const room = ownRoom(draft, roomId);
    if (!room) return fail('You don’t have this room.');
    const blocked = saleBlocker(draft, type);
    if (blocked) return fail(blocked);
    const error = placementError(draft, room, type, x, y, turn);
    if (error) return fail(error);
    const tier = purchaseTier(draft, type);
    const paid = pay(draft, furniturePrice(type, tier), 'purchases');
    if (paid) return paid;
    room.furniture.push({ id: newId(draft, 'f'), type, x, y, turn: ((turn % 4) + 4) % 4, tier, condition: 100, boughtOn: draft.day });
  });
}

/** Turns a piece of furniture a quarter turn where it stands. Free, but it has to fit. */
export function rotateFurniture(state: GameState, roomId: string, furnitureId: Id): ActionResult {
  return act(state, (draft) => {
    const room = findRoom(draft, roomId);
    const item = room?.furniture.find((f) => f.id === furnitureId);
    if (!room || !item) return fail('That furniture isn’t here.');
    const turn = (item.turn + 1) % 4;
    const error = placementError(draft, room, item.type, item.x, item.y, turn, item.id);
    if (error) return fail('There’s no room to turn it here. Move it to a place where it fits turned.');
    item.turn = turn;
  });
}

/**
 * Moves a piece of furniture to another place: in its own room, or in another
 * room that takes it. It costs nothing and it stays the piece it was, as old
 * and as worn as before.
 */
export function moveFurniture(state: GameState, roomId: string, furnitureId: Id, to: { roomId: string; x: number; y: number; turn?: number }): ActionResult {
  return act(state, (draft) => {
    const from = findRoom(draft, roomId);
    const item = from?.furniture.find((f) => f.id === furnitureId);
    if (!from || !item) return fail('That furniture isn’t here.');
    const target = to.roomId === roomId ? from : ownRoom(draft, to.roomId);
    if (!target) return fail('You don’t have this room.');
    const turn = (((to.turn ?? item.turn) % 4) + 4) % 4;
    const error = placementError(draft, target, item.type, to.x, to.y, turn, item.id);
    if (error) return fail(error);
    if (target !== from) {
      from.furniture = from.furniture.filter((f) => f !== item);
      target.furniture.push(item);
    }
    Object.assign(item, { x: to.x, y: to.y, turn });
  });
}

export function sellFurniture(state: GameState, roomId: string, furnitureId: Id): ActionResult {
  return act(state, (draft) => {
    const room = findRoom(draft, roomId);
    const item = room?.furniture.find((f) => f.id === furnitureId);
    if (!room || !item) return fail('That furniture doesn’t exist.');
    room.furniture = room.furniture.filter((f) => f !== item);
    // Whoever had it as their own place takes what is free again.
    for (const employee of draft.employees) if (employee.desk === item.id) employee.desk = null;
    const refund = resaleValue(item, draft.day);
    draft.money += refund;
    draft.ledger.purchases -= refund;
  });
}

/** Replaces outdated equipment in a room with new items of the newest researched tier; the old items are sold at resale value. */
export function upgradeEquipment(state: GameState, roomId: string): ActionResult {
  return act(state, (draft) => {
    const room = findRoom(draft, roomId);
    if (!room) return fail('You don’t have this room.');
    const items = outdatedItems(draft, room);
    if (items.length === 0) return fail('Everything in this room is up to date.');
    const cost = upgradeCost(draft, roomId);
    const paid = pay(draft, cost, 'purchases');
    if (paid) return paid;
    for (const item of items) Object.assign(item, { tier: purchaseTier(draft, item.type), condition: 100, boughtOn: draft.day });
  });
}

/** What upgrading a room costs: new equipment minus what the old equipment sells for. */
export function upgradeCost(state: GameState, roomId: string): number {
  const room = findRoom(state, roomId);
  if (!room) return 0;
  return outdatedItems(state, room).reduce(
    (sum, f) => sum + furniturePrice(f.type, purchaseTier(state, f.type)) - resaleValue(f, state.day),
    0,
  );
}

// --- Research ---

export function research(state: GameState, techId: TechId): ActionResult {
  return act(state, (draft) => {
    if (!isUnlocked(draft, 'research')) return fail(lockedReason('research'));
    const tech = getTech(techId);
    const blocker = researchBlocker(draft, tech);
    if (blocker) return fail(blocker === 'Not enough research points' ? `${tech.name} needs ${researchCost(tech, toCalendarDate(draft.day).year)} research points.` : `${tech.name}: ${blocker.toLowerCase()}.`);
    draft.researchPoints -= researchCost(tech, toCalendarDate(draft.day).year);
    draft.techs.push(techId);
    addMessage(draft, 'good', `Research complete: ${tech.name}. ${tech.description}`);
  });
}

// --- Staff ---

export function hire(state: GameState, candidateId: Id): ActionResult {
  return act(state, (draft) => {
    const candidate = draft.candidates.find((c) => c.id === candidateId);
    if (!candidate) return fail('That candidate is no longer available.');
    const locked = featureOfRole(candidate.role, candidate.department);
    if (locked && !isUnlocked(draft, locked)) return fail(lockedReason(locked));
    const department = candidate.department;
    if (department && draft.employees.some((e) => e.role === 'manager' && e.department === department)) {
      return fail(`You already have a ${DEPARTMENT_NAMES[department].toLowerCase()} manager.`);
    }
    draft.candidates = draft.candidates.filter((c) => c !== candidate);
    draft.employees.push({ ...candidate, hiredOn: draft.day, xp: 0, level: 1, morale: MORALE.neutral, location: null, desk: null, trainingUntil: null, leaving: null, talentUntil: null });
    return candidate.id;
  });
}

/** Sends someone on a course: they come back better, and a stand-in does their work until then (see TRAINING). */
export function sendOnTraining(state: GameState, employeeId: Id): ActionResult {
  return act(state, (draft) => {
    const employee = draft.employees.find((e) => e.id === employeeId);
    if (!employee) return fail('That person doesn’t work here.');
    const blocked = trainingBlocker(draft, employee);
    if (blocked) return fail(blocked);
    const cost = trainingCost(employee);
    if (draft.money < cost) return fail(`Not enough money (${formatEuro(cost)} needed).`);
    spend(draft, cost, 'training');
    employee.trainingUntil = draft.day + TRAINING.days;
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

export function fire(state: GameState, employeeId: Id): ActionResult {
  return act(state, (draft) => {
    const employee = draft.employees.find((e) => e.id === employeeId);
    if (!employee) return fail('That person doesn’t work here.');
    spend(draft, employee.salary * SEVERANCE_MONTHS, 'severance');
    removeEmployee(draft, employeeId);
  });
}

// --- Meetings and strikes (0.15.0) ---

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
    draft.meetings[team] = { on: draft.meetings[team]?.on ?? null, lift: draft.meetings[team]?.lift ?? 0, monthly };
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
    draft.channelMeetings[channelId] = { on: meeting?.on ?? null, lift: meeting?.lift ?? 0, monthly };
  });
}

/** Ends a strike at once by paying everyone on it a bonus (see STRIKES.bonusMonths). */
export function endStrike(state: GameState, team: TeamId): ActionResult {
  return act(state, (draft) => {
    const error = payStrikeBonus(draft, team);
    if (error) return fail(error);
  });
}

// --- Who sits where ---

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
    if (item.type !== deskFor(employee.role)) {
      const room = inText(ROOM_TYPE_NAMES[deskRoomFor(employee.role)]);
      return fail(`${employee.name} works at a ${inText(FURNITURE[deskFor(employee.role)].name)}, in ${/^[aeiou]/.test(room) ? 'an' : 'a'} ${room}.`);
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
    const places = workplacesIn(room).filter((item) => item.type === deskFor(role) && !ownerOf(draft, item.id));
    if (places.length === 0) return fail(workplacesIn(room).some((item) => item.type === deskFor(role)) ? 'Every workplace in this room is somebody’s own already.' : 'There is no workplace for them in this room.');
    const people = draft.employees.filter((e) => e.role === role && !ownDesk(draft, e)).sort((a, b) => a.hiredOn - b.hiredOn);
    if (people.length === 0) return fail('Everyone in that job has a place of their own already.');
    // The newest desks first, as when nobody chooses.
    places.sort((a, b) => b.tier - a.tier);
    people.slice(0, places.length).forEach((employee, n) => (employee.desk = places[n]!.id));
  });
}

// --- Host poaching ---

/** Keeps a host a rival wants by paying them what the rival offered. */
export function matchPoachOffer(state: GameState, offerId: Id): ActionResult {
  return act(state, (draft) => {
    const offer = draft.poachOffers.find((o) => o.id === offerId);
    const host = offer && draft.employees.find((e) => e.id === offer.hostId);
    if (!offer || !host) return fail('That offer is no longer open.');
    host.salary = Math.max(host.salary, offer.salary);
    draft.poachOffers = draft.poachOffers.filter((o) => o !== offer);
    addMessage(draft, 'good', `${host.name} stays, now on ${formatEuro(host.salary)} a month.`);
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
      hiredOn: draft.day,
      xp: 0,
      level: 1,
      morale: MORALE.neutral,
      location: null,
      desk: null,
      trainingUntil: null,
      leaving: null,
      talentUntil: null,
    });
    draft.lastPoachDay = draft.day;
    addHeadline(draft, `${show.hostName} leaves ${rival.name} to join your channels.`);
    const rng = new Rng(draft.rngState);
    replaceRivalHost(show, rng);
    draft.rngState = rng.state;
    return id;
  });
}

// --- Event rights ---

/** Places (or replaces) the player's sealed bid for an event's TV rights. The money is only paid if the bid wins. */
export function placeRightsBid(state: GameState, auctionId: Id, amount: number): ActionResult {
  return act(state, (draft) => {
    if (!isUnlocked(draft, 'content')) return fail(lockedReason('content'));
    const auction = draft.rightsAuctions.find((a) => a.id === auctionId);
    if (!auction) return fail('That auction has closed.');
    if (!Number.isFinite(amount) || amount < auction.reserve) return fail(`Bid at least the reserve of ${formatEuro(auction.reserve)}.`);
    if (amount > draft.money) return fail(`You can’t bid more than you have (${formatEuro(Math.floor(draft.money))}).`);
    auction.bid = Math.round(amount);
  });
}

export function withdrawRightsBid(state: GameState, auctionId: Id): ActionResult {
  return act(state, (draft) => {
    const auction = draft.rightsAuctions.find((a) => a.id === auctionId);
    if (auction?.bid == null) return fail('You haven’t bid in that auction.');
    auction.bid = null;
  });
}

// --- Licenses & channels ---

/** The regions the company has a license in, by name, for a message. */
function regionsHeld(state: GameState): string {
  const names = [...new Set(state.licenses.map((l) => getRegion(l.regionId).name))];
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Buys a license in a region for a channel (in the channel's medium), so the channel broadcasts there. */
export function buyLicense(state: GameState, channelId: Id, regionId: RegionId): ActionResult {
  return act(state, (draft) => {
    const channel = draft.channels.find((c) => c.id === channelId);
    if (!channel) return fail('That channel doesn’t exist.');
    const region = getRegion(regionId);
    if (!ACTIVE_REGIONS.includes(regionId)) return fail(`${region.name} isn’t open yet.`);
    if (!regionOpen(draft, regionId)) return fail(`You can’t buy a license outside ${regionsHeld(draft)} yet. ${lockedReason('regions')}`);
    if (draft.licenses.some((l) => l.channelId === channelId && l.regionId === regionId)) {
      return fail(`${channel.name} already broadcasts in ${region.name}.`);
    }
    const barred = barredUntil(draft, channel.medium, regionId);
    if (barred !== undefined) {
      return fail(`You gave up or lost a ${MEDIUM_NAMES[channel.medium]} license in ${region.name}; the authority won’t sell you another there until ${formatDate(barred)}.`);
    }
    if (freeLicenses(draft, channel.medium, regionId) === 0) {
      const auctioned = draft.auctions.some((a) => !a.holder && a.medium === channel.medium && a.regionId === regionId);
      return fail(
        auctioned
          ? `The new ${MEDIUM_NAMES[channel.medium]} license in ${region.name} is being auctioned: place a bid instead.`
          : `All ${MEDIUM_NAMES[channel.medium]} licenses in ${region.name} are taken.`,
      );
    }
    const price = licensePrice(channel.medium, regionId, draft);
    const paid = pay(draft, price, 'purchases');
    if (paid) return paid;
    draft.licenses.push({ id: newId(draft, 'l'), regionId, medium: channel.medium, channelId, price, expiresOn: draft.day + licenseTermDays() });
    channel.reputation[regionId] ??= startReputation(draft, regionId);
    // A first TV license opens the content market: at once, so the channel's library can be stocked the same day.
    if (channel.medium === 'tv') checkMilestones(draft);
  });
}

/** Gives a license back: no refund, no more monthly fees, and no new license there for a few years. */
export function dropLicense(state: GameState, licenseId: Id): ActionResult {
  return act(state, (draft) => {
    const license = draft.licenses.find((l) => l.id === licenseId);
    if (!license) return fail('That license doesn’t exist.');
    draft.licenses = draft.licenses.filter((l) => l !== license);
    draft.auctions = draft.auctions.filter((a) => !(a.holder?.channelId === license.channelId && a.regionId === license.regionId));
    barPlayer(draft, license.medium, license.regionId);
  });
}

export interface ChannelInput {
  name: string;
  logo: Logo;
}

export function createChannel(state: GameState, input: ChannelInput & { medium?: Medium }): ActionResult {
  return act(state, (draft) => {
    if (draft.channels.length >= MAX_PLAYER_CHANNELS) return fail(`You can run up to ${MAX_PLAYER_CHANNELS} channels.`);
    const name = input.name.trim();
    if (!name) return fail('Give your channel a name.');
    const id = newId(draft, 'c');
    draft.channels.push({
      id,
      name,
      logo: { ...input.logo, initials: input.logo.initials.trim().slice(0, 3).toUpperCase() },
      medium: input.medium ?? 'radio',
      managerId: null,
      schedule: SLOTS.map(() => null),
      reputation: {},
      lastEventDay: null,
    });
    return id;
  });
}

/** Closes a channel: its licenses are given back and its campaigns stop. Its shows stay. */
export function closeChannel(state: GameState, channelId: Id): ActionResult {
  return act(state, (draft) => {
    if (!draft.channels.some((c) => c.id === channelId)) return fail('That channel doesn’t exist.');
    draft.channels = draft.channels.filter((c) => c.id !== channelId);
    draft.licenses = draft.licenses.filter((l) => l.channelId !== channelId);
    draft.campaigns = draft.campaigns.filter((c) => c.targetId !== channelId);
    delete draft.promotion[channelId];
    draft.auctions = draft.auctions.filter((a) => a.holder?.channelId !== channelId);
    for (const auction of draft.auctions) if (auction.bid?.channelId === channelId) auction.bid = null;
  });
}

export function updateChannel(state: GameState, channelId: Id, patch: Partial<ChannelInput>): ActionResult {
  return act(state, (draft) => {
    const channel = draft.channels.find((c) => c.id === channelId);
    if (!channel) return fail('That channel doesn’t exist.');
    if (patch.name !== undefined) {
      if (!patch.name.trim()) return fail('Give your channel a name.');
      channel.name = patch.name.trim();
    }
    if (patch.logo) channel.logo = { ...patch.logo, initials: patch.logo.initials.trim().slice(0, 3).toUpperCase() };
  });
}

export function setChannelManager(state: GameState, channelId: Id, employeeId: Id | null): ActionResult {
  return act(state, (draft) => {
    const channel = draft.channels.find((c) => c.id === channelId);
    if (!channel) return fail('That channel doesn’t exist.');
    if (employeeId !== null) {
      const employee = draft.employees.find((e) => e.id === employeeId);
      if (employee?.role !== 'channelManager') return fail('Only a channel manager can run a channel.');
      if (draft.channels.some((c) => c.id !== channelId && c.managerId === employeeId)) {
        return fail(`${employee.name} already runs another channel.`);
      }
    }
    channel.managerId = employeeId;
  });
}

// --- Shows ---

export interface ShowInput {
  name: string;
  genre: GenreId;
  hostId: Id | null;
  staffIds: Id[];
  /** The writers, for a genre that is written (see `writers` in config/genres.ts); none if left out. */
  writerIds?: Id[];
  /** The video editor, for a produced TV show; none if left out. */
  editorIds?: Id[];
  studioId: string | null;
}

/**
 * Licensed programs air library titles: they have no host, staff, writers,
 * editor or studio. A show its writers lead has no host, a genre nobody writes
 * no writers, and only a produced TV show an editor.
 */
function normalize(input: ShowInput): Required<ShowInput> {
  if (isLicensed(input.genre)) return { ...input, hostId: null, staffIds: [], writerIds: [], editorIds: [], studioId: null };
  const genre = getGenre(input.genre);
  return { ...input, hostId: hasHost(genre) ? input.hostId : null, writerIds: genre.writers ? (input.writerIds ?? []) : [], editorIds: isEdited(genre) ? (input.editorIds ?? []) : [] };
}

/** Checks a show's host, staff and studio. `showId` is the show being edited, if any. */
function staffingError(draft: GameState, input: ShowInput, showId: Id | null): string | null {
  const genre = getGenre(input.genre);
  const year = toCalendarDate(draft.day).year;
  if (!genreAvailable(draft, genre.id)) {
    return genre.unlockYear > year ? `${genre.name} shows don’t exist until ${genre.unlockYear}.` : `Research the ${genre.name.toLowerCase()} format first.`;
  }
  if (genre.kind === 'licensed') return null;
  const load = (personId: Id) => showLoad(draft, personId) - (showId && isOnShow(draft, showId, personId) ? 1 : 0);

  if (input.hostId) {
    const host = draft.employees.find((e) => e.id === input.hostId);
    if (host?.role !== 'host') return 'Pick a host for the show.';
    // A host who presents more than one show since before the rule keeps them; only a new pairing is checked.
    const keeps = showId !== undefined && draft.shows.some((s) => s.id === showId && s.hostId === host.id);
    if (!keeps && load(host.id) >= MAX_SHOWS_PER_HOST) return `${host.name} already presents a show: a host is on the air once a day.`;
    if (host.talentUntil != null) return `${host.name} is in the talent programme until ${formatDate(host.talentUntil)}.`;
  }
  if (new Set(input.staffIds).size !== input.staffIds.length) return 'The same person is listed twice.';
  for (const staffId of input.staffIds) {
    const staff = draft.employees.find((e) => e.id === staffId);
    if (staff?.role !== 'production') return 'Only production staff can produce a show.';
    if (load(staff.id) >= MAX_SHOWS_PER_PERSON) return `${staff.name} already works on ${MAX_SHOWS_PER_PERSON} shows.`;
  }
  const writerIds = input.writerIds ?? [];
  if (new Set(writerIds).size !== writerIds.length) return 'The same writer is listed twice.';
  for (const writerId of writerIds) {
    const writer = draft.employees.find((e) => e.id === writerId);
    if (writer?.role !== 'writer') return 'Only writers can write a show.';
    if (load(writer.id) >= WRITERS.showsEach) return `${writer.name} already writes ${WRITERS.showsEach} shows.`;
  }
  const editorIds = input.editorIds ?? [];
  if (editorIds.length > 1) return 'A show has one editor.';
  for (const editorId of editorIds) {
    const editor = draft.employees.find((e) => e.id === editorId);
    if (editor?.role !== 'editor') return 'Only a video editor can edit a show.';
    if (load(editor.id) >= EDITORS.showsEach) return `${editor.name} already edits ${EDITORS.showsEach} shows.`;
  }
  if (input.studioId) {
    const room = findRoom(draft, input.studioId);
    if (!room) return 'You don’t have that room.';
    if (room.type !== genre.studio) return `${genre.name} needs a ${inText(ROOM_TYPE_NAMES[genre.studio])}.`;
  }
  return null;
}

function isOnShow(draft: GameState, showId: Id, personId: Id): boolean {
  const show = draft.shows.find((s) => s.id === showId);
  return show !== undefined && (show.hostId === personId || show.staffIds.includes(personId) || show.writerIds.includes(personId) || show.editorIds.includes(personId));
}

/** A studio or host can't be in two places at once: checks every slot this show is scheduled in. */
function slotConflict(draft: GameState, show: Show): string | null {
  for (const channel of draft.channels) {
    for (let slot = 0; slot < channel.schedule.length; slot++) {
      if (channel.schedule[slot] !== show.id) continue;
      for (const other of draft.channels) {
        if (other === channel) continue;
        const otherShow = draft.shows.find((s) => s.id === other.schedule[slot]);
        if (!otherShow) continue;
        if (show.studioId && otherShow.studioId === show.studioId) {
          return `The studio is already in use by “${otherShow.name}” in that slot.`;
        }
        if (show.hostId && otherShow.hostId === show.hostId) {
          return `The host is already on air in “${otherShow.name}” in that slot.`;
        }
      }
    }
  }
  return null;
}

export function createShow(state: GameState, showInput: ShowInput): ActionResult {
  const input = normalize(showInput);
  return act(state, (draft) => {
    const name = input.name.trim();
    if (!name) return fail('Give the show a name.');
    const error = staffingError(draft, input, null);
    if (error) return fail(error);
    const id = newId(draft, 's');
    draft.shows.push({ id, ...input, name, freshness: 1 });
    return id;
  });
}

export function updateShow(state: GameState, showId: Id, showInput: ShowInput): ActionResult {
  const input = normalize(showInput);
  return act(state, (draft) => {
    const show = draft.shows.find((s) => s.id === showId);
    if (!show) return fail('That show doesn’t exist.');
    const name = input.name.trim();
    if (!name) return fail('Give the show a name.');
    const error = staffingError(draft, input, showId);
    if (error) return fail(error);
    // Changing the format makes it a new show for the audience.
    if (input.genre !== show.genre) show.freshness = 1;
    Object.assign(show, { ...input, name });
    const conflict = slotConflict(draft, show);
    if (conflict) return fail(conflict);
  });
}

export function deleteShow(state: GameState, showId: Id): ActionResult {
  return act(state, (draft) => {
    const show = draft.shows.find((s) => s.id === showId);
    if (!show) return fail('That show doesn’t exist.');
    const contract = draft.contracts.find((c) => c.showId === showId);
    if (contract) settleContract(draft, contract, `“${show.name}” was cancelled`);
    draft.shows = draft.shows.filter((s) => s.id !== showId);
    draft.campaigns = draft.campaigns.filter((c) => c.targetId !== showId);
    delete draft.promotion[showId];
    for (const channel of draft.channels) {
      channel.schedule = channel.schedule.map((id) => (id === showId ? null : id));
    }
  });
}

export function revampShow(state: GameState, showId: Id): ActionResult {
  return act(state, (draft) => {
    const show = draft.shows.find((s) => s.id === showId);
    if (!show) return fail('That show doesn’t exist.');
    if (show.freshness >= 1) return fail('This show is already fresh.');
    const paid = pay(draft, REVAMP_COST, 'revamps');
    if (paid) return paid;
    show.freshness = 1;
  });
}

/** Puts a show in a slot (moving it if it was scheduled elsewhere), or clears the slot with null. */
export function scheduleShow(state: GameState, channelId: Id, slot: number, showId: Id | null): ActionResult {
  return act(state, (draft) => {
    const channel = draft.channels.find((c) => c.id === channelId);
    if (!channel) return fail('That channel doesn’t exist.');
    if (slot < 0 || slot >= SLOTS.length) return fail('That time slot doesn’t exist.');
    if (showId === null) {
      channel.schedule[slot] = null;
      return;
    }
    const show = draft.shows.find((s) => s.id === showId);
    if (!show) return fail('That show doesn’t exist.');
    if (getGenre(show.genre).medium !== channel.medium) return fail('That show is for a different medium.');
    for (const c of draft.channels) c.schedule = c.schedule.map((id) => (id === showId ? null : id));
    channel.schedule[slot] = showId;
    const conflict = slotConflict(draft, show);
    if (conflict) return fail(conflict);
  });
}

// --- Sponsors ---

/** Attaches a sponsor offer to a show. One contract per show. */
export function acceptOffer(state: GameState, offerId: Id, showId: Id): ActionResult {
  return act(state, (draft) => {
    const offer = draft.offers.find((o) => o.id === offerId);
    if (!offer || offer.expiresOn < draft.day) return fail('That offer is no longer available.');
    const show = draft.shows.find((s) => s.id === showId);
    if (!show) return fail('That show doesn’t exist.');
    if (getGenre(show.genre).medium !== offer.medium) return fail(`This sponsor wants a ${MEDIUM_NAMES[offer.medium]} show.`);
    if (draft.contracts.some((c) => c.showId === showId)) return fail(`“${show.name}” already has a sponsor.`);
    draft.offers = draft.offers.filter((o) => o !== offer);
    const { expiresOn: _expired, ...terms } = offer;
    draft.contracts.push({ ...terms, showId, startDay: draft.day, endDay: draft.day + offer.weeks * 7, listenerSum: 0, daysRun: 0 });
    // From today the sales staff have a sponsor to look after.
    draft.relations[offer.sponsor] ??= { level: 1, points: 0 };
    // A first contract is a milestone, and it opens Marketing: at once, not with tomorrow's news.
    checkMilestones(draft);
  });
}

/** Ends a sponsor contract early; the penalty is always charged. */
export function cancelContract(state: GameState, contractId: Id): ActionResult {
  return act(state, (draft) => {
    const contract = draft.contracts.find((c) => c.id === contractId);
    if (!contract) return fail('That contract doesn’t exist.');
    settleContract(draft, contract, 'you cancelled it');
  });
}

export function declineOffer(state: GameState, offerId: Id): ActionResult {
  return act(state, (draft) => {
    if (!draft.offers.some((o) => o.id === offerId)) return fail('That offer is no longer available.');
    draft.offers = draft.offers.filter((o) => o.id !== offerId);
  });
}

// --- Content market & auctions ---

/** Market prices after library and satellite technology, and the difficulty. */
export const titlePrice = (state: GameState, listed: number) => Math.round(listed * techMultiplier(state, 'contentPrice') * costFactor(state));
export const rightsPrice = (state: GameState, listed: number) => Math.round(listed * techMultiplier(state, 'sportsPrice') * costFactor(state));
/** What one airing of a title on the market will cost: its price, spread over its airings. */
export const airingPrice = (state: GameState, offer: Pick<TitleOffer, 'price' | 'airings'>) => Math.round(titlePrice(state, offer.price) / offer.airings);

/**
 * Takes a licensed title from this month's market into the library. Nothing is
 * paid now: each airing is paid on the day it airs (payTitles in economy.ts).
 */
export function buyTitle(state: GameState, offerId: Id): ActionResult {
  return act(state, (draft) => {
    if (!isUnlocked(draft, 'content')) return fail(lockedReason('content'));
    const offer = draft.market.titles.find((t) => t.id === offerId);
    if (!offer) return fail('That title is no longer for sale.');
    const capacity = libraryCapacity(draft);
    if (capacity === 0) return fail('Set up a library with shelving on the Office screen first.');
    if (draft.library.length >= capacity) return fail('Your library is full. Add shelving or let titles run out.');
    if (draft.money < 0) return fail('Not while the company is in the red: the distributors want to see money in the bank.');
    draft.market.titles = draft.market.titles.filter((t) => t !== offer);
    draft.library.push({
      id: offer.id,
      name: offer.name,
      genre: offer.genre,
      quality: offer.quality,
      airingsLeft: offer.airings,
      freshness: 1,
      fee: offer.fee,
      perAiring: airingPrice(draft, offer),
    });
    return offer.id;
  });
}

/** Throws a title out of the library. Its airings were paid as they aired, so the ones left cost nothing. */
export function discardTitle(state: GameState, titleId: Id): ActionResult {
  return act(state, (draft) => {
    if (!draft.library.some((t) => t.id === titleId)) return fail('That title isn’t in your library.');
    draft.library = draft.library.filter((t) => t.id !== titleId);
  });
}

export function buyRights(state: GameState, offerId: Id): ActionResult {
  return act(state, (draft) => {
    if (!isUnlocked(draft, 'content')) return fail(lockedReason('content'));
    const offer = draft.market.rights.find((r) => r.id === offerId);
    if (!offer) return fail('Those rights are no longer for sale.');
    const price = rightsPrice(draft, offer.price);
    if (draft.money < price) return fail(`Not enough money (${formatEuro(price)} needed).`);
    spend(draft, price, 'content');
    draft.market.rights = draft.market.rights.filter((r) => r !== offer);
    draft.sportsRights.push({ id: offer.id, name: offer.name, prestige: offer.prestige, endDay: draft.day + Math.round(offer.months * 30.44) });
  });
}

/** Places (or replaces) the player's sealed bid. The money is only paid if the bid wins. */
export function placeBid(state: GameState, auctionId: Id, channelId: Id, amount: number): ActionResult {
  return act(state, (draft) => {
    const auction = draft.auctions.find((a) => a.id === auctionId);
    if (!auction) return fail('That auction has closed.');
    const channel = draft.channels.find((c) => c.id === channelId);
    if (!channel) return fail('Choose a channel for the license.');
    if (channel.medium !== auction.medium) return fail(`This is a ${MEDIUM_NAMES[auction.medium]} license; choose a ${MEDIUM_NAMES[auction.medium]} channel.`);
    const renewing = auction.holder?.channelId === channelId;
    if (auction.holder?.ownerId === PLAYER && !renewing) return fail('Only the channel that holds this license can renew it.');
    if (!renewing && !regionOpen(draft, auction.regionId)) return fail(`You can’t bid for a license outside ${regionsHeld(draft)} yet. ${lockedReason('regions')}`);
    if (!renewing && draft.licenses.some((l) => l.channelId === channelId && l.regionId === auction.regionId)) {
      return fail(`${channel.name} already broadcasts in ${getRegion(auction.regionId).name}.`);
    }
    const barred = renewing ? undefined : barredUntil(draft, auction.medium, auction.regionId);
    if (barred !== undefined) return fail(`The authority won’t give you a ${MEDIUM_NAMES[auction.medium]} license in ${getRegion(auction.regionId).name} until ${formatDate(barred)}.`);
    if (!Number.isFinite(amount) || amount < auction.reserve) return fail(`Bid at least the reserve of ${formatEuro(auction.reserve)}.`);
    if (amount > draft.money) return fail(`You can’t bid more than you have (${formatEuro(Math.floor(draft.money))}).`);
    auction.bid = { channelId, amount: Math.round(amount) };
  });
}

export function withdrawBid(state: GameState, auctionId: Id): ActionResult {
  return act(state, (draft) => {
    const auction = draft.auctions.find((a) => a.id === auctionId);
    if (!auction?.bid) return fail('You haven’t bid in that auction.');
    auction.bid = null;
  });
}

// --- Marketing ---

export interface CampaignInput {
  /** A channel or show id. */
  targetId: Id;
  audience: CampaignAudience;
  weeklyBudget: number;
  weeks: number;
  /** Start again by itself when it ends. */
  repeat?: boolean;
}

/** Starts a campaign, run by the most skilled marketer who isn't running one yet. */
export function startCampaign(state: GameState, input: CampaignInput): ActionResult {
  return act(state, (draft) => {
    if (!isUnlocked(draft, 'marketing')) return fail(lockedReason('marketing'));
    const isTarget = draft.channels.some((c) => c.id === input.targetId) || draft.shows.some((s) => s.id === input.targetId);
    if (!isTarget) return fail('Choose a channel or show to promote.');
    if (!MARKETING.budgets.includes(input.weeklyBudget)) return fail('Choose one of the weekly budgets.');
    if (!MARKETING.durations.includes(input.weeks)) return fail('Choose one of the campaign lengths.');
    if (draft.money < weeklyCost(draft, input.weeklyBudget)) return fail('Not enough money for the first week of the campaign.');
    const desked = employeesWithDesk(draft);
    const busy = new Set(draft.campaigns.map((c) => c.marketerId));
    const marketer = draft.employees
      .filter((e) => e.role === 'marketing' && desked.has(e.id) && !busy.has(e.id))
      .sort((a, b) => b.skill - a.skill)[0];
    if (!marketer) return fail('Every marketer is busy, or none has a desk. Hire marketing staff to run more campaigns.');
    const id = newId(draft, 'm');
    draft.campaigns.push({ id, ...input, repeat: input.repeat ?? false, marketerId: marketer.id, endDay: draft.day + input.weeks * 7 });
    return id;
  });
}

/** Makes a running campaign longer by one of the campaign lengths; it goes on at the same budget. */
export function extendCampaign(state: GameState, campaignId: Id, weeks: number): ActionResult {
  return act(state, (draft) => {
    const campaign = draft.campaigns.find((c) => c.id === campaignId);
    if (!campaign) return fail('That campaign isn’t running.');
    if (!MARKETING.durations.includes(weeks)) return fail('Choose one of the campaign lengths.');
    campaign.endDay += weeks * 7;
  });
}

/** Has a running campaign start again by itself when it ends, or not. */
export function setCampaignRepeat(state: GameState, campaignId: Id, repeat: boolean): ActionResult {
  return act(state, (draft) => {
    const campaign = draft.campaigns.find((c) => c.id === campaignId);
    if (!campaign) return fail('That campaign isn’t running.');
    campaign.repeat = repeat;
  });
}

export function stopCampaign(state: GameState, campaignId: Id): ActionResult {
  return act(state, (draft) => {
    if (!draft.campaigns.some((c) => c.id === campaignId)) return fail('That campaign isn’t running.');
    draft.campaigns = draft.campaigns.filter((c) => c.id !== campaignId);
  });
}

// --- The player's own events ---

/** Stages a concert, gala or telethon on a channel: reputation, fame for its host, and prestige. */
export function stageEvent(state: GameState, channelId: Id, kind: OwnEventKind): ActionResult {
  return act(state, (draft) => {
    if (!isUnlocked(draft, 'events')) return fail(lockedReason('events'));
    const channel = draft.channels.find((c) => c.id === channelId);
    if (!channel) return fail('That channel doesn’t exist.');
    const blocker = ownEventBlocker(draft, channel, kind);
    if (blocker) return fail(blocker);
    const spec = OWN_EVENTS[kind];
    spend(draft, ownEventCost(draft, channel, kind), 'events');
    for (const regionId of channelRegions(draft, channel.id)) {
      channel.reputation[regionId] = Math.min(OWN_EVENT_LIMITS.maxReputation, (channel.reputation[regionId] ?? 0) + spec.reputation);
    }
    const host = eventHost(draft, channel);
    if (host) host.fame = Math.min(100, host.fame + spec.fame);
    const prestige = ownEventPrestige(draft, channel, kind);
    draft.prestige += prestige;
    channel.lastEventDay = draft.day;
    addHeadline(draft, `${channel.name} stages a ${spec.name.toLowerCase()}${host ? `, presented by ${host.name}` : ''}.`);
    addMessage(draft, 'good', `The ${spec.name.toLowerCase()} was a success: ${channel.name}’s reputation is up${host ? `, ${host.name} is more famous` : ''}, and you earned ${prestige} prestige.`);
  });
}

// --- Loans ---

export function takeLoan(state: GameState, amount: number, months: number): ActionResult {
  return act(state, (draft) => {
    if (draft.loan) return fail('Pay off your current loan first.');
    if (!LOAN.terms.includes(months)) return fail('Choose one of the loan terms.');
    if (amount < LOAN.minAmount) return fail(`The bank lends at least €${LOAN.minAmount.toLocaleString('en-IE')}.`);
    const limit = maxLoan(draft);
    if (amount > limit) return fail(`The bank lends you at most €${limit.toLocaleString('en-IE')} (half your company’s value).`);
    draft.money += amount;
    draft.ledger.loanProceeds += amount;
    draft.loan = { amount, balance: amount, monthlyPayment: loanPayment(amount, months), monthsLeft: months };
  });
}

/** Pays off the rest of the loan now (no early-repayment fee). */
export function repayLoan(state: GameState): ActionResult {
  return act(state, (draft) => {
    if (!draft.loan) return fail('You don’t have a loan.');
    const owed = Math.round(draft.loan.balance);
    if (draft.money < owed) return fail(`Not enough money (€${owed.toLocaleString('en-IE')} needed).`);
    spend(draft, owed, 'loanPayments');
    draft.loan = null;
  });
}
