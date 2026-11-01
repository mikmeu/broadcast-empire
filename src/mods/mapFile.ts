// The file a town is kept in (0.21.0, #282): `<id>.json`. `checkMapFile` reads one and rejects a bad
// file with the reason in plain words; `toMapFile` writes one, the same text every time.
//
// {
//   "format": 1,
//   "id": "coaxia",
//   "name": "Coaxia",
//   "settings": { "train": [pieces, front to rear], "traffic": { every, mix: { car, taxi, van, truck } }, "floors": 6, "busStop": { from: "drawing" } | { from: "entrance", shift } },
//   "map": { lanes, buildings, alleys, mountains, greens, parking, wings, courtyard, reception, busStop, train, water, beach }
// }
//
// The map is whole tiles, mirrored left to right, (0, 0) at the north-west corner of the U. The default
// towns are in src/config/maps (read by src/config/maps.ts). This only checks that the file is
// well-formed; whether the game can run on the map is another check (#283).

/** The version of the file this game writes and reads. A file with a newer one is refused. */
export const MAP_FORMAT = 1;

/** The way traffic goes in a lane; `both` where the drawing has no arrow on it: a two-way lane. */
export type Direction = 'north' | 'east' | 'south' | 'west' | 'both';

export interface TileBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TileLane extends TileBox {
  /** The way traffic goes. */
  dir: Direction;
}

export interface TilePoint {
  x: number;
  y: number;
}

export interface TownMap {
  lanes: TileLane[];
  buildings: TileBox[];
  alleys: TileBox[];
  /** Grey rects with the word MOUNTAINS in them (#218): a range, not an alleyway. */
  mountains: TileBox[];
  greens: TileBox[];
  parking: TileBox[];
  /** The U: both wings and the spine. */
  wings: TileBox[];
  courtyard: { parking: TileBox[]; green: TileBox[]; fountain: TilePoint | null };
  reception: TileBox | null;
  /** On the kerb of the nearest lane. */
  busStop: TilePoint | null;
  train: TileBox | null;
  /** Water (a lake, the sea, a river) and the beach beside it. */
  water: TileBox[];
  beach: TileBox[];
  /** Flat pavement painted on the ground (0.21.0, #284). Not the alleys, which are asphalt. */
  concrete: TileBox[];
  /** Trees and lamps put down by hand (#287): a map with any of one kind has none of the code’s own of that kind. */
  trees: TilePoint[];
  lamps: TilePoint[];
  /** Houses and buildings put down by hand: one model of the city kit each, where the band tool leaves the choice to the town. */
  placed: PlacedModel[];
}

/** A model of the city kit (`city/building-a.glb`, in public/models) standing on a tile, turned in quarter turns (0 faces south, 1 east, 2 north, 3 west). */
export interface PlacedModel extends TilePoint {
  model: string;
  turn: number;
}

/** Whether the railway stands on pillars over the streets or on the ground (ground-level rail comes with #288). */
export type RailLevel = 'elevated' | 'ground';

export type Vehicle = 'car' | 'taxi' | 'van' | 'truck';

/**
 * Where the bus stops. `drawing`: where the map draws it, on the kerb of the nearest street (the towns laid out as a grid).
 * `entrance`: on the street south of the lot, level with the building's entrance, `shift` tiles along that street from the
 * door's x (negative is west). A town laid out by its roads always uses `entrance`.
 * (Aerial Fields is -6.5: west of the T-junction beside the lot, as east of it the road is a dead end and buses are not sent
 * into those. The entrance of its building is 4.5 tiles west of where the long building's was; a bus is 6.4 tiles long
 * and the road 4 wide (0.20.0), so the stop is 6.5 from the entrance, to stand clear of the T-junction, which is 8 tiles
 * east of the first stop.)
 */
export type BusStopRule = { from: 'drawing' } | { from: 'entrance'; shift: number };

export interface MapSettings {
  /** The train, front to rear: files of the Train Kit (public/models/train), without the folder and `.glb`. */
  train: string[];
  /** Seconds between two vehicles entering a lane, on average, and what comes by, as shares. */
  traffic: { every: number; mix: Record<Vehicle, number> };
  /** How many floors the office building has. */
  floors: number;
  /** Where the bus stops. A file without it has the drawn stop if the map draws one, otherwise the entrance. */
  busStop: BusStopRule;
  /** Where the railway runs. A file without it is elevated, as every railway was until now. */
  railway: RailLevel;
}

export interface MapFile {
  format: number;
  id: string;
  name: string;
  settings: MapSettings;
  map: TownMap;
}

export type MapCheck = { ok: true; file: MapFile } | { ok: false; reason: string };

/** Ids become file names: the same as a mod's (src/mods/furnitureFile.ts). */
export const MAP_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** The files of public/models/train that a train can be made of (a test holds this to the folder). */
export const TRAIN_PIECES: readonly string[] = [
  'train-diesel-a',
  'train-electric-double-a',
  'train-electric-double-b',
  'train-electric-double-c',
  'train-carriage-coal',
  'train-carriage-container-blue',
  'train-carriage-container-red',
  'train-carriage-lumber',
  'train-carriage-tank',
];
export const TRAIN_LENGTH = { min: 4, max: 6 } as const;
export const FLOORS = { min: 1, max: 6 } as const;

/** A model file of the city kits, as the town names them (`city/building-a.glb`): a path inside public/models, nothing more. */
const PLACED_FILE = /^[a-z0-9-]+\/[a-z0-9-]+\.glb$/;
const RAIL_LEVELS: readonly string[] = ['elevated', 'ground'];

const DIRECTIONS: readonly string[] = ['north', 'east', 'south', 'west', 'both'];
const VEHICLES: readonly Vehicle[] = ['car', 'taxi', 'van', 'truck'];
/** Shares add up to 1 within this much (they are written with two decimals). */
const MIX_TOLERANCE = 0.001;

class Reject extends Error {}
const reject = (reason: string): never => {
  throw new Reject(reason);
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isWhole = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);

function object(value: unknown, where: string): Record<string, unknown> {
  return isObject(value) ? value : reject(`${where} is missing.`);
}

function list(value: unknown, where: string): unknown[] {
  return Array.isArray(value) ? value : reject(`${where} must be a list.`);
}

function point(value: unknown, where: string): TilePoint {
  const p = object(value, where);
  if (!isWhole(p.x) || !isWhole(p.y)) return reject(`${where} must be on whole tiles.`);
  return { x: p.x, y: p.y };
}

function box(value: unknown, where: string): TileBox {
  const b = object(value, where);
  if (!isWhole(b.x) || !isWhole(b.y) || !isWhole(b.w) || !isWhole(b.h)) return reject(`${where} must be on whole tiles.`);
  if (b.w <= 0 || b.h <= 0) return reject(`${where} has no width or height.`);
  return { x: b.x, y: b.y, w: b.w, h: b.h };
}

const boxes = (value: unknown, where: string): TileBox[] => list(value, where).map((b, i) => box(b, `${where} ${i + 1}`));
const orNull = <T>(value: unknown, read: (v: unknown) => T): T | null => (value === null || value === undefined ? null : read(value));

function lane(value: unknown, where: string): TileLane {
  const b = box(value, where);
  const dir = (value as Record<string, unknown>).dir;
  if (typeof dir !== 'string' || !DIRECTIONS.includes(dir)) return reject(`${where} goes ${JSON.stringify(dir)}, which the game does not know (north, east, south, west or both).`);
  return { ...b, dir: dir as Direction };
}

function readMap(value: unknown): TownMap {
  const m = object(value, 'The map');
  const courtyard = object(m.courtyard, 'The courtyard');
  return {
    lanes: list(m.lanes, 'The lanes').map((l, i) => lane(l, `Lane ${i + 1}`)),
    buildings: boxes(m.buildings, 'Building'),
    alleys: boxes(m.alleys, 'Alley'),
    mountains: boxes(m.mountains, 'Mountains'),
    greens: boxes(m.greens, 'Green'),
    parking: boxes(m.parking, 'Parking strip'),
    wings: boxes(m.wings, 'Wing'),
    courtyard: {
      parking: boxes(courtyard.parking, 'Courtyard parking strip'),
      green: boxes(courtyard.green, 'Courtyard green'),
      fountain: orNull(courtyard.fountain, (p) => point(p, 'The fountain')),
    },
    reception: orNull(m.reception, (b) => box(b, 'The reception')),
    busStop: orNull(m.busStop, (p) => point(p, 'The bus stop')),
    train: orNull(m.train, (b) => box(b, 'The railway')),
    water: boxes(m.water, 'Water'),
    beach: boxes(m.beach, 'Beach'),
    concrete: boxes(m.concrete ?? [], 'Concrete'),
    trees: list(m.trees ?? [], 'The trees').map((p, i) => point(p, `Tree ${i + 1}`)),
    lamps: list(m.lamps ?? [], 'The lamps').map((p, i) => point(p, `Lamp ${i + 1}`)),
    placed: list(m.placed ?? [], 'The placed models').map((p, i) => placedModel(p, `Model ${i + 1}`)),
  };
}

function placedModel(value: unknown, where: string): PlacedModel {
  const at = point(value, where);
  const { model, turn } = value as Record<string, unknown>;
  if (typeof model !== 'string' || !PLACED_FILE.test(model)) return reject(`${where} names a model the game does not know.`);
  if (!isWhole(turn) || turn < 0 || turn > 3) return reject(`${where} must be turned 0 to 3 quarter turns.`);
  return { ...at, model, turn };
}

function readBusStop(value: unknown, map: TownMap): BusStopRule {
  if (value === undefined) return map.busStop ? { from: 'drawing' } : { from: 'entrance', shift: 0 };
  const b = object(value, 'The bus stop rule');
  if (b.from === 'drawing') return { from: 'drawing' };
  if (b.from !== 'entrance') return reject(`The bus stop is put ${JSON.stringify(b.from)}, which the game does not know (drawing or entrance).`);
  if (!isNumber(b.shift)) return reject('The bus stop at the entrance needs a shift: a number of tiles.');
  return { from: 'entrance', shift: b.shift };
}

function readSettings(value: unknown, map: TownMap): MapSettings {
  const s = object(value, 'The settings');
  const train = list(s.train, 'The train').map((piece) => {
    if (typeof piece !== 'string' || !TRAIN_PIECES.includes(piece)) {
      return reject(`The train piece ${JSON.stringify(piece)} is not in the Train Kit (${TRAIN_PIECES.join(', ')}).`);
    }
    return piece;
  });
  if (train.length < TRAIN_LENGTH.min || train.length > TRAIN_LENGTH.max) {
    return reject(`The train has ${train.length} pieces; it takes ${TRAIN_LENGTH.min} to ${TRAIN_LENGTH.max}.`);
  }
  const traffic = object(s.traffic, 'The traffic');
  if (!isNumber(traffic.every) || traffic.every <= 0) return reject('The traffic needs the seconds between two vehicles, more than 0.');
  const mix = object(traffic.mix, 'The vehicle mix');
  const shares = {} as Record<Vehicle, number>;
  for (const kind of VEHICLES) {
    const share = mix[kind];
    if (!isNumber(share) || share < 0 || share > 1) return reject(`The share of ${kind}s must be a number from 0 to 1.`);
    shares[kind] = share;
  }
  const total = VEHICLES.reduce((sum, kind) => sum + shares[kind], 0);
  if (Math.abs(total - 1) > MIX_TOLERANCE) return reject(`The vehicle mix adds up to ${Math.round(total * 1000) / 1000}; it must add up to 1.`);
  if (!isWhole(s.floors) || s.floors < FLOORS.min || s.floors > FLOORS.max) return reject(`The floors must be a whole number from ${FLOORS.min} to ${FLOORS.max}.`);
  const railway = s.railway ?? 'elevated';
  if (typeof railway !== 'string' || !RAIL_LEVELS.includes(railway)) return reject(`The railway is ${JSON.stringify(railway)}, which the game does not know (elevated or ground).`);
  return { train, traffic: { every: traffic.every, mix: shares }, floors: s.floors, busStop: readBusStop(s.busStop, map), railway: railway as RailLevel };
}

/** Reads a map file (already parsed) and rejects a bad one with the reason in plain words. */
export function checkMapFile(raw: unknown): MapCheck {
  try {
    const f = object(raw, 'The file');
    if (!isWhole(f.format) || f.format < 1) return reject('The file has no format number.');
    if (f.format > MAP_FORMAT) return reject(`The file is format ${f.format}; this game reads up to format ${MAP_FORMAT}. Update the game to use it.`);
    if (typeof f.id !== 'string' || !MAP_ID.test(f.id)) return reject('The id must be lower-case letters, digits and dashes, up to 64 long.');
    if (typeof f.name !== 'string' || f.name.trim() === '' || f.name.length > 60) return reject('The map needs a name of up to 60 letters.');
    const map = readMap(f.map);
    return { ok: true, file: { format: f.format, id: f.id, name: f.name, settings: readSettings(f.settings, map), map } };
  } catch (error) {
    if (error instanceof Reject) return { ok: false, reason: error.message };
    throw error;
  }
}

// ---- The text ----

/** Objects of plain values and lists of plain values go on one line; the rest one entry to a line. */
function write(v: unknown, indent: string): string {
  if (v === null) return 'null';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  const next = `${indent}  `;
  const plain = (e: unknown) => e === null || typeof e !== 'object';
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    if (v.every(plain)) return `[${v.map((e) => write(e, next)).join(', ')}]`;
    return `[\n${v.map((e) => `${next}${write(e, next)}`).join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(v as Record<string, unknown>);
  const one = (k: string, e: unknown, at: string) => `${JSON.stringify(k)}: ${write(e, at)}`;
  if (entries.every(([, e]) => plain(e))) return `{ ${entries.map(([k, e]) => one(k, e, next)).join(', ')} }`;
  return `{\n${entries.map(([k, e]) => `${next}${one(k, e, next)}`).join(',\n')}\n${indent}}`;
}

/** The text of a map file: one box to a line, so a change reads in a diff. */
export const toMapFile = (file: MapFile): string => `${write(file, '')}\n`;
