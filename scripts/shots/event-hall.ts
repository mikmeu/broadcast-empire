// The event hall (0.22.0, #404): the hall with its stage, seating and control room on the evening of an event, and the Marketing window with its pickers.
// npm run screenshot -- scripts/shots/event-hall.ts             all of them
// npm run screenshot -- scripts/shots/event-hall.ts event-hall  only one
//
// A company in 1995 with a host, a technician, an event hall built and fitted out the way the game does it, and a concert staged
// in it on the 25th, which is about seven in the evening on the office clock: the seats are full and the host is on the stage. The game stays paused.
// The pictures go into dist/shots/, which git leaves out.

import type { Page } from 'playwright-core';
import { HIDE_OVERLAYS, type InPage, type Shot } from './shot';

async function scene(game: InPage, staged: boolean): Promise<void> {
  await game(async (be, staged) => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const rooms = await load('/src/sim/rooms.ts');
    const office = await load('/src/sim/commands/office.ts');
    const fixtures = await load('/src/sim/fixtures.ts');
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
      let s: any = { ...state, day: calendar.toDay(1995, 3, 25), money: 5_000_000, floorsUnlocked: 2, unlocked: [...state.unlocked, 'events', 'marketing'], level: 8 };
      const plan = rooms.proposeRoom(s, 1, 'eventHall');
      const built = must(office.buildRoom(s, { ...plan, type: 'eventHall' }));
      s = must(fixtures.addMissingEquipment(built.state, built.id)).state;
      s = must(fixtures.autoPlaceFurniture(s, built.id, 'audienceSeating')).state;
      const technician = { ...structuredClone(s.employees[0]), id: 'tech-1', name: 'Tess Nician', role: 'technician', location: null };
      const host = { ...structuredClone(s.employees[0]), id: 'host-1', name: 'Hugo Hostmann', role: 'host', fame: 40 };
      s.employees = [...s.employees, technician, host];
      if (staged) {
        // A bare channel is enough: the evening reads only its last event.
        s.channels = [{ id: 'tv1', name: 'Lovelace TV', logo: { shape: 'circle', color: '#000', initials: 'LT' }, medium: 'tv', managerId: null, schedule: [], reputation: {}, lastEvent: { day: s.day, kind: 'concert', venue: built.id, hostId: host.id }, social: null, adMinutes: 5 }];
      }
      return s;
    });
    be.office.getState().setFloor(1);
  }, staged);
}

const hall = (zoom: number): Shot['prepare'] => async (page: Page, game: InPage) => {
  await scene(game, true);
  const canvas = page.locator('.office3d canvas').first();
  await canvas.waitFor();
  for (let i = 0; i < zoom; i++) {
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(60);
  }
};

const shots: Shot[] = [
  { name: 'event-hall', file: 'dist/shots/event-hall.png', viewport: { width: 1600, height: 900 }, selector: '.office3d canvas', css: HIDE_OVERLAYS, settle: 5000, prepare: hall(4) },
  {
    name: 'event-marketing',
    file: 'dist/shots/event-marketing.png',
    viewport: { width: 1280, height: 900 },
    settle: 3000,
    prepare: async (page, game) => {
      await scene(game, false);
      await page.getByRole('button', { name: /^Marketing/ }).first().click();
    },
  },
];

export default shots;
