import { describe, expect, it } from 'vitest';
import { FLOOR, WEST } from '../config/office';
import { sensibleBot } from '../sim/bots';
import { createInitialState } from '../sim/newGame';
import type { GameState } from '../sim/state';
import { tick } from '../sim/tick';
import { CITY } from './assets';
import { DAY, tripsOf, type Trip } from './day';
import { SITES } from './sites';
import { audienceBlocks } from './layout';
import { PLACES, ROUTES, WALK_HOURS, createStreet, onPavement, stepStreet, strollerAt, strollers, type Street } from './street';
import { touchingPerson } from './touching';
import { BUS, BUS_STOP, HOUR_SECONDS, LANES, TAXI, TAXI_STAND, busAtStop, clockHours, createTraffic, lightFor, orderTaxi, placeOf, releaseTaxi, stepTraffic, taxiFor, vehiclesIn, type Traffic, townHours } from './traffic';

const FRAME = 1 / 30;

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
  it('lead over the office’s own pavement: no street is crossed and nobody walks through the building', () => {
    for (const route of Object.values(ROUTES)) {
      for (let i = 1; i < route.length; i++) {
        const [from, to] = [route[i - 1]!, route[i]!];
        // Straight along one side of the block.
        expect(from[0] === to[0] || from[1] === to[1] || Math.hypot(from[0] - to[0], from[1] - to[1]) < 1.5).toBe(true);
        for (let step = 0; step <= 20; step++) {
          const x = from[0] + ((to[0] - from[0]) * step) / 20;
          const z = from[1] + ((to[1] - from[1]) * step) / 20;
          expect(onPavement(x, z), `${x.toFixed(1)}, ${z.toFixed(1)}`).toBe(true);
        }
      }
      expect(route.at(-1)).toEqual(PLACES.door);
    }
    // The door is at the entrance of the building, just outside it.
    expect(PLACES.door[0]).toBeLessThan(WEST);
    expect(PLACES.door[0]).toBeGreaterThan(WEST - 0.5);
    expect(PLACES.door[1]).toBe(FLOOR.corridorY + 0.5);
  });

  it('take no longer than the working day reckons with', () => {
    expect(WALK_HOURS.bus).toBeLessThanOrEqual(DAY.busWalk);
    expect(WALK_HOURS.bus).toBeGreaterThan(DAY.busWalk / 2);
    expect(WALK_HOURS.taxi).toBeLessThan(0.25);
    expect(WALK_HOURS.walk).toBeLessThan(0.5);
  });

  it('start where the bus and the taxi stand', () => {
    expect(PLACES.stop[0]).toBe(BUS_STOP.x);
    expect(Math.abs(PLACES.stop[1] - BUS_STOP.z)).toBeLessThan(1.2);
    expect(Math.hypot(PLACES.taxi[0] - TAXI_STAND.x, PLACES.taxi[1] - TAXI_STAND.z)).toBeLessThan(1.2);
    // The taxi stands at the entrance, on the office's side of the street beside it.
    const lane = LANES[TAXI_STAND.lane]!;
    expect(lane.along).toBe('z');
    expect(lane.at).toBeLessThan(WEST);
    expect(Math.abs(TAXI_STAND.z - PLACES.door[1])).toBeLessThan(1.5);
    for (const crossing of lane.crossings) expect(Math.abs(crossing.s - TAXI_STAND.s)).toBeGreaterThan(CITY.streetWidth / 2 + CITY.vehicles.taxi.length);
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
      run(due - TAXI.lead - 0.1);
      expect(vehiclesIn(traffic).some((v) => v.halt?.key === 'robin')).toBe(false);
      run(due);
      const taxi = taxiFor(traffic, 'robin')!;
      expect(taxi, `seed ${seed}`).toBeDefined();
      expect(taxi.kind).toBe('taxi');
      expect(placeOf(traffic, taxi).x).toBeCloseTo(TAXI_STAND.x, 3);
      expect(placeOf(traffic, taxi).z).toBeCloseTo(TAXI_STAND.z, 3);
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
        expect(vehiclesIn(traffic).some((v) => v.kind === 'taxi' && v.halt?.state === 'standing' && Math.abs(placeOf(traffic, v).z - TAXI_STAND.z) < 0.01)).toBe(true);
      }
      if (out < Infinity && now.walkers.length === 0 && done === Infinity) done = traffic.hours;
    });
    expect(out).toBeGreaterThan(clockHours(0, 11.5));
    expect(done).toBeLessThan(clockHours(0, 12.2));
    expect(done - out).toBeCloseTo(WALK_HOURS.taxi, 1);
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
      // Down the pavement beside the office, and in at the door.
      expect(w.x).toBeGreaterThan(PLACES.away[0] - 0.3);
      expect(w.x).toBeLessThanOrEqual(PLACES.door[0]);
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
      const traffic = createTraffic(seed, clockHours(0, 9));
      const street = createStreet(strollers(seed, 60));
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
    const traffic = createTraffic(7, clockHours(0, 9));
    const street = createStreet(strollers(7, 60));
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
    const traffic = createTraffic(5, clockHours(0, 8));
    const street = createStreet(strollers(5, 60));
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
    for (const seed of [1, 7, 12345]) {
      const walking = strollers(seed);
      expect(walking).toHaveLength(SITES.capital.strollers);
      for (const stroller of walking) {
        for (let time = 0; time < 120; time += 0.37) {
          const at = strollerAt(stroller, time);
          expect(onPavement(at.x, at.z), `seed ${seed}: ${at.x.toFixed(2)}, ${at.z.toFixed(2)}`).toBe(true);
        }
      }
    }
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
