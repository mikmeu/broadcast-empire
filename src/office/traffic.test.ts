import { describe, expect, it } from 'vitest';
import { MS_PER_DAY } from '../config/balance';
import { BUILDINGS, FLOOR } from '../config/office';
import { REGIONS } from '../config/world';
import { daysInMonth, hourAt, monthNumber, officeHours, toDay } from '../sim/calendar';
import { CITY } from './assets';
import { SITES } from './sites';
import { CORNER_TOWN, DEAD_END_TOWN, RING_TOWN, SYNTHETIC_TOWNS, T_TOWN } from './syntheticTowns';
import { CAPITAL, GRID, layoutOf, type Layout } from './townLayout';
import { touching } from './touching';
import { BUS, HOUR_SECONDS, busAtStop, clockHours, createTraffic, lightFor, placeOf, roadsOf, signalsOf, stepTraffic, vehiclesIn, type Light, type Traffic } from './traffic';

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

const collision = touching;

/** A town to try the traffic in: a region's, with the building the office is in. */
interface Town {
  name: string;
  layout: Layout;
  site: (typeof SITES)[keyof typeof SITES];
  building: (typeof BUILDINGS)[keyof typeof BUILDINGS];
}

/** Every region with both buildings: the capital's town is laid out from its drawing, the others are grids. */
const TOWNS: Town[] = REGIONS.flatMap(({ id }) =>
  // (The drawings of the valley and the coast have no street beyond the east one on the office's side that a longer building could stand beside, and they never get one.)
  Object.values(BUILDINGS).filter((building) => !((id === 'north' || id === 'coast') && building.id === 'long')).map((building): Town => ({ name: `${id}, ${building.id} building`, layout: layoutOf(SITES[id]), site: SITES[id], building })),
);

/** The made-up towns (syntheticTowns.ts): streets with ends of their own. They have the capital's traffic and the standard building. */
const MADE_UP: Town[] = SYNTHETIC_TOWNS.map((layout) => ({ name: layout.id, layout, site: SITES.capital, building: BUILDINGS.standard }));

const make = (town: Town, seed: number, hours: number) => createTraffic(seed, hours, town.site.traffic, town.building, town.site.front === 'water', town.layout);

/** The town as it was until 0.20.0 for the capital: a grid, with the capital's traffic. What was tuned on it is held to its old numbers. */
const OLD: Town = { name: 'a grid with the capital’s traffic', layout: GRID, site: SITES.capital, building: BUILDINGS.standard };

describe('the streets', () => {
  it('have a lane each way on the streets beside and in front of the office, and none where the railway stands', () => {
    for (const layout of [GRID, CAPITAL]) {
      const { lanes } = roadsOf(layout);
      expect(lanes.length).toBeGreaterThanOrEqual(layout === GRID ? 8 : 6);
      const lines = layout.streets(BUILDINGS.standard);
      for (const lane of lanes) {
        const street = lines.find((l) => l.along === lane.along && Math.abs(l.at - lane.at) < layout.streetWidth / 2);
        expect(street).toBeDefined();
        if (lane.along === 'x') expect(Math.abs(lane.at - layout.railway.z)).toBeGreaterThan(layout.streetWidth / 2);
        // Never through the office.
        const span = lane.along === 'x' ? [0, FLOOR.h] : [-6, BUILDINGS.standard.w];
        expect(lane.at < span[0]! || lane.at > span[1]!).toBe(true);
        // Keeping to the right: both lanes of a street lie on either side of its middle.
        expect(lanes.some((other) => other.along === lane.along && other.direction === -lane.direction && Math.abs(other.at - lane.at) === layout.streetWidth / 2)).toBe(true);
      }
    }
  });

  it('are four tiles wide in the capital, whose town is laid out from the map, and two everywhere else', () => {
    expect(CAPITAL.streetWidth).toBe(4);
    expect(GRID.streetWidth).toBe(CITY.streetWidth);
    for (const { id } of REGIONS) expect(layoutOf(SITES[id]).streetWidth).toBe(SITES[id].map ? 4 : 2);
    // Each lane lies in the middle of its half of the street: a lane of the map is two tiles.
    for (const lane of roadsOf(CAPITAL).lanes) {
      const street = CAPITAL.streets(BUILDINGS.standard).find((l) => l.along === lane.along && Math.abs(l.at - lane.at) < 2)!;
      expect(Math.abs(lane.at - street.at)).toBe(1);
    }
  });

  it('have the bus stop and the taxi stand on the reception’s street, on the office’s side, clear of the crossings and of each other', () => {
    for (const layout of [GRID, CAPITAL]) {
      const roads = roadsOf(layout);
      const own = layout.own(BUILDINGS.standard);
      const bus = CITY.vehicles.bus.length / 2;
      const taxi = CITY.vehicles.taxi.length / 2;
      const lane = roads.lanes[roads.busStop.lane]!;
      for (const [stop, half] of [[roads.busStop, bus], [roads.taxiStand, taxi]] as const) {
        const there = roads.lanes[stop.lane]!;
        // The office’s side of the street: the lane nearer the middle of its own block, with the pavement beyond it.
        const middle = there.along === 'x' ? own.z + own.d / 2 : own.x + own.w / 2;
        const street = layout.streets(BUILDINGS.standard).find((l) => l.along === there.along && Math.abs(l.at - there.at) < layout.streetWidth / 2)!;
        expect(Math.abs(there.at - middle)).toBeLessThan(Math.abs(street.at - middle));
        const wait = there.along === 'x' ? stop.wait.z : stop.wait.x;
        expect(Math.abs(wait - middle)).toBeLessThan(Math.abs(there.at - middle));
        for (const crossing of there.crossings) expect(Math.abs(crossing.s - stop.s)).toBeGreaterThan(layout.streetWidth / 2 + half + 0.5);
      }
      expect(lane.at).toBeGreaterThan(layout === GRID ? FLOOR.h : -Infinity);
      if (layout === CAPITAL) {
        // Both on the map’s reception street, in the same lane, a bus and a taxi apart.
        expect(roads.busStop.lane).toBe(roads.taxiStand.lane);
        expect(Math.abs(roads.busStop.s - roads.taxiStand.s)).toBeGreaterThan(bus + taxi + 1);
        // On the kerb the drawing has its bus stop on, west of the entrance.
        expect(roads.busStop.wait.x).toBeLessThan(-6);
      }
    }
  });

  it('have lights at the junctions of the busy streets of the map, and at no junction without one', () => {
    const roads = roadsOf(CAPITAL);
    const standard = CAPITAL.busy(BUILDINGS.standard);
    const across = { x: standard.filter((s) => s.along === 'x'), z: standard.filter((s) => s.along === 'z') };
    expect(roads.crossings).toHaveLength(across.x.length * across.z.length);
    for (const crossing of roads.crossings) {
      expect(across.z.some((s) => s.at === crossing.x)).toBe(true);
      expect(across.x.some((s) => s.at === crossing.z)).toBe(true);
    }
    // Streets whose kerbs are a tile or two apart are one road in the drawing: only one of them carries traffic.
    const lines = CAPITAL.streets(BUILDINGS.standard).filter((s) => s.along === 'x').map((s) => s.at);
    for (const a of across.x) for (const b of across.x) if (a !== b) expect(Math.abs(a.at - b.at) - CAPITAL.streetWidth).toBeGreaterThanOrEqual(4);
    expect(lines.length).toBeGreaterThan(across.x.length);
  });
});

describe.each([OLD, ...TOWNS, ...MADE_UP])('the traffic in $name (Phase 11b)', (town) => {
  const old = town === OLD;
  const seeds = old || town.name === 'capital, standard building' || MADE_UP.includes(town) ? SEEDS : [1];
  it('never lets two vehicles touch, in a lane or on a crossing', () => {
    for (const seed of seeds) {
      const traffic = make(town, seed, clockHours(0, 9));
      expect(vehiclesIn(traffic).length).toBeGreaterThan(old ? 20 : 3);
      // Four minutes, a frame at a time: a full day of buses and thousands of crossings.
      run(traffic, 240, (now) => {
        const hit = collision(now);
        if (hit) throw new Error(`A ${hit[0].kind} and a ${hit[1].kind} touch after ${now.time.toFixed(2)} s (seed ${seed}).`);
      });
    }
  });

  it('does not let them touch at the fastest speed either, when a frame is four times as long', () => {
    const traffic = make(town, 3, clockHours(2, 14));
    run(traffic, 240, (now) => expect(collision(now)).toBeNull(), 4 * FRAME);
  });

  it('keeps everything moving: nobody stands still for long, and every lane that is driven is driven to its end', () => {
    for (const seed of seeds) {
      const traffic = make(town, seed, clockHours(0, 9));
      const still = new Map<number, number>();
      const seen = new Set<number>();
      let longest = 0;
      run(traffic, 300, (now) => {
        for (const v of vehiclesIn(now)) {
          seen.add(v.lane);
          const standing = v.v === 0 && v.halt?.state !== 'standing' ? (still.get(v.id) ?? 0) + FRAME : 0;
          still.set(v.id, standing);
          longest = Math.max(longest, standing);
        }
      });
      expect(longest, `seed ${seed}`).toBeLessThan(20);
      const driven = traffic.closed.filter((closed) => !closed).length;
      expect(seen.size).toBe(driven);
      // Vehicles keep coming in at the start of each lane that has one (a lane by the water begins past the shore) and keep leaving.
      const entering = traffic.closed.filter((closed, l) => !closed && traffic.begins[l] === null && (!town.layout.edge || traffic.lanes[l]!.startsAt === 'edge')).length;
      expect(traffic.left).toBeGreaterThan(old ? driven * 20 : (0.4 * entering * 300) / town.site.traffic.every);
    }
  });
});

describe.each([OLD, ...TOWNS.filter((town) => town.building.id === 'standard' && town.site.traffic.every < 20)])('the traffic in $name: kinds and repeats', (town) => {
  it('is not a procession: speeds, gaps and the kinds of vehicle differ', () => {
    const traffic = make(town, 7, clockHours(0, 12));
    const kinds = new Set<string>();
    const speeds = new Set<number>();
    const tones = new Set<string>();
    let waited = 0;
    run(traffic, 120, (now) => {
      for (const v of vehiclesIn(now)) {
        kinds.add(v.kind);
        tones.add(v.tone);
        speeds.add(Math.round(v.speed * 10));
        if (v.v === 0) waited++;
      }
    });
    // (Where trucks are rare, as by the sea, a couple of minutes may go by without one.)
    expect([...kinds].sort()).toEqual(town.site.traffic.mix.truck >= 0.1 ? ['bus', 'car', 'taxi', 'truck', 'van'] : expect.arrayContaining(['bus', 'car', 'taxi', 'van']));
    expect(speeds.size).toBeGreaterThan(10);
    expect(tones.size).toBeGreaterThan(3);
    // Some have to wait for a crossing or for the one in front.
    expect(waited).toBeGreaterThan(0);
    // In a lane the gaps between vehicles are not all alike.
    const lane = traffic.queues.find((queue) => queue.length >= 4)!;
    const gaps = lane.slice(1).map((v, i) => Math.round(lane[i]!.s - v.s));
    expect(new Set(gaps).size).toBeGreaterThan(1);
  });

  it('is the same every time for the same game, and different for another', () => {
    const picture = (seed: number) => {
      const traffic = make(town, seed, clockHours(1, 10));
      run(traffic, 20);
      return vehiclesIn(traffic).map((v) => `${v.kind}:${v.lane}:${v.s.toFixed(3)}`).join();
    };
    expect(picture(5)).toBe(picture(5));
    expect(picture(5)).not.toBe(picture(6));
  });
});

describe.each([OLD, ...TOWNS])('lights, turns and overtaking in $name (0.11.0)', (town) => {
  const old = town === OLD;
  it('has lights at every crossing of two busy streets, and drives onto a crossing only on green', () => {
    const traffic = make(town, 4, clockHours(0, 10));
    const signals = signalsOf(traffic);
    // Lights where both streets of a crossing are driven, and nowhere else.
    const driven = traffic.crossings.map(() => ({ x: false, z: false }));
    traffic.lanes.forEach((lane, l) => {
      if (!traffic.closed[l]) for (const c of lane.crossings) driven[c.id]![lane.along] = true;
    });
    driven.forEach((axes, id) => expect(traffic.crossings[id]!.lights !== null, `crossing ${id}`).toBe(axes.x && axes.z));
    if (old) expect(signals.length).toBeGreaterThanOrEqual(30);
    else expect(signals.length).toBeGreaterThan(0);
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
    run(traffic, old ? 120 : 360, (now) => {
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
    expect(done).toBeGreaterThan(old ? 50 : 3);
  });

  it('overtakes a bus or a taxi that stands at the kerb, on the other side of the road', () => {
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
    expect(passes).toBeGreaterThan(old ? 5 : 0);
  });
});

describe.each([OLD, ...TOWNS, ...MADE_UP])('the bus in $name (Phase 11b)', (town) => {
  it('stands at the stop at a quarter to every hour, all day and into the next', () => {
    for (const seed of town === OLD ? SEEDS : [seedOf(town)]) {
      // From eight in the morning: the first bus is due at a quarter to nine.
      const traffic = make(town, seed, clockHours(0, 8));
      const first = Math.ceil(traffic.hours - BUS.due);
      for (let n = 0; n < (town === OLD ? 30 : 14); n++) {
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

  it('drives on after its stop, so there are never many buses in town', () => {
    const traffic = make(town, 7, clockHours(0, 8));
    let most = 0;
    let standing = 0;
    run(traffic, 20 * HOUR_SECONDS, (now) => {
      most = Math.max(most, vehiclesIn(now).filter((v) => v.kind === 'bus').length);
      if (busAtStop(now)) standing++;
    });
    expect(most).toBeLessThanOrEqual(6);
    // It stands there for a part of every hour, not all of it.
    const share = (standing * FRAME) / (20 * HOUR_SECONDS);
    expect(share).toBeGreaterThan(0.05);
    expect(share).toBeLessThan(0.6);
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
    expect(east.length).toBe(60 + 12);
    expect(east.origin).toBe(-6);
    const south = lanes.find((lane) => lane.along === 'z' && lane.direction === 1)!;
    // From the middle of the junction to the edge and past it.
    expect(south.origin).toBe(0);
    expect(south.length).toBe(30 + 6);
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

/** A seed of its own for each town, so that the towns are not all tried on one game. */
const seedOf = (town: Town) => 11 + TOWNS.indexOf(town);

describe('the clock the traffic runs on', () => {
  it('counts the hours on through the months, as the calendar does', () => {
    for (const [day, progress] of [[0, 0], [0, 0.5], [17, 0.25], [31, 0], [400, 0.9], [20000, 0.1]] as const) {
      expect(officeHours(day, progress)).toBeCloseTo(clockHours(monthNumber(day), hourAt(day, progress)), 9);
    }
    // An hour on the clock lasts about as long as the traffic reckons with: within a tenth, whatever the month.
    for (const month of [1, 2, 3, 4]) {
      const first = toDay(1970, month, 1);
      const seconds = (daysInMonth(first) * MS_PER_DAY) / 1000 / 14;
      expect(Math.abs(seconds - HOUR_SECONDS) / HOUR_SECONDS).toBeLessThan(0.1);
    }
  });
});
