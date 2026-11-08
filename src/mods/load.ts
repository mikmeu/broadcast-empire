// Loads the pieces in the mods folder (0.21.0) and puts them in the game's list of furniture.
// Desktop only: in a browser `desktop?.mods` is missing and there is nothing to load.
// The game does not call this at start-up yet; the editor and the mods list will.

import { registerFurniture, unregisterFurniture } from '../config/office';
import { registerFurnitureAsset, unregisterFurnitureAsset, type FurnitureAsset } from '../office/assets';
import { desktop, type DesktopBridge } from '../persistence/desktop';
import { checkFurnitureFile, checkModel, toFurnitureFile, type FurnitureCheck, type ModFurniture } from './furnitureFile';

type Mods = NonNullable<DesktopBridge['mods']>;

/** Where the page finds a file of the mods folder: the app serves it under /mods/ (electron/main.cjs). */
export const modsUrl = (kind: 'furniture', id: string, file: 'piece.json' | 'model.glb') => `app://game/mods/${kind}/${id}/${file}`;

/** A piece in the folder that could not be used, and why. */
export interface ModProblem {
  id: string;
  reason: string;
}

const getBytes = async (url: string): Promise<Uint8Array> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
};

/** The game's id for a piece. The prefix keeps a mod from ever replacing a piece of the game's own. */
export const modType = (id: string): `mod:${string}` => `mod:${id}`;

/** Reads, checks and returns every piece in the folder. A broken piece is reported, never thrown. */
export async function loadFurnitureMods(mods: Mods | undefined = desktop?.mods, fetchBytes = getBytes): Promise<{ pieces: ModFurniture[]; problems: ModProblem[] }> {
  const pieces: ModFurniture[] = [];
  const problems: ModProblem[] = [];
  if (!mods) return { pieces, problems };
  for (const id of await mods.list('furniture').catch(() => [] as string[])) {
    try {
      const stored = await mods.read('furniture', id);
      if (!stored) throw new Error('The piece is gone.');
      const checked = checkFurnitureFile(stored.text);
      if (!checked.ok) throw new Error(checked.reason);
      if (checked.piece.id !== id) throw new Error(`The file says its id is “${checked.piece.id}”, but its folder is “${id}”.`);
      // The model was put in the folder by hand or by the editor; it is checked again here, as it is what gets drawn.
      const glb = stored.model ? await fetchBytes(modsUrl('furniture', id, 'model.glb')) : undefined;
      if (glb) checkModel(glb);
      pieces.push(glb ? { ...checked.piece, glb } : checked.piece);
    } catch (error) {
      problems.push({ id, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { pieces, problems };
}

/**
 * Adds a piece to the game's list as `mod:<id>`. A piece with a model of its own gets a part that draws it from
 * the mods folder, centred on the footprint. Registering a piece again replaces it. The editor passes `modelUrl`,
 * the address of a model that is not saved yet (a blob made from its bytes).
 */
export function registerModPiece(piece: ModFurniture, modelUrl: string = modsUrl('furniture', piece.id, 'model.glb')): void {
  const type = modType(piece.id);
  const asset: FurnitureAsset = piece.glb
    ? { ...piece.asset, parts: [{ glb: modelUrl, at: [piece.spec.w / 2, 0, piece.spec.h / 2] }, ...piece.asset.parts] }
    : piece.asset;
  unregisterFurniture(type);
  registerFurniture(type, piece.spec);
  registerFurnitureAsset(type, asset);
}

/** Takes a piece off the game's list again. */
export function unregisterModPiece(id: string): void {
  unregisterFurniture(modType(id));
  unregisterFurnitureAsset(modType(id));
}

/** Keeps a piece in the folder. */
export async function saveModPiece(piece: ModFurniture, mods: Mods | undefined = desktop?.mods): Promise<void> {
  if (!mods) throw new Error('Mods need the desktop app.');
  const { glb, ...stored } = piece;
  await mods.write('furniture', piece.id, toFurnitureFile(stored), glb);
}

/** Asks for a file with the system's dialog and checks it; null when the player cancels. */
export async function importFurnitureFile(mods: Mods | undefined = desktop?.mods): Promise<(FurnitureCheck & { fileName: string }) | null> {
  const file = await mods?.importFile('furniture');
  if (!file) return null;
  return 'error' in file ? { ok: false, reason: file.error, fileName: file.fileName } : { ...checkFurnitureFile(file.text), fileName: file.fileName };
}

/** Asks where to put the file of a piece, with the model embedded; false when the player cancels. */
export async function exportFurnitureFile(piece: ModFurniture, mods: Mods | undefined = desktop?.mods): Promise<boolean> {
  return (await mods?.exportFile('furniture', `${piece.id}.furniture.json`, toFurnitureFile(piece))) ?? false;
}
