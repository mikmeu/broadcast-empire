import { describe, expect, it } from 'vitest';
import { HELICOPTER } from '../config/balance';
import { HINTS } from '../config/guide';
import { xpForLevel } from '../config/levels';
import { UNLOCKS } from '../config/unlocks';
import { SLOTS } from '../config/world';
import { buyHelicopter, buyNewsVan, sellHelicopter, type ActionResult } from './actions';
import { sensibleBot } from './bots';
import { simulateDay } from './broadcast';
import { companyValue, monthlyNet, outlook, RUNNING_COSTS } from './economy';
import { DUE } from './guide';
import { flies, hasRushNews, helicopterAppeal, helicopterBlocker, helicopterValue, payFlight, plannedFlight } from './helicopter';
import { checkMilestones } from './milestones';
import { createInitialState } from './newGame';
import { airedToday } from './newsVans';
import { fromSaveFile, SAVE_VERSION, toSaveFile } from './save';
import { emptyLedger, type GameState } from './state';
import { advance } from './tick';
import { unlockAll } from './unlocks';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}

const MORNING = SLOTS.indexOf('morning');
const LUNCH = SLOTS.indexOf('lunch');
const EVENING = SLOTS.indexOf('evening');

/** A radio station from the sensible test player, a month on the air: its news show is in the evening slot. Everything is open. */
const station = (): GameState => {
  const s = structuredClone(unlockAll(advance(sensibleBot(createInitialState(1)), 34)));
  s.money = 5_000_000;
  return s;
};

/** The station's news show, put into a slot of the first channel (the others are left as they were). */
function newsIn(state: GameState, slot: number): GameState {
  const s = structuredClone(state);
  const news = s.shows.find((x) => x.genre === 'news')!;
  s.channels[0]!.schedule[slot] = news.id;
  return s;
}

/** The station with the news in the rush slots only: the evening, as it is, and nothing elsewhere. */
function newsOnlyIn(state: GameState, slot: number): GameState {
  const s = structuredClone(state);
  const news = s.shows.find((x) => x.genre === 'news')!;
  s.channels[0]!.schedule = s.channels[0]!.schedule.map((id, i) => (i === slot ? news.id : id === news.id ? '' : id));
  return s;
}

const slotListeners = (s: GameState, slot: number) => simulateDay(s).channels.find((c) => c.isPlayer)!.slots[slot]!.listeners;

describe('The traffic helicopter (0.22.0, #395)', () => {
  it('has the numbers of the plan and opens at level 10, in the Garage', () => {
    expect(HELICOPTER).toMatchObject({ price: 250_000, flight: 1_000, lift: 1.08, slots: [MORNING, EVENING] });
    expect(UNLOCKS.helicopter).toMatchObject({ level: 10, window: 'garage' });
  });

  describe('unlocking', () => {
    it('is locked until level 10, then opened by the level, in an older game too', () => {
      const fresh = createInitialState(1);
      expect(helicopterBlocker(fresh)).toBe('The traffic helicopter opens at level 10.');
      expect(buyHelicopter({ ...fresh, money: 9_000_000 }).ok).toBe(false);
      const old = structuredClone(fresh);
      old.xp = xpForLevel(10);
      old.unlocked = old.unlocked.filter((f) => f !== 'helicopter');
      checkMilestones(old);
      expect(old.unlocked).toContain('helicopter');
      expect(helicopterBlocker(old)).toBeNull();
      // Level 9 is not enough.
      const nine = structuredClone(fresh);
      nine.xp = xpForLevel(9);
      checkMilestones(nine);
      expect(nine.unlocked).not.toContain('helicopter');
      expect(helicopterBlocker(unlockAll(fresh))).toBeNull();
    });
  });

  describe('buying and selling', () => {
    it('costs the price, sells for what it is worth, and one at a time', () => {
      const s = station();
      const bought = ok(buyHelicopter(s));
      expect(bought.helicopter).toEqual({ boughtOn: s.day, price: HELICOPTER.price });
      expect(bought.money).toBe(s.money - HELICOPTER.price);
      expect(helicopterBlocker(bought)).toMatch(/already/);
      expect(buyHelicopter(bought).ok).toBe(false);
      const sold = ok(sellHelicopter(bought));
      expect(sold.helicopter).toBeNull();
      expect(sold.money).toBe(s.money);
      const old = structuredClone(bought);
      old.day += 365 * 3;
      expect(helicopterValue(old.helicopter!, old.day)).toBeLessThan(HELICOPTER.price);
      expect(ok(sellHelicopter(old)).money).toBe(old.money + helicopterValue(old.helicopter!, old.day));
    });

    it('is not bought without the money, and cannot be sold if you have none', () => {
      expect(buyHelicopter({ ...station(), money: HELICOPTER.price - 1 }).ok).toBe(false);
      expect(sellHelicopter(station()).ok).toBe(false);
    });

    it('counts in the company value', () => {
      const s = station();
      const bought = ok(buyHelicopter(s));
      expect(companyValue(bought)).toBe(companyValue(s) - HELICOPTER.price + helicopterValue(bought.helicopter!, bought.day));
    });
  });

  describe('the flight', () => {
    it('is only with your own news in the morning or the evening', () => {
      const s = ok(buyHelicopter(station()));
      expect(flies(s, [{ slot: MORNING, genre: 'news' }])).toBe(true);
      expect(flies(s, [{ slot: EVENING, genre: 'tvNews' }])).toBe(true);
      expect(flies(s, [{ slot: LUNCH, genre: 'news' }])).toBe(false);
      expect(flies(s, [{ slot: EVENING, genre: 'sportsCommentary' }])).toBe(false);
      expect(flies(s, [{ slot: EVENING, genre: 'tvSports' }])).toBe(false);
      expect(flies(station(), [{ slot: EVENING, genre: 'news' }])).toBe(false);
    });

    it('costs the fee on a day it flies, on a line of the books of its own, and nothing otherwise', () => {
      const s = ok(buyHelicopter(newsOnlyIn(station(), EVENING)));
      const day = advance(s, 1);
      expect(day.ledger.helicopter - s.ledger.helicopter).toBe(HELICOPTER.flight);
      expect(advance(s, 5).ledger.helicopter - s.ledger.helicopter).toBe(5 * HELICOPTER.flight);
      // Once for the day, even with news in both rush slots.
      const both = ok(buyHelicopter(newsIn(newsOnlyIn(station(), EVENING), MORNING)));
      expect(advance(both, 1).ledger.helicopter - both.ledger.helicopter).toBe(HELICOPTER.flight);
      // No news in the rush hours, no helicopter, no flight.
      const lunch = ok(buyHelicopter(newsOnlyIn(station(), LUNCH)));
      expect(advance(lunch, 1).ledger.helicopter).toBe(lunch.ledger.helicopter);
      expect(advance(newsOnlyIn(station(), EVENING), 1).ledger.helicopter).toBe(0);
    });

    it('is paid from the cash and counted as a running cost', () => {
      const s = ok(buyHelicopter(newsOnlyIn(station(), EVENING)));
      const result = simulateDay(s);
      expect(airedToday(s, result).some((a) => a.slot === EVENING && a.genre === 'news')).toBe(true);
      const draft = structuredClone(s);
      expect(payFlight(draft, result)).toBe(true);
      expect(draft.money).toBe(s.money - HELICOPTER.flight);
      expect(RUNNING_COSTS).toContain('helicopter');
      expect(monthlyNet({ ...emptyLedger(), revenue: 1_000, helicopter: 100 })).toBe(900);
      expect(outlook(s).helicopter).toBeGreaterThan(0);
      expect(outlook(newsOnlyIn(station(), EVENING)).helicopter).toBe(0);
      expect(outlook(ok(buyHelicopter(newsOnlyIn(station(), LUNCH)))).helicopter).toBe(0);
    });

    it('is planned from the schedules', () => {
      const s = newsOnlyIn(station(), EVENING);
      expect(hasRushNews(s)).toBe(true);
      expect(plannedFlight(s)).toBe(false);
      expect(plannedFlight(ok(buyHelicopter(s)))).toBe(true);
      expect(hasRushNews(newsOnlyIn(station(), LUNCH))).toBe(false);
    });
  });

  describe('the lift', () => {
    it('is ×1.08 for radio and TV news in the rush slots, and 1 elsewhere', () => {
      const s = ok(buyHelicopter(station()));
      expect(helicopterAppeal(s, 'news', MORNING)).toBe(HELICOPTER.lift);
      expect(helicopterAppeal(s, 'tvNews', EVENING)).toBe(HELICOPTER.lift);
      for (const slot of [LUNCH, SLOTS.indexOf('afternoon'), SLOTS.indexOf('lateNight')]) expect(helicopterAppeal(s, 'news', slot)).toBe(1);
      expect(helicopterAppeal(s, 'sportsCommentary', EVENING)).toBe(1);
      expect(helicopterAppeal(s, 'tvSports', MORNING)).toBe(1);
      expect(helicopterAppeal(s, 'top40', EVENING)).toBe(1);
      expect(helicopterAppeal(station(), 'news', EVENING)).toBe(1);
      // Not for a title bought.
      expect(helicopterAppeal(s, 'tvNews', EVENING, false)).toBe(1);
    });

    it('draws more listeners to the news in the rush slot, and to nothing else', () => {
      const bare = newsOnlyIn(station(), EVENING);
      const flown = ok(buyHelicopter(bare));
      expect(slotListeners(flown, EVENING)).toBeGreaterThan(slotListeners(bare, EVENING));
      const others = (s: GameState) => simulateDay(s).channels.find((c) => c.isPlayer)!.slots.map((x) => x.listeners).filter((_, i) => i !== EVENING);
      expect(others(flown)).toEqual(others(bare));
      // News at lunch is not lifted.
      const lunchBare = newsOnlyIn(station(), LUNCH);
      expect(slotListeners(ok(buyHelicopter(lunchBare)), LUNCH)).toBe(slotListeners(lunchBare, LUNCH));
    });

    it('stacks with the news van', () => {
      const bare = newsOnlyIn(station(), EVENING);
      const flown = ok(buyHelicopter(bare));
      expect(helicopterAppeal(flown, 'news', EVENING)).toBe(HELICOPTER.lift);
      // A van without a crew adds nothing of its own, so the lift of the helicopter stays the same on top of it.
      const withVan = ok(buyNewsVan(flown));
      expect(slotListeners(withVan, EVENING)).toBe(slotListeners(flown, EVENING));
    });
  });

  describe('the save', () => {
    it('is version 82, and a game from 81 loads with the helicopter, the books and the reports filled in', () => {
      expect(SAVE_VERSION).toBeGreaterThanOrEqual(82);
      const s = structuredClone(station()) as any;
      delete s.helicopter;
      delete s.ledger.helicopter;
      s.monthlyReports = [{ ...s.ledger }];
      delete s.monthlyReports[0].helicopter;
      const file = { ...toSaveFile(s, 0), version: 81 };
      const loaded = fromSaveFile(JSON.parse(JSON.stringify(file)));
      expect(loaded.state.helicopter).toBeNull();
      expect(loaded.state.ledger.helicopter).toBe(0);
      expect(loaded.state.monthlyReports[0]!.helicopter).toBe(0);
    });

    it('keeps a helicopter through a save', () => {
      const s = ok(buyHelicopter(station()));
      const loaded = fromSaveFile(JSON.parse(JSON.stringify(toSaveFile(s, 0))));
      expect(loaded.state.helicopter).toEqual(s.helicopter);
    });
  });

  describe('Penny', () => {
    it('speaks once it is open, the company has none and news is on in a rush slot, and has it recorded', () => {
      const line = HINTS.find((h) => h.id === 'traffic-helicopter')!;
      expect(line.speaker).toBe('penny');
      expect(line.to).toBe('garage');
      expect(line.wiki).toBe('helicopter');
      expect(line.say).toContain('traffic helicopter');
      const due = DUE['traffic-helicopter']!;
      expect(due(newsOnlyIn(station(), EVENING))).toBe(true);
      expect(due(ok(buyHelicopter(newsOnlyIn(station(), EVENING))))).toBe(false);
      expect(due(newsOnlyIn(station(), LUNCH))).toBe(false);
      // Not before level 10.
      const closed = newsOnlyIn(station(), EVENING);
      closed.unlocked = closed.unlocked.filter((f) => f !== 'helicopter');
      expect(due(closed)).toBe(false);
    });
  });
});
