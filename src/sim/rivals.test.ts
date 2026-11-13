import { describe, expect, it } from 'vitest';
import { ACTIVE_REGIONS, RIVAL_MIN_FREE_SLOTS } from '../config/balance';
import { freeLicenses } from './licenses';
import { createInitialState } from './newGame';
import { unlockAll } from './unlocks';
import { expandRivals, payRival, refreshRivalShows, rivalCeiling, rivalHosts, rivalPurse, rivalStance, rivalValue, rivalryWaits, shareAgainst, updateRivalry } from './rivals';
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
