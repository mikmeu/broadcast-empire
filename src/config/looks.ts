// What the player looks like: the character they choose when a game starts,
// who is in the office as the CEO.
//
// The characters come from Kenney's Mini Characters. All of them are painted
// from one small picture of color swatches, so a character is recolored by
// pointing its skin, hair or outfit at another swatch (see office/looks.ts).

/** A color of the characters' paint: where its swatch is in the picture, a color to show it by, and what it is called. */
export const SWATCHES = {
  pink: { row: 1, col: 0, color: '#f378f0', name: 'Pink' },
  cream: { row: 2, col: 0, color: '#fde4c7', name: 'Cream' },
  green: { row: 2, col: 1, color: '#61cb8b', name: 'Green' },
  yellow: { row: 2, col: 2, color: '#ffc044', name: 'Yellow' },
  orange: { row: 2, col: 3, color: '#ff7e44', name: 'Orange' },
  red: { row: 2, col: 4, color: '#cf534f', name: 'Red' },
  blue: { row: 2, col: 5, color: '#6794d9', name: 'Blue' },
  lightBlue: { row: 2, col: 6, color: '#d0e8ff', name: 'Light blue' },
  purple: { row: 2, col: 7, color: '#a878e8', name: 'Purple' },
  dark: { row: 3, col: 0, color: '#38383d', name: 'Black' },
  grey: { row: 3, col: 1, color: '#868ba1', name: 'Grey' },
  slate: { row: 3, col: 2, color: '#4f5260', name: 'Charcoal' },
  silver: { row: 3, col: 3, color: '#a0a8c9', name: 'Silver' },
  white: { row: 3, col: 4, color: '#ffffff', name: 'White' },
  peach: { row: 3, col: 5, color: '#f1976c', name: 'Ginger' },
  brown: { row: 3, col: 6, color: '#b06041', name: 'Brown' },
  light: { row: 3, col: 7, color: '#f2bf99', name: 'Sand' },
} as const;
export type SwatchId = keyof typeof SWATCHES;

/** The picture is this many swatches wide and high. */
export const SWATCH_GRID = { cols: 8, rows: 4 };

/**
 * The characters to choose from, with the swatches each one's skin, hair and
 * main piece of clothing are painted from as they come.
 */
export const BODIES = {
  'female-a': { skin: 'brown', hair: 'dark', outfit: 'blue' },
  'female-b': { skin: 'light', hair: 'peach', outfit: 'yellow' },
  'female-c': { skin: 'peach', hair: 'grey', outfit: 'blue' },
  'female-d': { skin: 'light', hair: 'peach', outfit: 'grey' },
  'female-e': { skin: 'light', hair: 'dark', outfit: 'white' },
  'female-f': { skin: 'light', hair: 'brown', outfit: 'dark' },
  'male-a': { skin: 'brown', hair: 'dark', outfit: 'green' },
  'male-b': { skin: 'light', hair: 'peach', outfit: 'red' },
  'male-d': { skin: 'light', hair: 'peach', outfit: 'dark' },
  'male-e': { skin: 'light', hair: 'brown', outfit: 'dark' },
  'male-f': { skin: 'peach', hair: 'dark', outfit: 'light' },
} as const satisfies Record<string, Record<Feature, SwatchId>>;
export type BodyId = keyof typeof BODIES;
export const BODY_IDS = Object.keys(BODIES) as BodyId[];

/** The parts of a character that can be given another color. */
export const FEATURES = ['skin', 'hair', 'outfit'] as const;
export type Feature = (typeof FEATURES)[number];
export const FEATURE_NAMES: Record<Feature, string> = { skin: 'Skin', hair: 'Hair', outfit: 'Clothes' };

/** The colors each part can have. */
export const FEATURE_COLORS: Record<Feature, readonly SwatchId[]> = {
  skin: ['cream', 'light', 'peach', 'brown'],
  hair: ['dark', 'slate', 'brown', 'peach', 'light', 'yellow', 'orange', 'red', 'grey', 'silver', 'white', 'pink', 'purple', 'blue', 'green'],
  outfit: ['dark', 'slate', 'grey', 'silver', 'white', 'cream', 'light', 'brown', 'yellow', 'orange', 'red', 'pink', 'purple', 'blue', 'lightBlue', 'green'],
};

/** A character and its colors. A part that is null keeps the color the character comes with. */
export interface Look {
  body: BodyId;
  skin: SwatchId | null;
  hair: SwatchId | null;
  outfit: SwatchId | null;
}

/** The model file of a character, under public/models. */
export const bodyFile = (body: BodyId) => `characters/character-${body}.glb`;

/** The color a part of a look has: the one chosen, or the character's own. */
export const colorOf = (look: Look, feature: Feature): SwatchId => look[feature] ?? BODIES[look.body][feature];

/** A look for someone who never chose one: a character picked by their name, in its own colors. */
export function defaultLook(name: string): Look {
  let hash = 0;
  for (const c of name) hash = (Math.imul(hash, 31) + c.charCodeAt(0)) >>> 0;
  return { body: BODY_IDS[hash % BODY_IDS.length]!, skin: null, hair: null, outfit: null };
}

/** Whether a value read from a save or a form is a look the game can show. */
export function isLook(value: unknown): value is Look {
  if (typeof value !== 'object' || value === null) return false;
  const look = value as Record<string, unknown>;
  return (
    typeof look.body === 'string' &&
    look.body in BODIES &&
    FEATURES.every((feature) => look[feature] === null || (typeof look[feature] === 'string' && FEATURE_COLORS[feature].includes(look[feature] as SwatchId)))
  );
}

/** A look as it is kept: a part given the color it has anyway is not a change. */
export function cleanLook(look: Look): Look {
  const own = BODIES[look.body];
  return { body: look.body, skin: look.skin === own.skin ? null : look.skin, hair: look.hair === own.hair ? null : look.hair, outfit: look.outfit === own.outfit ? null : look.outfit };
}
