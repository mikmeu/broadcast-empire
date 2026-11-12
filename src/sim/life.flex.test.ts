// A flex worker who stands in for whoever is away (0.20.2, #265).

import { describe, expect, it } from 'vitest';
import { LIFE, SEVERANCE_MONTHS } from '../config/balance';
import { endTemp, hireFlexWorker, hireTemp, letFlexWorkerGo } from './actions';
import { sensibleBot } from './bots';
import { monthlyCosts } from './economy';
import { assignFlex, freeFlexWorkers } from './life';
import { createInitialState } from './newGame';
import { fromSaveFile, SAVE_VERSION, toSaveFile } from './save';
import { skillAtWork } from './staff';
import type { Employee, GameState } from './state';
import { notWorking } from './teams';
import { unlockAll } from './unlocks';

function station(): GameState {
  const s = structuredClone(unlockAll(sensibleBot(createInitialState(1))));
  for (const e of s.employees) e.away = null;
  return s;
}

const away = (s: GameState, e: Employee, days = 5) => {
  e.away = { reason: 'sick', from: s.day, until: s.day + days, temp: null };
};

function withFlex(s: GameState, count = 1): GameState {
  let state = s;
  for (let i = 0; i < count; i++) {
    const done = hireFlexWorker(state);
    if (!done.ok) throw new Error(done.error);
    state = done.state;
  }
  return structuredClone(state);
}

const of = (s: GameState, role: Employee['role']) => s.employees.filter((e) => e.role === role);

describe('flex workers', () => {
  it('are taken on at the monthly price and added to the payroll', () => {
    const s = station();
    const before = monthlyCosts(s).salaries;
    const state = withFlex(s, 2);
    expect(state.flexWorkers).toHaveLength(2);
    expect(state.flexWorkers[0]).toMatchObject({ salary: LIFE.flex.salary, hiredOn: s.day });
    expect(state.flexWorkers[0]!.name).not.toBe('');
    expect(monthlyCosts(state).salaries).toBe(before + 2 * LIFE.flex.salary);
  });

  it('stand in for someone who is away at once, at the skill of a temp and for no extra pay', () => {
    const state = withFlex(station());
    const worker = of(state, 'cleaner')[0] ?? state.employees.find((e) => e.role !== 'host')!;
    away(state, worker);
    expect(notWorking(state, worker)).toBe(true);
    const costs = monthlyCosts(state).salaries;
    assignFlex(state);
    expect(worker.away!.temp).toEqual({ name: state.flexWorkers[0]!.name, salary: 0, flexId: state.flexWorkers[0]!.id });
    expect(notWorking(state, worker)).toBe(false);
    expect(skillAtWork(worker)).toBeLessThan(worker.skill);
    expect(monthlyCosts(state).salaries).toBe(costs);
    expect(freeFlexWorkers(state)).toHaveLength(0);
  });

  it('cover channel managers first, then production, then the best paid', () => {
    const state = withFlex(station());
    const [low, high] = [...state.employees.filter((e) => e.role === 'cleaner' || e.role === 'technician' || e.role === 'sales')].sort((a, b) => a.salary - b.salary).filter((_, i, all) => i === 0 || i === all.length - 1);
    const producer = of(state, 'production')[0]!;
    expect(low && high && high.salary > low.salary).toBe(true);
    for (const e of [low!, high!, producer]) away(state, e);
    assignFlex(state);
    expect(producer.away!.temp?.flexId).toBeDefined();
    expect(high!.away!.temp).toBeNull();
    expect(low!.away!.temp).toBeNull();

    // With a second one, the better paid is next.
    const two = withFlex(state);
    assignFlex(two);
    expect(two.employees.find((e) => e.id === high!.id)!.away!.temp?.flexId).toBeDefined();
    expect(two.employees.find((e) => e.id === low!.id)!.away!.temp).toBeNull();
  });

  it('are free again when the person is back, the same day', () => {
    const state = withFlex(station());
    const worker = of(state, 'producer' as never)[0] ?? of(state, 'production')[0]!;
    away(state, worker, 3);
    assignFlex(state);
    expect(freeFlexWorkers(state)).toHaveLength(0);
    state.day += 3;
    worker.away = null;
    expect(freeFlexWorkers(state)).toHaveLength(1);
  });

  it('do not stand in for a host', () => {
    const state = withFlex(station());
    const host = of(state, 'host')[0]!;
    away(state, host);
    assignFlex(state);
    expect(host.away!.temp).toBeNull();
    expect(freeFlexWorkers(state)).toHaveLength(1);
  });

  it('take over from an agency temp when nobody is left uncovered, the dearest first', () => {
    const state = withFlex(station());
    const [a, b] = of(state, 'production').slice(0, 2);
    expect(b).toBeDefined();
    for (const e of [a!, b!]) away(state, e);
    a!.away!.temp = { name: 'Cheap Temp', salary: 1_000 };
    b!.away!.temp = { name: 'Dear Temp', salary: 3_000 };
    assignFlex(state);
    expect(b!.away!.temp).toMatchObject({ salary: 0, flexId: state.flexWorkers[0]!.id });
    expect(a!.away!.temp).toEqual({ name: 'Cheap Temp', salary: 1_000 });
    expect(state.messages.at(-1)!.text).toMatch(/takes over from the agency temp Dear Temp/);
  });

  it('leave a person alone whose stand-in was sent away', () => {
    const state = withFlex(station());
    const worker = of(state, 'production')[0]!;
    away(state, worker);
    assignFlex(state);
    const ended = endTemp(state, worker.id);
    if (!ended.ok) throw new Error(ended.error);
    assignFlex(ended.state);
    expect(ended.state.employees.find((e) => e.id === worker.id)!.away!.temp).toBeNull();
    expect(freeFlexWorkers(ended.state)).toHaveLength(1);
  });

  it('are let go for severance, and whoever they covered has nobody', () => {
    const state = withFlex(station());
    const worker = of(state, 'production')[0]!;
    away(state, worker);
    assignFlex(state);
    const gone = letFlexWorkerGo(state, state.flexWorkers[0]!.id);
    if (!gone.ok) throw new Error(gone.error);
    expect(gone.state.flexWorkers).toHaveLength(0);
    expect(gone.state.money).toBe(state.money - LIFE.flex.salary * SEVERANCE_MONTHS);
    expect(gone.state.employees.find((e) => e.id === worker.id)!.away!.temp).toBeNull();
    expect(letFlexWorkerGo(gone.state, state.flexWorkers[0]!.id).ok).toBe(false);
  });

  it('do not stop an agency temp being hired when none is free', () => {
    const state = withFlex(station());
    const [a, b] = of(state, 'production').slice(0, 2);
    for (const e of [a!, b!]) away(state, e);
    assignFlex(state);
    const second = state.employees.find((e) => e.away && !e.away.temp)!;
    expect(hireTemp(state, second.id).ok).toBe(true);
  });
});

describe('save', () => {
  it('a save from version 68 loads with no flex workers', () => {
    const s = station();
    const old = JSON.parse(JSON.stringify(toSaveFile(s, 1))) as { version: number; state: Record<string, unknown> };
    delete old.state.flexWorkers;
    old.version = 68;
    const { version, state } = fromSaveFile(old);
    expect(version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(69);
    expect(state.flexWorkers).toEqual([]);
  });

  it('a current save keeps its flex workers and who they stand in for', () => {
    const state = withFlex(station());
    const worker = of(state, 'production')[0]!;
    away(state, worker);
    assignFlex(state);
    const back = fromSaveFile(JSON.parse(JSON.stringify(toSaveFile(state, 1)))).state;
    expect(back.flexWorkers).toEqual(state.flexWorkers);
    expect(back.employees.find((e) => e.id === worker.id)!.away!.temp?.flexId).toBe(state.flexWorkers[0]!.id);
  });
});
