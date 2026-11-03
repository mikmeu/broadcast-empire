// The tools of the map editor (0.21.0, #284, in 3D from #328): what is on the palette and what each one puts down.

import { PLACEABLE } from '../../office/sites';
import type { PaintKind } from '../../mods/townDraft';
import type { StructureTool } from '../../mods/townStructure';

export type TownToolId = 'select' | 'house' | 'tree' | 'lamp' | 'hill' | 'fill' | 'ground' | 'walk' | StructureTool;

export interface TownTool {
  id: TownToolId;
  label: string;
  hint: string;
}

export interface TownToolGroup {
  title: string;
  tools: readonly TownTool[];
}

const TAKES = ' What stands in the way is taken away; undo brings it back.';

export const TOWN_SELECT: TownTool = {
  id: 'select',
  label: 'Select',
  hint: 'Click a thing or a part of the structure to select it; drag it to move it by whole tiles (Shift: freely, for decor). Drag its corners to change it. Drag the empty ground to move the picture. R turns it, Delete removes it.',
};

export const TOWN_TOOL_GROUPS: readonly TownToolGroup[] = [
  {
    title: 'Decor',
    tools: [
      { id: 'house', label: 'House', hint: 'Click to stand the chosen house or building on a tile. Shift places it freely. R turns it. It is red where it cannot stand.' },
      { id: 'tree', label: 'Tree', hint: 'Click to plant the chosen tree. Shift places it freely.' },
      { id: 'lamp', label: 'Lamp', hint: 'Click to put up a street lamp. Shift places it freely.' },
      { id: 'hill', label: 'Hill', hint: 'Click to put down a piece of hill, as a house. R turns it.' },
      { id: 'fill', label: 'Fill', hint: 'Drag a box, and it is filled with the chosen brush: houses wall to wall facing the nearest road, or trees about 3 tiles apart. What it picks is written in the file. Undo, and drag again, for another pick.' },
      { id: 'ground', label: 'Ground', hint: 'Drag a box of the chosen ground. It cuts what is painted under it. Base gives the green back.' },
    ],
  },
  {
    title: 'Streets',
    tools: [
      { id: 'road', label: 'Road', hint: `Drag along a road, the way its traffic goes. A grid’s road runs the whole town; a road of a town of roads has the ends you drag, and snaps to a road it reaches and to the edge.${TAKES}` },
      { id: 'block', label: 'Block', hint: `Drag a block of ground with a kerb. Click a block to select it.${TAKES}` },
      { id: 'edge', label: 'Edge', hint: 'Drag the box a town of roads lies in: vehicles come in from roads that start on it. Click inside it to select it.' },
    ],
  },
  {
    title: 'Railway',
    tools: [{ id: 'rail', label: 'Railway', hint: `Drag along the track, east to west. A map has one, so this moves it.${TAKES}` }],
  },
  {
    title: 'The office',
    tools: [
      { id: 'wing', label: 'Wing', hint: `Drag a box where the building stands, on whole tiles. Nothing lies north of z = 0, and something stands on it. The rules of the building stay as they are.${TAKES}` },
      { id: 'reception', label: 'Reception', hint: `Drag the box of the reception. A map has one, so this moves it. The entrance faces the side of it that is open.${TAKES}` },
    ],
  },
  {
    title: 'Routes',
    tools: [
      { id: 'via', label: 'Go via', hint: 'Click a road that carries traffic. The bus drives past the points in the order you put them down, on its way to its stop, up to 8. It must reach each one, and each must come before the stop. Select a point to move or remove it.' },
      { id: 'walk', label: 'Walking path', hint: 'Click from point to point (Shift: freely); double-click or Enter finishes, Escape drops it. People walk to the end of it and back. A stretch that would cross a road, the track or the office goes red and is refused.' },
    ],
  },
  {
    title: 'Stops and lot',
    tools: [
      { id: 'bus', label: 'Bus stop', hint: 'Click a road that carries traffic. The stop goes to the middle of the tile (Shift: freely). A map has one, so this moves it.' },
      { id: 'taxi', label: 'Taxi stand', hint: 'Click a road that carries traffic. The stand goes to the middle of the tile (Shift: freely). A map has one, so this moves it.' },
      { id: 'lot', label: 'Lot', hint: `Drag the ground of the company’s parking lot. It opens onto the nearest road. A map has one, so this moves it.${TAKES}` },
      { id: 'strip', label: 'Parking strip', hint: 'Drag a strip of bays. One inside the wings goes in the courtyard too.' },
      { id: 'green', label: 'Courtyard green', hint: 'Drag the grass between the strips. One inside the wings goes in the courtyard too.' },
      { id: 'fountain', label: 'Fountain', hint: 'Click where the fountain stands. A map has one or none.' },
    ],
  },
];

export const TOWN_TOOLS: readonly TownTool[] = [TOWN_SELECT, ...TOWN_TOOL_GROUPS.flatMap((g) => g.tools)];

export const townToolOf = (id: TownToolId): TownTool => TOWN_TOOLS.find((t) => t.id === id)!;

export const PAINT_NAMES: Record<PaintKind, string> = { grass: 'Grass', field: 'Field', water: 'Water', sand: 'Sand', concrete: 'Concrete', asphalt: 'Asphalt', base: 'Base' };

const FOLDERS: Record<string, string> = { city: 'City', suburban: 'Suburb', industrial: 'Industry' };

/** `suburban/building-type-a.glb` is “Suburb a”; the kit's folder and the model's own letter. */
export const modelName = (file: string): string => {
  const [folder = '', name = ''] = file.replace(/\.glb$/, '').split('/');
  return `${FOLDERS[folder] ?? folder} ${name.replace(/^building-(type-)?/, '')}`;
};

export const MODEL_OPTIONS: readonly (readonly [string, string])[] = PLACEABLE.map((m) => [m.file, modelName(m.file)] as const);
