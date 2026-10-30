import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACTIVE_REGIONS } from '../config/balance';
import { BUILDINGS, FLOOR } from '../config/office';
import { REGIONS, type RegionId } from '../config/world';
import { CITY } from './assets';
import { PAVEMENT, clearance, rangeOf, townBlocks, townBuildings } from './city';
import { SITES, SITE_YARD } from './sites';
import { createStreet, stepStreet, strollers } from './street';
import { TOWN_MAPS } from '../config/townMaps';
import { layoutOf } from './townLayout';
import { touching, touchingPerson } from './touching';
import { BUS, HOUR_SECONDS, busAtStop, clockHours, createTraffic, placeOf, roadsOf, stepTraffic, vehiclesIn, type Traffic } from './traffic';

const REGION_IDS = REGIONS.map((r) => r.id);
const SEEDS = [1, 7, 12345];
const PAD = { w: CITY.block.w - CITY.streetWidth, d: CITY.block.d - CITY.streetWidth };
describe('the surroundings of the office by region (Phase 11f)', () => {
  it('has a site for every region, each of its own kind', () => {
    expect(Object.keys(SITES).sort()).toEqual([...REGION_IDS].sort());
    expect(Object.fromEntries(REGION_IDS.map((id) => [id, SITES[id].kind]))).toEqual({ capital: 'city', north: 'industry', coast: 'beach', heartland: 'fields', highlands: 'hills' });
    for (const id of REGION_IDS) expect(SITES[id].about).toMatch(/\.$/);
  });

  it('is gone through in the order of the regions, starting with Coaxia: the arrows of a new game', () => {
    expect(ACTIVE_REGIONS[0]).toBe('capital');
    expect([...ACTIVE_REGIONS].sort()).toEqual([...REGION_IDS].sort());
    // Each says something else about itself.
    expect(new Set(ACTIVE_REGIONS.map((id) => SITES[id].about)).size).toBe(ACTIVE_REGIONS.length);
  });

  it('has every model file it uses', () => {
    const files = new Set<string>();
    for (const site of Object.values(SITES)) {
      for (const building of [...site.low, ...site.tall, ...(site.frontRow ?? [])]) files.add(building.file);
      for (const file of site.train) files.add(file);
    }
    for (const thing of SITE_YARD) files.add(thing.file);
    files.add('suburban/tree-large.glb').add('suburban/tree-small.glb');
    for (const file of files) expect(existsSync(`public/models/${file}`), file).toBe(true);
    for (const folder of ['industrial', 'suburban']) {
      expect(existsSync(`public/models/${folder}/License.txt`)).toBe(true);
      expect(existsSync(`public/models/${folder}/Textures/colormap.png`)).toBe(true);
    }
  });

  it('builds every town from its own kit: factories in the valley, houses in the country, the city’s buildings by the sea', () => {
    const kit = (id: RegionId) => new Set(townBuildings(7, SITES[id]).map((b) => b.building.file.split('/')[0]));
    // (The trees on the green strips of the map are the suburban kit's.)
    expect([...kit('capital')].sort()).toEqual(['city', 'suburban']);
    expect(townBuildings(7, SITES.capital).filter((b) => !b.building.file.includes('tree')).every((b) => b.building.file.startsWith('city/'))).toBe(true);
    expect([...kit('north')]).toEqual(['industrial']);
    expect([...kit('heartland')]).toEqual(['suburban']);
    expect([...kit('highlands')]).toEqual(['suburban']);
    expect([...kit('coast')].sort()).toEqual(['city', 'suburban']);
    // By the sea the houses stand in front of the office, towards the beach, and the big buildings behind it.
    for (const block of townBlocks(7, SITES.coast)) {
      // (In the drawing the sea front is the row of the office and what lies south of it.)
      for (const item of block.items) expect(item.building.file.startsWith('suburban/'), `${block.i}:${block.j}`).toBe(layoutOf(SITES.coast).map ? item.z >= 0 : block.j >= 2);
    }
    expect(townBuildings(7, SITES.coast).some((b) => b.building.height * CITY.scale > 10)).toBe(true);
  });

  it('keeps every building on its own pavement and never lets one hide the front of the office', () => {
    for (const id of REGION_IDS) {
      const site = SITES[id];
      for (const seed of SEEDS) {
        for (const block of townBlocks(seed, site)) {
          // A cell of the map is paved from kerb to kerb, and what stands on it stands within it.
          const room = block.rect ?? PAD;
          for (const item of block.items) {
            const w = (item.turn % 2 === 0 ? item.building.w : item.building.d) * site.scale;
            const d = (item.turn % 2 === 0 ? item.building.d : item.building.w) * site.scale;
            expect(Math.abs(item.x - block.x) + w / 2, `${id} ${item.building.file}`).toBeLessThanOrEqual(room.w / 2 + 0.01);
            expect(Math.abs(item.z - block.z) + d / 2, `${id} ${item.building.file}`).toBeLessThanOrEqual(room.d / 2 + 0.01);
            expect(item.building.height * site.scale + PAVEMENT, `${id} ${item.building.file}`).toBeLessThanOrEqual(clearance(item.x, item.z, Math.min(w, 1), Math.min(d, 1)) + 1e-9);
          }
          for (const piece of block.hill ?? []) {
            const [w, d] = (piece.turn % 2 === 0 ? [piece.building.w, piece.building.d] : [piece.building.d, piece.building.w]).map((side) => side * piece.scale);
            expect(piece.building.file.startsWith('nature/'), piece.building.file).toBe(true);
            expect(piece.building.height * piece.scale + PAVEMENT, `${id} ${piece.building.file}`).toBeLessThanOrEqual(clearance(piece.x, piece.z, w!, d!));
          }
        }
        // Enough stands: a town, not a field with a house in it.
        expect(townBuildings(seed, site).length, id).toBeGreaterThan(25);
      }
    }
  });

  it('builds a block up with several buildings put together, and leaves a house its garden (Phase 12b)', () => {
    const yard = new Set(SITE_YARD.map((thing) => thing.file));
    for (const id of REGION_IDS) {
      const site = SITES[id];
      for (const seed of SEEDS) {
        const built = townBlocks(seed, site)
          .map((block) => ({ block, buildings: block.items.filter((item) => !item.building.file.includes('tree') && !yard.has(item.building.file)) }))
          .filter(({ block, buildings }) => !block.land && buildings.length > 0);
        const several = built.filter(({ buildings }) => buildings.length > 1);
        if (layoutOf(site).map && layoutOf(site).map!.roads.length === 0) {
          // A band of buildings of the map has a terrace along each side of it, with its yard open; no two buildings stand in each other.
          // (Where there are yards, some of the bands behind the office are yards and not built.)
          expect(built.length, `${id} ${seed}`).toBeGreaterThan(site.yards > 0 ? 1 : 3);
          for (const { block, buildings } of built) {
            const boxes = buildings.map((item) => ({ item, w: (item.turn % 2 === 0 ? item.building.w : item.building.d) * site.scale, d: (item.turn % 2 === 0 ? item.building.d : item.building.w) * site.scale }));
            for (const [n, a] of boxes.entries()) {
              for (const b of boxes.slice(n + 1)) {
                const apart = Math.abs(a.item.x - b.item.x) >= (a.w + b.w) / 2 - 1e-9 || Math.abs(a.item.z - b.item.z) >= (a.d + b.d) / 2 - 1e-9;
                expect(apart, `${id} ${block.i}:${block.j} ${a.item.building.file} and ${b.item.building.file}`).toBe(true);
              }
            }
          }
          // (A band holds half as many since 0.20.0, when the kit was drawn twice as large: the fullest is 17 in the valley, 20 before.)
          expect(built.some(({ buildings }) => buildings.length >= 12), `${id} ${seed}`).toBe(true);
          continue;
        }
        if (site.trees > 0) {
          // Houses with gardens: one to a block.
          expect(several, id).toHaveLength(0);
          continue;
        }
        // In town most blocks of small buildings hold more than one; a tower or a large house still stands alone.
        const small = built.filter(({ buildings }) => buildings.every((item) => site.low.includes(item.building)));
        expect(small.filter(({ buildings }) => buildings.length > 1).length, `${id} ${seed}`).toBeGreaterThan(small.length * 0.6);
        // (0.20.0: the car park takes two blocks beside the office, so the count is two blocks smaller and this one lands on the edge.)
        expect(several.length, `${id} ${seed}`).toBeGreaterThanOrEqual(built.length / 4);
        expect(several.length, `${id} ${seed}`).toBeLessThan(built.length);

        for (const { block, buildings } of several) {
          const boxes = buildings.map((item) => {
            const w = (item.turn % 2 === 0 ? item.building.w : item.building.d) * site.scale;
            const d = (item.turn % 2 === 0 ? item.building.d : item.building.w) * site.scale;
            return { item, w, d };
          });
          // No two stand in each other.
          for (const [n, a] of boxes.entries()) {
            for (const b of boxes.slice(n + 1)) {
              const apart = Math.abs(a.item.x - b.item.x) >= (a.w + b.w) / 2 - 1e-9 || Math.abs(a.item.z - b.item.z) >= (a.d + b.d) / 2 - 1e-9;
              expect(apart, `${id} ${block.i}:${block.j} ${a.item.building.file} and ${b.item.building.file}`).toBe(true);
            }
          }
          // They stand in terraces: all along one axis, each with its front to its own street.
          const turns = new Set(buildings.map((item) => item.turn));
          expect([...turns].every((turn) => turn % 2 === 0) || [...turns].every((turn) => turn % 2 === 1), `${id} ${block.i}:${block.j}`).toBe(true);
          if (turns.size > 1) {
            for (const item of buildings) {
              const outward = item.turn === 0 ? item.z - block.z : item.turn === 2 ? block.z - item.z : item.turn === 1 ? item.x - block.x : block.x - item.x;
              expect(outward, `${id} ${block.i}:${block.j} ${item.building.file}`).toBeGreaterThan(0);
            }
          }
          // Wall to wall: in a terrace each building stands against the next.
          for (const turn of turns) {
            const terrace = boxes.filter((box) => box.item.turn === turn).map((box) => (turn % 2 === 0 ? { at: box.item.x, size: box.w } : { at: box.item.z, size: box.d }));
            terrace.sort((a, b) => a.at - b.at);
            for (const [n, a] of terrace.slice(0, -1).entries()) {
              const gap = terrace[n + 1]!.at - terrace[n + 1]!.size / 2 - (a.at + a.size / 2);
              expect(gap, `${id} ${block.i}:${block.j}`).toBeGreaterThan(0);
              expect(gap, `${id} ${block.i}:${block.j}`).toBeLessThan(0.1);
            }
          }
        }
      }
    }
    // Behind the office a block with a tower has smaller buildings beside it.
    const skyline = townBlocks(7, SITES.capital).filter((block) => block.items.some((item) => SITES.capital.tall.includes(item.building)));
    expect(skyline.some((block) => block.items.some((item) => SITES.capital.low.includes(item.building)))).toBe(true);
  });

  it('has yards only where there is industry, and trees only where there is grass', () => {
    const yard = new Set(SITE_YARD.map((thing) => thing.file));
    for (const id of REGION_IDS) {
      const items = townBuildings(7, SITES[id]);
      expect(items.some((b) => yard.has(b.building.file)), id).toBe(id === 'north');
      // (The green strips of the map have trees as well.)
      expect(items.some((b) => b.building.file.includes('tree')), id).toBe(id === 'heartland' || id === 'highlands' || id === 'capital');
    }
  });

  it('lays open land around the towns in the country: fields, a lake and hills, a beach and the sea', () => {
    const grounds = (id: RegionId) => {
      const count: Record<string, number> = {};
      for (const block of townBlocks(7, SITES[id])) count[block.ground] = (count[block.ground] ?? 0) + 1;
      return count;
    };
    expect(Object.keys(grounds('capital')).sort()).toEqual(['grass', 'pavement']);
    expect(Object.keys(grounds('north'))).toEqual(['pavement']);
    expect(Object.keys(grounds('heartland')).sort()).toEqual(['field', 'grass']);
    expect(Object.keys(grounds('highlands')).sort()).toEqual(['grass', 'water']);
    expect(Object.keys(grounds('coast')).sort()).toEqual(['pavement', 'sand', 'water']);

    // Hills only in the hills, on the near mountains of the drawing behind the office, and not on every spot of them.
    for (const id of REGION_IDS) {
      const hills = townBlocks(7, SITES[id]).filter((block) => block.hill);
      expect(hills.length > 0, id).toBe(id === 'highlands');
      const mountains = layoutOf(SITES[id]).map!.mountains;
      for (const block of hills) {
        const rect = mountains.find((r) => block.land && Math.abs(r.x + r.w / 2 - block.land.x) < 0.01 && Math.abs(r.z + r.d / 2 - block.land.z) < 0.01);
        expect(rect, id).toBeDefined();
        // Pieces stand on the rect, a few of them, taller the further back, and fewer than there are places for.
        for (const piece of block.hill!) {
          expect(piece.x, id).toBeGreaterThan(rect!.x - 2);
          expect(piece.x, id).toBeLessThan(rect!.x + rect!.w + 2);
          expect(piece.z, id).toBeGreaterThan(rect!.z - 2);
          expect(piece.z, id).toBeLessThan(rect!.z + rect!.d + 2);
        }
        expect(block.hill!.length).toBeGreaterThan(30);
        const front = block.hill!.filter((p) => p.z > rect!.z + rect!.d * 0.75).map((p) => p.scale);
        const back = block.hill!.filter((p) => p.z < rect!.z + rect!.d * 0.25).map((p) => p.scale);
        expect(Math.min(...back)).toBeGreaterThan(Math.max(...front) - 3.2);
        expect(back.reduce((a, b) => a + b, 0) / back.length).toBeGreaterThan(front.reduce((a, b) => a + b, 0) / front.length + 1.5);
      }
      // The range behind the town, in the hills only, fixed by the seed, on the far mountain rect (the furthest north) and rising row by row.
      const range = rangeOf(7, SITES[id]);
      expect(range.length > 0, id).toBe(id === 'highlands');
      expect(rangeOf(7, SITES[id])).toEqual(range);
      const far = mountains.reduce((a, b) => (b.z < a.z ? b : a), mountains[0]!);
      for (const peak of range) {
        expect(peak.x).toBeGreaterThan(far.x - 5);
        expect(peak.x).toBeLessThan(far.x + far.w + 5);
        expect(peak.z).toBeGreaterThan(far.z - 3);
        expect(peak.z).toBeLessThan(far.z + far.d + 3);
      }
      if (range.length > 0) {
        const rows = [0.85, 0.5, 0.15].map((back) => range.filter((p) => Math.abs(p.z - (far.z + far.d * back)) < 4));
        expect(rows.map((row) => row.length)).toEqual([13, 13, 13]);
        const mean = (peaks: typeof range) => peaks.reduce((a, p) => a + p.height, 0) / peaks.length;
        expect(mean(rows[2]!)).toBeGreaterThan(mean(rows[1]!));
        expect(mean(rows[1]!)).toBeGreaterThan(mean(rows[0]!));
      }
    }
    // The beach: sand beyond the last street in front, the sea beyond the sand.
    if (layoutOf(SITES.coast).map) {
      // In the drawing: the sand south of the office's row, and the water right behind it.
      const sand = townBlocks(7, SITES.coast).filter((b) => b.ground === 'sand').map((b) => b.rect!);
      const sea = townBlocks(7, SITES.coast).filter((b) => b.ground === 'water').map((b) => b.rect!);
      expect(sand).toHaveLength(1);
      expect(sea).toHaveLength(1);
      expect(sand[0]!.z - sand[0]!.d / 2).toBeGreaterThan(layoutOf(SITES.coast).map!.plot.z + layoutOf(SITES.coast).map!.plot.d);
      expect(sea[0]!.z - sea[0]!.d / 2).toBeCloseTo(sand[0]!.z + sand[0]!.d / 2, 9);
    } else {
      const front = townBlocks(7, SITES.coast).filter((block) => block.land);
      expect(new Set(front.filter((b) => b.ground === 'sand').map((b) => b.j)).size).toBe(1);
      expect(Math.min(...front.filter((b) => b.ground === 'water').map((b) => b.j))).toBeGreaterThan(Math.max(...front.filter((b) => b.ground === 'sand').map((b) => b.j)));
    }
    // The lake and the rivers of the drawing are water; no fields in the hills, no water or mountains in the fields.
    const water = townBlocks(7, SITES.highlands).filter((block) => block.ground === 'water').map((b) => b.rect);
    expect(water).toHaveLength(TOWN_MAPS['amplify-hills']!.water.length);
    expect(townBlocks(7, SITES.heartland).filter((b) => b.ground === 'field' && b.land).length).toBe(TOWN_MAPS['aerial-fields']!.greens.length);
    expect(townBlocks(7, SITES.highlands).some((b) => b.ground === 'field')).toBe(false);
    expect(townBlocks(7, SITES.heartland).some((b) => b.hill || b.ground === 'water')).toBe(false);
  });

  it('has no street in the water: the water is one piece, and the side streets end at the street along the shore (0.11.0)', () => {
    for (const id of REGION_IDS) {
      const site = SITES[id];
      const layout = layoutOf(site);
      const lastStreet = layout.from.z + layout.length.z;
      const water = townBlocks(5, site).filter((block) => block.ground === 'water');
      // (The lake and the rivers of Amplify Hills are in its drawing: the road crosses them as a flat bridge.)
      expect(water.length > 0, id).toBe(site.front === 'water' || id === 'highlands');
      if (site.front !== 'water') continue;
      // Every block of water and of the shore is as wide as a block of the town, with no strip left open beside it.
      if (!layout.map) for (const block of townBlocks(5, site).filter((b) => b.j > 3)) expect(block.land!.w, `${id} ${block.i}:${block.j}`).toBeCloseTo(CITY.block.w, 9);
      // Nobody drives past the street along the shore: whoever comes down a side street turns there.
      const traffic = createTraffic(5, clockHours(0, 10), site.traffic, undefined, true, layout);
      let turned = 0;
      for (let n = 0; n < 120 * 30; n++) {
        stepTraffic(traffic, 1 / 30, traffic.hours + 1 / 30 / HOUR_SECONDS);
        for (const v of vehiclesIn(traffic)) {
          const { z } = placeOf(traffic, v);
          expect(z, `${id}: a ${v.kind} at ${z}`).toBeLessThan(lastStreet + layout.streetWidth / 2);
          if (v.turn && traffic.lanes[v.lane]!.along === 'z' && traffic.lanes[v.lane]!.direction > 0) turned++;
        }
      }
      expect(turned, id).toBeGreaterThan(0);
    }
  });

  it('never covers a lane that is driven on with land, and leaves the office’s own block alone', () => {
    for (const id of REGION_IDS) {
      const layout = layoutOf(SITES[id]);
      // (The roads of Aerial Fields and Amplify Hills are drawn 2 tiles wide, and driven as 4: the land comes up to the road as drawn, which is the middle of the lane beside it: it covers no lane, but may come to it.)
      const half = layout.edge ? 0 : layout.streetWidth / 4;
      for (const block of townBlocks(3, SITES[id])) {
        // (The cells of the map have an index of their own.)
        if (!layout.map) expect(block.i >= 0 && block.i < 4 && block.j >= 0 && block.j < 2, `${id} ${block.i}:${block.j}`).toBe(false);
        const land = block.land;
        if (!land) continue;
        expect(block.items.every((item) => item.building.file.includes('tree'))).toBe(true);
        for (const lane of roadsOf(layout).lanes) {
          const [across, wide, along, long] = lane.along === 'x' ? [land.z, land.d, land.x, land.w] : [land.x, land.w, land.z, land.d];
          const ends = [lane.origin, lane.origin + lane.direction * lane.length];
          // By the water the side streets end at the street along the shore.
          const reach = SITES[id].front === 'water' && lane.along === 'z' ? layout.from.z + layout.length.z + CITY.streetWidth / 2 : Math.max(...ends);
          if (along + long / 2 <= Math.min(...ends) || along - long / 2 >= reach) continue;
          expect(Math.abs(across - lane.at), `${id} ${block.i}:${block.j} and the lane at ${lane.at}`).toBeGreaterThanOrEqual(wide / 2 + half - 1e-9);
        }
        // In front of the office it stays flat.
        if (layout.map) expect(!block.hill || land.z + land.d / 2 <= 0, `${id} ${block.i}:${block.j}`).toBe(true);
        else {
          expect(block.j < 0 || !block.hill).toBe(true);
          expect(land.z - land.d / 2).toBeGreaterThan(block.j >= 2 ? FLOOR.h : -Infinity);
        }
      }
    }
  });

  it('gives every game its own town on every site, the same each time', () => {
    for (const id of REGION_IDS) {
      const layout = (seed: number) => townBlocks(seed, SITES[id]).map((b) => `${b.ground}:${b.items.map((i) => `${i.building.file}@${i.turn}`).join('+')}`).join();
      expect(layout(7)).toBe(layout(7));
      expect(layout(7)).not.toBe(layout(8));
    }
  });
});

describe('traffic and trains by region (Phase 11f)', () => {
  const collision = touching;
  const FRAME = 1 / 30;
  const run = (traffic: Traffic, seconds: number, look?: () => void) => {
    for (let n = Math.round(seconds / FRAME); n > 0; n--) {
      stepTraffic(traffic, FRAME, traffic.hours + FRAME / HOUR_SECONDS);
      look?.();
    }
  };

  it('runs a goods train in the valley and the yellow double-decker everywhere else', () => {
    for (const id of REGION_IDS) {
      const { train } = SITES[id];
      expect(train.length).toBeGreaterThanOrEqual(4);
      expect(train.some((file) => file.includes('carriage')), id).toBe(id === 'north');
      expect(train.every((file) => file.includes('electric-double')), id).toBe(id !== 'north');
    }
  });

  it('has mostly trucks and vans in the valley, quiet roads in the country, and the capital the busiest', () => {
    const count = (id: RegionId) => {
      const traffic = createTraffic(7, clockHours(0, 10), SITES[id].traffic, undefined, false, layoutOf(SITES[id]));
      const kinds: Record<string, number> = { car: 0, taxi: 0, van: 0, truck: 0, bus: 0 };
      let total = 0;
      let samples = 0;
      run(traffic, 120, () => {
        if (samples++ % 30) return;
        for (const v of vehiclesIn(traffic)) kinds[v.kind]!++;
        total += vehiclesIn(traffic).length;
      });
      return { kinds, average: total / (samples / 30) };
    };
    const valley = count('north');
    expect(valley.kinds.truck! + valley.kinds.van!).toBeGreaterThan(valley.kinds.car! + valley.kinds.taxi!);
    const [capital, fields, hills, coast] = [count('capital'), count('heartland'), count('highlands'), count('coast')];
    expect(capital.kinds.car!).toBeGreaterThan(capital.kinds.truck! * 3);
    expect(fields.average).toBeLessThan(capital.average * 0.6);
    expect(hills.average).toBeLessThan(capital.average * 0.6);
    expect(coast.average).toBeLessThan(capital.average);
    for (const id of REGION_IDS) for (const share of [Object.values(SITES[id].traffic.mix).reduce((a, b) => a + b, 0)]) expect(share).toBeCloseTo(1, 6);
  });

  it('lets no two vehicles touch on any site and with either building, nor a vehicle someone on a crossing, and has the bus at the stop at a quarter to every hour', () => {
    let crossings = 0;
    const sides = new Map<object, number>();
    for (const id of REGION_IDS) {
      for (const building of Object.values(BUILDINGS)) {
        const layout = layoutOf(SITES[id]);
        const traffic = createTraffic(11, clockHours(0, 8), SITES[id].traffic, building, SITES[id].front === 'water', layout);
        // The people out for a walk go on in the town all the while, and cross where the crossings are (0.20.0).
        const street = createStreet(strollers(11, SITES[id].strollers, building, layout));
        const first = Math.ceil(traffic.hours - BUS.due);
        for (let n = 0; n < 14; n++) {
          const due = first + n + BUS.due;
          const look = () => {
            stepStreet(street, traffic, [], 0, traffic.hours, FRAME);
            const hit = collision(traffic);
            if (hit) throw new Error(`${id}, ${building.id}: a ${hit[0].kind} and a ${hit[1].kind} touch.`);
            for (const person of street.crossers) {
              // On the strip over the street: a car cutting the corner of the pavement is nothing new, and not what the lights are for.
              const run = person.phase === 'cross' ? touchingPerson(traffic, person) : null;
              if (run) throw new Error(`${id}, ${building.id}: a ${run.kind} touches someone at ${person.x.toFixed(2)}, ${person.z.toFixed(2)} (${person.phase}).`);
              if (sides.get(person) !== undefined && sides.get(person) !== person.side) crossings++;
              sides.set(person, person.side);
            }
          };
          run(traffic, (due - traffic.hours) * HOUR_SECONDS, look);
          // A bus on a stop far from where its lane begins (the front street of Transponder Valley, #223) may be held up by a slow car in front of it: it is a few seconds late at the most.
          for (let late = 0; late < 4 / FRAME && !busAtStop(traffic); late++) run(traffic, FRAME, look);
          const bus = busAtStop(traffic);
          expect(bus, `${id}, ${building.id}, bus ${n}`).toBeDefined();
          expect(placeOf(traffic, bus!).x).toBeCloseTo(traffic.roads.busStop.x, 3);
        }
      }
    }
    // They do cross (in the grids of blocks).
    expect(crossings).toBeGreaterThan(0);
  }, 120_000);

  it('has fewer people out for a walk where fewer people live', () => {
    for (const id of REGION_IDS) expect(strollers(7, SITES[id].strollers, undefined, layoutOf(SITES[id]))).toHaveLength(SITES[id].strollers);
    expect(SITES.capital.strollers).toBeGreaterThan(SITES.north.strollers);
    expect(SITES.heartland.strollers).toBeLessThan(SITES.north.strollers);
    expect(SITES.highlands.strollers).toBeLessThan(SITES.north.strollers);
  });
});
