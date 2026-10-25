// The rooms and the furniture of the office.

import { getGenre } from '../../config/genres';
import { RENTABLE_ROOM_TYPES, tileCount, type FurnitureType, type RoomType } from '../../config/office';
import { cleanName } from '../newGame';
import { letRefusal } from '../deals';
import { findRoom, placementError } from '../office';
import { buildCost, hasOwnKindOfName, joinPlan, kindError, reshapeCost, roomError, roomNameFor, type RoomPlan } from '../rooms';
import { furniturePrice, outdatedItems, purchaseTier, resaleValue, saleBlocker } from '../tech';
import { newId, type BuildingIssue, type GameState, type Id, type RentedRoom } from '../state';
import { type ActionResult, act, fail, pay } from './core';

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
    if (room.parts) return fail('A joined room can’t be redrawn.');
    const letError = letRefusal(draft, roomId);
    if (letError) return fail(letError);
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

/**
 * Joins a room to one next door of the same kind (0.19.0): the wall between
 * them comes down and the room becomes one, an L if they were side by side
 * with unequal depth. The room kept (`keepId`) keeps its name, door and id;
 * the other one's furniture moves in, and its door is closed up. It costs
 * nothing: the floor is built and paid for.
 */
export function joinRooms(state: GameState, keepId: string, otherId: string): ActionResult {
  return act(state, (draft) => {
    const letError = letRefusal(draft, keepId) ?? letRefusal(draft, otherId);
    if (letError) return fail(letError);
    const joined = joinPlan(draft, keepId, otherId);
    if ('error' in joined) return fail(joined.error);
    const keep = draft.rooms.find((r) => r.roomId === keepId)!;
    const other = draft.rooms.find((r) => r.roomId === otherId)!;
    const { plan } = joined;
    // Furniture is measured from the box, which has moved.
    for (const room of [keep, other]) for (const item of room.furniture) Object.assign(item, { x: item.x + room.x - plan.x, y: item.y + room.y - plan.y });
    const tiles = tileCount(keep) + tileCount(other);
    keep.cleanliness = (keep.cleanliness * tileCount(keep) + other.cleanliness * tileCount(other)) / tiles;
    keep.issue = [keep.issue, other.issue].reduce((worst, i) => (i && (!worst || i.workLeft > worst.workLeft) ? i : worst), null as BuildingIssue | null);
    keep.furniture.push(...other.furniture);
    keep.type = joined.type;
    Object.assign(keep, { x: plan.x, y: plan.y, w: plan.w, h: plan.h, parts: plan.parts });
    draft.rooms = draft.rooms.filter((r) => r !== other);
    for (const show of draft.shows) if (show.studioId === otherId) show.studioId = keepId;
  });
}

/** Takes a room away: its walls go, and its floor is corridor again. Nothing of what it cost to build comes back. */
export function releaseRoom(state: GameState, roomId: string): ActionResult {
  return act(state, (draft) => {
    const room = findRoom(draft, roomId);
    if (!room) return fail('You don’t have this room.');
    if (room.fixed) return fail('This room comes with the building.');
    const letError = letRefusal(draft, roomId);
    if (letError) return fail(letError);
    if (room.furniture.length > 0) return fail('Sell or store the furniture in this room first.');
    draft.rooms = draft.rooms.filter((r) => r !== room);
    for (const show of draft.shows) if (show.studioId === roomId) show.studioId = null;
  });
}

export function setRoomType(state: GameState, roomId: string, type: RoomType): ActionResult {
  return act(state, (draft) => {
    const room = findRoom(draft, roomId);
    if (!room) return fail('You don’t have this room.');
    if (room.fixed || !RENTABLE_ROOM_TYPES.includes(type)) return fail('The reception is at the entrance; it can’t be moved.');
    const letError = letRefusal(draft, roomId);
    if (letError) return fail(letError);
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
    const letError = letRefusal(draft, roomId) ?? (to.roomId === roomId ? null : letRefusal(draft, to.roomId));
    if (letError) return fail(letError);
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
    const letError = letRefusal(draft, roomId);
    if (letError) return fail(letError);
    room.furniture = room.furniture.filter((f) => f !== item);
    // Whoever had it as their own place takes what is free again.
    for (const employee of draft.employees) if (employee.desk === item.id) employee.desk = null;
    const refund = resaleValue(item, draft.day);
    draft.money += refund;
    draft.ledger.purchases -= refund;
  });
}

/** Puts a piece of furniture away. It costs nothing; it is no one's desk any more, and it keeps its tier, wear and age. */
export function storeFurniture(state: GameState, roomId: string, furnitureId: Id): ActionResult {
  return act(state, (draft) => {
    const room = findRoom(draft, roomId);
    const item = room?.furniture.find((f) => f.id === furnitureId);
    if (!room || !item) return fail('That furniture isn’t here.');
    const letError = letRefusal(draft, roomId);
    if (letError) return fail(letError);
    room.furniture = room.furniture.filter((f) => f !== item);
    for (const employee of draft.employees) if (employee.desk === item.id) employee.desk = null;
    draft.storage.push(item);
  });
}

/** Takes a stored piece out and puts it in a room that takes it, on any floor. It costs nothing and it stays the piece it was. */
export function placeStored(state: GameState, furnitureId: Id, roomId: string, x: number, y: number, turn = 0): ActionResult {
  return act(state, (draft) => {
    const item = draft.storage.find((f) => f.id === furnitureId);
    if (!item) return fail('That furniture isn’t in storage.');
    const room = ownRoom(draft, roomId);
    if (!room) return fail('You don’t have this room.');
    const error = placementError(draft, room, item.type, x, y, turn, item.id);
    if (error) return fail(error);
    draft.storage = draft.storage.filter((f) => f !== item);
    room.furniture.push(item);
    Object.assign(item, { x, y, turn: ((turn % 4) + 4) % 4 });
  });
}

/** Sells a stored piece for what it is worth, as a piece in a room is sold. */
export function sellStored(state: GameState, furnitureId: Id): ActionResult {
  return act(state, (draft) => {
    const item = draft.storage.find((f) => f.id === furnitureId);
    if (!item) return fail('That furniture isn’t in storage.');
    draft.storage = draft.storage.filter((f) => f !== item);
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
