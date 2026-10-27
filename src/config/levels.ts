// Company levels (0.20.0): milestones, months in the black, awards and
// dividends give XP; the XP adds up to levels, and each level opens something.
// The numbers are in XP and FLOOR_LEVEL in balance.ts; what a feature needs is
// in config/unlocks.ts. The rules are in sim/levels.ts.

import { FLOOR_LEVEL, COMPANY_XP } from './balance';
import { FEATURES, UNLOCKS, type Feature } from './unlocks';

/** Company XP in total at which a level is reached. Level 0 is the start; past level 10 each step is bigger than the one before, without end. */
export function xpForLevel(level: number): number {
  if (level <= 0) return 0;
  const known = COMPANY_XP.totals;
  if (level <= known.length) return known[level - 1]!;
  let total = known[known.length - 1]!;
  let step = total - known[known.length - 2]!;
  for (let n = known.length + 1; n <= level; n++) {
    step = Math.round((step * COMPANY_XP.growth) / 5) * 5;
    total += step;
  }
  return total;
}

/** The level a company with this much XP has reached. */
export function levelOf(xp: number): number {
  let level = 0;
  while (xp >= xpForLevel(level + 1)) level++;
  return level;
}

/** What a level opens: its features and, if it is one, the office floor. */
export function opensAtLevel(level: number): { features: Feature[]; floor: number | null } {
  const floor = Object.entries(FLOOR_LEVEL).find(([, at]) => at === level);
  return { features: FEATURES.filter((f) => UNLOCKS[f].level === level), floor: floor ? Number(floor[0]) : null };
}

/** The highest floor a company of this level may build on (1 is the ground floor). */
export function floorsAtLevel(level: number): number {
  return Math.max(1, ...Object.entries(FLOOR_LEVEL).filter(([, at]) => at <= level).map(([floor]) => Number(floor)));
}
