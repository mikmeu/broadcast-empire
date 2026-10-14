// The town around the office: which building stands on which block, where the
// streets are and when a train passes. Pure: everything follows from the game's
// seed, so each game has its own town, the same every time it is opened. What
// drives in the streets is in traffic.ts.

import { BUILDINGS, FLOOR, WEST, widthOf, type Building } from '../config/office';
import { CITY, type CityBuilding } from './assets';
import { SITES, SITE_YARD, type Ground, type Site } from './sites';

export interface TownBuilding {
  building: CityBuilding;
  /** Where its middle stands, in floor tiles. */
  x: number;
  z: number;
  /** Quarter turns. */
  turn: number;
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
  /** A hill that takes up the block: how high it is and how wide at its foot. */
  hill?: { height: number; radius: number };
  /**
   * For open land: the ground it covers, by its middle and its size. It runs
   * on into the blocks beside it, and stops short only of a street with traffic.
   */
  land?: { x: number; z: number; w: number; d: number };
}

/** How far below the office floor the streets are, in tiles: floor 1 is the ground floor. */
export const streetLevel = (floor: number) => CITY.streetBelow + CITY.perFloor * (floor - 1);

/** How many town blocks deep the office's own block is. How many it is wide depends on the building. */
const OFFICE_ROWS = 2;

/**
 * The office's own block, with the building in the middle of it: two town
 * blocks deep, and four wide for the standard building. The long building
 * takes a fifth: its block reaches one further east, over what is a side
 * street elsewhere, and the rest of the town is where it always is.
 */
export const officeBlock = (building: Building = BUILDINGS.standard) => ({
  x: WEST + (widthOf(building) - building.blocks * CITY.block.w) / 2,
  z: (FLOOR.h - OFFICE_ROWS * CITY.block.d) / 2,
  w: building.blocks * CITY.block.w,
  d: OFFICE_ROWS * CITY.block.d,
});

/** The block of the standard building. Its west side and its front are those of every building's block. */
export const OFFICE_BLOCK = officeBlock();

/** Town blocks around the office that can be in view on some floor. */
const BLOCKS = { fromX: -4, toX: 5, fromZ: -5, toZ: 3 };

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
  if (nearX + w <= WEST || nearZ + d <= 0) return Infinity;
  return Math.max(nearX - building.w, nearZ - FLOOR.h);
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
  const x = t <= 1 ? item.x : 2 * WEST + widthOf(building) - item.x;
  const z = t === 0 || t === 3 ? item.z : FLOOR.h - item.z;
  return item.building.height * scale + PAVEMENT > clearance(x, z, w, d, building);
}

/**
 * The streets that carry traffic: the ones beside and in front of the office.
 * The ones behind it are hidden by buildings, the one under the railway is no
 * road at all, and the last street to the east is left empty, so that a
 * vehicle has a stretch of road to itself when it comes into town.
 */
export function busyStreets(building: Building = BUILDINGS.standard): { along: 'x' | 'z'; at: number }[] {
  const last = STREET.from.x + STREET.length.x;
  return streets(building).filter(
    (street) =>
      street.at >= (street.along === 'x' ? OFFICE_BLOCK.z : OFFICE_BLOCK.x) && !(street.along === 'x' && street.at === RAILWAY.z) && !(street.along === 'z' && street.at === last),
  );
}

/**
 * The ground a block of open land covers: the whole block, less half a street
 * on the sides where traffic drives. Water is `closed`: no side street runs on
 * into it.
 */
function landOf(i: number, j: number, building: Building, closed = false): TownBlock['land'] {
  const busy = busyStreets(building);
  const half = CITY.streetWidth / 2;
  const edge = (along: 'x' | 'z', at: number) => (!(closed && along === 'z') && busy.some((street) => street.along === along && Math.abs(street.at - at) < 0.01) ? half : 0);
  const west = OFFICE_BLOCK.x + i * CITY.block.w;
  const north = OFFICE_BLOCK.z + j * CITY.block.d;
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
 *   water behind it. No street runs into the water: see `carParks`.
 */
export function townBlocks(seed: number, site: Site = SITES.capital, building: Building = BUILDINGS.standard): TownBlock[] {
  const blocks: TownBlock[] = [];
  const { scale } = site;
  const lastRow = BLOCKS.toZ + (site.front ? FRONT_ROWS : 0);
  for (let i = BLOCKS.fromX; i <= BLOCKS.toX; i++) {
    for (let j = BLOCKS.fromZ; j <= lastRow; j++) {
      if (isOffice(i, j, building)) continue;
      const x = OFFICE_BLOCK.x + (i + 0.5) * CITY.block.w;
      const z = OFFICE_BLOCK.z + (j + 0.5) * CITY.block.d;
      const inFront = i >= 0 && j >= 0;
      if (j > BLOCKS.toZ) {
        // By the water the shore comes first, with the side streets ending on it, and the water behind it.
        const ground = (j === BLOCKS.toZ + 1 && site.shore) || site.front!;
        // Trees on a green bank, clear of the car parks.
        const parks = carParks(site, building);
        const trees = ground === 'grass' ? treesOn(seed, i, j, x, z, 4, site, building).filter((tree) => !parks.some((park) => Math.abs(tree.x - park.x) < park.w / 2 + 0.6)) : [];
        blocks.push({ i, j, x, z, ground, items: trees, land: landOf(i, j, building, ground === 'water') });
        continue;
      }
      if (site.far && (i <= -2 || j <= -2)) {
        const hill = site.hills && j <= -2 && chance(seed, i, j, 11) < 0.7;
        const trees = site.far === 'grass' && !hill ? treesOn(seed, i, j, x, z, 5, site, building) : [];
        blocks.push({ i, j, x, z, ground: site.far, items: trees, land: landOf(i, j, building), ...(hill && { hill: { height: 2.6 + chance(seed, i, j, 12) * 2.6, radius: 3 + chance(seed, i, j, 13) * 0.8 } }) });
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
function treesOn(seed: number, i: number, j: number, x: number, z: number, count: number, site: Site, office: Building, house?: { building: CityBuilding; turn: number }): TownBuilding[] {
  const trees: TownBuilding[] = [];
  const half = { w: PAD.w / 2 - 0.4, d: PAD.d / 2 - 0.4 };
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
export function streets(building: Building = BUILDINGS.standard): { along: 'x' | 'z'; at: number }[] {
  const lines: { along: 'x' | 'z'; at: number }[] = [];
  for (let i = BLOCKS.fromX; i <= BLOCKS.toX + 1; i++) if (i <= 0 || i >= building.blocks) lines.push({ along: 'z', at: OFFICE_BLOCK.x + i * CITY.block.w });
  for (let j = BLOCKS.fromZ; j <= BLOCKS.toZ + 1; j++) if (j <= 0 || j >= OFFICE_ROWS) lines.push({ along: 'x', at: OFFICE_BLOCK.z + j * CITY.block.d });
  return lines;
}

/** How long a street is, and where it starts on its own axis. */
export const STREET = {
  from: { x: OFFICE_BLOCK.x + BLOCKS.fromX * CITY.block.w, z: OFFICE_BLOCK.z + BLOCKS.fromZ * CITY.block.d },
  length: { x: (BLOCKS.toX - BLOCKS.fromX + 1) * CITY.block.w, z: (BLOCKS.toZ - BLOCKS.fromZ + 1) * CITY.block.d },
};

/**
 * Where the side streets end in a town by the water: a covered car park on
 * the shore at the foot of each, which the traffic drives into and comes out
 * of. (Nobody turns a corner in this town, so a street has to lead somewhere.)
 * `z` is the middle of the building, and it is open towards the town.
 */
export function carParks(site: Site, building: Building = BUILDINGS.standard): { x: number; z: number; w: number; d: number; height: number }[] {
  if (site.front !== 'water' || !site.shore) return [];
  const lastStreet = STREET.from.z + STREET.length.z;
  const from = lastStreet + CITY.streetWidth / 2 + CAR_PARK.back;
  const to = lastStreet + CITY.block.d;
  return busyStreets(building)
    .filter((street) => street.along === 'z')
    .map((street) => ({ x: street.at, z: (from + to) / 2, w: CITY.streetWidth + CAR_PARK.wider, d: to - from, height: CAR_PARK.height }));
}

/** A car park on the shore: how far it stands back from the last street, how much wider than the street it is, and how high its roof is. */
const CAR_PARK = { back: 0.6, wider: 0.7, height: 1.7 };

// --- The railway ---

/**
 * The elevated line: where the second street in front of the office would be, from one end of the town to the
 * other. Under it is a paved strip instead of a road, with the pillars standing on it.
 */
export const RAILWAY = {
  z: OFFICE_BLOCK.z + 3 * CITY.block.d,
  from: STREET.from.x,
  length: STREET.length.x,
};

/** Length of a train of this many carriages, in tiles. */
export const trainLength = (cars: number) => cars * CITY.railway.carLength * CITY.railway.scale;

/**
 * Where the train is `time` seconds in: the position of its front on the
 * line and the way it is going, or null between trains. Trains alternate
 * direction and run the whole line, entering and leaving out of sight.
 */
export function trainAt(time: number, cars: number): { x: number; direction: 1 | -1 } | null {
  const { every, speed } = CITY.railway;
  const pass = Math.floor(time / every);
  const travelled = (time - pass * every) * speed;
  const length = trainLength(cars);
  if (travelled > RAILWAY.length + length) return null;
  const direction = pass % 2 === 0 ? 1 : -1;
  return { x: direction > 0 ? RAILWAY.from + travelled : RAILWAY.from + RAILWAY.length - travelled, direction };
}
