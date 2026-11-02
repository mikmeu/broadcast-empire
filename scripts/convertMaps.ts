// Writes the five default towns, src/config/maps/<id>.json, in the format of src/mods/mapFile.ts (#327): each of the frozen drawings
// (src/mods/oldMaps) laid out as it always was, with what the seed 1970 puts in it, and written down. Run it only to make the files
// again from the drawings, which are never changed: `npx tsx scripts/convertMaps.ts`. The files it writes are the truth after that:
// a town is changed in them, not here.

import { mkdirSync, writeFileSync } from 'node:fs';
import type { RegionId } from '../src/config/world';
import { TOWN_SEED, convertOldMap } from '../src/mods/oldMap';
import { OLD_MAPS } from '../src/mods/oldMaps';
import { toMapFile } from '../src/mods/mapFile';

const REGIONS: Record<string, RegionId> = {
  coaxia: 'capital',
  'transponder-valley': 'north',
  'skywave-beach': 'coast',
  'aerial-fields': 'heartland',
  'amplify-hills': 'highlands',
};

mkdirSync(new URL('../src/config/maps/', import.meta.url), { recursive: true });
for (const [id, region] of Object.entries(REGIONS)) {
  const converted = convertOldMap(OLD_MAPS[id]!, { seed: TOWN_SEED, region });
  if (!converted.ok) throw new Error(`${id}: ${converted.reason}`);
  const text = toMapFile(converted.file);
  writeFileSync(new URL(`../src/config/maps/${id}.json`, import.meta.url), text);
  console.log(`${id}: ${Math.round(text.length / 100) / 10} kB`);
}
