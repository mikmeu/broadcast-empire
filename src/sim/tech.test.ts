import { describe, expect, it } from 'vitest';
import { RESEARCH, TIERS } from '../config/balance';
import { furnitureSpec } from '../config/office';
import { getTech, TECHS } from '../config/tech';
import { research, upgradeEquipment, type ActionResult } from './actions';
import { autoPlaceFurniture, roomOfKind } from './fixtures';
import { showQuality, simulateDay, studioLevel } from './broadcast';
import { sensibleBot } from './bots';
import { createInitialState } from './newGame';
import { unlockAll } from './unlocks';
import { employeesWithDesk } from './office';
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
    s.employees.push({ ...s.candidates.at(-1)!, hiredOn: 0, xp: 0, level: 1, morale: 60, location: null, desk: null, trainingUntil: null, courseIn: null, leaving: null, talentUntil: null });
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
    const old = s.rooms.find((r) => r.roomId === studio)!.furniture.filter((f) => furnitureSpec(f.type).line);
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
