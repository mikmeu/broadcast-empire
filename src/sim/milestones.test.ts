import { describe, expect, it } from 'vitest';
import { MILESTONES } from '../config/balance';
import { MILESTONE_LIST, type MilestoneId } from '../config/milestones';
import { poachHost, research, type ActionResult } from './actions';
import { simulateDay } from './broadcast';
import { sensibleBot } from './bots';
import { toDay } from './calendar';
import { hasMilestone } from './milestones';
import { createInitialState } from './newGame';
import { unlockAll } from './unlocks';
import { poachTargets } from './poaching';
import { PLAYER, type GameState } from './state';
import { tick } from './tick';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** The sensible bot's station on a date, with money to spend. */
function station(year = 1970, month = 1, dayOfMonth = 1): GameState {
  const s = structuredClone(unlockAll(sensibleBot(createInitialState(1))));
  s.day = toDay(year, month, dayOfMonth);
  s.money = 1_000_000;
  // unlockAll gives the technologies of the jobs (#207), some ahead of 1970: none of them is a milestone here.
  s.techs = [];
  return s;
}

describe('milestones', () => {
  it('are a list of distinct goals', () => {
    expect(new Set(MILESTONE_LIST.map((m) => m.id)).size).toBe(MILESTONE_LIST.length);
    expect(MILESTONE_LIST.every((m) => m.name && m.description)).toBe(true);
  });

  it('a new company has none, and the first broadcast earns the first', () => {
    const s = station();
    expect(s.milestones).toEqual([]);
    const next = tick(s);
    expect(next.milestones).toEqual([{ id: 'onAir', day: 1 }]);
    expect(next.messages.filter((m) => m.text.startsWith('Milestone reached: On the air.'))).toHaveLength(1);
    expect(tick(next).milestones).toEqual([{ id: 'onAir', day: 1 }]);
  });

  it('daily results count listeners per region', () => {
    const s = station();
    for (const channel of simulateDay(s).channels) {
      const byRegion = Object.values(channel.regionListeners).reduce((sum, n) => sum + n, 0);
      expect(byRegion).toBeCloseTo(channel.slots.reduce((sum, slot) => sum + slot.listeners, 0));
    }
  });

  it.each<[MilestoneId, (s: GameState) => GameState]>([
    ['regionNumberOne', (s) => (s.rivals.flatMap((r) => r.channels).flatMap((c) => c.schedule).forEach((x) => (x.quality = 0.01)), s)],
    ['householdName', (s) => ((s.employees.find((e) => e.role === 'host')!.fame = MILESTONES.hostFame + 10), s)],
    ['aheadOfItsTime', (s) => ok(research({ ...s, researchPoints: 10_000 }, 'fmStereo'))],
    ['headhunter', (s) => { const t = poachTargets(s)[0]!; return ok(poachHost(s, t.channel.id, t.slot)); }],
    ['firstDividend', (s) => ({ ...s, day: toDay(1971, 12, 31), money: 5_000_000 })],
    ['eventBroadcaster', (s) => ({ ...s, day: toDay(1970, 6, 15), eventRights: [{ eventId: 'worldCup-1970', holderId: PLAYER }] })],
    ['year1980', (s) => ({ ...s, day: toDay(1979, 12, 31) })],
  ])('%s is reached when its condition is met, and not before', (id, arrange) => {
    const before = tick(station());
    expect(hasMilestone(before, id)).toBe(false);
    expect(hasMilestone(tick(arrange(station())), id)).toBe(true);
  });

  it('the biggest ones need a big company', () => {
    const s = tick(station());
    for (const id of ['everyRegion', 'nationwide', 'bigAudience', 'firstTv', 'fullNetwork', 'dividendsLarge', 'year2030'] as const) {
      expect(hasMilestone(s, id)).toBe(false);
    }
  });
});
