import { describe, expect, it } from 'vitest';
import { MS_PER_DAY } from '../config/balance';
import { BUILDINGS, FLOOR } from '../config/office';
import { daysInMonth, hourAt, monthNumber, officeHours, toDay } from '../sim/calendar';
import { CITY } from './assets';
import { OFFICE_BLOCK, RAILWAY, streets } from './city';
import { touching } from './touching';
import { BUS, BUS_STOP, HOUR_SECONDS, LANES, busAtStop, clockHours, createTraffic, lightFor, placeOf, signalsOf, stepTraffic, vehiclesIn, type Light, type Traffic } from './traffic';

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

describe('the streets', () => {
  it('have a lane each way on the streets beside and in front of the office, and none where the railway stands', () => {
    expect(LANES.length).toBeGreaterThanOrEqual(8);
    const lines = streets();
    for (const lane of LANES) {
      const street = lines.find((l) => l.along === lane.along && Math.abs(l.at - lane.at) < CITY.streetWidth / 2);
      expect(street).toBeDefined();
      if (lane.along === 'x') expect(Math.abs(lane.at - RAILWAY.z)).toBeGreaterThan(CITY.streetWidth / 2);
      // Never through the office.
      const span = lane.along === 'x' ? [0, FLOOR.h] : [0, BUILDINGS.standard.w];
      expect(lane.at < span[0]! || lane.at > span[1]!).toBe(true);
      // Keeping to the right: both lanes of a street lie on either side of its middle.
      expect(LANES.some((other) => other.along === lane.along && other.direction === -lane.direction && Math.abs(other.at - lane.at) === CITY.streetWidth / 2)).toBe(true);
    }
  });

  it('have the bus stop on the office’s own pavement, clear of the crossings', () => {
    const lane = LANES[BUS_STOP.lane]!;
    expect(lane.along).toBe('x');
    expect(lane.at).toBeGreaterThan(FLOOR.h);
    expect(lane.at).toBeLessThan(OFFICE_BLOCK.z + OFFICE_BLOCK.d);
    expect(BUS_STOP.wait.z).toBeLessThan(OFFICE_BLOCK.z + OFFICE_BLOCK.d - CITY.streetWidth / 2);
    expect(BUS_STOP.wait.z).toBeGreaterThan(FLOOR.h + 0.2);
    const bus = CITY.vehicles.bus.length / 2;
    for (const crossing of lane.crossings) expect(Math.abs(crossing.s - BUS_STOP.s)).toBeGreaterThan(CITY.streetWidth / 2 + bus + 0.5);
  });
});

describe('the traffic (Phase 11b)', () => {
  it('never lets two vehicles touch, in a lane or on a crossing', () => {
    for (const seed of SEEDS) {
      const traffic = createTraffic(seed, clockHours(0, 9));
      expect(vehiclesIn(traffic).length).toBeGreaterThan(20);
      // Four minutes, a frame at a time: a full day of buses and thousands of crossings.
      run(traffic, 240, (now) => {
        const hit = collision(now);
        if (hit) throw new Error(`A ${hit[0].kind} and a ${hit[1].kind} touch after ${now.time.toFixed(2)} s (seed ${seed}).`);
      });
    }
  });

  it('does not let them touch at the fastest speed either, when a frame is four times as long', () => {
    const traffic = createTraffic(3, clockHours(2, 14));
    run(traffic, 240, (now) => expect(collision(now)).toBeNull(), 4 * FRAME);
  });

  it('keeps everything moving: nobody stands still for long, and every lane is driven to its end', () => {
    for (const seed of SEEDS) {
      const traffic = createTraffic(seed, clockHours(0, 9));
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
      expect(seen.size).toBe(LANES.length);
      expect(traffic.left).toBeGreaterThan(LANES.length * 20);
    }
  });

  it('is not a procession: speeds, gaps and the kinds of vehicle differ', () => {
    const traffic = createTraffic(7, clockHours(0, 12));
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
    expect([...kinds].sort()).toEqual(['bus', 'car', 'taxi', 'truck', 'van']);
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
      const traffic = createTraffic(seed, clockHours(1, 10));
      run(traffic, 20);
      return vehiclesIn(traffic).map((v) => `${v.kind}:${v.lane}:${v.s.toFixed(3)}`).join();
    };
    expect(picture(5)).toBe(picture(5));
    expect(picture(5)).not.toBe(picture(6));
  });
});

describe('lights, turns and overtaking (0.11.0)', () => {
  it('has lights at every crossing of two busy streets, and drives onto a crossing only on green', () => {
    const traffic = createTraffic(4, clockHours(0, 10));
    const signals = signalsOf(traffic);
    expect(signals.length).toBeGreaterThanOrEqual(30);
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
    const traffic = createTraffic(9, clockHours(0, 11));
    const turning = new Map<number, number>();
    let done = 0;
    run(traffic, 120, (now) => {
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
        // Buses and trucks keep to their street.
        if (v.turn) expect(['car', 'taxi', 'van']).toContain(v.kind);
      }
    });
    expect(done).toBeGreaterThan(50);
  });

  it('overtakes a bus or a taxi that stands at the kerb, on the other side of the road', () => {
    let passes = 0;
    for (const seed of SEEDS) {
      const traffic = createTraffic(seed, clockHours(0, 9));
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
    expect(passes).toBeGreaterThan(5);
  });
});

describe('the bus (Phase 11b)', () => {
  it('stands at the stop at a quarter to every hour, all day and into the next', () => {
    for (const seed of SEEDS) {
      // From eight in the morning: the first bus is due at a quarter to nine.
      const traffic = createTraffic(seed, clockHours(0, 8));
      const first = Math.ceil(traffic.hours - BUS.due);
      for (let n = 0; n < 30; n++) {
        const due = first + n + BUS.due;
        run(traffic, (due - traffic.hours) * HOUR_SECONDS);
        const bus = busAtStop(traffic);
        expect(bus, `seed ${seed}, bus ${n}`).toBeDefined();
        const at = placeOf(traffic, bus!);
        expect(at.x).toBeCloseTo(BUS_STOP.x, 3);
        expect(at.z).toBeCloseTo(BUS_STOP.z, 3);
      }
    }
  });

  it('drives on after its stop, so there are never many buses in town', () => {
    const traffic = createTraffic(7, clockHours(0, 8));
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
