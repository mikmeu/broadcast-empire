// The five default towns as they were drawn, in the older format (#327): src/mods/oldMaps/<id>.json. The converter (oldMap.ts) is tried on them,
// and the map editor, which still draws and saves the older format until the 3D editor takes its place (#328, #329), opens them. The towns the game
// plays are src/config/maps/<id>.json, in the format of src/mods/mapFile.ts, written once from these with the seed 1970 (scripts/convertMaps.ts).
// Plain imports, as in src/config/maps.ts, so that the scripts under tsx load them too; a test holds the list to the folder.

import { checkOldMapFile, type OldMapFile } from './oldMapFile';
import aerialFields from './oldMaps/aerial-fields.json';
import amplifyHills from './oldMaps/amplify-hills.json';
import coaxia from './oldMaps/coaxia.json';
import skywaveBeach from './oldMaps/skywave-beach.json';
import transponderValley from './oldMaps/transponder-valley.json';

const FILES: Record<string, unknown> = {
  'aerial-fields': aerialFields,
  'amplify-hills': amplifyHills,
  coaxia,
  'skywave-beach': skywaveBeach,
  'transponder-valley': transponderValley,
};

export const OLD_MAPS: Record<string, OldMapFile> = {};
for (const [id, raw] of Object.entries(FILES)) {
  const checked = checkOldMapFile(raw);
  if (!checked.ok) throw new Error(`oldMaps/${id}.json: ${checked.reason}`);
  if (checked.file.id !== id) throw new Error(`oldMaps/${id}.json: the id "${checked.file.id}" is not the name of the file.`);
  OLD_MAPS[id] = checked.file;
}
