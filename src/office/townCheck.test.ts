import { describe, expect, it } from 'vitest';
import { OLD_MAPS as MAPS } from '../mods/oldMaps';
import { TOWN_SEED, convertOldMap, lookRegionOf, oldHouseOf as houseOf, oldLayoutFromMap as layoutFromMap } from '../mods/oldMap';
import type { OldMapFile as MapFile } from '../mods/oldMapFile';
import { MAPS as FILES } from '../config/maps';
import type { MapFile as NewMapFile } from '../mods/mapFile';
import { DOOR_REACH, checkTown as checkNewTown, standsOnTrack } from './townCheck';
import { SITES } from './sites';
import { buildingFor, type Building } from '../config/office';
import type { Layout } from './townLayout';
import { roadsOf } from './traffic';

// (The drawings of the older format, converted first as the game reads them: the reasons only a drawing can have come from the converter, the rest from the check of the town written down.)
const checkTown = (file: MapFile, building?: Building) => {
  const converted = convertOldMap(file, { seed: TOWN_SEED, region: lookRegionOf(file), building });
  return converted.ok ? checkNewTown(converted.file, building) : { ok: false as const, reason: converted.reason };
};

const copy = (id: string, change: (file: MapFile) => void): MapFile => {
  const file = structuredClone(MAPS[id]!);
  change(file);
  return file;
};
const reason = (file: MapFile): string => {
  const checked = checkTown(file);
  if (checked.ok) throw new Error('The town was accepted');
  return checked.reason;
};

describe('the map check (#283)', () => {
  it('accepts the five default towns', () => {
    for (const file of Object.values(MAPS)) expect(checkTown(file), file.id).toEqual({ ok: true });
  });

  it('keeps the doors of the five towns well inside its reach', () => {
    for (const file of Object.values(MAPS)) {
      const layout = layoutFromMap(file) as unknown as Layout;
      const wait = roadsOf(layout).busStop.wait;
      const walk = Math.hypot(layout.places.gate.x - wait.x, layout.places.gate.z - wait.z);
      expect(walk, file.id).toBeLessThan(DOOR_REACH);
    }
    expect(houseOf(MAPS.coaxia!).id).toBeDefined();
  });

  it('refuses a map without roads, wings, a railway or a parking strip', () => {
    expect(reason(copy('coaxia', (f) => (f.map.lanes = [])))).toMatch(/no roads/);
    expect(reason(copy('coaxia', (f) => (f.map.wings = [])))).toMatch(/no wings/);
    expect(reason(copy('amplify-hills', (f) => (f.map.wings = [])))).toMatch(/no wings/);
    expect(reason(copy('coaxia', (f) => (f.map.wings = f.map.wings.map((w) => ({ ...w, w: 3, h: 9 })))))).toMatch(/east to west/);
    expect(reason(copy('coaxia', (f) => (f.map.train = null)))).toMatch(/no railway/);
    expect(reason(copy('coaxia', (f) => ((f.map.parking = []), (f.map.courtyard.parking = []))))).toMatch(/No lot.*parking strip/);
    expect(reason(copy('amplify-hills', (f) => ((f.map.parking = []), (f.map.courtyard.parking = []))))).toMatch(/No lot.*parking strip/);
  });

  it('refuses a drawn bus stop on a town of roads, and a drawn stop that is not drawn', () => {
    expect(reason(copy('amplify-hills', (f) => (f.settings.busStop = { from: 'drawing' })))).toMatch(/by its roads/);
    expect(reason(copy('coaxia', (f) => (f.map.busStop = null)))).toMatch(/draws none/);
  });

  it('refuses roads that stop short of the edge of the map', () => {
    // The drawing reaches far beyond every road, so none of them is where vehicles come in.
    expect(reason(copy('amplify-hills', (f) => f.map.beach.push({ x: -300, y: -300, w: 700, h: 700 })))).toMatch(/No road reaches the edge/);
  });

  it('refuses a stop that no road from the edge leads to', () => {
    // The road the stops are on, and a road at the edge that does not meet it.
    const reasonFor = reason(
      copy('amplify-hills', (f) => {
        f.map.lanes = [
          { x: -33, y: 48, w: 130, h: 2, dir: 'both' },
          { x: -100, y: -95, w: 30, h: 2, dir: 'both' },
        ];
      }),
    );
    expect(reasonFor).toMatch(/No stop: no bus can reach/);
  });

  it('refuses a town whose roads do not run south of the lot', () => {
    const text = reason(copy('amplify-hills', (f) => (f.map.lanes = [{ x: -36, y: -58, w: 2, h: 34, dir: 'both' }, { x: -36, y: -58, w: 40, h: 2, dir: 'both' }])));
    expect(text).toMatch(/cannot lay out this town/);
  });

  it('refuses a door far from every road', () => {
    // The bus stop far off along its street.
    expect(reason(copy('aerial-fields', (f) => (f.settings.busStop = { from: 'entrance', shift: -DOOR_REACH - 20 })))).toMatch(/No door onto a road: the entrance is \d+ tiles from the bus stop/);
  });

  it('tells a bad map from a good one without throwing', () => {
    const odd = copy('coaxia', (f) => {
      f.map.lanes = [{ x: 0, y: 0, w: 2, h: 2, dir: 'both' }];
    });
    expect(() => checkTown(odd)).not.toThrow();
    expect(checkTown(odd).ok).toBe(false);
  });
});

describe('the map check for a railway on the ground (#288)', () => {
  /** A map with its railway on the ground, 4 tiles wide and `down` tiles further south, and `change` made to it. */
  const ground = (id: string, down: number, change: (file: MapFile) => void = () => undefined): MapFile =>
    copy(id, (f) => {
      f.settings.railway = 'ground';
      const t = f.map.train!;
      f.map.train = { ...t, y: t.y + down - 1, h: 4 };
      change(f);
    });
  const across = (f: MapFile) => f.map.lanes.push({ x: 97, y: 28, w: 2, h: 48, dir: 'both' });

  it('accepts a track on the ground that is wide enough and clear of the junctions', () => {
    expect(checkTown(ground('coaxia', 14))).toEqual({ ok: true });
    expect(checkTown(ground('skywave-beach', 0))).toEqual({ ok: true });
    expect(checkTown(ground('amplify-hills', 10, across))).toEqual({ ok: true });
  });

  it('refuses a box under 4 tiles wide, or one that does not lie east to west', () => {
    expect(reason(copy('coaxia', (f) => (f.settings.railway = 'ground')))).toMatch(/too narrow: its box is 2 tiles wide and must be at least 4/);
    expect(reason(copy('coaxia', (f) => ((f.settings.railway = 'ground'), (f.map.train = { x: 0, y: 70, w: 4, h: 40 }))))).toMatch(/east to west/);
  });

  it('refuses a road that crosses within 8 tiles of a junction', () => {
    // Coaxia's track, widened but not moved, is 3.5 tiles from the junction before it.
    expect(reason(ground('coaxia', 0))).toMatch(/within 8 tiles of a junction/);
  });

  it('refuses a road that crosses within 8 tiles of the edge of the map or of the end of a road', () => {
    // The road across the track ends 4 tiles beyond it, in the middle of the drawing (something else reaches further out).
    expect(reason(ground('amplify-hills', 10, (f) => (f.map.lanes.push({ x: 97, y: 28, w: 2, h: 46, dir: 'both' }), f.map.beach.push({ x: 0, y: 120, w: 10, h: 10 }))))).toMatch(/within 8 tiles of the end of the road/);
  });

  it('refuses a road that runs along the track', () => {
    expect(reason(ground('amplify-hills', 10, (f) => f.map.lanes.push({ x: -33, y: 66, w: 130, h: 2, dir: 'both' })))).toMatch(/runs along the track/);
    expect(reason(ground('amplify-hills', 10, (f) => f.map.lanes.push({ x: -33, y: 70, w: 130, h: 2, dir: 'both' })))).toMatch(/runs along the track|within 8 tiles of a junction/);
  });

  /** The track placed at a line of the drawing (4 tiles wide) instead of where the map has it. */
  const at = (id: string, y: number) => ground(id, 0, (f) => (f.map.train = { ...f.map.train!, y, h: 4 }));

  it('refuses a stop or the lot too near a crossing, or on the far side of the track from the door', () => {
    expect(reason(at('coaxia', 10))).toMatch(/The bus stop is within 8 tiles of a level crossing/);
    // (A track laid through the company's own ground now meets the written wings first: the refusal is a different one than the stops' (#327).)
    expect(reason(at('coaxia', 1))).toMatch(/The taxi stand is within 8 tiles of a level crossing|building stands on the track/);
    expect(reason(at('skywave-beach', 4))).toMatch(/The gate of the lot is within 8 tiles of a level crossing/);
    expect(reason(at('aerial-fields', 22))).toMatch(/The bus stop is on the other side of the track from the door/);
    expect(reason(at('transponder-valley', 1))).toMatch(/The lot is on the other side of the track from the door/);
  });

  it('refuses a building on the track', () => {
    // (What stands on the track is what the town writes: its houses and the building's wings, not the bands the drawing laid them in.)
    expect(reason(at('coaxia', -29))).toMatch(/building stands on the track|level crossing|junction/);
  });

  it('accepts a track clear of the town on the side of the door, and leaves an elevated one to the rest of the check', () => {
    for (const id of Object.keys(MAPS)) expect(checkTown(at(id, -140)), id).toEqual({ ok: true });
    // (An elevated track keeps its box of 2 tiles and is checked for none of the above.)
    expect(checkTown(copy('coaxia', (f) => (f.map.train = { ...f.map.train!, y: 10 })))).toEqual({ ok: true });
  });

  it('gives every default town on the ground either a pass or a reason, and never throws', () => {
    for (const id of Object.keys(MAPS)) {
      for (const down of [-10, 0, 14]) {
        const file = ground(id, down);
        expect(() => checkTown(file), `${id} ${down}`).not.toThrow();
        const checked = checkTown(file);
        if (!checked.ok) expect(checked.reason.length, `${id} ${down}`).toBeGreaterThan(10);
      }
    }
  });
});

// ---- The spot of a reason, go-via points and walking paths (0.21.0, #330), on the files of format 2 ----

describe('the spot of a reason on the map (#330)', () => {
  const region = (id: string) => (Object.keys(SITES) as (keyof typeof SITES)[]).find((r) => SITES[r].map === id)!;
  const game = (id: string): NewMapFile => structuredClone(FILES[id]!);
  const check = (file: NewMapFile) => checkNewTown(file, buildingFor(region(file.id)));
  const failed = (file: NewMapFile): { reason: string; at?: { x: number; z: number } } => {
    const checked = check(file);
    if (checked.ok) throw new Error('The town was accepted');
    return checked;
  };
  /** The railway on the ground, 4 tiles wide, with its north edge at z. */
  const ground = (id: string, z: number): NewMapFile => {
    const file = game(id);
    file.settings.railway = 'ground';
    file.map.rail = { ...file.map.rail!, z, d: 4 };
    return file;
  };
  const near = (at: { x: number; z: number } | undefined, x: number, z: number, within = 0.5) => {
    expect(at).toBeDefined();
    expect(Math.hypot(at!.x - x, at!.z - z)).toBeLessThanOrEqual(within);
  };

  it('has none for the five towns, which pass, and none for what is about the whole map', () => {
    for (const id of Object.keys(FILES)) expect(check(game(id)), id).toEqual({ ok: true });
    const bare = game('coaxia');
    bare.map.roads = [];
    expect(failed(bare)).toEqual({ ok: false, reason: expect.stringMatching(/no roads/) });
    expect(failed(bare)).not.toHaveProperty('at');
    const noRail = game('coaxia');
    noRail.map.rail = null;
    expect(failed(noRail)).not.toHaveProperty('at');
  });

  it('is the crossing, the stop, the gate, the middle of the lot, the house, the lane end or the wing for the reasons that have one', () => {
    // A road across the track too near a junction: the crossing (on Aerial Fields' road at x = -13).
    const junction = failed(ground('aerial-fields', 40));
    expect(junction.reason).toMatch(/within 8 tiles of a junction/);
    near(junction.at, -13, 42, 1);
    // A road along the track: on the road.
    const along = failed(ground('aerial-fields', 32));
    expect(along.reason).toMatch(/runs along the track/);
    expect(along.at!.z).toBeGreaterThanOrEqual(30);
    expect(along.at!.z).toBeLessThanOrEqual(38);
    // The bus stop and the taxi stand: where they are.
    const bus = failed(ground('coaxia', 8));
    expect(bus.reason).toMatch(/The bus stop is within 8 tiles/);
    near(bus.at, -21, 19.4, 1.5);
    const taxi = failed(ground('coaxia', 2));
    expect(taxi.reason).toMatch(/The taxi stand is within 8 tiles/);
    near(taxi.at, -21, 13, 1.5);
    const far = failed(ground('aerial-fields', 20));
    expect(far.reason).toMatch(/The bus stop is on the other side of the track/);
    near(far.at, -18, 36, 1.5);
    // The gate of the lot.
    const gate = failed(ground('skywave-beach', 4));
    expect(gate.reason).toMatch(/gate of the lot is within 8 tiles/);
    near(gate.at, 43, 10.4, 1.5);
    // The middle of the lot.
    const valley = ground('transponder-valley', 0);
    const lot = valley.map.lot.block;
    expect(failed(valley).reason).toMatch(/The lot is on the other side of the track/);
    near(failed(valley).at, lot.x + lot.w / 2, lot.z + lot.d / 2, 0.01);
    // A house on the track: that house.
    const house = failed(ground('aerial-fields', -2));
    expect(house.reason).toMatch(/building stands on the track/);
    // (A house of the file, or a wing: its middle.)
    const standing = [...game('aerial-fields').map.houses.map((h) => ({ x: h.x, z: h.z })), ...game('aerial-fields').map.building.wings.map((w) => ({ x: w.x + w.w / 2, z: w.z + w.d / 2 }))];
    expect(standing).toContainEqual(house.at);
    // A wing north of the line: that wing.
    const north = game('transponder-valley');
    north.map.building.wings.push({ x: -6, z: -4, w: 5, d: 4 });
    const wing = failed(north);
    expect(wing.reason).toMatch(/north of the line/);
    near(wing.at, -3.5, -2, 0.01);
    // The end of a lane: a one-way road that ends in a dead end.
    const hills = game('amplify-hills');
    hills.map.roads.push({ along: 'z', at: 70, width: 4, traffic: true, from: 27, to: 40, lanes: [{ at: 69, direction: 1 }, { at: 71, direction: 1 }] });
    const dead = failed(hills);
    expect(dead.reason).toMatch(/dead end/);
    expect(dead.at!.x).toBeGreaterThan(67);
    expect(dead.at!.x).toBeLessThan(73);
  });

  it('is the house for a house on the track that the decor check finds', () => {
    const file = ground('aerial-fields', 18);
    file.map.houses.push({ model: 'city/building-a.glb', x: 0, z: 20, turn: 0 });
    const found = standsOnTrack(file, buildingFor('heartland'));
    expect(found?.reason).toMatch(/stands on the track/);
    expect(found?.at).toEqual({ x: 0, z: 20 });
  });

  it('has the spot of a go-via point that is on no road that carries traffic, cannot be reached or comes after the stop', () => {
    // Coaxia: the road at z = -39 carries no traffic.
    const quiet = game('coaxia');
    quiet.map.stops.bus.via = [{ x: -39, z: 10.5 }];
    expect(failed(quiet)).toEqual({ ok: false, reason: expect.stringMatching(/^Go-via point 1 is on no road that carries traffic/), at: { x: -39, z: 10.5 } });
    // Off every road.
    const off = game('coaxia');
    off.map.stops.bus.via = [{ x: 25, z: 0.5 }, { x: 0, z: 0.5 }];
    expect(failed(off)).toMatchObject({ reason: expect.stringMatching(/^Go-via point 2 is on no road/), at: { x: 0, z: 0.5 } });
    // Beyond the stop, on the one-way road the bus stops on.
    const late = game('coaxia');
    late.map.stops.bus.via = [{ x: -22, z: -39.5 }];
    expect(failed(late)).toMatchObject({ reason: expect.stringMatching(/^Go-via point 1 comes after the bus stop/), at: { x: -22, z: -39.5 } });
    // A loop that drives past the stop on the way to the point.
    const loop = game('amplify-hills');
    loop.map.stops.bus.via = [{ x: 85, z: -14.5 }];
    expect(failed(loop)).toMatchObject({ reason: expect.stringMatching(/comes after the bus stop/), at: { x: 85, z: -14.5 } });
  });

  it('accepts a go-via point before the stop, and refuses nothing at the most of them', () => {
    const file = game('coaxia');
    file.map.stops.bus.via = [{ x: 25, z: 0.5 }];
    expect(check(file)).toEqual({ ok: true });
    const hills = game('amplify-hills');
    hills.map.stops.bus.via = [{ x: 77.5, z: 27 }, { x: 20.5, z: 49 }];
    expect(check(hills)).toEqual({ ok: true });
  });

  it('has the spot where a walking path crosses a road, the track or the office, and lets one by the kerb, over water or houses, or under an elevated track go', () => {
    // Over the road at x = 72 (Coaxia: the road along z at x = 72 is 4 wide, and carries no traffic: every road counts).
    const road = game('coaxia');
    road.map.walks = [[{ x: 60.5, z: 50.5 }, { x: 80.5, z: 50.5 }]];
    const over = failed(road);
    expect(over.reason).toMatch(/^Walking path 1 crosses a road/);
    near(over.at, 70, 50.5, 0.1);
    // Into the office.
    const office = game('coaxia');
    const wing = office.map.building.wings[0]!;
    office.map.walks = [[{ x: wing.x - 2, z: wing.z + wing.d / 2 }, { x: wing.x + wing.w + 2, z: wing.z + wing.d / 2 }]];
    expect(failed(office).reason).toMatch(/^Walking path 1 crosses the office/);
    // Over a track on the ground (the second path of two).
    const track = ground('coaxia', 75);
    track.map.walks = [[{ x: 50.5, z: 60.5 }, { x: 55.5, z: 60.5 }], [{ x: 50.5, z: 73.5 }, { x: 50.5, z: 85.5 }]];
    const rail = failed(track);
    expect(rail.reason).toMatch(/^Walking path 2 crosses the track/);
    near(rail.at, 50.5, 75, 0.1);
    // Along a kerb, over a house and under an elevated track: allowed.
    const free = game('coaxia');
    free.map.walks = [[{ x: 50.5, z: 73.5 }, { x: 50.5, z: 85.5 }], [{ x: 40.5, z: 50.5 }, { x: 60.5, z: 50.5 }]];
    expect(check(free)).toEqual({ ok: true });
  });
});
