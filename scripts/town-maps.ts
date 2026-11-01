// Reads design/towns/*.svg and rewrites the `map` of src/config/maps/<id>.json; the settings stay.
//
// Usage: npm run town-maps

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mapFilesFrom } from '../src/config/townMapReader';
import { checkMapFile, type MapFile } from '../src/mods/mapFile';

const dir = new URL('../design/towns/', import.meta.url);
const out = new URL('../src/config/maps/', import.meta.url);
const svgs: Record<string, string> = {};
for (const file of readdirSync(dir).filter((f) => f.endsWith('.svg'))) {
  svgs[file.replace(/\.svg$/, '')] = readFileSync(new URL(file, dir), 'utf8');
}

const current: Record<string, MapFile> = {};
for (const file of readdirSync(out).filter((f) => f.endsWith('.json'))) {
  const checked = checkMapFile(JSON.parse(readFileSync(new URL(file, out), 'utf8')));
  if (!checked.ok) throw new Error(`${file}: ${checked.reason}`);
  current[file.replace(/\.json$/, '')] = checked.file;
}

const { files, warnings } = mapFilesFrom(svgs, current);
for (const w of warnings) console.warn(`Off the grid: ${w}`);
for (const [id, text] of Object.entries(files)) writeFileSync(new URL(`${id}.json`, out), text);
console.log(`Wrote ${Object.keys(files).length} maps in ${out.pathname}`);
