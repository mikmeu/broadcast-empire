import { describe, expect, it } from 'vitest';
import { BUILDINGS, FLOOR, coreOf, westOf } from '../config/office';
import { sensibleBot } from '../sim/bots';
import { createInitialState } from '../sim/newGame';
import type { GameState } from '../sim/state';
import { tick } from '../sim/tick';
import { CITY } from './assets';
import { DAY, tripsOf, type Trip } from './day';
import { SITES } from './sites';
import { audienceBlocks } from './layout';
import { createStreet, onPavement, placesOf, routesOf, stepStreet, strollerAt, strollers, walkHoursOf, type Street } from './street';
import { CAPITAL, GRID, layoutOf, type Layout } from './townLayout';
import { touchingPerson } from './touching';
import { BUS, HOUR_SECONDS, TAXI, busAtStop, clockHours, createTraffic, lightFor, orderTaxi, placeOf, releaseTaxi, roadsOf, stepTraffic, taxiFor, taxiLead, vehiclesIn, type Traffic, townHours } from './traffic';

const FRAME = 1 / 30;

/** The building a town is laid out round: the grid round the standard one, the capital's drawing round the U (0.20.0). */
const houseOf = (layout: Layout) => (layout === GRID ? BUILDINGS.standard : BUILDINGS.courtyard);
/** Where the entrance is: the west face of the building, in line with the middle of its hall. */
const entranceOf = (layout: Layout) => {
  const { hall } = coreOf(houseOf(layout));
  return { face: westOf(houseOf(layout)), z: hall.y + hall.h / 2 };
};

/** A grid town with the capital's traffic: where the people out for a walk cross the streets, which the map’s big blocks do not let them. */
const gridTraffic = (seed: number, hours: number) => createTraffic(seed, hours, SITES.capital.traffic, BUILDINGS.standard, false, GRID);

function station(): GameState {
  let s = createInitialState(1);
  for (let day = 0; day < 30; day++) s = tick(sensibleBot(s));
  return s;
}

/** A town and its street on a day, moved on a frame at a time. */
function world(seed: number, day: number, hour: number) {
  const dawn = clockHours(day, 8);
  const traffic = createTraffic(seed, clockHours(day, hour));
  const street = createStreet();
  const run = (trips: Trip[], toHour: number, look?: (street: Street, traffic: Traffic) => void) => {
    const until = clockHours(day, toHour);
    while (traffic.hours < until) {
      const hours = traffic.hours + FRAME / HOUR_SECONDS;
      stepTraffic(traffic, FRAME, hours);
      stepStreet(street, traffic, trips, dawn, hours, FRAME);
      look?.(street, traffic);
    }
  };
  return { traffic, street, run, dawn };
}

const trip = (id: string, way: Trip['way'], travel: Trip['travel'], at: number): Trip => ({ key: `0:${id}:${way}`, id, name: id, way, travel, at });

describe('the ways to the entrance (Phase 11e)', () => {
  it('lead over the office’s own ground: no street is crossed and nobody walks through the building', () => {
    for (const layout of [GRID, CAPITAL]) {
      const roads = roadsOf(layout);
      const places = placesOf(roads);
      for (const route of Object.values(routesOf(roads))) {
        for (let i = 1; i < route.length; i++) {
          const [from, to] = [route[i - 1]!, route[i]!];
          // Straight along one side of the block (over the company's own ground a way may run slantwise to the taxi stand).
          expect(layout !== GRID || from[0] === to[0] || from[1] === to[1] || Math.hypot(from[0] - to[0], from[1] - to[1]) < 1.5).toBe(true);
          for (let step = 0; step <= 20; step++) {
            const x = from[0] + ((to[0] - from[0]) * step) / 20;
            const z = from[1] + ((to[1] - from[1]) * step) / 20;
            expect(onPavement(x, z, houseOf(layout), layout), `${layout.id}: ${x.toFixed(1)}, ${z.toFixed(1)}`).toBe(true);
          }
        }
        expect(route.at(-1)).toEqual(places.door);
      }
      // The door is at the entrance of the building, just outside it.
      const { face, z } = entranceOf(layout);
      expect(places.door[0]).toBeLessThan(face);
      expect(places.door[0]).toBeGreaterThan(face - 0.5);
      expect(places.door[1]).toBe(z);
    }
    expect(entranceOf(GRID).z).toBe(FLOOR.corridorY + 0.5);
  });

  it('take no longer than the working day reckons with', () => {
    for (const layout of [GRID, CAPITAL]) {
      const walk = walkHoursOf(roadsOf(layout));
      expect(walk.bus, layout.id).toBeLessThanOrEqual(DAY.busWalk);
      // (In the capital the bus stop is 3 tiles from the door of the U, so the walk is short.)
      if (layout === GRID) expect(walk.bus, layout.id).toBeGreaterThan(DAY.busWalk / 2);
      expect(walk.taxi, layout.id).toBeLessThan(0.25);
      expect(walk.walk, layout.id).toBeLessThan(0.5);
    }
  });

  it('take the bus rider no longer than a road lets them in Aerial Fields and Amplify Hills (#218)', () => {
    // The road is further from the door there than the working day reckons with (DAY.busWalk): at most twice as far, and the taxi and the walk are as short as elsewhere.
    for (const site of [SITES.heartland, SITES.highlands]) {
      const walk = walkHoursOf(roadsOf(layoutOf(site)));
      expect(walk.bus, site.kind).toBeLessThanOrEqual(2 * DAY.busWalk);
      expect(walk.taxi, site.kind).toBeLessThan(0.25);
      expect(walk.walk, site.kind).toBeLessThan(0.5);
    }
  });

  it('start where the bus and the taxi stand', () => {
    for (const layout of [GRID, CAPITAL]) {
      const roads = roadsOf(layout);
      const places = placesOf(roads);
      expect(Math.hypot(places.stop[0] - roads.busStop.wait.x, places.stop[1] - roads.busStop.wait.z), layout.id).toBeLessThan(1.2);
      expect(Math.hypot(places.taxi[0] - roads.taxiStand.x, places.taxi[1] - roads.taxiStand.z), layout.id).toBeLessThan(2);
      // The taxi stands at the entrance, on the office's side of the street beside it.
      const lane = roads.lanes[roads.taxiStand.lane]!;
      expect(lane.along).toBe('z');
      expect(lane.at).toBeLessThan(entranceOf(layout).face);
      // (Where the town is laid out from a drawing the taxi stands north of the bus, which stands level with the door: 6 tiles off.)
      expect(Math.abs(roads.taxiStand.z - places.door[1])).toBeLessThan(layout === GRID ? 1.5 : 7);
      for (const crossing of lane.crossings) expect(Math.abs(crossing.s - roads.taxiStand.s)).toBeGreaterThan(layout.streetWidth / 2 + CITY.vehicles.taxi.length);
    }
  });

  it('start in the map’s town on the reception’s street, the kerb the drawing has its bus stop on, west of the entrance', () => {
    const roads = roadsOf(CAPITAL);
    const places = placesOf(roads);
    // (Level with the door of the U, three tiles off its west face, as in the drawing.)
    expect(places.stop[0]).toBeLessThan(places.gate[0]);
    expect(places.stop[0]).toBeGreaterThan(places.gate[0] - 5);
    expect(places.taxi[0]).toBe(places.stop[0]);
    // The people who come on foot come down the alleyway behind the office, in line with the entrance.
    expect(places.away[0]).toBe(places.gate[0]);
    expect(places.away[1]).toBeLessThan(0);
  });
});

describe('taxis to order (Phase 11e)', () => {
  it('stand at the door when they are due, wait for their passenger and drive on when let go', () => {
    for (const seed of [1, 7, 12345]) {
      const traffic = createTraffic(seed, clockHours(0, 9));
      const due = clockHours(0, 12);
      orderTaxi(traffic, 'robin', due);
      orderTaxi(traffic, 'robin', due + 5);
      expect(traffic.orders).toHaveLength(1);
      const run = (toHours: number) => {
        while (traffic.hours < toHours) stepTraffic(traffic, FRAME, traffic.hours + FRAME / HOUR_SECONDS);
      };
      run(due - taxiLead(traffic.roads) - 0.1);
      expect(vehiclesIn(traffic).some((v) => v.halt?.key === 'robin')).toBe(false);
      run(due);
      const taxi = taxiFor(traffic, 'robin')!;
      expect(taxi, `seed ${seed}`).toBeDefined();
      expect(taxi.kind).toBe('taxi');
      expect(placeOf(traffic, taxi).x).toBeCloseTo(traffic.roads.taxiStand.x, 3);
      expect(placeOf(traffic, taxi).z).toBeCloseTo(traffic.roads.taxiStand.z, 3);
      // Nobody gets in: it is still there a while later (in the street's own pace, 0.16.0).
      run(due + townHours(0.5));
      expect(taxiFor(traffic, 'robin')).toBe(taxi);
      releaseTaxi(traffic, 'robin');
      run(due + townHours(0.8));
      expect(taxiFor(traffic, 'robin')).toBeUndefined();
      expect(taxi.halt!.state).toBe('done');
    }
  });

  it('do not wait for ever', () => {
    const traffic = createTraffic(3, clockHours(0, 9));
    const due = clockHours(0, 11.5);
    orderTaxi(traffic, 'nobody', due);
    while (traffic.hours < due + TAXI.patience + 0.3) stepTraffic(traffic, FRAME, traffic.hours + FRAME / HOUR_SECONDS);
    expect(taxiFor(traffic, 'nobody')).toBeUndefined();
  });
});

describe('coming and going in the street (Phase 11e)', () => {
  it('lets a busload out when the bus stands at the stop, and walks them to the door in time', () => {
    const { street, run } = world(7, 0, 8);
    const trips = Array.from({ length: 6 }, (_, n) => trip(`rider${n}`, 'in', 'bus', 8.75 + DAY.busWalk));
    let first = Infinity;
    let withBus = false;
    const gone = new Map<string, number>();
    run(trips, 10, (now, traffic) => {
      if (now.walkers.length > 0 && first === Infinity) {
        first = traffic.hours;
        withBus = busAtStop(traffic) !== undefined;
      }
      for (const t of trips) if (now.begun.has(t.key) && !now.walkers.some((w) => w.key === t.key) && !gone.has(t.key)) gone.set(t.key, traffic.hours);
      for (const w of now.walkers) expect(onPavement(w.x, w.z), `${w.x.toFixed(2)}, ${w.z.toFixed(2)}`).toBe(true);
    });
    // They got out of a bus that stood there, around a quarter to nine, and all reached the door.
    expect(withBus).toBe(true);
    expect(first).toBeGreaterThan(clockHours(0, 8.35));
    expect(first).toBeLessThan(clockHours(0, 8.9));
    expect(gone.size).toBe(6);
    for (const at of gone.values()) expect(at).toBeLessThan(clockHours(0, 9.75));
    expect(street.walkers).toEqual([]);
  });

  it('brings someone by taxi to the door on the hour, and lets the taxi drive on', () => {
    const { street, run } = world(7, 0, 9);
    const trips = [trip('host', 'in', 'taxi', 12)];
    let out = Infinity;
    let done = Infinity;
    run(trips, 13, (now, traffic) => {
      if (now.walkers.length > 0 && out === Infinity) {
        out = traffic.hours;
        // Their own taxi stands at the door as they get out.
        expect(vehiclesIn(traffic).some((v) => v.kind === 'taxi' && v.halt?.state === 'standing' && Math.abs(placeOf(traffic, v).z - traffic.roads.taxiStand.z) < 0.01)).toBe(true);
      }
      if (out < Infinity && now.walkers.length === 0 && done === Infinity) done = traffic.hours;
    });
    expect(out).toBeGreaterThan(clockHours(0, 11.5));
    expect(done).toBeLessThan(clockHours(0, 12.2));
    expect(done - out).toBeCloseTo(walkHoursOf(roadsOf(CAPITAL)).taxi, 1);
    expect(street.walkers).toEqual([]);
  });

  it('has people on foot come round the back corner and be at the door on the hour', () => {
    const { run } = world(3, 0, 8);
    const trips = [trip('walker', 'in', 'walk', 9)];
    let seen = 0;
    let last = 0;
    run(trips, 9.5, (now, traffic) => {
      const w = now.walkers[0];
      if (!w) return;
      seen++;
      last = traffic.hours;
      // Down the way beside the office, and in at the door.
      const places = placesOf(roadsOf(CAPITAL));
      expect(w.x).toBeGreaterThan(places.away[0] - 0.3);
      expect(w.x).toBeLessThanOrEqual(places.door[0]);
      expect(onPavement(w.x, w.z)).toBe(true);
    });
    expect(seen).toBeGreaterThan(10);
    expect(last).toBeCloseTo(clockHours(0, 9), 1);
  });

  it('sends people home: on foot round the corner, by bus from the stop when one comes, by the taxi that was ordered for them', () => {
    const { street, run, traffic } = world(7, 0, 15);
    const trips = [trip('a', 'out', 'walk', 17.5), trip('b', 'out', 'bus', 17.5), trip('c', 'out', 'bus', 17.5), trip('d', 'out', 'taxi', 17.5)];
    const waited = { bus: 0, taxi: 0, car: 0 };
    let boarded = Infinity;
    let sent = false;
    run(trips, 19.5, (now, t) => {
      sent ||= t.orders.some((order) => order.key === '0:d:out' && order.sent);
      for (const w of now.walkers) {
        expect(onPavement(w.x, w.z)).toBe(true);
        if (w.path.length === 0 && w.wait) waited[w.wait]++;
      }
      if (now.begun.has('0:b:out') && !now.walkers.some((w) => w.wait === 'bus') && boarded === Infinity) boarded = t.hours;
    });
    expect(street.begun.size).toBe(4);
    expect(street.walkers).toEqual([]);
    // The two for the bus stood at the stop for a while, not on the same spot, and got on a bus that stood there.
    expect(waited.bus).toBeGreaterThan(5);
    // The quarter-to bus after they leave at half past five: the walk to the stop is a short one on today's clock (0.16.0).
    expect(boarded).toBeGreaterThan(clockHours(0, 17.5));
    expect(boarded).toBeLessThan(clockHours(0, 19));
    // The taxi was ordered before they came out, and is gone with them.
    // (The order itself is forgotten a while after it was due.)
    expect(sent).toBe(true);
    expect(taxiFor(traffic, '0:d:out')).toBeUndefined();
  });

  it('plays a whole day of a station without anyone left standing in the street at the end of it', () => {
    const s = station();
    const trips = tripsOf(s, 0, audienceBlocks(s));
    expect(trips.length).toBeGreaterThan(10);
    const { street, run } = world(s.seed, 0, 8);
    let most = 0;
    run(trips, 21.99, (now) => (most = Math.max(most, now.walkers.length)));
    expect(most).toBeGreaterThan(1);
    // Everyone who was to come or go has, but for the last ones still on their way home.
    expect(trips.filter((t) => !street.begun.has(t.key))).toEqual([]);
    expect(street.walkers.length).toBeLessThan(6);
  });
});

describe('people who cross the street (0.20.0)', () => {
  it('cross at a crossing with lights, only on a steady green for their way, and no vehicle ever touches them there', () => {
    for (const seed of [1, 7, 12345]) {
      const traffic = gridTraffic(seed, clockHours(0, 9));
      const street = createStreet(strollers(seed, 60, BUILDINGS.standard, GRID));
      expect(street.crossers.length).toBeGreaterThan(10);
      let crossings = 0;
      let on = 0;
      const sides = new Map<object, number>();
      for (let n = 0; n < 240 * 30; n++) {
        const hours = traffic.hours + FRAME / HOUR_SECONDS;
        stepTraffic(traffic, FRAME, hours);
        stepStreet(street, traffic, [], 0, hours, FRAME);
        for (const person of street.crossers) {
          if (sides.get(person) !== undefined && sides.get(person) !== person.side) crossings++;
          sides.set(person, person.side);
          if (person.phase !== 'cross') continue;
          on++;
          const hit = touchingPerson(traffic, person);
          if (hit) throw new Error(`Seed ${seed}: a ${hit.kind} touches someone on a crossing after ${traffic.time.toFixed(1)} s.`);
          // Nobody is on a crossing while the street they cross has anything but red.
          const light = lightFor(traffic, person.across.id, person.across.edge[1] as 'x' | 'z');
          expect(light, `seed ${seed}`).toBe('red');
        }
      }
      expect(crossings).toBeGreaterThan(5);
      expect(on).toBeGreaterThan(0);
    }
  }, 60_000);

  it('hold the lights no longer than a bus would: everyone who waits gets across in the end', () => {
    const traffic = gridTraffic(7, clockHours(0, 9));
    const street = createStreet(strollers(7, 60, BUILDINGS.standard, GRID));
    const waited = new Map<object, number>();
    let longest = 0;
    for (let n = 0; n < 600 * 30; n++) {
      const hours = traffic.hours + FRAME / HOUR_SECONDS;
      stepTraffic(traffic, FRAME, hours);
      stepStreet(street, traffic, [], 0, hours, FRAME);
      for (const person of street.crossers) {
        waited.set(person, person.phase === 'wait' ? (waited.get(person) ?? 0) + FRAME : 0);
        longest = Math.max(longest, waited.get(person)!);
      }
    }
    expect(longest).toBeLessThan(60);
  }, 60_000);

  it('keep the buses on time, as they are without them', () => {
    const traffic = gridTraffic(5, clockHours(0, 8));
    const street = createStreet(strollers(5, 60, BUILDINGS.standard, GRID));
    const first = Math.ceil(traffic.hours - BUS.due);
    for (let n = 0; n < 10; n++) {
      const due = first + n + BUS.due;
      while (traffic.hours < due) {
        const hours = traffic.hours + FRAME / HOUR_SECONDS;
        stepTraffic(traffic, FRAME, hours);
        stepStreet(street, traffic, [], 0, hours, FRAME);
      }
      expect(busAtStop(traffic), `bus ${n}`).toBeDefined();
    }
  }, 60_000);
});

describe('people out for a walk (Phase 11e)', () => {
  it('walk round a block on its pavement and never set foot on a street', () => {
    for (const layout of [GRID, CAPITAL]) {
      for (const seed of [1, 7, 12345]) {
        const walking = strollers(seed, undefined, BUILDINGS.standard, layout);
        expect(walking).toHaveLength(SITES.capital.strollers);
        for (const stroller of walking) {
          for (let time = 0; time < 120; time += 0.37) {
            const at = strollerAt(stroller, time);
            expect(onPavement(at.x, at.z, BUILDINGS.standard, layout), `${layout.id}, seed ${seed}: ${at.x.toFixed(2)}, ${at.z.toFixed(2)}`).toBe(true);
          }
        }
      }
    }
  });

  it('walk round the big blocks of the map, and cross no street there, where the blocks are bounded by streets without lights', () => {
    const walking = strollers(7, 60, BUILDINGS.standard, CAPITAL);
    // The blocks between the streets of the map are 43 tiles wide and more, and the crossings with lights are not beside any that strollers may go into.
    expect(walking.every((s) => s.w > 5)).toBe(true);
    expect(walking.some((s) => s.d > 40)).toBe(true);
    expect(walking.filter((s) => s.across)).toHaveLength(0);
  });

  it('keep moving at a walking pace, each at their own, and some round the office itself', () => {
    const walking = strollers(7);
    for (const stroller of walking) {
      const [a, b] = [strollerAt(stroller, 10), strollerAt(stroller, 10.5)];
      const step = Math.hypot(a.x - b.x, a.z - b.z);
      expect(step).toBeGreaterThan(0.3);
      expect(step).toBeLessThan(1);
    }
    expect(new Set(walking.map((s) => s.speed)).size).toBeGreaterThan(5);
    expect(new Set(walking.map((s) => s.direction)).size).toBe(2);
    expect(walking.some((s) => s.w > 10)).toBe(true);
    // The same people in the same game, others in another.
    expect(strollers(7)).toEqual(walking);
    expect(strollers(8)).not.toEqual(walking);
  });
});
