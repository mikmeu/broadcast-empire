import { RENT_PER_TILE } from '../config/balance';
import { BUILDINGS, CONTROL_ROOM_KIT, ROOM_TYPE_NAMES, inText, inRoom, partsOf, tileCount, DOOR_WIDTH, FLOOR, FURNITURE, GUEST_DESK_TIER, ONE_DESK_ROOMS, RECEPTION, REMOTE_DESKS, STUDIO_REQUIREMENTS, isStudioType, type Building, type FurnitureType, type Rect, type RoomLayout, type RoomShape, type RoomType } from '../config/office';
import { costFactor } from './difficulty';
import type { Employee, Furniture, GameState, GraceRule, Id, RentedRoom, Role } from './state';
import { onStrike } from './teams';

/** The office building a company is in. */
export const buildingOf = (state: Pick<GameState, 'building'>): Building => BUILDINGS[state.building];

/** What a room costs a month: by its floor area, and the difficulty. A room that comes with the building costs nothing. */
export function monthlyRent(room: Pick<RoomShape, 'w' | 'h' | 'parts'> & { fixed?: unknown }, game: Pick<GameState, 'difficulty'>): number {
  return room.fixed ? 0 : Math.round((tileCount(room) * rentPerTile(game)) / 10) * 10;
}

/** The rent of one tile a month, in this game. */
export const rentPerTile = (game: Pick<GameState, 'difficulty'>) => RENT_PER_TILE * costFactor(game);

/** A room as it is when the player gets it: empty and clean, where the floor plan has it. */
export function newRoom(layout: RoomLayout): RentedRoom {
  const { id, name, floor, x, y, w, h, door, fixed, parts } = layout;
  return { roomId: id, name, floor, x, y, w, h, ...(parts && { parts: parts.map((p) => ({ ...p })) }), door: { ...door }, ...(fixed && { fixed: true as const }), type: fixed ?? null, furniture: [], cleanliness: 100, issue: null };
}

/**
 * A room the player has: one they rent, or one that comes with the building.
 * The reception is always there; it only gets an entry of its own in the
 * state once something is placed in it.
 */
export function findRoom(state: GameState, roomId: string): RentedRoom | undefined {
  return state.rooms.find((r) => r.roomId === roomId) ?? (roomId === RECEPTION.id ? newRoom(RECEPTION) : undefined);
}

/** A room of the game as a place on the floor plan. */
export function layoutOf(room: RentedRoom): RoomLayout {
  const { roomId, name, floor, x, y, w, h, door, fixed, type, parts } = room;
  return { id: roomId, name, floor, x, y, w, h, ...(parts && { parts }), door, ...(fixed && type && { fixed: type }) };
}

/** The order of the building: floor by floor, each floor row by row from the north and left to right; what comes with the building last. */
export function inOrder<T extends RoomShape & { fixed?: unknown }>(rooms: readonly T[]): T[] {
  return [...rooms].sort((a, b) => Number(Boolean(a.fixed)) - Number(Boolean(b.fixed)) || a.floor - b.floor || a.y - b.y || a.x - b.x);
}

/**
 * Everything on the floor plan, in the order of the building: the rooms the
 * player has built, where they are, and the reception. The rest of every
 * floor is corridor.
 */
export function floorPlan(state: GameState): RoomLayout[] {
  const hall = state.rooms.some((r) => r.roomId === RECEPTION.id) ? [] : [RECEPTION];
  return inOrder([...state.rooms.map(layoutOf), ...hall]);
}

/** A room on the floor plan by its id. */
export const roomLayout = (state: GameState, id: string): RoomLayout | undefined => floorPlan(state).find((r) => r.id === id);

/** What a room is called. */
export const roomName = (state: GameState, id: string): string => roomLayout(state, id)?.name ?? 'a room that is gone';

/** Every room the player has, with the rooms that come with the building, in the order of the building. */
export function allRooms(state: GameState): RentedRoom[] {
  return floorPlan(state).flatMap((layout) => findRoom(state, layout.id) ?? []);
}

/** Whether two rooms are next door to each other: on the same floor, with a stretch of wall in common. */
export function sharesWall(a: RoomShape, b: RoomShape): boolean {
  return sharedWall(a, b) > 0;
}

/** How many tiles long the wall is that two rooms have in common: part by part, 0 if they are not next door. */
export function sharedWall(a: RoomShape, b: RoomShape): number {
  if (a.floor !== b.floor) return 0;
  const overlap = (from1: number, size1: number, from2: number, size2: number) => Math.max(0, Math.min(from1 + size1, from2 + size2) - Math.max(from1, from2));
  let length = 0;
  for (const p of partsOf(a)) {
    for (const q of partsOf(b)) {
      if (p.x + p.w === q.x || q.x + q.w === p.x) length += overlap(p.y, p.h, q.y, q.h);
      if (p.y + p.h === q.y || q.y + q.h === p.y) length += overlap(p.x, p.w, q.x, q.w);
    }
  }
  return length;
}

/** The rooms next door to a room, in the order of the building. The hall of the building is no room next door. */
export function adjacentRooms(state: GameState, id: string): RoomLayout[] {
  const room = roomLayout(state, id);
  return room ? floorPlan(state).filter((r) => r.id !== id && !r.fixed && sharesWall(r, room)) : [];
}

/** The tiles a piece of furniture covers when turned: a quarter turn swaps its width and depth. */
export function footprint(type: FurnitureType, turn = 0): { w: number; h: number } {
  const { w, h } = FURNITURE[type];
  return turn % 2 === 0 ? { w, h } : { w: h, h: w };
}

type Door = RoomShape['door'];

/** The tiles a door of a room opens between: the ones just inside it and the ones just outside. A door in the middle of a tile's side has one of each; one on the line between two tiles has two. */
export function doorTiles(room: Rect & { parts?: readonly Rect[] }, door: Door): { inside: [x: number, y: number][]; outside: [x: number, y: number][] } | null {
  if (!room.parts) return doorTilesOfRect(room, door);
  // A room of parts has its door on an outer edge of one of them: the tiles outside it are not the room's own.
  for (const part of room.parts) {
    const tiles = doorTilesOfRect(part, door);
    if (tiles && tiles.outside.every(([x, y]) => !inRoom(room, x, y))) return tiles;
  }
  return null;
}

function doorTilesOfRect(room: Rect, door: Door): { inside: [x: number, y: number][]; outside: [x: number, y: number][] } | null {
  const half = DOOR_WIDTH / 2;
  const span = (at: number) => {
    const tiles: number[] = [];
    for (let t = Math.floor(at - half + 1e-9); t < at + half - 1e-9; t++) tiles.push(t);
    return tiles;
  };
  const along = (at: number, from: number, to: number) => Number.isInteger(at * 2) && at - half >= from && at + half <= to;
  if (door.z === room.y || door.z === room.y + room.h) {
    if (!along(door.x, room.x, room.x + room.w)) return null;
    const north = door.z === room.y;
    return { inside: span(door.x).map((x) => [x, north ? room.y : room.y + room.h - 1]), outside: span(door.x).map((x) => [x, north ? room.y - 1 : room.y + room.h]) };
  }
  if (door.x === room.x || door.x === room.x + room.w) {
    if (!along(door.z, room.y, room.y + room.h)) return null;
    const west = door.x === room.x;
    return { inside: span(door.z).map((y) => [west ? room.x : room.x + room.w - 1, y]), outside: span(door.z).map((y) => [west ? room.x - 1 : room.x + room.w, y]) };
  }
  return null;
}

/**
 * The tiles of a room that have to stay clear of furniture, on the floor as
 * a whole: the ones in front of its own door, the ones a door of another room
 * opens onto (a room beside the hall can have its door there), and in the
 * hall the one where people come in from the entrance.
 */
export function doorways(state: GameState, room: RentedRoom): [x: number, y: number][] {
  const own = doorTiles(room, room.door)?.inside ?? [];
  const others = state.rooms.filter((r) => r.floor === room.floor && r.roomId !== room.roomId).flatMap((r) => doorTiles(r, r.door)?.outside ?? []);
  const entrance: [number, number][] = room.roomId === RECEPTION.id ? [[room.x, FLOOR.corridorY]] : [];
  return [...own, ...others, ...entrance].filter(([x, y]) => inRoom(room, x, y));
}

/**
 * Why a piece doesn't fit at (x, y) of a room with this turn, going by the
 * room and what stands in it alone, or null if it fits. `ignoreId` leaves one
 * piece out of the check, for turning or moving it. A room that holds one desk
 * (0.16.0) takes no second one, unless `oneDesk` is false: for the migrations
 * of saves from before that rule.
 */
export function fitError(room: RentedRoom, type: FurnitureType, x: number, y: number, turn = 0, ignoreId?: Id, oneDesk = true): string | null {
  const spec = FURNITURE[type];
  const size = footprint(type, turn);
  if (!room.type) return 'Choose a room type first.';
  if (!spec.rooms.includes(room.type)) return `${spec.name} doesn't belong in this room.`;
  if (x < 0 || y < 0 || x + size.w > room.w || y + size.h > room.h) return 'It doesn’t fit there.';
  if (room.parts) {
    for (let tx = 0; tx < size.w; tx++) for (let ty = 0; ty < size.h; ty++) if (!inRoom(room, room.x + x + tx, room.y + y + ty)) return 'It doesn’t fit there.';
  }
  if (oneDesk && ONE_DESK_ROOMS[room.type] === type && room.furniture.some((f) => f.type === type && f.id !== ignoreId)) return `A ${inText(ROOM_TYPE_NAMES[room.type])} has room for one ${spec.name.toLowerCase()}: build another room for the next one.`;
  const overlaps = room.furniture.some((f) => {
    if (f.id === ignoreId) return false;
    const other = footprint(f.type, f.turn);
    return x < f.x + other.w && f.x < x + size.w && y < f.y + other.h && f.y < y + size.h;
  });
  return overlaps ? 'Something is already there.' : null;
}

/**
 * Returns why furniture can't go at (x, y) with this turn, or null if it can:
 * it has to fit, and it may not stand in front of a door.
 * `ignoreId` leaves one piece out of the check, for turning or moving it.
 */
export function placementError(state: GameState, room: RentedRoom, type: FurnitureType, x: number, y: number, turn = 0, ignoreId?: Id): string | null {
  const error = fitError(room, type, x, y, turn, ignoreId);
  if (error) return error;
  const size = footprint(type, turn);
  const covers = ([tx, ty]: [number, number]) => tx >= room.x + x && tx < room.x + x + size.w && ty >= room.y + y && ty < room.y + y + size.h;
  return doorways(state, room).some(covers) ? 'Keep the floor in front of a door clear.' : null;
}

/**
 * The first free position for this furniture, scanning row by row from the
 * wall across from the door: a room fills up from the back, and the rows by
 * the door, where less fits, are the last to be used.
 */
export function findFreeSpot(state: GameState, room: RentedRoom, type: FurnitureType): { x: number; y: number } | null {
  const clear = doorways(state, room);
  const size = footprint(type);
  const rows = [...Array(room.h).keys()];
  const columns = [...Array(room.w).keys()];
  if (room.door.z === room.y) rows.reverse();
  if (room.door.x === room.x) columns.reverse();
  for (const y of rows) {
    for (const x of columns) {
      if (fitError(room, type, x, y) !== null) continue;
      if (!clear.some(([tx, ty]) => tx >= room.x + x && tx < room.x + x + size.w && ty >= room.y + y && ty < room.y + y + size.h)) return { x, y };
    }
  }
  return null;
}

/** The rooms on a floor that a kind of furniture can stand in, in the order of the building. */
export function roomsTaking(state: GameState, floor: number, type: FurnitureType): RentedRoom[] {
  return allRooms(state).filter((r) => r.floor === floor && r.type !== null && FURNITURE[type].rooms.includes(r.type));
}

/** A desk in a control room that the studio next door uses as its own. */
export interface BorrowedDesk {
  /** The control room it stands in. */
  roomId: string;
  item: Furniture;
}

/**
 * The desk each studio uses in a control room next door, by the studio's room
 * id. A studio that needs a mixing desk or a control desk and has none of its
 * own takes one from a control room beside it; every desk serves one studio.
 * Rooms are gone through in the order of the building, so who gets which desk is fixed.
 */
export function borrowedDesks(state: GameState): Map<string, BorrowedDesk> {
  const served = new Map<string, BorrowedDesk>();
  if (!state.rooms.some((r) => r.type === 'controlRoom')) return served;
  const rooms = inOrder(state.rooms);
  for (const control of rooms) {
    if (control.type !== 'controlRoom') continue;
    const studios = rooms.filter((r) => r !== control && sharesWall(r, control));
    for (const type of REMOTE_DESKS) {
      const desks = control.furniture.filter((f) => f.type === type);
      for (const studio of studios) {
        if (desks.length === 0) break;
        const needed = studio.type ? STUDIO_REQUIREMENTS[studio.type]?.[type] : undefined;
        if (!needed || served.has(studio.roomId) || studio.furniture.some((f) => f.type === type)) continue;
        served.set(studio.roomId, { roomId: control.roomId, item: desks.shift()! });
      }
    }
  }
  return served;
}

/** Whether a rule of 0.16.0 or later still waits in a game from before it (see `GameState.grace`). */
export const inGrace = (state: Pick<GameState, 'grace' | 'day'>, rule: GraceRule) => (state.grace?.[rule] ?? -1) > state.day;

/** Whether a kind of room is a TV studio: one that has a control room of its own (0.16.0). */
export const isTvStudio = (type: RoomType | null) => type !== null && isStudioType(type) && STUDIO_REQUIREMENTS[type]?.controlDesk !== undefined;

/**
 * The control room of each TV studio, by the studio's room id (0.16.0): a
 * control room wall to wall with it that no other TV studio has. Studios go in
 * the order of the building, and each takes the control room next door that
 * has the most of what it needs (the control desk and the audio mixer), the
 * first in the order of the building if they have the same.
 */
export function tvControlRooms(state: GameState): Map<string, RentedRoom> {
  const paired = new Map<string, RentedRoom>();
  const controls = inOrder(state.rooms.filter((r) => r.type === 'controlRoom'));
  if (controls.length === 0) return paired;
  const taken = new Set<string>();
  const kitIn = (room: RentedRoom) => room.furniture.filter((f) => CONTROL_ROOM_KIT.includes(f.type)).length;
  for (const studio of inOrder(state.rooms.filter((r) => isTvStudio(r.type)))) {
    const control = controls.filter((c) => !taken.has(c.roomId) && sharesWall(c, studio)).sort((a, b) => kitIn(b) - kitIn(a))[0];
    if (!control) continue;
    paired.set(studio.roomId, control);
    taken.add(control.roomId);
  }
  return paired;
}

/** The control room of a TV studio, if it has one next door. */
export const controlRoomOf = (state: GameState, studioId: string) => tvControlRooms(state).get(studioId);

/**
 * Everything that counts as a room's equipment: its own furniture, and the
 * desk it uses next door. A TV studio's control desk and audio mixer are the
 * ones in its control room (0.16.0); those that still stand in the studio of a
 * game from before count only while that game waits for the rule.
 */
export function studioKit(state: GameState, room: RentedRoom): Furniture[] {
  if (isTvStudio(room.type)) {
    const own = inGrace(state, 'controlRooms') ? room.furniture : room.furniture.filter((f) => !CONTROL_ROOM_KIT.includes(f.type));
    const control = controlRoomOf(state, room.roomId);
    return control ? [...own, ...control.furniture.filter((f) => CONTROL_ROOM_KIT.includes(f.type))] : own;
  }
  const borrowed = borrowedDesks(state).get(room.roomId);
  return borrowed ? [...room.furniture, borrowed.item] : room.furniture;
}

/**
 * What a room needs before it can be used: its checklist, less what its own
 * equipment makes unnecessary. A radio talk studio with a mixing desk of its
 * own that seats guests needs no talk table.
 */
export function requirements(room: RentedRoom): [FurnitureType, number][] {
  const required = room.type ? STUDIO_REQUIREMENTS[room.type] : undefined;
  if (!required) return [];
  const guestDesk = room.furniture.some((f) => f.type === 'mixingDesk' && f.tier >= GUEST_DESK_TIER);
  return (Object.entries(required) as [FurnitureType, number][]).filter(([type]) => !(type === 'talkTable' && guestDesk));
}

/** How many pieces of a kit count towards a line of the checklist. */
export const countOf = (kit: readonly Furniture[], type: FurnitureType) => kit.filter((f) => f.type === type).length;

function lacking(room: RentedRoom, kit: readonly Furniture[]): [FurnitureType, number][] {
  return requirements(room)
    .map(([type, count]): [FurnitureType, number] => [type, count - countOf(kit, type)])
    .filter(([, missing]) => missing > 0);
}

/** Furniture a room still needs before it can be used, counting a desk in a control room next door. Empty for rooms without a checklist. */
export function missingFurniture(state: GameState, room: RentedRoom): [FurnitureType, number][] {
  return lacking(room, studioKit(state, room));
}

/**
 * Whether a room with a checklist (a studio, a library, a canteen) has
 * everything on it. In a game from before 0.16.0 that still waits for the
 * rule, a TV studio does without the control room of its own.
 */
export function isStudioReady(state: GameState, room: RentedRoom): boolean {
  if (room.type === null || STUDIO_REQUIREMENTS[room.type] === undefined) return false;
  const missing = missingFurniture(state, room);
  return missing.length === 0 || (isTvStudio(room.type) && inGrace(state, 'controlRooms') && missing.every(([type]) => CONTROL_ROOM_KIT.includes(type)));
}

/** The same from the room's own furniture alone: for rooms that never use a control room. */
export function isFurnished(room: RentedRoom): boolean {
  return room.type !== null && STUDIO_REQUIREMENTS[room.type] !== undefined && lacking(room, room.furniture).length === 0;
}

export function workstationCount(state: GameState): number {
  return state.rooms
    .filter((r) => r.type === 'office')
    .reduce((n, r) => n + r.furniture.filter((f) => f.type === 'workstation').length, 0);
}

/** Cleaners, technicians and maintenance staff: they work around the building and are assigned automatically. */
export const SUPPORT_ROLES: readonly Role[] = ['cleaner', 'technician', 'maintenance'];

/** Hosts work in studios and support staff around the building; everyone else needs a desk (see `deskFor`). */
export const needsDesk = (role: Role) => role !== 'host' && !SUPPORT_ROLES.includes(role);

export const isBroken = (item: Furniture) => item.condition <= 0;

/** Whether this kind of furniture wears out and needs a technician. */
export const wearsOut = (type: FurnitureType) => !FURNITURE[type].durable;

/** Channel managers and the managers of departments: they work at a manager's desk in a management office. */
export const MANAGER_ROLES: readonly Role[] = ['channelManager', 'manager'];
export const isManager = (role: Role) => MANAGER_ROLES.includes(role);

/**
 * The kinds of desk there are, each in a kind of room of its own: a manager's desk, a writer's place and an
 * editing desk (0.14.0), an audio desk, a stove and a sorting case (0.15.0), a trainer's desk (0.18.0), and the
 * workstation of everyone else.
 */
const DESKS = [
  { type: 'managerDesk', room: 'managementOffice', roles: MANAGER_ROLES },
  { type: 'writingDesk', room: 'writersRoom', roles: ['writer'] },
  { type: 'editingDesk', room: 'editingRoom', roles: ['editor'] },
  { type: 'audioDesk', room: 'audioRoom', roles: ['engineer'] },
  { type: 'schedulingDesk', room: 'musicSchedulingOffice', roles: ['scheduler'] },
  { type: 'stove', room: 'canteen', roles: ['cook'] },
  { type: 'sortingCase', room: 'postRoom', roles: ['clerk'] },
  { type: 'trainerDesk', room: 'workshop', roles: ['talentManager'] },
  { type: 'securityDesk', room: 'securityRoom', roles: ['guard'] },
  { type: 'workstation', room: 'office', roles: [] },
] as const satisfies readonly { type: FurnitureType; room: RoomType; roles: readonly Role[] }[];
type DeskKind = (typeof DESKS)[number];

const deskKindOf = (role: Role): DeskKind => DESKS.find((kind) => (kind.roles as readonly Role[]).includes(role)) ?? DESKS[DESKS.length - 1]!;

/** The piece of furniture someone of a role works at, for the roles that work at a desk. */
export const deskFor = (role: Role): FurnitureType => deskKindOf(role).type;
/** The kind of room that piece stands in. */
export const deskRoomFor = (role: Role): RoomType => deskKindOf(role).room;

export function managerDeskCount(state: GameState): number {
  return state.rooms.filter((r) => r.type === 'managementOffice').reduce((n, r) => n + r.furniture.filter((f) => f.type === 'managerDesk').length, 0);
}

/** Who gets a desk first when there aren't enough: lower numbers first. */
const DESK_PRIORITY: Partial<Record<Role, number>> = { channelManager: 0, manager: 1, production: 2 };

/** The desk an employee works at: a workstation, or for a manager a manager's desk. */
export interface Desk {
  tier: number;
  roomId: string;
  /** The piece of furniture itself. */
  itemId: Id;
}

/** Employees who have a working desk. */
export type Desks = ReadonlyMap<Id, Desk>;

/** Everyone who works at a kind of desk, in the order in which they get one when there aren't enough. Whoever is on strike stays at home (0.15.0). */
function deskWorkers(state: GameState, kind: DeskKind): Employee[] {
  return state.employees
    .filter((e) => needsDesk(e.role) && deskKindOf(e.role) === kind && !onStrike(state, e))
    .sort((a, b) => (DESK_PRIORITY[a.role] ?? 3) - (DESK_PRIORITY[b.role] ?? 3) || a.hiredOn - b.hiredOn);
}

/**
 * The desks of a kind that can be worked at, the newest first: workstations in
 * the offices, manager's desks in the management offices, and the places in a
 * room that has everything on its checklist: a writers' room with its story
 * board, a canteen that can serve lunch.
 */
function workingDesks(state: GameState, kind: DeskKind): Desk[] {
  return state.rooms
    .filter((r) => r.type === kind.room && (STUDIO_REQUIREMENTS[kind.room] === undefined || isFurnished(r)))
    .flatMap((r) => r.furniture.filter((f) => f.type === kind.type && !isBroken(f)).map((f): Desk => ({ tier: f.tier, roomId: r.roomId, itemId: f.id })))
    .sort((a, b) => b.tier - a.tier);
}

/**
 * Employees who have a desk that isn't broken. Managers work at the manager's
 * desks in the management offices, writers at their places in a writers'
 * room, everyone else who works at a desk at the workstations in the offices. Whoever was given a place of their own has
 * it, as long as it stands and works. The others take what is left: channel
 * managers before department managers, production before the rest and then
 * by hiring date, the newest desks going to them in that order.
 */
export function employeesWithDesk(state: GameState): Desks {
  const seated = (people: Employee[], places: Desk[]): [Id, Desk][] => {
    const own = new Map<Id, Desk>();
    const taken = new Set<Id>();
    for (const e of people) {
      const desk = e.desk ? places.find((d) => d.itemId === e.desk) : undefined;
      if (!desk || taken.has(desk.itemId)) continue;
      own.set(e.id, desk);
      taken.add(desk.itemId);
    }
    if (own.size === 0) return people.slice(0, places.length).map((e, i): [Id, Desk] => [e.id, places[i]!]);
    const free = places.filter((d) => !taken.has(d.itemId));
    const rest = people.filter((e) => !own.has(e.id));
    return [...own, ...rest.slice(0, free.length).map((e, i): [Id, Desk] => [e.id, free[i]!])];
  };
  return new Map(DESKS.flatMap((kind) => seated(deskWorkers(state, kind), workingDesks(state, kind))));
}

/** Who works at each desk today, by the id of the desk. */
export function deskHolders(state: GameState): Map<Id, Id> {
  return new Map([...employeesWithDesk(state)].map(([employeeId, desk]) => [desk.itemId, employeeId]));
}

/** Whether a piece of furniture is a place to work at a desk: a workstation in an office, a manager's desk in a management office, or a writer's place in a writers' room. */
export const isWorkplace = (room: RentedRoom, item: Furniture) => DESKS.some((kind) => room.type === kind.room && item.type === kind.type);

/** The workplaces of a room, in the order they were placed. */
export const workplacesIn = (room: RentedRoom): Furniture[] => room.furniture.filter((item) => isWorkplace(room, item));

/**
 * The place someone was given as their own, with the room it stands in, if it
 * still stands in a room of the right kind. The first of two people who were
 * given the same desk has it.
 */
export function ownDesk(state: GameState, employee: Employee): { room: RentedRoom; item: Furniture } | undefined {
  if (!employee.desk || !needsDesk(employee.role)) return undefined;
  for (const room of state.rooms) {
    const item = room.furniture.find((f) => f.id === employee.desk);
    if (!item) continue;
    if (!isWorkplace(room, item) || item.type !== deskFor(employee.role)) return undefined;
    return state.employees.find((e) => e.desk === item.id && needsDesk(e.role) && deskFor(e.role) === item.type) === employee ? { room, item } : undefined;
  }
  return undefined;
}

/** Who a desk was given to as their own, if anyone. */
export function ownerOf(state: GameState, itemId: Id): Employee | undefined {
  const owner = state.employees.find((e) => e.desk === itemId);
  return owner && ownDesk(state, owner) ? owner : undefined;
}
