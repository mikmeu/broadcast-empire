// Editing the parts of a piece, which nest (a group holds parts): every function returns a new tree and leaves the old one alone.
// A path is the position of a part in its list, then of its child in the list of the group, and so on: [2, 0] is the first part of the third.

import type { Part, Tone } from '../office/assets';

export type Path = number[];
export type PartKind = 'model' | 'box' | 'cylinder' | 'group';

export const partKind = (part: Part): PartKind => ('model' in part ? 'model' : 'box' in part ? 'box' : 'cylinder' in part ? 'cylinder' : 'group');

/** The part at a path. */
export function partAt(parts: readonly Part[], path: Path): Part | undefined {
  const [first, ...rest] = path;
  const part = first === undefined ? undefined : parts[first];
  if (!part || rest.length === 0) return part;
  return 'parts' in part ? partAt(part.parts, rest) : undefined;
}

/** Applies `fn` to the list that holds the part at `parent` (the top list for []). */
function editList(parts: Part[], parent: Path, fn: (list: Part[]) => Part[]): Part[] {
  const [first, ...rest] = parent;
  if (first === undefined) return fn(parts);
  return parts.map((part, n) => (n === first && 'parts' in part ? { ...part, parts: editList(part.parts, rest, fn) } : part));
}

const split = (path: Path): [Path, number] => [path.slice(0, -1), path[path.length - 1]!];

export function replacePart(parts: Part[], path: Path, part: Part): Part[] {
  const [parent, index] = split(path);
  return editList(parts, parent, (list) => list.map((p, n) => (n === index ? part : p)));
}

export function removePart(parts: Part[], path: Path): Part[] {
  const [parent, index] = split(path);
  return editList(parts, parent, (list) => list.filter((_, n) => n !== index));
}

/** Moves a part up (-1) or down (1) in its list. */
export function movePart(parts: Part[], path: Path, by: -1 | 1): Part[] {
  const [parent, index] = split(path);
  return editList(parts, parent, (list) => {
    const to = index + by;
    if (to < 0 || to >= list.length) return list;
    const copy = [...list];
    [copy[index], copy[to]] = [copy[to]!, copy[index]!];
    return copy;
  });
}

/** Puts a copy of a part right after it. */
export function duplicatePart(parts: Part[], path: Path): Part[] {
  const [parent, index] = split(path);
  return editList(parts, parent, (list) => [...list.slice(0, index + 1), structuredClone(list[index]!), ...list.slice(index + 1)]);
}

/** Adds a part at the end of the list of the group at `parent` (the top list for []). */
export function addPart(parts: Part[], parent: Path, part: Part): Part[] {
  return editList(parts, parent, (list) => [...list, part]);
}

/** Every part, groups and what is inside them. */
export const countParts = (parts: readonly Part[]): number => parts.reduce((sum, part) => sum + 1 + ('parts' in part ? countParts(part.parts) : 0), 0);

/** How deep the groups go: a part at the top is 1. */
export const depthOf = (parts: readonly Part[]): number => parts.reduce((deepest, part) => Math.max(deepest, 1 + ('parts' in part ? depthOf(part.parts) : 0)), 0);

const GREY: Tone = 'metalMid';

/** A new part of a kind, at a place on the footprint. */
export function newPart(kind: PartKind, at: Part['at'] = [0.5, 0, 0.5]): Part {
  switch (kind) {
    case 'model': return { model: 'desk', at };
    case 'box': return { box: [0.5, 0.5, 0.5], tone: GREY, at };
    case 'cylinder': return { cylinder: [0.25, 0.5], tone: GREY, at };
    case 'group': return { parts: [], at };
  }
}

/** The same part as another kind, keeping where it stands, how it turns and its tiers. */
export function changeKind(part: Part, kind: PartKind): Part {
  const { at, turn, tiers } = part;
  return { ...newPart(kind, at), ...(turn !== undefined ? { turn } : {}), ...(tiers ? { tiers } : {}) } as Part;
}
