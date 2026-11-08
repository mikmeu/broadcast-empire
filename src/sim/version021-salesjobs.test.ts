import { beforeAll, describe, expect, it } from 'vitest';
import { BRANDS, RELATIONS } from '../config/balance';
import { acceptOffer, setBrands, setSalesJob, type ActionResult } from './actions';
import { growthBot } from './bots';
import { createInitialState } from './newGame';
import { employeesWithDesk } from './office';
import { Rng } from './rng';
import { fromSaveFile, SAVE_VERSION, toSaveFile } from './save';
import { activeBrands, brandHolder, pointsForLevel, refreshOffers, relationOf, sponsorRate, unworkedBrands, workOnRelations } from './sales';
import { salesAtDesk } from './deals';
import { brandLimit, dealsPower, removeEmployee, salesGrade, unassign } from './staff';
import type { Employee, GameState, SponsorOffer } from './state';
import { tick } from './tick';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

const offer = (s: GameState, id: string, sponsor: string): SponsorOffer => ({ id, sponsor, medium: 'radio', cpmMultiplier: sponsorRate(1), preferredAudience: null, minListeners: 1, weeks: 26, penalty: 100, expiresOn: s.day + 14 });

/** A company with a salesperson at a desk and two sponsors under contract, Acme and Bolt. */
let base: GameState;
beforeAll(() => {
  let s = createInitialState(1);
  for (let day = 0; day < 150; day++) s = tick(growthBot(s));
  const [first, second] = s.shows;
  let t: GameState = { ...s, contracts: [], relations: {}, offers: [offer(s, 'o1', 'Acme'), offer(s, 'o2', 'Bolt')] };
  t = ok(acceptOffer(ok(acceptOffer(t, 'o1', first!.id)), 'o2', second!.id));
  base = t;
}, 120_000);

const fresh = (job: 'deals' | 'brands' | undefined, skill = 100): GameState => {
  const s = structuredClone(base);
  for (const e of s.employees) {
    if (e.role !== 'sales') continue;
    e.skill = skill;
    if (job) e.salesJob = job;
    else delete e.salesJob;
    delete e.brands;
  }
  return s;
};
const seller = (s: GameState): Employee => s.employees.find((e) => e.role === 'sales')!;
const sales = (s: GameState) => s.employees.filter((e) => e.role === 'sales');

describe('sales staff jobs (0.21.0, #360)', () => {
  it('a grade of 50 starts the second band and 70 the third', () => {
    expect([0, 49, 50, 69, 70, 100].map(brandLimit)).toEqual([BRANDS.base, 1, 2, 2, 3, 3]);
  });

  it('only people on deals count for offers, selling and letting; a missing job counts as deals', () => {
    const s = fresh('brands');
    const desked = employeesWithDesk(s);
    expect(sales(s).length).toBeGreaterThan(0);
    expect(dealsPower(s, desked)).toBe(0);
    expect(salesAtDesk(s)).toBe(false);
    const none = structuredClone(s);
    none.offers = [];
    for (let seed = 1; seed <= 20; seed++) refreshOffers(none, new Rng(seed), desked);
    expect(none.offers).toHaveLength(0);

    for (const job of ['deals', undefined] as const) {
      const d = fresh(job);
      expect(dealsPower(d, employeesWithDesk(d))).toBeGreaterThan(0);
      expect(salesAtDesk(d)).toBe(true);
      d.offers = [];
      d.contracts = [];
      for (let seed = 1; seed <= 20; seed++) refreshOffers(d, new Rng(seed), employeesWithDesk(d));
      expect(d.offers.length).toBeGreaterThan(0);
    }
  });

  it('a brand with nobody on it earns no points, and nobody on deals works on brands', () => {
    const s = fresh('deals');
    for (let day = 0; day < 20; day++) workOnRelations(s, employeesWithDesk(s));
    expect(relationOf(s, 'Acme')).toEqual({ level: 1, points: 0 });
    expect(relationOf(s, 'Bolt')).toEqual({ level: 1, points: 0 });
    expect(unworkedBrands(s, employeesWithDesk(s)).sort()).toEqual(['Acme', 'Bolt']);
  });

  it('a free person on brands takes the brands nobody holds, as many as their grade allows, and earns points for them', () => {
    const s = fresh('brands');
    const desked = employeesWithDesk(s);
    const grade = salesGrade(s, seller(s), desked);
    expect(grade).toBeGreaterThanOrEqual(50);
    workOnRelations(s, desked);
    // Taken in turn, the most skilled first: one brand each, never two people on one.
    const held = sales(s).flatMap((e) => e.brands ?? []);
    expect(held.sort()).toEqual(['Acme', 'Bolt']);
    expect(brandHolder(s, 'Acme')).toBeDefined();
    expect(relationOf(s, 'Acme').points).toBeGreaterThan(0);
    expect(relationOf(s, 'Bolt').points).toBeGreaterThan(0);
    expect(unworkedBrands(s, desked)).toEqual([]);
  });

  it('a person under grade 50 works one brand: the last ones pause, and earn nothing', () => {
    const s = fresh('brands', 20);
    const person = seller(s);
    person.brands = ['Acme', 'Bolt'];
    const desked = employeesWithDesk(s);
    expect(brandLimit(salesGrade(s, person, desked))).toBe(1);
    expect(activeBrands(person, salesGrade(s, person, desked))).toEqual(['Acme']);
    workOnRelations(s, desked);
    expect(relationOf(s, 'Acme').points).toBeGreaterThan(0);
    expect(relationOf(s, 'Bolt').points).toBe(0);
    // They keep it on the list, and it counts as unworked.
    expect(person.brands).toEqual(['Acme', 'Bolt']);
    expect(unworkedBrands(s, desked)).toEqual(['Bolt']);
  });

  it('drops a brand with no contract and one at the top level, and levels up at the points', () => {
    const s = fresh('brands');
    const person = seller(s);
    person.brands = ['Acme', 'Bolt', 'Gone'];
    s.relations['Bolt'] = { level: RELATIONS.levels, points: 0 };
    s.relations['Acme'] = { level: 1, points: pointsForLevel(1) - 0.01 };
    workOnRelations(s, employeesWithDesk(s));
    expect(person.brands).toEqual(['Acme']);
    expect(relationOf(s, 'Acme').level).toBe(2);
  });

  it('unassign clears the job and the brands, and leaves a warning naming them', () => {
    const s = fresh('brands');
    seller(s).brands = ['Acme'];
    const id = seller(s).id;
    unassign(s, id);
    expect(seller(s).salesJob).toBeUndefined();
    expect(seller(s).brands).toBeUndefined();
    expect(s.messages.some((m) => m.kind === 'warning' && m.text.includes('Acme') && m.about === 'sales')).toBe(true);
    const gone = fresh('brands');
    seller(gone).brands = ['Bolt'];
    const goneId = seller(gone).id;
    removeEmployee(gone, goneId);
    expect(gone.messages.some((m) => m.kind === 'warning' && m.text.includes('Bolt'))).toBe(true);
  });

  it('setSalesJob moves a person between jobs; deals frees their brands', () => {
    let s = fresh('deals');
    const id = seller(s).id;
    s = ok(setSalesJob(s, id, 'brands'));
    expect(seller(s).salesJob).toBe('brands');
    s = ok(setBrands(s, id, ['Acme']));
    expect(seller(s).brands).toEqual(['Acme']);
    s = ok(setSalesJob(s, id, 'deals'));
    expect(seller(s).brands).toBeUndefined();
    expect(() => ok(setBrands(s, id, ['Acme']))).toThrow(/on brands/);
  });

  it('setBrands takes contracted brands only, up to the grade, and moves a brand held by someone else', () => {
    let s = fresh('brands', 20);
    const id = seller(s).id;
    expect(() => ok(setBrands(s, id, ['Nobody']))).toThrow(/no contract/);
    expect(() => ok(setBrands(s, id, ['Acme', 'Bolt']))).toThrow(/can work on 1 brand/);
    // A second person on brands holds Acme; the first takes it from them.
    const other: Employee = { ...structuredClone(seller(s)), id: 'other', salesJob: 'brands', brands: ['Acme'] };
    s = { ...s, employees: [...s.employees, other] };
    s = ok(setBrands(s, id, ['Acme']));
    expect(s.employees.find((e) => e.id === 'other')!.brands).toEqual([]);
    expect(seller(s).brands).toEqual(['Acme']);
  });

  it('a save from before splits the sales staff, best first, alternately onto deals and brands, and says so once', () => {
    const s = structuredClone(base);
    const proto = seller(s);
    s.employees = [
      ...s.employees.filter((e) => e.role !== 'sales'),
      ...[30, 80, 55].map((skill, n) => ({ ...structuredClone(proto), id: `s${n}`, skill })),
    ];
    for (const e of s.employees) {
      delete e.salesJob;
      delete e.brands;
    }
    const file = { ...toSaveFile(s, 1), version: 76 };
    const loaded = fromSaveFile(file);
    expect(loaded.version).toBe(SAVE_VERSION);
    const by = (id: string) => loaded.state.employees.find((e) => e.id === id)!;
    expect(by('s1').salesJob).toBe('deals');
    expect(by('s2').salesJob).toBe('brands');
    expect(by('s0').salesJob).toBe('deals');
    expect(by('s2').brands).toEqual([]);
    expect(by('s1').brands).toBeUndefined();
    expect(loaded.state.messages.filter((m) => m.text.includes('Sales staff now have jobs'))).toHaveLength(1);

    // Nobody in Sales: no message.
    const empty = structuredClone(s);
    empty.employees = empty.employees.filter((e) => e.role !== 'sales');
    expect(fromSaveFile({ ...toSaveFile(empty, 1), version: 76 }).state.messages.some((m) => m.text.includes('Sales staff now have jobs'))).toBe(false);
  });
});
