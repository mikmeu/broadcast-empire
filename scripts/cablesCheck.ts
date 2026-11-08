// Checks in a real browser that Cables is a window of the menu (0.21.0, #295): it opens from the dock, closes
// by its button and by Escape, and folded at 760px wide it is only its title bar.
//
// Usage: npx tsx scripts/cablesCheck.ts   (SCREENSHOT_BROWSER names a browser, as for npm run screenshot)

import { chromium } from 'playwright-core';
import { createServer } from 'vite';

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
  for (const width of [1280, 760]) {
    const context = await browser.newContext({ viewport: { width, height: 800 }, reducedMotion: 'reduce' });
    await context.addInitScript('globalThis.__name = (fn) => fn');
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(() => (window as unknown as { broadcastEmpire?: { game: { getState(): { ready: boolean } } } }).broadcastEmpire?.game.getState().ready, null, { timeout: 60_000 });
    await page.evaluate(`(() => { const be = window.broadcastEmpire; be.game.getState().newGame({ playerName: 'Ada', companyName: 'Ada Radio', headquarters: 'capital' }); be.game.getState().change((state) => ({ ...state, guide: { ...state.guide, stage: 'off' } })); })()`);
    await page.waitForTimeout(1500);
    const dock = page.locator('[data-guide="dock-cables"]');
    check((await dock.count()) === 1, `${width}px: Cables is in the menu`);
    await dock.click({ force: true });
    const win =page.locator('.window:has(> .window-bar h2:text-is("Cables"))');
    check((await win.count()) === 1, `${width}px: the window opens`);
    check((await win.locator('.cable-legend').count()) === 1, `${width}px: the list is in it`);
    check((await page.locator('.office-bar button', { hasText: 'Cables' }).count()) === 0, `${width}px: no Cables button in the floor bar`);
    if (width === 760) {
      await win.locator('button.window-button[aria-label="Minimize"]').click();
      const box = await win.boundingBox();
      check(!!box && box.height < 100, `${width}px: folded, the window is only its title bar (${box?.height}px)`);
      await win.locator('button.window-button[aria-label="Maximize"]').click();
    }
    await win.locator('.window-bar button[aria-label="Close"]').click();
    await page.waitForTimeout(300);
    check((await win.count()) === 0, `${width}px: the window closes`);
    await dock.click({ force: true });
    await win.locator('.cable-legend').click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check((await win.count()) === 0, `${width}px: Escape closes it`);
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
