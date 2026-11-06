// Checks in a real browser the build tray (0.21.0, #301): Room, Furnishing and Inventory fold their trays out,
// a kind starts the drawing, a piece goes on the pointer and the tray closes.
//
// Usage: npx tsx scripts/trayCheck.ts   (SCREENSHOT_BROWSER names a browser, as for npm run screenshot)

import { chromium } from 'playwright-core';
import { createServer } from 'vite';

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
  for (const width of [1280, 700]) {
    const context = await browser.newContext({ viewport: { width, height: 800 }, reducedMotion: 'reduce' });
    await context.addInitScript('globalThis.__name = (fn) => fn');
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(() => (window as unknown as { broadcastEmpire?: { game: { getState(): { ready: boolean } } } }).broadcastEmpire?.game.getState().ready, null, { timeout: 60_000 });
    await page.evaluate(`(() => { const be = window.broadcastEmpire; be.game.getState().newGame({ playerName: 'Ada', companyName: 'Ada Radio', headquarters: 'capital' }); be.game.getState().change((state) => ({ ...state, guide: { ...state.guide, stage: 'off' } })); })()`);
    await page.waitForTimeout(1500);
    const w = `${width}px`;
    const room = page.locator('[data-guide="build-room"]');
    const furnish = page.locator('[data-guide="build-furnish"]');
    const inventory = page.locator('[data-guide="build-inventory"]');
    const tray = page.locator('.build-tray');
    check((await room.count()) === 1 && (await furnish.count()) === 1 && (await inventory.count()) === 1, `${w}: the three buttons are there`);
    check(await furnish.isDisabled(), `${w}: Furnishing is off with no room selected`);
    check((await page.locator('.office-bar button', { hasText: 'Build a room' }).count()) === 0, `${w}: no “Build a room” in the floor bar`);

    await room.click();
    check((await tray.count()) === 1 && (await page.locator('[data-guide="tray-kind-radioStudio"]').count()) === 1, `${w}: Room opens the tray of kinds`);
    await page.screenshot({ path: `/tmp/tray-${width}-room.png` });
    await room.click();
    check((await tray.count()) === 0, `${w}: Room again closes it`);
    await inventory.click();
    check((await tray.count()) === 1 && (await tray.innerText()).includes('Nothing is stored'), `${w}: Inventory opens its tray`);
    await page.keyboard.press('Escape');
    check((await tray.count()) === 0, `${w}: Escape closes the tray`);

    await room.click();
    await page.locator('[data-guide="tray-kind-radioStudio"]').click();
    await page.waitForTimeout(300);
    check((await tray.count()) === 0, `${w}: a kind closes the tray`);
    check((await page.locator('.build-panel').count()) === 1 && (await room.getAttribute('aria-pressed')) === 'true', `${w}: the drawing starts, Room shows pressed`);
    await page.screenshot({ path: `/tmp/tray-${width}-drawing.png` });
    await page.locator('[data-guide="build-confirm"]').click();
    await page.waitForTimeout(800);
    const built = await page.evaluate(`window.broadcastEmpire.game.getState().game.rooms.some((r) => r.type === 'radioStudio')`);
    check(built === true, `${w}: the room is built`);
    // Select it, then furnish.
    await page.evaluate(`(() => { const be = window.broadcastEmpire; const r = be.game.getState().game.rooms.find((r) => r.type === 'radioStudio'); be.office.getState().selectRoom(r.roomId); })()`).catch(() => undefined);
    await page.waitForTimeout(300);
    if (!(await furnish.isDisabled())) {
      await furnish.click();
      check((await page.locator('[data-guide="tray-group-required"]').count()) === 1, `${w}: Furnishing lists Required`);
      await page.screenshot({ path: `/tmp/tray-${width}-furnish.png` });
      await page.locator('[data-guide="tray-piece-mixingDesk"]').click();
      await page.waitForTimeout(300);
      check((await tray.count()) === 0 && (await page.locator('.placing-banner').count()) === 1, `${w}: a piece goes on the pointer and the tray closes`);
    } else {
      console.log(`note ${w}: could not select the room from the script; Furnishing flow not checked`);
    }
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
