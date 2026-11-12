// The asset registry of the 3D office (prompt.md section 13). Everything the
// office view draws is named here: which model file each thing uses, how its
// materials are tinted, and which parts make up a piece of furniture. Swapping
// a model, or replacing a part built from simple shapes by a real model, is a
// change in this file only.
//
// Models: Kenney's Furniture Kit, Food Kit, Mini Shop, Mini Characters, City Kit (Commercial), City Kit (Roads), Car Kit, Train Kit and Nature Kit, all CC0, in public/models.

import { isEitherName, isWoman, nameHash } from '../sim/names';
import type { BuiltInFurniture, FurnitureType } from '../config/office';

/** Every color in the 3D view is one of these, read from the theme tokens (`--o3-*` in styles.css). */
export type Tone =
  | 'wood' | 'woodDark' | 'fabric' | 'fabricDark' | 'white' | 'plant'
  | 'metal' | 'metalMid' | 'metalDark' | 'lamp' | 'onAir' | 'accent'
  | 'street' | 'pavement' | 'facade' | 'trim' | 'glass'
  // The land around the towns that are not all town.
  | 'grass' | 'sand' | 'water' | 'field' | 'rock';

/** Which tone replaces each material of the kit's models. */
export const MATERIAL_TONES: Record<string, Tone> = {
  wood: 'wood',
  woodDark: 'woodDark',
  carpet: 'fabric',
  carpetDarker: 'fabricDark',
  carpetWhite: 'white',
  plant: 'plant',
  metal: 'metal',
  metalMedium: 'metalMid',
  metalDark: 'metalDark',
  lamp: 'lamp',
  _defaultMat: 'white',
};

/** The kit's models are half the size of a floor tile's scale. */
export const MODEL_SCALE = 2;
/** The characters have large heads; at the furniture's scale they would hide it. */
export const CHARACTER_SCALE = 1.35;

export type ModelId =
  | 'desk' | 'deskChair' | 'chair' | 'screen' | 'keyboard' | 'laptop' | 'roundTable' | 'table' | 'bookcase'
  | 'books' | 'coffeeMachine' | 'sofa' | 'armchair' | 'plant' | 'rug' | 'television' | 'speaker' | 'sideTable'
  | 'radio' | 'fridge' | 'counter' | 'sink' | 'mirror' | 'toilet'
  // More of the Furniture Kit (0.21.0).
  | 'kitchenStove' | 'trashcan' | 'speakerSmall' | 'kitchenCabinet' | 'kitchenSink' | 'dryer' | 'hoodLarge' | 'stairs'
  // Kenney's Mini Shop, in its own colours.
  | 'displaySmall' | 'handTruck' | 'shelfBags' | 'shoppingBasket' | 'cashRegister' | 'clothingRack' | 'clothingTable' | 'displayCans' | 'displayFlowers'
  // Kenney's Food Kit, in its own colours.
  | 'bottleKetchup' | 'bottleMusterd' | 'burger' | 'bowlSoup' | 'cupCoffee' | 'cuttingBoard' | 'fryingPan' | 'egg' | 'plateDinner' | 'pizza' | 'salad'
  | 'shakerPepper' | 'shakerSalt' | 'sodaBottle';

/** File of each model, under public/models. */
export const MODELS: Record<ModelId, string> = {
  desk: 'furniture/desk.glb',
  deskChair: 'furniture/chairDesk.glb',
  chair: 'furniture/chair.glb',
  screen: 'furniture/computerScreen.glb',
  keyboard: 'furniture/computerKeyboard.glb',
  laptop: 'furniture/laptop.glb',
  roundTable: 'furniture/tableRound.glb',
  table: 'furniture/table.glb',
  bookcase: 'furniture/bookcaseOpen.glb',
  books: 'furniture/books.glb',
  coffeeMachine: 'furniture/kitchenCoffeeMachine.glb',
  sofa: 'furniture/loungeSofa.glb',
  armchair: 'furniture/loungeChair.glb',
  plant: 'furniture/pottedPlant.glb',
  rug: 'furniture/rugRectangle.glb',
  television: 'furniture/televisionVintage.glb',
  speaker: 'furniture/speaker.glb',
  sideTable: 'furniture/sideTable.glb',
  radio: 'furniture/radio.glb',
  fridge: 'furniture/kitchenFridge.glb',
  counter: 'furniture/kitchenBar.glb',
  sink: 'furniture/bathroomSinkSquare.glb',
  mirror: 'furniture/bathroomMirror.glb',
  toilet: 'furniture/toiletSquare.glb',
  kitchenStove: 'furniture/kitchenStove.glb',
  trashcan: 'furniture/trashcan.glb',
  speakerSmall: 'furniture/speakerSmall.glb',
  kitchenCabinet: 'furniture/kitchenCabinet.glb',
  kitchenSink: 'furniture/kitchenSink.glb',
  dryer: 'furniture/dryer.glb',
  hoodLarge: 'furniture/hoodLarge.glb',
  stairs: 'furniture/stairs.glb',
  displaySmall: 'shop/display-small.glb',
  handTruck: 'shop/hand-truck.glb',
  shelfBags: 'shop/shelf-bags.glb',
  shoppingBasket: 'shop/shopping-basket.glb',
  cashRegister: 'shop/cash-register.glb',
  clothingRack: 'shop/clothing-rack.glb',
  clothingTable: 'shop/clothing-table.glb',
  displayCans: 'shop/display-cans.glb',
  displayFlowers: 'shop/display-flowers.glb',
  bottleKetchup: 'food/bottle-ketchup.glb',
  bottleMusterd: 'food/bottle-musterd.glb',
  burger: 'food/burger.glb',
  bowlSoup: 'food/bowl-soup.glb',
  cupCoffee: 'food/cup-coffee.glb',
  cuttingBoard: 'food/cutting-board.glb',
  fryingPan: 'food/frying-pan.glb',
  egg: 'food/egg.glb',
  plateDinner: 'food/plate-dinner.glb',
  pizza: 'food/pizza.glb',
  salad: 'food/salad.glb',
  shakerPepper: 'food/shaker-pepper.glb',
  shakerSalt: 'food/shaker-salt.glb',
  sodaBottle: 'food/soda-bottle.glb',
};

/**
 * The Mini Shop and Food kits are drawn in their own colours (one colour map each, so the theme's tones would
 * turn a burger into a blob), and at their own scale: the shop's things are as big as the characters' kit,
 * the food is much smaller than a tile (a dinner plate is 0.9 across in the kit).
 */
export const keepsColours = (id: ModelId): boolean => !MODELS[id].startsWith('furniture/');
/** How big a model is drawn against its file: the Furniture Kit at `MODEL_SCALE`; measured for the other two kits. */
export const modelScale = (id: ModelId): number => (MODELS[id].startsWith('shop/') ? CHARACTER_SCALE : MODELS[id].startsWith('food/') ? 0.5 : MODEL_SCALE);

/** The people of the office. Someone's name decides which one they are, so they always look the same. */
export const CHARACTERS = {
  female: [
    'characters/character-female-a.glb', 'characters/character-female-b.glb', 'characters/character-female-c.glb',
    'characters/character-female-d.glb', 'characters/character-female-e.glb', 'characters/character-female-f.glb',
  ],
  male: [
    // The kit's sixth man is a police officer, who has no business at a broadcaster.
    'characters/character-male-a.glb', 'characters/character-male-b.glb', 'characters/character-male-d.glb',
    'characters/character-male-e.glb', 'characters/character-male-f.glb',
  ],
} as const;

/**
 * The character of the person with this name. It goes by name, not by id, so a
 * host looks the same at a rival, in the hiring pool and on your own staff.
 * Who is a woman is `isWoman` (sim/names.ts), which the leave of staff goes by too.
 * Given names on both lists (Charlie, Sam…) take either kind of character, by the hash of the whole name.
 */
export function characterFor(name: string): string {
  const hash = nameHash(name);
  if (isEitherName(name)) {
    const all = [...CHARACTERS.female, ...CHARACTERS.male];
    return all[hash % all.length]!;
  }
  const pool = isWoman(name) ? CHARACTERS.female : CHARACTERS.male;
  return pool[hash % pool.length]!;
}

/**
 * Clips in the character files for what people do in the office. Several clips
 * play together: sitting is a still pose, so the idle clip keeps the upper body moving.
 */
export const ANIMATIONS = { idle: ['idle'], walk: ['walk'], sit: ['sit', 'idle'], work: ['interact-right'], clean: ['pick-up'] } as const;
export type Activity = keyof typeof ANIMATIONS;

/**
 * How far a seated character is raised, in tiles. The `sit` clip is a pose for
 * sitting on the ground: it drops the hips to just above the floor. The kit's
 * chairs and sofa all have their seat at 0.46–0.48 tiles, so this puts the
 * hips on the seat.
 */
export const SEAT_HEIGHT = 0.45;

export const modelUrl = (file: string) => `${import.meta.env.BASE_URL}models/${file}`;

/** Every model id and every tone, as lists (for the checker of mod files: a list cannot drift from its type). */
export const MODEL_IDS = Object.keys(MODELS) as ModelId[];
const EVERY_TONE: Record<Tone, true> = {
  wood: true, woodDark: true, fabric: true, fabricDark: true, white: true, plant: true, metal: true, metalMid: true, metalDark: true, lamp: true, onAir: true,
  accent: true, street: true, pavement: true, facade: true, trim: true, glass: true, grass: true, sand: true, water: true, field: true, rock: true,
};
export const TONES = Object.keys(EVERY_TONE) as Tone[];

/**
 * One part of a piece of furniture. Positions are in tiles from the top-left
 * corner of its footprint: x to the right, y up, z towards the viewer; `at` is
 * the middle of the part's underside. `turn` is in quarter turns,
 * counter-clockwise seen from above. A shape can also lean: `tilt` raises its
 * far side and `roll` its left side, in degrees, about its own middle. A
 * cylinder stands upright; tilt or roll it by 90 to lay it down.
 */
export type Part = {
  at: [x: number, y: number, z: number];
  turn?: number;
  /** Only at these equipment tiers (inclusive). A part in a group also needs its group to show. */
  tiers?: [from: number, to: number];
  /**
   * Only while someone is at this place for people: its index in the piece's whole `spots` list (0 is the editor's
   * "Place 1"). A group's tick covers its parts, and a part in it can only narrow that.
   */
  usedBy?: number;
} & (
  | { model: ModelId; /** Other tones for the model's materials, by the kit's material name. */ tones?: Record<string, Tone>; /** Size against the kit's own, 1 if left out. */ size?: number }
  // A piece's own model from the mods folder (src/mods/): `glb` is its address, its colors are its own.
  | { glb: string; size?: number }
  | { box: [width: number, height: number, depth: number]; tone: Tone; tilt?: number; roll?: number }
  | { cylinder: [radius: number, height: number, topRadius?: number]; tone: Tone; tilt?: number; roll?: number }
  // Several parts that lean together about one point, like a lamp in its yoke: `at` is that point and the parts are placed from it.
  | { parts: Part[]; tilt?: number; roll?: number }
);

/** Whether a part is there at a tier: it has no tiers, or the tier is within them. */
export const showsAtTier = (part: Part, tier: number): boolean => !part.tiers || (tier >= part.tiers[0] && tier <= part.tiers[1]);

/** The parts that are there at a tier, inside every group too. A group left with nothing in it stays and draws nothing. */
export function partsForTier(parts: readonly Part[], tier: number): Part[] {
  return parts.filter((p) => showsAtTier(p, tier)).map((p) => ('parts' in p ? { ...p, parts: partsForTier(p.parts, tier) } : p));
}

/** Whether any part, in a group too, shows only while a place is in use. */
export const hasUsedBy = (parts: readonly Part[]): boolean => parts.some((p) => p.usedBy !== undefined || ('parts' in p && hasUsedBy(p.parts)));

/** Where someone using a piece of furniture is, and what they do there. */
export interface Spot {
  at: [x: number, z: number];
  /** Quarter turns, as for parts; 0 faces the viewer's left wall (north). */
  turn: number;
  activity: Activity;
  /** Only at these equipment tiers (inclusive). */
  tiers?: [from: number, to: number];
  /** How far above the floor the place is, in tiles: for seats on steps. */
  up?: number;
}

export interface FurnitureAsset {
  parts: Part[];
  /**
   * How the whole piece stands when unturned, in quarter turns: 0.5 puts it
   * at 45 degrees to the walls. Only for pieces with a square footprint.
   */
  angle?: number;
  /** Places for people, in the order they are taken. */
  spots?: Spot[];
}

/**
 * What stands on the roof (0.15.0), in tiles from the foot of each: the mast
 * of the antenna, a lattice tower painted in bands of red and white with dishes
 * on its sides and a light on top, after the designer's photo; and once the
 * satellite uplink is researched, a big white dish on a frame, tilted up at the sky.
 */
export const ROOF_ASSETS: Record<'antenna' | 'dish' | 'helipad' | 'helicopter' | 'helicopterRotor' | 'helicopterTail', Part[]> = {
  antenna: [
    { box: [1.6, 0.3, 1.6], tone: 'metalDark', at: [0, 0, 0] },
    ...[0, 1, 2, 3, 4, 5, 6, 7].flatMap((band): Part[] => {
      const width = 1.2 - band * 0.12;
      const y = 0.3 + band * 0.9;
      const tone = band % 2 === 0 ? 'onAir' : 'white';
      return [
        ...[-1, 1].flatMap((sx) => [-1, 1].map((sz): Part => ({ box: [0.08, 0.92, 0.08], tone, at: [(sx * width) / 2, y, (sz * width) / 2] }))),
        ...[-1, 1].map((sz): Part => ({ box: [width, 0.05, 0.05], tone, at: [0, y + 0.45, (sz * width) / 2] })),
        ...[-1, 1].map((sx): Part => ({ box: [0.05, 0.05, width], tone, at: [(sx * width) / 2, y + 0.45, 0] })),
        { box: [width * 1.3, 0.04, 0.04], tone, roll: 45, at: [0, y + 0.25, width / 2] },
      ];
    }),
    // Dishes on its sides, facing out over the town.
    ...([[0.55, 2.4, 0.2, 1], [-0.5, 3.6, -0.1, 3], [0.45, 4.8, -0.3, 1]] as const).map(([x, y, z, turn]): Part => ({ cylinder: [0.3, 0.22, 0.34], tone: 'white', roll: 90, turn, at: [x, y, z] })),
    { cylinder: [0.04, 1.6], tone: 'metal', at: [0, 7.5, 0] },
    { cylinder: [0.12, 0.16], tone: 'lamp', at: [0, 9.1, 0] },
  ],
  dish: [
    { box: [2, 0.3, 2], tone: 'metalDark', at: [0, 0, 0] },
    ...[-0.6, 0.6].map((x): Part => ({ box: [0.14, 1.3, 0.14], tone: 'white', at: [x, 0.3, 0] })),
    { box: [1.4, 0.12, 0.3], tone: 'white', at: [0, 1.5, 0] },
    { at: [0, 1.65, 0], tilt: -40, parts: [
      { cylinder: [0.25, 0.5, 1.6], tone: 'white', at: [0, 0, 0] },
      { cylinder: [0.04, 1.3], tone: 'metal', at: [0, 0.4, 0] },
      { cylinder: [0.12, 0.16], tone: 'metalMid', at: [0, 1.7, 0] },
    ] },
  ],
  // The helipad (under 0.1 high): a dark slab 4 x 4 tiles centred on its origin, a white ring and
  // an H painted on it, and twelve lamps round the edge. It stands on the roof with or without a helicopter.
  helipad: [
    { box: [4, 0.05, 4], tone: 'metalDark', at: [0, 0, 0] },
    { cylinder: [1.6, 0.01], tone: 'white', at: [0, 0.05, 0] },
    { cylinder: [1.5, 0.012], tone: 'metalDark', at: [0, 0.05, 0] },
    ...[-0.5, 0.5].map((x): Part => ({ box: [0.2, 0.012, 1.6], tone: 'white', at: [x, 0.062, 0] })),
    { box: [1.2, 0.012, 0.2], tone: 'white', at: [0, 0.062, 0] },
    ...Array.from({ length: 12 }, (_, i): Part => {
      const a = (i / 12) * Math.PI * 2;
      return { cylinder: [0.07, 0.04], tone: 'lamp', at: [Math.cos(a) * 1.85, 0.05, Math.sin(a) * 1.85] };
    }),
  ],
  // The traffic helicopter, a news chopper in white and red, about 2.6 tiles nose to tail, nose towards +z, skids
  // on y = 0, centred on its origin. The rotors are their own pieces, to be spun: see HELICOPTER_ROTOR_AT and HELICOPTER_TAIL_AT.
  helicopter: [
    // Skids and their struts.
    ...[-0.42, 0.42].flatMap((x): Part[] => [
      { box: [0.07, 0.06, 1.7], tone: 'metalDark', at: [x, 0, 0.15] },
      { box: [0.05, 0.3, 0.05], tone: 'metalDark', at: [x, 0.06, 0.65] },
      { box: [0.05, 0.3, 0.05], tone: 'metalDark', at: [x, 0.06, -0.3] },
    ]),
    // Cabin with a red band, the glass nose bubble and side windows.
    { box: [0.9, 0.6, 1.2], tone: 'white', at: [0, 0.34, 0.2] },
    { box: [0.92, 0.1, 1.22], tone: 'onAir', at: [0, 0.46, 0.2] },
    { box: [0.8, 0.5, 0.4], tone: 'glass', at: [0, 0.4, 0.8] },
    { box: [0.92, 0.22, 0.5], tone: 'glass', at: [0, 0.64, 0.5] },
    // Engine hump, rotor mast and a light on its top.
    { box: [0.6, 0.25, 0.7], tone: 'white', at: [0, 0.94, -0.1] },
    { cylinder: [0.06, 0.26], tone: 'metalDark', at: [0, 1.19, -0.1] },
    // Tail boom, fin and a red tip.
    { box: [0.14, 0.16, 0.9], tone: 'white', at: [0, 0.62, -0.85] },
    { box: [0.05, 0.5, 0.28], tone: 'onAir', at: [0, 0.62, -1.15] },
    { box: [0.3, 0.04, 0.2], tone: 'white', at: [0, 0.7, -1.0] },
    { cylinder: [0.04, 0.05], tone: 'lamp', at: [0, 1.12, -1.2] },
  ],
  // The main rotor: two blades crossing and a hub, centred on its origin at y = 0, to spin about the vertical axis.
  helicopterRotor: [
    { box: [3.2, 0.03, 0.14], tone: 'metalDark', at: [0, 0, 0] },
    { box: [0.14, 0.03, 3.2], tone: 'metalDark', at: [0, 0, 0] },
    { cylinder: [0.1, 0.08], tone: 'metalMid', at: [0, 0.03, 0] },
  ],
  // The tail rotor: two small blades in the x = const plane and a hub, centred on its origin, to spin about the x axis.
  helicopterTail: [
    { box: [0.03, 0.56, 0.07], tone: 'metalDark', at: [0, -0.28, 0] },
    { box: [0.03, 0.07, 0.56], tone: 'metalDark', at: [0, -0.035, 0] },
    { box: [0.08, 0.1, 0.1], tone: 'metalMid', at: [0, -0.05, 0] },
  ],
};

/** Where the main rotor's hub is on the helicopter, in the helicopter's frame, in tiles: on top of its mast. */
export const HELICOPTER_ROTOR_AT: [number, number, number] = [0, 1.45, -0.1];
/** Where the tail rotor's hub is on the helicopter, in the helicopter's frame, in tiles: on the fin's right side. */
export const HELICOPTER_TAIL_AT: [number, number, number] = [0.08, 0.87, -1.2];

const DESK_TOP = 0.77;
/** Height of the round table's top. */
const TABLE_TOP = 0.74;

// The telephones on the desks, from the foot of the phone, its front towards whoever sits at the desk.
// A dial phone: a dark body, a white dial on top and the handset lying across it.
const DIAL_PHONE: Part[] = [
  { box: [0.22, 0.08, 0.18], tone: 'metalDark', at: [0, 0, 0] },
  { cylinder: [0.055, 0.012], tone: 'white', at: [0, 0.08, -0.035] },
  { cylinder: [0.022, 0.016], tone: 'metalDark', at: [0, 0.08, -0.035] },
  { box: [0.26, 0.035, 0.05], tone: 'metalDark', at: [0, 0.1, 0.055] },
  ...[-0.11, 0.11].map((x): Part => ({ box: [0.06, 0.05, 0.07], tone: 'metalDark', at: [x, 0.08, 0.055] })),
];
// A push-button phone: a flatter body, the handset along its left side and a grid of white buttons.
const PUSH_PHONE: Part[] = [
  { box: [0.22, 0.06, 0.18], tone: 'metalDark', at: [0, 0, 0] },
  { box: [0.06, 0.035, 0.2], tone: 'metalDark', at: [-0.07, 0.06, 0] },
  ...[0, 1, 2].flatMap((i) => [0, 1, 2, 3].map((j): Part => ({ box: [0.022, 0.01, 0.018], tone: 'white', at: [0.03 + i * 0.03, 0.06, -0.05 + j * 0.032] }))),
];
// On a workstation or a writer's place: a dial phone until computers arrive, then a push-button phone,
// and none once everyone carries a mobile.
const deskPhones = (at: Part['at']): Part[] => [
  { at, tiers: [1, 2], parts: DIAL_PHONE },
  { at, tiers: [3, 3], parts: PUSH_PHONE },
];

export const FURNITURE_ASSETS: Record<BuiltInFurniture, FurnitureAsset> = {
  workstation: {
    parts: [
      { model: 'desk', at: [1, 0, 1.45], turn: 2 },
      { model: 'deskChair', at: [1, 0, 0.65] },
      { box: [0.5, 0.14, 0.34], tone: 'metalDark', at: [1, 0.77, 1.4], tiers: [1, 2] },
      { box: [0.4, 0.2, 0.03], tone: 'white', at: [1, 0.91, 1.52], tiers: [1, 2] },
      { model: 'screen', at: [1, 0.77, 1.6], turn: 2, tiers: [3, 3] },
      { model: 'keyboard', at: [1, 0.77, 1.28], turn: 2, tiers: [3, 3] },
      { model: 'laptop', at: [1, 0.77, 1.45], turn: 2, tiers: [4, 9] },
      { at: [1.55, 0.77, 1.5], tiers: [1, 2], parts: [
        { box: [0.22, 0.08, 0.18], tone: 'metalDark', at: [0, 0, 0] },
        { cylinder: [0.055, 0.012], tone: 'white', at: [0, 0.08, -0.035] },
        { cylinder: [0.022, 0.016], tone: 'metalDark', at: [0, 0.08, -0.035] },
        { box: [0.26, 0.035, 0.05], tone: 'metalDark', at: [0, 0.1, 0.055] },
        { box: [0.06, 0.05, 0.07], tone: 'metalDark', at: [-0.11, 0.08, 0.055] },
        { box: [0.06, 0.05, 0.07], tone: 'metalDark', at: [0.11, 0.08, 0.055] },
      ] },
      { at: [1.55, 0.77, 1.5], tiers: [3, 3], parts: [
        { box: [0.22, 0.06, 0.18], tone: 'metalDark', at: [0, 0, 0] },
        { box: [0.06, 0.035, 0.2], tone: 'metalDark', at: [-0.07, 0.06, 0] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.03, 0.06, -0.05] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.03, 0.06, -0.018] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.03, 0.06, 0.014] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.03, 0.06, 0.046] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.06, 0.06, -0.05] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.06, 0.06, -0.018] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.06, 0.06, 0.014] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.06, 0.06, 0.046] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.09, 0.06, -0.05] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.09, 0.06, -0.018] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.09, 0.06, 0.014] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.09, 0.06, 0.046] },
      ] },
      // Only while someone sits here (0.21.0): the screen is lit, and a cup of coffee stands at the left of the desk.
      { box: [0.62, 0.3, 0.012], tone: 'lamp', at: [1, 0.96, 1.495], tiers: [3, 3], usedBy: 0 },
      { box: [0.06, 0.03, 0.02], tone: 'lamp', at: [1.22, 0.83, 1.7], tiers: [3, 3], usedBy: 0 },
      { box: [0.4, 0.2, 0.012], tone: 'lamp', at: [1, 0.88, 1.66], tilt: 15, tiers: [4, 9], usedBy: 0 },
      { model: 'cupCoffee', size: 1.6, at: [0.5, 0.77, 1.35], usedBy: 0 },
    ],
    spots: [
      { at: [1, 0.73], turn: 2, activity: 'sit', up: 0.1 },
    ],
  },
  // A place at the writers' table: a stretch of a long white table with the writer behind it, facing
  // the viewer, the way a workstation has them. Places side by side make one long table. On it a
  // typewriter, then a screen and keyboard, then a laptop, a telephone until the laptops, and always a
  // stack of paper and a mug.
  writingDesk: {
    parts: [
      { box: [2.0, 0.05, 0.9], tone: 'white', at: [1, 0.72, 1.4] },
      ...[0.12, 1.88].map((x): Part => ({ box: [0.08, 0.72, 0.8], tone: 'metalMid', at: [x, 0, 1.4] })),
      { model: 'chair', tones: { wood: 'fabric' }, at: [1, 0, 0.65] },
      { box: [0.5, 0.14, 0.34], tone: 'metalDark', at: [1, DESK_TOP, 1.4], tiers: [1, 2] },
      { box: [0.4, 0.2, 0.03], tone: 'white', at: [1, DESK_TOP + 0.14, 1.52], tiers: [1, 2] },
      { model: 'screen', at: [1, DESK_TOP, 1.6], turn: 2, tiers: [3, 3] },
      { model: 'keyboard', at: [1, DESK_TOP, 1.28], turn: 2, tiers: [3, 3] },
      { model: 'laptop', at: [1, DESK_TOP, 1.45], turn: 2, tiers: [4, 9] },
      { box: [0.3, 0.06, 0.22], tone: 'white', at: [0.45, DESK_TOP, 1.35] },
      { box: [0.28, 0.02, 0.2], tone: 'lamp', at: [0.45, DESK_TOP + 0.06, 1.35] },
      { cylinder: [0.05, 0.1], tone: 'fabric', at: [1.55, DESK_TOP, 1.3] },
      ...deskPhones([1.55, DESK_TOP, 1.5]),
    ],
    spots: [{ at: [1, 0.72], turn: 2, activity: 'sit' }],
  },
  // After the designer's photos of editing suites. The editor sits with their back to the viewer at a
  // console against the wall. Versions 1 and 2: a console of wood with a hutch of three small monitors,
  // tape machines on the right and a desk of faders. Version 3: a white desk with three flat screens, a
  // big one above them, and a speaker on either side.
  editingDesk: {
    parts: [
      { model: 'deskChair', at: [1, 0, 1.45], turn: 2 },
      { at: [0, 0, 0], tiers: [1, 2], parts: [
        { box: [1.9, 0.72, 0.7], tone: 'woodDark', at: [1, 0, 0.4] },
        { box: [1.96, 0.05, 0.8], tone: 'wood', at: [1, 0.72, 0.42] },
        { box: [1.9, 0.62, 0.32], tone: 'woodDark', at: [1, 0.77, 0.18] },
        { box: [0.46, 0.36, 0.04], tone: 'metalDark', at: [0.4, 0.92, 0.35] },
        { box: [0.46, 0.36, 0.04], tone: 'metalDark', at: [1, 0.92, 0.35] },
        { box: [0.36, 0.26, 0.02], tone: 'glass', at: [0.4, 0.97, 0.38] },
        { box: [0.36, 0.26, 0.02], tone: 'glass', at: [1, 0.97, 0.38] },
        { box: [0.5, 0.24, 0.04], tone: 'white', at: [1.6, 0.82, 0.35] },
        { cylinder: [0.07, 0.02], tone: 'metalDark', tilt: 90, at: [1.48, 0.87, 0.37] },
        { cylinder: [0.07, 0.02], tone: 'metalDark', tilt: 90, at: [1.72, 0.87, 0.37] },
        { box: [0.5, 0.24, 0.04], tone: 'white', at: [1.6, 1.1, 0.35] },
        { cylinder: [0.07, 0.02], tone: 'metalDark', tilt: 90, at: [1.48, 1.15, 0.37] },
        { cylinder: [0.07, 0.02], tone: 'metalDark', tilt: 90, at: [1.72, 1.15, 0.37] },
        { box: [1.1, 0.06, 0.36], tone: 'metalDark', tilt: 10, at: [0.8, 0.77, 0.6], turn: 2 },
        { box: [0.05, 0.03, 0.16], tone: 'lamp', tilt: 10, at: [0.38, 0.81, 0.6], turn: 2 },
        { box: [0.05, 0.03, 0.16], tone: 'white', tilt: 10, at: [0.52, 0.81, 0.6], turn: 2 },
        { box: [0.05, 0.03, 0.16], tone: 'white', tilt: 10, at: [0.66, 0.81, 0.6], turn: 2 },
        { box: [0.05, 0.03, 0.16], tone: 'lamp', tilt: 10, at: [0.8, 0.81, 0.6], turn: 2 },
        { box: [0.05, 0.03, 0.16], tone: 'white', tilt: 10, at: [0.94, 0.81, 0.6], turn: 2 },
        { box: [0.05, 0.03, 0.16], tone: 'white', tilt: 10, at: [1.08, 0.81, 0.6], turn: 2 },
        { box: [0.05, 0.03, 0.16], tone: 'lamp', tilt: 10, at: [1.22, 0.81, 0.6], turn: 2 },
      ] },
      { at: [0, 0, 0], tiers: [3, 9], parts: [
        { box: [1.9, 0.68, 0.6], tone: 'wood', at: [1, 0, 0.42] },
        { box: [1.96, 0.05, 0.72], tone: 'white', at: [1, 0.68, 0.42] },
        { box: [0.9, 0.5, 0.04], tone: 'metalDark', at: [1, 1.18, 0.12] },
        { box: [0.84, 0.44, 0.02], tone: 'fabricDark', at: [1, 1.21, 0.15] },
        { box: [0.5, 0.3, 0.03], tone: 'metalDark', at: [0.45, 0.8, 0.3] },
        { box: [0.46, 0.26, 0.02], tone: 'glass', at: [0.45, 0.82, 0.32] },
        { box: [0.5, 0.3, 0.03], tone: 'metalDark', at: [1, 0.8, 0.3] },
        { box: [0.46, 0.26, 0.02], tone: 'glass', at: [1, 0.82, 0.32] },
        { box: [0.5, 0.3, 0.03], tone: 'metalDark', at: [1.55, 0.8, 0.3] },
        { box: [0.46, 0.26, 0.02], tone: 'glass', at: [1.55, 0.82, 0.32] },
        { box: [0.16, 0.26, 0.16], tone: 'metalDark', at: [0.08, 0.73, 0.2] },
        { box: [0.16, 0.26, 0.16], tone: 'metalDark', at: [1.92, 0.73, 0.2] },
        { model: 'keyboard', size: 0.8, at: [1, 0.73, 0.6] },
      ] },
    ],
    spots: [
      { at: [1, 1.3], turn: 0, activity: 'sit' },
    ],
  },
  // After the designer's photo of an audio engineer's room: a long desk of light wood with a dark stone top, a
  // big digital console in the middle between two monitor speakers, and a yellow desk lamp. Versions 1 and 2
  // have a tape machine with two reels at the back; from version 3 a wide flat screen stands there instead.
  // The engineer sits with their back to the viewer, as an editor does.
  audioDesk: {
    parts: [
      { model: 'deskChair', at: [1, 0, 1.45], turn: 2 },
      { box: [1.9, 0.7, 0.7], tone: 'wood', at: [1, 0, 0.42] },
      { box: [1.96, 0.05, 0.82], tone: 'metalDark', at: [1, 0.7, 0.44] },
      { box: [0.96, 0.08, 0.5], tone: 'metalMid', tilt: -10, at: [1, 0.76, 0.5] },
      { box: [0.04, 0.03, 0.14], tone: 'white', tilt: -10, at: [0.65, 0.84, 0.6] },
      { box: [0.04, 0.03, 0.14], tone: 'white', tilt: -10, at: [0.75, 0.84, 0.6] },
      { box: [0.04, 0.03, 0.14], tone: 'white', tilt: -10, at: [0.85, 0.84, 0.6] },
      { box: [0.04, 0.03, 0.14], tone: 'lamp', tilt: -10, at: [0.95, 0.84, 0.6] },
      { box: [0.04, 0.03, 0.14], tone: 'white', tilt: -10, at: [1.05, 0.84, 0.6] },
      { box: [0.04, 0.03, 0.14], tone: 'white', tilt: -10, at: [1.15, 0.84, 0.6] },
      { box: [0.04, 0.03, 0.14], tone: 'white', tilt: -10, at: [1.25, 0.84, 0.6] },
      { box: [0.04, 0.03, 0.14], tone: 'lamp', tilt: -10, at: [1.35, 0.84, 0.6] },
      { box: [0.7, 0.04, 0.06], tone: 'plant', tilt: -10, at: [1, 0.86, 0.36] },
      { box: [0.3, 0.42, 0.28], tone: 'metalDark', at: [0.28, 0.75, 0.32] },
      { cylinder: [0.09, 0.02], tone: 'metal', tilt: 90, at: [0.28, 0.88, 0.46] },
      { cylinder: [0.04, 0.02], tone: 'metal', tilt: 90, at: [0.28, 1.06, 0.46] },
      { box: [0.3, 0.42, 0.28], tone: 'metalDark', at: [1.72, 0.75, 0.32] },
      { cylinder: [0.09, 0.02], tone: 'metal', tilt: 90, at: [1.72, 0.88, 0.46] },
      { cylinder: [0.04, 0.02], tone: 'metal', tilt: 90, at: [1.72, 1.06, 0.46] },
      { cylinder: [0.07, 0.02], tone: 'lamp', at: [0.28, 0.75, 0.72] },
      { cylinder: [0.015, 0.3], tone: 'lamp', roll: 20, at: [0.3, 0.77, 0.72] },
      { cylinder: [0.04, 0.1, 0.1], tone: 'lamp', at: [0.36, 1.03, 0.72] },
      { at: [0, 0, 0], tiers: [1, 2], parts: [
        { box: [0.6, 0.3, 0.08], tone: 'white', at: [1, 0.75, 0.12] },
        { cylinder: [0.09, 0.02], tone: 'metalDark', tilt: 90, at: [0.86, 0.84, 0.17] },
        { cylinder: [0.09, 0.02], tone: 'metalDark', tilt: 90, at: [1.14, 0.84, 0.17] },
      ] },
      { at: [0, 0, 0], tiers: [3, 9], parts: [
        { box: [0.06, 0.2, 0.06], tone: 'metalDark', at: [1, 0.75, 0.14] },
        { box: [0.9, 0.45, 0.04], tone: 'metalDark', at: [1, 0.92, 0.12] },
        { box: [0.84, 0.39, 0.02], tone: 'glass', at: [1, 0.95, 0.15] },
      ] },
    ],
    spots: [
      { at: [1, 1.3], turn: 0, activity: 'sit' },
    ],
  },
  // A music scheduler's desk: a wooden desk on the left with the schedule on a typewriter, a screen or a laptop
  // by the tier, and a lamp; on the right a shelf of CDs against the wall and a crate of records in front of it. The scheduler sits with their back to the viewer, as an editor does.
  schedulingDesk: {
    parts: [
      { model: 'deskChair', at: [0.65, 0, 1.45], turn: 2 },
      { box: [1.3, 0.7, 0.64], tone: 'wood', at: [0.7, 0, 0.4] },
      { box: [1.36, 0.05, 0.74], tone: 'white', at: [0.7, 0.7, 0.42] },
      { box: [0.5, 0.14, 0.34], tone: 'metalDark', at: [0.7, 0.75, 0.45], tiers: [1, 2] },
      { box: [0.4, 0.2, 0.03], tone: 'white', at: [0.7, 0.89, 0.33], tiers: [1, 2] },
      { box: [0.06, 0.16, 0.06], tone: 'metalDark', at: [0.7, 0.75, 0.2], tiers: [3, 3] },
      { box: [0.8, 0.5, 0.04], tone: 'metalDark', at: [0.7, 0.9, 0.16], tiers: [3, 3] },
      { box: [0.74, 0.44, 0.02], tone: 'glass', at: [0.7, 0.93, 0.19], tiers: [3, 3] },
      { box: [0.12, 0.08, 0.01], tone: 'lamp', at: [0.46, 1.12, 0.2], tiers: [3, 3] },
      { box: [0.12, 0.08, 0.01], tone: 'accent', at: [0.58, 1.12, 0.2], tiers: [3, 3] },
      { box: [0.12, 0.08, 0.01], tone: 'white', at: [0.7, 1.12, 0.2], tiers: [3, 3] },
      { box: [0.12, 0.08, 0.01], tone: 'white', at: [0.82, 1.12, 0.2], tiers: [3, 3] },
      { box: [0.12, 0.08, 0.01], tone: 'white', at: [0.94, 1.12, 0.2], tiers: [3, 3] },
      { box: [0.12, 0.08, 0.01], tone: 'white', at: [0.46, 1, 0.2], tiers: [3, 3] },
      { box: [0.12, 0.08, 0.01], tone: 'white', at: [0.58, 1, 0.2], tiers: [3, 3] },
      { box: [0.12, 0.08, 0.01], tone: 'lamp', at: [0.7, 1, 0.2], tiers: [3, 3] },
      { box: [0.12, 0.08, 0.01], tone: 'white', at: [0.82, 1, 0.2], tiers: [3, 3] },
      { box: [0.12, 0.08, 0.01], tone: 'white', at: [0.94, 1, 0.2], tiers: [3, 3] },
      { box: [0.12, 0.08, 0.01], tone: 'white', at: [0.46, 0.88, 0.2], tiers: [3, 3] },
      { box: [0.12, 0.08, 0.01], tone: 'white', at: [0.58, 0.88, 0.2], tiers: [3, 3] },
      { box: [0.12, 0.08, 0.01], tone: 'white', at: [0.7, 0.88, 0.2], tiers: [3, 3] },
      { box: [0.12, 0.08, 0.01], tone: 'accent', at: [0.82, 0.88, 0.2], tiers: [3, 3] },
      { box: [0.12, 0.08, 0.01], tone: 'lamp', at: [0.94, 0.88, 0.2], tiers: [3, 3] },
      { model: 'keyboard', size: 0.7, at: [0.62, 0.75, 0.55], tiers: [3, 3] },
      { box: [0.1, 0.02, 0.07], tone: 'metalDark', at: [1, 0.75, 0.55], tiers: [3, 3] },
      { model: 'laptop', at: [0.7, 0.75, 0.4], turn: 2, tiers: [4, 9] },
      { box: [0.2, 0.01, 0.28], tone: 'white', at: [0.2, 0.75, 0.5] },
      { box: [0.07, 0.012, 0.07], tone: 'lamp', at: [0.16, 0.755, 0.4] },
      { box: [0.07, 0.012, 0.07], tone: 'accent', at: [0.24, 0.755, 0.4] },
      { box: [0.07, 0.012, 0.07], tone: 'accent', at: [0.16, 0.755, 0.48] },
      { box: [0.07, 0.012, 0.07], tone: 'lamp', at: [0.24, 0.755, 0.48] },
      { box: [0.07, 0.012, 0.07], tone: 'accent', at: [0.16, 0.755, 0.56] },
      { box: [0.07, 0.012, 0.07], tone: 'accent', at: [0.24, 0.755, 0.56] },
      { at: [1.1, 0.75, 0.55], tiers: [1, 2], parts: [
        { box: [0.22, 0.08, 0.18], tone: 'metalDark', at: [0, 0, 0] },
        { cylinder: [0.055, 0.012], tone: 'white', at: [0, 0.08, -0.035] },
        { cylinder: [0.022, 0.016], tone: 'metalDark', at: [0, 0.08, -0.035] },
        { box: [0.26, 0.035, 0.05], tone: 'metalDark', at: [0, 0.1, 0.055] },
        { box: [0.06, 0.05, 0.07], tone: 'metalDark', at: [-0.11, 0.08, 0.055] },
        { box: [0.06, 0.05, 0.07], tone: 'metalDark', at: [0.11, 0.08, 0.055] },
      ] },
      { at: [1.1, 0.75, 0.55], tiers: [3, 3], parts: [
        { box: [0.22, 0.06, 0.18], tone: 'metalDark', at: [0, 0, 0] },
        { box: [0.06, 0.035, 0.2], tone: 'metalDark', at: [-0.07, 0.06, 0] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.03, 0.06, -0.05] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.03, 0.06, -0.018] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.03, 0.06, 0.014] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.03, 0.06, 0.046] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.06, 0.06, -0.05] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.06, 0.06, -0.018] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.06, 0.06, 0.014] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.06, 0.06, 0.046] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.09, 0.06, -0.05] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.09, 0.06, -0.018] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.09, 0.06, 0.014] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.09, 0.06, 0.046] },
      ] },
      { cylinder: [0.06, 0.02], tone: 'lamp', at: [1.2, 0.75, 0.3] },
      { cylinder: [0.04, 0.1, 0.1], tone: 'lamp', at: [1.2, 0.92, 0.3] },
      { box: [0.06, 1.3, 0.3], tone: 'woodDark', at: [1.42, 0, 0.2] },
      { box: [0.06, 1.3, 0.3], tone: 'woodDark', at: [1.94, 0, 0.2] },
      { box: [0.58, 0.04, 0.3], tone: 'woodDark', at: [1.68, 0.02, 0.2] },
      { box: [0.58, 0.04, 0.3], tone: 'woodDark', at: [1.68, 0.45, 0.2] },
      { box: [0.58, 0.04, 0.3], tone: 'woodDark', at: [1.68, 0.85, 0.2] },
      { box: [0.58, 0.04, 0.3], tone: 'woodDark', at: [1.68, 1.28, 0.2] },
      { box: [0.04, 0.34, 0.2], tone: 'accent', at: [1.5, 0.06, 0.22] },
      { box: [0.04, 0.34, 0.2], tone: 'metalMid', at: [1.556, 0.06, 0.22] },
      { box: [0.04, 0.34, 0.2], tone: 'lamp', at: [1.612, 0.06, 0.22] },
      { box: [0.04, 0.34, 0.2], tone: 'fabric', at: [1.668, 0.06, 0.22] },
      { box: [0.04, 0.34, 0.2], tone: 'white', at: [1.724, 0.06, 0.22] },
      { box: [0.04, 0.34, 0.2], tone: 'accent', at: [1.78, 0.06, 0.22] },
      { box: [0.04, 0.34, 0.2], tone: 'metalMid', at: [1.836, 0.06, 0.22] },
      { box: [0.04, 0.34, 0.2], tone: 'lamp', at: [1.892, 0.06, 0.22] },
      { box: [0.04, 0.34, 0.2], tone: 'white', at: [1.5, 0.49, 0.22] },
      { box: [0.04, 0.34, 0.2], tone: 'accent', at: [1.556, 0.49, 0.22] },
      { box: [0.04, 0.34, 0.2], tone: 'metalMid', at: [1.612, 0.49, 0.22] },
      { box: [0.04, 0.34, 0.2], tone: 'lamp', at: [1.668, 0.49, 0.22] },
      { box: [0.04, 0.34, 0.2], tone: 'fabric', at: [1.724, 0.49, 0.22] },
      { box: [0.04, 0.34, 0.2], tone: 'white', at: [1.78, 0.49, 0.22] },
      { box: [0.04, 0.34, 0.2], tone: 'accent', at: [1.836, 0.49, 0.22] },
      { box: [0.04, 0.34, 0.2], tone: 'metalMid', at: [1.892, 0.49, 0.22] },
      { box: [0.04, 0.34, 0.2], tone: 'fabric', at: [1.5, 0.89, 0.22] },
      { box: [0.04, 0.34, 0.2], tone: 'white', at: [1.556, 0.89, 0.22] },
      { box: [0.04, 0.34, 0.2], tone: 'accent', at: [1.612, 0.89, 0.22] },
      { box: [0.04, 0.34, 0.2], tone: 'metalMid', at: [1.668, 0.89, 0.22] },
      { box: [0.04, 0.34, 0.2], tone: 'lamp', at: [1.724, 0.89, 0.22] },
      { box: [0.04, 0.34, 0.2], tone: 'fabric', at: [1.78, 0.89, 0.22] },
      { box: [0.04, 0.34, 0.2], tone: 'white', at: [1.836, 0.89, 0.22] },
      { box: [0.04, 0.34, 0.2], tone: 'accent', at: [1.892, 0.89, 0.22] },
      { box: [0.5, 0.04, 0.46], tone: 'wood', at: [1.68, 0, 0.82] },
      { box: [0.5, 0.3, 0.04], tone: 'wood', at: [1.68, 0, 1.03] },
      { box: [0.5, 0.3, 0.04], tone: 'wood', at: [1.68, 0, 0.61] },
      { box: [0.04, 0.3, 0.46], tone: 'wood', at: [1.45, 0, 0.82] },
      { box: [0.04, 0.3, 0.46], tone: 'wood', at: [1.91, 0, 0.82] },
      { box: [0.03, 0.34, 0.32], tone: 'fabricDark', tilt: 6, at: [1.52, 0.05, 0.82] },
      { box: [0.03, 0.34, 0.32], tone: 'white', tilt: 6, at: [1.58, 0.05, 0.82] },
      { box: [0.03, 0.34, 0.32], tone: 'accent', tilt: 6, at: [1.64, 0.05, 0.82] },
      { box: [0.03, 0.34, 0.32], tone: 'metalDark', tilt: 6, at: [1.7, 0.05, 0.82] },
      { box: [0.03, 0.34, 0.32], tone: 'lamp', tilt: 6, at: [1.76, 0.05, 0.82] },
      { box: [0.03, 0.34, 0.32], tone: 'fabricDark', tilt: 6, at: [1.82, 0.05, 0.82] },
      { box: [0.03, 0.34, 0.32], tone: 'white', tilt: 6, at: [1.88, 0.05, 0.82] },
    ],
    spots: [
      { at: [0.65, 1.3], turn: 0, activity: 'sit' },
    ],
  },
  // A cooker and a sink side by side against the wall, with an extractor hood above. The cook stands in
  // front of it, and the frying pan is on the cooker only while the cook is there.
  stove: {
    parts: [
      { model: 'kitchenStove', size: 1.2, at: [0.5, 0, 0.5] },
      { model: 'kitchenSink', size: 1.2, at: [1.5, 0, 0.5] },
      { model: 'hoodLarge', at: [0.6, 1.5, 0.3] },
      { model: 'fryingPan', usedBy: 0, turn: 2, at: [0.4, 1.05, 0.7] },
    ],
    spots: [{ at: [0.6, 1.6], turn: 0, activity: 'work' }],
  },
  // A long table of light wood with eight chairs: three along each side and one at either end, a jug of
  // water and glasses, and papers at some of the places.
  meetingTable: {
    parts: [
      { box: [2.3, 0.06, 0.9], tone: 'wood', at: [1.5, 0.7, 1] },
      ...[0.45, 2.55].map((x): Part => ({ box: [0.08, 0.7, 0.7], tone: 'woodDark', at: [x, 0, 1] })),
      ...[0.85, 1.5, 2.15].flatMap((x): Part[] => [
        { model: 'chair', tones: { wood: 'fabric' }, at: [x, 0, 0.3] },
        { model: 'chair', tones: { wood: 'fabric' }, at: [x, 0, 1.7], turn: 2 },
      ]),
      { model: 'chair', tones: { wood: 'fabric' }, at: [0.18, 0, 1], turn: 1 },
      { model: 'chair', tones: { wood: 'fabric' }, at: [2.82, 0, 1], turn: 3 },
      { cylinder: [0.06, 0.22], tone: 'glass', at: [1.5, 0.76, 1] },
      ...[[0.85, 0.75], [2.15, 1.25], [1.15, 1.25]].map(([x, z]): Part => ({ box: [0.22, 0.01, 0.3], tone: 'white', at: [x!, 0.76, z!] })),
      ...[[1.3, 0.85], [1.75, 1.15]].map(([x, z]): Part => ({ cylinder: [0.035, 0.1], tone: 'glass', at: [x!, 0.76, z!] })),
    ],
  },
  // A table with a wall of pigeonholes at the back, letters in most of them, a pile on the table and a
  // grey mail bag on the floor. The clerk stands in front, sorting.
  sortingCase: {
    parts: [
      { box: [1.9, 0.75, 0.6], tone: 'wood', at: [1, 0, 0.36] },
      { box: [1.96, 0.04, 0.66], tone: 'woodDark', at: [1, 0.75, 0.36] },
      { box: [1.9, 0.9, 0.3], tone: 'woodDark', at: [1, 0.79, 0.17] },
      ...[0, 1, 2, 3].flatMap((row) => [0, 1, 2, 3, 4, 5].filter((i) => (i * 3 + row) % 4 !== 1).map((i): Part => ({
        box: [0.2, 0.12, 0.02],
        tone: (['white', 'lamp', 'white', 'glass'] as const)[row]!,
        at: [0.27 + i * 0.29, 0.86 + row * 0.2, 0.33],
      }))),
      { box: [0.4, 0.08, 0.28], tone: 'white', at: [0.55, 0.79, 0.52] },
      { box: [0.3, 0.05, 0.22], tone: 'lamp', at: [1.35, 0.79, 0.55] },
      { cylinder: [0.2, 0.5, 0.14], tone: 'metalMid', at: [1.75, 0, 1.55] },
    ],
    spots: [{ at: [1, 1.25], turn: 0, activity: 'work' }],
  },
  // After the designer's photo of a dressing room: a white table of drawers against the wall, under a
  // mirror ringed with bulbs, bottles and brushes on top and a stool in front.
  makeupTable: {
    parts: [
      { box: [1.9, 0.7, 0.45], tone: 'white', at: [1, 0, 0.3] },
      ...[0.35, 1.65].flatMap((x) => [0.18, 0.4].map((y): Part => ({ box: [0.5, 0.02, 0.02], tone: 'metalMid', at: [x, y, 0.53] }))),
      { box: [1.94, 0.04, 0.5], tone: 'white', at: [1, 0.7, 0.3] },
      { box: [1.4, 1.0, 0.04], tone: 'metalMid', at: [1, 0.78, 0.08] },
      { box: [1.24, 0.86, 0.02], tone: 'glass', at: [1, 0.85, 0.11] },
      ...[0, 1, 2, 3, 4, 5, 6].map((i): Part => ({ cylinder: [0.04, 0.05], tone: 'lamp', tilt: 90, at: [0.4 + i * 0.2, 1.72, 0.12] })),
      ...[0.36, 1.64].flatMap((x) => [0, 1, 2, 3].map((i): Part => ({ cylinder: [0.04, 0.05], tone: 'lamp', tilt: 90, at: [x, 0.92 + i * 0.22, 0.12] }))),
      ...([[0.45, 'fabric'], [0.55, 'white'], [1.5, 'plant'], [1.62, 'accent']] as const).map(([x, tone]): Part => ({ cylinder: [0.03, 0.1], tone, at: [x, 0.74, 0.3] })),
      { box: [0.2, 0.03, 0.12], tone: 'fabricDark', at: [1.25, 0.74, 0.32] },
      { cylinder: [0.16, 0.05], tone: 'fabric', at: [1, 0.46, 0.82] },
      { cylinder: [0.03, 0.46], tone: 'metal', at: [1, 0, 0.82] },
    ],
    spots: [{ at: [1, 0.82], turn: 0, activity: 'sit' }],
  },
  // A rail on wheels, full of clothes for the hosts: the Kenney clothing rack.
  clothesRail: {
    parts: [{ model: 'clothingRack', size: 1.5, at: [1, 0, 0.5] }],
  },
  // A white board on two legs, full of cards in rows: one row for each episode.
  storyBoard: {
    parts: [
      ...[0.12, 1.88].map((x): Part => ({ cylinder: [0.03, 1.6], tone: 'metalDark', at: [x, 0, 0.5] })),
      { box: [1.84, 1.0, 0.06], tone: 'metalMid', at: [1, 0.55, 0.5] },
      { box: [1.74, 0.9, 0.02], tone: 'white', at: [1, 0.6, 0.54] },
      ...[0, 1, 2, 3].flatMap((row) => [0, 1, 2, 3, 4, 5].filter((i) => (i + row) % 5 !== 4).map((i): Part => ({
        box: [0.2, 0.14, 0.01],
        tone: (['lamp', 'fabric', 'glass', 'plant'] as const)[row]!,
        at: [0.33 + i * 0.27, 0.66 + row * 0.2, 0.56],
      }))),
    ],
  },
  // The talent manager's place in a workshop: a lectern on the left, its top sloping down towards
  // them, with the lesson's notes on it and a name plate on the front, and beside it a small desk
  // with course books, papers, a mug and a lamp. They stand behind the lectern, facing the class.
  trainerDesk: {
    parts: [
      { box: [0.5, 0.04, 0.42], tone: 'woodDark', at: [0.45, 0, 0.65] },
      { box: [0.36, 0.35, 0.28], tone: 'wood', at: [0.45, 0.04, 0.65] },
      { box: [0.58, 0.05, 0.44], tone: 'woodDark', tilt: -15, at: [0.45, 0.4, 0.65] },
      { box: [0.3, 0.01, 0.22], tone: 'white', tilt: -15, at: [0.43, 0.45, 0.65] },
      { box: [0.24, 0.08, 0.02], tone: 'lamp', at: [0.45, 0.2, 0.7] },
      { box: [0.92, 0.04, 0.56], tone: 'wood', at: [1.42, 0.4, 0.52] },
      { box: [0.04, 0.4, 0.04], tone: 'metalDark', at: [1, 0, 0.28] },
      { box: [0.04, 0.4, 0.04], tone: 'metalDark', at: [1, 0, 0.76] },
      { box: [0.04, 0.4, 0.04], tone: 'metalDark', at: [1.84, 0, 0.28] },
      { box: [0.04, 0.4, 0.04], tone: 'metalDark', at: [1.84, 0, 0.76] },
      { box: [0.26, 0.05, 0.2], tone: 'fabric', at: [1.2, 0.5, 0.5], turn: 0 },
      { box: [0.26, 0.05, 0.2], tone: 'glass', at: [1.2, 0.45, 0.5], turn: 0.08 },
      { box: [0.26, 0.05, 0.2], tone: 'lamp', at: [1.2, 0.6, 0.5], turn: 0.16 },
      { box: [0.26, 0.01, 0.2], tone: 'white', at: [1.55, 0.45, 0.58] },
      { cylinder: [0.045, 0.09], tone: 'accent', at: [1.42, 0.46, 0.36] },
      { cylinder: [0.08, 0.02], tone: 'metalDark', at: [1.74, 0.45, 0.36] },
      { cylinder: [0.015, 0.3], tone: 'metalDark', at: [1.74, 0.46, 0.36] },
      { cylinder: [0.11, 0.1, 0.06], tone: 'lamp', at: [1.74, 0.7, 0.36] },
    ],
    spots: [
      { at: [0.45, 0.2], turn: 2, activity: 'work' },
    ],
  },
  // A small school desk with a book and a pencil on it, and a chair behind it. Whoever sits here
  // faces the far wall, where the whiteboard and the trainer's desk stand facing the room.
  trainingSeat: {
    parts: [
      { box: [0.7, 0.04, 0.42], tone: 'wood', at: [0.5, 0.64, 0.3] },
      ...[0.2, 0.8].flatMap((x) => [0.14, 0.46].map((z): Part => ({ box: [0.04, 0.64, 0.04], tone: 'metalDark', at: [x, 0, z] }))),
      { box: [0.62, 0.03, 0.03], tone: 'metalDark', at: [0.5, 0.5, 0.14] },
      { box: [0.26, 0.03, 0.2], tone: 'glass', at: [0.42, 0.68, 0.32] },
      { box: [0.24, 0.005, 0.18], tone: 'white', at: [0.42, 0.71, 0.32] },
      { cylinder: [0.01, 0.16], tone: 'lamp', roll: 90, turn: 0.4, at: [0.68, 0.69, 0.34] },
      { model: 'chair', tones: { wood: 'fabric' }, size: 0.9, at: [0.5, 0, 0.72], turn: 2 },
    ],
    spots: [{ at: [0.5, 0.72], turn: 0, activity: 'sit' }],
  },
  // A whiteboard in a grey frame on two legs, each on a foot with two castors; a tray of markers
  // along its lower edge, and the lesson in marker on it: a heading, lines of notes, a box and an arrow.
  whiteboard: {
    parts: [
      ...[0.1, 1.9].flatMap((x): Part[] => [
        { box: [0.06, 0.04, 0.6], tone: 'metalMid', at: [x, 0.08, 0.5] },
        ...[0.24, 0.76].map((z): Part => ({ cylinder: [0.04, 0.03], tone: 'metalDark', roll: 90, at: [x, 0.025, z] })),
        { cylinder: [0.025, 1.75], tone: 'metal', at: [x, 0.12, 0.5] },
      ]),
      { box: [1.84, 1.04, 0.05], tone: 'metal', at: [1, 0.68, 0.5] },
      { box: [1.74, 0.94, 0.02], tone: 'white', at: [1, 0.73, 0.53] },
      // The tray and the markers in it.
      { box: [1.4, 0.03, 0.1], tone: 'metal', at: [1, 0.68, 0.58] },
      ...([[0.5, 'onAir'], [0.66, 'glass'], [0.8, 'plant'], [1.5, 'metalDark']] as const).map(([x, tone]): Part => ({ cylinder: [0.015, 0.12], tone, roll: 90, at: [x, 0.705, 0.59] })),
      { box: [0.16, 0.05, 0.06], tone: 'metalDark', at: [1.25, 0.71, 0.59] },
      // What is written on it.
      { box: [0.7, 0.04, 0.005], tone: 'onAir', at: [0.6, 1.5, 0.545] },
      ...[0, 1, 2, 3].map((i): Part => ({ box: [0.6 - (i % 2) * 0.16, 0.02, 0.005], tone: 'glass', at: [0.55 - (i % 2) * 0.08, 1.36 - i * 0.12, 0.545] })),
      ...[0.98, 1.34].map((y): Part => ({ box: [0.5, 0.02, 0.005], tone: 'plant', at: [1.4, y, 0.545] })),
      ...[1.16, 1.64].map((x): Part => ({ box: [0.02, 0.38, 0.005], tone: 'plant', at: [x, 0.98, 0.545] })),
      { box: [0.34, 0.02, 0.005], tone: 'accent', roll: 30, at: [1.0, 1.12, 0.545] },
      { cylinder: [0.04, 0.005], tone: 'lamp', tilt: 90, at: [1.4, 1.14, 0.55] },
    ],
  },
  // A wide desk of dark wood on two pedestals, with a lamp, a telephone, papers and a name plate
  // on the front; the manager sits behind it and faces the viewer.
  managerDesk: {
    parts: [
      { model: 'deskChair', at: [1, 0, 0.6] },
      { box: [0.5, 0.7, 0.72], tone: 'woodDark', at: [0.36, 0, 1.42] },
      { box: [0.5, 0.7, 0.72], tone: 'woodDark', at: [1.64, 0, 1.42] },
      { box: [1.9, 0.5, 0.06], tone: 'woodDark', at: [1, 0.2, 1.74] },
      { box: [1.96, 0.08, 0.86], tone: 'wood', at: [1, 0.7, 1.42] },
      { box: [0.5, 0.1, 0.03], tone: 'lamp', at: [1, 0.46, 1.78] },
      { box: [0.4, 0.02, 0.3], tone: 'white', at: [1, 0.78, 1.36] },
      { at: [1.55, 0.78, 1.4], parts: [
        { box: [0.22, 0.08, 0.18], tone: 'metalDark', at: [0, 0, 0] },
        { cylinder: [0.055, 0.012], tone: 'white', at: [0, 0.08, -0.035] },
        { cylinder: [0.022, 0.016], tone: 'metalDark', at: [0, 0.08, -0.035] },
        { box: [0.26, 0.035, 0.05], tone: 'metalDark', at: [0, 0.1, 0.055] },
        { box: [0.06, 0.05, 0.07], tone: 'metalDark', at: [-0.11, 0.08, 0.055] },
        { box: [0.06, 0.05, 0.07], tone: 'metalDark', at: [0.11, 0.08, 0.055] },
      ] },
      { cylinder: [0.09, 0.03], tone: 'metalDark', at: [0.4, 0.78, 1.5] },
      { cylinder: [0.02, 0.3], tone: 'metalDark', at: [0.4, 0.81, 1.5] },
      { cylinder: [0.13, 0.12, 0.07], tone: 'lamp', at: [0.4, 1.1, 1.5] },
    ],
    spots: [
      { at: [1, 0.7], turn: 2, activity: 'sit', up: 0.2 },
    ],
  },
  // The CEO's desk: three tiles wide on a rug, of dark wood with a top that overhangs, a tall chair behind it
  // and two chairs for visitors in front. On it a lamp, a telephone, a blotter with papers and a name plate.
  ceoDesk: {
    parts: [
      { box: [2.9, 0.02, 1.9], tone: 'accent', at: [1.5, 0, 1] },
      { box: [2.5, 0.021, 1.5], tone: 'fabricDark', at: [1.5, 0, 1] },
      { model: 'deskChair', size: 1.15, at: [1.5, 0, 0.42] },
      { box: [0.6, 0.7, 0.7], tone: 'woodDark', at: [0.72, 0, 1.05] },
      { box: [0.6, 0.7, 0.7], tone: 'woodDark', at: [2.28, 0, 1.05] },
      { box: [2.2, 0.52, 0.06], tone: 'woodDark', at: [1.5, 0.18, 1.37] },
      { box: [2.5, 0.09, 0.9], tone: 'wood', at: [1.5, 0.7, 1.05] },
      { box: [0.6, 0.1, 0.03], tone: 'lamp', at: [1.5, 0.46, 1.41] },
      { box: [0.7, 0.015, 0.44], tone: 'fabricDark', at: [1.5, 0.79, 0.98] },
      { box: [0.3, 0.02, 0.36], tone: 'white', at: [1.42, 0.805, 0.98] },
      { at: [2.3, 0.79, 1.02], parts: [
        { box: [0.22, 0.08, 0.18], tone: 'metalDark', at: [0, 0, 0] },
        { cylinder: [0.055, 0.012], tone: 'white', at: [0, 0.08, -0.035] },
        { cylinder: [0.022, 0.016], tone: 'metalDark', at: [0, 0.08, -0.035] },
        { box: [0.26, 0.035, 0.05], tone: 'metalDark', at: [0, 0.1, 0.055] },
        { box: [0.06, 0.05, 0.07], tone: 'metalDark', at: [-0.11, 0.08, 0.055] },
        { box: [0.06, 0.05, 0.07], tone: 'metalDark', at: [0.11, 0.08, 0.055] },
      ] },
      { cylinder: [0.1, 0.03], tone: 'metalDark', at: [0.62, 0.79, 1.12] },
      { cylinder: [0.02, 0.32], tone: 'metalDark', at: [0.62, 0.82, 1.12] },
      { cylinder: [0.15, 0.13, 0.08], tone: 'lamp', at: [0.62, 1.14, 1.12] },
      { model: 'chair', tones: { wood: 'fabric' }, at: [0.95, 0, 1.78], turn: 2 },
      { model: 'chair', tones: { wood: 'fabric' }, at: [2.05, 0, 1.78], turn: 2 },
    ],
    spots: [
      { at: [1.5, 0.4], turn: 2, activity: 'sit', up: 0.2 },
    ],
  },
  // The mixing desk has a look for every tier, after the designer's photos of radio studios.
  // Tier 1: a console with a sloping panel between two turntables, a microphone on a boom and a
  // tape recorder at the far edge. Tier 2: a wide grey desk with three microphones on booms, two
  // small monitors and room for two guests. Tier 3: a wooden console with a big mixing board and
  // two monitors on a shelf. Tier 4: a white desk with a row of flat screens and a green glow.
  // It is 2 by 3 tiles: the presenter sits at the near end on a chair, facing the viewer, and the guests
  // sit at the far end, facing them. The designer's own version of 0.21.0 (#345).
  mixingDesk: {
    parts: [
      { model: 'chair', tones: { wood: 'fabric' }, at: [1, 0, 0.8], tiers: [1, 3] },
      { model: 'deskChair', at: [1, 0, 0.14], tiers: [4, 9] },
      { model: 'chair', tones: { wood: 'fabric' }, at: [0.25, 0, 2.4], turn: 1, tiers: [2, 3] },
      { model: 'chair', tones: { wood: 'fabric' }, at: [1.7, 0, 2.4], turn: 3, tiers: [2, 3] },
      { model: 'deskChair', at: [0.2, 0, 1.36], turn: 2, tiers: [4, 9] },
      { model: 'deskChair', at: [1.5, 0, 1.36], turn: 2, tiers: [4, 9] },
      { at: [0, 0, 0], tiers: [1, 1], parts: [
        { box: [1.9, 0.62, 0.6], tone: 'metalDark', at: [1, 0, 1.5] },
        { box: [1.96, 0.06, 0.9], tone: 'wood', at: [1, 0.62, 1.6] },
        { box: [0.7, 0.12, 0.5], tone: 'metalDark', at: [1, 0.68, 1.5] },
        { box: [0.68, 0.05, 0.52], tone: 'metalMid', tilt: 2, at: [1, 0.8, 1.5], turn: 2 },
        { box: [0.05, 0.02, 0.4], tone: 'lamp', tilt: 2, at: [0.76, 0.87, 1.5], turn: 2 },
        { box: [0.05, 0.02, 0.4], tone: 'lamp', tilt: 2, at: [0.88, 0.87, 1.5], turn: 2 },
        { box: [0.05, 0.02, 0.4], tone: 'lamp', tilt: 2, at: [1, 0.87, 1.5], turn: 2 },
        { box: [0.05, 0.02, 0.4], tone: 'lamp', tilt: 2, at: [1.12, 0.87, 1.5], turn: 2 },
        { box: [0.05, 0.02, 0.4], tone: 'lamp', tilt: 2, at: [1.24, 0.87, 1.5], turn: 2 },
        { box: [0.52, 0.08, 0.5], tone: 'metal', at: [0.33, 0.68, 1.5] },
        { cylinder: [0.21, 0.035], tone: 'metalDark', at: [0.35, 0.76, 1.5] },
        { cylinder: [0.07, 0.04], tone: 'fabric', at: [0.35, 0.76, 1.5] },
        { box: [0.03, 0.03, 0.3], tone: 'white', at: [0.13, 0.82, 1.5], turn: 0.6 },
        { box: [0.52, 0.08, 0.5], tone: 'metal', at: [1.67, 0.68, 1.5] },
        { cylinder: [0.21, 0.035], tone: 'metalDark', at: [1.69, 0.76, 1.5] },
        { cylinder: [0.07, 0.04], tone: 'fabric', at: [1.69, 0.76, 1.5] },
        { box: [0.03, 0.03, 0.3], tone: 'white', at: [1.47, 0.8, 1.5], turn: 0.15 },
        { cylinder: [0.02, 0.55], tone: 'metal', at: [1.34, 0.68, 1.8] },
        { box: [0.3, 0.03, 0.03], tone: 'metal', at: [1.3, 1.2, 1.7], turn: 1.35 },
        { cylinder: [0.045, 0.16], tone: 'metalDark', at: [1.2, 1.1, 1.6] },
        { box: [0.36, 0.5, 0.2], tone: 'metal', tilt: -5, at: [1.7, 0.68, 2], turn: 0.2 },
        { box: [0.36, 0.5, 0.2], tone: 'metal', tilt: -5, at: [0.3, 0.68, 2], turn: -0.2 },
        { cylinder: [0.09, 0.03], tone: 'metalMid', tilt: 85, at: [0.38, 1, 1.9], turn: -0.2 },
        { cylinder: [0.09, 0.03], tone: 'metalMid', tilt: 85, at: [1.7, 1, 1.87], turn: 0.2 },
        { cylinder: [0.09, 0.03], tone: 'metalMid', tilt: 85, at: [0.3, 0.8, 1.9], turn: -0.2 },
        { cylinder: [0.09, 0.03], tone: 'metalMid', tilt: 85, at: [1.6, 0.8, 1.9], turn: 0.2 },
      ] },
      { at: [0, 0, 0], tiers: [2, 2], parts: [
        { box: [1.9, 0.62, 0.66], tone: 'metal', at: [1, 0, 1.5] },
        { box: [1.9, 0.62, 0.66], tone: 'metal', at: [1, 0, 2.1], turn: 1 },
        { box: [1.98, 0.06, 0.74], tone: 'metalMid', at: [1, 0.62, 1.5] },
        { box: [1.98, 0.06, 0.74], tone: 'metalMid', at: [1, 0.62, 2.1], turn: 1 },
        { box: [0.34, 0.3, 0.3], tone: 'white', at: [0.25, 0.68, 1.6], turn: -0.2 },
        { box: [0.26, 0.2, 0.02], tone: 'metalDark', at: [0.3, 0.73, 1.44], turn: -0.2 },
        { box: [0.34, 0.3, 0.3], tone: 'white', at: [1.8, 0.68, 1.6], turn: 0.2 },
        { box: [0.26, 0.2, 0.02], tone: 'metalDark', at: [1.75, 0.75, 1.45], turn: 0.2 },
        { cylinder: [0.025, 0.42], tone: 'metalDark', at: [1.2, 0.68, 1.7] },
        { box: [0.03, 0.03, 0.34], tone: 'metalDark', tilt: 18, at: [1.2, 1.1, 1.55] },
        { cylinder: [0.04, 0.2], tone: 'white', tilt: 90, at: [1.2, 1, 1.4] },
        { cylinder: [0.025, 0.42], tone: 'metalDark', at: [1, 0.68, 3] },
        { box: [0.03, 0.03, 0.34], tone: 'metalDark', tilt: 15, at: [0.95, 1, 2.85], turn: 2.4 },
        { cylinder: [0.04, 0.2], tone: 'white', tilt: 85, at: [0.8, 0.8, 2.7], turn: 1 },
        { cylinder: [0.025, 0.42], tone: 'metalDark', at: [1, 0.68, 2] },
        { box: [0.03, 0.03, 0.34], tone: 'metalDark', tilt: -18, at: [1.07, 1.05, 2.1], turn: 2.4 },
        { cylinder: [0.04, 0.2], tone: 'white', tilt: 100, at: [1.2, 0.85, 2.2], turn: 1 },
        { box: [1, 0.03, 0.5], tone: 'metalDark', at: [1, 0.7, 1.4] },
        { box: [0.04, 0.01, 0.4], tone: 'lamp', at: [1.3, 0.75, 1.4] },
        { box: [0.04, 0.01, 0.1], tone: 'lamp', at: [1.4, 0.75, 1.5] },
        { box: [0.04, 0.01, 0.1], tone: 'lamp', at: [1.4, 0.75, 1.35] },
        { box: [0.04, 0.01, 0.1], tone: 'lamp', at: [1.48, 0.75, 1.5] },
        { box: [0.04, 0.01, 0.1], tone: 'lamp', at: [1.48, 0.75, 1.35] },
        { box: [0.04, 0.01, 0.4], tone: 'lamp', at: [1.2, 0.75, 1.4] },
        { box: [0.04, 0.01, 0.4], tone: 'lamp', at: [1.1, 0.75, 1.4] },
        { box: [0.04, 0.01, 0.4], tone: 'lamp', at: [1, 0.75, 1.4] },
        { box: [0.04, 0.01, 0.4], tone: 'lamp', at: [0.9, 0.75, 1.4] },
        { box: [0.04, 0.01, 0.4], tone: 'lamp', at: [0.8, 0.75, 1.4] },
        { box: [0.04, 0.01, 0.4], tone: 'lamp', at: [0.7, 0.75, 1.4] },
        { box: [0.04, 0.01, 0.4], tone: 'lamp', at: [0.6, 0.75, 1.4] },
      ] },
      { at: [0, 0, 0], tiers: [3, 3], parts: [
        { box: [1.6, 0.62, 0.66], tone: 'woodDark', at: [1, 0, 2.1], turn: 1 },
        { box: [1.9, 0.62, 0.66], tone: 'woodDark', at: [1, 0, 1.6] },
        { box: [1.5, 0.05, 0.74], tone: 'wood', at: [1, 0.62, 2.3], turn: 1 },
        { box: [1.98, 0.05, 0.74], tone: 'wood', at: [1, 0.62, 1.6] },
        { box: [1.6, 0.06, 0.46], tone: 'metalDark', tilt: 14, at: [1, 0.72, 1.5], turn: 2 },
        { box: [0.05, 0.04, 0.14], tone: 'fabric', tilt: 14, at: [0.32, 0.75, 1.4], turn: 2 },
        { box: [0.04, 0.04, 0.05], tone: 'lamp', tilt: 14, at: [0.32, 0.81, 1.6], turn: 2 },
        { box: [0.05, 0.04, 0.14], tone: 'white', tilt: 14, at: [0.47, 0.75, 1.4], turn: 2 },
        { box: [0.04, 0.04, 0.05], tone: 'fabric', tilt: 14, at: [0.47, 0.81, 1.6], turn: 2 },
        { box: [0.05, 0.04, 0.14], tone: 'glass', tilt: 14, at: [0.62, 0.75, 1.4], turn: 2 },
        { box: [0.04, 0.04, 0.05], tone: 'white', tilt: 14, at: [0.62, 0.81, 1.6], turn: 2 },
        { box: [0.05, 0.04, 0.14], tone: 'lamp', tilt: 14, at: [0.77, 0.75, 1.4], turn: 2 },
        { box: [0.04, 0.04, 0.05], tone: 'glass', tilt: 14, at: [0.77, 0.81, 1.6], turn: 2 },
        { box: [0.05, 0.04, 0.14], tone: 'fabric', tilt: 14, at: [0.92, 0.75, 1.4], turn: 2 },
        { box: [0.04, 0.04, 0.05], tone: 'lamp', tilt: 14, at: [0.92, 0.81, 1.6], turn: 2 },
        { box: [0.05, 0.04, 0.14], tone: 'white', tilt: 14, at: [1.07, 0.75, 1.4], turn: 2 },
        { box: [0.04, 0.04, 0.05], tone: 'fabric', tilt: 14, at: [1.07, 0.81, 1.6], turn: 2 },
        { box: [0.05, 0.04, 0.14], tone: 'glass', tilt: 14, at: [1.22, 0.75, 1.4], turn: 2 },
        { box: [0.04, 0.04, 0.05], tone: 'white', tilt: 14, at: [1.22, 0.81, 1.6], turn: 2 },
        { box: [0.05, 0.04, 0.14], tone: 'lamp', tilt: 14, at: [1.37, 0.75, 1.4], turn: 2 },
        { box: [0.04, 0.04, 0.05], tone: 'glass', tilt: 14, at: [1.37, 0.81, 1.6], turn: 2 },
        { box: [0.05, 0.04, 0.14], tone: 'fabric', tilt: 14, at: [1.52, 0.75, 1.4], turn: 2 },
        { box: [0.04, 0.04, 0.05], tone: 'lamp', tilt: 14, at: [1.52, 0.81, 1.6], turn: 2 },
        { box: [0.05, 0.04, 0.14], tone: 'white', tilt: 14, at: [1.67, 0.75, 1.4], turn: 2 },
        { box: [0.04, 0.04, 0.05], tone: 'fabric', tilt: 14, at: [1.67, 0.81, 1.6], turn: 2 },
        { box: [1.9, 0.26, 0.2], tone: 'woodDark', at: [1, 0.67, 1.9] },
        { box: [0.5, 0.1, 0.02], tone: 'white', at: [1, 0.75, 1.8] },
        { box: [0.5, 0.42, 0.24], tone: 'white', at: [0.55, 0.93, 1.9] },
        { box: [0.4, 0.3, 0.02], tone: 'glass', at: [0.55, 0.99, 1.78] },
        { box: [0.5, 0.42, 0.24], tone: 'white', at: [1.45, 0.93, 1.9] },
        { box: [0.4, 0.3, 0.02], tone: 'glass', at: [1.45, 0.99, 1.78] },
        { cylinder: [0.025, 0.5], tone: 'metalDark', at: [1.8, 0.67, 1.5] },
        { box: [0.03, 0.03, 0.7], tone: 'metalDark', at: [1.48, 1.17, 1.44], turn: 0.9 },
        { cylinder: [0.05, 0.2], tone: 'metalMid', tilt: 90, at: [1.14, 1.02, 1.3] },
        { cylinder: [0.02, 0.3], tone: 'metalDark', at: [1, 0.7, 2.9] },
        { cylinder: [0.02, 0.3], tone: 'metalDark', tilt: 90, at: [0.89, 0.85, 2.8], turn: 0.5 },
        { cylinder: [0.02, 0.3], tone: 'metalDark', tilt: 90, at: [1, 0.85, 2.4], turn: 0.5 },
        { cylinder: [0.04, 0.16], tone: 'metalMid', tilt: 110, at: [0.75, 0.9, 2.7], turn: 1 },
        { cylinder: [0.02, 0.3], tone: 'metalDark', at: [0.9, 0.7, 2.3] },
        { cylinder: [0.04, 0.16], tone: 'metalDark', tilt: 80, at: [1.1, 0.85, 2.5], turn: 1 },
      ] },
      { at: [0, 0, 0], tiers: [4, 9], parts: [
        { box: [1.98, 0.05, 0.84], tone: 'plant', at: [1, 0, 0.72] },
        { box: [1.5, 0.6, 0.4], tone: 'white', at: [1, 0.05, 0.72] },
        { box: [1.98, 0.08, 0.78], tone: 'white', at: [1, 0.65, 0.72] },
        { box: [1.98, 0.03, 0.04], tone: 'plant', at: [1, 0.62, 1.1] },
        { model: 'screen', size: 0.8, at: [0.35, 0.73, 0.94], turn: 2 },
        { model: 'screen', size: 0.8, at: [0.78, 0.73, 0.94], turn: 2 },
        { model: 'screen', size: 0.8, at: [1.22, 0.73, 0.94], turn: 2 },
        { model: 'screen', size: 0.8, at: [1.65, 0.73, 0.94], turn: 2 },
        { box: [0.5, 0.05, 0.26], tone: 'metalDark', tilt: 10, at: [1, 0.75, 0.6], turn: 2 },
        { box: [0.04, 0.03, 0.14], tone: 'lamp', tilt: 10, at: [0.84, 0.78, 0.6], turn: 2 },
        { box: [0.04, 0.03, 0.14], tone: 'lamp', tilt: 10, at: [0.95, 0.78, 0.6], turn: 2 },
        { box: [0.04, 0.03, 0.14], tone: 'lamp', tilt: 10, at: [1.06, 0.78, 0.6], turn: 2 },
        { box: [0.04, 0.03, 0.14], tone: 'lamp', tilt: 10, at: [1.17, 0.78, 0.6], turn: 2 },
        { model: 'laptop', size: 0.7, at: [1.6, 0.73, 0.6], turn: 2 },
        { cylinder: [0.018, 0.34], tone: 'metalMid', at: [0.55, 0.73, 0.48] },
        { cylinder: [0.035, 0.16], tone: 'metalDark', tilt: 90, at: [0.55, 1.04, 0.4] },
        { cylinder: [0.018, 0.34], tone: 'metalMid', at: [0.5, 0.73, 1] },
        { cylinder: [0.035, 0.16], tone: 'metalDark', tilt: 90, at: [0.5, 1.04, 1.08] },
        { cylinder: [0.018, 0.34], tone: 'metalMid', at: [1.5, 0.73, 1] },
        { cylinder: [0.035, 0.16], tone: 'metalDark', tilt: 90, at: [1.5, 1.04, 1.08] },
      ] },
    ],
    spots: [
      { at: [1, 0.9], turn: 2, activity: 'sit', up: 0.2 },
      { at: [0.3, 2.4], turn: 3, activity: 'sit', tiers: [2, 9] },
      { at: [1.6, 2.4], turn: 1, activity: 'sit', tiers: [2, 9] },
    ],
  },
  // A desk microphone on a small table; the host stands behind it, facing the viewer.
  microphone: {
    parts: [
      { model: 'sideTable', at: [0.5, 0, 0.66] },
      { cylinder: [0.1, 0.04], tone: 'metalDark', at: [0.5, DESK_TOP, 0.62] },
      { cylinder: [0.025, 0.3], tone: 'metal', at: [0.5, DESK_TOP + 0.04, 0.62] },
      { box: [0.13, 0.22, 0.13], tone: 'metalDark', at: [0.5, DESK_TOP + 0.3, 0.6] },
    ],
    spots: [{ at: [0.5, 0.2], turn: 2, activity: 'idle' }],
  },
  onAirLight: {
    parts: [
      { cylinder: [0.18, 0.05], tone: 'metalDark', at: [0.5, 0, 0.5] },
      { cylinder: [0.035, 1.35], tone: 'metalDark', at: [0.5, 0.05, 0.5] },
      { box: [0.8, 0.3, 0.14], tone: 'onAir', at: [0.5, 1.4, 0.5] },
      { box: [0.01, 0.2, 0.01], tone: 'white', at: [0.85, 1.45, 0.43] },
      { box: [0.1, 0.01, 0.01], tone: 'white', at: [0.8, 1.45, 0.43] },
      { box: [0.1, 0.01, 0.01], tone: 'white', at: [0.8, 1.65, 0.43] },
      { box: [0.01, 0.2, 0.01], tone: 'white', at: [0.75, 1.45, 0.43] },
      { box: [0.01, 0.2, 0.01], tone: 'white', at: [0.7, 1.45, 0.43] },
      { box: [0.01, 0.2, 0.01], tone: 'white', roll: -21, at: [0.65, 1.45, 0.43] },
      { box: [0.01, 0.2, 0.01], tone: 'white', at: [0.6, 1.45, 0.43] },
      { box: [0.01, 0.2, 0.01], tone: 'white', at: [0.5, 1.45, 0.43] },
      { box: [0.01, 0.2, 0.01], tone: 'white', at: [0.4, 1.45, 0.43] },
      { box: [0.01, 0.2, 0.01], tone: 'white', at: [0.35, 1.45, 0.43] },
      { box: [0.01, 0.2, 0.01], tone: 'white', at: [0.3, 1.45, 0.43] },
      { box: [0.1, 0.01, 0.01], tone: 'white', at: [0.45, 1.55, 0.43] },
      { box: [0.1, 0.01, 0.01], tone: 'white', at: [0.25, 1.55, 0.43] },
      { box: [0.1, 0.01, 0.01], tone: 'white', at: [0.25, 1.65, 0.43] },
      { box: [0.01, 0.1, 0.01], tone: 'white', at: [0.2, 1.55, 0.43] },
      { box: [0.01, 0.1, 0.01], tone: 'white', roll: -45, at: [0.25, 1.45, 0.43] },
      { box: [0.1, 0.01, 0.01], tone: 'white', at: [0.45, 1.65, 0.43] },
    ],
  },
  talkTable: {
    parts: [
      { model: 'roundTable', at: [1, 0, 1] },
      { model: 'chair', tones: { wood: 'fabric' }, at: [1, 0, 0.15] },
      { model: 'chair', tones: { wood: 'fabric' }, at: [1, 0, 1.85], turn: 2 },
      // A desk microphone for each of the two seats, leaning towards whoever sits there.
      ...[-1, 1].flatMap((side): Part[] => [
        { cylinder: [0.09, 0.03], tone: 'metalDark', at: [1, TABLE_TOP, 1 + side * 0.36] },
        { cylinder: [0.02, 0.2], tone: 'metal', tilt: side * 20, at: [1, TABLE_TOP + 0.02, 1 + side * 0.4] },
        { box: [0.11, 0.18, 0.11], tone: 'metalDark', tilt: side * 20, at: [1, TABLE_TOP + 0.2, 1 + side * 0.46] },
      ]),
    ],
    spots: [
      { at: [1, 1.85], turn: 0, activity: 'sit' },
      { at: [1, 0.15], turn: 2, activity: 'sit' },
    ],
  },
  // The TV camera on its studio pedestal, after the designer's photos of video cameras.
  // Tier 1: two stacked boxes with the viewfinder on top and a silver lens with a dark hood.
  // Tier 2: a big blue color camera with a long lens box and a steering ring around the pedestal.
  // Tier 3: a dark, compact camera behind a large box lens, with a flat viewfinder.
  camera: {
    // Cameras stand at an angle, the way they are pointed at a set rather than lined up with the walls.
    angle: 0.5,
    parts: [
      { cylinder: [0.3, 0.08], tone: 'metalDark', at: [0.5, 0, 0.42] },
      { cylinder: [0.07, 0.86], tone: 'metalMid', at: [0.5, 0.08, 0.42] },
      { box: [0.22, 0.07, 0.22], tone: 'metalDark', at: [0.5, 0.94, 0.42] },
      // From tier 2 the pedestal has a ring to steer it by.
      { cylinder: [0.36, 0.03], tone: 'metalDark', at: [0.5, 0.5, 0.42], tiers: [2, 9] },
      { cylinder: [0.3, 0.034], tone: 'metalMid', at: [0.5, 0.5, 0.42], tiers: [2, 9] },
      // The camera itself sits on the pedestal's head, pointed slightly down at the set.
      {
        at: [0.5, 1.01, 0.42],
        tilt: 12,
        tiers: [1, 1],
        parts: [
          // Lower body with the lens.
          { box: [0.3, 0.26, 0.6], tone: 'white', at: [0, 0, -0.02] },
          { box: [0.2, 0.2, 0.04], tone: 'metalDark', at: [0, 0.03, 0.3] },
          { cylinder: [0.06, 0.2], tone: 'metal', tilt: 90, at: [0, 0.03, 0.42] },
          { cylinder: [0.075, 0.08, 0.09], tone: 'metalDark', tilt: 90, at: [0, 0.09, 0.53] },
          // Upper body: the viewfinder, its dark screen and top plate, and the tally light.
          { box: [0.3, 0.2, 0.54], tone: 'metal', at: [0, 0.26, -0.05] },
          { box: [0.24, 0.15, 0.03], tone: 'metalDark', at: [0, 0.285, 0.23] },
          { box: [0.32, 0.03, 0.56], tone: 'metalDark', at: [0, 0.46, -0.05] },
          { box: [0.2, 0.012, 0.3], tone: 'onAir', at: [0, 0.49, -0.05] },
          { box: [0.07, 0.05, 0.07], tone: 'onAir', at: [0, 0.49, 0.18] },
        ],
      },
      {
        at: [0.5, 1.01, 0.42],
        tilt: 10,
        tiers: [2, 2],
        parts: [
          // The blue body with its white stripe, and the long lens box with a dark hood in front.
          { box: [0.36, 0.36, 0.5], tone: 'glass', at: [0, 0, -0.14] },
          { box: [0.37, 0.07, 0.3], tone: 'white', at: [0, 0.14, -0.14] },
          { box: [0.3, 0.3, 0.36], tone: 'glass', at: [0, 0.03, 0.28] },
          { box: [0.34, 0.34, 0.14], tone: 'metalDark', at: [0, 0.01, 0.52] },
          // The viewfinder on top, pointing back at the operator, and the tally light.
          { box: [0.24, 0.2, 0.3], tone: 'glass', at: [0, 0.36, -0.22] },
          { box: [0.2, 0.15, 0.03], tone: 'metalDark', at: [0, 0.385, -0.38] },
          { box: [0.08, 0.06, 0.08], tone: 'onAir', at: [0, 0.36, 0.06] },
          // The handle the operator pans it with.
          { cylinder: [0.02, 0.5], tone: 'metalDark', tilt: 70, at: [0.2, -0.16, -0.44] },
        ],
      },
      {
        at: [0.5, 1.01, 0.42],
        tilt: 10,
        tiers: [3, 9],
        parts: [
          // A compact dark body behind a large box lens with a glass front.
          { box: [0.26, 0.26, 0.34], tone: 'metalDark', at: [0, 0.02, -0.2] },
          { box: [0.34, 0.3, 0.5], tone: 'metalMid', at: [0, 0, 0.22] },
          { box: [0.28, 0.24, 0.03], tone: 'glass', at: [0, 0.03, 0.48] },
          { box: [0.36, 0.04, 0.2], tone: 'metalDark', at: [0, 0.3, 0.38] },
          // The flat viewfinder on top, the tally light and the number plate.
          { box: [0.34, 0.22, 0.05], tone: 'metalDark', at: [0, 0.3, -0.26] },
          { box: [0.28, 0.16, 0.02], tone: 'glass', at: [0, 0.33, -0.3] },
          { box: [0.08, 0.05, 0.08], tone: 'onAir', at: [0, 0.3, 0] },
          { box: [0.1, 0.1, 0.02], tone: 'white', at: [0, 0.54, -0.22] },
          { cylinder: [0.02, 0.5], tone: 'metalDark', tilt: 70, at: [0.2, -0.16, -0.44] },
        ],
      },
    ],
  },
  // After the designer's photo of a studio light: a red spotlight with black barn doors
  // on a stand with three legs on castors.
  studioLights: {
    angle: 0.5,
    parts: [
      ...[0, 1, 2].flatMap((leg): Part[] => {
        const angle = (leg * 2 * Math.PI) / 3 + Math.PI / 2;
        const out = (r: number): [number, number] => [0.5 + r * Math.cos(angle), 0.5 - r * Math.sin(angle)];
        const [mx, mz] = out(0.2);
        const [ex, ez] = out(0.4);
        return [
          { box: [0.42, 0.04, 0.05], tone: 'fabricDark', turn: (angle * 2) / Math.PI, at: [mx, 0.08, mz] },
          { cylinder: [0.045, 0.08], tone: 'metalDark', at: [ex, 0, ez] },
        ];
      }),
      { cylinder: [0.03, 1.2], tone: 'fabricDark', at: [0.5, 0.1, 0.5] },
      // The yoke that holds the lamp.
      { box: [0.5, 0.04, 0.06], tone: 'fabricDark', at: [0.5, 1.3, 0.5] },
      { box: [0.04, 0.3, 0.06], tone: 'fabricDark', at: [0.27, 1.3, 0.5] },
      { box: [0.04, 0.3, 0.06], tone: 'fabricDark', at: [0.73, 1.3, 0.5] },
      // The lamp hangs in the yoke and points down at the set: housing, lens and four barn doors.
      {
        at: [0.5, 1.5, 0.5],
        tilt: 35,
        parts: [
          { cylinder: [0.2, 0.34], tone: 'fabric', tilt: 90, at: [0, -0.17, -0.02] },
          { cylinder: [0.17, 0.03], tone: 'lamp', tilt: 90, at: [0, -0.015, 0.16] },
          { box: [0.03, 0.36, 0.24], tone: 'metalDark', turn: 0.3, at: [-0.24, -0.18, 0.26] },
          { box: [0.03, 0.36, 0.24], tone: 'metalDark', turn: -0.3, at: [0.24, -0.18, 0.26] },
          { box: [0.4, 0.03, 0.22], tone: 'metalDark', tilt: -25, at: [0, 0.2, 0.26] },
          { box: [0.4, 0.03, 0.22], tone: 'metalDark', tilt: 25, at: [0, -0.23, 0.26] },
        ],
      },
    ],
  },
  // After the designer's photo of a talk show: a low stage with a glowing edge, a brick wall
  // with an arched window on the city at dusk, curtains, the show's sign, the host's desk, and a
  // blue sofa and armchair for the guests on a grey rug.
  set: {
    parts: [
      { box: [2.94, 0.06, 1.9], tone: 'metalDark', at: [1.5, 0, 1] },
      { box: [2.98, 0.05, 0.05], tone: 'woodDark', at: [1.5, 0, 1.96] },
      { box: [0.05, 0.05, 1.9], tone: 'woodDark', at: [2.97, 0, 1] },
      { box: [2.9, 1.76, 0.1], tone: 'fabricDark', at: [1.5, 0.06, 0.08] },
      { box: [0.9, 0.8, 0.04], tone: 'woodDark', at: [0.7, 0.46, 0.15] },
      { cylinder: [0.45, 0.04], tone: 'woodDark', tilt: 90, at: [0.7, 1.24, 0.15] },
      { box: [0.14, 0.5, 0.02], tone: 'metalDark', at: [0.42, 0.46, 0.18] },
      { box: [0.12, 0.8, 0.02], tone: 'metalDark', at: [0.6, 0.46, 0.18] },
      { box: [0.16, 0.36, 0.02], tone: 'metalDark', at: [0.8, 0.46, 0.18] },
      { box: [0.1, 0.62, 0.02], tone: 'metalDark', at: [0.98, 0.46, 0.18] },
      { box: [0.03, 1.2, 0.03], tone: 'metalMid', at: [0.7, 0.46, 0.2] },
      { box: [0.9, 0.03, 0.03], tone: 'metalMid', at: [0.7, 1, 0.2] },
      { box: [0.34, 1.76, 0.14], tone: 'accent', at: [1.4, 0.06, 0.16] },
      { box: [0.86, 1.76, 0.14], tone: 'accent', at: [2.5, 0.06, 0.16] },
      { box: [0.44, 0.36, 0.03], tone: 'white', at: [1.84, 0.95, 0.15] },
      { box: [0.3, 0.05, 0.035], tone: 'lamp', at: [1.84, 1.2, 0.15] },
      { model: 'deskChair', at: [2.6, 0.06, 0.7], turn: -0.4 },
      { box: [0.9, 0.6, 0.4], tone: 'woodDark', at: [2.3, 0.06, 1.12], turn: -0.4 },
      { box: [0.96, 0.05, 0.46], tone: 'wood', at: [2.3, 0.66, 1.12], turn: -0.4 },
      { box: [0.4, 0.26, 0.02], tone: 'white', at: [2.2, 0.24, 1.33], turn: -0.4 },
      { model: 'rug', tones: { carpet: 'metalMid', carpetDarker: 'metal' }, size: 0.62, at: [1, 0.06, 1.25] },
      { model: 'sofa', tones: { carpet: 'glass' }, size: 0.8, at: [0.9, 0.06, 0.78] },
    ],
    spots: [
      { at: [2.5, 0.7], turn: 1.6, activity: 'sit', up: 0.2 },
      { at: [0.6, 0.86], turn: 2, activity: 'sit' },
      { at: [1.3, 0.86], turn: 2, activity: 'sit' },
    ],
  },
  newsDesk: {
    parts: [
      { box: [2, 0.4, 0.5], tone: 'wood', at: [1.5, 0, 1] },
      { box: [2.1, 0.06, 0.6], tone: 'white', at: [1.5, 0.4, 1] },
      { box: [1.2, 0.3, 0.04], tone: 'accent', at: [1.5, 0.1, 1.3] },
    ],
    spots: [
      { at: [1.1, 0.4], turn: 2, activity: 'idle' },
      { at: [1.9, 0.4], turn: 2, activity: 'idle' },
    ],
  },
  // The TV control desk, after the designer's photos of control desks. The operator stands in
  // front of it. Tier 1: a tall cabinet with two rows of small round-cornered monitors over panels
  // of knobs, and a narrow desk. Tier 2: a long console with a panel of buttons, a monitor at
  // either end, and a rack of monitors under a row of clocks. Tier 3: a wall of flat screens with
  // a purple glow behind a desk of slim monitors.
  controlDesk: {
    parts: [
      // --- Tier 1 ---
      { at: [0, 0, 0], tiers: [1, 1], parts: [
        { box: [1.9, 1.5, 0.34], tone: 'metalMid', at: [1, 0, 0.22] },
        { box: [1.96, 0.3, 0.4], tone: 'metalMid', tilt: -14, at: [1, 1.46, 0.26] },
        ...[0.45, 1, 1.55].map((x): Part => ({ cylinder: [0.09, 0.02], tone: 'metalDark', tilt: 76, at: [x, 1.6, 0.47] })),
        // Eight monitors in two rows: most show the white of a camera, two the picture going out.
        ...[0, 1].flatMap((row) => [0, 1, 2, 3].flatMap((i): Part[] => [
          { box: [0.38, 0.28, 0.03], tone: 'metalDark', at: [0.32 + i * 0.45, 0.8 + row * 0.33, 0.4] },
          { box: [0.28, 0.2, 0.02], tone: (row + i) % 3 === 0 ? 'lamp' : 'white', at: [0.3 + i * 0.45, 0.84 + row * 0.33, 0.42] },
        ])),
        // Panels of knobs and dials under them.
        { box: [1.8, 0.24, 0.03], tone: 'metalDark', at: [1, 0.48, 0.4] },
        ...[0, 1, 2, 3, 4, 5, 6, 7].map((i): Part => ({ cylinder: [0.035, 0.03], tone: i % 3 ? 'white' : 'lamp', tilt: 90, at: [0.3 + i * 0.2, 0.57, 0.43] })),
        // The narrow desk with the switcher, a script and a telephone.
        { box: [1.9, 0.05, 0.42], tone: 'white', at: [1, 0.42, 0.62] },
        { box: [0.06, 0.42, 0.06], tone: 'metalDark', at: [0.1, 0, 0.78] },
        { box: [0.06, 0.42, 0.06], tone: 'metalDark', at: [1.9, 0, 0.78] },
        { box: [0.5, 0.05, 0.2], tone: 'metalDark', at: [1.15, 0.47, 0.62] },
        { box: [0.3, 0.02, 0.24], tone: 'wood', at: [0.5, 0.47, 0.64] },
        { box: [0.16, 0.1, 0.14], tone: 'metalDark', at: [1.7, 0.47, 0.62] },
      ] },
      // --- Tier 2 ---
      { at: [0, 0, 0], tiers: [2, 2], parts: [
        // The rack behind: six monitors under four clocks.
        { box: [0.96, 1.2, 0.24], tone: 'metalDark', at: [1, 0, 0.14] },
        ...[0, 1].flatMap((row) => [0, 1, 2].map((i): Part => ({ box: [0.24, 0.2, 0.02], tone: (row + i) % 2 ? 'white' : 'glass', at: [0.7 + i * 0.3, 0.6 + row * 0.28, 0.27] }))),
        { box: [1.0, 0.24, 0.06], tone: 'white', at: [1, 1.24, 0.14] },
        ...[0, 1, 2, 3].map((i): Part => ({ cylinder: [0.09, 0.02], tone: i === 1 || i === 2 ? 'white' : 'metal', tilt: 90, at: [0.67 + i * 0.22, 1.27, 0.18] })),
        // The long console, its sloping panel of buttons and a monitor at either end.
        { box: [1.96, 0.66, 0.5], tone: 'metal', at: [1, 0, 0.62] },
        { box: [1.3, 0.05, 0.36], tone: 'metalDark', tilt: 12, turn: 2, at: [1, 0.68, 0.64] },
        ...[0, 1, 2, 3, 4, 5, 6, 7].map((i): Part => ({ box: [0.07, 0.03, 0.16], tone: (['white', 'lamp', 'fabric', 'white'] as const)[i % 4]!, tilt: 12, turn: 2, at: [0.5 + i * 0.145, 0.71, 0.64] })),
        ...[0.2, 1.8].flatMap((x): Part[] => [
          { box: [0.3, 0.3, 0.32], tone: 'metalDark', at: [x, 0.66, 0.6] },
          { box: [0.22, 0.2, 0.02], tone: 'white', at: [x, 0.71, 0.77] },
        ]),
      ] },
      // --- Tier 3 ---
      { at: [0, 0, 0], tiers: [3, 9], parts: [
        // The wall of screens, lit from behind.
        { box: [1.98, 1.5, 0.04], tone: 'accent', at: [1, 0, 0.06] },
        { box: [1.86, 0.96, 0.06], tone: 'metalDark', at: [1, 0.5, 0.12] },
        ...[0, 1, 2].flatMap((row) => [0, 1, 2, 3, 4].map((i): Part => ({
          box: [0.32, 0.26, 0.02],
          tone: (['glass', 'lamp', 'white', 'plant', 'fabric', 'glass', 'white'] as const)[(row * 3 + i * 2) % 7]!,
          at: [0.28 + i * 0.36, 0.56 + row * 0.3, 0.16],
        }))),
        // The desk in front: a white top on a dark base, three slim monitors, a switcher and a keyboard.
        { box: [1.9, 0.62, 0.36], tone: 'metalDark', at: [1, 0, 0.66] },
        { box: [1.96, 0.05, 0.46], tone: 'white', at: [1, 0.62, 0.66] },
        ...[0.4, 1, 1.6].map((x): Part => ({ model: 'screen', size: 0.8, at: [x, 0.67, 0.56] })),
        { box: [0.5, 0.06, 0.16], tone: 'metalDark', at: [0.7, 0.67, 0.78] },
        ...[0, 1, 2, 3, 4].map((i): Part => ({ box: [0.06, 0.02, 0.06], tone: (['lamp', 'fabric', 'plant', 'white', 'glass'] as const)[i]!, at: [0.52 + i * 0.09, 0.73, 0.78] })),
        { model: 'keyboard', size: 0.8, at: [1.4, 0.67, 0.78] },
      ] },
    ],
    spots: [{ at: [1, 1.2], turn: 0, activity: 'work' }],
  },
  shelving: {
    parts: [
      { model: 'bookcase', at: [0.55, 0, 0.4] },
      { model: 'bookcase', at: [1.45, 0, 0.4] },
      { model: 'books', at: [0.55, 0.8, 0.4] },
      { model: 'books', at: [1.3, 1.2, 0.4] },
      { model: 'books', at: [0.4, 1.2, 0.4], turn: 2.1 },
      { model: 'books', at: [1.5, 0.8, 0.4], turn: 2 },
      { model: 'books', at: [1.3, 0.3, 0.4] },
      { model: 'books', at: [1.45, 0.3, 0.4] },
    ],
  },
  canteenTable: {
    parts: [
      { model: 'table', at: [1, 0, 1], turn: 1 },
      { model: 'chair', tones: { wood: 'fabric' }, at: [0.3, 0, 0.6], turn: 1 },
      { model: 'chair', tones: { wood: 'fabric' }, at: [0.3, 0, 1.4], turn: 1 },
      { model: 'chair', tones: { wood: 'fabric' }, at: [1.7, 0, 0.6], turn: 3 },
      { model: 'chair', tones: { wood: 'fabric' }, at: [1.7, 0, 1.4], turn: 3 },
      // Food on the table in front of each seat, only while someone sits there (0.21.0): a different meal at each.
      { at: [0.7, 0.66, 0.6], usedBy: 0, parts: [
        { model: 'plateDinner', size: 0.8, at: [0, 0, 0] },
        { model: 'bottleKetchup', at: [0.2, 0, 0.3] },
      ] },
      { at: [1.3, 0.66, 1.4], usedBy: 1, parts: [{ model: 'pizza', size: 0.8, at: [0, 0, 0] }] },
      { at: [0.7, 0.66, 1.4], usedBy: 2, parts: [
        { model: 'burger', size: 0.8, at: [0, 0, 0] },
        { model: 'sodaBottle', at: [0.2, 0, 0.1] },
      ] },
      { at: [1.3, 0.66, 0.6], usedBy: 3, parts: [{ model: 'salad', size: 0.8, at: [0, 0, 0] }] },
    ],
    // One seat per chair, facing the table: a chair that is not turned faces south, a person north.
    spots: [
      { at: [0.3, 0.6], turn: 3, activity: 'sit' },
      { at: [1.7, 1.4], turn: 1, activity: 'sit' },
      { at: [0.3, 1.4], turn: 3, activity: 'sit' },
      { at: [1.7, 0.6], turn: 1, activity: 'sit' },
    ],
  },
  coffeeMachine: {
    parts: [
      { model: 'sideTable', at: [0.5, 0, 0.45] },
      { model: 'coffeeMachine', at: [0.5, 0.77, 0.45] },
    ],
  },
  planter: {
    parts: [{ model: 'plant', size: 1.4, at: [0.5, 0, 0.5] }],
  },
  tvScreen: {
    parts: [
      { model: 'sideTable', at: [0.5, 0, 0.45] },
      { model: 'television', at: [0.5, 0.77, 0.45] },
    ],
  },
  radio: {
    parts: [
      { model: 'sideTable', at: [0.5, 0, 0.45] },
      { model: 'radio', at: [0.5, 0.77, 0.45] },
    ],
  },
  couch: {
    parts: [{ model: 'sofa', tones: { carpet: 'glass' }, at: [1, 0, 0.5] }],
  },
  fridge: {
    parts: [{ model: 'fridge', size: 0.85, at: [0.5, 0, 0.4] }],
  },
  counter: {
    parts: [{ model: 'kitchenCabinet', size: 1.2, at: [0.5, 0, 0.5] }],
  },
  // After the designer's photo of a soap opera's pub: dark wood panels under a wall of ochre, the bar on
  // the left with its brass top, glasses on a shelf and green stools in front, a red curtain in the
  // middle, and on the right a small round table with two chairs, a frosted window and a coat rack
  // with a yellow raincoat.
  soapSet: {
    parts: [
      { box: [2.94, 0.06, 1.9], tone: 'wood', at: [1.5, 0, 1] },
      { box: [2.9, 1.7, 0.1], tone: 'sand', at: [1.5, 0.06, 0.08] },
      { box: [2.9, 0.7, 0.12], tone: 'woodDark', at: [1.5, 0.06, 0.09] },
      { box: [2.9, 0.05, 0.14], tone: 'woodDark', at: [1.5, 1.7, 0.09] },
      // Lamps on the wall.
      ...[0.35, 1.05, 2.25].map((x): Part => ({ box: [0.14, 0.12, 0.06], tone: 'white', at: [x, 1.32, 0.16] })),
      // The shelf of glasses behind the bar.
      { box: [1.1, 0.04, 0.18], tone: 'woodDark', at: [0.7, 1.05, 0.22] },
      ...[0, 1, 2, 3, 4].map((i): Part => ({ cylinder: [0.04, 0.12], tone: 'glass', at: [0.32 + i * 0.19, 1.09, 0.22] })),
      // The bar, with its brass top and a few glasses on it.
      { box: [1.2, 0.85, 0.42], tone: 'woodDark', at: [0.7, 0.06, 0.62] },
      { box: [1.26, 0.05, 0.48], tone: 'lamp', at: [0.7, 0.91, 0.62] },
      ...[0.4, 0.75].map((x): Part => ({ cylinder: [0.04, 0.12], tone: 'glass', at: [x, 0.96, 0.6] })),
      { cylinder: [0.05, 0.08], tone: 'lamp', at: [1.05, 0.96, 0.62] },
      // Three stools in front of it, with seats of green leather.
      ...[0.3, 0.7, 1.1].flatMap((x): Part[] => [
        { cylinder: [0.035, 0.62], tone: 'woodDark', at: [x, 0.06, 1.05] },
        { cylinder: [0.13, 0.03], tone: 'woodDark', at: [x, 0.3, 1.05] },
        { cylinder: [0.15, 0.09], tone: 'plant', at: [x, 0.68, 1.05] },
      ]),
      // The red curtain, under a yellow pelmet.
      { box: [0.26, 1.45, 0.06], tone: 'fabricDark', at: [1.62, 0.06, 0.17] },
      { box: [0.26, 1.45, 0.06], tone: 'fabricDark', at: [1.92, 0.06, 0.17] },
      { box: [0.66, 0.12, 0.08], tone: 'lamp', at: [1.77, 1.5, 0.17] },
      // The frosted window in its frame.
      { box: [0.5, 0.82, 0.03], tone: 'woodDark', at: [2.5, 0.6, 0.15] },
      { box: [0.4, 0.72, 0.02], tone: 'white', at: [2.5, 0.65, 0.17] },
      // The round table with a candle, and a chair on either side.
      { model: 'roundTable', tones: { wood: 'woodDark' }, size: 0.6, at: [2.3, 0.06, 1.3] },
      { cylinder: [0.04, 0.08], tone: 'lamp', at: [2.3, 0.51, 1.3] },
      { model: 'chair', tones: { wood: 'woodDark' }, at: [1.78, 0.06, 1.3], turn: 1 },
      { model: 'chair', tones: { wood: 'woodDark' }, at: [2.82, 0.06, 1.3], turn: 3 },
      // The coat rack in the corner, with the yellow raincoat.
      { cylinder: [0.03, 1.35], tone: 'woodDark', at: [2.9, 0.06, 0.45] },
      { box: [0.2, 0.55, 0.12], tone: 'lamp', at: [2.86, 0.7, 0.5] },
    ],
    // The host on the middle stool; the others at the table.
    spots: [
      { at: [0.7, 1.05], turn: 2, activity: 'sit', up: 0.3 },
      { at: [1.78, 1.3], turn: 3, activity: 'sit', up: 0.06 },
      { at: [2.82, 1.3], turn: 1, activity: 'sit', up: 0.06 },
    ],
  },
  // After the designer's picture of a coffee house, which was the soap opera's decor until 0.14.0 and is
  // the sitcom's now. A brick wall with a grid of pictures and a neon cup, green posts, the bar with its
  // coffee machine on the left, and in the middle the big orange couch behind a low table on a red rug,
  // with an armchair beside it.
  sitcomSet: {
    parts: [
      { box: [2.94, 0.06, 1.9], tone: 'wood', at: [1.5, 0, 1] },
      { box: [2.9, 1.7, 0.1], tone: 'fabricDark', at: [1.5, 0.06, 0.08] },
      { cylinder: [0.06, 1.7], tone: 'plant', at: [0.12, 0.06, 0.2] },
      { cylinder: [0.06, 1.7], tone: 'plant', at: [2.88, 0.06, 0.2] },
      { box: [0.2, 0.2, 0.03], tone: 'accent', at: [1.15, 0.9, 0.14] },
      { box: [0.2, 0.2, 0.03], tone: 'lamp', at: [1.41, 0.9, 0.14] },
      { box: [0.2, 0.2, 0.03], tone: 'glass', at: [1.67, 0.9, 0.14] },
      { box: [0.2, 0.2, 0.03], tone: 'plant', at: [1.93, 0.9, 0.14] },
      { box: [0.2, 0.2, 0.03], tone: 'fabric', at: [1.15, 1.18, 0.14] },
      { box: [0.2, 0.2, 0.03], tone: 'white', at: [1.41, 1.18, 0.14] },
      { box: [0.2, 0.2, 0.03], tone: 'accent', at: [1.67, 1.18, 0.14] },
      { box: [0.2, 0.2, 0.03], tone: 'lamp', at: [1.93, 1.18, 0.14] },
      { box: [0.3, 0.2, 0.03], tone: 'plant', at: [2.5, 1.2, 0.14] },
      { box: [0.06, 0.22, 0.03], tone: 'lamp', at: [2.5, 1.42, 0.14] },
      { box: [0.6, 0.12, 0.03], tone: 'lamp', at: [1.54, 1.5, 0.14] },
      { box: [0.9, 0.8, 0.4], tone: 'woodDark', at: [0.55, 0.06, 0.42] },
      { box: [0.96, 0.05, 0.46], tone: 'metal', at: [0.55, 0.86, 0.42] },
      { model: 'coffeeMachine', size: 0.8, at: [0.4, 0.91, 0.4] },
      { cylinder: [0.07, 0.2], tone: 'glass', at: [0.82, 0.91, 0.42] },
      { model: 'rug', tones: { carpet: 'fabric', carpetDarker: 'fabricDark' }, size: 0.7, at: [1.6, 0.06, 1.3] },
      { model: 'sofa', tones: { carpet: 'woodDark' }, size: 0.9, at: [1.8, 0.06, 0.92] },
      { box: [0.9, 0.26, 0.4], tone: 'wood', at: [1.55, 0.07, 1.52] },
      { cylinder: [0.06, 0.12], tone: 'white', at: [1.35, 0.33, 1.5] },
      { box: [0.2, 0.05, 0.14], tone: 'plant', at: [1.7, 0.33, 1.52] },
    ],
    spots: [
      { at: [1.4, 0.98], turn: 2, activity: 'sit', up: 0.06 },
      { at: [2.2, 0.98], turn: 2, activity: 'sit', up: 0.06 },
      { at: [0.5, 0.95], turn: 2, activity: 'idle', up: 0.06 },
    ],
  },
  // After the designer's picture of a kids' studio: a wooden floor, a wall of dark blue with white
  // clouds and a window framed in red, a wall of yellow with a red arch around a screen and the
  // presenter's yellow desk, two white chairs on a patchwork rug in the middle, a little table with
  // colored chairs on the left and toys on the floor.
  kidsSet: {
    parts: [
      { box: [2.94, 0.06, 1.9], tone: 'wood', at: [1.5, 0, 1] },
      { box: [1.5, 1.7, 0.1], tone: 'glass', at: [0.75, 0.06, 0.08] },
      { box: [1.44, 1.7, 0.1], tone: 'lamp', at: [2.22, 0.06, 0.08] },
      // White clouds on the blue wall, a shelf of books and the window in its red frame.
      ...([[0.3, 1.42, 0.32], [0.95, 1.5, 0.26], [1.25, 1.25, 0.2]] as const).map(([x, y, w]): Part => ({ box: [w, 0.1, 0.03], tone: 'white', at: [x, y, 0.14] })),
      { box: [0.36, 0.03, 0.14], tone: 'lamp', at: [0.25, 1.0, 0.2] },
      ...[0, 1, 2].map((i): Part => ({ box: [0.08, 0.14, 0.1], tone: (['fabric', 'white', 'plant'] as const)[i]!, at: [0.15 + i * 0.1, 1.03, 0.2] })),
      { box: [0.56, 0.46, 0.03], tone: 'fabric', at: [0.78, 0.6, 0.14] },
      { box: [0.46, 0.36, 0.02], tone: 'plant', at: [0.78, 0.65, 0.16] },
      // The red arch around the screen on the yellow wall, and the presenter's desk in front of it.
      { box: [0.86, 1.1, 0.04], tone: 'fabric', at: [2.22, 0.3, 0.14] },
      { box: [0.66, 0.9, 0.02], tone: 'metalDark', at: [2.22, 0.4, 0.17] },
      { box: [0.5, 0.32, 0.02], tone: 'water', at: [2.22, 0.85, 0.19] },
      { box: [0.7, 0.5, 0.3], tone: 'lamp', at: [2.22, 0.06, 0.55] },
      { box: [0.74, 0.04, 0.34], tone: 'white', at: [2.22, 0.56, 0.55] },
      { cylinder: [0.07, 0.12], tone: 'glass', at: [2.45, 0.6, 0.55] },
      // The rug and the two white chairs.
      { model: 'rug', tones: { carpet: 'fabric', carpetDarker: 'lamp' }, size: 0.55, at: [1.5, 0.06, 1.2] },
      { model: 'chair', tones: { wood: 'white' }, at: [1.25, 0.06, 1.15] },
      { model: 'chair', tones: { wood: 'white' }, at: [1.75, 0.06, 1.15] },
      // The children's table with its colored chairs.
      { box: [0.6, 0.04, 0.38], tone: 'glass', at: [0.42, 0.36, 1.45] },
      ...([[0.16, 1.3], [0.68, 1.3], [0.16, 1.6], [0.68, 1.6]] as const).map(([x, z]): Part => ({ cylinder: [0.025, 0.36], tone: 'white', at: [x, 0.06, z] })),
      ...([[0.25, 1.15, 'fabric'], [0.6, 1.15, 'lamp'], [0.25, 1.78, 'plant'], [0.6, 1.78, 'fabric']] as const).flatMap(([x, z, tone]): Part[] => [
        { box: [0.2, 0.22, 0.18], tone, at: [x, 0.06, z] },
        { box: [0.2, 0.2, 0.03], tone, at: [x, 0.28, z < 1.4 ? z - 0.08 : z + 0.08] },
      ]),
      // Toys on the floor and a box to put them in.
      { box: [0.32, 0.18, 0.22], tone: 'white', at: [2.65, 0.06, 1.3] },
      { box: [0.12, 0.12, 0.12], tone: 'fabric', at: [2.3, 0.06, 1.6] },
      { box: [0.1, 0.1, 0.1], tone: 'glass', at: [2.45, 0.06, 1.75] },
      { cylinder: [0.06, 0.1], tone: 'plant', at: [2.6, 0.06, 1.7] },
      { cylinder: [0.05, 0.08], tone: 'lamp', at: [2.2, 0.06, 1.8] },
    ],
    // The presenter and a guest on the white chairs.
    spots: [
      { at: [1.25, 1.15], turn: 2, activity: 'sit', up: 0.06 },
      { at: [1.75, 1.15], turn: 2, activity: 'sit', up: 0.06 },
    ],
  },
  // After the designer's photo of a reality house: a turquoise floor, a wall of light blue with two
  // arched glass doors and a wall of purple with big red lips, a round hot tub, a sofa and an armchair
  // round a low table, and a giant teddy bear.
  realitySet: {
    parts: [
      { box: [2.94, 0.06, 1.9], tone: 'grass', at: [1.5, 0, 1] },
      { box: [1.9, 1.7, 0.1], tone: 'water', at: [0.95, 0.06, 0.08] },
      { box: [1.04, 1.7, 0.1], tone: 'accent', at: [2.42, 0.06, 0.08] },
      { box: [0.44, 1.12, 0.03], tone: 'white', at: [0.45, 0.06, 0.14] },
      { box: [0.34, 1, 0.02], tone: 'glass', at: [0.45, 0.12, 0.16] },
      { cylinder: [0.22, 0.03], tone: 'white', tilt: 90, at: [0.45, 1.18, 0.14] },
      { box: [0.44, 1.12, 0.03], tone: 'white', at: [1.05, 0.06, 0.14] },
      { box: [0.34, 1, 0.02], tone: 'glass', at: [1.05, 0.12, 0.16] },
      { cylinder: [0.22, 0.03], tone: 'white', tilt: 90, at: [1.05, 1.18, 0.14] },
      { box: [0.44, 0.1, 0.04], tone: 'fabric', at: [2.42, 1.22, 0.14] },
      { box: [0.36, 0.08, 0.04], tone: 'fabric', at: [2.42, 1.12, 0.14] },
      { cylinder: [0.4, 0.32], tone: 'white', at: [0.48, 0.06, 1.42] },
      { cylinder: [0.33, 0.015], tone: 'glass', at: [0.48, 0.38, 1.42] },
      { model: 'sofa', tones: { carpet: 'fabric' }, size: 0.8, at: [1.55, 0.06, 0.82] },
      { model: 'armchair', tones: { carpet: 'fabricDark' }, size: 0.8, at: [2.35, 0.06, 1.6], turn: 3 },
      { cylinder: [0.2, 0.22], tone: 'glass', at: [1.6, 0.06, 1.42] },
      { box: [0.2, 0.18, 0.08], tone: 'lamp', at: [1.25, 0.42, 0.8] },
      { cylinder: [0.16, 0.3, 0.12], tone: 'woodDark', at: [2.75, 0.06, 0.45] },
      { cylinder: [0.12, 0.2, 0.11], tone: 'woodDark', at: [2.75, 0.36, 0.45] },
      { cylinder: [0.045, 0.05], tone: 'woodDark', at: [2.66, 0.55, 0.45] },
      { cylinder: [0.045, 0.05], tone: 'woodDark', at: [2.84, 0.55, 0.45] },
      { box: [0.09, 0.06, 0.05], tone: 'sand', at: [2.75, 0.42, 0.57] },
      { box: [0.03, 0.03, 0.02], tone: 'metalDark', at: [2.75, 0.47, 0.6] },
      { box: [0.06, 0.2, 0.07], tone: 'woodDark', at: [2.58, 0.14, 0.5] },
      { box: [0.06, 0.2, 0.07], tone: 'woodDark', at: [2.92, 0.14, 0.5] },
      { cylinder: [0.055, 0.12], tone: 'sand', tilt: 90, at: [2.67, 0.08, 0.6] },
      { cylinder: [0.055, 0.12], tone: 'sand', tilt: 90, at: [2.83, 0.08, 0.6] },
    ],
    spots: [
      { at: [1.3, 0.88], turn: 2, activity: 'sit', up: 0.06 },
      { at: [1.8, 0.88], turn: 2, activity: 'sit', up: 0.06 },
      { at: [2.3, 1.7], turn: 1, activity: 'sit', up: 0.06 },
      { at: [0.95, 1.55], turn: 3, activity: 'idle', up: 0.06 },
    ],
  },
  // After the designer's photo of a confession booth: a small room open to the camera, its dark walls
  // painted with bright flowers, an orange armchair on a yellow rug and a microphone on a stand.
  confessionBooth: {
    parts: [
      { box: [1.9, 0.04, 1.8], tone: 'metalDark', at: [1, 0, 1] },
      { box: [1.9, 1.6, 0.08], tone: 'metalDark', at: [1, 0, 0.06] },
      // Open on the side the office is seen from, so that the camera sees in.
      { box: [0.08, 1.6, 1.7], tone: 'metalDark', at: [0.06, 0, 0.95] },
      { box: [0.08, 1.6, 0.5], tone: 'metalDark', at: [1.94, 0, 0.35] },
      // The flowers on the walls.
      ...([[0.35, 1.1, 'lamp'], [0.8, 1.35, 'fabric'], [1.25, 1.05, 'plant'], [1.65, 1.3, 'glass'], [0.6, 0.75, 'accent'], [1.5, 0.7, 'lamp']] as const).map(
        ([x, y, tone]): Part => ({ box: [0.16, 0.16, 0.02], tone, turn: 0.5, at: [x, y, 0.11] }),
      ),
      ...([[0.5, 1.2, 'fabric'], [1.0, 0.8, 'lamp'], [1.4, 1.25, 'plant']] as const).map(([z, y, tone]): Part => ({ box: [0.02, 0.16, 0.16], tone, at: [0.11, y, z] })),
      // The rug, the armchair and the microphone.
      { box: [1.0, 0.02, 0.8], tone: 'lamp', at: [1, 0.04, 0.9] },
      { model: 'armchair', tones: { carpet: 'fabric' }, size: 0.9, at: [1, 0.04, 0.75] },
      { cylinder: [0.12, 0.02], tone: 'metalDark', at: [0.35, 0.04, 1.5] },
      { cylinder: [0.015, 1.0], tone: 'metalDark', at: [0.35, 0.06, 1.5] },
      { cylinder: [0.03, 0.12], tone: 'metal', tilt: 60, at: [0.4, 1.06, 1.45] },
    ],
    spots: [{ at: [1, 0.85], turn: 2, activity: 'sit', up: 0.04 }],
  },
  // After the designer's photo of a game show: a shiny floor, a purple wall with the question
  // on a big blue board, a column of light, and a desk for each team with its name and score.
  gameShowSet: {
    parts: [
      { box: [2.94, 0.06, 1.9], tone: 'white', at: [1.5, 0, 1] },
      { box: [2.9, 1.6, 0.1], tone: 'accent', at: [1.5, 0.06, 0.08] },
      { cylinder: [1.05, 0.06], tone: 'metalMid', tilt: 90, at: [1.2, 0.2, 0.14] },
      { box: [1.5, 0.8, 0.04], tone: 'glass', at: [1.2, 0.5, 0.18] },
      { box: [0.9, 0.14, 0.02], tone: 'fabric', at: [1.2, 1.08, 0.21] },
      { box: [0.34, 0.07, 0.02], tone: 'white', at: [0.8, 0.66, 0.21] },
      { box: [0.34, 0.07, 0.02], tone: 'white', at: [1.2, 0.82, 0.21] },
      { box: [0.34, 0.07, 0.02], tone: 'white', at: [1.6, 0.66, 0.21] },
      { box: [0.3, 1.6, 0.3], tone: 'lamp', at: [2.62, 0.06, 0.3] },
      { box: [0.32, 0.03, 0.32], tone: 'accent', at: [2.62, 0.5, 0.3] },
      { box: [0.32, 0.03, 0.32], tone: 'accent', at: [2.62, 1, 0.3] },
      { box: [0.32, 0.03, 0.32], tone: 'accent', at: [2.62, 1.5, 0.3] },
      { at: [0.6, 0.06, 1.32], turn: 0.25, parts: [
        { box: [0.9, 0.2, 0.36], tone: 'metalDark', at: [0, 0, 0] },
        { box: [0.86, 0.3, 0.3], tone: 'white', at: [0, 0.2, 0] },
        { box: [0.92, 0.04, 0.4], tone: 'metal', at: [0, 0.5, 0] },
        { box: [0.7, 0.16, 0.02], tone: 'fabric', at: [0, 0.35, 0.16] },
        { box: [0.4, 0.14, 0.02], tone: 'lamp', at: [0, 0.2, 0.16] },
      ] },
      { at: [2.4, 0.06, 1.32], turn: -0.25, parts: [
        { box: [0.9, 0.2, 0.36], tone: 'metalDark', at: [0, 0, 0] },
        { box: [0.86, 0.3, 0.3], tone: 'white', at: [0, 0.2, 0] },
        { box: [0.92, 0.04, 0.4], tone: 'metal', at: [0, 0.5, 0] },
        { box: [0.7, 0.16, 0.02], tone: 'glass', at: [0, 0.3, 0.16] },
        { box: [0.4, 0.14, 0.02], tone: 'lamp', at: [0, 0.2, 0.16] },
      ] },
    ],
    spots: [
      { at: [1.5, 0.8], turn: 2, activity: 'idle', up: 0.06 },
      { at: [0.45, 0.8], turn: 2.2, activity: 'idle', up: 0.06 },
      { at: [2.6, 0.8], turn: 1.8, activity: 'idle', up: 0.06 },
    ],
  },
  // After the designer's photo of a concert stage: a raised black platform with a narrow catwalk out to
  // the front, a big screen along the back, and above it a truss of spotlights on two uprights. One look
  // for all the years. Hosts stand on the platform and at the end of the catwalk, facing the audience.
  stage: {
    parts: [
      // The platform and the catwalk, black, with a glowing strip along the front edge of each.
      { box: [3.96, 0.3, 1.9], tone: 'metalDark', at: [2, 0, 0.97] },
      { box: [1.2, 0.3, 1.1], tone: 'metalDark', at: [2, 0, 2.45] },
      { box: [3.96, 0.04, 0.03], tone: 'accent', at: [2, 0.2, 1.93] },
      { box: [0.45, 0.04, 0.03], tone: 'accent', at: [1.37, 0.2, 2.99] },
      { box: [0.45, 0.04, 0.03], tone: 'accent', at: [2.63, 0.2, 2.99] },
      { box: [0.03, 0.04, 1.0], tone: 'accent', at: [1.39, 0.2, 2.45] },
      { box: [0.03, 0.04, 1.0], tone: 'accent', at: [2.61, 0.2, 2.45] },
      // The screen along the back, in a dark frame on two short legs, showing a bright picture.
      { box: [3.5, 1.5, 0.08], tone: 'metalDark', at: [2, 0.3, 0.12] },
      { box: [3.3, 1.3, 0.03], tone: 'glass', at: [2, 0.4, 0.17] },
      { box: [1.1, 0.5, 0.02], tone: 'accent', at: [1.4, 0.8, 0.19] },
      { box: [0.7, 0.2, 0.02], tone: 'onAir', at: [2.8, 1.3, 0.19] },
      { box: [0.9, 0.12, 0.02], tone: 'white', at: [2.5, 0.65, 0.19] },
      // The truss: two uprights, a bar across the back and one across the front of the platform.
      ...[0.1, 3.9].map((x): Part => ({ box: [0.08, 2.5, 0.08], tone: 'metal', at: [x, 0, 0.5] })),
      { box: [3.9, 0.08, 0.08], tone: 'metal', at: [2, 2.45, 0.5] },
      { box: [3.9, 0.08, 0.08], tone: 'metal', at: [2, 2.2, 1.5] },
      ...[0.1, 3.9].map((x): Part => ({ box: [0.06, 0.06, 1.0], tone: 'metalMid', at: [x, 2.3, 1.0] })),
      // Spotlights hung under the bars, aimed down at the stage.
      ...[0.6, 1.4, 2.2, 3.0, 3.6].flatMap((x): Part[] => [
        { box: [0.08, 0.1, 0.08], tone: 'metalDark', at: [x, 2.1, 1.5] },
        { cylinder: [0.1, 0.2], tone: 'metalDark', tilt: 55, at: [x, 1.95, 1.58] },
        { cylinder: [0.07, 0.02], tone: 'lamp', tilt: 55, at: [x, 1.9, 1.7] },
      ]),
      ...[1.0, 2.0, 3.0].map((x): Part => ({ cylinder: [0.09, 0.18], tone: 'metalDark', tilt: 40, at: [x, 2.25, 0.6] })),
    ],
    spots: [
      { at: [2, 1.3], turn: 2, activity: 'idle', up: 0.3 },
      { at: [2, 2.6], turn: 2, activity: 'idle', up: 0.3 },
      { at: [3.1, 1.2], turn: 2, activity: 'idle', up: 0.3 },
    ],
  },
  // After the designer's description of a talent show jury: a long dark glossy table with a plain
  // front panel (no logo), and three seats behind it, each with a small lamp and a microphone.
  // The jurors sit behind the table at the back of the piece and look out over it, to the stage.
  juryTable: {
    parts: [
      // The table: a glossy top on a dark body, a plain front panel and a thin glowing strip under the top.
      { box: [2.9, 0.06, 0.5], tone: 'metalDark', at: [1.5, 0.78, 0.72] },
      { box: [2.86, 0.78, 0.4], tone: 'metalDark', at: [1.5, 0, 0.76] },
      { box: [2.9, 0.78, 0.03], tone: 'metalMid', at: [1.5, 0, 0.96] },
      { box: [2.7, 0.03, 0.02], tone: 'accent', at: [1.5, 0.7, 0.98] },
      // Three seats, each with a back, behind the table.
      ...[0.5, 1.5, 2.5].flatMap((x): Part[] => [
        { box: [0.1, 0.4, 0.1], tone: 'metalDark', at: [x, 0, 0.24] },
        { box: [0.44, 0.08, 0.4], tone: 'fabric', at: [x, 0.4, 0.24] },
        { box: [0.44, 0.5, 0.07], tone: 'fabricDark', at: [x, 0.48, 0.06] },
        // A small lamp and a microphone on the table in front of each seat.
        { box: [0.12, 0.02, 0.12], tone: 'metal', at: [x - 0.35, 0.84, 0.62] },
        { box: [0.03, 0.2, 0.03], tone: 'metal', at: [x - 0.35, 0.86, 0.62] },
        { box: [0.14, 0.08, 0.1], tone: 'lamp', at: [x - 0.35, 1.04, 0.62] },
        { cylinder: [0.05, 0.02], tone: 'metalDark', at: [x + 0.2, 0.84, 0.66] },
        { cylinder: [0.012, 0.22], tone: 'metalDark', at: [x + 0.2, 0.86, 0.66] },
        { box: [0.04, 0.07, 0.04], tone: 'metalMid', at: [x + 0.2, 1.08, 0.66] },
      ]),
    ],
    spots: [0.5, 1.5, 2.5].map((x): Spot => ({ at: [x, 0.25], turn: 2, activity: 'sit', up: 0.04 })),
  },
  // After the designer's photo of audience seating: three rows of seats on wooden steps,
  // facing the viewer, where the set should be.
  audienceSeating: {
    parts: [
      ...[0, 1, 2].flatMap((row): Part[] => {
        const z = 1.68 - row * 0.66;
        const top = 0.1 + row * 0.3;
        return [
          { box: [2.94, top, 0.66], tone: 'wood', at: [1.5, 0, z] },
          { box: [2.8, 0.1, 0.34], tone: 'fabric', at: [1.5, top + 0.24, z - 0.06] },
          { box: [2.8, 0.3, 0.06], tone: 'fabricDark', at: [1.5, top + 0.3, z - 0.26] },
          ...[0.15, 1.5, 2.85].map((x): Part => ({ box: [0.06, 0.24, 0.3], tone: 'metalDark', at: [x, top, z - 0.06] })),
        ];
      }),
      { box: [0.06, 0.9, 0.06], tone: 'metalDark', at: [0.04, 0.7, 0.06] },
      { box: [0.06, 0.9, 0.06], tone: 'metalDark', at: [2.96, 0.7, 0.06] },
      { box: [2.94, 0.05, 0.05], tone: 'metalDark', at: [1.5, 1.55, 0.06] },
    ],
    // Ten seats: four in front, three and three behind, each row a step higher.
    spots: [
      ...[0.45, 1.15, 1.85, 2.55].map((x): Spot => ({ at: [x, 1.62], turn: 2, activity: 'sit', up: 0.0 })),
      ...[0.6, 1.5, 2.4].map((x): Spot => ({ at: [x, 0.96], turn: 2, activity: 'sit', up: 0.3 })),
      ...[0.6, 1.5, 2.4].map((x): Spot => ({ at: [x, 0.3], turn: 2, activity: 'sit', up: 0.6 })),
    ],
  },
  // After the designer's photos of server racks. Tier 1: a beige computer cabinet with
  // drawers beside a dark rack of panels under a red header. Tier 2: two black cabinets with
  // rows of silver servers behind glass doors.
  serverRack: {
    parts: [
      { at: [0, 0, 0], tiers: [1, 1], parts: [
        { box: [0.92, 1.2, 0.8], tone: 'white', at: [0.5, 0, 0.5] },
        { box: [0.7, 0.2, 0.02], tone: 'metalDark', at: [0.5, 0.9, 0.91] },
        ...[0, 1, 2].map((i): Part => ({ box: [0.76, 0.02, 0.02], tone: 'metalMid', at: [0.5, 0.2 + i * 0.22, 0.91] })),
        { box: [0.92, 1.66, 0.8], tone: 'metalDark', at: [1.5, 0, 0.5] },
        { box: [0.92, 0.14, 0.82], tone: 'fabric', at: [1.5, 1.66, 0.5] },
        ...[0, 1, 2, 3, 4].map((i): Part => ({ box: [0.76, 0.2, 0.02], tone: i % 2 ? 'white' : 'metalMid', at: [1.5, 0.12 + i * 0.3, 0.91] })),
        ...[0, 1, 2, 3, 4].map((i): Part => ({ box: [0.1, 0.05, 0.02], tone: i % 2 ? 'fabric' : 'lamp', at: [1.25 + (i % 3) * 0.2, 0.2 + i * 0.3, 0.93] })),
      ] },
      { at: [0, 0, 0], tiers: [2, 9], parts: [
        ...[0.5, 1.5].flatMap((x): Part[] => [
          { box: [0.96, 1.8, 0.84], tone: 'metalDark', at: [x, 0, 0.5] },
          { box: [0.8, 1.6, 0.02], tone: 'trim', at: [x, 0.1, 0.93] },
          ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i): Part => ({ box: [0.7, 0.07, 0.02], tone: 'metal', at: [x, 0.18 + i * 0.17, 0.95] })),
          ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i): Part => ({ box: [0.05, 0.03, 0.02], tone: i % 3 ? 'plant' : 'lamp', at: [x + 0.28, 0.2 + i * 0.17, 0.97] })),
          { box: [0.03, 0.5, 0.04], tone: 'metal', at: [x - 0.42, 0.7, 0.96] },
        ]),
      ] },
    ],
  },
  sink: {
    parts: [
      { model: 'sink', at: [0.5, 0, 0.3] },
      { model: 'mirror', size: 0.9, at: [0.5, 1.1, 0.1] },
    ],
  },
  // A toilet in a stall: a back wall and two sides, open to the front.
  toilet: {
    parts: [
      { box: [0.96, 1.3, 0.05], tone: 'metalMid', at: [0.5, 0, 0.03] },
      { box: [0.05, 1.3, 0.9], tone: 'metalMid', at: [0.03, 0, 0.47] },
      { box: [0.05, 1.3, 0.9], tone: 'metalMid', at: [0.97, 0, 0.47] },
      { model: 'toilet', size: 0.85, at: [0.5, 0, 0.42] },
      // The door, clear of the floor, with a lock.
      { box: [0.88, 1.12, 0.04], tone: 'white', at: [0.5, 0.14, 0.93] },
      { box: [0.06, 0.06, 0.03], tone: 'metalDark', at: [0.82, 0.68, 0.96] },
    ],
    spots: [{ at: [0.5, 0.5], turn: 2, activity: 'sit' }],
  },
  // A long counter with a raised front for visitors to lean on; the receptionist sits behind it.
  receptionDesk: {
    parts: [
      { model: 'deskChair', at: [1.5, 0, 0.16] },
      { box: [2.8, 0.74, 0.34], tone: 'wood', at: [1.5, 0, 0.66] },
      { box: [2.86, 0.05, 0.4], tone: 'white', at: [1.5, 0.74, 0.66] },
      { box: [2.9, 1.0, 0.1], tone: 'accent', at: [1.5, 0, 0.92] },
      { box: [2.96, 0.05, 0.2], tone: 'white', at: [1.5, 1.0, 0.92] },
      { box: [1.2, 0.3, 0.02], tone: 'lamp', at: [1.5, 0.4, 0.98] },
      { model: 'laptop', size: 0.8, at: [1.2, 0.79, 0.62], turn: 2 },
      { box: [0.18, 0.08, 0.14], tone: 'metalDark', at: [1.9, 0.79, 0.62] },
    ],
    spots: [{ at: [1.5, 0.18], turn: 2, activity: 'sit' }],
  },
  // After the designer's photo: a wide console that slopes towards the technician, row on row of lit
  // buttons in white, yellow, green and red, with two faders and a small screen in the middle, and a
  // rack of meters behind it. It stands like the control desk: the technician in front, facing it.
  audioMixer: {
    parts: [
      { box: [1.9, 0.72, 0.6], tone: 'metalMid', at: [1, 0, 0.42] },
      { box: [1.96, 0.62, 0.22], tone: 'metalDark', at: [1, 0.72, 0.14] },
      ...[0, 1, 2].map((i): Part => ({ box: [0.5, 0.18, 0.02], tone: i === 1 ? 'lamp' : 'glass', at: [0.45 + i * 0.55, 1.0, 0.26] })),
      { box: [1.86, 0.06, 0.56], tone: 'metalDark', tilt: -12, at: [1, 0.72, 0.5] },
      ...[0, 1, 2, 3].flatMap((row) => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].filter((i) => i < 6 || i > 7).map((i): Part => ({
        box: [0.08, 0.025, 0.06],
        tone: (['white', 'lamp', 'plant', 'onAir'] as const)[(row + Math.floor(i / 3)) % 4]!,
        tilt: -12,
        at: [0.22 + i * 0.12, 0.79 + row * 0.022, 0.66 - row * 0.1],
      }))),
      // The screen and the two faders in the middle.
      { box: [0.26, 0.16, 0.02], tone: 'white', tilt: -60, at: [1, 0.82, 0.38] },
      ...[0.92, 1.08].map((x): Part => ({ box: [0.03, 0.08, 0.03], tone: 'white', at: [x, 0.78, 0.68] })),
    ],
    spots: [{ at: [1, 1.2], turn: 0, activity: 'work' }],
  },
  // After the designer's photos of master control rooms. Versions 2 and up: a long curved desk of metal that
  // curves round the technicians, full of flat screens, keyboards and panels of buttons. Version 1, the 1970s,
  // after the designer's photo of a power station's control room: a long white console with a sloped top over
  // a dark wood-panelled base, rows of square lamp buttons, a strip of faders, round meters and two
  // telephones, and three small tube monitors with glass fronts at the back. Two chairs behind it, for both
  // looks, so that they face the viewer the way a workstation has them.
  mcrDesk: {
    parts: [
      { at: [0, 0, 0], tiers: [2, 9], parts: [
        // The middle stretch and the two ends that curve towards the chairs.
        { box: [1.5, 0.72, 0.62], tone: 'metalDark', at: [1.5, 0, 1.45] },
        { box: [1.56, 0.05, 0.7], tone: 'metalMid', at: [1.5, 0.72, 1.45] },
        ...([[0.42, -0.22], [2.58, 0.22]] as const).flatMap(([x, turn]): Part[] => [
          { box: [0.8, 0.72, 0.62], tone: 'metalDark', turn, at: [x, 0, 1.27] },
          { box: [0.84, 0.05, 0.7], tone: 'metalMid', turn, at: [x, 0.72, 1.27] },
          { model: 'screen', size: 0.7, turn: 2 + turn, at: [x, 0.77, 1.42] },
          { box: [0.4, 0.03, 0.16], tone: 'white', turn, at: [x, 0.77, 1.12] },
        ]),
        // Screens and panels on the middle stretch, keyboards in front of the chairs.
        ...[1.1, 1.9].map((x): Part => ({ model: 'screen', size: 0.7, turn: 2, at: [x, 0.77, 1.62] })),
        ...[1.05, 1.95].map((x): Part => ({ model: 'keyboard', size: 0.75, turn: 2, at: [x, 0.77, 1.3] })),
        ...[0, 1, 2, 3, 4].map((i): Part => ({ box: [0.05, 0.02, 0.05], tone: (['lamp', 'plant', 'onAir', 'white', 'glass'] as const)[i]!, at: [1.3 + i * 0.1, 0.77, 1.28] })),
      ] },
      { at: [0, 0, 0], tiers: [1, 1], parts: [
        // The wood-panelled base and the white top, long and low.
        { box: [2.8, 0.7, 0.66], tone: 'woodDark', at: [1.5, 0, 1.5] },
        { box: [2.9, 0.05, 0.8], tone: 'white', at: [1.5, 0.7, 1.45] },
        // The sloped part of the console, with three rows of square lamp buttons.
        { box: [2.8, 0.08, 0.5], tone: 'white', tilt: 10, turn: 2, at: [1.5, 0.75, 1.32] },
        ...[0, 1, 2].flatMap((row) => Array.from({ length: 12 }, (_, i): Part => ({
          box: [0.08, 0.025, 0.06],
          tone: (['lamp', 'plant', 'onAir', 'white'] as const)[(i + row * 2 + Math.floor(i / 4)) % 4]!,
          tilt: 10, turn: 2,
          at: [0.73 + i * 0.14, 0.84, 1.48 - row * 0.08],
        }))),
        // A strip of faders in front of them, in a dark slot.
        { box: [1.7, 0.012, 0.12], tone: 'metalDark', tilt: 10, turn: 2, at: [1.5, 0.84, 1.19] },
        ...Array.from({ length: 12 }, (_, i): Part => ({ box: [0.035, 0.03, 0.05], tone: i % 4 === 3 ? 'lamp' : 'white', tilt: 10, turn: 2, at: [0.73 + i * 0.14, 0.855, 1.17 + (i % 3) * 0.02] })),
        // Round meters at either end of the lamps.
        ...[0.38, 0.54, 2.46, 2.62].flatMap((x): Part[] => [
          { cylinder: [0.065, 0.02], tone: 'metalDark', tilt: 10, turn: 2, at: [x, 0.84, 1.42] },
          { cylinder: [0.05, 0.02], tone: 'white', tilt: 10, turn: 2, at: [x, 0.855, 1.42] },
        ]),
        // A telephone at each end: a cradle with the handset across it.
        ...[0.4, 2.6].flatMap((x): Part[] => [
          { box: [0.2, 0.05, 0.16], tone: 'metalDark', at: [x, 0.75, 1.2] },
          { box: [0.22, 0.04, 0.05], tone: 'metalDark', at: [x, 0.8, 1.2] },
          ...[-0.1, 0.1].map((dx): Part => ({ box: [0.05, 0.05, 0.06], tone: 'metalDark', at: [x + dx, 0.79, 1.2] })),
        ]),
        // Three small tube monitors along the back: a deep body, a narrower tail and a glass front.
        ...[0.6, 1.5, 2.4].flatMap((x): Part[] => [
          { box: [0.5, 0.38, 0.3], tone: 'metalMid', at: [x, 0.75, 1.68] },
          { box: [0.3, 0.24, 0.14], tone: 'metalDark', at: [x, 0.8, 1.84] },
          { box: [0.38, 0.28, 0.02], tone: 'glass', at: [x, 0.81, 1.525] },
        ]),
      ] },
      // The chairs, for both looks.
      ...[1.05, 1.95].map((x): Part => ({ model: 'deskChair', at: [x, 0, 0.62] })),
    ],
    spots: [
      { at: [1.05, 0.8], turn: 2, activity: 'sit' },
      { at: [1.95, 0.8], turn: 2, activity: 'sit' },
    ],
  },
  // A steel desk for a guard, and on it, behind, a bank of small tube monitors in two rows of three, one
  // for every camera: deep boxy casings, chunky dark bezels, a grey screen bulging out of each and two
  // knobs below it. One look for all the years, so that it fits the 1970s and still looks it in 2030.
  // The guard sits in front, facing the monitors.
  securityDesk: {
    parts: [
      // The desk: two pedestals of steel under a top, a panel across the back.
      ...[0.3, 1.7].map((x): Part => ({ box: [0.5, 0.7, 0.8], tone: 'metalMid', at: [x, 0, 0.55] })),
      { box: [1.9, 0.6, 0.04], tone: 'metalDark', at: [1, 0.08, 0.2] },
      { box: [1.96, 0.04, 0.92], tone: 'metal', at: [1, 0.7, 0.52] },
      ...[0.3, 1.7].flatMap((x) => [0.3, 0.55].map((y): Part => ({ box: [0.3, 0.02, 0.02], tone: 'metalDark', at: [x, y, 0.96] }))),
      // The shelf for the second row, on two uprights at the ends.
      ...[0.06, 1.94].map((x): Part => ({ box: [0.05, 0.5, 0.4], tone: 'metalDark', at: [x, 0.74, 0.27] })),
      { box: [1.96, 0.04, 0.42], tone: 'metalMid', at: [1, 1.2, 0.27] },
      // The tube monitors: a deep body, a narrower tail, a bezel, the bulging screen and two knobs.
      ...[0.74, 1.24].flatMap((y, row) => [0.4, 1, 1.6].flatMap((x, i): Part[] => [
        { box: [0.54, 0.4, 0.3], tone: 'metalMid', at: [x, y, 0.2] },
        { box: [0.34, 0.26, 0.14], tone: 'metalDark', at: [x, y + 0.05, 0.06] },
        { box: [0.56, 0.42, 0.04], tone: 'metalDark', at: [x, y - 0.01, 0.37] },
        { box: [0.4, 0.28, 0.03], tone: (row + i) % 4 === 3 ? 'white' : 'metal', at: [x, y + 0.07, 0.4] },
        ...[0.1, 0.2].map((dx): Part => ({ cylinder: [0.025, 0.04], tone: 'white', tilt: 90, at: [x + dx - 0.05, y - 0.1, 0.4] })),
      ])),
      // A keyboard and a telephone on the desk, and a chair for the guard.
      { model: 'keyboard', size: 0.75, at: [0.9, 0.73, 0.82] },
      { box: [0.2, 0.06, 0.16], tone: 'metalDark', at: [1.65, 0.74, 0.8] },
      { box: [0.22, 0.04, 0.05], tone: 'metalDark', at: [1.65, 0.8, 0.8] },
      { model: 'deskChair', turn: 2, at: [1, 0, 1.35] },
    ],
    spots: [{ at: [1, 1.3], turn: 0, activity: 'sit' }],
  },
  // The backdrop of a weather studio: a wall of bright chroma-green cloth, a little taller than a person,
  // stretched on a light metal frame with a foot at each end, and a small clip light on the top bar. It
  // stands at the back and faces the front. One look for all the years.
  greenScreen: {
    parts: [
      // The cloth, flat and tight on the frame, with a darker fold along its foot.
      { box: [2.7, 1.9, 0.03], tone: 'plant', at: [1.5, 0.12, 0.34] },
      { box: [2.7, 0.08, 0.035], tone: 'grass', at: [1.5, 0.12, 0.345] },
      // The frame: two uprights, the top bar and the bottom bar, all in light metal.
      ...[0.1, 2.9].map((x): Part => ({ box: [0.07, 2.06, 0.07], tone: 'metal', at: [x, 0.06, 0.34] })),
      { box: [2.9, 0.07, 0.07], tone: 'metal', at: [1.5, 2.0, 0.34] },
      { box: [2.9, 0.06, 0.07], tone: 'metal', at: [1.5, 0.06, 0.34] },
      // Two feet, each a bar on the floor under an upright.
      ...[0.1, 2.9].map((x): Part => ({ box: [0.1, 0.06, 0.6], tone: 'metalMid', at: [x, 0, 0.46] })),
      // The clip light: a clamp on the top bar, a short arm and a small lamp head aimed down at the cloth.
      { box: [0.08, 0.08, 0.1], tone: 'metalDark', at: [2.4, 1.96, 0.34] },
      { box: [0.03, 0.03, 0.22], tone: 'metalDark', at: [2.4, 1.98, 0.48] },
      { cylinder: [0.07, 0.1], tone: 'metalDark', tilt: 60, at: [2.4, 1.86, 0.62] },
      { cylinder: [0.045, 0.02], tone: 'white', tilt: 60, at: [2.4, 1.82, 0.65] },
    ],
  },
  // A desk for a meteorologist: a white top on two panels, a flat monitor on a stand that shows a map (blue
  // sea, green land, a white cloud, a red mark and a yellow one), a keyboard, and a chair in front. One look
  // for all the years. The meteorologist sits facing the monitor.
  weatherDesk: {
    parts: [
      // The desk: a panel under each end, a back panel, and the top.
      ...[0.2, 1.8].map((x): Part => ({ box: [0.08, 0.7, 0.8], tone: 'metalMid', at: [x, 0, 0.55] })),
      { box: [1.6, 0.6, 0.04], tone: 'metalDark', at: [1, 0.08, 0.2] },
      { box: [1.96, 0.05, 0.9], tone: 'white', at: [1, 0.7, 0.55] },
      // The monitor: a foot, a neck, a dark bezel, and the map on its face.
      { box: [0.3, 0.02, 0.2], tone: 'metalDark', at: [1, 0.75, 0.3] },
      { box: [0.06, 0.16, 0.06], tone: 'metalDark', at: [1, 0.77, 0.3] },
      { box: [0.86, 0.56, 0.05], tone: 'metalDark', at: [1, 0.93, 0.28] },
      { box: [0.78, 0.48, 0.02], tone: 'water', at: [1, 0.97, 0.31] },
      { box: [0.3, 0.2, 0.02], tone: 'grass', at: [0.8, 0.97, 0.325] },
      { box: [0.2, 0.14, 0.02], tone: 'grass', at: [0.7, 1.15, 0.325] },
      { box: [0.22, 0.16, 0.02], tone: 'grass', at: [1.2, 1.0, 0.325] },
      { box: [0.2, 0.08, 0.02], tone: 'white', at: [1.1, 1.2, 0.335] },
      { box: [0.14, 0.06, 0.02], tone: 'white', at: [1.22, 1.14, 0.335] },
      { box: [0.06, 0.06, 0.02], tone: 'onAir', at: [0.85, 1.06, 0.34] },
      { box: [0.06, 0.06, 0.02], tone: 'lamp', at: [1.25, 1.0, 0.34] },
      // A keyboard on the desk, and a chair for the meteorologist.
      { model: 'keyboard', size: 0.75, at: [1, 0.75, 0.82] },
      { model: 'deskChair', turn: 2, at: [1, 0, 1.4] },
    ],
    spots: [{ at: [1, 1.35], turn: 0, activity: 'sit' }],
  },
  // A desk for a call agent, laid out like a workstation: the desk is at the front and the agent sits
  // behind it, facing the viewer. Low fabric dividers stand at both ends, a screen at the right end
  // and a headset lies on the desk beside the phone: a dial phone in the first years, a push-button
  // phone after that. The headset is the same in all the years.
  callDesk: {
    parts: [
      { model: 'deskChair', at: [1, 0, 0.65] },
      { box: [1.96, 0.05, 0.8], tone: 'white', at: [1, 0.72, 1.45] },
      { box: [0.08, 0.72, 0.7], tone: 'metalMid', at: [0.12, 0, 1.45] },
      { box: [0.08, 0.72, 0.7], tone: 'metalMid', at: [1.88, 0, 1.45] },
      { box: [1.7, 0.4, 0.03], tone: 'metalMid', at: [1, 0.3, 1.8] },
      { box: [0.05, 0.5, 0.9], tone: 'fabric', at: [0.04, 0.77, 1.45] },
      { box: [0.05, 0.5, 0.9], tone: 'fabric', at: [1.96, 0.77, 1.45] },
      { model: 'screen', at: [1.62, 0.77, 1.6], turn: 2, tiers: [3, 3] },
      { model: 'keyboard', at: [1.4, 0.77, 1.3], turn: 2, tiers: [3, 3] },
      { at: [0.5, 0.77, 1.5], tiers: [1, 1], parts: [
        { box: [0.22, 0.08, 0.18], tone: 'metalDark', at: [0, 0, 0] },
        { cylinder: [0.055, 0.012], tone: 'white', at: [0, 0.08, -0.035] },
        { cylinder: [0.022, 0.016], tone: 'metalDark', at: [0, 0.08, -0.035] },
        { box: [0.26, 0.035, 0.05], tone: 'metalDark', at: [0, 0.1, 0.055] },
        { box: [0.06, 0.05, 0.07], tone: 'metalDark', at: [-0.11, 0.08, 0.055] },
        { box: [0.06, 0.05, 0.07], tone: 'metalDark', at: [0.11, 0.08, 0.055] },
      ] },
      { at: [0.5, 0.77, 1.5], tiers: [2, 9], parts: [
        { box: [0.22, 0.06, 0.18], tone: 'metalDark', at: [0, 0, 0] },
        { box: [0.06, 0.035, 0.2], tone: 'metalDark', at: [-0.07, 0.06, 0] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.03, 0.06, -0.05] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.03, 0.06, -0.018] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.03, 0.06, 0.014] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.03, 0.06, 0.046] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.06, 0.06, -0.05] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.06, 0.06, -0.018] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.06, 0.06, 0.014] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.06, 0.06, 0.046] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.09, 0.06, -0.05] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.09, 0.06, -0.018] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.09, 0.06, 0.014] },
        { box: [0.022, 0.01, 0.018], tone: 'white', at: [0.09, 0.06, 0.046] },
      ] },
      { box: [0.2, 0.02, 0.03], tone: 'metalDark', at: [0.95, 0.87, 1.2] },
      { box: [0.03, 0.09, 0.07], tone: 'metalDark', at: [0.85, 0.78, 1.2] },
      { box: [0.03, 0.09, 0.07], tone: 'metalDark', at: [1.05, 0.78, 1.2] },
      { box: [0.1, 0.01, 0.01], tone: 'metalDark', at: [0.9, 0.79, 1.12] },
      { box: [0.26, 0.02, 0.2], tone: 'lamp', at: [0.5, 0.77, 1.2] },
      { cylinder: [0.04, 0.09], tone: 'accent', at: [0.15, 0.77, 1.3] },
      { box: [0.5, 0.14, 0.34], tone: 'metalDark', at: [1.34, 0.75, 1.4], tiers: [1, 2] },
      { box: [0.4, 0.2, 0.03], tone: 'white', at: [1.35, 0.89, 1.5], tiers: [1, 2] },
    ],
    spots: [
      { at: [1, 0.82], turn: 2, activity: 'sit' },
    ],
  },
  // A wall of monitors from floor to ceiling: one for every channel on the air and for the rivals,
  // a big one in the middle with the picture going out, and a row of clocks along the top.
  monitorWall: {
    parts: [
      { box: [2.9, 2.3, 0.3], tone: 'metalDark', at: [1.5, 0, 0.18] },
      ...[0, 1, 2].flatMap((row) => [0, 1, 2, 3].filter((i) => !(row > 0 && (i === 1 || i === 2))).map((i): Part => ({
        box: [0.6, 0.42, 0.02],
        tone: (['glass', 'white', 'lamp', 'plant', 'fabric', 'glass', 'white', 'accent'] as const)[(row * 5 + i * 3) % 8]!,
        at: [0.4 + i * 0.73, 0.45 + row * 0.5, 0.34],
      }))),
      { box: [1.3, 0.92, 0.02], tone: 'white', at: [1.5, 0.95, 0.34] },
      { box: [1.1, 0.1, 0.02], tone: 'onAir', at: [1.5, 1.75, 0.35] },
      ...[0, 1, 2, 3].map((i): Part => ({ cylinder: [0.09, 0.02], tone: 'white', tilt: 90, at: [0.6 + i * 0.6, 2.05, 0.34] })),
    ],
  },
  // A small padded booth with a window towards the room, a microphone on a stand and headphones
  // inside, and a red light over the door for while it records.
  recordingBooth: {
    parts: [
      { box: [1.9, 0.04, 1.8], tone: 'fabricDark', at: [1, 0, 1] },
      { box: [1.9, 2.0, 0.1], tone: 'fabricDark', at: [1, 0, 0.1] },
      { box: [0.1, 2.0, 1.7], tone: 'fabricDark', at: [0.1, 0, 0.95] },
      { box: [0.1, 2.0, 1.7], tone: 'fabricDark', at: [1.9, 0, 0.95] },
      { box: [1.9, 0.1, 1.8], tone: 'fabricDark', at: [1, 2.0, 1] },
      // The front: a wall below the window, the window, and the door at its side.
      { box: [1.1, 0.9, 0.1], tone: 'fabricDark', at: [0.6, 0, 1.85] },
      { box: [1.0, 0.8, 0.04], tone: 'glass', at: [0.6, 0.95, 1.86] },
      { box: [1.1, 0.25, 0.1], tone: 'fabricDark', at: [0.6, 1.75, 1.85] },
      { box: [0.7, 1.9, 0.08], tone: 'wood', at: [1.5, 0, 1.86] },
      { box: [0.04, 0.2, 0.04], tone: 'metal', at: [1.25, 0.95, 1.92] },
      // Foam on the back wall, the light over the door, the microphone and its stand, the headphones.
      ...[0, 1, 2].flatMap((row) => [0, 1, 2, 3].map((i): Part => ({ box: [0.36, 0.36, 0.06], tone: (row + i) % 2 ? 'metalDark' : 'fabric', at: [0.43 + i * 0.38, 0.5 + row * 0.42, 0.18] }))),
      { box: [0.3, 0.12, 0.08], tone: 'onAir', at: [1.5, 2.1, 1.9] },
      { cylinder: [0.12, 0.02], tone: 'metalDark', at: [0.8, 0.04, 0.9] },
      { cylinder: [0.015, 1.45], tone: 'metalDark', at: [0.8, 0.06, 0.9] },
      { cylinder: [0.05, 0.16], tone: 'metal', tilt: 70, at: [0.8, 1.5, 0.95] },
      { cylinder: [0.18, 0.02], tone: 'metalDark', tilt: 90, at: [0.8, 1.5, 1.05] },
    ],
  },
  // A low open cabinet against the wall, four compartments of LPs standing on end in a mix of colored
  // sleeves, the last one in each run leaning over. On top a stack of records, one sleeve propped
  // against the wall, and a record player with its lid up.
  recordShelves: {
    parts: [
      { box: [1.86, 0.7, 0.03], tone: 'metalMid', at: [1, 0, 0.085] },
      { box: [1.86, 0.06, 0.46], tone: 'wood', at: [1, 0, 0.3] },
      ...[0.095, 1.905].map((x): Part => ({ box: [0.05, 0.7, 0.46], tone: 'wood', at: [x, 0, 0.3] })),
      { box: [0.04, 0.64, 0.44], tone: 'wood', at: [1, 0.06, 0.3] },
      { box: [1.76, 0.04, 0.44], tone: 'wood', at: [1, 0.36, 0.3] },
      { box: [1.92, 0.05, 0.5], tone: 'wood', at: [1, 0.7, 0.3] },
      // The records, spines to the room.
      ...([[0.15, 0.06, 13], [1.05, 0.06, 10], [0.15, 0.4, 12], [1.05, 0.4, 14]] as const).flatMap(([left, y, count], run): Part[] => {
        const tones = ['onAir', 'lamp', 'accent', 'white', 'plant', 'metalDark', 'glass', 'woodDark', 'fabricDark'] as const;
        const tone = (i: number) => tones[(i * 5 + run * 3 + (i % 3) * run) % tones.length]!;
        return [
          ...Array.from({ length: count }, (_, i): Part => ({ box: [0.034, 0.28, 0.3], tone: tone(i), at: [left + i * 0.04, y, 0.32] })),
          { box: [0.034, 0.28, 0.3], tone: tone(count), roll: 18, at: [left + count * 0.04 + 0.05, y, 0.32] },
        ];
      }),
      // On top: a stack of records and a sleeve propped against the wall.
      ...([['accent', 0], ['lamp', 0.06], ['white', -0.04]] as const).map(([tone, turn], i): Part => ({ box: [0.31, 0.012, 0.31], tone, turn, at: [0.42, 0.75 + i * 0.012, 0.32] })),
      { box: [0.31, 0.31, 0.02], tone: 'plant', tilt: -10, at: [0.82, 0.75, 0.12] },
      { box: [0.14, 0.14, 0.005], tone: 'white', tilt: -10, at: [0.82, 0.83, 0.135] },
      // The record player: a white plinth, a black record with a red label, the arm, a knob, the lid up.
      { box: [0.6, 0.1, 0.42], tone: 'white', at: [1.4, 0.75, 0.3] },
      { cylinder: [0.16, 0.02], tone: 'metalDark', at: [1.33, 0.85, 0.31] },
      { cylinder: [0.05, 0.005], tone: 'onAir', at: [1.33, 0.87, 0.31] },
      { cylinder: [0.03, 0.04], tone: 'metal', at: [1.61, 0.85, 0.18] },
      { box: [0.02, 0.015, 0.26], tone: 'metal', turn: 0.08, at: [1.6, 0.88, 0.3] },
      { box: [0.035, 0.02, 0.05], tone: 'metalDark', turn: 0.08, at: [1.58, 0.87, 0.44] },
      { cylinder: [0.025, 0.02], tone: 'metalDark', at: [1.17, 0.85, 0.46] },
      { box: [0.6, 0.38, 0.02], tone: 'glass', tilt: -12, at: [1.4, 0.85, 0.1] },
    ],
  },
  // A pad of paper on an easel, a few lines and boxes drawn on it in marker.
  flipChart: {
    parts: [
      { cylinder: [0.02, 1.7], tone: 'metal', tilt: -8, roll: 8, at: [0.32, 0, 0.62] },
      { cylinder: [0.02, 1.7], tone: 'metal', tilt: -8, roll: -8, at: [0.68, 0, 0.62] },
      { cylinder: [0.02, 1.6], tone: 'metal', tilt: 6, at: [0.5, 0, 0.45] },
      { box: [0.66, 0.05, 0.06], tone: 'metalDark', tilt: 3, at: [0.5, 0.86, 0.65] },
      { box: [0.64, 0.82, 0.03], tone: 'white', tilt: -8, at: [0.5, 0.9, 0.6] },
      { box: [0.4, 0.025, 0.01], tone: 'onAir', tilt: -8, at: [0.47, 1.5, 0.6] },
      { box: [0.32, 0.025, 0.01], tone: 'accent', tilt: -8, at: [0.47, 1.36, 0.63] },
      { box: [0.24, 0.025, 0.01], tone: 'plant', tilt: -8, at: [0.47, 1.22, 0.63] },
      { box: [0.16, 0.12, 0.01], tone: 'lamp', tilt: -8, at: [0.62, 1.05, 0.66] },
    ],
  },
  // A year planner on a stand: a white board with the months down the side and every show and its
  // deadlines in colored strips across it.
  calendar: {
    parts: [
      ...[0.1, 0.9].map((x): Part => ({ cylinder: [0.025, 1.75], tone: 'metalDark', at: [x, 0, 0.4] })),
      { box: [0.84, 0.66, 0.04], tone: 'metalMid', at: [0.5, 0.95, 0.4] },
      { box: [0.78, 0.6, 0.02], tone: 'white', at: [0.5, 0.98, 0.43] },
      { box: [0.78, 0.07, 0.01], tone: 'onAir', at: [0.5, 1.5, 0.44] },
      ...[0, 1, 2, 3, 4, 5].flatMap((row) => [0, 1, 2].filter((i) => (i + row) % 4 !== 3).map((i): Part => ({
        box: [0.12 + ((row + i) % 3) * 0.05, 0.05, 0.01],
        tone: (['lamp', 'plant', 'accent', 'fabric'] as const)[(row + i) % 4]!,
        at: [0.25 + i * 0.24, 1.02 + row * 0.08, 0.445],
      }))),
    ],
  },
  // After the designer's photo: a white pad on a white easel with the quarter's figures drawn on it as
  // a pie in red, blue, green and orange.
  salesChart: {
    parts: [
      { cylinder: [0.02, 1.7], tone: 'white', tilt: -8, roll: 8, at: [0.32, 0, 0.62] },
      { cylinder: [0.02, 1.7], tone: 'white', tilt: -8, roll: -8, at: [0.68, 0, 0.62] },
      { cylinder: [0.02, 1.6], tone: 'white', tilt: 9, at: [0.5, 0, 0.4] },
      { box: [0.66, 0.05, 0.06], tone: 'metalMid', at: [0.5, 0.86, 0.7] },
      { box: [0.64, 0.82, 0.03], tone: 'white', tilt: -8, at: [0.5, 0.9, 0.6] },
      { box: [0.4, 0.03, 0.01], tone: 'metalDark', tilt: -6, at: [0.5, 1.6, 0.6] },
      { box: [0.12, 0.12, 0.01], tone: 'onAir', tilt: -6, at: [0.44, 1.14, 0.63] },
      { box: [0.12, 0.12, 0.01], tone: 'glass', tilt: -6, at: [0.56, 1.14, 0.63] },
      { box: [0.12, 0.12, 0.01], tone: 'lamp', tilt: -6, at: [0.44, 1.26, 0.63] },
      { box: [0.12, 0.12, 0.01], tone: 'plant', tilt: -6, at: [0.56, 1.26, 0.63] },
      { box: [0.3, 0.025, 0.01], tone: 'metalDark', tilt: -6, at: [0.5, 1, 0.63] },
    ],
  },
  // After the designer's photo of a big copier of the 1970s: a long cream machine with paper trays and
  // vents, a console with a small screen and a keyboard on its left end, and the copies coming out at
  // the right.
  printer: {
    parts: [
      { box: [0.9, 0.95, 0.7], tone: 'white', at: [0.5, 0, 0.45] },
      { box: [1.1, 0.8, 0.7], tone: 'white', at: [1.5, 0, 0.45] },
      { box: [0.9, 0.95, 0.7], tone: 'white', at: [2.45, 0, 0.45] },
      { box: [2.96, 0.06, 0.74], tone: 'metal', at: [1.5, 0.8, 0.45] },
      { box: [0.06, 0.95, 0.72], tone: 'metalDark', at: [1, 0, 0.45] },
      { box: [0.6, 0.18, 0.02], tone: 'metalDark', at: [1.5, 0.3, 0.81] },
      { box: [0.6, 0.18, 0.02], tone: 'metalDark', at: [1.5, 0.55, 0.81] },
      { box: [0.5, 0.03, 0.02], tone: 'metalMid', at: [2.45, 0.2, 0.81] },
      { box: [0.5, 0.03, 0.02], tone: 'metalMid', at: [2.45, 0.3, 0.81] },
      { box: [0.5, 0.03, 0.02], tone: 'metalMid', at: [2.45, 0.4, 0.81] },
      { box: [0.5, 0.03, 0.02], tone: 'metalMid', at: [2.45, 0.5, 0.81] },
      { box: [0.5, 0.03, 0.02], tone: 'metalMid', at: [2.45, 0.6, 0.81] },
      { box: [0.3, 0.3, 0.02], tone: 'metalDark', at: [2.45, 0.7, 0.81] },
      { box: [0.44, 0.03, 0.3], tone: 'white', at: [2.75, 0.95, 0.5] },
      { box: [0.38, 0.06, 0.26], tone: 'white', at: [2.75, 0.98, 0.5] },
      { box: [0.5, 0.28, 0.32], tone: 'metalDark', tilt: -10, at: [0.4, 1.1, 0.42] },
      { box: [0.36, 0.2, 0.02], tone: 'glass', tilt: -10, at: [0.4, 1.2, 0.6] },
      { box: [0.4, 0.04, 0.16], tone: 'metalMid', at: [0.45, 0.95, 0.72] },
    ],
  },
  // After the designer's photo: a grey steel cabinet of three drawers, the bottom one open on its
  // runners with a row of hanging files.
  filingCabinet: {
    parts: [
      { box: [0.5, 1.3, 0.6], tone: 'metalMid', at: [0.5, 0, 0.36] },
      ...[0.47, 0.9].map((y): Part => ({ box: [0.44, 0.38, 0.02], tone: 'metal', at: [0.5, y, 0.67] })),
      ...[0.62, 1.05].map((y): Part => ({ box: [0.16, 0.04, 0.03], tone: 'metalDark', at: [0.5, y, 0.69] })),
      { box: [0.46, 0.38, 0.34], tone: 'metal', at: [0.5, 0.04, 0.82] },
      { box: [0.16, 0.04, 0.03], tone: 'metalDark', at: [0.5, 0.25, 1.0] },
      ...[0, 1, 2, 3, 4, 5].map((i): Part => ({ box: [0.38, 0.06, 0.02], tone: i % 2 ? 'plant' : 'white', at: [0.5, 0.38, 0.69 + i * 0.045] })),
    ],
  },
  // A waste paper bin: the Kenney trashcan.
  bin: {
    parts: [{ model: 'trashcan', at: [0.5, 0, 0.5] }],
  },
  // A low cabinet of dark wood with drawers, and on it the company's framed certificates and a cup.
  dresser: {
    parts: [
      { box: [1.86, 0.8, 0.48], tone: 'woodDark', at: [1, 0, 0.3] },
      { box: [0.8, 0.24, 0.02], tone: 'wood', at: [0.5, 0.2, 0.55] },
      { box: [0.8, 0.24, 0.02], tone: 'wood', at: [0.5, 0.5, 0.55] },
      { box: [0.8, 0.24, 0.02], tone: 'wood', at: [1.5, 0.2, 0.55] },
      { box: [0.8, 0.24, 0.02], tone: 'wood', at: [1.5, 0.5, 0.55] },
      { box: [0.14, 0.03, 0.03], tone: 'metal', at: [0.5, 0.3, 0.57] },
      { box: [0.14, 0.03, 0.03], tone: 'metal', at: [0.5, 0.6, 0.57] },
      { box: [0.14, 0.03, 0.03], tone: 'metal', at: [1.5, 0.3, 0.57] },
      { box: [0.14, 0.03, 0.03], tone: 'metal', at: [1.5, 0.6, 0.57] },
      { box: [0.34, 0.42, 0.03], tone: 'woodDark', tilt: -2, at: [0.35, 0.8, 0.22] },
      { box: [0.26, 0.34, 0.01], tone: 'white', tilt: -2, at: [0.35, 0.84, 0.245] },
      { box: [0.34, 0.5, 0.03], tone: 'woodDark', tilt: -5, at: [0.8, 0.8, 0.22] },
      { box: [0.26, 0.42, 0.01], tone: 'white', tilt: -5, at: [0.8, 0.84, 0.245] },
      { box: [0.34, 0.42, 0.03], tone: 'woodDark', tilt: -4, at: [1.25, 0.8, 0.22] },
      { box: [0.26, 0.34, 0.01], tone: 'white', tilt: -4, at: [1.25, 0.84, 0.245] },
      { cylinder: [0.08, 0.04], tone: 'woodDark', at: [1.62, 0.8, 0.3] },
      { cylinder: [0.02, 0.14], tone: 'lamp', at: [1.62, 0.84, 0.3] },
      { cylinder: [0.04, 0.12, 0.1], tone: 'lamp', at: [1.62, 0.98, 0.3] },
    ],
  },
  // A dishwasher: the Kenney dryer, a little larger than the tile.
  dishwasher: {
    parts: [{ model: 'dryer', size: 1.3, at: [0.5, 0, 0.5] }],
  },
  // After the designer's photo: a tank of tropical fish with green plants, grey stones and black
  // gravel, a white lid with its light, on a low white cabinet with open shelves.
  aquarium: {
    parts: [
      { box: [1.86, 0.7, 0.5], tone: 'white', at: [1, 0, 0.35] },
      ...[0.5, 1.5].map((x): Part => ({ box: [0.8, 0.28, 0.02], tone: 'wood', at: [x, 0.08, 0.61] })),
      { box: [0.86, 0.22, 0.02], tone: 'metalDark', at: [0.5, 0.42, 0.61] },
      { box: [1.6, 0.06, 0.44], tone: 'white', at: [1, 0.7, 0.35] },
      // The tank: water at the back and the sides, open towards the viewer so the fish can be seen; a thin frame at the corners.
      { box: [1.56, 0.62, 0.03], tone: 'glass', at: [1, 0.76, 0.15] },
      ...[0.22, 1.78].map((x): Part => ({ box: [0.03, 0.62, 0.4], tone: 'glass', at: [x, 0.76, 0.35] })),
      ...[0.22, 1.78].map((x): Part => ({ box: [0.04, 0.62, 0.04], tone: 'white', at: [x, 0.76, 0.55] })),
      { box: [1.52, 0.06, 0.38], tone: 'metalDark', at: [1, 0.76, 0.35] },
      { box: [1.64, 0.06, 0.46], tone: 'white', at: [1, 1.38, 0.35] },
      ...([[0.4, 0.3], [0.7, 0.22], [1.3, 0.34], [1.6, 0.26]] as const).map(([x, h]): Part => ({ cylinder: [0.06, h, 0.1], tone: 'plant', at: [x, 0.82, 0.3] })),
      ...[0.85, 1.15].map((x): Part => ({ box: [0.16, 0.08, 0.12], tone: 'white', turn: 0.3, at: [x, 0.82, 0.4] })),
      ...([[0.6, 1.05, 'onAir'], [1.0, 1.15, 'lamp'], [1.4, 1.0, 'accent'], [0.9, 0.95, 'onAir']] as const).map(([x, y, tone]): Part => ({ box: [0.07, 0.04, 0.02], tone, at: [x, y, 0.5] })),
    ],
  },
  // The gift shop (#362). A counter of wood with a darker top, the Mini Shop's cash register on it and a
  // card reader beside it, and a pad of receipts. The person from Sales stands behind it, facing the shop.
  till: {
    parts: [
      { box: [1.9, 0.75, 0.4], tone: 'wood', at: [1, 0, 0.7] },
      { box: [1.96, 0.04, 0.46], tone: 'woodDark', at: [1, 0.75, 0.7] },
      { box: [1.7, 0.2, 0.02], tone: 'lamp', at: [1, 0.3, 0.91] },
      { model: 'cashRegister', size: 0.5, at: [0.6, 0.79, 0.7], turn: 2 },
      { box: [0.18, 0.04, 0.12], tone: 'metalDark', at: [1.3, 0.79, 0.75] },
      { box: [0.22, 0.02, 0.16], tone: 'white', at: [1.65, 0.79, 0.65] },
    ],
    spots: [{ at: [1, 0.3], turn: 2, activity: 'work' }],
  },
  // A stack of baskets by the door: three of the shop's baskets one on another, and two beside them.
  shoppingBasket: {
    parts: [
      { box: [0.7, 0.04, 0.5], tone: 'metalDark', at: [0.5, 0, 0.5] },
      ...[0, 1, 2].map((i): Part => ({ model: 'shoppingBasket', size: 1.1, at: [0.5, 0.04 + i * 0.12, 0.5] })),
    ],
  },
  // Two of the Mini Shop's clothing rails side by side.
  clothingRack: {
    parts: [
      { model: 'clothingRack', size: 0.9, at: [0.5, 0, 0.5] },
      { model: 'clothingRack', size: 0.9, at: [1.5, 0, 0.5] },
    ],
  },
  // Four of the Mini Shop's tables of folded clothes in a square.
  clothingTable: {
    parts: [0.5, 1.5].flatMap((x) => [0.5, 1.5].map((z): Part => ({ model: 'clothingTable', size: 0.85, at: [x, 0, z] }))),
  },
  shelfBags: {
    parts: [
      { model: 'shelfBags', size: 0.95, at: [0.5, 0, 0.5] },
      { model: 'shelfBags', size: 0.95, at: [1.5, 0, 0.5] },
    ],
  },
  displayCans: {
    parts: [{ model: 'displayCans', size: 0.85, at: [0.5, 0, 0.5] }],
  },
  displayFlowers: {
    parts: [{ model: 'displayFlowers', size: 0.5, at: [0.5, 0, 0.52] }],
  },
  // On the kit's small display (Mike's wish): one at either end, between them a wooden shelf of three
  // rows, with cassettes (white and glass), VHS tapes (dark) and DVD cases (coloured) standing on their edges.
  tapeShelf: {
    parts: [
      ...[0.18, 1.82].map((x): Part => ({ model: 'displaySmall', size: 1, at: [x, 0, 0.5] })),
      { box: [1.2, 1.1, 0.06], tone: 'woodDark', at: [1, 0, 0.18] },
      ...[0, 1, 2].map((row): Part => ({ box: [1.2, 0.04, 0.4], tone: 'wood', at: [1, 0.1 + row * 0.35, 0.36] })),
      ...[0, 1, 2].flatMap((row) => Array.from({ length: 9 }, (_, i): Part => {
        const tone = (row === 0
          ? (['white', 'glass', 'white', 'metalMid', 'glass', 'white', 'lamp', 'glass', 'white'] as const)
          : row === 1
            ? (['metalDark', 'fabricDark', 'metalDark', 'metalDark', 'accent', 'metalDark', 'fabricDark', 'metalDark', 'metalDark'] as const)
            : (['fabric', 'lamp', 'glass', 'plant', 'accent', 'fabric', 'white', 'lamp', 'glass'] as const))[i]!;
        const height = row === 0 ? 0.2 : row === 1 ? 0.26 : 0.3;
        return { box: [0.1, height, row === 0 ? 0.12 : 0.2], tone, at: [0.51 + i * 0.12, 0.14 + row * 0.35, 0.37] };
      })),
    ],
  },
  // The storage room (#362). Five cardboard boxes on a pallet: three below, two on top, in two tones of
  // cardboard (wood and its darker one) with a strip of tape on each.
  boxStack: {
    parts: [
      { box: [1.9, 0.08, 0.9], tone: 'woodDark', at: [1, 0, 0.5] },
      ...[0.2, 0.55, 0.9, 1.25, 1.6].map((x): Part => ({ box: [0.3, 0.04, 0.84], tone: 'wood', at: [x, 0.08, 0.5] })),
      ...[0.4, 1, 1.6].map((x, i): Part => ({ box: [0.55, 0.42, 0.7], tone: i === 1 ? 'wood' : 'woodDark', at: [x, 0.12, 0.5] })),
      ...[0.7, 1.3].map((x, i): Part => ({ box: [0.55, 0.36, 0.6], tone: i === 0 ? 'wood' : 'woodDark', at: [x, 0.54, 0.5] })),
      ...[0.4, 1, 1.6].map((x): Part => ({ box: [0.1, 0.01, 0.7], tone: 'white', at: [x, 0.54, 0.5] })),
      ...[0.7, 1.3].map((x): Part => ({ box: [0.1, 0.01, 0.6], tone: 'white', at: [x, 0.9, 0.5] })),
    ],
  },
  // A hand truck of the Mini Shop's with a box on it, in the back of its tile; the person packing the
  // orders stands in front of it.
  handTruck: {
    parts: [
      { model: 'handTruck', size: 0.8, at: [0.5, 0, 0.3] },
      { box: [0.4, 0.3, 0.3], tone: 'wood', at: [0.5, 0.2, 0.28] },
    ],
    spots: [{ at: [0.5, 0.8], turn: 0, activity: 'work' }],
  },
};

/** The look of pieces added with `registerFurnitureAsset`. */
const ADDED_ASSETS: Map<FurnitureType, FurnitureAsset> = new Map();

/** The look of a piece, whether it ships with the game or was added. Throws for an id nobody registered. */
export function furnitureAsset(type: FurnitureType): FurnitureAsset {
  const asset = (FURNITURE_ASSETS as Partial<Record<string, FurnitureAsset>>)[type] ?? ADDED_ASSETS.get(type);
  if (!asset) throw new Error(`No look for furniture: ${type}`);
  return asset;
}

/** Gives a piece added with `registerFurniture` (config/office.ts) its look. */
export const registerFurnitureAsset = (type: `mod:${string}`, asset: FurnitureAsset) => void ADDED_ASSETS.set(type, asset);

/** Takes an added look away again (for tests). */
export const unregisterFurnitureAsset = (type: `mod:${string}`) => ADDED_ASSETS.delete(type);

// --- The town around the office ---

/** A piece of the Nature Kit: its file and its size in the kit's own units (the middle of its foot is on its origin). */
export interface NaturePiece {
  file: string;
  w: number;
  height: number;
  d: number;
}

/**
 * The hills of Amplify Hills. Foothills are the kit's green slopes and cliffs,
 * drawn several times their size and overlapped; the range behind the town is
 * built from shapes (see `rangeOf`), as the kit has nothing taller than a block.
 */
export const NATURE = {
  foothills: [
    { file: 'nature/cliff_blockSlope_stone.glb', w: 1.2, height: 1, d: 1 },
    { file: 'nature/cliff_blockSlopeHalfWalls_stone.glb', w: 1, height: 0.5, d: 1 },
    { file: 'nature/rock_largeD.glb', w: 1.07, height: 0.57, d: 1.03 },
  ] as readonly NaturePiece[],
  /** The base of every piece lies a little below its origin, in the kit's units. */
  sink: 0.05,
  /** Which tone replaces each material of the kit's models. */
  tones: { grass: 'grass', stone: 'rock', dirt: 'rock' } as Record<string, Tone>,
};

/** A building of the town: its file and its size in the kit's own units. */
export interface CityBuilding {
  file: string;
  w: number;
  height: number;
  d: number;
  /** How far the middle of the model is from its own origin, in the kit's units, where it is not on it. */
  cx?: number;
  cz?: number;
  /** How many times the map's scale the model is drawn, for the kits that are not built to the City Kit's scale (Mini Forest, Watercraft). `w`, `height` and `d` already have it. */
  size?: number;
  /** The model floats: it stands on water, at the water's level, and only on water. */
  floats?: boolean;
  /** How far the model's foot is below its own origin, in the kit's units, where it is not on it (a model drawn about its middle). */
  foot?: number;
}

const building =(name: string, w: number, height: number, d: number): CityBuilding => ({ file: `city/building-${name}.glb`, w, height, d });

/**
 * The town the office stands in. Floor 1 is the ground floor: it stands on a
 * low plinth at street level. Every floor up is `perFloor` tiles higher, on
 * top of the floors below. Town blocks are `block` tiles wide and deep, with a
 * street between them.
 */
export const CITY = {
  /** The kit's buildings are drawn this many times their size. */
  scale: 6,
  /** Height of the plinth: how far the street is below floor 1. */
  streetBelow: 0.4,
  perFloor: 3,
  block: { w: 8, d: 7.5 },
  streetWidth: 2,
  /** Small buildings: the only ones that may stand in front of the office, and only where they don't hide it. */
  low: [
    building('a', 0.88, 1.29, 0.94), building('b', 0.97, 1.29, 0.94), building('c', 0.88, 0.89, 1.09), building('d', 0.84, 1.29, 0.9),
    building('e', 1.64, 0.89, 1.01), building('h', 0.88, 1.29, 1.01), building('k', 2.08, 1.47, 0.94),
  ],
  /** Only behind the office, where they make the skyline. */
  tall: [
    building('f', 0.84, 1.69, 1.03), building('g', 0.97, 1.69, 0.92), building('i', 1.24, 1.68, 1.3), building('l', 1.37, 2.27, 1.4),
    building('m', 1.24, 3.15, 1.24), building('skyscraper-a', 1.36, 2.88, 1.36), building('skyscraper-b', 1.36, 4.48, 1.36),
    building('skyscraper-c', 1.28, 4.08, 1.39), building('skyscraper-d', 1.28, 5.47, 1.39), building('skyscraper-e', 1.29, 4.08, 1.24),
  ],
  /** The kit's street furniture, used on the office's own pavement and shop front. */
  awning: 'city/detail-awning-wide.glb',
  parasols: ['city/detail-parasol-a.glb', 'city/detail-parasol-b.glb'],
  /**
   * The elevated railway over the second street in front of the office. A
   * train passes every `every` seconds of game time.
   */
  railway: {
    /** One piece of track, `trackLength` of the kit's units long. */
    track: 'train/railroad-straight.glb',
    trackLength: 4,
    /** The track model lies this far below its own origin, in the kit's units. */
    trackDrop: 1,
    scale: 3,
    /** Height of the deck above the street, in tiles. */
    height: 3,
    every: 32,
    /** Tiles per second. */
    speed: 10,
    /**
     * Length of each piece of rolling stock in the kit's units, couplings included (0.21.0, #287). A train is the pieces its map names (src/config/maps),
     * one after the other. The pieces measure 2.4 (the diesel), 2.5 (the double-decker) and 2.7 (the wagons) long; every one is spaced as 2.75, the
     * smallest gap in use being 0.05 more than the longest, so the trains are as they were. A piece added to the kit gets its length measured + 0.05.
     */
    cars: {
      'train/train-diesel-a.glb': 2.75,
      'train/train-electric-double-a.glb': 2.75,
      'train/train-electric-double-b.glb': 2.75,
      'train/train-electric-double-c.glb': 2.75,
      'train/train-carriage-coal.glb': 2.75,
      'train/train-carriage-container-blue.glb': 2.75,
      'train/train-carriage-container-red.glb': 2.75,
      'train/train-carriage-lumber.glb': 2.75,
      'train/train-carriage-tank.glb': 2.75,
    } as Readonly<Record<string, number>>,
  },
  /** What drives in the streets (traffic.ts): length and width in tiles, and the slowest and fastest top speed in tiles per second. */
  vehicles: {
    car: { length: 3, width: 1.6, speed: [4.8, 7.8] },
    taxi: { length: 3, width: 1.6, speed: [5.6, 7.8] },
    van: { length: 3.8, width: 1.72, speed: [4.4, 6.4] },
    truck: { length: 5.4, width: 1.8, speed: [3.8, 5.2] },
    bus: { length: 6.4, width: 1.84, speed: [6, 6] },
  },
  traffic: {
    /** Body colors of cars, vans and trucks. Yellow is kept for the taxis. */
    tones: ['fabric', 'white', 'accent', 'plant', 'metalMid'] as readonly Tone[],
    /** The least a vehicle stands at a stop, in seconds. */
    shortestStop: 1,
    /** A vehicle that is due somewhere drives between this share and this multiple of its own speed to be on time. */
    dawdle: 0.6,
    hurry: 1.45,
  },
} as const;

/**
 * Kenney's Car Kit, CC0, in public/models/cars: the vehicles in the streets (scene/vehicleModels.ts), measured in the kit's own units.
 * A model stands on y = 0 with its front towards +z and its wheels in it, and is painted from one colour map of 16 swatches across and 4 down,
 * each 32 by 128 pixels. A swatch tells what a face is, so a model is cut into parts by it and each part gets the town's own colour: the
 * `body` swatches take the colour of the vehicle, the `glass` ones the glass of the palette, the `metal` ones its metal, and the rest (tyres,
 * hubs, bumpers, lamps) is dark. The kit has no bus. The taxi is the sedan in yellow with a sign on its roof, as the kit's own taxi is
 * not as long as ours.
 *
 * The sizes in `CITY.vehicles` are the sizes they are drawn at: length and width exactly, and the height by the mean of those two scales.
 * The truck is the kit's delivery truck, the cab with a box behind it, because its pickup is not 5.4 tiles long.
 */
export const CARS = {
  across: 16,
  down: 4,
  models: {
    sedan: { file: 'cars/sedan.glb', length: 2.55, width: 1.5, height: 1.3, body: [[13, 1]], glass: [[7, 2]], metal: [] },
    suv: { file: 'cars/suv.glb', length: 2.7, width: 1.5, height: 1.3, body: [[7, 1]], glass: [[7, 2]], metal: [] },
    hatchback: { file: 'cars/hatchback-sports.glb', length: 2.85, width: 1.3, height: 1.1, body: [[7, 1]], glass: [[7, 2]], metal: [] },
    van: { file: 'cars/van.glb', length: 2.75, width: 1.5, height: 1.35, body: [[15, 1]], glass: [[7, 2]], metal: [] },
    truck: { file: 'cars/delivery.glb', length: 3.25, width: 1.5, height: 1.65, body: [[7, 1]], glass: [[7, 2]], metal: [[13, 2]] },
  },
  /** The cars of the traffic, by the colour of the car: each colour is always the same model, so a car does not change as it drives out of the lot. */
  cars: ['sedan', 'suv', 'hatchback'],
} as const;

/**
 * Kenney's Building Kit, CC0, in public/models/building: the pieces the outside of the office is made of (buildingPieces.ts, scene/BuildingKit.tsx).
 * Measured in the kit's own units: every piece stands on y = 0, its middle on its origin, and runs along z. A wall is 2.4 high; the window and
 * the doorway are 0.2 thick, the plain wall 0.1. We draw a wall 3 tiles high (a floor), so a piece is stretched to 1.25 times its height; one
 * module is 2 tiles, as the windows of the old boxes were.
 */
export const BUILDING_KIT = {
  /** `length` is how far a piece runs along the wall, in tiles. */
  pieces: {
    wall: { file: 'building/wall.glb', length: 2 },
    half: { file: 'building/wall-half.glb', length: 1 },
    window: { file: 'building/wall-window-square.glb', length: 2 },
    door: { file: 'building/wall-doorway-square.glb', length: 2 },
    post: { file: 'building/column.glb', length: 0.5 },
  },
  /** How high a piece is. */
  height: 2.4,
  /**
   * The colour map has 16 swatches across and as many down. The faces of a wall are cut by the column of their swatch: 5 and 11 are the
   * paint of the frame and the reveals of a window or doorway, which we colour as `trim`; the rest is the wall (`facade`). Glass is a
   * material of its own.
   */
  swatches: { across: 16, down: 16, trim: [5, 11] },
} as const;

/**
 * Kenney's City Kit (Roads), CC0, in public/models/roads: the pieces the streets of the town are laid with (roadPieces.ts, scene/Roads.tsx),
 * measured in the kit's own units (a tile of the kit is 1 by 1, lying on y = 0 with its middle on its origin). Of the kit we keep the
 * pieces we draw; the rest (slopes, barriers, roundabouts, signs, poles) can come when a part needs them.
 *
 * A tile is a road with a kerb along both sides: the paving 0.1 wide, and inside it the asphalt 0.8 across, shoulders and its two lanes
 * of 0.4 each, with a double line down the middle. A lane of the game is 2 tiles, so a piece is drawn 5 times its size: the asphalt is then the
 * 4 tiles a street is driven, and the kerb lies 0.5 tile beyond each side of it, where the slab of a block covers it.
 */
export const ROADS = {
  /** The pieces: a straight (its road along x), a crossroad, a T (open to the west, east and south), a corner (open to the west and south) and a dead end (open to the east). */
  pieces: {
    straight: 'roads/road-straight.glb',
    cross: 'roads/road-crossroad.glb',
    tee: 'roads/road-intersection.glb',
    bend: 'roads/road-bend-square.glb',
    end: 'roads/road-end.glb',
  },
  /** The asphalt across a piece and the paving beside it, as shares of its tile. */
  asphalt: 0.8,
  kerb: 0.1,
  /** Heights above the foot of a piece: the asphalt, and the kerb. Pieces are flattened to `flat` of that, so that vehicles stand on them as on the ground. */
  top: 0.01,
  kerbTop: 0.02,
  flat: 0.5,
  /**
   * The bridge (road-bridge.glb) has a deck 0.52 high: above the vehicles, which drive on the ground and have no height. It is not used: the roads
   * over water are laid with the same flat pieces as the others, as they were flat planes before.
   */
  bridgeDeck: 0.52,
  /** The street lamp: a pole 0.675 high whose arm reaches 0.2 out towards -z; it is drawn as high as `LAMP_HEIGHT` (city.ts). */
  lamp: { file: 'roads/light-curved.glb', height: 0.675, arm: 0.2 },
  /**
   * The traffic light: 0.515 high, its head of three lamps from 0.365 up, facing -x and 0.073 out in front of the pole. The lamps that
   * are lit are ours, because they change.
   */
  light: { file: 'roads/traffic-light.glb', height: 0.515, out: 0.073, lamps: { red: 0.485, amber: 0.44, green: 0.395 } },
} as const;
