// The default towns (0.21.0, #282): src/config/maps/<id>.json, in the format of src/mods/mapFile.ts.
// They are bundled with the game, because the layout is asked for at once and everywhere (the sim, the
// scene, the sound), so a map has to be in memory before the first frame. A bad one throws at start.
// They are plain imports and not Vite's `import.meta.glob`, so the test players (`npm run simulate`, under tsx) load them too (#287);
// a test holds the list to the folder.

import { checkMapFile, type MapFile } from '../mods/mapFile';
import aerialFields from './maps/aerial-fields.json';
import amplifyHills from './maps/amplify-hills.json';
import coaxia from './maps/coaxia.json';
import skywaveBeach from './maps/skywave-beach.json';
import transponderValley from './maps/transponder-valley.json';

const FILES: Record<string, unknown> = {
  'aerial-fields': aerialFields,
  'amplify-hills': amplifyHills,
  coaxia,
  'skywave-beach': skywaveBeach,
  'transponder-valley': transponderValley,
};

export const MAPS: Record<string, MapFile> = {};
for (const [id, raw] of Object.entries(FILES)) {
  const checked = checkMapFile(raw);
  if (!checked.ok) throw new Error(`${id}.json: ${checked.reason}`);
  if (checked.file.id !== id) throw new Error(`${id}.json: the id "${checked.file.id}" is not the name of the file.`);
  MAPS[id] = checked.file;
}
