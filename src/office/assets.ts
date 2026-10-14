// The asset registry of the 3D office (prompt.md section 13). Everything the
// office view draws is named here: which model file each thing uses, how its
// materials are tinted, and which parts make up a piece of furniture. Swapping
// a model, or replacing a part built from simple shapes by a real model, is a
// change in this file only.
//
// Models: Kenney's Furniture Kit, Mini Characters, City Kit (Commercial) and Train Kit, all CC0, in public/models.

import type { FurnitureType } from '../config/office';

/** Every color in the 3D view is one of these, read from the theme tokens (`--o3-*` in styles.css). */
export type Tone =
  | 'wood' | 'woodDark' | 'fabric' | 'fabricDark' | 'white' | 'plant'
  | 'metal' | 'metalMid' | 'metalDark' | 'lamp' | 'onAir' | 'accent'
  | 'street' | 'pavement' | 'facade' | 'trim' | 'glass'
  // The land around the towns that are not all town.
  | 'grass' | 'sand' | 'water' | 'field';

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
  | 'radio' | 'fridge' | 'counter' | 'sink' | 'mirror' | 'toilet';

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
};

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

/** First names (config/names.ts) that get one of the female characters; all others get a male one. */
const FEMALE_NAMES = new Set([
  'Ada', 'Carla', 'Elena', 'Greta', 'Iris', 'Kira', 'Mila', 'Olga', 'Rosa', 'Tess',
  'Vera', 'Yara', 'Anouk', 'Cleo', 'Eva', 'Gwen', 'Inge', 'Lotte', 'Nina', 'Petra',
]);

/**
 * The character of the person with this name. It goes by name, not by id, so a
 * host looks the same at a rival, in the hiring pool and on your own staff.
 */
export function characterFor(name: string): string {
  const pool = FEMALE_NAMES.has(name.split(' ')[0] ?? '') ? CHARACTERS.female : CHARACTERS.male;
  let hash = 0;
  for (const c of name) hash = (Math.imul(hash, 31) + c.charCodeAt(0)) >>> 0;
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
  /** Only at these equipment tiers (inclusive). */
  tiers?: [from: number, to: number];
} & (
  | { model: ModelId; /** Other tones for the model's materials, by the kit's material name. */ tones?: Record<string, Tone>; /** Size against the kit's own, 1 if left out. */ size?: number }
  | { box: [width: number, height: number, depth: number]; tone: Tone; tilt?: number; roll?: number }
  | { cylinder: [radius: number, height: number, topRadius?: number]; tone: Tone; tilt?: number; roll?: number }
  // Several parts that lean together about one point, like a lamp in its yoke: `at` is that point and the parts are placed from it.
  | { parts: Part[]; tilt?: number; roll?: number }
);

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

const DESK_TOP = 0.77;
/** Height of the round table's top. */
const TABLE_TOP = 0.74;

export const FURNITURE_ASSETS: Record<FurnitureType, FurnitureAsset> = {
  workstation: {
    // The desk is at the front, so the person behind it faces the viewer.
    parts: [
      { model: 'desk', at: [1, 0, 1.45], turn: 2 },
      { model: 'deskChair', at: [1, 0, 0.65] },
      // A typewriter until computers arrive, then a screen and keyboard, then a laptop.
      { box: [0.5, 0.14, 0.34], tone: 'metalDark', at: [1, DESK_TOP, 1.4], tiers: [1, 2] },
      { box: [0.4, 0.2, 0.03], tone: 'white', at: [1, DESK_TOP + 0.14, 1.52], tiers: [1, 2] },
      { model: 'screen', at: [1, DESK_TOP, 1.6], turn: 2, tiers: [3, 3] },
      { model: 'keyboard', at: [1, DESK_TOP, 1.28], turn: 2, tiers: [3, 3] },
      { model: 'laptop', at: [1, DESK_TOP, 1.45], turn: 2, tiers: [4, 9] },
    ],
    // On the seat, which is in front of the middle of the chair with its tall back.
    spots: [{ at: [1, 0.82], turn: 2, activity: 'sit' }],
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
      { box: [0.22, 0.09, 0.16], tone: 'metalDark', at: [1.55, 0.78, 1.4] },
      { cylinder: [0.09, 0.03], tone: 'metalDark', at: [0.4, 0.78, 1.5] },
      { cylinder: [0.02, 0.3], tone: 'metalDark', at: [0.4, 0.81, 1.5] },
      { cylinder: [0.13, 0.12, 0.07], tone: 'lamp', at: [0.4, 1.1, 1.5] },
    ],
    spots: [{ at: [1, 0.78], turn: 2, activity: 'sit' }],
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
      // The blotter and the papers on it.
      { box: [0.7, 0.015, 0.44], tone: 'fabricDark', at: [1.5, 0.79, 0.98] },
      { box: [0.3, 0.02, 0.36], tone: 'white', at: [1.42, 0.805, 0.98] },
      // A telephone, and a lamp with a shade.
      { box: [0.24, 0.09, 0.17], tone: 'metalDark', at: [2.3, 0.79, 1.02] },
      { cylinder: [0.1, 0.03], tone: 'metalDark', at: [0.62, 0.79, 1.12] },
      { cylinder: [0.02, 0.32], tone: 'metalDark', at: [0.62, 0.82, 1.12] },
      { cylinder: [0.15, 0.13, 0.08], tone: 'lamp', at: [0.62, 1.14, 1.12] },
      // The visitors' chairs, with their backs to the room.
      ...[0.95, 2.05].map((x): Part => ({ model: 'chair', tones: { wood: 'fabric' }, at: [x, 0, 1.78], turn: 2 })),
    ],
    spots: [{ at: [1.5, 0.6], turn: 2, activity: 'sit' }],
  },
  // The mixing desk has a look for every tier, after the designer's photos of radio studios.
  // Tier 1: a console with a sloping panel between two turntables, a microphone on a boom and a
  // tape recorder at the far edge. Tier 2: a wide grey desk with three microphones on booms, two
  // small monitors and room for two guests. Tier 3: a wooden console with a big mixing board and
  // two monitors on a shelf. Tier 4: a white desk with a row of flat screens and a green glow.
  // The presenter sits behind it on a chair, facing the viewer; guests sit across from them.
  mixingDesk: {
    parts: [
      { model: 'chair', tones: { wood: 'fabric' }, at: [1, 0, 0.14], tiers: [1, 3] },
      { model: 'deskChair', at: [1, 0, 0.14], tiers: [4, 9] },
      // The guests' chairs, on the other side of the desk.
      ...[0.5, 1.5].map((x): Part => ({ model: 'chair', tones: { wood: 'fabric' }, at: [x, 0, 1.36], turn: 2, tiers: [2, 3] })),
      ...[0.5, 1.5].map((x): Part => ({ model: 'deskChair', at: [x, 0, 1.36], turn: 2, tiers: [4, 9] })),
      // --- Tier 1 ---
      { at: [0, 0, 0], tiers: [1, 1], parts: [
        { box: [1.9, 0.62, 0.6], tone: 'metalDark', at: [1, 0, 0.7] },
        { box: [1.96, 0.06, 0.66], tone: 'wood', at: [1, 0.62, 0.7] },
        // The console: a base and a panel that slopes towards the presenter, with faders and a meter.
        { box: [0.7, 0.12, 0.5], tone: 'metalDark', at: [1, 0.68, 0.65] },
        { box: [0.68, 0.05, 0.52], tone: 'metalMid', tilt: 22, turn: 2, at: [1, 0.86, 0.65] },
        ...[0, 1, 2, 3, 4].map((i): Part => ({ box: [0.05, 0.04, 0.26], tone: 'lamp', tilt: 22, turn: 2, at: [0.76 + i * 0.12, 0.87, 0.57] })),
        { box: [0.26, 0.04, 0.1], tone: 'white', tilt: 22, turn: 2, at: [1, 0.97, 0.81] },
        // Turntables left and right: plinth, platter, record label and arm.
        ...[0.33, 1.67].flatMap((x): Part[] => [
          { box: [0.52, 0.08, 0.5], tone: 'metal', at: [x, 0.68, 0.66] },
          { cylinder: [0.21, 0.035], tone: 'metalDark', at: [x + 0.02, 0.76, 0.64] },
          { cylinder: [0.07, 0.04], tone: 'fabric', at: [x + 0.02, 0.76, 0.64] },
          { box: [0.03, 0.03, 0.3], tone: 'white', turn: 0.15, at: [x - 0.2, 0.8, 0.71] },
        ]),
        // The microphone on its boom, reaching over the console to the presenter.
        { cylinder: [0.02, 0.55], tone: 'metal', at: [1.34, 0.68, 0.92] },
        { box: [0.5, 0.03, 0.03], tone: 'metal', turn: 1.35, at: [1.22, 1.2, 0.7] },
        { cylinder: [0.045, 0.16], tone: 'metalDark', tilt: 90, at: [1.1, 1.12, 0.46] },
        // The tape recorder with its two reels, facing the presenter.
        { box: [0.5, 0.36, 0.1], tone: 'metal', at: [0.82, 0.68, 0.93] },
        { cylinder: [0.09, 0.03], tone: 'metalMid', tilt: 90, at: [0.94, 0.88, 0.86] },
        { cylinder: [0.09, 0.03], tone: 'metalMid', tilt: 90, at: [0.7, 0.88, 0.86] },
      ] },
      // --- Tier 2: the grey desk ---
      { at: [0, 0, 0], tiers: [2, 2], parts: [
        { box: [1.9, 0.62, 0.66], tone: 'metal', at: [1, 0, 0.72] },
        { box: [1.98, 0.06, 0.74], tone: 'metalMid', at: [1, 0.62, 0.72] },
        { box: [1.98, 0.05, 0.04], tone: 'woodDark', at: [1, 0.57, 1.09] },
        // The console with its wooden ends, and the telephone beside it.
        { box: [0.8, 0.1, 0.26], tone: 'white', at: [0.95, 0.68, 0.62] },
        { box: [0.05, 0.12, 0.28], tone: 'woodDark', at: [0.53, 0.68, 0.62] },
        { box: [0.05, 0.12, 0.28], tone: 'woodDark', at: [1.37, 0.68, 0.62] },
        ...[0, 1, 2, 3, 4, 5].map((i): Part => ({ box: [0.04, 0.03, 0.14], tone: i % 2 ? 'fabric' : 'metalDark', at: [0.68 + i * 0.11, 0.78, 0.62] })),
        { box: [0.24, 0.07, 0.2], tone: 'metalDark', at: [1.62, 0.68, 0.66] },
        // Two small monitors, turned to the presenter.
        ...[0.34, 1.0].flatMap((x): Part[] => [
          { box: [0.34, 0.3, 0.3], tone: 'white', at: [x, 0.68, 0.92] },
          { box: [0.26, 0.2, 0.02], tone: 'metalDark', at: [x, 0.73, 0.76] },
        ]),
        // Three microphones on booms: one for the presenter, two for the guests.
        ...([[1, 0.5, -1], [0.5, 1.0, 1], [1.5, 1.0, 1]] as const).flatMap(([x, z, side]): Part[] => [
          { cylinder: [0.025, 0.42], tone: 'metalDark', at: [x + 0.2, 0.68, z] },
          { box: [0.03, 0.03, 0.34], tone: 'metalDark', tilt: side * -18, at: [x + 0.2, 1.1, z + side * 0.14] },
          { cylinder: [0.04, 0.2], tone: 'white', tilt: 90, at: [x + 0.2, 1.0, z + side * 0.34] },
        ]),
      ] },
      // --- Tier 3: the wooden console ---
      { at: [0, 0, 0], tiers: [3, 3], parts: [
        { box: [1.9, 0.62, 0.66], tone: 'woodDark', at: [1, 0, 0.72] },
        { box: [1.98, 0.05, 0.74], tone: 'wood', at: [1, 0.62, 0.72] },
        // The mixing board slopes towards the presenter: channels of knobs and faders in colors.
        { box: [1.6, 0.06, 0.46], tone: 'metalDark', tilt: 14, turn: 2, at: [1, 0.72, 0.62] },
        ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((i): Part[] => [
          { box: [0.05, 0.04, 0.14], tone: (['fabric', 'white', 'glass', 'lamp'] as const)[i % 4]!, tilt: 14, turn: 2, at: [0.32 + i * 0.15, 0.75, 0.5] },
          { box: [0.04, 0.04, 0.05], tone: (['lamp', 'fabric', 'white', 'glass'] as const)[i % 4]!, tilt: 14, turn: 2, at: [0.32 + i * 0.15, 0.81, 0.74] },
        ]),
        // The shelf behind it with two monitors and the meters.
        { box: [1.9, 0.26, 0.2], tone: 'woodDark', at: [1, 0.67, 0.98] },
        { box: [0.5, 0.1, 0.02], tone: 'white', at: [1, 0.75, 0.87] },
        ...[0.55, 1.45].flatMap((x): Part[] => [
          { box: [0.5, 0.42, 0.24], tone: 'white', at: [x, 0.93, 0.98] },
          { box: [0.4, 0.3, 0.02], tone: 'glass', at: [x, 0.99, 0.85] },
        ]),
        // The presenter's microphone on a long boom, and the guests' two.
        { cylinder: [0.025, 0.5], tone: 'metalDark', at: [1.8, 0.67, 0.6] },
        { box: [0.03, 0.03, 0.7], tone: 'metalDark', turn: 1.25, at: [1.48, 1.17, 0.5] },
        { cylinder: [0.05, 0.2], tone: 'metalDark', tilt: 90, at: [1.14, 1.08, 0.42] },
        ...[0.5, 1.5].flatMap((x): Part[] => [
          { cylinder: [0.02, 0.3], tone: 'metalDark', at: [x, 0.93, 1.02] },
          { cylinder: [0.04, 0.16], tone: 'metalDark', tilt: 90, at: [x, 1.2, 1.1] },
        ]),
      ] },
      // --- Tier 4: the white desk ---
      { at: [0, 0, 0], tiers: [4, 9], parts: [
        { box: [1.98, 0.05, 0.84], tone: 'plant', at: [1, 0, 0.72] },
        { box: [1.5, 0.6, 0.4], tone: 'white', at: [1, 0.05, 0.72] },
        { box: [1.98, 0.08, 0.78], tone: 'white', at: [1, 0.65, 0.72] },
        { box: [1.98, 0.03, 0.04], tone: 'plant', at: [1, 0.62, 1.1] },
        // A row of flat screens along the far edge, a small mixer and a laptop.
        ...[0.35, 0.78, 1.22, 1.65].map((x): Part => ({ model: 'screen', size: 0.8, at: [x, 0.73, 0.94], turn: 2 })),
        { box: [0.5, 0.05, 0.26], tone: 'metalDark', tilt: 10, turn: 2, at: [1, 0.75, 0.6] },
        ...[0, 1, 2, 3].map((i): Part => ({ box: [0.04, 0.03, 0.14], tone: 'lamp', tilt: 10, turn: 2, at: [0.84 + i * 0.11, 0.78, 0.6] })),
        { model: 'laptop', size: 0.7, at: [1.6, 0.73, 0.6], turn: 2 },
        // Slim microphones for the presenter and the guests.
        ...([[0.55, 0.48, -1], [0.5, 1.0, 1], [1.5, 1.0, 1]] as const).flatMap(([x, z, side]): Part[] => [
          { cylinder: [0.018, 0.34], tone: 'metalMid', at: [x, 0.73, z] },
          { cylinder: [0.035, 0.16], tone: 'metalDark', tilt: 90, at: [x, 1.04, z + side * 0.08] },
        ]),
      ] },
    ],
    spots: [
      { at: [1, 0.16], turn: 2, activity: 'sit' },
      { at: [0.5, 1.36], turn: 0, activity: 'sit', tiers: [2, 9] },
      { at: [1.5, 1.36], turn: 0, activity: 'sit', tiers: [2, 9] },
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
      // The brick wall, the window and the skyline in it.
      { box: [2.9, 1.76, 0.1], tone: 'fabricDark', at: [1.5, 0.06, 0.08] },
      { box: [0.9, 0.8, 0.04], tone: 'woodDark', at: [0.7, 0.46, 0.15] },
      { cylinder: [0.45, 0.04], tone: 'woodDark', tilt: 90, at: [0.7, 1.24, 0.15] },
      { box: [0.14, 0.5, 0.02], tone: 'metalDark', at: [0.42, 0.46, 0.18] },
      { box: [0.12, 0.8, 0.02], tone: 'metalDark', at: [0.6, 0.46, 0.18] },
      { box: [0.16, 0.36, 0.02], tone: 'metalDark', at: [0.8, 0.46, 0.18] },
      { box: [0.1, 0.62, 0.02], tone: 'metalDark', at: [0.98, 0.46, 0.18] },
      { box: [0.03, 1.2, 0.03], tone: 'metalMid', at: [0.7, 0.46, 0.2] },
      { box: [0.9, 0.03, 0.03], tone: 'metalMid', at: [0.7, 1.0, 0.2] },
      // Curtains, and the sign between them.
      { box: [0.34, 1.76, 0.14], tone: 'accent', at: [1.4, 0.06, 0.16] },
      { box: [0.86, 1.76, 0.14], tone: 'accent', at: [2.5, 0.06, 0.16] },
      { box: [0.44, 0.36, 0.03], tone: 'white', at: [1.84, 0.95, 0.15] },
      { box: [0.3, 0.05, 0.035], tone: 'lamp', at: [1.84, 1.2, 0.15] },
      // The host's desk with its sign and chair.
      { model: 'deskChair', at: [2.3, 0.06, 0.62] },
      { box: [0.9, 0.6, 0.4], tone: 'woodDark', at: [2.3, 0.06, 1.12] },
      { box: [0.96, 0.05, 0.46], tone: 'wood', at: [2.3, 0.66, 1.12] },
      { box: [0.4, 0.26, 0.02], tone: 'white', at: [2.3, 0.24, 1.33] },
      // The guests' corner.
      { model: 'rug', tones: { carpet: 'metalMid', carpetDarker: 'metal' }, size: 0.62, at: [1, 0.06, 1.25] },
      { model: 'sofa', tones: { carpet: 'glass' }, size: 0.8, at: [0.62, 0.06, 0.78] },
      { model: 'armchair', tones: { carpet: 'glass' }, size: 0.8, turn: -0.5, at: [1.52, 0.06, 0.82] },
    ],
    // The host sits at the desk; guests take the sofa.
    spots: [
      { at: [2.3, 0.78], turn: 2, activity: 'sit' },
      { at: [0.42, 0.86], turn: 2, activity: 'sit' },
      { at: [0.82, 0.86], turn: 2, activity: 'sit' },
    ],
  },
  newsDesk: {
    parts: [
      { box: [2.6, 0.72, 0.5], tone: 'wood', at: [1.5, 0, 0.6] },
      { box: [2.7, 0.06, 0.6], tone: 'white', at: [1.5, 0.72, 0.6] },
      { box: [1.2, 0.3, 0.04], tone: 'accent', at: [1.5, 0.25, 0.87] },
    ],
    spots: [
      { at: [1.1, 0.25], turn: 2, activity: 'idle' },
      { at: [1.9, 0.25], turn: 2, activity: 'idle' },
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
      { model: 'books', at: [0.55, 0.62, 0.4] },
      { model: 'books', at: [1.45, 1.02, 0.4] },
    ],
  },
  canteenTable: {
    parts: [
      { model: 'table', at: [1, 0, 1], turn: 1 },
      { model: 'chair', tones: { wood: 'fabric' }, at: [0.3, 0, 0.6], turn: 1 },
      { model: 'chair', tones: { wood: 'fabric' }, at: [0.3, 0, 1.4], turn: 1 },
      { model: 'chair', tones: { wood: 'fabric' }, at: [1.7, 0, 0.6], turn: 3 },
      { model: 'chair', tones: { wood: 'fabric' }, at: [1.7, 0, 1.4], turn: 3 },
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
    parts: [{ model: 'counter', size: 1.1, at: [0.5, 0, 0.35] }],
  },
  // After the designer's picture of a soap opera decor: a coffee house. A brick wall with a grid
  // of pictures and a neon cup, green posts, the bar with its coffee machine on the left, and in
  // the middle the big orange couch behind a low table on a red rug, with an armchair beside it.
  soapSet: {
    parts: [
      { box: [2.94, 0.06, 1.9], tone: 'wood', at: [1.5, 0, 1] },
      { box: [2.9, 1.7, 0.1], tone: 'fabricDark', at: [1.5, 0.06, 0.08] },
      ...[0.12, 2.88].map((x): Part => ({ cylinder: [0.06, 1.7], tone: 'plant', at: [x, 0.06, 0.2] })),
      // The pictures, two rows of four, and the neon cup beside them.
      ...[0, 1].flatMap((row) => [0, 1, 2, 3].map((i): Part => ({
        box: [0.2, 0.2, 0.03],
        tone: (['accent', 'lamp', 'glass', 'plant', 'fabric', 'white', 'accent', 'lamp'] as const)[row * 4 + i]!,
        at: [1.15 + i * 0.26, 0.9 + row * 0.28, 0.14],
      }))),
      { box: [0.3, 0.2, 0.03], tone: 'plant', at: [2.5, 1.2, 0.14] },
      { box: [0.06, 0.22, 0.03], tone: 'lamp', at: [2.5, 1.42, 0.14] },
      { box: [0.6, 0.12, 0.03], tone: 'lamp', at: [1.54, 1.5, 0.14] },
      // The bar, with the coffee machine and a jar on it.
      { box: [0.9, 0.8, 0.4], tone: 'woodDark', at: [0.55, 0.06, 0.42] },
      { box: [0.96, 0.05, 0.46], tone: 'metal', at: [0.55, 0.86, 0.42] },
      { model: 'coffeeMachine', size: 0.8, at: [0.4, 0.91, 0.4] },
      { cylinder: [0.07, 0.2], tone: 'glass', at: [0.82, 0.91, 0.42] },
      // The couch, the low table and the rug.
      { model: 'rug', tones: { carpet: 'fabric', carpetDarker: 'fabricDark' }, size: 0.7, at: [1.6, 0.06, 1.3] },
      { model: 'sofa', tones: { carpet: 'woodDark' }, size: 0.9, at: [1.55, 0.06, 0.92] },
      { box: [0.9, 0.26, 0.4], tone: 'wood', at: [1.55, 0.07, 1.52] },
      { cylinder: [0.06, 0.12], tone: 'white', at: [1.35, 0.33, 1.5] },
      { box: [0.2, 0.05, 0.14], tone: 'plant', at: [1.7, 0.33, 1.52] },
      { model: 'armchair', tones: { carpet: 'metalMid' }, size: 0.8, turn: -0.5, at: [2.56, 0.06, 1.3] },
    ],
    // Two on the couch; a third in the armchair.
    spots: [
      { at: [1.3, 0.98], turn: 2, activity: 'sit', up: 0.06 },
      { at: [1.8, 0.98], turn: 2, activity: 'sit', up: 0.06 },
    ],
  },
  // After the designer's photo of a game show: a shiny floor, a purple wall with the question
  // on a big blue board, a column of light, and a desk for each team with its name and score.
  gameShowSet: {
    parts: [
      { box: [2.94, 0.06, 1.9], tone: 'white', at: [1.5, 0, 1] },
      { box: [2.9, 1.6, 0.1], tone: 'accent', at: [1.5, 0.06, 0.08] },
      { cylinder: [1.05, 0.06], tone: 'metalMid', tilt: 90, at: [1.2, 0.2, 0.14] },
      // The board with the question, and the answers under it.
      { box: [1.5, 0.8, 0.04], tone: 'glass', at: [1.2, 0.5, 0.18] },
      { box: [0.9, 0.14, 0.02], tone: 'fabric', at: [1.2, 1.08, 0.21] },
      ...[0, 1, 2].map((i): Part => ({ box: [0.34, 0.07, 0.02], tone: 'white', at: [0.8 + i * 0.4, 0.66 + (i % 2) * 0.16, 0.21] })),
      // The column of light.
      { box: [0.3, 1.6, 0.3], tone: 'lamp', at: [2.62, 0.06, 0.3] },
      ...[0.5, 1.0, 1.5].map((y): Part => ({ box: [0.32, 0.03, 0.32], tone: 'accent', at: [2.62, y, 0.3] })),
      // A desk for each team, turned towards the middle, with its name and score on the front.
      ...([[0.6, 0.25, 'fabric'], [2.4, -0.25, 'glass']] as const).flatMap(([x, turn, tone]): Part[] => [
        { at: [x, 0.06, 1.32], turn, parts: [
          { box: [0.9, 0.2, 0.36], tone: 'metalDark', at: [0, 0, 0] },
          { box: [0.86, 0.6, 0.3], tone: 'white', at: [0, 0.2, 0] },
          { box: [0.92, 0.04, 0.4], tone: 'metal', at: [0, 0.8, 0] },
          { box: [0.7, 0.16, 0.02], tone, at: [0, 0.56, 0.16] },
          { box: [0.4, 0.14, 0.02], tone: 'lamp', at: [0, 0.36, 0.16] },
        ] },
      ]),
    ],
    // The host in the middle, a player behind each desk.
    spots: [
      { at: [1.5, 0.8], turn: 2, activity: 'idle', up: 0.06 },
      { at: [0.55, 0.95], turn: 2, activity: 'idle', up: 0.06 },
      { at: [2.45, 0.95], turn: 2, activity: 'idle', up: 0.06 },
    ],
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
};

// --- The town around the office ---

/** A building of the town: its file and its size in the kit's own units. */
export interface CityBuilding {
  file: string;
  w: number;
  height: number;
  d: number;
  /** How far the middle of the model is from its own origin, in the kit's units, where it is not on it. */
  cx?: number;
  cz?: number;
}

const building = (name: string, w: number, height: number, d: number): CityBuilding => ({ file: `city/building-${name}.glb`, w, height, d });

/**
 * The town the office stands in. Floor 1 is the ground floor: it stands on a
 * low plinth at street level. Every floor up is `perFloor` tiles higher, on
 * top of the floors below. Town blocks are `block` tiles wide and deep, with a
 * street between them.
 */
export const CITY = {
  /** The kit's buildings are drawn this many times their size. */
  scale: 3,
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
    scale: 1.5,
    /** Height of the deck above the street, in tiles. */
    height: 3,
    every: 32,
    /** Tiles per second. */
    speed: 10,
    /** Length of one carriage in the kit's units, couplings included. */
    carLength: 2.75,
    /** The train, front to rear: the kit's yellow double-decker, which is a Dutch one. */
    train: ['train/train-electric-double-a.glb', 'train/train-electric-double-b.glb', 'train/train-electric-double-b.glb', 'train/train-electric-double-c.glb'],
  },
  /** What drives in the streets (traffic.ts): length and width in tiles, and the slowest and fastest top speed in tiles per second. */
  vehicles: {
    car: { length: 1.5, width: 0.8, speed: [2.4, 3.9] },
    taxi: { length: 1.5, width: 0.8, speed: [2.8, 3.9] },
    van: { length: 1.9, width: 0.86, speed: [2.2, 3.2] },
    truck: { length: 2.7, width: 0.9, speed: [1.9, 2.6] },
    bus: { length: 3.2, width: 0.92, speed: [3, 3] },
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
