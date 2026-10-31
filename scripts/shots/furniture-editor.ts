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
    localStorage.setItem('broadcast-empire:settings', JSON.stringify({ furnitureEditor: true, theme: 'light' }));
  });
  await page.reload();
  await page.getByRole('button', { name: /Furniture editor/ }).click();
  await page.getByRole('button', { name: /^Workstation/ }).click();
};

const shots: Shot[] = [
  { name: 'editor', file: 'dist/shots/furniture-editor.png', prepare: open, settle: 4000 },
  { name: 'editor-narrow', file: 'dist/shots/furniture-editor-narrow.png', viewport: { width: 1024, height: 700 }, prepare: open, settle: 4000 },
];

export default shots;
