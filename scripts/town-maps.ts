// Reads design/towns/*.svg and writes src/config/townMaps.ts.
//
// Usage: npm run town-maps

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { townMapsSource } from '../src/config/townMapReader';

const dir = new URL('../design/towns/', import.meta.url);
const svgs: Record<string, string> = {};
for (const file of readdirSync(dir).filter((f) => f.endsWith('.svg'))) {
  svgs[file.replace(/\.svg$/, '')] = readFileSync(new URL(file, dir), 'utf8');
}

const { source, warnings } = townMapsSource(svgs);
for (const w of warnings) console.warn(`Off the grid: ${w}`);

const file = new URL('../src/config/townMaps.ts', import.meta.url);
writeFileSync(file, source);
console.log(`Wrote ${file.pathname} (${Object.keys(svgs).length} towns)`);
