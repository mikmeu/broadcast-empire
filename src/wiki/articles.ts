// The wiki: every article, and how to find one.

import type { RegionId } from '../config/world';
import { GAME_ARTICLES } from './game';
import { LORE_ARTICLES, SPONSOR_PAGES } from './lore';
import { linksIn, plainText } from './markup';
import { TIP_ARTICLES } from './tips';
import { ARTICLE_IDS, type Article, type ArticleId, type ArticleText, type Block, type CategoryId } from './types';

const TEXTS: Record<ArticleId, ArticleText> = { ...GAME_ARTICLES, ...TIP_ARTICLES, ...LORE_ARTICLES };

/** In the order of ARTICLE_IDS, which is the order of the contents list. */
export const ARTICLES: readonly Article[] = ARTICLE_IDS.map((id) => ({ id, ...TEXTS[id] }));

/** The article about each region, for the map. */
export const REGION_ARTICLES: Record<RegionId, ArticleId> = {
  capital: 'coaxia',
  north: 'transponder-valley',
  coast: 'skywave-beach',
  heartland: 'aerial-fields',
  highlands: 'amplify-hills',
};

/** The article about each sponsor, by its name, for the Sales window. A sponsor from a save before 0.10.0 may have a name with none. */
export const SPONSOR_ARTICLES: Readonly<Record<string, ArticleId>> = SPONSOR_PAGES;

/** The sponsor an article is about, if it is about one: its logo goes in the box of facts. */
export const sponsorOf = (id: ArticleId) => Object.keys(SPONSOR_ARTICLES).find((name) => SPONSOR_ARTICLES[name] === id);

/** The article the wiki opens on. */
export const HOME: ArticleId = 'broadcast-empire';

export const isArticle = (id: string): id is ArticleId => (ARTICLE_IDS as readonly string[]).includes(id);
export const getArticle = (id: ArticleId): Article => ARTICLES.find((a) => a.id === id)!;
export const titleOf = (id: string) => (isArticle(id) ? getArticle(id).title : id);
export const articlesIn = (category: CategoryId) => ARTICLES.filter((a) => a.category === category);

/** Every string of a block that is written in the wiki's markup. A block written from the game reads as it does before one is open. */
export function stringsOf(block: Block): readonly string[] {
  if (typeof block === 'string') return [block];
  if ('asOf' in block) return block.asOf(null, null).flatMap(stringsOf);
  if ('list' in block) return block.list;
  if ('steps' in block) return block.steps;
  if ('tip' in block) return [block.tip];
  return [...block.table.head, ...block.table.rows.flat()];
}

/** Every article another one links to, in its text or under "See also". */
export function linksFrom(article: Article): string[] {
  const inText = article.sections.flatMap((s) => s.body.flatMap((block) => stringsOf(block).flatMap(linksIn)));
  return [...new Set([...inText, ...(article.seeAlso ?? [])])];
}

/** An article's words, lower case, for searching. */
const WORDS = new Map<ArticleId, string>();
function wordsOf(article: Article): string {
  let words = WORDS.get(article.id);
  if (words === undefined) {
    const body = article.sections.flatMap((s) => [s.heading ?? '', ...s.body.flatMap((block) => stringsOf(block).map((text) => plainText(text, titleOf)))]);
    words = [...(article.facts ?? []).flat(), article.picture?.caption ?? '', ...body].join(' ').toLowerCase();
    WORDS.set(article.id, words);
  }
  return words;
}

/**
 * The articles that have every word of the query, best first: a word in the
 * title counts most, then one in the summary, then one in the text.
 */
export function searchWiki(query: string): Article[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  return ARTICLES.map((article) => {
    const title = article.title.toLowerCase();
    const summary = article.summary.toLowerCase();
    const words = wordsOf(article);
    let score = 0;
    for (const term of terms) {
      if (title.includes(term)) score += title.startsWith(term) ? 12 : 8;
      else if (summary.includes(term)) score += 3;
      else if (words.includes(term)) score += 1;
      else return { article, score: 0 };
    }
    return { article, score };
  })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((hit) => hit.article);
}
