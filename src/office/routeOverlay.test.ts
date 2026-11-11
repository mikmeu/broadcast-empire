import { describe, expect, it } from 'vitest';
import { MAPS } from '../config/maps';
import { BUILDINGS } from '../config/office';
import { toMapFile } from '../mods/mapFile';
import { OVERLAY_LAYERS, routeOverlay } from './routeOverlay';
import { ribbonsOf } from './scene/RouteOverlay';
import { FIXTURE_TOWNS } from './traffic.fixture';
import { clockHours, createTraffic, laneAt, roadsOf, townPlan } from './traffic';
import { layoutFromMap } from './townLayout';

const key = (p: { x: number; z: number }) => `${Math.round(p.x * 100)}|${Math.round(p.z * 100)}`;

describe.each(FIXTURE_TOWNS)('the overlay of $name (#330)', (town) => {
  const water = town.site.front === 'water';
  const overlay = routeOverlay(town.layout, town.building, water);
  const roads = roadsOf(town.layout);

  it('shows the crossings that have lights in the traffic', () => {
    const traffic = createTraffic(1, clockHours(0, 9), town.site.traffic, town.building, water, town.layout);
    const lit = traffic.crossings.flatMap((c, id) => (c.lights ? [roads.crossings.find((m) => m.id === id)!] : []));
    expect(overlay.lights.map(key).sort()).toEqual(lit.map(key).sort());
    const barriers = traffic.crossings.flatMap((c, id) => (c.barrier ? [roads.crossings.find((m) => m.id === id)!] : []));
    expect(overlay.levels.map(key).sort()).toEqual(barriers.map(key).sort());
  });

  it('ends the bus line at the stop, and leaves out the lanes nobody drives', () => {
    const last = overlay.bus.line.at(-1)!;
    expect(last.x).toBeCloseTo(roads.busStop.x, 3);
    expect(last.z).toBeCloseTo(roads.busStop.z, 3);
    expect(overlay.bus.stop).toEqual({ x: roads.busStop.x, z: roads.busStop.z });
    expect(overlay.taxi.line.at(-1)!.x).toBeCloseTo(roads.taxiStand.x, 3);
    const { closed } = townPlan(roads, town.building, water);
    expect(overlay.traffic).toHaveLength(closed.filter((c) => !c).length);
    roads.lanes.forEach((lane, l) => {
      const mine = overlay.traffic.some((line) => key(line[0]!) === key(laneAt(lane, 0)) && key(line[1]!) === key(laneAt(lane, lane.length)));
      expect(mine, `lane ${l}`).toBe(!closed[l]);
    });
  });

  it('shows the train, the vans and the people', () => {
    expect(overlay.train.from.x).toBe(town.layout.railway.from);
    expect(overlay.train.ground).toBe(town.layout.railway.ground === true);
    expect(overlay.vans.gates.length).toBeGreaterThan(0);
    expect(overlay.vans.mouths).toHaveLength(overlay.vans.gates.length);
    // (Nobody walks in Amplify Hills since #399: no ring and no paths.)
    expect(overlay.people.loops.length + overlay.people.paths.length > 0).toBe(town.site.map !== 'amplify-hills');
    // (None of the five towns has a path drawn by hand.)
    expect(overlay.people.drawn).toEqual([]);
    expect(overlay.bus.via).toEqual([]);
  });
});

describe('the overlay of a town with go-via points and walking paths (#330)', () => {
  it('shows the points and the paths a map draws', () => {
    const file = structuredClone(MAPS.coaxia!);
    file.map.stops.bus.via = [{ x: 25, z: 0.5 }];
    file.map.walks = [[{ x: 10, z: 10 }, { x: 14.5, z: 10 }]];
    const overlay = routeOverlay(layoutFromMap(file, BUILDINGS.standard), BUILDINGS.standard, false);
    expect(overlay.bus.via).toEqual([{ x: 25, z: 0.5 }]);
    expect(overlay.people.drawn).toEqual([[{ x: 10, z: 10 }, { x: 14.5, z: 10 }]]);
    expect(toMapFile(file)).toContain('"walks"');
  });
});

describe('the ribbons', () => {
  it('make a quad for each stretch and a chevron every so often, pointing the way it goes', () => {
    const plain = ribbonsOf([[{ x: 0, z: 0 }, { x: 10, z: 0 }]], { width: 0.4, side: 0, level: 1, every: 0 });
    expect(plain).toHaveLength(6 * 3);
    const arrows = ribbonsOf([[{ x: 0, z: 0 }, { x: 10, z: 0 }]], { width: 0.4, side: 0, level: 1, every: 4 });
    // The quad (6 vertices) and two chevrons (3 each), and the tip of each lies ahead of its base.
    expect(arrows).toHaveLength((6 + 2 * 3) * 3);
    const tip = arrows[6 * 3]!;
    expect(arrows[6 * 3 + 3]!).toBeLessThan(tip);
  });

  it('lie to the side of the line, so two routes in one lane lie apart', () => {
    const a = ribbonsOf([[{ x: 0, z: 0 }, { x: 10, z: 0 }]], { width: 0.2, side: 0.3, level: 1, every: 0 });
    const b = ribbonsOf([[{ x: 0, z: 0 }, { x: 10, z: 0 }]], { width: 0.2, side: -0.3, level: 1, every: 0 });
    expect(Math.min(...a.filter((_, i) => i % 3 === 2))).toBeGreaterThan(Math.max(...b.filter((_, i) => i % 3 === 2)));
  });

  it('skip a stretch of no length, and a layer has a name and a colour each', () => {
    expect(ribbonsOf([[{ x: 1, z: 1 }, { x: 1, z: 1 }]], { width: 1, side: 0, level: 0, every: 2 })).toEqual([]);
    expect(OVERLAY_LAYERS.map((l) => l.id)).toEqual(['traffic', 'bus', 'taxi', 'vans', 'train', 'lights', 'people']);
    expect(new Set(OVERLAY_LAYERS.map((l) => l.colour)).size).toBe(OVERLAY_LAYERS.length);
  });
});
