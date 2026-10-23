// The sounds of the office: the rooms, the town around it and the train. Which
// of them is heard, and how loud, is worked out by office/soundscape.ts; the
// player (player.ts) plays them. The clips are in public/sounds/office, found
// on freesound.org or made by Mike. Each one has its licence written down here,
// and the credits and design/office-sounds.md (`npm run office-sounds`) come from this table.

/** Where a clip comes from. CC0 needs no name; the others are credited in the Credits. */
export type Source =
  | { license: 'CC0' }
  | { license: 'CC BY 3.0' | 'CC BY 4.0' | 'CC BY-NC 4.0'; title: string; author: string; url: string };

export interface OfficeSound {
  /** Files under public/sounds. With several, one is picked at random for each time the sound is played. */
  files: readonly string[];
  /** A loop plays for as long as it is heard; the others play once when it is time. */
  loop: boolean;
  /** Loudness against the other sounds, 0–1; the player's office volume comes on top. */
  gain: number;
  /** What it should sound like: for the list of sounds needed. */
  about: string;
  /** Where the clips come from. */
  sources: readonly Source[];
}

const CC0: Source = { license: 'CC0' };
const by = (license: 'CC BY 3.0' | 'CC BY 4.0' | 'CC BY-NC 4.0', title: string, author: string, id: number): Source => ({
  license,
  title,
  author,
  url: `https://freesound.org/s/${id}/`,
});

/** The takes of a clip: `name.ogg`, or `name-1.ogg`, `name-2.ogg`… for several. */
const takes = (name: string, count = 1) => (count === 1 ? [`office/${name}.ogg`] : Array.from({ length: count }, (_, i) => `office/${name}-${i + 1}.ogg`));

export const OFFICE_SOUNDS = {
  // --- The workspace ---
  typewriter: { files: takes('typewriter'), loop: true, gain: 0.5, about: 'Manual typewriter, steady typing, 20–40 s.', sources: [CC0] },
  'typewriter-electric': { files: takes('typewriter-electric'), loop: true, gain: 0.5, about: 'Electric typewriter, its hum and typing.', sources: [CC0] },
  'typewriter-bell': { files: takes('typewriter-bell'), loop: false, gain: 0.45, about: 'Carriage-return bell and the lever.', sources: [CC0] },
  keyboard: {
    files: takes('keyboard'),
    loop: true,
    gain: 0.5,
    about: 'Several people typing on computer keyboards.',
    sources: [by('CC BY 3.0', 'Mechanical-Keyboard: Typing', 'M4taiori', 331428)],
  },
  'phone-bell': { files: takes('phone-bell'), loop: false, gain: 0.45, about: 'Old desk phone with a bell, two rings.', sources: [CC0] },
  'phone-electric': { files: takes('phone-electric'), loop: false, gain: 0.4, about: 'Office phone, electronic trill.', sources: [CC0] },
  printer: { files: takes('printer'), loop: false, gain: 0.4, about: 'An office printer printing a page.', sources: [CC0] },

  footsteps: { files: takes('footsteps', 2), loop: false, gain: 0.4, about: 'A few people walking on a hard office floor, 3–5 s.', sources: [CC0] },

  // --- The studio audience ---
  laughter: {
    files: takes('laughter', 4),
    loop: false,
    gain: 0.6,
    about: 'Studio audience laughing, 2–4 s.',
    sources: [CC0, by('CC BY 4.0', 'Moderately Amusing.wav', 'Benboncan', 82386)],
  },
  applause: {
    files: takes('applause', 2),
    loop: false,
    gain: 0.6,
    about: 'Studio audience clapping, 4–6 s.',
    sources: [by('CC BY 4.0', 'small group applause 4.flac', 'tim.kahn', 30037), by('CC BY-NC 4.0', 'audience applause.wav', 'squidge316', 327002)],
  },

  // --- The canteen ---
  stove: { files: takes('stove'), loop: true, gain: 0.5, about: 'Sizzling pan, a pot lid, kitchen noise.', sources: [CC0] },
  cutlery: {
    files: takes('cutlery'),
    loop: true,
    gain: 0.45,
    about: 'Cutlery on plates, a cup put down.',
    sources: [by('CC BY-NC 4.0', 'Dinner table ambience.wav', 'Mr_Alden', 365676)],
  },
  chatter: { files: takes('chatter'), loop: true, gain: 0.45, about: 'A room of people talking softly over lunch, no words you can make out.', sources: [CC0] },
  'coffee-machine': { files: takes('coffee-machine'), loop: false, gain: 0.4, about: 'A coffee machine pouring.', sources: [CC0] },
  dishwasher: { files: takes('dishwasher'), loop: true, gain: 0.3, about: 'A dishwasher running, soft.', sources: [CC0] },

  // --- Repairs and machines ---
  repair: {
    files: takes('repair', 5),
    loop: false,
    gain: 0.5,
    about: 'Wrench, hammer, a short drill.',
    sources: [by('CC BY-NC 4.0', 'Sawing Wooden Plank', 'WillemMennega', 763232)],
  },
  'server-hum': { files: takes('server-hum'), loop: true, gain: 0.3, about: 'Server room fans.', sources: [CC0] },
  lift: {
    files: takes('lift'),
    loop: false,
    gain: 0.4,
    about: 'A lift bell and doors.',
    sources: [by('CC BY 3.0', 'toaster oven or lift/elevator bell', 'azumarill', 564623)],
  },

  // --- The town ---
  city: { files: takes('city'), loop: true, gain: 0.5, about: 'Busy street from a few floors up: traffic, a distant horn.', sources: [CC0] },
  industry: {
    files: takes('industry'),
    loop: true,
    gain: 0.5,
    about: 'Factory district: machinery hum, far-off clanks.',
    sources: [by('CC BY 4.0', 'industrial river noise 1.57 PM 220712_0440', 'klankbeeld', 711211)],
  },
  countryside: {
    files: takes('countryside'),
    loop: true,
    gain: 0.5,
    about: 'Birds, wind in the grass, a far tractor.',
    sources: [by('CC BY-NC 4.0', 'Countryside birds', 'AntonioZozobra', 468974)],
  },
  farm: { files: takes('farm', 3), loop: false, gain: 0.5, about: 'A cow, sheep, a rooster (only in the morning).', sources: [CC0] },
  sea: {
    files: takes('sea'),
    loop: true,
    gain: 0.5,
    about: 'Waves on a beach.',
    sources: [by('CC BY 4.0', 'Loch-Ness-At-night.wav', 'LolitaPerdurabo', 213938)],
  },
  gulls: { files: takes('gulls', 2), loop: false, gain: 0.5, about: 'A few seagulls.', sources: [CC0] },
  train: { files: takes('train'), loop: false, gain: 0.6, about: 'Passenger train passing, about 10 s.', sources: [CC0] },
  'goods-train': {
    files: takes('goods-train'),
    loop: false,
    gain: 0.6,
    about: 'Diesel goods train passing, about 10 s.',
    sources: [by('CC BY-NC 4.0', '13750 cargo train passing loop', 'Robinhood76', 827942)],
  },
} satisfies Record<string, OfficeSound>;

export type OfficeSoundId = keyof typeof OFFICE_SOUNDS;

/** A sound that is heard now: the office says which, how loud and from which side, and the player plays it. */
export interface Playing {
  id: OfficeSoundId;
  /** The same for a loop all through, and for a sound that plays once all through its moment. */
  key: string;
  /** 0–1, before the sound's own loudness and the player's volume. */
  level: number;
  /** -1 (left) to 1 (right) as seen on screen. */
  pan: number;
  loop: boolean;
}

/** The sounds whose licence has to be credited by name. */
export function creditedSources(): { id: OfficeSoundId; source: Extract<Source, { title: string }> }[] {
  return (Object.keys(OFFICE_SOUNDS) as OfficeSoundId[]).flatMap((id) =>
    OFFICE_SOUNDS[id].sources.flatMap((source) => ('title' in source ? [{ id, source }] : [])),
  );
}

/** design/office-sounds.md: the sounds the office needs, with their files and where each comes from. */
export function officeSoundsList(): string {
  const ids = Object.keys(OFFICE_SOUNDS) as OfficeSoundId[];
  const rows = ids.map((id) => {
    const sound: OfficeSound = OFFICE_SOUNDS[id];
    const files = sound.files.map((f) => f.replace('office/', '')).join(', ');
    const licence = sound.sources.map((s) => s.license).join(' + ');
    return `| ${id} | ${sound.loop ? 'loop' : 'once'} | ${sound.about} | ${sound.files.length} | ${files} | ${licence} |`;
  });
  return [
    '# Sounds of the office',
    '',
    'Written by `npm run office-sounds` from `src/audio/officeSounds.ts`; do not edit it by hand.',
    'Save the clips as mono `.ogg` in `public/sounds/office/`, takes as `-1`, `-2`… A sound with no file stays silent.',
    '',
    '| Sound | Kind | What | Takes | Files | Licence |',
    '|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}
