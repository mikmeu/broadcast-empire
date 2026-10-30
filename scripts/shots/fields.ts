// Aerial Fields' building (0.20.0, #225): the ground floor of the U with the core facing south between the wings, and the floor at 390 px wide.
// npm run screenshot -- scripts/shots/fields.ts

import { HIDE_OVERLAYS, type Shot } from './shot';

/** Starts a company in Aerial Fields with every floor open. */
const start: Shot['prepare'] = async (_page, game) => {
  await game((be) => {
    be.game.getState().updateSettings({ theme: 'light' });
    be.game.getState().newGame({ playerName: 'Ada Lovelace', companyName: 'Lovelace Broadcasting', headquarters: 'heartland' });
    be.game.getState().change((state) => ({ ...state, money: 5_000_000, floorsUnlocked: 4, guide: { ...state.guide, stage: 'off' } }));
  });
};

const shots: Shot[] = [
  { name: 'floor', file: 'dist/shots/fields-floor.png', viewport: { width: 1600, height: 900 }, selector: '.office3d canvas', css: HIDE_OVERLAYS, settle: 5000, prepare: start },
  { name: 'phone', file: 'dist/shots/fields-phone.png', viewport: { width: 390, height: 844 }, settle: 5000, prepare: start },
];

export default shots;
