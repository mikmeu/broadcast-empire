// The gift shop (0.21.0, #362): the shop with its till, shelves and shoppers next to the storage room, and the Merchandise tab in Sales (#379).
// npm run screenshot -- scripts/shots/gift-shop.ts             all of them
// npm run screenshot -- scripts/shots/gift-shop.ts gift-shop   only one
//
// A company in 1995 (so the tapes are VHS) with a kids show whose fans are devoted, a shop and a storage room built the way the game builds them
// (the rooms are proposed and fitted out by the sim itself), a salesperson on the till and one on orders, stock in every line, and the clock at
// the tenth of the month, which is about noon on the office clock, and paused: shoppers only come between ten and five while someone is on the till.
// The pictures for the website and the wiki are committed; the others go into dist/shots/, which git leaves out.

import type { Page } from 'playwright-core';
import { HIDE_OVERLAYS, type InPage, type Shot } from './shot';

/** Builds the scene in the game; the sim is loaded through the dev server, so the rooms stand where the game would put them. */
async function scene(game: InPage): Promise<void> {
  await game(async (be) => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const rooms = await load('/src/sim/rooms.ts');
    const office = await load('/src/sim/commands/office.ts');
    const fixtures = await load('/src/sim/fixtures.ts');
    const merch = await load('/src/sim/commands/merch.ts');
    const calendar = await load('/src/sim/calendar.ts');
    const must = (r: { ok: boolean; state: unknown; id?: string; error?: string }) => {
      if (!r.ok) throw new Error(r.error ?? 'refused');
      return r;
    };

    be.game.getState().updateSettings({ theme: 'light' });
    be.game.getState().newGame({ playerName: 'Ada Lovelace', companyName: 'Lovelace Broadcasting', headquarters: 'capital' });
    be.game.getState().change((state) => ({ ...state, guide: { ...state.guide, stage: 'off' } }));

    be.game.getState().change((state) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let s: any = { ...state, day: calendar.toDay(1995, 3, 10), money: 5_000_000, floorsUnlocked: 2, unlocked: [...state.unlocked, 'sales', 'merchandise'] };
      const plan = rooms.proposeRoom(s, 1, 'giftShop');
      const built = must(office.buildRoom(s, { ...plan, type: 'giftShop' }));
      s = must(fixtures.addMissingEquipment(built.state, built.id)).state;
      for (const type of ['tapeShelf', 'clothingTable', 'clothingRack', 'shelfBags', 'displayFlowers']) {
        const placed = fixtures.autoPlaceFurniture(s, built.id, type);
        if (placed.ok) s = placed.state;
      }
      const beside = rooms.proposeBeside(s, built.id, 'storageRoom');
      const storage = must(office.buildRoom(s, { ...beside, type: 'storageRoom' }));
      s = must(fixtures.addMissingEquipment(storage.state, storage.id)).state;

      s.shows = [{ id: 'kids', name: 'Captain Cathode', genre: 'kids', hostId: null, staffIds: [], writerIds: [], editorIds: [], studioId: null, freshness: 1, tone: 'normal', fans: 0.9, hype: 0.9 }];
      const seller = (id: string, name: string, job: string) => ({ ...structuredClone(s.employees[0]), id, name, role: 'sales', salesJob: job, skill: 90, morale: 95 });
      s.employees = [...s.employees, seller('till-1', 'Rosa Marsh', 'till'), seller('orders-1', 'Ivan Pell', 'orders')];
      for (const line of ['tapes', 'clothes', 'gifts']) s = must(merch.buyBoxes(s, 'kids', line, 2)).state;
      s.lastDay = { day: s.day, channels: [], merchandise: 1_200, merchUnits: { kids: 400 } };
      return s;
    });
    be.office.getState().setFloor(1);
  });
}

/** Where the shop and the storage room show in the 3D view at first (at 1600×900): drag them to the middle, then zoom in round it. */
const SHOP_AT = { x: 1290, y: 70 };

/** Brings the shop to the middle of the 3D view and zooms in `clicks` turns of the wheel. */
async function wheel(page: Page, clicks: number): Promise<void> {
  const canvas = page.locator('.office3d canvas').first();
  await canvas.waitFor();
  await page.mouse.move(SHOP_AT.x, SHOP_AT.y);
  await page.mouse.down();
  await page.mouse.move(800, 450, { steps: 12 });
  await page.mouse.up();
  for (let i = 0; i < clicks; i++) {
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(60);
  }
}

/** The 3D view of the shop, `zoom` turns of the wheel in. The game stays paused: the clock of a day follows the day of the month, so the tenth is about noon. */
const shop = (zoom: number): Shot['prepare'] => async (page, game) => {
  await scene(game);
  await wheel(page, zoom);
};

/** The Sales window on the Merchandise tab. */
const sales = (page: Page, game: InPage) =>
  scene(game).then(async () => {
    await game(async () => {
      const tabs = await import(/* @vite-ignore */ ['/src/ui', 'salesTabs.ts'].join('/'));
      tabs.useSalesTab.getState().setTab('merchandise');
    });
    await page.getByRole('button', { name: /^Sales/ }).first().click();
  });

const shots: Shot[] = [
  { name: 'gift-shop', file: 'website/media/gift-shop.png', viewport: { width: 1600, height: 900 }, selector: '.office3d canvas', css: HIDE_OVERLAYS, settle: 5000, prepare: shop(5) },
  { name: 'gift-shop-wiki', file: 'public/wiki/gift-shop.webp', viewport: { width: 1600, height: 900 }, selector: '.office3d canvas', css: HIDE_OVERLAYS, size: { width: 960, height: 540 }, quality: 0.8, settle: 5000, prepare: shop(8) },
  { name: 'merchandise', file: 'website/media/merchandise.png', viewport: { width: 1280, height: 800 }, settle: 5000, prepare: sales },
  // To look at, not to keep: into dist/shots/.
  { name: 'storage-room', file: 'dist/shots/storage-room.png', viewport: { width: 1600, height: 900 }, selector: '.office3d canvas', css: HIDE_OVERLAYS, settle: 5000, prepare: shop(9) },
  { name: 'merchandise-narrow', file: 'dist/shots/merchandise-narrow.png', viewport: { width: 560, height: 800 }, settle: 5000, prepare: sales },
  {
    name: 'wiki-money',
    file: 'dist/shots/wiki-money.png',
    settle: 3000,
    prepare: async (page, game) => {
      await shop(8)!(page, game);
      await game((be) => be.wiki.getState().open('money'));
    },
  },
];

export default shots;
