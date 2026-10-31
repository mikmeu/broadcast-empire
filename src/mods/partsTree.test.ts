import { describe, expect, it } from 'vitest';
import type { Part } from '../office/assets';
import { addPart, changeKind, countParts, depthOf, duplicatePart, movePart, newPart, partAt, partKind, removePart, replacePart } from './partsTree';

const box = (x: number): Part => ({ box: [1, 1, 1], tone: 'wood', at: [x, 0, 0] });
const tree = (): Part[] => [box(0), { at: [0, 0, 0], parts: [box(1), box(2)] }, box(3)];

describe('the tree of parts', () => {
  it('finds, replaces and removes a part at any depth, leaving the old tree alone', () => {
    const before = tree();
    expect(partAt(before, [1, 1])?.at[0]).toBe(2);
    const replaced = replacePart(before, [1, 0], box(9));
    expect(partAt(replaced, [1, 0])?.at[0]).toBe(9);
    expect(partAt(before, [1, 0])?.at[0]).toBe(1);
    expect(countParts(removePart(before, [1, 0]))).toBe(4);
    expect(countParts(removePart(before, [1]))).toBe(2);
    expect(countParts(before)).toBe(5);
  });

  it('moves a part within its list and stops at the ends', () => {
    expect(movePart(tree(), [2], -1).map((p) => p.at[0])).toEqual([0, 3, 0]);
    expect(movePart(tree(), [0], -1).map((p) => p.at[0])).toEqual([0, 0, 3]);
    const moved = movePart(tree(), [1, 0], 1);
    expect(partAt(moved, [1, 0])?.at[0]).toBe(2);
  });

  it('duplicates a part (and a group with what is in it) right after it', () => {
    const copy = duplicatePart(tree(), [1]);
    expect(copy).toHaveLength(4);
    expect(countParts(copy)).toBe(8);
    expect(copy[1]).not.toBe(copy[2]);
    expect(copy[1]).toEqual(copy[2]);
  });

  it('adds to the top or into a group, and measures depth', () => {
    const added = addPart(addPart(tree(), [], box(5)), [1], newPart('group'));
    expect(added).toHaveLength(4);
    expect(partAt(added, [1, 2])).toMatchObject({ parts: [] });
    expect(depthOf(tree())).toBe(2);
    expect(depthOf([])).toBe(0);
  });

  it('changes the kind of a part and keeps where it stands', () => {
    const part: Part = { ...box(2), turn: 1, tiers: [2, 3] };
    const cylinder = changeKind(part, 'cylinder');
    expect(partKind(cylinder)).toBe('cylinder');
    expect(cylinder).toMatchObject({ at: [2, 0, 0], turn: 1, tiers: [2, 3] });
    expect(partKind(changeKind(part, 'model'))).toBe('model');
    expect(partKind(changeKind(part, 'group'))).toBe('group');
  });
});
