import { describe, expect, it } from 'vitest';
import { FURNITURE, type BuiltInFurniture } from '../config/office';
import { MOD_ID, checkFurnitureFile } from './furnitureFile';
import { builtInFile, checkDraft, copyOfBuiltIn, newPiece, uniqueId } from './draft';

const BUILT_IN = Object.keys(FURNITURE) as BuiltInFurniture[];

describe('the ids of drafts', () => {
  it('make an id from a name and keep it free', () => {
    expect(uniqueId('Filing cabinet', [])).toBe('filing-cabinet');
    expect(uniqueId('Café table!', [])).toBe('cafe-table');
    expect(uniqueId('???', [])).toBe('piece');
    expect(uniqueId('Stool', ['stool', 'stool-2'])).toBe('stool-3');
  });
});

describe('a new piece', () => {
  it('passes the checker as it is', () => {
    expect(checkDraft(newPiece())).toEqual({ ok: true });
    expect(newPiece(['new-piece']).id).toBe('new-piece-2');
  });

  it('is refused with a reason when its price is under what its boosts need', () => {
    const piece = newPiece();
    piece.spec.boosts = [{ kind: 'wear', amount: 0.25 }];
    const checked = checkDraft(piece);
    expect(checked.ok).toBe(false);
    expect(!checked.ok && checked.reason).toMatch(/costs at least/);
  });
});

describe('a copy of a built-in piece', () => {
  it('never keeps the built-in id, and shares nothing with the original', () => {
    for (const type of BUILT_IN) {
      const copy = copyOfBuiltIn(type);
      expect(copy.id).not.toBe(type);
      expect(copy.id).toMatch(MOD_ID);
      expect(copy.spec).not.toBe(FURNITURE[type]);
      expect(copy.spec).not.toHaveProperty('line');
      expect(copy.spec).not.toHaveProperty('unlock');
      expect(copy.spec).not.toHaveProperty('retired');
    }
    expect(copyOfBuiltIn('filingCabinet').id).toBe('filing-cabinet-copy');
    expect(copyOfBuiltIn('filingCabinet', ['filing-cabinet-copy']).id).toBe('filing-cabinet-copy-2');
  });
});

describe('the export of a built-in piece', () => {
  it('names the piece it replaces and reads back as the same file, or says why it is over the limits', () => {
    for (const type of BUILT_IN) {
      const { text, warning } = builtInFile(type);
      const file = JSON.parse(text) as { id: string; builtIn: string };
      expect(file.builtIn).toBe(type);
      expect(file.id).toMatch(MOD_ID);
      const checked = checkFurnitureFile(text);
      // The limits only warn: the file is written either way.
      expect(checked.ok).toBe(warning === undefined);
      if (checked.ok) expect(checked.piece.spec.name).toBe(FURNITURE[type].name);
      else expect(warning).toBe(checked.reason);
    }
  });
});
