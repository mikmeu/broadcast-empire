import { describe, expect, it } from 'vitest';
import { MILESTONES } from '../config/balance';
import { MILESTONE_LIST, type MilestoneId } from '../config/milestones';
import { DEFAULT_SETTINGS, parseSettings } from '../persistence/settings';
import { poachHost, research, type ActionResult } from './actions';
import { simulateDay } from './broadcast';
import { sensibleBot, tvBot } from './bots';
import { toDay } from './calendar';
import { hasMilestone } from './milestones';
import { createInitialState } from './newGame';
import { unlockAll } from './unlocks';
import { poachTargets } from './poaching';
import { fromSaveFile, SAVE_VERSION, toSaveFile } from './save';
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
  return s;
}

const reached = (s: GameState) => s.milestones.map((m) => m.id);

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

describe('settings', () => {
  it('fall back to the defaults for anything missing or invalid', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ theme: 'sepia', difficulty: 'impossible', autosave: 'yes', soundVolume: Number.NaN })).toEqual(DEFAULT_SETTINGS);
  });

  it('keep valid values, clamp volumes and survive being stored as JSON', () => {
    const chosen = { theme: 'dark', difficulty: 'hard', autosave: false, reduceMotion: true, soundVolume: 35, musicVolume: 0, voiceVolume: 60, checkUpdates: false } as const;
    expect(parseSettings(JSON.parse(JSON.stringify(chosen)))).toEqual(chosen);
    expect(parseSettings({ soundVolume: 250, musicVolume: -3 })).toMatchObject({ soundVolume: 100, musicVolume: 0, voiceVolume: 100 });
  });

  it('the chosen difficulty is fixed in the new game', () => {
    expect(createInitialState(7, parseSettings({ difficulty: 'hard' }).difficulty).difficulty).toBe('hard');
  });
});

describe('saves from Phase 5a', () => {
  it('upgrade with no milestones, which are then picked up on the next day', () => {
    const played = tick(station());
    const old = structuredClone(played) as unknown as Record<string, unknown> & GameState;
    delete (old as Record<string, unknown>).milestones;
    for (const c of old.lastDay!.channels) delete (c as unknown as Record<string, unknown>).regionListeners;
    for (const day of old.week) for (const c of day.channels) delete (c as unknown as Record<string, unknown>).regionListeners;
    const { state, version } = fromSaveFile({ version: 8, savedAt: 1, state: old });
    expect(version).toBe(SAVE_VERSION);
    expect(state.milestones).toEqual([]);
    expect(state.lastDay!.channels.every((c) => c.regionListeners !== undefined)).toBe(true);
    expect(reached(tick(state))).toEqual(['onAir']);
  });
});

// --- Phase 5b acceptance (prompt.md section 14) ---

describe('Phase 5b acceptance', () => {
  it('each milestone fires once and is stored in the save', () => {
    let s = unlockAll(createInitialState(1));
    const announced: string[] = [];
    while (s.day < 12 * 365) {
      const seen = s.nextMessageId;
      s = tick(tvBot(s));
      announced.push(...s.messages.filter((m) => m.id >= seen && m.text.startsWith('Milestone reached')).map((m) => m.text));
    }
    const ids = reached(s);
    // A growing radio and TV company reaches the early milestones within twelve years…
    for (const id of ['onAir', 'firstProfit', 'firstSponsor', 'regionNumberOne', 'radioLeader', 'firstTv', 'firstDividend', 'dividendsSmall', 'year1980'] as const) {
      expect(ids).toContain(id);
    }
    // …each of them exactly once, announced once, in the order they happened.
    expect(new Set(ids).size).toBe(ids.length);
    expect(announced).toHaveLength(ids.length);
    expect(new Set(announced).size).toBe(announced.length);
    expect(s.milestones.every((m, i) => i === 0 || m.day >= s.milestones[i - 1]!.day)).toBe(true);

    // They are part of the save, and loading doesn't award them again.
    const restored = fromSaveFile(JSON.parse(JSON.stringify(toSaveFile(s, 1)))).state;
    expect(restored.milestones).toEqual(s.milestones);
    const next = tick(tvBot(restored));
    expect(next.milestones.slice(0, ids.length)).toEqual(s.milestones);
    expect(next.messages.filter((m) => m.id >= restored.nextMessageId && m.text.startsWith('Milestone reached')).length).toBe(next.milestones.length - ids.length);
  }, 120_000);
});
