// The company's parking lot beside the office (0.20.0, #45), with 1, 3 and all 6 floors open: it grows with the building.
// npm run screenshot -- scripts/shots/parking.ts

import { HIDE_OVERLAYS, type Shot } from './shot';

const start = (floors: number, zoom: number): Shot['prepare'] => async (page, game) => {
  await game((be, n) => {
    be.game.getState().updateSettings({ theme: 'light' });
    be.game.getState().newGame({ playerName: 'Ada Lovelace', companyName: 'Lovelace Broadcasting', headquarters: 'capital' });
    be.game.getState().change((state) => ({ ...state, floorsUnlocked: n, guide: { ...state.guide, stage: 'off' } }));
  }, floors);
  const canvas = page.locator('.office3d canvas').first();
  await canvas.waitFor();
  const box = (await canvas.boundingBox())!;
  // Zoom in on the lot, then drag the view over to it.
  await page.mouse.move(box.x + box.width * 0.77, box.y + box.height * 0.72);
  for (let i = 0; i < zoom; i++) {
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(60);
  }
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(60);
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.45, { steps: 10 });
  await page.mouse.up();
};

const shot = (name: string, floors: number, zoom = 6): Shot => ({
  name,
  file: `dist/shots/${name}.png`,
  viewport: { width: 2000, height: 1300 },
  selector: '.office3d canvas',
  css: HIDE_OVERLAYS,
  settle: 6000,
  prepare: start(floors, zoom),
});

export default [shot('lot-1', 1), shot('lot-3', 3), shot('lot-6', 6)];
