import { describe, expect, it } from 'vitest';
import { BUILDINGS, buildingFor } from '../config/office';
import { MAPS } from '../config/maps';
import type { MapFile } from '../mods/mapFile';
import { CITY } from './assets';
import { arrowsOf, lampTurn, townBlocks, townBuildings } from './city';
import { SITES } from './sites';
import { checkTown } from './townCheck';
import { CAPITAL, GRID, PREVIEW_MAP, houseOf, layoutFromMap, layoutOf, layoutOfMap, setPreviewLayout } from './townLayout';
import { roadsOf } from './traffic';

// The layout of every town as it was is held by layout.fixture.test.ts and traffic.fixture.test.ts (the layout code of the drawings it replaced
// was removed in #331). These are the rules of the one layout function that reads a map file (#327).

const copy = (id: string, change: (file: MapFile) => void = () => {}): MapFile => {
  const file = structuredClone(MAPS[id]!);
  change(file);
  return file;
};

describe('a grid of blocks, as it always was (0.20.0)', () => {
  it('is the capital’s town as it was before the map: 2 tiles wide streets', () => {
    expect(GRID.streetWidth).toBe(CITY.streetWidth);
    expect(GRID.own(BUILDINGS.standard)).toEqual({ x: -9, z: -2, w: 32, d: 15 });
    expect(GRID.from).toEqual({ x: -41, z: -39.5 });
  });
});

describe('one layout from a map file', () => {
  it('lays out each default town from its file, once, and the same every time', () => {
    for (const [id, file] of Object.entries(MAPS)) {
      const site = Object.values(SITES).find((s) => s.map === id)!;
      expect(layoutOf(site)).toBe(layoutOfMap(id));
      expect(layoutFromMap(file).id).toBe(id);
      expect(layoutFromMap(file).streets(houseOf(file))).toEqual(layoutFromMap(file).streets(houseOf(file)));
    }
    expect(layoutOf(SITES.capital)).toBe(CAPITAL);
  });

  it('accepts the five towns as they are written', () => {
    for (const file of Object.values(MAPS)) expect(checkTown(file), file.id).toEqual({ ok: true });
  });

  it('is by its roads where the file says so, and a grid of cells where it does not', () => {
    const roads = Object.values(MAPS).filter((f) => f.settings.layout === 'roads').map((f) => f.id).sort();
    expect(roads).toEqual(['aerial-fields', 'amplify-hills']);
    for (const file of Object.values(MAPS)) {
      const map = layoutFromMap(file).map!;
      expect(map.roads.length > 0, file.id).toBe(file.settings.layout === 'roads');
      expect(map.cells.length > 0, file.id).toBe(file.settings.layout === 'grid');
    }
  });

  it('stands what the file writes, whatever the game’s seed: the same houses, trees, lamps and hills in every game', () => {
    for (const site of Object.values(SITES)) {
      const parts = layoutOf(site).map!;
      const blocks = townBlocks(site);
      expect(blocks.flatMap((b) => b.items)).toHaveLength(parts.houses.length + parts.trees.length);
      expect(blocks.flatMap((b) => b.hill ?? [])).toHaveLength(parts.hills.length);
      expect(blocks.flatMap((b) => b.lamps ?? [])).toHaveLength(parts.lamps.length);
    }
    expect(townBuildings(SITES.capital).length).toBeGreaterThan(50);
  });

  it('writes the arrows on Coax City’s one-way streets in the file, and none anywhere else', () => {
    expect(arrowsOf(layoutOf(SITES.capital)).length).toBeGreaterThan(0);
    const withArrows = copy('coaxia');
    for (const road of withArrows.map.roads) delete road.arrows;
    expect(arrowsOf(layoutFromMap(withArrows))).toEqual([]);
  });

  it('puts the bus stop and the lot where the file says', () => {
    const file = copy('amplify-hills', (f) => (f.map.stops.bus.pos -= 3));
    expect(layoutFromMap(file).stops.bus.pos).toBe(MAPS['amplify-hills']!.map.stops.bus.pos - 3);
    expect(layoutFromMap(MAPS.coaxia!).lot(buildingFor('capital')).block).toEqual(MAPS.coaxia!.map.lot.block);
  });

  it('has no traffic on a road the file says carries none, and keeps its lanes as written', () => {
    const quiet = copy('coaxia', (f) => {
      for (const road of f.map.roads) road.traffic = false;
    });
    expect(layoutFromMap(quiet).busy(BUILDINGS.courtyard)).toEqual([]);
    const busy = layoutFromMap(MAPS.coaxia!).busy(BUILDINGS.courtyard);
    expect(busy.some((s) => s.lanes && s.lanes.length === 4)).toBe(true);
    expect(roadsOf(layoutFromMap(MAPS.coaxia!)).lanes.length).toBeGreaterThan(0);
  });

  it('refuses a map without a railway, wings or roads in plain words', () => {
    expect(() => layoutFromMap(copy('coaxia', (f) => (f.map.rail = null)))).toThrow(/no railway/);
    expect(() => layoutFromMap(copy('coaxia', (f) => (f.map.building.wings = [])))).toThrow(/no wings/);
    expect(() => layoutFromMap(copy('coaxia', (f) => (f.map.roads = [])))).toThrow(/no roads/);
    expect(() => layoutFromMap(copy('amplify-hills', (f) => (f.map.edge = null)))).toThrow(/needs an edge/);
  });

  it('gives a map of no region the building its wings and reception box make, and a region’s map its own', () => {
    expect(houseOf(MAPS.coaxia!)).toBe(BUILDINGS.courtyard);
    const mine = copy('aerial-fields', (f) => (f.id = 'my-fields'));
    expect(houseOf(mine).id).toBe('map');
    expect(houseOf(mine).wings.length).toBeGreaterThan(0);
    expect(houseOf(mine, BUILDINGS.fields).floors).toBe(mine.settings.floors);
  });

  it('gives every default town the building it had, with the file’s floors, and a draft with other floors a copy of it', () => {
    for (const [region, site] of Object.entries(SITES)) {
      if (site.map) expect(houseOf(MAPS[site.map]!), site.map).toBe(buildingFor(region as keyof typeof SITES));
    }
    const file = copy('coaxia');
    const was = buildingFor('capital').floors;
    file.settings.floors = was === 2 ? 3 : 2;
    expect(houseOf(file)).toEqual({ ...buildingFor('capital'), floors: file.settings.floors });
    expect(buildingFor('capital').floors).toBe(was);
  });

  it('turns a lamp’s arm to the nearest carriageway', () => {
    const roads = [{ x: 0, z: 0, w: 4, d: 40 }, { x: 0, z: 0, w: 40, d: 4 }];
    // East of the first road, 3 tiles off, 20 tiles from the second: the arm points west (-x).
    expect(lampTurn({ x: 7, z: 20 }, roads)).toBeCloseTo(Math.atan2(1, 0));
    // North of the second road: it points south.
    expect(lampTurn({ x: 30, z: -3 }, roads)).toBeCloseTo(Math.atan2(0, -1));
    expect(lampTurn({ x: 30, z: -3 }, [])).toBe(0);
  });

  it('puts a draft on the list of layouts under the preview name, and takes it off', () => {
    const layout = layoutFromMap(MAPS.coaxia!);
    setPreviewLayout(layout);
    expect(layoutOfMap(PREVIEW_MAP)).toBe(layout);
    setPreviewLayout(null);
    expect(() => layoutOfMap(PREVIEW_MAP)).toThrow(/No town map/);
  });
});
