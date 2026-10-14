// What a wiki article is made of. The articles themselves are in game.ts,
// tips.ts and lore.ts; articles.ts puts them together.

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
  'saving',
  // Office and staff
  'office',
  'furniture',
  'studios',
  'staff',
  'hosts',
  'managers',
  'upkeep',
  'morale',
  // On the air
  'channels',
  'licenses',
  'auctions',
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
  // Money
  'money',
  'sponsors',
  'marketing',
  'loans',
  'dividends',
  'prestige',
  'milestones',
  // A changing world
  'research',
  'rivals',
  'poaching',
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
  'brands',
] as const;
export type ArticleId = (typeof ARTICLE_IDS)[number];

/**
 * A piece of an article: a paragraph (see markup.ts), a list, numbered steps,
 * a table, or a tip set apart from the text. `asOf` is written from the game
 * that is open, for what only shows once it has happened: it gets the day of
 * that game, or null when none is open.
 */
export type Block =
  | string
  | { list: readonly string[] }
  | { steps: readonly string[] }
  | { table: { head: readonly string[]; rows: readonly (readonly string[])[] } }
  | { tip: string }
  | { asOf: (day: number | null) => readonly Block[] };

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
