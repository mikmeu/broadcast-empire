// The structure of a town in the 3D map editor (0.21.0, #329): roads, the rail, the building, the stops, the lot and the blocks of a grid. No React, like
// townDraft.ts (the decor): every change returns a new file, and undo is a list of files. A change of the structure builds the town again
// (`structureKey` in townDraft.ts is the part of the file that does), and the map check runs on the candidate while it is dragged (`applyTool`).
//
// What a change takes with it: a road that moves takes its lanes, a stop on it, the lot's street and the ends of the roads that join it. The blocks
// of a grid are written down, so a road that moves, or the rail, cuts them again (`recutBlocks`). What stands in the way of new structure
// (houses, trees, lamps, hills) is taken away; undo brings it back.

import { buildingFor, type Building } from '../config/office';
import type { RegionId } from '../config/world';
import { MAPS } from '../config/maps';
import { floorFaces } from '../office/drawnBuilding';
import { SITES } from '../office/sites';
import { bandsOf, type Band } from '../office/townLayout';
import { uniqueId } from './draft';
import { stretchProblem } from '../office/townCheck';
import { MAP_GRID, MAX_VIA, type GroundKind, type MapBox, type MapFile, type MapGround, type MapLane, type MapRoad, type MapSpot, type MapStop } from './mapFile';
import { clearOfRoads, cutBox, cutForRoad, footprintOf, gridBox, overlaps, roadBox, round2, type Kind, type Thing } from './townDraft';

const isGrid = (file: MapFile) => file.settings.layout === 'grid';
const near = (a: number, b: number) => Math.abs(a - b) < 0.011;
const sameBox = (a: MapBox, b: MapBox) => near(a.x, b.x) && near(a.z, b.z) && near(a.w, b.w) && near(a.d, b.d);
const whole = (n: number) => Math.abs(n - Math.round(n)) < 1e-6;

/** A box on whole tiles, at least one tile each way. */
export const wholeBox = (box: MapBox): MapBox => ({ x: Math.round(box.x), z: Math.round(box.z), w: Math.max(1, Math.round(box.w)), d: Math.max(1, Math.round(box.d)) });

/** The box that holds all of these. */
export function hullOf(boxes: readonly MapBox[]): MapBox {
  const x = Math.min(...boxes.map((b) => b.x));
  const z = Math.min(...boxes.map((b) => b.z));
  return { x, z, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, d: Math.max(...boxes.map((b) => b.z + b.d)) - z };
}

const inside = (inner: MapBox, outer: MapBox) => inner.x >= outer.x - 0.01 && inner.z >= outer.z - 0.01 && inner.x + inner.w <= outer.x + outer.w + 0.01 && inner.z + inner.d <= outer.z + outer.d + 0.01;

/** The file with the map changed. */
const withMap = (file: MapFile, changes: Partial<MapFile['map']>): MapFile => ({ ...file, map: { ...file.map, ...changes } });

/** The houses, trees, lamps and hills that stand in the way of new structure are taken away (peaks are far behind the town and stay). Undo brings them back. */
export function clearUnder(file: MapFile, boxes: readonly MapBox[]): MapFile {
  const clear = (kind: Kind) => (item: Thing) => !boxes.some((b) => overlaps(footprintOf(file, kind, item), b));
  const { houses, trees, lamps, hills } = file.map;
  const next = { houses: houses.filter(clear('house')), trees: trees.filter(clear('tree')), lamps: lamps.filter(clear('lamp')), hills: hills.filter(clear('hill')) };
  const same = next.houses.length === houses.length && next.trees.length === trees.length && next.lamps.length === lamps.length && next.hills.length === hills.length;
  return same ? file : withMap(file, next);
}

/** How many houses, trees, lamps and hills a file has: the difference between two files is how many an edit took away. */
export const countDecor = (file: MapFile): number => file.map.houses.length + file.map.trees.length + file.map.lamps.length + file.map.hills.length;

// ---- Roads ----

export type Flow = 'two-way' | 'one-way' | 'dual';

/** What a road is drawn with: how it is driven, whether it carries traffic and whether its lanes get arrows. */
export interface RoadSettings {
  flow: Flow;
  traffic: boolean;
  arrows: boolean;
}
export const DEFAULT_ROAD: RoadSettings = { flow: 'two-way', traffic: true, arrows: false };

/** A dual carriageway is two carriageways of 4 with a strip of 1 between them. */
export const DUAL = { width: 9, median: 1 } as const;

/** The middle line of a road of this width, put so that its kerbs lie on whole tiles. */
const kerbed = (at: number, width: number) => round2(Math.round(at - width / 2) + width / 2);

/** How wide a road is, kerb to kerb: the width of the town's streets, or the width the roads of a town of roads are drawn at. */
export function roadWidth(file: MapFile, flow: Flow): number {
  if (flow === 'dual') return DUAL.width;
  if (isGrid(file) || flow === 'one-way') return file.map.streetWidth;
  return file.map.roads.find((r) => r.lanes === undefined)?.width ?? 2;
}

/** The lanes of a road that is not two-way, as the towns have them: one-way at -1 and +1 of its middle line, dual at the four lanes of its two carriageways, driven on the right. */
function lanesOf(flow: Flow, along: 'x' | 'z', at: number, direction: 1 | -1): { median?: number; lanes?: MapLane[] } {
  if (flow === 'two-way') return {};
  if (flow === 'one-way') return { lanes: [-1, 1].map((d) => ({ at: round2(at + d), direction })) };
  // (Along x the larger z heads east; along z the larger x heads north.)
  const [low, high]: [1 | -1, 1 | -1] = along === 'x' ? [-1, 1] : [1, -1];
  return { median: DUAL.median, lanes: [-3.5, -1.5, 1.5, 3.5].map((d) => ({ at: round2(at + d), direction: d < 0 ? low : high })) };
}

/** What a road is drawn from: where, which way, its ends (a town of roads), how it is driven and the way its traffic goes (1 towards larger x or z). */
export interface RoadSpec extends RoadSettings {
  along: 'x' | 'z';
  at: number;
  from?: number;
  to?: number;
  direction: 1 | -1;
}

export function makeRoad(file: MapFile, spec: RoadSpec): MapRoad {
  // (A town of roads draws one carriageway: dual is for a grid.)
  const flow: Flow = isGrid(file) || spec.flow !== 'dual' ? spec.flow : 'two-way';
  const width = roadWidth(file, flow);
  const at = kerbed(spec.at, width);
  return {
    along: spec.along,
    at,
    width,
    traffic: spec.traffic,
    ...(!isGrid(file) && spec.from !== undefined && { from: spec.from, to: spec.to }),
    ...lanesOf(flow, spec.along, at, spec.direction),
    ...(spec.arrows && flow !== 'two-way' && { arrows: true as const }),
  };
}

/** Whether a road spans a point of its own axis (a road without ends spans all of it). */
const spans = (road: MapRoad, value: number) => road.from === undefined || road.to === undefined || (value >= road.from - 0.01 && value <= road.to + 0.01);

/** An end of a road of a town of roads: it snaps to the middle of a road it reaches within 2 tiles, else to the edge of the town within 2 tiles, else to a whole tile. */
export function snapEnd(file: MapFile, road: { along: 'x' | 'z'; at: number }, end: number, except = -1): number {
  const crossing = file.map.roads
    .filter((r, n) => n !== except && r.along !== road.along && Math.abs(r.at - end) <= 2 && spans(r, road.at))
    .sort((p, q) => Math.abs(p.at - end) - Math.abs(q.at - end))[0];
  if (crossing) return crossing.at;
  const edge = file.map.edge;
  if (edge) {
    const [low, high] = road.along === 'x' ? [edge.x, edge.x + edge.w] : [edge.z, edge.z + edge.d];
    if (Math.abs(end - low) <= 2) return low;
    if (Math.abs(end - high) <= 2) return high;
  }
  return Math.round(end);
}

/** Why a road cannot be put down, in plain words; null if it can. */
export function roadProblem(file: MapFile, road: MapRoad, except = -1): string | null {
  const box = roadBox(road);
  if (box.x < -MAP_GRID * 2 || box.z < -MAP_GRID * 2 || box.x + box.w > MAP_GRID * 2 || box.z + box.d > MAP_GRID * 2 || Math.abs(road.at) > MAP_GRID) return 'A road cannot lie off the edge of the map.';
  if (road.from !== undefined && road.to !== undefined && road.to - road.from < 2) return 'A road is at least 2 tiles long.';
  const crowded = file.map.roads.some(
    (r, n) => n !== except && r.along === road.along && Math.abs(r.at - road.at) < (r.width + road.width) / 2 - 0.01 && (isGrid(file) || (r.from! < road.to! - 0.01 && r.to! > road.from! + 0.01)),
  );
  if (crowded) return 'There is a road there already.';
  const { wings, reception } = file.map.building;
  if ([...wings, ...(reception ? [reception] : [])].some((w) => overlaps(w, box))) return 'A road cannot run through the office.';
  return null;
}

/** The cells the roads and the rail make in a grid: the boxes between two neighbouring streets each way, from kerb to kerb. */
function cellBoxes(file: MapFile): MapBox[] {
  const { roads, rail } = file.map;
  const xs = bandsOf(roads, 'z').sort((a, b) => a.from - b.from);
  const zs: Band[] = bandsOf(roads, 'x');
  if (rail) zs.push({ at: rail.z + rail.d / 2, from: rail.z, to: rail.z + rail.d });
  zs.sort((a, b) => a.from - b.from);
  const out: MapBox[] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    for (let j = 0; j + 1 < zs.length; j++) {
      const box = { x: xs[i]!.to, z: zs[j]!.to, w: round2(xs[i + 1]!.from - xs[i]!.to), d: round2(zs[j + 1]!.from - zs[j]!.to) };
      if (box.w > 0.01 && box.d > 0.01) out.push(box);
    }
  }
  return out;
}

const overlapArea = (a: MapBox, b: MapBox) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z));

/**
 * The blocks of ground a grid is cut into are written down, so a road that moves leaves them behind: cut them again from the streets before and after.
 * Blocks whose box is gone are removed; new boxes are added, each of the kind of the removed block it overlaps most (else pavement, or grass under 6
 * wide). Blocks that match no cell (`outside`) stay, and are cut where a road that is new lies over them. A change that moves no cell leaves the file as it is.
 */
export function recutBlocks(before: MapFile, after: MapFile): MapFile {
  if (!isGrid(after)) return after;
  const [was, now] = [cellBoxes(before), cellBoxes(after)];
  const gone = was.filter((c) => !now.some((d) => sameBox(c, d)));
  const fresh = now.filter((d) => !was.some((c) => sameBox(c, d)));
  if (gone.length === 0 && fresh.length === 0) return after;
  const donors: MapGround[] = [];
  let ground = after.map.ground.filter((g) => {
    if (g.edge && !g.outside && gone.some((c) => sameBox(c, g))) {
      donors.push(g);
      return false;
    }
    return true;
  });
  const added = fresh.map((d): MapGround => {
    const donor = donors.map((g) => ({ g, area: overlapArea(g, d) })).filter((p) => p.area > 0).sort((p, q) => q.area - p.area)[0]?.g;
    return { kind: donor?.kind ?? (Math.min(d.w, d.d) < 6 ? 'grass' : 'pavement'), ...d, edge: true };
  });
  const laid = after.map.roads.filter((r) => !before.map.roads.some((o) => JSON.stringify(o) === JSON.stringify(r))).map(roadBox);
  if (after.map.rail && JSON.stringify(after.map.rail) !== JSON.stringify(before.map.rail)) laid.push(after.map.rail);
  if (laid.length > 0) {
    ground = ground.flatMap((g): MapGround[] =>
      g.edge && !now.some((c) => sameBox(c, g)) ? laid.reduce<MapBox[]>((pieces, cut) => pieces.flatMap((p) => cutBox(p, cut)), [g]).map((p) => ({ ...g, ...p })) : [g],
    );
  }
  return withMap(after, { ground: [...ground, ...added] });
}

/** Puts a road down: the houses, trees, lamps and hills under it are taken away and the blocks of a grid are cut again. */
export function addRoad(file: MapFile, spec: RoadSpec): MapFile {
  const ends = !isGrid(file) && spec.from !== undefined && spec.to !== undefined;
  const road = makeRoad(file, ends ? { ...spec, from: snapEnd(file, spec, Math.min(spec.from!, spec.to!)), to: snapEnd(file, spec, Math.max(spec.from!, spec.to!)) } : spec);
  const next = withMap(file, { roads: [...file.map.roads, road] });
  return clearUnder(cutForRoad(recutBlocks(file, next), roadBox(road)), [roadBox(road)]);
}

/** Replaces a road, carrying with it what goes with it: a stop on it, the lot's street and the ends of the roads that join it. */
function replaceRoad(file: MapFile, index: number, road: MapRoad): MapFile {
  const old = file.map.roads[index];
  if (!old) return file;
  const moved = !near(old.at, road.at);
  const roads = file.map.roads.map((r, n): MapRoad => {
    if (n === index) return road;
    if (!moved || isGrid(file) || r.along === old.along) return r;
    // (The ends of a road that joined it follow it.)
    return { ...r, ...(r.from !== undefined && near(r.from, old.at) && { from: road.at }), ...(r.to !== undefined && near(r.to, old.at) && { to: road.at }) };
  });
  const follow = (along: 'x' | 'z', at: number) => (moved && along === old.along && near(at, old.at) ? road.at : at);
  const stop = (s: MapStop): MapStop => ({ ...s, at: follow(s.along, s.at) });
  // (The go-via points on it go with it: across it with the road, and along it with its ends.)
  const shift = old.from !== undefined && road.from !== undefined ? road.from - old.from : 0;
  const via = (p: MapSpot): MapSpot => {
    const [across, along] = old.along === 'x' ? [p.z, p.x] : [p.x, p.z];
    if (!near(across, old.at) || !spans(old, along)) return p;
    return old.along === 'x' ? { x: round2(p.x + shift), z: road.at } : { x: road.at, z: round2(p.z + shift) };
  };
  const bus = stop(file.map.stops.bus);
  const lot = file.map.lot;
  return withMap(file, { roads, stops: { bus: file.map.stops.bus.via ? { ...bus, via: file.map.stops.bus.via.map(via) } : bus, taxi: stop(file.map.stops.taxi) }, lot: { ...lot, street: follow(lot.along ?? 'z', lot.street) } });
}

/** Moves a road across its own direction (and, in a town of roads, along it): it takes its lanes, its stops and its joined ends with it. */
export function moveRoad(file: MapFile, index: number, by: { x: number; z: number }): MapFile {
  const old = file.map.roads[index];
  if (!old || (by.x === 0 && by.z === 0)) return file;
  const [across, along] = old.along === 'x' ? [by.z, by.x] : [by.x, by.z];
  const road: MapRoad = {
    ...old,
    at: round2(old.at + across),
    ...(old.lanes && { lanes: old.lanes.map((l) => ({ ...l, at: round2(l.at + across) })) }),
    ...(!isGrid(file) && old.from !== undefined && { from: round2(old.from + along), to: round2(old.to! + along) }),
  };
  return clearUnder(cutForRoad(recutBlocks(file, replaceRoad(file, index, road)), roadBox(road)), [roadBox(road)]);
}

/** Changes how a road is driven, whether it carries traffic, its arrows or its ends. A new way of driving makes its lanes again. */
export function editRoad(file: MapFile, index: number, changes: Partial<RoadSettings> & { direction?: 1 | -1; from?: number; to?: number }): MapFile {
  const old = file.map.roads[index];
  if (!old) return file;
  const flow: Flow = old.median !== undefined ? 'dual' : old.lanes ? 'one-way' : 'two-way';
  const spec: RoadSpec = {
    along: old.along,
    at: old.at,
    from: changes.from ?? old.from,
    to: changes.to ?? old.to,
    flow: changes.flow ?? flow,
    direction: changes.direction ?? old.lanes?.[0]?.direction ?? 1,
    traffic: changes.traffic ?? old.traffic,
    arrows: changes.arrows ?? old.arrows === true,
  };
  let road: MapRoad;
  if (spec.flow === flow && changes.direction === undefined) {
    // (Its lanes are as they were drawn.)
    const { arrows: _arrows, ...rest } = old;
    road = { ...rest, traffic: spec.traffic, ...(old.from !== undefined && { from: spec.from!, to: spec.to! }), ...(spec.arrows && flow !== 'two-way' && { arrows: true as const }) };
  } else road = makeRoad(file, spec);
  const next = clearUnder(recutBlocks(file, replaceRoad(file, index, road)), [roadBox(road)]);
  // (Only a road whose ends change reaches new ground.)
  return changes.from !== undefined || changes.to !== undefined ? cutForRoad(next, roadBox(road)) : next;
}

export function dropRoad(file: MapFile, index: number): MapFile {
  if (!file.map.roads[index]) return file;
  return recutBlocks(file, withMap(file, { roads: file.map.roads.filter((_, n) => n !== index) }));
}

// ---- The rail ----

/** How deep the railway's box is to begin with: 2 tiles on its pillars, 4 on the ground (the train has to fit between the blocks). */
export const railDepth = (file: MapFile): number => (file.settings.railway === 'ground' ? 4 : 2);

/** Puts the railway somewhere else, along x (east to west). The blocks of a grid are cut again; what stands in its way is taken away. */
export function setRail(file: MapFile, box: MapBox): MapFile {
  const rail = wholeBox(box);
  return clearUnder(recutBlocks(file, withMap(file, { rail })), [rail]);
}

// ---- The building ----

/** Why the wings and the reception box cannot be where they are, in plain words; null if they can (the rules of #289 stay as they are). */
export function buildingProblem(file: MapFile): string | null {
  const { wings, reception } = file.map.building;
  const parts = [...wings, ...(reception ? [reception] : [])];
  if (parts.some((p) => ![p.x, p.z, p.w, p.d].every(whole))) return 'The wings and the reception box lie on whole tiles.';
  if (parts.some((p) => p.z < 0)) return 'A wing lies north of the line the floor starts on: the north edge of the building is at z = 0.';
  if (parts.length > 0 && !parts.some((p) => p.z === 0)) return 'Something of the building has to stand on z = 0, the line its floor starts on.';
  return null;
}

/** The company's block keeps its written box while that holds the wings; else it grows just enough to hold them with 2 tiles to spare. */
export function fitOwn(file: MapFile): MapFile {
  const { building } = file.map;
  const parts = [...building.wings, ...(building.reception ? [building.reception] : [])];
  if (parts.length === 0) return file;
  const floor = hullOf(parts);
  if (inside(floor, building.own)) return file;
  return withMap(file, { building: { ...building, own: hullOf([building.own, { x: floor.x - 2, z: floor.z - 2, w: floor.w + 4, d: floor.d + 4 }]) } });
}

const withBuilding = (file: MapFile, changes: Partial<MapFile['map']['building']>): MapFile => withMap(file, { building: { ...file.map.building, ...changes } });

/** What every change of the wings has in common: the company's block grows to hold them, and what stands in the way goes. */
const settled = (file: MapFile, box: MapBox): MapFile => clearUnder(fitOwn(file), [box]);

export function setWing(file: MapFile, index: number, box: MapBox): MapFile {
  if (!file.map.building.wings[index]) return file;
  const wing = wholeBox(box);
  return settled(withBuilding(file, { wings: file.map.building.wings.map((w, n) => (n === index ? wing : w)) }), wing);
}

export function addWing(file: MapFile, box: MapBox): MapFile {
  const wing = wholeBox(box);
  return settled(withBuilding(file, { wings: [...file.map.building.wings, wing] }), wing);
}

/** A building keeps at least one wing. */
export function dropWing(file: MapFile, index: number): MapFile {
  const { wings } = file.map.building;
  if (!wings[index] || wings.length < 2) return file;
  return withBuilding(file, { wings: wings.filter((_, n) => n !== index) });
}

export function setReception(file: MapFile, box: MapBox): MapFile {
  const reception = wholeBox(box);
  return settled(withBuilding(file, { reception }), reception);
}

/** The company's own block, edited as numbers. */
export const setOwn = (file: MapFile, box: MapBox): MapFile => withBuilding(file, { own: gridBox(box) });

/** Works out again which side of the reception box the entrance faces, from the floor and the roads (#289). Not for a town laid out round a building of the game. */
export function withFaces(file: MapFile): MapFile {
  const { reception, wings } = file.map.building;
  if (!reception) return file;
  const rect = (b: MapBox) => ({ x: b.x, y: b.z, w: b.w, h: b.d });
  const faces = floorFaces(rect(reception), [...wings, reception].map(rect), file.map.roads.map((r) => rect(roadBox(r))));
  return faces === file.map.building.faces ? file : withBuilding(file, { faces });
}

/** The building of the game that a copy of one of its maps is laid out round, while its wings and reception box are those of the original; else none (one is worked out from the file, #289). */
export function houseFor(file: MapFile, original?: MapFile): Building | undefined {
  const region = original ? (Object.keys(SITES) as RegionId[]).find((r) => SITES[r].map === original.id) : undefined;
  const same = original && JSON.stringify([original.map.building.wings, original.map.building.reception]) === JSON.stringify([file.map.building.wings, file.map.building.reception]);
  return region && same ? buildingFor(region) : undefined;
}

// ---- Stops ----

export type StopKind = 'bus' | 'taxi';

/** The road that carries traffic under a point (a tile either side counts), the nearest if there are several. */
function stopRoad(file: MapFile, at: MapSpot): MapRoad | undefined {
  return file.map.roads
    .filter((r) => r.traffic)
    .map((r) => {
      const b = roadBox(r);
      return { r, gap: Math.hypot(Math.max(b.x - at.x, 0, at.x - (b.x + b.w)), Math.max(b.z - at.z, 0, at.z - (b.z + b.d))) };
    })
    .filter((p) => p.gap <= 1)
    .sort((p, q) => p.gap - q.gap)[0]?.r;
}

/** Why a stop cannot be where the pointer is, in plain words; null if it can. */
export const stopProblem = (file: MapFile, at: MapSpot): string | null => (stopRoad(file, at) ? null : 'A stop goes on a road that carries traffic.');

export function setStop(file: MapFile, kind: StopKind, at: MapSpot): MapFile {
  const road = stopRoad(file, at);
  if (!road) return file;
  // (The bus keeps its go-via points.)
  const via = kind === 'bus' ? file.map.stops.bus.via : undefined;
  return withMap(file, { stops: { ...file.map.stops, [kind]: { along: road.along, at: road.at, pos: round2(road.along === 'x' ? at.x : at.z) , ...(via && { via }) } } });
}

// ---- Routes: where the bus goes via, and the paths people walk (0.21.0, #330) ----

/** Why a go-via point cannot be where the pointer is, in plain words; null if it can. It goes on a road that carries traffic, as a stop does. */
export function viaProblem(file: MapFile, at: MapSpot, except = -1): string | null {
  const via = file.map.stops.bus.via ?? [];
  if (via.length - (except >= 0 ? 1 : 0) >= MAX_VIA) return `The bus goes via up to ${MAX_VIA} points: remove one first.`;
  return stopRoad(file, at) ? null : 'A go-via point goes on a road that carries traffic.';
}

/** The point on the middle line of the road under the pointer. */
function onRoad(file: MapFile, at: MapSpot): MapSpot | null {
  const road = stopRoad(file, at);
  if (!road) return null;
  return road.along === 'x' ? { x: round2(at.x), z: road.at } : { x: road.at, z: round2(at.z) };
}

const withVia = (file: MapFile, via: MapSpot[]): MapFile => {
  const { via: _old, ...bus } = file.map.stops.bus;
  return withMap(file, { stops: { ...file.map.stops, bus: via.length > 0 ? { ...bus, via } : bus } });
};

/** Adds a go-via point at the end of the bus's way to its stop: the points are visited in the order they were put down. */
export function addVia(file: MapFile, at: MapSpot): MapFile {
  const spot = onRoad(file, at);
  const via = file.map.stops.bus.via ?? [];
  return spot && via.length < MAX_VIA ? withVia(file, [...via, spot]) : file;
}

/** Moves a go-via point to another place on a road. */
export function moveVia(file: MapFile, index: number, at: MapSpot): MapFile {
  const via = file.map.stops.bus.via ?? [];
  const spot = onRoad(file, at);
  return spot && via[index] ? withVia(file, via.map((p, n) => (n === index ? spot : p))) : file;
}

export function dropVia(file: MapFile, index: number): MapFile {
  const via = file.map.stops.bus.via ?? [];
  return via[index] ? withVia(file, via.filter((_, n) => n !== index)) : file;
}

const withWalks = (file: MapFile, walks: MapSpot[][]): MapFile => {
  const { walks: _old, ...map } = file.map;
  return { ...file, map: walks.length > 0 ? { ...map, walks } : map };
};

/** Why a stretch of a walking path cannot go from one point to the next, in plain words; null if it can. It must not cross a road, a railway on the ground or the office. */
export function walkStretchProblem(file: MapFile, from: MapSpot, to: MapSpot): { reason: string; at: MapSpot } | null {
  const found = stretchProblem(file, from, to);
  return found ? { reason: `A walking path cannot cross ${found.name}: people would walk over it.`, at: found.at } : null;
}

/** Draws a walking path from point to point (at least 2, up to 2 decimals). */
export function addWalk(file: MapFile, points: readonly MapSpot[]): MapFile {
  const path = points.map((p) => ({ x: round2(p.x), z: round2(p.z) }));
  return path.length < 2 ? file : withWalks(file, [...(file.map.walks ?? []), path]);
}

export function moveWalk(file: MapFile, index: number, by: { x: number; z: number }): MapFile {
  const walks = file.map.walks ?? [];
  return walks[index] ? withWalks(file, walks.map((path, n) => (n === index ? path.map((p) => ({ x: round2(p.x + by.x), z: round2(p.z + by.z) })) : path))) : file;
}

export function dropWalk(file: MapFile, index: number): MapFile {
  const walks = file.map.walks ?? [];
  return walks[index] ? withWalks(file, walks.filter((_, n) => n !== index)) : file;
}

// ---- The lot ----

/** The road nearest a box among those `want` accepts. */
function nearestBy(file: MapFile, box: MapBox, want: (r: MapRoad) => boolean): MapRoad | undefined {
  const [mx, mz] = [box.x + box.w / 2, box.z + box.d / 2];
  return file.map.roads
    .filter(want)
    .map((r) => {
      const b = roadBox(r);
      return { r, gap: Math.hypot(Math.max(b.x - mx, 0, mx - (b.x + b.w)), Math.max(b.z - mz, 0, mz - (b.z + b.d))) };
    })
    .sort((p, q) => p.gap - q.gap)[0]?.r;
}

/**
 * Puts the lot's block somewhere. In a grid it opens onto the nearest road along z; with no parking strip it gets one equal to the block (as Valley and
 * Beach have), and strips move with the block. In a town of roads it opens onto the nearest road, on its side (`along`, `side`).
 */
export function setLot(file: MapFile, box: MapBox): MapFile {
  const block = wholeBox(box);
  const lot = file.map.lot;
  const [dx, dz] = [block.x - lot.block.x, block.z - lot.block.z];
  const move = (b: MapBox): MapBox => ({ ...b, x: round2(b.x + dx), z: round2(b.z + dz) });
  const grid = isGrid(file);
  const road = nearestBy(file, block, grid ? (r) => r.along === 'z' : () => true);
  const [mx, mz] = [block.x + block.w / 2, block.z + block.d / 2];
  const sameSize = near(block.w, lot.block.w) && near(block.d, lot.block.d);
  const single = lot.parking.length === 1 && sameBox(lot.parking[0]!, lot.block);
  const parking = single || (grid && lot.parking.length === 0) ? [block] : sameSize ? lot.parking.map(move) : lot.parking;
  const next = withMap(file, {
    lot: {
      ...lot,
      block,
      parking,
      green: sameSize ? lot.green.map(move) : lot.green,
      fountain: sameSize && lot.fountain ? { x: round2(lot.fountain.x + dx), z: round2(lot.fountain.z + dz) } : lot.fountain,
      ...(road && { street: road.at }),
      ...(road && !grid && { along: road.along, side: (road.along === 'x' ? mz : mx) > road.at ? (1 as const) : (-1 as const) }),
    },
  });
  return clearUnder(next, [block]);
}

/** Adds a strip to the lot (a row of bays) or a green; one inside the box of the wings also goes in the building's courtyard, as Coaxia has. */
function addToLot(file: MapFile, key: 'parking' | 'green', box: MapBox): MapFile {
  const strip = wholeBox(box);
  const { lot, building } = file.map;
  const court = inside(strip, hullOf(building.wings));
  const next = withMap(file, {
    lot: { ...lot, [key]: [...lot[key], strip] },
    ...(court && { building: { ...building, courtyard: { ...building.courtyard, [key]: [...building.courtyard[key], strip] } } }),
  });
  return clearUnder(next, [strip]);
}
export const addParking = (file: MapFile, box: MapBox): MapFile => addToLot(file, 'parking', box);
export const addGreen = (file: MapFile, box: MapBox): MapFile => addToLot(file, 'green', box);

function dropFromLot(file: MapFile, key: 'parking' | 'green', index: number): MapFile {
  const strip = file.map.lot[key][index];
  if (!strip) return file;
  const { building, lot } = file.map;
  const courtyard = { ...building.courtyard, [key]: building.courtyard[key].filter((b) => !sameBox(b, strip)) };
  return withMap(file, { lot: { ...lot, [key]: lot[key].filter((_, n) => n !== index) }, building: { ...building, courtyard } });
}
export const dropParking = (file: MapFile, index: number): MapFile => dropFromLot(file, 'parking', index);
export const dropGreen = (file: MapFile, index: number): MapFile => dropFromLot(file, 'green', index);

export function setFountain(file: MapFile, at: MapSpot | null): MapFile {
  return withMap(file, { lot: { ...file.map.lot, fountain: at && { x: round2(at.x), z: round2(at.z) } } });
}

function replaceStrip(file: MapFile, key: 'parking' | 'green', index: number, box: MapBox): MapFile {
  const old = file.map.lot[key][index];
  if (!old) return file;
  const strip = wholeBox(box);
  const { lot, building } = file.map;
  const courtyard = { ...building.courtyard, [key]: building.courtyard[key].map((b) => (sameBox(b, old) ? strip : b)) };
  return clearUnder(withMap(file, { lot: { ...lot, [key]: lot[key].map((b, n) => (n === index ? strip : b)) }, building: { ...building, courtyard } }), [strip]);
}

// ---- Other structure ----

/** The edge of a town of roads: the box vehicles come in at. */
export const setEdge = (file: MapFile, box: MapBox): MapFile => (isGrid(file) ? file : withMap(file, { edge: wholeBox(box) }));

/** The kinds of ground a block with a kerb can be. */
export const BLOCK_KINDS: readonly GroundKind[] = ['pavement', 'grass', 'concrete', 'asphalt', 'sand', 'field'];

export function addBlock(file: MapFile, kind: GroundKind, box: MapBox): MapFile {
  const block = wholeBox(box);
  // (A block is written without the part on a road, in kerbed pieces.)
  const pieces = clearOfRoads(file, block).map((p): MapGround => ({ kind, ...p, edge: true }));
  return clearUnder(withMap(file, { ground: [...file.map.ground, ...pieces] }), [block]);
}

export function editBlock(file: MapFile, index: number, changes: Partial<MapBox> & { kind?: GroundKind }): MapFile {
  const old = file.map.ground[index];
  if (!old?.edge) return file;
  // (A block cannot be dragged onto a road: it stays where it was.)
  const moved = { ...old, ...changes };
  const clear = clearOfRoads(file, moved);
  const reshaped = !sameBox(old, moved);
  if (reshaped && (clear.length !== 1 || !sameBox(clear[0]!, moved))) return file;
  return withMap(file, { ground: file.map.ground.map((g, n) => (n === index ? { ...g, ...changes } : g)) });
}

export function dropBlock(file: MapFile, index: number): MapFile {
  return file.map.ground[index]?.edge ? withMap(file, { ground: file.map.ground.filter((_, n) => n !== index) }) : file;
}

// ---- Starting a map ----

/**
 * A new map: the bare structure of Coaxia (a grid, with its kerbed blocks) or of Amplify Hills (roads, with no ground), with no houses, trees, lamps,
 * hills or peaks. It is a map of no region, so the game works its building out from the wings and the reception box (#289).
 */
export function newTown(kind: 'grid' | 'roads', taken: readonly string[] = []): MapFile {
  const source = structuredClone(MAPS[kind === 'grid' ? 'coaxia' : 'amplify-hills']!);
  return {
    ...source,
    id: uniqueId('new map', taken),
    name: 'New map',
    map: { ...source.map, houses: [], trees: [], lamps: [], hills: [], peaks: [], ground: kind === 'grid' ? source.map.ground.filter((g) => g.edge) : [] },
  };
}

// ---- The parts the 3D editor picks and moves ----

export type PartKind = 'road' | 'rail' | 'wing' | 'reception' | 'bus' | 'taxi' | 'lot' | 'strip' | 'green' | 'fountain' | 'block' | 'edge' | 'via' | 'walk';

/** One part of the structure: its kind and its place in that kind's list. */
export interface PartRef {
  part: PartKind;
  index: number;
}

export const PART_NAMES: Record<PartKind, string> = {
  road: 'Road',
  rail: 'Railway',
  wing: 'Wing',
  reception: 'Reception',
  bus: 'Bus stop',
  taxi: 'Taxi stand',
  lot: 'Lot',
  strip: 'Parking strip',
  green: 'Courtyard green',
  fountain: 'Fountain',
  block: 'Block',
  edge: 'Edge',
  via: 'Go-via point',
  walk: 'Walking path',
};

/** Parts that can be moved but not removed, because a map must have them. */
export const KEPT_PARTS: readonly PartKind[] = ['rail', 'reception', 'bus', 'taxi', 'lot', 'edge'];

const tileOf = (s: MapSpot): MapBox => ({ x: Math.floor(s.x), z: Math.floor(s.z), w: 1, d: 1 });

/** The ground a part covers, if it is still there. A stop or the fountain is a tile. */
export function partBox(file: MapFile, ref: PartRef): MapBox | null {
  const { map } = file;
  switch (ref.part) {
    case 'road': return map.roads[ref.index] ? roadBox(map.roads[ref.index]!) : null;
    case 'rail': return map.rail;
    case 'wing': return map.building.wings[ref.index] ?? null;
    case 'reception': return map.building.reception;
    case 'bus':
    case 'taxi': {
      const s = map.stops[ref.part];
      return tileOf(s.along === 'x' ? { x: s.pos, z: s.at } : { x: s.at, z: s.pos });
    }
    case 'lot': return map.lot.block;
    case 'strip': return map.lot.parking[ref.index] ?? null;
    case 'green': return map.lot.green[ref.index] ?? null;
    case 'fountain': return map.lot.fountain ? tileOf(map.lot.fountain) : null;
    case 'block': return map.ground[ref.index]?.edge ? map.ground[ref.index]! : null;
    case 'edge': return map.edge;
    case 'via': {
      const p = map.stops.bus.via?.[ref.index];
      return p ? tileOf(p) : null;
    }
    case 'walk': {
      const path = map.walks?.[ref.index];
      return path ? hullOf(path.map((p) => ({ x: p.x - 0.5, z: p.z - 0.5, w: 1, d: 1 }))) : null;
    }
  }
}

/** The parts of the file, for the outlines and the boxes that catch a click. Blocks and the edge only when asked for (a grid has dozens). */
export function partsOf(file: MapFile, withBlocks: boolean): PartRef[] {
  const { map } = file;
  const out: PartRef[] = [];
  map.roads.forEach((_, index) => out.push({ part: 'road', index }));
  if (map.rail) out.push({ part: 'rail', index: 0 });
  map.building.wings.forEach((_, index) => out.push({ part: 'wing', index }));
  if (map.building.reception) out.push({ part: 'reception', index: 0 });
  out.push({ part: 'bus', index: 0 }, { part: 'taxi', index: 0 }, { part: 'lot', index: 0 });
  map.lot.parking.forEach((_, index) => out.push({ part: 'strip', index }));
  map.lot.green.forEach((_, index) => out.push({ part: 'green', index }));
  if (map.lot.fountain) out.push({ part: 'fountain', index: 0 });
  (map.stops.bus.via ?? []).forEach((_, index) => out.push({ part: 'via', index }));
  (map.walks ?? []).forEach((_, index) => out.push({ part: 'walk', index }));
  if (withBlocks) {
    map.ground.forEach((g, index) => g.edge && out.push({ part: 'block', index }));
    if (map.edge) out.push({ part: 'edge', index: 0 });
  }
  return out;
}

/** A box part given a new box (moved, or dragged by a corner). */
export function resizePart(file: MapFile, ref: PartRef, box: MapBox): MapFile {
  switch (ref.part) {
    case 'rail': return setRail(file, box);
    case 'wing': return setWing(file, ref.index, box);
    case 'reception': return setReception(file, box);
    case 'lot': return setLot(file, box);
    case 'strip': return replaceStrip(file, 'parking', ref.index, box);
    case 'green': return replaceStrip(file, 'green', ref.index, box);
    case 'block': return editBlock(file, ref.index, wholeBox(box));
    case 'edge': return setEdge(file, box);
    default: return file;
  }
}

/** A grip on a part: a corner of its box, or an end of a road of a town of roads. */
export type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'from' | 'to';

/** The grips of a part and where they stand (ground level, floor tiles). A road of a grid runs the length of the town and has none. */
export function handlesOf(file: MapFile, ref: PartRef): { handle: Handle; x: number; z: number }[] {
  if (ref.part === 'road') {
    const road = file.map.roads[ref.index];
    if (!road || road.from === undefined || road.to === undefined) return [];
    return road.along === 'x'
      ? [{ handle: 'from', x: road.from, z: road.at }, { handle: 'to', x: road.to, z: road.at }]
      : [{ handle: 'from', x: road.at, z: road.from }, { handle: 'to', x: road.at, z: road.to }];
  }
  if (!['rail', 'wing', 'reception', 'lot', 'strip', 'green', 'block', 'edge'].includes(ref.part)) return [];
  const b = partBox(file, ref);
  if (!b) return [];
  return [
    { handle: 'nw', x: b.x, z: b.z },
    { handle: 'ne', x: b.x + b.w, z: b.z },
    { handle: 'sw', x: b.x, z: b.z + b.d },
    { handle: 'se', x: b.x + b.w, z: b.z + b.d },
  ];
}

/** The file with a grip of a part dragged to a point of the pointer: a corner goes to the nearest grid line, the end of a road snaps as it does when it is drawn. */
export function dragHandle(file: MapFile, ref: PartRef, handle: Handle, point: MapSpot): MapFile {
  if (ref.part === 'road') {
    const road = file.map.roads[ref.index];
    if (!road || road.from === undefined || road.to === undefined) return file;
    const value = snapEnd(file, road, road.along === 'x' ? point.x : point.z, ref.index);
    if (handle === 'from') return value <= road.to - 2 ? editRoad(file, ref.index, { from: value }) : file;
    return value >= road.from + 2 ? editRoad(file, ref.index, { to: value }) : file;
  }
  const box = partBox(file, ref);
  if (!box || handle === 'from' || handle === 'to') return file;
  const [px, pz] = [Math.round(point.x), Math.round(point.z)];
  // The corner opposite the one dragged stays where it is.
  const [fx, fz] = [handle === 'nw' || handle === 'sw' ? box.x + box.w : box.x, handle === 'nw' || handle === 'ne' ? box.z + box.d : box.z];
  const next = { x: Math.min(px, fx), z: Math.min(pz, fz), w: Math.max(1, Math.abs(px - fx)), d: Math.max(1, Math.abs(pz - fz)) };
  return resizePart(file, ref, next);
}

/** The same part somewhere else, by whole tiles. */
export function movePart(file: MapFile, ref: PartRef, by: { x: number; z: number }): MapFile {
  if (by.x === 0 && by.z === 0) return file;
  const box = partBox(file, ref);
  if (!box) return file;
  switch (ref.part) {
    case 'road': return moveRoad(file, ref.index, by);
    case 'bus':
    case 'taxi': {
      const s = file.map.stops[ref.part];
      return setStop(file, ref.part, s.along === 'x' ? { x: s.pos + by.x, z: s.at + by.z } : { x: s.at + by.x, z: s.pos + by.z });
    }
    case 'fountain': return setFountain(file, { x: file.map.lot.fountain!.x + by.x, z: file.map.lot.fountain!.z + by.z });
    case 'via': {
      const p = file.map.stops.bus.via![ref.index]!;
      return moveVia(file, ref.index, { x: p.x + by.x, z: p.z + by.z });
    }
    case 'walk': return moveWalk(file, ref.index, by);
    default: return resizePart(file, ref, { ...box, x: round2(box.x + by.x), z: round2(box.z + by.z) });
  }
}

/** Takes a part away, if a map can be without it. */
export function dropPart(file: MapFile, ref: PartRef): MapFile {
  switch (ref.part) {
    case 'road': return dropRoad(file, ref.index);
    case 'wing': return dropWing(file, ref.index);
    case 'strip': return dropParking(file, ref.index);
    case 'green': return dropGreen(file, ref.index);
    case 'block': return dropBlock(file, ref.index);
    case 'fountain': return setFountain(file, null);
    case 'via': return dropVia(file, ref.index);
    case 'walk': return dropWalk(file, ref.index);
    default: return file;
  }
}

// ---- What a tool does with a gesture ----

/** The tools of the structure. */
export type StructureTool = 'road' | 'block' | 'edge' | 'rail' | 'wing' | 'reception' | 'bus' | 'taxi' | 'lot' | 'strip' | 'green' | 'fountain' | 'via';
export const STRUCTURE_TOOLS: readonly StructureTool[] = ['road', 'block', 'edge', 'rail', 'wing', 'reception', 'bus', 'taxi', 'lot', 'strip', 'green', 'fountain', 'via'];

/** What a drag or a click is: the first and last tile (whole tile numbers) and the point of the pointer (the middle of a tile, or free). */
export interface Gesture {
  from: [number, number];
  to: [number, number];
  point: MapSpot;
}

export interface ToolOptions {
  road: RoadSettings;
  block: GroundKind;
}

/** The box from the first to the last tile of a drag, whole tiles. */
export const dragBox = (g: Pick<Gesture, 'from' | 'to'>): MapBox => ({ x: Math.min(g.from[0], g.to[0]), z: Math.min(g.from[1], g.to[1]), w: Math.abs(g.from[0] - g.to[0]) + 1, d: Math.abs(g.from[1] - g.to[1]) + 1 });

/** The road a drag draws: along the longer way of the drag, at the row or column of its first tile, with the ends of the drag in a town of roads. */
export function roadOfDrag(g: Gesture, settings: RoadSettings): RoadSpec {
  const along: 'x' | 'z' = Math.abs(g.to[0] - g.from[0]) >= Math.abs(g.to[1] - g.from[1]) ? 'x' : 'z';
  const [a, b, cross] = along === 'x' ? [g.from[0], g.to[0], g.from[1]] : [g.from[1], g.to[1], g.from[0]];
  return { ...settings, along, at: cross + 0.5, from: Math.min(a, b), to: Math.max(a, b) + 1, direction: b >= a ? 1 : -1 };
}

export interface Applied {
  file: MapFile;
  /** Why the tool refuses to do this, in plain words; the file is then the one given. */
  problem: string | null;
  /** The box to draw as the outline of what would be there. */
  outline: MapBox | null;
}

/** What a tool would do with a gesture: the new file (the same one if it refuses), the reason if it refuses, and the outline of what is put down. */
export function applyTool(file: MapFile, tool: StructureTool, g: Gesture, options: ToolOptions): Applied {
  const refuse = (problem: string, outline: MapBox | null = null): Applied => ({ file, problem, outline });
  const done = (next: MapFile, outline: MapBox | null): Applied => ({ file: next, problem: null, outline });
  const box = dragBox(g);
  const tile = tileOf(g.point);
  const building = (next: MapFile) => {
    const bad = buildingProblem(next);
    return bad ? refuse(bad, box) : done(next, box);
  };
  switch (tool) {
    case 'road': {
      const spec = roadOfDrag(g, options.road);
      const road = makeRoad(file, isGrid(file) ? spec : { ...spec, from: snapEnd(file, spec, spec.from!), to: snapEnd(file, spec, spec.to!) });
      const problem = roadProblem(file, road);
      return problem ? refuse(problem, roadBox(road)) : done(addRoad(file, spec), roadBox(road));
    }
    case 'block': return done(addBlock(file, options.block, box), box);
    case 'edge': return isGrid(file) ? refuse('Only a town laid out by its roads has an edge.') : done(setEdge(file, box), box);
    case 'rail': {
      const rail = { x: box.x, z: box.z, w: box.w, d: file.map.rail?.d ?? railDepth(file) };
      return done(setRail(file, rail), rail);
    }
    case 'wing': return building(addWing(file, box));
    case 'reception': return building(setReception(file, box));
    case 'bus':
    case 'taxi': {
      const problem = stopProblem(file, g.point);
      return problem ? refuse(problem, tile) : done(setStop(file, tool, g.point), tile);
    }
    case 'via': {
      const problem = viaProblem(file, g.point);
      return problem ? refuse(problem, tile) : done(addVia(file, g.point), tile);
    }
    case 'lot': return done(setLot(file, box), box);
    case 'strip': return done(addParking(file, box), box);
    case 'green': return done(addGreen(file, box), box);
    case 'fountain': return done(setFountain(file, g.point), tile);
  }
}
