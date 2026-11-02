// Opens the map editor in a browser and checks it end to end (0.21.0, #284, in 3D from #328): every game map opens in 3D and "Export for the game"
// gives back the bytes of src/config/maps/<id>.json; a house is placed on the town, undone and redone; a box of ground is painted; a fill is written
// down; how long a decor edit takes from the click to the next frame; and a street drawn on the plan of the older format lands there.
//
//   npx tsx scripts/mapEditorCheck.ts [folder for pictures]
//
// The browser: SCREENSHOT_BROWSER (the path to Chrome, Edge or Chromium), else the Chromium of playwright-core.

import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright-core';
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

/** The number of houses the status line under the town says the map has. */
const houses = async (page: Page) => {
  const text = (await page.getByRole('status').filter({ hasText: /\d+ houses|Put down|cannot/ }).first().textContent()) ?? '';
  return Number(/(\d+) houses/.exec(text)?.[1] ?? NaN);
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
  const maps = page.getByRole('navigation', { name: 'Maps' });
  const tools = page.getByRole('toolbar', { name: 'Tools' });
  const town = () => page.getByRole('img', { name: /The town you are drawing/ });

  // The game's maps, out and back.
  for (const id of IDS) {
    await maps.getByRole('button', { name: new RegExp(`^${NAMES[id]}`) }).click();
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

  // A house on the town of a copy of Coaxia: placed, undone and redone. The pointer is tried over the picture until a place is found where it fits.
  await maps.getByRole('button', { name: /^Coaxia/ }).click();
  await town().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(3000);
  const before = await houses(page);
  await tools.getByRole('button', { name: 'House' }).click();
  const area = (await town().boundingBox())!;
  let placed = false;
  for (let row = 1; row < 8 && !placed; row++) {
    for (let column = 1; column < 8 && !placed; column++) {
      await page.mouse.move(area.x + (area.width * column) / 8, area.y + (area.height * row) / 8);
      await page.mouse.click(area.x + (area.width * column) / 8, area.y + (area.height * row) / 8);
      placed = (await houses(page)) === before + 1;
    }
  }
  check(placed, 'a house put down on the town is in the file');
  await page.getByRole('button', { name: 'Undo' }).click();
  check((await houses(page)) === before, 'undo takes it away');
  await page.getByRole('button', { name: 'Redo' }).click();
  check((await houses(page)) === before + 1, 'redo puts it back');

  // How long a decor edit takes: from the click on the town to the next frame after the status line has changed. (SwiftShader overstates the drawing.)
  await page.evaluate(() => {
    const w = window as unknown as { __edit: number | null; __t0: number };
    w.__edit = null;
    document.addEventListener('click', () => (w.__t0 = performance.now()), { capture: true, once: true });
    const status = [...document.querySelectorAll('[role=status]')].find((el) => /\d+ houses/.test(el.textContent ?? ''))!;
    new MutationObserver((_, observer) => {
      observer.disconnect();
      requestAnimationFrame(() => requestAnimationFrame(() => (w.__edit = performance.now() - w.__t0)));
    }).observe(status, { childList: true, subtree: true, characterData: true });
  });
  let edited = false;
  for (let row = 1; row < 8 && !edited; row++) {
    for (let column = 1; column < 8 && !edited; column++) {
      await page.mouse.click(area.x + (area.width * (column + 0.5)) / 9, area.y + (area.height * (row + 0.5)) / 9);
      edited = (await houses(page)) === before + 2;
    }
  }
  await page.waitForTimeout(500);
  const ms = await page.evaluate(() => (window as unknown as { __edit: number | null }).__edit);
  check(edited && ms !== null, `a decor edit reaches the next frame in ${ms === null ? '?' : Math.round(ms)} ms (target 100; the drawing is software here)`);

  // For the comparison: an edit of the structure (the seconds between two vehicles) builds the town and its traffic again, as every edit did before.
  await page.evaluate(() => {
    const w = window as unknown as { __rebuild: number | null; __s0: number };
    w.__rebuild = null;
    document.addEventListener('input', () => (w.__s0 = performance.now()), { capture: true, once: true });
    new MutationObserver((_, observer) => {
      observer.disconnect();
      requestAnimationFrame(() => requestAnimationFrame(() => (w.__rebuild = performance.now() - w.__s0)));
    }).observe(document.querySelector('.me-picture')!, { childList: true, subtree: true });
  });
  const every = page.getByLabel('Seconds between two vehicles');
  await every.fill(String(Number(await every.inputValue()) + 1));
  await page.waitForTimeout(3000);
  const rebuilt = await page.evaluate(() => (window as unknown as { __rebuild: number | null }).__rebuild);
  check(rebuilt !== null, `for the comparison, an edit of the structure (the town built again, with its traffic) takes ${rebuilt === null ? '?' : Math.round(rebuilt)} ms to the next frame`);

  // A box of ground, and a fill.
  await maps.getByRole('button', { name: /^Skywave Beach/ }).click();
  await town().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(3000);
  check(await page.getByRole('button', { name: 'Undo' }).isDisabled(), 'a map just opened has nothing to undo');
  await tools.getByRole('button', { name: 'Ground' }).click();
  await page.getByRole('group', { name: 'Ground' }).getByRole('button', { name: 'Concrete' }).click();
  const shore = (await town().boundingBox())!;
  await page.mouse.move(shore.x + shore.width * 0.45, shore.y + shore.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(shore.x + shore.width * 0.55, shore.y + shore.height * 0.6, { steps: 5 });
  await page.mouse.up();
  check(await page.getByRole('button', { name: 'Undo' }).isEnabled(), 'a box of ground is a change that can be undone');
  await tools.getByRole('button', { name: 'Fill' }).click();
  const start = await houses(page);
  let filled = false;
  for (let row = 2; row < 8 && !filled; row++) {
    await page.mouse.move(shore.x + shore.width * 0.15, shore.y + (shore.height * row) / 9);
    await page.mouse.down();
    await page.mouse.move(shore.x + shore.width * 0.4, shore.y + (shore.height * (row + 1)) / 9, { steps: 5 });
    await page.mouse.up();
    filled = (await houses(page)) > start;
  }
  check(filled, 'a fill writes houses in the file');
  if (pictures) {
    await page.waitForTimeout(3000);
    await page.screenshot({ path: resolve(pictures, 'painted.png') });
  }

  // The camera: the wheel zooms round the pointer, a right drag and (with Select) a drag of the empty ground pan. The picture changes with each.
  const picture = async () => (await town().screenshot()).toString('base64');
  await tools.getByRole('button', { name: 'Select' }).click();
  const looked = await picture();
  await page.mouse.move(shore.x + shore.width * 0.3, shore.y + shore.height * 0.3);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(800);
  const zoomed = await picture();
  check(zoomed !== looked, 'the wheel zooms the picture');
  await page.mouse.move(shore.x + shore.width * 0.5, shore.y + shore.height * 0.5);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(shore.x + shore.width * 0.6, shore.y + shore.height * 0.4, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(800);
  const panned = await picture();
  check(panned !== zoomed, 'a right drag pans the picture');
  await page.mouse.move(shore.x + shore.width * 0.5, shore.y + shore.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(shore.x + shore.width * 0.4, shore.y + shore.height * 0.6, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(800);
  check((await picture()) !== panned, 'a drag of the empty ground pans it with Select');

  // The plan of the older format: a street drawn with a tool lands there, and the map can go on in 3D.
  await page.getByRole('button', { name: 'New grid map' }).click();
  await tools.getByRole('button', { name: 'Two-way' }).click();
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
  await tools.getByRole('button', { name: 'Select' }).click();
  await plan.locator('g rect[fill="#454545"]').first().click();
  await page.keyboard.press('Delete');
  check((await lanes()) === 0, 'Delete removes the whole street');

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
