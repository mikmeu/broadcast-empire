// Writes design/voice-over.md, the script for the tutorial's voice-over.
//
// Usage: npm run voice-over

import { writeFileSync } from 'node:fs';
import { voiceOverScript } from '../src/config/voiceOver';

const file = new URL('../design/voice-over.md', import.meta.url);
writeFileSync(file, voiceOverScript());
console.log(`Wrote ${file.pathname}`);
