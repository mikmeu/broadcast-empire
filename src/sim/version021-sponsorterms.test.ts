import { describe, expect, it } from 'vitest';
import { SPONSOR_TERMS } from '../config/balance';
import { acceptOffer, chooseMakegood, deleteShow, hire, renegotiateContract, scheduleShow, type ActionResult } from './actions';
import { slotFactors, simulateDay } from './broadcast';
import { sensibleBot } from './bots';
import { autoPlaceFurniture } from './fixtures';
import { createInitialState } from './newGame';
import { deskFor, deskRoomFor, employeesWithDesk } from './office';
import { Rng } from './rng';
import { refreshOffers, relationOf, renegotiationBlocker, showsForOffer, sponsorRefusal, termsFactor, trackContracts, workOnRelations } from './sales';
import { fromSaveFile, SAVE_VERSION } from './save';
import type { GameState, Person, SponsorOffer } from './state';
import { describeMorale, thoughtsOf } from './thoughts';
import { tick } from './tick';
import { unlockAll } from './unlocks';
import { moraleParts } from './upkeep';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}
const error = (result: ActionResult) => (result.ok ? 'no error' : result.error);

const station = () => structuredClone(unlockAll(sensibleBot(createInitialState(1))));
const started = () => tick(station());

const offerOf = (s: GameState, extra: Partial<SponsorOffer> = {}): SponsorOffer => ({
  id: `o-${s.offers.length}`, sponsor: 'Beerstar', medium: 'radio', cpmMultiplier: 1.5, preferredAudience: null, minListeners: 10_000_000, weeks: 1, penalty: 5_000, expiresOn: s.day + 14, ...extra,
});

/** Signs an offer on a show and returns the new state. */
function sign(state: GameState, showId: string, extra: Partial<SponsorOffer> = {}): GameState {
  const s = structuredClone(state);
  const offer = offerOf(s, extra);
  s.offers.push(offer);
  return ok(acceptOffer(s, offer.id, showId));
}

function days(s: GameState, n: number): void {
  for (let i = 0; i < n; i++) {
    trackContracts(s, simulateDay(s));
    s.day += 1;
  }
}

const slotRevenue = (s: GameState, showId: string) => simulateDay(s).channels[0]!.slots.find((x) => x.showId === showId)!;

/** A state whose first show's contract (week-long, minimum out of reach) has run out, owing a make-good. */
function shortfall() {
  let s = started();
  const show = s.shows[0]!;
  s = sign(s, show.id);
  days(s, 7);
  expect(s.contracts).toEqual([]);
  return { s, show };
}

describe('makegoods (0.21.0, #361)', () => {
  it('a contract that ends under its minimum asks for a choice, and charges nothing yet', () => {
    const { s } = shortfall();
    const money = s.money;
    expect(s.makegoods).toHaveLength(1);
    expect(s.makegoods[0]).toMatchObject({ penalty: 5_000, days: 7, sponsor: 'Beerstar' });
    expect(s.ledger.sponsorPenalties).toBe(0);
    expect(s.messages.some((m) => /fell short/.test(m.text) && m.about === 'sales')).toBe(true);
    expect(s.money).toBe(money);
  });

  it('a refund costs the penalty and a level; it is also what happens after 7 days with no choice', () => {
    const { s } = shortfall();
    s.relations.Beerstar = { level: 3, points: 5 };
    const chosen = ok(chooseMakegood(s, s.makegoods[0]!.id, 'refund'));
    expect(chosen.makegoods).toEqual([]);
    expect(chosen.ledger.sponsorPenalties).toBe(5_000);
    expect(relationOf(chosen, 'Beerstar')).toEqual({ level: 2, points: 0 });

    days(s, 6);
    expect(s.makegoods).toHaveLength(1);
    days(s, 1);
    expect(s.makegoods).toEqual([]);
    expect(s.ledger.sponsorPenalties).toBe(5_000);
    expect(relationOf(s, 'Beerstar').level).toBe(2);
  });

  it('free airtime: no penalty and no lost level, but the show earns no ad money on the days it airs', () => {
    const { s, show } = shortfall();
    s.relations.Beerstar = { level: 3, points: 5 };
    const before = slotRevenue(s, show.id).revenue;
    expect(before).toBeGreaterThan(0);
    const chosen = ok(chooseMakegood(s, s.makegoods[0]!.id, 'airtime'));
    expect(error(chooseMakegood(chosen, chosen.makegoods[0]!.id, 'refund'))).toMatch(/already/);
    expect(slotRevenue(chosen, show.id).revenue).toBe(0);
    expect(slotRevenue(chosen, show.id).fee).toBe(0);
    days(chosen, 6);
    expect(chosen.makegoods[0]!.daysLeft).toBe(1);
    expect(slotRevenue(chosen, show.id).revenue).toBe(0);
    days(chosen, 1);
    expect(chosen.makegoods).toEqual([]);
    expect(slotRevenue(chosen, show.id).revenue).toBeCloseTo(before, 0);
    expect(chosen.ledger.sponsorPenalties).toBe(0);
    expect(relationOf(chosen, 'Beerstar').level).toBe(3);
  });

  it('days owed count down only on days the show airs, and taking it off the schedule clears nothing', () => {
    const { s, show } = shortfall();
    const chosen = ok(chooseMakegood(s, s.makegoods[0]!.id, 'airtime'));
    const channel = chosen.channels.find((c) => c.schedule.includes(show.id))!;
    const slot = channel.schedule.indexOf(show.id);
    const off = ok(scheduleShow(chosen, channel.id, slot, null));
    days(off, 5);
    expect(off.makegoods[0]!.daysLeft).toBe(7);
    const back = ok(scheduleShow(off, channel.id, slot, show.id));
    days(back, 2);
    expect(back.makegoods[0]!.daysLeft).toBe(5);
  });

  it('a show that owes a make-good can take no new sponsor', () => {
    const { s, show } = shortfall();
    const offer = offerOf(s, { id: 'o-new', sponsor: 'Jupiter' });
    s.offers.push(offer);
    expect(error(acceptOffer(s, offer.id, show.id))).toMatch(/make-good/);
    expect(showsForOffer(s, offer).map((x) => x.id)).not.toContain(show.id);
  });

  it('deleting a show with a choice waiting is the refund; with free airtime part given, the rest of the penalty and the level', () => {
    const { s, show } = shortfall();
    s.relations.Beerstar = { level: 3, points: 0 };
    const waiting = ok(deleteShow(s, show.id));
    expect(waiting.makegoods).toEqual([]);
    expect(waiting.ledger.sponsorPenalties).toBe(5_000);
    expect(relationOf(waiting, 'Beerstar').level).toBe(2);

    const chosen = ok(chooseMakegood(s, s.makegoods[0]!.id, 'airtime'));
    days(chosen, 2);
    expect(chosen.makegoods[0]!.daysLeft).toBe(5);
    const deleted = ok(deleteShow(chosen, show.id));
    expect(deleted.makegoods).toEqual([]);
    expect(deleted.ledger.sponsorPenalties).toBe(Math.round((5_000 * 5) / 7 / 100) * 100);
    expect(relationOf(deleted, 'Beerstar').level).toBe(2);
  });

  it('cancelling or deleting a running contract still charges the penalty at once', () => {
    let s = started();
    const show = s.shows[0]!;
    s = sign(s, show.id, { weeks: 8 });
    const deleted = ok(deleteShow(s, show.id));
    expect(deleted.makegoods).toEqual([]);
    expect(deleted.ledger.sponsorPenalties).toBe(5_000);
  });

  it('the show cannot be sold while it owes one', async () => {
    const { s, show } = shortfall();
    const { saleBlocker } = await import('./deals');
    for (const channel of s.channels) channel.schedule = channel.schedule.map((id) => (id === show.id ? null : id));
    expect(saleBlocker(s, show)).toMatch(/make-good/);
  });
});

describe('exclusive deals and brand groups (0.21.0, #361)', () => {
  /** Two shows of the first channel. */
  function twoShows() {
    const s = started();
    const [a, b] = s.channels[0]!.schedule.filter((id): id is string => id !== null);
    return { s, a: a!, b: b! };
  }

  it('an exclusive contract keeps a rival brand of its group off the channel, at signing', () => {
    const { s, a, b } = twoShows();
    const signed = sign(s, a, { sponsor: 'Beerstar', exclusive: true, weeks: 20 });
    const offer = offerOf(signed, { id: 'o-rival', sponsor: 'Citrus', weeks: 20 });
    signed.offers.push(offer);
    expect(error(acceptOffer(signed, offer.id, b))).toMatch(/Beerstar is exclusive/);
    // A brand of another group, and the same brand, are fine.
    const other = offerOf(signed, { id: 'o-other', sponsor: 'Jupiter', weeks: 20 });
    const same = offerOf(signed, { id: 'o-same', sponsor: 'Beerstar', weeks: 20 });
    expect(sponsorRefusal(signed, other, signed.shows.find((x) => x.id === b)!)).toBeNull();
    expect(sponsorRefusal(signed, same, signed.shows.find((x) => x.id === b)!)).toBeNull();
  });

  it('an exclusive offer is turned away where a rival is already', () => {
    const { s, a, b } = twoShows();
    const signed = sign(s, a, { sponsor: 'Beerstar', weeks: 20 });
    const offer = offerOf(signed, { id: 'o-ex', sponsor: 'Citrus', exclusive: true, weeks: 20 });
    signed.offers.push(offer);
    expect(error(acceptOffer(signed, offer.id, b))).toMatch(/wants it to itself/);
  });

  it('a rival cannot be signed off the air and then moved in', () => {
    const { s, a, b } = twoShows();
    const channel = s.channels[0]!;
    const slotB = channel.schedule.indexOf(b);
    const off = ok(scheduleShow(sign(s, a, { sponsor: 'Beerstar', exclusive: true, weeks: 20 }), channel.id, slotB, null));
    const signed = sign(off, b, { sponsor: 'Citrus', weeks: 20 });
    expect(error(scheduleShow(signed, channel.id, slotB, b))).toMatch(/exclusive/);
  });

  it('family-friendly brands refuse edgy genres', () => {
    const s = started();
    const rock = { ...s.shows[0]!, genre: 'rock' as const };
    const top = { ...s.shows[0]!, genre: 'top40' as const };
    expect(sponsorRefusal(s, offerOf(s, { sponsor: 'Citrus' }), rock)).toMatch(/family-friendly/);
    expect(sponsorRefusal(s, offerOf(s, { sponsor: 'Citrus' }), top)).toBeNull();
    expect(sponsorRefusal(s, offerOf(s, { sponsor: 'Beerstar' }), rock)).toBeNull();
  });
});

describe('content strings (0.21.0, #361)', () => {
  it('cost the show appeal and its host morale, which staff think and say', () => {
    const s = started();
    const show = s.shows.find((x) => x.hostId)!;
    const channelId = s.channels.find((c) => c.schedule.includes(show.id))!.id;
    const slot = s.channels.find((c) => c.id === channelId)!.schedule.indexOf(show.id);
    const before = slotFactors(s, channelId)[slot]!.bonus;
    const signed = sign(s, show.id, { strings: 'tone', weeks: 20 });
    expect(slotFactors(signed, channelId)[slot]!.bonus).toBeCloseTo(before * 0.95, 6);

    const desked = employeesWithDesk(signed);
    const host = signed.employees.find((e) => e.id === show.hostId)!;
    expect(moraleParts(signed, host, desked).strings).toBe(3);
    expect(moraleParts(s, host, desked).strings).toBe(0);
    expect(describeMorale(moraleParts(signed, host, desked))).toContain('−3 sponsor strings');
    expect(thoughtsOf(signed, host).some((t) => t.kind === 'strings')).toBe(true);
    // A mention costs 1.
    expect(moraleParts(sign(s, show.id, { strings: 'mention', weeks: 20 }), host, desked).strings).toBe(1);
  });

  it('raise the rate: a tone deal pays 25% over the same without', () => {
    expect(termsFactor({ strings: 'tone' })).toBeCloseTo(1.25);
    expect(termsFactor({ exclusive: true, strings: 'tone', length: 'long' })).toBeCloseTo(1.15 * 1.25 * 1.1);
    expect(termsFactor({})).toBe(1);
  });
});

describe('contract length (0.21.0, #361)', () => {
  it('short pays 10% less, long 10% more, and a middle length is as it was', () => {
    expect(termsFactor({ length: 'short' })).toBeCloseTo(0.9);
    expect(termsFactor({ length: 'long' })).toBeCloseTo(1.1);
    expect(termsFactor({})).toBe(1);
  });

  /** Brings the company's sales people onto brands and runs the relations work until Beerstar reaches level 2. */
  function levelUp(s: GameState): GameState {
    const draft = structuredClone(s);
    const person: Person = { id: 'p-sales', name: 'Sal', skill: 100, salary: 2_000, specialties: [], fame: 0, department: null, role: 'sales' };
    draft.candidates.push(person);
    const hired = ok(autoPlaceFurniture(ok(hire(draft, person.id)), draft.rooms.find((r) => r.type === deskRoomFor('sales'))!.roomId, deskFor('sales')));
    for (const e of hired.employees) if (e.role === 'sales') e.salesJob = 'brands';
    const desked = employeesWithDesk(hired);
    for (let i = 0; i < 3_000 && relationOf(hired, 'Beerstar').level === 1; i++) workOnRelations(hired, desked);
    return hired;
  }

  it('a long contract is locked at its rate when the brand rises; a short one rises with the level', () => {
    const s = started();
    const [a, b] = s.channels[0]!.schedule.filter((id): id is string => id !== null);
    let t = sign(s, a!, { sponsor: 'Beerstar', length: 'long', weeks: 30, cpmMultiplier: 1.32 });
    t = sign(t, b!, { sponsor: 'Beerstar', length: 'short', weeks: 8, cpmMultiplier: 1.08 });
    const risen = levelUp(t);
    expect(relationOf(risen, 'Beerstar').level).toBe(2);
    const long = risen.contracts.find((c) => c.length === 'long')!;
    const short = risen.contracts.find((c) => c.length === 'short')!;
    expect(long.cpmMultiplier).toBe(1.32);
    expect(short.cpmMultiplier).toBeCloseTo(1.3 * 0.9, 2);
  });

  it('a long contract pays its premium only on listeners up to 1.5 times the minimum', () => {
    const s = started();
    const show = s.shows[0]!;
    const plain = sign(s, show.id, { weeks: 30, minListeners: 1 });
    const listeners = slotRevenue(plain, show.id).listeners;
    const minListeners = Math.round(listeners / 2);
    const normal = slotRevenue(sign(s, show.id, { weeks: 30, minListeners }), show.id);
    const long = slotRevenue(sign(s, show.id, { weeks: 30, minListeners, length: 'long' }), show.id);
    // The cap is 0.75 of the day's listeners: three quarters of the premium is paid, the plain ads in full.
    expect(long.sponsorRevenue!).toBeCloseTo(normal.sponsorRevenue! * ((minListeners * 1.5) / listeners), 3);
    expect(long.revenue - long.sponsorRevenue!).toBeCloseTo(normal.revenue - normal.sponsorRevenue!, 3);
    // Within the cap nothing is taken.
    const wide = slotRevenue(sign(s, show.id, { weeks: 30, minListeners: listeners, length: 'long' }), show.id);
    const wideNormal = slotRevenue(sign(s, show.id, { weeks: 30, minListeners: listeners }), show.id);
    expect(wide.revenue).toBeCloseTo(wideNormal.revenue, 3);
  });
});

describe('renegotiating (0.21.0, #361)', () => {
  function shortRun() {
    const s = started();
    const show = s.shows[0]!;
    const signed = sign(s, show.id, { weeks: 10, length: 'short', minListeners: 1_000, cpmMultiplier: 1.08, penalty: 400 });
    const contract = signed.contracts[0]!;
    contract.signedListeners = 1_000;
    contract.daysRun = 20;
    contract.listenerSum = 20 * 1_500;
    return { s: signed, contract };
  }

  it('after a ratings bump, a short contract pays 10% extra instead of 10% less, with a tougher minimum', () => {
    const { s, contract } = shortRun();
    expect(renegotiationBlocker(s, contract)).toBeNull();
    const t = ok(renegotiateContract(s, contract.id));
    const c = t.contracts[0]!;
    expect(c.renegotiated).toBe(true);
    expect(c.minListeners).toBe(1_000 * Math.round((1_500 * 0.85) / 1_000));
    expect(c.cpmMultiplier).toBeCloseTo(1.2 * 1.1, 2);
    expect(c.penalty).not.toBe(400);
    expect(c.daysRun).toBe(0);
    expect(c.listenerSum).toBe(0);
    expect(error(renegotiateContract(t, c.id))).toMatch(/already/);
  });

  it('is refused without a bump, too early, too late, and on other lengths', () => {
    const { s, contract } = shortRun();
    contract.listenerSum = 20 * 1_100;
    expect(renegotiationBlocker(s, contract)).toMatch(/more than/);
    contract.listenerSum = 20 * 1_500;
    contract.daysRun = 10;
    expect(renegotiationBlocker(s, contract)).toMatch(/14 days/);
    contract.daysRun = 20;
    contract.endDay = s.day + 10;
    expect(renegotiationBlocker(s, contract)).toMatch(/Too late/);
    contract.endDay = s.day + 50;
    delete contract.length;
    expect(renegotiationBlocker(s, contract)).toMatch(/short/);
  });
});

describe('the offers (0.21.0, #361)', () => {
  /** Offers from a company that has had a contract, so they carry terms. */
  function offersFor(seed: number): SponsorOffer[] {
    const s = started();
    s.relations.Jupiter = { level: 1, points: 0 };
    const hired = structuredClone(s);
    const person: Person = { id: 'p-sal', name: 'Sal', skill: 100, salary: 2_000, specialties: [], fame: 0, department: null, role: 'sales' };
    hired.candidates.push(person);
    const t = ok(autoPlaceFurniture(ok(hire(hired, person.id)), hired.rooms.find((r) => r.type === deskRoomFor('sales'))!.roomId, deskFor('sales')));
    t.employees.find((e) => e.id === 'p-sal')!.skill = 100;
    t.offers = [];
    refreshOffers(t, new Rng(seed), employeesWithDesk(t));
    return t.offers;
  }

  it('carry terms that match their rate, and some of every kind turn up', () => {
    const all = Array.from({ length: 60 }, (_, seed) => offersFor(seed + 1)).flat();
    expect(all.some((o) => o.exclusive)).toBe(true);
    expect(all.some((o) => o.strings)).toBe(true);
    expect(all.some((o) => o.length === 'short')).toBe(true);
    expect(all.some((o) => o.length === 'long')).toBe(true);
    for (const o of all) {
      expect(o.length).toBe(o.weeks <= 12 ? 'short' : o.weeks >= 21 ? 'long' : undefined);
      expect(o.cpmMultiplier).toBeCloseTo(Math.round((1.2 + 0.1 * (0)) * termsFactor(o) * 100) / 100, 0);
    }
  });

  it('are plain before the first contract', () => {
    const s = started();
    const person: Person = { id: 'p-sal', name: 'Sal', skill: 100, salary: 2_000, specialties: [], fame: 0, department: null, role: 'sales' };
    s.candidates.push(person);
    const t = ok(autoPlaceFurniture(ok(hire(s, person.id)), s.rooms.find((r) => r.type === deskRoomFor('sales'))!.roomId, deskFor('sales')));
    t.relations = {};
    const offers = Array.from({ length: 40 }, (_, seed) => {
      const u = structuredClone(t);
      u.offers = [];
      refreshOffers(u, new Rng(seed + 1), employeesWithDesk(u));
      return u.offers;
    }).flat();
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.every((o) => !o.exclusive && !o.strings)).toBe(true);
  });

  it('leave the main stream of chance alone', () => {
    const run = () => {
      const s = started();
      const person: Person = { id: 'p-sal', name: 'Sal', skill: 100, salary: 2_000, specialties: [], fame: 0, department: null, role: 'sales' };
      s.candidates.push(person);
      const t = ok(autoPlaceFurniture(ok(hire(s, person.id)), s.rooms.find((r) => r.type === deskRoomFor('sales'))!.roomId, deskFor('sales')));
      t.relations = { Jupiter: { level: 1, points: 0 } };
      t.offers = [];
      const rng = new Rng(77);
      refreshOffers(t, rng, employeesWithDesk(t));
      return { state: rng.state, offers: t.offers.map((o) => [o.medium, o.minListeners, o.weeks, o.preferredAudience]) };
    };
    const a = run();
    const { exclusive, strings } = SPONSOR_TERMS;
    const saved = [exclusive.chance, strings.chance];
    exclusive.chance = 1;
    strings.chance = 1;
    const b = run();
    [exclusive.chance, strings.chance] = saved as [number, number];
    expect(b).toEqual(a);
  });
});

describe('saving (0.21.0, #361)', () => {
  it('an older save loads with no make-goods, and its contracts keep their terms', () => {
    const s = started();
    const signed = sign(s, s.shows[0]!.id, { weeks: 8 });
    const old = structuredClone(signed) as unknown as Record<string, unknown>;
    delete old.makegoods;
    const { state, version } = fromSaveFile({ version: 77, savedAt: 1, state: old });
    expect(version).toBe(SAVE_VERSION);
    expect(state.makegoods).toEqual([]);
    expect(state.contracts[0]!.cpmMultiplier).toBe(1.5);
    expect(tick(state).day).toBe(state.day + 1);
  });
});
