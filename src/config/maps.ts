// The default towns (0.21.0, #282): src/config/maps/<id>.json, in the format of src/mods/mapFile.ts.
// They are bundled with the game, because the layout is asked for at once and everywhere (the sim, the
// scene, the sound), so a map has to be in memory before the first frame. A bad one throws at start.

import { checkMapFile, type MapFile } from '../mods/mapFile';

const FILES = import.meta.glob('./maps/*.json', { eager: true, import: 'default' });

export const MAPS: Record<string, MapFile> = {};
for (const [path, raw] of Object.entries(FILES)) {
  const checked = checkMapFile(raw);
  if (!checked.ok) throw new Error(`${path}: ${checked.reason}`);
  const id = path.replace(/^.*\/(.*)\.json$/, '$1');
  if (checked.file.id !== id) throw new Error(`${path}: the id "${checked.file.id}" is not the name of the file.`);
  MAPS[id] = checked.file;
}
