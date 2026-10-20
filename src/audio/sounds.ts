// The game's sounds: which clip plays for what. The clips are Kenney's UI
// Audio, Impact Sounds and Music Jingles packs (CC0, kenney.nl), in public/sounds. To try
// another clip, copy it there and change its name here.

import type { FurnitureType } from '../config/office';

export interface Sound {
  /** Files under public/sounds. With several, one is picked at random, so a sound that repeats does not sound stamped. */
  files: readonly string[];
  /** Loudness against the other sounds, 0–1; the player's sound volume comes on top. */
  gain: number;
}

/** The five takes of an impact clip. */
const takes = (name: string) => [0, 1, 2, 3, 4].map((i) => `impact/${name}_00${i}.ogg`);

export const SOUNDS = {
  // --- The interface (UI Audio) ---
  /** Any ordinary button. */
  click: { files: ['ui/click1.ogg'], gain: 0.5 },
  /** The button that does the main thing: start, save, hire, buy. */
  confirm: { files: ['ui/click5.ogg'], gain: 0.5 },
  /** Tabs and other choices of one out of several. */
  tab: { files: ['ui/switch14.ogg'], gain: 0.45 },
  /** A checkbox, or a window folding up. */
  toggle: { files: ['ui/switch13.ogg'], gain: 0.45 },
  /** A choice from a list, or a slider let go. */
  select: { files: ['ui/rollover2.ogg'], gain: 0.5 },
  /** A window opens or comes to the front. */
  open: { files: ['ui/switch26.ogg'], gain: 0.4 },
  /** A window or a panel closes. */
  close: { files: ['ui/switch24.ogg'], gain: 0.4 },
  /** Something the player tried did not work. */
  denied: { files: ['ui/rollover6.ogg'], gain: 0.55 },

  // --- Furniture (Impact Sounds) ---
  woodMedium: { files: takes('impactWood_medium'), gain: 0.8 },
  woodHeavy: { files: takes('impactWood_heavy'), gain: 0.9 },
  metalLight: { files: takes('impactMetal_light'), gain: 0.55 },
  metalMedium: { files: takes('impactMetal_medium'), gain: 0.7 },
  metalHeavy: { files: takes('impactMetal_heavy'), gain: 0.75 },
  /** A piece is turned where it stands. */
  turn: { files: takes('impactGeneric_light'), gain: 0.6 },
  /** A piece is sold and carried off. */
  sell: { files: takes('impactPlank_medium'), gain: 0.6 },

  // --- What happens in the game (Music Jingles, the pizzicato set) ---
  // The pack has the same seventeen tunes for sax, steel drum, 8-bit and orchestra hit: the number is the tune.
  /** A milestone: a run of six notes upwards. */
  milestone: { files: ['jingles/jingles_PIZZI02.ogg'], gain: 0.45 },
  /** Something went the player's way: four notes up a major scale. */
  win: { files: ['jingles/jingles_PIZZI10.ogg'], gain: 0.4 },
  /** News from the country: two notes, a fifth up. */
  event: { files: ['jingles/jingles_PIZZI16.ogg'], gain: 0.4 },
  /** Something went wrong: two notes a semitone apart, three times. */
  trouble: { files: ['jingles/jingles_PIZZI03.ogg'], gain: 0.4 },
  /** Bankrupt: four slow notes down. */
  bankrupt: { files: ['jingles/jingles_PIZZI07.ogg'], gain: 0.5 },
  /** A new company opens its doors. */
  start: { files: ['jingles/jingles_PIZZI15.ogg'], gain: 0.4 },
} satisfies Record<string, Sound>;

export type SoundId = keyof typeof SOUNDS;

/** What a piece of furniture sounds like when it is put down: by what it is made of and how heavy it is. */
export const PLACE_SOUND: Record<FurnitureType, SoundId> = {
  workstation: 'woodMedium',
  managerDesk: 'woodMedium',
  ceoDesk: 'woodHeavy',
  mixingDesk: 'metalMedium',
  microphone: 'metalLight',
  onAirLight: 'metalLight',
  talkTable: 'woodMedium',
  camera: 'metalHeavy',
  studioLights: 'metalMedium',
  set: 'woodHeavy',
  newsDesk: 'woodHeavy',
  controlDesk: 'metalMedium',
  shelving: 'woodMedium',
  canteenTable: 'woodMedium',
  coffeeMachine: 'metalLight',
  planter: 'woodMedium',
  tvScreen: 'metalLight',
  radio: 'metalLight',
  couch: 'woodMedium',
  fridge: 'metalHeavy',
  counter: 'woodMedium',
  soapSet: 'woodHeavy',
  gameShowSet: 'woodHeavy',
  sitcomSet: 'woodHeavy',
  kidsSet: 'woodHeavy',
  realitySet: 'woodHeavy',
  confessionBooth: 'woodHeavy',
  writingDesk: 'woodMedium',
  storyBoard: 'woodMedium',
  editingDesk: 'metalMedium',
  audioDesk: 'metalMedium',
  schedulingDesk: 'woodMedium',
  stove: 'metalHeavy',
  meetingTable: 'woodHeavy',
  sortingCase: 'woodMedium',
  trainerDesk: 'woodMedium',
  trainingSeat: 'woodMedium',
  whiteboard: 'metalLight',
  makeupTable: 'woodMedium',
  clothesRail: 'metalLight',
  audienceSeating: 'woodHeavy',
  serverRack: 'metalHeavy',
  sink: 'metalLight',
  toilet: 'metalMedium',
  receptionDesk: 'woodHeavy',
  audioMixer: 'metalMedium',
  mcrDesk: 'metalHeavy',
  monitorWall: 'metalHeavy',
  recordingBooth: 'woodHeavy',
  recordShelves: 'woodMedium',
  flipChart: 'woodMedium',
  calendar: 'woodMedium',
  salesChart: 'woodMedium',
  printer: 'metalHeavy',
  filingCabinet: 'metalMedium',
  bin: 'metalLight',
  dresser: 'woodHeavy',
  dishwasher: 'metalHeavy',
  aquarium: 'woodHeavy',
};

/** What the sound picker needs to know about the control that was used. */
export interface Control {
  /** Lower case: button, input, select, a, path… */
  tag: string;
  /** The `type` of an input. */
  type?: string;
  role?: string;
  classes: readonly string[];
  /** Its accessible name, if it has one. */
  label?: string;
  /** Whether it sits in the menu beside the office. */
  inDock?: boolean;
}

/** The sound for clicking a control, or null for one that stays quiet. */
export function clickSound(control: Control): SoundId | null {
  const { tag, type, role, classes, label } = control;
  const has = (name: string) => classes.includes(name);
  if (tag === 'input') return type === 'checkbox' || type === 'radio' ? 'toggle' : null;
  // Lists and sliders sound when their value changes, not when they are clicked.
  if (tag === 'select' || tag === 'option') return null;
  if (label === 'Close' || label === 'Hide') return 'close';
  if (label === 'Minimize' || label === 'Maximize') return 'toggle';
  if (control.inDock || has('settings-button')) return 'open';
  if (role === 'tab' || role === 'radio' || has('tab') || has('catalog-entry') || has('map-region')) return 'tab';
  if (has('primary')) return 'confirm';
  return 'click';
}
