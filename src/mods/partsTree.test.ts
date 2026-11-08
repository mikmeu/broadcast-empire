import { describe, expect, it } from 'vitest';
import type { Part, Spot } from '../office/assets';
import { addPart, changeKind, countParts, cylinderSize, depthOf, dropPlace, duplicatePart, movePart, newPart, onlyPart, partAt, partKind, partLabel, partShows, pathOfHit, placeOfPart, placesShown, removePart, replacePart } from './partsTree';

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

  it('writes the size of a cylinder with no empty third number', () => {
    expect(cylinderSize(0.02, 0.3)).toStrictEqual([0.02, 0.3]);
    expect(cylinderSize(0.02, 0.3, 0.05)).toStrictEqual([0.02, 0.3, 0.05]);
  });

  it('cuts a tree down to one part, keeping the groups that stand around it', () => {
    const grouped: Part[] = [box(0), { at: [4, 0, 0], turn: 1, tilt: 10, parts: [box(1), { at: [0, 1, 0], parts: [box(2), box(3)] }] }];
    expect(onlyPart(grouped, [0])).toBe(grouped[0]);
    const inner = onlyPart(grouped, [1, 1, 0]);
    expect(inner).toMatchObject({ at: [4, 0, 0], turn: 1, tilt: 10 });
    expect(countParts([inner!])).toBe(3);
    expect(partAt([inner!], [0, 0, 0])?.at[0]).toBe(2);
    // A group at the end of the path stays whole.
    expect(countParts([onlyPart(grouped, [1, 1])!])).toBe(4);
    expect(onlyPart(grouped, [0, 0])).toBeUndefined();
    expect(onlyPart(grouped, [5])).toBeUndefined();
    expect(onlyPart(grouped, [])).toBeUndefined();
  });

  it('names a part for the form', () => {
    expect(partLabel({ model: 'desk', at: [0, 0, 0] })).toBe('desk');
    expect(partLabel(box(0))).toBe('box, wood');
    expect(partLabel({ cylinder: [1, 1], tone: 'metalMid', at: [0, 0, 0] })).toBe('cylinder, metalMid');
    expect(partLabel(tree()[1]!)).toBe('group of 2');
  });

  it('says whether a part is drawn at a tier: the part and every group above it must show', () => {
    const parts: Part[] = [
      { ...box(0), tiers: [2, 3] },
      { at: [0, 0, 0], tiers: [1, 1], parts: [{ ...box(1), tiers: [3, 3] }, box(4)] },
      box(2),
      { at: [0, 0, 0], tiers: [1, 3], parts: [{ ...box(1), tiers: [3, 3] }] },
    ];
    expect(partShows(parts, [0], 1)).toBe(false);
    expect(partShows(parts, [0], 2)).toBe(true);
    expect(partShows(parts, [2], 1)).toBe(true);
    // A child's tiers count, and its group's too: a child outside its group's tiers never shows.
    expect(partShows(parts, [1, 0], 1)).toBe(false);
    expect(partShows(parts, [1, 0], 3)).toBe(false);
    expect(partShows(parts, [1, 1], 1)).toBe(true);
    expect(partShows(parts, [1, 1], 2)).toBe(false);
    expect(partShows(parts, [3, 0], 1)).toBe(false);
    expect(partShows(parts, [3, 0], 3)).toBe(true);
    expect(partShows(parts, [9], 1)).toBe(false);
    expect(partShows(parts, [2, 0], 1)).toBe(false);
  });

  it('finds the path of a drawn part from the object a click hit, the nearest one first', () => {
    const root = { userData: { path: [1] } };
    const inner = { userData: { path: [1, 2] }, parent: root };
    const mesh = { userData: {}, parent: inner };
    expect(pathOfHit(mesh)).toEqual([1, 2]);
    expect(pathOfHit({ userData: {}, parent: root })).toEqual([1]);
    expect(pathOfHit({ userData: {}, parent: { userData: {} } })).toBeUndefined();
    expect(pathOfHit(undefined)).toBeUndefined();
  });
});

describe('parts that wait for a place', () => {
  const tied = (at: number, usedBy?: number): Part => ({ box: [1, 1, 1], tone: 'wood', at: [at, 0, 0], ...(usedBy !== undefined ? { usedBy } : {}) });
  const parts = (): Part[] => [tied(0), tied(1, 0), { at: [0, 0, 0], usedBy: 1, parts: [tied(2), tied(3, 0)] }];

  it('shows a part only while its place is in use, when told which are', () => {
    const none = new Set<number>();
    expect(partShows(parts(), [0], 1, none)).toBe(true);
    expect(partShows(parts(), [1], 1, none)).toBe(false);
    expect(partShows(parts(), [1], 1, new Set([0]))).toBe(true);
    // Without the set the ticks are not looked at.
    expect(partShows(parts(), [1], 1)).toBe(true);
  });

  it('lets a group cover its parts, and a part in it only narrow that', () => {
    expect(partShows(parts(), [2, 0], 1, new Set([0]))).toBe(false);
    expect(partShows(parts(), [2, 0], 1, new Set([1]))).toBe(true);
    expect(partShows(parts(), [2, 1], 1, new Set([1]))).toBe(false);
    expect(partShows(parts(), [2, 1], 1, new Set([0, 1]))).toBe(true);
  });

  it('keeps the tick when the kind changes', () => {
    expect(changeKind(tied(1, 2), 'cylinder')).toMatchObject({ usedBy: 2 });
    expect(changeKind(tied(1), 'group')).not.toHaveProperty('usedBy');
  });

  it('says which place a part waits for, its own or its group’s', () => {
    expect(placeOfPart(parts(), [0])).toBeUndefined();
    expect(placeOfPart(parts(), [1])).toBe(0);
    expect(placeOfPart(parts(), [2, 0])).toBe(1);
    expect(placeOfPart(parts(), [2, 1])).toBe(0);
  });

  it('unties the parts of a place that is taken out and renumbers the later ones', () => {
    const after = dropPlace([tied(0, 0), tied(1, 1), { at: [0, 0, 0], parts: [tied(2, 2), tied(3, 1)] }], 1);
    expect(after.map((p) => p.usedBy)).toEqual([0, undefined, undefined]);
    expect(after[1]).not.toHaveProperty('usedBy');
    expect('parts' in after[2]! && after[2]!.parts.map((p) => p.usedBy)).toEqual([1, undefined]);
  });

  it('puts a person at every place there at the tier, or at none', () => {
    const spots: Spot[] = [{ at: [0, 0], turn: 0, activity: 'sit', tiers: [2, 3] }, { at: [1, 0], turn: 0, activity: 'sit' }];
    expect(placesShown(spots, 1, true)).toEqual(new Set([1]));
    expect(placesShown(spots, 2, true)).toEqual(new Set([0, 1]));
    expect(placesShown(spots, 2, false)).toEqual(new Set());
    expect(placesShown(undefined, 1, true)).toEqual(new Set());
  });
});
