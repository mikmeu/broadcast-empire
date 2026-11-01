// The rules the map editor (src/ui/MapEditor.tsx) is built on, with a fake mods folder and the preview: the screen itself
// only calls these. (The test setup has no browser to draw a screen in; scripts/mapEditorCheck.ts drives the real one.)

import { afterEach, describe, expect, it } from 'vitest';
import { MAPS } from '../config/maps';
import { buildingFor } from '../config/office';
import type { RegionId } from '../config/world';
import { SITES, placeable, PLACEABLE } from '../office/sites';
import { PREVIEW_MAP, layoutOfMap } from '../office/townLayout';
import type { DesktopBridge } from '../persistence/desktop';
import { addStreet, boundsOf, checkDraft, copyOfDefault, newMap, put, shownDirection, textOf } from './mapDraft';
import { checkMapFile } from './mapFile';
import { importMapFile, loadMapMods, saveMapMod } from './mapMods';
import { previewSite, showPreviewMap, stopPreviewMap } from './mapPreview';

type Mods = NonNullable<DesktopBridge['mods']>;

/** A folder in memory that keeps what is written to it, by kind and id. */
function fakeFolder(picked?: { fileName: string; text: string }) {
  const files = new Map<string, string>();
  const mods = {
    list: async (kind: string) => [...files.keys()].filter((k) => k.startsWith(`${kind}/`)).map((k) => k.slice(kind.length + 1)),
    read: async (kind: string, id: string) => (files.has(`${kind}/${id}`) ? { text: files.get(`${kind}/${id}`)!, model: false } : null),
    write: async (kind: string, id: string, text: string) => void files.set(`${kind}/${id}`, text),
    importFile: async () => picked ?? null,
  } as unknown as Mods;
  return { files, mods };
}

afterEach(() => stopPreviewMap());

const regionOf = (id: string) => (Object.keys(SITES) as RegionId[]).find((r) => SITES[r].map === id)!;

describe('the game’s maps as copies', () => {
  // A copy has a new id, so the town is laid out round its region's building, as the game's own is.
  it.each(Object.keys(MAPS))('%s passes the check with the building of its region', (id) => {
    expect(checkDraft(copyOfDefault(MAPS[id]!), buildingFor(regionOf(id)))).toEqual({ ok: true });
  });
});

describe('the mods folder', () => {
  it('keeps a map as maps/<id>, and reads it back', async () => {
    const { files, mods } = fakeFolder();
    const copy = copyOfDefault(MAPS['transponder-valley']!);
    await saveMapMod(copy, mods);
    expect([...files.keys()]).toEqual(['maps/transponder-valley-copy']);
    expect(files.get('maps/transponder-valley-copy')).toBe(textOf(copy));
    const found = await loadMapMods(mods);
    expect(found.problems).toEqual([]);
    expect(found.maps).toEqual([copy]);
  });

  it('reports a map it cannot use, with the reason, and carries on', async () => {
    const { files, mods } = fakeFolder();
    files.set('maps/broken', '{ not json');
    files.set('maps/other-id', textOf({ ...copyOfDefault(MAPS.coaxia!), id: 'something-else' }));
    files.set('maps/no-train', JSON.stringify({ ...JSON.parse(textOf(copyOfDefault(MAPS.coaxia!))), id: 'no-train', settings: {} }));
    await saveMapMod(copyOfDefault(MAPS.coaxia!), mods);
    const found = await loadMapMods(mods);
    expect(found.maps.map((m) => m.id)).toEqual(['coaxia-copy']);
    const reasons = Object.fromEntries(found.problems.map((p) => [p.id, p.reason]));
    expect(reasons.broken).toMatch(/not readable/);
    expect(reasons['other-id']).toMatch(/says its id is “something-else”/);
    expect(reasons['no-train']).toMatch(/settings is missing|train/i);
  });

  it('imports a file, and refuses what is not a map with the reason', async () => {
    const good = await importMapFile(fakeFolder({ fileName: 'x.map.json', text: textOf(copyOfDefault(MAPS.coaxia!)) }).mods);
    expect(good).toMatchObject({ ok: true, fileName: 'x.map.json' });
    expect(await importMapFile(fakeFolder({ fileName: 'y.json', text: 'nonsense' }).mods)).toMatchObject({ ok: false, reason: expect.stringMatching(/not a map/) });
    expect(await importMapFile(fakeFolder({ fileName: 'z.json', text: JSON.stringify({ format: 9 }) }).mods)).toMatchObject({ ok: false, reason: expect.stringMatching(/format 9/) });
    expect(await importMapFile(fakeFolder().mods)).toBeNull();
  });
});

describe('the preview', () => {
  it('puts the draft on the list of towns under a reserved name, and takes it off', () => {
    expect(() => layoutOfMap(PREVIEW_MAP)).toThrow();
    const shown = showPreviewMap(copyOfDefault(MAPS['skywave-beach']!), buildingFor('coast'));
    expect(shown.ok).toBe(true);
    expect(layoutOfMap(PREVIEW_MAP).id).toBe('skywave-beach-copy');
    stopPreviewMap();
    expect(() => layoutOfMap(PREVIEW_MAP)).toThrow();
  });

  it('keeps the last town when a map cannot be laid out, and says why', () => {
    expect(showPreviewMap(copyOfDefault(MAPS['skywave-beach']!), buildingFor('coast')).ok).toBe(true);
    const broken = showPreviewMap(newMap());
    expect(broken).toMatchObject({ ok: false, reason: expect.stringMatching(/cannot be drawn/) });
    expect(layoutOfMap(PREVIEW_MAP).id).toBe('skywave-beach-copy');
  });

  it('borrows the look of a region, with the train and the traffic of the map', () => {
    const file = copyOfDefault(MAPS.coaxia!);
    file.settings.train = ['train-diesel-a', 'train-carriage-coal', 'train-carriage-tank', 'train-carriage-lumber', 'train-carriage-coal'];
    file.settings.traffic = { every: 5, mix: { car: 1, taxi: 0, van: 0, truck: 0 } };
    const site = previewSite(file, 'north');
    expect(site).toMatchObject({ map: PREVIEW_MAP, low: SITES.north.low, ground: SITES.north.ground });
    expect(site.train).toEqual(['train/train-diesel-a.glb', 'train/train-carriage-coal.glb', 'train/train-carriage-tank.glb', 'train/train-carriage-lumber.glb', 'train/train-carriage-coal.glb']);
    expect(site.traffic.every).toBe(5);
  });
});

describe('what the plan shows', () => {
  it('shows a dual carriageway driven on the right even where it is drawn the wrong way round', () => {
    // Transponder Valley draws its dual carriageway at x = 86 mirrored (north on the west side): the game swaps it.
    const { map } = MAPS['transponder-valley']!;
    const at = (x: number) => map.lanes.findIndex((l) => l.x === x && l.h > l.w);
    expect(map.lanes[at(86)]!.dir).toBe('north');
    expect([86, 88, 92, 94].map((x) => shownDirection(map, at(x)))).toEqual(['south', 'south', 'north', 'north']);
    expect(shownDirection(map, map.lanes.findIndex((l) => l.y === 51))).toBe('west');
    expect(shownDirection(map, map.lanes.findIndex((l) => l.y === 58))).toBe('east');
    // A street with the same way in all its lanes is shown as it is drawn, and a two-way street has no arrow.
    const oneWay = addStreet(newMap(), { x: 0, y: 0 }, { x: 9, y: 0 }, 'one-way').map;
    expect([0, 1].map((n) => shownDirection(oneWay, n))).toEqual(['east', 'east']);
    expect(shownDirection(map, map.lanes.findIndex((l) => l.x === 39))).toBe('both');
  });

  it('fits the plan to what the map covers', () => {
    expect(boundsOf(newMap().map)).toEqual({ x: -10, y: -10, w: 100, h: 70 });
    expect(boundsOf(put(put(newMap(), 'green', { x: 2, y: 3, w: 4, h: 5 }), 'wing', { x: -5, y: 0, w: 3, h: 3 }).map)).toEqual({ x: -5, y: 0, w: 11, h: 8 });
  });
});

describe('what the game reads from a map it did not read before', () => {
  const standing = PLACEABLE[0]!;

  it('has every model the editor offers in the town’s own lists', () => {
    expect(PLACEABLE.length).toBeGreaterThan(20);
    for (const model of PLACEABLE) expect(placeable(model.file)).toBe(model);
    expect(placeable('city/not-there.glb')).toBeUndefined();
  });

  it('lays concrete and placed models out in floor tiles, with the map’s own shift', () => {
    const file = copyOfDefault(MAPS['skywave-beach']!);
    const plain = showPreviewMap(file, buildingFor('coast'));
    expect(plain.ok).toBe(true);
    expect(layoutOfMap(PREVIEW_MAP).map).toMatchObject({ concrete: [], placed: [] });
    const withThings = put(put(file, 'concrete', { x: 10, y: 20, w: 5, h: 6 }), 'model', { x: 10, y: 20, model: standing.file, turn: 3 });
    expect(showPreviewMap(withThings, buildingFor('coast')).ok).toBe(true);
    const { concrete, placed } = layoutOfMap(PREVIEW_MAP).map!;
    // (Whatever the shift is, a box and a tile at the same corner stay at the same corner: the model stands in the middle of its tile.)
    expect(concrete).toHaveLength(1);
    expect(concrete[0]).toMatchObject({ w: 5, d: 6 });
    expect(placed).toEqual([{ x: concrete[0]!.x + 0.5, z: concrete[0]!.z + 0.5, model: standing.file, turn: 3 }]);
  });

  it('keeps trees, lamps, concrete, placed models and the rail level in the file, and reads them back', () => {
    let file = copyOfDefault(MAPS.coaxia!);
    file = put(put(put(put(file, 'tree', { x: 1, y: 2 }), 'lamp', { x: 3, y: 4 }), 'concrete', { x: 0, y: 0, w: 2, h: 2 }), 'model', { x: 5, y: 6, model: standing.file, turn: 2 });
    file.settings.railway = 'ground';
    const back = checkMapFile(JSON.parse(textOf(file)));
    expect(back).toEqual({ ok: true, file });
  });

  it('refuses a placed model that names no model of the game’s kinds, or a turn that is not a quarter turn', () => {
    const base = JSON.parse(textOf(copyOfDefault(MAPS.coaxia!)));
    const reason = (change: (f: any) => void) => {
      const f = structuredClone(base);
      change(f);
      const checked = checkMapFile(f);
      return checked.ok ? 'accepted' : checked.reason;
    };
    expect(reason((f) => (f.map.placed = [{ x: 1, y: 1, model: '../../etc/passwd', turn: 0 }]))).toMatch(/Model 1 names a model the game does not know/);
    expect(reason((f) => (f.map.placed = [{ x: 1, y: 1, model: standing.file, turn: 4 }]))).toMatch(/turned 0 to 3/);
    expect(reason((f) => (f.map.trees = [{ x: 1.5, y: 1 }]))).toMatch(/Tree 1 must be on whole tiles/);
    expect(reason((f) => (f.settings.railway = 'underground'))).toMatch(/elevated or ground/);
  });

  it('reads a file from before these fields as a map with none, and an elevated railway', () => {
    const old = JSON.parse(textOf(copyOfDefault(MAPS.coaxia!)));
    for (const key of ['concrete', 'trees', 'lamps', 'placed']) delete old.map[key];
    delete old.settings.railway;
    const read = checkMapFile(old);
    expect(read.ok && read.file.map).toMatchObject({ concrete: [], trees: [], lamps: [], placed: [] });
    expect(read.ok && read.file.settings.railway).toBe('elevated');
  });
});
