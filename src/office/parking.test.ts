import { describe, expect, it } from 'vitest';
import { BUILDINGS, buildingFor, type Building } from '../config/office';
import { createInitialState } from '../sim/newGame';
import { CITY } from './assets';
import { lotBlock, townBuildings } from './city';
import { carPlan, travelFor, tripsOf, type Trip } from './day';
import { carBays, lotOf, openBays, parkedVans, rowsOpen, vanBays, walkFrom, wayIn, wayOut } from './parking';
import { REGIONS } from '../config/world';
import { SITES } from './sites';
import { carRoute, createStreet, onPavement, placesOf, stepStreet, strollers } from './street';
import { SYNTHETIC_TOWNS } from './syntheticTowns';
import { CAPITAL, layoutOf, type Layout } from './townLayout';
import { touching, touchingPerson } from './touching';
import { HOUR_SECONDS, carSlack, clockHours, createTraffic, leaveLot, lotCarFor, orderCar, parkingHours, roadsOf, stepTraffic, vehiclesIn, type Traffic } from './traffic';

const STANDARD = BUILDINGS.standard;
const COURT = BUILDINGS.courtyard;
const FRAME = 1 / 30;

/**
 * The towns the car park is in: the capital's, laid out from the map (with the U, or the standard building in an older
 * game; the long building's block would take the street the lot opens onto). (The grid of blocks, which the car park was
 * first tuned on, is no town of the game any more: its lot is too small for vehicles drawn twice as large, 0.20.0.)
 */
const TOWNS: { name: string; site: (typeof SITES)[keyof typeof SITES]; layout: Layout; buildings: Building[] }[] = [
  { name: 'the map', site: SITES.capital, layout: CAPITAL, buildings: [COURT, STANDARD] },
];

describe('the car park (0.20.0)', () => {
  it('is the courtyard of the U in the map’s town: two strips with the green between them, opening onto the street east of the U', () => {
    for (const building of [COURT, STANDARD]) {
      const block = lotBlock(building, CAPITAL);
      const { plot, courtyard } = CAPITAL.map!;
      // The courtyard of the drawing, in the box of the U, south of the north wing.
      expect(block).toEqual({ x: -6, z: 11, w: 26, d: 15 });
      expect(block.x + block.w).toBeLessThanOrEqual(plot.x + plot.w);
      expect(courtyard.parking).toHaveLength(2);
      expect(courtyard.green).toHaveLength(1);
      expect(courtyard.fountain).toEqual({ x: 9, z: 18 });
      // The town builds nothing in it, or on the ground between it and the street.
      const lot = lotOf(building, CAPITAL);
      for (const item of townBuildings(7, SITES.capital, building)) {
        const on = item.x > block.x && item.x < lot.street && item.z > block.z - 1 && item.z < block.z + block.d;
        expect(on, `${item.building.file} at ${item.x}, ${item.z}`).toBe(false);
      }
      // The lot is on ground that is not a street, with the street to its east, on the other side of the ground the drive crosses.
      expect(lot.side).toBe(-1);
      expect(onPavement((lot.x0 + lot.x1) / 2, (lot.z0 + lot.z1) / 2, building, CAPITAL)).toBe(true);
      expect(onPavement(lot.street, (lot.z0 + lot.z1) / 2, building, CAPITAL)).toBe(false);
      expect(lot.street - CAPITAL.streetWidth / 2).toBeGreaterThan(lot.x1);
      expect(lot.strips.map((strip) => strip.side)).toEqual(['north', 'south']);
      // One way in and one out, in a loop (the strips are too shallow for a lane each way).
      expect(lot.gates).toHaveLength(1);
      expect(lot.loop).not.toBeNull();
    }
  });

  it('has every bay and lane of the courtyard inside its strip and off the green, no two bays overlapping, parallel to the lane beside them', () => {
    for (const building of [COURT, STANDARD]) {
      const lot = lotOf(building, CAPITAL);
      const { green } = CAPITAL.map!.courtyard;
      expect(lot.bays.map((bay) => bay.id)).toEqual(lot.bays.map((_, n) => n));
      const e = 1e-9;
      // A bay is parallel to its lane: `pitch` long along x, `depth` deep across.
      const boxes = lot.bays.map((bay) => ({ bay, x0: bay.x - bay.pitch / 2, x1: bay.x + bay.pitch / 2, z0: bay.z - bay.depth / 2, z1: bay.z + bay.depth / 2 }));
      for (const [n, a] of boxes.entries()) {
        const strip = lot.strips.find((s) => s.side === a.bay.side)!;
        expect(a.x0).toBeGreaterThanOrEqual(strip.x0 - e);
        expect(a.x1).toBeLessThanOrEqual(strip.x1 + e);
        expect(a.z0).toBeGreaterThanOrEqual(strip.z0 - e);
        expect(a.z1).toBeLessThanOrEqual(strip.z1 + e);
        for (const g of green) expect(a.z0 < g.z + g.d - e && a.z1 > g.z + e, `bay ${a.bay.id} on the green`).toBe(false);
        // The cars point the way their lane runs: west in the north strip, east in the south one. The bay's door is on the lane.
        expect(a.bay.angle).toBe(strip.nose < 0 ? Math.PI : 0);
        expect(Math.sign(a.bay.door[1] - a.bay.z)).toBe(-strip.nose);
        // A car or a van in a bay is clear of the lane, and the lane is as wide as a vehicle (a car is 1.6 wide, a van 1.72, a bus 1.84).
        const lane = strip.side === 'north' ? strip.in : strip.out;
        expect(lane < a.z0 - 0.9 || lane > a.z1 + 0.9).toBe(true);
        for (const b of boxes.slice(n + 1)) expect(a.x0 < b.x1 - e && b.x0 < a.x1 - e && a.z0 < b.z1 - e && b.z0 < a.z1 - e, `${a.bay.id} and ${b.bay.id}`).toBe(false);
        // And the bay is as long and as deep as the vehicle that stands in it.
        const spec = a.bay.kind === 'van' ? CITY.vehicles.van : CITY.vehicles.car;
        expect(a.bay.pitch).toBeGreaterThanOrEqual(spec.length);
        expect(a.bay.depth).toBeGreaterThanOrEqual(spec.width);
      }
      // One lane in each strip, the way in on the north side and the way out on the south, inside the strip and off the green.
      const [north, south] = lot.strips;
      expect(north!.in).toBe(north!.out);
      expect(south!.in).toBe(south!.out);
      expect(north!.in).toBeLessThan(south!.out);
      for (const strip of lot.strips) {
        expect(strip.loop).toBe(true);
        expect(strip.in - 0.95).toBeGreaterThanOrEqual(strip.z0 - e);
        expect(strip.in + 0.95).toBeLessThanOrEqual(strip.z1 + e);
      }
      // The way across the west end of the green joins the two lanes, clear of every bay.
      const way = lot.loop!;
      expect([way.z0, way.z1]).toEqual([north!.in, south!.out]);
      for (const box of boxes) expect(box.x0).toBeGreaterThanOrEqual(way.x + 0.95 - e);
      // The vans are in the south strip, at its east end, and the cars of the north strip are in a row of their own.
      const vans = lot.bays.filter((bay) => bay.kind === 'van');
      expect(vans.length).toBe(lot.vans);
      expect(vans.every((bay) => bay.side === 'south')).toBe(true);
      expect(lot.bays.filter((bay) => bay.side === 'north').length).toBeGreaterThan(0);
      expect(Math.min(...vans.map((bay) => bay.x))).toBeGreaterThan(Math.max(-Infinity, ...lot.bays.filter((bay) => bay.side === 'south' && bay.kind === 'car').map((bay) => bay.x)));
    }
  });

  it('is one way: a car for the north strip drives in along its lane, one for the south strip goes round the west end of the green first, and every car leaves along the south lane', () => {
    const lot = lotOf(COURT, CAPITAL);
    const mouth: [number, number] = [lot.street, lot.gates[0]!.in];
    for (const bay of lot.bays) {
      const in_ = wayIn(bay, mouth);
      const out = wayOut(bay, [lot.street, lot.gates[0]!.out]);
      // In: along the north lane westwards. Out: along the south lane eastwards.
      const lane = (points: [number, number][], z: number) => points.filter(([, pz]) => Math.abs(pz - z) < 1e-9);
      const inNorth = lane(in_, lot.loop!.z0);
      expect(inNorth.length).toBeGreaterThan(0);
      for (let n = 1; n < inNorth.length; n++) expect(inNorth[n]![0]).toBeLessThanOrEqual(inNorth[n - 1]![0] + 1e-9);
      const outSouth = lane(out, lot.loop!.z1);
      expect(outSouth.length).toBeGreaterThan(0);
      for (let n = 1; n < outSouth.length; n++) expect(outSouth[n]![0]).toBeGreaterThanOrEqual(outSouth[n - 1]![0] - 1e-9);
      // Round the west end: the cars of the south strip on the way in, the cars of the north strip on the way out.
      const across = (points: [number, number][]) => points.some(([x, z]) => Math.abs(x - lot.loop!.x) < 1e-9 && Math.abs(z - lot.loop!.z1) < 1e-9);
      expect(across(in_)).toBe(bay.side === 'south');
      expect(across(out)).toBe(bay.side === 'north');
    }
  });

  it('has every bay inside the lot of Transponder Valley, Skywave Beach, Aerial Fields and Amplify Hills, no two bays overlapping, with fewer of them than before', () => {
    for (const { id } of REGIONS) {
      const layout = layoutOf(SITES[id]);
      const building = buildingFor(id);
      const lot = lotOf(building, layout);
      expect(lot.bays.length).toBeGreaterThan(2);
      expect(lot.bays.length).toBeLessThanOrEqual(23 + 23);
      const e = 1e-9;
      // A bay is a box `pitch` long along its lane and `depth` across it; the lane runs along x in a strip, along z in a block (which a street along x turns round).
      const boxes = lot.bays.map((bay) => {
        const alongX = Math.abs(Math.sin(bay.angle)) < 1e-9;
        const [w, d] = alongX ? [bay.pitch, bay.depth] : [bay.depth, bay.pitch];
        return { bay, x0: bay.x - w / 2, x1: bay.x + w / 2, z0: bay.z - d / 2, z1: bay.z + d / 2 };
      });
      for (const [n, a] of boxes.entries()) {
        expect(a.x0, `${id} bay ${a.bay.id}`).toBeGreaterThanOrEqual(lot.x0 - e);
        expect(a.x1, `${id} bay ${a.bay.id}`).toBeLessThanOrEqual(lot.x1 + e);
        expect(a.z0, `${id} bay ${a.bay.id}`).toBeGreaterThanOrEqual(lot.z0 - e);
        expect(a.z1, `${id} bay ${a.bay.id}`).toBeLessThanOrEqual(lot.z1 + e);
        for (const b of boxes.slice(n + 1)) expect(a.x0 < b.x1 - e && b.x0 < a.x1 - e && a.z0 < b.z1 - e && b.z0 < a.z1 - e, `${id}: ${a.bay.id} and ${b.bay.id}`).toBe(false);
        const spec = a.bay.kind === 'van' ? CITY.vehicles.van : CITY.vehicles.car;
        expect(a.bay.pitch).toBeGreaterThanOrEqual(spec.length);
        expect(a.bay.depth).toBeGreaterThanOrEqual(spec.width);
      }
    }
  });

  it.each(TOWNS)('levels up with the floors: the rows open from the south (from the street, in both strips, in the courtyard) as the building grows, until the whole lot is: $name', ({ layout, buildings }) => {
    for (const building of buildings) {
      const full = lotOf(building, layout).rows;
      expect(rowsOpen(building, 0, layout)).toBe(0);
      expect(openBays(building, 0, layout)).toEqual([]);
      let before = new Set<number>();
      for (let level = 1; level <= building.floors; level++) {
        // What is open stays open, and every floor opens something more: the bays keep their ids.
        const open = new Set(openBays(building, level, layout).map((bay) => bay.id));
        for (const id of before) expect(open.has(id)).toBe(true);
        expect(open.size).toBeGreaterThan(before.size);
        before = open;
      }
      expect(rowsOpen(building, building.floors, layout)).toBe(full);
      expect(openBays(building, building.floors, layout)).toHaveLength(lotOf(building, layout).bays.length);
      expect(carBays(building, 1, layout).length).toBeGreaterThan(0);
      expect(vanBays(building, 1, layout).length).toBeGreaterThan(0);
      expect(carBays(building, building.floors, layout).length).toBeGreaterThan(carBays(building, 1, layout).length);
      // Cars and vans do not share bays.
      expect(new Set([...carBays(building, 6, layout), ...vanBays(building, 6, layout)].map((bay) => bay.id)).size).toBe(openBays(building, 6, layout).length);
      expect(vanBays(building, 1, layout).length).toBeLessThan(vanBays(building, building.floors, layout).length);
    }
    // The van zone is the east end of the south strip: five bays in the U (six would not leave room for the way across the west end of the green).
    expect(vanBays(COURT, 6, layout)).toHaveLength(5);
    expect(vanBays(STANDARD, 6, layout)).toHaveLength(5);
  });

  it('opens both strips of the courtyard at once, from the street towards the west wing', () => {
    const level1 = carBays(COURT, 1, CAPITAL);
    for (const side of ['north', 'south']) expect(level1.some((bay) => bay.side === side)).toBe(true);
    for (const strip of ['north', 'south']) {
      const open = carBays(COURT, 2, CAPITAL).filter((bay) => bay.side === strip);
      const shut = lotOf(COURT, CAPITAL).bays.filter((bay) => bay.side === strip && bay.kind === 'car' && !open.some((o) => o.id === bay.id));
      // Everything open is nearer the street than anything shut.
      expect(Math.min(...open.map((bay) => bay.x))).toBeGreaterThan(Math.max(...shut.map((bay) => bay.x)));
    }
  });

  it.each(TOWNS)('gives each van of a list its own bay in the van zone, in order, and none beyond what is open: $name', ({ layout, buildings }) => {
    const vans = Array.from({ length: 6 }, (_, n) => ({ id: `van-${n}` }));
    for (const building of buildings) {
      const room = lotOf(building, layout).vans;
      const parked = parkedVans(vans, building, building.floors, layout);
      // (The sixth van has no bay: the lot holds five.)
      expect(parked.map((p) => p.van.id)).toEqual(vans.slice(0, room).map((v) => v.id));
      expect(new Set(parked.map((p) => p.bay.id)).size).toBe(room);
      for (const { bay } of parked) expect(bay.kind).toBe('van');
      // None of them overlap: a van is 3.8 long and a bay along the lane 4.
      for (const [n, a] of parked.entries()) {
        for (const b of parked.slice(n + 1)) {
          const apart = Math.abs(a.bay.x - b.bay.x) >= CITY.vehicles.van.length || a.bay.z !== b.bay.z;
          expect(apart).toBe(true);
        }
      }
      // A lot that has opened only a floor holds fewer: the rest has no place.
      expect(parkedVans(vans, building, 1, layout)).toHaveLength(vanBays(building, 1, layout).length);
      expect(parkedVans(vans, building, 1, layout).length).toBeLessThan(room);
      expect(parkedVans([], building, building.floors, layout)).toEqual([]);
    }
  });

  it('leaves the people out for a walk off the lot, and never has them cross into it', () => {
    for (const { layout, buildings } of TOWNS) {
      for (const building of buildings) {
        const lot = lotOf(building, layout);
        for (const seed of [1, 7, 12345]) {
          for (const stroller of strollers(seed, 60, building, layout)) {
            // Nobody walks round a block that stands in the lot, or crosses over to one.
            for (const block of [stroller, stroller.across?.block]) {
              if (block) expect(Math.abs(block.x - (lot.x0 + lot.x1) / 2) < 1 && block.z > lot.z0 && block.z < lot.z1).toBe(false);
            }
          }
        }
      }
    }
  });
});

describe('who parks where (0.20.0)', () => {
  function station() {
    const s = createInitialState(3);
    return s;
  }

  it('gives everyone who comes by car a bay of the open lot that no other car stands in at the same time, and the rest a taxi', () => {
    const s = station();
    const staff = Array.from({ length: 30 }, (_, n) => ({ ...s.employees[0]!, id: `emp-x${n}`, name: `Person ${n}`, role: 'channelManager' as const }));
    const crowded = { ...s, employees: staff, floorsUnlocked: 1 };
    let driving = 0;
    let taxis = 0;
    for (let day = 0; day < 6; day++) {
      const plan = carPlan(crowded, day);
      const bays = new Set(carBays(STANDARD, 1, layoutOf(SITES[s.headquarters])).map((bay) => bay.id));
      for (const bay of plan.values()) expect(bays.has(bay)).toBe(true);
      // They all work nine to five: no two of them in one bay.
      expect(new Set(plan.values()).size).toBe(plan.size);
      for (const e of staff) {
        const wished = travelFor({ ...crowded, employees: [] }, e, day) === 'car';
        driving += plan.has(e.id) ? 1 : 0;
        taxis += wished && !plan.has(e.id) ? 1 : 0;
      }
      const trips = tripsOf(crowded, day);
      for (const t of trips.filter((x) => x.travel === 'car')) expect(t.car).toEqual({ key: `${day}:${t.id}`, bay: plan.get(t.id)! });
      for (const t of trips.filter((x) => x.travel !== 'car')) expect(t.car).toBeUndefined();
    }
    expect(driving).toBeGreaterThan(0);
    // A bigger lot has room for the cars that were turned away.
    const room = { ...crowded, floorsUnlocked: 6 };
    expect(carPlan(room, 0).size).toBeGreaterThanOrEqual(carPlan(crowded, 0).size);
    expect(taxis).toBeGreaterThanOrEqual(0);
  });

  it('is the same every time for the same game and day', () => {
    const s = station();
    expect([...carPlan({ ...s }, 4).entries()]).toEqual([...carPlan({ ...s }, 4).entries()]);
  });
});

/** A town of a building and its street, moved on a frame at a time. */
function world(building: Building = STANDARD, seed = 7, day = 0, hour = 8, town = TOWNS[0]!) {
  const dawn = clockHours(day, 8);
  const traffic = createTraffic(seed, clockHours(day, hour), town.site.traffic, building, false, town.layout);
  const street = createStreet();
  const run = (trips: Trip[], toHour: number, look?: (traffic: Traffic) => void) => {
    const until = clockHours(day, toHour);
    while (traffic.hours < until) {
      const hours = traffic.hours + FRAME / HOUR_SECONDS;
      stepTraffic(traffic, FRAME, hours);
      stepStreet(street, traffic, trips, dawn, hours, FRAME);
      look?.(traffic);
    }
  };
  return { traffic, street, run };
}

const drive = (id: string, way: Trip['way'], at: number, bay: number): Trip => ({ key: `0:${id}:${way}`, id, name: id, way, travel: 'car', at, car: { key: `0:${id}`, bay } });

describe('cars in the street and the lot (0.20.0)', () => {
  it.each(TOWNS)('drive in, park, and their owner walks to the door on the hour (over the street at the lights in a grid, across the green in the map’s town); in the evening the car backs out and joins the traffic: $name', (town) => {
    for (const [building, seed] of town.buildings.flatMap((b) => [7, 3, 5].map((s) => [b, s] as const))) {
      const { traffic, street, run } = world(building, seed, 0, 8, town);
      const lot = traffic.lot.ground;
      // Bay 4 in every case; in the courtyard the third drive goes to a car bay of the south strip.
      const bayId = seed === 5 && lot.gates.length > 1 ? lot.bays.findIndex((b) => b.gate === 1 && b.kind === 'car') + 4 : 4;
      expect(traffic.lot.lane).not.toBeNull();
      const lane = roadsOf(town.layout).lanes[traffic.lot.lane!]!;
      expect(lane.along).toBe('z');
      // The lane beside the lot, driven north where the lot is east of its street and south where it is west of it.
      expect(lane.direction).toBe(-lot.side);
      expect(Math.sign(lane.at - lot.street)).toBe(lot.side);
      const trips = [drive('robin', 'in', 9, bayId), drive('robin', 'out', 17.5, bayId)];
      const bay = lot.bays[bayId]!;
      let parkedAt = Infinity;
      let walkedAt = Infinity;
      let doorAt = Infinity;
      let crossed = 0;
      let gone = Infinity;
      const states = new Set<string>();
      run(trips, 9.5, (now) => {
        const car = lotCarFor(now, '0:robin');
        if (car) states.add(car.state);
        if (car?.state === 'parked' && parkedAt === Infinity) parkedAt = now.hours;
        const walker = street.walkers[0];
        if (walker && walkedAt === Infinity) walkedAt = now.hours;
        if (walker?.gate?.state === 'cross') {
          crossed++;
          expect(touchingPerson(now, walker)).toBeNull();
        }
        if (walker) expect(onPavement(walker.x, walker.z, building, town.layout) || walker.gate?.state === 'cross', `${walker.x.toFixed(2)}, ${walker.z.toFixed(2)}`).toBe(true);
        if (!walker && walkedAt < Infinity && doorAt === Infinity) doorAt = now.hours;
        expect(touching(now)).toBeNull();
      });
      // It parked, and only then did its owner get out; they were at the door on the hour.
      expect(states.has('arriving')).toBe(true);
      expect(parkedAt).toBeLessThan(walkedAt + 0.001);
      expect(Math.abs(doorAt - clockHours(0, 9))).toBeLessThan(0.2);
      if (town.layout.lotCrossing(building)) expect(crossed).toBeGreaterThan(5);
      else expect(crossed).toBe(0);
      expect(lotCarFor(traffic, '0:robin')?.x).toBeCloseTo(bay.x, 2);
      expect(lotCarFor(traffic, '0:robin')?.angle).toBe(bay.angle);
      expect(street.walkers).toEqual([]);
      // In the evening they come out, get in, and the car drives off into the street.
      let backing = false;
      let joined = false;
      const before = traffic.nextId;
      run(trips, 19.5, (now) => {
        const car = lotCarFor(now, '0:robin');
        if (car?.state === 'leaving') backing = true;
        if (!car && backing && !joined) {
          joined = true;
          gone = now.hours;
          // A car of the same colour has just joined the northbound lane.
          expect(vehiclesIn(now).some((v) => v.lane === now.lot.lane && v.id >= before)).toBe(true);
        }
        expect(touching(now)).toBeNull();
      });
      expect(backing).toBe(true);
      expect(joined).toBe(true);
      expect(gone).toBeGreaterThan(clockHours(0, 17.5));
      expect(gone).toBeLessThan(clockHours(0, 18.5));
      expect(traffic.lot.cars).toEqual([]);
      expect(street.walkers).toEqual([]);
    }
  }, 60_000);

  it('keeps cars apart in the lot and in the street when many come at once and many leave at once', () => {
    const { traffic, run } = world(STANDARD, 3, 0, 8);
    // Six cars to each of the two strips of the courtyard: two ways in.
    const bays = [0, 1].flatMap((gate) => carBays(STANDARD, 6).filter((bay) => bay.gate === gate).slice(0, 6).map((bay) => bay.id));
    const people = bays.map((bay, n) => ({ id: `p${n}`, bay }));
    const trips = people.flatMap((p) => [drive(p.id, 'in', 9, p.bay), drive(p.id, 'out', 17, p.bay)]);
    let most = 0;
    let closest = Infinity;
    run(trips, 20, (now) => {
      expect(touching(now)).toBeNull();
      const moving = now.lot.cars.filter((car) => car.state !== 'parked');
      most = Math.max(most, moving.length);
      for (const car of moving) {
        for (const other of now.lot.cars) {
          if (other === car) continue;
          closest = Math.min(closest, Math.hypot(car.x - other.x, car.z - other.z));
        }
      }
    });
    expect(most).toBeGreaterThan(1);
    // Never nearer than a car is wide and a little more.
    expect(closest).toBeGreaterThan(0.85);
    expect(traffic.lot.cars).toEqual([]);
  }, 120_000);

  it('has someone who was in before the day began, or who works until it ends, with their car in the lot all the same', () => {
    const { traffic, street, run } = world(STANDARD, 5, 0, 9);
    run([drive('early', 'out', 16, 6)], 9.2);
    expect(lotCarFor(traffic, '0:early')?.state).toBe('parked');
    run([drive('early', 'out', 16, 6)], 17.5);
    expect(lotCarFor(traffic, '0:early')).toBeUndefined();
    expect(street.walkers).toEqual([]);
  }, 60_000);

  it('shows a car that came before the town was looked at in its bay, and lets it leave', () => {
    const { traffic, run } = world(STANDARD, 5, 0, 12);
    run([drive('late', 'in', 9, 5), drive('late', 'out', 13, 5)], 12.1);
    expect(lotCarFor(traffic, '0:late')?.state).toBe('parked');
    run([drive('late', 'in', 9, 5), drive('late', 'out', 13, 5)], 14.5);
    expect(lotCarFor(traffic, '0:late')).toBeUndefined();
  }, 60_000);

  it('takes the walk from the lot to the door on the courtyard side in the map’s town: across the green, no street to cross, nothing in the way', () => {
    for (const building of [COURT, STANDARD]) {
      const traffic = createTraffic(1, 30, SITES.capital.traffic, building);
      const { court, door } = placesOf(traffic.roads);
      const lot = traffic.lot.ground;
      const { green } = CAPITAL.map!.courtyard;
      expect(court).not.toBeNull();
      // The door is on the courtyard face of the west wing, level with the entrance on its west face.
      expect(court![0]).toBeGreaterThan(door[0]);
      expect(court![1]).toBe(door[1]);
      for (const bay of lot.bays) {
        const route = carRoute(traffic, bay.id);
        expect(route.id).toBeNull();
        expect(route.points[0]).toEqual(bay.door);
        expect(route.points.at(-1)).toEqual(court);
        for (let i = 1; i < route.points.length; i++) {
          const [from, to] = [route.points[i - 1]!, route.points[i]!];
          for (let step = 0; step <= 10; step++) {
            const [x, z] = [from[0] + ((to[0] - from[0]) * step) / 10, from[1] + ((to[1] - from[1]) * step) / 10];
            expect(onPavement(x, z, building, CAPITAL)).toBe(true);
            // Nobody walks through the fountain, or leaves the courtyard.
            expect(Math.hypot(x - CAPITAL.map!.courtyard.fountain!.x, z - CAPITAL.map!.courtyard.fountain!.z)).toBeGreaterThan(1.7);
            expect(x).toBeLessThan(lot.x1 + 0.01);
          }
        }
        // The walk from a bay to the green and along its edge is the only part on it.
        expect(walkFrom(lot, bay).length).toBeGreaterThanOrEqual(2);
        expect(route.points.some(([, z]) => z > green[0]!.z && z < green[0]!.z + green[0]!.d)).toBe(true);
      }
    }
  });
});

describe('a lot that opens onto a road along x (#217)', () => {
  const parked = (traffic: Traffic, key: string) => lotCarFor(traffic, key)?.state === 'parked';

  it.each(SYNTHETIC_TOWNS)('is turned a quarter round from the lot along z: its gates are positions along x, its bays lie south of the road: $id', (layout) => {
    const lot = lotOf(STANDARD, layout);
    expect(lot.along).toBe('x');
    expect(lot.side).toBe(1);
    expect(lot.street).toBe(0);
    // Bays in the block south of the road, inside it.
    expect(lot.bays.length).toBeGreaterThan(2);
    for (const bay of lot.bays) {
      expect(bay.x).toBeGreaterThan(lot.x0);
      expect(bay.x).toBeLessThan(lot.x1);
      expect(bay.z).toBeGreaterThan(lot.z0);
      expect(bay.z).toBeLessThan(lot.z1);
      expect(lot.gates[bay.gate]!.in).toBeGreaterThan(lot.x0);
      expect(lot.gates[bay.gate]!.in).toBeLessThan(lot.x1);
    }
    // Cars come in from the west along the lane east, and the way out is east of the way in.
    expect(lot.gates[0]!.in).toBeLessThan(lot.gates[0]!.out);
  });

  it.each(SYNTHETIC_TOWNS)('lets cars drive in from the road, park on time, back out and join the road again, without touching: $id', (layout) => {
    for (const seed of [7, 3]) {
      const traffic = createTraffic(seed, clockHours(0, 8), SITES.capital.traffic, STANDARD, false, layout);
      const lot = traffic.lot.ground;
      expect(traffic.lot.lane).not.toBeNull();
      const lane = traffic.lanes[traffic.lot.lane!]!;
      // The lane beside the lot: driven east where the lot is south of its road, on the lot's side of the middle line.
      expect(lane.along).toBe('x');
      expect(lane.direction).toBe(lot.side);
      expect(Math.sign(lane.at - lot.street)).toBe(lot.side);
      const bays = lot.bays.filter((b) => b.kind === 'car').slice(0, 4).map((b) => b.id);
      const due = clockHours(0, 9);
      // (Half an hour on the clock apart: a car takes a while to park, and the next waits for the drive-in.)
      bays.forEach((bay, n) => orderCar(traffic, `k${n}`, bay, due + n * 0.3, clockHours(0, 17)));
      const parkedAt = new Map<string, number>();
      const run = (until: number) => {
        while (traffic.hours < until) {
          stepTraffic(traffic, FRAME, traffic.hours + FRAME / HOUR_SECONDS);
          for (const n of bays.keys()) if (parked(traffic, `k${n}`) && !parkedAt.has(`k${n}`)) parkedAt.set(`k${n}`, traffic.hours);
          const hit = touching(traffic);
          if (hit) throw new Error(`A ${hit[0].kind} and a ${hit[1].kind} touch at ${traffic.hours.toFixed(3)} (seed ${seed}).`);
        }
      };
      run(due + 0.3 * bays.length + 0.6);
      // Every car has parked, in its bay, and by the time it was due at the drive-in and has parked (a little later for the last of them).
      bays.forEach((bay, n) => {
        expect(parkedAt.has(`k${n}`), `car ${n} parked`).toBe(true);
        expect(parkedAt.get(`k${n}`)!, `car ${n} on time`).toBeLessThan(due + n * 0.3 + parkingHours(traffic) + carSlack(traffic) + 0.1);
        const car = lotCarFor(traffic, `k${n}`)!;
        expect(car.x).toBeCloseTo(lot.bays[bay]!.x, 2);
        expect(car.z).toBeCloseTo(lot.bays[bay]!.z, 2);
      });
      // In the evening they leave, backing out first, and join the lane of the road.
      const before = traffic.nextId;
      for (const n of bays.keys()) leaveLot(traffic, `k${n}`);
      const joined = new Set<number>();
      const home = traffic.hours + 1.2;
      while (traffic.hours < home) {
        stepTraffic(traffic, FRAME, traffic.hours + FRAME / HOUR_SECONDS);
        for (const v of vehiclesIn(traffic)) if (v.id >= before && v.lane === traffic.lot.lane) joined.add(v.id);
        const hit = touching(traffic);
        if (hit) throw new Error(`A ${hit[0].kind} and a ${hit[1].kind} touch while the cars leave (seed ${seed}).`);
      }
      expect(traffic.lot.cars).toEqual([]);
      expect(joined.size).toBeGreaterThanOrEqual(bays.length);
    }
  }, 120_000);
});

describe('the lot of Aerial Fields and Amplify Hills (#218)', () => {
  const towns = [SITES.heartland, SITES.highlands];
  /** The building of the town: the long one in Amplify Hills, the one of its own drawing in Aerial Fields (#225). */
  const homeOf = (site: (typeof towns)[number]) => buildingFor(site === SITES.heartland ? 'heartland' : 'highlands');

  it('opens bays for cars and vans on every floor of the building, inside its block, and no two touch', () => {
    for (const site of towns) {
      const home = homeOf(site);
      const layout = layoutOf(site);
      const lot = lotOf(home, layout);
      const block = layout.lot(home).block;
      expect(lot.along, site.kind).toBe('x');
      for (const level of [1, 2, 3, 4]) {
        expect(carBays(home, level, layout).length, `${site.kind} floor ${level}`).toBeGreaterThan(0);
        expect(vanBays(home, level, layout).length, `${site.kind} floor ${level}`).toBeGreaterThan(0);
      }
      // (The plots are 13 long along the road: two rows of bays of 4, with the way in, and two vans.)
      expect(vanBays(home, 4, layout)).toHaveLength(lot.vans);
      expect(lot.vans).toBeGreaterThan(0);
      for (const bay of lot.bays) {
        expect(bay.x, site.kind).toBeGreaterThan(block.x);
        expect(bay.x, site.kind).toBeLessThan(block.x + block.w);
        expect(bay.z, site.kind).toBeGreaterThan(block.z);
        expect(bay.z, site.kind).toBeLessThan(block.z + block.d);
      }
      // Bays a pitch apart along the aisle on one side: none is on another.
      for (const a of lot.bays) for (const b of lot.bays) if (a.id < b.id && a.side === b.side) expect(Math.hypot(a.x - b.x, a.z - b.z), site.kind).toBeGreaterThan(3);
    }
  });

  it('lets the people of a car walk to the door over the company’s ground, crossing no road', () => {
    for (const site of towns) {
      const home = homeOf(site);
      const layout = layoutOf(site);
      const traffic = createTraffic(5, clockHours(0, 9), site.traffic, home, false, layout);
      for (const bay of traffic.lot.ground.bays.keys()) {
        const route = carRoute(traffic, bay);
        expect(route.id).toBeNull();
        for (const [x, z] of route.points) expect(layout.pavement(home, x, z), `${site.kind} bay ${bay} at ${x.toFixed(1)}, ${z.toFixed(1)}`).toBe(true);
        expect(route.points.at(-1)).toEqual(placesOf(roadsOf(layout)).door);
      }
    }
  });
});
