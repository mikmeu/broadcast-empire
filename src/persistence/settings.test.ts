import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from './settings';
import { createInitialState } from '../sim/newGame';

describe('settings', () => {
  it('fall back to the defaults for anything missing or invalid', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ theme: 'sepia', difficulty: 'impossible', autosave: 'yes', soundVolume: Number.NaN })).toEqual(DEFAULT_SETTINGS);
  });

  it('keep valid values, clamp volumes and survive being stored as JSON', () => {
    const chosen = { theme: 'dark', difficulty: 'hard', autosave: false, reduceMotion: true, soundVolume: 35, musicVolume: 0, officeVolume: 25, voiceVolume: 60, checkUpdates: false, awardShow: false, mapEditor: true, systemCursor: true } as const;
    expect(parseSettings(JSON.parse(JSON.stringify(chosen)))).toEqual(chosen);
    // The map editor is for developers (0.21.0): off unless it was turned on.
    expect(DEFAULT_SETTINGS.mapEditor).toBe(false);
    expect(parseSettings({ ...chosen, mapEditor: 'yes' }).mapEditor).toBe(false);
    // The editor setting is gone (0.21.0): an old key is ignored.
    expect(parseSettings({ ...chosen, furnitureEditor: true })).toEqual(chosen);
    // An older browser has no such setting (0.20.0): the show is on.
    expect(parseSettings({ ...chosen, awardShow: undefined }).awardShow).toBe(true);
    expect(parseSettings({ soundVolume: 250, musicVolume: -3 })).toMatchObject({ soundVolume: 100, musicVolume: 0, voiceVolume: 100 });
  });

  it('the chosen difficulty is fixed in the new game', () => {
    expect(createInitialState(7, parseSettings({ difficulty: 'hard' }).difficulty).difficulty).toBe('hard');
  });
});
