import { describe, expect, it } from 'vitest';
import { xpForLevel } from '../config/levels';
import { FLOOR_LEVEL } from '../config/balance';
import type { ActionResult } from './actions';
import { rentRoom } from './fixtures';
import { specializationOf } from './broadcast';
import { sensibleBot } from './bots';
import { createInitialState } from './newGame';
import { unlockAll } from './unlocks';
import type { GameState } from './state';
import { tick } from './tick';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}
const error = (result: ActionResult) => (result.ok ? 'no error' : result.error);

/** The sensible bot's day-0 station: one channel in the Capital, five shows, free desks for two more staff. */
const station = () => structuredClone(unlockAll(sensibleBot(createInitialState(1))));

describe('growing offices and channels', () => {
  it('opens the second floor once the company reaches its level', () => {
    const s = station();
    expect(error(rentRoom(s, 'H'))).toMatch(/Floor 2 isn’t available/);
    const rich = { ...s, xp: xpForLevel(FLOOR_LEVEL[2]!), level: FLOOR_LEVEL[2]!, day: 30 };
    const next = tick(rich);
    expect(next.floorsUnlocked).toBe(2);
    expect(ok(rentRoom(next, 'H')).rooms.some((r) => r.roomId === 'H')).toBe(true);
  });

  it('recognises a channel specialization from three slots of one genre group', () => {
    expect(specializationOf(['top40', 'rock', 'classical', 'news', null])).toBe('Music');
    expect(specializationOf(['news', 'talk', 'news', 'top40', null])).toBe('News & Talk');
    expect(specializationOf(['top40', 'news', 'morningShow', 'radioDrama', null])).toBeNull();
  });
});
