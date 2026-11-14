import { describe, expect, it } from 'vitest';
import { POACH, RIVALRY } from '../config/balance';
import { getGenre } from '../config/genres';
import { declinePoachOffer, matchPoachOffer, poachHost, type ActionResult } from './actions';
import { sensibleBot } from './bots';
import { toDay } from './calendar';
import { createInitialState } from './newGame';
import { unlockAll } from './unlocks';
import { hostGivesNotice, poachCooldown, poachTargets, rivalHostSkill, rivalPoachAttempt } from './poaching';
import type { GameState } from './state';
import { advance, tick } from './tick';
import { withoutRecordRooms } from './fixtures';
import { Rng } from './rng';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
const error = (result: ActionResult) => (result.ok ? 'no error' : result.error);

/** The sensible bot's station, moved to a date, with money to spend. */
function station(year = 1970, month = 1, dayOfMonth = 1): GameState {
  const s = structuredClone(unlockAll(sensibleBot(createInitialState(1))));
  s.day = toDay(year, month, dayOfMonth);
  s.money = 1_000_000;
  return s;
}

describe('host poaching', () => {
  /** A station with one famous host, played until a rival makes them an offer. */
  function withOffer(): GameState {
    let s = station();
    const star = s.employees.find((e) => e.role === 'host')!.id;
    for (let i = 0; i < 3_000 && s.poachOffers.length === 0; i++) {
      for (const e of s.employees) if (e.role === 'host') e.fame = e.id === star ? 90 : 0;
      s = tick(s);
    }
    return s;
  }

  it('rivals make famous hosts an offer the player can match', () => {
    const s = withOffer();
    const offer = s.poachOffers[0]!;
    const host = s.employees.find((e) => e.id === offer.hostId)!;
    expect(host.fame).toBeGreaterThanOrEqual(POACH.minFame);
    expect(offer.salary).toBeGreaterThan(host.salary);
    expect(offer.expiresOn).toBe(s.day + POACH.answerDays);
    expect(s.messages.some((m) => m.kind === 'danger' && m.text.includes(host.name))).toBe(true);

    const kept = ok(matchPoachOffer(s, offer.id));
    expect(kept.poachOffers).toHaveLength(0);
    expect(kept.employees.find((e) => e.id === host.id)!.salary).toBe(offer.salary);
    expect(advance(kept, POACH.answerDays + 1).employees.some((e) => e.id === host.id)).toBe(true);
  });

  it('a host whose offer isn’t matched works out a month’s notice, then leaves for the rival', () => {
    const s = withOffer();
    const offer = s.poachOffers[0]!;
    const host = s.employees.find((e) => e.id === offer.hostId)!;
    const hosted = s.shows.filter((x) => x.hostId === host.id).map((x) => x.id);
    expect(hosted.length).toBeGreaterThan(0);
    expect(advance(s, POACH.answerDays - 1).employees.some((e) => e.id === host.id)).toBe(true);

    for (const signed of [advance(s, POACH.answerDays), ok(declinePoachOffer(s, offer.id))]) {
      // Signed, and still presenting until the notice is over (0.14.0).
      expect(signed.poachOffers).toHaveLength(0);
      const leaving = signed.employees.find((e) => e.id === host.id)!;
      expect(leaving.leaving).toEqual({ on: expect.any(Number), rivalId: offer.rivalId });
      expect(leaving.leaving!.on - signed.day).toBeGreaterThanOrEqual(POACH.noticeDays - 1);
      expect(signed.shows.filter((x) => hosted.includes(x.id)).every((x) => x.hostId === host.id)).toBe(true);
      expect(signed.messages.some((m) => m.text.includes('works out the month'))).toBe(true);
      expect(advance(signed, POACH.noticeDays - 2).employees.some((e) => e.id === host.id)).toBe(true);

      const gone = advance(signed, POACH.noticeDays);
      expect(gone.employees.some((e) => e.id === host.id)).toBe(false);
      expect(gone.poachOffers).toHaveLength(0);
      expect(gone.shows.filter((x) => hosted.includes(x.id)).every((x) => x.hostId === null)).toBe(true);
      const rival = gone.rivals.find((r) => r.id === offer.rivalId)!;
      expect(rival.channels.flatMap((c) => c.schedule).some((x) => x.hostName === host.name)).toBe(true);
    }
  });

  it('the player can sign a rival host for a fee, once a season', () => {
    const s = station();
    const targets = poachTargets(s);
    expect(targets.length).toBeGreaterThan(10);
    expect(targets.every((t) => getGenre(t.show.genre).kind === 'produced' && t.show.hostName !== '')).toBe(true);
    const target = targets[0]!;
    expect(target.skill).toBe(rivalHostSkill(target.show, s));
    expect(target.fee).toBe(target.salary * POACH.signingMonths);

    const signed = ok(poachHost(s, target.channel.id, target.slot));
    const host = signed.employees.at(-1)!;
    expect(host).toMatchObject({ name: target.show.hostName, role: 'host', skill: target.skill, fame: target.show.hostFame, salary: target.salary, specialties: [target.show.genre] });
    expect(s.money - signed.money).toBe(target.fee);
    const left = signed.rivals.find((r) => r.id === target.rival.id)!.channels.find((c) => c.id === target.channel.id)!.schedule[target.slot]!;
    expect(left.hostName).not.toBe(target.show.hostName);
    expect(left.quality).toBeCloseTo(target.show.quality * POACH.rivalLoss);

    const other = poachTargets(signed)[0]!;
    expect(poachCooldown(signed)).toBe(POACH.cooldownDays);
    expect(error(poachHost(signed, other.channel.id, other.slot))).toMatch(/Word gets around/);
    const later = { ...signed, day: signed.day + POACH.cooldownDays };
    expect(poachHost(later, other.channel.id, other.slot).ok).toBe(true);
    expect(error(poachHost({ ...s, money: 0 }, target.channel.id, target.slot))).toMatch(/Not enough money/);
  });
});

describe('rivals poach on purpose (#413)', () => {
  /** A radio channel of yours with two famous hosts (one on a quiet show, one on a big one), a weekly report, and every rival's radio channel meeting it. */
  function aimed(roll = 0) {
    const s = station(1980, 2, 1);
    const first = s.employees.find((e) => e.role === 'host')!;
    const second = { ...structuredClone(first), id: 'host-b', name: 'Bea Big' };
    s.employees.push(second);
    for (const h of [first, second]) Object.assign(h, { fame: 90, salary: 100, leaving: null, courtedOn: null });
    s.channels = [{ id: 'me', name: 'My Radio', medium: 'radio', managerId: null, schedule: ['a', 'b', null, null, null], reputation: {}, lastEvent: null, social: null, adMinutes: 10 } as never];
    s.shows = [
      { id: 'a', name: 'Quiet Hour', genre: 'top40', hostId: first.id, staffIds: [], writerIds: [], editorIds: [], studioId: null, quality: 0.8 },
      { id: 'b', name: 'Big Show', genre: 'top40', hostId: second.id, staffIds: [], writerIds: [], editorIds: [], studioId: null, quality: 0.8 },
    ] as never;
    s.licenses = [{ id: 'l', regionId: 'north', medium: 'radio', channelId: 'me', price: 0, expiresOn: 99999 } as never];
    for (const r of s.rivals) {
      r.rivalry = 0;
      for (const c of r.channels.filter((c) => c.medium === 'radio')) c.regionIds = ['north'];
    }
    const slot = (listeners: number) => ({ programName: 'x', listeners, share: 0 });
    s.weeklyReports = [
      { fromDay: s.day - 7, days: 7, channels: [{ channelId: 'me', name: 'My Radio', ownerId: 'player', isPlayer: true, medium: 'radio', slots: [slot(100), slot(900), slot(0), slot(0), slot(0)], regionListeners: {}, audienceListeners: {}, revenue: 0 }] as never },
    ];
    s.poachOffers = [];
    s.messages = [];
    const news = s.rivals.find((r) => r.personality === 'news')!;
    news.rivalry = 1;
    news.money = RIVALRY.startMoney.news * 2;
    let draws = 0;
    const rng = { next: () => (draws++, roll), int: (min: number) => min, pick: <T>(items: readonly T[]) => items[0]! } as unknown as Rng;
    return { s, news, first, second, rng, draws: () => draws };
  }

  it('an aimed offer picks the host whose shows take the most listeners, and draws only the roll', () => {
    const { s, news, second, rng, draws } = aimed();
    rivalPoachAttempt(s, rng);
    const offer = s.poachOffers[0]!;
    expect(offer).toMatchObject({ hostId: second.id, rivalId: news.id });
    expect(offer.fee).toBe(offer.salary * POACH.rivalFeeMonths);
    expect(draws()).toBe(1);
    const text = s.messages.at(-1)!.text;
    expect(text).toContain('signing fee');
    expect(text).toContain('Big Show');
  });

  it('the rival pays the fee from its money when the host gives notice', () => {
    const { s, news, rng } = aimed();
    rivalPoachAttempt(s, rng);
    const offer = s.poachOffers[0]!;
    const before = news.money;
    hostGivesNotice(s, offer);
    expect(news.money).toBe(before - offer.fee!);
    news.money = 10;
    const again = { ...offer, id: 'po-x' };
    s.poachOffers.push(again);
    hostGivesNotice(s, again);
    expect(news.money).toBe(0);
  });

  it('a rival that cannot pay makes no aimed offer', () => {
    const { s, news, rng } = aimed(0.2);
    news.money = 0;
    rivalPoachAttempt(s, rng);
    expect(s.poachOffers).toEqual([]);
  });

  it('a watching rival tries up to twice as often', () => {
    const roll = POACH.monthlyChance * 1.5;
    const full = aimed(roll);
    rivalPoachAttempt(full.s, full.rng);
    expect(full.s.poachOffers).toHaveLength(1);
    const half = aimed(roll);
    half.news.rivalry = RIVALRY.watch + 0.01;
    rivalPoachAttempt(half.s, half.rng);
    expect(half.s.poachOffers).toEqual([]);
  });

  it('a host whose offer you matched is left alone by every rival for restDays', () => {
    const { s, first, second, rng } = aimed();
    first.courtedOn = s.day - 10;
    second.courtedOn = s.day - 10;
    rivalPoachAttempt(s, rng);
    expect(s.poachOffers).toEqual([]);
    second.courtedOn = s.day - POACH.restDays;
    rivalPoachAttempt(s, rng);
    expect(s.poachOffers[0]!.hostId).toBe(second.id);
  });

  it('matching an offer starts the rest', () => {
    const { s, second, rng } = aimed();
    rivalPoachAttempt(s, rng);
    const kept = ok(matchPoachOffer(s, s.poachOffers[0]!.id));
    expect(kept.employees.find((e) => e.id === second.id)!.courtedOn).toBe(s.day);
  });

  it('a rival that ignores you keeps the old path, with its draws and no fee', () => {
    const { s, news, rng, draws } = aimed();
    news.rivalry = 0;
    rivalPoachAttempt(s, rng);
    expect(s.poachOffers).toHaveLength(1);
    expect(s.poachOffers[0]!.fee).toBeUndefined();
    expect(draws()).toBe(2);
  });
});

// From version014.
{
  /** A radio station from the sensible test player, a month on the air, with everything open, money to spare and two floors. */
  const station = (days = 30): GameState => {
    // Without the library and post room the bot keeps its records in (0.18.0): the tests below build rooms where the game proposes them.
    const s = structuredClone(withoutRecordRooms(unlockAll(advance(sensibleBot(createInitialState(1)), days))));
    s.money = 5_000_000;
    s.floorsUnlocked = 2;
    return s;
  };

  describe('version 0.14.0', () => {
    describe('a month’s notice (R107)', () => {
      it('a host who is leaving is not courted again', () => {
        const s = structuredClone(station());
        for (const host of s.employees.filter((e) => e.role === 'host')) {
          host.fame = 90;
          host.leaving = { on: s.day + POACH.noticeDays, rivalId: s.rivals[0]!.id };
        }
        // A roll that always says yes.
        const yes = { next: () => 0, int: (min: number) => min, pick: <T>(items: readonly T[]) => items[0]! } as unknown as Rng;
        rivalPoachAttempt(s, yes);
        expect(s.poachOffers).toEqual([]);
      });
    });
  });
}
