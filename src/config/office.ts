// The office building, room types and furniture (prompt.md section 5.1).

import type { TechId, TechLine } from './tech';
import type { RegionId } from './world';

export type RoomType =
  | 'office'
  | 'managementOffice'
  | 'ceoOffice'
  | 'radioStudio'
  | 'radioTalkStudio'
  | 'tvTalkStudio'
  | 'tvGameStudio'
  | 'tvSoapStudio'
  | 'tvNewsStudio'
  | 'tvProductionStudio'
  | 'controlRoom'
  | 'library'
  | 'canteen'
  | 'toilets'
  | 'reception';

export const ROOM_TYPE_NAMES: Record<RoomType, string> = {
  office: 'Office',
  managementOffice: 'Management office',
  ceoOffice: 'CEO’s office',
  radioStudio: 'Radio studio',
  radioTalkStudio: 'Radio talk studio',
  tvTalkStudio: 'TV talk show studio',
  tvGameStudio: 'TV game show studio',
  tvSoapStudio: 'TV soap opera studio',
  tvNewsStudio: 'TV news studio',
  tvProductionStudio: 'TV production studio',
  controlRoom: 'Control room',
  library: 'Library',
  canteen: 'Canteen',
  toilets: 'Toilets',
  reception: 'Reception',
};

/** A name as it stands in the middle of a sentence: without its capital, unless it starts with an abbreviation ("a TV news studio"). */
export const inText = (name: string) => (/^(TV|CEO)/.test(name) ? name : name.charAt(0).toLowerCase() + name.slice(1));

/** What each kind of room is for, in a line: shown in the furniture catalog. The genres made there are listed with it. */
export const ROOM_TYPE_NOTES: Record<RoomType, string> = {
  office: 'Where production, sales, marketing and research work. Each of them needs a workstation.',
  managementOffice: 'Where the managers work: channel managers and the managers of departments. Each of them needs a manager’s desk here.',
  ceoOffice: 'Your own office, with your own desk. A company has one.',
  radioStudio: 'A radio studio for one presenter.',
  radioTalkStudio: 'A radio studio with a table for guests.',
  tvTalkStudio: 'A TV studio around the talk show set: a desk for the host and a sofa for the guests.',
  tvGameStudio: 'A TV studio around the game show decor: two teams and a board with the question.',
  tvSoapStudio: 'A TV studio around the soap opera decor, where the same people meet every day.',
  tvNewsStudio: 'A TV studio around a news desk, for the news and for sports.',
  tvProductionStudio: 'A large TV studio for the other shows that are staged and filmed.',
  controlRoom: 'A room beside a studio for its mixing desk or control desk. The studio next door works a little better for it.',
  library: 'Keeps the films, series and other titles you have bought, and plays them out.',
  canteen: 'Lunch and coffee for the staff, which lifts morale.',
  toilets: 'Toilets and sinks. People on the same floor go here instead of down the stairs, and are a little happier for it.',
  reception: 'The entrance hall on the ground floor. It comes with the building; it only needs a desk.',
};

export type FurnitureType =
  | 'workstation'
  | 'managerDesk'
  | 'ceoDesk'
  | 'mixingDesk'
  | 'microphone'
  | 'onAirLight'
  | 'talkTable'
  | 'camera'
  | 'studioLights'
  | 'set'
  | 'newsDesk'
  | 'controlDesk'
  | 'shelving'
  | 'canteenTable'
  | 'coffeeMachine'
  | 'planter'
  | 'tvScreen'
  | 'radio'
  | 'couch'
  | 'fridge'
  | 'counter'
  | 'soapSet'
  | 'gameShowSet'
  | 'audienceSeating'
  | 'serverRack'
  | 'sink'
  | 'toilet'
  | 'receptionDesk';

const TV_STUDIOS: readonly RoomType[] = ['tvTalkStudio', 'tvGameStudio', 'tvSoapStudio', 'tvNewsStudio', 'tvProductionStudio'];
/** The studios a show is staged in, where an audience can come and watch. */
const STAGES: readonly RoomType[] = ['tvTalkStudio', 'tvGameStudio', 'tvSoapStudio', 'tvProductionStudio'];
const EVERY_ROOM: readonly RoomType[] = ['office', 'managementOffice', 'ceoOffice', 'radioStudio', 'radioTalkStudio', 'tvTalkStudio', 'tvGameStudio', 'tvSoapStudio', 'tvNewsStudio', 'tvProductionStudio', 'controlRoom', 'library', 'canteen', 'toilets', 'reception'];

/** Licensed titles one shelving unit holds. */
export const TITLES_PER_SHELF = 20;
/** Licensed titles a server rack holds, by its tier. */
export const TITLES_PER_RACK: readonly number[] = [100, 400];
/** People who come to watch a show from one block of audience seating. */
export const AUDIENCE_PER_SEATING = 10;
/** Staff one canteen table serves. */
export const STAFF_PER_TABLE = 8;

export interface FurnitureSpec {
  name: string;
  /** Equipment that comes in tiers researched through R&D (see config/tech.ts). */
  line?: TechLine;
  /** Never wears out, so it needs no technician (see WEAR in balance.ts). */
  durable?: boolean;
  /** Shown under the name in the furniture shop. */
  note?: string;
  /** Not for sale until this technology is researched. */
  unlock?: TechId;
  /** For a piece that is not on a line: the technologies that bring its tier 2, 3 and so on, in that order. */
  versions?: readonly TechId[];
  /** No longer sold. Pieces placed in older games stay where they are and can be sold. */
  retired?: boolean;
  /** Makes a room nicer to be in: lifts morale a little (see COMFORT in balance.ts). */
  comfort?: boolean;
  /** What it is for, in a sentence: shown in the furniture catalog. */
  about: string;
  cost: number;
  /** Footprint in tiles. */
  w: number;
  h: number;
  rooms: readonly RoomType[];
}

export const FURNITURE: Record<FurnitureType, FurnitureSpec> = {
  workstation: { name: 'Workstation', about: 'One member of the office staff works here. Newer tiers get more work done.', note: 'A desk and a chair for one', line: 'office', cost: 1_500, w: 2, h: 2, rooms: ['office'] },
  managerDesk: { name: 'Manager’s desk', about: 'A large desk with a chair behind it. One manager works here; managers do not work at a workstation.', note: 'A desk and a chair for one manager', cost: 2_500, w: 2, h: 2, rooms: ['managementOffice'], durable: true },
  ceoDesk: { name: 'CEO’s desk', about: 'A wide desk of dark wood on a rug, with a tall chair behind it and two chairs for visitors in front. It is yours: you work here.', note: 'Your own desk', cost: 6_000, w: 3, h: 2, rooms: ['ceoOffice'], durable: true },
  mixingDesk: { name: 'Mixing desk', about: 'The heart of a radio studio, with the presenter’s microphone. From tier 2 it has places and microphones for two guests as well. It can also stand in a control room next door.', line: 'radio', cost: 8_000, w: 2, h: 1, rooms: ['radioStudio', 'radioTalkStudio', 'controlRoom'] },
  microphone: { name: 'Microphone', about: 'A loose microphone on a small table. Mixing desks and talk tables have their own now.', retired: true, line: 'radio', cost: 1_500, w: 1, h: 1, rooms: ['radioStudio', 'radioTalkStudio'] },
  onAirLight: { name: 'On-air light', about: 'Lights up red while a show goes out, so nobody walks in.', cost: 500, w: 1, h: 1, rooms: ['radioStudio', 'radioTalkStudio'] },
  talkTable: { name: 'Talk table', about: 'A round table with a microphone for the presenter and one for a guest. A mixing desk of tier 2 or newer in the studio makes it unnecessary.', cost: 1_000, w: 2, h: 2, rooms: ['radioTalkStudio'] },
  camera: { name: 'TV camera', about: 'Films the show. Bigger studios need more of them.', line: 'tv', cost: 12_000, w: 1, h: 1, rooms: TV_STUDIOS },
  studioLights: { name: 'Studio lights', about: 'A spotlight on a stand. Without light the cameras see nothing.', cost: 4_000, w: 1, h: 1, rooms: TV_STUDIOS },
  set: { name: 'Talk show set', about: 'A desk for the host and a sofa for the guests, in front of a city at dusk. Talk shows are made on it.', note: 'The set of a talk show studio', cost: 10_000, w: 3, h: 2, rooms: ['tvTalkStudio'] },
  newsDesk: { name: 'News desk', about: 'The desk the newsreaders sit behind.', cost: 6_000, w: 3, h: 1, rooms: ['tvNewsStudio'] },
  controlDesk: { name: 'Control desk', about: 'Where the director picks the camera that goes out. It can also stand in a control room next door.', note: 'Vision mixer and monitors', line: 'tv', cost: 15_000, w: 2, h: 1, rooms: [...TV_STUDIOS, 'controlRoom'] },
  shelving: { name: 'Shelving', about: 'Shelves for the films and series you own.', note: `Holds ${TITLES_PER_SHELF} titles`, cost: 2_000, w: 2, h: 1, rooms: ['library'], durable: true },
  canteenTable: { name: 'Canteen table', about: 'A table with four chairs. People take turns over the day.', note: `Seats ${STAFF_PER_TABLE} staff over the day`, cost: 800, w: 2, h: 2, rooms: ['canteen'], durable: true },
  coffeeMachine: { name: 'Coffee machine', about: 'A canteen needs one before anyone comes to eat there.', cost: 1_200, w: 1, h: 1, rooms: ['canteen'], durable: true },
  planter: { name: 'Planter', about: 'A plant in a pot. It does nothing but make a room nicer.', cost: 150, w: 1, h: 1, rooms: EVERY_ROOM, durable: true, comfort: true },
  tvScreen: { name: 'TV screen', about: 'A television for the canteen, tuned to your own channel, one hopes.', cost: 900, w: 1, h: 1, rooms: ['canteen'], durable: true, comfort: true },
  radio: { name: 'Radio', about: 'A radio for the canteen.', cost: 200, w: 1, h: 1, rooms: ['canteen'], durable: true, comfort: true },
  couch: { name: 'Couch', about: 'Somewhere soft to sit: in the canteen, for visitors at reception or in a manager’s room.', cost: 600, w: 2, h: 1, rooms: ['canteen', 'reception', 'managementOffice', 'ceoOffice'], durable: true, comfort: true },
  fridge: { name: 'Fridge', about: 'Keeps lunch cold. A canteen needs one.', cost: 700, w: 1, h: 1, rooms: ['canteen'], durable: true },
  counter: { name: 'Counter', about: 'A kitchen counter. A canteen needs one.', cost: 300, w: 1, h: 1, rooms: ['canteen'], durable: true },
  soapSet: { name: 'Soap opera decor', about: 'A coffee house with a big couch, where everybody meets every day. Soap operas are made on it.', note: 'The set of a soap opera studio', unlock: 'soapOperaFormat', cost: 12_000, w: 3, h: 2, rooms: ['tvSoapStudio'] },
  gameShowSet: { name: 'Game show decor', about: 'Two desks for the teams and a big board with the question. Game shows are made on it.', note: 'The set of a game show studio', unlock: 'gameShowFormat', cost: 14_000, w: 3, h: 2, rooms: ['tvGameStudio'] },
  audienceSeating: { name: 'Audience seating', about: `Rows of seats on steps. ${AUDIENCE_PER_SEATING} people come to watch while a show is on.`, cost: 3_000, w: 3, h: 2, rooms: STAGES, durable: true },
  serverRack: { name: 'Server rack', about: 'Keeps titles on disks instead of on shelves, many more in the same space.', note: `Holds ${TITLES_PER_RACK[0]} titles, ${TITLES_PER_RACK[1]} at tier 2`, unlock: 'personalComputer', versions: ['cloudProduction'], cost: 9_000, w: 2, h: 1, rooms: ['library'] },
  sink: { name: 'Sink', about: 'For washing hands. Toilets need two.', cost: 300, w: 1, h: 1, rooms: ['toilets'] },
  toilet: { name: 'Toilet', about: 'A toilet in its own stall. Toilets need two.', cost: 400, w: 1, h: 1, rooms: ['toilets'] },
  receptionDesk: { name: 'Reception desk', about: 'Where visitors report. The reception needs one.', cost: 2_500, w: 3, h: 1, rooms: ['reception'], durable: true },
};

/** The three sets: each belongs to the studio of its own show, and stands nowhere else. */
export const SET_TYPES: readonly FurnitureType[] = ['set', 'soapSet', 'gameShowSet'];

/** Minimum furniture a room needs before it can be used. */
export const STUDIO_REQUIREMENTS: Partial<Record<RoomType, Partial<Record<FurnitureType, number>>>> = {
  radioStudio: { mixingDesk: 1, onAirLight: 1 },
  radioTalkStudio: { mixingDesk: 1, talkTable: 1, onAirLight: 1 },
  tvTalkStudio: { camera: 2, studioLights: 2, set: 1, controlDesk: 1 },
  tvGameStudio: { camera: 2, studioLights: 2, gameShowSet: 1, controlDesk: 1 },
  tvSoapStudio: { camera: 3, studioLights: 3, soapSet: 1, controlDesk: 1 },
  tvNewsStudio: { camera: 2, studioLights: 2, newsDesk: 1, controlDesk: 1 },
  tvProductionStudio: { camera: 3, studioLights: 3, controlDesk: 1 },
  managementOffice: { managerDesk: 1 },
  ceoOffice: { ceoDesk: 1 },
  library: { shelving: 1 },
  canteen: { canteenTable: 1, coffeeMachine: 1, fridge: 1, counter: 1 },
  toilets: { toilet: 2, sink: 2 },
  reception: { receptionDesk: 1 },
};

/** From this tier a mixing desk seats two guests, so a radio talk studio that has one of its own needs no talk table. */
export const GUEST_DESK_TIER = 2;

/**
 * The desks a studio may have in a control room next door instead of in the
 * studio itself (see `borrowedDesks` in sim/office.ts).
 */
export const REMOTE_DESKS: readonly FurnitureType[] = ['mixingDesk', 'controlDesk'];

const STUDIO_TYPES: readonly RoomType[] = ['radioStudio', 'radioTalkStudio', ...TV_STUDIOS];

/** Rooms shows are made in. */
export function isStudioType(type: RoomType): boolean {
  return STUDIO_TYPES.includes(type);
}

/** Where a room is: its floor, its rectangle on the floor grid in tiles, and its door. */
export interface RoomShape {
  floor: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** The middle of the door, a point on one of the room's walls. */
  door: { x: number; z: number };
}

/** How wide a door is, in tiles: the gap it leaves in its wall. */
export const DOOR_WIDTH = 1;

/** A room as a place on the floor plan: one the player has, or one of the building's first plan (see `plotsOf`). */
export interface RoomLayout extends RoomShape {
  id: string;
  name: string;
  /** A room that comes with the building as this kind of room: it is not rented and can't be given up. */
  fixed?: RoomType;
}

/** Every floor is as deep as the next: two rows of rooms with a corridor (row 5) between them. */
export const FLOOR = { h: 11, corridorY: 5 };

/**
 * The block at the head of every floor, west of the rooms (x below 0). The
 * stairs and the lifts are at the front, in the two corners beside the
 * entrance, on every floor. On the ground floor the hall between them is the
 * reception, with the technicians' room and the cleaners' room behind the
 * stairs and the lifts. The floors above have only a hallway between the
 * stairs and the lifts; the rest of the block is open floor there.
 */
export const CORE = {
  /** How far the block reaches west of the rooms on the ground floor, in tiles. */
  w: 6,
  /** How deep it is on the floors above: the stairs, the lifts and the hallway between them. */
  upper: 3,
  /** The hall of the ground floor: the strip inside the entrance, then the part where furniture can stand. */
  hall: { x: -4, y: 3, w: 4, h: 5 },
  /** The corners at the front, three tiles square, on every floor. */
  stairs: { x: -6, y: 0, w: 3, h: 3 },
  lifts: { x: -6, y: 8, w: 3, h: 3 },
  /** The small rooms behind them, on the ground floor only. */
  technician: { x: -3, y: 0, w: 3, h: 3 },
  cleaners: { x: -3, y: 8, w: 3, h: 3 },
};

/** The west face of every building on the floor grid. */
export const WEST = -CORE.w;

/** The two small rooms of the ground floor, each with its door to the hall. */
export const SERVICE_ROOMS: Record<'technician' | 'cleaners', RoomShape> = {
  technician: { floor: 1, ...CORE.technician, door: { x: CORE.technician.x + 1.5, z: CORE.technician.y + CORE.technician.h } },
  cleaners: { floor: 1, ...CORE.cleaners, door: { x: CORE.cleaners.x + 1.5, z: CORE.cleaners.y } },
};

/** A stretch of wall on a floor, along x or along z: from one point to another. */
export type Wall = [x1: number, z1: number, x2: number, z2: number];

/** The four walls of a room, with a gap where its door is. */
export function wallsOf(room: Omit<RoomShape, 'floor'>): Wall[] {
  const { x, y, w, h, door } = room;
  const half = DOOR_WIDTH / 2;
  /** A wall from `from` to `to` along one axis at `at`, less the door if it is in this wall. */
  const side = (alongX: boolean, at: number, from: number, to: number): Wall[] => {
    const [across, along] = alongX ? [door.z, door.x] : [door.x, door.z];
    const pieces = across === at && along > from && along < to ? [[from, along - half], [along + half, to]] : [[from, to]];
    return pieces.filter(([a, b]) => b! > a!).map(([a, b]): Wall => (alongX ? [a!, at, b!, at] : [at, a!, at, b!]));
  };
  return [...side(true, y, x, x + w), ...side(true, y + h, x, x + w), ...side(false, x, y, y + h), ...side(false, x + w, y, y + h)];
}

/**
 * The walls inside the block at the head of a floor; the outer walls of the
 * building are not among them. The stairs and the lifts are open to the hall
 * and closed towards the rooms. On the ground floor the technicians' and the
 * cleaners' rooms stand behind them, each with a door to the hall.
 */
export function coreWalls(floor: number): Wall[] {
  const { stairs, lifts } = CORE;
  const behind: Wall[] = [
    [stairs.x + stairs.w, stairs.y, stairs.x + stairs.w, stairs.y + stairs.h],
    [lifts.x + lifts.w, lifts.y, lifts.x + lifts.w, lifts.y + lifts.h],
  ];
  if (floor > 1) return behind;
  const inner = ([x1, z1, x2, z2]: Wall) => !(z1 === z2 && (z1 === 0 || z1 === FLOOR.h)) && !(x1 === x2 && x1 === stairs.x + stairs.w);
  return [...behind, ...Object.values(SERVICE_ROOMS).flatMap(wallsOf).filter(inner)];
}

/** The reception: the one room that comes with the building. */
export const RECEPTION: RoomLayout = { id: 'reception', name: 'Reception', floor: 1, ...CORE.hall, fixed: 'reception', door: { x: 0, z: FLOOR.corridorY + 0.5 } };

// --- The buildings ---

export type BuildingId = 'standard' | 'long';

/** An office building: how many floors it has and how large they are. */
export interface Building {
  id: BuildingId;
  floors: number;
  /** How wide the part of a floor with the rooms is, in tiles: from x = 0 eastwards. */
  w: number;
  /** How many blocks of the town its own block is wide (see office/city.ts). */
  blocks: number;
  /** The rooms of its first plan on a floor, by where they are (see `plotsOf`). */
  plan: readonly { x: number; y: number; w: number; h: number }[];
}

const STANDARD_PLAN = [
  { x: 0, y: 0, w: 6, h: 5 },
  { x: 6, y: 0, w: 6, h: 5 },
  { x: 12, y: 0, w: 4, h: 5 },
  { x: 16, y: 0, w: 4, h: 5 },
  { x: 0, y: 6, w: 8, h: 5 },
  { x: 8, y: 6, w: 6, h: 5 },
  { x: 14, y: 6, w: 6, h: 5 },
];

export const BUILDINGS: Record<BuildingId, Building> = {
  // Three floors of seven rooms: in the towns, where ground is dear.
  standard: { id: 'standard', floors: 3, w: 20, blocks: 4, plan: STANDARD_PLAN },
  // Two floors of ten rooms: in the country, where there is room to build long instead of high.
  // The first seven rooms of a floor are those of the standard building; three more lie beyond them.
  long: {
    id: 'long',
    floors: 2,
    w: 28,
    blocks: 5,
    plan: [...STANDARD_PLAN, { x: 20, y: 0, w: 4, h: 5 }, { x: 24, y: 0, w: 4, h: 5 }, { x: 20, y: 6, w: 8, h: 5 }],
  },
};

/** The building a new company gets, by where its headquarters are: the long one in the two regions of the countryside. */
export const buildingFor = (headquarters: RegionId): Building => BUILDINGS[headquarters === 'heartland' || headquarters === 'highlands' ? 'long' : 'standard'];

/** The floors of a building, from the ground floor up. */
export const floorsOf = (building: Building): number[] => Array.from({ length: building.floors }, (_, n) => n + 1);

/** How wide a building is in all, with the block at its head. */
export const widthOf = (building: Building): number => CORE.w + building.w;

/**
 * The first plan of a building: the rooms it was let with before rooms could
 * be drawn, named by letter from the ground floor up. In the standard
 * building those are rooms A–G on floor 1, H–N on floor 2 and O–U on floor 3,
 * in two rows along a corridor, each with its door in the middle of its
 * corridor wall. Older games have their rooms from it, and many tests
 * are still written against it (`rentRoom` in sim/fixtures.ts).
 */
export function plotsOf(building: Building): readonly RoomLayout[] {
  const known = plots.get(building.id);
  if (known) return known;
  const made = floorsOf(building).flatMap((floor, f) =>
    building.plan.map((rect, i): RoomLayout => {
      const id = String.fromCharCode(65 + f * building.plan.length + i);
      const door = { x: rect.x + rect.w / 2, z: rect.y > FLOOR.corridorY ? rect.y : rect.y + rect.h };
      return { id, name: `Room ${id}`, floor, ...rect, door };
    }),
  );
  plots.set(building.id, made);
  return made;
}
const plots = new Map<BuildingId, readonly RoomLayout[]>();

/** A room of a building's first plan, by its letter. */
export function getPlot(id: string, building: Building = BUILDINGS.standard): RoomLayout {
  const plot = plotsOf(building).find((r) => r.id === id);
  if (!plot) throw new Error(`Unknown room ${id}`);
  return plot;
}

/** The kinds of room the player can build. */
export const RENTABLE_ROOM_TYPES: readonly RoomType[] = (Object.keys(ROOM_TYPE_NAMES) as RoomType[]).filter((t) => t !== 'reception');

/** A room is at least this many tiles each way. */
export const ROOM_MIN = 3;

/**
 * The floor of a building that rooms can be built on: everything east of the
 * block at its head. That block is half as deep on the floors above the
 * ground floor, so there is more room to build on up there.
 */
export function buildable(building: Building, floor: number): { x: number; y: number; w: number; h: number } {
  const x = floor === 1 ? 0 : WEST + CORE.upper;
  return { x, y: 0, w: building.w - x, h: FLOOR.h };
}

/** The size the game proposes for a new room of each kind, in tiles: wide enough for what the kind needs and five deep, so that two rows leave a corridor between them. */
export const ROOM_SIZES: Record<RoomType, { w: number; h: number }> = {
  office: { w: 8, h: 5 },
  managementOffice: { w: 4, h: 5 },
  ceoOffice: { w: 4, h: 5 },
  radioStudio: { w: 4, h: 5 },
  radioTalkStudio: { w: 4, h: 5 },
  tvTalkStudio: { w: 6, h: 5 },
  tvGameStudio: { w: 6, h: 5 },
  tvSoapStudio: { w: 8, h: 5 },
  tvNewsStudio: { w: 6, h: 5 },
  tvProductionStudio: { w: 8, h: 5 },
  controlRoom: { w: 3, h: 5 },
  library: { w: 4, h: 5 },
  canteen: { w: 6, h: 5 },
  toilets: { w: 3, h: 5 },
  reception: { w: CORE.hall.w, h: CORE.hall.h },
};
