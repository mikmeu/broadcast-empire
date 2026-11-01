// The maps in the mods folder (0.21.0, #284): `maps/<id>/piece.json`, in the format of mapFile.ts. The map editor lists, saves,
// imports and exports them. The new-game form and Settings list them too (0.21.0, #290; src/mods/playMap.ts says which can be played).

import { desktop, type DesktopBridge } from '../persistence/desktop';
import { checkMapFile, toMapFile, type MapFile } from './mapFile';

type Mods = NonNullable<DesktopBridge['mods']>;

/** A map in the folder that could not be used, and why. */
export interface MapProblem {
  id: string;
  reason: string;
}

/** Reads, checks and returns every map in the folder. A broken one is reported, never thrown. */
export async function loadMapMods(mods: Mods | undefined = desktop?.mods): Promise<{ maps: MapFile[]; problems: MapProblem[] }> {
  const maps: MapFile[] = [];
  const problems: MapProblem[] = [];
  if (!mods) return { maps, problems };
  for (const id of await mods.list('maps').catch(() => [] as string[])) {
    try {
      const stored = await mods.read('maps', id);
      if (!stored) throw new Error('The map is gone.');
      const checked = checkMapFile(JSON.parse(stored.text));
      if (!checked.ok) throw new Error(checked.reason);
      if (checked.file.id !== id) throw new Error(`The file says its id is “${checked.file.id}”, but its folder is “${id}”.`);
      maps.push(checked.file);
    } catch (error) {
      problems.push({ id, reason: error instanceof SyntaxError ? 'The file is not readable text.' : error instanceof Error ? error.message : String(error) });
    }
  }
  return { maps, problems };
}

/** Keeps a map in the folder. */
export async function saveMapMod(file: MapFile, mods: Mods | undefined = desktop?.mods): Promise<void> {
  if (!mods) throw new Error('Mods need the desktop app.');
  await mods.write('maps', file.id, toMapFile(file));
}

/** Asks for a file with the system's dialog and checks it; null when the player cancels. */
export async function importMapFile(mods: Mods | undefined = desktop?.mods): Promise<({ ok: true; file: MapFile; fileName: string } | { ok: false; reason: string; fileName: string }) | null> {
  const picked = await mods?.importFile('maps');
  if (!picked) return null;
  if ('error' in picked) return { ok: false, reason: picked.error, fileName: picked.fileName };
  try {
    const checked = checkMapFile(JSON.parse(picked.text));
    return checked.ok ? { ok: true, file: checked.file, fileName: picked.fileName } : { ok: false, reason: checked.reason, fileName: picked.fileName };
  } catch {
    return { ok: false, reason: 'The file is not a map: it cannot be read as text with a map in it.', fileName: picked.fileName };
  }
}

/** Asks where to put the file of a map; false when the player cancels. */
export async function exportMapFile(file: MapFile, mods: Mods | undefined = desktop?.mods, name = `${file.id}.map.json`): Promise<boolean> {
  return (await mods?.exportFile('maps', name, toMapFile(file))) ?? false;
}
