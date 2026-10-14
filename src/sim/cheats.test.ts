import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../config/office';
import { TECHS } from '../config/tech';
import { sensibleBot } from './bots';
import { toCalendarDate } from './calendar';
import { CHEATS, CHEAT_LIMITS, runCheat, type CheatResult } from './cheats';
import { createInitialState } from './newGame';
import type { GameState } from './state';
import { advance } from './tick';

function ok(result: CheatResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
const error = (result: CheatResult) => (result.ok ? null : result.error);

/** A company that has been on the air for a few weeks. */
const running = () => advance(sensibleBot(createInitialState(1)), 40);

describe('cheat codes (Phase 6b)', () => {
  it('adds and takes money, in the ways people type amounts', () => {
    const s = createInitialState(1);
    expect(ok(runCheat(s, 'money 50000')).money).toBe(s.money + 50_000);
    expect(ok(runCheat(s, 'MONEY 50.000')).money).toBe(s.money + 50_000);
    expect(ok(runCheat(s, '  money   50,000 ')).money).toBe(s.money + 50_000);
    expect(ok(runCheat(s, 'money 50k')).money).toBe(s.money + 50_000);
    expect(ok(runCheat(s, 'money 2m')).money).toBe(s.money + 2_000_000);
    expect(ok(runCheat(s, 'money -1000')).money).toBe(s.money - 1_000);
  });

  it('never changes the state it was given', () => {
    const s = running();
    const before = structuredClone(s);
    for (const { use } of CHEATS) runCheat(s, use);
    expect(s).toEqual(before);
  });

  it('answers every listed code, and lists them all under help', () => {
    const s = running();
    for (const { code, use } of CHEATS) {
      const result = runCheat(s, use);
      expect(result.ok, use).toBe(true);
      if (result.ok) expect(result.message.length, use).toBeGreaterThan(0);
      expect(ok(runCheat(s, 'help'))).toEqual(s);
      expect((runCheat(s, 'help') as { message: string }).message).toContain(code);
    }
  });

  it('explains what went wrong instead of guessing', () => {
    const s = createInitialState(1);
    expect(error(runCheat(s, ''))).toMatch(/help/);
    expect(error(runCheat(s, 'moneys 5'))).toMatch(/no code “moneys”/);
    expect(error(runCheat(s, 'money'))).toMatch(/number/);
    expect(error(runCheat(s, 'money lots'))).toMatch(/number/);
    expect(error(runCheat(s, 'year 1950'))).toMatch(/1970/);
    expect(error(runCheat(s, `year ${CHEAT_LIMITS.lastYear + 1}`))).toMatch(/from 1970/);
    expect(error(runCheat(s, 'research'))).toMatch(/research all/);
    expect(error(runCheat(s, 'reputation 80'))).toMatch(/no channel/);
  });

  it('moves the calendar to a year without ending anything early', () => {
    const s = running();
    const jumped = ok(runCheat(s, 'year 2000'));
    const shift = jumped.day - s.day;
    expect(toCalendarDate(jumped.day)).toMatchObject({ year: 2000, month: toCalendarDate(s.day).month, dayOfMonth: toCalendarDate(s.day).dayOfMonth });

    // Everything with a date moved along: licenses, contracts, staff and the history.
    expect(s.licenses.length).toBeGreaterThan(0);
    expect(jumped.licenses.map((l) => l.expiresOn - jumped.day)).toEqual(s.licenses.map((l) => l.expiresOn - s.day));
    expect(jumped.contracts.map((c) => c.endDay - jumped.day)).toEqual(s.contracts.map((c) => c.endDay - s.day));
    expect(jumped.employees.map((e) => e.hiredOn)).toEqual(s.employees.map((e) => e.hiredOn + shift));
    // Furniture is no older for it, so it is worth what it was.
    const pieces = (state: GameState) => state.rooms.flatMap((r) => r.furniture);
    expect(pieces(s).length).toBeGreaterThan(0);
    expect(pieces(jumped).map((f) => jumped.day - f.boughtOn)).toEqual(pieces(s).map((f) => s.day - f.boughtOn));
    expect(jumped.headlines.map((h) => h.day)).toEqual(s.headlines.map((h) => h.day + shift));
    expect(s.monthlyReports.length).toBeGreaterThan(0);
    expect(jumped.monthlyReports.map((r) => r.year)).toEqual(s.monthlyReports.map((r) => r.year + 2000 - toCalendarDate(s.day).year));
    expect(jumped.money).toBe(s.money);

    // The game plays on from there, and the jump can be undone.
    const later = advance(jumped, 40);
    expect(later.bankrupt).toBe(false);
    expect(later.licenses).toHaveLength(s.licenses.length);
    expect(ok(runCheat(jumped, `year ${toCalendarDate(s.day).year}`))).toEqual(s);
  });

  it('plays days ahead exactly like waiting, up to a limit', () => {
    const s = running();
    expect(ok(runCheat(s, 'days 30'))).toEqual(advance(s, 30));
    expect(error(runCheat(s, 'days 0'))).toMatch(/number/);
    expect(error(runCheat({ ...s, bankrupt: true }, 'days 5'))).toMatch(/bankrupt/);
  });

  it('sets research, reputation, prestige, floors, staff and upkeep', () => {
    const s = running();
    expect(ok(runCheat(s, 'rp 500')).researchPoints).toBe(s.researchPoints + 500);
    expect(ok(runCheat(s, 'rp -999999')).researchPoints).toBe(0);
    expect(ok(runCheat(s, 'research all')).techs).toHaveLength(TECHS.length);
    expect(ok(runCheat(s, 'prestige 100')).prestige).toBe(s.prestige + 100);
    expect(ok(runCheat(s, 'floors')).floorsUnlocked).toBe(BUILDINGS.standard.floors);

    const famous = ok(runCheat(s, 'reputation 80'));
    expect(famous.reputation).toBe(80);
    expect(famous.channels.flatMap((c) => Object.values(c.reputation))).toEqual(s.channels.flatMap((c) => Object.values(c.reputation)).map(() => 0.8));
    expect(ok(runCheat(s, 'reputation 500')).reputation).toBe(100);

    expect(ok(runCheat(s, 'morale 20')).employees.every((e) => e.morale === 20)).toBe(true);
    expect(ok(runCheat(s, 'skill 0')).employees.every((e) => e.skill === 1)).toBe(true);

    const worn = structuredClone(s);
    worn.rooms[0]!.cleanliness = 10;
    worn.rooms[0]!.issue = { kind: 'heating', workLeft: 5 } as unknown as GameState['rooms'][number]['issue'];
    worn.rooms[0]!.furniture[0]!.condition = 0;
    const fixed = ok(runCheat(worn, 'repair'));
    expect(fixed.rooms.every((r) => r.cleanliness === 100 && r.issue === null && r.furniture.every((f) => f.condition === 100))).toBe(true);
  });
});
