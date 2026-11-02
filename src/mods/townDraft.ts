// The towns the 3D map editor works on (0.21.0, #328): a draft is a `MapFile` of format 2, which may not pass the checks yet. No React here, so
// the rules are tested on their own, as with mapDraft.ts for the older format. Every change returns a new file; undo is a list of files.
// What the editor changes is the decor (houses, trees, lamps, hills, peaks and the ground that lies flat): `structureKey` is the part of the file
// that the roads, the traffic and the check depend on, so the screen knows what it can leave alone.

import { BUILDINGS, type Building } from '../config/office';
import { MAPS } from '../config/maps';
import { CITY, NATURE } from '../office/assets';
import { LAMP_HEIGHT } from '../office/clearance';
import { hidesOffice, lampHides, modelOf, TREES } from '../office/city';
import { HOUSES, INDUSTRY } from '../office/siteLooks';
import { uniqueId } from './draft';
import { MAP_GRID, type GroundKind, type MapBox, type MapFile, type MapGround, type MapHill, type MapHouse, type MapPeak, type MapSpot, type MapTree } from './mapFile';

/** What the editor puts down and moves. Ground is painted, not placed one by one; the kerbed blocks belong to the roads (#329). */
export type Kind = 'house' | 'tree' | 'lamp' | 'hill' | 'peak';
export const KINDS: readonly Kind[] = ['house', 'tree', 'lamp', 'hill', 'peak'];

/** One thing in the town: its kind and its place in that kind's list. */
export interface Ref {
  kind: Kind;
  index: number;
}

export const KIND_NAMES: Record<Kind, string> = { house: 'House', tree: 'Tree', lamp: 'Lamp', hill: 'Hill', peak: 'Peak' };

type Thing = MapHouse | MapTree | MapSpot | MapHill | MapPeak;

/** The ground a brush can paint. `base` paints no ground: it only cuts away what is painted, which gives the green back. */
export type PaintKind = Extract<GroundKind, 'grass' | 'field' | 'water' | 'sand' | 'concrete' | 'asphalt'> | 'base';
export const PAINT_KINDS: readonly PaintKind[] = ['grass', 'field', 'water', 'sand', 'concrete', 'asphalt', 'base'];
/** Ground that lies under the slab of a kerbed block: it cannot be painted where one is. Concrete and asphalt lie on top. */
const UNDER_SLABS: readonly PaintKind[] = ['grass', 'field', 'water', 'sand'];

export const round2 = (n: number): number => Math.round(n * 100) / 100;

const listOf = (map: MapFile['map'], kind: Kind): Thing[] => {
  switch (kind) {
    case 'house': return map.houses;
    case 'tree': return map.trees;
    case 'lamp': return map.lamps;
    case 'hill': return map.hills;
    case 'peak': return map.peaks;
  }
};

/** The thing a reference points at, if it is still there. */
export const thingAt = (file: MapFile, ref: Ref): Thing | undefined => listOf(file.map, ref.kind)[ref.index];

function withList(file: MapFile, kind: Kind, items: Thing[]): MapFile {
  const key = { house: 'houses', tree: 'trees', lamp: 'lamps', hill: 'hills', peak: 'peaks' }[kind];
  return { ...file, map: { ...file.map, [key]: items } as MapFile['map'] };
}

// ---- Copies ----

/** A copy of one of the game's maps to change: the same town under a new free id (`coaxia-copy`). The game's own stays as it is. */
export function copyOfMap(id: string, taken: readonly string[] = []): MapFile {
  const source = MAPS[id];
  if (!source) throw new Error(`No map called ${id}`);
  return { ...structuredClone(source), id: uniqueId(`${source.id}-copy`, taken), name: `${source.name} (copy)` };
}

/** A copy of the game's map back as the file the game keeps (src/config/maps/<id>.json): its own id and name again. */
export const forTheGame = (draft: MapFile, id: string, name: string): MapFile => ({ ...draft, id, name: draft.name === `${name} (copy)` ? name : draft.name });

// ---- What the traffic depends on ----

/**
 * The text of the part of a map that the roads, the traffic and the map check are built from: the settings, the edge, the streets, the rail, the
 * building, the stops, the lot, the ground that has a kerb (the cells of a grid), and in a town of roads the water (it decides where people walk).
 * Houses, trees, lamps, hills, peaks and flat ground are left out: while this text stays the same the layout and its roads can stay too.
 */
export function structureKey(file: MapFile): string {
  const { map, settings } = file;
  const water = settings.layout === 'roads' ? map.ground.filter((g) => g.kind === 'water') : [];
  return JSON.stringify([file.id, settings, map.edge, map.streetWidth, map.roads, map.rail, map.building, map.stops, map.lot, map.ground.filter((g) => g.edge), water]);
}

// ---- Where a thing may stand ----

const overlaps = (a: MapBox, b: MapBox) => a.x < b.x + b.w - 0.01 && a.x + a.w > b.x + 0.01 && a.z < b.z + b.d - 0.01 && a.z + a.d > b.z + 0.01;

/** The ground a thing covers as it is drawn, by its middle, and how high it stands: for the boxes that catch a click on it. A lamp post is 0.6 tiles wide. */
export function bodyOf(file: MapFile, kind: Kind, thing: Thing): MapBox & { height: number } {
  if (kind === 'lamp') return { x: thing.x - 0.3, z: thing.z - 0.3, w: 0.6, d: 0.6, height: LAMP_HEIGHT };
  if (kind === 'peak') return { ...footprintOf(file, kind, thing), height: (thing as MapPeak).height };
  const model = modelOf((thing as MapHouse).model);
  const scale = kind === 'hill' ? (thing as MapHill).scale : file.settings.scale;
  const turned = kind !== 'tree' && (thing as MapHouse).turn % 2 === 1;
  const w = ((turned ? model?.d : model?.w) ?? 1) * scale;
  const d = ((turned ? model?.w : model?.d) ?? 1) * scale;
  return { x: thing.x - w / 2, z: thing.z - d / 2, w, d, height: (model?.height ?? 1) * scale };
}

/** The ground a model covers, by its middle: a quarter turn swaps its width and depth. A tree or a lamp is a point. */
export function footprintOf(file: MapFile, kind: Kind, thing: Thing): MapBox {
  const at = { x: thing.x, z: thing.z };
  if (kind === 'lamp' || kind === 'tree') return { x: at.x - 0.05, z: at.z - 0.05, w: 0.1, d: 0.1 };
  if (kind === 'peak') {
    const r = (thing as MapPeak).radius;
    return { x: at.x - r, z: at.z - r, w: r * 2, d: r * 2 };
  }
  const model = modelOf((thing as MapHouse).model);
  const scale = kind === 'hill' ? (thing as MapHill).scale : file.settings.scale;
  const turned = (thing as MapHouse).turn % 2 === 1;
  const w = (turned ? model?.d : model?.w) ?? 1;
  const d = (turned ? model?.w : model?.d) ?? 1;
  return { x: at.x - (w * scale) / 2, z: at.z - (d * scale) / 2, w: w * scale, d: d * scale };
}

/** The box a road covers, kerb to kerb; one without ends runs the length of the town, and one with ends reaches half its width past them. */
function roadBox(road: MapFile['map']['roads'][number]): MapBox {
  const half = road.width / 2;
  const [from, to] = [road.from === undefined ? -MAP_GRID * 2 : road.from - half, road.to === undefined ? MAP_GRID * 2 : road.to + half];
  return road.along === 'x' ? { x: from, z: road.at - half, w: to - from, d: road.width } : { x: road.at - half, z: from, w: road.width, d: to - from };
}

const NAMES: Record<Kind, string> = { house: 'A house', tree: 'A tree', lamp: 'A lamp', hill: 'A hill', peak: 'A peak' };

/** Why a thing cannot stand where it is, in plain words; null if it can. On a road, the rail, the wings, the lot or water, or off the grid. */
export function placeProblem(file: MapFile, kind: Kind, thing: Thing, wings: readonly MapBox[] = file.map.building.wings): string | null {
  const box = footprintOf(file, kind, thing);
  const name = NAMES[kind];
  if (box.x < -MAP_GRID || box.z < -MAP_GRID || box.x + box.w > MAP_GRID || box.z + box.d > MAP_GRID) return `${name} cannot stand off the edge of the map.`;
  const { map } = file;
  if (map.roads.some((r) => overlaps(box, roadBox(r)))) return `${name} cannot stand on a road.`;
  if (map.rail && overlaps(box, map.rail)) return `${name} cannot stand on the railway.`;
  if (wings.some((w) => overlaps(box, w)) || (map.building.reception && overlaps(box, map.building.reception))) return `${name} cannot stand on the office.`;
  if (overlaps(box, map.lot.block)) return `${name} cannot stand on the lot.`;
  if (map.ground.some((g) => g.kind === 'water' && overlaps(box, g))) return `${name} cannot stand in water.`;
  return null;
}

// ---- Placing, moving, changing, removing ----

const grid = (n: number) => round2(Math.max(-MAP_GRID, Math.min(MAP_GRID, n)));

export const placeHouse = (file: MapFile, house: MapHouse): MapFile => withList(file, 'house', [...file.map.houses, { model: house.model, x: grid(house.x), z: grid(house.z), turn: house.turn }]);
export const placeTree = (file: MapFile, tree: MapTree): MapFile => withList(file, 'tree', [...file.map.trees, { model: tree.model, x: grid(tree.x), z: grid(tree.z) }]);
export const placeLamp = (file: MapFile, lamp: MapSpot): MapFile => withList(file, 'lamp', [...file.map.lamps, { x: grid(lamp.x), z: grid(lamp.z) }]);
export const placeHill = (file: MapFile, hill: MapHill): MapFile => withList(file, 'hill', [...file.map.hills, { model: hill.model, x: grid(hill.x), z: grid(hill.z), turn: hill.turn, scale: hill.scale }]);

/** The same thing somewhere else. */
export function moveItem(file: MapFile, ref: Ref, to: MapSpot): MapFile {
  return editItem(file, ref, { x: grid(to.x), z: grid(to.z) });
}

/** Changes some of the fields of a thing (its place, model, turn, scale). */
export function editItem(file: MapFile, ref: Ref, changes: Partial<MapHouse & MapHill & MapPeak>): MapFile {
  const items = listOf(file.map, ref.kind);
  if (!items[ref.index]) return file;
  const clean = { ...changes, ...(changes.x !== undefined && { x: grid(changes.x) }), ...(changes.z !== undefined && { z: grid(changes.z) }) };
  return withList(file, ref.kind, items.map((item, i) => (i === ref.index ? { ...item, ...clean } : item)));
}

export function dropItem(file: MapFile, ref: Ref): MapFile {
  return withList(file, ref.kind, listOf(file.map, ref.kind).filter((_, i) => i !== ref.index));
}

// ---- Ground ----

/** The parts of `from` that `cut` leaves: up to four boxes. */
export function cutBox(from: MapBox, cut: MapBox): MapBox[] {
  if (!overlaps(from, cut)) return [from];
  const out: MapBox[] = [];
  const [x0, x1, z0, z1] = [from.x, from.x + from.w, from.z, from.z + from.d];
  const [cx0, cx1, cz0, cz1] = [Math.max(x0, cut.x), Math.min(x1, cut.x + cut.w), Math.max(z0, cut.z), Math.min(z1, cut.z + cut.d)];
  const box = (x: number, z: number, w: number, d: number): MapBox => ({ x: round2(x), z: round2(z), w: round2(w), d: round2(d) });
  if (cz0 > z0) out.push(box(x0, z0, x1 - x0, cz0 - z0));
  if (cz1 < z1) out.push(box(x0, cz1, x1 - x0, z1 - cz1));
  if (cx0 > x0) out.push(box(x0, cz0, cx0 - x0, cz1 - cz0));
  if (cx1 < x1) out.push(box(cx1, cz0, x1 - cx1, cz1 - cz0));
  return out.filter((b) => b.w > 0.001 && b.d > 0.001);
}

/** A box on the grid, kept inside it, with whole sides of up to 2 decimals. */
export function gridBox(box: MapBox): MapBox {
  const x0 = Math.max(-MAP_GRID, round2(box.x));
  const z0 = Math.max(-MAP_GRID, round2(box.z));
  const x1 = Math.min(MAP_GRID, round2(box.x + box.w));
  const z1 = Math.min(MAP_GRID, round2(box.z + box.d));
  return { x: x0, z: z0, w: round2(x1 - x0), d: round2(z1 - z0) };
}

/** Why a box cannot be painted, in plain words; null if it can. */
export function paintProblem(file: MapFile, kind: PaintKind, box: MapBox): string | null {
  const b = gridBox(box);
  if (b.w <= 0 || b.d <= 0) return 'There is no ground there: it is off the edge of the map.';
  if (UNDER_SLABS.includes(kind) && file.map.ground.some((g) => g.edge && overlaps(b, g))) return 'That would lie under the slab of a block. Paint concrete or asphalt there instead; the blocks belong to the roads.';
  return null;
}

/**
 * Paints a box of ground. The ground that lies flat under it is cut away, so boxes never overlap and nothing hides anything; `base` only cuts.
 * The blocks with a kerb (`edge`) are left alone. Grass is the base of every map, so painting it only draws a box where it needs its own edge.
 */
export function paintGround(file: MapFile, kind: PaintKind, box: MapBox): MapFile {
  const b = gridBox(box);
  if (b.w <= 0 || b.d <= 0) return file;
  const kept = file.map.ground.flatMap((g): MapGround[] => {
    if (g.edge || !overlaps(g, b)) return [g];
    // (A piece that is cut off the edge of the grid no longer runs on out of sight: only what still touches it does.)
    return cutBox(g, b).map((piece) => ({ ...g, ...piece }));
  });
  const next: MapGround[] = kind === 'base' ? kept : [...kept, { kind, ...b }];
  return { ...file, map: { ...file.map, ground: next } };
}

// ---- The fill brush ----

export type Brush = 'city' | 'suburb' | 'industry' | 'trees';
export const BRUSHES: readonly { id: Brush; label: string }[] = [
  { id: 'city', label: 'City' },
  { id: 'suburb', label: 'Suburb' },
  { id: 'industry', label: 'Industry' },
  { id: 'trees', label: 'Trees' },
];

/** Houses of a brush stand wall to wall, with this gap, as the terraces of the five towns do. */
export const JOIN = 0.04;
/** Trees of a brush stand about this far apart, in tiles. */
export const TREE_SPACING = 3;

const BRUSH_MODELS: Record<Exclude<Brush, 'trees'>, readonly string[]> = {
  city: [...CITY.low, ...CITY.tall].map((m) => m.file),
  suburb: HOUSES.all.map((m) => m.file),
  industry: [...INDUSTRY.low, ...INDUSTRY.tall, ...INDUSTRY.yard].map((m) => m.file),
};

/** A small random number generator that repeats from its seed (mulberry32). */
export function randomFrom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The road nearest a point: which way it runs and which side of it the point is on. */
function nearestRoad(file: MapFile, x: number, z: number): { along: 'x' | 'z'; side: 1 | -1 } {
  let best: { along: 'x' | 'z'; side: 1 | -1 } = { along: 'x', side: 1 };
  let bestDistance = Infinity;
  for (const road of file.map.roads) {
    const box = roadBox(road);
    const dx = Math.max(box.x - x, 0, x - (box.x + box.w));
    const dz = Math.max(box.z - z, 0, z - (box.z + box.d));
    const distance = Math.hypot(dx, dz);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = road.along === 'x' ? { along: 'x', side: z < road.at ? 1 : -1 } : { along: 'z', side: x < road.at ? 1 : -1 };
    }
  }
  return best;
}

/** What a fill puts down: the things it would stand and the spots it skipped. */
export interface FillPlan {
  houses: MapHouse[];
  trees: MapTree[];
  skipped: number;
}

/**
 * The houses or trees a brush would put in a box, from one seed. Houses stand in rows wall to wall (gap `JOIN`) along the road nearest the box,
 * their fronts towards it; trees stand about `TREE_SPACING` tiles apart. A spot that is refused (`placeProblem`) is skipped.
 */
export function fillPlan(file: MapFile, box: MapBox, brush: Brush, seed: number): FillPlan {
  const area = gridBox(box);
  const out: FillPlan = { houses: [], trees: [], skipped: 0 };
  if (area.w <= 0 || area.d <= 0) return out;
  const random = randomFrom(seed);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;

  if (brush === 'trees') {
    const step = TREE_SPACING;
    for (let x = area.x + step / 2; x < area.x + area.w; x += step) {
      for (let z = area.z + step / 2; z < area.z + area.d; z += step) {
        const tree: MapTree = { model: pick(TREES).file, x: round2(x + (random() - 0.5) * 1.2), z: round2(z + (random() - 0.5) * 1.2) };
        if (placeProblem(file, 'tree', tree)) out.skipped++;
        else out.trees.push(tree);
      }
    }
    return out;
  }

  const models = BRUSH_MODELS[brush];
  const scale = file.settings.scale;
  const road = nearestRoad(file, area.x + area.w / 2, area.z + area.d / 2);
  // Rows run along the road. A house faces it: turn 0 faces south, 1 east, 2 north, 3 west (and its width then lies along the road).
  const turn = road.along === 'x' ? (road.side === 1 ? 0 : 2) : road.side === 1 ? 1 : 3;
  const run = road.along === 'x' ? { from: area.x, length: area.w } : { from: area.z, length: area.d };
  const across = road.along === 'x' ? { from: area.z, length: area.d } : { from: area.x, length: area.w };
  // The row nearest the road first, so the fronts line up along it.
  for (let rowAt = 0; rowAt < across.length - 0.5; ) {
    const row: { file: string; w: number; d: number }[] = [];
    let used = 0;
    for (;;) {
      const file1 = pick(models);
      const model = modelOf(file1)!;
      const [w, d] = [model.w * scale, model.d * scale];
      if (used + w > run.length + 1e-9) break;
      row.push({ file: file1, w, d });
      used += w + JOIN;
    }
    if (row.length === 0) break;
    const depth = Math.max(...row.map((r) => r.d));
    if (rowAt + depth > across.length + 1e-9) break;
    let along = run.from + (run.length - (used - JOIN)) / 2;
    for (const r of row) {
      // (The fronts line up on the side of the road; a row further back is behind the one in front.)
      const mid = { along: along + r.w / 2, across: road.side === 1 ? across.from + across.length - rowAt - r.d / 2 : across.from + rowAt + r.d / 2 };
      const house: MapHouse = { model: r.file, x: round2(road.along === 'x' ? mid.along : mid.across), z: round2(road.along === 'x' ? mid.across : mid.along), turn };
      if (placeProblem(file, 'house', house)) out.skipped++;
      else out.houses.push(house);
      along += r.w + JOIN;
    }
    rowAt += depth + JOIN;
  }
  return out;
}

/** Writes what a fill would put down into the file. */
export function fillBox(file: MapFile, box: MapBox, brush: Brush, seed: number): { file: MapFile; placed: number; skipped: number } {
  const plan = fillPlan(file, box, brush, seed);
  const next = { ...file, map: { ...file.map, houses: [...file.map.houses, ...plan.houses], trees: [...file.map.trees, ...plan.trees] } };
  return { file: next, placed: plan.houses.length + plan.trees.length, skipped: plan.skipped };
}

// ---- Defaults ----

/** The size a hill is drawn at to begin with: the one the hills of Amplify Hills have most often. */
export function defaultHillScale(): number {
  const counts = new Map<number, number>();
  for (const hill of MAPS['amplify-hills']?.map.hills ?? []) counts.set(hill.scale, (counts.get(hill.scale) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 1;
}

export const HILL_MODELS: readonly string[] = NATURE.foothills.map((h) => h.file);

// ---- What the office hides from the view the town is looked at from ----

/** The things the game leaves out when the town is seen from this side (a quarter turn count), because they would hide the office. They are marked in the editor. */
export function hiddenThings(file: MapFile, viewTurn: number, building: Building = BUILDINGS.standard): Ref[] {
  const { map, settings } = file;
  const out: Ref[] = [];
  map.houses.forEach((h, index) => {
    const model = modelOf(h.model);
    if (model && hidesOffice({ building: model, x: h.x, z: h.z, turn: h.turn }, viewTurn, settings.scale, building)) out.push({ kind: 'house', index });
  });
  map.trees.forEach((t, index) => {
    const model = modelOf(t.model);
    if (model && hidesOffice({ building: model, x: t.x, z: t.z, turn: 0 }, viewTurn, settings.scale, building)) out.push({ kind: 'tree', index });
  });
  map.hills.forEach((h, index) => {
    const model = modelOf(h.model);
    if (model && hidesOffice({ building: model, x: h.x, z: h.z, turn: h.turn }, viewTurn, h.scale, building)) out.push({ kind: 'hill', index });
  });
  map.lamps.forEach((l, index) => {
    if (lampHides(l, viewTurn, building)) out.push({ kind: 'lamp', index });
  });
  map.peaks.forEach((p, index) => {
    if (hidesOffice({ building: { file: '', w: p.radius * 2, height: p.height, d: p.radius * 2 }, x: p.x, z: p.z, turn: 0 }, viewTurn, 1, building)) out.push({ kind: 'peak', index });
  });
  return out;
}
