import { describe, expect, it } from 'vitest';
import { ACTIVE_REGIONS, MAX_PLAYER_CHANNELS, POACH, WHOLE_TAKEOVER } from '../config/balance';
import { takeOverRival } from './actions';
import { salaryFor } from './economy';
import { licensesTaken } from './licenses';
import { createInitialState } from './newGame';
import { rivalHosts } from './rivals';
import { sensibleBot } from './bots';
import { rivalNameOf, takeoverPrice, weakestRival, wholeTakeoverBlocker, wholeTakeoverHosts, wholeTakeoverPrice, wholeTakeoverTerms } from './takeovers';
import { unlockAll } from './unlocks';
import type { GameState, Rival, RivalChannel } from './state';

/** A company with a radio station and lots of money, level 13 open, and a rival (not EPB) with a radio channel in two regions and a TV channel in one. */
function setup(): { s: GameState; rival: Rival; radio: RivalChannel; tv: RivalChannel } {
  const s = structuredClone(unlockAll(sensibleBot(createInitialState(1))));
  s.money = 500_000_000;
  const rival = s.rivals.find((r) => r.personality !== 'highbrow')!;
  const radio = rival.channels.find((c) => c.medium === 'radio')!;
  radio.regionIds = [ACTIVE_REGIONS[0]!, ACTIVE_REGIONS[1]!];
  radio.reputation = { [ACTIVE_REGIONS[0]!]: 0.6, [ACTIVE_REGIONS[1]!]: 0.3 };
  radio.licenseExpiry = { [ACTIVE_REGIONS[0]!]: s.day + 900, [ACTIVE_REGIONS[1]!]: s.day + 1200 };
  let tv = rival.channels.find((c) => c.medium === 'tv');
  if (!tv) {
    tv = { ...structuredClone(radio), id: 'rtv', name: 'Rival TV', medium: 'tv', regionIds: [ACTIVE_REGIONS[0]!], reputation: { [ACTIVE_REGIONS[0]!]: 0.5 }, licenseExpiry: { [ACTIVE_REGIONS[0]!]: s.day + 800 } };
    rival.channels.push(tv);
  }
  rival.money = 200_000;
  rival.rivalry = 0;
  s.auctions = [];
  s.licenseBars = [];
  return { s, rival, radio, tv };
}

describe('the price of a whole rival (#477)', () => {
  it('is above its regions bought one at a time, and the rival’s money is in it', () => {
    const { s, rival } = setup();
    const regions = rival.channels.reduce((sum, c) => sum + c.regionIds.reduce((n, r) => n + takeoverPrice(s, rival, c, r), 0), 0);
    expect(wholeTakeoverPrice(s, rival)).toBeGreaterThan(regions);
    const poor = wholeTakeoverPrice(s, { ...rival, money: 0 });
    expect(wholeTakeoverPrice(s, rival)).toBeGreaterThan(poor);
    expect(WHOLE_TAKEOVER.extraPremium).toBeGreaterThan(0);
  });

  it('picks the cheapest private rival as the weakest', () => {
    const { s } = setup();
    const weakest = weakestRival(s)!;
    expect(weakest.personality).not.toBe('highbrow');
    for (const r of s.rivals.filter((x) => x.personality !== 'highbrow')) expect(wholeTakeoverPrice(s, r)).toBeGreaterThanOrEqual(wholeTakeoverPrice(s, weakest));
  });
});

describe('what stops a whole takeover (#477)', () => {
  it('is open from level 13 and not before', () => {
    const { s, rival } = setup();
    expect(wholeTakeoverBlocker(s, rival.id, [])).toBeNull();
    s.unlocked = s.unlocked.filter((f) => f !== 'wholeTakeover');
    expect(wholeTakeoverBlocker(s, rival.id, [])).toMatch(/level 13/);
  });

  it('never sells EPB', () => {
    const { s } = setup();
    const epb = s.rivals.find((r) => r.personality === 'highbrow')!;
    expect(wholeTakeoverBlocker(s, epb.id, [])).toMatch(/not for sale/);
    expect(takeOverRival(s, epb.id, []).ok).toBe(false);
  });

  it('waits out a renewal round of one of its licences', () => {
    const { s, rival, radio } = setup();
    s.auctions = [{ id: 'a1', medium: 'radio', regionId: radio.regionIds[0]!, reserve: 1000, endsOn: s.day + 10, interested: 0, bid: null, holder: { ownerId: rival.id, channelId: radio.id, value: 1 } }];
    expect(wholeTakeoverBlocker(s, rival.id, [])).toMatch(/renewal/);
  });

  it('refuses more channels than you can run, and channels that are not its own', () => {
    const { s, rival, radio } = setup();
    while (s.channels.length < MAX_PLAYER_CHANNELS) s.channels.push({ ...structuredClone(s.channels[0]!), id: `x${s.channels.length}` });
    expect(wholeTakeoverBlocker(s, rival.id, [radio.id])).toMatch(/up to/);
    expect(wholeTakeoverBlocker(s, rival.id, [])).toBeNull();
    s.channels = s.channels.slice(0, 1);
    expect(wholeTakeoverBlocker(s, rival.id, ['nope'])).toMatch(/not one of its channels/);
  });

  it('asks for the money', () => {
    const { s, rival } = setup();
    s.money = 100;
    expect(wholeTakeoverBlocker(s, rival.id, [])).toMatch(/Not enough money/);
  });
});

describe('buying a whole rival (#477)', () => {
  it('pays the price, takes the rival’s money, and the rival leaves the game with a headline and Uncle Tabby’s letter', () => {
    const { s, rival, radio } = setup();
    const price = wholeTakeoverPrice(s, rival);
    const result = takeOverRival(s, rival.id, [radio.id]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const t = result.state;
    expect(t.money).toBeCloseTo(s.money - price + rival.money, 0);
    expect(t.rivals.some((r) => r.id === rival.id)).toBe(false);
    expect(t.rivals.length).toBe(s.rivals.length - 1);
    expect(t.boughtRivals).toEqual([{ id: rival.id, name: rival.name, on: s.day, price }]);
    expect(rivalNameOf(t, rival.id)).toBe(rival.name);
    expect(t.headlines.some((h) => h.text.includes(`buys ${rival.name} outright`))).toBe(true);
    expect(t.messages.some((m) => m.from.kind === 'tabby' && m.text.includes(rival.name))).toBe(true);
  });

  it('keeps the channels you choose with their licences and shows, and closes the rest so their licences are free', () => {
    const { s, rival, radio, tv } = setup();
    const taken = licensesTaken(s, 'tv', tv.regionIds[0]!);
    const t = (takeOverRival(s, rival.id, [radio.id]) as { ok: true; state: GameState }).state;
    expect(t.channels.length).toBe(s.channels.length + 1);
    const mine = t.channels.find((c) => c.name === radio.name)!;
    expect(t.channels.some((c) => c.name === tv.name)).toBe(false);
    const licences = t.licenses.filter((l) => l.channelId === mine.id);
    expect(licences.map((l) => l.regionId).sort()).toEqual([...radio.regionIds].sort());
    for (const l of licences) {
      expect(l.takenOver?.from).toBe(rival.id);
      expect(l.expiresOn).toBe(radio.licenseExpiry[l.regionId]);
    }
    expect(mine.reputation[radio.regionIds[0]!]).toBeGreaterThanOrEqual(radio.reputation[radio.regionIds[0]!]!);
    // A show of theirs is a show of yours in the same slot, with no studio or crew.
    radio.schedule.forEach((rs, slot) => {
      const show = t.shows.find((x) => x.id === mine.schedule[slot])!;
      expect(show.name).toBe(rs.name);
      expect(show.genre).toBe(rs.genre);
      expect(show.studioId).toBeNull();
      expect(show.staffIds).toEqual([]);
    });
    // The TV licence went with the closed channel, and is free for anyone.
    expect(licensesTaken(t, 'tv', tv.regionIds[0]!)).toBe(taken - 1);
  });

  it('closes everything when you keep nothing', () => {
    const { s, rival } = setup();
    const t = (takeOverRival(s, rival.id, []) as { ok: true; state: GameState }).state;
    expect(t.channels.length).toBe(s.channels.length);
    expect(t.licenses.some((l) => l.takenOver)).toBe(false);
  });

  it('brings every host, with their fame, at the going rate and no signing fee', () => {
    const { s, rival, radio } = setup();
    // A host on both channels, to be signed once.
    const hosts = rivalHosts(s, rival);
    expect(hosts.length).toBeGreaterThan(0);
    const terms = wholeTakeoverTerms(s, rival, [radio.id]);
    expect(terms.hosts.map((h) => h.name).sort()).toEqual(hosts.map((h) => h.name).sort());
    expect(terms.salaries).toBe(12 * terms.hosts.reduce((n, h) => n + h.salary, 0));
    const t = (takeOverRival(s, rival.id, [radio.id]) as { ok: true; state: GameState }).state;
    for (const host of wholeTakeoverHosts(s, rival)) {
      const e = t.employees.find((x) => x.name === host.name && x.role === 'host')!;
      expect(e).toBeDefined();
      expect(e.fame).toBe(host.fame);
      expect(e.salary).toBe(host.salary);
      expect(e.salary).toBe(salaryFor('host', host.skill, host.fame, s));
      expect(e.hiredOn).toBe(s.day);
    }
    expect(t.employees.length).toBe(s.employees.length + hosts.length);
    // No poaching cooldown, and the hosts of the kept channel present its shows.
    expect(t.lastPoachDay).toBe(s.lastPoachDay);
    const mine = t.channels.find((c) => c.name === radio.name)!;
    const hosted = mine.schedule.map((id) => t.shows.find((x) => x.id === id)!).filter((x) => x.hostId);
    for (const show of hosted) expect(t.employees.find((e) => e.id === show.hostId)?.name).toBeTruthy();
    expect(POACH.signingMonths).toBeGreaterThan(0);
  });

  it('clears every id of the rival', () => {
    const { s, rival, radio } = setup();
    const host = s.employees.find((e) => e.role === 'host') ?? s.employees[0]!;
    host.leaving = { on: s.day + 10, rivalId: rival.id };
    s.poachOffers = [{ id: 'o1', hostId: host.id, rivalId: rival.id, salary: 1, expiresOn: s.day + 5 }];
    s.candidates.push({ ...structuredClone(host), id: 'cand', rivalOffer: { rivalId: rival.id, on: s.day + 5 } } as never);
    s.showSales = [{ id: 'sale1', showId: 'x', rivalId: rival.id, channelId: radio.id, slot: 0, startDay: s.day, endDay: s.day + 90, earned: 0 }];
    s.eventRights = [{ eventId: 'worldCup', holderId: rival.id }];
    const t = (takeOverRival(s, rival.id, [radio.id]) as { ok: true; state: GameState }).state;
    expect(t.employees.find((e) => e.id === host.id)?.leaving).toBeNull();
    expect(t.poachOffers).toEqual([]);
    expect(t.candidates.find((c) => c.id === 'cand')?.rivalOffer).toBeUndefined();
    expect(t.showSales).toEqual([]);
    expect(t.eventRights).toEqual([{ eventId: 'worldCup', holderId: 'player' }]);
  });

  it('cannot be done twice, and the game goes on', () => {
    const { s, rival, radio } = setup();
    const once = takeOverRival(s, rival.id, [radio.id]);
    expect(once.ok).toBe(true);
    if (!once.ok) return;
    expect(takeOverRival(once.state, rival.id, []).ok).toBe(false);
  });
});
