import { describe, expect, it } from 'vitest';
import { LINES, getLine } from '../config/guide';
import { UNLOCKS } from '../config/unlocks';
import { createInitialState } from '../sim/newGame';
import { vanBlocker } from '../sim/newsVans';
import { GAME_ARTICLES } from '../wiki/game';

describe('the Garage (#261)', () => {
  it('is where Penny sends the player for a news van', () => {
    expect(getLine('news-van')?.to).toBe('garage');
  });

  it('is not On air: no line or unlock points at the old vans page', () => {
    for (const line of LINES) expect(String(line.to)).not.toBe('broadcast:vans');
    for (const unlock of Object.values(UNLOCKS)) expect(unlock.window).not.toBe('broadcast:vans');
  });

  it('is closed to a new company, until the news van is researched', () => {
    expect(vanBlocker(createInitialState(1))).not.toBeNull();
  });

  it('is in the wiki, where the Milestones button is now a small one in the bar', () => {
    const text = JSON.stringify(GAME_ARTICLES);
    expect(text).toContain('Garage');
    expect(text).not.toContain('News vans page');
    expect(text).not.toContain('News vans page of the On air');
  });
});
