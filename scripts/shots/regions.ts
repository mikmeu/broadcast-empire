// The town around the office in each region, for the region's article in the wiki (#16).
// npm run screenshot -- scripts/shots/regions.ts            all five, into public/wiki/
// npm run screenshot -- scripts/shots/regions.ts coaxia     only one
//
// Penny sent away, the light theme, the morning; only the 3D view. Retake them when the
// scenery of a site changes, or when drawn landmarks come (#24).

import type { RegionId } from '../../src/config/world';
import { HIDE_OVERLAYS, type Shot } from './shot';

/** Starts a company in a region, says no to Penny, sets the light theme and zooms out to show the town. */
const start = (region: RegionId): Shot['prepare'] => async (page, game) => {
  await game((be, headquarters) => {
    be.game.getState().updateSettings({ theme: 'light' });
    be.game.getState().newGame({ playerName: 'Ada Lovelace', companyName: 'Lovelace Broadcasting', headquarters });
    be.game.getState().change((state) => ({ ...state, guide: { ...state.guide, stage: 'off' } }));
  }, region);
  const canvas = page.locator('.office3d canvas').first();
  await canvas.waitFor();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < ZOOM_OUT; i++) {
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(60);
  }
};

/** Turns of the wheel away from the office, so the town around it is in the picture. */
const ZOOM_OUT = 6;

const shot = (name: string, region: RegionId): Shot => ({
  name,
  file: `public/wiki/${name}.webp`,
  selector: '.office3d canvas',
  css: HIDE_OVERLAYS,
  size: { width: 960, height: 540 },
  quality: 0.8,
  settle: 6000,
  prepare: start(region),
});

const shots: Shot[] = [
  shot('coaxia', 'capital'),
  shot('amplify-hills', 'highlands'),
  shot('transponder-valley', 'north'),
  shot('skywave-beach', 'coast'),
  shot('aerial-fields', 'heartland'),
  // The website's picture of the town (website/media/town.png): Coaxia, as in the wiki but larger. Not part of the five for the wiki:
  // npm run screenshot -- scripts/shots/regions.ts town
  { ...shot('town', 'capital'), file: 'website/media/town.png', size: { width: 1600, height: 900 } },
  // To check the picture where the player sees it: not for the wiki itself, so into dist/shots/, which git leaves out.
  {
    name: 'article',
    file: 'dist/shots/wiki-coaxia.png',
    settle: 3000,
    prepare: async (page, game) => {
      await start('capital')!(page, game);
      await game((be) => be.wiki.getState().open('coaxia'));
    },
  },
];

export default shots;
