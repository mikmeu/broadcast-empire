// Opens the map editor in a browser and checks it end to end (0.21.0, #284): every default map opens in it and "Export for the
// game" gives back the bytes of src/config/maps/<id>.json; a street drawn with a tool lands on the plan; the town is drawn.
//
//   npx tsx scripts/mapEditorCheck.ts [folder for pictures]
//
// The browser: SCREENSHOT_BROWSER (the path to Chrome, Edge or Chromium), else the Chromium of playwright-core.

import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const pictures = process.argv[2] ? resolve(process.argv[2]) : undefined;
if (pictures) mkdirSync(pictures, { recursive: true });
const IDS = ['coaxia', 'transponder-valley', 'skywave-beach', 'aerial-fields', 'amplify-hills'];
const NAMES: Record<string, string> = { coaxia: 'Coaxia', 'transponder-valley': 'Transponder Valley', 'skywave-beach': 'Skywave Beach', 'aerial-fields': 'Aerial Fields', 'amplify-hills': 'Amplify Hills' };

const server = await createServer({ logLevel: 'warn', server: { port: 5191, open: false } });
await server.listen();
const url = server.resolvedUrls?.local[0] ?? 'http://localhost:5191/';
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
  page.on('dialog', (dialog) => void dialog.accept());
  await page.goto(url);
  await page.getByRole('button', { name: 'Map editor' }).click({ timeout: 60_000 });
  await page.getByRole('heading', { name: 'Map editor' }).waitFor();

  for (const id of IDS) {
    await page.getByRole('navigation', { name: 'Maps' }).getByRole('button', { name: new RegExp(`^${NAMES[id]}`) }).click();
    await page.getByRole('button', { name: 'Export for the game' }).waitFor();
    const enabled = await page.getByRole('button', { name: 'Export for the game' }).isEnabled();
    check(enabled, `${id}: the game can run on it, as the editor checks`);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export for the game' }).click()]);
    const path = await download.path();
    check(download.suggestedFilename() === `${id}.json`, `${id}: exported as ${id}.json`);
    check(readFileSync(path!, 'utf8') === readFileSync(resolve(`src/config/maps/${id}.json`), 'utf8'), `${id}: the exported bytes are the game's file`);
    if (pictures) {
      await page.waitForTimeout(6000);
      await page.screenshot({ path: resolve(pictures, `${id}.png`) });
    }
  }

  // A new grid map, a street drawn with a tool.
  await page.getByRole('button', { name: 'New grid map' }).click();
  await page.getByRole('toolbar', { name: 'Tools' }).getByRole('button', { name: 'Two-way' }).click();
  const plan = page.getByRole('img', { name: /Plan of the map/ });
  const box = (await plan.boundingBox())!;
  const lanes = () => plan.locator('g rect[fill="#454545"]').count();
  check((await lanes()) === 0, 'a new map has no lanes');
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 110, { steps: 5 });
  await page.mouse.up();
  check((await lanes()) === 2, 'a two-way street is two lanes');
  await page.getByRole('button', { name: 'Undo' }).click();
  check((await lanes()) === 0, 'undo takes it away');
  await page.getByRole('button', { name: 'Redo' }).click();
  check((await lanes()) === 2, 'redo puts it back');
  await page.getByRole('toolbar', { name: 'Tools' }).getByRole('button', { name: 'Select' }).click();
  await plan.locator('g rect[fill="#454545"]').first().click();
  await page.keyboard.press('Delete');
  check((await lanes()) === 0, 'Delete removes the whole street');

  // What is painted and placed shows in the town on the right: concrete and a house put down by hand on a copy of Skywave Beach.
  await page.getByRole('navigation', { name: 'Maps' }).getByRole('button', { name: /^Skywave Beach/ }).click();
  const tools = page.getByRole('toolbar', { name: 'Tools' });
  await tools.getByRole('button', { name: 'Concrete' }).click();
  const area = (await plan.boundingBox())!;
  await page.mouse.move(area.x + area.width * 0.45, area.y + area.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width * 0.55, area.y + area.height * 0.6, { steps: 5 });
  await page.mouse.up();
  check((await plan.locator('rect[fill="#cfcfcf"]').count()) === 1, 'a box of concrete is on the plan');
  await tools.getByRole('button', { name: 'One house or building' }).click();
  await page.mouse.click(area.x + area.width * 0.6, area.y + area.height * 0.55);
  check((await plan.locator('rect[fill="#c27d3a"]').count()) === 1, 'a house put down by hand is on the plan');
  if (pictures) {
    const view = page.getByRole('group', { name: 'Move the picture' });
    for (let n = 0; n < 4; n++) await view.getByRole('button', { name: 'Zoom out' }).click();
    for (let n = 0; n < 2; n++) await view.getByRole('button', { name: 'Move up' }).click();
    await page.waitForTimeout(6000);
    await page.screenshot({ path: resolve(pictures, 'painted.png') });
  }

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
