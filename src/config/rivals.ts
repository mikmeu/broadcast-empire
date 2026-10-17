// Rival broadcasters (prompt.md section 10). Each has a personality that
// decides what it airs, how good it is, and where it starts.

import type { GenreId } from './genres';
import type { RegionId } from './world';

export type Personality = 'news' | 'cheap' | 'highbrow' | 'youth';

export interface RivalChannelSpec {
  /** Channel name = `${prefix} ${rival name}${suffix}`, unless `name` gives it a fixed one. */
  prefix: string;
  suffix?: string;
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
    channels: [{ prefix: 'Radio', schedule: ['morningShow', 'news', 'talk', 'news', 'talk'] }],
    tv: { prefix: 'TV', launchYear: 1974, schedule: ['tvNews', 'talkShow', 'documentary', 'tvNews', 'talkShow'] },
    quality: { min: 0.7, max: 0.85 },
    hostFame: { min: 30, max: 60 },
    regions: ['north', 'coast'],
  },
  cheap: {
    label: 'Cheap entertainment',
    channels: [{ prefix: 'Hits', schedule: ['morningShow', 'top40', 'top40', 'rock', 'top40'] }],
    tv: { prefix: 'Fun', suffix: ' TV', launchYear: 1972, schedule: ['gameShow', 'soap', 'series', 'movies', 'movies'] },
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
      { prefix: 'Radio', name: 'EPB Radio 1', initials: 'E1', schedule: ['morningShow', 'news', 'talk', 'news', 'sportsCommentary'] },
      { prefix: 'Radio', name: 'EPB Radio 2', initials: 'E2', schedule: ['classical', 'classical', 'radioDrama', 'news', 'classical'] },
    ],
    tv: { prefix: 'TV', name: 'EPB-TV', initials: 'ETV', launchYear: 1970, schedule: ['kids', 'documentary', 'series', 'tvNews', 'documentary'] },
    quality: { min: 0.8, max: 0.95 },
    hostFame: { min: 10, max: 40 },
    regions: ['capital', 'north', 'coast', 'heartland', 'highlands'],
  },
  youth: {
    label: 'Youth and music',
    channels: [{ prefix: 'Wave', schedule: ['top40', 'top40', 'rock', 'rock', 'top40'] }],
    tv: { prefix: 'Wave', suffix: ' TV', launchYear: 1979, schedule: ['kids', 'series', 'sitcom', 'movies', 'movies'] },
    quality: { min: 0.65, max: 0.85 },
    hostFame: { min: 40, max: 70 },
    // Aerial Fields has the teens; Coaxia, the other young region, is left open for the player's start.
    regions: ['heartland'],
  },
};

export const RIVAL_SHOW_NAMES: Record<GenreId, readonly string[]> = {
  top40: ['Hit Parade', 'The Countdown', 'Midday Hits', 'Juke Box Jury', 'Sounds of Today', 'Top Ten Tonight'],
  rock: ['Rock Hour', 'Loud & Clear', 'The Garage', 'Night Riders'],
  classical: ['Morning Sonata', 'The Concert Hall', 'Evening Overture', 'Chamber Music'],
  morningShow: ['Rise & Shine', 'Breakfast Club', 'Good Morning', 'Wake-Up Call'],
  radioDrama: ['Saturday Theatre', 'The Mystery Hour', 'Tales by Lamplight', 'The Serial'],
  talk: ['Open Line', 'Night Talk', 'The Phone-In', 'Speak Your Mind'],
  news: ['The Six O’Clock News', 'News Hour', 'World Tonight', 'The Bulletin', 'Morning Report'],
  sportsCommentary: ['Match of the Day', 'The Final Whistle', 'Sports Desk'],
  podcastTalk: ['The Long Read', 'Deep Dive'],
  movies: ['The Big Picture', 'Saturday Night Movie', 'Cinema Classics', 'The Late Film', 'Premiere'],
  series: ['Harbour Lights', 'The Inspector', 'Frontier', 'County General', 'The Agency'],
  documentary: ['Wild Planet', 'Our Century', 'The World About Us', 'Inside Story'],
  sitcom: ['Number 42', 'The Neighbours', 'Office Hours', 'Family Matters'],
  soap: ['Sunset Street', 'Hope Valley', 'The Farm', 'Riverside'],
  kids: ['Playtime', 'The Puppet Club', 'Fun Factory', 'Saturday Club'],
  talkShow: ['Tonight', 'Face to Face', 'The Late Show', 'Open House'],
  gameShow: ['Wheel of Luck', 'Double or Nothing', 'Brain Trust', 'Lucky Numbers'],
  tvNews: ['The Evening News', 'News at Nine', 'Newsroom', 'The Journal'],
  tvSports: ['Grandstand', 'Sports Night', 'Match Day'],
  musicVideos: ['Video Hits', 'The Chart Show', 'Night Clips'],
  teleshopping: ['Shop at Home', 'Deal Time'],
  reality: ['The House', 'Island Life', 'Talent Hunt'],
  cartoons: ['Cartoon Time', 'Saturday Toons', 'Funny Bunch'],
};
