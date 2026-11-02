// How long an edit of the map editor takes on the CPU (0.21.0, #328): the work the town does again when a map changes, on a copy of
// Coaxia, the biggest of the five towns. Run it before and after the editor stops rebuilding the traffic on a decor edit. Drawing is left
// out: the SwiftShader renderer of a server overstates it, so the CPU parts are the ones that count.
//
//   npx tsx scripts/mapEditSpeed.ts

import { buildingFor } from '../src/config/office';
import { MAPS } from '../src/config/maps';
import { townBlocks } from '../src/office/city';
import { previewSite, showPreviewMap } from '../src/mods/mapPreview';
import { checkTown } from '../src/office/townCheck';
import { layoutFromMap } from '../src/office/townLayout';
import { roadsOf } from '../src/office/traffic';

const copy = { ...structuredClone(MAPS.coaxia!), id: 'coaxia-copy', name: 'Coaxia (copy)' };
const house = buildingFor('capital');
const RUNS = 9;

const time = <T>(f: () => T): [T, number] => {
  const t = performance.now();
  const r = f();
  return [r, performance.now() - t];
};
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

const steps: Record<string, number[]> = { layoutFromMap: [], roadsOf: [], checkTown: [], townBlocks: [] };
// (Warm up: the module code and the tables.)
showPreviewMap(copy, house);
checkTown(copy, house);

for (let n = 0; n < RUNS; n++) {
  // Every edit today: a new layout, the roads built on it, the map check (which does both again) and the blocks of the new town.
  const [layout, a] = time(() => layoutFromMap(copy, house));
  const [, b] = time(() => roadsOf(layout));
  const [, c] = time(() => checkTown(copy, house));
  showPreviewMap(copy, house);
  const [, d] = time(() => townBlocks(previewSite(copy, 'capital'), house));
  steps.layoutFromMap!.push(a);
  steps.roadsOf!.push(b);
  steps.checkTown!.push(c);
  steps.townBlocks!.push(d);
}

console.log(`Coaxia copy, ${(JSON.stringify(copy).length / 1024).toFixed(1)} KB, median of ${RUNS} runs.`);
console.log(`A rebuild: ${Object.values(steps).reduce((sum, xs) => sum + median(xs), 0).toFixed(1)} ms in all`);
for (const [name, xs] of Object.entries(steps)) console.log(`  ${name.padEnd(14)} ${median(xs).toFixed(1)} ms`);
