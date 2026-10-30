// Takes screenshots of the game in a real browser: for the wiki, the website, or a result to review.
//
// Usage: npm run screenshot -- scripts/shots/new-game.ts           every shot in that file
//        npm run screenshot -- scripts/shots/new-game.ts coaxia    only the shots of those names
//
// A file of shots exports a list of them as its default (see Shot in scripts/shots/shot.ts;
// scripts/shots/new-game.ts is one). For each shot the script opens the game afresh in a browser without a window, with nothing
// saved, runs the shot's prepare, waits for the scene to settle and saves the picture. prepare gets
// the page (playwright-core) and `game`, which runs a function in the page with the game's stores:
//
//   await game((be, region) => be.game.getState().newGame({ playerName: 'Ada', companyName: 'Ada Radio', headquarters: region }), 'capital');
//
// The function is sent to the page as text: it can use its arguments and the page's globals, not
// what is around it in the shot's file. The stores are put on the page by src/main.tsx, in the dev
// server only.
//
// The browser: SCREENSHOT_BROWSER (the path to Chrome, Edge or Chromium), else Microsoft Edge on a Mac,
// else the Chromium of playwright-core, which `npx playwright-core install chromium` downloads once.
// The 3D view is drawn without a graphics card (SwiftShader), so it works on a server too.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer } from 'vite';
import type { InPage, Shot, Stores } from './shots/shot';

const [file, ...names] = process.argv.slice(2);
if (!file) {
  console.error('Usage: npm run screenshot -- <file of shots> [names of shots]');
  process.exit(1);
}
const all = ((await import(pathToFileURL(resolve(file)).href)) as { default: Shot[] }).default;
const shots = names.length ? all.filter((shot) => names.includes(shot.name)) : all;
if (!shots.length) {
  console.error(`No shots${names.length ? ` named ${names.join(', ')}` : ''} in ${file}.`);
  process.exit(1);
}

const EDGE = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const executablePath = process.env.SCREENSHOT_BROWSER || (process.platform === 'darwin' && existsSync(EDGE) ? EDGE : undefined);
const TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

const server = await createServer({ logLevel: 'warn', server: { port: 5190, open: false } });
await server.listen();
const url = server.resolvedUrls?.local[0] ?? 'http://localhost:5190/';
let browser: Browser | undefined;
let failed = 0;
try {
  browser = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const shot of shots) {
    try {
      await take(browser, shot);
      console.log(`${shot.name}: ${shot.file}`);
    } catch (error) {
      failed++;
      console.error(`${shot.name}: ${error instanceof Error ? error.message : error}`);
    }
  }
} finally {
  await browser?.close();
  await server.close();
}
process.exit(failed ? 1 : 0);

async function take(browser: Browser, shot: Shot): Promise<void> {
  const type = TYPES[extname(shot.file).toLowerCase()];
  if (!type) throw new Error(`${shot.file} is not a .png, .jpg or .webp`);
  // A context of its own: nothing saved from the shot before.
  const context = await browser.newContext({ viewport: shot.viewport ?? { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  // tsx names the functions it compiles with a helper the page doesn't have.
  await context.addInitScript('globalThis.__name = (fn) => fn');
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
      if (response.status() === 403) errors.push(`the dev server refused ${response.url()}`);
    });
    await page.goto(url);
    await page.waitForFunction(() => (window as unknown as { broadcastEmpire?: Stores }).broadcastEmpire?.game.getState().ready, null, { timeout: 60_000 });
    const game: InPage = (fn, arg) => page.evaluate(`(${fn.toString()})(window.broadcastEmpire, ${JSON.stringify(arg ?? null)})`);
    await shot.prepare?.(page, game);
    await page.waitForTimeout(shot.settle ?? 2000);
    // A picture in fallback fonts is never saved.
    const fonts = await page.evaluate(async () => {
      await document.fonts.ready;
      return ['Fjalla One', 'Assistant'].every((family) => document.fonts.check(`16px "${family}"`));
    });
    if (!fonts) throw new Error("the game's fonts did not load");
    if (errors.length) throw new Error(`the page failed: ${errors.join('; ')}`);
    const png = shot.selector ? await page.locator(shot.selector).first().screenshot({ style: shot.css }) : await page.screenshot({ style: shot.css });
    const picture = type === 'image/png' && !shot.size ? png : await encode(page, png, type, shot);
    mkdirSync(dirname(resolve(shot.file)), { recursive: true });
    writeFileSync(resolve(shot.file), picture);
  } finally {
    await context.close();
  }
}

/** Scales the capture to the shot's size and writes it as its type, with the browser's own encoder. */
async function encode(page: Page, png: Buffer, type: string, shot: Shot): Promise<Buffer> {
  const blank = await page.context().newPage();
  try {
    const base64 = await blank.evaluate(
      async ({ png, type, size, quality }) => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
        const { width, height } = size ?? { width: bitmap.width, height: bitmap.height };
        const scale = Math.max(width / bitmap.width, height / bitmap.height);
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext('2d')!;
        context.imageSmoothingQuality = 'high';
        context.drawImage(bitmap, (width - bitmap.width * scale) / 2, (height - bitmap.height * scale) / 2, bitmap.width * scale, bitmap.height * scale);
        const blob = await canvas.convertToBlob({ type, quality });
        if (blob.type !== type) throw new Error(`this browser can't write ${type}`);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let text = '';
        for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(text);
      },
      { png: png.toString('base64'), type, size: shot.size, quality: shot.quality ?? 0.85 },
    );
    return Buffer.from(base64, 'base64');
  } finally {
    await blank.close();
  }
}
