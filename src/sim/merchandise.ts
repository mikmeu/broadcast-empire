// Merchandise (0.20.0): tapes, toys, shirts and mugs from the shows a station
// makes itself. A licensing deal run by Sales, paid each day like music
// royalties, but as income. The numbers are in MERCH in config/balance.ts.

import { MERCH } from '../config/balance';
import { getGenre } from '../config/genres';
import { mailLift } from './calls';
import { isLicensed } from './content';
import type { Desks } from './office';
import { isUnlocked } from './unlocks';
import { addMessage, type DayResult, type GameState, type Show } from './state';

/** Of a slot's revenue, what a show's merchandise adds at full fans and quality 1: nothing for a bought title, whose rights are not yours. */
export function merchandiseShare(show: Pick<Show, 'genre'>): number {
  if (isLicensed(show.genre)) return 0;
  return MERCH.share[show.genre] ?? MERCH.mediumShare[getGenre(show.genre).medium] ?? 0;
}

/** 0 up to MERCH.minQuality, then rising evenly to 1 at quality 1. */
export const qualityCurve = (quality: number) => Math.max(0, Math.min(1, (quality - MERCH.minQuality) / (1 - MERCH.minQuality)));

/** Whether merchandise is open (level 6) and a sales employee sits at a desk: the licences need someone to look after them. */
export const hasMerchandiseDeal = (state: GameState, desked: Desks) =>
  isUnlocked(state, 'merchandise') && state.employees.some((e) => e.role === 'sales' && desked.has(e.id));

/** What a slot's merchandise brings in a day, given the show's fans. */
export const merchandiseFor = (show: Show, slot: { revenue: number; quality: number }) => slot.revenue * merchandiseShare(show) * qualityCurve(slot.quality) * (show.fans ?? 0);

/** The slots of the player's channels that aired a show of their own today. */
function ownSlots(draft: GameState, result: DayResult) {
  return result.channels
    .filter((c) => c.isPlayer)
    .flatMap((c) => c.slots)
    .flatMap((slot) => {
      const show = slot.showId && !slot.titleId ? draft.shows.find((s) => s.id === slot.showId) : undefined;
      return show ? [{ show, slot }] : [];
    });
}

/** Daily: a show that aired moves its fans towards its quality; one off the air loses them slowly. */
export function growFans(draft: GameState, result: DayResult): void {
  const aired = new Map<string, number>();
  for (const { show, slot } of ownSlots(draft, result)) aired.set(show.id, Math.max(aired.get(show.id) ?? 0, Math.min(1, slot.quality)));
  for (const show of draft.shows) {
    const quality = aired.get(show.id);
    const fans = show.fans ?? 0;
    show.fans = quality === undefined ? Math.max(0, fans - MERCH.fade) : fans + (quality - fans) * MERCH.grow;
  }
}

/** Daily: every show of your own that aired pays its merchandise, while a sales employee is at a desk. */
export function sellMerchandise(draft: GameState, result: DayResult, desked: Desks): void {
  if (!hasMerchandiseDeal(draft, desked)) return;
  // The call agents who have no calls left take mail orders, which sell more (0.20.0; see sim/calls.ts).
  const mail = 1 + mailLift(result.calls);
  for (const { show, slot } of ownSlots(draft, result)) {
    const amount = merchandiseFor(show, slot) * mail;
    if (amount <= 0) continue;
    draft.money += amount;
    draft.ledger.revenue += amount;
    draft.ledger.merchandise += amount;
    slot.merchandise = (slot.merchandise ?? 0) + amount;
    if (!show.sells) {
      show.sells = true;
      addMessage(draft, 'good', `Merchandise from “${show.name}” is in the shops. Sales looks after the licences.`, 'routine');
    }
  }
}

/** Fans an award brings a show of the player's. */
export function awardFans(draft: GameState, showId: string | null, kind: keyof typeof MERCH.awardFans): void {
  const show = draft.shows.find((s) => s.id === showId);
  if (show) show.fans = Math.min(1, (show.fans ?? 0) + MERCH.awardFans[kind]);
}

/** Merchandise per day for a show on yesterday's slot (for the UI): what it would earn now. */
export function dailyMerchandise(state: GameState, showId: string): number {
  const show = state.shows.find((s) => s.id === showId);
  if (!show) return 0;
  const slots = (state.lastDay?.channels ?? []).filter((c) => c.isPlayer).flatMap((c) => c.slots).filter((s) => s.showId === showId && !s.titleId);
  return slots.reduce((sum, s) => sum + (s.merchandise ?? 0), 0);
}
