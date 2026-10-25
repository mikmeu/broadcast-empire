import { describe, expect, it } from 'vitest';
import { OWN_EVENT_LIMITS, THEME_WEEKS, THEME_WEEK_LIMITS } from '../config/balance';
import { getGenre } from '../config/genres';
import { bookThemeWeek, cancelThemeWeek, type ActionResult } from './actions';
import { sensibleBot } from './bots';
import { channelRegions, slotFactors } from './broadcast';
import { toCalendarDate, toDay } from './calendar';
import { runCheat } from './cheats';
import { sportsEventIn } from './events';
import { createInitialState } from './newGame';
import { campaignStart } from './politics';
import { fromSaveFile, SAVE_VERSION, toSaveFile } from './save';
import type { GameState } from './state';
import { runThemeWeeks, themeWeekBlocker, themeWeekCost, nextBookableDay } from './themeWeekBooking';
import { mondayOf, rivalWeeksBetween, themeWeekAppeal, themeWeekOn } from './themeWeeks';
import { advance } from './tick';
import { unlockAll } from './unlocks';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
const error = (result: ActionResult) => (result.ok ? 'no error' : result.error);

/** The sensible bot's radio station after a week on the air, with money to spend. */
function station(): GameState {
  const s = structuredClone(advance(unlockAll(sensibleBot(createInitialState(1))), 8));
  s.money = 2_000_000;
  return s;
}

const top40 = getGenre('top40');
const news = getGenre('news');
const sports = getGenre('sportsCommentary');

describe('theme weeks (#180)', () => {
  it('are paid when booked, per region, and cancelled in full before they start', () => {
    const s = station();
    const id = s.channels[0]!.id;
    const monday = nextBookableDay(s);
    expect(toCalendarDate(monday).weekday).toBe(1);
    const cost = THEME_WEEKS.hitList.costPerRegion * channelRegions(s, id).length;
    expect(themeWeekCost(s, id, 'hitList')).toBe(cost);

    const booked = ok(bookThemeWeek(s, id, 'hitList', monday));
    expect(s.money - booked.money).toBe(cost);
    expect(booked.ledger.events - s.ledger.events).toBe(cost);
    expect(booked.themeWeeks).toMatchObject([{ channelId: id, kind: 'hitList', startDay: monday, paid: cost }]);

    const cancelled = ok(cancelThemeWeek(booked, booked.themeWeeks[0]!.id));
    expect(cancelled.money).toBe(s.money);
    expect(cancelled.ledger.events).toBe(s.ledger.events);
    expect(cancelled.themeWeeks).toEqual([]);
    expect(error(cancelThemeWeek({ ...booked, day: monday }, booked.themeWeeks[0]!.id))).toMatch(/started/);
  });

  it('can’t be booked when the rules say no', () => {
    const s = station();
    const id = s.channels[0]!.id;
    const monday = nextBookableDay(s);
    expect(themeWeekBlocker(s, id, 'hitList', monday)).toBeNull();
    expect(error(bookThemeWeek(s, id, 'hitList', monday + 1))).toMatch(/Monday/);
    expect(error(bookThemeWeek(s, id, 'hitList', mondayOf(s.day)))).toMatch(/future/);
    expect(error(bookThemeWeek(s, id, 'hitList', monday + 7 * 60))).toMatch(/year ahead/);
    expect(error(bookThemeWeek({ ...s, money: 100 }, id, 'hitList', monday))).toMatch(/Not enough money/);
    expect(error(bookThemeWeek({ ...s, licenses: [] }, id, 'hitList', monday))).toMatch(/off the air/);
    expect(error(bookThemeWeek(s, 'nope', 'hitList', monday))).toMatch(/doesn’t exist/);

    const tv = structuredClone(s);
    tv.channels[0]!.medium = 'tv';
    expect(error(bookThemeWeek(tv, id, 'hitList', monday))).toMatch(/radio/);

    const one = ok(bookThemeWeek(s, id, 'hitList', monday));
    expect(error(bookThemeWeek(one, id, 'game', monday))).toMatch(/overlaps/);
    expect(bookThemeWeek(one, id, 'game', monday + 7).ok).toBe(true);
  });

  it('are two a calendar year per channel', () => {
    const s = station();
    const id = s.channels[0]!.id;
    const year = toCalendarDate(s.day).year;
    // Three Mondays in the same calendar year, weeks apart (the third refused), and one in the next.
    const mondays = [0, 1, 2].map((i) => nextBookableDay(s) + 7 * 4 * i);
    expect(new Set(mondays.map((m) => toCalendarDate(m).year))).toEqual(new Set([year]));
    let state = ok(bookThemeWeek(s, id, 'hitList', mondays[0]!));
    state = ok(bookThemeWeek(state, id, 'game', mondays[1]!));
    expect(error(bookThemeWeek(state, id, 'hitList', mondays[2]!))).toMatch(new RegExp(`${THEME_WEEK_LIMITS.perYear} theme weeks in ${year}`));
    const nextJan = toDay(year + 1, 1, 1);
    const nextYearMonday = nextJan + ((8 - toCalendarDate(nextJan).weekday) % 7);
    if (nextYearMonday <= state.day + 365) expect(bookThemeWeek(state, id, 'hitList', nextYearMonday).ok).toBe(true);
  });

  it('need an event for a special', () => {
    const s = station();
    const id = s.channels[0]!.id;
    const quiet = nextBookableDay(s);
    expect(error(bookThemeWeek(s, id, 'special', quiet))).toMatch(/election campaign/);
    // The campaign of the next election, whenever it is, or the sports event of that year.
    const campaign = mondayOf(campaignStart(s.politics) + 7);
    const withCampaign = { ...s, day: campaign - 14 };
    expect(themeWeekBlocker(withCampaign, id, 'special', campaign)).toBeNull();
    const cup = sportsEventIn(1974)!;
    const cupMonday = mondayOf(cup.startDay) + 7;
    expect(themeWeekBlocker({ ...s, day: cupMonday - 14 }, id, 'special', cupMonday)).toBeNull();
  });

  it('lift only the shows they name, and only in their week', () => {
    const s = station();
    const id = s.channels[0]!.id;
    const monday = nextBookableDay(s);
    const hit = ok(bookThemeWeek(s, id, 'hitList', monday));
    const during = (state: GameState, day: number) => ({ ...state, day });

    expect(themeWeekAppeal(during(hit, monday - 1), id, top40)).toBe(1);
    expect(themeWeekAppeal(during(hit, monday), id, top40)).toBe(THEME_WEEKS.hitList.lift);
    expect(themeWeekAppeal(during(hit, monday + 6), id, top40)).toBe(THEME_WEEKS.hitList.lift);
    expect(themeWeekAppeal(during(hit, monday + 7), id, top40)).toBe(1);
    expect(themeWeekAppeal(during(hit, monday), id, news)).toBe(1);

    const game = ok(bookThemeWeek(s, id, 'game', monday));
    expect(themeWeekAppeal(during(game, monday + 2), id, news)).toBe(THEME_WEEKS.game.lift);
    expect(themeWeekAppeal(during(game, monday + 2), id, top40)).toBe(THEME_WEEKS.game.lift);
  });

  it('lift an event special’s shows: news in a campaign, sport in a World Cup', () => {
    const s = station();
    const id = s.channels[0]!.id;
    const campaign = mondayOf(campaignStart(s.politics) + 7);
    const election = ok(bookThemeWeek({ ...s, day: campaign - 14 }, id, 'special', campaign));
    const on = { ...election, day: campaign + 1 };
    expect(themeWeekAppeal(on, id, news)).toBe(THEME_WEEKS.special.lift);
    expect(themeWeekAppeal(on, id, top40)).toBe(1);
    expect(themeWeekAppeal(on, id, sports)).toBe(1);

    const cup = sportsEventIn(1974)!;
    const cupMonday = mondayOf(cup.startDay) + 7;
    const sport = ok(bookThemeWeek({ ...s, day: cupMonday - 14 }, id, 'special', cupMonday));
    expect(themeWeekAppeal({ ...sport, day: cupMonday + 1 }, id, sports)).toBe(THEME_WEEKS.special.lift);
  });

  it('show up in the schedule’s factors, so the arrows can explain the jump', () => {
    const s = station();
    const id = s.channels[0]!.id;
    const monday = nextBookableDay(s);
    const booked = ok(bookThemeWeek(s, id, 'game', monday));
    const plain = slotFactors({ ...booked, day: monday - 1 }, id).find((f) => f)!;
    const lifted = slotFactors({ ...booked, day: monday }, id).find((f) => f)!;
    expect(lifted.bonus / plain.bonus).toBeCloseTo(THEME_WEEKS.game.lift);
  });

  it('start and end with an e-mail from the channel manager, and leave a little reputation', () => {
    const s = station();
    const id = s.channels[0]!.id;
    const monday = nextBookableDay(s);
    const booked = ok(bookThemeWeek(s, id, 'hitList', monday));
    const region = channelRegions(booked, id)[0]!;
    const before = booked.channels[0]!.reputation[region] ?? 0;

    const started = structuredClone({ ...booked, day: monday });
    runThemeWeeks(started);
    expect(started.messages.some((m) => /hit list week begins/.test(m.text))).toBe(true);
    expect(started.headlines.some((h) => /hit list week/.test(h.text))).toBe(true);

    const ended = structuredClone({ ...booked, day: monday + 7 });
    runThemeWeeks(ended);
    expect(ended.channels[0]!.reputation[region]).toBeCloseTo(Math.min(OWN_EVENT_LIMITS.maxReputation, before + THEME_WEEKS.hitList.reputation));
    expect(ended.messages.some((m) => /hit list week on .* is over/.test(m.text))).toBe(true);

    const capped = structuredClone({ ...booked, day: monday + 7 });
    capped.channels[0]!.reputation[region] = OWN_EVENT_LIMITS.maxReputation;
    runThemeWeeks(capped);
    expect(capped.channels[0]!.reputation[region]).toBe(OWN_EVENT_LIMITS.maxReputation);
  });

  it('are played through by the game: the lift comes and goes with the days', () => {
    const s = station();
    const id = s.channels[0]!.id;
    const monday = nextBookableDay(s);
    let state = ok(bookThemeWeek(s, id, 'game', monday));
    state = advance(state, monday - state.day + 1);
    expect(themeWeekOn(state, id)?.kind).toBe('game');
    state = advance(state, 7);
    expect(themeWeekOn(state, id)).toBeNull();
    expect(state.messages.some((m) => /game week on .* is over/.test(m.text))).toBe(true);
  });

  it('keep only this calendar year’s and last year’s', () => {
    const s = station();
    const id = s.channels[0]!.id;
    const old = structuredClone({ ...s, day: toDay(1973, 6, 1) });
    old.themeWeeks = [
      { id: 'a', channelId: id, kind: 'game', startDay: toDay(1971, 3, 1), paid: 1 },
      { id: 'b', channelId: id, kind: 'game', startDay: toDay(1972, 3, 6), paid: 1 },
    ];
    runThemeWeeks(old);
    expect(old.themeWeeks.map((w) => w.id)).toEqual(['b']);
  });
});

describe('the rivals’ theme weeks (#180)', () => {
  it('are two Mondays a year per radio channel, one in each half, from a hash', () => {
    const s = station();
    const year = toCalendarDate(s.day).year;
    const weeks = rivalWeeksBetween(s, toDay(year, 1, 1), toDay(year + 1, 1, 1));
    const channels = s.rivals.flatMap((r) => r.channels).filter((c) => c.medium === 'radio');
    expect(channels.length).toBeGreaterThan(0);
    expect(weeks).toHaveLength(channels.length * 2);
    for (const channel of channels) {
      const mine = weeks.filter((w) => w.channelId === channel.id);
      expect(mine).toHaveLength(2);
      expect(mine.every((w) => toCalendarDate(w.startDay).weekday === 1)).toBe(true);
      expect(mine[0]!.startDay).toBeLessThan(toDay(year, 7, 1));
      expect(mine[1]!.startDay).toBeGreaterThanOrEqual(toDay(year, 6, 24));
    }
    // The same game gives the same weeks; another seed gives others.
    expect(rivalWeeksBetween(structuredClone(s), toDay(year, 1, 1), toDay(year + 1, 1, 1))).toEqual(weeks);
    expect(rivalWeeksBetween({ ...createInitialState(2) }, toDay(year, 1, 1), toDay(year + 1, 1, 1)).map((w) => w.startDay)).not.toEqual(weeks.map((w) => w.startDay));
  });

  it('lift the rival’s shows in that week only, with a hit list on a music channel', () => {
    const s = station();
    const year = toCalendarDate(s.day).year;
    const [week] = rivalWeeksBetween(s, toDay(year, 1, 1), toDay(year + 1, 1, 1));
    const spec = THEME_WEEKS[week!.kind];
    const channel = s.rivals.flatMap((r) => r.channels).find((c) => c.id === week!.channelId)!;
    const genre = getGenre(channel.schedule[0]!.genre);
    const on = (day: number) => themeWeekAppeal({ ...s, day }, week!.channelId, genre);
    expect(on(week!.startDay - 1)).toBe(1);
    expect(on(week!.startDay + 3)).toBe(week!.kind === 'hitList' && genre.group !== 'Music' ? 1 : spec.lift);
    expect(on(week!.startDay + 7)).toBe(1);
    const music = channel.schedule.filter((x) => getGenre(x.genre).group === 'Music').length * 2 >= channel.schedule.length;
    if (music) expect(week!.kind).toBe('hitList');
  });

  it('are announced by Penny a week ahead, and in the headlines when they start', () => {
    const s = station();
    const year = toCalendarDate(s.day).year;
    const [week] = rivalWeeksBetween(s, toDay(year, 1, 1), toDay(year + 1, 1, 1));
    const ahead = structuredClone({ ...s, day: week!.startDay - 7 });
    runThemeWeeks(ahead);
    const mail = ahead.messages.find((m) => /week coming up/.test(m.text));
    expect(mail).toBeDefined();
    expect(mail!.from.name).toMatch(/Penny/);
    const today = structuredClone({ ...s, day: week!.startDay });
    runThemeWeeks(today);
    expect(today.headlines.some((h) => /starts a .* week/.test(h.text))).toBe(true);
  });

  it('do not touch the game’s stream of random numbers', () => {
    const s = station();
    const a = advance(s, 40);
    const b = advance({ ...structuredClone(s), themeWeeks: [] }, 40);
    expect(a.rngState).toBe(b.rngState);
  });
});

describe('saving theme weeks (#180)', () => {
  it('goes to the current version, and a save from before has none booked', () => {
    const s = station();
    const old = JSON.parse(JSON.stringify(toSaveFile(s, 0)));
    delete old.state.themeWeeks;
    old.version = 54;
    const { version, state } = fromSaveFile(old);
    expect(version).toBe(SAVE_VERSION);
    expect(state.themeWeeks).toEqual([]);

    const booked = ok(bookThemeWeek(s, s.channels[0]!.id, 'game', nextBookableDay(s)));
    expect(fromSaveFile(JSON.parse(JSON.stringify(toSaveFile(booked, 0)))).state.themeWeeks).toEqual(booked.themeWeeks);
  });

  it('moves with the calendar when the year cheat is used', () => {
    const s = station();
    const monday = nextBookableDay(s);
    const booked = ok(bookThemeWeek(s, s.channels[0]!.id, 'game', monday));
    const result = runCheat(booked, 'year 1990');
    if (!result.ok) throw new Error(result.error);
    expect(result.state.themeWeeks[0]!.startDay - result.state.day).toBe(monday - booked.day);
  });
});
