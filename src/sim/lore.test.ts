// Names from lore.md: the country, its regions and the public broadcaster.

import { describe, expect, it } from 'vitest';
import { COUNTRY, REGIONS, getRegion } from '../config/world';
import { sensibleBot } from './bots';
import { createInitialState } from './newGame';
import { fromSaveFile, SAVE_VERSION } from './save';
import type { GameState } from './state';
import { tick } from './tick';

const publicBroadcaster = (s: GameState) => s.rivals.find((r) => r.personality === 'highbrow')!;

describe('Etheria', () => {
  it('has five named regions behind the original ids', () => {
    expect(COUNTRY).toBe('Etheria');
    expect(REGIONS.map((r) => r.name)).toEqual(['Coaxia', 'Transponder Valley', 'Skywave Beach', 'Aerial Fields', 'Amplify Hills']);
    expect(getRegion('capital').name).toBe('Coaxia');
    expect(getRegion('highlands').name).toBe('Amplify Hills');
  });

  it('the public broadcaster is EPB with two radio channels and one TV channel', () => {
    for (const seed of [1, 2, 3]) {
      const epb = publicBroadcaster(createInitialState(seed));
      expect(epb.name).toBe('EPB');
      expect(epb.channels.map((c) => c.name)).toEqual(['EPB Radio 1', 'EPB Radio 2', 'EPB-TV']);
      expect(epb.channels.map((c) => c.logo.initials)).toEqual(['E1', 'E2', 'ETV']);
    }
  });

  it('other rivals still get a random company name', () => {
    const others = createInitialState(1).rivals.filter((r) => r.personality !== 'highbrow');
    expect(others).toHaveLength(3);
    expect(others.every((r) => r.name.endsWith(' Broadcasting'))).toBe(true);
    expect(new Set(others.map((r) => r.name)).size).toBe(3);
  });
});

describe('saves from before the lore', () => {
  it('get the public broadcaster renamed', () => {
    const s = structuredClone(tick(sensibleBot(createInitialState(1)))) as GameState;
    const epb = publicBroadcaster(s);
    epb.name = 'Beacon Broadcasting';
    epb.channels[0]!.name = 'National Beacon One';
    epb.channels[1]!.name = 'National Beacon Two';
    epb.channels[2]!.name = 'National Beacon Television';
    const { state, version } = fromSaveFile({ version: 9, savedAt: 1, state: s });
    expect(version).toBe(SAVE_VERSION);
    expect(publicBroadcaster(state).name).toBe('EPB');
    expect(publicBroadcaster(state).channels.map((c) => c.name)).toEqual(['EPB Radio 1', 'EPB Radio 2', 'EPB-TV']);
    expect(state.rivals.filter((r) => r.personality !== 'highbrow').map((r) => r.name)).toEqual(s.rivals.filter((r) => r.personality !== 'highbrow').map((r) => r.name));
  });
});
