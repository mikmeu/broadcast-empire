import { describe, expect, it } from 'vitest';
import { BUILDINGS, CORE, FLOOR, WEST, buildingFor, onFloor, westOf, widthOf } from '../config/office';
import { TOWN_MAPS } from '../config/townMaps';
import { CITY } from './assets';
import { PAVEMENT, busyStreets, hidesOffice, officeBlock, streets, townBlocks, townBuildings, trainAt } from './city';
import { SITES } from './sites';
import { T_TOWN } from './syntheticTowns';
import { CAPITAL, GRID, layoutOf, layoutOfMap } from './townLayout';
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
    // Of the two streets along x in front of the office, one: the road in the drawing (two carriageways a tile apart) is a single road with a strip in the middle (#194).
    expect(busy.filter((s) => s.along === 'x').map((s) => s.at)).toEqual([68.5]);
    expect(busy.filter((s) => s.along === 'x').map((s) => s.width)).toEqual([9]);
    const roads = roadsOf(CAPITAL);
    expect(roads.crossings.map((c) => [c.x, c.z])).toEqual([[-22, 68.5], [25, 68.5]]);
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
    expect(roadsOf(CAPITAL).lanes.every((lane) => lane.along !== 'x' || Math.abs(lane.at - CAPITAL.railway.z) > CAPITAL.streetWidth / 2)).toBe(true);
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
    // (Half as many buildings to a band since 0.20.0, when the kit was drawn twice as large.)
    expect(blocks.filter((b) => b.j === -1).every((b) => b.items.length > 4), String(blocks.filter((b) => b.j === -1).map((b) => b.items.length))).toBe(true);
    const picture = (seed: number) => townBlocks(seed, SITES.capital, STANDARD).map((b) => b.items.map((i) => `${i.building.file}@${i.turn}`).join('+')).join();
    expect(picture(7)).toBe(picture(7));
    expect(picture(7)).not.toBe(picture(8));
  });
});

describe('streets without an extent of their own (#217)', () => {
  // (Not the two towns laid out by their roads, #218: their streets all have an extent.)
  const layouts = [GRID, ...Object.values(SITES).map(layoutOf)].filter((layout) => !layout.edge);

  it('run the full length of the town and out of sight at both ends, with a crossing of four ways wherever two of them meet', () => {
    for (const layout of layouts) {
      const roads = roadsOf(layout);
      expect(layout.edge).toBeUndefined();
      for (const lane of roads.lanes) {
        // (Except the drive past the shore to the lot of Skywave Beach, #219: its street has an extent of its own, and ends in a dead end.)
        if (lane.startsAt === 'dead' || lane.endsAt === 'dead') {
          expect(layout.id).toBe('skywave-beach');
          expect(lane.along).toBe('z');
          continue;
        }
        // From `MARGIN` before the first street to `MARGIN` past the last.
        expect(lane.length).toBeCloseTo(layout.length[lane.along] + 12, 9);
        expect(lane.startsAt).toBe('edge');
        expect(lane.endsAt).toBe('edge');
        expect(Math.min(lane.origin, lane.origin + lane.direction * lane.length)).toBeCloseTo(layout.from[lane.along] - 6, 9);
        // Every crossing has all the ways on that a street with lights has had: straight on, and a turn right from the kerb lane or a turn left from the lane next to the middle (#194).
        for (const c of lane.crossings) {
          expect(c.exits).toEqual(expect.arrayContaining(['straight']));
          // (Never against a one-way street, and only from the lane the turn is made from.)
          if (c.right) expect(lane.place).toBe(0);
          if (c.left) expect(lane.place).toBe(lane.places - 1);
        }
      }
      // Every pair of busy streets meets: ids count the pairs, x streets first.
      const busy = layout.busy(STANDARD);
      const across = { x: busy.filter((s) => s.along === 'x'), z: busy.filter((s) => s.along === 'z') };
      expect(roads.count).toBe(across.x.length * across.z.length);
      expect(roads.crossings.every((c) => c.arms === 4)).toBe(true);
    }
  });

  it('give the lanes of a street the ends it has been drawn with: `from` and `to` cut a street, and an end beside another street is cut off at its middle line', () => {
    // (The made-up towns, syntheticTowns.ts, are tried in traffic.test.ts: the T, the corner, the dead end and the ring.)
    const lanes = roadsOf(T_TOWN).lanes;
    const stem = lanes.filter((lane) => lane.along === 'z');
    // The street from the south begins in the middle line of the main street (z 0) and ends past the edge (z 60 and 6 more: the made-up towns are twice the size they were drawn at, 0.20.0).
    expect(stem.map((lane) => Math.min(lane.origin, lane.origin + lane.direction * lane.length)).sort()).toEqual([0, 0]);
    expect(stem.map((lane) => Math.max(lane.origin, lane.origin + lane.direction * lane.length)).sort()).toEqual([66, 66]);
  });
});

describe('Aerial Fields and Amplify Hills laid out by their roads (#218)', () => {
  const towns = [
    { name: 'aerial-fields', site: SITES.heartland, entries: 2 },
    { name: 'amplify-hills', site: SITES.highlands, entries: 1 },
  ] as const;

  it('are laid out by their roads and not as a grid of cells, and the other map towns still are', () => {
    for (const { name, site } of towns) {
      const layout = layoutOf(site);
      expect(layout.id).toBe(name);
      expect(layout.map!.cells).toHaveLength(0);
      expect(layout.map!.roads.length).toBeGreaterThan(3);
    }
    for (const site of [SITES.capital, SITES.north, SITES.coast]) expect(layoutOf(site).map!.roads).toHaveLength(0);
  });

  it('have roads drawn two tiles wide from the 2-tile lanes and driven as four, and the 1-tile lanes of the drawing are driveways with no traffic', () => {
    for (const { name, site } of towns) {
      const layout = layoutOf(site);
      const parts = layout.map!;
      // (Vehicles are drawn twice as large since 0.20.0: a lane of 2 tiles each way, over a road drawn 2 wide.)
      expect(layout.streetWidth, name).toBe(4);
      const narrow = TOWN_MAPS[name]!.lanes.filter((lane) => Math.min(lane.w, lane.h) === 1);
      expect(narrow.length, name).toBe(name === 'aerial-fields' ? 3 : 0);
      // They are paved, and no road is on one.
      const paved = parts.driveways.filter((r) => Math.min(r.w, r.d) === 1);
      expect(paved, name).toHaveLength(narrow.length);
      for (const r of paved) {
        for (const road of parts.roads) {
          const [across, low, high] = road.along === 'x' ? [r.z, r.x, r.x + r.w] : [r.x, r.z, r.z + r.d];
          const inside = across + 1 > road.at - layout.streetWidth / 2 && across < road.at + layout.streetWidth / 2 && high > road.from! && low < road.to!;
          expect(inside, `${name}: a driveway at ${r.x}, ${r.z} on a road`).toBe(false);
        }
      }
      // The unused parking strip is paved too.
      expect(parts.driveways.length, name).toBe(narrow.length + 1);
    }
  });

  it('give every road its own ends, and let vehicles in only where a road reaches the edge of the drawing', () => {
    for (const { name, site, entries } of towns) {
      const layout = layoutOf(site);
      const edge = layout.edge!;
      expect(edge, name).toBeDefined();
      for (const road of layout.map!.roads) {
        const [low, high] = road.along === 'x' ? [edge.x, edge.x + edge.w] : [edge.z, edge.z + edge.d];
        expect(road.to!, name).toBeGreaterThan(road.from!);
        expect(road.from!, name).toBeGreaterThanOrEqual(low - 1e-9);
        expect(road.to!, name).toBeLessThanOrEqual(high + 1e-9);
      }
      const roads = roadsOf(layout);
      expect(roads.lanes.filter((lane) => lane.startsAt === 'edge'), name).toHaveLength(entries);
      expect(roads.lanes.filter((lane) => lane.endsAt === 'edge'), name).toHaveLength(entries);
      // Every junction is a crossing, a T or a corner.
      for (const c of roads.crossings) expect([2, 3, 4], `${name} at ${c.x}, ${c.z}`).toContain(c.arms);
      // No two junctions on a lane are closer than a vehicle needs to stand between them.
      for (const lane of roads.lanes) {
        const at = lane.crossings.map((c) => c.s).sort((a, b) => a - b);
        for (let n = 1; n < at.length; n++) expect(at[n]! - at[n - 1]!, `${name}: junctions on the lane at ${lane.at}`).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it('have the dead ends of the drawing: the stub in Amplify Hills, and the road across the mouth of the U in Aerial Fields', () => {
    const ends = (name: string) => roadsOf(layoutOfMap(name)).lanes.filter((lane) => lane.startsAt === 'dead' || lane.endsAt === 'dead');
    // The street at the west of Amplify Hills runs on north of its last junction and ends in the hills: one lane each way.
    const stub = ends('amplify-hills');
    expect(stub).toHaveLength(2);
    expect(stub.every((lane) => lane.along === 'z')).toBe(true);
    // Aerial Fields: the road along the mouth of the U, whose T-junction is in the middle of it, runs out at both ends.
    const mouth = ends('aerial-fields');
    expect(mouth).toHaveLength(2);
    expect(mouth.every((lane) => lane.along === 'x' && lane.startsAt === 'dead' && lane.endsAt === 'dead')).toBe(true);
  });

  it('stand the building of Aerial Fields on all the red shapes, its door where the reception rect faces the U; the building of Amplify Hills stands on its red shapes too, the spine one row deeper', () => {
    const aerial = TOWN_MAPS['aerial-fields']!;
    const fields = BUILDINGS.fields;
    const shiftAerial = { x: westOf(fields) - Math.min(...aerial.wings.map((w) => w.x)), z: 0 };
    // The wings of the building are the drawing's red shapes and its reception box, exactly.
    const drawn = [...aerial.wings, aerial.reception!].map((w) => ({ x: w.x + shiftAerial.x, y: w.y + shiftAerial.z, w: w.w, h: w.h }));
    const key = (r: { x: number; y: number; w: number; h: number }) => `${r.x},${r.y},${r.w},${r.h}`;
    expect(drawn.map(key).sort()).toEqual(fields.wings.map(key).sort());
    // The door is on the middle of the south face of the reception rect, into the U, and the gate in front of it.
    const places = layoutOf(SITES.heartland).places;
    expect(places.door.x).toBeCloseTo(aerial.reception!.x + aerial.reception!.w / 2 + shiftAerial.x, 5);
    expect(places.door.z).toBeCloseTo(aerial.reception!.y + aerial.reception!.h + shiftAerial.z + 0.15, 5);
    expect(places.gate.z).toBeCloseTo(aerial.reception!.y + aerial.reception!.h + shiftAerial.z + 1, 5);
    // The plot is the red shapes together.
    expect(layoutOf(SITES.heartland).map!.plot).toEqual({ x: westOf(fields), z: 0, w: widthOf(fields), d: fields.depth });
    const amplify = TOWN_MAPS['amplify-hills']!;
    const hills = BUILDINGS.hills;
    const shiftHills = { x: westOf(hills) - Math.min(...amplify.wings.map((w) => w.x)), z: 0 };
    const drawnHills = [...amplify.wings, amplify.reception!].map((w) => ({ x: w.x + shiftHills.x, y: w.y + shiftHills.z, w: w.w, h: w.h }));
    // Every red shape and the box of the reception lie in the building, and only the spine's one extra row (y 26) is not drawn.
    for (const r of drawnHills) for (let x = r.x; x < r.x + r.w; x++) for (let y = r.y; y < r.y + r.h; y++) expect(onFloor(hills, x, y), `${x}, ${y}`).toBe(true);
    for (let x = -45; x < 46; x++) for (let y = 0; y < 47; y++) if (onFloor(hills, x, y) && !drawnHills.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)) expect([x >= -27 && x < 28, y]).toEqual([true, 26]);
    // The door is on the middle of the south face of the reception box, onto the road, and the gate in front of it.
    const door = layoutOf(SITES.highlands).places;
    expect(door.door.x).toBeCloseTo(amplify.reception!.x + amplify.reception!.w / 2 + shiftHills.x, 5);
    expect(door.door.z).toBeCloseTo(amplify.reception!.y + amplify.reception!.h + 0.15, 5);
    expect(layoutOf(SITES.highlands).map!.plot).toEqual({ x: westOf(hills), z: 0, w: widthOf(hills), d: 37 });
    // The lot is in the west strip, beside the reception: the two strips are as far from the door.
    const lot = layoutOf(SITES.highlands).lot(hills);
    expect(lot.block.x + lot.block.w).toBeLessThanOrEqual(-5);
    expect(lot.block.z).toBeGreaterThan(37);
  });

  it('open the lot onto the road south of it, on a drawn parking strip, with the stops on that road', () => {
    for (const { name, site } of towns) {
      const layout = layoutOf(site);
      const strips = [...TOWN_MAPS[name]!.parking, ...TOWN_MAPS[name]!.courtyard.parking];
      const building = buildingFor(name === 'aerial-fields' ? 'heartland' : 'highlands');
      const lot = layout.lot(building);
      expect(lot.along, name).toBe('x');
      expect(lot.side, name).toBe(-1);
      expect(strips.some((s) => lot.block.w <= s.w && lot.block.d <= s.h), name).toBe(true);
      // South of the floor above it, north of its road, and clear of the end of that road. (In the U the lot is between the legs, under the wing.)
      for (const wing of building.wings) if (wing.x < lot.block.x + lot.block.w && wing.x + wing.w > lot.block.x) expect(lot.block.z, name).toBeGreaterThan(wing.y + wing.h);
      const road = layout.map!.roads.find((r) => r.along === 'x' && r.at === lot.street)!;
      // (The road as drawn: the lot is clear of its kerb.)
      expect(road.at - CITY.streetWidth / 2, name).toBeGreaterThanOrEqual(lot.block.z + lot.block.d);
      expect(lot.block.x + lot.block.w, name).toBeLessThanOrEqual(road.to! - 3 + 1e-9);
      expect(layout.stops.bus.along).toBe('x');
      expect(layout.stops.bus.at).toBe(lot.street);
      expect(layout.stops.taxi.at).toBe(lot.street);
      // The bus can drive to its stop and on to an edge without a dead end, and arrives from an entry lane.
      expect(roadsOf(layout).busRoute.legs.length).toBeGreaterThan(1);
    }
  });

  it('keep the stops of Transponder Valley and Skywave Beach at their entrances, though they draw BUS and STOP apart', () => {
    for (const name of ['transponder-valley', 'skywave-beach']) {
      expect(TOWN_MAPS[name]!.busStop, name).not.toBeNull();
      const stops = layoutOfMap(name).stops;
      expect(stops.bus.pos - stops.taxi.pos, name).toBeGreaterThan(0);
    }
  });

  it('put the train where the drawing has it: north of the office in Aerial Fields, south of every road in Amplify Hills', () => {
    const aerial = layoutOf(SITES.heartland);
    const amplify = layoutOf(SITES.highlands);
    expect(aerial.railway.z).toBeLessThan(0);
    expect(amplify.railway.z).toBeGreaterThan(Math.max(...amplify.map!.roads.filter((r) => r.along === 'x').map((r) => r.at)));
    for (const layout of [aerial, amplify]) {
      expect(layout.railway.width).toBe(2);
      // A train crosses the drawing, and no road crosses the line.
      expect(trainAt(0, 4, layout)).toEqual({ x: layout.railway.from, direction: 1 });
      for (const road of layout.map!.roads) expect(road.along === 'x' || road.from! > layout.railway.z || road.to! < layout.railway.z).toBe(true);
    }
  });
});
