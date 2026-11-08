// Playing with mod furniture (0.21.0, #275): a game keeps a copy of the mod pieces it uses.

import { afterEach, describe, expect, it } from 'vitest';
import { furnitureSpec, furnitureTypes, type FurnitureSpec } from '../config/office';
import { furnitureAsset, type FurnitureAsset } from '../office/assets';
import { registerModPiece } from '../mods/load';
import { usePiecesFor } from '../mods/play';
import { checkPieceCopy } from '../mods/furnitureFile';
import { placeFurniture, sellFurniture, sellStored, storeFurniture, setRoomType, type ActionResult } from './actions';
import { rentRoom } from './fixtures';
import { createInitialState } from './newGame';
import { findRoom } from './office';
import { fromSaveFile, SaveError, SAVE_VERSION, toSaveFile } from './save';
import type { GameState } from './state';
import { resaleValue } from './tech';

const ok = (result: ActionResult): GameState => {
  if (!result.ok) throw new Error(result.error);
  return result.state;
};

const spec: FurnitureSpec = { name: 'Test chair', about: 'A chair that came from outside.', cost: 200, w: 1, h: 1, rooms: ['office'] };
const asset: FurnitureAsset = { parts: [{ box: [0.8, 0.8, 0.8], tone: 'wood', at: [0.5, 0, 0.5] }] };
const GLB = new Uint8Array([1, 2, 3]);

/** A game with a rented office, a mod piece registered as the mods folder would and, if asked, one bought. */
function game(piece: { asset: FurnitureAsset; glb?: Uint8Array } = { asset }, buy = true): GameState {
  registerModPiece({ id: 'test-chair', spec, ...piece });
  let s: GameState = { ...ok(setRoomType(ok(rentRoom(createInitialState(1), 'A')), 'A', 'office')), money: 5_000_000 };
  if (buy) s = ok(placeFurniture(s, 'A', 'mod:test-chair', 0, 0));
  return s;
}

/** What the file on disk comes back as: the save as JSON. */
const saved = (s: GameState) => fromSaveFile(JSON.parse(JSON.stringify(toSaveFile(s, 1)))).state;

afterEach(() => usePiecesFor(null, []));

describe('the copy in the save', () => {
  it('a save from version 69 loads with no mod furniture', () => {
    const old = JSON.parse(JSON.stringify(toSaveFile(createInitialState(1), 1))) as { version: number; state: Record<string, unknown> };
    delete old.state.modFurniture;
    old.version = 69;
    const { version, state } = fromSaveFile(old);
    expect(version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(70);
    expect(state.modFurniture).toEqual({});
  });

  it('buying a mod piece copies its numbers and parts into the game, once', () => {
    const s = game();
    expect(s.modFurniture['test-chair']).toEqual({ spec, asset });
    // The game keeps the copy it first bought, even if the piece is registered again with other numbers.
    registerModPiece({ id: 'test-chair', spec: { ...spec, cost: 999 }, asset });
    const more = ok(placeFurniture(s, 'A', 'mod:test-chair', 1, 0));
    expect(more.modFurniture['test-chair']!.spec.cost).toBe(200);
  });

  it('a piece of the game’s own leaves no copy', () => {
    const s = ok(placeFurniture(game({ asset }, false), 'A', 'bin', 0, 0));
    expect(s.modFurniture).toEqual({});
  });

  it('toSaveFile drops the copy of a piece that no room and no storage has any more', () => {
    const s = game();
    expect(Object.keys(toSaveFile(s, 1).state.modFurniture)).toEqual(['test-chair']);
    const gone = ok(sellFurniture(s, 'A', findRoom(s, 'A')!.furniture[0]!.id));
    expect(toSaveFile(gone, 1).state.modFurniture).toEqual({});
    const stored = ok(storeFurniture(s, 'A', findRoom(s, 'A')!.furniture[0]!.id));
    expect(Object.keys(toSaveFile(stored, 1).state.modFurniture)).toEqual(['test-chair']);
  });
});

describe('a game whose mod is gone', () => {
  it('loads, draws the piece from its copy and sells it at the copy’s price', () => {
    const loaded = saved(game());
    usePiecesFor(null, []);
    expect(() => furnitureSpec('mod:test-chair')).toThrow();
    usePiecesFor(loaded, []);
    expect(furnitureSpec('mod:test-chair').cost).toBe(200);
    expect(furnitureAsset('mod:test-chair').parts).toEqual(asset.parts);
    const item = findRoom(loaded, 'A')!.furniture[0]!;
    const sold = ok(sellFurniture(loaded, 'A', item.id));
    expect(sold.money - loaded.money).toBe(resaleValue(item, loaded.day));
    expect(sold.money).toBeGreaterThan(loaded.money);
  });

  it('can sell a stored piece too', () => {
    const s = game();
    const stored = ok(storeFurniture(s, 'A', findRoom(s, 'A')!.furniture[0]!.id));
    const loaded = saved(stored);
    usePiecesFor(null, []);
    usePiecesFor(loaded, []);
    expect(ok(sellStored(loaded, loaded.storage[0]!.id)).money).toBeGreaterThan(loaded.money);
  });

  it('draws a piece that was only its own model as a box on its footprint', () => {
    const s = game({ asset: { parts: [] }, glb: GLB });
    expect(s.modFurniture['test-chair']!.asset.parts).toEqual([]);
    const loaded = saved(s);
    usePiecesFor(null, []);
    usePiecesFor(loaded, []);
    const [part] = furnitureAsset('mod:test-chair').parts;
    expect(part).toMatchObject({ box: [0.9, 0.8, 0.9], at: [0.5, 0, 0.5] });
  });

  it('draws it with the model of the folder when the folder still has it', () => {
    const s = game({ asset: { parts: [] }, glb: GLB });
    const loaded = saved(s);
    usePiecesFor(loaded, [{ id: 'test-chair', spec: { ...spec, cost: 999, w: 2 }, asset: { parts: [] }, glb: GLB }]);
    expect(furnitureAsset('mod:test-chair').parts[0]).toHaveProperty('glb');
    // The game plays with its own numbers, not the folder’s.
    expect(furnitureSpec('mod:test-chair')).toMatchObject({ cost: 200, w: 1 });
  });

  it('refuses a tampered copy, with the reason', () => {
    const loaded = saved(game());
    loaded.modFurniture['test-chair']!.spec.w = 99;
    expect(() => usePiecesFor(loaded, [])).toThrow(SaveError);
    expect(() => usePiecesFor(loaded, [])).toThrow(/width/);
    expect(checkPieceCopy({ spec: { ...spec, cost: -5 }, asset }).ok).toBe(false);
  });

  it('names the piece when the game uses one with no copy and none in the folder', () => {
    const loaded = saved(game());
    delete loaded.modFurniture['test-chair'];
    expect(() => usePiecesFor(loaded, [])).toThrow(/test-chair/);
  });
});

describe('the list of furniture is shared by the whole app', () => {
  it('a new game after a loaded one has none of its copies', () => {
    const loaded = saved(game());
    usePiecesFor(null, []);
    usePiecesFor(loaded, []);
    expect(furnitureTypes()).toContain('mod:test-chair');
    usePiecesFor(null, []);
    expect(furnitureTypes().filter((t) => t.startsWith('mod:'))).toEqual([]);
  });

  it('the folder’s pieces are on the list for a new game', () => {
    usePiecesFor(null, [{ id: 'test-chair', spec, asset }]);
    expect(furnitureTypes()).toContain('mod:test-chair');
  });
});
