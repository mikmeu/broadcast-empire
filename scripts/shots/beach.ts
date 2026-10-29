// Skywave Beach's building (0.20.0, #224): the ground floor with the core facing north between two wings, and the floor at 390 px wide.
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

const shots: Shot[] = [
  { name: 'floor', file: 'dist/shots/beach-floor.png', viewport: { width: 1600, height: 900 }, selector: '.office3d canvas', css: HIDE_OVERLAYS, settle: 5000, prepare: start },
  { name: 'phone', file: 'dist/shots/beach-phone.png', viewport: { width: 390, height: 844 }, settle: 5000, prepare: start },
];

export default shots;
