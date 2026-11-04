// The Kenney models added to the furniture editor (0.21.0), the pieces that show food and a light only while someone is at a place,
// and the stairs. A pretend desktop app with an empty mods folder, as in furniture-editor.ts.
// npm run screenshot -- scripts/shots/kenney-models.ts   (into dist/shots/, which git leaves out)

import type { Page } from 'playwright-core';
import type { Shot } from './shot';

/** Gives the page a desktop bridge with a mods folder in memory and the editor switched on, then opens the editor. */
async function openEditor(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const none = async () => [];
    (window as unknown as { desktop: unknown }).desktop = {
      platform: 'linux',
      version: '0.0.0',
      saves: { folder: async () => '', showFolder: async () => {}, list: none, read: async () => null, write: async () => {}, remove: async () => {} },
      mods: { folder: async () => '', showFolder: async () => {}, list: none, read: async () => null, write: async () => {}, remove: async () => {}, importFile: async () => null, exportFile: async () => false },
      onClosing: () => {},
      close: () => {},
    };
    localStorage.setItem('broadcast-empire:settings', JSON.stringify({ theme: 'light' }));
  });
  await page.reload();
  await page.getByRole('button', { name: /Furniture editor/ }).click();
}

/** A built-in piece with the people shown at its places, so the parts that wait for them are there. */
const withPeople = (piece: RegExp, tier: number, zoom = 1): Shot['prepare'] => async (page) => {
  await openEditor(page);
  await page.getByRole('button', { name: piece }).click();
  await page.getByRole('button', { name: `Tier ${tier}` }).click();
  await page.getByLabel('Show a person at each place').check();
  for (let i = 0; i < zoom; i++) await page.getByRole('button', { name: 'Zoom in' }).click();
};

/** A new piece, wide and deep, with the models in a row each, to see how big they are next to each other. */
const lineup = (models: readonly string[], perRow: number): Shot['prepare'] => async (page) => {
  await openEditor(page);
  await page.getByRole('button', { name: 'New piece' }).click();
  await page.getByLabel('Width (tiles)').fill(String(perRow));
  await page.getByLabel('Width (tiles)').blur();
  await page.getByLabel('Depth (tiles)').fill(String(Math.ceil(models.length / perRow) * 2));
  await page.getByLabel('Depth (tiles)').blur();
  await page.getByRole('button', { name: 'Remove', exact: true }).first().click();
  for (const [i, model] of models.entries()) {
    await page.getByRole('button', { name: 'Add a model from the kit' }).click();
    const row = page.locator('.fe-part').nth(i);
    await row.locator('select').nth(1).selectOption(model);
    await row.getByLabel('x', { exact: true }).fill(String(0.5 + (i % perRow)));
    await row.getByLabel('x', { exact: true }).blur();
    await row.getByLabel('z', { exact: true }).fill(String(0.6 + Math.floor(i / perRow) * 2));
    await row.getByLabel('z', { exact: true }).blur();
  }
};

/** A company in the capital with its first floor in view: the stairs in the block at the head of the floor are the kit's. */
const stairs: Shot['prepare'] = async (page, game) => {
  await game((be) => {
    be.game.getState().updateSettings({ theme: 'light' });
    be.game.getState().newGame({ playerName: 'Ada Lovelace', companyName: 'Lovelace Broadcasting', headquarters: 'capital' });
    be.game.getState().change((state) => ({ ...state, guide: { ...state.guide, stage: 'off' } }));
  });
  // Zoom in on the block at the head of the floor, where the stairs are.
  await page.waitForTimeout(3000);
  await page.mouse.move(650, 225);
  await page.mouse.down();
  await page.mouse.move(725, 340, { steps: 8 });
  await page.mouse.move(800, 450, { steps: 8 });
  await page.mouse.up();
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -300);
};

const shots: Shot[] = [
  { name: 'stairs', file: 'dist/shots/kenney-stairs.png', viewport: { width: 1600, height: 900 }, selector: '.office3d canvas', css: '#root * { visibility: hidden !important; } #root .office3d canvas { visibility: visible !important; }', settle: 5000, prepare: stairs },
  { name: 'canteen-table', file: 'dist/shots/kenney-canteen-table.png', prepare: withPeople(/^Canteen table/, 1, 2), settle: 5000 },
  { name: 'workstation-3', file: 'dist/shots/kenney-workstation-3.png', prepare: withPeople(/^Workstation/, 3, 3), settle: 5000 },
  { name: 'workstation-empty', file: 'dist/shots/kenney-workstation-empty.png', prepare: async (page) => {
    await openEditor(page);
    await page.getByRole('button', { name: /^Workstation/ }).click();
    await page.getByRole('button', { name: 'Tier 3' }).click();
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Zoom in' }).click();
  }, settle: 5000 },
  { name: 'shop', file: 'dist/shots/kenney-shop.png', prepare: lineup(['displaySmall', 'handTruck', 'shelfBags', 'shoppingBasket', 'cashRegister', 'clothingRack', 'clothingTable', 'displayCans', 'displayFlowers'], 5), settle: 6000 },
  { name: 'food', file: 'dist/shots/kenney-food.png', prepare: lineup(['bottleKetchup', 'bottleMusterd', 'burger', 'bowlSoup', 'cupCoffee', 'cuttingBoard', 'fryingPan', 'egg', 'plateDinner', 'pizza', 'salad', 'shakerPepper', 'shakerSalt', 'sodaBottle'], 5), settle: 6000 },
  { name: 'kitchen', file: 'dist/shots/kenney-kitchen.png', prepare: lineup(['kitchenStove', 'trashcan', 'speakerSmall', 'kitchenCabinet', 'kitchenSink', 'dryer', 'hoodLarge', 'stairs'], 4), settle: 6000 },
];

export default shots;
