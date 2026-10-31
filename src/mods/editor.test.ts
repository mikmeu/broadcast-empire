// The rules the furniture editor (src/ui/FurnitureEditor.tsx) is built on, with a fake mods folder: the screen itself
// only calls these. (The test setup has no browser to draw a screen in.)

import { afterEach, describe, expect, it } from 'vitest';
import { furnitureSpec, furnitureTypes } from '../config/office';
import { furnitureAsset } from '../office/assets';
import type { DesktopBridge } from '../persistence/desktop';
import { PREVIEW_ID, checkDraft, copyOfBuiltIn, newPiece } from './draft';
import { checkFurnitureFile, minimumPrice } from './furnitureFile';
import { loadFurnitureMods, saveModPiece } from './load';
import { PREVIEW_TYPE, createPreview } from './preview';

type Mods = NonNullable<DesktopBridge['mods']>;

/** A folder in memory that keeps what is written to it. */
function fakeFolder() {
  const files = new Map<string, { text: string; glb?: Uint8Array }>();
  const mods = {
    list: async () => [...files.keys()],
    read: async (_kind: string, id: string) => (files.has(id) ? { text: files.get(id)!.text, model: files.get(id)!.glb !== undefined } : null),
    write: async (_kind: string, id: string, text: string, glb?: Uint8Array) => void files.set(id, { text, glb }),
  } as unknown as Mods;
  return { files, mods };
}

const preview = createPreview();
afterEach(() => preview.stop());

describe('editing a copy of a built-in piece', () => {
  it('saves under the id of the copy, with the new price, and the folder reads it back', async () => {
    const { files, mods } = fakeFolder();
    const copy = copyOfBuiltIn('filingCabinet');
    copy.spec.cost = 321;
    expect(checkDraft(copy)).toEqual({ ok: true });
    await saveModPiece(copy, mods);
    expect([...files.keys()]).toEqual(['filing-cabinet-copy']);
    const found = await loadFurnitureMods(mods);
    expect(found.problems).toEqual([]);
    expect(found.pieces[0]?.spec.cost).toBe(321);
  });

  it('cannot be saved under a price below what its boosts need, and says why', () => {
    const copy = copyOfBuiltIn('filingCabinet');
    copy.spec.boosts = [{ kind: 'morale', amount: 2, reach: 'room' }];
    copy.spec.cost = minimumPrice(copy.spec.boosts) - 1;
    const checked = checkDraft(copy);
    expect(checked.ok).toBe(false);
    expect(!checked.ok && checked.reason).toBe(`With these boosts the piece costs at least €${minimumPrice(copy.spec.boosts).toLocaleString('en-GB')}.`);
    copy.spec.cost = minimumPrice(copy.spec.boosts);
    expect(checkDraft(copy)).toEqual({ ok: true });
  });

  it('is refused for a bad id, no rooms or too many places', () => {
    const piece = newPiece();
    expect(checkDraft({ ...piece, id: 'Bad Id' }).ok).toBe(false);
    expect(checkDraft({ ...piece, spec: { ...piece.spec, rooms: [] } }).ok).toBe(false);
    const spots = Array.from({ length: 17 }, () => ({ at: [0.5, 0.5] as [number, number], turn: 0, activity: 'sit' as const }));
    expect(checkDraft({ ...piece, asset: { ...piece.asset, spots } }).ok).toBe(false);
  });
});

describe('the preview', () => {
  it('puts the draft on the list as mod:editor-preview and takes it off again', () => {
    const piece = newPiece();
    expect(preview.show(piece)).toBe(PREVIEW_TYPE);
    expect(furnitureTypes()).toContain(`mod:${PREVIEW_ID}`);
    expect(furnitureSpec(PREVIEW_TYPE).name).toBe('New piece');
    // A change under the same id replaces it.
    preview.show({ ...piece, spec: { ...piece.spec, name: 'Changed' } });
    expect(furnitureSpec(PREVIEW_TYPE).name).toBe('Changed');
    preview.stop();
    expect(furnitureTypes()).not.toContain(PREVIEW_TYPE);
  });

  it('draws a model that is not saved yet from a blob, a new one for each model', () => {
    const piece = { ...newPiece(), glb: new Uint8Array([1, 2, 3]) };
    preview.show(piece);
    const first = furnitureAsset(PREVIEW_TYPE).parts[0];
    expect(first && 'glb' in first && first.glb).toMatch(/^blob:/);
    preview.show(piece);
    const same = furnitureAsset(PREVIEW_TYPE).parts[0];
    expect(same && 'glb' in same && same.glb).toBe(first && 'glb' in first && first.glb);
    preview.show({ ...piece, glb: new Uint8Array([4, 5, 6]) });
    const next = furnitureAsset(PREVIEW_TYPE).parts[0];
    expect(next && 'glb' in next && next.glb).not.toBe(first && 'glb' in first && first.glb);
  });
});

describe('a new piece', () => {
  it('is a file the checker accepts, and keeps nothing of the game', () => {
    const { ok } = checkFurnitureFile(JSON.stringify({ format: 1, id: 'new-piece', spec: newPiece().spec, asset: newPiece().asset }));
    expect(ok).toBe(true);
  });
});
