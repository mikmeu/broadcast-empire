import { describe, expect, it } from 'vitest';
import { ACTIVE_REGIONS, RIVAL_MIN_FREE_SLOTS } from '../config/balance';
import { freeLicenses } from './licenses';
import { createInitialState } from './newGame';
import { unlockAll } from './unlocks';
import { expandRivals, refreshRivalShows } from './rivals';
import { Rng } from './rng';

describe('rivals', () => {
  it('never take the last free licenses in a region', () => {
    const s = structuredClone(unlockAll(createInitialState(1)));
    const rng = new Rng(9);
    for (let i = 0; i < 500; i++) expandRivals(s, rng);
    for (const region of ACTIVE_REGIONS) expect(freeLicenses(s, 'radio', region)).toBeGreaterThanOrEqual(RIVAL_MIN_FREE_SLOTS - 1);
  });

  it('replace their weakest show each season but keep their format', () => {
    const s = structuredClone(unlockAll(createInitialState(1)));
    const channel = s.rivals[0]!.channels[0]!;
    const genres = channel.schedule.map((sh) => sh.genre);
    const weakest = channel.schedule.reduce((a, b) => (b.quality < a.quality ? b : a));
    refreshRivalShows(s, new Rng(3));
    expect(channel.schedule.map((sh) => sh.genre)).toEqual(genres);
    expect(channel.schedule).not.toContainEqual(weakest);
  });

  it('never make a talent show (#405): it needs your jury and your hall', () => {
    const s = structuredClone(unlockAll(createInitialState(1)));
    const rng = new Rng(4);
    for (let i = 0; i < 40; i++) refreshRivalShows(s, rng);
    for (const rival of s.rivals) for (const channel of rival.channels) expect(channel.schedule.map((sh) => sh.genre)).not.toContain('talentShow');
  });
});
