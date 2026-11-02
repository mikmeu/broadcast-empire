// The map editor's preview (0.21.0, #284): the draft's layout is put on the town layouts' list as `editor-preview`, so Town.tsx
// can draw it like any town, and taken off again when the editor closes. A map that cannot be laid out keeps the last good one.
// The editor still draws maps of the older format (#327): the preview of a draft converts it first, with the seed of the default towns and the look it borrows.

import type { Building } from '../config/office';
import type { RegionId } from '../config/world';
import { SITES, siteOn, trainFiles, type Site } from '../office/sites';
import { PREVIEW_MAP, houseOf, layoutFromMap, setPreviewDecor, setPreviewLayout } from '../office/townLayout';
import type { MapFile } from './mapFile';
import { TOWN_SEED, convertOldMap, lookRegionOf } from './oldMap';
import type { OldMapFile } from './oldMapFile';

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

/** Like `showPreviewMap`, for a draft of the map editor (the older format): converted first. */
export function showDraftPreview(draft: OldMapFile, given?: Building, looksLike: RegionId = lookRegionOf(draft)): MapShown {
  const converted = convertOldMap(draft, { seed: TOWN_SEED, region: looksLike, building: given });
  return converted.ok ? showPreviewMap(converted.file, given) : { ok: false, reason: `The town cannot be drawn yet: ${converted.reason}` };
}

/** A decor edit of the 3D map editor (#328): the preview's layout stays and only its houses, trees, lamps, hills, peaks and flat ground are replaced. False when nothing is shown yet. */
export const updatePreviewDecor = (file: MapFile): boolean => setPreviewDecor(file);

/** Takes the draft off the list. */
export const stopPreviewMap = (): void => setPreviewLayout(null);

/** The look a preview borrows: the buildings, ground, train and traffic of a region, on the map. The map's own train, traffic and scale replace the region's. */
export const previewSite = (file: MapFile, looksLike: RegionId): Site => ({ ...siteOn(SITES[looksLike], file), map: PREVIEW_MAP });

/** Like `previewSite`, for a draft of the map editor: the draft's own train and traffic replace the region's. */
export const draftSite = (draft: OldMapFile, looksLike: RegionId): Site => ({ ...SITES[looksLike], train: trainFiles(draft.settings.train), traffic: draft.settings.traffic, map: PREVIEW_MAP });
