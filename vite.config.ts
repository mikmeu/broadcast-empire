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
    // GitHub's machines are slower than a desktop; the long tests stretch their own limits (src/sim/slow.ts).
    testTimeout: process.env.CI ? 15_000 : 5_000,
    coverage: {
      // The game logic; the UI is checked by playing it in a browser.
      include: ['src/sim/**', 'src/config/**', 'src/persistence/**'],
      exclude: ['**/*.test.ts'],
      reporter: ['text', 'html'],
    },
  },
});
