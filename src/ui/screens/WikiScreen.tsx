import { Fragment, useEffect, useRef } from 'react';
import type { GameState } from '../../sim/state';
import { ARTICLES, HOME, articlesIn, getArticle, isArticle, searchWiki, sponsorOf, titleOf } from '../../wiki/articles';
import { parseInline } from '../../wiki/markup';
import { CATEGORIES, type Article, type ArticleId, type Block, type CategoryId } from '../../wiki/types';
import { SponsorLogo } from '../SponsorLogo';
import { useGameStore } from '../store';
import { useWiki } from '../wiki';

/** A paragraph of an article: its words, with the bold ones bold and the links live. */
function Text({ source }: { source: string }) {
  const go = useWiki((s) => s.go);
  return (
    <>
      {parseInline(source).map((part, i) => {
        if (part.kind === 'text') return <Fragment key={i}>{part.text}</Fragment>;
        if (part.kind === 'bold') return <strong key={i}>{part.text}</strong>;
        const label = part.text ?? titleOf(part.to);
        // A link to an article that isn't there reads as plain words; a test keeps that from happening.
        if (!isArticle(part.to)) return <Fragment key={i}>{label}</Fragment>;
        const to = part.to;
        return (
          <button key={i} type="button" className="wiki-link" data-sound="tab" onClick={() => go(to)}>
            {label}
          </button>
        );
      })}
    </>
  );
}

/** A part of an article written from the game that is open. */
function AsOf({ write }: { write: (day: number | null, game: GameState | null) => readonly Block[] }) {
  const game = useGameStore((s) => s.game) ?? null;
  return write(game?.day ?? null, game).map((block, i) => <BlockView key={i} block={block} />);
}

function BlockView({ block }: { block: Block }) {
  if (typeof block === 'string') {
    return (
      <p>
        <Text source={block} />
      </p>
    );
  }
  if ('asOf' in block) return <AsOf write={block.asOf} />;
  if ('list' in block || 'steps' in block) {
    const items = 'list' in block ? block.list : block.steps;
    const List = 'list' in block ? 'ul' : 'ol';
    return (
      <List>
        {items.map((item) => (
          <li key={item}>
            <Text source={item} />
          </li>
        ))}
      </List>
    );
  }
  if ('tip' in block) {
    return (
      <p className="wiki-tip">
        <strong>Tip</strong> <Text source={block.tip} />
      </p>
    );
  }
  return (
    <div className="table-scroll">
      <table className="data-table wiki-table">
        <thead>
          <tr>
            {block.table.head.map((cell) => (
              <th key={cell} scope="col">{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.table.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) =>
                c === 0 ? (
                  <th key={c} scope="row"><Text source={cell} /></th>
                ) : (
                  <td key={c}><Text source={cell} /></td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ArticleView({ article }: { article: Article }) {
  const go = useWiki((s) => s.go);
  // The lead is the first section when it has no heading of its own.
  const lead = article.sections[0]?.heading ? undefined : article.sections[0];
  const sections = lead ? article.sections.slice(1) : article.sections;
  const sponsor = sponsorOf(article.id);
  return (
    <article className="wiki-article" aria-labelledby="wiki-title">
      <p className="wiki-crumb small">
        Wiki · {CATEGORIES[article.category]}
      </p>
      <h2 id="wiki-title">{article.title}</h2>
      <p className="wiki-summary">{article.summary}</p>
      {article.facts && (
        <aside className="wiki-facts">
          {sponsor && <SponsorLogo sponsor={sponsor} size={64} />}
          <dl>
            {article.facts.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </aside>
      )}
      {lead?.body.map((block, i) => <BlockView key={i} block={block} />)}
      {sections.map((section) => (
        <section key={section.heading}>
          <h3>{section.heading}</h3>
          {section.body.map((block, i) => <BlockView key={i} block={block} />)}
        </section>
      ))}
      {article.seeAlso && article.seeAlso.length > 0 && (
        <section className="wiki-see-also">
          <h3>See also</h3>
          <ul>
            {article.seeAlso.map((id) => (
              <li key={id}>
                <button type="button" className="wiki-link" data-sound="tab" onClick={() => go(id)}>{getArticle(id).title}</button>
                <span className="muted small"> · {getArticle(id).summary}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

function Results({ query }: { query: string }) {
  const go = useWiki((s) => s.go);
  const hits = searchWiki(query);
  return (
    <div className="wiki-article" role="region" aria-label="Search results">
      <p className="wiki-crumb small">Wiki · Search</p>
      <h2>{hits.length === 0 ? 'Nothing found' : `${hits.length} article${hits.length === 1 ? '' : 's'} for “${query.trim()}”`}</h2>
      {hits.length === 0 ? (
        <p className="muted">No article has every one of those words. Try one word, or look through the contents on the left.</p>
      ) : (
        <ul className="wiki-results">
          {hits.map((article) => (
            <li key={article.id}>
              <button type="button" className="wiki-link" data-sound="tab" onClick={() => go(article.id)}>{article.title}</button>
              <span className="muted small"> · {CATEGORIES[article.category]}</span>
              <div className="small">{article.summary}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The wiki: an encyclopedia of the game and of Etheria, written like one. The
 * contents are on the left; an article links to others; a help icon anywhere
 * in the game opens the article about what it stands beside.
 */
export function WikiScreen() {
  const { article: id, back, forward, query } = useWiki();
  const { go, goBack, goForward, search } = useWiki.getState();
  const article = getArticle(id);
  const page = useRef<HTMLDivElement>(null);

  // A new article starts at its top.
  useEffect(() => {
    page.current?.scrollTo({ top: 0 });
  }, [id, query]);

  const searching = query.trim() !== '';
  return (
    <div className="wiki">
      <nav className="wiki-contents" aria-label="Contents">
        <div className="wiki-tools">
          <button type="button" onClick={goBack} disabled={back.length === 0} aria-label="Back" title="Back">‹</button>
          <button type="button" onClick={goForward} disabled={forward.length === 0} aria-label="Forward" title="Forward">›</button>
          <button type="button" onClick={() => go(HOME)} disabled={id === HOME && !searching} title="The first page">Start</button>
        </div>
        <input type="search" value={query} onChange={(e) => search(e.target.value)} placeholder={`Search ${ARTICLES.length} articles`} aria-label="Search the wiki" />
        {(Object.keys(CATEGORIES) as CategoryId[]).map((category) => (
          <section key={category}>
            <h3>{CATEGORIES[category]}</h3>
            <ul>
              {articlesIn(category).map((a) => (
                <li key={a.id}>
                  <button type="button" data-sound="tab" className={a.id === id && !searching ? 'wiki-entry active' : 'wiki-entry'} aria-current={a.id === id && !searching ? 'page' : undefined} onClick={() => go(a.id as ArticleId)}>
                    {a.title}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>
      <div className="wiki-page" ref={page} tabIndex={-1}>
        {searching ? <Results query={query} /> : <ArticleView article={article} />}
      </div>
    </div>
  );
}
