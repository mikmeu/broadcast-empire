import { describe, expect, it } from 'vitest';
import { DAYS_PER_YEAR, SHOW_SALES, STUDIO_LETS } from '../config/balance';
import { airtimes } from '../office/day';
import { buildRoom, buyOut, createShow, deleteShow, hire, letStudio, releaseRoom, scheduleShow, sellShow, setRoomType, type ActionResult } from './actions';
import { sensibleBot } from './bots';
import { simulateDay } from './broadcast';
import { buyOutCost, dealDays, letFee, onAirIds, slotsOf } from './deals';
import { monthlyRent } from './office';
import { addMissingEquipment, autoPlaceFurniture } from './fixtures';
import { createInitialState } from './newGame';
import { proposeRoom } from './rooms';
import { fromSaveFile, SAVE_VERSION, toSaveFile } from './save';
import { crewReport, shortOnAir } from './staffing';
import { advance } from './tick';
import { employeesWithDesk } from './office';
import type { GameState } from './state';
import { unlockAll } from './unlocks';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}
const bad = (result: ActionResult): string => {
  if (result.ok) throw new Error('expected an error');
  return result.error;
};

/** A radio station a month on the air, with everything open, a salesperson at a desk, and one of its shows taken off the schedule. */
function world(): { s: GameState; showId: string; channelId: string; slot: number } {
  let s: GameState & { lastId?: string } = structuredClone(unlockAll(advance(sensibleBot(createInitialState(1)), 30)));
  s.money = 5_000_000;
  s.floorsUnlocked = Math.max(s.floorsUnlocked, 2);
  const id = `p-${s.nextId++}`;
  s.candidates.push({ id, name: 'Test Seller', skill: 80, salary: 2_000, specialties: [], fame: 0, department: null, foundFor: null, role: 'sales' });
  s = ok(hire(s, id));
  s = ok(autoPlaceFurniture(s, s.rooms.find((r) => r.type === 'office')!.roomId, 'workstation'));
  const channel = s.channels.find((c) => c.medium === 'radio' && c.schedule.some(Boolean))!;
  const slot = channel.schedule.findIndex((x) => x !== null && s.shows.find((sh) => sh.id === x)?.hostId);
  const showId = channel.schedule[slot]!;
  s = ok(scheduleShow(s, channel.id, slot, null));
  return { s, showId, channelId: channel.id, slot };
}

const rivalRadio = (s: GameState) => s.rivals.flatMap((r) => r.channels).find((c) => c.medium === 'radio')!;

describe('selling a show (#148)', () => {
  it('needs someone in Sales at a desk', () => {
    const { s, showId } = world();
    const without = structuredClone(s);
    without.employees = without.employees.filter((e) => e.role !== 'sales');
    expect(bad(sellShow(without, showId, rivalRadio(without).id))).toMatch(/Sales/);
  });

  it('puts the show in the weakest slot of the buyer, which airs it with its real quality', () => {
    const { s, showId } = world();
    const rc = rivalRadio(s);
    const weakest = rc.schedule.reduce((w, show, i) => (show.quality < rc.schedule[w]!.quality ? i : w), 0);
    const sold = ok(sellShow(s, showId, rc.id));
    const sale = sold.showSales[0]!;
    expect(sale).toMatchObject({ showId, channelId: rc.id, slot: weakest, endDay: sold.day + dealDays(SHOW_SALES.months) });
    const show = sold.shows.find((x) => x.id === showId)!;
    const day = simulateDay(sold);
    const aired = day.channels.find((c) => c.channelId === rc.id)!.slots[weakest]!;
    expect(aired.programName).toBe(show.name);
    expect(aired.listeners).toBeGreaterThan(0);
    expect(day.sold).toEqual([{ saleId: sale.id, showId, amount: aired.revenue * SHOW_SALES.share, listeners: aired.listeners }]);
  });

  it('pays its share each day, on its own line of the books, and the show gets staler', () => {
    const { s, showId } = world();
    const sold = ok(sellShow(s, showId, rivalRadio(s).id));
    const before = { money: sold.money, revenue: sold.ledger.revenue, freshness: sold.shows.find((x) => x.id === showId)!.freshness };
    const day = simulateDay(sold);
    const after = advance(sold, 1);
    const amount = day.sold![0]!.amount;
    expect(amount).toBeGreaterThan(0);
    // (The books start again on the 1st of the month, so the day may have been filed already.)
    expect(after.ledger.showSales + (after.monthlyReports.at(-1)?.showSales ?? 0)).toBeCloseTo(amount);
    expect(after.showSales[0]!.earned).toBeCloseTo(amount);
    // The share counts as revenue, as sponsors' money does.
    expect(after.ledger.revenue + (after.monthlyReports.at(-1)?.revenue ?? 0)).toBeGreaterThanOrEqual(amount);
    expect(after.shows.find((x) => x.id === showId)!.freshness).toBeLessThan(before.freshness);
    expect(after.lastDay!.sold).toHaveLength(1);
  });

  it('is on the air for every place that reads the schedule', () => {
    const { s, showId } = world();
    const sold = ok(sellShow(s, showId, rivalRadio(s).id));
    const soldSlot = sold.showSales[0]!.slot;
    expect(onAirIds(sold).has(showId)).toBe(true);
    expect(slotsOf(sold, showId)).toEqual([soldSlot]);
    expect(onAirIds(s).has(showId)).toBe(false);
    // The host walks to the studio at the hours of the buyer’s slot.
    expect(airtimes(sold, sold.shows.find((x) => x.id === showId)!)).toHaveLength(1);
    expect(airtimes(s, s.shows.find((x) => x.id === showId)!)).toHaveLength(0);
    // The crew report ranks it with the shows on the air, and the producers it lacks are noticed.
    expect(crewReport(sold, employeesWithDesk(sold)).findIndex((c) => c.show.id === showId)).toBeLessThan(crewReport(s, employeesWithDesk(s)).findIndex((c) => c.show.id === showId) + 1);
    const short = structuredClone(sold);
    short.shows.find((x) => x.id === showId)!.staffIds = [];
    expect(shortOnAir(short, employeesWithDesk(short)).map((x) => x.id)).toContain(showId);
    expect(shortOnAir(structuredClone({ ...short, showSales: [] }), employeesWithDesk(short)).map((x) => x.id)).not.toContain(showId);
  });

  it('airs a rerun, and pays nothing, on a day the show cannot be made', () => {
    const { s, showId } = world();
    const sold = ok(sellShow(s, showId, rivalRadio(s).id));
    sold.shows.find((x) => x.id === showId)!.hostId = null;
    const day = simulateDay(sold);
    expect(day.sold).toBeUndefined();
    expect(day.channels.find((c) => c.channelId === rivalRadio(s).id)!.slots[sold.showSales[0]!.slot]!.programName).toBe('Rerun');
    const after = advance(sold, 1);
    expect(after.showSales[0]!.earned).toBe(0);
  });

  it('refuses a show that is on your own channel, has a sponsor, or is sold already', () => {
    const { s, showId, channelId, slot } = world();
    const back = ok(scheduleShow(s, channelId, slot, showId));
    expect(bad(sellShow(back, showId, rivalRadio(back).id))).toMatch(/own channel/);
    const sponsored = structuredClone(s);
    sponsored.contracts.push({ id: 'c1', sponsor: 'Beerstar', medium: 'radio', cpmMultiplier: 1.2, preferredAudience: null, minListeners: 1, weeks: 8, penalty: 100, showId, startDay: s.day, endDay: s.day + 56, listenerSum: 0, daysRun: 0 });
    expect(bad(sellShow(sponsored, showId, rivalRadio(sponsored).id))).toMatch(/sponsor/);
    const sold = ok(sellShow(s, showId, rivalRadio(s).id));
    expect(bad(sellShow(sold, showId, rivalRadio(sold).id))).toMatch(/sold already/);
  });

  it('refuses a sale whose host is on the air in the same slot on your own channels', () => {
    const { s, showId, channelId } = world();
    const rc = rivalRadio(s);
    const other = s.channels.find((c) => c.id === channelId)!.schedule.findIndex((x) => x !== null);
    expect(other).toBeGreaterThanOrEqual(0);
    const clash = structuredClone(s);
    const otherShow = clash.shows.find((x) => x.id === clash.channels.find((c) => c.id === channelId)!.schedule[other])!;
    otherShow.hostId = clash.shows.find((x) => x.id === showId)!.hostId;
    otherShow.studioId = null;
    // The buyer gives its weakest slot: make that the clashing one.
    const target = clash.rivals.flatMap((r) => r.channels).find((c) => c.id === rc.id)!;
    target.schedule.forEach((show, i) => (show.quality = i === other ? 0.01 : 0.9));
    expect(bad(sellShow(clash, showId, rc.id))).toMatch(/host is already on air/);
  });

  it('keeps a sold show off your channels, out of sponsor offers and out of the bin', () => {
    const { s, showId, channelId, slot } = world();
    const sold = ok(sellShow(s, showId, rivalRadio(s).id));
    expect(bad(scheduleShow(sold, channelId, slot, showId))).toMatch(/sold to/);
    expect(bad(deleteShow(sold, showId))).toMatch(/Buy it out/);
    expect(bad(buyOut(sold, 'nope'))).toMatch(/doesn’t exist/);
  });

  it('ends after a year: the buyer gets a new show of its own, and the show is yours again', () => {
    const { s, showId } = world();
    const rc = rivalRadio(s);
    const sold = ok(sellShow(s, showId, rc.id));
    const slot = sold.showSales[0]!.slot;
    const during = advance(sold, dealDays(SHOW_SALES.months) - 2);
    expect(during.showSales).toHaveLength(1);
    const ended = advance(during, 2);
    expect(ended.showSales).toHaveLength(0);
    expect(ended.messages.some((m) => /The year is up/.test(m.text) && m.text.includes('has left'))).toBe(true);
    expect(rivalRadio(ended).schedule[slot]).toBeDefined();
    expect(onAirIds(ended).has(showId)).toBe(false);
    expect(ended.ledger.showSales).toBeGreaterThanOrEqual(0);
  }, 120_000);

});

describe('buying out a sale (#148)', () => {
  it('costs the money still to come, times the buy-out factor, and takes the sale away', () => {
    const { s, showId } = world();
    const sale0 = ok(sellShow(s, showId, rivalRadio(s).id));
    const later = advance(sale0, 10);
    const deal = later.showSales[0]!;
    const perDay = Math.max(later.lastDay!.sold![0]!.amount, deal.earned / Math.max(1, later.day - deal.startDay));
    const cost = buyOutCost(later, deal);
    expect(cost).toBeCloseTo(perDay * (deal.endDay - later.day) * SHOW_SALES.buyOut, -1);
    const money = later.money;
    const done = ok(buyOut(later, deal.id));
    expect(done.showSales).toHaveLength(0);
    expect(money - done.money).toBe(cost);
    expect(bad(buyOut(done, deal.id))).toMatch(/doesn’t exist/);
    const poor = structuredClone(later);
    poor.money = 0;
    expect(bad(buyOut(poor, deal.id))).toMatch(/Not enough money/);
  });
});

describe('letting out a studio (#148)', () => {
  /** The world with a second radio studio, equipped and used by no show. */
  function withSpareStudio(): { s: GameState; roomId: string } {
    const { s } = world();
    const floor = Array.from({ length: s.floorsUnlocked }, (_, i) => i + 1).find((f) => proposeRoom(s, f, 'radioStudio'))!;
    const built = ok(buildRoom(s, { ...proposeRoom(s, floor, 'radioStudio')!, type: 'radioStudio' }));
    return { s: ok(addMissingEquipment(built, built.lastId!)), roomId: built.lastId! };
  }

  it('lets an unused studio at a multiple of its rent, to a tenant of the time', () => {
    const { s, roomId } = withSpareStudio();
    const room = s.rooms.find((r) => r.roomId === roomId)!;
    const let1 = ok(letStudio(s, roomId));
    const deal = let1.studioLets[0]!;
    expect(deal.monthly).toBe(Math.round(monthlyRent(room, s) * STUDIO_LETS.rentTimes.radio));
    expect(letFee(s, room)).toBe(deal.monthly);
    expect(deal.endDay).toBe(s.day + dealDays(STUDIO_LETS.months));
    expect(deal.tenant).not.toMatch(/podcaster/); // 1970s
  });

  it('refuses a studio a show is made in, one already let, and a third', () => {
    const { s, roomId } = withSpareStudio();
    const used = s.shows.find((x) => x.studioId)!.studioId!;
    expect(bad(letStudio(s, used))).toMatch(/is made in/);
    const let1 = ok(letStudio(s, roomId));
    expect(bad(letStudio(let1, roomId))).toMatch(/let already/);
    const full = structuredClone(let1);
    full.studioLets.push({ id: 'x1', roomId: 'x', tenant: 'a', monthly: 1, startDay: 0, endDay: 999_999, earned: 0 }, { id: 'x2', roomId: 'y', tenant: 'a', monthly: 1, startDay: 0, endDay: 999_999, earned: 0 });
    const other = full.rooms.find((r) => r.type === 'radioStudio' && r.roomId !== roomId && !full.shows.some((x) => x.studioId === r.roomId));
    if (other) expect(bad(letStudio(full, other.roomId))).toMatch(/at a time/);
  });

  it('needs someone in Sales at a desk', () => {
    const { s, roomId } = withSpareStudio();
    s.employees = s.employees.filter((e) => e.role !== 'sales');
    expect(bad(letStudio(s, roomId))).toMatch(/Sales/);
  });

  it('keeps the room from a show, a new type, a release and the furniture while it is let', () => {
    const { s, roomId } = withSpareStudio();
    const let1 = ok(letStudio(s, roomId));
    const host = let1.employees.find((e) => e.role === 'host' && !let1.shows.some((x) => x.hostId === e.id));
    const staff = let1.employees.find((e) => e.role === 'production');
    if (host && staff) expect(bad(createShow(let1, { name: 'Tenant Hour', genre: 'top40', hostId: host.id, staffIds: [staff.id], studioId: roomId }))).toMatch(/is let to/);
    expect(bad(setRoomType(let1, roomId, 'office'))).toMatch(/is let to/);
    expect(bad(releaseRoom(let1, roomId))).toMatch(/is let to/);
  });

  it('pays the rent each day, on its own line, and ends after a year', () => {
    const { s, roomId } = withSpareStudio();
    const let1 = ok(letStudio(s, roomId));
    const after = advance(let1, 1);
    const rent = (let1.studioLets[0]!.monthly * 12) / DAYS_PER_YEAR;
    expect(after.studioLets[0]!.earned).toBeCloseTo(rent);
    expect(after.ledger.studioLets + (after.monthlyReports.at(-1)?.studioLets ?? 0)).toBeCloseTo(rent);
    const ended = advance(let1, dealDays(STUDIO_LETS.months));
    expect(ended.studioLets).toHaveLength(0);
    expect(ended.messages.some((m) => /has left/.test(m.text))).toBe(true);
  }, 120_000);

  it('can be bought out for the rent still to come plus a quarter, and the studio is free again', () => {
    const { s, roomId } = withSpareStudio();
    const let1 = advance(ok(letStudio(s, roomId)), 30);
    const deal = let1.studioLets[0]!;
    const cost = buyOutCost(let1, deal);
    const left = (deal.endDay - let1.day) / (DAYS_PER_YEAR / 12);
    expect(cost).toBeCloseTo(deal.monthly * left * STUDIO_LETS.buyOut, -1);
    const done = ok(buyOut(let1, deal.id));
    expect(done.studioLets).toHaveLength(0);
    expect(let1.money - done.money).toBe(cost);
    ok(letStudio(done, roomId));
  }, 120_000);
});

describe('the save (#148)', () => {
  it('loads a save of version 56 with no deals and clean lines in the books', () => {
    const s = createInitialState(1);
    s.monthlyReports = [{ ...s.ledger, year: 1970, month: 1, net: 0, balance: 0 }];
    const file = JSON.parse(JSON.stringify(toSaveFile(s, 0)));
    delete file.state.showSales;
    delete file.state.studioLets;
    delete file.state.ledger.showSales;
    delete file.state.ledger.studioLets;
    delete file.state.monthlyReports[0].showSales;
    delete file.state.monthlyReports[0].studioLets;
    const loaded = fromSaveFile({ ...file, version: 56 });
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(57);
    expect(loaded.state.showSales).toEqual([]);
    expect(loaded.state.studioLets).toEqual([]);
    expect(loaded.state.ledger.showSales).toBe(0);
    expect(loaded.state.ledger.studioLets).toBe(0);
    expect(loaded.state.monthlyReports[0]!.showSales).toBe(0);
    expect(loaded.state.monthlyReports[0]!.studioLets).toBe(0);
  });
});
