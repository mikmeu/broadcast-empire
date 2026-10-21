import { describe, expect, it } from 'vitest';
import { GUARD_CANDIDATES, SECURITY } from '../config/balance';
import { HINTS } from '../config/guide';
import { FURNITURE, ROOM_TYPE_NAMES } from '../config/office';
import { TO_RECORD } from '../config/voiceOver';
import { buildRoom, hire, type ActionResult } from './actions';
import { sensibleBot } from './bots';
import { generateCandidates } from './generate';
import { addMissingEquipment } from './fixtures';
import { createInitialState } from './newGame';
import { employeesWithDesk } from './office';
import { Rng } from './rng';
import { proposeRoom } from './rooms';
import { advance } from './tick';
import { guardCapacity, guardedHosts, moraleTarget, runFans, targets } from './upkeep';
import type { Employee, GameState } from './state';
import { unlockAll } from './unlocks';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}

/** A radio station from the sensible test player, a month on the air, with everything open and money to spare. */
const station = (): GameState => {
  const s = structuredClone(unlockAll(advance(sensibleBot(createInitialState(1)), 30)));
  s.money = 5_000_000;
  s.floorsUnlocked = Math.max(s.floorsUnlocked, 2);
  return s;
};

/** The station with `fames` for its hosts, and a made-up host for each fame beyond the ones it had. */
function withHosts(fames: number[]): GameState {
  const s = station();
  const base = s.employees.find((e) => e.role === 'host')!;
  s.employees = s.employees.filter((e) => e.role !== 'host');
  fames.forEach((fame, i) => s.employees.push({ ...structuredClone(base), id: `host-${i}`, name: `Host ${i}`, fame, hiredOn: i, morale: 70 }));
  return s;
}

/** A security room with its desk, and one guard hired at it. */
function withGuard(state: GameState, skill = 50): GameState {
  const floor = Array.from({ length: state.floorsUnlocked }, (_, i) => i + 1).find((f) => proposeRoom(state, f, 'securityRoom'))!;
  const built = ok(buildRoom(state, { ...proposeRoom(state, floor, 'securityRoom')!, type: 'securityRoom' }));
  const equipped = ok(addMissingEquipment(built, built.lastId!));
  const s = structuredClone(equipped);
  s.candidates.push({ id: 'guard-1', name: 'Test guard', role: 'guard', skill, salary: 500, specialties: [], fame: 0, department: null, foundFor: null });
  return ok(hire(s, 'guard-1'));
}

const host = (s: GameState, id: string): Employee => s.employees.find((e) => e.id === id)!;

describe('Security room and guards (0.18.0, #41)', () => {
  it('has a room, a desk and a job of its own', () => {
    expect(ROOM_TYPE_NAMES.securityRoom).toBe('Security room');
    expect(FURNITURE.securityDesk.rooms).toEqual(['securityRoom']);
  });

  it('never touches a host below the fame threshold', () => {
    const s = withHosts([SECURITY.minFame - 1]);
    expect(targets(s)).toHaveLength(0);
    const guarded = withGuard(s);
    const desked = employeesWithDesk(s);
    expect(moraleTarget(s, host(s, 'host-0'), desked)).toBe(moraleTarget(guarded, host(guarded, 'host-0'), employeesWithDesk(guarded)));
    const draft = structuredClone(s);
    const before = draft.messages.length;
    for (let seed = 0; seed < 500; seed++) runFans(draft, new Rng(seed), desked);
    expect(draft.messages.length).toBe(before);
    expect(host(draft, 'host-0').morale).toBe(70);
  });

  it('lowers the morale goal of an unguarded target by the penalty', () => {
    const s = withHosts([SECURITY.minFame + 10]);
    const guarded = withGuard(s);
    expect(guardedHosts(guarded, employeesWithDesk(guarded)).has('host-0')).toBe(true);
    const bare = moraleTarget(s, host(s, 'host-0'), employeesWithDesk(s));
    const safe = moraleTarget(guarded, host(guarded, 'host-0'), employeesWithDesk(guarded));
    expect(safe - bare).toBeCloseTo(SECURITY.penalty, 5);
  });

  it('puts the most famous hosts under guard first', () => {
    const fames = [90, 60, 80, 70, 55, 52, 40];
    const s = withGuard(withHosts(fames));
    const desked = employeesWithDesk(s);
    const capacity = guardCapacity(s, desked);
    expect(capacity).toBeGreaterThan(0);
    expect(capacity).toBeLessThanOrEqual(SECURITY.hostsEach);
    const guarded = guardedHosts(s, desked);
    const byFame = targets(s).map((e) => e.id);
    expect(byFame).toHaveLength(6);
    expect([...guarded].sort()).toEqual(byFame.slice(0, capacity).sort());
    expect(guarded.has('host-6')).toBe(false);
  });

  it('counts a guard without a desk for nothing', () => {
    const s = withHosts([80]);
    s.candidates.push({ id: 'guard-1', name: 'Test guard', role: 'guard', skill: 50, salary: 500, specialties: [], fame: 0, department: null, foundFor: null });
    const hired = ok(hire(s, 'guard-1'));
    expect(guardCapacity(hired, employeesWithDesk(hired))).toBe(0);
  });

  it('lets a fan in only to hosts nobody guards', () => {
    const fames = [90, 80, 70, 60, 55, 52];
    const s = withGuard(withHosts(fames));
    const desked = employeesWithDesk(s);
    const guarded = guardedHosts(s, desked);
    const hurt = new Set<string>();
    const draft = structuredClone(s);
    for (let seed = 0; seed < 3_000; seed++) {
      for (const e of draft.employees) e.morale = 70;
      draft.messages.length = 0;
      runFans(draft, new Rng(seed), desked);
      for (const e of draft.employees.filter((x) => x.role === 'host' && x.morale < 70)) {
        expect(e.morale).toBe(70 - SECURITY.incidentMorale);
        hurt.add(e.id);
      }
    }
    expect(hurt.size).toBeGreaterThan(0);
    for (const id of hurt) expect(guarded.has(id)).toBe(false);
  });

  it('is repeatable, and does not move the main random numbers', () => {
    const s = withHosts([90, 80]);
    const a = structuredClone(s);
    const b = structuredClone(s);
    const ra = new Rng(42);
    const rb = new Rng(42);
    runFans(a, ra, employeesWithDesk(a));
    runFans(b, rb, employeesWithDesk(b));
    expect(a.employees.map((e) => e.morale)).toEqual(b.employees.map((e) => e.morale));
    expect(ra.state).toBe(new Rng(42).state);
  });

  it('draws the guards last in the hiring pool', () => {
    const s = station();
    const pool = generateCandidates(s, new Rng(7), 1972);
    expect(pool.filter((c) => c.role === 'guard')).toHaveLength(GUARD_CANDIDATES);
    expect(pool.slice(-GUARD_CANDIDATES).every((c) => c.role === 'guard')).toBe(true);
  });

  it('has Penny speak of it once a host is famous and no guard is at a desk, and records it', () => {
    const line = HINTS.find((h) => h.id === 'security')!;
    expect(line.say).toContain('security room');
    expect(TO_RECORD.security).toBe('new');
  });
});
