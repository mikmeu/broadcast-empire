import { create } from 'zustand';
import { HOME } from '../wiki/articles';
import type { ArticleId } from '../wiki/types';

/**
 * Where the reader is in the wiki: the article in view, the way back and
 * forward, and what is typed in the search box. It lives outside the window so
 * that a help icon anywhere in the game, or the tutorial, can open an article.
 */
interface WikiView {
  article: ArticleId;
  back: ArticleId[];
  forward: ArticleId[];
  query: string;
  /** Goes up every time something outside the wiki asks for an article; the app shows the window when it does. */
  asked: number;

  /** Follows a link inside the wiki. */
  go(article: ArticleId): void;
  /** Opens the wiki at an article, from anywhere in the game. */
  open(article: ArticleId): void;
  goBack(): void;
  goForward(): void;
  search(query: string): void;
}

export const useWiki = create<WikiView>()((setState) => ({
  article: HOME,
  back: [],
  forward: [],
  query: '',
  asked: 0,

  go: (article) => setState((s) => (article === s.article ? { query: '' } : { article, back: [...s.back, s.article], forward: [], query: '' })),
  open: (article) => setState((s) => ({ ...(article === s.article ? {} : { article, back: [...s.back, s.article], forward: [] }), query: '', asked: s.asked + 1 })),
  goBack: () => setState((s) => (s.back.length === 0 ? s : { article: s.back[s.back.length - 1]!, back: s.back.slice(0, -1), forward: [s.article, ...s.forward], query: '' })),
  goForward: () => setState((s) => (s.forward.length === 0 ? s : { article: s.forward[0]!, back: [...s.back, s.article], forward: s.forward.slice(1), query: '' })),
  search: (query) => setState({ query }),
}));
