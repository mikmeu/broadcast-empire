// The outside of the building in Kenney's Building Kit (#305): the back walls on the first floor, the floors below from a floor higher up, and the roof.
// npm run screenshot -- scripts/shots/building-kit.ts

import { HIDE_OVERLAYS, type Shot } from './shot';

/** Starts a company in `headquarters` with every floor open, and looks at `floor`. */
const at = (headquarters: string, floor: number): Shot['prepare'] => async (_page, game) => {
  await game((be, args) => {
    be.game.getState().updateSettings({ theme: 'light' });
    be.game.getState().newGame({ playerName: 'Ada Lovelace', companyName: 'Lovelace Broadcasting', headquarters: args.headquarters });
    be.game.getState().change((state) => ({ ...state, money: 5_000_000, floorsUnlocked: 6, guide: { ...state.guide, stage: 'off' } }));
    be.office.getState().setFloor(args.floor);
  }, { headquarters, floor });
};

const view = { width: 1600, height: 900 };

const shots: Shot[] = [
  { name: 'capital-floor-1', file: 'dist/shots/building-kit-capital-1.png', viewport: view, selector: '.office3d canvas', css: HIDE_OVERLAYS, settle: 5000, prepare: at('capital', 1) },
  { name: 'capital-floor-3', file: 'dist/shots/building-kit-capital-3.png', viewport: view, selector: '.office3d canvas', css: HIDE_OVERLAYS, settle: 5000, prepare: at('capital', 3) },
  { name: 'capital-roof', file: 'dist/shots/building-kit-capital-roof.png', viewport: view, selector: '.office3d canvas', css: HIDE_OVERLAYS, settle: 5000, prepare: at('capital', 7) },
  { name: 'hills-floor-2', file: 'dist/shots/building-kit-hills-2.png', viewport: view, selector: '.office3d canvas', css: HIDE_OVERLAYS, settle: 5000, prepare: at('highlands', 2) },
];

export default shots;
