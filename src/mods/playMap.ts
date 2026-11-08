// Playing on a custom map (0.21.0, #290). A game on a map keeps a copy of the map file in its save (`customMap`), and plays on that copy:
// the map in the mods folder can change or go. The building, the layout and the site of the map being played are worked out once, here,
// and kept as the same objects until the next game, because the sim's caches go by building object and the scene's by layout object
// (and `tick` clones the state every day, so they cannot live in it). Like `usePiecesFor`: call `useMapFor` before the game is shown.

import { MAPS } from '../config/maps';
import { MODS } from '../config/balance';
import { setMapBuilding } from '../config/office';
import type { RegionId } from '../config/world';
import { SITES, setPlayedSite, siteOn } from '../office/sites';
import { checkTown, type TownCheck } from '../office/townCheck';
import { PLAYED_MAP, houseOf, layoutFromMap, setPlayedLayout } from '../office/townLayout';
import { SaveError } from '../sim/save';
import { checkMapFile, toMapFile, type MapFile } from './mapFile';
import { loadMapMods, type MapProblem } from './mapMods';

/** Why a map can't be played, in plain words; ok when it can. A game on a map checks its copy the same way, because a save can't be trusted any more than a file. */
export function checkPlayable(file: MapFile): TownCheck {
  if (file.id in MAPS) return { ok: false, reason: `The id “${file.id}” is that of one of the game’s own maps: give the map an id of its own.` };
  const bytes = toMapFile(file).length;
  if (bytes > MODS.mapBytes) return { ok: false, reason: `The map is bigger than ${MODS.mapBytes / 1000} kB to play on (${Math.round(bytes / 1000)} kB).` };
  return checkTown(file);
}

/** The maps in the folder, told apart: the ones a game can be started on, and each one that cannot, with why (a file that cannot be read included). */
export async function playableMaps(mods: Parameters<typeof loadMapMods>[0]): Promise<{ playable: MapFile[]; refused: MapProblem[] }> {
  const { maps, problems } = await loadMapMods(mods);
  const playable: MapFile[] = [];
  const refused: MapProblem[] = [...problems];
  for (const file of maps) {
    const checked = checkPlayable(file);
    if (checked.ok) playable.push(file);
    else refused.push({ id: file.id, reason: checked.reason });
  }
  return { playable, refused };
}

/**
 * Sets the map up for a game, or clears it when the game has none: the building worked out from the map, its layout, and the
 * site (the region's look with the map's town, train and traffic). Throws a `SaveError` with the reason when the copy is no good.
 * Nothing is changed unless all of it works.
 */
export function useMapFor(game: { headquarters: RegionId; customMap: MapFile | null } | null): void {
  const copy = game?.customMap;
  if (!game || !copy) {
    setMapBuilding(null);
    setPlayedLayout(null);
    setPlayedSite(null);
    return;
  }
  const checked = checkMapFile(copy);
  if (!checked.ok) throw new SaveError(`This game’s copy of its map is not good: ${checked.reason}`);
  const { file } = checked;
  const playable = checkPlayable(file);
  if (!playable.ok) throw new SaveError(`This game’s map, “${file.name}”, cannot be played: ${playable.reason}`);
  const building = houseOf(file);
  const layout = layoutFromMap(file, building);
  setMapBuilding(building);
  setPlayedLayout(layout);
  setPlayedSite({ ...siteOn(SITES[game.headquarters], file), map: PLAYED_MAP });
}
