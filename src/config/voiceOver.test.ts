import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { voiceFile } from '../audio/voice';
import { LINES } from './guide';
import { VOICE_FOLDER, TO_RECORD } from './voiceOver';

describe('version 0.9.0', () => {
  describe('the voices (R1)', () => {
    it('every recording is named after a line of the tutorial', () => {
      const lines = new Set(LINES.map((line) => voiceFile(line.id)));
      expect(lines.size).toBe(LINES.length);
      const files = existsSync(VOICE_FOLDER) ? readdirSync(VOICE_FOLDER).filter((file) => !file.startsWith('.')) : [];
      for (const file of files) expect(lines.has(file), `${VOICE_FOLDER}/${file} is not a line of the tutorial`).toBe(true);
    });
  });
});

// From version010.
describe('version 0.10.0', () => {
  describe('the voices', () => {
    it('every line has its recording, or is on the list of lines to record', () => {
      for (const line of LINES) {
        const recorded = existsSync(`${VOICE_FOLDER}/${voiceFile(line.id)}`);
        const waits = TO_RECORD[line.id];
        // A new line has no file; a changed one has the old file, which the game does not play.
        expect(recorded, `${line.id}: ${waits ?? 'recorded'}`).toBe(waits !== 'new');
      }
      for (const id of Object.keys(TO_RECORD)) expect(LINES.some((line) => line.id === id), id).toBe(true);
    });
  });
});
