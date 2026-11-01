// The file a piece of furniture made by a player is kept and shared in (0.21.0): `.furniture.json`.
// `checkFurnitureFile` reads one and rejects a bad file with the reason in plain words; nothing
// else in the game touches the text of a mod. `toFurnitureFile` writes one.
//
// {
//   "format": 1,
//   "id": "my-armchair",
//   "spec": { name, about, note?, cost, w, h, rooms, comfort?, durable?, boosts? },   // FurnitureSpec
//   "asset": { parts, spots?, angle? },                                              // FurnitureAsset
//   "glb": "<base64>"                                                                // its own model, if it has one
// }
//
// The model is stored apart from `piece.json` in the mods folder (so a page can load it by address)
// and is embedded in the file only when it is exported.

import { ROOM_TYPE_NAMES, type FurnitureBoost, type FurnitureSpec, type RoomType } from '../config/office';
import { BOOSTS, MODS, type BoostLimit } from '../config/balance';
import { GENRES } from '../config/genres';
import { ANIMATIONS, MODEL_IDS, TONES, type Activity, type FurnitureAsset, type Part, type Spot, type Tone } from '../office/assets';
import type { Role } from '../sim/state';

/** The version of the file this game writes and reads. A file with a newer one is refused. */
export const FURNITURE_FORMAT = 1;

/** A piece as the game holds it: the numbers, the look and, if it has one, the bytes of its own model. */
export interface ModFurniture {
  /** Without the `mod:` the game adds when it registers the piece. */
  id: string;
  spec: FurnitureSpec;
  asset: FurnitureAsset;
  glb?: Uint8Array;
}

export type FurnitureCheck = { ok: true; piece: ModFurniture } | { ok: false; reason: string };

/** Ids become folder names: the same as a save's (electron/mods.cjs). */
export const MOD_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

const ROOMS = Object.keys(ROOM_TYPE_NAMES) as RoomType[];
const ROLES: Record<Role, true> = {
  host: true, production: true, channelManager: true, sales: true, marketing: true, researcher: true, manager: true, cleaner: true, technician: true,
  maintenance: true, writer: true, editor: true, engineer: true, scheduler: true, cook: true, clerk: true, talentManager: true, guard: true,
  recruiter: true, lawyer: true, callAgent: true, journalist: true,
};
const ACTIVITIES = Object.keys(ANIMATIONS) as Activity[];
const GENRE_IDS: readonly string[] = GENRES.map((genre) => genre.id);
/** How far outside its footprint a part or a place may be, in tiles. */
const MARGIN = 1;
/** How high a part may stand, in tiles. */
const MAX_HEIGHT = 4;
/** Parts inside parts go no deeper than this. */
const MAX_DEPTH = 4;
/** Extensions of a model that the game can draw without a decoder it would have to fetch. */
const ALLOWED_EXTENSIONS = ['KHR_materials_unlit', 'KHR_materials_emissive_strength', 'KHR_texture_transform', 'KHR_mesh_quantization', 'KHR_materials_ior', 'KHR_materials_specular'];
const COMPRESSION = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu'];

class Reject extends Error {}
const reject = (reason: string): never => {
  throw new Reject(reason);
};

const count = (n: number) => n.toLocaleString('en-GB');
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isText = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;

function numbers(value: unknown, length: number, where: string): number[] {
  if (!Array.isArray(value) || value.length !== length || !value.every(isNumber)) return reject(`${where} must be ${length} numbers.`);
  return value as number[];
}

// --- The numbers ---

/** The line of `BOOSTS` that limits a boost: dirt for one type of room has a line of its own. */
export const limitOf = (boost: FurnitureBoost): BoostLimit => {
  if (boost.kind === 'dirt') return boost.roomType ? 'dirtRoom' : 'dirt';
  if (boost.kind === 'morale') return boost.reach === 'floor' ? 'moraleFloor' : 'moraleRoom';
  return boost.kind;
};

/** The lowest price of a piece with these boosts: the sum of each one's share of its `minCost`. */
export const minimumPrice = (boosts: readonly FurnitureBoost[]): number =>
  Math.ceil(boosts.reduce((sum, boost) => sum + (BOOSTS[limitOf(boost)].minCost * boost.amount) / BOOSTS[limitOf(boost)].max, 0) - 1e-9);

function checkBoost(raw: unknown, n: number): FurnitureBoost {
  const where = `Boost ${n}`;
  if (!isObject(raw)) return reject(`${where} is not an object.`);
  const kinds: FurnitureBoost['kind'][] = ['skill', 'campaignCost', 'dirt', 'meetingMorale', 'recorded', 'genreQuality', 'morale', 'wear', 'audience'];
  const kind = kinds.find((k) => k === raw.kind);
  if (!kind) return reject(`${where} has a kind the game does not know (${String(raw.kind)}).`);
  const amount = raw.amount;
  if (!isNumber(amount) || amount <= 0) return reject(`${where} needs an amount above 0.`);
  const check = (boost: FurnitureBoost): FurnitureBoost => {
    const max = BOOSTS[limitOf(boost)].max;
    if (amount > max) return reject(`${where} gives ${amount}; at most ${max} is allowed for this kind of boost.`);
    return boost;
  };
  switch (kind) {
    case 'morale': {
      if (raw.reach !== 'room' && raw.reach !== 'floor') return reject(`${where} must reach the room or the floor.`);
      return check({ kind, amount, reach: raw.reach });
    }
    case 'skill': {
      if (typeof raw.role !== 'string' || !(raw.role in ROLES)) return reject(`${where} names a role the game does not know.`);
      return check({ kind, role: raw.role as Role, amount });
    }
    case 'dirt': {
      if (raw.roomType === undefined) return check({ kind, amount });
      if (!ROOMS.includes(raw.roomType as RoomType)) return reject(`${where} names a room the game does not know.`);
      return check({ kind, amount, roomType: raw.roomType as RoomType });
    }
    case 'genreQuality': {
      const genres = raw.genres;
      if (!Array.isArray(genres) || genres.length === 0 || !genres.every((g) => typeof g === 'string' && GENRE_IDS.includes(g))) return reject(`${where} needs a list of genres the game knows.`);
      if (new Set(genres).size > BOOSTS.genreQuality.genres) return reject(`${where} names ${new Set(genres).size} genres; at most ${BOOSTS.genreQuality.genres} are allowed.`);
      return check({ kind, genres: [...new Set(genres as string[])], amount });
    }
    default:
      return check({ kind, amount } as FurnitureBoost);
  }
}

function checkSpec(raw: unknown): FurnitureSpec {
  if (!isObject(raw)) return reject('The file has no “spec” with the numbers of the piece.');
  if (!isText(raw.name, 40)) return reject('The piece needs a name of at most 40 letters.');
  if (!isText(raw.about, 500)) return reject('The piece needs a description of at most 500 letters.');
  if (raw.note !== undefined && !isText(raw.note, 100)) return reject('The note under the name may have at most 100 letters.');
  const { w, h, cost } = raw;
  const tiles = (n: unknown, side: string) => {
    if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > MODS.maxTiles) reject(`The ${side} must be a whole number of tiles from 1 to ${MODS.maxTiles}.`);
    return n as number;
  };
  const width = tiles(w, 'width');
  const height = tiles(h, 'depth');
  if (!Number.isInteger(cost) || (cost as number) < MODS.price.min || (cost as number) > MODS.price.max) return reject(`The price must be a whole number from ${count(MODS.price.min)} to ${count(MODS.price.max)}.`);
  if (!Array.isArray(raw.rooms) || raw.rooms.length === 0) return reject('The piece needs at least one room it can stand in.');
  const unknown = raw.rooms.find((room) => !ROOMS.includes(room as RoomType));
  if (unknown !== undefined) return reject(`“${String(unknown)}” is not a room the game knows.`);
  const spec: FurnitureSpec = { name: raw.name.trim(), about: raw.about.trim(), cost: cost as number, w: width, h: height, rooms: [...new Set(raw.rooms as RoomType[])] };
  if (raw.note !== undefined) spec.note = (raw.note as string).trim();
  if (raw.durable !== undefined) {
    if (typeof raw.durable !== 'boolean') return reject('“durable” is yes or no.');
    if (raw.durable) spec.durable = true;
  }
  if (raw.comfort !== undefined) {
    if (typeof raw.comfort === 'boolean') {
      if (raw.comfort) spec.comfort = true;
    } else if (isNumber(raw.comfort) && raw.comfort > 0 && raw.comfort <= 3) spec.comfort = raw.comfort;
    else return reject('Comfort is yes or no, or a number above 0 and up to 3.');
  }
  if (raw.boosts !== undefined) {
    if (!Array.isArray(raw.boosts) || raw.boosts.length > 4) return reject('A piece may have at most 4 boosts.');
    spec.boosts = raw.boosts.map((boost, i) => checkBoost(boost, i + 1));
    // Only the strongest of a kind counts in a room, so a second one would be paid for and never used.
    const seen = new Set<string>();
    for (const boost of spec.boosts) {
      const key = boost.kind === 'skill' ? `skill:${boost.role}` : limitOf(boost);
      if (seen.has(key)) return reject(`The piece has two boosts of the same kind (${key}); only one of them would count.`);
      seen.add(key);
    }
    const least = minimumPrice(spec.boosts);
    if (spec.cost < least) return reject(`With these boosts the piece costs at least €${count(least)}.`);
  }
  return spec;
}

// --- The look ---

function checkTone(value: unknown, where: string): Tone {
  if (!TONES.includes(value as Tone)) return reject(`${where} has a color the game does not know (${String(value)}).`);
  return value as Tone;
}

function checkTiers(value: unknown, where: string): [number, number] {
  const [from, to] = numbers(value, 2, `The tiers of ${where}`);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from! < 1 || to! < from!) return reject(`The tiers of ${where} are two whole numbers, the first not above the second.`);
  return [from!, to!];
}

/** `budget.parts` counts down the parts left; `bounds` is the footprint, for the parts at the top. */
function checkPart(raw: unknown, where: string, depth: number, budget: { parts: number }, bounds?: { w: number; h: number }): Part {
  if (!isObject(raw)) return reject(`${where} is not an object.`);
  if (--budget.parts < 0) return reject(`The piece has more than ${MODS.parts} parts.`);
  const [x, y, z] = numbers(raw.at, 3, `The position of ${where}`);
  if (bounds && (x! < -MARGIN || x! > bounds.w + MARGIN || z! < -MARGIN || z! > bounds.h + MARGIN || y! < -MARGIN || y! > MAX_HEIGHT)) {
    return reject(`${where} stands outside the piece (at ${x}, ${y}, ${z}); the footprint is ${bounds.w} by ${bounds.h} tiles.`);
  }
  const common: { at: [number, number, number]; turn?: number; tiers?: [number, number] } = { at: [x!, y!, z!] };
  if (raw.turn !== undefined) {
    if (!isNumber(raw.turn)) return reject(`The turn of ${where} must be a number.`);
    common.turn = raw.turn;
  }
  if (raw.tiers !== undefined) common.tiers = checkTiers(raw.tiers, where);
  const lean = (): { tilt?: number; roll?: number } => {
    const out: { tilt?: number; roll?: number } = {};
    for (const key of ['tilt', 'roll'] as const) {
      if (raw[key] === undefined) continue;
      if (!isNumber(raw[key])) return reject(`The ${key} of ${where} must be a number.`);
      out[key] = raw[key] as number;
    }
    return out;
  };
  const dimension = (value: number) => {
    if (value < 0 || value > 2 * MODS.maxTiles) reject(`${where} has a size outside 0 to ${2 * MODS.maxTiles} tiles.`);
  };
  if ('glb' in raw) return reject(`${where} names a model file. A model of your own goes in the file itself, not in a part.`);
  if (raw.model !== undefined) {
    if (!MODEL_IDS.includes(raw.model as never)) return reject(`${where} uses a model the game does not have (${String(raw.model)}).`);
    const part: Part = { ...common, model: raw.model as never };
    if (raw.size !== undefined) {
      if (!isNumber(raw.size) || raw.size <= 0 || raw.size > 4) return reject(`The size of ${where} must be above 0 and up to 4.`);
      part.size = raw.size;
    }
    if (raw.tones !== undefined) {
      if (!isObject(raw.tones) || Object.keys(raw.tones).length > 12) return reject(`The colors of ${where} must be a list of at most 12.`);
      part.tones = Object.fromEntries(Object.entries(raw.tones).map(([material, tone]) => [material.slice(0, 40), checkTone(tone, where)]));
    }
    return part;
  }
  if (raw.box !== undefined) {
    const box = numbers(raw.box, 3, `The size of ${where}`);
    box.forEach(dimension);
    return { ...common, ...lean(), box: box as [number, number, number], tone: checkTone(raw.tone, where) };
  }
  if (raw.cylinder !== undefined) {
    if (!Array.isArray(raw.cylinder) || raw.cylinder.length < 2 || raw.cylinder.length > 3 || !raw.cylinder.every(isNumber)) return reject(`The size of ${where} must be a radius, a height and perhaps a top radius.`);
    raw.cylinder.forEach(dimension);
    return { ...common, ...lean(), cylinder: raw.cylinder as [number, number, number?], tone: checkTone(raw.tone, where) };
  }
  if (raw.parts !== undefined) {
    if (!Array.isArray(raw.parts)) return reject(`The parts inside ${where} must be a list.`);
    if (depth >= MAX_DEPTH) return reject(`${where} has parts inside parts more than ${MAX_DEPTH} deep.`);
    return { ...common, ...lean(), parts: raw.parts.map((child, i) => checkPart(child, `${where}, part ${i + 1}`, depth + 1, budget)) };
  }
  return reject(`${where} is not a model, a box, a cylinder or a group of parts.`);
}

function checkSpot(raw: unknown, n: number, spec: FurnitureSpec): Spot {
  const where = `Place ${n}`;
  if (!isObject(raw)) return reject(`${where} is not an object.`);
  const [x, z] = numbers(raw.at, 2, `The position of ${where.toLowerCase()}`);
  if (x! < -MARGIN || x! > spec.w + MARGIN || z! < -MARGIN || z! > spec.h + MARGIN) return reject(`${where} is outside the piece (at ${x}, ${z}).`);
  if (!isNumber(raw.turn)) return reject(`${where} needs a turn.`);
  if (!ACTIVITIES.includes(raw.activity as Activity)) return reject(`${where} has an activity the game does not know (${String(raw.activity)}).`);
  const spot: Spot = { at: [x!, z!], turn: raw.turn, activity: raw.activity as Activity };
  if (raw.tiers !== undefined) spot.tiers = checkTiers(raw.tiers, where.toLowerCase());
  if (raw.up !== undefined) {
    if (!isNumber(raw.up) || raw.up < 0 || raw.up > MAX_HEIGHT) return reject(`${where} is raised by a number from 0 to ${MAX_HEIGHT}.`);
    spot.up = raw.up;
  }
  return spot;
}

function checkAsset(raw: unknown, spec: FurnitureSpec): FurnitureAsset {
  if (!isObject(raw)) return reject('The file has no “asset” with the look of the piece.');
  if (!Array.isArray(raw.parts)) return reject('The look needs a list of parts.');
  const budget = { parts: MODS.parts };
  const asset: FurnitureAsset = { parts: raw.parts.map((part, i) => checkPart(part, `Part ${i + 1}`, 0, budget, spec)) };
  if (raw.angle !== undefined) {
    if (!isNumber(raw.angle)) return reject('The angle must be a number.');
    asset.angle = raw.angle;
  }
  if (raw.spots !== undefined) {
    if (!Array.isArray(raw.spots)) return reject('The places for people must be a list.');
    if (raw.spots.length > MODS.spots) return reject(`The piece has ${raw.spots.length} places for people; at most ${MODS.spots} fit.`);
    asset.spots = raw.spots.map((spot, i) => checkSpot(spot, i + 1, spec));
  }
  return asset;
}

// --- The model ---

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;

/** The bytes in a base64 text, or a reason. */
function decode(text: string): Uint8Array {
  const clean = text.replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) return reject('The model is not base64 text.');
  // A third of the text is padding; the size is known before anything is made.
  if (Math.floor((clean.length * 3) / 4) > MODS.modelBytes) return reject(`The model is bigger than ${MODS.modelBytes / 1_000_000} MB.`);
  const binary = atob(clean);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

type Json = Record<string, unknown>;
/** The objects in a list of the glTF; whatever else is in it becomes an empty one, so the positions stay. */
const list = (value: unknown): Json[] => (Array.isArray(value) ? value.map((item) => (isObject(item) ? item : {})) : []);

/** Throws a reason unless the bytes are a self-contained, plain glTF binary; returns its triangles. */
export function checkModel(bytes: Uint8Array): number {
  if (bytes.byteLength > MODS.modelBytes) return reject(`The model is ${(bytes.byteLength / 1_000_000).toFixed(1)} MB; at most ${MODS.modelBytes / 1_000_000} MB fit.`);
  if (bytes.byteLength < 20) return reject('The model is not a GLB file.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) return reject('The model is not a GLB file.');
  if (view.getUint32(4, true) !== 2) return reject('The model is not glTF version 2.');
  if (view.getUint32(8, true) !== bytes.byteLength) return reject('The model is cut short or has bytes after its end.');
  const length = view.getUint32(12, true);
  if (view.getUint32(16, true) !== JSON_CHUNK || 20 + length > bytes.byteLength) return reject('The model is damaged: its description is missing.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
  } catch {
    return reject('The model is damaged: its description cannot be read.');
  }
  if (!isObject(parsed)) return reject('The model is damaged: its description cannot be read.');
  const gltf: Json = parsed;

  // Nothing may load from outside the file.
  if ([...list(gltf.buffers), ...list(gltf.images)].some((item) => item.uri !== undefined)) {
    return reject('The model loads parts of itself from elsewhere. Everything must be inside the one GLB file.');
  }
  const used = Array.isArray(gltf.extensionsUsed) ? (gltf.extensionsUsed as unknown[]) : [];
  const required = Array.isArray(gltf.extensionsRequired) ? (gltf.extensionsRequired as unknown[]) : [];
  const compressed = [...used, ...required].find((name) => COMPRESSION.includes(name as string));
  if (compressed) return reject(`The model is compressed (${String(compressed)}); the game cannot open that. Export it without compression.`);
  const unknown = required.find((name) => !ALLOWED_EXTENSIONS.includes(name as string));
  if (unknown !== undefined) return reject(`The model needs “${String(unknown)}”, which the game cannot draw.`);

  const accessors = list(gltf.accessors);
  const accessorCount = (index: unknown): number => {
    const found = typeof index === 'number' ? accessors[index]?.count : undefined;
    return typeof found === 'number' && Number.isInteger(found) && found >= 0 ? found : reject('The model is damaged: a mesh points at data that is not there.');
  };
  const meshes = list(gltf.meshes).map((mesh) =>
    list(mesh.primitives).reduce((sum, primitive) => {
      const mode = primitive.mode ?? 4;
      // Points and lines draw no triangles; a strip or a fan makes one for every point after the second.
      if (typeof mode !== 'number' || mode < 0 || mode > 6) return reject('The model is damaged: a mesh has a mode the game does not know.');
      if (mode < 4) return sum;
      const points = accessorCount(primitive.indices ?? (isObject(primitive.attributes) ? primitive.attributes.POSITION : undefined));
      return sum + (mode === 4 ? Math.floor(points / 3) : Math.max(0, points - 2));
    }, 0),
  );
  // A mesh that several nodes use is drawn several times.
  const nodes = list(gltf.nodes);
  const meshNodes = nodes.filter((node) => typeof node.mesh === 'number');
  const triangles = meshNodes.length > 0 ? meshNodes.reduce((sum, node) => sum + (meshes[node.mesh as number] ?? 0), 0) : meshes.reduce((sum, n) => sum + n, 0);
  if (triangles === 0) return reject('The model has nothing to draw.');
  if (triangles > MODS.triangles) return reject(`The model has ${count(triangles)} triangles; at most ${count(MODS.triangles)} fit.`);
  return triangles;
}

// --- The copy in a save ---

/**
 * The copy of a piece that a save keeps (0.21.0), checked as a file is: a save is no more to be trusted. It has no
 * model: the copy, or the reason it was refused.
 */
export function checkPieceCopy(raw: unknown): { ok: true; spec: FurnitureSpec; asset: FurnitureAsset } | { ok: false; reason: string } {
  try {
    if (!isObject(raw)) return reject('The copy has no numbers or look.');
    const spec = checkSpec(raw.spec);
    return { ok: true, spec, asset: checkAsset(raw.asset, spec) };
  } catch (error) {
    if (error instanceof Reject) return { ok: false, reason: error.message };
    throw error;
  }
}

// --- The file ---

/** Reads the text of a `.furniture.json`: the piece, or the reason it was refused. */
export function checkFurnitureFile(text: string): FurnitureCheck {
  try {
    if (text.length > MODS.fileBytes) return reject(`The file is bigger than ${MODS.fileBytes / 1_000_000} MB.`);
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return reject('The file is not JSON.');
    }
    if (!isObject(raw)) return reject('The file is not a furniture file.');
    if (!isNumber(raw.format)) return reject('The file has no format number, so it is not a furniture file.');
    if (raw.format > FURNITURE_FORMAT) return reject(`The file is made with a newer version of the game (format ${raw.format}; this game reads up to ${FURNITURE_FORMAT}).`);
    if (raw.format < 1) return reject(`The file has a format number the game does not know (${raw.format}).`);
    if (typeof raw.id !== 'string' || !MOD_ID.test(raw.id)) return reject('The id must be 1 to 64 lowercase letters, digits and dashes, not starting with a dash.');
    const spec = checkSpec(raw.spec);
    const asset = checkAsset(raw.asset, spec);
    const piece: ModFurniture = { id: raw.id, spec, asset };
    if (raw.glb !== undefined) {
      if (typeof raw.glb !== 'string') return reject('The model must be base64 text.');
      const bytes = decode(raw.glb);
      checkModel(bytes);
      piece.glb = bytes;
    }
    return { ok: true, piece };
  } catch (error) {
    if (error instanceof Reject) return { ok: false, reason: error.message };
    throw error;
  }
}

function encode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** The text of the file for a piece, to export. */
export function toFurnitureFile(piece: ModFurniture): string {
  const { id, spec, asset, glb } = piece;
  const { name, about, note, cost, w, h, rooms, durable, comfort, boosts } = spec;
  const file = { format: FURNITURE_FORMAT, id, spec: { name, about, note, cost, w, h, rooms, durable, comfort, boosts }, asset: { parts: asset.parts, spots: asset.spots, angle: asset.angle }, glb: glb ? encode(glb) : undefined };
  return JSON.stringify(file, null, 2);
}
