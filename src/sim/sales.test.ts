import { describe, expect, it } from 'vitest';
import { acceptOffer, type ActionResult, hire, buyLicense, createChannel, setChannelManager, setRoomType, cancelContract } from './actions';
import { sensibleBot, growthBot, type Bot } from './bots';
import { createInitialState } from './newGame';
import { showForOffer, showsForOffer, refreshOffers, trackContracts, hasFreeShow, pointsForLevel, rateWithTerms, relationOf, sponsorRate, workOnRelations } from './sales';
import { type GameState, type SponsorOffer, type Person, PLAYER, type Show, type SponsorContract } from './state';
import { tick } from './tick';
import { autoPlaceFurniture, addMissingEquipment, rentRoom, setUpMasterControl, setUpPostRoom } from './fixtures';
import { simulateDay, isMarketLeader, listenersByOwner } from './broadcast';
import { unlockAll } from './unlocks';
import { deskFor, deskRoomFor, employeesWithDesk, isManager } from './office';
import { Rng } from './rng';
import { RELATIONS } from '../config/balance';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** The sensible bot's station after a month, with money to spend. */
function station(): GameState {
  let s = createInitialState(1);
  for (let day = 0; day < 30; day++) s = tick(sensibleBot(s));
  return { ...s, money: 5_000_000 };
}

describe('playtest fixes (Phase 12a)', () => {
  it('never leaves a sponsor offer standing on a show that has just got a sponsor', () => {
    let s = structuredClone(tick(station()));
    const offer = (id: string): SponsorOffer => ({ id, sponsor: `Sponsor ${id}`, medium: 'radio', cpmMultiplier: 1.3, preferredAudience: null, minListeners: 1, weeks: 4, penalty: 100, expiresOn: s.day + 14 });
    s.offers.push(offer('o-1'), offer('o-2'));
    const [first, second] = s.offers.slice(-2) as [SponsorOffer, SponsorOffer];
    const free = showsForOffer(s, first);
    expect(free.length).toBeGreaterThan(1);
    // Both cards start on the show with the most listeners.
    const best = showForOffer(s, first, null)!;
    expect(best).toBe(free[0]!.id);
    expect(showForOffer(s, second, null)).toBe(best);

    s = ok(acceptOffer(s, first.id, best));
    // The other card, which stood on the same show, moves on to the best one that is left…
    expect(showsForOffer(s, second).map((show) => show.id)).not.toContain(best);
    const next = showForOffer(s, second, best)!;
    expect(next).toBe(free[1]!.id);
    // …and that one can be accepted.
    s = ok(acceptOffer(s, second.id, next));
    // A choice the player made is kept while it stands.
    const third = offer('o-3');
    const left = showsForOffer(s, third);
    if (left.length > 1) expect(showForOffer(s, third, left[1]!.id)).toBe(left[1]!.id);
    // A TV sponsor has no radio show to go to.
    expect(showForOffer(s, { ...third, medium: 'tv' }, null)).toBeNull();
  });
});

// From phase2.
{
  function ok(result: ActionResult): GameState & { lastId?: string } {
    if (!result.ok) throw new Error(result.error);
    return Object.assign(result.state, { lastId: result.id });
  }

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
      const slotOf = (state: GameState) => simulateDay(state).channels[0]!.slots.find((x) => x.showId === show.id)!;
      const before = slotOf(s);
      s = ok(acceptOffer(s, 'o-test', show.id));
      // A sponsored slot is sold out (0.21.0, #363): the minutes advertisers did not want before are bought now.
      const soldBefore = 1 - (before.unsold ?? 0) / 5;
      expect(slotOf(s).revenue).toBeCloseTo((before.revenue * 1.5) / soldBefore);

      // Run the week out: nobody reaches ten million listeners.
      const money = s.money;
      for (let i = 0; i < 7; i++) {
        trackContracts(s, simulateDay(s));
        s.day += 1;
      }
      expect(s.contracts).toEqual([]);
      // Since 0.21.0 (#361) a contract that falls short gives a choice first; with none, the refund comes a week later.
      expect(s.makegoods).toHaveLength(1);
      expect(s.money).toBe(money);
      for (let i = 0; i < 7; i++) {
        trackContracts(s, simulateDay(s));
        s.day += 1;
      }
      expect(s.makegoods).toEqual([]);
      expect(s.money).toBe(money - 5_000);
      expect(s.ledger.sponsorPenalties).toBe(5_000);
    });
  });
}

// From phase3.
{
  function ok(result: ActionResult): GameState & { lastId?: string } {
    if (!result.ok) throw new Error(result.error);
    return Object.assign(result.state, { lastId: result.id });
  }
  const error = (result: ActionResult) => (result.ok ? 'no error' : result.error);
  const logo = { shape: 'square' as const, color: '#000', initials: 'TV' };

  /** Hires a made-up person and gives them a desk in office L (floor 2). */
  function hireWithDesk(state: GameState, person: Partial<Person> & Pick<Person, 'role'>): GameState & { lastId?: string } {
    let s = structuredClone(state);
    const id = `p-tv-${s.nextId++}`;
    s.candidates.push({ id, name: 'Test Person', skill: 80, salary: 2_000, specialties: [], fame: 0, department: null, ...person });
    s = ok(hire(s, id));
    if (!s.rooms.some((r) => r.roomId === 'L')) s = ok(setRoomType(ok(rentRoom(s, 'L')), 'L', 'office'));
    // A manager's desk goes in the management office the station already has.
    if (isManager(person.role)) s = ok(autoPlaceFurniture(s, s.rooms.find((r) => r.type === 'managementOffice')!.roomId, 'managerDesk'));
    else if (person.role !== 'host') s = ok(autoPlaceFurniture(s, 'L', 'workstation'));
    return Object.assign(s, { lastId: id });
  }

  /** The sensible bot's radio station plus a rich company with a TV channel in the Capital and a library. */
  function tvStation(): GameState & { tvId: string } {
    let s: GameState & { lastId?: string } = structuredClone(unlockAll(sensibleBot(createInitialState(1))));
    s.money = 5_000_000;
    s.floorsUnlocked = 2;
    s = ok(createChannel(s, { name: 'Test TV', logo, medium: 'tv' }));
    const tvId = s.lastId!;
    s = ok(buyLicense(s, tvId, 'capital'));
    s = hireWithDesk(s, { role: 'channelManager' });
    s = ok(setChannelManager(s, tvId, s.lastId!));
    // The titles come by post (0.17.0).
    s = ok(addMissingEquipment(ok(setRoomType(ok(setUpPostRoom(ok(rentRoom(s, 'K')))), 'K', 'library')), 'K'));
    // A second channel goes out through a master control room (0.16.0).
    s = ok(setUpMasterControl(s));
    return Object.assign(s, { tvId });
  }

  describe('sponsors and markets by medium', () => {
    it('a TV sponsor only fits a TV show', () => {
      const s = tvStation();
      s.offers.push({ id: 'o-tv', sponsor: 'Polar Cola', medium: 'tv', cpmMultiplier: 1.2, preferredAudience: null, minListeners: 1, weeks: 8, penalty: 100, expiresOn: s.day + 7 });
      expect(error(acceptOffer(s, 'o-tv', s.shows[0]!.id))).toMatch(/wants a TV show/);
    });

    it('radio and TV are separate markets', () => {
      const s = tick(unlockAll(sensibleBot(createInitialState(1))));
      expect(listenersByOwner(s.lastDay!, 'tv').get(PLAYER)).toBeUndefined();
      expect(listenersByOwner(s.lastDay!, 'tv').size).toBe(1);
      expect(isMarketLeader(s.lastDay!, 'tv')).toBe(false);
      expect(s.viewers).toBe(0);
    });
  });
}

// From version010.
/** The sensible bot's company after a number of days. */
function company(days: number, seed = 1, bot: Bot = sensibleBot): GameState {
  let s = createInitialState(seed);
  for (let day = 0; day < days; day++) s = tick(bot(s));
  return s;
}

describe('version 0.10.0', () => {
  describe('sponsor offers (R57)', () => {
    const sponsored = (s: GameState, shows: readonly Show[]): GameState => ({
      ...s,
      offers: [],
      contracts: shows.map((show, n) => ({ id: `c${n}`, showId: show.id, sponsor: 'Test' }) as unknown as SponsorContract),
    });
    const offersAfter = (s: GameState, seed: number) => {
      const draft = structuredClone(s);
      refreshOffers(draft, new Rng(seed), employeesWithDesk(draft));
      return draft.offers;
    };

    it('none come while every show has a sponsor; they come again when a show is free', () => {
      const s = company(150, 1, growthBot);
      expect(s.employees.some((e) => e.role === 'sales')).toBe(true);
      expect(s.shows.length).toBeGreaterThan(1);

      const full = sponsored(s, s.shows);
      expect(hasFreeShow(full, 'radio')).toBe(false);
      for (let seed = 1; seed <= 20; seed++) expect(offersAfter(full, seed)).toEqual([]);

      const oneFree = sponsored(s, s.shows.slice(1));
      expect(hasFreeShow(oneFree, 'radio')).toBe(true);
      expect(Array.from({ length: 20 }, (_, seed) => offersAfter(oneFree, seed + 1).length).some((n) => n > 0)).toBe(true);
      // And only for the medium that has a free show.
      for (let seed = 1; seed <= 20; seed++) for (const offer of offersAfter(oneFree, seed)) expect(offer.medium).toBe('radio');
    });
  });

  describe('getting to know a sponsor (R58)', () => {
    it('a sponsor pays 20% over the ad rate at level 1 and 70% at the highest', () => {
      expect(sponsorRate(1)).toBe(1.2);
      expect(sponsorRate(RELATIONS.levels)).toBe(1.7);
      expect(sponsorRate(RELATIONS.levels + 3)).toBe(1.7);
      for (let level = 1; level < RELATIONS.levels; level++) expect(sponsorRate(level + 1)).toBeGreaterThan(sponsorRate(level));
    });

    it('the sales staff work on the sponsors under contract; a new level pays at once, and a penalty costs one', () => {
      const s = company(150, 1, growthBot);
      const [first, second] = s.shows;
      const offer = (id: string, sponsor: string): SponsorOffer => ({ id, sponsor, medium: 'radio', cpmMultiplier: sponsorRate(1), preferredAudience: null, minListeners: 1, weeks: 26, penalty: 100, expiresOn: s.day + 14 });
      let t: GameState = { ...s, contracts: [], relations: {}, offers: [offer('o1', 'Acme'), offer('o2', 'Bolt')] };
      t = ok(acceptOffer(ok(acceptOffer(t, 'o1', first!.id)), 'o2', second!.id));
      expect(t.relations).toEqual({ Acme: { level: 1, points: 0 }, Bolt: { level: 1, points: 0 } });

      const draft = structuredClone(t);
      // The sales staff work on brands (0.21.0): only they earn the points.
      // One of grade 70 or more works on three brands, so on both of these.
      for (const e of draft.employees) if (e.role === 'sales') Object.assign(e, { salesJob: 'brands', skill: 100 });
      const desked = employeesWithDesk(draft);
      let days = 0;
      while (relationOf(draft, 'Acme').level === 1 && days < 2_000) {
        workOnRelations(draft, desked);
        days++;
      }
      expect(relationOf(draft, 'Acme').level).toBe(2);
      expect(relationOf(draft, 'Bolt').level).toBe(2);
      expect(days).toBeGreaterThan(pointsForLevel(1) / 4);
      // The contracts that run pay the new rate, and the news is about Sales.
      for (const contract of draft.contracts) expect(contract.cpmMultiplier).toBe(sponsorRate(2));
      expect(draft.messages.filter((m) => /on better terms with (Acme|Bolt): level 2/.test(m.text) && m.about === 'sales')).toHaveLength(2);

      // Half the offers come from a sponsor the company knows, at the rate of its level.
      const offers = Array.from({ length: 30 }, (_, seed) => {
        const next: GameState = structuredClone({ ...draft, offers: [] as SponsorOffer[], contracts: draft.contracts.slice(0, 1) });
        for (const e of next.employees) if (e.role === 'sales') e.salesJob = 'deals';
        refreshOffers(next, new Rng(seed + 1), employeesWithDesk(next));
        return next.offers;
      }).flat();
      expect(offers.some((o) => o.sponsor === 'Acme' || o.sponsor === 'Bolt')).toBe(true);
      // (Since 0.21.0, #361, with what its terms do to it.)
      for (const o of offers) expect(o.cpmMultiplier).toBe(rateWithTerms(relationOf(draft, o.sponsor).level, o));

      // Breaking a contract costs the penalty, and a level with that sponsor.
      const broken = ok(cancelContract(draft, draft.contracts.find((c) => c.sponsor === 'Acme')!.id));
      expect(relationOf(broken, 'Acme')).toEqual({ level: 1, points: 0 });
      expect(relationOf(broken, 'Bolt').level).toBe(2);
    });
  });
});
