// The venues an event can be held at (0.22.0, #404): three made-up halls in the country, small, medium and large,
// or the player's own event hall, whose size is its seating. The prices are in `EVENT_COSTS` in balance.ts.

import type { OwnEventKind } from './balance';
import type { RegionId } from './world';

export type VenueSize = 'small' | 'medium' | 'large';

/** Small, medium, large: the order in which they grow. */
export const VENUE_SIZES: readonly VenueSize[] = ['small', 'medium', 'large'];

export interface Venue {
  id: VenueSize;
  name: string;
  region: RegionId;
  about: string;
}

/** The three venues outside. Rent is paid per region the channel broadcasts in, whatever the venue. */
export const VENUES: Record<VenueSize, Venue> = {
  small: { id: 'small', name: 'The Dial Room', region: 'capital', about: 'A club hall in Coaxia, with a stage the size of a kitchen table and a bar that never closes. Fits a concert.' },
  medium: { id: 'medium', name: 'Aerial Fields Assembly Hall', region: 'heartland', about: 'A town hall with a balcony and a velvet curtain, where weddings and galas have been held since 1952. Fits a gala.' },
  large: { id: 'large', name: 'Skywave Arena', region: 'coast', about: 'A glass arena by the sea, with a roof that opens when it doesn’t rain. Fits a telethon.' },
};

/** The smallest venue each kind of event can be held at: a venue takes its own kind and every smaller one. */
export const EVENT_SIZE: Record<OwnEventKind, VenueSize> = { concert: 'small', gala: 'medium', telethon: 'large' };

/** Whether a venue of this size is big enough for the kind of event. */
export const venueFits = (size: VenueSize, kind: OwnEventKind): boolean => VENUE_SIZES.indexOf(size) >= VENUE_SIZES.indexOf(EVENT_SIZE[kind]);

/** The blocks of audience seating that make an event hall small, medium or large: 2, 3, and 4 or more. */
export const HALL_SEATING: Record<VenueSize, number> = { small: 2, medium: 3, large: 4 };

/** How big an event hall with this many blocks of audience seating is. */
export function hallSize(blocks: number): VenueSize {
  return blocks >= HALL_SEATING.large ? 'large' : blocks >= HALL_SEATING.medium ? 'medium' : 'small';
}
