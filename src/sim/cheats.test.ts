import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../config/office';
import { TECHS } from '../config/tech';
import { sensibleBot } from './bots';
import { EVENTS } from '../config/balance';
import { toCalendarDate, toDay } from './calendar';
import { CHEATS, CHEAT_LIMITS, runCheat, type CheatResult } from './cheats';
import { sportsEventIn } from './events';
import { createInitialState } from './newGame';
import { campaignStart } from './politics';
import type { GameState } from './state';
import { advance } from './tick';

function ok(result: CheatResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
const error = (result: CheatResult) => (result.ok ? null : result.error);

/** A company that has been on the air for a few weeks. */
const running = () => advance(sensibleBot(createInitialState(1)), 40);

describe('cheat codes (Phase 6b)', () => {
  it('adds and takes money, in the ways people type amounts', () => {
    const s = createInitialState(1);
    expect(ok(runCheat(s, 'money 50000')).money).toBe(s.money + 50_000);
    expect(ok(runCheat(s, 'MONEY 50.000')).money).toBe(s.money + 50_000);
    expect(ok(runCheat(s, '  money   50,000 ')).money).toBe(s.money + 50_000);
    expect(ok(runCheat(s, 'money 50k')).money).toBe(s.money + 50_000);
    expect(ok(runCheat(s, 'money 2m')).money).toBe(s.money + 2_000_000);
    expect(ok(runCheat(s, 'money -1000')).money).toBe(s.money - 1_000);
  });

  it('never changes the state it was given', () => {
    const s = running();
    const before = structuredClone(s);
    for (const { use } of CHEATS) runCheat(s, use);
    expect(s).toEqual(before);
  });

  it('answers every listed code, and lists them all under help', () => {
    const s = running();
    for (const { code, use } of CHEATS) {
      const result = runCheat(s, use);
      expect(result.ok, use).toBe(true);
      if (result.ok) expect(result.message.length, use).toBeGreaterThan(0);
      expect(ok(runCheat(s, 'help'))).toEqual(s);
      expect((runCheat(s, 'help') as { message: string }).message).toContain(code);
    }
  });

  it('explains what went wrong instead of guessing', () => {
    const s = createInitialState(1);
    expect(error(runCheat(s, ''))).toMatch(/help/);
    expect(error(runCheat(s, 'moneys 5'))).toMatch(/no code “moneys”/);
    expect(error(runCheat(s, 'money'))).toMatch(/number/);
    expect(error(runCheat(s, 'money lots'))).toMatch(/number/);
    expect(error(runCheat(s, 'year 1950'))).toMatch(/1970/);
    expect(error(runCheat(s, `year ${CHEAT_LIMITS.lastYear + 1}`))).toMatch(/from 1970/);
    expect(error(runCheat(s, 'research'))).toMatch(/research all/);
    expect(error(runCheat(s, 'reputation 80'))).toMatch(/no channel/);
  });

  it('moves the calendar to a year without ending anything early', () => {
    const s = running();
    const jumped = ok(runCheat(s, 'year 2000'));
    const shift = jumped.day - s.day;
    expect(toCalendarDate(jumped.day)).toMatchObject({ year: 2000, month: toCalendarDate(s.day).month, dayOfMonth: toCalendarDate(s.day).dayOfMonth });

    // Everything with a date moved along: licenses, contracts, staff and the history.
    expect(s.licenses.length).toBeGreaterThan(0);
    expect(jumped.licenses.map((l) => l.expiresOn - jumped.day)).toEqual(s.licenses.map((l) => l.expiresOn - s.day));
    expect(jumped.contracts.map((c) => c.endDay - jumped.day)).toEqual(s.contracts.map((c) => c.endDay - s.day));
    expect(jumped.employees.map((e) => e.hiredOn)).toEqual(s.employees.map((e) => e.hiredOn + shift));
    expect(jumped.politics.nextElection - jumped.day).toBe(s.politics.nextElection - s.day);
    // Furniture is no older for it, so it is worth what it was.
    const pieces = (state: GameState) => state.rooms.flatMap((r) => r.furniture);
    expect(pieces(s).length).toBeGreaterThan(0);
    expect(pieces(jumped).map((f) => jumped.day - f.boughtOn)).toEqual(pieces(s).map((f) => s.day - f.boughtOn));
    expect(jumped.headlines.map((h) => h.day)).toEqual(s.headlines.map((h) => h.day + shift));
    expect(s.monthlyReports.length).toBeGreaterThan(0);
    expect(jumped.monthlyReports.map((r) => r.year)).toEqual(s.monthlyReports.map((r) => r.year + 2000 - toCalendarDate(s.day).year));
    expect(jumped.money).toBe(s.money);

    // The game plays on from there, and the jump can be undone.
    const later = advance(jumped, 40);
    expect(later.bankrupt).toBe(false);
    expect(later.licenses).toHaveLength(s.licenses.length);
    expect(ok(runCheat(jumped, `year ${toCalendarDate(s.day).year}`))).toEqual(s);
  });

  it('plays days ahead exactly like waiting, up to a limit', () => {
    const s = running();
    expect(ok(runCheat(s, 'days 30'))).toEqual(advance(s, 30));
    expect(error(runCheat(s, 'days 0'))).toMatch(/number/);
    expect(error(runCheat({ ...s, bankrupt: true }, 'days 5'))).toMatch(/bankrupt/);
  });

  it('moves the calendar to the next event, which the game then reports', () => {
    const s = running();
    const kept = (jumped: GameState) => {
      expect(jumped.licenses.map((l) => l.expiresOn - jumped.day)).toEqual(s.licenses.map((l) => l.expiresOn - s.day - 1));
      expect(jumped.contracts.map((c) => c.endDay - jumped.day)).toEqual(s.contracts.map((c) => c.endDay - s.day - 1));
    };

    // The World Cup of the first year, on the day its TV rights go to auction; then the Olympics after it.
    const auction = ok(runCheat(s, 'event'));
    const worldCup = sportsEventIn(1970)!;
    expect(auction.day).toBe(worldCup.startDay - EVENTS.auctionLeadDays);
    expect(auction.rightsAuctions.map((a) => a.eventId)).toEqual([worldCup.id]);
    kept(auction);
    expect(ok(runCheat(auction, 'event')).rightsAuctions.map((a) => a.eventId)).toContain('olympics-1972');

    const olympics = ok(runCheat(s, 'event olympics'));
    expect(olympics.day).toBe(sportsEventIn(1972)!.startDay);
    expect(olympics.messages.some((m) => /Olympics 1972 has begun/.test(m.text))).toBe(true);
    kept(olympics);

    // The election stays where it was: the calendar goes to it.
    const campaign = ok(runCheat(s, 'event election'));
    expect(campaign.day).toBe(campaignStart(s.politics));
    expect(campaign.politics.nextElection).toBe(s.politics.nextElection);
    expect(campaign.messages.some((m) => /election campaign has begun/.test(m.text))).toBe(true);
    const polling = ok(runCheat(campaign, 'event election'));
    expect(polling.politics.history).toHaveLength(s.politics.history.length + 1);

    const recession = ok(runCheat(s, 'event recession'));
    expect(toCalendarDate(recession.day)).toMatchObject({ year: 1974, month: 1, dayOfMonth: 1 });
    expect(recession.messages.some((m) => /oil crisis has begun/.test(m.text))).toBe(true);

    expect(error(runCheat(ok(runCheat(s, 'year 2021')), 'event recession'))).toMatch(/2020/);
    expect(error(runCheat(ok(runCheat(s, `year ${CHEAT_LIMITS.lastYear}`)), 'event worldcup'))).toMatch(/after 2099/);
    expect(error(runCheat(s, 'event party'))).toMatch(/worldcup/);
    expect(error(runCheat({ ...s, bankrupt: true }, 'event'))).toMatch(/bankrupt/);
  });

  it('puts one more license up for auction', () => {
    const s = running();
    const opened = ok(runCheat(s, 'auction radio north'));
    const fresh = opened.auctions.filter((a) => !s.auctions.some((b) => b.id === a.id));
    expect(fresh).toMatchObject([{ medium: 'radio', regionId: 'north', holder: null }]);
    expect(opened.licensesIssued.radio.north).toBe((s.licensesIssued.radio.north ?? 0) + 1);
    expect(ok(runCheat(s, 'auction tv')).auctions.at(-1)).toMatchObject({ medium: 'tv', regionId: s.headquarters });
    expect(error(runCheat(s, 'auction tv atlantis'))).toMatch(/capital/);
    expect(error(runCheat(s, 'auction'))).toMatch(/radio/);
  });

  it('bankrupts the company now, or lets the bank decide on the 1st', () => {
    const s = running();
    expect(ok(runCheat(s, 'bankrupt')).bankrupt).toBe(true);
    expect(error(runCheat(ok(runCheat(s, 'bankrupt')), 'bankrupt'))).toMatch(/already/);

    const toFirst = (state: GameState) => {
      const { year, month } = toCalendarDate(state.day);
      return advance(state, toDay(year, month + 1, 1) - state.day);
    };
    const soon = ok(runCheat(s, 'bankrupt soon'));
    expect(soon.money).toBeLessThan(0);
    const rescued = toFirst(soon);
    expect(rescued.bankrupt).toBe(false);
    expect(rescued.bailedOut).toBe(true);

    const closed = toFirst(ok(runCheat({ ...s, bailedOut: true }, 'bankrupt soon')));
    expect(closed.bankrupt).toBe(true);
  });

  it('sets research, reputation, prestige, floors, staff and upkeep', () => {
    const s = running();
    expect(ok(runCheat(s, 'rp 500')).researchPoints).toBe(s.researchPoints + 500);
    expect(ok(runCheat(s, 'rp -999999')).researchPoints).toBe(0);
    expect(ok(runCheat(s, 'research all')).techs).toHaveLength(TECHS.length);
    expect(ok(runCheat(s, 'prestige 100')).prestige).toBe(s.prestige + 100);
    expect(ok(runCheat(s, 'floors')).floorsUnlocked).toBe(BUILDINGS.standard.floors);

    const famous = ok(runCheat(s, 'reputation 80'));
    expect(famous.reputation).toBe(80);
    expect(famous.channels.flatMap((c) => Object.values(c.reputation))).toEqual(s.channels.flatMap((c) => Object.values(c.reputation)).map(() => 0.8));
    expect(ok(runCheat(s, 'reputation 500')).reputation).toBe(100);

    expect(ok(runCheat(s, 'morale 20')).employees.every((e) => e.morale === 20)).toBe(true);
    expect(ok(runCheat(s, 'skill 0')).employees.every((e) => e.skill === 1)).toBe(true);

    const worn = structuredClone(s);
    worn.rooms[0]!.cleanliness = 10;
    worn.rooms[0]!.issue = { kind: 'heating', workLeft: 5 } as unknown as GameState['rooms'][number]['issue'];
    worn.rooms[0]!.furniture[0]!.condition = 0;
    const fixed = ok(runCheat(worn, 'repair'));
    expect(fixed.rooms.every((r) => r.cleanliness === 100 && r.issue === null && r.furniture.every((f) => f.condition === 100))).toBe(true);
  });
});
