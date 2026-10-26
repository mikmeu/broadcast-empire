import { describe, expect, it } from 'vitest';
import { DAYS_PER_YEAR, JOURNALIST_CANDIDATES, NEWS_VAN, SALARY } from '../config/balance';
import { HINTS } from '../config/guide';
import { getGenre } from '../config/genres';
import { TO_RECORD } from '../config/voiceOver';
import { SLOTS } from '../config/world';
import { assignVan, buyNewsVan, hire, sellNewsVan, type ActionResult } from './actions';
import { sensibleBot } from './bots';
import { simulateDay } from './broadcast';
import { DUE } from './guide';
import { autoPlaceFurniture, roomOfKind } from './fixtures';
import { generateCandidates } from './generate';
import { emptyLedger } from './state';
import { monthlyNet, outlook, RUNNING_COSTS } from './economy';
import { eventContext, type EventContext } from './events';
import { createInitialState } from './newGame';
import { crewRates, payTrips, shiftOf, vanAppeal, vanCovers, vanCrews, vanTrips, vanValue } from './newsVans';
import { employeesWithDesk } from './office';
import { Rng } from './rng';
import { fromSaveFile, SAVE_VERSION, toSaveFile } from './save';
import { advance } from './tick';
import type { GameState } from './state';
import { unlockAll } from './unlocks';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}

/** A radio station from the sensible test player, a month on the air: its news show is in the evening slot. */
const station = (): GameState => {
  const s = structuredClone(unlockAll(advance(sensibleBot(createInitialState(1)), 34)));
  s.money = 5_000_000;
  return s;
};

const EVENING = SLOTS.indexOf('evening');

/** The station with a van sent out on a shift and, if asked, a journalist at a workstation to crew it. */
function withVan(state: GameState, shift: 'day' | 'evening' | null, journalist = true): GameState {
  let s = ok(buyNewsVan(state));
  s = ok(assignVan(s, s.vans[0]!.id, shift));
  if (!journalist) return s;
  const hired = structuredClone(s);
  hired.candidates.push({ id: 'journo', name: 'Jo Urnalist', role: 'journalist', skill: 50, salary: 1_500, specialties: [], fame: 0, department: null, foundFor: null });
  s = ok(hire(hired, 'journo'));
  const office = roomOfKind(s, 'office');
  for (let i = 0; i < 6 && !employeesWithDesk(s).has('journo'); i++) s = ok(autoPlaceFurniture(s, office, 'workstation'));
  expect(employeesWithDesk(s).has('journo')).toBe(true);
  return s;
}

/** What the station's evening slot drew on the day. */
const eveningListeners = (s: GameState) => simulateDay(s).channels.find((c) => c.isPlayer)!.slots[EVENING]!.listeners;
const otherListeners = (s: GameState) => simulateDay(s).channels.find((c) => c.isPlayer)!.slots.map((x) => x.listeners).filter((_, i) => i !== EVENING);

const noEvent: EventContext = { election: false, sports: null, holderId: undefined };

describe('The news van (0.20.0, #20)', () => {
  it('has a job of its own, in the hiring pool every month', () => {
    expect(SALARY.journalist.min).toBeLessThan(SALARY.journalist.max);
    const pool = generateCandidates(station(), new Rng(5), 1980);
    const journalists = pool.filter((p) => p.role === 'journalist');
    expect(journalists).toHaveLength(JOURNALIST_CANDIDATES);
    for (const j of journalists) expect(j.salary).toBeGreaterThanOrEqual(SALARY.journalist.min);
  });

  describe('buying, selling and sending it out', () => {
    it('costs the price, and sells for it again in the first days, less when it is old', () => {
      const s = station();
      const bought = ok(buyNewsVan(s));
      expect(bought.vans).toHaveLength(1);
      expect(bought.vans[0]).toMatchObject({ price: NEWS_VAN.price, shift: null, boughtOn: s.day });
      expect(bought.money).toBe(s.money - NEWS_VAN.price);
      const sold = ok(sellNewsVan(bought, bought.vans[0]!.id));
      expect(sold.vans).toEqual([]);
      expect(sold.money).toBe(s.money);
      const old = structuredClone(bought);
      old.day += 365 * 3;
      expect(vanValue(old.vans[0]!, old.day)).toBeLessThan(NEWS_VAN.price);
      expect(vanValue(old.vans[0]!, old.day)).toBeGreaterThan(0);
      expect(ok(sellNewsVan(old, old.vans[0]!.id)).money).toBe(old.money + vanValue(old.vans[0]!, old.day));
    });

    it('is not bought without the money, and cannot be sold or sent out if it is not yours', () => {
      const poor = { ...station(), money: NEWS_VAN.price - 1 };
      expect(buyNewsVan(poor).ok).toBe(false);
      expect(sellNewsVan(station(), 'v999').ok).toBe(false);
      expect(assignVan(station(), 'v999', 'day').ok).toBe(false);
    });

    it('has a shift of its own: a second van on a shift parks the first', () => {
      let s = ok(buyNewsVan(station()));
      s = ok(buyNewsVan(s));
      const [a, b] = s.vans.map((v) => v.id);
      s = ok(assignVan(s, a!, 'evening'));
      s = ok(assignVan(s, b!, 'evening'));
      expect(s.vans.map((v) => v.shift)).toEqual([null, 'evening']);
      s = ok(assignVan(s, b!, null));
      expect(s.vans.map((v) => v.shift)).toEqual([null, null]);
    });
  });

  describe('the crew', () => {
    it('is a journalist at a desk for each van that has a shift, in the order they were hired', () => {
      const crewed = withVan(station(), 'evening');
      expect([...vanCrews(crewed, employeesWithDesk(crewed)).values()].map((e) => e.id)).toEqual(['journo']);
      // A van that stands parked takes nobody.
      const parked = withVan(station(), null);
      expect(vanCrews(parked, employeesWithDesk(parked)).size).toBe(0);
      // Without a journalist, nobody goes.
      const alone = withVan(station(), 'evening', false);
      expect(crewRates(alone, employeesWithDesk(alone))).toEqual({ day: 0, evening: 0 });
    });

    it('rates a weaker or unhappier journalist lower', () => {
      const good = withVan(station(), 'evening');
      const poor = structuredClone(good);
      poor.employees.find((e) => e.id === 'journo')!.skill = 15;
      expect(crewRates(poor, employeesWithDesk(poor)).evening).toBeLessThan(crewRates(good, employeesWithDesk(good)).evening);
      expect(crewRates(good, employeesWithDesk(good)).day).toBe(0);
    });
  });

  describe('the lift', () => {
    it('is NEWS_VAN.lift for a news show in the shift, and scaled by the crew', () => {
      const s = withVan(station(), 'evening');
      const rates = crewRates(s, employeesWithDesk(s));
      const news = getGenre('news');
      expect(vanAppeal(s, rates, news, EVENING, noEvent)).toBeCloseTo(1 + (NEWS_VAN.lift - 1) * rates.evening);
      // Not in the other shift, nor for shows that are not news.
      expect(vanAppeal(s, rates, news, SLOTS.indexOf('morning'), noEvent)).toBe(1);
      expect(vanAppeal(s, rates, getGenre('top40'), EVENING, noEvent)).toBe(1);
      // TV news too, and a crew of nobody lifts nothing.
      expect(vanAppeal(s, rates, getGenre('tvNews'), EVENING, noEvent)).toBeGreaterThan(1);
      expect(vanAppeal(s, { day: 0, evening: 0 }, news, EVENING, noEvent)).toBe(1);
    });

    it('is bigger with a satellite uplink', () => {
      const s = withVan(station(), 'evening');
      const rates = crewRates(s, employeesWithDesk(s));
      const before = vanAppeal(s, rates, getGenre('news'), EVENING, noEvent);
      s.techs.push('satelliteUplink');
      expect(vanAppeal(s, rates, getGenre('news'), EVENING, noEvent)).toBeGreaterThan(before);
      expect(vanAppeal(s, rates, getGenre('news'), EVENING, noEvent)).toBeCloseTo(1 + (NEWS_VAN.uplinkLift - 1) * rates.evening);
    });

    it('covers sports only on a day with a sports event on, or an election campaign', () => {
      const sports = getGenre('sportsCommentary');
      const tvSports = getGenre('tvSports');
      expect(vanCovers(sports, noEvent)).toBe(false);
      expect(vanCovers(sports, { ...noEvent, election: true })).toBe(true);
      const event = { id: 'x', kind: 'worldCup', name: 'World Cup', startDay: 0, endDay: 1 } as unknown as NonNullable<EventContext['sports']>;
      expect(vanCovers(sports, { election: false, sports: event, holderId: undefined })).toBe(true);
      // On TV only for whoever holds the rights.
      expect(vanCovers(tvSports, { election: false, sports: event, holderId: 'rival' })).toBe(false);
      expect(vanCovers(tvSports, { election: false, sports: event, holderId: 'player' })).toBe(true);
    });

    it('draws more listeners to the news show in its shift, and to nothing else', () => {
      const bare = station();
      const day = withVan(station(), 'day');
      const evening = withVan(station(), 'evening');
      const noCrew = withVan(station(), 'evening', false);
      expect(eveningListeners(evening)).toBeGreaterThan(eveningListeners(bare));
      // A van in the other shift, or without a journalist, changes nothing.
      expect(eveningListeners(day)).toBe(eveningListeners(bare));
      expect(eveningListeners(noCrew)).toBe(eveningListeners(bare));
      // The slots of the other shift are untouched.
      expect(otherListeners(evening)).toEqual(otherListeners(bare));
    });
  });

  describe('the trips', () => {
    it('go out for the shows that are worth it: the evening van with the evening news, not the day van', () => {
      const s = withVan(station(), 'evening');
      const desked = employeesWithDesk(s);
      expect(vanTrips(s, desked, [{ slot: EVENING, genre: 'news' }], noEvent).get('evening')).toBe(s.vans[0]!.id);
      // No news on, no trip; a sports show without an event is not worth one.
      expect(vanTrips(s, desked, [{ slot: EVENING, genre: 'top40' }], noEvent).size).toBe(0);
      expect(vanTrips(s, desked, [{ slot: EVENING, genre: 'sportsCommentary' }], noEvent).size).toBe(0);
      expect(vanTrips(s, desked, [{ slot: 0, genre: 'news' }], noEvent).size).toBe(0);
      const alone = withVan(station(), 'evening', false);
      expect(vanTrips(alone, employeesWithDesk(alone), [{ slot: EVENING, genre: 'news' }], noEvent).size).toBe(0);
    });

    it('cost the fee on each day the van goes out, on a line of the books of its own', () => {
      const s = withVan(station(), 'evening');
      const before = s.ledger.newsVans;
      const day = advance(s, 1);
      expect(day.ledger.newsVans - before).toBe(NEWS_VAN.trip);
      // A month of them: a trip on every day the news is on.
      const month = advance(s, 7);
      expect(month.ledger.newsVans - before).toBe(7 * NEWS_VAN.trip);
      // Not for a van in the shift with no news, a van without a crew, or no van.
      expect(advance(withVan(station(), 'day'), 1).ledger.newsVans).toBe(station().ledger.newsVans);
      expect(advance(withVan(station(), 'evening', false), 1).ledger.newsVans).toBe(station().ledger.newsVans);
      expect(advance(station(), 1).ledger.newsVans).toBe(station().ledger.newsVans);
    });

    it('are paid from the cash, and counted as a running cost in the month’s result', () => {
      const s = withVan(station(), 'evening');
      const result = simulateDay(s);
      const draft = structuredClone(s);
      const trips = payTrips(draft, result, employeesWithDesk(draft), eventContext(draft));
      expect(trips.size).toBe(1);
      expect(draft.money).toBe(s.money - NEWS_VAN.trip);
      expect(RUNNING_COSTS).toContain('newsVans');
      const ledger = { ...emptyLedger(), revenue: 1_000, newsVans: 100 };
      expect(monthlyNet(ledger)).toBe(900);
      // And the month ahead counts them.
      expect(outlook(s).newsVans).toBeCloseTo(NEWS_VAN.trip * (DAYS_PER_YEAR / 12), 0);
      expect(outlook(station()).newsVans).toBe(0);
    });

    it('stay in the lot when the shift has nothing to report on', () => {
      const s = withVan(station(), 'day');
      expect(advance(s, 3).money).toBeGreaterThan(0);
      expect(shiftOf(0)).toBe('day');
      expect(shiftOf(EVENING)).toBe('evening');
    });
  });

  describe('Penny', () => {
    it('speaks of it once there is news on the air, no van and a journalist to hire, and has it recorded', () => {
      const line = HINTS.find((h) => h.id === 'newsVan')!;
      expect(line.say).toContain('news van');
      expect(TO_RECORD.newsVan).toBe('new');
      const due = DUE.newsVan!;
      const s = station();
      s.candidates.push({ id: 'jo', name: 'Jo', role: 'journalist', skill: 50, salary: 1_000, specialties: [], fame: 0, department: null, foundFor: null });
      expect(due(s)).toBe(true);
      expect(due(ok(buyNewsVan(s)))).toBe(false);
      expect(due({ ...s, candidates: [] })).toBe(false);
    });
  });

  describe('the bot', () => {
    it('buys one van and hires one journalist for it once it has news on the air and money to spare', () => {
      let s = createInitialState(1);
      for (let i = 0; i < 3 * 365 && s.vans.length === 0 && !s.bankrupt; i++) s = advance(sensibleBot(s), 1);
      expect(s.vans.length).toBeLessThanOrEqual(1);
      if (s.vans.length === 1) expect(s.vans[0]!.shift).not.toBeNull();
    }, 120_000);
  });

  describe('older games', () => {
    it('load from before the vans: no van, and a line for them in the books', () => {
      const file = JSON.parse(JSON.stringify(toSaveFile(station(), 0)));
      delete file.state.vans;
      delete file.state.ledger.newsVans;
      for (const report of file.state.monthlyReports) delete report.newsVans;
      const loaded = fromSaveFile({ ...file, version: 57 });
      expect(loaded.version).toBe(SAVE_VERSION);
      expect(SAVE_VERSION).toBeGreaterThanOrEqual(58);
      expect(loaded.state.vans).toEqual([]);
      expect(loaded.state.ledger.newsVans).toBe(0);
      for (const report of loaded.state.monthlyReports) expect(report.newsVans).toBe(0);
      // And it plays on.
      expect(advance(loaded.state, 2).day).toBe(loaded.state.day + 2);
    });
  });
});
