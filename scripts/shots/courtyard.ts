// The U-shaped office of Coax City (0.20.0, #193): the whole floor, and the floor at 390 px wide.
// npm run screenshot -- scripts/shots/courtyard.ts

import { HIDE_OVERLAYS, type Shot } from './shot';

/** Starts a company in the capital with some rooms built where the game proposes them. */
const start: Shot['prepare'] = async (_page, game) => {
  await game((be) => {
    be.game.getState().updateSettings({ theme: 'light' });
    be.game.getState().newGame({ playerName: 'Ada Lovelace', companyName: 'Lovelace Broadcasting', headquarters: 'capital' });
    be.game.getState().change((state) => ({ ...state, money: 5_000_000, floorsUnlocked: 6, guide: { ...state.guide, stage: 'off' } }));
  });
};

const shots: Shot[] = [
  { name: 'floor', file: 'dist/shots/courtyard-floor.png', viewport: { width: 1600, height: 900 }, selector: '.office3d canvas', css: HIDE_OVERLAYS, settle: 5000, prepare: start },
  { name: 'phone', file: 'dist/shots/courtyard-phone.png', viewport: { width: 390, height: 844 }, settle: 5000, prepare: start },
];

export default shots;
