// The Media Times above the bottom bar, at 1280 and 700 px (#129).
// npm run screenshot -- scripts/shots/newspaper.ts   (into dist/shots/, which git leaves out)

import type { Shot } from './shot';

const paper: Shot['prepare'] = async (_page, game) => {
  await game((be) => {
    be.game.getState().updateSettings({ theme: 'light' });
    be.game.getState().newGame({ playerName: 'Ada Lovelace', companyName: 'Lovelace Broadcasting', headquarters: 'capital' });
    be.game.getState().change((state) => ({ ...state, guide: { ...state.guide, stage: 'off' } }));
    be.game.setState({ paper: { day: 40, headlines: [{ day: 40, text: 'Recession ahead: advertisers expect to pay less' }, { day: 40, text: 'Snap election called' }] } });
  });
};

const shots: Shot[] = [
  { name: 'paper-wide', file: 'dist/shots/newspaper-1280.png', viewport: { width: 1280, height: 800 }, prepare: paper },
  { name: 'paper-narrow', file: 'dist/shots/newspaper-700.png', viewport: { width: 700, height: 800 }, prepare: paper },
];

export default shots;
