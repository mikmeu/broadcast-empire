// The helipad on every roof and the traffic helicopter parked on it (#395).
// npm run screenshot -- scripts/shots/helipad.ts

import type { RegionId } from '../../src/config/world';
import { HIDE_OVERLAYS, type Shot } from './shot';

/** Starts a company in `headquarters` with every floor open, with or without a helicopter, and looks at the roof. */
const roof = (headquarters: RegionId, helicopter: boolean): Shot['prepare'] => async (_page, game) => {
  await game((be, args) => {
    be.game.getState().updateSettings({ theme: 'light' });
    be.game.getState().newGame({ playerName: 'Ada Lovelace', companyName: 'Lovelace Broadcasting', headquarters: args.headquarters });
    be.game.getState().change((state) => ({
      ...state,
      money: 5_000_000,
      floorsUnlocked: 6,
      helicopter: args.helicopter ? { boughtOn: state.day, price: 250_000 } : null,
      guide: { ...state.guide, stage: 'off' },
    }));
    be.office.getState().setFloor(7);
  }, { headquarters, helicopter });
};

const view = { width: 1600, height: 900 };
const regions: [string, RegionId][] = [['capital', 'capital'], ['coast', 'coast'], ['heartland', 'heartland'], ['highlands', 'highlands'], ['north', 'north']];

const shots: Shot[] = [
  ...regions.map(([name, id]): Shot => ({ name: `${name}-pad`, file: `dist/shots/helipad-${name}.png`, viewport: view, selector: '.office3d canvas', css: HIDE_OVERLAYS, settle: 5000, prepare: roof(id, false) })),
  { name: 'capital-helicopter', file: 'dist/shots/helipad-capital-helicopter.png', viewport: view, selector: '.office3d canvas', css: HIDE_OVERLAYS, settle: 5000, prepare: roof('capital', true) },
];

export default shots;
