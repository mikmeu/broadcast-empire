import { getArticle } from '../wiki/articles';
import type { ArticleId } from '../wiki/types';
import { useWiki } from './wiki';

/** A small question mark that opens the wiki at the article about what it stands beside. */
export function HelpLink({ article }: { article: ArticleId }) {
  const { title } = getArticle(article);
  return (
    <button type="button" className="help-link" onClick={() => useWiki.getState().open(article)} aria-label={`Wiki: ${title}`} title={`Wiki: ${title}`}>
      ?
    </button>
  );
}
