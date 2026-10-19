// What the Inbox window shows (0.17.0, #60): the e-mail that is open and the
// filter on the list. Kept apart from the window so that a toast can open its
// e-mail, as a help icon opens an article of the wiki.

import { create } from 'zustand';

/** Which e-mails the list shows. */
export type InboxFilter = 'all' | 'unread' | 'high';

interface InboxView {
  /** The e-mail that is open, by its message id, or null for none. */
  open: number | null;
  filter: InboxFilter;
  /** Goes up every time something outside the inbox asks for an e-mail; the app shows the window when it does. */
  asked: number;

  /** Opens an e-mail in the window. */
  read(id: number | null): void;
  /** Opens the inbox at an e-mail, from anywhere in the game. */
  show(id: number): void;
  setFilter(filter: InboxFilter): void;
}

export const useInbox = create<InboxView>()((setState) => ({
  open: null,
  filter: 'all',
  asked: 0,

  read: (open) => setState({ open }),
  // The e-mail asked for is shown whatever the filter is.
  show: (open) => setState((s) => ({ open, filter: 'all', asked: s.asked + 1 })),
  setFilter: (filter) => setState({ filter }),
}));
