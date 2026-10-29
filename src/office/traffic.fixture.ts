// What the traffic of today's towns looks like, written down as plain data (#217): the proof that the towns
// that have full-length streets drive as they did before streets got ends of their own. The data is recorded
// in traffic.fixture.json by `npx tsx scripts/recordTrafficFixture.ts`; traffic.fixture.test.ts holds the code to it.

import { BUILDINGS } from '../config/office';
import { SITES } from './sites';
import { GRID, layoutOf, type Layout } from './townLayout';
import { HOUR_SECONDS, clockHours, createTraffic, orderCar, orderTaxi, roadsOf, stepTraffic, vehiclesIn } from './traffic';

interface Town {
  name: string;
  layout: Layout;
  site: (typeof SITES)[keyof typeof SITES];
  building: (typeof BUILDINGS)[keyof typeof BUILDINGS];
}

/** The towns that stay as they are: the grid with both buildings, and the three towns of the map. (Aerial Fields and Amplify Hills were grids once; since #218 they are laid out by their roads, and are tried in the tests of the traffic.) */
export const FIXTURE_TOWNS: Town[] = [
  { name: 'grid, standard', layout: GRID, site: SITES.capital, building: BUILDINGS.standard },
  { name: 'grid, long', layout: GRID, site: SITES.capital, building: BUILDINGS.long },
  { name: 'Coax City, standard', layout: layoutOf(SITES.capital), site: SITES.capital, building: BUILDINGS.standard },
  { name: 'Transponder Valley, standard', layout: layoutOf(SITES.north), site: SITES.north, building: BUILDINGS.standard },
  { name: 'Skywave Beach, standard', layout: layoutOf(SITES.coast), site: SITES.coast, building: BUILDINGS.standard },
];

const round = (n: number) => (Number.isFinite(n) ? Math.round(n * 1e4) / 1e4 : String(n));

/** A town as plain data: its lanes, junctions, stops and lights, and where every vehicle is after a minute. */
export function describe(town: Town) {
  const roads = roadsOf(town.layout);
  const traffic = createTraffic(1, clockHours(0, 9), town.site.traffic, town.building, town.site.front === 'water', town.layout);
  const still = {
    closed: traffic.closed,
    ends: traffic.ends,
    begins: traffic.begins,
    lights: traffic.crossings.map((c) => (c.lights ? c.lights.green : null)),
    lot: { lane: traffic.lot.lane, turns: traffic.lot.turns.map(round), joins: traffic.lot.joins.map(round) },
  };
  // A taxi and a car for the lot are ordered, so that their ways are in it too.
  orderTaxi(traffic, 'fixture', traffic.hours + 0.5);
  orderCar(traffic, 'fixture', 0, traffic.hours + 0.5, traffic.hours + 5);
  stepTraffic(traffic, 60, traffic.hours + 60 / HOUR_SECONDS);
  return {
    lanes: roads.lanes.map((lane) => ({
      along: lane.along,
      at: round(lane.at),
      direction: lane.direction,
      origin: round(lane.origin),
      length: round(lane.length),
      oncoming: lane.oncoming,
      crossings: lane.crossings.map((c) => ({ s: round(c.s), id: c.id, right: c.right ? { lane: c.right.lane, s: round(c.right.s) } : null })),
    })),
    crossings: roads.crossings.map((c) => ({ id: c.id, x: round(c.x), z: round(c.z) })),
    count: roads.count,
    stops: [roads.busStop, roads.taxiStand].map((stop) => ({ lane: stop.lane, x: round(stop.x), z: round(stop.z), s: round(stop.s) })),
    ...still,
    vehicles: vehiclesIn(traffic).map((v) => ({ kind: v.kind, lane: v.lane, s: round(v.s), v: round(v.v), tone: v.tone, halt: v.halt?.state ?? null, turning: v.turn?.to ?? null })),
  };
}
