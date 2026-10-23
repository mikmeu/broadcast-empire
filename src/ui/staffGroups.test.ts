import { describe, expect, it } from 'vitest';
import { createInitialState } from '../sim/newGame';
import { GROUPS, TEAM_TABS, groupOf, openTop, topDots, visiblePoolGroups, visibleStaffGroups } from './staffList';

const ROLES = GROUPS.flatMap((g) => g.roles);

describe('the groups of the Staff window', () => {
  it('has every role in exactly one group, and every tab of the list in one group', () => {
    expect(new Set(ROLES).size).toBe(ROLES.length);
    expect(ROLES).toHaveLength(20);
    for (const tab of TEAM_TABS) expect(new Set(tab.roles.map((r) => groupOf([r]))).size).toBe(1);
  });

  it('hides a group until something in it can be hired', () => {
    const game = createInitialState(1);
    const ids = visiblePoolGroups(game).map((g) => g.id);
    expect(ids).toContain('hosts');
    expect(ids).toContain('management');
    expect(visiblePoolGroups(game).find((g) => g.id === 'business')?.tabs.map((t) => t.id) ?? []).not.toContain('sales');
    expect(visibleStaffGroups(game).map((g) => g.id)).toEqual(ids.filter((id) => visibleStaffGroups(game).some((g) => g.id === id)));
  });

  it('gives a group with one kind of staff a single tab, so no second row', () => {
    const game = createInitialState(1);
    expect(visiblePoolGroups(game).find((g) => g.id === 'hosts')!.tabs).toHaveLength(1);
    expect(visibleStaffGroups(game).find((g) => g.id === 'hosts')!.tabs).toHaveLength(1);
  });

  it('opens on Hiring for a company with nobody, otherwise on the last tab used', () => {
    const game = createInitialState(1);
    expect(openTop(game, null)).toBe('hiring');
    expect(openTop(game, 'teams')).toBe('teams');
    expect(openTop({ ...game, employees: [{ ...game.candidates[0]! } as never] }, null)).toBe('staff');
  });

  it('shows no dots in a new company', () => {
    expect(topDots(createInitialState(1))).toEqual({ staff: false, teams: false, hiring: false });
  });
});
