import { describe, expect, it, vi } from 'vitest';
import { BUILDINGS } from '../config/office';
import { REGIONS } from '../config/world';
import { SITES } from './sites';
import { SYNTHETIC_TOWNS } from './syntheticTowns';
import { layoutFromMap, layoutOf, type Layout } from './townLayout';
import { MAPS } from '../config/maps';
import { touching } from './touching';
import { BUS, HOUR_SECONDS, busAtStop, carSlack, clockHours, createTraffic, leaveLot, lotCarFor, lotGate, orderCar, parkingHours, placeOf, roadsOf, stepTraffic, vehiclesIn, type Traffic } from './traffic';

// (Transponder Valley, drawn in #402, has streets 190 tiles long: its tests take 2 to 6 s alone and run over the default 5 s when the machine is busy.)
vi.setConfig({ testTimeout: 30_000 });
/** A frame at normal speed. */
const FRAME = 1 / 30;

/** Lets `seconds` of game time go by, a frame at a time, and looks at the town after every frame. */
function run(traffic: Traffic, seconds: number, look?: (traffic: Traffic) => void, frame = FRAME): void {
  for (let n = Math.round(seconds / frame); n > 0; n--) {
    stepTraffic(traffic, frame, traffic.hours + frame / HOUR_SECONDS);
    look?.(traffic);
  }
}

/** A town to try the traffic in: a region's, with the building the office is in. */
interface Town {
  name: string;
  layout: Layout;
  site: (typeof SITES)[keyof typeof SITES];
  building: (typeof BUILDINGS)[keyof typeof BUILDINGS];
}

/** Every region with both buildings: the capital's town is laid out from its drawing, the others are grids. */
const EVERY: Town[] = REGIONS.flatMap(({ id }) =>
  // (The drawings of the valley and the coast have no street beyond the east one on the office's side that a longer building could stand beside, and they never get one. The buildings of Aerial Fields and Amplify Hills are only ever in their own regions, which have them instead of the long one.)
  Object.values(BUILDINGS).filter((building) => !((id === 'north' || id === 'coast' || id === 'heartland' || id === 'highlands') && building.id === 'long') && !(building.id === 'fields' && id !== 'heartland') && !(building.id === 'hills' && id !== 'highlands')).map((building): Town => ({ name: `${id}, ${building.id} building`, layout: layoutOf(SITES[id]), site: SITES[id], building })),
);

/** The towns with streets of the same length (a grid, or the map of the capital, the valley and the coast); the other two have roads with ends of their own. */
const TOWNS: Town[] = EVERY.filter((town) => !town.layout.edge);

/** Aerial Fields and Amplify Hills, laid out by their roads (#218): T-junctions, corners, dead ends, one or two ways in. In the countryside they have the long building (Amplify Hills) and the building of Aerial Fields. */
const ROAD_TOWNS: Town[] = EVERY.filter((town) => town.layout.edge && town.building.id !== 'courtyard');

/** The made-up towns (syntheticTowns.ts): streets with ends of their own. They have the capital's traffic and the standard building. */
const MADE_UP: Town[] = SYNTHETIC_TOWNS.map((layout) => ({ name: layout.id, layout, site: SITES.capital, building: BUILDINGS.standard }));

const make = (town: Town, seed: number, hours: number) => createTraffic(seed, hours, town.site.traffic, town.building, town.site.front === 'water', town.layout);

/** A seed of its own for each town, so that the towns are not all tried on one game. */
const seedOf = (town: Town) => 11 + TOWNS.indexOf(town);

describe.each([...TOWNS, ...ROAD_TOWNS, ...MADE_UP])('the bus in $name (Phase 11b)', (town) => {
  it('stands at the stop at a quarter to every hour, all day and into the next', () => {
    for (const seed of [seedOf(town)]) {
      // From eight in the morning: the first bus is due at a quarter to nine.
      const traffic = make(town, seed, clockHours(0, 8));
      const first = Math.ceil(traffic.hours - BUS.due);
      for (let n = 0; n < 14; n++) {
        const due = first + n + BUS.due;
        run(traffic, (due - traffic.hours) * HOUR_SECONDS);
        const bus = busAtStop(traffic);
        expect(bus, `seed ${seed}, bus ${n}`).toBeDefined();
        const at = placeOf(traffic, bus!);
        expect(at.x).toBeCloseTo(traffic.roads.busStop.x, 3);
        expect(at.z).toBeCloseTo(traffic.roads.busStop.z, 3);
      }
    }
  });

  it('drives on after its stop, so there are never many buses in town', { timeout: 30_000 }, () => {
    const traffic = make(town, 7, clockHours(0, 8));
    let most = 0;
    let standing = 0;
    run(traffic, 20 * HOUR_SECONDS, (now) => {
      most = Math.max(most, vehiclesIn(now).filter((v) => v.kind === 'bus').length);
      if (busAtStop(now)) standing++;
    });
    // (In the two towns laid out by their roads the way from the edge of the drawing to the stop is 150 tiles and more, and a bus turns round in a dead end after it.)
    expect(most).toBeLessThanOrEqual(ROAD_TOWNS.includes(town) ? 10 : 6);
    // It stands there for a part of every hour, not all of it.
    const share = (standing * FRAME) / (20 * HOUR_SECONDS);
    expect(share).toBeGreaterThan(0.05);
    expect(share).toBeLessThan(0.6);
  });
});

describe('the lot of Skywave Beach, past the shore (#219)', () => {
  const town = EVERY.find((t) => t.name === 'coast, beach building')!;
  const wait = (traffic: Traffic, until: number, look: (now: Traffic) => void) => {
    while (traffic.hours < until) {
      stepTraffic(traffic, FRAME, traffic.hours + FRAME / HOUR_SECONDS);
      look(traffic);
    }
  };

  it('runs its street on past the shore to a dead end, driven only by the cars of the lot', () => {
    const traffic = make(town, 7, clockHours(0, 8));
    // (Since #402 the street is a dead end at both ends, from the track to past the lot, and the street at x = -66 is driven as well.)
    const lanes = traffic.lanes.filter((lane) => lane.along === 'z' && Math.abs(lane.at - traffic.lanes[traffic.lot.lane!]!.at) < 3);
    expect(lanes.map((lane) => `${lane.direction}:${lane.startsAt}>${lane.endsAt}`).sort()).toEqual(['-1:dead>dead', '1:dead>dead']);
    const lot = traffic.lot.ground;
    const lane = traffic.lanes[traffic.lot.lane!]!;
    // The drive reaches past the lot's block.
    expect(Math.max(lane.origin, lane.origin + lane.direction * lane.length)).toBeGreaterThan(lot.z1);
    // Nobody else goes down it: whoever comes to the shore turns there. (The shore is the street along it, the last of the streets along x.)
    const shore = lane.direction > 0 ? lane.crossings.at(-1)! : lane.crossings[0]!;
    let past = 0;
    wait(traffic, traffic.hours + 600 / HOUR_SECONDS, (now) => {
      for (const v of vehiclesIn(now)) if (v.lane === traffic.lot.lane && !v.halt && v.s > shore.s + shore.half + 1) past++;
    });
    expect(past).toBe(0);
  });

  it('lets a car drive over the shore, turn in at the lot’s gate, park on time, leave, turn round and go north, without touching', () => {
    for (const seed of [7, 3]) {
      const traffic = make(town, seed, clockHours(0, 8));
      const lot = traffic.lot.ground;
      const bays = lot.bays.filter((b) => b.kind === 'car').slice(0, 3).map((b) => b.id);
      const due = clockHours(0, 9);
      bays.forEach((bay, n) => orderCar(traffic, `k${n}`, bay, due + n * 0.3, clockHours(0, 17)));
      const gate = lotGate(traffic, 0);
      const arrived = new Map<string, number>();
      const look = (now: Traffic) => {
        const hit = touching(now);
        if (hit) throw new Error(`A ${hit[0].kind} and a ${hit[1].kind} touch at ${now.hours.toFixed(3)} (seed ${seed}).`);
        for (const n of bays.keys()) {
          const car = lotCarFor(now, `k${n}`);
          if (car && !arrived.has(`k${n}`)) {
            arrived.set(`k${n}`, now.hours);
            // It turned in from the lane of the lot, within a tile of the gate.
            expect(Math.hypot(car.x - gate.x, car.z - gate.z), `car ${n} at the gate`).toBeLessThan(lot.gates.length > 1 ? 12 : 1.5);
            expect(car.x).toBeCloseTo(traffic.lanes[traffic.lot.lane!]!.at, 0);
          }
          if (car?.state === 'parked' && !arrived.has(`p${n}`)) arrived.set(`p${n}`, now.hours);
        }
      };
      wait(traffic, due + 0.3 * bays.length + 0.6, look);
      bays.forEach((_, n) => {
        expect(arrived.has(`k${n}`), `car ${n} turned in`).toBe(true);
        expect(arrived.get(`p${n}`)!, `car ${n} on time`).toBeLessThan(due + n * 0.3 + parkingHours(traffic) + carSlack(traffic) + 0.1);
      });
      // In the evening they leave, and go north: every one of them is seen in the lane the other way.
      const before = traffic.nextId;
      for (const n of bays.keys()) leaveLot(traffic, `k${n}`);
      const north = new Set<number>();
      wait(traffic, traffic.hours + 1.2, (now) => {
        look(now);
        for (const v of vehiclesIn(now)) if (v.id >= before && v.lane === traffic.lanes[traffic.lot.lane!]!.oncoming && v.s > 30) north.add(v.id);
      });
      expect(north.size).toBeGreaterThanOrEqual(bays.length);
    }
  }, 120_000);

  it('has the bus at its stop on time', () => {
    const traffic = make(town, 3, clockHours(1, 8));
    const first = Math.ceil(traffic.hours - BUS.due);
    for (let n = 0; n < 4; n++) {
      run(traffic, (first + n + BUS.due - traffic.hours) * HOUR_SECONDS);
      expect(busAtStop(traffic), `bus ${n}`).toBeDefined();
    }
  });
});

describe('the bus with go-via points (#330)', () => {
  /** A town of the game with the bus told to go via points (the files of the five towns have none). */
  const via = (id: string, region: keyof typeof SITES, building: Town['building'], points: { x: number; z: number }[]): Town => {
    const file = structuredClone(MAPS[id]!);
    if (points.length > 0) file.map.stops.bus.via = points;
    return { name: `${id} via ${points.length}`, layout: layoutFromMap(file, building), site: SITES[region], building };
  };

  it('is the plain way on a map with none', () => {
    for (const [id, region, building] of [['coaxia', 'capital', BUILDINGS.standard], ['amplify-hills', 'highlands', BUILDINGS.hills]] as const) {
      const route = roadsOf(via(id, region, building, []).layout).busRoute;
      expect(route.missed, id).toBeUndefined();
      expect(route.passes, id).toBeUndefined();
    }
  });

  it('drives the points in the order they are put down, counting its turns from the start', () => {
    // Coaxia: in on the one-way street north of the dual road, round the dual road and up the other one-way street to the stop.
    const points = [{ x: 25, z: 0.5 }];
    const town = via('coaxia', 'capital', BUILDINGS.standard, points);
    const route = roadsOf(town.layout).busRoute;
    const plain = roadsOf(via('coaxia', 'capital', BUILDINGS.standard, []).layout).busRoute;
    expect(route.missed).toBeUndefined();
    expect(route.passes).toBeUndefined();
    expect(route.stop).toBeGreaterThan(plain.stop);
    const { lanes } = roadsOf(town.layout);
    // The point lies on one of the stretches, before the stop.
    const holds = (leg: (typeof route.legs)[number]) => {
      const lane = lanes[leg.lane]!;
      const s = ((lane.along === 'x' ? points[0]!.x : points[0]!.z) - lane.origin) * lane.direction;
      return Math.abs(lane.at - (lane.along === 'x' ? points[0]!.z : points[0]!.x)) <= lane.half && s >= leg.from - 0.01 && s <= leg.to + 0.01;
    };
    const at = route.legs.findIndex(holds);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(at).toBeLessThan(route.legs.length - 1);
    // The turns of each stretch are counted from the start of the way, one more for each.
    route.legs.forEach((leg, i) => expect(leg.steps, `leg ${i}`).toBe(i));
    expect(route.steps.length).toBeGreaterThanOrEqual(route.legs.length - 1);
    // The length of the way is the length of its stretches.
    expect(route.stop).toBeCloseTo(route.legs.reduce((sum, leg) => sum + leg.to - leg.from, 0), 3);
    expect(route.legs.at(-1)!.lane).toBe(roadsOf(town.layout).busStop.lane);
  });

  it('says a point beyond the stop, which has the bus stand there early, and goes on without it', () => {
    for (const [town, point] of [[via('coaxia', 'capital', BUILDINGS.standard, [{ x: -22, z: -39.5 }]), 0], [via('amplify-hills', 'highlands', BUILDINGS.hills, [{ x: 85, z: -14.5 }]), 0]] as const) {
      const route = roadsOf(town.layout).busRoute;
      expect(route.passes, town.name).toBe(point);
    }
    // (Coaxia's one: the way is the plain one.)
    const route = roadsOf(via('coaxia', 'capital', BUILDINGS.standard, [{ x: -22, z: -39.5 }]).layout).busRoute;
    expect(route.stop).toBeCloseTo(roadsOf(via('coaxia', 'capital', BUILDINGS.standard, []).layout).busRoute.stop, 3);
  });

  it('has the bus at its stop on time through its points, in Coaxia and in Amplify Hills', () => {
    const towns = [via('coaxia', 'capital', BUILDINGS.standard, [{ x: 25, z: 0.5 }]), via('amplify-hills', 'highlands', BUILDINGS.hills, [{ x: 77.5, z: 27 }, { x: 20.5, z: 49 }])];
    for (const town of towns) {
      expect(roadsOf(town.layout).busRoute.passes, town.name).toBeUndefined();
      const traffic = make(town, 5, clockHours(0, 8));
      const first = Math.ceil(traffic.hours - BUS.due);
      for (let n = 0; n < 3; n++) {
        run(traffic, (first + n + BUS.due - traffic.hours) * HOUR_SECONDS);
        const bus = busAtStop(traffic);
        expect(bus, `${town.name}, bus ${n}`).toBeDefined();
        const at = placeOf(traffic, bus!);
        expect(at.x).toBeCloseTo(traffic.roads.busStop.x, 3);
        expect(at.z).toBeCloseTo(traffic.roads.busStop.z, 3);
      }
    }
  }, 120_000);
});
