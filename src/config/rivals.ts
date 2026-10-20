// Rival broadcasters (prompt.md section 10). Each has a personality that
// decides what it airs, how good it is, and where it starts.

import type { GenreId } from './genres';
import type { RegionId } from './world';

export type Personality = 'news' | 'cheap' | 'highbrow' | 'youth';

export interface RivalChannelSpec {
  /** Channel names are made up (names.ts), unless `name` gives it a fixed one. */
  name?: string;
  /** Logo initials for a channel with a fixed name. */
  initials?: string;
  /** Genre per slot, morning … late night. */
  schedule: readonly GenreId[];
}

export interface PersonalitySpec {
  label: string;
  /** A fixed company name; other rivals get a random one. */
  company?: string;
  /** Radio channels the rival starts with. */
  channels: readonly RivalChannelSpec[];
  /**
   * Its TV channel. Launched at the start in `regions` when `launchYear` is 1970;
   * otherwise the rival bids for TV licenses from `launchYear` on.
   */
  tv: RivalChannelSpec & { launchYear: number };
  /** Show quality before RIVAL_DIFFICULTY is applied. */
  quality: { min: number; max: number };
  hostFame: { min: number; max: number };
  regions: readonly RegionId[];
}

export const PERSONALITIES: Record<Personality, PersonalitySpec> = {
  news: {
    label: 'News-focused',
    channels: [{ schedule: ['morningShow', 'news', 'talk', 'news', 'talk'] }],
    tv: { launchYear: 1974, schedule: ['tvNews', 'talkShow', 'documentary', 'tvNews', 'talkShow'] },
    quality: { min: 0.7, max: 0.85 },
    hostFame: { min: 30, max: 60 },
    regions: ['north', 'coast'],
  },
  cheap: {
    label: 'Cheap entertainment',
    channels: [{ schedule: ['morningShow', 'top40', 'top40', 'rock', 'top40'] }],
    tv: { launchYear: 1972, schedule: ['gameShow', 'soap', 'series', 'movies', 'movies'] },
    quality: { min: 0.55, max: 0.75 },
    hostFame: { min: 20, max: 50 },
    // Game shows and soaps for the workers and families of Transponder Valley and Amplify Hills.
    regions: ['north', 'highlands'],
  },
  highbrow: {
    label: 'Public broadcaster',
    company: 'EPB',
    // A mainstream national station and a culture station.
    channels: [
      { name: 'EPB Radio 1', initials: 'E1', schedule: ['morningShow', 'news', 'talk', 'news', 'sportsCommentary'] },
      { name: 'EPB Radio 2', initials: 'E2', schedule: ['classical', 'classical', 'radioDrama', 'news', 'classical'] },
    ],
    tv: { name: 'EPB-TV', initials: 'ETV', launchYear: 1970, schedule: ['kids', 'documentary', 'series', 'tvNews', 'documentary'] },
    quality: { min: 0.8, max: 0.95 },
    hostFame: { min: 10, max: 40 },
    regions: ['capital', 'north', 'coast', 'heartland', 'highlands'],
  },
  youth: {
    label: 'Youth and music',
    channels: [{ schedule: ['top40', 'top40', 'rock', 'rock', 'top40'] }],
    tv: { launchYear: 1979, schedule: ['kids', 'series', 'sitcom', 'movies', 'movies'] },
    quality: { min: 0.65, max: 0.85 },
    hostFame: { min: 40, max: 70 },
    // Aerial Fields has the teens; Coaxia, the other young region, is left open for the player's start.
    regions: ['heartland'],
  },
};

