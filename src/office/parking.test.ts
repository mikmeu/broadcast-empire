import { describe, expect, it } from 'vitest';
import { BUILDINGS, FLOOR } from '../config/office';
import { createInitialState } from '../sim/newGame';
import { CITY } from './assets';
import { PAVEMENT, hidesOffice, isLot, lotBlock, officeBlock, townBlocks, townBuildings } from './city';
import { carPlan, travelFor, tripsOf, type Trip } from './day';
import { LOT_ROWS, carBays, lotOf, openBays, parkedVans, rowsOpen, vanBays, wayIn, wayOut } from './parking';
import { SITES } from './sites';
import { carRoute, createStreet, onPavement, placesOf, stepStreet, strollers } from './street';
import { CAPITAL, GRID, layoutOf, type Layout } from './townLayout';
import { touching, touchingPerson } from './touching';
import { HOUR_SECONDS, clockHours, createTraffic, lotCarFor, roadsOf, stepTraffic, vehiclesIn, type Traffic } from './traffic';

const STANDARD = BUILDINGS.standard;
const LONG = BUILDINGS.long;
const FRAME = 1 / 30;

/** The towns the car park is in: the capital's, laid out from the map, and a grid. */
const TOWNS: { name: string; site: (typeof SITES)[keyof typeof SITES]; layout: Layout }[] = [
  { name: 'the map', site: SITES.capital, layout: CAPITAL },
  // A grid with the capital's traffic: what the car park was tuned on.
  { name: 'a grid', site: SITES.capital, layout: GRID },
];

describe('the car park (0.20.0)', () => {
  it('is the two blocks beside the office in a grid of blocks, with the kerb of the streets around it, and the town builds nothing there', () => {
    for (const building of [STANDARD, LONG]) {
      const own = officeBlock(building, GRID);
      const block = lotBlock(building, GRID);
      expect(block.x).toBe(own.x + own.w + CITY.streetWidth / 2);
      expect(block.x + block.w + CITY.streetWidth / 2).toBe(own.x + own.w + CITY.block.w);
      expect(block.d).toBe(own.d - CITY.streetWidth);
      for (const site of Object.values(SITES).filter((s) => layoutOf(s) === GRID)) {
        const blocks = townBlocks(7, site, building);
        expect(blocks.some((b) => isLot(b.i, b.j, building))).toBe(false);
        for (const item of townBuildings(7, site, building)) {
          const on = item.x > block.x && item.x < block.x + block.w && item.z > block.z && item.z < block.z + block.d;
          expect(on, `${item.building.file} at ${item.x}, ${item.z}`).toBe(false);
        }
      }
      // The ground of the lot is a stretch of pavement; the street beside it is not.
      const lot = lotOf(building, GRID);
      expect(onPavement((lot.x0 + lot.x1) / 2, (lot.z0 + lot.z1) / 2, building, GRID)).toBe(true);
      expect(onPavement(lot.street, (lot.z0 + lot.z1) / 2, building, GRID)).toBe(false);
    }
  });

  it('is in the courtyard of the U in the map’s town, at its west end under the north wing, with a drive across the lawn from the reception’s street', () => {
    for (const building of [STANDARD, LONG]) {
      const block = lotBlock(building, CAPITAL);
      const { plot } = CAPITAL.map!;
      // Inside the box of the U, south of the north wing, a tile clear of it, at the west end of the courtyard (the spine is west of it).
      expect(block.x).toBe(-6);
      expect(block.z).toBe(FLOOR.h + 1);
      expect(block.x + block.w).toBeLessThan(plot.x + plot.w);
      expect(block.z + block.d).toBeLessThanOrEqual(plot.z + 26);
      // The town builds nothing there, or on the drive.
      const lot = lotOf(building, CAPITAL);
      for (const item of townBuildings(7, SITES.capital, building)) {
        const on = item.x > lot.street && item.x < block.x + block.w && item.z > block.z - 1 && item.z < block.z + block.d;
        expect(on, `${item.building.file} at ${item.x}, ${item.z}`).toBe(false);
      }
      // The lot is on ground that is not a street, with the street a long way west of it.
      expect(onPavement((lot.x0 + lot.x1) / 2, (lot.z0 + lot.z1) / 2, building, CAPITAL)).toBe(true);
      expect(onPavement(lot.street, (lot.z0 + lot.z1) / 2, building, CAPITAL)).toBe(false);
      expect(lot.x0 - lot.street).toBeGreaterThan(CAPITAL.streetWidth);
    }
  });

  it('has every bay inside the lot, on a side of the aisle, with no two bays overlapping', () => {
    for (const building of [STANDARD, LONG]) {
      const lot = lotOf(building);
      expect(lot.bays.map((bay) => bay.id)).toEqual(lot.bays.map((_, n) => n));
      const boxes = lot.bays.map((bay) => {
        const depth = bay.kind === 'van' ? 2 : 1.8;
        return { bay, x0: bay.side === 'west' ? bay.x - depth / 2 : bay.x + depth / 2 - depth, x1: bay.side === 'west' ? bay.x + depth / 2 : bay.x + depth / 2, z0: bay.z - 0.55, z1: bay.z + 0.55 };
      });
      for (const [n, a] of boxes.entries()) {
        expect(a.x0).toBeGreaterThanOrEqual(lot.x0 - 1e-9);
        expect(a.x1).toBeLessThanOrEqual(lot.x1 + 1e-9);
        expect(a.z0).toBeGreaterThanOrEqual(lot.z0 - 1e-9);
        expect(a.z1).toBeLessThanOrEqual(lot.z1 - 1.5 + 1e-9);
        // Out of the aisle and out of the drive-in.
        if (a.bay.side === 'west') expect(a.x1).toBeLessThanOrEqual(lot.aisle.x0 + 1e-9);
        else expect(a.x0).toBeGreaterThanOrEqual(lot.aisle.x1 - 1e-9);
        const e = 1e-9;
        for (const b of boxes.slice(n + 1)) expect(a.x0 < b.x1 - e && b.x0 < a.x1 - e && a.z0 < b.z1 - e && b.z0 < a.z1 - e, `${a.bay.id} and ${b.bay.id}`).toBe(false);
      }
      // The first two rows of the west column are the drive-in.
      expect(lot.bays.filter((bay) => bay.side === 'west' && bay.row < 2)).toEqual([]);
      for (const bay of lot.bays) expect(bay.angle).toBe(bay.side === 'west' ? Math.PI : 0);
    }
  });

  it('levels up with the floors: the rows open from the south as the building grows, until the whole lot is', () => {
    for (const building of [STANDARD, LONG]) {
      expect(rowsOpen(building, 0)).toBe(0);
      expect(openBays(building, 0)).toEqual([]);
      let before = new Set<number>();
      for (let level = 1; level <= building.floors; level++) {
        // What is open stays open, and every floor opens something more: the bays keep their ids.
        const open = new Set(openBays(building, level).map((bay) => bay.id));
        for (const id of before) expect(open.has(id)).toBe(true);
        expect(open.size).toBeGreaterThan(before.size);
        before = open;
      }
      expect(rowsOpen(building, building.floors)).toBe(LOT_ROWS);
      expect(openBays(building, building.floors)).toHaveLength(lotOf(building).bays.length);
      expect(carBays(building, 1).length).toBeGreaterThan(0);
      expect(vanBays(building, 1).length).toBeGreaterThan(0);
      expect(carBays(building, building.floors).length).toBeGreaterThan(carBays(building, 1).length);
    }
    // The van zone is six bays in the standard building and eight in the long one.
    expect(vanBays(STANDARD)).toHaveLength(6);
    expect(vanBays(LONG)).toHaveLength(8);
    expect(vanBays(STANDARD, 1).length).toBeLessThan(vanBays(STANDARD, 6).length);
    // Cars and vans do not share bays.
    expect(new Set([...carBays(STANDARD, 6), ...vanBays(STANDARD, 6)].map((bay) => bay.id)).size).toBe(openBays(STANDARD, 6).length);
  });

  it('gives each van of a list its own bay in the van zone, in order, and none beyond what is open', () => {
    const vans = Array.from({ length: 6 }, (_, n) => ({ id: `van-${n}` }));
    for (const building of [STANDARD, LONG]) {
      const parked = parkedVans(vans, building, building.floors);
      expect(parked.map((p) => p.van.id)).toEqual(vans.map((v) => v.id));
      expect(new Set(parked.map((p) => p.bay.id)).size).toBe(6);
      for (const { bay } of parked) expect(bay.kind).toBe('van');
      // None of them overlap: a van is 1.9 by 0.86 tiles and a bay is a row of 1.1.
      for (const [n, a] of parked.entries()) {
        for (const b of parked.slice(n + 1)) expect(Math.abs(a.bay.z - b.bay.z) >= CITY.vehicles.van.width || a.bay.x !== b.bay.x).toBe(true);
      }
      // A lot that has opened only a floor holds fewer: the rest has no place.
      expect(parkedVans(vans, building, 1)).toHaveLength(vanBays(building, 1).length);
      expect(parkedVans(vans, building, 1).length).toBeLessThan(6);
      expect(parkedVans([], building)).toEqual([]);
    }
  });

  it('lets nothing in it hide the office from any side, a van included', () => {
    for (const building of [STANDARD, LONG]) {
      for (const bay of lotOf(building).bays) {
        const kind = bay.kind === 'van' ? CITY.vehicles.van : CITY.vehicles.car;
        const item = { building: { file: '', w: kind.length, height: 1, d: kind.width }, x: bay.x, z: bay.z, turn: 0 };
        for (let view = 0; view < 4; view++) expect(hidesOffice(item, view, 1, building), `${building.id} bay ${bay.id} from ${view}`).toBe(false);
      }
    }
    expect(PAVEMENT).toBeLessThan(1);
  });

  it('leaves the people out for a walk off the lot, and never has them cross into it', () => {
    for (const building of [STANDARD, LONG]) {
      const lot = lotOf(building);
      for (const seed of [1, 7, 12345]) {
        for (const stroller of strollers(seed, 60, building)) {
          // Nobody walks round a block that stands in the lot, or crosses over to one.
          for (const block of [stroller, stroller.across?.block]) {
            if (block) expect(Math.abs(block.x - (lot.x0 + lot.x1) / 2) < 1 && block.z > lot.z0 && block.z < lot.z1).toBe(false);
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
      const bays = new Set(carBays(STANDARD, 1).map((bay) => bay.id));
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
function world(building = STANDARD, seed = 7, day = 0, hour = 8, town = TOWNS[0]!) {
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
  it.each(TOWNS)('drive in, park, and their owner walks to the door on the hour (over the street at the lights in a grid, over the lawn in the map’s town); in the evening the car backs out and joins the traffic: $name', (town) => {
    for (const [building, seed] of [STANDARD, LONG].flatMap((b) => [7, 3, 5].map((s) => [b, s] as const))) {
      const { traffic, street, run } = world(building, seed, 0, 8, town);
      const lot = traffic.lot.ground;
      expect(traffic.lot.lane).not.toBeNull();
      const lane = roadsOf(town.layout).lanes[traffic.lot.lane!]!;
      expect(lane.along).toBe('z');
      expect(lane.direction).toBe(-1);
      expect(lane.at).toBeGreaterThan(lot.street);
      const trips = [drive('robin', 'in', 9, 4), drive('robin', 'out', 17.5, 4)];
      const bay = lot.bays[4]!;
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
    const bays = carBays(STANDARD, 6).map((bay) => bay.id);
    const people = bays.slice(0, 10).map((bay, n) => ({ id: `p${n}`, bay }));
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

  it('takes the walk from the lot to the entrance over one crossing with lights, along the office’s own pavement, in a grid', () => {
    for (const building of [STANDARD, LONG]) {
      const traffic = createTraffic(1, 30, SITES.north.traffic, building, false, GRID);
      const door = placesOf(traffic.roads).door;
      for (const bay of traffic.lot.ground.bays) {
        const route = carRoute(traffic, bay.id);
        expect(route.id).not.toBeNull();
        expect(route.points.at(-1)).toEqual(door);
        expect(route.points[route.to - 1]![0] > traffic.lot.ground.street).toBe(true);
        expect(route.points[route.to]![0] < traffic.lot.ground.street).toBe(true);
        // Only the one step over the street is off the pavement.
        for (let i = 1; i < route.points.length; i++) {
          if (i === route.to) continue;
          const [from, to] = [route.points[i - 1]!, route.points[i]!];
          for (let step = 0; step <= 10; step++) expect(onPavement(from[0] + ((to[0] - from[0]) * step) / 10, from[1] + ((to[1] - from[1]) * step) / 10, building, GRID)).toBe(true);
        }
      }
    }
  });

  it('takes the walk from the lot to the entrance over the company’s own ground in the map’s town: no street to cross, nothing in the way', () => {
    for (const building of [STANDARD, LONG]) {
      const traffic = createTraffic(1, 30, SITES.capital.traffic, building);
      const door = placesOf(traffic.roads).door;
      for (const bay of traffic.lot.ground.bays) {
        const route = carRoute(traffic, bay.id);
        expect(route.id).toBeNull();
        expect(route.points.at(-1)).toEqual(door);
        for (let i = 1; i < route.points.length; i++) {
          const [from, to] = [route.points[i - 1]!, route.points[i]!];
          for (let step = 0; step <= 10; step++) expect(onPavement(from[0] + ((to[0] - from[0]) * step) / 10, from[1] + ((to[1] - from[1]) * step) / 10, building, CAPITAL)).toBe(true);
        }
      }
    }
  });

  it('drives the way in along the lot’s south lane and the way out along its north one, backing out first', () => {
    const lot = lotOf(STANDARD);
    for (const bay of lot.bays) {
      const inward = wayIn(lot, bay, [lot.street + 0.5, lot.drive.in + 0.9]);
      expect(inward.at(-1)).toEqual([bay.x, bay.z]);
      expect(inward.some(([x]) => x === lot.aisle.north)).toBe(true);
      const outward = wayOut(lot, bay, [lot.street + 0.5, lot.drive.out]);
      expect(outward[0]).toEqual([bay.x, bay.z]);
      // Backing out: first straight along the bay, with the nose where it was.
      expect(outward[1]![1]).toBe(bay.z);
      expect(outward.at(-1)).toEqual([lot.street + 0.5, lot.drive.out]);
    }
  });
});
