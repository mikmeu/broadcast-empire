// Regions, audiences and time slots (prompt.md section 4). The country and its regions are described in lore.md.

/** The fictional country the game is set in. */
export const COUNTRY = 'Etheria';

export type RegionId = 'capital' | 'north' | 'coast' | 'heartland' | 'highlands';

export interface Region {
  /** Internal id; the ids predate the lore, so 'capital' is Coaxia, 'north' Transponder Valley, and so on. */
  id: RegionId;
  name: string;
  population1970: number;
  /** Yearly population growth, e.g. 0.015 = 1.5%. */
  growth: number;
  /** The three audiences that are more common here than elsewhere (lore.md); see REGIONAL_AUDIENCES in balance.ts. */
  mainAudiences: readonly AudienceId[];
}

export const REGIONS: readonly Region[] = [
  { id: 'capital', name: 'Coaxia', population1970: 2_500_000, growth: 0.015, mainAudiences: ['teens', 'students', 'professionals'] },
  { id: 'north', name: 'Transponder Valley', population1970: 1_800_000, growth: 0.005, mainAudiences: ['workers', 'professionals', 'students'] },
  { id: 'coast', name: 'Skywave Beach', population1970: 1_200_000, growth: 0.012, mainAudiences: ['professionals', 'families', 'seniors'] },
  { id: 'heartland', name: 'Aerial Fields', population1970: 800_000, growth: 0.003, mainAudiences: ['teens', 'workers', 'families'] },
  { id: 'highlands', name: 'Amplify Hills', population1970: 500_000, growth: 0.008, mainAudiences: ['families', 'seniors', 'workers'] },
];

export function getRegion(id: RegionId): Region {
  const region = REGIONS.find((r) => r.id === id);
  if (!region) throw new Error(`Unknown region ${id}`);
  return region;
}

export type AudienceId = 'teens' | 'students' | 'families' | 'workers' | 'professionals' | 'seniors';

export interface Audience {
  id: AudienceId;
  name: string;
  /** Share of a region's population in 1970 and in 2030; it shifts evenly in between. Each adds up to 1. */
  share: number;
  share2030: number;
  /** Multiplier on ad revenue from this audience. */
  sponsorValue: number;
}

export const AUDIENCES: readonly Audience[] = [
  { id: 'teens', name: 'Teens', share: 0.12, share2030: 0.09, sponsorValue: 0.8 },
  { id: 'students', name: 'Students', share: 0.08, share2030: 0.1, sponsorValue: 0.7 },
  { id: 'families', name: 'Families', share: 0.25, share2030: 0.21, sponsorValue: 1.2 },
  { id: 'workers', name: 'Workers', share: 0.25, share2030: 0.22, sponsorValue: 1.0 },
  { id: 'professionals', name: 'Professionals', share: 0.12, share2030: 0.16, sponsorValue: 1.5 },
  { id: 'seniors', name: 'Seniors', share: 0.18, share2030: 0.22, sponsorValue: 0.9 },
];

export type Medium = 'radio' | 'tv';

export const SLOTS = ['morning', 'lunch', 'afternoon', 'evening', 'lateNight'] as const;
export type Slot = (typeof SLOTS)[number];
export const SLOT_NAMES: Record<Slot, string> = {
  morning: 'Morning',
  lunch: 'Lunch',
  afternoon: 'Afternoon',
  evening: 'Evening',
  lateNight: 'Late night',
};

/**
 * A month of the calendar is one day at the office: the clock beside the date
 * runs from 8 in the morning on the first of the month to 10 at night on the last.
 */
export const OFFICE_DAY = { from: 8, to: 22 } as const;

/** When each slot is on the air by that clock, in hours: the first show starts at half past eight, the last ends at half past nine. */
export const SLOT_HOURS: Record<Slot, readonly [from: number, to: number]> = {
  morning: [8.5, 11.5],
  lunch: [11.5, 14],
  afternoon: [14, 17],
  evening: [17, 19.5],
  lateNight: [19.5, 21.5],
};

/** Share of each audience tuned in per slot, in SLOTS order (section 4.3). */
export const TUNED_IN: Record<Medium, Record<AudienceId, readonly number[]>> = {
  radio: {
    teens: [0.15, 0.05, 0.25, 0.2, 0.2],
    students: [0.15, 0.1, 0.15, 0.2, 0.3],
    families: [0.35, 0.15, 0.15, 0.15, 0.05],
    workers: [0.45, 0.25, 0.3, 0.1, 0.05],
    professionals: [0.4, 0.1, 0.2, 0.1, 0.05],
    seniors: [0.35, 0.3, 0.25, 0.15, 0.05],
  },
  tv: {
    teens: [0.05, 0.05, 0.3, 0.45, 0.25],
    students: [0.05, 0.1, 0.2, 0.4, 0.35],
    families: [0.1, 0.05, 0.25, 0.6, 0.1],
    workers: [0.05, 0.05, 0.1, 0.6, 0.2],
    professionals: [0.05, 0.05, 0.05, 0.5, 0.2],
    seniors: [0.15, 0.2, 0.3, 0.55, 0.1],
  },
};
