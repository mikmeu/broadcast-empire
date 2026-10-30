// The town around the office: which building stands on which block, where the
// streets are and when a train passes. Pure: everything follows from the game's
// seed, so each game has its own town, the same every time it is opened. What
// drives in the streets is in traffic.ts.

import { BUILDINGS, westOf, widthOf, type Building } from '../config/office';
import { CITY, NATURE, type CityBuilding } from './assets';
import { SITES, SITE_YARD, type Ground, type Site } from './sites';
import { BLOCKS, CAPITAL, OFFICE_ROWS, layoutOf, type Layout, type Rect, type Street } from './townLayout';

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

/** How tall a street lamp post stands (StreetLamp.tsx), and how far from the kerb of a green strip, and how far apart along it. */
export const LAMP_HEIGHT = 2.4;
const LAMP_INSET = 0.8;
const LAMP_EVERY = 8;

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

/** A pseudo-random number from 0 to 1 for a block, fixed for a game's seed. */
function chance(seed: number, i: number, j: number, salt: number): number {
  let h = (i * 374761393 + j * 668265263 + salt * 2147483647 + Math.imul(seed | 0, 1597334677)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Whether a block is part of the office's own block. */
const isOffice = (i: number, j: number, building: Building) => i >= 0 && i < building.blocks && j >= 0 && j < OFFICE_ROWS;

/** How far the pavement is above the street. */
export const PAVEMENT = 0.2;

/** The room for a building on a block: the block without the half streets around it, and a little pavement. */
const PAD = { w: CITY.block.w - CITY.streetWidth - 0.3, d: CITY.block.d - CITY.streetWidth - 0.3 };

/**
 * How tall something standing at (x, z) with this footprint can be before it
 * hides part of the ground floor. The view looks down a diagonal, so a
 * building in front hides whatever lies as far behind it as it is tall.
 * Infinity for buildings that aren't in front of the office at all.
 */
export function clearance(x: number, z: number, w: number, d: number, building: Building = BUILDINGS.standard): number {
  const nearX = x - w / 2;
  const nearZ = z - d / 2;
  if (nearX + w <= westOf(building) || nearZ + d <= 0) return Infinity;
  return Math.max(nearX - building.w, nearZ - building.depth);
}

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

/**
 * The ground a block of open land covers: the whole block, less half a street
 * on the sides where traffic drives. The shore and the water are `closed`: no
 * side street runs on into them.
 */
function landOf(i: number, j: number, building: Building, layout: Layout, closed = false): TownBlock['land'] {
  const busy = busyStreets(building, layout);
  const half = layout.streetWidth / 2;
  const own = layout.own(BUILDINGS.standard);
  const edge = (along: 'x' | 'z', at: number) => (!(closed && along === 'z') && busy.some((street) => street.along === along && Math.abs(street.at - at) < 0.01) ? half : 0);
  const west = own.x + i * CITY.block.w;
  const north = own.z + j * CITY.block.d;
  const [left, right] = [west + edge('z', west), west + CITY.block.w - edge('z', west + CITY.block.w)];
  const [top, bottom] = [north + edge('x', north), north + CITY.block.d - edge('x', north + CITY.block.d)];
  return { x: (left + right) / 2, z: (top + bottom) / 2, w: right - left, d: bottom - top };
}

/** Rows of open land in front of the last street, for the sites that have a beach, a lake or fields there. */
const FRONT_ROWS = 2;

/**
 * The blocks of a game's town, for the site its headquarters are on:
 *
 * - Around the office every block is built up with buildings of the site's
 *   kit (see `builtUp`), which in front of the office stay low enough not to
 *   hide it; where houses have gardens a block is one house with its trees.
 *   Behind the office a share of the blocks gets taller buildings, and on
 *   industrial sites some are yards with tanks, containers or a chimney.
 * - On sites in the countryside the blocks further out are open land: fields,
 *   or grass with trees and, behind the office, hills.
 * - In front of the last street such sites have fields, or a shore with the
 *   water behind it. The side streets end at the street along the shore, and
 *   the shore closes over their ends: the traffic turns there (traffic.ts).
 */
export function townBlocks(seed: number, site: Site = SITES.capital, building: Building = BUILDINGS.standard): TownBlock[] {
  const layout = layoutOf(site);
  if (layout.map) return layout.map.roads.length > 0 ? roadBlocks(seed, site, building, layout) : mapBlocks(seed, site, building, layout);
  const blocks: TownBlock[] = [];
  const { scale } = site;
  const lastRow = BLOCKS.toZ + (site.front ? FRONT_ROWS : 0);
  const base = layout.own(BUILDINGS.standard);
  for (let i = BLOCKS.fromX; i <= BLOCKS.toX; i++) {
    for (let j = BLOCKS.fromZ; j <= lastRow; j++) {
      if (isOffice(i, j, building) || isLot(i, j, building)) continue;
      const x = base.x + (i + 0.5) * CITY.block.w;
      const z = base.z + (j + 0.5) * CITY.block.d;
      const inFront = i >= 0 && j >= 0;
      if (j > BLOCKS.toZ) {
        // By the water the shore comes first, with the side streets ending on it, and the water behind it.
        const ground = (j === BLOCKS.toZ + 1 && site.shore) || site.front!;
        // Trees on a green bank.
        const trees = ground === 'grass' ? treesOn(seed, i, j, x, z, 4, site, building) : [];
        blocks.push({ i, j, x, z, ground, items: trees, land: landOf(i, j, building, layout, site.front === 'water') });
        continue;
      }
      if (site.far && (i <= -2 || j <= -2)) {
        const hill = site.hills && j <= -2 && chance(seed, i, j, 11) < 0.8 ? hillOn(seed, i, j, x, z, building) : undefined;
        const trees = site.far === 'grass' && !hill ? treesOn(seed, i, j, x, z, 5, site, building) : [];
        blocks.push({ i, j, x, z, ground: site.far, items: trees, land: landOf(i, j, building, layout), ...(hill && { hill }) });
        continue;
      }
      if (!inFront && chance(seed, i, j, 14) < site.yards) {
        blocks.push({ i, j, x, z, ground: site.ground, items: yardOn(seed, i, j, x, z, site, building) });
        continue;
      }
      const tall = !inFront && chance(seed, i, j, 1) < site.tallShare;
      const kit = site.frontRow && j >= OFFICE_ROWS ? site.frontRow : tall ? site.tall : site.low;
      // Where houses have gardens a block is one house with its trees; elsewhere it is built up.
      const built = site.trees > 0 ? [] : builtUp(seed, i, j, x, z, kit, kit === site.tall ? [...site.tall, ...site.low] : kit, scale, building);
      const items: TownBuilding[] = built.length > 0 ? built : oneBuilding(seed, i, j, x, z, kit, scale, building);
      // Trees in the corners of the garden, where the house leaves room and they hide nothing.
      if (items[0] && site.trees > 0) items.push(...treesOn(seed, i, j, x, z, site.trees, site, building, items[0]));
      blocks.push({ i, j, x, z, ground: site.ground, items });
    }
  }
  return blocks;
}

/**
 * The foothills of a block: a few of the kit's slopes and cliffs, spread over
 * the block and a little beyond it so that they run into those of the next.
 * The further back the block (j = -5 is the last), the larger the pieces.
 */
function hillOn(seed: number, i: number, j: number, x: number, z: number, office: Building): HillPiece[] {
  const row = -2 - j;
  const pieces: HillPiece[] = [];
  for (let n = 0; n < 4; n++) {
    const building = NATURE.foothills[Math.floor(chance(seed, i * 5 + n, j, 21) * NATURE.foothills.length)]!;
    const scale = 2.8 + row * 0.9 + chance(seed, i * 5 + n, j, 22) * 1.2;
    const turn = Math.floor(chance(seed, i * 5 + n, j, 23) * 4);
    // Four around the middle of the block, each moved a little at random.
    const px = x + (n % 2 === 0 ? -1 : 1) * (1.6 + chance(seed, i * 5 + n, j, 24) * 1.2);
    const pz = z + (n < 2 ? -1 : 1) * (1.4 + chance(seed, i * 5 + n, j, 25) * 1.2);
    const [w, d] = turn % 2 === 0 ? [building.w, building.d] : [building.d, building.w];
    // Whatever stands in front of the office stays low enough not to hide it.
    if (building.height * scale + PAVEMENT <= clearance(px, pz, w * scale, d * scale, office)) pieces.push({ building, x: px, z: pz, turn, scale });
  }
  return pieces;
}

/**
 * The range behind the town, on the far mountain rect of its drawing: three rows of
 * peaks, each row higher than the one in front. Fixed by the seed, like the town;
 * only in the hills.
 */
export function rangeOf(seed: number, site: Site, _office: Building = BUILDINGS.standard): RangePeak[] {
  const mountains = site.hills ? (layoutOf(site).map?.mountains ?? []) : [];
  // The far rect is the one furthest north.
  const rect = mountains.reduce<Rect | null>((a, r) => (a && a.z < r.z ? a : r), null);
  if (!rect) return [];
  const peaks: RangePeak[] = [];
  const middle = rect.x + rect.w / 2;
  const rows = [{ out: 12, height: 7, back: 0.85 }, { out: 22, height: 12, back: 0.5 }, { out: 34, height: 17, back: 0.15 }];
  const step = rect.w / 13;
  rows.forEach((row, r) => {
    for (let n = -6; n <= 6; n++) {
      const at = (r * 13 + n) * 31;
      const radius = row.out * 0.6 * (0.75 + chance(seed, n, r, 31) * 0.5);
      peaks.push({
        x: middle + n * step + (chance(seed, n, r, 32) - 0.5) * step * 0.6,
        z: rect.z + rect.d * row.back + (chance(seed, n, r, 33) - 0.5) * 6,
        radius,
        height: row.height * (0.7 + chance(seed, n, r, 34) * 0.6),
        sides: 5 + Math.floor(chance(seed, at, r, 35) * 2),
        angle: chance(seed, n, r, 36) * Math.PI,
      });
    }
  });
  return peaks;
}

/** One building in the middle of a block, turned any way it fits and hides nothing. */
function oneBuilding(seed: number, i: number, j: number, x: number, z: number, kit: readonly CityBuilding[], scale: number, office: Building): TownBuilding[] {
  const options = kit.flatMap((building) =>
    [0, 1, 2, 3].flatMap((turn) => {
      const w = (turn % 2 === 0 ? building.w : building.d) * scale;
      const d = (turn % 2 === 0 ? building.d : building.w) * scale;
      const fits = w <= PAD.w && d <= PAD.d;
      const clear = building.height * scale + PAVEMENT <= clearance(x, z, w, d, office);
      return fits && clear ? [{ building, turn }] : [];
    }),
  );
  const choice = options[Math.floor(chance(seed, i, j, 2) * options.length)];
  return choice ? [{ ...choice, x, z }] : [];
}

/** The room left between two buildings that stand wall to wall. */
const JOIN = 0.04;

/**
 * The buildings of a built-up block, put together the way a town block is: a
 * terrace along a street, wall to wall with the fronts to the pavement, and a
 * second one back to back with it along the street on the other side where
 * the block is deep enough. The terraces run east to west or north to south,
 * whichever way holds more. The first building comes from `kit`, the rest
 * from `fill`, so that a tower gets smaller neighbours.
 */
function builtUp(seed: number, i: number, j: number, x: number, z: number, kit: readonly CityBuilding[], fill: readonly CityBuilding[], scale: number, office: Building): TownBuilding[] {
  const eastWest = chance(seed, i, j, 41) < 0.5;
  // Both ways are tried, and the one that puts more buildings on the block is kept.
  let best: TownBuilding[] = [];
  for (const along of eastWest ? (['x', 'z'] as const) : (['z', 'x'] as const)) {
    // A terrace is `length` long and the block `across` deep; a building takes its width of the one and its depth of the other.
    const [length, across] = along === 'x' ? [PAD.w, PAD.d] : [PAD.d, PAD.w];
    const place = (lengthwise: number, crosswise: number): [x: number, z: number] => (along === 'x' ? [x + lengthwise, z + crosswise] : [x + crosswise, z + lengthwise]);
    // Whether a building is low enough wherever its terrace ends up: at its street, or in the middle if it is the only one.
    const clear = (building: CityBuilding, side: number) =>
      [side * (across / 2 - (building.d * scale) / 2), 0].every((crosswise) => {
        const [bx, bz] = place(0, crosswise);
        const [w, d] = along === 'x' ? [PAD.w, building.d * scale] : [building.d * scale, PAD.d];
        return building.height * scale + PAVEMENT <= clearance(bx, bz, w, d, office);
      });
    const rows: { side: number; buildings: CityBuilding[]; depth: number }[] = [];
    // The side that is built on first is the one with the first pick of the kit.
    const first = chance(seed, i, j, 42) < 0.5 ? 1 : -1;
    for (const side of [first, -first]) {
      const room = across - (rows[0]?.depth ?? 0);
      const buildings: CityBuilding[] = [];
      let left = length;
      for (let n = 0; n < 6; n++) {
        const from = rows.length === 0 && n === 0 ? kit : fill;
        const options = from.filter((building) => building.w * scale <= left && building.d * scale <= room && clear(building, side));
        const pick = options[Math.floor(chance(seed, i * 13 + n, j * 7 + side, 43) * options.length)];
        if (!pick) break;
        buildings.push(pick);
        left -= pick.w * scale + JOIN;
      }
      if (buildings.length > 0) rows.push({ side, buildings, depth: Math.max(...buildings.map((building) => building.d * scale)) });
    }
    const items = rows.flatMap(({ side, buildings }) => {
      // Fronts to the street: south and east face the viewer of the first view.
      const turn = along === 'x' ? (side > 0 ? 0 : 2) : side > 0 ? 1 : 3;
      let at = -(buildings.reduce((sum, building) => sum + building.w * scale, 0) + JOIN * (buildings.length - 1)) / 2;
      return buildings.map((building): TownBuilding => {
        const w = building.w * scale;
        const crosswise = rows.length === 1 ? 0 : side * (across / 2 - (building.d * scale) / 2);
        const [bx, bz] = place(at + w / 2, crosswise);
        at += w + JOIN;
        return { building, x: bx, z: bz, turn };
      });
    });
    if (items.length > best.length) best = items;
  }
  return best;
}

/** The trees of the suburban kit, as things that stand in town. */
const TREES: CityBuilding[] = [
  { file: 'suburban/tree-large.glb', w: 0.3, height: 0.77, d: 0.3 },
  { file: 'suburban/tree-small.glb', w: 0.3, height: 0.57, d: 0.3 },
];

/** Up to `count` trees on a block: in its corners if a house stands on it, anywhere on it if not. */
function treesOn(seed: number, i: number, j: number, x: number, z: number, count: number, site: Site, office: Building, house?: { building: CityBuilding; turn: number }, room: { w: number; d: number } = PAD): TownBuilding[] {
  const trees: TownBuilding[] = [];
  // (A tree is drawn as large as the kit, so it keeps half its width from the edge: 0.4 at scale 3 would be too little at 6.)
  const margin = Math.max(0.4, (TREES[0]!.w * site.scale) / 2 + 0.05);
  const half = { w: room.w / 2 - margin, d: room.d / 2 - margin };
  const w = house ? ((house.turn % 2 === 0 ? house.building.w : house.building.d) * site.scale) / 2 + 0.5 : 0;
  const d = house ? ((house.turn % 2 === 0 ? house.building.d : house.building.w) * site.scale) / 2 + 0.5 : 0;
  for (let n = 0; n < count; n++) {
    if (chance(seed, i * 31 + n, j, 21) < 0.3) continue;
    const building = TREES[Math.floor(chance(seed, i * 31 + n, j, 22) * TREES.length)]!;
    const dx = house ? (n % 2 === 0 ? -1 : 1) * half.w : (chance(seed, i * 31 + n, j, 23) * 2 - 1) * half.w;
    const dz = house ? (n < 2 ? -1 : 1) * half.d : (chance(seed, i * 31 + n, j, 24) * 2 - 1) * half.d;
    // Clear of the house, and not so tall in front of the office that it hides it.
    if (house && Math.abs(dx) < w && Math.abs(dz) < d) continue;
    if (building.height * site.scale + PAVEMENT > clearance(x + dx, z + dz, 1, 1, office)) continue;
    trees.push({ building, x: x + dx, z: z + dz, turn: 0 });
  }
  return trees;
}

/** What stands in a yard of an industrial site: a few tanks, containers or a chimney, side by side. */
function yardOn(seed: number, i: number, j: number, x: number, z: number, site: Site, office: Building): TownBuilding[] {
  const things = SITE_YARD;
  const items: TownBuilding[] = [];
  for (const [n, dx] of [-1.9, -0.6, 0.7, 1.9].entries()) {
    if (chance(seed, i * 17 + n, j, 31) < 0.2) continue;
    const building = things[Math.floor(chance(seed, i * 17 + n, j, 32) * things.length)]!;
    const [w, d] = [building.w * site.scale, building.d * site.scale];
    // Side by side with room between them: the wide ones take two places.
    const dz = (chance(seed, i * 17 + n, j, 33) - 0.5) * 1.2;
    const last = items[items.length - 1];
    if (last && x + dx - w / 2 < last.x + (last.building.w * site.scale) / 2 + 0.15) continue;
    if (Math.abs(dx) + w / 2 > PAD.w / 2 || Math.abs(dz) + d / 2 > PAD.d / 2) continue;
    if (building.height * site.scale + PAVEMENT > clearance(x + dx, z + dz, w, d, office)) continue;
    items.push({ building, x: x + dx, z: z + dz, turn: 0 });
  }
  return items;
}

/** The buildings of a game's town: everything that stands on its blocks. */
export const townBuildings = (seed: number, site: Site = SITES.capital, building: Building = BUILDINGS.standard): TownBuilding[] => townBlocks(seed, site, building).flatMap((block) => block.items);

/** Middle lines of the streets: every block edge except the ones inside the office's own block. */
export function streets(building: Building = BUILDINGS.standard, layout: Layout = CAPITAL): { along: 'x' | 'z'; at: number }[] {
  return layout.streets(building);
}

// --- A town laid out from a drawing ---

/** How far from the kerb the buildings of a block stand back, and the room a yard keeps free in the middle, in tiles. */
const SETBACK = 0.5;
const YARD = 2;
/** The ground in view, in floor tiles: beyond it the buildings of a block are left out. */
const IN_VIEW = { x0: -70, x1: 80, z0: -60, z1: 90 };

const covers = (outer: { x: number; z: number; w: number; d: number }, r: { x: number; z: number; w: number; d: number }) =>
  r.x >= outer.x - 0.01 && r.x + r.w <= outer.x + outer.w + 0.01 && r.z >= outer.z - 0.01 && r.z + r.d <= outer.z + outer.d + 0.01;
const middleOf = (r: { x: number; z: number; w: number; d: number }) => ({ x: r.x + r.w / 2, z: r.z + r.d / 2, w: r.w, d: r.d });

/**
 * The blocks of a town laid out from a drawing: one per cell of the grid the
 * streets make. A cell with bands of buildings gets a terrace along every side
 * of each band (see `terraced`) and its yard left open; a green strip is grass
 * with trees; the strips between the two streets of a road are bare. The
 * alleyways are paved strips on the cell, with no traffic.
 */
function mapBlocks(seed: number, site: Site, building: Building, layout: Layout): TownBlock[] {
  const parts = layout.map!;
  const blocks: TownBlock[] = [];
  const solid =(r: { x: number; z: number; w: number; d: number }) => r.x + r.w > IN_VIEW.x0 && r.x < IN_VIEW.x1 && r.z + r.d > IN_VIEW.z0 && r.z < IN_VIEW.z1;
  for (const cell of parts.cells) {
    const { i, j } = cell;
    const mid = middleOf(cell);
    const green = parts.greens.some((g) => covers(g, cell) || covers(cell, g));
    const bands = parts.buildings.filter((r) => covers(cell, r));
    const alleys = parts.alleys.filter((r) => r.x + r.w > cell.x && r.x < cell.x + cell.w && r.z + r.d > cell.z && r.z < cell.z + cell.d).map(middleOf);
    const median = parts.medians.some((m) => covers(m, cell));
    const base = { i, j, x: mid.x, z: mid.z, rect: mid, ...(alleys.length > 0 && { alleys }), ...(median && { median }) };
    if (green) {
      // Where the countryside is fields, the green of the drawing is a field.
      const field = site.far === 'field';
      const side = !field && solid(cell) ? streetside(seed, i, j, mid, site, building) : null;
      blocks.push({ ...base, ground: field ? 'field' : 'grass', items: side?.trees ?? [], ...(side && layout.id === 'coaxia' && side.lamps.length > 0 && { lamps: side.lamps }) });
      continue;
    }
    const items: TownBuilding[] = [];
    bands.forEach((band, n) => {
      if (!solid(band)) return;
      // On industrial sites a share of the bands behind the office is a yard instead.
      const inFront = band.x + band.w / 2 >= westOf(building) && band.z + band.d / 2 >= 0;
      if (!inFront && chance(seed, i * 8 + n, j, 14) < site.yards) items.push(...yardsOn(seed, i * 8 + n, j, band, site, building));
      else items.push(...terraced(seed, i * 8 + n, j, band, site, building));
    });
    blocks.push({ ...base, ground: site.ground, items });
  }
  // The beach and the water of the drawing: ground of their own, lower than a pavement. The last street is where the traffic turns.
  [...parts.beach.map((r) => ({ r, ground: 'sand' as const })), ...parts.water.map((r) => ({ r, ground: 'water' as const }))].forEach(({ r, ground }, n) => {
    const mid = middleOf(r);
    blocks.push({ i: 100 + n, j: 100, x: mid.x, z: mid.z, rect: mid, ground, items: [] });
  });
  // Beyond the north edge of the drawing the outermost row of blocks goes on.
  parts.beyond.forEach((band, n) => {
    if (!solid(band)) return;
    const column = parts.cells.find((c) => band.x + band.w / 2 >= c.x && band.x + band.w / 2 <= c.x + c.w)?.i ?? n;
    const mid = middleOf(band);
    // (Its index is its own: several of them can lie in one cell, now that a cell can be wide.)
    blocks.push({ i: 200 + n, j: -1, x: mid.x, z: mid.z, rect: mid, ground: site.ground, items: terraced(seed, column * 8 + n, -1, band, site, building) });
  });
  return blocks;
}

// --- A town laid out by its roads (#218) ---

/** How far apart the pieces of a foothill stand on a mountain rect, in tiles. */
const HILL_STEP = 6;

/**
 * The foothills on a rect of the drawing (the near mountains): the kit's slopes and cliffs on a loose grid, each moved a
 * little at random so that they run into one another, taller the further back (north) they stand.
 */
export function hillsOn(seed: number, key: number, rect: Rect, office: Building): HillPiece[] {
  const cols = Math.max(1, Math.round(rect.w / HILL_STEP));
  const rows = Math.max(1, Math.round(rect.d / HILL_STEP));
  const pieces: HillPiece[] = [];
  for (let r = 0; r < rows; r++) {
    // 1 at the back (north) of the rect, 0 at the front.
    const back = rows === 1 ? 1 : 1 - r / (rows - 1);
    for (let c = 0; c < cols; c++) {
      const n = r * cols + c;
      if (chance(seed, key * 997 + n, 3, 20) < 0.15) continue;
      const building = NATURE.foothills[Math.floor(chance(seed, key * 997 + n, 3, 21) * NATURE.foothills.length)]!;
      const scale = 2.8 + back * 3.2 + chance(seed, key * 997 + n, 3, 22) * 1.2;
      const turn = Math.floor(chance(seed, key * 997 + n, 3, 23) * 4);
      const x = rect.x + ((c + 0.5) * rect.w) / cols + (chance(seed, key * 997 + n, 3, 24) - 0.5) * 2.4;
      const z = rect.z + ((r + 0.5) * rect.d) / rows + (chance(seed, key * 997 + n, 3, 25) - 0.5) * 2.4;
      const [w, d] = turn % 2 === 0 ? [building.w, building.d] : [building.d, building.w];
      // Whatever stands in front of the office stays low enough not to hide it.
      if (building.height * scale + PAVEMENT <= clearance(x, z, w * scale, d * scale, office)) pieces.push({ building, x, z, turn, scale });
    }
  }
  return pieces;
}

/** The turn that puts a house's front to the nearest road: 0 faces south (+z), 1 east, 2 north, 3 west. */
function facingRoad(plot: Rect, roads: readonly Street[]): number {
  const mid = middleOf(plot);
  let best = { gap: Infinity, turn: 0 };
  for (const road of roads) {
    const [offset, turns] = road.along === 'x' ? [road.at - mid.z, [2, 0] as const] : [road.at - mid.x, [3, 1] as const];
    // Only a road whose length reaches the plot counts.
    const alongPlot = road.along === 'x' ? mid.x : mid.z;
    if (alongPlot < (road.from ?? -Infinity) - 5 || alongPlot > (road.to ?? Infinity) + 5) continue;
    if (Math.abs(offset) < best.gap) best = { gap: Math.abs(offset), turn: turns[offset > 0 ? 1 : 0] };
  }
  return best.turn;
}

/** A house with its garden on a plot: one of the site's houses, its front to the nearest road, and trees in the corners of the garden. */
function houseOn(seed: number, n: number, plot: Rect, roads: readonly Street[], site: Site, office: Building): TownBuilding[] {
  const { scale } = site;
  const mid = middleOf(plot);
  const turn = facingRoad(plot, roads);
  const options = site.low.filter((building) => {
    const [w, d] = turn % 2 === 0 ? [building.w, building.d] : [building.d, building.w];
    return w * scale <= plot.w - 2 && d * scale <= plot.d - 2 && building.height * scale + PAVEMENT <= clearance(mid.x, mid.z, w * scale, d * scale, office);
  });
  const house = options[Math.floor(chance(seed, n, 5, 2) * options.length)];
  if (!house) return [];
  const items: TownBuilding[] = [{ building: house, x: mid.x, z: mid.z, turn }];
  if (site.trees > 0) items.push(...treesOn(seed, n, 5, mid.x, mid.z, site.trees, site, office, { building: house, turn }, { w: plot.w - 0.2, d: plot.d - 0.2 }));
  return items;
}

/** A rect of the drawing without the roads that run over it: cut at the kerb, keeping the larger part. */
function clipToRoads(rect: Rect, roads: readonly Street[], half: number): Rect {
  let r = rect;
  for (const road of roads) {
    const [from, to] = [road.from ?? -Infinity, road.to ?? Infinity];
    if (road.along === 'x') {
      if (road.at + half <= r.z || road.at - half >= r.z + r.d || to <= r.x || from >= r.x + r.w) continue;
      const [above, below] = [road.at - half - r.z, r.z + r.d - (road.at + half)];
      r = above >= below ? { ...r, d: above } : { ...r, z: road.at + half, d: below };
    } else {
      if (road.at + half <= r.x || road.at - half >= r.x + r.w || to <= r.z || from >= r.z + r.d) continue;
      const [before, after] = [road.at - half - r.x, r.x + r.w - (road.at + half)];
      r = before >= after ? { ...r, w: before } : { ...r, x: road.at + half, w: after };
    }
  }
  return r;
}

/**
 * The blocks of a town laid out by its roads: a block for each plot (a house with its garden), each field (the green of the
 * drawing, where the countryside is fields), each piece of water, and the near mountains with their foothills. What lies
 * between them is the open land of the site (Town.tsx). Plots beyond the ground in view are left out.
 */
function roadBlocks(seed: number, site: Site, building: Building, layout: Layout): TownBlock[] {
  const parts = layout.map!;
  const blocks: TownBlock[] = [];
  const visible = (r: Rect) => r.x + r.w > IN_VIEW.x0 && r.x < IN_VIEW.x1 && r.z + r.d > IN_VIEW.z0 && r.z < IN_VIEW.z1;
  parts.plots.forEach((plot, n) => {
    if (!visible(plot)) return;
    const mid = middleOf(plot);
    blocks.push({ i: n, j: 0, x: mid.x, z: mid.z, rect: mid, ground: site.ground, items: houseOn(seed, n, plot, parts.roads, site, building) });
  });
  parts.greens.map((r) => clipToRoads(r, parts.roads, layout.streetWidth / 2)).filter(visible).forEach((r, n) => {
    const mid = middleOf(r);
    blocks.push({ i: n, j: 1, x: mid.x, z: mid.z, ground: site.far === 'field' ? 'field' : 'grass', items: [], land: mid });
  });
  parts.water.forEach((r, n) => {
    const mid = middleOf(r);
    blocks.push({ i: n, j: 2, x: mid.x, z: mid.z, rect: mid, ground: 'water', items: [] });
  });
  // The foothills are on every mountain rect but the furthest, which is the range's (a lone rect has them too).
  const far = parts.mountains.reduce<Rect | null>((a, r) => (a && a.z < r.z ? a : r), null);
  parts.mountains.forEach((r, n) => {
    if (r === far && parts.mountains.length > 1) return;
    const mid = middleOf(r);
    blocks.push({ i: n, j: 3, x: mid.x, z: mid.z, ground: 'grass', items: [], land: mid, hill: hillsOn(seed, n, r, building) });
  });
  return blocks;
}

/** What stands in a yard laid out on a band of the drawing: tanks, containers and chimneys on a grid of places, with room between them. */
function yardsOn(seed: number, i: number, j: number, band: Rect, site: Site, office: Building): TownBuilding[] {
  const PITCH = 6;
  const items: TownBuilding[] = [];
  const cols = Math.floor((band.w - 2 * (SETBACK + 2)) / PITCH);
  const rows = Math.floor((band.d - 2 * (SETBACK + 2)) / PITCH);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (chance(seed, i * 101 + c, j * 53 + r, 31) < 0.25) continue;
      const building = SITE_YARD[Math.floor(chance(seed, i * 101 + c, j * 53 + r, 32) * SITE_YARD.length)]!;
      const [w, d] = [building.w * site.scale, building.d * site.scale];
      const x = band.x + band.w / 2 + (c - (cols - 1) / 2) * PITCH + (chance(seed, i * 101 + c, j * 53 + r, 33) - 0.5);
      const z = band.z + band.d / 2 + (r - (rows - 1) / 2) * PITCH + (chance(seed, i * 101 + c, j * 53 + r, 34) - 0.5);
      if (w > PITCH - 0.5 || d > PITCH - 0.5) continue;
      if (building.height * site.scale + PAVEMENT > clearance(x, z, w, d, office)) continue;
      items.push({ building, x, z, turn: 0 });
    }
  }
  return items;
}

/** A band of buildings is a block of the town: how deep, in tiles, the terraces round it may be at most. */
const roomFor = (across: number) => Math.max(0, across / 2 - YARD / 2);

/**
 * The buildings of a block of a town laid out from a drawing, put together as
 * a block of the town is (see `builtUp`): a terrace along every side of the
 * band, wall to wall with the fronts to the street, and the yard behind them
 * left open. The north and south terraces run the whole length, the west and
 * east ones between them. The first building comes from the site's kit, the
 * rest from its fill, so that a tower gets smaller neighbours. Where a
 * building would hide the ground floor it is left out.
 */
function terraced(seed: number, i: number, j: number, band: { x: number; z: number; w: number; d: number }, site: Site, office: Building): TownBuilding[] {
  const { scale } = site;
  const mid = middleOf(band);
  // Behind the office a share of the blocks gets taller buildings; in front of it they stay low.
  const inFront = mid.x >= westOf(office) && mid.z >= 0;
  const tall = !inFront && chance(seed, i, j, 1) < site.tallShare;
  // By the sea the row of the office and the one in front of it (the sea front) is large houses.
  const front = site.frontRow && mid.z >= 0 ? site.frontRow : null;
  const kit = front ?? (tall ? site.tall : site.low);
  const fill = front ?? (tall ? [...site.tall, ...site.low] : site.low);
  const items: TownBuilding[] = [];
  let first = true;
  // Puts a terrace on one side: `length` long, `room` deep; `at` turns a place along it and the depth of a building into a point.
  const row = (side: number, length: number, room: number, place: (along: number, depth: number) => [x: number, z: number], turn: number, salt: number, along: 'x' | 'z'): number => {
    const placed: { building: CityBuilding; at: number }[] = [];
    let left = length;
    let cursor = 0;
    for (let n = 0; n < 40; n++) {
      const options = (first ? kit : fill).filter((b) => b.w * scale <= left && b.d * scale <= room);
      const pick = options[Math.floor(chance(seed, i * 40 + n, j * 7 + side, 43 + salt) * options.length)];
      if (!pick) break;
      placed.push({ building: pick, at: cursor + (pick.w * scale) / 2 });
      cursor += pick.w * scale + JOIN;
      left -= pick.w * scale + JOIN;
      first = false;
    }
    // Centred on the side.
    const shift = left / 2;
    let depth = 0;
    for (const { building, at } of placed) {
      const [w, d] = [building.w * scale, building.d * scale];
      const [x, z] = place(at + shift, d);
      const [fw, fd] = along === 'x' ? [w, d] : [d, w];
      if (building.height * scale + PAVEMENT > clearance(x, z, fw, fd, office)) continue;
      items.push({ building, x, z, turn });
      depth = Math.max(depth, d);
    }
    return depth;
  };
  const x0 = band.x + SETBACK;
  const x1 = band.x + band.w - SETBACK;
  const z0 = band.z + SETBACK;
  const z1 = band.z + band.d - SETBACK;
  // A thin band (a row of houses or shops between two streets) is one terrace, with the whole depth of the band, facing south.
  if (band.d < 14 && band.w >= band.d) {
    row(1, x1 - x0, band.d - 2 * SETBACK, (a, d) => [x0 + a, z1 - d / 2], 0, 1, 'x');
    return items;
  }
  const north = row(-1, x1 - x0, roomFor(band.d - 2 * SETBACK), (a, d) => [x0 + a, z0 + d / 2], 2, 0, 'x');
  const south = row(1, x1 - x0, roomFor(band.d - 2 * SETBACK), (a, d) => [x0 + a, z1 - d / 2], 0, 1, 'x');
  const between = Math.max(0, z1 - south - (z0 + north));
  const sideRoom = roomFor(band.w - 2 * SETBACK);
  row(-1, between, sideRoom, (a, d) => [x0 + d / 2, z0 + north + a], 3, 2, 'z');
  row(1, between, sideRoom, (a, d) => [x1 - d / 2, z0 + north + a], 1, 3, 'z');
  return items;
}

/**
 * What stands on a green strip: a row of lamp posts along both long edges, just inside the kerb, and between them the
 * trees, two staggered rows along the long side. Whatever would hide the ground floor is left out (a lamp that hides it
 * only from a turned view is left out when it is drawn, see `lampHides`), and a tree is left out where a lamp stands.
 */
export function streetside(seed: number, i: number, j: number, cell: { x: number; z: number; w: number; d: number }, site: Site, office: Building): { trees: TownBuilding[]; lamps: { x: number; z: number }[] } {
  const lamps: { x: number; z: number }[] = [];
  const alongZ = cell.d >= cell.w;
  const [length, across] = alongZ ? [cell.d, cell.w] : [cell.w, cell.d];
  const posts = Math.floor(length / LAMP_EVERY);
  for (let n = 0; n < posts; n++) {
    for (const side of [-1, 1]) {
      const lengthwise = -length / 2 + (n + 0.5) * (length / posts);
      const crosswise = side * (across / 2 - LAMP_INSET);
      const [x, z] = alongZ ? [cell.x + crosswise, cell.z + lengthwise] : [cell.x + lengthwise, cell.z + crosswise];
      if (LAMP_HEIGHT + PAVEMENT > clearance(x, z, 0.6, 0.6, office)) continue;
      lamps.push({ x, z });
    }
  }
  const trees = greenTrees(seed, i, j, cell, site, office).filter((tree) => lamps.every((lamp) => Math.hypot(lamp.x - tree.x, lamp.z - tree.z) > 1));
  return { trees, lamps };
}

function greenTrees(seed: number, i: number, j: number, cell: { x: number; z: number; w: number; d: number }, site: Site, office: Building): TownBuilding[] {
  const trees: TownBuilding[] = [];
  const alongZ = cell.d >= cell.w;
  const [length, across] = alongZ ? [cell.d, cell.w] : [cell.w, cell.d];
  // (Trees are drawn as large as the kit: 5 tiles apart at scale 3, so 10 at scale 6 (0.20.0).)
  const count = Math.floor(length / ((5 * site.scale) / 3));
  for (let n = 0; n < count; n++) {
    for (const side of [-1, 1]) {
      if (chance(seed, i * 97 + n, j * 3 + side, 21) < 0.3) continue;
      const building = TREES[Math.floor(chance(seed, i * 97 + n, j * 3 + side, 22) * TREES.length)]!;
      const lengthwise = -length / 2 + (n + 0.5 + side * 0.15 + (chance(seed, i * 97 + n, j * 3 + side, 23) - 0.5) * 0.4) * (length / count);
      const crosswise = side * (across / 4 + (chance(seed, i * 97 + n, j * 3 + side, 24) - 0.5) * (across / 6));
      const [x, z] = alongZ ? [cell.x + crosswise, cell.z + lengthwise] : [cell.x + lengthwise, cell.z + crosswise];
      if (building.height * site.scale + PAVEMENT > clearance(x, z, 1, 1, office)) continue;
      trees.push({ building, x, z, turn: 0 });
    }
  }
  return trees;
}

// --- The railway ---

/** Length of a train of this many carriages, in tiles. */
export const trainLength = (cars: number) => cars * CITY.railway.carLength * CITY.railway.scale;

/**
 * Where the train is `time` seconds in: the position of its front on the
 * line and the way it is going, or null between trains. Trains alternate
 * direction and run the whole line, entering and leaving out of sight.
 */
export function trainAt(time: number, cars: number, layout: Layout = CAPITAL): { x: number; direction: 1 | -1 } | null {
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
 * stretch, pointing the way the lane is driven (the directions of the traffic, see `driven` in townLayout.ts). Other towns have none.
 */
export function arrowsOf(layout: Layout): Arrow[] {
  const map = layout.map;
  if (layout.id !== 'coaxia' || !map) return [];
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
