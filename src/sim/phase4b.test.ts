import { describe, expect, it } from 'vitest';
import { CLEANLINESS, ISSUES, MORALE, WEAR } from '../config/balance';
import { STAFF_PER_TABLE } from '../config/office';
import { research, sellFurniture, setRoomType, type ActionResult } from './actions';
import { addMissingEquipment, autoPlaceFurniture, rentRoom, roomOfKind } from './fixtures';
import { showQuality, studioLevel } from './broadcast';
import { growthBot, noSupportBot, sensibleBot } from './bots';
import { companyValue } from './economy';
import { createInitialState } from './newGame';
import { unlockAll } from './unlocks';
import { employeesWithDesk, findRoom, isManager } from './office';
import { fromSaveFile, SAVE_VERSION } from './save';
import { departmentPower } from './staff';
import type { Employee, GameState, Role } from './state';
import { tick } from './tick';
import { canteenCoverage, cleanlinessFactor, moraleFactor, moraleTarget, technicianTitle, upkeepLoad } from './upkeep';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** The sensible bot's station (a radio studio, a radio talk studio, an office and a management office) with no support staff and no canteen. */
function station(): GameState {
  const s = structuredClone(unlockAll(sensibleBot(createInitialState(1))));
  s.employees = s.employees.filter((e) => !['cleaner', 'technician', 'maintenance', 'cook'].includes(e.role));
  s.rooms = s.rooms.filter((r) => r.type !== 'canteen');
  s.money = 1_000_000;
  return s;
}

function add(s: GameState, role: Role, skill = 50): Employee {
  const person: Employee = { id: `p-${role}-${s.employees.length}`, name: `Test ${role}`, role, skill, salary: 1_000, specialties: [], fame: 0, department: null, hiredOn: 0, xp: 0, level: 1, morale: MORALE.neutral, location: null, desk: null, trainingUntil: null, leaving: null, talentUntil: null };
  s.employees.push(person);
  return person;
}

const days = (s: GameState, n: number) => Array.from({ length: n }).reduce<GameState>((x) => tick(x), s);
const room = (s: GameState, id: string) => findRoom(s, id)!;
/** The rooms of that station that the tests look at, and a place on its floor that is still free: room D of the old plan. */
const STUDIO = roomOfKind(station(), 'radioStudio');
const OFFICE = roomOfKind(station(), 'office');
const SPARE = 'D';

describe('cleanliness', () => {
  it('rooms get dirtier with use, and an unused room stays clean', () => {
    const s = tick(ok(rentRoom(station(), SPARE)));
    const workers = s.employees.filter((e) => e.role !== 'host' && !isManager(e.role)).length;
    expect(room(s, OFFICE).cleanliness).toBeCloseTo(100 - CLEANLINESS.perWorker * workers);
    expect(room(s, STUDIO).cleanliness).toBeLessThan(100);
    expect(room(s, SPARE).cleanliness).toBe(100);
  });

  it('a cleaner goes to the dirtiest room first and keeps a small office clean', () => {
    const s = station();
    room(s, STUDIO).cleanliness = 40;
    room(s, OFFICE).cleanliness = 70;
    add(s, 'cleaner');
    const next = tick(s);
    expect(next.employees.at(-1)!.location).toBe(STUDIO);
    expect(room(next, STUDIO).cleanliness).toBeGreaterThan(40);
    expect(room(next, OFFICE).cleanliness).toBeLessThan(70);
    const later = days(next, 120);
    expect(later.rooms.every((r) => r.cleanliness > 95)).toBe(true);
  });

  it('a dirty room costs up to 30% of the work done in it', () => {
    expect(cleanlinessFactor({ ...room(station(), OFFICE), cleanliness: 0 })).toBeCloseTo(CLEANLINESS.minFactor);
    expect(cleanlinessFactor({ ...room(station(), OFFICE), cleanliness: CLEANLINESS.cleanEnough })).toBe(1);
    const s = station();
    add(s, 'researcher', 80);
    const clean = departmentPower(s, 'researcher', employeesWithDesk(ok(autoPlaceFurniture(s, OFFICE, 'workstation'))));
    const dirty = ok(autoPlaceFurniture(s, OFFICE, 'workstation'));
    room(dirty, OFFICE).cleanliness = 0;
    expect(clean).toBeCloseTo(0.8);
    expect(departmentPower(dirty, 'researcher', employeesWithDesk(dirty))).toBeCloseTo(0.8 * CLEANLINESS.minFactor);
  });

  it('warns once when a room gets dirty', () => {
    const s = station();
    room(s, OFFICE).cleanliness = CLEANLINESS.warnBelow + 0.1;
    const next = days(s, 3);
    expect(next.messages.filter((m) => /Office 1 is getting dirty/.test(m.text))).toHaveLength(1);
  });
});

describe('equipment condition', () => {
  it('wears every day, except durable furniture', () => {
    const s = tick(ok(addMissingEquipment(ok(setRoomType(ok(rentRoom(station(), SPARE)), SPARE, 'library')), SPARE)));
    expect(room(s, OFFICE).furniture[0]!.condition).toBeCloseTo(100 - WEAR.perDay);
    expect(room(s, STUDIO).furniture[0]!.condition).toBeCloseTo(100 - WEAR.perDay);
    expect(room(s, SPARE).furniture[0]!.condition).toBe(100);
  });

  it('a broken workstation leaves its user without a desk, so they produce nothing', () => {
    const s = station();
    const show = s.shows[0]!;
    expect(showQuality(s, show).quality).toBeGreaterThan(0);
    for (const f of room(s, OFFICE).furniture) f.condition = 0.1;
    const broken = tick(s);
    // The manager's desk is in another room and does not wear out.
    expect([...employeesWithDesk(broken).keys()]).toEqual(broken.employees.filter((e) => isManager(e.role)).map((e) => e.id));
    expect(showQuality(broken, show).problems).toContain('Production staff have no workstation');
    expect(broken.messages.some((m) => m.kind === 'danger' && /broken down in Office 1/.test(m.text))).toBe(true);
  });

  it('broken studio equipment halves the studio level', () => {
    const s = station();
    const show = s.shows[0]!;
    const before = studioLevel(s, show);
    room(s, show.studioId!).furniture[0]!.condition = 0;
    expect(studioLevel(s, show)).toBeCloseTo(before * WEAR.brokenStudioLevel);
    expect(showQuality(s, show).quality).toBeGreaterThan(0);
  });

  it('a technician repairs the worst item first and keeps up with a small office', () => {
    const s = station();
    const [worst, other] = room(s, OFFICE).furniture;
    worst!.condition = 0;
    other!.condition = 50;
    add(s, 'technician');
    const next = tick(s);
    expect(next.employees.at(-1)!.location).toBe(OFFICE);
    expect(room(next, OFFICE).furniture[0]!.condition).toBeCloseTo(WEAR.technicianPerDay);
    expect(room(next, OFFICE).furniture[1]!.condition).toBeLessThan(50);
    const later = days(next, 60);
    expect(later.rooms.flatMap((r) => r.furniture).every((f) => f.condition > 95)).toBe(true);
    const load = upkeepLoad(later, employeesWithDesk(later));
    expect(load.repairs.capacity).toBeGreaterThan(load.repairs.needed);
  });

  it('worn equipment sells for less', () => {
    const s = station();
    const item = room(s, OFFICE).furniture[0]!;
    // Second-hand: a piece that is sold straight after it was placed gives its price back, worn or not.
    item.boughtOn = s.day - 400;
    const full = ok(sellFurniture(s, OFFICE, item.id)).money - s.money;
    item.condition = 50;
    expect(ok(sellFurniture(s, OFFICE, item.id)).money - s.money).toBe(full / 2);
  });

  it('technicians become IT technicians once the personal computer is researched', () => {
    const s = station();
    expect(technicianTitle(s)).toBe('Technician');
    s.day = Math.round(365.25 * 12);
    s.researchPoints = 10_000;
    expect(technicianTitle(ok(research(s, 'personalComputer')))).toBe('IT technician');
  });
});

describe('building issues', () => {
  /** Plays until something in the building fails. */
  function untilIssue(s: GameState): GameState {
    let next = s;
    for (let i = 0; i < 2_000 && !next.rooms.some((r) => r.issue); i++) next = tick(next);
    return next;
  }

  it('happen now and then, lower morale in that room and stay until fixed', () => {
    const s = untilIssue(station());
    const faulty = s.rooms.find((r) => r.issue)!;
    expect(faulty.issue!.workLeft).toBe(ISSUES.work);
    expect(s.messages.some((m) => /has failed in/.test(m.text))).toBe(true);
    const clean = structuredClone(s);
    for (const r of clean.rooms) r.cleanliness = 100;
    const desked = employeesWithDesk(clean);
    const affected = clean.employees.find((e) => (e.role === 'host' ? clean.shows.some((x) => x.hostId === e.id && x.studioId === faulty.roomId) : desked.get(e.id)?.roomId === faulty.roomId))!;
    expect(moraleTarget(clean, affected, desked)).toBe(MORALE.neutral - MORALE.issuePenalty);
    expect(days(s, 30).rooms.find((r) => r.roomId === faulty.roomId)!.issue).not.toBeNull();
  });

  it('maintenance staff fix them', () => {
    const s = station();
    room(s, STUDIO).issue = { kind: 'heating', workLeft: ISSUES.work };
    add(s, 'maintenance');
    const next = tick(s);
    expect(next.employees.at(-1)!.location).toBe(STUDIO);
    expect(room(next, STUDIO).issue!.workLeft).toBeCloseTo(ISSUES.work - 1);
    expect(room(days(next, 2), STUDIO).issue).toBeNull();
  });
});

describe('morale and the canteen', () => {
  it('the morale factor runs from 0.8 through 1 at neutral morale to 1.1', () => {
    expect(moraleFactor(0)).toBeCloseTo(MORALE.minFactor);
    expect(moraleFactor(MORALE.neutral)).toBe(1);
    expect(moraleFactor(100)).toBeCloseTo(MORALE.maxFactor);
  });

  it('drifts down in a dirty office', () => {
    const s = station();
    room(s, OFFICE).cleanliness = 0;
    const worker = s.employees.find((e) => e.role === 'production')!;
    expect(moraleTarget(s, worker, employeesWithDesk(s))).toBe(MORALE.neutral - MORALE.dirtPenalty);
    expect(tick(s).employees.find((e) => e.id === worker.id)!.morale).toBeCloseTo(MORALE.neutral - MORALE.dirtPenalty * MORALE.rate);
  });

  it('a canteen with a seat for everyone raises morale, and needs everything on its checklist', () => {
    let s = ok(setRoomType(ok(rentRoom(station(), 'G')), 'G', 'canteen'));
    for (const type of ['canteenTable', 'fridge', 'counter', 'counter'] as const) s = ok(autoPlaceFurniture(s, 'G', type));
    expect(canteenCoverage(s)).toBe(0);
    s = ok(autoPlaceFurniture(s, 'G', 'coffeeMachine'));
    expect(canteenCoverage(s)).toBeCloseTo(STAFF_PER_TABLE / s.employees.length);
    s = ok(autoPlaceFurniture(s, 'G', 'canteenTable'));
    expect(canteenCoverage(s)).toBe(1);
    const worker = s.employees.find((e) => e.role === 'production')!;
    expect(moraleTarget(s, worker, employeesWithDesk(s))).toBe(MORALE.neutral + MORALE.canteenBonus);
    room(s, 'G').cleanliness = 0;
    expect(canteenCoverage(s)).toBe(0);
  });
});

describe('conditions in the quality formula', () => {
  it('quality = host × production × studio × cleanliness factor × morale factor', () => {
    const s = station();
    const show = s.shows[0]!;
    const base = showQuality(s, show);
    expect(base.conditions).toBe(1);

    const dirty = structuredClone(s);
    room(dirty, show.studioId!).cleanliness = 0;
    expect(showQuality(dirty, show).conditions).toBeCloseTo(CLEANLINESS.minFactor);
    expect(showQuality(dirty, show).quality).toBeCloseTo(base.quality * CLEANLINESS.minFactor);

    const unhappy = structuredClone(s);
    for (const e of unhappy.employees) e.morale = 0;
    expect(showQuality(unhappy, show).quality).toBeCloseTo(base.quality * MORALE.minFactor);

    const happy = structuredClone(s);
    for (const e of happy.employees) e.morale = 100;
    expect(showQuality(happy, show).quality).toBeCloseTo(base.quality * MORALE.maxFactor);
  });
});

describe('saves from Phase 4a', () => {
  it('upgrade with a clean office, equipment in good repair and neutral morale', () => {
    const s = structuredClone(unlockAll(sensibleBot(createInitialState(1)))) as unknown as Record<string, unknown> & GameState;
    for (const e of s.employees) {
      delete (e as unknown as Record<string, unknown>).morale;
      delete (e as unknown as Record<string, unknown>).location;
    }
    for (const r of s.rooms) {
      delete (r as unknown as Record<string, unknown>).cleanliness;
      delete (r as unknown as Record<string, unknown>).issue;
      for (const f of r.furniture) delete (f as unknown as Record<string, unknown>).condition;
    }
    const { state, version } = fromSaveFile({ version: 5, savedAt: 1, state: s });
    expect(version).toBe(SAVE_VERSION);
    expect(state.employees.every((e) => e.morale === MORALE.neutral && e.location === null)).toBe(true);
    expect(state.rooms.every((r) => r.cleanliness === 100 && r.issue === null && r.furniture.every((f) => f.condition === 100))).toBe(true);
    expect(tick(state).day).toBe(1);
  });
});

// --- Phase 4b acceptance (prompt.md section 14) ---

describe('Phase 4b acceptance', () => {
  const THREE_YEARS = 3 * 365;
  const averageQuality = (s: GameState) => {
    const qualities = s.shows.map((show) => showQuality(s, show).quality);
    return qualities.reduce((sum, q) => sum + q, 0) / qualities.length;
  };

  it.each([1, 2, 3])('neglecting support staff lowers quality and output, and a bot that hires them does better (seed %i)', (seed) => {
    let cared = createInitialState(seed);
    let neglected = createInitialState(seed);
    let caredListeners = 0;
    let neglectedListeners = 0;
    let halfYear: { cared: GameState; neglected: GameState } | undefined;
    for (let day = 0; day < THREE_YEARS; day++) {
      cared = tick(growthBot(cared));
      neglected = tick(noSupportBot(neglected));
      caredListeners += cared.listeners;
      neglectedListeners += neglected.listeners;
      if (day === 180) halfYear = { cared, neglected };
    }
    // After half a year without cleaners the shows are visibly worse… (Since 0.15.0 a canteen alone lifts morale less: the
    // cook, the post and the meetings do the rest, and the bot has only just set those up by then.)
    expect(averageQuality(halfYear!.neglected)).toBeLessThan(0.8 * averageQuality(halfYear!.cared));
    expect(halfYear!.neglected.listeners).toBeLessThan(0.6 * halfYear!.cared.listeners);
    // …and over three years the company that looks after its office is far ahead.
    expect(cared.bankrupt).toBe(false);
    expect(cared.employees.some((e) => e.role === 'cleaner')).toBe(true);
    expect(cared.rooms.some((r) => r.type === 'canteen')).toBe(true);
    expect(caredListeners).toBeGreaterThan(2 * neglectedListeners);
    expect(companyValue(cared)).toBeGreaterThan(2 * companyValue(neglected));
  }, 60_000);
});
