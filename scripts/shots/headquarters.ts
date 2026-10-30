// The website's picture of the new-game screen, with the live view of the town (website/media/headquarters.png).
// npm run screenshot -- scripts/shots/headquarters.ts
//
// The home screen, "New game", the name of the player, then the second step with Coaxia and the easy difficulty.

import type { Shot } from './shot';

const shots: Shot[] = [
  {
    name: 'headquarters',
    file: 'website/media/headquarters.png',
    viewport: { width: 1600, height: 900 },
    settle: 6000,
    prepare: async (page) => {
      await page.getByRole('button', { name: /New game/ }).first().click();
      await page.getByLabel('Your name').fill('Ada Lovelace');
      await page.getByRole('button', { name: /Next: your headquarters/ }).click();
      await page.getByLabel('Company name').fill('Coax Broadcasting');
      await page.getByRole('radio', { name: 'Easy' }).click();
    },
  },
];

export default shots;
