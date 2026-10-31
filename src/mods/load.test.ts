import { afterEach, describe, expect, it } from 'vitest';
import { furnitureSpec, furnitureTypes } from '../config/office';
import { furnitureAsset } from '../office/assets';
import type { DesktopBridge } from '../persistence/desktop';
import { toFurnitureFile, type ModFurniture } from './furnitureFile';
import { loadFurnitureMods, modsUrl, registerModPiece, unregisterModPiece } from './load';

type Mods = NonNullable<DesktopBridge['mods']>;

const stool: ModFurniture = {
  id: 'stool',
  spec: { name: 'Stool', about: 'A stool.', cost: 100, w: 2, h: 1, rooms: ['office'] },
  asset: { parts: [{ box: [0.5, 0.5, 0.5], tone: 'wood', at: [0.5, 0, 0.5] }] },
};

/** A folder in memory: the text of each piece, and whether it has a model. */
const folder = (pieces: Record<string, { text: string; model: boolean }>): Mods =>
  ({ list: async () => Object.keys(pieces), read: async (_kind: string, id: string) => pieces[id] ?? null }) as unknown as Mods;

afterEach(() => unregisterModPiece('stool'));

describe('loadFurnitureMods', () => {
  it('returns nothing in a browser', async () => {
    expect(await loadFurnitureMods(undefined)).toEqual({ pieces: [], problems: [] });
  });

  it('returns the good pieces and names the bad ones, without throwing', async () => {
    const found = await loadFurnitureMods(
      folder({
        stool: { text: toFurnitureFile(stool), model: false },
        broken: { text: '{', model: false },
        moved: { text: toFurnitureFile(stool), model: false },
        gone: { text: toFurnitureFile({ ...stool, id: 'gone' }), model: true },
      }),
      async () => {
        throw new Error('404');
      },
    );
    expect(found.pieces.map((piece) => piece.id)).toEqual(['stool']);
    expect(found.problems).toEqual([
      { id: 'broken', reason: 'The file is not JSON.' },
      { id: 'moved', reason: 'The file says its id is “stool”, but its folder is “moved”.' },
      { id: 'gone', reason: '404' },
    ]);
  });
});

describe('registerModPiece', () => {
  it('adds the piece to the game as mod:<id>, and again without a clash', () => {
    registerModPiece(stool);
    registerModPiece(stool);
    expect(furnitureTypes()).toContain('mod:stool');
    expect(furnitureSpec('mod:stool').name).toBe('Stool');
    expect(furnitureAsset('mod:stool').parts).toHaveLength(1);
  });

  it('draws a model of its own from the mods folder, centred on the footprint', () => {
    registerModPiece({ ...stool, glb: new Uint8Array([1]) });
    expect(furnitureAsset('mod:stool').parts[0]).toEqual({ glb: modsUrl('furniture', 'stool', 'model.glb'), at: [1, 0, 0.5] });
    expect(furnitureAsset('mod:stool').parts).toHaveLength(2);
  });
});
