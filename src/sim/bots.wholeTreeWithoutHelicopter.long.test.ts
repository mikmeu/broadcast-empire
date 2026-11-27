import { describe, expect, it } from 'vitest';
import { TECHS } from '../config/tech';
import { growthBot, without } from './bots';
import { createInitialState } from './newGame';
import { slow } from './slow';
import { tick } from './tick';
import { unlockAll } from './unlocks';

// A long test: it runs in its own job, when a change touches game logic (see PIPELINE.md, "Testing: what runs where").

const jan1 = (year: number) => Math.round((Date.UTC(year, 0, 1) - Date.UTC(1970, 0, 1)) / 86_400_000);

describe('the whole tree without the helicopter (#470)', () => {
  // At the helicopter's old settings (flight €1,000, lift 1.08) this game went bankrupt in early 2002 on seed 1; the helicopter had kept
  // the other one alive by accident. The company must not depend on buying it.
  it('a headless game plays from 1970 to 2030 and the growth bot never buys the helicopter', () => {
    let s = unlockAll(createInitialState(1));
    const end = jan1(2030);
    const bot = without('helicopter')(growthBot);
    while (s.day < end && !s.bankrupt) s = tick(bot(s));
    expect(s.bankrupt).toBe(false);
    expect(s.day).toBe(end);
    expect(s.helicopter).toBeFalsy();
    expect(s.techs).toHaveLength(TECHS.length);
  // The same game as bots.wholeTree.long.test.ts: 200 s (600 s on GitHub).
  }, slow(200_000));
});
