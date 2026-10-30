// Writes src/office/traffic.fixture.json: how today's towns drive (#217). Run it only on code whose traffic is
// meant to be the new truth: `npx tsx scripts/recordTrafficFixture.ts`.

import { writeFileSync } from 'node:fs';
import { FIXTURE_TOWNS, describe } from '../src/office/traffic.fixture';

const fixture = Object.fromEntries(FIXTURE_TOWNS.map((town) => [town.name, describe(town)]));
writeFileSync(new URL('../src/office/traffic.fixture.json', import.meta.url), JSON.stringify(fixture, null, 1) + '\n');
console.log(`Recorded ${FIXTURE_TOWNS.length} towns.`);
