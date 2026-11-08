// Measures the frame rate of the town in a real browser, with the traffic moving: frame time, draw calls and triangles per frame.
// Usage: npx tsx scripts/frameRate.ts [seconds]
//
// A new company in Coaxia with all floors open, drawn with motion on, from the first morning on.
// The browser draws without a graphics card (SwiftShader), so the numbers compare one build with another on the same machine; they do not predict a laptop.
// Run it before and after a change to the drawing, and compare.

import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const seconds = Number(process.argv[2] ?? 60);
const EDGE = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const executablePath = process.env.SCREENSHOT_BROWSER || (process.platform === 'darwin' && existsSync(EDGE) ? EDGE : undefined);

const server = await createServer({ logLevel: 'warn', server: { port: 5191, open: false } });
await server.listen();
const url = server.resolvedUrls?.local[0] ?? 'http://localhost:5191/';
const browser = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript('globalThis.__name = (fn) => fn');
  // Count what is drawn: every draw call of both kinds of WebGL context, and the triangles in them.
  await context.addInitScript(`
    window.__draw = { calls: 0, triangles: 0 };
    for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      const wrap = (name, triangles) => {
        const original = proto[name];
        if (!original) return;
        proto[name] = function (...args) { window.__draw.calls++; window.__draw.triangles += triangles(args); return original.apply(this, args); };
      };
      wrap('drawElements', (a) => a[1] / 3);
      wrap('drawArrays', (a) => a[2] / 3);
      wrap('drawElementsInstanced', (a) => (a[1] / 3) * a[4]);
      wrap('drawArraysInstanced', (a) => (a[2] / 3) * a[3]);
    }
  `);
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForFunction(() => (window as unknown as { broadcastEmpire?: { game: { getState(): { ready: boolean } } } }).broadcastEmpire?.game.getState().ready, null, { timeout: 60_000 });
  await page.evaluate(
    `((be) => {
      be.game.getState().newGame({ playerName: 'Ada Lovelace', companyName: 'Lovelace Broadcasting', headquarters: 'capital' });
      be.game.getState().change((s) => ({ ...s, floorsUnlocked: 6, guide: { ...s.guide, stage: 'off' } }));
    })(window.broadcastEmpire)`,
  );
  await page.waitForTimeout(8000);
  const result = await page.evaluate(
    (ms) =>
      new Promise<{ frames: number; mean: number; worst: number; calls: number; triangles: number }>((done) => {
        const w = window as unknown as { __draw: { calls: number; triangles: number } };
        w.__draw.calls = 0;
        w.__draw.triangles = 0;
        const times: number[] = [];
        let last = performance.now();
        const start = last;
        const tick = (now: number) => {
          times.push(now - last);
          last = now;
          if (now - start < ms) requestAnimationFrame(tick);
          else {
            const frames = times.length;
            done({ frames, mean: times.reduce((a, b) => a + b, 0) / frames, worst: Math.max(...times), calls: w.__draw.calls / frames, triangles: w.__draw.triangles / frames });
          }
        };
        requestAnimationFrame(tick);
      }),
    seconds * 1000,
  );
  console.log(`${seconds} s in Coaxia: ${result.frames} frames, ${result.mean.toFixed(1)} ms a frame (worst ${result.worst.toFixed(0)}), ${result.calls.toFixed(0)} draw calls and ${Math.round(result.triangles)} triangles a frame`);
} finally {
  await browser.close();
  await server.close();
}
