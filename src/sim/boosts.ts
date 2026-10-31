// What furniture does besides standing there: the boosts on FurnitureSpec (config/office.ts), read by the sim.

import { furnitureSpec, type FurnitureBoost, type RoomType } from '../config/office';
import type { GameState, RentedRoom } from './state';

type Kind = FurnitureBoost['kind'];
type OfKind<K extends Kind> = Extract<FurnitureBoost, { kind: K }>;

/**
 * The strongest boost of a kind among a room's furniture, or undefined without one. Only the strongest counts,
 * so one piece of a kind counts per room, however many stand there. `match` narrows to the boosts that apply
 * (for a skill boost, the role).
 */
export function roomBoost<K extends Kind>(room: RentedRoom, kind: K, match?: (boost: OfKind<K>) => boolean): OfKind<K> | undefined {
  let best: OfKind<K> | undefined;
  for (const item of room.furniture) {
    const boosts = furnitureSpec(item.type).boosts;
    if (!boosts) continue;
    for (const boost of boosts) {
      if (boost.kind !== kind) continue;
      const b = boost as OfKind<K>;
      if (match && !match(b)) continue;
      if (!best || b.amount > best.amount) best = b;
    }
  }
  return best;
}

/** The amount of the strongest boost of a kind in a room: 0 without one. */
export const roomBoostAmount = <K extends Kind>(room: RentedRoom, kind: K, match?: (boost: OfKind<K>) => boolean) => roomBoost(room, kind, match)?.amount ?? 0;

/** The strongest boost of a kind in any room of the company that is one of `roomTypes`: 0 without one. */
export function companyBoostAmount(state: GameState, kind: Kind, ...roomTypes: RoomType[]): number {
  let best = 0;
  for (const room of state.rooms) if (room.type && roomTypes.includes(room.type)) best = Math.max(best, roomBoostAmount(room, kind));
  return best;
}
