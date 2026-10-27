// Company levels (0.20.0): XP comes from milestones, months in the black,
// awards and dividends. When it adds up to a new level, Uncle Tabby pays for
// it and the level opens something. See config/levels.ts.

import { COMPANY_XP, MILESTONES } from '../config/balance';
import { levelOf, opensAtLevel, xpForLevel } from '../config/levels';
import { UNLOCKS } from '../config/unlocks';
import { addMessage, type GameState } from './state';

const formatEuro = (n: number) => `€${Math.round(n).toLocaleString('en-IE')}`;

export const companyLevel = (state: Pick<GameState, 'xp'>) => levelOf(state.xp);

/** What Uncle Tabby sends for reaching a level in this game. */
export function levelPay(state: Pick<GameState, 'difficulty'>, level: number): number {
  const scale = MILESTONES.rewardScale[state.difficulty] ?? 1;
  return Math.round((COMPANY_XP.levelPay * level * scale) / 1000) * 1000;
}

/** How far the company is to its next level: the XP since the last level, over the XP the next one takes. */
export function levelProgress(state: Pick<GameState, 'xp'>) {
  const level = levelOf(state.xp);
  const from = xpForLevel(level);
  const to = xpForLevel(level + 1);
  return { level, have: state.xp - from, need: to - from, fraction: Math.min(1, (state.xp - from) / (to - from)), toNext: to - state.xp };
}

export function addXp(draft: GameState, xp: number): void {
  draft.xp += xp;
}

/** XP for the dividend just paid: one for each COMPANY_XP.perDividend of the total paid out. */
export function addDividendXp(draft: GameState, dividend: number): void {
  addXp(draft, Math.floor(draft.dividendsPaid / COMPANY_XP.perDividend) - Math.floor((draft.dividendsPaid - dividend) / COMPANY_XP.perDividend));
}

/** What a level opens, in words. */
export function opensText(level: number): string {
  const { features, floor } = opensAtLevel(level);
  const parts = [...features.map((f) => UNLOCKS[f].name.toLowerCase()), ...(floor !== null ? [`floor ${floor} of the office`] : [])];
  return parts.length === 0 ? '' : parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Daily: every level the XP has reached is paid once, with an e-mail. Returns the levels reached. */
export function checkLevels(draft: GameState): number[] {
  const reached: number[] = [];
  const now = levelOf(draft.xp);
  while (draft.level < now) {
    const level = ++draft.level;
    const pay = levelPay(draft, level);
    draft.money += pay;
    draft.ledger.gifts += pay;
    const opens = opensText(level);
    addMessage(
      draft,
      'good',
      `Level ${level}: your company has grown.\n\nI’ve wired you ${formatEuro(pay)}.${opens ? ` It opens ${opens}.` : ''}`,
      'milestone',
    );
    reached.push(level);
  }
  return reached;
}
