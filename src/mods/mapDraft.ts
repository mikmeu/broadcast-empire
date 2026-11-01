// The maps the map editor works on (0.21.0, #284): a draft is a `MapFile` that may not pass the checks yet.
// No React here, so the rules are tested on their own, as with draft.ts for furniture. Every change returns a new file.

import { checkTown, type TownCheck } from '../office/townCheck';
import { byRoads } from '../office/townLayout';
import { uniqueId } from './draft';
import { MAP_ID, checkMapFile, toMapFile, type Direction, type MapFile, type MapSettings, type PlacedModel, type TileBox, type TileLane, type TilePoint, type TownMap } from './mapFile';

/** The kinds of thing on a plan: what a tool puts down, and what you can select. */
export const KINDS = [
  'lane', 'building', 'alley', 'mountains', 'green', 'concrete', 'beach', 'water', 'parking', 'wing',
  'courtyardParking', 'courtyardGreen', 'reception', 'railway', 'busStop', 'fountain', 'tree', 'lamp', 'model',
] as const;
export type Kind = (typeof KINDS)[number];

/** Boxes are drawn by dragging a rectangle; points are put down with a click. `one`: a map has at most one. */
export const SHAPE: Record<Kind, { shape: 'box' | 'point'; one?: boolean }> = {
  lane: { shape: 'box' },
  building: { shape: 'box' },
  alley: { shape: 'box' },
  mountains: { shape: 'box' },
  green: { shape: 'box' },
  concrete: { shape: 'box' },
  beach: { shape: 'box' },
  water: { shape: 'box' },
  parking: { shape: 'box' },
  wing: { shape: 'box' },
  courtyardParking: { shape: 'box' },
  courtyardGreen: { shape: 'box' },
  reception: { shape: 'box', one: true },
  railway: { shape: 'box', one: true },
  busStop: { shape: 'point', one: true },
  fountain: { shape: 'point', one: true },
  tree: { shape: 'point' },
  lamp: { shape: 'point' },
  model: { shape: 'point' },
};

export type Item = TileBox | TileLane | TilePoint | PlacedModel;
/** One thing on the plan: its kind and its place in that kind's list. */
export interface Ref {
  kind: Kind;
  index: number;
}

export type StreetKind = 'two-way' | 'one-way' | 'dual' | 'road' | 'driveway';
export type TownKind = 'grid' | 'roads';

/** The streets a town of each kind is drawn with (a grid has pairs of 2-tile lanes; a town of roads has single lanes). */
export const STREETS: Record<TownKind, readonly StreetKind[]> = { grid: ['two-way', 'one-way', 'dual'], roads: ['road', 'driveway'] };

/** The lanes of a dual carriageway are this many tiles apart (the strip between them), as in the capital. */
export const MEDIAN = 1;

const emptyMap = (): TownMap => ({
  lanes: [],
  buildings: [],
  alleys: [],
  mountains: [],
  greens: [],
  parking: [],
  wings: [],
  courtyard: { parking: [], green: [], fountain: null },
  reception: null,
  busStop: null,
  train: null,
  water: [],
  beach: [],
  concrete: [],
  trees: [],
  lamps: [],
  placed: [],
});

/** The train and traffic of a new map: the capital's, which every new map can start from. */
const STARTER: MapSettings = {
  train: ['train-electric-double-a', 'train-electric-double-b', 'train-electric-double-b', 'train-electric-double-c'],
  traffic: { every: 9, mix: { car: 0.68, taxi: 0.12, van: 0.13, truck: 0.07 } },
  floors: 6,
  busStop: { from: 'entrance', shift: 0 },
  railway: 'elevated',
};

/** A blank map: nothing on it yet, the capital's train and traffic. */
export const newMap = (taken: readonly string[] = []): MapFile => ({ format: 1, id: uniqueId('new map', taken), name: 'New map', settings: structuredClone(STARTER), map: emptyMap() });

/** A map to change: the same town under a new free id (`coaxia-copy`). The game's own map stays as it is. */
export function copyOfDefault(file: MapFile, taken: readonly string[] = []): MapFile {
  return { ...structuredClone(file), id: uniqueId(`${file.id}-copy`, taken), name: `${file.name} (copy)` };
}

/** A game map as the game keeps it: the original id and name back (the copy's " (copy)" taken off). */
export const forTheGame = (draft: MapFile, id: string, name: string): MapFile => ({ ...draft, id, name: draft.name === `${name} (copy)` ? name : draft.name });

// ---- What a kind is stored in ----

/** The list a kind is kept in, as it is now. */
export function itemsOf(map: TownMap, kind: Kind): Item[] {
  switch (kind) {
    case 'lane': return map.lanes;
    case 'building': return map.buildings;
    case 'alley': return map.alleys;
    case 'mountains': return map.mountains;
    case 'green': return map.greens;
    case 'concrete': return map.concrete;
    case 'beach': return map.beach;
    case 'water': return map.water;
    case 'parking': return map.parking;
    case 'wing': return map.wings;
    case 'courtyardParking': return map.courtyard.parking;
    case 'courtyardGreen': return map.courtyard.green;
    case 'reception': return map.reception ? [map.reception] : [];
    case 'railway': return map.train ? [map.train] : [];
    case 'busStop': return map.busStop ? [map.busStop] : [];
    case 'fountain': return map.courtyard.fountain ? [map.courtyard.fountain] : [];
    case 'tree': return map.trees;
    case 'lamp': return map.lamps;
    case 'model': return map.placed;
  }
}

/** The map with the list of a kind replaced. */
function withItems(map: TownMap, kind: Kind, items: Item[]): TownMap {
  const boxes = items as TileBox[];
  const points = items as TilePoint[];
  switch (kind) {
    case 'lane': return { ...map, lanes: items as TileLane[] };
    case 'building': return { ...map, buildings: boxes };
    case 'alley': return { ...map, alleys: boxes };
    case 'mountains': return { ...map, mountains: boxes };
    case 'green': return { ...map, greens: boxes };
    case 'concrete': return { ...map, concrete: boxes };
    case 'beach': return { ...map, beach: boxes };
    case 'water': return { ...map, water: boxes };
    case 'parking': return { ...map, parking: boxes };
    case 'wing': return { ...map, wings: boxes };
    case 'courtyardParking': return { ...map, courtyard: { ...map.courtyard, parking: boxes } };
    case 'courtyardGreen': return { ...map, courtyard: { ...map.courtyard, green: boxes } };
    case 'reception': return { ...map, reception: boxes[0] ?? null };
    case 'railway': return { ...map, train: boxes[0] ?? null };
    case 'busStop': return { ...map, busStop: points[0] ?? null };
    case 'fountain': return { ...map, courtyard: { ...map.courtyard, fountain: points[0] ?? null } };
    case 'tree': return { ...map, trees: points };
    case 'lamp': return { ...map, lamps: points };
    case 'model': return { ...map, placed: items as PlacedModel[] };
  }
}

const withMap = (file: MapFile, map: TownMap): MapFile => ({ ...file, map });

// ---- Putting things down, moving and removing them ----

/** Puts a box or a point down. A kind a map has only one of replaces the one there. */
export function put(file: MapFile, kind: Kind, item: Item): MapFile {
  const items = SHAPE[kind].one ? [item] : [...itemsOf(file.map, kind), item];
  return withMap(file, withItems(file.map, kind, items));
}

/** Changes the box or point at `ref`. */
export function edit(file: MapFile, ref: Ref, changes: Partial<TileLane & PlacedModel>): MapFile {
  const items = itemsOf(file.map, ref.kind).map((item, n) => (n === ref.index ? { ...item, ...changes } : item));
  return withMap(file, withItems(file.map, ref.kind, items));
}

/** Takes the thing at `ref` off the map. A lane takes the whole street with it (see `streetOf`). */
export function drop(file: MapFile, ref: Ref): MapFile {
  const gone = ref.kind === 'lane' ? new Set(streetOf(file.map, ref.index)) : new Set([ref.index]);
  return withMap(file, withItems(file.map, ref.kind, itemsOf(file.map, ref.kind).filter((_, n) => !gone.has(n))));
}

/** Moves the thing at `ref` by whole tiles. A lane moves the whole street. */
export function move(file: MapFile, ref: Ref, dx: number, dy: number): MapFile {
  const moved = ref.kind === 'lane' ? new Set(streetOf(file.map, ref.index)) : new Set([ref.index]);
  const items = itemsOf(file.map, ref.kind).map((item, n) => (moved.has(n) ? { ...item, x: item.x + dx, y: item.y + dy } : item));
  return withMap(file, withItems(file.map, ref.kind, items));
}

/** Gives a box a new place and size. Not below one tile either way. */
export function resize(file: MapFile, ref: Ref, box: TileBox): MapFile {
  return edit(file, ref, { x: box.x, y: box.y, w: Math.max(1, box.w), h: Math.max(1, box.h) });
}

/** The tile (x, y) a box covers at its north-west corner, for an item. */
export const boxOf = (item: Item): TileBox | null => ('w' in item ? { x: item.x, y: item.y, w: item.w, h: item.h } : null);

// ---- Streets ----

/** Lanes whose long sides lie against each other (or a median apart) over the same stretch are one street. */
export function streetOf(map: TownMap, index: number): number[] {
  const lane = map.lanes[index];
  if (!lane) return [];
  const vertical = lane.h > lane.w;
  const [along, long, across, wide] = vertical ? (['y', 'h', 'x', 'w'] as const) : (['x', 'w', 'y', 'h'] as const);
  const group = new Set([index]);
  for (let grew = true; grew; ) {
    grew = false;
    map.lanes.forEach((other, n) => {
      if (group.has(n) || other.h > other.w !== vertical || other[along] !== lane[along] || other[long] !== lane[long]) return;
      const near = [...group].some((m) => {
        const mine = map.lanes[m]!;
        return Math.abs(other[across] - (mine[across] + mine[wide])) <= MEDIAN || Math.abs(mine[across] - (other[across] + other[wide])) <= MEDIAN;
      });
      if (near) {
        group.add(n);
        grew = true;
      }
    });
  }
  return [...group].sort((a, b) => a - b);
}

/** Where a drag from one tile to another goes: along whichever axis it moved more, from the first tile to the last, both tiles included. */
export function strokeOf(from: TilePoint, to: TilePoint): { vertical: boolean; start: number; length: number; at: number; forward: boolean } {
  const vertical = Math.abs(to.y - from.y) > Math.abs(to.x - from.x);
  const [a, b, at] = vertical ? [from.y, to.y, from.x] : [from.x, to.x, from.y];
  return { vertical, start: Math.min(a, b), length: Math.abs(b - a) + 1, at, forward: b >= a };
}

/** The way a one-way street goes for a stroke: south or east for a drag that way, north or west back. */
export const directionOf = (stroke: ReturnType<typeof strokeOf>): Direction => (stroke.vertical ? (stroke.forward ? 'south' : 'north') : stroke.forward ? 'east' : 'west');

/**
 * Puts down a whole street along a stroke, as the default towns draw them. The stroke's first tile is the street's north or west edge.
 * - two-way: two lanes of 2 tiles side by side, neither with an arrow.
 * - one-way: the same two lanes, both going the way of the stroke.
 * - dual: two such pairs a tile apart, driven on the right (east and south on the larger side of the road).
 * - road: one lane of 2 tiles; driveway: one of 1 tile.
 */
export function addStreet(file: MapFile, from: TilePoint, to: TilePoint, kind: StreetKind): MapFile {
  const stroke = strokeOf(from, to);
  const lane = (across: number, wide: number, dir: Direction): TileLane =>
    stroke.vertical ? { x: stroke.at + across, y: stroke.start, w: wide, h: stroke.length, dir } : { x: stroke.start, y: stroke.at + across, w: stroke.length, h: wide, dir };
  const one = directionOf(stroke);
  let lanes: TileLane[];
  switch (kind) {
    case 'two-way': lanes = [lane(0, 2, 'both'), lane(2, 2, 'both')]; break;
    case 'one-way': lanes = [lane(0, 2, one), lane(2, 2, one)]; break;
    case 'dual': {
      // Driven on the right (townLayout.ts swaps the carriageways to this): the side with the larger y heads east, the side with the larger x heads north.
      const [low, high]: [Direction, Direction] = stroke.vertical ? ['south', 'north'] : ['west', 'east'];
      lanes = [lane(0, 2, low), lane(2, 2, low), lane(4 + MEDIAN, 2, high), lane(6 + MEDIAN, 2, high)];
      break;
    }
    case 'road': lanes = [lane(0, 2, 'both')]; break;
    case 'driveway': lanes = [lane(0, 1, 'both')]; break;
  }
  return withMap(file, { ...file.map, lanes: [...file.map.lanes, ...lanes] });
}

/** Lengthens or shortens a street, whole: its lanes begin and end at the tiles given. */
export function stretchStreet(file: MapFile, index: number, start: number, end: number): MapFile {
  const group = new Set(streetOf(file.map, index));
  const lanes = file.map.lanes.map((lane, n) => {
    if (!group.has(n)) return lane;
    return lane.h > lane.w ? { ...lane, y: start, h: Math.max(1, end - start) } : { ...lane, x: start, w: Math.max(1, end - start) };
  });
  return withMap(file, { ...file.map, lanes });
}

/** The kind of town as the game will lay it out: by its roads or as a grid. A map with no lanes yet is whatever it was started as. */
export const townKindOf = (file: MapFile, started: TownKind = 'grid'): TownKind => (file.map.lanes.length === 0 ? started : byRoads(file.map) ? 'roads' : 'grid');

// ---- Checking and writing ----

export type DraftCheck = { ok: true } | { ok: false; reason: string };

/**
 * Whether a draft would be refused as a file, then whether the game can run on the town, and the first reason either way.
 * A map that is not fit to play can still be saved, to be finished later; only the game's own export needs both to pass.
 */
export function checkFile(file: MapFile): DraftCheck {
  if (!MAP_ID.test(file.id)) return { ok: false, reason: 'The id must be 1 to 64 lowercase letters, digits and dashes, not starting with a dash.' };
  const read = checkMapFile(JSON.parse(toMapFile(file)));
  return read.ok ? { ok: true } : { ok: false, reason: read.reason };
}

export function checkDraft(file: MapFile): TownCheck {
  const read = checkFile(file);
  return read.ok ? checkTown(file) : read;
}

/** The text the map is kept in, as a file. */
export const textOf = (file: MapFile): string => toMapFile(file);
