// A new game, as a player sees it after sending Penny away: the example for scripts/screenshot.ts.
// npm run screenshot -- scripts/shots/new-game.ts   (into dist/shots/, which git leaves out)

import type { RegionId } from '../../src/config/world';
import { HIDE_OVERLAYS, type Shot } from './shot';

/** Starts a company in a region, says no to Penny and sets the light theme. */
const start = (region: RegionId): Shot['prepare'] => async (_page, game) => {
  await game((be, headquarters) => {
    be.game.getState().updateSettings({ theme: 'light' });
    be.game.getState().newGame({ playerName: 'Ada Lovelace', companyName: 'Lovelace Broadcasting', headquarters });
    be.game.getState().change((state) => ({ ...state, guide: { ...state.guide, stage: 'off' } }));
  }, region);
};

const shots: Shot[] = [
  { name: 'office', file: 'dist/shots/new-game.png', prepare: start('capital') },
  { name: 'office-3d', file: 'dist/shots/new-game-3d.webp', selector: '.office3d canvas', css: HIDE_OVERLAYS, size: { width: 960, height: 540 }, prepare: start('capital') },
];

export default shots;
