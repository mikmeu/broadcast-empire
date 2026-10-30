// Jobs and genres researched in history's order (0.20.0, #207).

import { describe, expect, it } from 'vitest';
import { FURNITURE } from '../config/office';
import { TECHS, techFor, type TechId } from '../config/tech';
import { buyNewsVan, hire, type ActionResult } from './actions';
import { tvBot } from './bots';
import { rentRoom, withTechs } from './fixtures';
import { newId, type GameState, type Role } from './state';
import { createInitialState } from './newGame';
import { vanBlocker } from './newsVans';
import { fromSaveFile, SAVE_VERSION, toSaveFile } from './save';
import { genreAvailable, saleBlocker } from './tech';
import { tick } from './tick';
import { canHire, hireBlocker, unlockAll } from './unlocks';

const JOBS: [Role, TechId, number][] = [
  ['engineer', 'multitrack', 1972],
  ['editor', 'videotapeEditing', 1976],
  ['scheduler', 'computerPlaylists', 1981],
  ['callAgent', 'phoneIns', 1974],
];

/** A new company with every feature open, with someone of a role in the hiring pool. */
function pool(role: Role): GameState {
  const s = structuredClone({ ...createInitialState(1), unlocked: unlockAll(createInitialState(1)).unlocked });
  s.candidates.push({ id: `c-${role}`, name: 'Test Person', role, skill: 50, salary: 1_500, specialties: [], fame: 0, department: null, foundFor: null });
  return s;
}

const ok = (result: ActionResult): GameState => {
  if (!result.ok) throw new Error(result.error);
  return result.state;
};

describe('jobs wait for their research', () => {
  it.each(JOBS)('%s: hired once %s is researched (%i)', (role, tech, year) => {
    expect(techFor(role)?.id).toBe(tech);
    expect(TECHS.find((t) => t.id === tech)!.year).toBe(year);
    const s = pool(role);
    expect(canHire(s, role)).toBe(false);
    expect(hireBlocker(s, role)).toMatch(/^Research .+ first\.$/);
    const refused = hire(s, `c-${role}`);
    expect(refused.ok).toBe(false);
    const open = withTechs(s, tech);
    expect(canHire(open, role)).toBe(true);
    expect(ok(hire(open, `c-${role}`)).employees.some((e) => e.role === role)).toBe(true);
  });

  it('journalists and the other jobs need no research', () => {
    for (const role of ['journalist', 'host', 'production', 'writer', 'cleaner'] as const) expect(canHire(unlockAll(createInitialState(1)), role)).toBe(true);
  });
});

describe('formats wait for their research', () => {
  it.each([
    ['talkShow', 'talkShowFormat', 'set'],
    ['sitcom', 'sitcomFormat', 'sitcomSet'],
    ['kids', 'kidsFormat', 'kidsSet'],
  ] as const)('%s needs %s, and so does its set', (genre, tech, set) => {
    const s = createInitialState(1);
    expect(genreAvailable(s, genre)).toBe(false);
    expect(saleBlocker(s, set)).toMatch(/^Research .+ first\.$/);
    const open = withTechs(s, tech);
    expect(genreAvailable(open, genre)).toBe(true);
    expect(saleBlocker(open, set)).toBeNull();
  });

  it('the desks of the four jobs are locked with them', () => {
    for (const [desk, tech] of [['audioDesk', 'multitrack'], ['editingDesk', 'videotapeEditing'], ['schedulingDesk', 'computerPlaylists'], ['callDesk', 'phoneIns']] as const) {
      expect(FURNITURE[desk].unlock).toBe(tech);
      expect(saleBlocker(createInitialState(1), desk)).not.toBeNull();
      expect(saleBlocker(withTechs(createInitialState(1), tech), desk)).toBeNull();
    }
  });
});

describe('the news van', () => {
  it('is bought once Electronic news gathering is researched', () => {
    const s = { ...unlockAll(createInitialState(1)), techs: [] as TechId[], money: 500_000 };
    expect(vanBlocker(s)).toBe('Research Electronic news gathering first.');
    expect(buyNewsVan(s).ok).toBe(false);
    expect(ok(buyNewsVan(withTechs(s, 'newsGathering'))).vans).toHaveLength(1);
  });
});

describe('an older game (save 62)', () => {
  it('gets the technologies for what it already uses', () => {
    const s = structuredClone(ok(rentRoom({ ...createInitialState(1), money: 1_000_000 }, 'A')));
    s.employees.push({ id: 'e1', name: 'Eve', role: 'engineer', skill: 50, salary: 1_500, specialties: [], fame: 0, department: null, hiredOn: 0, xp: 0, level: 1, morale: 60, location: null, desk: null, trainingUntil: null, courseIn: null, leaving: null, talentUntil: null, away: null });
    s.rooms[0]!.furniture.push({ id: 'f1', type: 'kidsSet', x: 0, y: 0, turn: 0, tier: 1, condition: 100, boughtOn: 0 });
    s.vans.push({ id: newId(s, 'v'), boughtOn: 0, price: 1, shift: null });
    s.techs = [];
    const file = JSON.parse(JSON.stringify(toSaveFile(s, 1)));
    file.version = 62;
    const { state } = fromSaveFile(file);
    expect(state.techs).toEqual(expect.arrayContaining(['multitrack', 'kidsFormat', 'newsGathering']));
    expect(state.techs).not.toContain('videotapeEditing');
    expect(state.techs).not.toContain('phoneIns');
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(63);
  });
});

describe('the TV test player', () => {
  it('researches the formats of its shows before it launches TV', () => {
    let s = createInitialState(1);
    for (let i = 0; i < 900 && !s.channels.some((c) => c.medium === 'tv'); i++) s = tick(tvBot(s));
    expect(s.channels.some((c) => c.medium === 'tv')).toBe(true);
    expect(s.techs).toEqual(expect.arrayContaining(['kidsFormat', 'soapOperaFormat']));
  }, 300_000);
});
