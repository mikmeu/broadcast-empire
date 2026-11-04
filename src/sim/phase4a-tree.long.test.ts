import { describe, expect, it } from 'vitest';
import { TECHS } from '../config/tech';
import { growthBot } from './bots';
import { createInitialState } from './newGame';
import { slow } from './slow';
import { tick } from './tick';
import { unlockAll } from './unlocks';

// A long test: it runs in its own job, when a change touches game logic (see PIPELINE.md, "Testing: what runs where").

const jan1 = (year: number) => Math.round((Date.UTC(year, 0, 1) - Date.UTC(1970, 0, 1)) / 86_400_000);

describe('Phase 4a acceptance', () => {
  it('a headless game plays from 1970 to 2030, researching the whole tree', () => {
    let s = unlockAll(createInitialState(1));
    const end = jan1(2030);
    while (s.day < end && !s.bankrupt) s = tick(growthBot(s));
    expect(s.bankrupt).toBe(false);
    expect(s.day).toBe(end);
    expect(Number.isFinite(s.money)).toBe(true);
    expect(s.techs).toHaveLength(TECHS.length);
  }, slow(120_000));
});
