import { describe, expect, it } from 'vitest';
import { ACTIVE_REGIONS, RIVAL_MIN_FREE_SLOTS } from '../config/balance';
import { freeLicenses } from './licenses';
import { createInitialState } from './newGame';
import { unlockAll } from './unlocks';
import { PERSONALITIES } from '../config/rivals';
import { answerCost, applyRivalMoves, expandRivals, moveNote, payRival, planRivalMoves, refreshRivalShows, rivalCeiling, rivalHosts, rivalPurse, rivalStance, rivalValue, rivalryWaits, shareAgainst, updateRivalry } from './rivals';
import { Rng } from './rng';
import { RIVALRY } from '../config/balance';
import { toDay } from './calendar';
import { PLAYER, type GameState } from './state';
import { advance } from './tick';

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

  it('never make a talent show (#405): it needs your jury and your hall', () => {
    const s = structuredClone(unlockAll(createInitialState(1)));
    const rng = new Rng(4);
    for (let i = 0; i < 40; i++) refreshRivalShows(s, rng);
    for (const rival of s.rivals) for (const channel of rival.channels) expect(channel.schedule.map((sh) => sh.genre)).not.toContain('talentShow');
  });
});

describe('rival money (#409)', () => {
  const start = () => structuredClone(unlockAll(createInitialState(1)));
  const byPersonality = (s: GameState, p: string) => s.rivals.find((r) => r.personality === p)!;

  it('starts with the money of its personality, no rivalry and no move', () => {
    const s = start();
    for (const rival of s.rivals) {
      expect(rival.money).toBe(RIVALRY.startMoney[rival.personality]);
      expect(rival.rivalry).toBe(0);
      expect(rival.move).toBeNull();
    }
  });

  it('keeps a share of its ad money each day, up to the ceiling', () => {
    const s = start();
    const rival = byPersonality(s, 'news');
    payRival(s, rival, 10_000);
    expect(rival.money).toBeCloseTo(RIVALRY.startMoney.news + 10_000 * RIVALRY.keptShare);
    payRival(s, rival, 1e9);
    expect(rival.money).toBe(rivalCeiling('news'));
    payRival(s, rival, 10_000);
    expect(rival.money).toBe(rivalCeiling('news'));
  });

  it('never goes below 0', () => {
    const s = start();
    const rival = byPersonality(s, 'cheap');
    rival.money = -500;
    payRival(s, rival, -1e6);
    expect(rival.money).toBe(0);
  });

  it('gets a public grant for EPB that does not follow its ratings', () => {
    const s = start();
    const epb = byPersonality(s, 'highbrow');
    const before = epb.money;
    payRival(s, epb, 0);
    const grant = epb.money - before;
    expect(grant).toBeGreaterThan(0);
    epb.money = before;
    payRival(s, epb, 1e7);
    expect(epb.money - before).toBeCloseTo(grant);
  });

  it('is earned in the daily broadcast from the rival’s own channels', () => {
    const s = advance(start(), 10);
    expect(byPersonality(s, 'news').money).toBeGreaterThan(RIVALRY.startMoney.news);
  });
});

describe('rivalry (#409)', () => {
  /** A weekly report where the player has `mine` listeners on radio and every rival `theirs`. */
  function setUp(year: number, leader: boolean, mine = 6, theirs = 4) {
    const s = structuredClone(unlockAll(createInitialState(1)));
    s.day = toDay(year, 1, 1);
    const channels = [{ channelId: 'p', name: 'P', ownerId: PLAYER, isPlayer: true, medium: 'radio', slots: [{ programName: 'x', listeners: mine, share: 0 }], regionListeners: {}, audienceListeners: {}, revenue: 0 }];
    for (const r of s.rivals) channels.push({ channelId: r.channels[0]!.id, name: 'R', ownerId: r.id, isPlayer: false, medium: 'radio', slots: [{ programName: 'x', listeners: theirs, share: 0 }], regionListeners: {}, audienceListeners: {}, revenue: 0 });
    s.weeklyReports = [{ fromDay: s.day - 7, days: 7, channels: channels as never }];
    if (leader) s.milestones.push({ id: 'radioLeader', day: s.day });
    return s;
  }

  it('stays 0 before the year of the difficulty', () => {
    const s = setUp(1972, true);
    s.difficulty = 'normal';
    updateRivalry(s);
    expect(s.rivals.every((r) => r.rivalry === 0)).toBe(true);
  });

  it('stays 0 until you have led a market', () => {
    const s = setUp(1980, false);
    updateRivalry(s);
    expect(s.rivals.every((r) => r.rivalry === 0)).toBe(true);
  });

  it('rises with your share after both, and falls back when you shrink', () => {
    const s = setUp(1980, true);
    updateRivalry(s);
    const first = s.rivals[0]!.rivalry;
    expect(first).toBeGreaterThan(0);
    updateRivalry(s);
    expect(s.rivals[0]!.rivalry).toBeGreaterThan(first);
    s.weeklyReports[0]!.channels[0]!.slots[0]!.listeners = 0.1;
    const high = s.rivals[0]!.rivalry;
    updateRivalry(s);
    expect(s.rivals[0]!.rivalry).toBeLessThan(high);
  });

  it('is left alone by a small company', () => {
    const s = setUp(1980, true, 1, 9);
    updateRivalry(s);
    expect(s.rivals.every((r) => r.rivalry === 0)).toBe(true);
  });
});

describe('how a rival sees you, in words and e-mails (#410)', () => {
  function setUp(year: number, leader: boolean, mine = 6, theirs = 4) {
    const s = structuredClone(unlockAll(createInitialState(1)));
    s.day = toDay(year, 1, 1);
    const channels = [{ channelId: 'p', name: 'P', ownerId: PLAYER, isPlayer: true, medium: 'radio', slots: [{ programName: 'x', listeners: mine, share: 0 }], regionListeners: {}, audienceListeners: {}, revenue: 0 }];
    for (const r of s.rivals) channels.push({ channelId: r.channels[0]!.id, name: 'R', ownerId: r.id, isPlayer: false, medium: 'radio', slots: [{ programName: 'x', listeners: theirs, share: 0 }], regionListeners: {}, audienceListeners: {}, revenue: 0 });
    s.weeklyReports = [{ fromDay: s.day - 7, days: 7, channels: channels as never }];
    if (leader) s.milestones.push({ id: 'radioLeader', day: s.day });
    s.messages = [];
    return s;
  }
  const mails = (s: GameState) => s.messages.filter((m) => m.from.kind === 'penny');

  it('names the stance at its edges', () => {
    expect(rivalStance({ rivalry: 0 })).toBe('ignores');
    expect(rivalStance({ rivalry: RIVALRY.watch - 0.01 })).toBe('ignores');
    expect(rivalStance({ rivalry: RIVALRY.watch })).toBe('watches');
    expect(rivalStance({ rivalry: RIVALRY.fight })).toBe('fights');
  });

  it('names the purse against the start money', () => {
    const start = RIVALRY.startMoney.news;
    expect(rivalPurse({ personality: 'news', money: start * RIVALRY.shortBelow - 1 })).toBe('short');
    expect(rivalPurse({ personality: 'news', money: start * RIVALRY.shortBelow })).toBe('comfortable');
    expect(rivalPurse({ personality: 'news', money: start * RIVALRY.flushFrom })).toBe('flush');
  });

  it('says why rivalry waits', () => {
    const s = setUp(1971, true);
    s.difficulty = 'normal';
    expect(rivalryWaits(s)).toBe('until 1973');
    expect(rivalryWaits(setUp(1980, false))).toBe('until you lead a market');
    expect(rivalryWaits(setUp(1980, true))).toBeNull();
  });

  it('reads your share where you meet the rival', () => {
    const s = setUp(1980, true, 6, 4);
    expect(shareAgainst(s, s.rivals[0]!)).toBeCloseTo(0.6);
    expect(shareAgainst(s, { id: 'nobody' })).toBe(0);
  });

  it('e-mails once when a rival starts to watch you and once when it fights you', () => {
    const s = setUp(1980, true, 6, 4);
    s.rivals[0]!.rivalry = RIVALRY.watch - 0.01;
    updateRivalry(s);
    expect(mails(s).filter((m) => m.text.startsWith(`${s.rivals[0]!.name} has noticed you`))).toHaveLength(1);
    s.rivals[0]!.rivalry = RIVALRY.fight - 0.01;
    updateRivalry(s);
    expect(mails(s).filter((m) => m.text.startsWith(`${s.rivals[0]!.name} now sees you`))).toHaveLength(1);
    const count = mails(s).length;
    updateRivalry(s);
    expect(mails(s)).toHaveLength(count);
  });

  it('sends nothing when a rival calms down, or while the gate is closed', () => {
    const s = setUp(1980, true, 1, 9);
    s.rivals[0]!.rivalry = RIVALRY.watch + 0.01;
    updateRivalry(s);
    expect(s.rivals[0]!.rivalry).toBeGreaterThan(0);
    s.rivals[0]!.rivalry = RIVALRY.fight;
    updateRivalry(s);
    expect(mails(s)).toHaveLength(0);
    const closed = setUp(1980, false);
    closed.rivals[0]!.rivalry = RIVALRY.watch - 0.01;
    updateRivalry(closed);
    expect(mails(closed)).toHaveLength(0);
  });

  it('sends nothing when the rivals e-mails are switched off', () => {
    const s = setUp(1980, true, 6, 4);
    s.mailOff.push('rivals');
    s.rivals[0]!.rivalry = RIVALRY.watch - 0.01;
    updateRivalry(s);
    expect(mails(s)).toHaveLength(0);
  });
});

describe('counter-programming (#411)', () => {
  const HEARD = [100, 200, 300, 900, 500];
  /** One radio channel of yours with five shows, a license in the north and a weekly report; every rival's radio channel meets it. */
  function setUp(year = 1980, month = 2) {
    const s = structuredClone(unlockAll(createInitialState(1)));
    s.day = toDay(year, month, 1);
    s.channels = [{ id: 'me', name: 'My Radio', medium: 'radio', managerId: null, schedule: ['a', 'b', 'c', 'd', 'e'], reputation: {}, lastEvent: null, social: null, adMinutes: 10 } as never];
    s.shows = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, name: `Show ${id}`, genre: 'top40', hostId: null, staffIds: [], writerIds: [], editorIds: [], studioId: null, quality: 0.8 }) as never);
    s.licenses = [{ id: 'l', regionId: 'north', medium: 'radio', channelId: 'me', price: 0, expiresOn: 99999 } as never];
    for (const rival of s.rivals) {
      rival.rivalry = RIVALRY.watch + 0.01;
      rival.move = null;
      for (const channel of rival.channels.filter((c) => c.medium === 'radio')) channel.regionIds = ['north'];
    }
    const radio = (r: (typeof s.rivals)[number]) => r.channels.find((c) => c.medium === 'radio')!;
    const channels = [{ channelId: 'me', name: 'My Radio', ownerId: PLAYER, isPlayer: true, medium: 'radio', slots: HEARD.map((listeners) => ({ programName: 'x', listeners, share: 0 })), regionListeners: {}, audienceListeners: {}, revenue: 0 }];
    for (const r of s.rivals) for (const c of r.channels) channels.push({ channelId: c.id, name: c.name, ownerId: r.id, isPlayer: false, medium: c.medium, slots: [0, 1, 2, 3, 4].map(() => ({ programName: 'x', listeners: 50, share: 0 })), regionListeners: {}, audienceListeners: {}, revenue: 0 });
    s.weeklyReports = [{ fromDay: s.day - 7, days: 7, channels: channels as never }];
    s.messages = [];
    s.headlines = [];
    return { s, radio };
  }
  const news = (s: GameState) => s.rivals.find((r) => r.personality === 'news')!;
  const cheap = (s: GameState) => s.rivals.find((r) => r.personality === 'cheap')!;
  const epb = (s: GameState) => s.rivals.find((r) => r.personality === 'highbrow')!;

  it('plans only at or above watch, and aims at your biggest show it meets', () => {
    const { s, radio } = setUp();
    radio(news(s)).schedule[0]!.quality = 0.99;
    news(s).rivalry = RIVALRY.watch - 0.01;
    for (const r of s.rivals) if (r !== news(s)) r.rivalry = 0;
    planRivalMoves(s);
    expect(news(s).move).toBeNull();
    news(s).rivalry = RIVALRY.watch;
    planRivalMoves(s);
    const move = news(s).move!;
    expect(move).toMatchObject({ kind: 'move', channelId: radio(news(s)).id, slot: 3, from: 0, against: { channelId: 'me', show: 'Show d' }, on: toDay(1980, 3, 1) });
    expect(s.headlines.at(-1)!.text).toContain('Show d');
    expect(s.messages.some((m) => m.from.kind === 'penny' && m.text.includes('from 1 March'))).toBe(true);
  });

  it('is run on the 1st of February, May, August and November only', () => {
    for (const [month, planned] of [[2, true], [3, false], [5, true], [8, true], [11, true], [12, false]] as const) {
      const { s } = setUp(1980, month);
      s.day -= 1;
      const next = advance(s, 1);
      expect(next.rivals.some((r) => r.move !== null), `month ${month}`).toBe(planned);
    }
  });

  it('never puts two rivals on one slot: the second aims at your next show', () => {
    const { s } = setUp();
    news(s).rivalry = 0.9;
    cheap(s).rivalry = 0.8;
    epb(s).rivalry = 0;
    planRivalMoves(s);
    expect(news(s).move!.slot).toBe(3);
    expect(cheap(s).move!.slot).toBe(4);
  });

  it('makes one move per rival and leaves a planned move alone', () => {
    const { s } = setUp();
    news(s).rivalry = 0.9;
    for (const r of s.rivals) if (r !== news(s)) r.rivalry = 0;
    planRivalMoves(s);
    const first = structuredClone(news(s).move);
    planRivalMoves(s);
    expect(news(s).move).toEqual(first);
    expect(s.headlines).toHaveLength(1);
  });

  it('leaves sold slots alone', () => {
    const { s, radio } = setUp();
    for (const r of s.rivals) if (r !== news(s)) r.rivalry = 0;
    s.showSales = [{ id: 'x', showId: 'd', rivalId: news(s).id, channelId: radio(news(s)).id, slot: 3, startDay: 0, endDay: 99999, earned: 0 }];
    planRivalMoves(s);
    expect(news(s).move).toBeNull();
    s.showSales = [{ id: 'x', showId: 'd', rivalId: news(s).id, channelId: radio(news(s)).id, slot: 0, startDay: 0, endDay: 99999, earned: 0 }];
    radio(news(s)).schedule[2]!.quality = 0.98;
    planRivalMoves(s);
    expect(news(s).move!.from).toBe(2);
  });

  it('makes no move when its best show already sits in the slot', () => {
    const { s, radio } = setUp();
    for (const r of s.rivals) if (r !== news(s)) r.rivalry = 0;
    radio(news(s)).schedule[3]!.quality = 0.99;
    planRivalMoves(s);
    expect(news(s).move).toBeNull();
  });

  it('has EPB move only classical, drama and documentaries, and EPB Radio 1 never', () => {
    const { s } = setUp();
    for (const r of s.rivals) if (r !== epb(s)) r.rivalry = 0;
    const [one, two] = epb(s).channels.filter((c) => c.medium === 'radio');
    one!.schedule.forEach((show) => (show.quality = 0.99));
    two!.schedule.forEach((show) => (show.quality = show.genre === 'news' ? 0.99 : 0.8));
    two!.schedule[1]!.quality = 0.85;
    planRivalMoves(s);
    expect(epb(s).move!.channelId).toBe(two!.id);
    expect(epb(s).move!.from).toBe(1);
    const { s: t } = setUp();
    for (const r of t.rivals) if (r.personality !== 'highbrow') r.rivalry = 0;
    const radios = epb(t).channels.filter((c) => c.medium === 'radio');
    radios[1]!.regionIds = [];
    planRivalMoves(t);
    expect(epb(t).move).toBeNull();
  });

  it('swaps at the season start, before the refresh, and is then done', () => {
    const { s, radio } = setUp(1980, 3);
    const channel = radio(news(s));
    const best = channel.schedule[0]!;
    const other = channel.schedule[3]!;
    news(s).move = { kind: 'move', channelId: channel.id, slot: 3, from: 0, against: { channelId: 'me', show: 'Show d' }, on: s.day };
    applyRivalMoves(s, new Rng(1));
    expect(channel.schedule[3]).toBe(best);
    expect(channel.schedule[0]).toBe(other);
    expect(news(s).move).toBeNull();
    const t = setUp(1980, 3).s;
    const ch = news(t).channels.find((c) => c.medium === 'radio')!;
    // The show moved from slot 0 is the strongest, and the one that was at slot 3 the weakest: after the swap the refresh replaces the show that came from slot 3.
    ch.schedule.forEach((show) => (show.quality = 0.8));
    ch.schedule[0]!.quality = 0.99;
    ch.schedule[3]!.quality = 0.5;
    const strongest = ch.schedule[0]!.name;
    const weakest = ch.schedule[3]!.name;
    news(t).move = { kind: 'move', channelId: ch.id, slot: 3, from: 0, against: { channelId: 'me', show: 'Show d' }, on: t.day };
    t.day -= 1;
    const after = advance(t, 1);
    expect(news(after).move).toBeNull();
    const schedule = after.rivals.find((r) => r.id === news(t).id)!.channels.find((c) => c.id === ch.id)!.schedule;
    expect(schedule[3]!.name).toBe(strongest);
    expect(schedule.map((x) => x.name)).not.toContain(weakest);
  });

  it('drops a move without news when a slot holds a sold show', () => {
    const { s, radio } = setUp(1980, 3);
    const channel = radio(news(s));
    const before = channel.schedule.map((x) => x.name);
    news(s).move = { kind: 'move', channelId: channel.id, slot: 3, from: 0, against: { channelId: 'me', show: 'Show d' }, on: s.day };
    s.showSales = [{ id: 'x', showId: 'd', rivalId: news(s).id, channelId: channel.id, slot: 3, startDay: 0, endDay: 99999, earned: 0 }];
    applyRivalMoves(s, new Rng(1));
    expect(channel.schedule.map((x) => x.name)).toEqual(before);
    expect(news(s).move).toBeNull();
    expect(s.headlines).toHaveLength(0);
  });

  it('draws no random numbers, and with the rivals e-mails off sends no e-mail but still a headline', () => {
    const { s } = setUp();
    s.mailOff.push('rivals');
    const rng = s.rngState;
    planRivalMoves(s);
    expect(s.rngState).toBe(rng);
    expect(s.rivals.some((r) => r.move)).toBe(true);
    expect(s.messages.filter((m) => m.from.kind === 'penny')).toHaveLength(0);
    expect(s.headlines.length).toBeGreaterThan(0);
  });

  it('says so on the Schedule screen and in the panel', () => {
    const { s } = setUp();
    for (const r of s.rivals) if (r !== news(s)) r.rivalry = 0;
    planRivalMoves(s);
    expect(moveNote(news(s))).toMatch(/^From 1 March: .* puts “.*” here$/);
    expect(moveNote(news(s), false)).toContain('against “Show d”');
    expect(moveNote(cheap(s))).toBeNull();
  });

  describe('copy and spend (#412)', () => {
    const youth = (s: GameState) => s.rivals.find((r) => r.personality === 'youth');
    /** Only one rival plans: it fights you, and has money. */
    function fighter(who: (s: GameState) => GameState['rivals'][number] | undefined, year = 1980, month = 2) {
      const { s, radio } = setUp(year, month);
      const rival = who(s)!;
      for (const r of s.rivals) r.rivalry = 0;
      rival.rivalry = 0.9;
      rival.money = 1_000_000;
      return { s, rival, radio };
    }

    it('has a rival that only watches you just move, and one that fights you follow its table', () => {
      const { s, rival } = fighter(news);
      rival.rivalry = RIVALRY.watch + 0.01;
      planRivalMoves(s);
      expect(rival.move!.kind).toBe('move');
      const t = fighter(news);
      planRivalMoves(t.s);
      expect(t.rival.move).toMatchObject({ kind: 'spend', slot: 3, on: toDay(1980, 3, 1), until: toDay(1980, 6, 1) });
      const c = fighter(cheap);
      planRivalMoves(c.s);
      expect(c.rival.move).toMatchObject({ kind: 'copy', slot: 3, genre: 'top40', on: toDay(1980, 3, 1) });
      expect(c.s.headlines.at(-1)!.text).toContain('new top 40');
      expect(c.s.messages.some((m) => m.from.kind === 'penny' && m.text.includes('Show d'))).toBe(true);
      expect(PERSONALITIES.cheap.answers).toEqual(['copy', 'move']);
    });

    it('pays only if it keeps its reserve, and moves instead when it cannot', () => {
      const { s, rival } = fighter(news);
      const cost = answerCost(s, 'spend');
      const reserve = RIVALRY.shortBelow * RIVALRY.startMoney.news;
      rival.money = reserve + cost - 1;
      planRivalMoves(s);
      expect(rival.move!.kind).toBe('move');
      const t = fighter(news);
      t.rival.money = reserve + cost;
      planRivalMoves(t.s);
      expect(t.rival.move!.kind).toBe('spend');
      const u = fighter(cheap);
      u.radio(u.rival).schedule[0]!.quality = 0.99;
      u.rival.money = 0;
      planRivalMoves(u.s);
      expect(u.rival.move!.kind).toBe('move');
    });

    it('draws no random numbers when planning', () => {
      const { s } = fighter(cheap);
      const rng = s.rngState;
      planRivalMoves(s);
      expect(s.rngState).toBe(rng);
    });

    it('does not copy a licensed genre', () => {
      const { s, rival, radio } = fighter(cheap);
      radio(rival).schedule[0]!.quality = 0.99;
      s.shows.find((x) => x.id === 'd')!.genre = 'movies';
      planRivalMoves(s);
      expect(rival.move!.kind).toBe('move');
    });

    it('pays a copy at the season start, in your genre, and the refresh leaves it alone', () => {
      const { s, rival, radio } = fighter(cheap, 1980, 3);
      const channel = radio(rival);
      rival.move = { kind: 'copy', channelId: channel.id, slot: 3, genre: 'top40', against: { channelId: 'me', show: 'Show d' }, on: s.day };
      const before = rival.money;
      const was = channel.schedule[3]!;
      const rng = new Rng(7);
      const state = rng.state;
      const copied = applyRivalMoves(s, rng);
      expect(rng.state).toBe(state);
      expect(rival.money).toBeCloseTo(before - answerCost(s, 'copy'));
      expect(rival.move).toBeNull();
      expect(channel.schedule[3]).not.toBe(was);
      expect(channel.schedule[3]!.genre).toBe('top40');
      expect(copied.has(`${channel.id}:3`)).toBe(true);
      const copy = channel.schedule[3]!;
      channel.schedule[3]!.quality = 0;
      for (let i = 0; i < 20; i++) refreshRivalShows(s, new Rng(i), copied);
      expect(channel.schedule[3]).toBe(copy);
    });

    it('drops a copy without news when it cannot pay or the slot is sold', () => {
      const { s, rival, radio } = fighter(cheap, 1980, 3);
      const channel = radio(rival);
      const before = channel.schedule.map((x) => x.name);
      rival.move = { kind: 'copy', channelId: channel.id, slot: 3, genre: 'top40', against: { channelId: 'me', show: 'Show d' }, on: s.day };
      rival.money = 0;
      expect(applyRivalMoves(s, new Rng(1)).size).toBe(0);
      expect(channel.schedule.map((x) => x.name)).toEqual(before);
      expect(rival.move).toBeNull();
      expect(rival.money).toBe(0);
      rival.money = 1_000_000;
      rival.move = { kind: 'copy', channelId: channel.id, slot: 3, genre: 'top40', against: { channelId: 'me', show: 'Show d' }, on: s.day };
      s.showSales = [{ id: 'x', showId: 'd', rivalId: rival.id, channelId: channel.id, slot: 3, startDay: 0, endDay: 99999, earned: 0 }];
      applyRivalMoves(s, new Rng(1));
      expect(rival.money).toBe(1_000_000);
      expect(s.headlines).toHaveLength(0);
    });

    it('pays a spend at the season start, keeps it until `until`, and plans nothing meanwhile', () => {
      const { s, rival } = fighter(news, 1980, 2);
      planRivalMoves(s);
      const move = rival.move!;
      expect(move.kind).toBe('spend');
      const before = rival.money;
      expect(moveNote(rival, true, s.day)).toMatch(/^From 1 March to 1 June: .* spends on “.*” here$/);
      s.day = move.on;
      applyRivalMoves(s, new Rng(1));
      expect(rival.money).toBeCloseTo(before - answerCost(s, 'spend'));
      expect(rival.move).toBe(move);
      expect(moveNote(rival, true, s.day)).toMatch(/^Until 1 June: /);
      s.day = toDay(1980, 5, 1);
      const paid = rival.money;
      planRivalMoves(s);
      expect(rival.move).toBe(move);
      s.day = move.until!;
      applyRivalMoves(s, new Rng(1));
      expect(rival.move).toBeNull();
      expect(rival.money).toBe(paid);
    });

    it('has EPB never copy, and spend only on a cultural show', () => {
      expect(PERSONALITIES.highbrow.answers).not.toContain('copy');
      const { s, rival } = fighter(epb);
      planRivalMoves(s);
      expect(rival.move!.kind).toBe('move');
      const t = fighter(epb);
      const two = t.rival.channels.filter((c) => c.medium === 'radio')[1]!;
      two.schedule[3]!.genre = 'classical';
      for (const c of t.rival.channels) if (c !== two) c.regionIds = [];
      planRivalMoves(t.s);
      expect(t.rival.move).toMatchObject({ kind: 'spend', channelId: two.id, slot: 3 });
    });

    it('does nothing without money', () => {
      const { s, rival } = fighter(news, 1980, 3);
      rival.money = 0;
      rival.move = { kind: 'spend', channelId: rival.channels[0]!.id, slot: 3, against: { channelId: 'me', show: 'Show d' }, on: s.day, until: toDay(1980, 6, 1) };
      applyRivalMoves(s, new Rng(1));
      expect(rival.move).toBeNull();
      expect(rival.money).toBe(0);
      expect(youth(s)).toBeDefined();
    });
  });
});

describe('what a rival is worth and who it has on air (#409)', () => {
  it('counts money, licenses and the revenue of its last week', () => {
    const s = structuredClone(unlockAll(createInitialState(1)));
    const rival = s.rivals[0]!;
    const base = rivalValue(s, rival);
    expect(base).toBeGreaterThan(rival.money);
    rival.money += 1000;
    expect(rivalValue(s, rival)).toBeCloseTo(base + 1000);
    s.weeklyReports = [{ fromDay: 0, days: 7, channels: [{ channelId: rival.channels[0]!.id, name: 'R', ownerId: rival.id, isPlayer: false, medium: 'radio', slots: [], regionListeners: {}, audienceListeners: {}, revenue: 7000 }] }];
    expect(rivalValue(s, rival)).toBeGreaterThan(base + 1000);
  });

  it('lists each host of its schedules once and leaves out shows without one', () => {
    const s = structuredClone(unlockAll(createInitialState(1)));
    const rival = s.rivals[0]!;
    const [a, b] = rival.channels[0]!.schedule;
    a!.hostName = 'Ann Host';
    b!.hostName = 'Ann Host';
    rival.channels[0]!.schedule[2]!.hostName = '';
    const hosts = rivalHosts(s, rival);
    expect(hosts.filter((h) => h.name === 'Ann Host')).toHaveLength(1);
    expect(hosts.map((h) => h.name)).not.toContain('');
  });
});
