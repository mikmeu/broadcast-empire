import { describe, expect, it } from 'vitest';
import { MERCH, ORDERS } from '../config/balance';
import type { FurnitureType } from '../config/office';
import { buyBoxes, deleteShow, setSalesJob } from './actions';
import { toDay } from './calendar';
import { demandFor, growFans, inStorage, lineTerms, onShow, orderPackers, ordersBand, ordersBlocker, ordersDoubled, sellMerchandise, shopHolds, storageNextToShop, tapeEra, tillCapacity } from './merchandise';
import { createInitialState } from './newGame';
import { employeesWithDesk } from './office';
import { fromSaveFile, SAVE_VERSION, toSaveFile } from './save';
import { PLAYER, type DayResult, type Furniture, type GameState, type RentedRoom, type Show } from './state';

const piece = (id: string, type: FurnitureType): Furniture => ({ id, type, x: 0, y: 0, turn: 0, tier: 1, condition: 100, boughtOn: 0 });
const room = (roomId: string, type: RentedRoom['type'], x: number, w: number, kit: [string, FurnitureType][]): RentedRoom => ({
  roomId, name: roomId, floor: 1, x, y: 0, w, h: 5, door: { x: x + 1.5, z: 0 }, type, furniture: kit.map(([id, t]) => piece(id, t)), cleanliness: 100, issue: null,
});
const show = (id: string, genre: Show['genre'], fans = 0.8, hype = 0.8): Show => ({ id, name: id, genre, hostId: null, staffIds: [], writerIds: [], editorIds: [], studioId: null, freshness: 1, tone: 'normal', fans, hype });

/** A company in 1995 with a gift shop (till, baskets, a tape shelf, a clothing table, a shelf of bags), a storage room beside it, and a TV kids show. */
function shopGame(): GameState {
  const s = createInitialState(1);
  s.day = toDay(1995, 3, 1);
  s.unlocked = ['merchandise'];
  s.money = 1_000_000;
  s.rooms = [
    room('shop', 'giftShop', 0, 6, [['till1', 'till'], ['bask', 'shoppingBasket'], ['tapes', 'tapeShelf'], ['table', 'clothingTable'], ['bags', 'shelfBags']]),
    room('store', 'storageRoom', 6, 3, [['truck', 'handTruck'], ['boxes', 'boxStack']]),
    room('office', 'office', 0, 8, [['ws', 'workstation'], ['ws2', 'workstation']]),
  ];
  s.shows = [show('kids', 'kids')];
  const seller = { ...structuredClone(s.employees[0]!), id: 'seller', role: 'sales' as const, salesJob: 'till' as const, skill: 100, morale: 100 };
  s.employees = [seller];
  return s;
}

/** A day on which the show was on the air with `listeners`. */
function dayOf(state: GameState, showId: string, listeners = 20_000): DayResult {
  return {
    day: state.day,
    channels: [{ channelId: 'ch1', name: 'Test', onAir: true, ownerId: PLAYER, isPlayer: true, medium: 'tv', slots: [{ showId, titleId: null, programName: 'Test', quality: 0.9, listeners, share: 0.1, revenue: 1_000 }], regionListeners: {}, audienceListeners: {}, revenue: 1_000 } as DayResult['channels'][number]],
  };
}

const buy = (s: GameState, id: string, line: 'tapes' | 'clothes' | 'gifts', count: number) => {
  const r = buyBoxes(s, id, line, count);
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

describe('the gift shop (0.21.0, #362)', () => {
  it('a cult show with devoted fans outsells a big morning show nobody cares about', () => {
    const cult = show('cult', 'kids', 0.9, 0.8);
    const big = show('big', 'morningShow', 0.4, 0.5);
    for (const line of ['tapes', 'clothes', 'gifts'] as const) {
      expect(demandFor(cult, line, 1995, 5_000)).toBeGreaterThan(demandFor(big, line, 1995, 100_000));
    }
  });

  it('listeners count as a square root: ten times the listeners is about three times the buyers', () => {
    const a = demandFor(show('a', 'sitcom'), 'clothes', 1995, 10_000);
    const b = demandFor(show('b', 'sitcom'), 'clothes', 1995, 100_000);
    expect(b / a).toBeCloseTo(Math.sqrt(10), 1);
    // A show off the air still sells a little.
    expect(demandFor(show('c', 'sitcom'), 'clothes', 1995, 0)).toBeGreaterThan(0);
  });

  it('hype fades, faster off the air, and rises while the show beats its fans', () => {
    const s = shopGame();
    const k = s.shows[0]!;
    k.fans = 0.2;
    k.hype = 0.5;
    growFans(s, dayOf(s, k.id));
    expect(k.hype).toBeGreaterThan(0.5 * (1 - MERCH.hype.fade));
    k.fans = 0.9;
    k.hype = 0.5;
    growFans(s, dayOf(s, k.id));
    expect(k.hype).toBeLessThan(0.5);
    k.hype = 0.5;
    growFans(s, { day: s.day, channels: [] });
    expect(k.hype).toBeCloseTo(0.5 * (1 - MERCH.hype.fadeOffAir));
  });

  it('each piece holds its fixed amount, and a broken one holds nothing', () => {
    const s = shopGame();
    expect(shopHolds(s, 'clothes')).toBe(100);
    expect(shopHolds(s, 'gifts')).toBe(100);
    expect(shopHolds(s, 'tapes')).toBe(100);
    s.rooms[0]!.furniture.find((f) => f.id === 'table')!.condition = 0;
    expect(shopHolds(s, 'clothes')).toBe(0);
  });

  it('buys boxes, with the reasons it cannot', () => {
    const s = shopGame();
    const r = buyBoxes(s, 'kids', 'clothes', 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.money).toBe(s.money - MERCH.lines.clothes.pay * MERCH.box);
    expect(r.state.ledger.merchStock).toBe(MERCH.lines.clothes.pay * MERCH.box);
    expect(r.state.shows[0]!.stock!.clothes!.units).toBe(MERCH.box);
    // No room: 100 on the table, 250 in the boxes next door.
    const full = buyBoxes(buy(s, 'kids', 'clothes', 7), 'kids', 'clothes', 1);
    expect(full.ok).toBe(false);
    expect(buyBoxes(s, 'kids', 'clothes', 1).ok).toBe(true);
    const locked = buyBoxes({ ...s, unlocked: [] }, 'kids', 'clothes', 1);
    expect(locked.ok ? '' : locked.error).toMatch(/level 9/);
    const noShop = buyBoxes({ ...s, rooms: [] }, 'kids', 'clothes', 1);
    expect(noShop.ok ? '' : noShop.error).toMatch(/gift shop/);
    const poor = buyBoxes({ ...s, money: 10 }, 'kids', 'clothes', 1);
    expect(poor.ok ? '' : poor.error).toMatch(/Not enough money/);
    const bought = { ...s, shows: [show('film', 'movies')] };
    const rights = buyBoxes(bought, 'film', 'clothes', 1);
    expect(rights.ok ? '' : rights.error).toMatch(/rights/);
  });

  it('the goods beyond the pieces wait in storage', () => {
    const s = buy(shopGame(), 'kids', 'clothes', 3);
    expect(onShow(s, 'clothes')).toBe(100);
    expect(inStorage(s)).toBe(50);
  });

  it('follows the era: no TV tapes in 1970, VHS dear in 1980, DVDs in 2000, cheap again in 2015', () => {
    const tv = { genre: 'kids' } as const;
    const radio = { genre: 'top40' } as const;
    expect(tapeEra(1970, tv)).toBeNull();
    expect(lineTerms('tapes', 1970, tv)).toBeNull();
    expect(lineTerms('tapes', 1980, tv)).toMatchObject({ price: 60, pay: 30, name: 'VHS tapes' });
    expect(lineTerms('tapes', 1990, tv)!.price).toBe(30);
    expect(lineTerms('tapes', 1995, tv)!.price).toBe(15);
    expect(lineTerms('tapes', 2000, tv)).toMatchObject({ price: 18, name: 'DVDs' });
    expect(lineTerms('tapes', 2015, tv)!.price).toBe(10);
    expect(lineTerms('tapes', 1970, radio)).toMatchObject({ price: 8, name: 'cassettes' });
    expect(lineTerms('tapes', 2015, radio)!.price).toBe(4);
    expect(demandFor(show('k', 'kids'), 'tapes', 1970, 20_000)).toBe(0);
  });

  it('sells at the till, up to a quarter of what is on show', () => {
    let s = buy(shopGame(), 'kids', 'gifts', 2);
    const sold = (state: GameState) => {
      const result = dayOf(state, 'kids');
      sellMerchandise(state, result, employeesWithDesk(state));
      return result;
    };
    const result = sold(s);
    const units = result.merchUnits!.kids!;
    expect(units).toBeGreaterThan(0);
    expect(units).toBeLessThanOrEqual(100 * MERCH.turnover + 1e-9);
    expect(result.merchandise).toBeCloseTo(units * MERCH.lines.gifts.price);
    expect(s.shows[0]!.stock!.gifts!.units).toBeCloseTo(100 - units);
    // With less on show, less sells.
    s = buy(shopGame(), 'kids', 'gifts', 1);
    const less = sold(s);
    expect(less.merchUnits!.kids!).toBeLessThan(units);
    // With nobody on the till, nothing sells.
    const nobody = buy(shopGame(), 'kids', 'gifts', 2);
    nobody.employees[0]!.salesJob = 'deals';
    expect(sold(nobody).merchandise).toBeUndefined();
  });

  it('a low grade at the till caps what sells', () => {
    const strong = buy(shopGame(), 'kids', 'gifts', 2);
    const weak = buy(shopGame(), 'kids', 'gifts', 2);
    weak.employees[0]!.skill = 10;
    expect(tillCapacity(weak, employeesWithDesk(weak))).toBeLessThan(tillCapacity(strong, employeesWithDesk(strong)));
    const run = (state: GameState) => {
      const result = dayOf(state, 'kids', 400_000);
      state.shows[0]!.fans = 1;
      sellMerchandise(state, result, employeesWithDesk(state));
      return result.merchUnits?.kids ?? 0;
    };
    expect(run(weak)).toBeLessThan(run(strong));
  });

  it('boxes left on a cancelled show clear at a fifth of what they cost, as merchandise income', () => {
    const s = buy(shopGame(), 'kids', 'clothes', 2);
    const cost = MERCH.lines.clothes.pay * MERCH.box * 2;
    const before = s.money;
    const r = deleteShow(s, 'kids');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.money - before).toBeCloseTo(cost * MERCH.clearance);
    expect(r.state.ledger.merchandise).toBeCloseTo(cost * MERCH.clearance);
    expect(MERCH.clearance).toBe(0.2);
  });

  it('a bought title sells nothing', () => {
    expect(demandFor(show('film', 'movies'), 'clothes', 1995, 50_000)).toBe(0);
  });
});

describe('orders (0.21.0, #362)', () => {
  it('handle 100, 200, 300 or 500 a week by grade, and refund 10, 5, 1 or 0 per cent', () => {
    expect(ORDERS.bands.map((b) => [b.perWeek, b.refund])).toEqual([[100, 0.1], [200, 0.05], [300, 0.01], [500, 0]]);
    expect(ordersBand(0).perWeek).toBe(100);
    expect(ordersBand(29).perWeek).toBe(100);
    expect(ordersBand(30).perWeek).toBe(200);
    expect(ordersBand(49).perWeek).toBe(200);
    expect(ordersBand(50).perWeek).toBe(300);
    expect(ordersBand(69).perWeek).toBe(300);
    expect(ordersBand(70).perWeek).toBe(500);
    expect(ordersBand(100).refund).toBe(0);
  });

  /** The shop game with a second salesperson on orders and what orders need. */
  function ordersGame(): GameState {
    const s = buy(shopGame(), 'kids', 'gifts', 2);
    s.techs = [...s.techs, 'phoneIns'];
    s.rooms.push(room('post', 'postRoom', 10, 3, [['case', 'sortingCase']]));
    s.employees.push({ ...structuredClone(s.employees[0]!), id: 'packer', salesJob: 'orders', skill: 100, morale: 100 });
    s.employees[0]!.salesJob = 'deals';
    return s;
  }

  it('open with Phone-in lines, a post room, and a storage room that touches the shop', () => {
    const s = ordersGame();
    expect(ordersBlocker(s)).toBeNull();
    expect(orderPackers(s, employeesWithDesk(s))).toHaveLength(1);
    expect(ordersBlocker({ ...s, techs: s.techs.filter((t) => t !== 'phoneIns') })).toMatch(/Phone-in/);
    expect(ordersBlocker({ ...s, rooms: s.rooms.filter((r) => r.type !== 'postRoom') })).toMatch(/post room/);
    // Move the storage room away from the shop: the orders stop.
    expect(storageNextToShop(s, 'store')).toBe(true);
    s.rooms.find((r) => r.roomId === 'store')!.x = 20;
    expect(storageNextToShop(s, 'store')).toBe(false);
    expect(orderPackers(s, employeesWithDesk(s))).toHaveLength(0);
  });

  it('sell by order, with the refunds taken off the money', () => {
    const s = ordersGame();
    s.employees[1]!.skill = 10;
    s.employees[1]!.morale = 100;
    const grade = ordersBand(0).refund;
    const result = dayOf(s, 'kids', 100_000);
    s.shows[0]!.fans = 1;
    sellMerchandise(s, result, employeesWithDesk(s));
    const units = result.merchUnits?.kids ?? 0;
    expect(units).toBeGreaterThan(0);
    // Nobody is at the till, so all of it went by order.
    expect(result.merchandise!).toBeLessThan(units * MERCH.lines.gifts.price);
    expect(result.merchandise!).toBeGreaterThan(units * MERCH.lines.gifts.price * (1 - Math.max(grade, ordersBand(30).refund) - 1e-9) - 1e-6);
  });

  it('double with the Internet and a working server rack', () => {
    const s = ordersGame();
    const one = orderPackers(s, employeesWithDesk(s))[0]!.units;
    expect(ordersDoubled(s)).toBe(false);
    s.techs = [...s.techs, 'internet'];
    s.rooms.push(room('lib', 'library', 12, 4, [['rack', 'serverRack']]));
    expect(ordersDoubled(s)).toBe(true);
    expect(orderPackers(s, employeesWithDesk(s))[0]!.units).toBeCloseTo(one * ORDERS.internetFactor);
    s.rooms.find((r) => r.roomId === 'lib')!.furniture[0]!.condition = 0;
    expect(ordersDoubled(s)).toBe(false);
  });
});

describe('seating by person (0.21.0, #362)', () => {
  it('a salesperson sits at the till, the hand truck or a workstation by their job, and back', () => {
    const s = shopGame();
    const where = (state: GameState) => employeesWithDesk(state).get('seller')?.roomId;
    expect(where(s)).toBe('shop');
    let r = setSalesJob(s, 'seller', 'orders');
    if (!r.ok) throw new Error(r.error);
    expect(where(r.state)).toBe('store');
    r = setSalesJob(r.state, 'seller', 'deals');
    if (!r.ok) throw new Error(r.error);
    expect(where(r.state)).toBe('office');
    r = setSalesJob(r.state, 'seller', 'till');
    if (!r.ok) throw new Error(r.error);
    expect(where(r.state)).toBe('shop');
  });

  it('puts someone without a till nowhere, and one till takes one person', () => {
    const s = shopGame();
    s.employees.push({ ...structuredClone(s.employees[0]!), id: 'second' });
    expect(employeesWithDesk(s).has('second')).toBe(false);
    s.rooms = s.rooms.filter((r) => r.type !== 'giftShop');
    expect(employeesWithDesk(s).has('seller')).toBe(false);
  });

  it('forgets the place of their own when the job changes the kind of desk', () => {
    const s = shopGame();
    s.employees[0]!.desk = 'till1';
    const r = setSalesJob(s, 'seller', 'deals');
    if (!r.ok) throw new Error(r.error);
    expect(r.state.employees[0]!.desk).toBeNull();
  });
});

describe('the save (0.21.0, #362)', () => {
  it('moves a game with merchandise to the gift shop: hype from fans, 30 days of the old share, and closed below level 9', () => {
    const s = shopGame();
    s.level = 5;
    s.shows[0]!.fans = 0.6;
    s.shows[0]!.sells = true;
    const file = JSON.parse(JSON.stringify(toSaveFile(s, 0)));
    delete file.state.shows[0].hype;
    delete file.state.ledger.merchStock;
    const loaded = fromSaveFile({ ...file, version: 78 });
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.state.shows[0]!.hype).toBeCloseTo(0.3);
    expect(loaded.state.ledger.merchStock).toBe(0);
    expect(loaded.state.merchGraceUntil).toBe(s.day + MERCH.graceDays);
    expect(loaded.state.unlocked).not.toContain('merchandise');
    expect(loaded.state.messages.some((m) => /gift shop/.test(m.text))).toBe(true);
  });

  it('keeps merchandise open at level 9, and gives a game without it no grace', () => {
    const s = shopGame();
    s.level = 9;
    const loaded = fromSaveFile({ ...JSON.parse(JSON.stringify(toSaveFile(s, 0))), version: 78 });
    expect(loaded.state.unlocked).toContain('merchandise');
    // Never sold anything: nothing to wait for, and no message.
    expect(loaded.state.merchGraceUntil).toBeUndefined();
    expect(loaded.state.messages.some((m) => /gift shop/.test(m.text))).toBe(false);
    const plain = shopGame();
    plain.unlocked = [];
    expect(fromSaveFile({ ...JSON.parse(JSON.stringify(toSaveFile(plain, 0))), version: 78 }).state.merchGraceUntil).toBeUndefined();
  });
});
