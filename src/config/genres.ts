// Show genres (prompt.md section 6.3).

import type { FurnitureType, RoomType } from './office';
import type { AudienceId, Medium } from './world';

export type GenreId =
  | 'top40'
  | 'rock'
  | 'classical'
  | 'morningShow'
  | 'radioDrama'
  | 'talk'
  | 'news'
  | 'sportsCommentary'
  | 'podcastTalk'
  // TV
  | 'movies'
  | 'series'
  | 'documentary'
  | 'sitcom'
  | 'soap'
  | 'kids'
  | 'talkShow'
  | 'gameShow'
  | 'tvNews'
  | 'tvSports'
  | 'musicVideos'
  | 'teleshopping'
  | 'reality'
  | 'cartoons';

export type GenreGroup = 'Music' | 'News & Talk' | 'Entertainment' | 'Fiction' | 'Sports' | 'Factual';

/** Produced shows need a host, staff and a studio; licensed programs air titles bought on the content market. */
export type GenreKind = 'produced' | 'licensed';

export interface Genre {
  id: GenreId;
  name: string;
  group: GenreGroup;
  medium: Medium;
  kind: GenreKind;
  /** Studio for produced shows; the library for licensed ones. */
  studio: RoomType;
  /** Production staff needed for full production quality. */
  requiredStaff: number;
  /** First year the genre exists. Rivals use it then; the player may need to research it (see config/tech.ts). */
  unlockYear: number;
  /** Audience fit: H = 1.0, M = 0.6, L = 0.25. */
  fit: Record<AudienceId, number>;
  /** Shows whole games while the player holds sports broadcast rights; without them it can only talk about sport, and draws fewer people (see SPORTS_RIGHTS). */
  usesRights?: boolean;
  /** The set the show is made on: the one its studio is built around. */
  set?: FurnitureType;
  /**
   * Written by writers (0.14.0): `needed` of them for their work to count in
   * full. A show they `lead` has no host: a cast plays it, and the writing
   * counts where a host's skill would. Otherwise good writing makes it a
   * little better (see WRITERS in balance.ts).
   */
  writers?: { needed: number; lead: boolean };
}

const H = 1;
const M = 0.6;
const L = 0.25;

export const GENRES: readonly Genre[] = [
  {
    id: 'top40',
    name: 'Top 40',
    group: 'Music',
    medium: 'radio',
    kind: 'produced',
    studio: 'radioStudio',
    requiredStaff: 1,
    unlockYear: 1970,
    fit: { teens: H, students: H, families: M, workers: M, professionals: L, seniors: L },
  },
  {
    id: 'rock',
    name: 'Rock',
    group: 'Music',
    medium: 'radio',
    kind: 'produced',
    studio: 'radioStudio',
    requiredStaff: 1,
    unlockYear: 1970,
    fit: { teens: H, students: H, families: L, workers: M, professionals: L, seniors: L },
  },
  {
    id: 'classical',
    name: 'Classical',
    group: 'Music',
    medium: 'radio',
    kind: 'produced',
    studio: 'radioStudio',
    requiredStaff: 1,
    unlockYear: 1970,
    fit: { teens: L, students: L, families: L, workers: L, professionals: H, seniors: H },
  },
  {
    id: 'morningShow',
    name: 'Morning show',
    group: 'Entertainment',
    medium: 'radio',
    kind: 'produced',
    studio: 'radioStudio',
    requiredStaff: 2,
    unlockYear: 1970,
    fit: { teens: M, students: M, families: H, workers: H, professionals: M, seniors: M },
  },
  {
    id: 'radioDrama',
    name: 'Radio drama',
    group: 'Fiction',
    medium: 'radio',
    kind: 'produced',
    studio: 'radioStudio',
    requiredStaff: 3,
    unlockYear: 1970,
    fit: { teens: L, students: L, families: M, workers: M, professionals: M, seniors: H },
    writers: { needed: 1, lead: false },
  },
  {
    id: 'talk',
    name: 'Talk / call-in',
    group: 'News & Talk',
    medium: 'radio',
    kind: 'produced',
    studio: 'radioTalkStudio',
    requiredStaff: 2,
    unlockYear: 1970,
    fit: { teens: L, students: M, families: M, workers: M, professionals: M, seniors: H },
  },
  {
    id: 'news',
    name: 'News',
    group: 'News & Talk',
    medium: 'radio',
    kind: 'produced',
    studio: 'radioTalkStudio',
    requiredStaff: 3,
    unlockYear: 1970,
    fit: { teens: L, students: M, families: M, workers: M, professionals: H, seniors: H },
  },
  {
    id: 'sportsCommentary',
    name: 'Sports commentary',
    group: 'Sports',
    medium: 'radio',
    kind: 'produced',
    studio: 'radioTalkStudio',
    requiredStaff: 2,
    unlockYear: 1970,
    fit: { teens: M, students: M, families: M, workers: H, professionals: M, seniors: M },
  },
  {
    id: 'podcastTalk',
    name: 'Podcast-style talk',
    group: 'News & Talk',
    medium: 'radio',
    kind: 'produced',
    studio: 'radioTalkStudio',
    requiredStaff: 1,
    unlockYear: 2015,
    fit: { teens: M, students: H, families: M, workers: M, professionals: H, seniors: L },
  },
  // --- TV ---
  {
    id: 'movies',
    name: 'Movies',
    group: 'Fiction',
    medium: 'tv',
    kind: 'licensed',
    studio: 'library',
    requiredStaff: 0,
    unlockYear: 1970,
    fit: { teens: H, students: H, families: H, workers: H, professionals: M, seniors: M },
  },
  {
    id: 'series',
    name: 'Series',
    group: 'Fiction',
    medium: 'tv',
    kind: 'licensed',
    studio: 'library',
    requiredStaff: 0,
    unlockYear: 1970,
    fit: { teens: M, students: H, families: H, workers: H, professionals: M, seniors: M },
  },
  {
    id: 'documentary',
    name: 'Documentary',
    group: 'Factual',
    medium: 'tv',
    kind: 'licensed',
    studio: 'library',
    requiredStaff: 0,
    unlockYear: 1970,
    fit: { teens: L, students: M, families: M, workers: L, professionals: H, seniors: H },
  },
  {
    id: 'sitcom',
    name: 'Sitcom',
    group: 'Entertainment',
    medium: 'tv',
    kind: 'produced',
    studio: 'tvSitcomStudio',
    requiredStaff: 5,
    unlockYear: 1970,
    fit: { teens: H, students: H, families: H, workers: M, professionals: L, seniors: M },
    set: 'sitcomSet',
    writers: { needed: 2, lead: true },
  },
  {
    id: 'soap',
    name: 'Soap opera',
    group: 'Fiction',
    medium: 'tv',
    kind: 'produced',
    studio: 'tvSoapStudio',
    requiredStaff: 5,
    unlockYear: 1970,
    fit: { teens: L, students: L, families: H, workers: M, professionals: L, seniors: H },
    set: 'soapSet',
    writers: { needed: 2, lead: true },
  },
  {
    id: 'kids',
    name: 'Kids',
    group: 'Entertainment',
    medium: 'tv',
    kind: 'produced',
    studio: 'tvKidsStudio',
    requiredStaff: 3,
    unlockYear: 1970,
    fit: { teens: M, students: L, families: H, workers: L, professionals: L, seniors: L },
    set: 'kidsSet',
    writers: { needed: 1, lead: false },
  },
  {
    id: 'talkShow',
    name: 'Talk show',
    group: 'News & Talk',
    medium: 'tv',
    kind: 'produced',
    studio: 'tvTalkStudio',
    requiredStaff: 3,
    unlockYear: 1970,
    fit: { teens: L, students: M, families: M, workers: M, professionals: H, seniors: M },
    set: 'set',
  },
  {
    id: 'gameShow',
    name: 'Game show',
    group: 'Entertainment',
    medium: 'tv',
    kind: 'produced',
    studio: 'tvGameStudio',
    requiredStaff: 3,
    unlockYear: 1970,
    fit: { teens: M, students: M, families: H, workers: H, professionals: L, seniors: H },
    set: 'gameShowSet',
  },
  {
    id: 'tvNews',
    name: 'TV news',
    group: 'News & Talk',
    medium: 'tv',
    kind: 'produced',
    studio: 'tvNewsStudio',
    requiredStaff: 4,
    unlockYear: 1970,
    fit: { teens: L, students: L, families: M, workers: M, professionals: H, seniors: H },
  },
  {
    id: 'tvSports',
    name: 'TV sports',
    group: 'Sports',
    medium: 'tv',
    kind: 'produced',
    studio: 'tvNewsStudio',
    requiredStaff: 4,
    unlockYear: 1970,
    fit: { teens: M, students: M, families: M, workers: H, professionals: M, seniors: M },
    usesRights: true,
  },
  {
    id: 'musicVideos',
    name: 'Music videos',
    group: 'Music',
    medium: 'tv',
    kind: 'licensed',
    studio: 'library',
    requiredStaff: 0,
    unlockYear: 1981,
    fit: { teens: H, students: H, families: L, workers: L, professionals: L, seniors: L },
  },
  {
    id: 'teleshopping',
    name: 'Teleshopping',
    group: 'Factual',
    medium: 'tv',
    kind: 'licensed',
    studio: 'library',
    requiredStaff: 0,
    unlockYear: 1988,
    fit: { teens: L, students: L, families: L, workers: M, professionals: L, seniors: M },
  },
  {
    id: 'reality',
    name: 'Reality TV',
    group: 'Entertainment',
    medium: 'tv',
    kind: 'produced',
    studio: 'tvRealityStudio',
    requiredStaff: 4,
    unlockYear: 2000,
    fit: { teens: H, students: H, families: M, workers: M, professionals: L, seniors: L },
    set: 'realitySet',
    writers: { needed: 2, lead: true },
  },
  // Bought for the library (0.16.0): for the children, and so for the families.
  {
    id: 'cartoons',
    name: 'Cartoons',
    group: 'Fiction',
    medium: 'tv',
    kind: 'licensed',
    studio: 'library',
    requiredStaff: 0,
    unlockYear: 1970,
    fit: { teens: M, students: L, families: H, workers: L, professionals: L, seniors: L },
  },
];

/** Whether a show of the genre has a host: every produced show but those its writers lead, which a cast plays. */
export const hasHost = (genre: Genre) => genre.kind === 'produced' && !genre.writers?.lead;

/** The five acts of a format (0.22.0, #260), in the order of the show. */
export type ActId = 'exposition' | 'rising' | 'climax' | 'falling' | 'resolution';

export const ACTS: readonly { id: ActId; name: string }[] = [
  { id: 'exposition', name: 'Exposition' },
  { id: 'rising', name: 'Rising action' },
  { id: 'climax', name: 'Climax' },
  { id: 'falling', name: 'Falling action' },
  { id: 'resolution', name: 'Resolution' },
];

/** A show's format: the option it has in each act, by option id. */
export type Format = Record<ActId, string>;

export interface FormatOption {
  id: string;
  name: string;
}

/** The options of one act. The first is the default; `signature` is the one that always draws a little more (see FORMAT in balance.ts). */
export interface FormatAct {
  options: readonly FormatOption[];
  signature?: string;
}

const options = (...names: string[]): FormatOption[] => names.map((name) => ({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name }));

/** The formats (0.22.0, #260) of the shows their writers lead: four options per act, each genre with its own, and one signature option. */
export const FORMATS: Partial<Record<GenreId, Record<ActId, FormatAct>>> = {
  sitcom: {
    exposition: { options: options('Ordinary day', 'Unexpected guest', 'Cold-open gag', 'Flashback') },
    rising: { options: options('Misunderstanding', 'Bad idea', 'A lie that grows', 'A bet between friends') },
    climax: { options: options('Everything goes wrong', 'Big reveal', 'Wrong room', 'Dinner-party disaster') },
    falling: { options: options('Cover-up', 'Apologies', 'Chase', 'Plan B') },
    resolution: { options: options('Back to normal', 'Catchphrase', 'Lesson learnt', 'Group hug'), signature: 'catchphrase' },
  },
  soap: {
    exposition: { options: options('Wedding', 'Funeral', 'Stranger in town', 'Back from the dead') },
    rising: { options: options('Affair', 'Secret', 'Inheritance feud', 'Blackmail') },
    climax: { options: options('Confrontation', 'Paternity reveal', 'Fire', 'A slap in public') },
    falling: { options: options('Hospital bedside', 'Confession', 'Packed bags', 'Evil twin') },
    resolution: { options: options('Cliffhanger', 'Reconciliation', 'Departure', 'Wedding bells'), signature: 'cliffhanger' },
  },
  reality: {
    exposition: { options: options('Arrival', 'House tour', 'Meet the contestants', 'A twist announced') },
    rising: { options: options('Alliance', 'Challenge', 'Romance', 'Rule change') },
    climax: { options: options('Elimination', 'Showdown', 'Secret task', 'Live vote'), signature: 'elimination' },
    falling: { options: options('Confessional', 'Tears', 'Making up', 'Diary room') },
    resolution: { options: options('Farewell', 'Cliffhanger', 'Group dinner', 'Next week’s twist') },
  },
};

/** Whether a show of the genre has a format: the shows its writers lead. Others keep revamping. */
export const hasFormat = (id: GenreId) => FORMATS[id] !== undefined;

/** The format a new show of the genre starts with: the first option of each act. */
export function defaultFormat(id: GenreId): Format | undefined {
  const acts = FORMATS[id];
  if (!acts) return undefined;
  return Object.fromEntries(ACTS.map((a) => [a.id, acts[a.id].options[0]!.id])) as Format;
}

/** Whether the format has an option for every act that the genre offers. */
export function validFormat(id: GenreId, format: Format): boolean {
  const acts = FORMATS[id];
  return acts !== undefined && ACTS.every((a) => acts[a.id].options.some((o) => o.id === format[a.id]));
}

/** Whether the format holds the genre's signature option: the one that draws more. */
export function hasSignature(id: GenreId, format: Format | undefined): boolean {
  const acts = FORMATS[id];
  return acts !== undefined && format !== undefined && ACTS.some((a) => acts[a.id].signature === format[a.id]);
}

/** Why a show of a genre can be sued (0.19.0): talk, radio talk and the news for libel, reality TV for an injury; no other genre. */
export function lawsuitSource(id: GenreId): 'libel' | 'injury' | null {
  if (id === 'talk' || id === 'news' || id === 'podcastTalk' || id === 'talkShow' || id === 'tvNews') return 'libel';
  return id === 'reality' ? 'injury' : null;
}

/** The genres family-friendly sponsors turn down (0.21.0, #361): rock, talk, radio talk, the talk show and reality TV. */
export const isEdgy = (id: GenreId) => id === 'rock' || id === 'talk' || id === 'podcastTalk' || id === 'talkShow' || id === 'reality';

export function getGenre(id: GenreId): Genre {
  const genre = GENRES.find((g) => g.id === id);
  if (!genre) throw new Error(`Unknown genre ${id}`);
  return genre;
}
