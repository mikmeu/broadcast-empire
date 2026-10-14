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
  | 'reality';

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
    studio: 'tvProductionStudio',
    requiredStaff: 5,
    unlockYear: 1970,
    fit: { teens: H, students: H, families: H, workers: M, professionals: L, seniors: M },
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
  },
  {
    id: 'kids',
    name: 'Kids',
    group: 'Entertainment',
    medium: 'tv',
    kind: 'produced',
    studio: 'tvProductionStudio',
    requiredStaff: 3,
    unlockYear: 1970,
    fit: { teens: M, students: L, families: H, workers: L, professionals: L, seniors: L },
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
    studio: 'tvProductionStudio',
    requiredStaff: 4,
    unlockYear: 2000,
    fit: { teens: H, students: H, families: M, workers: M, professionals: L, seniors: L },
  },
];

export function getGenre(id: GenreId): Genre {
  const genre = GENRES.find((g) => g.id === id);
  if (!genre) throw new Error(`Unknown genre ${id}`);
  return genre;
}
