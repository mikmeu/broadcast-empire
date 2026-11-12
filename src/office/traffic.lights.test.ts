import { describe, expect, it, vi } from 'vitest';
import { BUILDINGS } from '../config/office';
import { REGIONS } from '../config/world';
import { SITES } from './sites';
import { CORNER_TOWN, DEAD_END_TOWN, RING_TOWN, SYNTHETIC_TOWNS, T_TOWN } from './syntheticTowns';
import { layoutOf, type Layout } from './townLayout';
import { touching } from './touching';
import { BUS, HOUR_SECONDS, busAtStop, clockHours, createTraffic, lightFor, placeOf, roadsOf, signalsOf, stepTraffic, vehiclesIn, type Light, type Traffic } from './traffic';

// (Transponder Valley, drawn in #402, has streets 190 tiles long: its tests take 2 to 6 s alone and run over the default 5 s when the machine is busy.)
vi.setConfig({ testTimeout: 30_000 });

const SEEDS = [1, 7, 12345];
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

describe.each(TOWNS)('lights, turns and overtaking in $name (0.11.0)', (town) => {
  it('has lights at every crossing of two busy streets, and drives onto a crossing only on green', () => {
    const traffic = make(town, 4, clockHours(0, 10));
    const signals = signalsOf(traffic);
    // Lights where both streets of a crossing are driven, and nowhere else.
    const driven = traffic.crossings.map(() => ({ x: false, z: false }));
    traffic.lanes.forEach((lane, l) => {
      if (!traffic.closed[l]) for (const c of lane.crossings) driven[c.id]![lane.along] = true;
    });
    driven.forEach((axes, id) => expect(traffic.crossings[id]!.lights !== null, `crossing ${id}`).toBe(axes.x && axes.z));
    expect(signals.length).toBeGreaterThan(0);
    const shown = new Map<string, Set<Light>>();
    // What is held when the town is first shown was taken before.
    const held = new Map(vehiclesIn(traffic).map((v) => [v.id, [...v.holds]]));
    run(traffic, 120, (now) => {
      for (const signal of signals) {
        const key = `${signal.id}${signal.axis}`;
        shown.set(key, (shown.get(key) ?? new Set()).add(lightFor(now, signal.id, signal.axis)!));
      }
      for (const v of vehiclesIn(now)) {
        const lane = now.lanes[v.lane]!;
        for (const id of v.holds.filter((id) => !(held.get(v.id) ?? []).includes(id))) {
          // A crossing taken this frame: its lights were green for the street it came by.
          const light = lightFor(now, id, v.turn ? now.lanes[v.turn.from]!.along : lane.along);
          expect(light === 'green' || light === null, `${v.kind} on crossing ${id}`).toBe(true);
        }
        held.set(v.id, [...v.holds]);
      }
    });
    // Every light has been every color.
    for (const [key, lights] of shown) expect([...lights].sort(), key).toEqual(['amber', 'green', 'red']);
  });

  it('turns right at crossings, round the corner into the street it turns into', () => {
    const traffic = make(town, 9, clockHours(0, 11));
    const turning = new Map<number, number>();
    let done = 0;
    run(traffic, 360, (now) => {
      for (const v of vehiclesIn(now)) {
        if (v.turn) turning.set(v.id, v.turn.to);
        else if (turning.has(v.id)) {
          // Round the corner: in the lane it meant to turn into, and pointing its way.
          expect(v.lane).toBe(turning.get(v.id));
          const lane = now.lanes[v.lane]!;
          const angle = lane.along === 'x' ? (lane.direction > 0 ? 0 : Math.PI) : lane.direction > 0 ? -Math.PI / 2 : Math.PI / 2;
          expect(placeOf(now, v).angle).toBeCloseTo(angle, 6);
          turning.delete(v.id);
          done++;
        }
        // Buses and trucks keep to their street, except where it ends at the shore and everyone turns.
        if (v.turn && town.site.front !== 'water') expect(['car', 'taxi', 'van']).toContain(v.kind);
      }
    });
    expect(done).toBeGreaterThan(3);
  });

  // (A long timeout: Transponder Valley, drawn in #402, has streets 190 tiles long with a dozen crossings.)
  it('overtakes a bus or a taxi that stands at the kerb, on the other side of the road', { timeout: 30_000 }, () => {
    let passes = 0;
    for (const seed of SEEDS) {
      const traffic = make(town, seed, clockHours(0, 9));
      // Overtaking that was under way when the town was first shown is left aside.
      const seen = new Set(vehiclesIn(traffic).filter((v) => v.pass).map((v) => v.id));
      /** Where each vehicle that is being overtaken stood when that began: it stays there until the other is past. */
      const stood = new Map<number, number>();
      run(traffic, 240, (now) => {
        for (const v of vehiclesIn(now)) {
          if (v.passedBy !== undefined) {
            expect(v.s).toBeCloseTo(stood.get(v.id) ?? v.s, 9);
            stood.set(v.id, v.s);
          } else stood.delete(v.id);
          if (!v.pass || seen.has(v.id)) continue;
          seen.add(v.id);
          passes++;
          // It overtakes a bus or a taxi at its stop.
          const passed = vehiclesIn(now).find((o) => o.id === v.pass!.passing)!;
          expect(['bus', 'taxi']).toContain(passed.kind);
          expect(passed.halt).toBeDefined();
          expect(passed.passedBy).toBe(v.id);
        }
      });
    }
    expect(passes).toBeGreaterThan(0);
  });
});

describe('the roads of Aerial Fields and Amplify Hills (#218)', () => {
  const long = ROAD_TOWNS.filter((town) => town.building.id === 'hills' || town.building.id === 'fields');

  it('send no bus or truck into a dead end of their own accord: not into the stub at the west of Amplify Hills, nor any dead end with a truck, and only the bus that turns round after its stop in Aerial Fields', () => {
    for (const town of long) {
      for (const seed of SEEDS) {
        const traffic = make(town, seed, clockHours(0, 9));
        // The stretch of a lane past its last junction that ends in nothing (or before its first, if it begins in nothing).
        const inDeadEnd = (lane: number, s: number) => {
          const l = traffic.lanes[lane]!;
          const at = l.crossings.map((c) => c.s);
          return (l.endsAt === 'dead' && s > Math.max(...at)) || (l.startsAt === 'dead' && s < Math.min(...at));
        };
        // (Aerial Fields has no dead end since #399: its T-junction is gone, and two one-way roads close a loop round the lot.)
        expect(traffic.lanes.some((l) => l.startsAt === 'dead' || l.endsAt === 'dead'), town.name).toBe(town.site === SITES.highlands);
        const kinds = new Set<string>();
        run(traffic, 360, (now) => {
          // (Not one that is still turning round the corner at the junction, with its middle just past it.)
          for (const v of vehiclesIn(now)) if (!v.turn && inDeadEnd(v.lane, v.s)) kinds.add(v.kind);
        });
        // Nothing that cannot turn round is sent there, and (Amplify Hills) neither is the bus: it has a way out.
        expect(kinds.has('truck'), `${town.name} seed ${seed}`).toBe(false);
        if (town.site === SITES.highlands) expect(kinds.has('bus'), `${town.name} seed ${seed}`).toBe(false);
        // Cars, vans and taxis do go in, and out again (where there is a dead end).
        if (town.site === SITES.highlands) expect(kinds.size, `${town.name} seed ${seed}`).toBeGreaterThan(0);
      }
    }
  });

  it('let vehicles in only on the roads that reach the edge of the drawing, and have them all leave by one', () => {
    for (const town of long) {
      const traffic = make(town, 7, clockHours(0, 10));
      const entries = traffic.lanes.filter((lane) => lane.startsAt === 'edge').length;
      expect(entries, town.name).toBe(town.site === SITES.heartland ? 2 : 1);
      let seen = 0;
      run(traffic, 300, (now) => {
        seen = Math.max(seen, traffic.left);
        expect(vehiclesIn(now).length).toBeLessThan(60);
      });
      expect(seen, town.name).toBeGreaterThan(3);
    }
  });

  it('has the bus at its stop at a quarter to every hour with the other towns’ weather: any seed, and a frame four times as long', () => {
    for (const town of long) {
      for (const seed of [3, 5]) {
        const traffic = make(town, seed, clockHours(1, 8));
        const first = Math.ceil(traffic.hours - BUS.due);
        for (let n = 0; n < 6; n++) {
          const due = first + n + BUS.due;
          run(traffic, (due - traffic.hours) * HOUR_SECONDS, undefined, 2 * FRAME);
          expect(busAtStop(traffic), `${town.name}, seed ${seed}, bus ${n}`).toBeDefined();
        }
      }
    }
  });
});

describe('streets with ends of their own (#217)', () => {
  const armsOf = (layout: Layout) => roadsOf(layout).crossings.map((c) => c.arms).sort();

  it('have the junctions they are drawn with: a T, a corner, a dead end, a ring of corners with a T', () => {
    expect(armsOf(T_TOWN)).toEqual([3]);
    expect(armsOf(DEAD_END_TOWN)).toEqual([3]);
    expect(armsOf(CORNER_TOWN)).toEqual([2]);
    expect(armsOf(RING_TOWN)).toEqual([2, 2, 2, 2, 3]);
    // Where the town has lights: a crossing of four ways; none of these has one.
    for (const town of MADE_UP) expect(make(town, 1, clockHours(0, 9)).crossings.every((c) => c.lights === null)).toBe(true);
    // A lane runs from the edge to the junction, and the other way: the T's street from the south begins and ends in it.
    const stem = roadsOf(T_TOWN).lanes.filter((lane) => lane.along === 'z');
    expect(stem.map((lane) => `${lane.direction}:${lane.startsAt}>${lane.endsAt}`).sort()).toEqual(['-1:edge>junction', '1:junction>edge']);
    // A street that ends in nothing: each of its lanes starts or ends in a dead end.
    const stub = roadsOf(DEAD_END_TOWN).lanes.filter((lane) => lane.along === 'z');
    expect(stub.map((lane) => `${lane.direction}:${lane.startsAt}>${lane.endsAt}`).sort()).toEqual(['-1:dead>junction', '1:junction>dead']);
  });

  it('are as long as they are drawn, and run on past the edge only where they reach it', () => {
    const lanes = roadsOf(T_TOWN).lanes;
    const east = lanes.find((lane) => lane.along === 'x' && lane.direction === 1)!;
    // (The made-up towns are twice the size they were drawn at: 120 tiles of street, 60 of the one from the south.)
    expect(east.length).toBe(120 + 12);
    expect(east.origin).toBe(-6);
    const south = lanes.find((lane) => lane.along === 'z' && lane.direction === 1)!;
    // From the middle of the junction to the edge and past it.
    expect(south.origin).toBe(0);
    expect(south.length).toBe(60 + 6);
  });

  it.each(MADE_UP)('lets vehicles in only on lanes that start at the edge: $name', (town) => {
    for (const seed of [1, 7]) {
      const traffic = make(town, seed, clockHours(0, 9));
      const first = traffic.nextId;
      const seen = new Set<number>();
      let came = 0;
      run(traffic, 300, (now) => {
        for (const v of vehiclesIn(now)) {
          if (v.id < first || seen.has(v.id)) continue;
          seen.add(v.id);
          came++;
          expect(now.lanes[v.lane]!.startsAt, `${v.kind} came in on lane ${v.lane}`).toBe('edge');
        }
      });
      expect(came).toBeGreaterThan(3);
    }
  });

  it('turns left at a T-junction and at a corner, and turns round at a dead end', () => {
    const turned = (town: Town) => {
      const kinds = new Set<string>();
      for (const seed of [1, 7]) {
        const traffic = make(town, seed, clockHours(0, 9));
        run(traffic, 420, (now) => vehiclesIn(now).forEach((v) => v.turn && kinds.add(`${v.turn.kind}:${v.kind === 'bus' || v.kind === 'truck' ? 'big' : 'small'}`)));
      }
      return [...kinds];
    };
    expect(turned(MADE_UP[0]!)).toEqual(expect.arrayContaining(['left:small', 'right:small']));
    expect(turned(MADE_UP[1]!)).toEqual(expect.arrayContaining(['left:small', 'right:small', 'back:small']));
    expect(turned(MADE_UP[2]!)).toEqual(expect.arrayContaining(['left:small', 'right:small']));
    expect(turned(MADE_UP[3]!)).toEqual(expect.arrayContaining(['left:small', 'right:small']));
    // Nobody turns round but a car, a taxi or a van.
    expect(turned(MADE_UP[1]!)).not.toContain('back:big');
  }, 60_000);

  it('never sends a bus or a truck into a dead end', () => {
    for (const seed of [1, 7, 12345]) {
      const traffic = make(MADE_UP[1]!, seed, clockHours(0, 9));
      let big = 0;
      run(traffic, 420, (now) => {
        for (const v of vehiclesIn(now)) {
          if (v.kind === 'bus' || v.kind === 'truck') {
            big++;
            // The street from the south is the dead end: neither on it nor turning into it.
            expect(now.lanes[v.lane]!.along === 'z' || v.turn !== undefined, `${v.kind} in the dead end`).toBe(false);
          }
        }
      });
      // (They are about, on the main street.)
      expect(big).toBeGreaterThan(0);
    }
  }, 60_000);

  it('gives left turns and U-turns room: they wait for the lane they turn into, and for the box', () => {
    // A frame four times as long, as in the other tests, and several games.
    for (const town of MADE_UP) {
      for (const seed of [3, 4]) {
        const traffic = make(town, seed, clockHours(2, 14));
        run(traffic, 300, (now) => expect(touching(now)).toBeNull(), 4 * FRAME);
      }
    }
  }, 60_000);

  it('drives through traffic out of town after a few turns, so that nobody circles a ring road', () => {
    const traffic = make(MADE_UP[3]!, 5, clockHours(0, 9));
    let most = 0;
    run(traffic, 600, (now) => {
      for (const v of vehiclesIn(now)) most = Math.max(most, v.hops);
    });
    // Six turns of its own, and then the way out: the longest way round the ring from anywhere is a few more.
    expect(most).toBeLessThanOrEqual(14);
    expect(traffic.left).toBeGreaterThan(10);
  }, 60_000);

  it('sends the bus on a route: in from an edge, round the ring to its stop, and out again', () => {
    for (const town of MADE_UP) {
      const roads = roadsOf(town.layout);
      const route = roads.busRoute;
      expect(roads.lanes[route.entry]!.startsAt).toBe('edge');
      expect(route.legs.at(-1)!.lane).toBe(roads.busStop.lane);
      expect(route.stop).toBeGreaterThanOrEqual(roads.busStop.s);
      // No U-turns for a bus; and its last step gets it to an edge.
      expect(route.steps.every((step) => step.turn !== 'back')).toBe(true);
    }
    // The ring: the stop is on a lane that begins in a corner, so the bus has to come round to it.
    expect(roadsOf(RING_TOWN).busRoute.steps.length).toBeGreaterThanOrEqual(4);
    expect(roadsOf(T_TOWN).busRoute.steps).toEqual([]);
  });
});
