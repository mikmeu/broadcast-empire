// How long an edit of the map editor takes on the CPU (0.21.0, #328): the work the town does again when a map changes, on a copy of
// Coaxia, the biggest of the five towns. The first part is what every edit cost before the editor split the decor from the structure (a
// new layout, the roads built on it, the map check and the blocks of the new town); the second is what a decor edit costs now (a house placed:
// the layout stays, its decor is replaced, the blocks are drawn up again and the check looks only at the track). Drawing is left out: the
// SwiftShader renderer of a server overstates it, so the CPU parts are the ones that count here. scripts/mapEditorCheck.ts times a click to the
// next frame in a real browser.
//
//   npx tsx scripts/mapEditSpeed.ts

import { buildingFor } from '../src/config/office';
import { MAPS } from '../src/config/maps';
import { townBlocks } from '../src/office/city';
import { previewSite, showPreviewMap, updatePreviewDecor } from '../src/mods/mapPreview';
import { placeHouse, structureKey } from '../src/mods/townDraft';
import { checkStructure, checkTown, standsOnTrack } from '../src/office/townCheck';
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

const rebuild: Record<string, number[]> = { layoutFromMap: [], roadsOf: [], checkTown: [], townBlocks: [] };
const decor: Record<string, number[]> = { structureKey: [], updatePreviewDecor: [], townBlocks: [], standsOnTrack: [] };
// (Warm up: the module code and the tables.)
showPreviewMap(copy, house);
checkTown(copy, house);
checkStructure(copy, house);

for (let n = 0; n < RUNS; n++) {
  // Every edit before: a new layout, the roads built on it, the map check (which does both again) and the blocks of the new town.
  const [layout, a] = time(() => layoutFromMap(copy, house));
  const [, b] = time(() => roadsOf(layout));
  const [, c] = time(() => checkTown(copy, house));
  showPreviewMap(copy, house);
  const [, d] = time(() => townBlocks(previewSite(copy, 'capital'), house));
  rebuild.layoutFromMap!.push(a);
  rebuild.roadsOf!.push(b);
  rebuild.checkTown!.push(c);
  rebuild.townBlocks!.push(d);

  // A decor edit now: the key of the structure is the same, the decor is replaced on the layout that is there.
  const placed = placeHouse(copy, { model: 'city/building-a.glb', x: 2.5 + n, z: 100.5, turn: 0 });
  const [, e] = time(() => structureKey(placed));
  const [, f] = time(() => updatePreviewDecor(placed));
  const [, g] = time(() => townBlocks(previewSite(placed, 'capital'), house));
  const [, h] = time(() => standsOnTrack(placed, house));
  decor.structureKey!.push(e);
  decor.updatePreviewDecor!.push(f);
  decor.townBlocks!.push(g);
  decor.standsOnTrack!.push(h);
}

const show = (title: string, steps: Record<string, number[]>) => {
  console.log(`${title}: ${Object.values(steps).reduce((sum, xs) => sum + median(xs), 0).toFixed(2)} ms in all`);
  for (const [name, xs] of Object.entries(steps)) console.log(`  ${name.padEnd(20)} ${median(xs).toFixed(2)} ms`);
};

console.log(`Coaxia copy, ${(JSON.stringify(copy).length / 1024).toFixed(1)} KB, median of ${RUNS} runs.`);
show('A rebuild (every edit before)', rebuild);
show('A decor edit (a house placed, now)', decor);
