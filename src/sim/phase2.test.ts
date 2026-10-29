import { describe, expect, it } from 'vitest';
import { xpForLevel } from '../config/levels';
import { ACTIVE_REGIONS, FLOOR_LEVEL, LOAN, RIVAL_MIN_FREE_SLOTS } from '../config/balance';
import { acceptOffer, hire, repayLoan, startCampaign, takeLoan, type ActionResult } from './actions';
import { autoPlaceFurniture, rentRoom } from './fixtures';
import { isMarketLeader, showQuality, simulateDay, specializationOf } from './broadcast';
import { growthBot, sensibleBot, type Bot } from './bots';
import { companyValue, maxLoan, settleMonth } from './economy';
import { freeLicenses, licenseSlots } from './licenses';
import { runCampaigns } from './marketing';
import { createInitialState } from './newGame';
import { slow } from './slow';
import { unlockAll } from './unlocks';
import { buildingOf, deskFor, deskRoomFor, employeesWithDesk } from './office';
import { expandRivals, refreshRivalShows } from './rivals';
import { Rng } from './rng';
import { refreshOffers, trackContracts } from './sales';
import { fromSaveFile, SAVE_VERSION } from './save';
import { effectiveSkill, gainExperience, xpForNextLevel } from './staff';
import type { GameState, Person } from './state';
import { tick } from './tick';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}
const error = (result: ActionResult) => (result.ok ? 'no error' : result.error);

/** The sensible bot's day-0 station: one channel in the Capital, five shows, free desks for two more staff. */
const station = () => structuredClone(unlockAll(sensibleBot(createInitialState(1))));

/** Adds a made-up candidate to the pool, so tests don't depend on the random pool. */
function withCandidate(state: GameState, person: Partial<Person> & Pick<Person, 'role'>): GameState & { lastId?: string } {
  const s = structuredClone(state);
  const candidate: Person = { id: `p-test-${s.candidates.length}`, name: 'Test Person', skill: 80, salary: 2_000, specialties: [], fame: 0, department: null, ...person };
  s.candidates.push(candidate);
  return Object.assign(s, { lastId: candidate.id });
}

/** Hires a made-up person and gives them a desk: a workstation, or for a manager a desk in the management office. */
function hireTest(state: GameState, person: Partial<Person> & Pick<Person, 'role'>): GameState & { lastId?: string } {
  const s = withCandidate(state, person);
  const id = s.lastId!;
  const room = s.rooms.find((r) => r.type === deskRoomFor(person.role))!.roomId;
  return Object.assign(ok(autoPlaceFurniture(ok(hire(s, id)), room, deskFor(person.role))), { lastId: id });
}

describe('licenses', () => {
  it('leaves at least one license free in every region at the start', () => {
    const s = unlockAll(createInitialState(1));
    for (const region of ACTIVE_REGIONS) expect(freeLicenses(s, 'radio', region)).toBeGreaterThanOrEqual(1);
  });

  it('adds licenses as regions grow', () => {
    expect(licenseSlots('radio', 'capital', 30 * 365)).toBeGreaterThan(licenseSlots('radio', 'capital', 0));
  });
});

describe('rivals', () => {
  it('never take the last free licenses in a region', () => {
    const s = structuredClone(unlockAll(createInitialState(1)));
    const rng = new Rng(9);
    for (let i = 0; i < 500; i++) expandRivals(s, rng);
    for (const region of ACTIVE_REGIONS) expect(freeLicenses(s, 'radio', region)).toBeGreaterThanOrEqual(RIVAL_MIN_FREE_SLOTS - 1);
  });

  it('replace their weakest show each season but keep their format', () => {
    const s = structuredClone(unlockAll(createInitialState(1)));
    const channel = s.rivals[0]!.channels[0]!;
    const genres = channel.schedule.map((sh) => sh.genre);
    const weakest = channel.schedule.reduce((a, b) => (b.quality < a.quality ? b : a));
    refreshRivalShows(s, new Rng(3));
    expect(channel.schedule.map((sh) => sh.genre)).toEqual(genres);
    expect(channel.schedule).not.toContainEqual(weakest);
  });
});

describe('managers and experience', () => {
  it('a production manager raises effective skill and show quality', () => {
    const s = station();
    const show = s.shows[0]!;
    const staff = s.employees.find((e) => e.id === show.staffIds[0])!;
    const before = showQuality(s, show).quality;
    const managed = hireTest(s, { role: 'manager', department: 'production', skill: 100 });
    const desked = employeesWithDesk(managed);
    expect(effectiveSkill(managed, staff, desked)).toBeCloseTo(Math.min(100, staff.skill * 1.2));
    expect(showQuality(managed, show).quality).toBeGreaterThan(before);
  });

  it('allows one manager per department', () => {
    const s = hireTest(station(), { role: 'manager', department: 'sales' });
    const second = withCandidate(s, { role: 'manager', department: 'sales' });
    expect(error(hire(second, second.lastId!))).toMatch(/already have a sales manager/);
  });

  it('levels people up with more skill and a matching salary', () => {
    const s = station();
    const person = s.employees.find((e) => e.role === 'production')!;
    person.xp = xpForNextLevel(person.level) - 1;
    const skill = person.skill;
    gainExperience(s, new Rng(1), employeesWithDesk(s), new Set());
    expect(person.level).toBe(2);
    expect(person.skill).toBeGreaterThan(skill);
    // No e-mail of its own: the month's report tells it.
    expect(s.messages.some((m) => /reached level/.test(m.text))).toBe(false);
    expect(s.levelUps.count).toBe(1);
    expect(s.levelUps.name).toBe(person.name);
    expect(s.levelUps.raise).toBeGreaterThan(0);
  });
});

describe('sponsors', () => {
  it('only offers deals when there are sales staff', () => {
    const s = tick(station());
    refreshOffers(s, new Rng(1), employeesWithDesk(s));
    expect(s.offers).toEqual([]);

    const sales = hireTest(hireTest(s, { role: 'sales', skill: 90 }), { role: 'sales', skill: 90 });
    refreshOffers(sales, new Rng(1), employeesWithDesk(sales));
    expect(sales.offers.length).toBeGreaterThan(0);
  });

  it('removes offers the day after they expire', () => {
    const s = structuredClone(station());
    s.offers.push({ id: 'o-old', sponsor: 'Old Soap', medium: 'radio', cpmMultiplier: 1.2, preferredAudience: null, minListeners: 1, weeks: 8, penalty: 100, expiresOn: s.day });
    expect(tick(s).offers.map((o) => o.id)).not.toContain('o-old');
  });

  it('pays a higher ad rate, and charges the penalty when a show falls short', () => {
    let s = tick(station());
    const show = s.shows[0]!;
    s = structuredClone(s);
    s.offers.push({ id: 'o-test', sponsor: 'Test Cola', medium: 'radio', cpmMultiplier: 1.5, preferredAudience: null, minListeners: 10_000_000, weeks: 1, penalty: 5_000, expiresOn: s.day + 14 });
    const revenue = (state: GameState) => simulateDay(state).channels[0]!.slots.find((x) => x.showId === show.id)!.revenue;
    const before = revenue(s);
    s = ok(acceptOffer(s, 'o-test', show.id));
    expect(revenue(s)).toBeCloseTo(before * 1.5);

    // Run the week out: nobody reaches ten million listeners.
    const money = s.money;
    for (let i = 0; i < 7; i++) {
      trackContracts(s, simulateDay(s));
      s.day += 1;
    }
    expect(s.contracts).toEqual([]);
    expect(s.money).toBe(money - 5_000);
    expect(s.ledger.sponsorPenalties).toBe(5_000);
  });
});

describe('marketing', () => {
  it('needs a marketer, costs its budget and raises listeners, then fades', () => {
    let s = tick(station());
    const channelId = s.channels[0]!.id;
    const input = { targetId: channelId, audience: 'all' as const, weeklyBudget: 10_000, weeks: 4 };
    expect(error(startCampaign(s, input))).toMatch(/marketer/);

    s = ok(startCampaign(hireTest(s, { role: 'marketing', skill: 100 }), input));
    const listeners = (state: GameState) => simulateDay(state).channels[0]!.slots.reduce((sum, x) => sum + x.listeners, 0);
    const before = listeners(s);
    const money = s.money;
    for (let i = 0; i < 28; i++) {
      runCampaigns(s, employeesWithDesk(s));
      s.day += 1;
    }
    expect(s.money).toBeCloseTo(money - 40_000);
    expect(s.campaigns).toEqual([]);
    expect(listeners(s)).toBeGreaterThan(before * 1.1);

    const peak = s.promotion[channelId]!.workers!;
    runCampaigns(s, employeesWithDesk(s));
    expect(s.promotion[channelId]!.workers!).toBeLessThan(peak);
  });
});

describe('loans', () => {
  it('lends up to half the company value and is repaid monthly', () => {
    const s = station();
    expect(maxLoan(s)).toBe(Math.floor((companyValue(s) * LOAN.maxShare) / 1000) * 1000);
    expect(error(takeLoan(s, maxLoan(s) + 1000, 24))).toMatch(/at most/);

    let loaned = ok(takeLoan(s, 50_000, 24));
    expect(loaned.money).toBe(s.money + 50_000);
    expect(error(takeLoan(loaned, 10_000, 24))).toMatch(/current loan/);

    loaned = structuredClone(loaned);
    const balance = loaned.loan!.balance;
    settleMonth(loaned);
    expect(loaned.loan!.monthsLeft).toBe(23);
    expect(loaned.loan!.balance).toBeLessThan(balance);
    expect(loaned.monthlyReports.at(-1)!.loanPayments).toBe(loaned.loan!.monthlyPayment);

    const repaid = ok(repayLoan(loaned));
    expect(repaid.loan).toBeNull();
  });
});

describe('growing offices and channels', () => {
  it('opens the second floor once the company reaches its level', () => {
    const s = station();
    expect(error(rentRoom(s, 'H'))).toMatch(/Floor 2 isn’t available/);
    const rich = { ...s, xp: xpForLevel(FLOOR_LEVEL[2]!), level: FLOOR_LEVEL[2]!, day: 30 };
    const next = tick(rich);
    expect(next.floorsUnlocked).toBe(2);
    expect(ok(rentRoom(next, 'H')).rooms.some((r) => r.roomId === 'H')).toBe(true);
  });

  it('recognises a channel specialization from three slots of one genre group', () => {
    expect(specializationOf(['top40', 'rock', 'classical', 'news', null])).toBe('Music');
    expect(specializationOf(['news', 'talk', 'news', 'top40', null])).toBe('News & Talk');
    expect(specializationOf(['top40', 'news', 'morningShow', 'radioDrama', null])).toBeNull();
  });
});

describe('saves from Phase 1', () => {
  it('upgrade to the Phase 2 state', () => {
    const s = structuredClone(station()) as unknown as Record<string, unknown> & GameState;
    // Shape a Phase 1 save: one rival, no Phase 2 fields, an unused license.
    const old = s as unknown as Record<string, unknown>;
    for (const key of ['offers', 'contracts', 'campaigns', 'promotion', 'loan', 'floorsUnlocked']) delete old[key];
    s.rivals = [s.rivals[0]!];
    delete (s.rivals[0] as unknown as Record<string, unknown>).personality;
    for (const e of s.employees) {
      delete (e as unknown as Record<string, unknown>).xp;
      delete (e as unknown as Record<string, unknown>).level;
    }
    for (const l of s.licenses) delete (l as unknown as Record<string, unknown>).price;
    (s.licenses as unknown[]).push({ id: 'l-old', regionId: 'north', medium: 'radio', channelId: null });
    const money = s.money;

    const { state, version } = fromSaveFile({ version: 2, savedAt: 1, state: s });
    expect(version).toBe(SAVE_VERSION);
    expect(state.rivals).toHaveLength(4);
    expect(state.employees.every((e) => e.level === 1 && e.xp === 0)).toBe(true);
    expect(state.licenses.map((l) => l.id)).not.toContain('l-old');
    expect(state.money).toBe(money + 20_000);
    // Every floor of the building is open in a save from before the levels (0.20.0).
    expect(state.floorsUnlocked).toBe(buildingOf(state).floors);
  });
});

// --- Phase 2 acceptance (prompt.md section 14) ---

const TEN_YEARS = Math.round(10 * 365.25);

/** Plays up to ten years; returns the day the player first led the weekly ratings (or null). */
function firstLead(bot: Bot, seed: number): { state: GameState; firstLeadDay: number | null } {
  let state = createInitialState(seed);
  let firstLeadDay: number | null = null;
  while (state.day < TEN_YEARS && !state.bankrupt && firstLeadDay === null) {
    const previous = state.weeklyReports.at(-1)?.fromDay;
    state = tick(bot(state));
    const latest = state.weeklyReports.at(-1);
    if (latest && latest.fromDay !== previous && isMarketLeader(latest, 'radio')) firstLeadDay = state.day;
  }
  return { state, firstLeadDay };
}

describe('Phase 2 acceptance', () => {
  it.each([1, 2, 3])('growing across regions and channels makes the player market leader (seed %i)', (seed) => {
    const { state, firstLeadDay } = firstLead(growthBot, seed);
    expect(state.bankrupt).toBe(false);
    expect(firstLeadDay).not.toBeNull();
    // Not trivial: it takes five months at the least.
    expect(firstLeadDay!).toBeGreaterThan(150);
  }, slow(30_000));

  it.each([1, 2, 3])('a single channel in the Capital never leads the market (seed %i)', (seed) => {
    expect(firstLead(sensibleBot, seed).firstLeadDay).toBeNull();
  }, slow(30_000));
});
