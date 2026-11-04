// What the surroundings of the office are like in each region: the kits of buildings, and the look of each region. The map file of a region
// says the rest (src/office/sites.ts): the train, the traffic, the scale of the buildings, where the town lies. Kept apart from sites.ts, which
// reads the map files, as the converter of old map files (removed in #331) needed them before there were any.

import type { RegionId } from '../config/world';
import type { CityBuilding, Tone } from './assets';
import { CITY } from './assets';

/** A building of one of the kits: its file, its size in the kit's units, and how far its middle is from its own origin. */
const from = (folder: string, prefix: string) => (name: string, w: number, height: number, d: number, cx = 0, cz = 0): CityBuilding => ({ file: `${folder}/${prefix}${name}.glb`, w, height, d, cx, cz });

const works = from('industrial', 'building-');
const house = from('suburban', 'building-type-');

/** Kenney's City Kit (Industrial): workshops, depots and plants. */
export const INDUSTRY = {
  low: [
    works('c', 1.88, 1.25, 2.11, 0.1, 0.15), works('g', 1.68, 1.28, 1.28), works('h', 1.32, 0.73, 1.31, -0.58, 0.28), works('i', 1.03, 0.73, 1.3, -0.44, 0.27),
    works('j', 1.03, 0.86, 1.3, -0.44, 0.27), works('k', 1.3, 0.77, 0.91), works('o', 0.88, 0.92, 1.24, -0.44, 0.62), works('p', 1.68, 0.71, 0.99),
    works('q', 2.14, 0.88, 1.77, -0.23, 0.02), works('s', 2.12, 0.84, 0.92, -0.01), works('t', 1.72, 1.01, 1.39),
  ],
  tall: [
    works('a', 2.08, 1.47, 1.24), works('b', 2.08, 1.47, 1.26, 0, -0.01), works('d', 0.88, 1.41, 1.42, 0, -0.09), works('e', 1.68, 1.65, 1.29, 0, 0.25),
    works('f', 1.79, 1.92, 1.28, -0.46, 0.25), works('l', 2.08, 1.92, 1.87, -0.42, 0.23), works('m', 1.32, 1.52, 1.7), works('n', 0.98, 1.9, 1.42, -0.45, 0.56),
  ],
  /** What stands in a yard instead of a building: things with a height, in the kit's units. */
  yard: [
    { file: 'industrial/chimney-large.glb', w: 1.08, height: 1.7, d: 1.08 },
    { file: 'industrial/water-tower.glb', w: 0.86, height: 2.14, d: 0.83 },
    { file: 'industrial/detail-tank-large.glb', w: 1.51, height: 0.96, d: 1.65, cz: -0.07 },
    // The containers are drawn at a quarter of the size they are modelled at.
    { file: 'industrial/shipping-container-a.glb', w: 0.37, height: 0.35, d: 0.82 },
    { file: 'industrial/shipping-container-b.glb', w: 0.37, height: 0.35, d: 0.82 },
    { file: 'industrial/shipping-container-c.glb', w: 0.37, height: 0.35, d: 0.82 },
    { file: 'industrial/chimney-medium.glb', w: 0.45, height: 1.92, d: 0.45 },
  ] as CityBuilding[],
};

/** Kenney's City Kit (Suburban): houses. The larger ones are kept apart for the sea front. */
export const HOUSES = {
  all: [
    house('a', 1.3, 0.83, 1.03), house('b', 1.83, 1.14, 1.14), house('c', 1.29, 1.03, 1.03), house('d', 1.76, 1.24, 1.03), house('e', 1.3, 1.14, 1.03),
    house('f', 1.43, 1.14, 1.41), house('g', 1.45, 0.77, 1.18), house('h', 1.3, 0.74, 0.92), house('i', 1.29, 0.74, 1.03), house('j', 1.37, 1.04, 0.92),
    house('k', 0.92, 1.15, 1.02), house('l', 1.03, 1.05, 1.02), house('m', 1.43, 0.74, 1.43), house('n', 1.78, 1.14, 1.38), house('o', 1.27, 1.14, 1.03),
    house('p', 1.24, 0.92, 0.99), house('q', 1.24, 0.92, 0.89, 0, 0.02), house('r', 1.03, 1.14, 1.02), house('s', 1.41, 1.14, 1.09), house('t', 1.31, 1.16, 1.41),
    house('u', 1.43, 1.14, 1.09),
  ],
  large: [house('b', 1.83, 1.14, 1.14), house('d', 1.76, 1.24, 1.03), house('f', 1.43, 1.14, 1.41), house('n', 1.78, 1.14, 1.38), house('t', 1.31, 1.16, 1.41), house('s', 1.41, 1.14, 1.09)],
  trees: ['suburban/tree-large.glb', 'suburban/tree-small.glb'],
};

/**
 * A model of the Mini Forest or the Watercraft Pack (0.21.0, #365). The kits are not built to the City Kit's scale, so each is drawn `size` times the
 * map's scale: the sizes make a rowing boat about 3 tiles long, a cargo ship 25, a forest tree as tall as the large suburban tree, at the map scale of 6.
 * `w`, `height` and `d` are the model's own, from the bounds of its file, times `size`.
 */
const sized = (folder: string) => (name: string, w: number, height: number, d: number, size: number, extra: Partial<CityBuilding> = {}): CityBuilding => {
  const r = (n: number) => Math.round(n * 100) / 100;
  return { file: `${folder}/${name}.glb`, w: r(w * size), height: r(height * size), d: r(d * size), size, ...extra };
};
const wild = sized('forest');
const craft = sized('watercraft');

/** Kenney's Mini Forest: trees, which join the Tree tool, and the rocks, stones and the tent, which stand on land. */
export const FOREST = {
  trees: [wild('tree', 0.93, 1.68, 0.88, 0.46), wild('tree-high', 0.93, 2.28, 0.88, 0.51)],
  props: [
    wild('rocks-ramp', 1, 0.5, 1, 0.4),
    wild('rocks-low', 1, 0.52, 1, 0.4),
    // Modelled about its middle: its foot is half a unit below its origin.
    wild('rocks-high', 1, 1, 1, 0.4, { foot: 0.5 }),
    wild('stones', 0.9, 0.45, 0.85, 0.4, { cz: 0.02 }),
    wild('tent', 1.26, 1, 1.07, 0.4),
  ],
};

/** Kenney's Watercraft Pack: boats and ships, which float and stand on water only, and the cargo that stands on land. */
export const WATERCRAFT = {
  boats: [
    craft('boat-fishing-small', 1.78, 2.6, 3.87, 0.24, { floats: true }),
    craft('boat-row-small', 2.75, 0.85, 2.37, 0.21, { floats: true }),
    craft('boat-row-large', 2.75, 0.85, 2.85, 0.23, { floats: true }),
    craft('boat-sail-a', 1.78, 4.74, 3.77, 0.24, { floats: true, cz: 0.1 }),
    craft('boat-sail-b', 1.78, 4.48, 4.07, 0.24, { floats: true, cz: 0.25 }),
    craft('boat-tug-a', 1.78, 2.24, 3.47, 0.38, { floats: true }),
    craft('boat-tug-b', 1.78, 2.24, 2.87, 0.46, { floats: true }),
    craft('ship-cargo-a', 3.92, 3.38, 10.55, 0.395, { floats: true }),
    craft('ship-cargo-b', 3.92, 3.3, 10.55, 0.395, { floats: true }),
  ],
  cargo: [
    craft('cargo-container-a', 1.38, 1.1, 2.76, 0.3),
    craft('cargo-container-b', 1.38, 1.1, 2.76, 0.3),
    craft('cargo-container-c', 1.38, 1.1, 2.76, 0.3),
    craft('cargo-pile-a', 2.54, 1.2, 2.75, 0.3),
    craft('cargo-pile-b', 3.05, 1.2, 2.97, 0.3, { cx: 0.22, cz: -0.02 }),
  ],
};

/** Every house, building, yard piece, boat and prop of the kits that a map can put down by hand (#284, #365): the town's own lists, each file once. */
export const PLACEABLE: readonly CityBuilding[] = [...CITY.low, ...CITY.tall, ...INDUSTRY.low, ...INDUSTRY.tall, ...INDUSTRY.yard, ...HOUSES.all, ...FOREST.props, ...WATERCRAFT.boats, ...WATERCRAFT.cargo].filter(
  (model, n, all) => all.findIndex((other) => other.file === model.file) === n,
);

/** The model for a file a map names, or undefined if the game has none such. */
export const placeable = (file: string): CityBuilding | undefined => PLACEABLE.find((model) => model.file === file);

/** What a block of the town is covered with. */
export type Ground = Extract<Tone, 'pavement' | 'grass' | 'sand' | 'water' | 'field'>;

export interface Site {
  /** In a word, for the tests and the new game screen. */
  kind: 'city' | 'industry' | 'hills' | 'fields' | 'beach';
  /** A line about the place, for the new game screen. */
  about: string;
  /** The map file (src/config/maps/<id>.json) the town is laid out from; without one it is the grid of blocks. */
  map: string | null;
  /** The buildings around the office: small ones, which may stand in front of it, and tall ones for behind it. */
  low: readonly CityBuilding[];
  tall: readonly CityBuilding[];
  /** The share of the blocks behind the office that get a tall building. */
  tallShare: number;
  /** The kit's buildings are drawn this many times their size. */
  scale: number;
  /** What the blocks with buildings are covered with, and how many trees stand on each at most. */
  ground: Ground;
  trees: number;
  /** The share of the blocks behind the office that are a yard with tanks, containers or a chimney instead of a building. */
  yards: number;
  /**
   * What lies beyond the blocks around the office: more town, or the
   * countryside. With `far` the blocks further out are open land of that
   * kind, and in front of the last street lies `front`: the sea, a lake, or
   * fields. Where that is water, the row along the last street is the
   * `shore`: a beach or a green bank, where the side streets end.
   */
  far: Ground | null;
  front: Ground | null;
  shore: Ground | null;
  /** Hills on the open land behind the office. */
  hills: boolean;
  /** Houses for the row between the office and the railway, where they differ from the rest (the sea front). */
  frontRow: readonly CityBuilding[] | null;
  /** The train, front to rear: the files of the Train Kit, from the map's settings (see `siteOn`). */
  train: readonly string[];
  /** Seconds between two vehicles entering a lane, on average, and what comes by, as shares: from the map's settings. */
  traffic: { every: number; mix: Record<'car' | 'taxi' | 'van' | 'truck', number> };
  /** How many people are out for a walk. */
  strollers: number;
}

/** A site before it is put on a map: all but what the map's settings say. */
export type Look = Omit<Site, 'train' | 'traffic'>;

const SUBURB = { map: null, low: HOUSES.all, tall: HOUSES.all, tallShare: 0, scale: CITY.scale, ground: 'grass', trees: 3, yards: 0, shore: null, frontRow: null } as const;

export const LOOKS: Record<RegionId, Look> = {
  // Coaxia: the capital. Shops and offices, a skyline behind, the yellow train, busy streets.
  capital: {
    kind: 'city',
    about: 'The capital: offices and shops, towers on the skyline, and streets that are never empty.',
    map: 'coaxia',
    low: CITY.low,
    tall: CITY.tall,
    tallShare: 0.5,
    scale: CITY.scale,
    ground: 'pavement',
    trees: 0,
    yards: 0,
    far: null,
    front: null,
    shore: null,
    hills: false,
    frontRow: null,
    strollers: 14,
  },
  // Transponder Valley: industry. Workshops and plants, yards with tanks and containers, a goods train, trucks.
  north: {
    kind: 'industry',
    about: 'Factory country: workshops, chimneys and yards full of containers, with trucks on the road and goods trains overhead.',
    map: 'transponder-valley',
    low: INDUSTRY.low,
    tall: INDUSTRY.tall,
    tallShare: 0.6,
    scale: 5.2,
    ground: 'pavement',
    trees: 0,
    yards: 0.22,
    far: null,
    front: null,
    shore: null,
    hills: false,
    frontRow: null,
    strollers: 8,
  },
  // Skywave Beach: large houses on the sea front, the town's big buildings behind the office.
  coast: {
    kind: 'beach',
    about: 'A seaside town: large houses along the beach, big buildings behind them, and the sea in front.',
    map: 'skywave-beach',
    low: CITY.low,
    tall: CITY.tall,
    tallShare: 0.6,
    scale: CITY.scale,
    ground: 'pavement',
    trees: 0,
    yards: 0,
    far: null,
    front: 'water',
    shore: 'sand',
    hills: false,
    frontRow: HOUSES.large,
    strollers: 12,
  },
  // Aerial Fields: houses with gardens, and farm fields all around. Laid out from its drawing (townLayout.ts).
  heartland: {
    ...SUBURB,
    map: 'aerial-fields',
    kind: 'fields',
    about: 'Farm country: houses with gardens around the office, green all round with a few fields, and a quiet road.',
    far: 'field',
    front: null,
    hills: false,
    strollers: 5,
  },
  // Amplify Hills: houses with gardens, a lake and hills behind them. Laid out from its drawing (townLayout.ts).
  highlands: {
    ...SUBURB,
    map: 'amplify-hills',
    kind: 'hills',
    about: 'A town in the hills: houses with gardens, a lake and green hills behind them.',
    far: 'grass',
    front: null,
    shore: null,
    hills: true,
    strollers: 5,
  },
};

/** What stands in the yards of an industrial site. */
export const SITE_YARD: readonly CityBuilding[] = INDUSTRY.yard;
