// Playing with mod furniture (0.21.0, #275). The game's list of furniture is shared by the whole app, so it is filled
// again whenever a game starts or loads: the pieces in the mods folder, and over them the copies the game keeps in its save.
// A game plays with its own copy: the numbers and the footprint of a piece it has bought never change under it.
// Only the model comes from the folder, when the folder still has it; the save does not keep models.

import { furnitureTypes, type FurnitureType } from '../config/office';
import type { Part } from '../office/assets';
import { SaveError } from '../sim/save';
import type { GameState } from '../sim/state';
import { PREVIEW_ID } from './draft';
import { checkPieceCopy, type ModFurniture } from './furnitureFile';
import { modType, registerModPiece, unregisterModPiece } from './load';

/** What a piece is drawn as when the game has neither its model nor any parts: a plain box on its footprint. */
export const boxFor = (w: number, h: number): Part => ({ box: [w * 0.9, 0.8, h * 0.9], tone: 'metalMid', at: [w / 2, 0, h / 2] });

const ids = (): string[] => furnitureTypes().filter((type) => type.startsWith('mod:') && type !== modType(PREVIEW_ID)).map((type) => type.slice(4));

/**
 * Sets the list of furniture up for a game, or for none: takes off every mod piece (but the editor's preview), puts on
 * the pieces in the folder, and then the game's own copies over them. Throws a `SaveError` for a copy that fails the
 * checker, or for a piece in a room that nobody has the numbers of. Call it before the game is shown.
 */
export function usePiecesFor(state: GameState | null, folder: readonly ModFurniture[]): void {
  for (const id of ids()) unregisterModPiece(id);
  for (const piece of folder) if (piece.id !== PREVIEW_ID) registerModPiece(piece);
  if (!state) return;
  for (const [id, copy] of Object.entries(state.modFurniture ?? {})) {
    const checked = checkPieceCopy(copy);
    if (!checked.ok) throw new SaveError(`This game’s copy of the mod piece “${id}” is not good: ${checked.reason}`);
    const { spec, asset } = checked;
    const glb = folder.find((piece) => piece.id === id)?.glb;
    registerModPiece(glb ? { id, spec, asset, glb } : { id, spec, asset: asset.parts.length > 0 ? asset : { ...asset, parts: [boxFor(spec.w, spec.h)] } });
  }
  const known = new Set<FurnitureType>(furnitureTypes());
  const missing = [...state.rooms.flatMap((r) => r.furniture), ...state.storage].find((f) => !known.has(f.type));
  if (missing) throw new SaveError(`This game uses a mod piece, “${missing.type.replace(/^mod:/, '')}”, that is not in the mods folder and has no copy in the save.`);
}
