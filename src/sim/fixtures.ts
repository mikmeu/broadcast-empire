// Short cuts for the tests and the bots: ways of doing in one call what a
// player does in several. The game itself offers none of this.

import { FURNITURE, RECEPTION, plotsOf, type FurnitureType, type RoomType } from '../config/office';
import { placeFurniture, type ActionResult } from './actions';
import { spend } from './economy';
import { buildingOf, findFreeSpot, findRoom, missingFurniture, newRoom } from './office';
import { buildCost, roomError } from './rooms';
import type { GameState } from './state';

const fail = (error: string): ActionResult => ({ ok: false, error });

/** The id of a room of a kind, for tests that look up what a bot built: the first of that kind, or the `nth` after it. */
export function roomOfKind(state: GameState, type: RoomType, nth = 0): string {
  const room = state.rooms.filter((r) => r.type === type)[nth];
  if (!room) throw new Error(`There is no ${type} number ${nth + 1}.`);
  return room.roomId;
}

/**
 * Builds one of the rooms of the building's first plan, by its letter: rooms
 * A to G along the hall of the ground floor, and so on up. This is how rooms
 * were had before they could be drawn, and many tests still ask for "room C".
 * It costs what building a room of that size costs and obeys the same rules,
 * and the room has no kind until it is given one.
 */
export function rentRoom(state: GameState, roomId: string): ActionResult {
  if (state.bankrupt) return fail('The company is bankrupt.');
  if (roomId === RECEPTION.id) return fail(`The ${RECEPTION.name.toLowerCase()} comes with the building.`);
  if (findRoom(state, roomId)) return fail('You already rent this room.');
  const plot = plotsOf(buildingOf(state)).find((r) => r.id === roomId);
  if (!plot) return fail('That room doesn’t exist.');
  const error = roomError(state, plot);
  if (error) return fail(error);
  const cost = buildCost(plot);
  if (state.money < cost) return fail(`Not enough money (€${cost.toLocaleString('en-IE')} needed).`);
  const draft = structuredClone(state);
  spend(draft, cost, 'purchases');
  draft.rooms.push(newRoom(plot));
  return { ok: true, state: draft };
}

/** Buys one piece of furniture and puts it at the first free spot of a room, counted from the wall across from its door. */
export function autoPlaceFurniture(state: GameState, roomId: string, type: FurnitureType): ActionResult {
  const room = findRoom(state, roomId);
  if (!room) return fail('You don’t have this room.');
  const spot = findFreeSpot(state, room, type);
  if (!spot) return fail(`There’s no room left for a ${FURNITURE[type].name.toLowerCase()}.`);
  return placeFurniture(state, roomId, type, spot.x, spot.y);
}

/** Buys and places everything on a room's checklist that it still lacks, or nothing at all if one piece of it can't be had. */
export function addMissingEquipment(state: GameState, roomId: string): ActionResult {
  if (!findRoom(state, roomId)) return fail('You don’t have this room.');
  if (missingFurniture(state, findRoom(state, roomId)!).length === 0) return fail('This room has everything it needs.');
  // One piece at a time: what was just placed can make something else unnecessary.
  let next = state;
  for (let missing = missingFurniture(next, findRoom(next, roomId)!); missing.length > 0; missing = missingFurniture(next, findRoom(next, roomId)!)) {
    const result = autoPlaceFurniture(next, roomId, missing[0]![0]);
    if (!result.ok) return result;
    next = result.state;
  }
  return { ok: true, state: next };
}

/** The letters at which the companies of older games had their rooms, by kind, in the order they were taken. */
const OLD_ROOMS: Partial<Record<RoomType, readonly string[]>> = { radioStudio: ['C', 'B'], radioTalkStudio: ['D'], office: ['E', 'A'], managementOffice: ['F'], canteen: ['G'] };

/**
 * The same company in the rooms of the building's first plan, as a game from
 * before rooms could be drawn has it: every room stands at a lettered place
 * for its kind and goes by that letter, with its furniture as it stood. For
 * the tests about older games and their saves.
 */
export function onLetteredPlan(state: GameState): GameState {
  const s = structuredClone(state);
  const taken = new Map<RoomType, number>();
  const letters = new Map<string, string>();
  const plots = plotsOf(buildingOf(s));
  for (const room of s.rooms) {
    if (room.fixed || !room.type) continue;
    const nth = taken.get(room.type) ?? 0;
    taken.set(room.type, nth + 1);
    const plot = plots.find((p) => p.id === OLD_ROOMS[room.type!]?.[nth]);
    if (!plot) throw new Error(`The old plan has no place for ${room.name}.`);
    letters.set(room.roomId, plot.id);
    Object.assign(room, { roomId: plot.id, name: plot.name, floor: plot.floor, x: plot.x, y: plot.y, w: plot.w, h: plot.h, door: { ...plot.door } });
  }
  for (const show of s.shows) if (show.studioId) show.studioId = letters.get(show.studioId) ?? show.studioId;
  for (const employee of s.employees) if (employee.location) employee.location = letters.get(employee.location) ?? employee.location;
  return s;
}
