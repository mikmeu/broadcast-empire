// Draws the pictures of the furniture in src/assets/furniture (256x192, tier 1, on a clear ground),
// which the Inventory shows. Each is drawn from the piece's 3D model with the catalog's camera and
// lights (scripts/furniture.html), standing still.
//
// Usage: npx tsx scripts/furniture.ts              every piece
//        npx tsx scripts/furniture.ts mixingDesk   only those pieces
//
// Run it when a piece is added, or when its model changes (a test fails for a piece without a
// picture). The browser is chosen as in scripts/screenshot.ts: SCREENSHOT_BROWSER, else Edge on a
// Mac, else the Chromium of playwright-core. The 3D view is drawn without a graphics card.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium, type Browser } from 'playwright-core';
import { createServer } from 'vite';

const only = process.argv.slice(2);
const EDGE = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const executablePath = process.env.SCREENSHOT_BROWSER || (process.platform === 'darwin' && existsSync(EDGE) ? EDGE : undefined);
const out = new URL('../src/assets/furniture/', import.meta.url);
mkdirSync(out, { recursive: true });

const server = await createServer({ logLevel: 'warn', server: { port: 5191, open: false } });
await server.listen();
const url = server.resolvedUrls?.local[0] ?? 'http://localhost:5191/';
let browser: Browser | undefined;
let failed = 0;
try {
  browser = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 300, height: 240 } });
  page.on('pageerror', (error) => console.error(`page: ${error.message}`));
  await page.goto(`${url}scripts/furniture.html`);
  await page.waitForFunction('window.ready === true', undefined, { timeout: 120_000 });
  const all = (await page.evaluate('window.types')) as string[];
  const types = only.length ? all.filter((type) => only.includes(type)) : all;
  for (const type of types) {
    try {
      const data = (await page.evaluate(`window.draw(${JSON.stringify(type)})`)) as string;
      writeFileSync(new URL(`${type}.png`, out), Buffer.from(data.slice(data.indexOf(',') + 1), 'base64'));
      console.log(type);
    } catch (error) {
      failed++;
      console.error(`${type}: ${error instanceof Error ? error.message : error}`);
    }
  }
} finally {
  await browser?.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
