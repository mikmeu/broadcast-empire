import { describe, expect, it } from 'vitest';
import { DIVIDEND, POACH, RIVAL_DIFFICULTY, RIVAL_ERA, RIVAL_QUALITY_CAP, XP, type Difficulty } from '../config/balance';
import { capitalBot, growthBot, sensibleBot, tvBot, type Bot } from './bots';
import { toDay } from './calendar';
import { dividendDue, dividendReserve, salaryFor } from './economy';
import { generateRivalShow, rivalEraQuality, rivalStrength } from './generate';
import { createInitialState } from './newGame';
import { Rng } from './rng';
import { fromSaveFile, SAVE_VERSION } from './save';
import { slow } from './slow';
import { xpForNextLevel } from './staff';
import type { GameState } from './state';
import { advance, tick } from './tick';

/** The sensible bot's station on a date. */
function station(year = 1970, month = 1, dayOfMonth = 1): GameState {
  const s = structuredClone(sensibleBot(createInitialState(1)));
  s.day = toDay(year, month, dayOfMonth);
  return s;
}

const rivalQuality = (s: GameState) => {
  const shows = s.rivals.flatMap((r) => r.channels).flatMap((c) => c.schedule);
  return shows.reduce((sum, x) => sum + x.quality, 0) / shows.length;
};

describe('difficulty', () => {
  it('is normal by default and scales every rival show', () => {
    expect(createInitialState(1).difficulty).toBe('normal');
    const quality = (d: Difficulty) => rivalQuality(createInitialState(1, d));
    expect(quality('easy') / quality('normal')).toBeCloseTo(RIVAL_DIFFICULTY.easy / RIVAL_DIFFICULTY.normal);
    expect(quality('hard') / quality('normal')).toBeCloseTo(RIVAL_DIFFICULTY.hard / RIVAL_DIFFICULTY.normal);
  });

  it('rivals keep pace with the decades, up to a cap', () => {
    expect(rivalEraQuality(2000)).toBeCloseTo(1 + 30 * RIVAL_ERA.perYear);
    expect(rivalEraQuality(2100)).toBe(RIVAL_ERA.max);
    const s = station(1990);
    expect(rivalStrength(s)).toBeCloseTo(RIVAL_DIFFICULTY.normal * rivalEraQuality(1990));
    expect(generateRivalShow(new Rng(1), 'highbrow', 'news', [], 5).quality).toBe(RIVAL_QUALITY_CAP);
  });
});

describe('pay', () => {
  it('every level-up comes with a raise', () => {
    const s = station();
    const worker = s.employees.find((e) => e.role === 'production')!;
    worker.skill = 100;
    worker.salary = 4_000;
    worker.xp = xpForNextLevel(worker.level) - 1;
    const after = tick(s).employees.find((e) => e.id === worker.id)!;
    expect(after.level).toBe(worker.level + 1);
    expect(after.salary).toBe(Math.round((4_000 * (1 + XP.raisePerLevel)) / 50) * 50);
  });

  it('rivals offer hosts the going rate plus a premium, not ever more', () => {
    let s = station();
    const star = s.employees.find((e) => e.role === 'host')!.id;
    const offers: number[] = [];
    for (let i = 0; i < 4_000; i++) {
      for (const e of s.employees) if (e.role === 'host') e.fame = e.id === star ? 90 : 0;
      const offer = s.poachOffers[0];
      if (offer) {
        offers.push(offer.salary);
        s.employees.find((e) => e.id === star)!.salary = offer.salary;
        s.poachOffers = [];
      }
      s = tick(s);
    }
    const host = s.employees.find((e) => e.id === star)!;
    expect(offers.length).toBeGreaterThan(0);
    expect(Math.max(...offers)).toBeLessThanOrEqual(salaryFor('host', 100, 100, s) * POACH.premium.max);
    // Once matched, only a clearly better offer comes; pay doesn't ratchet up every time.
    expect(offers.length).toBeLessThan(8);
    expect(host.salary).toBeLessThan(15_000);
  });
});

describe('dividends', () => {
  /** A station on 31 December with this much money. */
  const yearEnd = (money: number) => ({ ...station(1971, 12, 31), money });

  it('the owners take a share of the cash above a year of running costs each January', () => {
    const s = yearEnd(2_000_000);
    const after = tick(s);
    const paid = after.dividendsPaid;
    expect(paid).toBeGreaterThan(0);
    expect(after.ledger.dividends).toBe(paid);
    // What was left after December's bills, above the reserve; a milestone reached the same day brings money after that.
    const afterBills = after.money + paid - after.ledger.gifts;
    expect(paid).toBe(Math.floor((DIVIDEND.payout * (afterBills - dividendReserve(after))) / 100) * 100);
    expect(after.messages.some((m) => /dividend/.test(m.text))).toBe(true);
    // The notice is a pop-up to Finance.
    expect(after.messages.find((m) => /dividend/.test(m.text))!.about).toBe('finance');
    // A dividend is not a cost: December's result doesn't include it.
    const december = after.monthlyReports.at(-1)!;
    expect(december.dividends).toBe(0);
    expect(december.balance).toBe(afterBills);
  });

  it('says so when December\'s bills pull a company under the reserve, and only then', () => {
    // Above the reserve on 31 December before the bills, below it after.
    const s = yearEnd(0);
    s.money = dividendReserve(s) + 400;
    expect(dividendDue(s)).toBeGreaterThan(0);
    const after = tick(s);
    expect(after.dividendsPaid).toBe(0);
    const note = after.messages.find((m) => /No dividend this year/.test(m.text));
    expect(note?.about).toBe('finance');
    // A company that was already under the reserve is not told every year.
    const poor = tick(yearEnd(100_000));
    expect(poor.messages.some((m) => /No dividend this year/.test(m.text))).toBe(false);
  });

  it('leaves a company below its reserve alone, and is only paid in January', () => {
    const poor = yearEnd(100_000);
    expect(dividendDue(poor)).toBe(0);
    expect(tick(poor).dividendsPaid).toBe(0);
    const june = { ...station(1971, 6, 30), money: 2_000_000 };
    expect(dividendDue(june)).toBeGreaterThan(0);
    expect(tick(june).dividendsPaid).toBe(0);
    expect(advance(yearEnd(2_000_000), 400).dividendsPaid).toBeGreaterThan(tick(yearEnd(2_000_000)).dividendsPaid);
  });
});

describe('saves from Phase 4c', () => {
  it('upgrade as a normal game with no dividends paid', () => {
    const s = structuredClone(advance(sensibleBot(createInitialState(1)), 40)) as unknown as Record<string, unknown> & GameState;
    delete (s as Record<string, unknown>).difficulty;
    delete (s as Record<string, unknown>).dividendsPaid;
    delete (s.ledger as unknown as Record<string, unknown>).dividends;
    for (const r of s.monthlyReports) delete (r as unknown as Record<string, unknown>).dividends;
    const { state, version } = fromSaveFile({ version: 7, savedAt: 1, state: s });
    expect(version).toBe(SAVE_VERSION);
    expect(state).toMatchObject({ difficulty: 'normal', dividendsPaid: 0 });
    expect(state.ledger.dividends).toBe(0);
    expect(state.monthlyReports.every((r) => r.dividends === 0)).toBe(true);
    expect(tick(state).day).toBe(41);
  });
});

// --- Phase 5a acceptance (prompt.md section 14) ---

describe('Phase 5a acceptance', () => {
  /** Plays to 2030 and returns the most cash the company ever held, in years of its revenue (after the first two years). */
  function mostCash(bot: Bot, seed: number): { state: GameState; years: number } {
    let s = createInitialState(seed);
    let years = 0;
    const end = toDay(2030, 1, 1);
    while (s.day < end && !s.bankrupt) {
      s = tick(bot(s));
      if (s.day % 30 !== 0 || s.monthlyReports.length < 24) continue;
      const revenue = s.monthlyReports.slice(-12).reduce((sum, r) => sum + r.revenue, 0);
      years = Math.max(years, s.money / revenue);
    }
    return { state: s, years };
  }

  it.each([
    ['radio', growthBot, 2],
    ['TV', tvBot, 1],
  ] as const)('a growing %s company never sits on more than three years of revenue, 1970–2030', (_name, bot, seed) => {
    const { state, years } = mostCash(bot, seed);
    expect(state.bankrupt).toBe(false);
    expect(years).toBeLessThan(3);
    // Much of the spare cash now goes into events (Phase 5d) before the owners can take it.
    expect(state.dividendsPaid).toBeGreaterThan(10_000_000);
  }, slow(300_000));

  it('one well-run radio channel in the Capital is tight but profitable on normal', () => {
    const TEN_YEARS = 3650;
    const games = [1, 2, 3, 4].map((seed) => {
      let s = createInitialState(seed);
      while (s.day < TEN_YEARS && !s.bankrupt) s = tick(capitalBot(s));
      return s;
    });
    const survivors = games.filter((s) => !s.bankrupt);
    // Three of the four lived until the rivals' theme weeks (0.20.0, #180) took about 2% of this bot's listeners for
    // a few weeks a year: seed 3 now goes under in 1974, with a month's rent to spare either way. The bot books none itself.
    expect(survivors.length).toBeGreaterThanOrEqual(2);
    let together = 0;
    for (const s of survivors) {
      expect(s.channels).toHaveLength(1);
      const revenue = s.monthlyReports.reduce((sum, r) => sum + r.revenue, 0);
      // What the company earned itself: Uncle Tabby's money for levels (0.20.0, #205) aside.
      const net = s.monthlyReports.reduce((sum, r) => sum + r.net - r.gifts, 0);
      together += net;
      // Tabby pays less than the milestones did (€20,000 a level) and floors now open by level, so this one-channel
      // bot grows slower and two of its seeds end the ten years a little under water on their own (seed 1 at -4% of
      // revenue, seed 3 at -1%); Tabby's levels keep both in the black. None may be far under.
      expect(net / revenue).toBeGreaterThan(-0.08);
      // Sponsors it has known for years pay up to 70% over the ad rate (0.10.0), and rent is a quarter lower since
      // 0.12.0, which lifts the best of these games to about 31%.
      expect(net / revenue).toBeLessThan(0.35);
    }
    expect(together).toBeGreaterThan(0);
  }, slow(120_000));

  it('easy is easier than normal, and hard is harder', () => {
    /** Ad revenue over five years: what the same play earns against weaker or stronger rivals. */
    const worth = (difficulty: Difficulty) => {
      let s = createInitialState(3, difficulty);
      // (On hard this company can go bankrupt since 0.16.0, with the master control room to pay for from the start.)
      while (s.day < 5 * 365 && !s.bankrupt) s = tick(growthBot(s));
      return s.monthlyReports.reduce((sum, r) => sum + r.revenue, 0);
    };
    const [easy, normal, hard] = [worth('easy'), worth('normal'), worth('hard')];
    expect(easy).toBeGreaterThan(normal * 1.05);
    expect(normal).toBeGreaterThan(hard * 1.05);
  }, slow(120_000));
});
