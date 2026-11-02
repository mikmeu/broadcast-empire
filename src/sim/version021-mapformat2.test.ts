// Map format 2 (0.21.0, #327), save version 72: a game saved on a custom map of the older format has its map converted as it loads, and its building stays as it was.

import { afterEach, describe, expect, it } from 'vitest';
import { oldHouseOf } from '../mods/oldMap';
import { OLD_MAPS } from '../mods/oldMaps';
import type { OldMapFile } from '../mods/oldMapFile';
import { useMapFor } from '../mods/playMap';
import { houseOf } from '../office/townLayout';
import { createInitialState } from './newGame';
import { buildingOf } from './office';
import { SAVE_VERSION, SaveError, fromSaveFile, toSaveFile } from './save';

afterEach(() => useMapFor(null));

/** A game saved before the map was written down: the copy of its map is in the older format. */
const oldSave = (drawn: OldMapFile) => {
  const file = JSON.parse(JSON.stringify(toSaveFile(createInitialState(1), 1))) as { version: number; state: Record<string, unknown> };
  file.version = 71;
  file.state.customMap = drawn;
  file.state.building = 'map';
  return file;
};

describe('a save from version 71', () => {
  it('is loaded as version 72', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(72);
  });

  it.each(['aerial-fields', 'amplify-hills', 'coaxia', 'skywave-beach', 'transponder-valley'])('converts a copy of %s and keeps its building as it was', (id) => {
    const drawn: OldMapFile = { ...structuredClone(OLD_MAPS[id]!), id: 'my-copy', name: 'My copy' };
    const before = oldHouseOf(drawn);
    const { state } = fromSaveFile(oldSave(drawn));
    expect(state.customMap).toMatchObject({ format: 2, id: 'my-copy' });
    expect(houseOf(state.customMap!)).toEqual(before);
    expect(() => useMapFor(state)).not.toThrow();
    expect(buildingOf(state)).toEqual(before);
  });

  it('leaves a map that cannot be converted as it is: playing it is refused with the reason', () => {
    const drawn: OldMapFile = { ...structuredClone(OLD_MAPS['aerial-fields']!), id: 'my-copy', name: 'My copy' };
    drawn.map.wings = [];
    const { state } = fromSaveFile(oldSave(drawn));
    expect(state.customMap).toMatchObject({ format: 1 });
    expect(() => useMapFor(state)).toThrow(SaveError);
  });
});
