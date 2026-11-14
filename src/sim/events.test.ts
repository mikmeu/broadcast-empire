import { describe, expect, it } from 'vitest';
import { AUCTION, EVENTS, MAX_HEADLINES, RIVALRY, SPORTS_RIGHTS } from '../config/balance';
import { RECESSIONS } from '../config/events';
import { getGenre } from '../config/genres';
import { AUDIENCES } from '../config/world';
import { createShow, placeRightsBid, withdrawRightsBid, type ActionResult } from './actions';
import { rightsBonus, simulateDay, talksOnly } from './broadcast';
import { sensibleBot } from './bots';
import { toCalendarDate, toDay } from './calendar';
import { adRateFactor, electionOn, eventAppeal, eventContext, recessionIn, rightsReserve, sportsEventIn, sportsEventOn } from './events';
import { LINES } from '../config/guide';
import { guideView } from './guide';
import { createInitialState } from './newGame';
import { catchUpElections } from './politics';
import { unlockAll } from './unlocks';
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

  it('tell a company with a TV channel to bid on the Content screen, and one without that only TV can bid (#144)', () => {
    const mail = (state: GameState) => state.messages.find((m) => /up for auction/.test(m.text))!.text;
    const radio = atAuction();
    expect(mail(radio)).toMatch(/only a TV channel can bid/);
    expect(mail(radio)).not.toMatch(/bid on the Content screen/);
    const s = station();
    s.channels[0]!.medium = 'tv';
    s.day = worldCup.startDay - EVENTS.auctionLeadDays - 1;
    const tv = tick(s);
    expect(mail(tv)).toMatch(/bid on the Content screen/);
  });

  it('Penny points a TV sports show without rights to the Content screen, once (#144)', () => {
    // Not in the chapter on television, which would come first: Penny has not offered it.
    const everyLine = LINES.map((line) => line.id).filter((id) => id !== 'television');
    const base = { ...ok(createShow(station(1970, 6, 1), { name: 'Sport Special', genre: 'tvSports', hostId: null, staffIds: [], studioId: null })) };
    const s = { ...base, guide: { stage: 'on' as const, quiet: 0, seen: everyLine.filter((id) => id !== 'sports-rights') } };
    expect(guideView(s)).toMatchObject({ kind: 'hint', line: { id: 'sports-rights' } });
    expect(guideView({ ...s, guide: { ...s.guide, seen: everyLine } })).toBeNull();
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

  describe('what rivals can pay (#414)', () => {
    /** The auction closing tomorrow, with the money of every rival set. */
    function closing(money: number): GameState {
      const s = atAuction();
      s.rightsAuctions[0]!.endsOn = s.day + 1;
      for (const r of s.rivals) r.money = money;
      return s;
    }
    const tvMoney = (s: GameState) => s.rivals.filter((r) => r.channels.some((c) => c.medium === 'tv')).reduce((sum, r) => sum + r.money, 0);

    it('a rival with no money to spare does not bid', () => {
      const after = tick(closing(0));
      expect(after.eventRights.every((r) => r.holderId === PLAYER)).toBe(true);
    });

    it('a bid is capped by what the rival has to spare, and the winner pays it', () => {
      const s = closing(1_000_000);
      // Every rival has this much to spare: the cap is only just over the reserve.
      const reserve = s.rightsAuctions[0]!.reserve;
      for (const r of s.rivals) r.money = RIVALRY.startMoney[r.personality] * RIVALRY.shortBelow + reserve + 5_000;
      const before = tvMoney(s);
      const after = tick(s);
      const holder = after.eventRights.find((r) => r.eventId === 'worldCup-1970');
      // Rivals bid with chance 0.7 each: when one wins it paid the reserve or a little more, never more than the cap.
      if (holder) {
        expect(before - tvMoney(after)).toBeGreaterThanOrEqual(reserve - 1_000);
        expect(before - tvMoney(after)).toBeLessThanOrEqual(reserve + 5_000);
      }
    });

    it('draws the same random numbers with or without money', () => {
      expect(tick(closing(0)).rngState).toBe(tick(closing(50_000_000)).rngState);
    });
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
    // Breaking stories (0.20.0) make headlines too, so the oil crisis is looked for before a year of them pushes it out.
    const later = advance(station(1973, 12, 1), 200);
    expect(later.headlines.length).toBeLessThanOrEqual(MAX_HEADLINES);
    const texts = later.headlines.map((h) => h.text).join('\n');
    expect(texts).toMatch(/oil crisis hits the economy/);
    expect(texts).toMatch(/World Cup 1974 begins/);
    expect(advance(station(1974, 12, 31), 1).headlines.some((h) => /economy recovers/.test(h.text))).toBe(true);
  });
});
