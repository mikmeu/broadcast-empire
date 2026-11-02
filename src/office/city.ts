// The town around the office: which building stands on which block, where the
// streets are and when a train passes. Pure: everything is written in the town's
// map file (src/config/maps, format 2): every game in a region has the same town,
// with the same houses, trees, lamps and hills. What drives in the streets is in traffic.ts.

import { BUILDINGS, westOf, widthOf, type Building } from '../config/office';
import { CITY, NATURE, type CityBuilding } from './assets';
import { LAMP_HEIGHT, PAVEMENT, clearance } from './clearance';
import { SITES, placeable, type Ground, type Site } from './sites';
import type { MapGround } from '../mods/mapFile';
import { CAPITAL, OFFICE_ROWS, layoutOf, touchesGrid, type Layout, type MapParts, type Street } from './townLayout';

export { LAMP_HEIGHT, PAVEMENT, clearance };

export interface TownBuilding {
  building: CityBuilding;
  /** Where its middle stands, in floor tiles. */
  x: number;
  z: number;
  /** Quarter turns. */
  turn: number;
}

/** A piece of a foothill: drawn `scale` times the size of its model. */
export interface HillPiece extends TownBuilding {
  scale: number;
}

/** A peak of the range behind the town: a faceted cone, green at its foot and rock above. */
export interface RangePeak {
  /** Middle of its foot, in floor tiles. */
  x: number;
  z: number;
  radius: number;
  height: number;
  /** Sides of the cone, and how far it is turned round. */
  sides: number;
  angle: number;
}

/** A block of the town: what it is covered with and what stands on it. */
export interface TownBlock {
  /** Its place in the grid of blocks; the office's own block starts at 0, 0. */
  i: number;
  j: number;
  /** Middle of the block, in floor tiles. */
  x: number;
  z: number;
  ground: Ground;
  /** The building, the things in a yard, or the trees. */
  items: TownBuilding[];
  /** Foothills on the block: pieces of the Nature Kit that overlap with those of the blocks beside it. */
  hill?: HillPiece[];
  /**
   * For open land: the ground it covers, by its middle and its size. It runs
   * on into the blocks beside it, and stops short only of a street with traffic.
   */
  land?: { x: number; z: number; w: number; d: number };
  /** For a block of a town laid out from a drawing: the whole cell from kerb to kerb, by its middle and its size. */
  rect?: { x: number; z: number; w: number; d: number };
  /** The alleyways on it: paved strips with no traffic, by their middle and size. */
  alleys?: { x: number; z: number; w: number; d: number }[];
  /** On a green strip: where the lamp posts stand (see `streetside`). */
  lamps?: { x: number; z: number }[];
  /** A strip down the middle of a dual carriageway: grass inside a kerb, not pavement. */
  median?: boolean;
}

/** Whether a lamp post at this spot hides the office once the view is turned `viewTurn` quarter turns. */
export const lampHides = (lamp: { x: number; z: number }, viewTurn: number, building: Building = BUILDINGS.standard) =>
  hidesOffice({ building: { file: '', w: 0.6, d: 0.6, height: LAMP_HEIGHT }, ...lamp, turn: 0 }, viewTurn, 1, building);

/** How far below the office floor the streets are, in tiles: floor 1 is the ground floor. */
export const streetLevel = (floor: number) => CITY.streetBelow + CITY.perFloor * (floor - 1);

/**
 * The office's own block (townLayout.ts): in a grid of blocks the building
 * stands in the middle of it, two town blocks deep and four wide for the
 * standard building. The long building takes a fifth: its block reaches one
 * further east, over what is a side street elsewhere, and the rest of the
 * town is where it always is. (This grid is for the tests now: every region
 * has a drawing.) In a town laid out from a drawing it is the
 * company's ground from alley to alley, between the streets beside it.
 */
export const officeBlock = (building: Building = BUILDINGS.standard, layout: Layout = CAPITAL) => layout.own(building);

/** The block of the standard building in the capital. Its west side is that of every building's block. */
export const OFFICE_BLOCK = officeBlock();

/**
 * The company's parking lot (0.20.0). In a grid of blocks the two town blocks
 * beside the office's own block, to the east, are one lot, with the kerb of the
 * streets around it; it takes the place of what the town would have built there.
 * In a town laid out from a drawing it stands in the courtyard of the U.
 */
export const lotBlock = (building: Building = BUILDINGS.standard, layout: Layout = CAPITAL) => layout.lot(building).block;

/** Whether a block of the grid is part of the parking lot. */
export const isLot = (i: number, j: number, building: Building = BUILDINGS.standard) => i === building.blocks && j >= 0 && j < OFFICE_ROWS;


/**
 * Whether something in town hides part of the ground floor once the view is
 * turned `viewTurn` quarter turns. The town is laid out for the first view, so
 * from the other three sides whatever ends up in front is left out. `scale`
 * is how many times their own size the site's buildings are drawn.
 */
export function hidesOffice(item: TownBuilding, viewTurn: number, scale: number = CITY.scale, building: Building = BUILDINGS.standard): boolean {
  const t = ((viewTurn % 4) + 4) % 4;
  const w = (item.turn % 2 === 0 ? item.building.w : item.building.d) * scale;
  const d = (item.turn % 2 === 0 ? item.building.d : item.building.w) * scale;
  // Seen from another side, "in front" is the mirror image of the first view.
  const x = t <= 1 ? item.x : 2 * westOf(building) + widthOf(building) - item.x;
  const z = t === 0 || t === 3 ? item.z : building.depth - item.z;
  return item.building.height * scale + PAVEMENT > clearance(x, z, w, d, building);
}

/**
 * The streets that carry traffic: the ones beside and in front of the office.
 * The ones behind it are hidden by buildings, the one under the railway is no
 * road at all, and the last street to the east is left empty, so that a
 * vehicle has a stretch of road to itself when it comes into town.
 */
export function busyStreets(building: Building = BUILDINGS.standard, layout: Layout = CAPITAL): Street[] {
  return layout.busy(building);
}


/** The trees of the suburban kit, as things that stand in town. */
export const TREES: CityBuilding[] = [
  { file: 'suburban/tree-large.glb', w: 0.3, height: 0.77, d: 0.3 },
  { file: 'suburban/tree-small.glb', w: 0.3, height: 0.57, d: 0.3 },
];

/** What a file of a map names: a building of the kits, a tree or a piece of a foothill; undefined if the game has no such model. */
export function modelOf(file: string): CityBuilding | undefined {
  return placeable(file) ?? TREES.find((tree) => tree.file === file) ?? NATURE.foothills.find((hill) => hill.file === file);
}

/** A ground box as a block: by its middle, and drawn as the kind of ground it is. */
const blockOf = (g: MapGround, n: number): TownBlock => {
  const mid = { x: g.x + g.w / 2, z: g.z + g.d / 2, w: g.w, d: g.d };
  // A slab with a kerb (the blocks of a grid, a strip between two carriageways), water and sand lie as blocks of their own; open land runs on and lies lower.
  const own = g.edge === true || g.kind === 'water' || g.kind === 'sand';
  const median = g.kind === 'grass' && g.edge === true && Math.min(g.w, g.d) < 6;
  return { i: n, j: 0, x: mid.x, z: mid.z, ground: (median ? 'pavement' : g.kind) as Ground, items: [], ...(own ? { rect: mid } : { land: mid }), ...(median && { median }) };
};

/** The things a town writes down as standing: its houses and its trees, as what the town draws. */
export function itemsOf(parts: Pick<MapParts, 'houses' | 'trees'>): TownBuilding[] {
  return [
    ...parts.houses.flatMap((h) => {
      const building = modelOf(h.model);
      return building ? [{ building, x: h.x, z: h.z, turn: h.turn }] : [];
    }),
    ...parts.trees.flatMap((t) => {
      const building = modelOf(t.model);
      return building ? [{ building, x: t.x, z: t.z, turn: 0 }] : [];
    }),
  ];
}

/** The pieces of foothill a town writes down. */
export function hillsOf(parts: MapParts): HillPiece[] {
  return parts.hills.flatMap((h) => {
    const building = modelOf(h.model);
    return building ? [{ building, x: h.x, z: h.z, turn: h.turn, scale: h.scale }] : [];
  });
}

/**
 * The blocks of a town, for the site its headquarters are on: one for each box of ground the map paints (the paving and kerbs of the cells and the
 * plots, the grass between two carriageways, sand, water and fields), with what stands on it: its houses, trees, lamps and foothills, each on the
 * smallest block that holds its middle, or the nearest. Ground that lies flat (concrete, asphalt) and the land that runs on out of sight are no blocks.
 * Nothing is chosen here: it is all in the file (#327).
 */
export function townBlocks(site: Site = SITES.capital, _building: Building = BUILDINGS.standard): TownBlock[] {
  const parts = layoutOf(site).map;
  if (!parts) return [];
  const painted = parts.ground.filter((g) => g.kind !== 'concrete' && g.kind !== 'asphalt' && !touchesGrid(g));
  const blocks = painted.map(blockOf);
  if (blocks.length === 0) {
    // A town with no painted blocks still draws what stands in it (the map editor can place a house on a bare map, #328): on a block of no size.
    if (parts.houses.length + parts.trees.length + parts.hills.length + parts.lamps.length === 0) return blocks;
    blocks.push({ i: 0, j: 0, x: 0, z: 0, ground: 'grass', items: [], land: { x: 0, z: 0, w: 0, d: 0 } });
  }
  const area = (b: TownBlock) => (b.rect ?? b.land)!.w * (b.rect ?? b.land)!.d;
  /** The block a point stands on. */
  const under = (p: { x: number; z: number }): TownBlock => {
    const holding = blocks.filter((b) => {
      const r = (b.rect ?? b.land)!;
      return Math.abs(p.x - r.x) <= r.w / 2 + 0.01 && Math.abs(p.z - r.z) <= r.d / 2 + 0.01;
    });
    // (A strip between two carriageways holds no houses: they are on the block they stand within, even where one reaches over the strip.)
    const wide = holding.filter((b) => !b.median);
    if (holding.length > 0) return (wide.length > 0 ? wide : holding).reduce((a, b) => (area(b) < area(a) ? b : a));
    return blocks.reduce((a, b) => (Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? b : a));
  };
  for (const item of itemsOf(parts)) under(item).items.push(item);
  for (const piece of hillsOf(parts)) (under(piece).hill ??= []).push(piece);
  for (const lamp of parts.lamps) (under(lamp).lamps ??= []).push({ x: lamp.x, z: lamp.z });
  return blocks;
}

/** The buildings of a game's town: everything that stands on its blocks. */
export const townBuildings = (site: Site = SITES.capital, building: Building = BUILDINGS.standard): TownBuilding[] => townBlocks(site, building).flatMap((block) => block.items);

/**
 * The range behind the town: the peaks the map writes down, each a faceted cone, green at its foot and rock above. Only in the hills.
 */
export function rangeOf(site: Site, _office: Building = BUILDINGS.standard): RangePeak[] {
  return layoutOf(site).map?.peaks.map((p) => ({ ...p })) ?? [];
}

/** Middle lines of the streets: every block edge except the ones inside the office's own block. */
export function streets(building: Building = BUILDINGS.standard, layout: Layout = CAPITAL): { along: 'x' | 'z'; at: number }[] {
  return layout.streets(building);
}

// --- The railway ---

/** The length of a piece of rolling stock in the kit's units (`CITY.railway.cars`); a piece it has none for is spaced as the longest. */
const carLengthOf = (file: string) => CITY.railway.cars[file] ?? Math.max(...Object.values(CITY.railway.cars));

/** Where each piece of a train stands (0.21.0, #287): the middle of the piece behind the front, in tiles, and how long it is, in tiles. The pieces trail one after the other. */
export function carSpots(files: readonly string[]): { file: string; at: number; length: number }[] {
  const { scale } = CITY.railway;
  let before = 0;
  return files.map((file) => {
    const length = carLengthOf(file) * scale;
    const spot = { file, at: -(before + length / 2), length };
    before += length;
    return spot;
  });
}

/** Length of a train of these pieces (files of `CITY.railway.cars`), in tiles. */
export const trainLength = (files: readonly string[]) => files.reduce((sum, file) => sum + carLengthOf(file) * CITY.railway.scale, 0);

/** Whether a train is a goods train: it has a carriage of the kit's goods wagons. */
export const isGoodsTrain = (files: readonly string[]) => files.some((file) => file.includes('train-carriage-'));

/**
 * Where the train is `time` seconds in: the position of its front on the
 * line and the way it is going, or null between trains. Trains alternate
 * direction and run the whole line, entering and leaving out of sight.
 */
export function trainAt(time: number, cars: readonly string[], layout: Layout = CAPITAL): { x: number; direction: 1 | -1 } | null {
  const { every, speed } = CITY.railway;
  const railway = layout.railway;
  const pass = Math.floor(time / every);
  const travelled = (time - pass * every) * speed;
  const length = trainLength(cars);
  if (travelled > railway.length + length) return null;
  const direction = pass % 2 === 0 ? 1 : -1;
  return { x: direction > 0 ? railway.from + travelled : railway.from + railway.length - travelled, direction };
}

// --- Arrows on the one-way streets (#235) ---

/** An arrow is this long and this wide, in tiles: it fits a lane of 2. */
export const ARROW = { length: 1.6, width: 0.6 };
/** The first arrow of a stretch stands this far before the kerb of the crossing ahead, the others every `ARROW_EVERY` tiles back from it. */
export const ARROW_BEFORE = 5;
export const ARROW_EVERY = 20;
/** A stretch between two crossings shorter than this gets no arrow. */
const ARROW_MIN_STRETCH = 8;

/** An arrow on the road: its middle, the axis its lane runs along and which way it points along it (1 towards larger x or z). */
export interface Arrow {
  x: number;
  z: number;
  along: 'x' | 'z';
  direction: 1 | -1;
}

/**
 * The arrows of Coax City's one-way streets, one in each lane: a fixed distance before each crossing, and every 20 tiles back along a long
 * stretch, pointing the way the lane is driven (the directions of the traffic, see `driven` in townLayout.ts). A road has arrows when its file says so (Coax City's do).
 */
export function arrowsOf(layout: Layout): Arrow[] {
  const map = layout.map;
  if (!map) return [];
  const out: Arrow[] = [];
  for (const street of map.oneWays) {
    const vertical = street.along === 'z';
    const half = (street.width ?? layout.streetWidth) / 2;
    // The stretches between the crossings, kerb to kerb: the rows (or columns) of cells that touch the street.
    const touching = map.cells.filter((c) => (vertical ? Math.abs(c.x + c.w - (street.at - half)) < 0.01 || Math.abs(c.x - (street.at + half)) < 0.01 : Math.abs(c.z + c.d - (street.at - half)) < 0.01 || Math.abs(c.z - (street.at + half)) < 0.01));
    const stretches = new Map<number, [number, number]>();
    for (const c of touching) stretches.set(vertical ? c.z : c.x, vertical ? [c.z, c.z + c.d] : [c.x, c.x + c.w]);
    for (const [a, b] of stretches.values()) {
      if (b - a < ARROW_MIN_STRETCH) continue;
      for (const lane of street.lanes ?? []) {
        for (let n = 0; ; n++) {
          const at = lane.direction === 1 ? b - ARROW_BEFORE - n * ARROW_EVERY : a + ARROW_BEFORE + n * ARROW_EVERY;
          if (n > 0 && (lane.direction === 1 ? at < a + ARROW_BEFORE : at > b - ARROW_BEFORE)) break;
          out.push(vertical ? { x: lane.at, z: at, along: 'z', direction: lane.direction } : { x: at, z: lane.at, along: 'x', direction: lane.direction });
        }
      }
    }
  }
  return out;
}

/** The turn of a lamp post put down by hand: its arm (the lamp's -z, see StreetLamp.tsx) points over the nearest carriageway, and to the north where the town has none. */
export function lampTurn(lamp: { x: number; z: number }, carriageways: readonly { x: number; z: number; w: number; d: number }[]): number {
  let best: { gap: number; dx: number; dz: number } | null = null;
  for (const r of carriageways) {
    // The way to the nearest point of the road: along the axis it is further off on.
    const ox = lamp.x < r.x ? r.x - lamp.x : lamp.x > r.x + r.w ? r.x + r.w - lamp.x : 0;
    const oz = lamp.z < r.z ? r.z - lamp.z : lamp.z > r.z + r.d ? r.z + r.d - lamp.z : 0;
    const gap = Math.hypot(ox, oz);
    if (best && gap >= best.gap) continue;
    // Lamp on the road: it points at the road's nearer edge.
    best = Math.abs(ox) >= Math.abs(oz) ? { gap, dx: Math.sign(ox), dz: 0 } : { gap, dx: 0, dz: Math.sign(oz) };
  }
  return best && (best.dx !== 0 || best.dz !== 0) ? Math.atan2(0 - best.dx, 0 - best.dz) : 0;
}
