// History (prompt.md section 11): sports events and recessions fall in fixed
// years, like the technologies in config/tech.ts; elections are every four
// years unless the government falls (sim/politics.ts). What they do to appeal
// and ad rates is in EVENTS in balance.ts.

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

/**
 * A general election elects a president and a vice-president together. The
 * first of a game is on the 1st of `month` in `firstYear`, and each one after
 * comes `every` years after the last, unless the government falls first. The
 * campaign fills the month before polling day.
 */
export const ELECTIONS = {
  firstYear: 1971,
  /** Polling day is the 1st of this month (1–12). */
  month: 6,
  every: 4,
  /** The president in office when a game starts was elected this year, in `month`, to a first term. */
  startElected: 1967,
  /** The most terms a president serves; a term cut short by a snap election counts. */
  terms: 2,
  /** The chance that a president who may run again wins. */
  reelected: 0.55,
  /** The chance that the vice-president of a president who stands down wins. */
  vicePresidentWins: 0.5,
  /** The chance, drawn on polling day, that the government falls before its term is over. */
  snap: 0.2,
  /** When it falls: on the 1st of a month, this many months into the term. */
  fallsAfter: { min: 18, max: 36 },
  /** Months from the fall, when the news announces the snap election, to polling day. */
  noticeMonths: 2,
};

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
