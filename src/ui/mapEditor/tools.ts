// The tools of the map editor (0.21.0, #284): what is on the palette, what each one puts down and what it still lacks in the game.

import { PLACEABLE } from '../../office/sites';
import type { Kind, StreetKind } from '../../mods/mapDraft';

export type ToolId = 'select' | StreetKind | Exclude<Kind, 'lane'>;

export interface Tool {
  id: ToolId;
  label: string;
  /** A line under the palette while the tool is chosen. */
  hint: string;
  /** What the game does not do with it yet: shown beside the hint. */
  note?: string;
}

export interface ToolGroup {
  title: string;
  tools: Tool[];
}

const ROADS_ONLY = 'Only in a town of roads: one such lane in a grid makes the whole town laid out by its roads.';
const GRID_ONLY = 'Only in a town laid out as a grid: a town of roads drives all its roads both ways.';

export const TOOL_GROUPS: ToolGroup[] = [
  {
    title: 'Streets',
    tools: [
      { id: 'two-way', label: 'Two-way', hint: 'Drag along a street. Two lanes of 2 tiles, one each way. A grid has them across the whole map.', note: GRID_ONLY },
      { id: 'one-way', label: 'One-way', hint: 'Drag the way the traffic goes. Two lanes of 2 tiles, both going that way.', note: GRID_ONLY },
      { id: 'dual', label: 'Dual', hint: 'Drag along the road. Two carriageways a tile apart; the game drives on the right.', note: GRID_ONLY },
      { id: 'road', label: 'Road', hint: 'Drag along a road. One lane of 2 tiles, both ways. A town of roads has each road with its own ends.', note: ROADS_ONLY },
      { id: 'driveway', label: 'Driveway', hint: 'Drag along a driveway. One lane of 1 tile, paved, with no traffic.', note: ROADS_ONLY },
    ],
  },
  {
    title: 'Railway',
    tools: [{ id: 'railway', label: 'Railway', hint: 'Drag a box for the track. A map has one. Elevated or at ground level is in the settings.', note: 'A railway at ground level is drawn like an elevated one until a later version (#288).' }],
  },
  {
    title: 'Paint',
    tools: [
      { id: 'green', label: 'Green', hint: 'Drag a box of grass.' },
      { id: 'concrete', label: 'Concrete', hint: 'Drag a box of flat pavement.' },
      { id: 'beach', label: 'Beach', hint: 'Drag a box of sand.' },
      { id: 'water', label: 'Water', hint: 'Drag a box of water: a lake, the sea or a river.' },
    ],
  },
  {
    title: 'The office',
    tools: [
      { id: 'wing', label: 'Wing', hint: 'Drag a box where the building stands. The wings together are the building’s ground.', note: 'The wings do not shape the building yet: the town stands on the standard or the hills building (#289).' },
      { id: 'reception', label: 'Reception', hint: 'Drag the box of the reception. A map has one.' },
      { id: 'parking', label: 'Parking strip', hint: 'Drag a box for a parking strip. The one nearest the door is the lot.' },
      { id: 'busStop', label: 'Bus stop', hint: 'Click on the kerb where the bus stops. Used when the settings put the stop where it is drawn.' },
      { id: 'courtyardParking', label: 'Courtyard parking', hint: 'Drag a parking strip inside the U of the building.' },
      { id: 'courtyardGreen', label: 'Courtyard green', hint: 'Drag the grass inside the U.' },
      { id: 'fountain', label: 'Fountain', hint: 'Click where the fountain stands in the courtyard. A map has one.' },
      { id: 'alley', label: 'Alley', hint: 'Drag a box of asphalt with no traffic.' },
    ],
  },
  {
    title: 'Objects',
    tools: [
      { id: 'building', label: 'Houses and buildings', hint: 'Drag a band. The town fills it with the houses or buildings of the look it is given.' },
      { id: 'model', label: 'One house or building', hint: 'Click to stand the chosen model on a tile. Pick the model and its turn below.' },
      { id: 'mountains', label: 'Mountains', hint: 'Drag a box of mountain. The one furthest north is the range behind the town.' },
      { id: 'tree', label: 'Tree', hint: 'Click to plant a tree.', note: 'A map with a tree in it has none of the game’s own. One that would hide the office is left out.' },
      { id: 'lamp', label: 'Lamp', hint: 'Click to put up a street lamp.', note: 'A map with a lamp in it has none of the game’s own. One that would hide the office is left out.' },
    ],
  },
];

export const TOOLS: Tool[] = [{ id: 'select', label: 'Select', hint: 'Click a thing to select it. Drag it to move it, drag a handle to change it, Delete removes it. Drag the background to move the plan.' }, ...TOOL_GROUPS.flatMap((g) => g.tools)];

export const toolOf = (id: ToolId): Tool => TOOLS.find((t) => t.id === id)!;

/** What a tool puts down: a kind of thing, or a street. */
export const STREET_TOOLS: readonly ToolId[] = ['two-way', 'one-way', 'dual', 'road', 'driveway'];
export const isStreet = (id: ToolId): id is StreetKind => STREET_TOOLS.includes(id);

/** The names of the kinds, for the form of a selected thing. */
export const KIND_NAMES: Record<Kind, string> = {
  lane: 'Lane',
  building: 'Houses and buildings',
  alley: 'Alley',
  mountains: 'Mountains',
  green: 'Green',
  concrete: 'Concrete',
  beach: 'Beach',
  water: 'Water',
  parking: 'Parking strip',
  wing: 'Wing',
  courtyardParking: 'Courtyard parking',
  courtyardGreen: 'Courtyard green',
  reception: 'Reception',
  railway: 'Railway',
  busStop: 'Bus stop',
  fountain: 'Fountain',
  tree: 'Tree',
  lamp: 'Lamp',
  model: 'House or building',
};

const FOLDERS: Record<string, string> = { city: 'City', suburban: 'Suburb', industrial: 'Industry' };

/** `suburban/building-type-a.glb` is “Suburb a”; the kit's folder and the model's own letter. */
export const modelName = (file: string): string => {
  const [folder = '', name = ''] = file.replace(/\.glb$/, '').split('/');
  return `${FOLDERS[folder] ?? folder} ${name.replace(/^building-(type-)?/, '')}`;
};

export const MODEL_OPTIONS: readonly (readonly [string, string])[] = PLACEABLE.map((m) => [m.file, modelName(m.file)] as const);
