// The file a town is kept in (0.21.0, #282, format 2 in #327): `<id>.json`. `checkMapFile` reads one and rejects a bad
// file with the reason in plain words; `toMapFile` writes one, the same text every time.
//
// Format 2 writes down everything that stands in a town, in floor tiles (the grid of the office: x east, z south, the same as
// the game's own), with up to 2 decimals. Nothing is worked out from a seed: what is in the file is what the town is.
//
// {
//   "format": 2, "id": "coaxia", "name": "Coaxia",
//   "settings": { train, traffic: { every, mix }, floors, railway: "elevated" | "ground", layout: "grid" | "roads", scale, shore },
//   "map": {
//     edge, streetWidth, roads, rail, houses, trees, lamps, hills, peaks, ground, building, stops, lot
//   }
// }
//
// - `roads`: each straight run of road, with its lanes and whether it carries traffic. A dual carriageway is one road with its lanes.
// - `ground`: painted ground, boxes of a kind. Grass is the base of every map and is only painted where it needs its own edge.
// - `building`: the office's wings, reception box, courtyard, the side its entrance faces and the block it stands on.
// - `stops.bus.via` and `walks` (0.21.0, #330): the points the bus goes via on its way to the stop, and walking paths drawn by hand. Both are left out when empty.
// - `layout`: `grid` where the roads make blocks that the ground is cut into, `roads` where they run on their own with plots of ground beside them.
//
// Older files (format 1: boxes the layout code read) are read by src/mods/oldMap.ts, which converts them. This only checks that the
// file is well-formed; whether the game can actually run on the map is another check (src/office/townCheck.ts).

/** The version of the file this game writes and reads. An older one is converted (`readMapFile`), a newer one refused. */
export const MAP_FORMAT = 2;

/** The ground every map has, in floor tiles: x and z run from `-MAP_GRID` to `MAP_GRID`. Ground that touches its edge runs on out of sight. */
export const MAP_GRID = 140;

/** A rectangle of the ground by its north-west corner and its size, in floor tiles. */
export interface MapBox {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface MapSpot {
  x: number;
  z: number;
}

/** The most points a bus can be told to go via: each one makes it set off earlier (traffic.ts, `busLead`). */
export const MAX_VIA = 8;

/** A lane of a road: where it lies across the road and which way it is driven, 1 towards larger x or z, -1 towards smaller. */
export interface MapLane {
  at: number;
  direction: 1 | -1;
}

/**
 * A straight run of road: it runs along x (east to west, at `z = at`) or along z (at `x = at`). `width` is from kerb to kerb. A road without
 * `from` and `to` runs the length of the town. `lanes` are the ones the drawing gives a direction; a road without them has a lane each way.
 * A dual carriageway is one road: its `median` is the strip between the two carriageways. `arrows`: the lanes get arrows, as on a one-way street.
 */
export interface MapRoad {
  along: 'x' | 'z';
  at: number;
  from?: number;
  to?: number;
  width: number;
  median?: number;
  lanes?: MapLane[];
  traffic: boolean;
  arrows?: true;
}

export type GroundKind = 'pavement' | 'concrete' | 'asphalt' | 'grass' | 'field' | 'sand' | 'water';
export const GROUND_KINDS: readonly GroundKind[] = ['pavement', 'concrete', 'asphalt', 'grass', 'field', 'sand', 'water'];

/** Painted ground. `edge`: a slab with a kerb round it (the blocks of a grid, a strip between two carriageways); without it the ground lies flat. */
export interface MapGround extends MapBox {
  kind: GroundKind;
  edge?: true;
  /** A block with an edge that lies beyond the grid the streets make: no cell of it, where strollers do not go. */
  outside?: true;
}

/** A model of the city kits (`city/building-a.glb`) standing on a spot, turned in quarter turns (0 faces south, 1 east, 2 north, 3 west). */
export interface MapHouse extends MapSpot {
  model: string;
  turn: number;
}

export interface MapTree extends MapSpot {
  model: string;
}

/** A piece of a foothill: a model of the Nature Kit, drawn `scale` times its size. */
export interface MapHill extends MapHouse {
  scale: number;
}

/** A peak of the range behind the town: a faceted cone, green at its foot and rock above. */
export interface MapPeak extends MapSpot {
  radius: number;
  height: number;
  sides: number;
  angle: number;
}

/** The side of the office building its entrance faces (the building has no east entrance). */
export type MapFace = 'w' | 'n' | 's';

export interface MapBuilding {
  /** The U: both wings and the spine, and the box where the entrance is. */
  wings: MapBox[];
  reception: MapBox | null;
  /** The courtyard of the U as the building has it: its parking strips and the green between them (a building of no region gets its courtyard from them). */
  courtyard: { parking: MapBox[]; green: MapBox[] };
  faces: MapFace | null;
  /** The company's own block, from kerb to kerb: where strollers do not go. */
  own: MapBox;
}

/** A place where a bus or taxi stops: the road it is on (it runs along `along`, at `at`) and how far along it. */
export interface MapStop {
  along: 'x' | 'z';
  at: number;
  pos: number;
}

/**
 * The stop of the bus: `via` are points on roads that carry traffic that the bus drives past, in this order, on its way to the stop (0.21.0, #330).
 * Left out when there are none, as on the five towns.
 */
export interface MapBusStop extends MapStop {
  via?: MapSpot[];
}

/**
 * The company's parking lot: the ground it stands on and the road it opens onto. `along` and `side` as `Layout.lot` (townLayout.ts). A lot in a
 * courtyard has its parking strips (one row of bays each), the green between them and the fountain on it; a lot that is a block has none.
 */
export interface MapLot {
  block: MapBox;
  street: number;
  along?: 'x' | 'z';
  side?: 1 | -1;
  parking: MapBox[];
  green: MapBox[];
  fountain: MapSpot | null;
}

export interface TownMap {
  /** The edge of a town laid out by its roads: vehicles come in only from roads that start on it. `null` in a grid. */
  edge: MapBox | null;
  /** How wide a street is, kerb to kerb, where the road does not say. */
  streetWidth: number;
  roads: MapRoad[];
  /** The railway: along x, at `z + d / 2`. */
  rail: MapBox | null;
  houses: MapHouse[];
  trees: MapTree[];
  lamps: MapSpot[];
  hills: MapHill[];
  peaks: MapPeak[];
  ground: MapGround[];
  building: MapBuilding;
  stops: { bus: MapBusStop; taxi: MapStop };
  lot: MapLot;
  /** Extra paths for people to walk, drawn by hand (0.21.0, #330): each runs from point to point, and people walk to its end and back. Left out when there are none. */
  walks?: MapSpot[][];
}

/** Whether the railway stands on pillars over the streets or on the ground. */
export type RailLevel = 'elevated' | 'ground';

export type Vehicle = 'car' | 'taxi' | 'van' | 'truck';

/** How the roads lie: `grid` makes blocks of ground (cells) between its streets, `roads` runs its roads on their own, with plots beside them. */
export type MapLayoutKind = 'grid' | 'roads';

export interface MapSettings {
  /** The train, front to rear: files of the Train Kit (public/models/train), without the folder and `.glb`. */
  train: string[];
  /** Seconds between two vehicles entering a lane, on average, and what comes by, as shares. */
  traffic: { every: number; mix: Record<Vehicle, number> };
  /** How many floors the office building has. */
  floors: number;
  /** Where the railway runs. */
  railway: RailLevel;
  layout: MapLayoutKind;
  /** How many times their own size the kit's buildings are drawn. */
  scale: number;
  /** Whether the town lies on a shore: the traffic turns back where the last street meets the water. */
  shore: boolean;
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
/** How large the kit's models may be drawn. */
export const SCALE = { min: 1, max: 12 } as const;

/** A model file of the kits, as the town names them (`city/building-a.glb`): a path inside public/models, nothing more. */
const MODEL_FILE = /^[a-z0-9-]+\/[A-Za-z0-9_-]+\.glb$/;
const RAIL_LEVELS: readonly string[] = ['elevated', 'ground'];
const LAYOUTS: readonly string[] = ['grid', 'roads'];
const FACES: readonly string[] = ['w', 'n', 's'];
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
/** A number with up to 2 decimals. */
const isTwo = (value: unknown): value is number => isNumber(value) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;

function object(value: unknown, where: string): Record<string, unknown> {
  return isObject(value) ? value : reject(`${where} is missing.`);
}

function list(value: unknown, where: string): unknown[] {
  return Array.isArray(value) ? value : reject(`${where} must be a list.`);
}

/** A position or a size: up to 2 decimals, and on the grid. */
function place(value: unknown, where: string): number {
  if (!isTwo(value)) return reject(`${where} must be a number with at most 2 decimals.`);
  if (Math.abs(value) > MAP_GRID * 2) return reject(`${where} is ${value}, far off the grid of ${MAP_GRID * 2} tiles.`);
  return value;
}

function spot(value: unknown, where: string): MapSpot {
  const p = object(value, where);
  return { x: place(p.x, `${where}: x`), z: place(p.z, `${where}: z`) };
}

function box(value: unknown, where: string): MapBox {
  const b = object(value, where);
  const read = { x: place(b.x, `${where}: x`), z: place(b.z, `${where}: z`), w: place(b.w, `${where}: w`), d: place(b.d, `${where}: d`) };
  if (read.w <= 0 || read.d <= 0) return reject(`${where} has no width or depth.`);
  return read;
}

const boxes = (value: unknown, where: string): MapBox[] => list(value, where).map((b, i) => box(b, `${where} ${i + 1}`));
const orNull = <T>(value: unknown, read: (v: unknown) => T): T | null => (value === null || value === undefined ? null : read(value));

function model(value: unknown, where: string): string {
  const m = object(value, where).model;
  return typeof m === 'string' && MODEL_FILE.test(m) ? m : reject(`${where} names a model the game does not know.`);
}

function turn(value: unknown, where: string): number {
  const t = object(value, where).turn;
  return isWhole(t) && t >= 0 && t <= 3 ? t : reject(`${where} must be turned 0 to 3 quarter turns.`);
}

function road(value: unknown, where: string): MapRoad {
  const r = object(value, where);
  if (r.along !== 'x' && r.along !== 'z') return reject(`${where} runs ${JSON.stringify(r.along)}, which the game does not know (x or z).`);
  const read: MapRoad = { along: r.along, at: place(r.at, `${where}: at`), width: place(r.width, `${where}: width`), traffic: r.traffic === true };
  if (read.width <= 0) return reject(`${where} has no width.`);
  if (r.traffic !== true && r.traffic !== false) return reject(`${where} must say whether it carries traffic.`);
  if (r.from !== undefined) read.from = place(r.from, `${where}: from`);
  if (r.to !== undefined) read.to = place(r.to, `${where}: to`);
  if (read.from !== undefined && read.to !== undefined && read.to <= read.from) return reject(`${where} ends before it begins.`);
  if (r.median !== undefined) read.median = place(r.median, `${where}: median`);
  if (r.lanes !== undefined) {
    read.lanes = list(r.lanes, `${where}: lanes`).map((l, i) => {
      const lane = object(l, `${where}, lane ${i + 1}`);
      if (lane.direction !== 1 && lane.direction !== -1) return reject(`${where}, lane ${i + 1} goes ${JSON.stringify(lane.direction)}, which the game does not know (1 or -1).`);
      return { at: place(lane.at, `${where}, lane ${i + 1}: at`), direction: lane.direction };
    });
  }
  if (r.arrows === true) read.arrows = true;
  return read;
}

function ground(value: unknown, where: string): MapGround {
  const g = object(value, where);
  const kind = g.kind;
  if (typeof kind !== 'string' || !GROUND_KINDS.includes(kind as GroundKind)) return reject(`${where} is ${JSON.stringify(kind)}, which the game does not know (${GROUND_KINDS.join(', ')}).`);
  return { kind: kind as GroundKind, ...box(g, where), ...(g.edge === true && { edge: true as const }), ...(g.outside === true && { outside: true as const }) };
}

function stop(value: unknown, where: string): MapStop {
  const s = object(value, where);
  if (s.along !== 'x' && s.along !== 'z') return reject(`${where} runs ${JSON.stringify(s.along)}, which the game does not know (x or z).`);
  return { along: s.along, at: place(s.at, `${where}: at`), pos: place(s.pos, `${where}: pos`) };
}

function busStop(value: unknown, where: string): MapBusStop {
  const read: MapBusStop = stop(value, where);
  const via = (value as Record<string, unknown>).via;
  if (via === undefined) return read;
  const points = list(via, `${where}: via`);
  if (points.length > MAX_VIA) return reject(`${where} goes via ${points.length} points; it takes up to ${MAX_VIA}.`);
  if (points.length > 0) read.via = points.map((p, i) => spot(p, `${where}, via ${i + 1}`));
  return read;
}

function walks(value: unknown): MapSpot[][] {
  return list(value, 'The walking paths').map((path, i) => {
    const points = list(path, `Walking path ${i + 1}`).map((p, k) => spot(p, `Walking path ${i + 1}, point ${k + 1}`));
    return points.length >= 2 ? points : reject(`Walking path ${i + 1} needs at least 2 points.`);
  });
}

function readBuilding(value: unknown): MapBuilding {
  const b = object(value, 'The building');
  const courtyard = object(b.courtyard, 'The courtyard');
  const faces = b.faces ?? null;
  if (faces !== null && (typeof faces !== 'string' || !FACES.includes(faces))) return reject(`The entrance faces ${JSON.stringify(faces)}, which the game does not know (w, n or s).`);
  return {
    wings: boxes(b.wings, 'Wing'),
    reception: orNull(b.reception, (r) => box(r, 'The reception')),
    courtyard: {
      parking: boxes(courtyard.parking, 'Courtyard parking strip'),
      green: boxes(courtyard.green, 'Courtyard green'),
    },
    faces: faces as MapFace | null,
    own: box(b.own, "The company's block"),
  };
}

function readLot(value: unknown): MapLot {
  const l = object(value, 'The lot');
  const read: MapLot = {
    block: box(l.block, 'The lot'),
    street: place(l.street, 'The lot: street'),
    parking: boxes(l.parking, 'Lot parking strip'),
    green: boxes(l.green, 'Lot green'),
    fountain: orNull(l.fountain, (p) => spot(p, 'The fountain')),
  };
  if (l.along !== undefined) {
    if (l.along !== 'x' && l.along !== 'z') return reject(`The lot opens along ${JSON.stringify(l.along)}, which the game does not know (x or z).`);
    read.along = l.along;
  }
  if (l.side !== undefined) {
    if (l.side !== 1 && l.side !== -1) return reject('The lot is on side 1 or -1 of its street.');
    read.side = l.side;
  }
  return read;
}

function readMap(value: unknown): TownMap {
  const m = object(value, 'The map');
  const stops = object(m.stops, 'The stops');
  const streetWidth = place(m.streetWidth, 'The street width');
  if (streetWidth <= 0) return reject('The street width must be more than 0.');
  const drawn = m.walks === undefined ? [] : walks(m.walks);
  return {
    edge: orNull(m.edge, (b) => box(b, 'The edge')),
    streetWidth,
    roads: list(m.roads, 'The roads').map((r, i) => road(r, `Road ${i + 1}`)),
    rail: orNull(m.rail, (b) => box(b, 'The railway')),
    houses: list(m.houses, 'The houses').map((h, i) => ({ model: model(h, `House ${i + 1}`), ...spot(h, `House ${i + 1}`), turn: turn(h, `House ${i + 1}`) })),
    trees: list(m.trees, 'The trees').map((t, i) => ({ model: model(t, `Tree ${i + 1}`), ...spot(t, `Tree ${i + 1}`) })),
    lamps: list(m.lamps, 'The lamps').map((p, i) => spot(p, `Lamp ${i + 1}`)),
    hills: list(m.hills, 'The hills').map((h, i) => {
      const scale = object(h, `Hill ${i + 1}`).scale;
      if (!isNumber(scale) || scale <= 0) return reject(`Hill ${i + 1} needs a scale: a number more than 0.`);
      return { model: model(h, `Hill ${i + 1}`), ...spot(h, `Hill ${i + 1}`), turn: turn(h, `Hill ${i + 1}`), scale };
    }),
    peaks: list(m.peaks, 'The peaks').map((p, i) => {
      const peak = object(p, `Peak ${i + 1}`);
      const { radius, height, sides, angle } = peak;
      if (!isNumber(radius) || !isNumber(height) || radius <= 0 || height <= 0) return reject(`Peak ${i + 1} needs a radius and a height more than 0.`);
      if (!isWhole(sides) || sides < 3 || sides > 12) return reject(`Peak ${i + 1} has ${JSON.stringify(sides)} sides; it takes 3 to 12.`);
      if (!isNumber(angle)) return reject(`Peak ${i + 1} needs an angle.`);
      return { ...spot(p, `Peak ${i + 1}`), radius, height, sides, angle };
    }),
    ground: list(m.ground, 'The ground').map((g, i) => ground(g, `Ground ${i + 1}`)),
    building: readBuilding(m.building),
    stops: { bus: busStop(stops.bus, 'The bus stop'), taxi: stop(stops.taxi, 'The taxi stand') },
    lot: readLot(m.lot),
    ...(drawn.length > 0 && { walks: drawn }),
  };
}

function readSettings(value: unknown): MapSettings {
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
  if (typeof s.layout !== 'string' || !LAYOUTS.includes(s.layout)) return reject(`The layout is ${JSON.stringify(s.layout)}, which the game does not know (grid or roads).`);
  if (!isNumber(s.scale) || s.scale < SCALE.min || s.scale > SCALE.max) return reject(`The scale of the models must be a number from ${SCALE.min} to ${SCALE.max}.`);
  if (typeof s.shore !== 'boolean') return reject('The settings must say whether the town lies on a shore.');
  return { train, traffic: { every: traffic.every, mix: shares }, floors: s.floors, railway: railway as RailLevel, layout: s.layout as MapLayoutKind, scale: s.scale, shore: s.shore };
}

/** Reads a map file of format 2 (already parsed) and rejects a bad one with the reason in plain words. An older file is read by `readMapFile` (src/mods/oldMap.ts). */
export function checkMapFile(raw: unknown): MapCheck {
  try {
    const f = object(raw, 'The file');
    if (!isWhole(f.format) || f.format < 1) return reject('The file has no format number.');
    if (f.format > MAP_FORMAT) return reject(`The file is format ${f.format}; this game reads up to format ${MAP_FORMAT}. Update the game to use it.`);
    if (f.format < MAP_FORMAT) return reject(`The file is format ${f.format}, an older one: it has to be converted first.`);
    if (typeof f.id !== 'string' || !MAP_ID.test(f.id)) return reject('The id must be lower-case letters, digits and dashes, up to 64 long.');
    if (typeof f.name !== 'string' || f.name.trim() === '' || f.name.length > 60) return reject('The map needs a name of up to 60 letters.');
    return { ok: true, file: { format: f.format, id: f.id, name: f.name, settings: readSettings(f.settings), map: readMap(f.map) } };
  } catch (error) {
    if (error instanceof Reject) return { ok: false, reason: error.message };
    throw error;
  }
}

// ---- The text ----

/** Objects of plain values and lists of plain values go on one line; the rest one entry to a line. (Also the text of the older format, src/mods/oldMapFile.ts.) */
export function writeJson(v: unknown, indent: string): string {
  if (v === null) return 'null';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'boolean') return String(v);
  const next = `${indent}  `;
  const plain = (e: unknown) => e === null || typeof e !== 'object';
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    if (v.every(plain)) return `[${v.map((e) => writeJson(e, next)).join(', ')}]`;
    return `[\n${v.map((e) => `${next}${writeJson(e, next)}`).join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(v as Record<string, unknown>);
  const one = (k: string, e: unknown, at: string) => `${JSON.stringify(k)}: ${writeJson(e, at)}`;
  if (entries.every(([, e]) => plain(e))) return `{ ${entries.map(([k, e]) => one(k, e, next)).join(', ')} }`;
  return `{\n${entries.map(([k, e]) => `${next}${one(k, e, next)}`).join(',\n')}\n${indent}}`;
}

/** The text of a map file: the lists of the map one entry to a line (a road with its lanes on one), so that a change reads in a diff. */
export function toMapFile(file: MapFile): string {
  const entry = (e: unknown) => JSON.stringify(e).replace(/":/g, '": ').replace(/,"/g, ', "').replace(/\{"/g, '{ "').replace(/\}/g, ' }');
  const lines = (items: readonly unknown[], indent: string) => (items.length === 0 ? '[]' : `[\n${items.map((e) => `${indent}  ${entry(e)}`).join(',\n')}\n${indent}]`);
  const map = Object.entries(file.map).map(([key, value]) => {
    const text = Array.isArray(value) ? lines(value, '    ') : entry(value);
    return `    ${JSON.stringify(key)}: ${text}`;
  });
  return [
    '{',
    `  "format": ${file.format},`,
    `  "id": ${JSON.stringify(file.id)},`,
    `  "name": ${JSON.stringify(file.name)},`,
    `  "settings": ${entry(file.settings)},`,
    '  "map": {',
    map.join(',\n'),
    '  }',
    '}',
    '',
  ].join('\n');
}
