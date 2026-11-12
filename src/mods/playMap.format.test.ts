// Map format 2 (0.21.0, #327), save version 72: the shape of a save did not change. A game saved on a custom map of format 1 still loads (#331 removed the
// converter: no released game had such a map), and playing on it is refused with the reason.

import { afterEach, describe, expect, it } from 'vitest';
import { MAPS } from '../config/maps';
import { toMapFile } from './mapFile';
import { useMapFor } from './playMap';
import { createInitialState } from '../sim/newGame';
import { SAVE_VERSION, SaveError, fromSaveFile, toSaveFile } from '../sim/save';

afterEach(() => useMapFor(null));

/** A game saved on a custom map: `drawn` is the copy of the map it keeps. */
const saveOn = (version: number, drawn: unknown) => {
  const file = JSON.parse(JSON.stringify(toSaveFile(createInitialState(1), 1))) as { version: number; state: Record<string, unknown> };
  file.version = version;
  file.state.customMap = drawn;
  file.state.building = 'map';
  return file;
};

/** A map of format 1, written out small: this game does not read the format any more. */
const FORMAT_ONE = { format: 1, id: 'my-copy', name: 'My copy', settings: { train: ['train-diesel-a'] }, map: { wings: [], lanes: [] } };

describe('a save from version 71', () => {
  it('is loaded as the current version', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(72);
  });

  it('keeps a custom map of format 2 as it is, and plays on it', () => {
    const copy = { ...structuredClone(MAPS.coaxia!), id: 'my-copy', name: 'My copy' };
    const { state } = fromSaveFile(saveOn(71, JSON.parse(toMapFile(copy))));
    expect(state.customMap).toEqual(copy);
    expect(() => useMapFor(state)).not.toThrow();
  });

  it('loads a custom map of format 1 as it is: playing it is refused with the reason', () => {
    const { state } = fromSaveFile(saveOn(71, FORMAT_ONE));
    expect(state.customMap).toMatchObject({ format: 1, id: 'my-copy' });
    expect(() => useMapFor(state)).toThrow(SaveError);
    expect(() => useMapFor(state)).toThrow(/format 1/);
  });
});
