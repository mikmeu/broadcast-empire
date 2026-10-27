// The R&D tech tree (prompt.md section 11). Each tech has a historical year:
// rivals adopt it then, and the player can research it up to
// RESEARCH.maxYearsEarly years before, at a higher price.

import type { GenreId } from './genres';

export type TechId =
  | 'gameShowFormat'
  | 'fmStereo'
  | 'soapOperaFormat'
  | 'electricTypewriter'
  | 'videotapeLibrary'
  | 'satelliteUplink'
  | 'musicVideoFormat'
  | 'personalComputer'
  | 'cableDistribution'
  | 'teleshoppingFormat'
  | 'premiumLines'
  | 'digitalRadioStudio'
  | 'digitalEditing'
  | 'internet'
  | 'digitalLibrary'
  | 'realityFormat'
  | 'hdBroadcasting'
  | 'socialMedia'
  | 'visualRadio'
  | 'streaming'
  | 'podcasting'
  | 'cloudProduction';

/** What equipment a tier applies to. */
export type TechLine = 'radio' | 'tv' | 'office';

export interface TechEffects {
  /** New equipment of this line is bought at this tier. */
  tier?: { line: TechLine; tier: number };
  /** Multiplies licensed titles' quality. */
  licensedQuality?: number;
  /** Multiplies content-market title prices. */
  contentPrice?: number;
  /** Multiplies sports-rights prices. */
  sportsPrice?: number;
  /** Multiplies the player's TV viewers. */
  tvReach?: number;
  /** Multiplies production skill. */
  productionSkill?: number;
  /** Multiplies marketing campaign strength. */
  marketing?: number;
  /** Extra sponsor offers each week. */
  extraOffers?: number;
  /** Multiplies how fast host fame grows. */
  fameGrowth?: number;
  /** Multiplies ad revenue from licensed titles. */
  licensedRevenue?: number;
  /** A genre the player can produce or buy once researched. */
  unlocks?: GenreId;
}

/** The columns of the Research screen: new genres, better equipment and multipliers, and new work, rooms or services. */
export type TechCategory = 'genres' | 'upgrades' | 'jobs';

export const TECH_CATEGORIES: readonly { id: TechCategory; name: string }[] = [
  { id: 'genres', name: 'Genres' },
  { id: 'upgrades', name: 'Upgrades' },
  { id: 'jobs', name: 'Jobs' },
];

/** The rows of the Research screen. */
export const DECADES: readonly number[] = [1970, 1980, 1990, 2000, 2010, 2020];

export interface Tech {
  id: TechId;
  name: string;
  year: number;
  category: TechCategory;
  /** Research points at (or after) the historical year. */
  cost: number;
  description: string;
  effects: TechEffects;
}

export const TECHS: readonly Tech[] = [
  { id: 'gameShowFormat', name: 'Game shows', year: 1971, category: 'genres', cost: 250, description: 'The game show decor: the set a game show is made on.', effects: {} },
  { id: 'fmStereo', name: 'FM stereo', year: 1972, category: 'upgrades', cost: 300, description: 'Radio studio equipment tier 2: a mixing desk with room for two guests.', effects: { tier: { line: 'radio', tier: 2 } } },
  { id: 'soapOperaFormat', name: 'Soap operas', year: 1973, category: 'genres', cost: 250, description: 'The soap opera decor: the set a soap opera is made on.', effects: {} },
  { id: 'electricTypewriter', name: 'Electric typewriter', year: 1975, category: 'upgrades', cost: 300, description: 'Workstations tier 2: +10% office output.', effects: { tier: { line: 'office', tier: 2 } } },
  { id: 'videotapeLibrary', name: 'Videotape library', year: 1977, category: 'upgrades', cost: 400, description: 'Licensed titles +10% quality and 10% cheaper.', effects: { licensedQuality: 1.1, contentPrice: 0.9 } },
  { id: 'satelliteUplink', name: 'Satellite uplink', year: 1979, category: 'upgrades', cost: 600, description: 'TV studio equipment tier 2; sports rights 25% cheaper.', effects: { tier: { line: 'tv', tier: 2 }, sportsPrice: 0.75 } },
  { id: 'musicVideoFormat', name: 'Music video format', year: 1981, category: 'genres', cost: 400, description: 'Unlocks music videos on the content market.', effects: { unlocks: 'musicVideos' } },
  { id: 'personalComputer', name: 'Personal computer', year: 1982, category: 'jobs', cost: 800, description: 'Workstations tier 3: +25% office output. Server racks for the library.', effects: { tier: { line: 'office', tier: 3 } } },
  { id: 'cableDistribution', name: 'Cable distribution', year: 1984, category: 'upgrades', cost: 800, description: 'Your TV channels reach 15% more viewers.', effects: { tvReach: 1.15 } },
  { id: 'teleshoppingFormat', name: 'Teleshopping format', year: 1988, category: 'genres', cost: 500, description: 'Unlocks teleshopping on the content market.', effects: { unlocks: 'teleshopping' } },
  { id: 'premiumLines', name: 'Premium-rate lines', year: 1989, category: 'jobs', cost: 600, description: 'Viewers can pay to vote on game shows and reality TV, taken by call agents in a call centre.', effects: {} },
  { id: 'digitalRadioStudio', name: 'Digital radio studio', year: 1990, category: 'upgrades', cost: 1000, description: 'Radio studio equipment tier 3.', effects: { tier: { line: 'radio', tier: 3 } } },
  { id: 'digitalEditing', name: 'Digital editing', year: 1993, category: 'upgrades', cost: 1200, description: '+15% production skill on every show.', effects: { productionSkill: 1.15 } },
  { id: 'internet', name: 'Internet', year: 1995, category: 'upgrades', cost: 1500, description: 'Marketing +20%, one extra sponsor offer a week.', effects: { marketing: 1.2, extraOffers: 1 } },
  { id: 'digitalLibrary', name: 'Digital library', year: 1998, category: 'upgrades', cost: 1200, description: 'Licensed titles another +10% quality and 20% cheaper.', effects: { licensedQuality: 1.1, contentPrice: 0.8 } },
  { id: 'realityFormat', name: 'Reality format', year: 2000, category: 'genres', cost: 1000, description: 'Unlocks reality TV shows.', effects: { unlocks: 'reality' } },
  { id: 'hdBroadcasting', name: 'HD broadcasting', year: 2005, category: 'upgrades', cost: 2000, description: 'TV studio equipment tier 3.', effects: { tier: { line: 'tv', tier: 3 } } },
  { id: 'socialMedia', name: 'Social media', year: 2008, category: 'jobs', cost: 2000, description: 'Marketing +30%; host fame grows twice as fast; your channels can open social media accounts, in Marketing.', effects: { marketing: 1.3, fameGrowth: 2 } },
  { id: 'visualRadio', name: 'Visual radio', year: 2010, category: 'upgrades', cost: 2000, description: 'Radio studio equipment tier 4: a studio that is filmed as well as heard.', effects: { tier: { line: 'radio', tier: 4 } } },
  { id: 'streaming', name: 'Streaming', year: 2012, category: 'jobs', cost: 2000, description: 'Opens a streaming service. +10% revenue from licensed titles.', effects: { licensedRevenue: 1.1 } },
  { id: 'podcasting', name: 'Podcasting', year: 2015, category: 'genres', cost: 1000, description: 'Unlocks podcast-style talk on radio.', effects: { unlocks: 'podcastTalk' } },
  { id: 'cloudProduction', name: 'Laptops and cloud', year: 2020, category: 'upgrades', cost: 2500, description: 'Workstations tier 4: +35% office output. Server racks tier 2.', effects: { tier: { line: 'office', tier: 4 } } },
];

export function getTech(id: TechId): Tech {
  const tech = TECHS.find((t) => t.id === id);
  if (!tech) throw new Error(`Unknown tech ${id}`);
  return tech;
}

/** The tech that unlocks a genre, if any. */
export const unlockingTech = (genre: GenreId) => TECHS.find((t) => t.effects.unlocks === genre);
