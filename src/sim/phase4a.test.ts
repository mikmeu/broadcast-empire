import { describe, expect, it } from 'vitest';
import { RESEARCH, TIERS } from '../config/balance';
import { FURNITURE } from '../config/office';
import { getTech, TECHS } from '../config/tech';
import { createShow, research, upgradeEquipment, type ActionResult } from './actions';
import { autoPlaceFurniture, roomOfKind } from './fixtures';
import { showQuality, simulateDay, studioLevel } from './broadcast';
import { growthBot, researchBot, sensibleBot } from './bots';
import { refreshMarket } from './content';
import { rivalEraQuality } from './generate';
import { createInitialState } from './newGame';
import { slow } from './slow';
import { unlockAll } from './unlocks';
import { employeesWithDesk } from './office';
import { Rng } from './rng';
import { fromSaveFile, SAVE_VERSION } from './save';
import { effectiveSkill } from './staff';
import type { GameState } from './state';
import { eraTier, furniturePrice, researchCost, resaleValue } from './tech';
import { tick } from './tick';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
const error = (result: ActionResult) => (result.ok ? 'no error' : result.error);
const jan1 = (year: number) => Math.round((Date.UTC(year, 0, 1) - Date.UTC(1970, 0, 1)) / 86_400_000);

/** The sensible bot's station with plenty of research points. */
function station(year = 1970): GameState {
  const s = structuredClone(unlockAll(sensibleBot(createInitialState(1))));
  s.day = jan1(year);
  s.researchPoints = 100_000;
  s.money = 1_000_000;
  return s;
}

describe('the tech tree', () => {
  it('unlocks something in every decade from the 1970s to the 2020s', () => {
    for (let decade = 1970; decade <= 2020; decade += 10) {
      expect(TECHS.some((t) => t.year >= decade && t.year < decade + 10)).toBe(true);
    }
  });

  it('costs more the earlier you research, and not more than five years early', () => {
    const fm = getTech('fmStereo');
    expect(researchCost(fm, 1972)).toBe(fm.cost);
    expect(researchCost(fm, 1970)).toBe(Math.round(fm.cost * (1 + 2 * RESEARCH.earlyCostPerYear)));
    const pc = getTech('personalComputer');
    expect(error(research(station(), 'personalComputer'))).toMatch(/from 1977/);
    const s = ok(research(station(), 'fmStereo'));
    expect(s.techs).toContain('fmStereo');
    expect(s.researchPoints).toBe(100_000 - researchCost(fm, 1970));
    expect(error(research(s, 'fmStereo'))).toMatch(/already researched/);
    expect(pc.year - RESEARCH.maxYearsEarly).toBe(1977);
  });

  it('researchers earn research points every day', () => {
    let s = structuredClone(unlockAll(sensibleBot(createInitialState(1))));
    s.candidates.push({ id: 'p-r', name: 'Ada Lab', role: 'researcher', skill: 80, salary: 2_000, specialties: [], fame: 0, department: null });
    s = ok(autoPlaceFurniture(s, roomOfKind(s, 'office'), 'workstation'));
    s.employees.push({ ...s.candidates.at(-1)!, hiredOn: 0, xp: 0, level: 1, morale: 60, location: null, desk: null, trainingUntil: null, leaving: null, talentUntil: null });
    expect(tick(s).researchPoints).toBeCloseTo(0.8);
  });
});

describe('equipment tiers', () => {
  it('outdated studio equipment lowers quality once a newer tier is current', () => {
    const s = station(1975);
    const show = s.shows[0]!;
    expect(eraTier('radio', 1975)).toBe(2);
    expect(studioLevel(s, show)).toBeCloseTo(Math.sqrt(1 / 2));
    const before = showQuality(s, show).quality;
    const upgraded = ok(upgradeEquipment(ok(research(s, 'fmStereo')), show.studioId!));
    expect(studioLevel(upgraded, show)).toBeCloseTo(1);
    expect(showQuality(upgraded, show).quality).toBeGreaterThan(before);
  });

  it('equipment ahead of its time gives an edge over rivals, up to a cap', () => {
    const s = station(1970);
    const show = s.shows[0]!;
    const ahead = ok(upgradeEquipment(ok(research(s, 'fmStereo')), show.studioId!));
    expect(studioLevel(ahead, show)).toBeCloseTo(Math.min(TIERS.studioLevelCap, Math.sqrt(2)));
    const listeners = (state: GameState) => simulateDay(state).channels[0]!.slots.reduce((sum, x) => sum + x.listeners, 0);
    expect(listeners(ahead)).toBeGreaterThan(listeners(s) * 1.03);
  });

  it('new equipment is bought at the researched tier, and upgrading charges the difference', () => {
    const s = ok(research(station(), 'fmStereo'));
    const studio = s.shows[0]!.studioId!;
    const before = s.money;
    const upgraded = ok(upgradeEquipment(s, studio));
    const old = s.rooms.find((r) => r.roomId === studio)!.furniture.filter((f) => FURNITURE[f.type].line);
    const expected = old.reduce((sum, f) => sum + furniturePrice(f.type, 2) - resaleValue(f, s.day), 0);
    expect(before - upgraded.money).toBe(expected);
    expect(error(upgradeEquipment(upgraded, studio))).toMatch(/up to date/);
    const bought = ok(autoPlaceFurniture(upgraded, studio, 'mixingDesk'));
    expect(bought.rooms.find((r) => r.roomId === studio)!.furniture.at(-1)!.tier).toBe(2);
  });

  it('better workstations raise office output', () => {
    const s = ok(upgradeEquipment(ok(research(station(1975), 'electricTypewriter')), roomOfKind(station(1975), 'office')));
    const staff = s.employees.find((e) => e.role === 'production')!;
    expect(effectiveSkill(s, staff, employeesWithDesk(s))).toBeCloseTo(staff.skill * TIERS.officeOutput[1]!);
  });
});

describe('formats and rivals over the decades', () => {
  it('new formats need research before the player can use them', () => {
    const s = station(2001);
    expect(error(createShow(s, { name: 'The House', genre: 'reality', hostId: null, staffIds: [], studioId: null }))).toMatch(/Research/);
    refreshMarket(s, new Rng(1));
    expect(s.market.titles.some((t) => t.genre === 'musicVideos')).toBe(false);
    const researched = ok(research(s, 'musicVideoFormat'));
    refreshMarket(researched, new Rng(1));
    expect(researched.market.titles.some((t) => t.genre === 'musicVideos')).toBe(true);
  });

  it('rivals get better over time', () => {
    expect(rivalEraQuality(1970)).toBe(1);
    expect(rivalEraQuality(2000)).toBeGreaterThan(rivalEraQuality(1985));
  });
});

describe('saves from Phase 3', () => {
  it('upgrade with tier-1 furniture and no techs', () => {
    const s = structuredClone(unlockAll(sensibleBot(createInitialState(1)))) as unknown as Record<string, unknown> & GameState;
    delete (s as Record<string, unknown>).techs;
    for (const room of s.rooms) for (const f of room.furniture) delete (f as unknown as Record<string, unknown>).tier;
    const { state, version } = fromSaveFile({ version: 4, savedAt: 1, state: s });
    expect(version).toBe(SAVE_VERSION);
    expect(state.techs).toEqual([]);
    expect(state.rooms.flatMap((r) => r.furniture).every((f) => f.tier === 1)).toBe(true);
  });
});

// --- Phase 4a acceptance (prompt.md section 14) ---

describe('Phase 4a acceptance', () => {
  it('a headless game plays from 1970 to 2030, researching the whole tree', () => {
    let s = unlockAll(createInitialState(1));
    const end = jan1(2030);
    while (s.day < end && !s.bankrupt) s = tick(growthBot(s));
    expect(s.bankrupt).toBe(false);
    expect(s.day).toBe(end);
    expect(Number.isFinite(s.money)).toBe(true);
    expect(s.techs).toHaveLength(TECHS.length);
  }, slow(120_000));

  it('researching ahead gives a measurable edge (three games, 1970–1990)', () => {
    // One game says little: which hosts happen to be in the pool moves the listeners by a few percent either way.
    const edges = [1, 2, 3].map((seed) => {
      let ahead = createInitialState(seed);
      let onTime = createInitialState(seed);
      let aheadSum = 0;
      let onTimeSum = 0;
      for (let day = 0; day < jan1(1990); day++) {
        ahead = tick(researchBot(ahead));
        onTime = tick(growthBot(onTime));
        aheadSum += ahead.listeners;
        onTimeSum += onTime.listeners;
      }
      return aheadSum / onTimeSum;
    });
    // Smaller since 0.16.0 (about 1.7% against 3.5%): every manager has a room of their own, and the floor that takes is
    // floor the company that researches more would have grown on. With several managers to a room it is 2.5% again.
    expect(edges.reduce((sum, edge) => sum + edge, 0) / edges.length, edges.map((edge) => edge.toFixed(3)).join(', ')).toBeGreaterThan(1.01);
    // And it never costs listeners worth speaking of (one game in three comes out even since 0.16.0, at 0.02% short).
    for (const edge of edges) expect(edge).toBeGreaterThan(0.995);
  }, slow(240_000));
});
