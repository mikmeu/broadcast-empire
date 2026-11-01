// The map editor's preview (0.21.0, #284): the draft's layout is put on the town layouts' list as `editor-preview`, so Town.tsx
// can draw it like any town, and taken off again when the editor closes. A map that cannot be laid out keeps the last good one.

import type { Building } from '../config/office';
import { SITES, type Site } from '../office/sites';
import { PREVIEW_MAP, houseOf, layoutFromMap, setPreviewLayout } from '../office/townLayout';
import type { RegionId } from '../config/world';
import type { MapFile } from './mapFile';

export type MapShown = { ok: true; building: Building } | { ok: false; reason: string };

/** Lays the map out and shows it under the reserved name. The building is the one the town is laid out round: the one given, else the map's own (see `houseOf`). */
export function showPreviewMap(file: MapFile, given?: Building): MapShown {
  try {
    const building = houseOf(file, given);
    setPreviewLayout(layoutFromMap(file, building));
    return { ok: true, building };
  } catch (error) {
    return { ok: false, reason: `The town cannot be drawn yet: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** Takes the draft off the list. */
export const stopPreviewMap = (): void => setPreviewLayout(null);

/** The look a preview borrows: the buildings, ground, train and traffic of a region, on the draft's map. The draft's own train and traffic replace the region's. */
export const previewSite = (file: MapFile, looksLike: RegionId): Site => {
  const site = SITES[looksLike];
  return { ...site, map: PREVIEW_MAP, train: file.settings.train.map((piece) => `train/${piece}.glb`), traffic: file.settings.traffic };
};
