// What the game generates from a town's roads, for the map editor's overlay (0.21.0, #330): the lanes that carry traffic, the routes of the bus, the taxis and
// the vans, the train's line, the lights and the level crossings, and the lines people walk. Plain points in floor tiles, no three.js: src/office/scene/RouteOverlay.tsx
// draws them. It lays nothing out and runs no traffic: it reads the roads (`roadsOf`) and what the traffic plans for them (`townPlan`, `lotOfTown`).

import type { Building } from '../config/office';
import type { WayKind } from '../mods/mapFile';
import { STROLL_INSET, lotPathOf, routesOf } from './street';
import type { Layout } from './townLayout';
import { laneAt, lotOfTown, roadsOf, townPlan, type Lane, type Roads, type Route } from './traffic';

export interface Point {
  x: number;
  z: number;
}

export interface RouteOverlay {
  /** Each lane that carries traffic, from its start to its end, the way it is driven. */
  traffic: Point[][];
  /** The bus: its way in to the stop, the way on from it, the points it goes via (in order) and the stop. */
  bus: { line: Point[]; onward: Point[]; via: Point[]; stop: Point };
  /** A taxi: the way to the stand, the way on and the stand. */
  taxi: { line: Point[]; onward: Point[]; stop: Point };
  /** The vans (and the cars) of the lot: the way in to the first gate, every gate and the mouth where they come out. */
  vans: { line: Point[]; gates: Point[]; mouths: Point[] };
  /** The line of the train. */
  train: { from: Point; to: Point; width: number; ground: boolean };
  /** The crossings with lights, and the level crossings. */
  lights: Point[];
  levels: Point[];
  /** What people walk: the loops round blocks, the paths the layout makes, and the paths the map draws. */
  people: { loops: Point[][]; paths: Point[][]; drawn: Point[][]; ways: WayLine[] };
}

/** One of the ways to the entrance (#339): the line from its start to the gate, the corners the map gives it, whether it has no paving, and whether the map can give it corners. */
export interface WayLine {
  kind: WayKind;
  line: Point[];
  corners: number;
  bare: boolean;
  editable: boolean;
}

/** The layers of the overlay, as the checkboxes under the picture list them and the colours both use. */
export type LayerId = 'traffic' | 'bus' | 'taxi' | 'vans' | 'train' | 'lights' | 'people';
export const OVERLAY_LAYERS: readonly { id: LayerId; label: string; colour: string }[] = [
  { id: 'traffic', label: 'Traffic', colour: '#f2f2f2' },
  { id: 'bus', label: 'Bus', colour: '#ff5a5f' },
  { id: 'taxi', label: 'Taxis', colour: '#ffd23f' },
  { id: 'vans', label: 'Vans and cars of the lot', colour: '#3ddc97' },
  { id: 'train', label: 'Train', colour: '#b07fd6' },
  { id: 'lights', label: 'Lights and level crossings', colour: '#ff9f1c' },
  { id: 'people', label: 'Walking', colour: '#4cc9f0' },
];

const pointsOf = (list: readonly (readonly [number, number])[]): Point[] => list.map(([x, z]) => ({ x, z }));

/** The line a route drives: the start and the end of each stretch it runs along, as points. */
function lineOf(lanes: Lane[], legs: Route['legs']): Point[] {
  return legs.flatMap((leg) => [laneAt(lanes[leg.lane]!, leg.from), laneAt(lanes[leg.lane]!, leg.to)]);
}

/** What the game generates from a layout, for a building and a town on a shore or not. */
export function routeOverlay(layout: Layout, building: Building, shore: boolean): RouteOverlay {
  const roads = roadsOf(layout);
  const { lanes } = roads;
  const plan = townPlan(roads, building, shore);
  const lot = lotOfTown(roads, building, plan.closed, plan.begins);
  const { bus } = layout.stops;

  const strolling = layout.strolling(building);
  const loop = (b: { x: number; z: number; w: number; d: number }): Point[] => {
    const [w, d] = [b.w / 2 - STROLL_INSET, b.d / 2 - STROLL_INSET];
    return [{ x: b.x - w, z: b.z - d }, { x: b.x + w, z: b.z - d }, { x: b.x + w, z: b.z + d }, { x: b.x - w, z: b.z + d }, { x: b.x - w, z: b.z - d }];
  };

  const lane = lot.lane === null ? null : lanes[lot.lane]!;
  const onward = (route: Route, stop: Point): Point[] => (route.onward && route.onward.length > 0 ? [stop, ...lineOf(lanes, route.onward)] : []);
  const busStop = { x: roads.busStop.x, z: roads.busStop.z };
  const taxiStand = { x: roads.taxiStand.x, z: roads.taxiStand.z };
  return {
    traffic: lanes.flatMap((l, n) => (plan.closed[n] ? [] : [[laneAt(l, 0), laneAt(l, l.length)]])),
    bus: { line: lineOf(lanes, roads.busRoute.legs), onward: onward(roads.busRoute, busStop), via: (bus.via ?? []).map((p) => ({ x: p.x, z: p.z })), stop: busStop },
    taxi: { line: lineOf(lanes, roads.taxiRoute.legs), onward: onward(roads.taxiRoute, taxiStand), stop: taxiStand },
    vans: {
      line: lane ? lineOf(lanes, lot.route.legs) : [],
      gates: lot.ground.gates.map((g, i) => (lane ? laneAt(lane, lot.turns[i]!) : lot.ground.along === 'z' ? { x: lot.ground.street, z: g.in } : { x: g.in, z: lot.ground.street })),
      mouths: lot.ground.gates.map((g, i) => (lane ? laneAt(lane, lot.joins[i]!) : lot.ground.along === 'z' ? { x: lot.ground.street, z: g.out } : { x: g.out, z: lot.ground.street })),
    },
    train: { from: { x: layout.railway.from, z: layout.railway.z }, to: { x: layout.railway.from + layout.railway.length, z: layout.railway.z }, width: layout.railway.width, ground: layout.railway.ground === true },
    lights: roads.crossings.filter((c) => plan.lit[c.id] && !c.rail).map((c) => ({ x: c.x, z: c.z })),
    levels: roads.crossings.filter((c) => c.rail).map((c) => ({ x: c.x, z: c.z })),
    people: {
      loops: strolling.drawnOnly ? [] : [strolling.own, ...strolling.others].map(loop),
      paths: (strolling.paths ?? []).map(pointsOf),
      drawn: (strolling.drawn ?? []).map(pointsOf),
      ways: waysOf(layout, building, roads),
    },
  };
}

/** The start, the corners and the gate of a way: what the editor puts grips on. */
export const nodesOf = (way: WayLine): Point[] => (way.corners > 0 ? way.line : [way.line[0]!, way.line[way.line.length - 1]!]);

/** The four ways to the entrance as the town draws them, from their start to the gate (0.21.0, #339): with the corners the map gives them, `bare` when they have no paving. */
function waysOf(layout: Layout, building: Building, roads: Roads): WayLine[] {
  const routes = routesOf(roads);
  const given = layout.places.ways ?? {};
  const lot = lotPathOf(layout, building);
  const make = (kind: WayKind, line: readonly (readonly [number, number])[], editable: boolean): WayLine => ({ kind, line: pointsOf(line), corners: given[kind]?.via?.length ?? 0, bare: given[kind]?.bare === true, editable });
  return [
    make('bus', routes.bus.slice(0, -1), true),
    make('taxi', routes.taxi.slice(0, -1), true),
    make('away', routes.walk.slice(0, -1), true),
    ...(lot ? [make('lot', lot.line, lot.editable)] : []),
  ];
}
