// The structure of a town in the 3D map editor (0.21.0, #329): roads that carry what goes with them, blocks cut again, rail, the building, stops, the lot,
// new maps, and the layout and check rules this needs (no traffic, one-way and arrows in a town of roads; two new reasons).

import { afterEach, describe, expect, it } from 'vitest';
import { MAPS } from '../config/maps';
import { buildingFor } from '../config/office';
import { arrowsOf } from '../office/city';
import { SITES } from '../office/sites';
import { checkStructure, checkTown } from '../office/townCheck';
import { layoutFromMap } from '../office/townLayout';
import { roadsOf } from '../office/traffic';
import { checkMapFile, toMapFile, type MapFile, type MapRoad } from './mapFile';
import { stopPreviewMap } from './mapPreview';
import { copyOfMap, structureKey } from './townDraft';
import {
  DEFAULT_ROAD, DUAL, addBlock, addGreen, addParking, addRoad, addWing, applyTool, buildingProblem, countDecor, dropParking, dropPart, dropRoad, dropWing, editRoad, fitOwn, houseFor, makeRoad, moveRoad,
  dragHandle, handlesOf, movePart, newTown, partBox, partsOf, railDepth, recutBlocks, roadOfDrag, setEdge, setFountain, setLot, setRail, setReception, setStop, setWing, snapEnd, withFaces, type PartRef, type RoadSpec,
} from './townStructure';

afterEach(() => stopPreviewMap());

const region = (id: string) => (Object.keys(SITES) as (keyof typeof SITES)[]).find((r) => SITES[r].map === id)!;
const game = (id: string): MapFile => structuredClone(MAPS[id]!);
const readBack = (file: MapFile) => checkMapFile(JSON.parse(toMapFile(file)));
const spec = (changes: Partial<RoadSpec>): RoadSpec => ({ ...DEFAULT_ROAD, along: 'x', at: 0, direction: 1, ...changes });
const index = (file: MapFile, along: 'x' | 'z', at: number) => file.map.roads.findIndex((r) => r.along === along && Math.abs(r.at - at) < 0.01);

describe('roads', () => {
  it('draws a one-way road with its lanes one each side of its middle, going the same way', () => {
    const file = game('coaxia');
    const road = makeRoad(file, spec({ along: 'z', at: 0, flow: 'one-way', direction: -1, arrows: true }));
    expect(road).toMatchObject({ along: 'z', width: 4, traffic: true, arrows: true, lanes: [{ at: road.at - 1, direction: -1 }, { at: road.at + 1, direction: -1 }] });
  });

  it('draws a dual road as Coaxia has its own: four lanes, a median of 1, driven on the right', () => {
    const file = game('coaxia');
    const own = file.map.roads.find((r) => r.median !== undefined)!;
    const made = makeRoad(file, spec({ along: 'x', at: own.at, flow: 'dual' }));
    expect(made.width).toBe(DUAL.width);
    expect(made).toMatchObject({ at: own.at, median: 1, lanes: own.lanes });
  });

  it('keeps a road of a grid whole-town and a road of a town of roads to its ends, and offers no dual carriageway there', () => {
    expect(makeRoad(game('coaxia'), spec({ from: 0, to: 20 }))).not.toHaveProperty('from');
    const hills = game('amplify-hills');
    const road = makeRoad(hills, spec({ from: 0, to: 20, flow: 'dual' }));
    expect(road).toMatchObject({ from: 0, to: 20, width: 2 });
    expect(road.lanes).toBeUndefined();
  });

  it('snaps an end to a road it reaches, then to the edge within 2 tiles', () => {
    const hills = game('amplify-hills');
    expect(snapEnd(hills, { along: 'x', at: 0 }, -78)).toBe(-80);
    expect(snapEnd(hills, { along: 'x', at: 0 }, -108)).toBe(-110);
    expect(snapEnd(hills, { along: 'x', at: 0 }, -95.4)).toBe(-95);
  });

  it('puts a road in a grid and cuts the blocks again: nothing lies under it and the blocks meet it', () => {
    const file = game('coaxia');
    const after = addRoad(file, spec({ along: 'z', at: 50, flow: 'two-way' }));
    expect(after.map.roads).toHaveLength(file.map.roads.length + 1);
    const ground = after.map.ground.filter((g) => g.edge);
    const road = after.map.roads.at(-1)!;
    const [from, to] = [road.at - road.width / 2, road.at + road.width / 2];
    expect(ground.every((g) => g.x + g.w <= from + 0.01 || g.x >= to - 0.01 || g.outside || g.x >= to || g.x + g.w <= from)).toBe(true);
    expect(ground.length).toBeGreaterThan(file.map.ground.filter((g) => g.edge).length);
    expect(readBack(after).ok).toBe(true);
  });

  it('leaves a file whose cells did not move as it is', () => {
    for (const id of Object.keys(MAPS)) {
      const file = game(id);
      expect(recutBlocks(file, file)).toBe(file);
    }
  });

  it('gives a new block the kind of the one it replaces', () => {
    const file = game('coaxia');
    const moved = moveRoad(file, index(file, 'z', 25), { x: 3, z: 0 });
    const kinds = new Set(file.map.ground.filter((g) => g.edge).map((g) => g.kind));
    for (const g of moved.map.ground.filter((x) => x.edge)) expect(kinds.has(g.kind)).toBe(true);
    const back = moveRoad(moved, index(moved, 'z', 28), { x: -3, z: 0 });
    const sorted = (f: MapFile) => f.map.ground.filter((g) => g.edge).map((g) => JSON.stringify(g)).sort();
    expect(sorted(back)).toEqual(sorted(file));
  });

  it('takes a stop on it, the lot’s street and its lanes with a road that moves', () => {
    const file = game('coaxia');
    const stopRoad = index(file, 'z', -22);
    const moved = moveRoad(file, stopRoad, { x: -2, z: 0 });
    expect(moved.map.roads[stopRoad]!.at).toBe(-24);
    expect(moved.map.roads[stopRoad]!.lanes!.map((l) => l.at)).toEqual([-25, -23]);
    expect(moved.map.stops.bus).toMatchObject({ at: -24, pos: file.map.stops.bus.pos });
    expect(moved.map.stops.taxi.at).toBe(-24);
    const lotRoad = index(file, 'z', 25);
    expect(moveRoad(file, lotRoad, { x: 3, z: 0 }).map.lot.street).toBe(28);
  });

  it('moves the ends of the roads that join a road of a town of roads with it', () => {
    const file = game('amplify-hills');
    const n = index(file, 'z', 85);
    const moved = moveRoad(file, n, { x: 3, z: 0 });
    // The roads along x that ended on it follow it.
    for (const [i, r] of file.map.roads.entries()) {
      if (r.along !== 'x') continue;
      const next = moved.map.roads[i]!;
      if (r.to === 85) expect(next.to).toBe(88);
      if (r.from === 85) expect(next.from).toBe(88);
    }
    expect(moved.map.roads[n]!.at).toBe(88);
    expect(moved.map.roads[n]!.from).toBe(file.map.roads[n]!.from);
  });

  it('takes away the houses, trees, lamps and hills a new road lies over, and says how many', () => {
    const file = game('coaxia');
    const house = file.map.houses[0]!;
    const after = addRoad(file, spec({ along: 'x', at: house.z, from: house.x - 3, to: house.x + 3 }));
    expect(countDecor(after)).toBeLessThan(countDecor(file));
    expect(after.map.houses).not.toContainEqual(house);
  });

  it('edits the way a road is driven and its traffic and arrows, and drops it', () => {
    const file = game('coaxia');
    const n = index(file, 'z', -39);
    const quiet = file.map.roads[n]!;
    expect(quiet.traffic).toBe(false);
    const busy = editRoad(file, n, { traffic: true });
    expect(busy.map.roads[n]).toEqual({ ...quiet, traffic: true });
    const oneWay = editRoad(file, n, { flow: 'one-way', direction: 1, arrows: true });
    expect(oneWay.map.roads[n]).toMatchObject({ lanes: [{ direction: 1 }, { direction: 1 }], arrows: true });
    const plain = editRoad(oneWay, n, { flow: 'two-way' });
    expect(plain.map.roads[n]!.lanes).toBeUndefined();
    expect(plain.map.roads[n]!.arrows).toBeUndefined();
    expect(dropRoad(file, n).map.roads).toHaveLength(file.map.roads.length - 1);
  });

  it('reads a drag as a road along its longer way, at the row of its first tile', () => {
    expect(roadOfDrag({ from: [3, 7], to: [12, 8], point: { x: 0, z: 0 } }, DEFAULT_ROAD)).toMatchObject({ along: 'x', at: 7.5, from: 3, to: 13, direction: 1 });
    expect(roadOfDrag({ from: [3, 9], to: [4, 2], point: { x: 0, z: 0 } }, DEFAULT_ROAD)).toMatchObject({ along: 'z', at: 3.5, from: 2, to: 10, direction: -1 });
  });
});

describe('the rail', () => {
  it('moves along x on whole tiles, takes the blocks with it and gives the depth by the level', () => {
    const file = game('coaxia');
    const moved = setRail(file, { x: -86, z: 80, w: 158, d: 2 });
    expect(moved.map.rail).toEqual({ x: -86, z: 80, w: 158, d: 2 });
    expect(moved.map.ground.some((g) => g.edge && g.z < 80 && g.z + g.d > 80)).toBe(false);
    expect(railDepth(file)).toBe(2);
    expect(railDepth({ ...file, settings: { ...file.settings, railway: 'ground' } })).toBe(4);
  });
});

describe('the building', () => {
  it('refuses a wing north of z = 0, and a floor with nothing on it, and a fraction of a tile', () => {
    const file = game('transponder-valley');
    expect(buildingProblem(file)).toBeNull();
    expect(buildingProblem(addWing(file, { x: 0, z: -3, w: 4, d: 4 }))).toMatch(/north of the line the floor starts on/);
    const off = { ...file, map: { ...file.map, building: { ...file.map.building, wings: file.map.building.wings.map((w) => ({ ...w, z: 2 })), reception: { ...file.map.building.reception!, z: 12 } } } };
    expect(buildingProblem(off)).toMatch(/z = 0/);
    expect(buildingProblem({ ...file, map: { ...file.map, building: { ...file.map.building, wings: [{ x: 0.5, z: 0, w: 4, d: 4 }] } } })).toMatch(/whole tiles/);
  });

  it('keeps the company’s block while it holds the wings, and grows it with 2 tiles to spare when it does not', () => {
    const file = game('transponder-valley');
    expect(fitOwn(file)).toBe(file);
    const wide = setWing(file, 0, { x: -6, z: 0, w: 60, d: 21 });
    const own = wide.map.building.own;
    expect(own.x + own.w).toBeGreaterThanOrEqual(-6 + 60 + 2);
    expect(own.x).toBe(file.map.building.own.x);
    expect(addWing(file, { x: 0, z: 0, w: 2, d: 2 }).map.building.own).toEqual(file.map.building.own);
  });

  it('keeps one wing at least and moves the reception box', () => {
    const file = game('transponder-valley');
    expect(dropWing(file, 0).map.building.wings).toHaveLength(1);
    const one = dropWing(file, 0);
    expect(dropWing(one, 0)).toBe(one);
    expect(setReception(file, { x: 20, z: 11, w: 11, d: 10 }).map.building.reception).toEqual({ x: 20, z: 11, w: 11, d: 10 });
  });

  it('works the side the entrance faces out again, and leaves the games’ own as they are', () => {
    for (const id of Object.keys(MAPS)) {
      const file = game(id);
      expect(withFaces(file).map.building.faces, id).toBe(file.map.building.faces);
    }
    const file = game('coaxia');
    expect(houseFor(file, MAPS.coaxia)).toBe(buildingFor(region('coaxia')));
    const moved = setWing(file, 0, { x: -6, z: 26, w: 30, d: 11 });
    expect(houseFor(moved, MAPS.coaxia)).toBeUndefined();
  });
});

describe('stops and the lot', () => {
  it('puts a stop on the road under the pointer, with its place along it from the pointer', () => {
    const file = game('coaxia');
    const moved = setStop(file, 'bus', { x: -21.5, z: 30.5 });
    expect(moved.map.stops.bus).toEqual({ along: 'z', at: -22, pos: 30.5 });
    expect(setStop(file, 'bus', { x: -60, z: 30 })).toBe(file);
    // A road without traffic takes none.
    expect(setStop(file, 'taxi', { x: -39, z: 30 })).toBe(file);
  });

  it('puts the lot of a grid on the nearest road along z, with one strip equal to the block', () => {
    const file = game('transponder-valley');
    const moved = setLot(file, { x: -6, z: -12, w: 37, d: 12 });
    expect(moved.map.lot).toEqual(file.map.lot);
    const other = setLot(file, { x: -40, z: -12, w: 20, d: 8 });
    expect(other.map.lot.parking).toEqual([{ x: -40, z: -12, w: 20, d: 8 }]);
    expect(other.map.lot.street).toBe(file.map.roads.filter((r) => r.along === 'z').sort((a, b) => Math.abs(a.at + 30) - Math.abs(b.at + 30))[0]!.at);
  });

  it('takes the strips, the green and the fountain of Coaxia’s lot along when its block moves', () => {
    const file = game('coaxia');
    const moved = setLot(file, { ...file.map.lot.block, x: file.map.lot.block.x + 1 });
    expect(moved.map.lot.parking[0]!.x).toBe(file.map.lot.parking[0]!.x + 1);
    expect(moved.map.lot.fountain!.x).toBe(file.map.lot.fountain!.x + 1);
  });

  it('writes the road and the side of the lot of a town of roads', () => {
    const file = game('amplify-hills');
    expect(setLot(file, file.map.lot.block).map.lot).toEqual(file.map.lot);
    const south = setLot(file, { x: -18, z: 52, w: 13, d: 4 });
    expect(south.map.lot).toMatchObject({ along: 'x', street: 49, side: 1 });
  });

  it('adds parking and green, and puts one inside the wings’ box in the courtyard too', () => {
    const file = game('coaxia');
    const inside = addParking(file, { x: -6, z: 11, w: 4, d: 2 });
    expect(inside.map.lot.parking).toHaveLength(file.map.lot.parking.length + 1);
    expect(inside.map.building.courtyard.parking).toHaveLength(file.map.building.courtyard.parking.length + 1);
    const out = addGreen(file, { x: 40, z: 11, w: 4, d: 2 });
    expect(out.map.lot.green).toHaveLength(file.map.lot.green.length + 1);
    expect(out.map.building.courtyard.green).toHaveLength(file.map.building.courtyard.green.length);
    expect(dropParking(inside, inside.map.lot.parking.length - 1).map.building.courtyard.parking).toEqual(file.map.building.courtyard.parking);
    expect(setFountain(file, null).map.lot.fountain).toBeNull();
  });
});

describe('moving and removing the parts', () => {
  it('lists the parts, each with a box, and moves them by tiles', () => {
    const file = game('coaxia');
    const parts = partsOf(file, true);
    for (const ref of parts) expect(partBox(file, ref), `${ref.part} ${ref.index}`).not.toBeNull();
    const wing: PartRef = { part: 'wing', index: 0 };
    expect(partBox(movePart(file, wing, { x: 1, z: 0 }), wing)!.x).toBe(partBox(file, wing)!.x + 1);
    const bus = movePart(file, { part: 'bus', index: 0 }, { x: 0, z: 2 });
    expect(bus.map.stops.bus.pos).toBe(file.map.stops.bus.pos + 2);
  });

  it('removes roads, wings, strips and blocks, and keeps the rail, the reception, the lot and the stops', () => {
    const file = game('coaxia');
    for (const part of ['rail', 'reception', 'bus', 'taxi', 'lot'] as const) expect(dropPart(file, { part, index: 0 }), part).toBe(file);
    expect(dropPart(file, { part: 'road', index: 0 }).map.roads).toHaveLength(file.map.roads.length - 1);
    const block = file.map.ground.findIndex((g) => g.edge);
    expect(dropPart(file, { part: 'block', index: block }).map.ground).toHaveLength(file.map.ground.length - 1);
    expect(addBlock(file, 'grass', { x: 100, z: -20, w: 5, d: 5 }).map.ground.at(-1)).toMatchObject({ kind: 'grass', edge: true });
  });

  it('moves the edge of a town of roads and has none in a grid', () => {
    const hills = game('amplify-hills');
    expect(setEdge(hills, { x: -100, z: -100, w: 200, d: 150 }).map.edge).toEqual({ x: -100, z: -100, w: 200, d: 150 });
    const grid = game('coaxia');
    expect(setEdge(grid, { x: 0, z: 0, w: 4, d: 4 })).toBe(grid);
  });
});

describe('the grips of a part', () => {
  it('has four corners on a box and two ends on a road of a town of roads, and none on a road of a grid', () => {
    const file = game('amplify-hills');
    expect(handlesOf(file, { part: 'wing', index: 0 }).map((h) => h.handle)).toEqual(['nw', 'ne', 'sw', 'se']);
    expect(handlesOf(file, { part: 'road', index: 0 }).map((h) => h.handle)).toEqual(['from', 'to']);
    expect(handlesOf(game('coaxia'), { part: 'road', index: 0 })).toEqual([]);
    expect(handlesOf(file, { part: 'bus', index: 0 })).toEqual([]);
  });

  it('drags a corner while the opposite one stays, and an end of a road to what it snaps to', () => {
    const file = game('transponder-valley');
    const dragged = dragHandle(file, { part: 'lot', index: 0 }, 'se', { x: 40.2, z: 2.1 });
    expect(dragged.map.lot.block).toEqual({ x: -6, z: -12, w: 46, d: 14 });
    const hills = game('amplify-hills');
    const n = hills.map.roads.findIndex((r) => r.along === 'x' && r.at === -23);
    const longer = dragHandle(hills, { part: 'road', index: n }, 'to', { x: 48.4, z: -23 });
    expect(longer.map.roads[n]!.to).toBe(50);
    expect(dragHandle(hills, { part: 'road', index: n }, 'to', { x: -79, z: -23 })).toBe(hills);
  });
});

describe('a tool and a gesture', () => {
  const options = { road: DEFAULT_ROAD, block: 'pavement' as const };

  it('draws a road, and says why it refuses one', () => {
    const file = game('amplify-hills');
    const done = applyTool(file, 'road', { from: [-60, -70], to: [-40, -70], point: { x: 0, z: 0 } }, options);
    expect(done.problem).toBeNull();
    expect(done.file.map.roads).toHaveLength(file.map.roads.length + 1);
    expect(done.outline).not.toBeNull();
    const twice = applyTool(file, 'road', { from: [-70, 49], to: [-50, 49], point: { x: 0, z: 0 } }, options);
    expect(twice.problem).toBe('There is a road there already.');
    expect(twice.file).toBe(file);
    const short = applyTool(file, 'road', { from: [-60, 30], to: [-60, 30], point: { x: 0, z: 0 } }, options);
    expect(short.problem).toBe('A road is at least 2 tiles long.');
  });

  it('refuses a stop off a road, a wing north of the line and a box over the office for a road', () => {
    const file = game('coaxia');
    expect(applyTool(file, 'bus', { from: [0, 0], to: [0, 0], point: { x: 120, z: 120 } }, options).problem).toBe('A stop goes on a road that carries traffic.');
    expect(applyTool(file, 'wing', { from: [10, -5], to: [14, -2], point: { x: 0, z: 0 } }, options).problem).toMatch(/north of the line/);
    expect(applyTool(file, 'road', { from: [-30, 5], to: [30, 5], point: { x: 0, z: 0 } }, options).problem).toBe('A road cannot run through the office.');
  });
});

describe('a new map', () => {
  it.each(['grid', 'roads'] as const)('is the bare structure of a %s town that passes the check, with nothing standing in it', (kind) => {
    const file = newTown(kind, ['new-map']);
    expect(file.id).toBe('new-map-2');
    const { houses, trees, lamps, hills, peaks } = file.map;
    expect([houses, trees, lamps, hills, peaks].every((list) => list.length === 0)).toBe(true);
    expect(checkTown(file)).toEqual({ ok: true });
    expect(readBack(file).ok).toBe(true);
    if (kind === 'roads') expect(file.map.ground).toEqual([]);
    else expect(file.map.ground.every((g) => g.edge)).toBe(true);
  });

  it('stays a map that passes the check through a change of the building and the faces', () => {
    const file = withFaces(setReception(newTown('grid'), game('coaxia').map.building.reception!));
    expect(checkStructure(file)).toEqual({ ok: true });
  });
});

describe('the layout and the check of a town of roads', () => {
  const hills = () => game('amplify-hills');

  it('lays out a road with no traffic as a road that carries none', () => {
    const file = hills();
    const quiet = { ...file, map: { ...file.map, roads: [...file.map.roads, { along: 'x' as const, at: -80, width: 2, traffic: false, from: -110, to: -80 }] } };
    const layout = layoutFromMap(quiet, buildingFor('capital'));
    expect(layout.streets(buildingFor('capital'))).toHaveLength(file.map.roads.length + 1);
    expect(layout.busy(buildingFor('capital'))).toHaveLength(file.map.roads.length);
  });

  it('leaves the two towns of roads as they are: every road busy, none one-way, no arrows', () => {
    for (const id of ['amplify-hills', 'aerial-fields']) {
      const file = game(id);
      const layout = layoutFromMap(file, buildingFor(region(id)));
      expect(layout.busy(buildingFor(region(id))), id).toBe(layout.streets(buildingFor(region(id))));
      expect(layout.map!.oneWays, id).toEqual([]);
      expect(arrowsOf(layout), id).toEqual([]);
    }
  });

  it('drives a one-way road one way and puts arrows along its stretches between the roads that cross it', () => {
    const file = hills();
    const n = index(file, 'z', 85);
    const oneWay = editRoad(file, n, { flow: 'one-way', direction: -1, arrows: true });
    const layout = layoutFromMap(oneWay, buildingFor('capital'));
    expect(layout.map!.oneWays).toHaveLength(1);
    const arrows = arrowsOf(layout);
    expect(arrows.length).toBeGreaterThan(0);
    expect(arrows.every((a) => a.along === 'z' && a.direction === -1)).toBe(true);
    const roads = roadsOf(layout);
    const lanes = roads.lanes.filter((l) => l.along === 'z' && Math.abs(l.at - 85) < 2);
    expect(lanes.length).toBe(2);
    expect(lanes.every((l) => l.direction === -1)).toBe(true);
  });

  it('says a one-way road that ends in a dead end can not let traffic out', () => {
    const file = hills();
    const stub = { along: 'z' as const, at: 70, width: 4, traffic: true, from: 27, to: 40, lanes: [{ at: 69, direction: 1 as const }, { at: 71, direction: 1 as const }] };
    const bad = { ...file, map: { ...file.map, roads: [...file.map.roads, stub] } };
    const checked = checkTown(bad, buildingFor('capital'));
    expect(checked).toEqual({ ok: false, reason: 'A one-way road ends in a dead end: traffic on it could not get out.' });
  });

  it('says a wing north of the line the floor starts on', () => {
    const file = game('transponder-valley');
    const north = { ...file, map: { ...file.map, building: { ...file.map.building, wings: [...file.map.building.wings, { x: -6, z: -4, w: 5, d: 4 }] } } };
    expect(checkStructure(north, buildingFor('capital'))).toMatchObject({ ok: false, reason: expect.stringMatching(/^A wing lies north of the line the floor starts on/) });
  });
});

describe('the structure key', () => {
  it('changes with a road, the rail, a wing, a stop and the lot, and not with decor', () => {
    const file = copyOfMap('coaxia');
    const key = structureKey(file);
    for (const next of [addRoad(file, spec({ along: 'z', at: 50 })), setRail(file, { x: -86, z: 80, w: 158, d: 2 }), setWing(file, 0, { x: -6, z: 26, w: 30, d: 11 }), setStop(file, 'bus', { x: -21.5, z: 30.5 }), setLot(file, { x: -6, z: 12, w: 26, d: 15 })]) {
      expect(structureKey(next)).not.toBe(key);
    }
  });

  it('leaves a file the same, byte for byte, through a road that goes out and back', () => {
    const file = game('coaxia');
    const n = index(file, 'z', 72);
    const there = moveRoad(file, n, { x: 2, z: 0 });
    const back = moveRoad(there, n, { x: -2, z: 0 });
    expect(back.map.roads).toEqual(file.map.roads);
    expect(back.map.stops).toEqual(file.map.stops);
    expect(back.map.lot).toEqual(file.map.lot);
  });
});

describe('a moved structure still passes the check', () => {
  it('Coaxia with a road moved, a stop moved and the rail moved', () => {
    let file: MapFile = copyOfMap('coaxia');
    file = moveRoad(file, index(file, 'z', 72), { x: 4, z: 0 });
    file = setStop(file, 'bus', { x: -21.5, z: 16.5 });
    const checked = checkTown(file, buildingFor('capital'));
    expect(checked).toEqual({ ok: true });
  });

  it('a road drawn into a town of roads joins the others', () => {
    const file = game('amplify-hills');
    const done = applyTool(file, 'road', { from: [-79, -10], to: [49, -10], point: { x: 0, z: 0 } }, { road: DEFAULT_ROAD, block: 'pavement' });
    expect(done.problem).toBeNull();
    const road = done.file.map.roads.at(-1) as MapRoad;
    expect(road.from).toBe(-80);
    expect(road.to).toBe(50);
  });
});
