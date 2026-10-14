// What the On air window shows: one of its sections, or the schedule of one
// channel. Kept apart from the window so that its pages, Penny and the menu
// can all send the player somewhere in it.

import { create } from 'zustand';
import type { Id } from '../sim/state';

/** The menu of the window, and a channel's schedule, which is a page of Channels opened from the channel. */
export type BroadcastSection = 'channels' | 'content' | 'ratings' | 'schedule';

interface OnAir {
  section: BroadcastSection;
  /** The channel whose schedule is shown, or null for the first one. */
  channelId: Id | null;
  /** Shows a section; for the schedule, of the given channel or of the one that was shown last. */
  show(section: BroadcastSection, channelId?: Id): void;
}

export const useOnAir = create<OnAir>()((set) => ({
  section: 'channels',
  channelId: null,
  show: (section, channelId) => set((now) => ({ section, channelId: channelId ?? now.channelId })),
}));
