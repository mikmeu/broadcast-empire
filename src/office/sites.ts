// What the surroundings of the office are like in each region: which
// buildings stand around it, what lies beyond them, what drives by and which
// train runs. The office itself is the same everywhere. The look of a region is in
// siteLooks.ts; the map file of its town (src/config/maps) says the train, the traffic, the scale of the buildings and whether it lies on a shore.

import type { RegionId } from '../config/world';
import { MAPS } from '../config/maps';
import type { MapFile } from '../mods/mapFile';
import { LOOKS, type Look, type Site } from './siteLooks';

export { PLACEABLE, SITE_YARD, placeable, type Ground, type Look, type Site } from './siteLooks';

/** The files of the Train Kit a map names: `double-a` is `train/double-a.glb`. */
export const trainFiles = (pieces: readonly string[]): string[] => pieces.map((piece) => `train/${piece}.glb`);

/** A town's surroundings on a map (0.21.0, #287): the look, with what the map file says (#327): the train, the vehicle mix, how large the buildings are drawn and whether the town lies on a shore. */
export const siteOn = (look: Look, file: MapFile): Site => ({
  ...look,
  scale: file.settings.scale,
  front: file.settings.shore ? 'water' : null,
  train: trainFiles(file.settings.train),
  traffic: file.settings.traffic,
});

/** The surroundings of the office by the region the headquarters are in; the train and the traffic are read from the region's map file. */
export const SITES = Object.fromEntries(
  (Object.keys(LOOKS) as RegionId[]).map((region) => {
    const look = LOOKS[region];
    const file = look.map ? MAPS[look.map] : undefined;
    if (!file) throw new Error(`The town of ${region} has no map file.`);
    return [region, siteOn(look, file)];
  }),
) as Record<RegionId, Site>;

export const siteOf = (region: RegionId): Site => SITES[region];

/** The surroundings of the custom map the game is played on (0.21.0, #290), set up with the map (src/mods/playMap.ts). */
let played: Site | null = null;

export function setPlayedSite(site: Site | null): void {
  played = site;
}

/** The surroundings of a game's office: its region's, or (on a custom map) the region's look with the map's town. */
export function siteOfGame(game: { headquarters: RegionId; customMap: MapFile | null }): Site {
  if (!game.customMap) return SITES[game.headquarters];
  if (!played) throw new Error('The game is on a map that has not been set up.');
  return played;
}

