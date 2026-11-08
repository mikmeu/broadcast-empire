// The six pieces of #376 (0.21.0) in the furniture editor's picture, with a person at each place.
// npm run screenshot -- scripts/shots/updated-furniture-2.ts   (into dist/shots/, which git leaves out)

import type { Shot } from './shot';

const piece = (name: string, label: RegExp): Shot => ({
  name,
  file: `dist/shots/updated-furniture-2-${name}.png`,
  settle: 4000,
  prepare: async (page) => {
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
    });
    await page.reload();
    await page.getByRole('button', { name: /Furniture editor/ }).click();
    await page.getByRole('button', { name: label }).first().click();
    const people = page.getByLabel('Show a person at each place');
    if (await people.count()) await people.check();
  },
});

const shots: Shot[] = [
  piece('stove', /^Stove/),
  piece('canteen-table', /^Canteen table/),
  piece('clothes-rail', /^Clothes rail/),
  piece('counter', /^Counter/),
  piece('dishwasher', /^Dishwasher/),
  piece('bin', /^Bin/),
];

export default shots;
