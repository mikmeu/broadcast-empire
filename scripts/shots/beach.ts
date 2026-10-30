// Skywave Beach's building (0.20.0, #224): the ground floor with the core facing north between two wings, and the floor at 390 px wide.
// And the lot's drive past the shore (#219): the street east of the lot runs on beyond the front street to a dead end beside the lot.
// npm run screenshot -- scripts/shots/beach.ts

import { HIDE_OVERLAYS, type Shot } from './shot';

/** Starts a company in Skywave Beach with every floor open. */
const start: Shot['prepare'] = async (_page, game) => {
  await game((be) => {
    be.game.getState().updateSettings({ theme: 'light' });
    be.game.getState().newGame({ playerName: 'Ada Lovelace', companyName: 'Lovelace Broadcasting', headquarters: 'coast' });
    be.game.getState().change((state) => ({ ...state, money: 5_000_000, floorsUnlocked: 6, guide: { ...state.guide, stage: 'off' } }));
  });
};

/** The same, zoomed in on the lot and the drive east of the building. */
const drive: Shot['prepare'] = async (page, game) => {
  await start(page, game);
  const canvas = page.locator('.office3d canvas').first();
  await canvas.waitFor();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.77, box.y + box.height * 0.72);
  for (let i = 0; i < 6; i++) {
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

const shots: Shot[] = [
  { name: 'floor', file: 'dist/shots/beach-floor.png', viewport: { width: 1600, height: 900 }, selector: '.office3d canvas', css: HIDE_OVERLAYS, settle: 5000, prepare: start },
  { name: 'phone', file: 'dist/shots/beach-phone.png', viewport: { width: 390, height: 844 }, settle: 5000, prepare: start },
  { name: 'drive', file: 'dist/shots/beach-drive.png', viewport: { width: 2000, height: 1300 }, selector: '.office3d canvas', css: HIDE_OVERLAYS, settle: 6000, prepare: drive },
];

export default shots;
