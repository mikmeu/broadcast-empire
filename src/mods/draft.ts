// The pieces the furniture editor works on (0.21.0): a draft is a `ModFurniture` that may not pass the checker yet.
// No React here, so the rules are tested on their own.

import { furnitureSpec, type BuiltInFurniture, type FurnitureSpec } from '../config/office';
import { furnitureAsset, type FurnitureAsset } from '../office/assets';
import { MOD_ID, checkFurnitureFile, toFurnitureFile, type ModFurniture } from './furnitureFile';

/** The id the editor shows its draft under while it previews it. It is taken off the game's list when the editor closes. */
export const PREVIEW_ID = 'editor-preview';

/** "Filing cabinet" becomes `filing-cabinet`; a name with no letters at all becomes `piece`. Taken ids get `-2`, `-3`… */
export function uniqueId(name: string, taken: readonly string[]): string {
  const base = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 56) || 'piece';
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) if (!taken.includes(`${base}-${n}`)) return `${base}-${n}`;
}

/** A blank piece: a grey box, 1 × 1 tiles, that can stand in an office. */
export const newPiece = (taken: readonly string[] = []): ModFurniture => ({
  id: uniqueId('new piece', taken),
  spec: { name: 'New piece', about: 'A new piece of furniture.', cost: 100, w: 1, h: 1, rooms: ['office'] },
  asset: { parts: [{ box: [0.8, 0.8, 0.8], tone: 'metalMid', at: [0.5, 0, 0.5] }] },
});

/** The id of a built-in piece in the form of a mod's: `filingCabinet` is `filing-cabinet`. */
export const kebab = (type: string) => type.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/** The numbers and look of a built-in piece without what only the game has (its tiers on a line, its unlocks, its retirement). */
function plain(type: BuiltInFurniture): { spec: FurnitureSpec; asset: FurnitureAsset } {
  const { line: _line, unlock: _unlock, versions: _versions, retired: _retired, ...spec } = furnitureSpec(type);
  return { spec: { ...spec, rooms: [...spec.rooms] }, asset: structuredClone(furnitureAsset(type)) };
}

/** A built-in piece to change: the same numbers and look under a new free id (`filing-cabinet-copy`). It keeps none of the roles the id gives it in the game. */
export function copyOfBuiltIn(type: BuiltInFurniture, taken: readonly string[] = []): ModFurniture {
  const { spec, asset } = plain(type);
  return { id: uniqueId(`${kebab(type)}-copy`, taken), spec: { ...spec, name: `${spec.name} (copy)` }, asset };
}

/**
 * The export of a built-in piece for a developer, who folds it into office.ts and assets.ts by hand: the file of a mod
 * with a `"builtIn"` field naming the piece it replaces. The mod limits only warn here, they do not stop the export.
 * `edited` is the changed copy the player made, if there is one; without it the piece is exported as the game has it.
 */
export function builtInFile(type: BuiltInFurniture, edited?: ModFurniture): { text: string; warning?: string } {
  const { spec, asset } = edited ?? plain(type);
  const text = toFurnitureFile({ id: kebab(type), spec, asset, glb: edited?.glb });
  const checked = checkFurnitureFile(text);
  const file = JSON.parse(text) as Record<string, unknown>;
  return { text: JSON.stringify({ format: file.format, id: file.id, builtIn: type, ...file }, null, 2), warning: checked.ok ? undefined : checked.reason };
}

/** Whether a draft would be refused as a file, and the first reason. Its own model is checked when it is chosen, not on every change. */
export function checkDraft(draft: ModFurniture): { ok: true } | { ok: false; reason: string } {
  if (!MOD_ID.test(draft.id)) return { ok: false, reason: 'The id must be 1 to 64 lowercase letters, digits and dashes, not starting with a dash.' };
  const checked = checkFurnitureFile(toFurnitureFile({ ...draft, glb: undefined }));
  return checked.ok ? { ok: true } : { ok: false, reason: checked.reason };
}
