// The furniture editor (0.21.0), with a pretend desktop app and an empty mods folder, on a copy of the game's workstation.
// npm run screenshot -- scripts/shots/furniture-editor.ts   (into dist/shots/, which git leaves out)

import type { Page } from 'playwright-core';
import type { Shot } from './shot';

/** Gives the page a desktop bridge with a mods folder in memory and the editor switched on, then opens the editor on a piece. */
const open: Shot['prepare'] = async (page: Page) => {
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
  await page.getByRole('button', { name: /^Workstation/ }).click();
};

/** Opens the piece in a colour scheme and picks its second part, which is lit in the picture. */
const picked = (theme: 'light' | 'dark'): Shot['prepare'] => async (page, game) => {
  await open(page, game);
  await game((be, t) => be.game.getState().updateSettings({ theme: t }), theme);
  await page.getByRole('group', { name: /^Part 2 ·/ }).first().getByLabel('x', { exact: true }).focus();
};

/** Scrolls the form away from the top, clicks the middle of the picture, and waits for a row to light: a click that picks nothing fails the shot. */
const clicked = (then?: (page: Page) => Promise<void>): Shot['prepare'] => async (page, game) => {
  await open(page, game);
  await page.locator('.fe-form').evaluate((el) => void (el.scrollTop = el.scrollHeight));
  await page.waitForTimeout(3000);
  await page.locator('.catalog-picture canvas').click();
  await page.locator('.fe-part.active').first().waitFor({ timeout: 5000 });
  await page.waitForTimeout(300);
  await then?.(page);
};

const shots: Shot[] = [
  { name: 'editor-click', file: 'dist/shots/furniture-editor-click.png', prepare: clicked(), settle: 2000 },
  { name: 'editor-click-narrow', file: 'dist/shots/furniture-editor-click-narrow.png', viewport: { width: 1024, height: 700 }, prepare: clicked(), settle: 2000 },
  { name: 'editor-click-still', file: 'dist/shots/furniture-editor-click-still.png', prepare: async (page, game) => {
    await game((be) => be.game.getState().updateSettings({ reduceMotion: true }));
    await clicked()!(page, game);
  }, settle: 2000 },
  {
    // After the click, a change to x must not turn the light off.
    name: 'editor-click-edit',
    file: 'dist/shots/furniture-editor-click-edit.png',
    settle: 2000,
    prepare: clicked(async (page) => {
      const row = page.locator('.fe-part.active').first();
      await row.getByLabel('x', { exact: true }).fill('0.8');
      await row.getByLabel('x', { exact: true }).blur();
      await page.locator('.fe-part.active').first().waitFor({ timeout: 2000 });
    }),
  },
  { name: 'editor', file: 'dist/shots/furniture-editor.png', prepare: open, settle: 4000 },
  {
    name: 'editor-people',
    file: 'dist/shots/furniture-editor-people.png',
    settle: 4000,
    prepare: async (page, game) => {
      await open(page, game);
      await page.getByLabel('Show a person at each place').check();
      await page.getByRole('button', { name: 'Turn left' }).click();
      await page.getByRole('button', { name: 'Zoom in' }).click();
    },
  },
  { name: 'editor-narrow', file: 'dist/shots/furniture-editor-narrow.png', viewport: { width: 1024, height: 700 }, prepare: open, settle: 4000 },
  { name: 'editor-part', file: 'dist/shots/furniture-editor-part.png', prepare: picked('light'), settle: 4000 },
  { name: 'editor-part-dark', file: 'dist/shots/furniture-editor-part-dark.png', prepare: picked('dark'), settle: 4000 },
  { name: 'editor-part-narrow', file: 'dist/shots/furniture-editor-part-narrow.png', viewport: { width: 1024, height: 700 }, prepare: picked('light'), settle: 4000 },
  { name: 'editor-part-narrow-dark', file: 'dist/shots/furniture-editor-part-narrow-dark.png', viewport: { width: 1024, height: 700 }, prepare: picked('dark'), settle: 4000 },
  {
    // The dial phone's body (Part 8.1) set from tier 2: at tier 1 it is gone from the picture, and the line under the picture says so.
    name: 'editor-part-tier',
    file: 'dist/shots/furniture-editor-part-tier.png',
    settle: 4000,
    prepare: async (page, game) => {
      await open(page, game);
      const row = page.getByRole('group', { name: /^Part 8\.1 ·/ }).first();
      await row.getByLabel('Only at some tiers').check();
      await row.getByLabel('From tier').fill('2');
      await row.getByLabel('From tier').blur();
      await page.getByRole('button', { name: 'Tier 1' }).click();
      await row.getByLabel('x', { exact: true }).focus();
    },
  },
];

export default shots;
