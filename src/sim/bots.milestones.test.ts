import { describe, expect, it } from 'vitest';
import { tvBot } from './bots';
import { createInitialState } from './newGame';
import { slow } from './slow';
import { unlockAll } from './unlocks';
import { fromSaveFile, toSaveFile } from './save';
import type { GameState } from './state';
import { tick } from './tick';

const reached = (s: GameState) => s.milestones.map((m) => m.id);

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
  }, slow(120_000));
});
