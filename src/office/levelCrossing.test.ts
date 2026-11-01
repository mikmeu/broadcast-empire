// Level crossings (0.21.0, #288): the schedule of a barrier, and the town test: three towns with a railway on the ground, in which no vehicle and
// no person touches a train, nothing stands on a track that is closed, and the bus is at its stop on time.

import { describe, expect, it } from 'vitest';
import { RAILWAY } from '../config/balance';
import { MAPS } from '../config/maps';
import { CITY } from './assets';
import { trainAt, trainLength } from './city';
import { bellAt, closedAt, closures, trackStretches, worstWait } from './levelCrossing';
import type { MapFile } from '../mods/mapFile';
import { SITES, siteOn, trainFiles } from './sites';
import { LEVEL_TOWN } from './syntheticTowns';
import { houseOf, layoutFromMap, type Layout } from './townLayout';
import { touching, touchingTrain, trainBox } from './touching';
import { BUS, HOUR_SECONDS, barriersOf, busAtStop, clockHours, createTraffic, mayStepOut, placeOf, roadsOf, stepOut, stepOff, stepTraffic, taxiLead, vehiclesIn, type Traffic } from './traffic';

const FRAME = 1 / 30;
const DOUBLE = trainFiles(['train-electric-double-a', 'train-electric-double-b', 'train-electric-double-b', 'train-electric-double-c']);
const GOODS = trainFiles(['train-diesel-a', 'train-carriage-container-red', 'train-carriage-tank', 'train-carriage-coal', 'train-carriage-container-blue', 'train-carriage-lumber']);

function run(traffic: Traffic, seconds: number, look?: (traffic: Traffic) => void): void {
  for (let n = Math.round(seconds / FRAME); n > 0; n--) {
    stepTraffic(traffic, FRAME, traffic.hours + FRAME / HOUR_SECONDS);
    look?.(traffic);
  }
}

/** How late the bus may be at its stop, in seconds (the town tests of the other towns do not allow it any: a barrier may cost it a moment). */
const LATE = 4;

/** Lets the time go by until the bus due at `due` (hours on the clock) should stand at its stop, and a little longer if it is late; whether it did. */
function busArrives(traffic: Traffic, due: number, look?: (traffic: Traffic) => void): boolean {
  run(traffic, (due - traffic.hours) * HOUR_SECONDS, look);
  for (let late = 0; !busAtStop(traffic) && late < LATE; late += FRAME) run(traffic, FRAME, look);
  return busAtStop(traffic) !== undefined;
}

/** A line 200 tiles long from x = 0, with a road across it at x = 100 (road 4 wide). */
const LINE = { z: 0, from: 0, length: 200, width: 4, strips: [] } as Layout['railway'];
const line = { railway: LINE } as Layout;
const ROAD = { x: 100, half: 2 };

describe('the schedule of a barrier', () => {
  const { speed, every } = CITY.railway;
  const length = trainLength(DOUBLE);

  it('closes before the front of the train reaches the road and opens after its tail has left it', () => {
    // The first train goes east and enters at time 0: its front is at the road's near edge (x = 98) after 9.8 s.
    const front = (98 - 0) / speed;
    const tail = (102 + length) / speed;
    expect(closedAt(front - RAILWAY.closed.before - 0.1, ROAD, DOUBLE, line)).toBe(false);
    expect(closedAt(front - RAILWAY.closed.before + 0.1, ROAD, DOUBLE, line)).toBe(true);
    expect(closedAt(tail + RAILWAY.closed.after - 0.1, ROAD, DOUBLE, line)).toBe(true);
    expect(closedAt(tail + RAILWAY.closed.after + 0.1, ROAD, DOUBLE, line)).toBe(false);
  });

  it('is shut whenever the train drawn is on the road, in both directions and across many passes', () => {
    for (let t = -40; t < 400; t += 0.25) {
      const at = trainAt(t, DOUBLE, line);
      const on = at !== null && (at.direction > 0 ? at.x > 98 && at.x - length < 102 : at.x < 102 && at.x + length > 98);
      if (on) expect(closedAt(t, ROAD, DOUBLE, line), `t = ${t}`).toBe(true);
    }
  });

  it('is open between the trains, and the westbound train closes it as long as the eastbound one', () => {
    const spans = closures(0, 4 * every, ROAD, DOUBLE, line);
    expect(spans.length).toBeGreaterThanOrEqual(3);
    const long = spans.filter((s) => s.from > 0 && s.to < 4 * every).map((s) => s.to - s.from);
    for (const l of long) expect(l).toBeCloseTo(length / speed + (4 + 0) / speed + RAILWAY.closed.before + RAILWAY.closed.after, 5);
  });

  it('closes both ends of the line for longer when the train enters or leaves just after another has', () => {
    // A road near the east end: the eastbound train leaves as the westbound one enters, and the barrier hardly opens between them.
    const end = { x: 196, half: 2 };
    const near = worstWait(end, DOUBLE, line);
    const middle = worstWait(ROAD, DOUBLE, line);
    expect(near).toBeGreaterThan(middle);
    expect(near).toBeLessThan(40);
  });

  it('closes for a train of six pieces longer than for one of four', () => {
    expect(worstWait(ROAD, GOODS, line)).toBeGreaterThan(worstWait(ROAD, DOUBLE, line));
    expect(closedAt(0.5 * every, ROAD, GOODS, line)).toBeDefined();
  });

  it('rings the bell at the nearest crossing that is closed, once for each closing', () => {
    const roads = [
      { x: 90, half: 2 },
      { x: 100, half: 2 },
      { x: 110, half: 2 },
    ];
    // All three are closed at once, as the first train crosses the second.
    const t = (100 - 0) / speed;
    expect(bellAt(t, roads, 0, DOUBLE, line)?.crossing).toBe(0);
    expect(bellAt(t, roads, 190, DOUBLE, line)?.crossing).toBe(2);
    const a = bellAt(t, roads, 100, DOUBLE, line);
    const b = bellAt(t + 1, roads, 100, DOUBLE, line);
    expect(a?.crossing).toBe(1);
    expect(b?.since).toBe(a?.since);
    expect(bellAt(-5, [], 0, DOUBLE, line)).toBeNull();
  });

  it('lays the track between the roads', () => {
    expect(trackStretches(line, [])).toEqual([{ from: 0, to: 200 }]);
    expect(trackStretches(line, [{ x: 100, half: 2 }])).toEqual([
      { from: 0, to: 98 },
      { from: 102, to: 200 },
    ]);
    expect(trackStretches(line, [{ x: 1, half: 2 }, { x: 198, half: 2 }])).toEqual([{ from: 3, to: 196 }]);
  });
});

// --- The towns ---

/** A map with its railway on the ground, 4 tiles wide, moved `down` tiles to the south (the default towns' tracks are elevated and 2 wide). */
function onGround(id: string, down: number, extra: (map: MapFile['map']) => MapFile['map'] = (map) => map): MapFile {
  const file = MAPS[id]!;
  const t = file.map.train!;
  return { ...file, settings: { ...file.settings, railway: 'ground' }, map: extra({ ...file.map, train: { ...t, y: t.y + down - 1, h: 4 } }) };
}

interface TownCase {
  name: string;
  file: MapFile;
}

const TOWNS: TownCase[] = [
  { name: 'Coaxia, track moved and widened', file: onGround('coaxia', 14) },
  { name: 'Skywave Beach, track moved and widened', file: onGround('skywave-beach', 0) },
  // A town of roads: the road that ends at the one across the town runs on south, across the track, to the edge of the drawing.
  { name: 'Amplify Hills, with a road across the track', file: onGround('amplify-hills', 10, (map) => ({ ...map, lanes: [...map.lanes, { x: 97, y: 28, w: 2, h: 48, dir: 'both' }] })) },
];

function make(file: MapFile, seed: number, hours: number, at = 1000 + seed): Traffic {
  const layout = layoutFromMap(file);
  const site = siteOn(SITES[file.id === 'coaxia' ? 'capital' : file.id === 'skywave-beach' ? 'coast' : 'highlands']!, file);
  return createTraffic(seed, hours, site.traffic, houseOf(file), site.front === 'water', layout, { cars: site.train, at });
}

describe('the traffic at a level crossing', () => {
  it('builds a crossing where a street meets a track on the ground, with its barrier on the right of each lane, and none on an elevated one', () => {
    const roads = roadsOf(LEVEL_TOWN);
    expect(roads.crossings.filter((c) => c.rail)).toHaveLength(1);
    const traffic = createTraffic(1, clockHours(0, 9), SITES.capital.traffic, undefined, false, LEVEL_TOWN, { cars: DOUBLE, at: 0 });
    expect(barriersOf(traffic)).toHaveLength(2);
    for (const file of Object.values(MAPS)) expect(roadsOf(layoutFromMap(file)).crossings.filter((c) => c.rail)).toHaveLength(0);
  });

  it('lets nobody onto the track when the barrier is down, nor leaves anybody standing on it, and never touches the train', () => {
    for (const seed of [1, 7, 12345]) {
      const traffic = createTraffic(seed, clockHours(0, 9), SITES.capital.traffic, undefined, false, LEVEL_TOWN, { cars: DOUBLE, at: 50 * seed });
      const crossing = roadsOf(LEVEL_TOWN).crossings.find((c) => c.rail)!;
      let crossed = 0;
      const was = new Map<number, number>();
      let closed = 0;
      run(traffic, 300, (now) => {
        expect(touching(now), `seed ${seed}`).toBeNull();
        expect(touchingTrain(now), `seed ${seed}, train ${JSON.stringify(trainBox(now))}`).toBeNull();
        const barrier = now.crossings[crossing.id]!.barrier!;
        if (barrier.closed) closed++;
        for (const v of vehiclesIn(now)) {
          const { z } = placeOf(now, v);
          const side = z < crossing.z ? -1 : 1;
          const before = was.get(v.id);
          if (before !== undefined && before !== side) crossed++;
          was.set(v.id, side);
          // Standing still on the track (its box, with the vehicle's own length) while the barrier is down: not one.
          if (barrier.closed && v.v === 0 && Math.abs(z - crossing.z) < 2 + v.length / 2) throw new Error(`A ${v.kind} stands on the track while it is closed (seed ${seed}, ${now.time.toFixed(1)} s).`);
        }
      });
      expect(crossed, `seed ${seed}`).toBeGreaterThan(5);
      expect(closed, `seed ${seed}`).toBeGreaterThan(0);
      expect(closed * FRAME, `seed ${seed}`).toBeLessThan(0.6 * 300);
    }
  });

  it('has the bus, which comes in from beyond the track, at its stop a quarter to every hour', () => {
    for (const seed of [1, 7]) {
      const traffic = createTraffic(seed, clockHours(0, 8), SITES.capital.traffic, undefined, false, LEVEL_TOWN, { cars: DOUBLE, at: 31 * seed });
      expect(traffic.wait.bus).toBeGreaterThan(0);
      const first = Math.ceil(traffic.hours - BUS.due);
      for (let n = 0; n < 14; n++) {
        expect(busArrives(traffic, first + n + BUS.due), `seed ${seed}, bus ${n}`).toBe(true);
      }
    }
  }, 120_000);

  it('sends a taxi sooner by the longest wait at the barrier', () => {
    const traffic = createTraffic(1, clockHours(0, 9), SITES.capital.traffic, undefined, false, LEVEL_TOWN, { cars: DOUBLE, at: 0 });
    expect(taxiLead(traffic.roads, traffic.wait.taxi)).toBeCloseTo(taxiLead(traffic.roads) + traffic.wait.taxi / HOUR_SECONDS, 9);
    expect(traffic.wait.taxi).toBeGreaterThan(5);
  });

  it('lets someone step out over the track only when the barrier is up and stays up for as long as it takes to be over', () => {
    const traffic = createTraffic(3, clockHours(0, 9), SITES.capital.traffic, undefined, false, LEVEL_TOWN, { cars: DOUBLE, at: 17 });
    const crossing = roadsOf(LEVEL_TOWN).crossings.find((c) => c.rail)!;
    let stepped = 0;
    let walker: { left: number } | null = null;
    run(traffic, 200, (now) => {
      const barrier = now.crossings[crossing.id]!.barrier!;
      if (!walker && mayStepOut(now, crossing.id, '+x')) {
        stepOut(now, crossing.id, '+x');
        walker = { left: 4 };
        stepped++;
      } else if (walker) {
        // On the track for four seconds: the barrier does not close, and no train is on it.
        const person = { x: crossing.x + crossing.reach.x + 0.25, z: crossing.z };
        expect(barrier.closed, 'the barrier closed on someone on the track').toBe(false);
        expect(touchingTrain(now, [person])).toBeNull();
        walker.left -= FRAME;
        if (walker.left <= 0) {
          stepOff(now, crossing.id, '+x');
          walker = null;
        }
      }
      // Never across the road itself, nor while the barrier is down.
      expect(mayStepOut(now, crossing.id, '+z') || mayStepOut(now, crossing.id, '-z')).toBe(false);
      if (barrier.closed) expect(mayStepOut(now, crossing.id, '+x')).toBe(false);
    });
    expect(stepped).toBeGreaterThan(2);
  });

  it('keeps the barriers open in a town with no train to show', () => {
    const traffic = createTraffic(1, clockHours(0, 9), SITES.capital.traffic, undefined, false, LEVEL_TOWN);
    expect(traffic.wait).toEqual({ bus: 0, taxi: 0, car: 0 });
    run(traffic, 60, (now) => expect(now.crossings.some((c) => c.barrier?.closed)).toBe(false));
  });
});

describe.each(TOWNS)('the traffic in $name', ({ file }) => {
  const layout = layoutFromMap(file);

  it('has level crossings where the streets meet the track, at least 8 tiles from every junction', () => {
    const roads = roadsOf(layout);
    const rails = roads.crossings.filter((c) => c.rail);
    expect(rails.length).toBeGreaterThan(0);
    for (const rail of rails) for (const c of roads.crossings) if (!c.rail) expect(Math.abs(rail.z - c.z), `crossing ${rail.id}`).toBeGreaterThanOrEqual(8 + 2 + 2);
  });

  it.each([1, 7])('never lets a vehicle or a person touch the train, or a vehicle stand on a closed track, and has the buses on time (seed %i)', (seed) => {
    const traffic = make(file, seed, clockHours(0, 8));
    const rails = roadsOf(layout).crossings.filter((c) => c.rail);
    const crossed = new Set<number>();
    const side = new Map<number, number>();
    let touched = 0;
    const first = Math.ceil(traffic.hours - BUS.due);
    for (let n = 0; n < 14; n++) {
      const arrived = busArrives(traffic, first + n + BUS.due, (now) => {
        const hit = touching(now);
        if (hit) throw new Error(`A ${hit[0].kind} and a ${hit[1].kind} touch after ${now.time.toFixed(2)} s (seed ${seed}).`);
        const train = touchingTrain(now);
        if (train) throw new Error(`A ${'kind' in train ? train.kind : 'person'} touches the train after ${now.time.toFixed(2)} s (seed ${seed}).`);
        for (const rail of rails) {
          const barrier = now.crossings[rail.id]!.barrier!;
          for (const v of vehiclesIn(now)) {
            const at = placeOf(now, v);
            if (Math.abs(at.x - rail.x) > rail.reach.x) continue;
            const s = at.z < rail.z ? -1 : 1;
            const key = v.id * 100 + rail.id;
            const before = side.get(key);
            if (before !== undefined && before !== s) crossed.add(v.id);
            side.set(key, s);
            if (barrier.closed && v.v === 0 && Math.abs(at.z - rail.z) < rail.reach.z + v.length / 2) touched++;
          }
        }
      });
      expect(arrived, `seed ${seed}, bus ${n}`).toBe(true);
    }
    expect(touched, 'vehicles standing on a closed track').toBe(0);
    expect(crossed.size, 'vehicles that crossed').toBeGreaterThan(5);
  }, 300_000);

  it('lets a person walk over the track and nobody run into the train', () => {
    const traffic = make(file, 3, clockHours(0, 9));
    const rail = roadsOf(layout).crossings.find((c) => c.rail)!;
    let walker: { left: number } | null = null;
    let stepped = 0;
    run(traffic, 240, (now) => {
      const barrier = now.crossings[rail.id]!.barrier!;
      if (!walker && mayStepOut(now, rail.id, '-x')) {
        stepOut(now, rail.id, '-x');
        walker = { left: 4 };
        stepped++;
      } else if (walker) {
        expect(touchingTrain(now, [{ x: rail.x - rail.reach.x - 0.25, z: rail.z }])).toBeNull();
        expect(barrier.closed).toBe(false);
        walker.left -= FRAME;
        if (walker.left <= 0) {
          stepOff(now, rail.id, '-x');
          walker = null;
        }
      }
    });
    expect(stepped).toBeGreaterThan(0);
  });
});
