import { describe, expect, it } from 'vitest';
import { LEGAL, PSYCHOLOGY, PSYCHOLOGIST_CANDIDATES, SALARY } from '../config/balance';
import { buildRoom, coachHost, fire, hire, type ActionResult } from './actions';
import { sensibleBot } from './bots';
import { conductEvents, isUnsafe, unsafeHost } from './conduct';
import { autoPlaceFurniture } from './fixtures';
import { suedChance } from './legal';
import { createInitialState } from './newGame';
import { employeesWithDesk } from './office';
import { proposeRoom } from './rooms';
import { SAVE_VERSION, fromSaveFile, toSaveFile } from './save';
import type { Employee, GameState } from './state';
import { advance } from './tick';
import { unlockAll } from './unlocks';
import { generateCandidates } from './generate';
import { Rng } from './rng';
import { moraleParts } from './upkeep';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}

/** A company a month in, with money, a host or two, and `count` psychologists at workstations. */
function company(count: number): GameState {
  let s: GameState & { lastId?: string } = structuredClone(unlockAll(advance(sensibleBot(createInitialState(1)), 30)));
  s.money = 5_000_000;
  s.floorsUnlocked = 2;
  if (count > 0) {
    const floor = [1, 2].find((f) => proposeRoom(s, f, 'office'))!;
    s = ok(buildRoom(s, { ...proposeRoom(s, floor, 'office')!, type: 'office' }));
    const office = s.lastId!;
    for (let i = 0; i < count + 1; i++) s = ok(autoPlaceFurniture(s, office, 'workstation'));
    for (let i = 0; i < count; i++) {
      const id = `psy-${i}`;
      s.candidates.push({ id, name: `Psychologist ${i}`, role: 'psychologist', skill: 50, salary: 2_000, specialties: [], fame: 0, department: null, foundFor: null });
      s = ok(hire(s, id));
    }
  }
  return s;
}

const hostsOf = (s: GameState) => s.employees.filter((e) => e.role === 'host');
const turn = (host: Employee, day: number) => {
  host.conduct = { since: day, coachedUntil: null };
};

describe('the psychologist (0.22.0, #259)', () => {
  it('cuts the chance of an injury case, and leaves libel alone', () => {
    const s = company(1);
    const desked = employeesWithDesk(s);
    const reality = { genre: 'reality', tone: 'normal', hostId: null } as const;
    const talk = { genre: 'talk', tone: 'normal', hostId: null } as const;
    const without = suedChance(reality);
    expect(suedChance(reality, s, desked)).toBeLessThan(without);
    expect(suedChance(reality, s, desked)).toBeGreaterThan(without * (1 - PSYCHOLOGY.injuryCut) - 1e-9);
    expect(suedChance(talk, s, desked)).toBe(suedChance(talk));
    expect(suedChance(reality, company(0), employeesWithDesk(company(0)))).toBe(without);
  });

  it('counts only the best psychologist', () => {
    const one = company(1);
    const two = company(2);
    const reality = { genre: 'reality', tone: 'normal', hostId: null } as const;
    expect(suedChance(reality, two, employeesWithDesk(two))).toBeCloseTo(suedChance(reality, one, employeesWithDesk(one)), 6);
  });

  it('is drawn last in the hiring pool, after the meteorologists', () => {
    const s = company(0);
    const pool = generateCandidates(s, new Rng(5), 1980, false, 0);
    const roles = pool.map((p) => p.role);
    expect(roles.filter((r) => r === 'psychologist')).toHaveLength(PSYCHOLOGIST_CANDIDATES);
    expect(roles.lastIndexOf('meteorologist')).toBeLessThan(roles.indexOf('psychologist'));
    for (const p of pool.filter((c) => c.role === 'psychologist')) {
      expect(p.salary).toBeGreaterThanOrEqual(SALARY.psychologist.min * 0.5);
    }
  });
});

describe('the host who is unsafe to work with', () => {
  it('turns about once a decade, from a stream of its own', () => {
    const s = company(0);
    const before = structuredClone(s.rngState);
    let turns = 0;
    for (let i = 0; i < 365 * 100; i++) {
      s.day += 1;
      conductEvents(s);
      const host = unsafeHost(s);
      if (host) {
        turns++;
        host.conduct = undefined;
      }
    }
    expect(turns).toBeGreaterThanOrEqual(3);
    expect(turns).toBeLessThanOrEqual(20);
    expect(s.rngState).toEqual(before);
  });

  it('is only ever one host at a time, and never one who was coached', () => {
    const s = company(0);
    if (hostsOf(s).length < 2) s.employees.push({ ...hostsOf(s)[0]!, id: 'host-two', name: 'Second Host', conduct: null });
    for (let i = 0; i < 365 * 60; i++) {
      s.day += 1;
      conductEvents(s);
      expect(hostsOf(s).filter(isUnsafe).length).toBeLessThanOrEqual(1);
      const host = unsafeHost(s);
      if (host) host.conduct = { since: host.conduct!.since, coachedUntil: null, cleared: true };
    }
    // Everyone has been through it once and none turns again.
    expect(hostsOf(s).every((h) => h.conduct?.cleared)).toBe(true);
  });

  it('lowers the morale of the hosts and the production team, by half while coached', () => {
    const s = company(1);
    const desked = employeesWithDesk(s);
    const [host] = hostsOf(s);
    const other = s.employees.find((e) => e.role === 'production') ?? host!;
    const base = moraleParts(s, other, desked).unsafe;
    expect(base).toBe(0);
    turn(host!, s.day);
    expect(moraleParts(s, other, desked).unsafe).toBe(PSYCHOLOGY.moralePenalty);
    expect(moraleParts(s, s.employees.find((e) => e.role === 'psychologist')!, desked).unsafe).toBe(0);
    const coached = ok(coachHost(s, host!.id));
    expect(moraleParts(coached, other, desked).unsafe).toBe(PSYCHOLOGY.moralePenalty / 2);
  });

  it('can be coached by a psychologist at a desk, and then never turns again', () => {
    const s = company(1);
    const host = hostsOf(s)[0]!;
    turn(host, s.day);
    const coached = ok(coachHost(s, host.id));
    const h = coached.employees.find((e) => e.id === host.id)!;
    expect(h.conduct!.coachedUntil).toBe(coached.day + PSYCHOLOGY.coachDays);
    // One psychologist coaches one host at a time.
    expect(coachHost(coached, h.id).ok).toBe(false);
    for (let i = 0; i < PSYCHOLOGY.coachDays; i++) {
      coached.day += 1;
      conductEvents(coached);
    }
    expect(isUnsafe(h)).toBe(false);
    expect(h.conduct!.cleared).toBe(true);
    expect(unsafeHost(coached)).toBeUndefined();
  });

  it('cannot be coached without a psychologist, and the coaching stops if theirs leaves', () => {
    const none = company(0);
    const host = hostsOf(none)[0]!;
    turn(host, none.day);
    const refused = coachHost(none, host.id);
    expect(refused.ok).toBe(false);

    const s = company(1);
    const h = hostsOf(s)[0]!;
    turn(h, s.day);
    const coached = ok(coachHost(s, h.id));
    const psychologist = coached.employees.find((e) => e.role === 'psychologist')!;
    const gone = ok(fire(coached, psychologist.id));
    gone.day += 1;
    conductEvents(gone);
    expect(gone.employees.find((e) => e.id === h.id)!.conduct!.coachedUntil).toBeNull();
    expect(isUnsafe(gone.employees.find((e) => e.id === h.id)!)).toBe(true);
  });

  it('is let go with no severance', () => {
    const s = company(0);
    const host = hostsOf(s)[0]!;
    turn(host, s.day);
    const money = s.money;
    const after = ok(fire(s, host.id));
    expect(after.money).toBe(money);
    expect(after.employees.some((e) => e.id === host.id)).toBe(false);
    const other = company(0);
    const fine = hostsOf(other)[0]!;
    expect(ok(fire(other, fine.id)).money).toBeLessThan(other.money);
  });

  it('is reported by the press once, after reportDays, and not while coached', () => {
    const s = company(0);
    const host = hostsOf(s)[0]!;
    turn(host, s.day);
    const headlines = s.headlines.length;
    for (let i = 0; i < PSYCHOLOGY.reportDays - 1; i++) {
      s.day += 1;
      conductEvents(s);
    }
    expect(s.headlines.length).toBe(headlines);
    s.day += 1;
    conductEvents(s);
    expect(s.headlines.length).toBe(headlines + 1);
    expect(host.conduct!.reported).toBe(true);
    s.day += 30;
    conductEvents(s);
    expect(s.headlines.length).toBe(headlines + 1);
    expect(LEGAL.reputation).toBeGreaterThan(0);
  });

  it('doubles the chance its own shows are sued', () => {
    const s = company(0);
    const host = hostsOf(s)[0]!;
    const show = { genre: 'talk', tone: 'normal', hostId: host.id } as const;
    const normal = suedChance(show, s, employeesWithDesk(s));
    turn(host, s.day);
    expect(suedChance(show, s, employeesWithDesk(s))).toBeCloseTo(normal * PSYCHOLOGY.suedFactor, 9);
  });
});

describe('the save of a company from version 82', () => {
  it('loads with nobody unsafe', () => {
    const old = JSON.parse(JSON.stringify(toSaveFile(company(0), 0)));
    old.version = 82;
    for (const e of old.state.employees) delete e.conduct;
    const loaded = fromSaveFile(old);
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.state.employees.length).toBeGreaterThan(0);
    expect(loaded.state.employees.every((e) => e.conduct === null)).toBe(true);
  });
});
