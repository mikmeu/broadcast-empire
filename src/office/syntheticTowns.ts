// Small made-up towns to try the traffic in (#217): streets with ends of their own, as the towns laid out from
// their drawings will have them. Each has an office on the north side of its main street, a bus stop and a taxi
// stand on that street, and the company's parking lot south of it, opening onto a road along x. The streets are
// four tiles wide (a lane of two each way, for vehicles drawn twice as large); the numbers are floor tiles.
//
//   T         a main street along x with one street coming up to it from the south (a T-junction)
//   dead end  the same, but the street from the south ends in nothing, 20 tiles from the main street
//   corner    a street along x that turns into one along z (a corner), and nothing else
//   ring      a ring of four streets with four corners, and a street from the west that joins it in a T

import type { Building } from '../config/office';
import type { Layout, Rect, Street } from './townLayout';

interface Plan {
  id: string;
  streets: Street[];
  /** The edge of the drawing. */
  edge: Rect;
  /** The office's block, the stops and the lot. */
  office: Rect;
  stops: { bus: number; taxi: number };
  lot: Rect;
}

/** The plans below are drawn at the size they were first made at; the towns are this many times as large (0.20.0), like the vehicles in them. */
const SIZE = 2;

function synthetic(drawn: Plan): Layout {
  const big = (r: Rect): Rect => ({ x: r.x * SIZE, z: r.z * SIZE, w: r.w * SIZE, d: r.d * SIZE });
  const plan: Plan = {
    id: drawn.id,
    streets: drawn.streets.map((s) => ({ ...s, at: s.at * SIZE, ...(s.from !== undefined ? { from: s.from * SIZE } : {}), ...(s.to !== undefined ? { to: s.to * SIZE } : {}) })),
    edge: big(drawn.edge),
    office: big(drawn.office),
    stops: { bus: drawn.stops.bus * SIZE, taxi: drawn.stops.taxi * SIZE },
    lot: big(drawn.lot),
  };
  const { streets, edge } = plan;
  const sw = 4;
  const spot = { x: plan.office.x + plan.office.w / 2, z: plan.office.z + plan.office.d / 2 };
  return {
    id: plan.id,
    streetWidth: sw,
    from: { x: edge.x, z: edge.z },
    length: { x: edge.w, z: edge.d },
    edge,
    railway: { z: edge.z + edge.d + 20, from: edge.x, length: edge.w, width: sw, strips: [] },
    own: (_building: Building) => plan.office,
    lot: () => ({ block: plan.lot, street: 0, along: 'x', side: 1 }),
    streets: () => streets,
    busy: () => streets,
    stops: { bus: { along: 'x', at: 0, pos: plan.stops.bus }, taxi: { along: 'x', at: 0, pos: plan.stops.taxi } },
    places: { door: spot, gate: spot, corner: () => spot, stop: (wait) => wait, away: spot, court: null },
    strolling: () => ({ own: { ...spot, w: plan.office.w, d: plan.office.d }, others: [] }),
    cellAt: () => null,
    pavement: () => false,
    lotCrossing: () => null,
  };
}

const main: Street = { along: 'x', at: 0, from: 0, to: 60 };

/** A main street with a street from the south that reaches the edge. */
export const T_TOWN = synthetic({
  id: 'synthetic T',
  streets: [main, { along: 'z', at: 30, from: 0, to: 30 }],
  edge: { x: 0, z: -10, w: 60, d: 40 },
  office: { x: 6, z: -14, w: 20, d: 10 },
  stops: { bus: 20, taxi: 10 },
  lot: { x: 38, z: 1, w: 16, d: 8 },
});

/** The same, with a street from the south that ends 20 tiles from the main one. */
export const DEAD_END_TOWN = synthetic({
  id: 'synthetic dead end',
  streets: [main, { along: 'z', at: 30, from: 0, to: 20 }],
  edge: { x: 0, z: -10, w: 60, d: 20 },
  office: { x: 6, z: -14, w: 20, d: 10 },
  stops: { bus: 20, taxi: 10 },
  lot: { x: 38, z: 1, w: 16, d: 8 },
});

/** A street along x that turns into one along z. */
export const CORNER_TOWN = synthetic({
  id: 'synthetic corner',
  streets: [main, { along: 'z', at: 0, from: 0, to: 60 }],
  edge: { x: -10, z: -10, w: 70, d: 70 },
  office: { x: 6, z: -14, w: 20, d: 10 },
  stops: { bus: 20, taxi: 10 },
  lot: { x: 38, z: 1, w: 16, d: 8 },
});

/** A ring of four streets, with a street from the west that joins its west side. */
export const RING_TOWN = synthetic({
  id: 'synthetic ring',
  streets: [
    { along: 'x', at: 0, from: 0, to: 50 },
    { along: 'x', at: 30, from: 0, to: 50 },
    { along: 'z', at: 0, from: 0, to: 30 },
    { along: 'z', at: 50, from: 0, to: 30 },
    { along: 'x', at: 15, from: -20, to: 0 },
  ],
  edge: { x: -20, z: -10, w: 80, d: 60 },
  office: { x: 6, z: -14, w: 20, d: 10 },
  stops: { bus: 20, taxi: 10 },
  lot: { x: 30, z: 1, w: 16, d: 8 },
});

export const SYNTHETIC_TOWNS = [T_TOWN, DEAD_END_TOWN, CORNER_TOWN, RING_TOWN];
