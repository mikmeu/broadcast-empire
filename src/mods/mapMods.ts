// The maps in the mods folder (0.21.0, #284): `maps/<id>/piece.json`, in the format of mapFile.ts (or the older one of oldMapFile.ts, which `readMapFile`
// converts as it reads: #327). The new-game form and Settings list them (0.21.0, #290; src/mods/playMap.ts says which can be played). The map editor
// opens a map of the new format in 3D (#328) and keeps it through `saveMapMod` and `exportMapFile`; a map of the older format is still drawn on the
// plan, with `saveMapDraft`, until the roads are made in 3D too (#329, #331).

import { desktop, type DesktopBridge } from '../persistence/desktop';
import { toMapFile, type MapFile } from './mapFile';
import { readMapFile } from './oldMap';
import { OLD_MAP_FORMAT, checkOldMapFile, toOldMapFile, type OldMapFile } from './oldMapFile';

type Mods = NonNullable<DesktopBridge['mods']>;

/** A map in the folder that could not be used, and why. */
export interface MapProblem {
  id: string;
  reason: string;
}

const readable = (error: unknown): string => (error instanceof SyntaxError ? 'The file is not readable text.' : error instanceof Error ? error.message : String(error));

/** Reads, checks and returns every map in the folder, in the new format (an older one is converted). A broken one is reported, never thrown. */
export async function loadMapMods(mods: Mods | undefined = desktop?.mods): Promise<{ maps: MapFile[]; problems: MapProblem[] }> {
  const maps: MapFile[] = [];
  const problems: MapProblem[] = [];
  if (!mods) return { maps, problems };
  for (const id of await mods.list('maps').catch(() => [] as string[])) {
    try {
      const stored = await mods.read('maps', id);
      if (!stored) throw new Error('The map is gone.');
      const checked = readMapFile(JSON.parse(stored.text));
      if (!checked.ok) throw new Error(checked.reason);
      if (checked.file.id !== id) throw new Error(`The file says its id is “${checked.file.id}”, but its folder is “${id}”.`);
      maps.push(checked.file);
    } catch (error) {
      problems.push({ id, reason: readable(error) });
    }
  }
  return { maps, problems };
}

/**
 * What the map editor finds in the folder: the maps in the new format, which the 3D editor opens (#328), and the maps in the older format, which only
 * the plan can draw (until #331 takes it away; a map of the older format can be taken on in 3D, converted once).
 */
export interface MapDrafts {
  maps: OldMapFile[];
  towns: MapFile[];
  problems: MapProblem[];
}

const formatOf = (raw: unknown): unknown => (typeof raw === 'object' && raw !== null ? (raw as { format?: unknown }).format : undefined);

/** Reads the folder for the map editor: maps in the new format for the 3D editor, those of the older format as they are for the plan. */
export async function loadMapDrafts(mods: Mods | undefined = desktop?.mods): Promise<MapDrafts> {
  const found: MapDrafts = { maps: [], towns: [], problems: [] };
  if (!mods) return found;
  for (const id of await mods.list('maps').catch(() => [] as string[])) {
    try {
      const stored = await mods.read('maps', id);
      if (!stored) throw new Error('The map is gone.');
      const raw: unknown = JSON.parse(stored.text);
      const format = formatOf(raw);
      if (typeof format === 'number' && format > OLD_MAP_FORMAT) {
        const checked = readMapFile(raw);
        if (!checked.ok) throw new Error(checked.reason);
        if (checked.file.id !== id) throw new Error(`The file says its id is “${checked.file.id}”, but its folder is “${id}”.`);
        found.towns.push(checked.file);
        continue;
      }
      const checked = checkOldMapFile(raw);
      if (!checked.ok) throw new Error(checked.reason);
      if (checked.file.id !== id) throw new Error(`The file says its id is “${checked.file.id}”, but its folder is “${id}”.`);
      found.maps.push(checked.file);
    } catch (error) {
      found.problems.push({ id, reason: readable(error) });
    }
  }
  return found;
}

/** Keeps a map in the folder, in the new format. */
export async function saveMapMod(file: MapFile, mods: Mods | undefined = desktop?.mods): Promise<void> {
  if (!mods) throw new Error('Mods need the desktop app.');
  await mods.write('maps', file.id, toMapFile(file));
}

/** Keeps a map of the map editor in the folder, in the older format it draws. */
export async function saveMapDraft(file: OldMapFile, mods: Mods | undefined = desktop?.mods): Promise<void> {
  if (!mods) throw new Error('Mods need the desktop app.');
  await mods.write('maps', file.id, toOldMapFile(file));
}

/** Asks for a file with the system's dialog and checks it; null when the player cancels. A file of the older format is converted. */
export async function importMapFile(mods: Mods | undefined = desktop?.mods): Promise<({ ok: true; file: MapFile; fileName: string } | { ok: false; reason: string; fileName: string }) | null> {
  const picked = await mods?.importFile('maps');
  if (!picked) return null;
  if ('error' in picked) return { ok: false, reason: picked.error, fileName: picked.fileName };
  try {
    const checked = readMapFile(JSON.parse(picked.text));
    return checked.ok ? { ok: true, file: checked.file, fileName: picked.fileName } : { ok: false, reason: checked.reason, fileName: picked.fileName };
  } catch {
    return { ok: false, reason: 'The file is not a map: it cannot be read as text with a map in it.', fileName: picked.fileName };
  }
}

/** A file picked for the map editor: a town for the 3D editor (format 2) or a plan of the older format. */
export type PickedMap = { ok: true; fileName: string; town: MapFile; plan?: undefined } | { ok: true; fileName: string; plan: OldMapFile; town?: undefined } | { ok: false; reason: string; fileName: string };

/** Like `importMapFile`, for the map editor: a file of the new format opens in 3D, one of the older format on the plan. */
export async function importMapDraft(mods: Mods | undefined = desktop?.mods): Promise<PickedMap | null> {
  const picked = await mods?.importFile('maps');
  if (!picked) return null;
  if ('error' in picked) return { ok: false, reason: picked.error, fileName: picked.fileName };
  try {
    const raw: unknown = JSON.parse(picked.text);
    const format = formatOf(raw);
    if (typeof format === 'number' && format > OLD_MAP_FORMAT) {
      const checked = readMapFile(raw);
      return checked.ok ? { ok: true, town: checked.file, fileName: picked.fileName } : { ok: false, reason: checked.reason, fileName: picked.fileName };
    }
    const checked = checkOldMapFile(raw);
    return checked.ok ? { ok: true, plan: checked.file, fileName: picked.fileName } : { ok: false, reason: checked.reason, fileName: picked.fileName };
  } catch {
    return { ok: false, reason: 'The file is not a map: it cannot be read as text with a map in it.', fileName: picked.fileName };
  }
}

/** Asks where to put the file of a map; false when the player cancels. */
export async function exportMapFile(file: MapFile, mods: Mods | undefined = desktop?.mods, name = `${file.id}.map.json`): Promise<boolean> {
  return (await mods?.exportFile('maps', name, toMapFile(file))) ?? false;
}

/** Like `exportMapFile`, for a map of the map editor, in the older format. */
export async function exportMapDraft(file: OldMapFile, mods: Mods | undefined = desktop?.mods, name = `${file.id}.map.json`): Promise<boolean> {
  return (await mods?.exportFile('maps', name, toOldMapFile(file))) ?? false;
}
