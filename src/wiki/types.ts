// What a wiki article is made of. The articles themselves are in game.ts,
// tips.ts, lore.ts and history.ts; articles.ts puts them together.

import type { GameState } from '../sim/state';

export const CATEGORIES = {
  start: 'Getting started',
  company: 'Office and staff',
  air: 'On the air',
  money: 'Money',
  world: 'A changing world',
  tips: 'How to do well',
  lore: 'Etheria',
} as const;
export type CategoryId = keyof typeof CATEGORIES;

/** Every article there is. A help icon or a line of the tutorial names one of these. */
export const ARTICLE_IDS = [
  // Getting started
  'broadcast-empire',
  'first-weeks',
  'time',
  'the-screen',
  'inbox',
  'saving',
  // Office and staff
  'office',
  'headquarters',
  'furniture',
  'mods',
  'studios',
  'staff',
  'hosts',
  'writers',
  'call-centre',
  'managers',
  'upkeep',
  'morale',
  // On the air
  'channels',
  'licenses',
  'auctions',
  'broadcasting-authority',
  'shows',
  'genres',
  'schedule',
  'audiences',
  'market-leader',
  'ratings',
  'reputation',
  'freshness',
  'television',
  'content-market',
  'sports-rights',
  'streaming',
  'theme-weeks',
  'news-van',
  'breaking-news',
  // Money
  'money',
  'sponsors',
  'deals',
  'marketing',
  'loans',
  'lawsuits',
  'dividends',
  'prestige',
  'milestones',
  'levels',
  // A changing world
  'research',
  'rivals',
  'poaching',
  'awards',
  'history',
  // How to do well
  'a-good-first-year',
  'growing',
  'ways-to-lose-money',
  // Etheria
  'etheria',
  'coaxia',
  'amplify-hills',
  'transponder-valley',
  'skywave-beach',
  'aerial-fields',
  'epb',
  'tabby-loid',
  'penny-cash',
  'broadcasting-act',
  'etheria-history',
  'railways',
  'maxwell-harbor',
  'coax-airport',
  'newcast-airport',
  'brands',
  'beerstar',
  'citrus',
  'foodst',
  'ipsum-ipsum',
  'jupiter',
  'manen',
  'moon-capital',
  'tahoma',
  'voltamax-energy',
  'dreamscape-holidays',
  'safesure-insurance',
  'ferro-motors',
] as const;
export type ArticleId = (typeof ARTICLE_IDS)[number];

/**
 * A piece of an article: a paragraph (see markup.ts), a list, numbered steps,
 * a table, or a tip set apart from the text. `asOf` is written from the game
 * that is open, for what only shows once it has happened: it gets the day of
 * that game and the game itself, or null for both when none is open (and for
 * search).
 */
export type Block =
  | string
  | { list: readonly string[] }
  | { steps: readonly string[] }
  | { table: { head: readonly string[]; rows: readonly (readonly string[])[] } }
  | { tip: string }
  | { asOf: (day: number | null, game: GameState | null) => readonly Block[] };

export interface Section {
  /** The lead of an article, its first section, has none. */
  heading?: string;
  body: readonly Block[];
}

export interface ArticleText {
  title: string;
  category: CategoryId;
  /** One line: under the title, in lists and in search results. */
  summary: string;
  /** The box beside the lead: label and value. */
  facts?: readonly (readonly [string, string])[];
  /** A picture at the top of the box of facts: a file in public/wiki/, and the line under it. */
  picture?: { file: string; caption: string };
  sections: readonly Section[];
  seeAlso?: readonly ArticleId[];
}

export interface Article extends ArticleText {
  id: ArticleId;
}

// --- Writing helpers ---

export const euro = (amount: number) => `€${Math.round(amount).toLocaleString('en-IE')}`;
/** An amount with its cents: an advertising rate. */
export const cents = (amount: number) => `€${amount.toFixed(2)}`;
export const percent = (share: number) => `${Math.round(share * 100)}%`;
export const count = (n: number) => n.toLocaleString('en-IE');
/** "a, b and c". */
export const list = (words: readonly string[]) => (words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);
