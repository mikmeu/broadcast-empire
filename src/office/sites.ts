// What the surroundings of the office are like in each region: which
// buildings stand around it, what lies beyond them, what drives by and which
// train runs. The office itself is the same everywhere.

import type { RegionId } from '../config/world';
import type { CityBuilding, Tone } from './assets';
import { CITY } from './assets';

/** A building of one of the kits: its file, its size in the kit's units, and how far its middle is from its own origin. */
const from = (folder: string, prefix: string) => (name: string, w: number, height: number, d: number, cx = 0, cz = 0): CityBuilding => ({ file: `${folder}/${prefix}${name}.glb`, w, height, d, cx, cz });

const works = from('industrial', 'building-');
const house = from('suburban', 'building-type-');

/** Kenney's City Kit (Industrial): workshops, depots and plants. */
const INDUSTRY = {
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
const HOUSES = {
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

/** Every house, building and yard piece of the kits that a map can put down by hand (#284): the town's own lists, each file once. */
export const PLACEABLE: readonly CityBuilding[] = [...CITY.low, ...CITY.tall, ...INDUSTRY.low, ...INDUSTRY.tall, ...INDUSTRY.yard, ...HOUSES.all].filter(
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
  /** The train, front to rear. */
  train: readonly string[];
  /** Seconds between two vehicles entering a lane, on average, and what comes by, as shares. */
  traffic: { every: number; mix: Record<'car' | 'taxi' | 'van' | 'truck', number> };
  /** How many people are out for a walk. */
  strollers: number;
}

const DOUBLE_DECKER = CITY.railway.train;
const FREIGHT = [
  'train/train-diesel-a.glb', 'train/train-carriage-container-red.glb', 'train/train-carriage-tank.glb', 'train/train-carriage-coal.glb',
  'train/train-carriage-container-blue.glb', 'train/train-carriage-lumber.glb',
];

const SUBURB = { map: null, low: HOUSES.all, tall: HOUSES.all, tallShare: 0, scale: CITY.scale, ground: 'grass', trees: 3, yards: 0, shore: null, frontRow: null, train: DOUBLE_DECKER } as const;

/** The surroundings of the office by the region the headquarters are in. */
export const SITES: Record<RegionId, Site> = {
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
    train: DOUBLE_DECKER,
    traffic: { every: 9, mix: { car: 0.68, taxi: 0.12, van: 0.13, truck: 0.07 } },
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
    train: FREIGHT,
    traffic: { every: 10, mix: { car: 0.22, taxi: 0.04, van: 0.24, truck: 0.5 } },
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
    train: DOUBLE_DECKER,
    traffic: { every: 13, mix: { car: 0.74, taxi: 0.12, van: 0.1, truck: 0.04 } },
    strollers: 12,
  },
  // Aerial Fields: houses with gardens, and farm fields all around. Laid out from its drawing (townLayout.ts).
  heartland: {
    ...SUBURB,
    map: 'aerial-fields',
    kind: 'fields',
    about: 'Farm country: houses with gardens around the office, fields as far as you can see, and a quiet road.',
    far: 'field',
    front: null,
    hills: false,
    traffic: { every: 24, mix: { car: 0.6, taxi: 0.05, van: 0.2, truck: 0.15 } },
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
    traffic: { every: 22, mix: { car: 0.72, taxi: 0.08, van: 0.15, truck: 0.05 } },
    strollers: 5,
  },
};

export const siteOf = (region: RegionId): Site => SITES[region];

/** What stands in the yards of an industrial site. */
export const SITE_YARD: readonly CityBuilding[] = INDUSTRY.yard;
