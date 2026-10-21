import { describe, expect, it } from 'vitest';
import { AUCTION, EVENTS, MAX_HEADLINES, POACH, SPORTS_RIGHTS } from '../config/balance';
import { RECESSIONS } from '../config/events';
import { getGenre } from '../config/genres';
import { AUDIENCES } from '../config/world';
import { createShow, declinePoachOffer, matchPoachOffer, placeRightsBid, poachHost, withdrawRightsBid, type ActionResult } from './actions';
import { rightsBonus, simulateDay, talksOnly } from './broadcast';
import { sensibleBot, tvBot } from './bots';
import { toCalendarDate, toDay } from './calendar';
import { adRateFactor, electionOn, eventAppeal, eventContext, recessionIn, rightsReserve, sportsEventIn, sportsEventOn } from './events';
import { createInitialState } from './newGame';
import { catchUpElections } from './politics';
import { slow } from './slow';
import { unlockAll } from './unlocks';
import { poachCooldown, poachTargets, rivalHostSkill } from './poaching';
import { fromSaveFile, SAVE_VERSION } from './save';
import { PLAYER, type GameState } from './state';
import { advance, tick } from './tick';
import { audienceShare } from './world';

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

const playerDay = (s: GameState) => simulateDay(s).channels.find((c) => c.isPlayer)!;
const newsSlot = (s: GameState) => playerDay(s).slots.find((slot) => s.shows.find((x) => x.id === slot.showId)?.genre === 'news')!;

describe('the calendar', () => {
  it('holds a World Cup or the Olympics every other year from 1970', () => {
    expect(sportsEventIn(1970)).toMatchObject({ id: 'worldCup-1970', name: 'World Cup 1970' });
    expect(sportsEventIn(1971)).toBeNull();
    expect(sportsEventIn(1972)?.kind).toBe('olympics');
    expect(sportsEventIn(2026)?.kind).toBe('worldCup');
    expect(sportsEventOn(toDay(1970, 6, 9))).toBeNull();
    expect(sportsEventOn(toDay(1970, 6, 10))?.id).toBe('worldCup-1970');
    expect(sportsEventOn(toDay(1970, 7, 10))).toBeNull();
  });

  it('has the first election campaign in May 1971 and a recession in set years', () => {
    const on = (year: number, month: number, dayOfMonth: number) => electionOn({ ...createInitialState(1), day: toDay(year, month, dayOfMonth) });
    expect(on(1971, 4, 30)).toBe(false);
    expect(on(1971, 5, 15)).toBe(true);
    expect(on(1971, 6, 1)).toBe(false);
    expect(adRateFactor(toDay(1974, 3, 1))).toBe(EVENTS.recessionAdRate);
    expect(adRateFactor(toDay(1975, 3, 1))).toBe(1);
  });

  it('gives every decade sports events, elections and a recession', () => {
    const world = { ...createInitialState(1), day: toDay(2030, 1, 1) };
    catchUpElections(world);
    for (let decade = 1970; decade <= 2020; decade += 10) {
      const years = Array.from({ length: 10 }, (_, i) => decade + i);
      expect(years.filter((y) => sportsEventIn(y)).length).toBeGreaterThanOrEqual(4);
      expect(world.politics.history.filter((e) => years.includes(toCalendarDate(e.day).year)).length).toBeGreaterThanOrEqual(2);
      expect(RECESSIONS.some((r) => years.includes(r.year))).toBe(true);
    }
  });

  it('audience shares shift over the decades and always add up to 1', () => {
    expect(audienceShare('seniors', 0)).toBeCloseTo(0.18);
    expect(audienceShare('seniors', toDay(2030, 1, 1))).toBeCloseTo(0.22);
    expect(audienceShare('teens', toDay(2000, 1, 1))).toBeLessThan(0.12);
    for (const year of [1970, 1990, 2010, 2030, 2040]) {
      expect(AUDIENCES.reduce((sum, a) => sum + audienceShare(a.id, toDay(year, 1, 1)), 0)).toBeCloseTo(1);
    }
  });
});

describe('what events do', () => {
  it('news shows draw more during an election campaign', () => {
    const campaign = station(1971, 5, 15);
    const normal = station(1971, 4, 15);
    expect(newsSlot(campaign).listeners).toBeGreaterThan(newsSlot(normal).listeners * 1.05);
    const top40 = getGenre('top40');
    expect(eventAppeal(eventContext(campaign), top40, PLAYER)).toBe(1);
    expect(eventAppeal(eventContext(campaign), getGenre('tvNews'), 'r1')).toBe(EVENTS.electionNewsAppeal);
  });

  it('radio sports draw more for everyone during a World Cup; TV sports only for the rights holder', () => {
    const s = station(1970, 6, 20);
    const context = eventContext(s);
    expect(eventAppeal(context, getGenre('sportsCommentary'), PLAYER)).toBe(EVENTS.sportsAppeal);
    expect(eventAppeal(context, getGenre('sportsCommentary'), 'r1')).toBe(EVENTS.sportsAppeal);
    expect(eventAppeal(context, getGenre('tvSports'), PLAYER)).toBe(1);
    s.eventRights.push({ eventId: 'worldCup-1970', holderId: PLAYER });
    expect(eventAppeal(eventContext(s), getGenre('tvSports'), PLAYER)).toBe(EVENTS.sportsAppeal);
    expect(eventAppeal(eventContext(s), getGenre('tvSports'), 'r1')).toBe(1);
    expect(eventAppeal(eventContext(station(1970, 8, 1)), getGenre('sportsCommentary'), PLAYER)).toBe(1);
  });

  it('a recession cuts ad revenue by a fifth', () => {
    const revenue = (s: GameState) => playerDay(s).slots.reduce((sum, slot) => sum + slot.revenue, 0);
    const listeners = (s: GameState) => playerDay(s).slots.reduce((sum, slot) => sum + slot.listeners, 0);
    const boom = station(1973, 3, 1);
    const bust = station(1974, 3, 1);
    expect(recessionIn(1974)).toBeDefined();
    expect(revenue(bust) / listeners(bust)).toBeCloseTo((revenue(boom) / listeners(boom)) * EVENTS.recessionAdRate, 2);
  });
});

describe('event rights', () => {
  const worldCup = sportsEventIn(1970)!;
  /** The day the World Cup 1970 auction opens. */
  const atAuction = () => {
    const s = station();
    s.day = worldCup.startDay - EVENTS.auctionLeadDays - 1;
    return tick(s);
  };

  it('go to auction before the event', () => {
    const s = atAuction();
    expect(s.rightsAuctions).toHaveLength(1);
    expect(s.rightsAuctions[0]).toMatchObject({ eventId: 'worldCup-1970', reserve: rightsReserve('worldCup', 1970), endsOn: s.day + AUCTION.days });
    expect(rightsReserve('worldCup', 2000)).toBeGreaterThan(rightsReserve('worldCup', 1970));
    expect(s.headlines.at(-1)!.text).toMatch(/World Cup 1970 go to auction/);
  });

  it('refuse bids below the reserve or above your money', () => {
    const s = atAuction();
    const auction = s.rightsAuctions[0]!;
    expect(error(placeRightsBid(s, auction.id, auction.reserve - 1))).toMatch(/reserve/);
    expect(error(placeRightsBid(s, auction.id, s.money + 1))).toMatch(/more than you have/);
    const bid = ok(placeRightsBid(s, auction.id, auction.reserve));
    expect(bid.rightsAuctions[0]!.bid).toBe(auction.reserve);
    expect(ok(withdrawRightsBid(bid, auction.id)).rightsAuctions[0]!.bid).toBeNull();
  });

  it('the highest bid wins and only the winner pays', () => {
    const s = atAuction();
    const auction = s.rightsAuctions[0]!;
    const won = advance(ok(placeRightsBid(s, auction.id, 900_000)), AUCTION.days);
    expect(won.rightsAuctions).toHaveLength(0);
    expect(won.eventRights).toEqual([{ eventId: 'worldCup-1970', holderId: PLAYER }]);
    expect(won.monthlyReports.reduce((sum, r) => sum + r.content, won.ledger.content)).toBe(900_000);

    const lost = advance(s, AUCTION.days);
    expect(lost.eventRights.every((r) => r.holderId !== PLAYER)).toBe(true);
    expect(lost.ledger.content + lost.monthlyReports.reduce((sum, r) => sum + r.content, 0)).toBe(0);
  });

  it('let the player show the event on TV sports without other rights', () => {
    const before = ok(createShow(station(1970, 6, 1), { name: 'World Cup Tonight', genre: 'tvSports', hostId: null, staffIds: [], studioId: null }));
    before.eventRights.push({ eventId: 'worldCup-1970', holderId: PLAYER });
    const sports = getGenre('tvSports');
    expect(talksOnly(before, sports)).toBe(true);
    expect(rightsBonus(before, sports)).toBe(SPORTS_RIGHTS.talkOnly);
    const during = { ...before, day: toDay(1970, 6, 20) };
    expect(talksOnly(during, sports)).toBe(false);
    expect(rightsBonus(during, sports)).toBe(1);
  });

  it('a rival that holds them shows the event live in the evening', () => {
    const s = station(1970, 6, 20);
    const rival = s.rivals.find((r) => r.channels.some((c) => c.medium === 'tv'))!;
    const tv = rival.channels.find((c) => c.medium === 'tv')!;
    const usual = simulateDay(s).channels.find((c) => c.channelId === tv.id)!.slots[EVENTS.rivalSlot]!;
    s.eventRights.push({ eventId: 'worldCup-1970', holderId: rival.id });
    const live = simulateDay(s).channels.find((c) => c.channelId === tv.id)!.slots[EVENTS.rivalSlot]!;
    expect(usual.programName).not.toMatch(/Live/);
    expect(live.programName).toBe('World Cup 1970 Live');
    expect(live.listeners).toBeGreaterThan(usual.listeners);
  });

  it('expire when the event is over', () => {
    const s = station(1970, 7, 9);
    s.eventRights.push({ eventId: 'worldCup-1970', holderId: PLAYER });
    expect(tick(s).eventRights).toHaveLength(0);
  });
});

describe('headlines', () => {
  it('reports new technology, events and the economy, and keeps only the latest headlines', () => {
    const s = advance(station(1971, 12, 31), 1);
    expect(s.headlines.at(-1)!.text).toMatch(/New in 1972: FM stereo/);
    const later = advance(station(1973, 12, 1), 400);
    expect(later.headlines.length).toBeLessThanOrEqual(MAX_HEADLINES);
    const texts = later.headlines.map((h) => h.text).join('\n');
    expect(texts).toMatch(/oil crisis hits the economy/);
    expect(texts).toMatch(/World Cup 1974 begins/);
    expect(advance(station(1974, 12, 31), 1).headlines.some((h) => /economy recovers/.test(h.text))).toBe(true);
  });
});

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

describe('saves from Phase 4b', () => {
  it('upgrade with named rival hosts and no events in progress', () => {
    const s = structuredClone(unlockAll(sensibleBot(createInitialState(1)))) as unknown as Record<string, unknown> & GameState;
    for (const key of ['rightsAuctions', 'eventRights', 'poachOffers', 'lastPoachDay', 'headlines']) delete (s as Record<string, unknown>)[key];
    for (const show of s.rivals.flatMap((r) => r.channels).flatMap((c) => c.schedule)) delete (show as unknown as Record<string, unknown>).hostName;
    const { state, version } = fromSaveFile({ version: 6, savedAt: 1, state: s });
    expect(version).toBe(SAVE_VERSION);
    expect(state.headlines).toEqual([]);
    expect(state.lastPoachDay).toBeNull();
    const shows = state.rivals.flatMap((r) => r.channels).flatMap((c) => c.schedule);
    expect(shows.every((x) => (getGenre(x.genre).kind === 'produced') === (x.hostName !== ''))).toBe(true);
    expect(tick(state).day).toBe(1);
  });
});

// --- Phase 4c acceptance (prompt.md section 14) ---

describe('Phase 4c acceptance', () => {
  it('a full 1970–2030 game is playable, and every decade has its own events', () => {
    let s = unlockAll(createInitialState(1));
    const end = toDay(2030, 1, 1);
    const news = new Map<number, string[]>();
    let seen = 0;
    let offers = 0;
    let lastOffer = '';
    while (s.day < end && !s.bankrupt) {
      s = tick(tvBot(s));
      for (const h of s.headlines.filter((x) => x.day === s.day)) {
        const decade = Math.floor(toCalendarDate(h.day).year / 10) * 10;
        news.set(decade, [...(news.get(decade) ?? []), h.text]);
        seen += 1;
      }
      const offer = s.poachOffers[0]?.id ?? '';
      if (offer && offer !== lastOffer) offers += 1;
      lastOffer = offer || lastOffer;
    }
    expect(s.bankrupt).toBe(false);
    expect(s.day).toBe(end);
    expect(Number.isFinite(s.money)).toBe(true);
    expect(seen).toBeGreaterThan(150);
    expect(offers).toBeGreaterThan(3);
    for (let decade = 1970; decade <= 2020; decade += 10) {
      const texts = news.get(decade)!.join('\n');
      expect(texts).toMatch(/World Cup \d{4} begins/);
      expect(texts).toMatch(/Olympics \d{4} begins/);
      expect(texts).toMatch(/TV rights to the/);
      expect(texts).toMatch(/election campaign/);
      expect(texts).toMatch(/hits the economy/);
      expect(texts).toMatch(new RegExp(`New in ${String(decade).slice(0, 3)}\\d:`));
    }
  }, slow(300_000));
});
