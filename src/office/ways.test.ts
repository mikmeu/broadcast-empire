import { describe, expect, it } from 'vitest';
import { MAPS } from '../config/maps';
import { toMapFile, type MapFile } from '../mods/mapFile';
import { SITES } from './sites';
import { carRoute, lotPathOf, routesOf, strollerAt, strollers, walkHoursOf } from './street';
import { checkTown } from './townCheck';
import { houseOf, layoutFromMap } from './townLayout';
import { clockHours, createTraffic, roadsOf } from './traffic';
import { routeOverlay } from './routeOverlay';
import { dashesOf } from './scene/RouteOverlay';

// The ways to the entrance, their corners and paving, the ring round the building, and the paths a map draws (#339).
const towns = Object.entries(MAPS);
const AERIAL = MAPS['aerial-fields']!;
const copy = (change: (file: MapFile) => void): MapFile => {
  const file = structuredClone(AERIAL);
  change(file);
  return file;
};
const layoutOf = (file: MapFile) => layoutFromMap(file, houseOf(file));
const reason = (file: MapFile): string => {
  const checked = checkTown(file);
  if (checked.ok) throw new Error('The town was accepted');
  return checked.reason;
};

describe('the ways of the five towns (#339)', () => {
  it('stay as they are, except where the file draws them (Aerial Fields, #399): no corners, all paved, and the files keep their text', () => {
    for (const [id, file] of towns) {
      // Only Aerial Fields draws ways, and only Amplify Hills turns the ring off (#399).
      expect(file.map.ways !== undefined, id).toBe(id === 'aerial-fields');
      expect(file.map.ring, id).toBe(id === 'amplify-hills' ? false : undefined);
      if (!file.map.ways) expect(toMapFile(file), id).not.toMatch(/"ways"/);
      if (file.map.ring === undefined) expect(toMapFile(file), id).not.toMatch(/"ring"/);
      const overlay = routeOverlay(layoutOf(file), houseOf(file), false);
      const ways = overlay.people.ways;
      expect(ways.map((w) => w.kind).slice(0, 3), id).toEqual(['bus', 'taxi', 'away']);
      for (const way of ways) {
        if (!file.map.ways) expect(way.corners).toBe(0);
        expect(way.bare).toBe(false);
        expect(way.line.length).toBeGreaterThan(1);
      }
      // (They all end at the gate.)
      const gate = layoutOf(file).places.gate;
      for (const way of ways) expect(way.line.at(-1), `${id} ${way.kind}`).toEqual({ x: gate.x, z: gate.z });
    }
  });

  it('pass the map check with a corner on each of them', () => {
    for (const [id, file] of towns) {
      const overlay = routeOverlay(layoutOf(file), houseOf(file), false);
      for (const way of overlay.people.ways.filter((w) => w.editable)) {
        const [a, b] = [way.line[0]!, way.line.at(-1)!];
        const next = structuredClone(file);
        next.map.ways = { [way.kind]: { via: [{ x: Math.round((a.x + b.x) * 50) / 100, z: Math.round((a.z + b.z) * 50) / 100 }] } };
        expect(checkTown(next), `${id} ${way.kind}`).toEqual({ ok: true });
      }
    }
  });
});

describe('a way with corners (#339)', () => {
  const via = { x: -20, z: 30 };
  const bent = copy((f) => (f.map.ways = { bus: { via: [via] }, taxi: { via: [{ x: -20, z: 28 }] }, away: { via: [{ x: -30, z: 24 }] } }));

  it('goes through them from the stop to the gate and the door, in the walk and in the time it takes', () => {
    const [plain, bend] = [roadsOf(layoutOf(AERIAL)), roadsOf(layoutOf(bent))];
    const [gate, door] = [placesGate(bend), placesDoor(bend)];
    const [stop, taxi, away] = [routesOf(bend).bus[0]!, routesOf(bend).taxi[0]!, routesOf(bend).walk[0]!];
    expect(routesOf(bend).bus).toEqual([stop, [via.x, via.z], gate, door]);
    expect(routesOf(bend).taxi).toEqual([taxi, [-20, 28], gate, door]);
    expect(routesOf(bend).walk).toEqual([away, [-30, 24], gate, door]);
    expect(routesOf(plain).bus).toHaveLength(4);
    expect(walkHoursOf(bend).bus).not.toBe(walkHoursOf(plain).bus);
  });

  it('is told in the overlay, with its corners counted', () => {
    const overlay = routeOverlay(layoutOf(bent), houseOf(bent), false);
    const bus = overlay.people.ways.find((w) => w.kind === 'bus')!;
    expect(bus.corners).toBe(1);
    expect(bus.line).toHaveLength(3);
    expect(bus.line[1]).toEqual(via);
  });

  it('is refused where a stretch crosses a road, with the spot', () => {
    const road = AERIAL.map.roads.find((r) => r.along === 'x')!;
    const across = copy((f) => (f.map.ways = { away: { via: [{ x: -30, z: road.at }] } }));
    const checked = checkTown(across);
    expect(checked.ok).toBe(false);
    if (!checked.ok) {
      expect(checked.reason).toMatch(/The way along the front of the building crosses a road/);
      expect(checked.at).toBeDefined();
    }
  });

  it('from the bus stop or the taxi stand is refused when it is longer than the walk to the door allows', () => {
    const long = copy((f) => (f.map.ways = { bus: { via: [{ x: -60, z: 22 }, { x: -60, z: 5 }, { x: -18, z: 5 }] } }));
    expect(reason(long)).toMatch(/The way from the bus stop is \d+ tiles long; it must be within 40/);
  });

  it('is not looked at while it has no corners, bare or not', () => {
    expect(checkTown(copy((f) => (f.map.ways = { bus: { bare: true } })))).toEqual({ ok: true });
  });
});

describe('the lot’s way (#339)', () => {
  const lotWay = { x: -8, z: 27 };
  const bent = copy((f) => (f.map.ways = { lot: { via: [lotWay] } }));

  it('is the line the town draws, and takes the corners where a lot has a path to edit', () => {
    const layout = layoutOf(bent);
    const path = lotPathOf(layout, houseOf(bent))!;
    expect(path.editable).toBe(true);
    expect(path.line.slice(1, -1)).toEqual([[lotWay.x, lotWay.z]]);
    const plain = lotPathOf(layoutOf(AERIAL), houseOf(AERIAL))!;
    expect(plain.line).toHaveLength(3);
    // A lot across a street has none to edit: Skywave Beach.
    const beach = MAPS['skywave-beach']!;
    expect(lotPathOf(layoutOf(beach), houseOf(beach))!.editable).toBe(false);
  });

  it('is walked from the bays through the corners to the gate', () => {
    const [layout, house] = [layoutOf(bent), houseOf(bent)];
    const traffic = createTraffic(1, clockHours(0, 9), SITES.heartland.traffic, house, false, layout);
    const bay = traffic.lot.ground.bays.find((b) => b.kind === 'car')!;
    const { points } = carRoute(traffic, bay.id);
    expect(points).toContainEqual([lotWay.x, lotWay.z]);
    expect(points.at(-2)).toEqual([layout.places.gate.x, layout.places.gate.z]);
    // Without the corner it is the stretch to the gate that it always was.
    const plain = createTraffic(1, clockHours(0, 9), SITES.heartland.traffic, houseOf(AERIAL), false, layoutOf(AERIAL));
    expect(carRoute(plain, bay.id).points).not.toContainEqual([lotWay.x, lotWay.z]);
  });
});

describe('the ring round the building (#339)', () => {
  const off = copy((f) => (f.map.ring = false));

  it('is on in the five towns but Amplify Hills (#399), and people walk its paths', () => {
    const layout = layoutOf(AERIAL);
    expect(layout.strolling(houseOf(AERIAL)).paths!.length).toBeGreaterThan(0);
    expect(strollers(1, 12, houseOf(AERIAL), layout).every((s) => s.path)).toBe(true);
    const hills = towns.find(([id]) => id === 'amplify-hills')![1];
    expect(layoutOf(hills).strolling(houseOf(hills)).paths ?? []).toEqual([]);
  });

  it('turned off leaves nobody out for a walk, and does not stop the paths drawn by hand', () => {
    const [layout, house] = [layoutOf(off), houseOf(off)];
    expect(layout.strolling(house).paths).toEqual([]);
    expect(strollers(1, 12, house, layout)).toEqual([]);
    const drawn = copy((f) => {
      f.map.ring = false;
      f.map.walks = [[{ x: -40, z: 40 }, { x: -30, z: 40 }]];
    });
    const people = strollers(1, 12, houseOf(drawn), layoutOf(drawn));
    expect(people).toHaveLength(12);
    expect(people.every((s) => s.path?.[0]?.[1] === 40)).toBe(true);
    const at = strollerAt(people[0]!, 5);
    expect(at.z).toBeCloseTo(40, 3);
    // The overlay shows no loops round blocks.
    expect(routeOverlay(layoutOf(drawn), houseOf(drawn), false).people.loops).toEqual([]);
  });

  it('is read and written, and the town is built again when it changes', () => {
    expect(toMapFile(off)).toContain('"ring": false');
    expect(layoutOf(off).map!.roads.length).toBe(layoutOf(AERIAL).map!.roads.length);
  });
});

describe('the paths a map draws (#339)', () => {
  it('are paved: the layout gives the paving the paths', () => {
    const file = copy((f) => (f.map.walks = [[{ x: -40, z: 40 }, { x: -30, z: 40 }]]));
    expect(layoutOf(file).map!.walks).toEqual(file.map.walks);
    expect(layoutOf(AERIAL).map!.walks).toBeUndefined();
  });

  it('dashes a line into pieces with gaps between them', () => {
    const dashes = dashesOf([{ x: 0, z: 0 }, { x: 5, z: 0 }], 1);
    expect(dashes).toHaveLength(3);
    expect(dashes[0]).toEqual([{ x: 0, z: 0 }, { x: 1, z: 0 }]);
    expect(dashes[1]).toEqual([{ x: 2, z: 0 }, { x: 3, z: 0 }]);
  });
});

const placesGate = (r: ReturnType<typeof roadsOf>): [number, number] => [r.layout.places.gate.x, r.layout.places.gate.z];
const placesDoor = (r: ReturnType<typeof roadsOf>): [number, number] => [r.layout.places.door.x, r.layout.places.door.z];
