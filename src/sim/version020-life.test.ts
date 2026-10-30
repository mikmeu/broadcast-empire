// Age, parental leave, sickness, retirement and death (0.20.0, #174).

import { describe, expect, it } from 'vitest';
import { DAYS_PER_YEAR, LIFE, MORALE, STRIKES } from '../config/balance';
import { GIVEN_NAMES_FEMALE, GIVEN_NAMES_MALE } from '../config/names';
import { CHARACTERS, characterFor } from '../office/assets';
import { hireTemp, endTemp } from './actions';
import { sensibleBot } from './bots';
import { showQuality } from './broadcast';
import { monthlyCosts } from './economy';
import { generateCandidates } from './generate';
import { ageOf, birthFor, deathChance, leaveChance, lifeEvents, retiresOn, sickChance, sicknessFactor } from './life';
import { CHARACTER_COUNTS, isWoman } from './names';
import { createInitialState } from './newGame';
import { Rng } from './rng';
import { fromSaveFile, SAVE_VERSION, toSaveFile } from './save';
import { skillAtWork } from './staff';
import type { Employee, GameState } from './state';
import { awayWithoutTemp, isAway, notWorking } from './teams';
import { tick } from './tick';
import { unlockAll } from './unlocks';

function station(): GameState {
  return structuredClone(unlockAll(sensibleBot(createInitialState(1))));
}

/** Someone alone in a company, of an age, on a day. */
function lone(name: string, age: number, morale = MORALE.neutral): { s: GameState; e: Employee } {
  const s = station();
  const e = s.employees.find((x) => x.role === 'cleaner') ?? s.employees[0]!;
  s.employees = [e];
  s.shows = [];
  s.channels = [];
  e.name = name;
  e.morale = morale;
  e.bornOn = s.day - Math.floor(age * DAYS_PER_YEAR);
  e.away = null;
  return { s, e };
}

/** Days from the person's `day` until `stop` says so, with the day turning as in a tick. */
function live(s: GameState, days: number, stop: (s: GameState) => boolean = () => false): number {
  for (let i = 0; i < days; i++) {
    s.day += 1;
    lifeEvents(s);
    if (stop(s)) return i + 1;
  }
  return days;
}

const WOMAN = GIVEN_NAMES_FEMALE.find((n) => !GIVEN_NAMES_MALE.includes(n))!;
const MAN = GIVEN_NAMES_MALE.find((n) => !GIVEN_NAMES_FEMALE.includes(n))!;

describe('age', () => {
  it('everyone in a new game is 18 to 26, and a year older after a year', () => {
    const s = station();
    expect(s.employees.length).toBeGreaterThan(5);
    for (const p of [...s.employees, ...s.candidates]) {
      expect(ageOf(s, p)).toBeGreaterThanOrEqual(LIFE.startAges.min);
      expect(ageOf(s, p)).toBeLessThanOrEqual(LIFE.startAges.max);
    }
    const p = s.employees[0]!;
    expect(ageOf({ day: s.day + Math.ceil(DAYS_PER_YEAR) }, p)).toBe(ageOf(s, p)! + 1);
  });

  it('the pool is young for two years, then older, mostly young', () => {
    const s = createInitialState(7);
    const ages = (day: number) => Array.from({ length: 400 }, (_, i) => ageOf({ day }, { bornOn: birthFor({ seed: 7, day }, `x${i}`) })!);
    expect(Math.max(...ages(s.day))).toBeLessThanOrEqual(LIFE.startAges.max);
    const later = ages(s.day + Math.ceil(3 * DAYS_PER_YEAR));
    expect(Math.max(...later)).toBeGreaterThan(LIFE.startAges.max);
    expect(Math.max(...later)).toBeLessThanOrEqual(LIFE.laterMaxAge);
    expect(later.filter((a) => a <= 30).length).toBeGreaterThan(later.length / 2);
  });

  it('ages are drawn apart from the game’s stream, and the pool is the same each time', () => {
    const a = createInitialState(3);
    const b = structuredClone(a);
    const rngA = new Rng(a.rngState);
    const rngB = new Rng(b.rngState);
    const poolA = generateCandidates(a, rngA, 1970);
    const poolB = generateCandidates(b, rngB, 1970);
    expect(poolA).toEqual(poolB);
    expect(rngA.state).toBe(rngB.state);
  });
});

describe('character and sex', () => {
  it('isWoman agrees with the character a name gets', () => {
    expect(CHARACTER_COUNTS.female).toBe(CHARACTERS.female.length);
    expect(CHARACTER_COUNTS.male).toBe(CHARACTERS.male.length);
    for (const first of [...GIVEN_NAMES_FEMALE, ...GIVEN_NAMES_MALE, 'Elien']) {
      for (const last of ['Albers', 'Brandt', 'Corvin']) {
        const name = `${first} ${last}`;
        expect((CHARACTERS.female as readonly string[]).includes(characterFor(name))).toBe(isWoman(name));
      }
    }
  });
});

describe('leave', () => {
  const leaveOf = (name: string) => {
    const { s, e } = lone(name, 29);
    for (let i = 0; i < 30_000; i++) {
      // They stay 29.
      e.bornOn! += 1;
      live(s, 1);
      if (e.away?.reason === 'leave') return { s, e, away: e.away };
      e.away = null;
    }
    throw new Error('no leave');
  };

  it('a woman is told 60 days ahead and is away 16 weeks', () => {
    const { s, away } = leaveOf(`${WOMAN} Albers`);
    expect(away.from - s.day).toBe(LIFE.leave.womanNotice);
    expect(away.until - away.from).toBe(112);
    expect(s.messages.at(-1)!.text).toContain('expecting a baby');
  });

  it('a man is told 14 days ahead and is away 2 weeks', () => {
    const { s, away } = leaveOf(`${MAN} Albers`);
    expect(away.from - s.day).toBe(LIFE.leave.manNotice);
    expect(away.until - away.from).toBe(14);
  });

  it('leave comes only between 25 and 35, 1.5 children on average', () => {
    expect(leaveChance(24)).toBe(0);
    expect(leaveChance(35)).toBe(0);
    expect(leaveChance(30) * DAYS_PER_YEAR * (LIFE.leave.to - LIFE.leave.from)).toBeCloseTo(LIFE.leave.children, 6);
  });

  it('the person is back when it is over, with their temp gone', () => {
    const { s, e, away } = leaveOf(`${WOMAN} Albers`);
    s.day = away.until - 1;
    e.away!.temp = { name: 'Temp Person', salary: 1_000 };
    live(s, 1);
    expect(e.away ?? null).toBeNull();
  });
});

describe('sickness', () => {
  it('rises as morale falls, and with age', () => {
    expect(sicknessFactor(MORALE.neutral)).toBe(1);
    expect(sicknessFactor(100)).toBe(1);
    expect(sicknessFactor(STRIKES.below)).toBe(LIFE.sick.lowMorale);
    expect(sicknessFactor(10)).toBe(LIFE.sick.lowMorale);
    expect(sickChance(30, STRIKES.below) / sickChance(30, MORALE.neutral)).toBeCloseTo(2, 6);
    expect(sickChance(56, MORALE.neutral) / sickChance(30, MORALE.neutral)).toBeCloseTo(1.5, 6);
  });

  it('sick spells are more frequent at low morale', () => {
    const spells = (morale: number) => {
      const { s, e } = lone(`${MAN} Albers`, 20, morale);
      let n = 0;
      for (let i = 0; i < 3_000; i++) {
        e.morale = morale;
        live(s, 1);
        if (e.away?.reason === 'sick') {
          n++;
          e.away = null;
        }
        if (e.away?.reason === 'leave') e.away = null;
      }
      return n;
    };
    expect(spells(20)).toBeGreaterThan(spells(80) * 1.3);
  });

  it('a spell lasts 2 to 10 days, rarely 30 to 90', () => {
    const { s, e } = lone(`${MAN} Albers`, 20);
    const lengths: number[] = [];
    for (let i = 0; i < 40_000 && lengths.length < 60; i++) {
      live(s, 1);
      if (e.away?.reason === 'sick') lengths.push(e.away.until - e.away.from);
      e.away = null;
    }
    expect(lengths.length).toBeGreaterThan(20);
    for (const days of lengths) expect(days >= 2 && (days <= 10 || (days >= 30 && days <= 90))).toBe(true);
  });
});

describe('retirement and death', () => {
  it('someone retires at 65, told 60 days ahead, with no severance', () => {
    const { s, e } = lone(`${MAN} Albers`, 64.8);
    const money = s.money;
    const on = retiresOn(e.bornOn!);
    s.day = on - LIFE.retireNotice - 1;
    live(s, 1);
    expect(s.messages.some((m) => m.text.includes('retires on'))).toBe(true);
    expect(s.employees).toHaveLength(1);
    s.day = on - 1;
    live(s, 1);
    expect(s.employees).toHaveLength(0);
    expect(s.messages.at(-1)!.text).toContain('has retired');
    expect(s.money).toBe(money);
  });

  it('the chance of dying rises with age, and is small', () => {
    expect(deathChance(30)).toBeLessThan(deathChance(45));
    expect(deathChance(45)).toBeLessThan(deathChance(60));
    expect(deathChance(60) * DAYS_PER_YEAR).toBeLessThanOrEqual(0.01);
  });

  it('a death removes the person from their shows, and a famous host makes the news', () => {
    const s = station();
    const host = s.employees.find((e) => e.role === 'host' && s.shows.some((x) => x.hostId === e.id))!;
    host.fame = 80;
    host.bornOn = s.day - 60 * Math.floor(DAYS_PER_YEAR);
    // Until this host dies, as the stream of their id has it.
    let died = false;
    for (let i = 0; i < 40_000 && !died; i++) {
      s.day += 1;
      host.bornOn! += 1;
      lifeEvents(s);
      died = !s.employees.includes(host) && !s.employees.some((e) => e.id === host.id);
    }
    expect(died).toBe(true);
    expect(s.shows.every((x) => x.hostId !== host.id)).toBe(true);
    expect(s.headlines.at(-1)!.text).toContain('has died');
  });
});

describe('away from work', () => {
  function awayHost(): { s: GameState; host: Employee } {
    let s = station();
    // The first day's broadcast sets the shows going.
    s = tick(s);
    const show = s.shows.find((x) => x.hostId && x.genre !== 'news')!;
    const host = s.employees.find((e) => e.id === show.hostId)!;
    return { s, host };
  }

  it('a host who is away without a temp gives the show a problem, and with a temp it airs weaker', () => {
    const { s, host } = awayHost();
    const show = s.shows.find((x) => x.hostId === host.id)!;
    const normal = showQuality(s, show);
    expect(normal.problems).toHaveLength(0);
    host.away = { reason: 'sick', from: s.day, until: s.day + 5, temp: null };
    expect(isAway(s, host)).toBe(true);
    expect(awayWithoutTemp(s, host)).toBe(true);
    expect(notWorking(s, host)).toBe(true);
    expect(showQuality(s, show).problems).toContain('The host is away');
    expect(showQuality(s, show).quality).toBe(0);

    const hired = hireTemp(s, host.id);
    expect(hired.ok).toBe(true);
    const withTemp = hired.ok ? hired.state : s;
    const temped = showQuality(withTemp, show);
    expect(temped.problems).toHaveLength(0);
    expect(temped.quality).toBeGreaterThan(0);
    expect(temped.quality).toBeLessThan(normal.quality);
    expect(temped.host).toBeCloseTo(normal.host * 0.75, 6);
  });

  it('a temp does 75% of the skill, and costs the salary and a quarter', () => {
    const { s, host } = awayHost();
    const base = monthlyCosts(s).salaries;
    host.away = { reason: 'leave', from: s.day - 1, until: s.day + 50, temp: null };
    // Leave is paid by the state, the temp by you.
    const before = monthlyCosts(s).salaries;
    expect(before).toBeCloseTo(base - host.salary, 6);
    const result = hireTemp(s, host.id);
    expect(result.ok).toBe(true);
    const after = result.ok ? result.state : s;
    const temp = after.employees.find((e) => e.id === host.id)!.away!.temp!;
    expect(temp.salary).toBeGreaterThanOrEqual(host.salary * LIFE.temp.agency - 25);
    expect(skillAtWork(after.employees.find((e) => e.id === host.id)!)).toBeCloseTo(host.skill * 0.75, 6);
    expect(monthlyCosts(after).salaries).toBeCloseTo(before + temp.salary, 6);
  });

  it('sickness is paid in full', () => {
    const { s, host } = awayHost();
    const before = monthlyCosts(s).salaries;
    host.away = { reason: 'sick', from: s.day, until: s.day + 5, temp: null };
    expect(monthlyCosts(s).salaries).toBe(before);
  });

  it('a temp can only be taken on for someone who is away, and sent away again', () => {
    const { s, host } = awayHost();
    expect(hireTemp(s, host.id).ok).toBe(false);
    host.away = { reason: 'leave', from: s.day + 20, until: s.day + 130, temp: null };
    expect(hireTemp(s, host.id).ok).toBe(false);
    host.away = { reason: 'sick', from: s.day, until: s.day + 5, temp: null };
    const hired = hireTemp(s, host.id);
    expect(hired.ok).toBe(true);
    if (!hired.ok) return;
    expect(hireTemp(hired.state, host.id).ok).toBe(false);
    const ended = endTemp(hired.state, host.id);
    expect(ended.ok && ended.state.employees.find((e) => e.id === host.id)!.away!.temp).toBeNull();
  });

  it('someone who is away without a temp has no desk and earns no experience', () => {
    const { s } = awayHost();
    const worker = s.employees.find((e) => e.role === 'production')!;
    worker.away = { reason: 'sick', from: s.day, until: s.day + 30, temp: null };
    const next = tick(s);
    expect(next.employees.find((e) => e.id === worker.id)!.xp).toBe(worker.xp);
  });
});

describe('save', () => {
  it('a save from version 51 loads, with everyone 18 to 26 and nobody away', () => {
    const s = station();
    const old = structuredClone(s) as unknown as { employees: Record<string, unknown>[]; candidates: Record<string, unknown>[] };
    for (const p of [...old.employees, ...old.candidates]) delete p.bornOn;
    for (const e of old.employees) delete e.away;
    const { version, state } = fromSaveFile({ version: 51, savedAt: 1, state: old });
    expect(version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(52);
    for (const e of state.employees) {
      expect(e.away).toBeNull();
      expect(ageOf(state, e)).toBeGreaterThanOrEqual(18);
      expect(ageOf(state, e)).toBeLessThanOrEqual(26);
    }
    for (const c of state.candidates) expect(ageOf(state, c)).toBeGreaterThanOrEqual(18);
    // Nothing happens to them on the first day.
    expect(tick(state).employees.length).toBe(state.employees.length);
  });

  it('a current save keeps ages and spells', () => {
    const s = station();
    s.employees[0]!.away = { reason: 'sick', from: s.day, until: s.day + 4, temp: { name: 'Temp Person', salary: 1_250 } };
    const back = fromSaveFile(JSON.parse(JSON.stringify(toSaveFile(s, 1)))).state;
    expect(back.employees[0]!.away).toEqual(s.employees[0]!.away);
    expect(back.employees[0]!.bornOn).toBe(s.employees[0]!.bornOn);
  });
});
