// The rules the map editor (src/ui/MapEditor.tsx) is built on, with a fake mods folder and the preview: the screen itself
// only calls these. (The test setup has no browser to draw a screen in; scripts/mapEditorCheck.ts drives the real one.)

import { afterEach, describe, expect, it } from 'vitest';
import { MAPS } from '../config/maps';
import { buildingFor } from '../config/office';
import type { RegionId } from '../config/world';
import { SITES, placeable, PLACEABLE } from '../office/sites';
import { checkTown } from '../office/townCheck';
import { PREVIEW_MAP, layoutOfMap } from '../office/townLayout';
import type { DesktopBridge } from '../persistence/desktop';
import { exportMapFile, importMapFile, loadMapMods, saveMapMod } from './mapMods';
import { toMapFile } from './mapFile';
import { copyOfMap } from './townDraft';
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

/** A map of format 1, written out: this game reads format 2 only (#331). */
const FORMAT_ONE = JSON.stringify({ format: 1, id: 'old-town', name: 'Old town', settings: {}, map: {} });

describe('the game’s maps as copies', () => {
  // A copy has a new id, so the town is laid out round its region's building, as the game's own is.
  it.each(Object.keys(MAPS))('%s passes the check with the building of its region', (id) => {
    expect(checkTown(copyOfMap(id), buildingFor(regionOf(id)))).toEqual({ ok: true });
  });
});

describe('the mods folder', () => {
  it('keeps a map as maps/<id>, and reads it back', async () => {
    const { files, mods } = fakeFolder();
    const town = copyOfMap('transponder-valley');
    await saveMapMod(town, mods);
    expect([...files.keys()]).toEqual(['maps/transponder-valley-copy']);
    expect(files.get('maps/transponder-valley-copy')).toBe(toMapFile(town));
    const found = await loadMapMods(mods);
    expect(found.problems).toEqual([]);
    expect(found.maps).toEqual([town]);
  });

  it('reports a map it cannot use, with the reason, and carries on', async () => {
    const { files, mods } = fakeFolder();
    files.set('maps/broken', '{ not json');
    files.set('maps/other-id', toMapFile({ ...copyOfMap('coaxia'), id: 'something-else' }));
    files.set('maps/no-map', JSON.stringify({ ...JSON.parse(toMapFile(copyOfMap('coaxia'))), id: 'no-map', map: {} }));
    await saveMapMod(copyOfMap('coaxia'), mods);
    const found = await loadMapMods(mods);
    expect(found.maps.map((m) => m.id)).toEqual(['coaxia-copy']);
    const reasons = Object.fromEntries(found.problems.map((p) => [p.id, p.reason]));
    expect(reasons.broken).toMatch(/not readable/);
    expect(reasons['other-id']).toMatch(/says its id is “something-else”/);
    expect(reasons['no-map']).toBeDefined();
  });

  it('lists a map of format 1 as one that cannot be used, with the reason, and leaves the file as it is', async () => {
    const { files, mods } = fakeFolder();
    files.set('maps/old-town', FORMAT_ONE);
    const found = await loadMapMods(mods);
    expect(found.maps).toEqual([]);
    expect(found.problems).toEqual([{ id: 'old-town', reason: expect.stringMatching(/format 1, from before the map format changed.*format 2 only/) }]);
    expect(files.get('maps/old-town')).toBe(FORMAT_ONE);
  });

  it('imports a file, and refuses what is not a map or is of format 1 with the reason', async () => {
    const town = copyOfMap('coaxia');
    expect(await importMapFile(fakeFolder({ fileName: 'a.json', text: toMapFile(town) }).mods)).toMatchObject({ ok: true, fileName: 'a.json', file: town });
    expect(await importMapFile(fakeFolder({ fileName: 'y.json', text: 'nonsense' }).mods)).toMatchObject({ ok: false, reason: expect.stringMatching(/not a map/) });
    expect(await importMapFile(fakeFolder({ fileName: 'z.json', text: JSON.stringify({ format: 9 }) }).mods)).toMatchObject({ ok: false, reason: expect.stringMatching(/format 9/) });
    expect(await importMapFile(fakeFolder({ fileName: 'old.json', text: FORMAT_ONE }).mods)).toMatchObject({ ok: false, reason: expect.stringMatching(/format 1/) });
    expect(await importMapFile(fakeFolder().mods)).toBeNull();
  });

  it('exports a map as the same text it keeps', async () => {
    const town = copyOfMap('coaxia');
    const sent: string[] = [];
    const mods = { exportFile: async (_kind: string, _name: string, text: string) => (sent.push(text), true) } as unknown as Mods;
    expect(await exportMapFile(town, mods)).toBe(true);
    expect(sent).toEqual([toMapFile(town)]);
  });
});

describe('the preview', () => {
  it('puts the map on the list of towns under a reserved name, and takes it off', () => {
    expect(() => layoutOfMap(PREVIEW_MAP)).toThrow();
    const shown = showPreviewMap(copyOfMap('skywave-beach'), buildingFor('coast'));
    expect(shown.ok).toBe(true);
    expect(layoutOfMap(PREVIEW_MAP).id).toBe('skywave-beach-copy');
    stopPreviewMap();
    expect(() => layoutOfMap(PREVIEW_MAP)).toThrow();
  });

  it('keeps the last town when a map cannot be laid out, and says why', () => {
    expect(showPreviewMap(copyOfMap('skywave-beach'), buildingFor('coast')).ok).toBe(true);
    const broken = copyOfMap('skywave-beach');
    broken.map.rail = null;
    expect(showPreviewMap(broken)).toMatchObject({ ok: false, reason: expect.stringMatching(/cannot be drawn/) });
    expect(layoutOfMap(PREVIEW_MAP).id).toBe('skywave-beach-copy');
  });

  it('borrows the look of a region, with the train and the traffic of the map', () => {
    const file = copyOfMap('coaxia');
    file.settings.train = ['train-diesel-a', 'train-carriage-coal', 'train-carriage-tank', 'train-carriage-lumber', 'train-carriage-coal'];
    file.settings.traffic = { every: 5, mix: { car: 1, taxi: 0, van: 0, truck: 0 } };
    const site = previewSite(file, 'north');
    expect(site).toMatchObject({ map: PREVIEW_MAP, low: SITES.north.low, ground: SITES.north.ground });
    expect(site.train).toEqual(['train/train-diesel-a.glb', 'train/train-carriage-coal.glb', 'train/train-carriage-tank.glb', 'train/train-carriage-lumber.glb', 'train/train-carriage-coal.glb']);
    expect(site.traffic.every).toBe(5);
  });
});

describe('the models the editor offers', () => {
  it('has every model the editor offers in the town’s own lists', () => {
    expect(PLACEABLE.length).toBeGreaterThan(20);
    for (const model of PLACEABLE) expect(placeable(model.file)).toBe(model);
    expect(placeable('city/not-there.glb')).toBeUndefined();
  });
});
