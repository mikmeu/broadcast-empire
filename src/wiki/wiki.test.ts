import { describe, expect, it } from 'vitest';
import { LINES } from '../config/guide';
import { MILESTONE_LIST } from '../config/milestones';
import { TECHS } from '../config/tech';
import { GENRES } from '../config/genres';
import { REGIONS } from '../config/world';
import { ARTICLES, HOME, REGION_ARTICLES, articlesIn, getArticle, isArticle, linksFrom, searchWiki, stringsOf, titleOf } from './articles';
import { linksIn, parseInline, plainText } from './markup';
import { ARTICLE_IDS, CATEGORIES, type CategoryId } from './types';

const textOf = (id: (typeof ARTICLE_IDS)[number]) =>
  getArticle(id)
    .sections.flatMap((s) => s.body.flatMap((b) => stringsOf(b)))
    .map((text) => plainText(text, titleOf))
    .join(' ');

describe('the markup', () => {
  it('finds links with and without words of their own, and bold', () => {
    expect(parseInline('See [[ratings]] and [[loans|the bank]], **now**.')).toEqual([
      { kind: 'text', text: 'See ' },
      { kind: 'link', to: 'ratings', text: undefined },
      { kind: 'text', text: ' and ' },
      { kind: 'link', to: 'loans', text: 'the bank' },
      { kind: 'text', text: ', ' },
      { kind: 'bold', text: 'now' },
      { kind: 'text', text: '.' },
    ]);
    expect(linksIn('[[a-b]] x [[c|d]]')).toEqual(['a-b', 'c']);
    expect(plainText('In [[etheria]], see [[loans|the bank]].', titleOf)).toBe('In Etheria, see the bank.');
  });
});

describe('the articles', () => {
  it('has one for every id, with a title, a summary and something to read', () => {
    expect(ARTICLES.map((a) => a.id)).toEqual([...ARTICLE_IDS]);
    expect(new Set(ARTICLES.map((a) => a.title)).size).toBe(ARTICLES.length);
    for (const article of ARTICLES) {
      expect(article.title, article.id).toBeTruthy();
      expect(article.summary.length, article.id).toBeGreaterThan(15);
      expect(article.sections.length, article.id).toBeGreaterThan(0);
      for (const section of article.sections) expect(section.body.length, `${article.id}: ${section.heading}`).toBeGreaterThan(0);
      // Only the first section may go without a heading: it is the lead.
      expect(article.sections.slice(1).every((s) => s.heading), article.id).toBe(true);
      expect(textOf(article.id).length, article.id).toBeGreaterThan(150);
    }
  });

  it('only links to articles that exist, and never to itself', () => {
    for (const article of ARTICLES) {
      for (const link of linksFrom(article)) {
        expect(isArticle(link), `${article.id} → ${link}`).toBe(true);
        expect(link, article.id).not.toBe(article.id);
      }
    }
  });

  it('can all be reached from the first page by following links', () => {
    const seen = new Set<string>([HOME]);
    const queue: string[] = [HOME];
    while (queue.length > 0) {
      const id = queue.pop()!;
      if (!isArticle(id)) continue;
      for (const link of linksFrom(getArticle(id))) {
        if (!seen.has(link)) {
          seen.add(link);
          queue.push(link);
        }
      }
    }
    expect(ARTICLE_IDS.filter((id) => !seen.has(id))).toEqual([]);
  });

  it('has articles in every part of the contents', () => {
    for (const category of Object.keys(CATEGORIES) as CategoryId[]) expect(articlesIn(category).length, category).toBeGreaterThan(2);
  });

  it('leaves no template unfilled and no figure undefined', () => {
    for (const article of ARTICLES) {
      const everything = [article.title, article.summary, ...(article.facts ?? []).flat(), textOf(article.id)].join(' ');
      expect(everything, article.id).not.toMatch(/undefined|NaN|\$\{|\[object|\[\[|\]\]|\*\*/);
    }
  });

  it('takes its lists from the game: every genre, technology, milestone and region is there', () => {
    const genres = textOf('genres');
    for (const genre of GENRES) expect(genres, genre.name).toContain(genre.name);
    const research = textOf('research');
    for (const tech of TECHS) expect(research, tech.name).toContain(tech.name);
    const milestones = textOf('milestones');
    for (const milestone of MILESTONE_LIST) expect(milestones, milestone.name).toContain(milestone.name);
    for (const region of REGIONS) {
      const article = getArticle(REGION_ARTICLES[region.id]);
      expect(article.title).toBe(region.name);
      expect(article.category).toBe('lore');
      expect(textOf('licenses')).toContain(region.name);
    }
  });
});

describe('the tutorial', () => {
  it('points every line that has more to it at an article that exists', () => {
    for (const line of LINES) {
      if (line.wiki !== undefined) expect(isArticle(line.wiki), `${line.id} → ${line.wiki}`).toBe(true);
    }
    // Every step and hint has one; only the goodbye goes without.
    expect(LINES.filter((line) => !line.wiki).map((line) => line.id)).toEqual(['penny-farewell']);
  });
});

describe('searching', () => {
  it('puts an article whose title has the word first', () => {
    expect(searchWiki('sponsor')[0]?.id).toBe('sponsors');
    expect(searchWiki('coaxia')[0]?.id).toBe('coaxia');
    expect(searchWiki('Penny')[0]?.id).toBe('penny-cash');
  });

  it('wants every word, in any order and any case', () => {
    const hits = searchWiki('RENEWAL license').map((a) => a.id);
    expect(hits).toContain('auctions');
    expect(hits).not.toContain('morale');
    expect(searchWiki('zzzz')).toEqual([]);
    expect(searchWiki('   ')).toEqual([]);
  });

  it('finds words that are only in a table or a box of facts', () => {
    expect(searchWiki('Nipkow').map((a) => a.id)).toEqual(['amplify-hills']);
    expect(searchWiki('typewriter').map((a) => a.id)).toContain('research');
  });
});
