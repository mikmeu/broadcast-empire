/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  plugins: [react()],
  // The game shows which build it is (src/version.ts).
  define: { __APP_VERSION__: JSON.stringify(version) },
  test: {
    include: ['src/**/*.test.ts'],
    // Many tests play months or years of a game. On a busy GitHub runner the default five seconds is too tight
    // for them, and which one runs over changes from run to run; the longest set their own limit.
    testTimeout: 30_000,
    coverage: {
      // The game logic; the UI is checked by playing it in a browser.
      include: ['src/sim/**', 'src/config/**', 'src/persistence/**'],
      exclude: ['**/*.test.ts'],
      reporter: ['text', 'html'],
    },
  },
});
