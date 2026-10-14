// History (prompt.md section 11): sports events, elections and recessions fall
// in fixed years, like the technologies in config/tech.ts. What they do to
// appeal and ad rates is in EVENTS in balance.ts.

export type SportsEventKind = 'worldCup' | 'olympics';

export interface SportsEventSpec {
  name: string;
  /** Held every `every` years from `firstYear`. */
  firstYear: number;
  every: number;
  /** Opening day (month 1–12) and length in days. */
  month: number;
  dayOfMonth: number;
  days: number;
}

export const SPORTS_EVENTS: Record<SportsEventKind, SportsEventSpec> = {
  worldCup: { name: 'World Cup', firstYear: 1970, every: 4, month: 6, dayOfMonth: 10, days: 30 },
  olympics: { name: 'Olympics', firstYear: 1972, every: 4, month: 7, dayOfMonth: 25, days: 17 },
};

/** A general election every four years; the campaign fills `month`, and polling day is the 1st of the next month. */
export const ELECTIONS = { firstYear: 1971, every: 4, month: 5 };

/** Each recession lasts the whole calendar year. */
export const RECESSIONS: readonly { year: number; name: string }[] = [
  { year: 1974, name: 'The oil crisis' },
  { year: 1981, name: 'A deep recession' },
  { year: 1991, name: 'A property crash' },
  { year: 2001, name: 'The dot-com crash' },
  { year: 2009, name: 'The banking crisis' },
  { year: 2012, name: 'The debt crisis' },
  { year: 2020, name: 'The pandemic slump' },
];
