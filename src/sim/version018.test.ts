import { describe, expect, it } from 'vitest';
import { STREAMING } from '../config/balance';
import { HINTS } from '../config/guide';
import { TO_RECORD } from '../config/voiceOver';
import { getArticle } from '../wiki/articles';
import { closeStreaming, openStreaming, setStreamingPrice } from './actions';
import { simulateDay, watchedOnDemand } from './broadcast';
import { toDay } from './calendar';
import { runCheat } from './cheats';
import { monthlyNet, outlook, RUNNING_COSTS } from './economy';
import { streamBot, tvBot, type Bot } from './bots';
import { createInitialState } from './newGame';
import { fromSaveFile, SAVE_VERSION, toSaveFile } from './save';
import { slow } from './slow';
import { emptyLedger, type GameState, type RentedRoom, type Title } from './state';
import { fairPrice, priceFactor, streamingBlocker, streamingTarget } from './streaming';
import { tick } from './tick';

/** A library with `racks` server racks, written straight into the game: the rules count racks, not where they stand. */
function library(racks: number, tier = 1): RentedRoom {
  return {
    roomId: 'lib-test',
    name: 'Library 1',
    floor: 1,
    x: 0,
    y: 0,
    w: 6,
    h: 4,
    door: { x: 3.5, z: 4 },
    type: 'library',
    furniture: Array.from({ length: racks }, (_, i) => ({ id: `rack${i}`, type: 'serverRack' as const, x: i * 2, y: 0, turn: 0, tier, condition: 100, boughtOn: 0 })),
    cleanliness: 100,
    issue: null,
  };
}

const title = (i: number, freshness = 1): Title => ({ id: `title${i}`, name: `Film ${i}`, genre: 'movies', quality: 0.7, airingsLeft: 10, freshness, fee: 0, perAiring: 400 });

/** A company in 2016 that has researched Streaming, with racks and a library of titles to offer. */
function ready(racks = 2, titles = 20, freshness = 1): GameState {
  const s = createInitialState(1);
  s.day = toDay(2016, 3, 1);
  s.techs = ['streaming'];
  s.rooms.push(library(racks));
  s.library = Array.from({ length: titles }, (_, i) => title(i, freshness));
  return s;
}

const opened = (s: GameState, price: number = STREAMING.price.start) => {
  const result = openStreaming(s, price);
  if (!result.ok) throw new Error(result.error);
  return result.state;
};

const play = (bot: Bot, state: GameState, days: number) => {
  let s = state;
  for (let i = 0; i < days && !s.bankrupt; i++) s = tick(bot(s));
  return s;
};

describe('a streaming service (R74)', () => {
  it('opens only once it is researched, with racks and enough to offer, and says why not', () => {
    const none = createInitialState(1);
    expect(openStreaming(none, 8)).toMatchObject({ ok: false, error: 'Research Streaming first.' });
    const researched = { ...createInitialState(1), techs: ['streaming' as const] };
    expect(streamingBlocker(researched)).toBe(`Needs ${STREAMING.minRacks} server racks in a library.`);
    expect(streamingBlocker(ready(2, STREAMING.minCatalogue - 1))).toBe(`Needs ${STREAMING.minCatalogue} shows on the air or titles in the library.`);
    // Teleshopping is not on the service.
    const shopping = ready(2, STREAMING.minCatalogue - 1);
    shopping.library.push({ ...title(99), genre: 'teleshopping' });
    expect(streamingBlocker(shopping)).not.toBeNull();

    const s = ready();
    expect(openStreaming(s, STREAMING.price.max + 1)).toMatchObject({ ok: false });
    const open = opened(s);
    expect(open.streaming).toMatchObject({ since: s.day, price: STREAMING.price.start, subscribers: 0 });
    expect(open.headlines.at(-1)!.text).toContain('streaming service');
    expect(openStreaming(open, 8)).toMatchObject({ ok: false, error: 'Your streaming service is open already.' });

    expect(setStreamingPrice(open, 11.3)).toMatchObject({ ok: true, state: { streaming: { price: 11.5 } } });
    expect(closeStreaming(open)).toMatchObject({ ok: true, state: { streaming: null } });
    expect(closeStreaming(s)).toMatchObject({ ok: false });
  });

  it('draws fewer subscribers at a higher price, and the best price is near the fair one', () => {
    const s = ready();
    const fair = fairPrice(2016);
    expect(streamingTarget(s, 14).demand).toBeLessThan(streamingTarget(s, 8).demand);
    expect(priceFactor(fair, fair)).toBe(1);
    // Revenue at the fair price beats revenue well above it.
    const income = (price: number) => streamingTarget(s, price).demand * price;
    expect(income(fair)).toBeGreaterThan(income(fair + 5));
    expect(income(fair)).toBeGreaterThan(income(STREAMING.price.min));
  });

  it('loses subscribers when its catalogue goes stale', () => {
    let s = opened(ready(4, 20, 1));
    for (let i = 0; i < 90; i++) s = tick(s);
    const before = s.streaming!.subscribers;
    expect(before).toBeGreaterThan(0);
    for (const t of s.library) t.freshness = 0.3;
    // Titles off the air get fresh again by themselves: keep them stale for the test.
    for (let i = 0; i < 60; i++) {
      s = tick(s);
      for (const t of s.library) t.freshness = 0.3;
    }
    expect(s.streaming!.subscribers).toBeLessThan(before * 0.6);
  });

  it('never has more subscribers than its racks serve, and says once that it is full', () => {
    let s = opened(ready(2, 60));
    s.day = toDay(2029, 3, 1);
    const capacity = 2 * STREAMING.subscribersPerRack[0]!;
    expect(streamingTarget(s).demand).toBeGreaterThan(capacity);
    const full = (x: GameState) => x.messages.filter((m) => m.text.startsWith('Your streaming service is full')).length;
    s = tick(s);
    expect(full(s)).toBe(1);
    for (let i = 0; i < 120; i++) {
      s = tick(s);
      expect(full(s)).toBeLessThanOrEqual(1);
    }
    expect(s.streaming!.subscribers).toBeLessThanOrEqual(capacity);
    expect(s.streaming!.subscribers).toBeGreaterThan(capacity * 0.95);
    expect(s.streaming!.capped).toBe(true);
  });

  it('pays its subscriptions into the revenue and its costs among the running costs', () => {
    let s = opened(ready(4, 20));
    for (let i = 0; i < 40 && s.day < toDay(2016, 4, 1) - 1; i++) s = tick(s);
    expect(s.ledger.subscriptions).toBeGreaterThan(0);
    expect(s.ledger.revenue).toBeGreaterThanOrEqual(s.ledger.subscriptions);
    expect(s.ledger.streaming).toBeGreaterThan(0);
    expect(RUNNING_COSTS).toContain('streaming');
    expect(monthlyNet({ ...emptyLedger(), streaming: 100 })).toBe(-100);
    const ahead = outlook(s);
    expect(ahead.subscriptions).toBeCloseTo(s.streaming!.subscribers * s.streaming!.price);
    expect(ahead.streaming).toBeGreaterThan(0);
  });

  it('opens the rival services in their years, in the news', () => {
    let s = ready();
    s.day = toDay(2013, 12, 31);
    s = tick(s);
    expect(s.headlines.some((h) => h.text.includes('EPB+'))).toBe(true);
    expect(streamingTarget(s).rivals.map((r) => r.name)).toEqual(['EPB+']);
    s.day = toDay(2030, 1, 1);
    expect(streamingTarget(s).rivals.find((r) => r.name === 'Nimbus')!.appeal).toBeCloseTo(0.35 + 13 * 0.03);
  });

  it('a game from before loads without a service, and the year code moves the day it opened', () => {
    const s = ready();
    const save = toSaveFile(s, 1) as unknown as { version: number; state: Record<string, any> };
    delete save.state.streaming;
    delete save.state.ledger.subscriptions;
    delete save.state.ledger.streaming;
    const { state, version } = fromSaveFile({ ...save, version: 32 });
    expect(version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(33);
    expect(state.streaming).toBeNull();
    expect(state.ledger).toMatchObject({ subscriptions: 0, streaming: 0 });

    const open = opened(s);
    const moved = runCheat(open, 'year 2020');
    expect(moved.ok && moved.state.streaming!.since - open.streaming!.since).toBe(toDay(2020, 3, 1) - toDay(2016, 3, 1));
  });

  it('Penny brings it up, the line waits for its recording, and the wiki has an article', () => {
    expect(HINTS.find((h) => h.id === 'streaming')).toMatchObject({ to: 'broadcast:streaming', wiki: 'streaming' });
    expect(TO_RECORD.streaming).toBe('new');
    expect(getArticle('streaming').title).toBe('Streaming');
  });

  describe('against the TV test player', () => {
    // The TV bot's company after a year, moved to 2014 with everything researched: a TV company of the streaming years.
    const start = (() => {
      const grown = play(tvBot, createInitialState(2), 400);
      const moved = runCheat(grown, 'year 2014');
      if (!moved.ok) throw new Error(moved.error);
      const all = runCheat(moved.state, 'research all');
      if (!all.ok) throw new Error(all.error);
      return all.state;
    })();

    it('a game without a service draws the viewers it did; one with a service draws fewer on its own TV, and rivals none fewer', () => {
      expect(watchedOnDemand(start)).toBe(1);
      const plain = simulateDay(start);
      const streaming = simulateDay({ ...start, streaming: { since: start.day, price: 8, subscribers: 20_000, weekAgo: 0, capped: false } });
      const total = (r: typeof plain, pick: (c: (typeof plain.channels)[number]) => boolean) =>
        r.channels.filter(pick).reduce((sum, c) => sum + c.slots.reduce((x, slot) => x + slot.listeners, 0), 0);
      const ownTv = (c: (typeof plain.channels)[number]) => c.isPlayer && c.medium === 'tv';
      expect(total(streaming, ownTv)).toBeLessThan(total(plain, ownTv));
      expect(total(streaming, ownTv)).toBeGreaterThan(total(plain, ownTv) * 0.98);
      expect(total(streaming, (c) => !ownTv(c))).toBeCloseTo(total(plain, (c) => !ownTv(c)));
    });

    it(
      'earns more with a service than without, the subscriptions a fair part of it',
      () => {
        const days = 730;
        const revenue = (s: GameState) => s.monthlyReports.reduce((sum, r) => sum + r.revenue, 0);
        const subscriptions = (s: GameState) => s.monthlyReports.reduce((sum, r) => sum + r.subscriptions, 0);
        const before = revenue(start);
        const tv = play(tvBot, start, days);
        const stream = play(streamBot, start, days);
        expect(tv.bankrupt || stream.bankrupt).toBe(false);
        expect(stream.streaming).not.toBeNull();
        expect(revenue(stream) - before).toBeGreaterThan(revenue(tv) - before);
        // Measured over three seeds from 1970 (npm run simulate -- --bot stream): 9% of revenue in 2012, 24–26% by 2029.
        const share = subscriptions(stream) / (revenue(stream) - before);
        expect(share).toBeGreaterThan(0.05);
        expect(share).toBeLessThan(0.3);
      },
      slow(120_000),
    );
  });
});
