// The awards night (#130): the nominees, the winner and the list of winners, on a wide and a narrow screen.
// npm run screenshot -- scripts/shots/award-show.ts   (into dist/shots/, which git leaves out)

import type { Page } from 'playwright-core';
import type { InPage, Shot } from './shot';

/** Starts a game on the night of 1975 with a night held (two nominees for each award) and the show on screen; `goOn` presses “Go on” that often. */
const night = (goOn: number, watch = true): Shot['prepare'] =>
  async function (page: Page, game: InPage) {
    // The show moves on by itself after a few seconds; here it waits for the button, so that the shot is the step asked for.
    await page.evaluate(() => {
      const wait = window.setTimeout.bind(window);
      window.setTimeout = ((fn: () => void, ms?: number) => wait(fn, ms !== undefined && ms >= 1500 && ms <= 5000 ? ms * 100 : ms)) as typeof window.setTimeout;
    });
    await game(
      (be, watch) => {
        be.game.getState().updateSettings({ theme: 'light', awardShow: watch });
        be.game.getState().newGame({ playerName: 'Ada Lovelace', companyName: 'Lovelace Broadcasting', headquarters: 'capital' });
        be.game.getState().change((state) => ({ ...state, guide: { ...state.guide, stage: 'off' } }));
        const nominee = (category: string, show: string, host: string | null, channel: string, mine: boolean, won: boolean) => ({
          category, channelId: channel, channelName: channel, ownerId: mine ? 'player' : 'rival', showName: show, showId: null, hostName: host, hostId: null, score: 1, ...(won && { won }),
        });
        const nominees = [
          nominee('radioShow', 'Morning Glory', null, 'Radio Lovelace', true, true), nominee('radioShow', 'The Late Mix', null, 'Etheria FM', false, false), nominee('radioShow', 'Drive Time', null, 'Radio Two', false, false),
          nominee('radioHost', 'Morning Glory', 'Ada Voss', 'Radio Lovelace', true, false), nominee('radioHost', 'The Late Mix', 'Bo Marlow', 'Etheria FM', false, true), nominee('radioHost', 'Drive Time', 'Cy Ink', 'Radio Two', false, false),
          nominee('tvShow', 'Evening News', null, 'Lovelace TV', true, false), nominee('tvShow', 'Quiz Night', null, 'TV One', false, true),
          nominee('tvHost', 'Quiz Night', 'Dot Kay', 'TV One', false, true), nominee('tvHost', 'Evening News', 'Eve Lund', 'Lovelace TV', true, false),
        ];
        be.game.getState().change((state) => ({ ...state, awards: { ...state.awards, past: [{ year: 1975, nominees }] } }));
        be.game.setState({ ceremony: { year: 1975, resume: false } });
      },
      watch,
    );
    // The stage and the models take a moment; the steps wait for nobody, so press on from the first card.
    await page.waitForSelector('.award-show');
    await page.waitForTimeout(6000);
    for (let i = 0; i < goOn; i++) {
      await page.getByRole('button', { name: 'Go on' }).click();
      await page.waitForTimeout(150);
    }
  };

const shots: Shot[] = [
  { name: 'award-welcome', file: 'dist/shots/award-welcome.png', viewport: { width: 1280, height: 800 }, prepare: night(0), settle: 300 },
  { name: 'award-nominees', file: 'dist/shots/award-nominees.png', viewport: { width: 1280, height: 800 }, prepare: night(3), settle: 800 },
  { name: 'award-winner', file: 'dist/shots/award-winner.png', viewport: { width: 1280, height: 800 }, prepare: night(5), settle: 800 },
  { name: 'award-narrow', file: 'dist/shots/award-narrow.png', viewport: { width: 560, height: 800 }, prepare: night(3), settle: 800 },
  { name: 'award-results', file: 'dist/shots/award-results.png', viewport: { width: 1280, height: 800 }, prepare: night(0, false), settle: 600 },
];

export default shots;
