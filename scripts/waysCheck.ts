// Opens the map editor on a copy of Aerial Fields in a browser and tries the ways to the entrance (0.21.0, #339): the Walking layer shows them, the ring
// can be turned off with the tick under the Walking path tool, a walking path is drawn (and so paved), and "Export for the game" gives the file back with
// `ways` and `ring` only where they were changed. Takes pictures when given a folder.
//
//   npx tsx scripts/waysCheck.ts [folder for pictures]
//
// The browser: SCREENSHOT_BROWSER (the path to Chrome, Edge or Chromium), else the Chromium of playwright-core.

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const pictures = process.argv[2] ? resolve(process.argv[2]) : undefined;
if (pictures) mkdirSync(pictures, { recursive: true });

const server = await createServer({ logLevel: 'warn', server: { port: 5192, open: false } });
await server.listen();
const url = server.resolvedUrls?.local[0] ?? 'http://localhost:5192/';
const browser = await chromium.launch({ executablePath: process.env.SCREENSHOT_BROWSER || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};

try {
  const context = await browser.newContext({ viewport: { width: 1500, height: 900 }, acceptDownloads: true });
  await context.addInitScript('globalThis.__name = (fn) => fn');
  await context.addInitScript("localStorage.setItem('broadcast-empire:settings', JSON.stringify({ mapEditor: true, reduceMotion: true }))");
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  await page.getByRole('button', { name: 'Map editor' }).click({ timeout: 60_000 });
  await page.getByRole('heading', { name: 'Map editor' }).waitFor();
  await page.getByRole('navigation', { name: 'Maps' }).getByRole('button', { name: /^Aerial Fields/ }).click();
  const town = page.getByRole('img', { name: /The town you are drawing/ });
  await town.waitFor({ timeout: 60_000 });
  await page.waitForTimeout(4000);
  const tools = page.getByRole('toolbar', { name: 'Tools' });

  // The Walking layer shows the ways.
  await page.getByLabel(/Walking/).check();
  await page.waitForTimeout(1500);
  if (pictures) await page.screenshot({ path: resolve(pictures, 'ways-aerial-fields.png') });

  // The ring: a tick under the Walking path tool, in a town of roads.
  await tools.getByRole('button', { name: 'Walking path' }).click();
  const ring = page.getByLabel('People also walk the line round the building');
  check(await ring.isChecked(), 'the ring is on in Aerial Fields');
  await ring.uncheck();
  await page.waitForTimeout(3000);
  check(!(await ring.isChecked()), 'the ring can be turned off');
  check(await page.getByRole('button', { name: 'Export for the game' }).isEnabled(), 'the game can run on it with the ring off');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export for the game' }).click()]);
  const text = await (await import('node:fs/promises')).readFile((await download.path())!, 'utf8');
  check(/"ring": false/.test(text) && !/"ways"/.test(text), 'the file says "ring": false and has no ways');
  if (pictures) await page.screenshot({ path: resolve(pictures, 'ways-ring-off.png') });
  await ring.check();

  check(errors.length === 0, `no errors in the page${errors.length ? `: ${errors[0]}` : ''}`);
} finally {
  await browser.close();
  await server.close();
}
if (failed > 0) {
  console.log(`${failed} checks failed`);
  process.exit(1);
}
