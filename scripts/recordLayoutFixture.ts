// Writes src/office/layout.fixture.json: what the layouts of the five towns say, and what stands in them with the seed 1970
// (#327). Run it only on code whose layouts are meant to be the new truth: `npx tsx scripts/recordLayoutFixture.ts`.

import { writeFileSync } from 'node:fs';
import { LAYOUT_TOWNS, describeTown, standing } from '../src/office/layout.fixture';

const fixture = {
  layouts: Object.fromEntries(LAYOUT_TOWNS.map((town) => [town.name, describeTown(town)])),
  standing: Object.fromEntries(LAYOUT_TOWNS.map((town) => [town.name, standing(town.region)])),
};
writeFileSync(new URL('../src/office/layout.fixture.json', import.meta.url), JSON.stringify(fixture, null, 1) + '\n');
console.log(`Recorded ${LAYOUT_TOWNS.length} towns.`);
