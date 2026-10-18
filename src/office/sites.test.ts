import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACTIVE_REGIONS } from '../config/balance';
import { FLOOR } from '../config/office';
import { REGIONS, type RegionId } from '../config/world';
import { CITY } from './assets';
import { PAVEMENT, STREET, clearance, townBlocks, townBuildings } from './city';
import { SITES, SITE_YARD } from './sites';
import { strollers } from './street';
import { touching } from './touching';
import { BUS, BUS_STOP, HOUR_SECONDS, LANES, busAtStop, clockHours, createTraffic, placeOf, stepTraffic, vehiclesIn, type Traffic } from './traffic';

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
    expect([...kit('capital')]).toEqual(['city']);
    expect([...kit('north')]).toEqual(['industrial']);
    expect([...kit('heartland')]).toEqual(['suburban']);
    expect([...kit('highlands')]).toEqual(['suburban']);
    expect([...kit('coast')].sort()).toEqual(['city', 'suburban']);
    // By the sea the houses stand in front of the office, towards the beach, and the big buildings behind it.
    for (const block of townBlocks(7, SITES.coast)) {
      for (const item of block.items) expect(item.building.file.startsWith('suburban/'), `${block.i}:${block.j}`).toBe(block.j >= 2);
    }
    expect(townBuildings(7, SITES.coast).some((b) => b.building.height * CITY.scale > 10)).toBe(true);
  });

  it('keeps every building on its own pavement and never lets one hide the front of the office', () => {
    for (const id of REGION_IDS) {
      const site = SITES[id];
      for (const seed of SEEDS) {
        for (const block of townBlocks(seed, site)) {
          for (const item of block.items) {
            const w = (item.turn % 2 === 0 ? item.building.w : item.building.d) * site.scale;
            const d = (item.turn % 2 === 0 ? item.building.d : item.building.w) * site.scale;
            expect(Math.abs(item.x - block.x) + w / 2, `${id} ${item.building.file}`).toBeLessThanOrEqual(PAD.w / 2 + 0.01);
            expect(Math.abs(item.z - block.z) + d / 2, `${id} ${item.building.file}`).toBeLessThanOrEqual(PAD.d / 2 + 0.01);
            expect(item.building.height * site.scale + PAVEMENT, `${id} ${item.building.file}`).toBeLessThanOrEqual(clearance(item.x, item.z, Math.min(w, 1), Math.min(d, 1)) + 1e-9);
          }
          if (block.hill) expect(block.hill.height).toBeLessThanOrEqual(clearance(block.x, block.z, block.hill.radius * 2, block.hill.radius * 2));
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
        if (site.trees > 0) {
          // Houses with gardens: one to a block.
          expect(several, id).toHaveLength(0);
          continue;
        }
        // In town most blocks of small buildings hold more than one; a tower or a large house still stands alone.
        const small = built.filter(({ buildings }) => buildings.every((item) => site.low.includes(item.building)));
        expect(small.filter(({ buildings }) => buildings.length > 1).length, `${id} ${seed}`).toBeGreaterThan(small.length * 0.6);
        expect(several.length, `${id} ${seed}`).toBeGreaterThan(built.length / 4);
        expect(several.length, `${id} ${seed}`).toBeLessThan(built.length);
        if (id === 'capital') expect(built.some(({ buildings }) => buildings.length >= 4)).toBe(true);

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
      expect(items.some((b) => b.building.file.includes('tree')), id).toBe(id === 'heartland' || id === 'highlands');
    }
  });

  it('lays open land around the towns in the country: fields, a lake and hills, a beach and the sea', () => {
    const grounds = (id: RegionId) => {
      const count: Record<string, number> = {};
      for (const block of townBlocks(7, SITES[id])) count[block.ground] = (count[block.ground] ?? 0) + 1;
      return count;
    };
    expect(Object.keys(grounds('capital'))).toEqual(['pavement']);
    expect(Object.keys(grounds('north'))).toEqual(['pavement']);
    expect(Object.keys(grounds('heartland')).sort()).toEqual(['field', 'grass']);
    expect(Object.keys(grounds('highlands')).sort()).toEqual(['grass', 'water']);
    expect(Object.keys(grounds('coast')).sort()).toEqual(['pavement', 'sand', 'water']);

    // Hills only in the hills, behind the office, and not on every block.
    for (const id of REGION_IDS) {
      const hills = townBlocks(7, SITES[id]).filter((block) => block.hill);
      expect(hills.length > 0, id).toBe(id === 'highlands');
      for (const block of hills) expect(block.j).toBeLessThanOrEqual(-2);
    }
    // The beach: sand beyond the last street in front, the sea beyond the sand.
    const front = townBlocks(7, SITES.coast).filter((block) => block.land);
    expect(new Set(front.filter((b) => b.ground === 'sand').map((b) => b.j)).size).toBe(1);
    expect(Math.min(...front.filter((b) => b.ground === 'water').map((b) => b.j))).toBeGreaterThan(Math.max(...front.filter((b) => b.ground === 'sand').map((b) => b.j)));
    // The lake: a green bank along the last street, the water beyond it.
    const lake = townBlocks(7, SITES.highlands).filter((block) => block.ground === 'water');
    expect(new Set(lake.map((b) => b.j)).size).toBe(1);
    expect(townBlocks(7, SITES.highlands).filter((b) => b.j === lake[0]!.j - 1).every((b) => b.ground === 'grass' && b.land)).toBe(true);
  });

  it('has no street in the water: the water is one piece, and the side streets end at the street along the shore (0.11.0)', () => {
    const lastStreet = STREET.from.z + STREET.length.z;
    for (const id of REGION_IDS) {
      const site = SITES[id];
      const water = townBlocks(5, site).filter((block) => block.ground === 'water');
      expect(water.length > 0, id).toBe(site.front === 'water');
      if (site.front !== 'water') continue;
      // Every block of water and of the shore is as wide as a block of the town, with no strip left open beside it.
      for (const block of townBlocks(5, site).filter((b) => b.j > 3)) expect(block.land!.w, `${id} ${block.i}:${block.j}`).toBeCloseTo(CITY.block.w, 9);
      // Nobody drives past the street along the shore: whoever comes down a side street turns there.
      const traffic = createTraffic(5, clockHours(0, 10), site.traffic, undefined, true);
      let turned = 0;
      for (let n = 0; n < 120 * 30; n++) {
        stepTraffic(traffic, 1 / 30, traffic.hours + 1 / 30 / HOUR_SECONDS);
        for (const v of vehiclesIn(traffic)) {
          const { z } = placeOf(traffic, v);
          expect(z, `${id}: a ${v.kind} at ${z}`).toBeLessThan(lastStreet + CITY.streetWidth / 2);
          if (v.turn && traffic.lanes[v.lane]!.along === 'z' && traffic.lanes[v.lane]!.direction > 0) turned++;
        }
      }
      expect(turned, id).toBeGreaterThan(0);
    }
  });

  it('never covers a lane that is driven on with land, and leaves the office’s own block alone', () => {
    const half = CITY.streetWidth / 4;
    for (const id of REGION_IDS) {
      for (const block of townBlocks(3, SITES[id])) {
        expect(block.i >= 0 && block.i < 4 && block.j >= 0 && block.j < 2, `${id} ${block.i}:${block.j}`).toBe(false);
        const land = block.land;
        if (!land) continue;
        expect(block.items.every((item) => item.building.file.includes('tree'))).toBe(true);
        for (const lane of LANES) {
          const [across, wide, along, long] = lane.along === 'x' ? [land.z, land.d, land.x, land.w] : [land.x, land.w, land.z, land.d];
          const ends = [lane.origin, lane.origin + lane.direction * lane.length];
          // By the water the side streets end at the street along the shore.
          const reach = SITES[id].front === 'water' && lane.along === 'z' ? STREET.from.z + STREET.length.z + CITY.streetWidth / 2 : Math.max(...ends);
          if (along + long / 2 <= Math.min(...ends) || along - long / 2 >= reach) continue;
          expect(Math.abs(across - lane.at), `${id} ${block.i}:${block.j} and the lane at ${lane.at}`).toBeGreaterThanOrEqual(wide / 2 + half - 1e-9);
        }
        // In front of the office it stays flat.
        expect(block.j < 0 || !block.hill).toBe(true);
        expect(land.z - land.d / 2).toBeGreaterThan(block.j >= 2 ? FLOOR.h : -Infinity);
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
      const traffic = createTraffic(7, clockHours(0, 10), SITES[id].traffic);
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

  it('lets no two vehicles touch on any site, and has the bus at the stop at a quarter to every hour', () => {
    for (const id of REGION_IDS) {
      const traffic = createTraffic(11, clockHours(0, 8), SITES[id].traffic);
      const first = Math.ceil(traffic.hours - BUS.due);
      for (let n = 0; n < 14; n++) {
        const due = first + n + BUS.due;
        run(traffic, (due - traffic.hours) * HOUR_SECONDS, () => {
          const hit = collision(traffic);
          if (hit) throw new Error(`${id}: a ${hit[0].kind} and a ${hit[1].kind} touch.`);
        });
        const bus = busAtStop(traffic);
        expect(bus, `${id}, bus ${n}`).toBeDefined();
        expect(placeOf(traffic, bus!).x).toBeCloseTo(BUS_STOP.x, 3);
      }
    }
  });

  it('has fewer people out for a walk where fewer people live', () => {
    for (const id of REGION_IDS) expect(strollers(7, SITES[id].strollers)).toHaveLength(SITES[id].strollers);
    expect(SITES.capital.strollers).toBeGreaterThan(SITES.north.strollers);
    expect(SITES.heartland.strollers).toBeLessThan(SITES.north.strollers);
    expect(SITES.highlands.strollers).toBeLessThan(SITES.north.strollers);
  });
});
