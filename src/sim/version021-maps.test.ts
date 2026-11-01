// Playing on a custom map (0.21.0, #290): a game keeps a copy of its map in its save, and plays on it.

import { afterEach, describe, expect, it } from 'vitest';
import { MODS } from '../config/balance';
import { MAPS } from '../config/maps';
import { BUILDINGS } from '../config/office';
import { SITES, siteOfGame } from '../office/sites';
import { CAPITAL, layoutOf } from '../office/townLayout';
import { toMapFile, type MapFile } from '../mods/mapFile';
import { checkPlayable, useMapFor } from '../mods/playMap';
import { sensibleBot } from './bots';
import { DEFAULT_SETUP, createInitialState } from './newGame';
import { buildingOf } from './office';
import { SAVE_VERSION, SaveError, fromSaveFile, toSaveFile } from './save';
import type { GameState } from './state';
import { tick } from './tick';

/** Aerial Fields under an id of its own: a map from the folder. Its building is drawn, not written. */
const theMap = (change: (file: MapFile) => void = () => {}): MapFile => {
  const file = structuredClone(MAPS['aerial-fields']!);
  file.id = 'my-fields';
  file.name = 'My fields';
  change(file);
  return file;
};

/** A new game in the capital on a map, set up the way the store does it. */
function gameOn(file: MapFile): GameState {
  useMapFor({ headquarters: 'capital', customMap: file });
  return createInitialState(1, 'normal', { ...DEFAULT_SETUP, customMap: file });
}

/** What the file on disk comes back as: the save as JSON. */
const saved = (s: GameState) => fromSaveFile(JSON.parse(JSON.stringify(toSaveFile(s, 1)))).state;

afterEach(() => useMapFor(null));

describe('the copy of the map in the save', () => {
  it('a save from version 70 loads with no map', () => {
    const old = JSON.parse(JSON.stringify(toSaveFile(createInitialState(1), 1))) as { version: number; state: Record<string, unknown> };
    delete old.state.customMap;
    old.version = 70;
    const { version, state } = fromSaveFile(old);
    expect(version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(71);
    expect(state.customMap).toBeNull();
    expect(state.building).toBe('courtyard');
  });

  it('a game on a map goes out and back with its map', () => {
    const s = gameOn(theMap());
    expect(s.building).toBe('map');
    const back = saved(s);
    expect(back.customMap).toEqual(s.customMap);
    useMapFor(back);
    expect(buildingOf(back).id).toBe('map');
    expect(siteOfGame(back).map).not.toBeNull();
    expect(layoutOf(siteOfGame(back)).map).not.toBeNull();
  });

  it('a save that says `map` without a map is refused', () => {
    const s = gameOn(theMap());
    const file = JSON.parse(JSON.stringify(toSaveFile(s, 1))) as { state: Record<string, unknown> };
    file.state.customMap = null;
    expect(() => fromSaveFile(file)).toThrow(SaveError);
  });

  it('a game keeps its copy when the map in the folder is changed or gone', () => {
    const folder = theMap();
    const s = gameOn(folder);
    folder.name = 'Changed';
    folder.map.lanes = [];
    expect(s.customMap!.name).toBe('My fields');
    expect(() => useMapFor(saved(s))).not.toThrow();
    expect(buildingOf(s).id).toBe('map');
  });

  it('a copy that is not good is refused, with the reason', () => {
    const s = gameOn(theMap());
    const roads = saved(s);
    roads.customMap = { ...roads.customMap!, map: { ...roads.customMap!.map, lanes: [] } };
    expect(() => useMapFor(roads)).toThrow(/no roads/);
    const floors = saved(s);
    floors.customMap = { ...floors.customMap!, settings: { ...floors.customMap!.settings, floors: 9 } };
    expect(() => useMapFor(floors)).toThrow(SaveError);
    const claimed = saved(s);
    claimed.customMap = { ...claimed.customMap!, id: 'coaxia' };
    expect(() => useMapFor(claimed)).toThrow(/own maps/);
  });
});

describe('starting on a map', () => {
  it('a new game after one on a map has the region’s building and town', () => {
    gameOn(theMap());
    const plain = createInitialState(2);
    useMapFor(plain);
    expect(plain.customMap).toBeNull();
    expect(buildingOf(plain)).toBe(BUILDINGS.courtyard);
    expect(siteOfGame(plain)).toBe(SITES.capital);
    expect(layoutOf(siteOfGame(plain))).toBe(CAPITAL);
  });

  it('"Start again" keeps the map', () => {
    const s = gameOn(theMap());
    const again = createInitialState(7, 'normal', s);
    expect(again.building).toBe('map');
    expect(again.customMap).toEqual(s.customMap);
    expect(again.headquarters).toBe('capital');
  });

  it('the region’s economy stays: the same start as on the region’s own town', () => {
    const on = gameOn(theMap());
    const off = createInitialState(1);
    expect(on.money).toBe(off.money);
    expect(on.rivals.map((r) => r.name)).toEqual(off.rivals.map((r) => r.name));
  });
});

describe('which maps can be played', () => {
  it('accepts a copy of a map under an id of its own', () => {
    expect(checkPlayable(theMap())).toEqual({ ok: true });
  });

  it('refuses the id of a default map', () => {
    const reason = checkPlayable(theMap((f) => (f.id = 'coaxia')));
    expect(reason.ok).toBe(false);
    if (!reason.ok) expect(reason.reason).toMatch(/own maps/);
  });

  it('refuses a map over the size limit', () => {
    const big = theMap((f) => {
      f.map.trees = Array.from({ length: 20_000 }, (_, i) => ({ x: i % 400, y: Math.floor(i / 400) }));
    });
    expect(toMapFile(big).length).toBeGreaterThan(MODS.mapBytes);
    const reason = checkPlayable(big);
    expect(reason.ok).toBe(false);
    if (!reason.ok) expect(reason.reason).toMatch(/bigger than/);
  });

  it('refuses a town the game cannot run', () => {
    expect(checkPlayable(theMap((f) => (f.map.lanes = []))).ok).toBe(false);
  });
});

describe('a bot on a map', () => {
  it('plays two years on the copy of Aerial Fields without going bankrupt, and ends richer than it began', () => {
    let s = gameOn(theMap());
    const start = s.money;
    while (s.day < 730 && !s.bankrupt) s = tick(sensibleBot(s));
    expect(s.bankrupt).toBe(false);
    expect(s.money).toBeGreaterThan(start);
    expect(s.rooms.length).toBeGreaterThan(0);
  }, 120_000);
});
