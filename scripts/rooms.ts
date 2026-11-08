// Saves the room pictures of src/assets/rooms from scripts/rooms.html, which draws them (256x192, on a
// clear ground) from each room's main piece. The browser is chosen as in scripts/furniture.ts.
//
// Usage: npx tsx scripts/rooms.ts                    every room in rooms.html
//        npx tsx scripts/rooms.ts giftShop            only those rooms

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium, type Browser } from 'playwright-core';
import { createServer } from 'vite';

const only = process.argv.slice(2);
const EDGE = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const executablePath = process.env.SCREENSHOT_BROWSER || (process.platform === 'darwin' && existsSync(EDGE) ? EDGE : undefined);
const out = new URL('../src/assets/rooms/', import.meta.url);
mkdirSync(out, { recursive: true });

const server = await createServer({ logLevel: 'warn', server: { port: 5192, open: false } });
await server.listen();
const url = server.resolvedUrls?.local[0] ?? 'http://localhost:5192/';
let browser: Browser | undefined;
try {
  browser = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.on('pageerror', (error) => console.error(`page: ${error.message}`));
  await page.goto(`${url}scripts/rooms.html`);
  await page.waitForFunction('window.picturesDone === true', undefined, { timeout: 300_000 });
  const pictures = (await page.evaluate('window.pictures')) as Record<string, string>;
  for (const [room, data] of Object.entries(pictures)) {
    if (only.length && !only.includes(room)) continue;
    writeFileSync(new URL(`${room}.png`, out), Buffer.from(data.slice(data.indexOf(',') + 1), 'base64'));
    console.log(room);
  }
} finally {
  await browser?.close();
  await server.close();
}
