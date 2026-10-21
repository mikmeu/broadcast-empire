// Writes design/office-sounds.md, the list of sounds the office needs.
//
// Usage: npm run office-sounds

import { writeFileSync } from 'node:fs';
import { officeSoundsList } from '../src/audio/officeSounds';

const file = new URL('../design/office-sounds.md', import.meta.url);
writeFileSync(file, officeSoundsList());
console.log(`Wrote ${file.pathname}`);
