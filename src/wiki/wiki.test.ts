import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LINES } from '../config/guide';
import { MILESTONE_LIST } from '../config/milestones';
import { TECHS } from '../config/tech';
import { GENRES } from '../config/genres';
import { REGIONS } from '../config/world';
import { SPONSOR_NAMES } from '../config/names';
import { createInitialState } from '../sim/newGame';
import { sponsorRate } from '../sim/sales';
import type { GameState, SponsorContract } from '../sim/state';
import { ARTICLES, HOME, REGION_ARTICLES, SPONSOR_ARTICLES, articlesIn, getArticle, isArticle, linksFrom, searchWiki, sponsorOf, stringsOf, titleOf } from './articles';
import { REGION_CAPITALS, REGION_TEAMS, SENATE_SEATS } from './lore';
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

describe('the regions', () => {
  it('each has its people, its sport, its capital and what to see, before "For a broadcaster"', () => {
    for (const region of REGIONS) {
      const article = getArticle(REGION_ARTICLES[region.id]);
      expect(article.sections.map((s) => s.heading), region.id).toEqual([undefined, 'The people', 'Sport', 'The capital', 'What to see', 'For a broadcaster']);
      const facts = Object.fromEntries(article.facts ?? []);
      expect(facts['Capital'], region.id).toBe(REGION_CAPITALS[region.id]);
      expect(facts['Seats in the senate'], region.id).toBe(`${SENATE_SEATS[region.id]} of 136`);
      const sport = article.sections.find((s) => s.heading === 'Sport')!.body.flatMap(stringsOf).join(' ');
      expect(sport, region.id).toContain(REGION_TEAMS[region.id].football);
      expect(sport, region.id).toContain(REGION_TEAMS[region.id].basketball);
      expect(linksIn(sport), region.id).toContain('sports-rights');
    }
    // Lore.md: 136 seats in the senate; every team and capital a name of its own.
    expect(Object.values(SENATE_SEATS).reduce((a, b) => a + b, 0)).toBe(136);
    const names = Object.values(REGION_TEAMS).flatMap((t) => [t.football, t.basketball]);
    expect(new Set(names).size).toBe(REGIONS.length * 2);
    expect(new Set(Object.values(REGION_CAPITALS)).size).toBe(REGIONS.length);
  });

  it('shows only pictures that are there, with a caption', () => {
    for (const article of ARTICLES) {
      if (!article.picture) continue;
      expect(article.picture.caption.length, article.id).toBeGreaterThan(10);
      expect(existsSync(fileURLToPath(new URL(`../../public/wiki/${article.picture.file}`, import.meta.url))), article.picture.file).toBe(true);
    }
  });
});

describe('the sponsors', () => {
  const relationText = (name: string, game: GameState | null) => {
    const section = getArticle(SPONSOR_ARTICLES[name]!).sections.find((s) => s.heading === `Your company and ${name}`)!;
    return section.body.flatMap((b) => (typeof b !== 'string' && 'asOf' in b ? b.asOf(game?.day ?? null, game) : [])).flatMap(stringsOf).map((text) => plainText(text, titleOf)).join(' ');
  };

  it('has a page for every sponsor, with its name for a title, listed on Brands of Etheria', () => {
    expect(Object.keys(SPONSOR_ARTICLES).sort()).toEqual([...SPONSOR_NAMES].sort());
    for (const name of SPONSOR_NAMES) {
      const id = SPONSOR_ARTICLES[name]!;
      expect(getArticle(id).title).toBe(name);
      expect(getArticle(id).category).toBe('lore');
      expect(sponsorOf(id)).toBe(name);
      expect(linksFrom(getArticle('brands')), name).toContain(id);
    }
    expect(sponsorOf('brands')).toBeUndefined();
  });

  it('says how well the open game knows a sponsor, with the rates of the game', () => {
    expect(relationText('Beerstar', null)).toBe('Open a game to see how well you know them.');
    const fresh = createInitialState(1);
    expect(relationText('Beerstar', fresh)).toContain('You have not worked with Beerstar yet');
    expect(relationText('Beerstar', fresh)).toContain(`level 1, which pays ${Math.round((sponsorRate(1) - 1) * 100)}% over`);
    const known: GameState = {
      ...fresh,
      relations: { Beerstar: { level: 3, points: 0 }, Tahoma: { level: 2, points: 5 } },
      contracts: [{ sponsor: 'Beerstar' } as SponsorContract],
    };
    expect(relationText('Beerstar', known)).toBe(`Level 3: Beerstar pays ${Math.round((sponsorRate(3) - 1) * 100)}% over the normal ad rate. Under contract now.`);
    expect(relationText('Tahoma', known)).toContain('No contract now.');
    expect(relationText('Citrus', known)).toContain('You have not worked with Citrus yet');
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
