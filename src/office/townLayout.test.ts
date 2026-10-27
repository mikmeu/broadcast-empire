import { describe, expect, it } from 'vitest';
import { BUILDINGS, CORE, FLOOR, WEST, widthOf } from '../config/office';
import { TOWN_MAPS } from '../config/townMaps';
import { CITY } from './assets';
import { PAVEMENT, busyStreets, hidesOffice, officeBlock, streets, townBlocks, townBuildings, trainAt } from './city';
import { SITES } from './sites';
import { CAPITAL, GRID, layoutOf } from './townLayout';
import { createTraffic, roadsOf, stepTraffic, vehiclesIn } from './traffic';

const MAP = TOWN_MAPS.coaxia!;
const STANDARD = BUILDINGS.standard;
const LONG = BUILDINGS.long;
const SEEDS = [1, 7, 12345];

/** The map's tile coordinates in the game's: the north wing, where the office stands, is the office's own floor. */
const north = MAP.wings.filter((wing) => wing.w > wing.h).reduce((a, b) => (b.y < a.y ? b : a));
const shift = { x: WEST - north.x, z: -north.y };

describe('a grid of blocks, as it always was (0.20.0)', () => {
  it('is the capital’s town as it was before the map: the same blocks, streets and railway, 2 tiles wide streets', () => {
    expect(GRID.streetWidth).toBe(CITY.streetWidth);
    expect(GRID.own(STANDARD)).toEqual({ x: -9, z: -2, w: 32, d: 15 });
    expect(GRID.own(LONG)).toEqual({ x: -9, z: -2, w: 40, d: 15 });
    expect(GRID.from).toEqual({ x: -41, z: -39.5 });
    expect(GRID.length).toEqual({ x: 80, z: 67.5 });
    expect(GRID.railway).toMatchObject({ z: 20.5, from: -41, length: 80 });
    expect(GRID.railway.strips).toHaveLength(10);
    expect(GRID.lot(STANDARD)).toEqual({ block: { x: 24, z: -1, w: 6, d: 13 }, street: 23 });
    expect(GRID.lot(LONG)).toEqual({ block: { x: 32, z: -1, w: 6, d: 13 }, street: 31 });
    // Three streets along z and three along x carry traffic around the standard building, and the street the long building stands across none.
    expect(GRID.busy(STANDARD)).toHaveLength(6);
    expect(GRID.busy(LONG)).toHaveLength(5);
    expect(roadsOf(GRID).count).toBe(9);
    // Only the capital is laid out from the map.
    for (const [id, site] of Object.entries(SITES)) expect(layoutOf(site) === CAPITAL, id).toBe(id === 'capital');
  });
});

describe('Coax City laid out from the map (0.20.0)', () => {
  const lanes = (vertical: boolean) => MAP.lanes.filter((lane) => (vertical ? lane.h > lane.w : lane.w > lane.h));

  it('has the streets of the map: where the lanes are, four tiles wide with two lanes drawn, and one more street past the east edge', () => {
    expect(CAPITAL.streetWidth).toBe(4);
    const all = CAPITAL.streets(STANDARD);
    // A street is two lanes of the map side by side.
    for (const vertical of [true, false]) {
      const found = all.filter((s) => s.along === (vertical ? 'z' : 'x') && s.at !== CAPITAL.railway.z && !(vertical && s.at > 70)).map((s) => s.at);
      const lines = [...new Set(lanes(vertical).map((lane) => (vertical ? lane.x + shift.x : lane.y + shift.z)))].sort((a, b) => a - b);
      // The street's middle is between its two lanes: the first lane's near edge plus a lane.
      const middles = lines.filter((_, n) => n % 2 === 0).map((line) => line + 2);
      expect(found.sort((a, b) => a - b), vertical ? 'along z' : 'along x').toEqual(middles);
    }
    // The last street east is past the last of the map's blocks, a street wide.
    const east = Math.max(...[...MAP.buildings, ...MAP.alleys].map((r) => r.x + r.w)) + shift.x;
    expect(all.filter((s) => s.along === 'z').at(-1)!.at).toBe(east + 2);
  });

  it('has the office at the north wing: the standard building is exactly the wing of the map', () => {
    expect(north).toMatchObject({ w: STANDARD.w + CORE.w, h: FLOOR.h });
    expect(widthOf(STANDARD)).toBe(north.w);
    expect(north.x + shift.x).toBe(WEST);
    expect(north.y + shift.z).toBe(0);
    // The reception’s street is the west one of the map, level with the entrance, with the office between it and the east street.
    const own = officeBlock(STANDARD);
    expect(own.x).toBe(CAPITAL.stops.bus.at);
    expect(own.x).toBeLessThan(WEST - CORE.w);
    expect(own.x + own.w).toBeGreaterThan(widthOf(STANDARD) + WEST);
    expect(own.z).toBeLessThan(0);
    expect(own.z + own.d).toBeGreaterThan(FLOOR.h);
    // A longer building reaches over the street east of it.
    expect(officeBlock(LONG).w).toBeGreaterThan(own.w);
    expect(WEST + widthOf(LONG)).toBeGreaterThan(CAPITAL.streets(STANDARD).filter((s) => s.along === 'z').at(-2)!.at);
  });

  it('has lights at the junctions of the busy streets: the reception’s street and the one east of the office with the road in front', () => {
    const busy = busyStreets(STANDARD);
    expect(busy.filter((s) => s.along === 'z').map((s) => s.at)).toEqual([-22, 25]);
    // Of the two streets along x in front of the office, one: the road in the drawing (one of two streets a tile apart) is a single road.
    expect(busy.filter((s) => s.along === 'x').map((s) => s.at)).toEqual([66]);
    const roads = roadsOf(CAPITAL);
    expect(roads.crossings.map((c) => [c.x, c.z])).toEqual([[-22, 66], [25, 66]]);
    const traffic = createTraffic(3, 30, SITES.capital.traffic, STANDARD);
    expect(traffic.crossings.every((c) => c.lights !== null)).toBe(true);
    // Around the long building the street it stands across is closed, and so is its junction.
    expect(busyStreets(LONG).filter((s) => s.along === 'z').map((s) => s.at)).toEqual([-22]);
    expect(streets(LONG).some((s) => s.along === 'z' && s.at === 25)).toBe(false);
  });

  it('has no traffic in the street the long building stands across, and all of it in the others', () => {
    const traffic = createTraffic(3, 30, SITES.capital.traffic, LONG);
    const inClosed = (lane: number) => traffic.closed[lane]!;
    let seen = 0;
    for (let n = 0; n < 600; n++) {
      stepTraffic(traffic, 0.5, 30 + n / 120);
      for (const vehicle of vehiclesIn(traffic)) {
        seen++;
        expect(inClosed(vehicle.lane)).toBe(false);
        expect(traffic.lanes[vehicle.lane]!.at).not.toBeCloseTo(25 + (traffic.lanes[vehicle.lane]!.direction > 0 ? -1 : 1), 6);
      }
    }
    expect(seen).toBeGreaterThan(100);
  });

  it('puts the railway along the map’s train strip, south of the southern streets, not over a street', () => {
    const train = MAP.train!;
    expect(CAPITAL.railway.z).toBe(train.y + train.h / 2 + shift.z);
    expect(CAPITAL.railway.width).toBe(train.h);
    const southmost = Math.max(...CAPITAL.streets(STANDARD).filter((s) => s.along === 'x' && s.at !== CAPITAL.railway.z).map((s) => s.at));
    expect(CAPITAL.railway.z).toBeGreaterThan(southmost + CAPITAL.streetWidth / 2);
    expect(roadsOf(CAPITAL).lanes.every((lane) => lane.along !== 'x' || Math.abs(lane.at - CAPITAL.railway.z) > CAPITAL.streetWidth)).toBe(true);
    // The line runs from one end of the town to the other, and a train crosses it.
    expect(CAPITAL.railway.from).toBe(CAPITAL.from.x);
    expect(CAPITAL.railway.length).toBe(CAPITAL.length.x);
    expect(trainAt(0, 4)).toEqual({ x: CAPITAL.railway.from, direction: 1 });
    // A paved strip under the line between every two streets, none under a street.
    for (const strip of CAPITAL.railway.strips) {
      for (const street of CAPITAL.streets(STANDARD).filter((s) => s.along === 'z')) expect(street.at < strip.from || street.at > strip.to).toBe(true);
    }
  });

  it('builds the blocks of the map: a terrace along every side of each band of buildings, with the yard open, and green strips with trees', () => {
    const blocks = townBlocks(7, SITES.capital, STANDARD);
    const parts = CAPITAL.map!;
    // One block to every cell of the grid the streets make, and the bands of buildings beyond the north edge.
    expect(blocks.length).toBe(parts.cells.length + parts.beyond.length);
    expect(parts.beyond.length).toBe(3);
    const bands = parts.buildings.map((r) => ({ x: r.x + r.w / 2, z: r.z + r.d / 2, w: r.w, d: r.d }));
    expect(bands).toHaveLength(MAP.buildings.length);
    for (const band of bands) {
      const around = townBuildings(7, SITES.capital, STANDARD).filter((b) => Math.abs(b.x - band.x) < band.w / 2 && Math.abs(b.z - band.z) < band.d / 2);
      // Buildings stand along its sides, not in the middle of it: a yard is left open.
      if (around.length === 0) continue;
      const yard = { w: band.w - 2 * 8, d: band.d - 2 * 8 };
      expect(around.filter((b) => Math.abs(b.x - band.x) < yard.w / 2 && Math.abs(b.z - band.z) < yard.d / 2), `band at ${band.x}, ${band.z}`).toHaveLength(0);
      expect(around.length).toBeGreaterThan(10);
    }
    // The green strips are grass with trees, the rest pavement.
    const greens = blocks.filter((b) => b.ground === 'grass');
    expect(greens.length).toBe(MAP.greens.length - 1);
    for (const block of greens) {
      expect(block.items.length).toBeGreaterThan(5);
      expect(block.items.every((item) => item.building.file.includes('tree'))).toBe(true);
    }
    // The alleyways are strips of the map on the cells, with nothing on them.
    expect(blocks.flatMap((b) => b.alleys ?? [])).toHaveLength(MAP.alleys.length);
  });

  it('stands nothing on a street or an alleyway, and keeps the company’s own ground, the lot and the drive free', () => {
    const parts = CAPITAL.map!;
    const streetBands = CAPITAL.streets(STANDARD).map((s) => ({ along: s.along, from: s.at - CAPITAL.streetWidth / 2, to: s.at + CAPITAL.streetWidth / 2 }));
    for (const building of [STANDARD, LONG]) {
      const lot = CAPITAL.lot(building).block;
      const plot = parts.plot;
      for (const seed of SEEDS) {
        for (const block of townBlocks(seed, SITES.capital, building)) {
          for (const item of block.items) {
            const w = (item.turn % 2 === 0 ? item.building.w : item.building.d) * SITES.capital.scale;
            const d = (item.turn % 2 === 0 ? item.building.d : item.building.w) * SITES.capital.scale;
            const [x0, x1, z0, z1] = [item.x - w / 2, item.x + w / 2, item.z - d / 2, item.z + d / 2];
            for (const street of streetBands) {
              const [a, b] = street.along === 'z' ? [x0, x1] : [z0, z1];
              expect(b <= street.from + 1e-6 || a >= street.to - 1e-6, `${item.building.file} at ${item.x}, ${item.z} on a street`).toBe(true);
            }
            for (const alley of parts.alleys) {
              const apart = x1 <= alley.x + 1e-6 || x0 >= alley.x + alley.w - 1e-6 || z1 <= alley.z + 1e-6 || z0 >= alley.z + alley.d - 1e-6;
              expect(apart, `${item.building.file} at ${item.x}, ${item.z} on an alleyway`).toBe(true);
            }
            const apart = (r: { x: number; z: number; w: number; d: number }) => x1 <= r.x + 1e-6 || x0 >= r.x + r.w - 1e-6 || z1 <= r.z + 1e-6 || z0 >= r.z + r.d - 1e-6;
            expect(apart(plot), `${item.building.file} at ${item.x}, ${item.z} on the company's ground`).toBe(true);
            expect(apart(lot), `${item.building.file} on the lot`).toBe(true);
          }
        }
      }
    }
  });

  it('lets nothing in front of the office hide its ground floor, with either building', () => {
    for (const building of [STANDARD, LONG]) {
      for (const seed of SEEDS) {
        for (const item of townBuildings(seed, SITES.capital, building)) {
          expect(hidesOffice(item, 0, SITES.capital.scale, building), `${item.building.file} at ${item.x}, ${item.z}`).toBe(false);
        }
      }
    }
    // A town with a skyline behind the office, and low buildings in front.
    const town = townBuildings(7, SITES.capital, STANDARD);
    expect(town.some((b) => b.building.height * CITY.scale > 10)).toBe(true);
    expect(PAVEMENT).toBeLessThan(1);
  });

  it('goes on past the north edge of the map with its outermost row of blocks, and is the same every time for a game', () => {
    const parts = CAPITAL.map!;
    const north = CAPITAL.from.z;
    for (const band of parts.beyond) expect(band.z + band.d).toBeLessThanOrEqual(north);
    const blocks = townBlocks(7, SITES.capital, STANDARD);
    expect(blocks.filter((b) => b.j === -1).every((b) => b.items.length > 10)).toBe(true);
    const picture = (seed: number) => townBlocks(seed, SITES.capital, STANDARD).map((b) => b.items.map((i) => `${i.building.file}@${i.turn}`).join('+')).join();
    expect(picture(7)).toBe(picture(7));
    expect(picture(7)).not.toBe(picture(8));
  });
});
