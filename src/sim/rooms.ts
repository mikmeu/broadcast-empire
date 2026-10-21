// Building rooms: where a room may be on a floor, where its door may be, what
// it costs, and a place the game can propose for one. A room is a rectangle
// of whole tiles with one door; whatever floor is left over is corridor.

import { BUILD_COST_PER_TILE } from '../config/balance';
import { CORE, FLOOR, FURNITURE, JOIN_MIN_WALL, ROOM_MIN_LONG, ROOM_MIN_SHORT, ROOM_SIZES, ROOM_TYPE_NAMES, ONE_DESK_ROOMS, STUDIO_REQUIREMENTS, WEST, buildable, inRoom, partsOf, tileCount, type Rect, type FurnitureType, type RoomShape, type RoomType, inText } from '../config/office';
import { postRoomNeeded } from './content';
import { buildingOf, controlRoomOf, doorTiles, findRoom, footprint, isTvStudio, sharedWall } from './office';
import { saleBlocker } from './tech';

export { doorTiles };
import type { GameState, RentedRoom } from './state';

type Door = RoomShape['door'];

/** Where a room is to be: its floor, its rectangle (or the parts of a joined room) and its door. Without a door only the floor is judged. */
export interface RoomPlan extends Rect {
  floor: number;
  parts?: Rect[];
  door: Door | null;
}

type Shape = Rect & { parts?: readonly Rect[] };

const rectsOverlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** Whether two rooms (or rectangles) have floor in common, part by part. */
const overlaps = (a: Shape, b: Shape) => partsOf(a).some((p) => partsOf(b).some((q) => rectsOverlap(p, q)));
const contains = (outer: Rect, inner: Rect) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
/** Whether a rectangle lies on the floor of a room, all of it. */
const within = (room: Shape, inner: Rect) => partsOf(room).some((p) => contains(p, inner)) || [...Array(inner.w).keys()].every((dx) => [...Array(inner.h).keys()].every((dy) => inRoom(room, inner.x + dx, inner.y + dy)));

/** The parts of the block at the head of a floor that nobody walks through to get anywhere: the stairs, the lifts, and on the ground floor the two small rooms. */
const coreBlocks = (floor: number): Rect[] => (floor === 1 ? [CORE.stairs, CORE.lifts, CORE.technician, CORE.cleaners] : [CORE.stairs, CORE.lifts]);

/**
 * The tiles of a floor that can be walked to from the hall between the stairs
 * and the lifts, given the rooms that stand on it: the corridor, in one piece.
 * A tile is `x:y`.
 */
export function corridorTiles(state: GameState, floor: number, rooms: readonly Shape[]): Set<string> {
  const east = buildingOf(state).w;
  const blocked: Shape[] = [...coreBlocks(floor), ...rooms];
  const open = (x: number, y: number) => x >= WEST && x < east && y >= 0 && y < FLOOR.h && !blocked.some((r) => inRoom(r, x, y));
  // The hall is never built on: start there, in line with the entrance.
  const start: [number, number] = [WEST + CORE.upper - 1, FLOOR.corridorY];
  const reached = new Set<string>([`${start[0]}:${start[1]}`]);
  const queue = [start];
  for (let n = 0; n < queue.length; n++) {
    const [x, y] = queue[n]!;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
      const key = `${nx}:${ny}`;
      if (reached.has(key) || !open(nx, ny)) continue;
      reached.add(key);
      queue.push([nx, ny]);
    }
  }
  return reached;
}

/** The rooms of a floor that walls stand around: every room but the hall that comes with the building. */
const walled = (state: GameState, floor: number) => state.rooms.filter((r) => r.floor === floor && !r.fixed);

/**
 * Why a room can't be where a plan has it, or null if it can. `roomId` is the
 * room that is being given this shape, if it is one that exists: it does not
 * stand in its own way, and its furniture has to fit the new shape.
 */
export function roomError(state: GameState, plan: RoomPlan, roomId?: string): string | null {
  const building = buildingOf(state);
  if (!Number.isInteger(plan.floor) || plan.floor < 1 || plan.floor > building.floors) return 'That floor doesn’t exist.';
  if (plan.floor > state.floorsUnlocked) return `Floor ${plan.floor} isn’t available yet. It opens as your company grows.`;
  if (![plan.x, plan.y, plan.w, plan.h].every(Number.isInteger)) return 'A room is made of whole tiles.';
  if (Math.min(plan.w, plan.h) < ROOM_MIN_SHORT || Math.max(plan.w, plan.h) < ROOM_MIN_LONG) return `A room is at least ${ROOM_MIN_SHORT} by ${ROOM_MIN_LONG} tiles.`;
  if (!contains(buildable(building, plan.floor), plan)) return 'A room has to stay on the floor, clear of the stairs and the lifts.';
  const others = walled(state, plan.floor).filter((r) => r.roomId !== roomId);
  const inTheWay = others.find((r) => overlaps(r, plan));
  if (inTheWay) return `${inTheWay.name} is in the way.`;

  const own = roomId ? state.rooms.find((r) => r.roomId === roomId) : undefined;
  if (own) {
    // Its furniture stays where it stands on the floor, so it has to be inside the new walls.
    const outside = own.furniture.find((f) => !within(plan, { x: own.x + f.x, y: own.y + f.y, ...footprint(f.type, f.turn) }));
    if (outside) return `The ${FURNITURE[outside.type].name.toLowerCase()} would be left outside the room. Move or sell it first.`;
  }

  const corridor = corridorTiles(state, plan.floor, [...others, plan]);
  const reachable = (room: Shape, door: Door) => doorTiles(room, door)?.outside.every(([x, y]) => corridor.has(`${x}:${y}`)) ?? false;
  const cutOff = others.find((r) => !reachable(r, r.door));
  if (cutOff) return `That would cut ${cutOff.name} off from the stairs and the lifts.`;
  if (!plan.door) return null;

  const tiles = doorTiles(plan, plan.door);
  if (!tiles) return 'Put the door in one of the room’s walls, clear of the corners.';
  const east = building.w;
  if (tiles.outside.some(([x, y]) => x < WEST || x >= east || y < 0 || y >= FLOOR.h)) return 'A door can’t be in an outer wall of the building.';
  const beyond = others.find((r) => tiles.outside.some(([x, y]) => inRoom(r, x, y)));
  if (beyond) return `A door has to open onto the corridor, not into ${beyond.name}.`;
  if (!reachable(plan, plan.door)) return 'Nobody could get to that door from the stairs and the lifts.';
  // A door beside the hall opens into it: what stands in the hall may not stand in front of it.
  for (const hall of state.rooms.filter((r) => r.floor === plan.floor && r.fixed)) {
    const inFront = hall.furniture.find((f) => tiles.outside.some(([x, y]) => overlaps({ x: hall.x + f.x, y: hall.y + f.y, ...footprint(f.type, f.turn) }, { x, y, w: 1, h: 1 })));
    if (inFront) return `The ${FURNITURE[inFront.type].name.toLowerCase()} in the ${hall.name.toLowerCase()} stands where the door would open. Move or sell it first.`;
  }
  if (own) {
    const blocking = own.furniture.find((f) => tiles.inside.some(([x, y]) => overlaps({ x: own.x + f.x, y: own.y + f.y, ...footprint(f.type, f.turn) }, { x, y, w: 1, h: 1 })));
    if (blocking) return `The ${FURNITURE[blocking.type].name.toLowerCase()} stands where the door would be. Move or sell it first.`;
  }
  return null;
}

/** Every place a door can be in the walls of a room: in the middle of a tile's side, all the way round. A room of parts has none where two walls meet or where its parts do. */
export function doorSpots(room: Shape): Door[] {
  const spots: Door[] = [];
  for (const part of partsOf(room)) {
    for (let x = part.x; x < part.x + part.w; x++) spots.push({ x: x + 0.5, z: part.y }, { x: x + 0.5, z: part.y + part.h });
    for (let y = part.y; y < part.y + part.h; y++) spots.push({ x: part.x, z: y + 0.5 }, { x: part.x + part.w, z: y + 0.5 });
  }
  return room.parts ? spots.filter((door) => doorTiles(room, door) !== null) : spots;
}

/** The middle of the hall between the stairs and the lifts: where everyone who comes onto a floor sets out from. */
const HALL = { x: WEST + CORE.upper - 0.5, z: FLOOR.corridorY + 0.5 };

/**
 * The door the game proposes for a room: of all the places a door can be, the
 * one nearest the stairs and the lifts, and of those at the same distance the
 * one nearest the middle of its wall. Null if the room can have no door at all.
 */
export function proposeDoor(state: GameState, plan: Omit<RoomPlan, 'door'>, roomId?: string): Door | null {
  const middle = { x: plan.x + plan.w / 2, z: plan.y + plan.h / 2 };
  const score = (door: Door) => Math.hypot(door.x - HALL.x, door.z - HALL.z) + 0.01 * Math.hypot(door.x - middle.x, door.z - middle.z);
  const spots = doorSpots(plan).sort((a, b) => score(a) - score(b));
  return spots.find((door) => roomError(state, { ...plan, door }, roomId) === null) ?? null;
}

/**
 * A place the game proposes for a new room of a kind on a floor, of the usual
 * size for that kind: in one of two rows along the line of the entrance, with
 * its door on that line, the way an office floor is usually laid out. It takes
 * the free place nearest the stairs and the lifts; for a TV studio one with
 * room for its control room beside it. Null if no room of that size fits that way.
 */
export function proposeRoom(state: GameState, floor: number, type: RoomType): (RoomPlan & { door: Door }) | null {
  // A control room goes wall to wall with a TV studio on the floor that has none yet (0.16.0).
  if (type === 'controlRoom') {
    const waiting = state.rooms.filter((r) => r.floor === floor && isTvStudio(r.type) && !controlRoomOf(state, r.roomId));
    for (const studio of waiting) {
      const plan = proposeBeside(state, studio.roomId, type);
      if (plan) return plan;
    }
  }
  const area = buildable(buildingOf(state), floor);
  const size = ROOM_SIZES[type];
  const rows = [FLOOR.corridorY - size.h, FLOOR.corridorY + 1];
  for (let x = area.x; x + size.w <= area.x + area.w; x++) {
    for (const y of rows) {
      const plan = { floor, x, y, ...size };
      const door = { x: x + Math.floor(size.w / 2) + 0.5, z: y < FLOOR.corridorY ? y + size.h : y };
      if (roomError(state, { ...plan, door }) !== null) continue;
      // A TV studio is only proposed where its control room fits beside it (0.16.0): without one it can't be used.
      if (!isTvStudio(type) || roomForControl(state, { ...plan, door })) return { ...plan, door };
    }
  }
  return null;
}

/** Whether a control room of the usual size would fit wall to wall with a room that is planned, in its row. */
function roomForControl(state: GameState, plan: RoomPlan & { door: Door }): boolean {
  const planned: RentedRoom = { roomId: '(planned)', name: '', ...plan, type: null, furniture: [], cleanliness: 100, issue: null };
  return proposeBeside({ ...state, rooms: [...state.rooms, planned] }, planned.roomId, 'controlRoom') !== null;
}

/**
 * A place for a new room of a kind wall to wall with a room, of the usual size
 * for that kind: beside it in its row, east of it first, with its door on the
 * corridor side. Null if there is no such place.
 */
export function proposeBeside(state: GameState, roomId: string, type: RoomType): (RoomPlan & { door: Door }) | null {
  const room = state.rooms.find((r) => r.roomId === roomId);
  if (!room) return null;
  const size = { w: ROOM_SIZES[type].w, h: room.h };
  const north = room.y + room.h <= FLOOR.corridorY;
  for (const x of [room.x + room.w, room.x - size.w]) {
    const plan = { floor: room.floor, x, y: room.y, ...size };
    const door = { x: x + Math.floor(size.w / 2) + 0.5, z: north ? room.y + room.h : room.y };
    if (roomError(state, { ...plan, door }) === null) return { ...plan, door };
    const other = proposeDoor(state, plan);
    if (other) return { ...plan, door: other };
  }
  return null;
}

/**
 * Why a room can't be of a kind, or null if it can: a company has one office
 * for its CEO, a studio that is built around a piece that has yet to be
 * researched (the game show decor, the soap opera decor) waits for it, and a
 * library waits for a post room until the first server rack (0.17.0).
 * `roomId` is the room that gets the kind, if it exists.
 */
export function kindError(state: GameState, type: RoomType, roomId?: string): string | null {
  const other = type === 'ceoOffice' ? state.rooms.find((r) => r.type === 'ceoOffice' && r.roomId !== roomId) : undefined;
  if (other) return `You have an office of your own already: ${other.name}.`;
  if (type === 'library' && postRoomNeeded(state)) return 'A library needs a post room with a sorting case first: the titles come by post.';
  for (const piece of Object.keys(STUDIO_REQUIREMENTS[type] ?? {}) as FurnitureType[]) {
    const blocked = saleBlocker(state, piece);
    if (blocked) return `A ${inText(ROOM_TYPE_NAMES[type])} needs the ${FURNITURE[piece].name.toLowerCase()}. ${blocked}`;
  }
  return null;
}

/** The most parts a joined room has. */
export const MAX_PARTS = 2;

/**
 * What two rooms next door to each other become when joined (0.19.0): the room
 * the player keeps, with its door, grown by the other's floor. Or why they
 * can't be joined.
 */
export function joinPlan(state: GameState, keepId: string, otherId: string): { error: string } | { plan: RoomPlan & { door: Door; parts: Rect[] }; type: RoomType | null } {
  const keep = findRoom(state, keepId);
  const other = findRoom(state, otherId);
  if (!keep || !other || keepId === otherId) return { error: 'You don’t have this room.' };
  if (keep.fixed || other.fixed) return { error: 'A room that comes with the building can’t be joined.' };
  if (keep.floor !== other.floor) return { error: 'Only rooms on the same floor can be joined.' };
  if (keep.type && other.type && keep.type !== other.type) return { error: `${keep.name} and ${other.name} are not the same kind of room.` };
  if (keep.parts || other.parts) return { error: 'A joined room can’t be joined to another.' };
  if (sharedWall(keep, other) < JOIN_MIN_WALL) return { error: `${keep.name} and ${other.name} need ${JOIN_MIN_WALL} tiles of wall in common to be joined.` };
  const type = keep.type ?? other.type;
  const desk = type ? ONE_DESK_ROOMS[type] : undefined;
  if (desk && keep.furniture.some((f) => f.type === desk) && other.furniture.some((f) => f.type === desk)) {
    return { error: `Both rooms have a ${FURNITURE[desk].name.toLowerCase()}, and a ${inText(ROOM_TYPE_NAMES[type!])} has room for one. Sell one first.` };
  }
  const x = Math.min(keep.x, other.x);
  const y = Math.min(keep.y, other.y);
  const w = Math.max(keep.x + keep.w, other.x + other.w) - x;
  const h = Math.max(keep.y + keep.h, other.y + other.h) - y;
  const plan = { floor: keep.floor, x, y, w, h, parts: [keep, other].map(({ x, y, w, h }) => ({ x, y, w, h })), door: { ...keep.door } };
  const apart = { ...state, rooms: state.rooms.filter((r) => r !== other) };
  const error = roomError(apart, plan, keepId);
  return error ? { error } : { plan, type };
}

/** What building a room costs, once: by its floor area. */
export const buildCost = (room: Pick<Rect, 'w' | 'h'> & { parts?: readonly Rect[] }) => tileCount(room) * BUILD_COST_PER_TILE;

/** What giving a room another shape costs: the floor it gains is paid for like new; what it loses brings nothing back. */
export const reshapeCost = (room: Pick<Rect, 'w' | 'h'> & { parts?: readonly Rect[] }, plan: Pick<Rect, 'w' | 'h'> & { parts?: readonly Rect[] }) => Math.max(0, tileCount(plan) - tileCount(room)) * BUILD_COST_PER_TILE;

/** The name a room of a kind gets: its kind and the first number no other room of that kind has. */
export function roomNameFor(state: GameState, type: RoomType, roomId?: string): string {
  const taken = new Set(state.rooms.filter((r) => r.roomId !== roomId).map((r) => r.name));
  // The one of its kind needs no number.
  if (type === 'ceoOffice' && !taken.has(ROOM_TYPE_NAMES[type])) return ROOM_TYPE_NAMES[type];
  for (let n = 1; ; n++) if (!taken.has(`${ROOM_TYPE_NAMES[type]} ${n}`)) return `${ROOM_TYPE_NAMES[type]} ${n}`;
}

/** Whether a room still has the name the game gave it, which follows its kind. */
export const hasOwnKindOfName = (room: RentedRoom) => room.type !== null && new RegExp(`^${ROOM_TYPE_NAMES[room.type]}( \\d+)?$`).test(room.name);
