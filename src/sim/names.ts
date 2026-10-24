// Made-up names: a prefix and a suffix from the lists in config/names.ts, written together (issue #92).
// A name takes one draw from the game's random numbers, as the name from a short list did before, so a seeded
// game plays out the same and only the names differ.

import {
  CHANNEL_PREFIX,
  COMPANY_PREFIX,
  COMPANY_SUFFIX,
  GIVEN_NAMES_FEMALE,
  GIVEN_NAMES_MALE,
  LAST_NAME_PREFIX,
  LAST_NAME_SUFFIX,
  RADIO_CHANNEL_SUFFIX,
  SHOW_PREFIX,
  SHOW_SUFFIX,
  TV_CHANNEL_SUFFIX,
} from '../config/names';
import type { Medium } from '../config/world';
import type { Rng } from './rng';

/** Every given name, women's and men's lists together. */
export const GIVEN_NAMES: readonly string[] = [...GIVEN_NAMES_FEMALE, ...GIVEN_NAMES_MALE];

/** First names that count as a woman's: the women's list and the 20 of the games before it (so saved staff keep their looks), and the receptionist's. */
const FEMALE_NAMES = new Set([
  ...GIVEN_NAMES_FEMALE,
  'Ada', 'Carla', 'Elena', 'Greta', 'Iris', 'Kira', 'Mila', 'Olga', 'Rosa', 'Tess',
  'Vera', 'Yara', 'Anouk', 'Cleo', 'Eva', 'Gwen', 'Inge', 'Lotte', 'Nina', 'Petra',
  'Elien',
]);
/** Given names that are on both lists (Charlie, Sam…): the whole name tells which. */
const EITHER_NAMES = new Set(GIVEN_NAMES_FEMALE.filter((n) => GIVEN_NAMES_MALE.includes(n)));

/** A number made of a whole name, the same everywhere: it picks someone's character (office/assets.ts). */
export function nameHash(name: string): number {
  let hash = 0;
  for (const c of name) hash = (Math.imul(hash, 31) + c.charCodeAt(0)) >>> 0;
  return hash;
}

/** How many characters there are of each sex in office/assets.ts (a test holds both to the same). */
export const CHARACTER_COUNTS = { female: 6, male: 5 };

/** Whether a name is a woman's, by the rule that picks someone's character, so that who takes leave matches how they look (0.20.0). */
export function isWoman(name: string): boolean {
  const first = name.split(' ')[0] ?? '';
  if (EITHER_NAMES.has(first)) return nameHash(name) % (CHARACTER_COUNTS.female + CHARACTER_COUNTS.male) < CHARACTER_COUNTS.female;
  return FEMALE_NAMES.has(first);
}

/** Whether a name is on both lists, and so takes either kind of character. */
export const isEitherName = (name: string) => EITHER_NAMES.has(name.split(' ')[0] ?? '');

const capital =(text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** How many names a prefix list and a suffix list make. */
export const combinations = (prefixes: readonly string[], suffixes: readonly string[]) => prefixes.length * suffixes.length;

/** The name at position `i` of all the prefix and suffix pairs; `i` wraps round. */
export function combine(prefixes: readonly string[], suffixes: readonly string[], i: number): string {
  const n = combinations(prefixes, suffixes);
  const at = ((i % n) + n) % n;
  return capital(`${prefixes[at % prefixes.length]}${suffixes[Math.floor(at / prefixes.length)]}`);
}

/**
 * A name with one draw. When a name in `taken` comes up it takes the next pair along, with no new draw, so the
 * number of draws never depends on what is taken. `free` is false when every pair is taken.
 */
function drawName(rng: Rng, prefixes: readonly string[], suffixes: readonly string[], taken: ReadonlySet<string> | readonly string[]): { name: string; free: boolean } {
  const n = combinations(prefixes, suffixes);
  const start = rng.int(0, n - 1);
  const isTaken = (name: string) => (Array.isArray(taken) ? taken.includes(name) : (taken as ReadonlySet<string>).has(name));
  for (let k = 0; k < n; k++) {
    const name = combine(prefixes, suffixes, start + k);
    if (!isTaken(name)) return { name, free: true };
  }
  return { name: combine(prefixes, suffixes, start), free: false };
}

/** A last name. One draw. */
export const drawLastName = (rng: Rng) => drawName(rng, LAST_NAME_PREFIX, LAST_NAME_SUFFIX, []).name;

/** A rival show's name, not one in `taken`; "II" is added when all of them are. One draw. */
export function drawShowName(rng: Rng, taken: readonly string[]): string {
  const { name, free } = drawName(rng, SHOW_PREFIX, SHOW_SUFFIX, taken);
  return free ? name : `${name} II`;
}

/** A rival company's name, not one in `taken`. One draw. */
export const drawCompanyName = (rng: Rng, taken: ReadonlySet<string>) => drawName(rng, COMPANY_PREFIX, COMPANY_SUFFIX, taken).name;

function hash(text: string): number {
  let h = 0;
  for (const c of text) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0;
  return h;
}

/** Spreads a hash over all its bits (murmur3's finaliser), so keys that differ by a digit do not share a last name. */
function mix(h: number): number {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

const channelSuffixes =(medium: Medium) => (medium === 'tv' ? TV_CHANNEL_SUFFIX : RADIO_CHANNEL_SUFFIX);

/** A rival channel's name, picked by `key` (the company, the medium and the channel's number) and not by a draw. */
export const channelNameFor = (key: string, medium: Medium) => combine(CHANNEL_PREFIX, channelSuffixes(medium), hash(key));

/** The two or three letters on a channel's logo: the first letters of its first two words, or the first two of a single word. */
export function channelInitials(name: string): string {
  const words = name.split(/[\s-]+/).filter(Boolean);
  const letters = words.length > 1 ? words.slice(0, 2).map((w) => w[0]).join('') : name.slice(0, 2);
  return letters.toUpperCase();
}

/** A first name and a last name from the lists, the same for the same key: for the people who are not on the payroll. */
export function nameFromKey(key: string): string {
  const h = mix(hash(key));
  const n = combinations(LAST_NAME_PREFIX, LAST_NAME_SUFFIX);
  return `${GIVEN_NAMES[h % GIVEN_NAMES.length]} ${combine(LAST_NAME_PREFIX, LAST_NAME_SUFFIX, Math.floor(h / GIVEN_NAMES.length) % n)}`;
}

// Suggestions for the player's own names. They use Math.random, not the game's numbers: they are only a suggestion.
const anyOf = (prefixes: readonly string[], suffixes: readonly string[]) => combine(prefixes, suffixes, Math.floor(Math.random() * combinations(prefixes, suffixes)));
export const suggestChannelName = (medium: Medium) => anyOf(CHANNEL_PREFIX, channelSuffixes(medium));
export const suggestCompanyName = () => anyOf(COMPANY_PREFIX, COMPANY_SUFFIX);
