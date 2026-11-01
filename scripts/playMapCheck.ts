// Plays on a custom map in a browser (0.21.0, #290): the dev stand-in for the mods folder holds a copy of Aerial Fields under an id
// of its own; the new game form offers it, a game starts on it, is saved and loaded again, and the town and the building are the map's.
//
//   npx tsx scripts/playMapCheck.ts [folder for a picture]
//
// The browser: SCREENSHOT_BROWSER (the path to Chrome, Edge or Chromium), else the Chromium of playwright-core.

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { MAPS } from '../src/config/maps';
import { toMapFile } from '../src/mods/mapFile';

const pictures = process.argv[2] ? resolve(process.argv[2]) : undefined;
if (pictures) mkdirSync(pictures, { recursive: true });

const file = structuredClone(MAPS['aerial-fields']!);
file.id = 'my-fields';
file.name = 'My fields';

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
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await context.addInitScript('globalThis.__name = (fn) => fn');
  await context.addInitScript(`if (!localStorage.getItem('seeded')) { localStorage.setItem('seeded', '1'); localStorage.setItem('broadcast-empire:dev-mods', ${JSON.stringify(JSON.stringify({ maps: { [file.id]: toMapFile(file) } }))}); localStorage.setItem('broadcast-empire:settings', JSON.stringify({ reduceMotion: true })); }`);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => void dialog.accept());
  await page.goto(url);

  // The form offers the map.
  await page.getByRole('button', { name: 'New game' }).click({ timeout: 60_000 });
  await page.getByLabel('Your name').fill('Robin');
  await page.getByRole('button', { name: /^Next: your headquarters/ }).click();
  const town = page.getByLabel('Town');
  await town.waitFor({ timeout: 30_000 });
  check((await town.locator('option').allTextContents()).some((t) => t === 'My fields'), 'the form offers the map');
  await town.selectOption('my-fields');
  await page.waitForTimeout(5000);
  await page.getByLabel('Company name').fill('Fields FM');
  await page.getByRole('button', { name: 'Start in 1970' }).click();

  const read = () =>
    page.evaluate(async () => {
      const load = (p: string): Promise<any> => import(/* @vite-ignore */ p); // a variable path: the type check cannot follow it
      const { useGameStore } = await load('/src/ui/store.ts');
      const { buildingOf } = await load('/src/sim/office.ts');
      const { siteOfGame } = await load('/src/office/sites.ts');
      const g = useGameStore.getState().game;
      return g ? { building: g.building, id: buildingOf(g).id, map: g.customMap?.id ?? null, site: siteOfGame(g).map, hq: g.headquarters } : null;
    });
  await page.waitForTimeout(8000);
  const started = await read();
  check(started?.building === 'map' && started.map === 'my-fields' && started.id === 'map', `the game starts on the map (${JSON.stringify(started)})`);
  check(started?.site === 'played-map', 'the town is the map’s');
  if (pictures) await page.screenshot({ path: resolve(pictures, 'played-map.png') });

  // Saved, and loaded again in a page of its own, with the folder map gone.
  const wrote = await page.evaluate(async () => {
    const load = (p: string): Promise<any> => import(/* @vite-ignore */ p);
    const { useGameStore } = await load('/src/ui/store.ts');
    const { slotId } = await load('/src/persistence/storage.ts');
    return useGameStore.getState().saveAs('Fields', slotId(1));
  });
  check(wrote, 'the game is saved');
  await page.evaluate(() => {
    const kept = JSON.parse(localStorage.getItem('broadcast-empire:dev-mods') ?? '{}');
    localStorage.setItem('broadcast-empire:dev-mods', JSON.stringify({ ...kept, maps: {} }));
  });
  await page.reload();
  await page.getByRole('button', { name: /^Continue/ }).click({ timeout: 60_000 });
  await page.waitForTimeout(8000);
  const loaded = await read();
  check(loaded?.building === 'map' && loaded.map === 'my-fields' && loaded.id === 'map', `the saved game loads on its own copy of the map (${JSON.stringify(loaded)})`);
  if (pictures) await page.screenshot({ path: resolve(pictures, 'played-map-loaded.png') });

  check(errors.length === 0, `no errors on the page${errors.length > 0 ? `: ${errors.join(' | ')}` : ''}`);
} finally {
  await browser.close();
  await server.close();
}
if (failed > 0) process.exit(1);
