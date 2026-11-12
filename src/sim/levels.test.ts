import { describe, expect, it } from 'vitest';
import { COMPANY_XP, FLOOR_LEVEL, MILESTONES, DIFFICULTIES } from '../config/balance';
import { floorsAtLevel, levelOf, xpForLevel } from '../config/levels';
import { MILESTONE_LIST } from '../config/milestones';
import { FEATURES, UNLOCKS } from '../config/unlocks';
import { sensibleBot } from './bots';
import { createInitialState } from './newGame';
import { addDividendXp, checkLevels, levelPay, levelProgress, opensText } from './levels';
import { checkMilestones } from './milestones';
import { SAVE_VERSION, fromSaveFile, toSaveFile } from './save';
import { buildingOf } from './office';
import { tick } from './tick';
import { isUnlocked, lockedReason, mayBuyTvLicense, unlockAll } from './unlocks';
import { saleBlocker, letBlocker } from './deals';
import { themeWeekBlocker } from './themeWeekBooking';
import { buyBoxes, buyLicense, buyRights, createChannel, hire, setChannelManager, setRoomType, type ActionResult } from './actions';
import type { GameState } from './state';
import { addMissingEquipment, autoPlaceFurniture, rentRoom, setUpMasterControl, setUpPostRoom } from './fixtures';
import { monthlyNet } from './economy';

const fresh = (): GameState => createInitialState(1);

describe('company levels (#205)', () => {
  it('needs the XP of the table for levels 1 to 10 and 25% more for each step after, without end', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(xpForLevel)).toEqual([30, 40, 70, 110, 170, 250, 350, 480, 640, 850]);
    expect(xpForLevel(0)).toBe(0);
    const steps = [10, 11, 12, 13, 20, 40].map((n) => xpForLevel(n) - xpForLevel(n - 1));
    expect(steps[1]!).toBeGreaterThan(steps[0]!);
    expect(steps[1]! / steps[0]!).toBeCloseTo(COMPANY_XP.growth, 1);
    for (let i = 1; i < steps.length; i++) expect(steps[i]!).toBeGreaterThan(0);
    for (let n = 11; n < 60; n++) expect(xpForLevel(n)).toBeGreaterThan(xpForLevel(n - 1));
  });

  it('works out the level from the XP', () => {
    expect(levelOf(0)).toBe(0);
    expect(levelOf(29)).toBe(0);
    expect(levelOf(30)).toBe(1);
    expect(levelOf(849)).toBe(9);
    expect(levelOf(850)).toBe(10);
    expect(levelOf(xpForLevel(25))).toBe(25);
    expect(levelOf(xpForLevel(25) - 1)).toBe(24);
    const p = levelProgress({ xp: 50 });
    expect(p).toMatchObject({ level: 2, have: 10, need: 30, toNext: 20 });
  });

  it('gives the early milestones the XP that reaches level 1 at the first profit and level 2 at the first sponsor', () => {
    const xp = (id: string) => MILESTONE_LIST.find((m) => m.id === id)!.xp;
    expect(xp('onAir') + xp('firstMonth') + xp('firstProfit')).toBe(xpForLevel(1));
    expect(xp('onAir') + xp('firstMonth') + xp('firstProfit') + xp('firstSponsor')).toBe(xpForLevel(2));
    for (const id of ['firstDividend', 'dividendsSmall', 'dividendsMedium', 'dividendsLarge']) expect(xp(id)).toBeGreaterThan(0);
  });

  it('adds a milestone’s XP, and pays Tabby once for each level reached', () => {
    const s = fresh();
    s.xp = xpForLevel(2) + 5;
    const money = s.money;
    checkMilestones(s);
    expect(s.level).toBe(2);
    expect(s.money - money).toBe(levelPay(s, 1) + levelPay(s, 2));
    expect(s.ledger.gifts).toBe(levelPay(s, 1) + levelPay(s, 2));
    expect(s.messages.filter((m) => /^Level \d/.test(m.text))).toHaveLength(2);
    // Nothing is paid twice.
    const again = s.money;
    expect(checkLevels(s)).toEqual([]);
    checkMilestones(s);
    expect(s.money).toBe(again);
  });

  it('pays €20,000 times the level on normal, scaled by the difficulty', () => {
    expect(levelPay({ difficulty: 'normal' }, 5)).toBe(100_000);
    expect(levelPay({ difficulty: 'easy' }, 5)).toBe(100_000 * MILESTONES.rewardScale.easy);
    expect(levelPay({ difficulty: 'hard' }, 5)).toBe(100_000 * MILESTONES.rewardScale.hard);
    // Past level 10 every level is still paid.
    expect(levelPay({ difficulty: 'normal' }, 14)).toBe(280_000);
  });

  it('gives XP for dividends, one for each €100,000 paid in all', () => {
    const s = fresh();
    s.dividendsPaid = 150_000;
    addDividendXp(s, 150_000);
    expect(s.xp).toBe(1);
    s.dividendsPaid = 260_000;
    addDividendXp(s, 110_000);
    expect(s.xp).toBe(2);
  });

  it('opens each feature at its level, and a TV license opens the content market at once', () => {
    const s = fresh();
    for (const feature of FEATURES) expect(isUnlocked(s, feature)).toBe(false);
    s.xp = xpForLevel(8);
    checkMilestones(s);
    for (const feature of FEATURES) expect(isUnlocked(s, feature), feature).toBe(UNLOCKS[feature].level <= 8);
    const tv = fresh();
    tv.milestones.push({ id: 'tvLicense', day: 0 });
    checkMilestones(tv);
    expect(isUnlocked(tv, 'content')).toBe(true);
    expect(isUnlocked(tv, 'events')).toBe(false);
    expect(lockedReason('merchandise')).toBe('Merchandise opens at level 9.');
    expect(lockedReason('content')).toMatch(/opens at level 4 or with the milestone/);
  });

  it('describes what a level opens', () => {
    expect(opensText(2)).toBe('marketing');
    expect(opensText(4)).toBe('the content market and floor 2 of the office');
    expect(opensText(7)).toBe('selling shows and a second tv license');
    expect(opensText(9)).toBe('merchandise and the weather studio');
    expect(opensText(10)).toBe('the traffic helicopter and floor 5 of the office');
  });

  it('opens the floors with the levels, up to the floors of the building', () => {
    expect(floorsAtLevel(3)).toBe(1);
    expect(floorsAtLevel(4)).toBe(2);
    expect(floorsAtLevel(12)).toBe(6);
    let s = fresh();
    s = { ...s, xp: xpForLevel(6), level: 6 };
    s = tick(s);
    expect(s.floorsUnlocked).toBe(3);
    s = { ...s, xp: xpForLevel(FLOOR_LEVEL[6]!) };
    s = tick(s);
    expect(s.floorsUnlocked).toBe(buildingOf(s).floors);
  });

  it('gives XP for each month in the black after the first profitable one, and a level at the first profit and the first sponsor', () => {
    let s = createInitialState(1);
    for (let day = 0; day < 200 && !s.bankrupt; day++) s = tick(sensibleBot(s));
    const day = (id: string) => s.milestones.find((m) => m.id === id)?.day;
    expect(day('firstProfit')).toBeDefined();
    const fromMilestones = s.milestones.reduce((sum, m) => sum + MILESTONE_LIST.find((l) => l.id === m.id)!.xp, 0);
    const months = (s.xp - fromMilestones) / COMPANY_XP.blackMonth;
    expect(Number.isInteger(months)).toBe(true);
    expect(months).toBeGreaterThan(0);
    // The month of the first profit is the milestone's, not a second helping.
    expect(s.xp).toBeGreaterThanOrEqual(xpForLevel(1));
    expect(s.level).toBeGreaterThanOrEqual(1);
  });
});

describe('what the levels lock (#205)', () => {
  it('locks sports rights, merchandise, selling shows, theme weeks and a second TV license', () => {
    const s = { ...fresh(), money: 5_000_000 };
    const bid = buyRights({ ...s, unlocked: ['content'] }, 'none');
    expect(bid.ok ? '' : bid.error).toBe(lockedReason('sportsRights'));
    expect(isUnlocked(s, 'merchandise')).toBe(false);
    const boxes = buyBoxes(s, s.shows[0]?.id ?? 'x', 'clothes', 1);
    expect(boxes.ok ? '' : boxes.error).toBe(lockedReason('merchandise'));
    const show = s.shows[0] ?? ({ id: 'x', name: 'X', genre: 'news' } as GameState['shows'][number]);
    expect(saleBlocker(s, show)).toBe(lockedReason('showSales'));
    expect(letBlocker(s, { roomId: 'A', type: 'tvTalkStudio' } as never)).toBe(lockedReason('showSales'));
    expect(themeWeekBlocker(s, 'c', 'special', 0)).toBe(lockedReason('themeWeeks'));
    const open = { ...s, unlocked: ['showSales' as const, 'themeWeeks' as const] };
    expect(saleBlocker(open, show)).not.toBe(lockedReason('showSales'));
    expect(themeWeekBlocker(open, 'c', 'special', 0)).not.toBe(lockedReason('themeWeeks'));
  });

  it('lets a company buy its first TV license, and a second one only at level 7', () => {
    const base = { ...fresh(), money: 5_000_000, unlocked: ['regions' as const, 'content' as const] };
    expect(mayBuyTvLicense(base)).toBe(true);
    const withTv = { ...base, licenses: [{ id: 'l', regionId: 'capital', medium: 'tv', channelId: 'tv1', price: 1, expiresOn: 99999 }] } as unknown as GameState;
    expect(mayBuyTvLicense(withTv)).toBe(false);
    expect(mayBuyTvLicense({ ...withTv, unlocked: [...withTv.unlocked, 'secondTvLicense'] })).toBe(true);
    const made = createChannel({ ...withTv, licenses: [] }, { name: 'T', logo: { shape: 'circle', color: '#6631d2', initials: 'T' }, medium: 'tv' });
    if (!made.ok) throw new Error(made.error);
    const two = { ...made.state, licenses: withTv.licenses };
    const bought = buyLicense(two, made.id!, 'north');
    expect(bought.ok ? '' : bought.error).toBe(`You hold a TV license already. ${lockedReason('secondTvLicense')}`);
  });
});

describe('saves from before the levels (#205)', () => {
  it('works out the XP from the milestones reached, pays nothing back, and opens every feature and every floor', () => {
    const s = fresh();
    s.milestones = [
      { id: 'onAir', day: 1 },
      { id: 'firstMonth', day: 31 },
      { id: 'firstProfit', day: 40 },
      { id: 'firstSponsor', day: 50 },
    ];
    s.money = 123_456;
    const file = JSON.parse(JSON.stringify(toSaveFile(s, 0)));
    delete file.state.xp;
    delete file.state.level;
    file.state.unlocked = ['regions'];
    file.state.floorsUnlocked = 1;
    const loaded = fromSaveFile({ ...file, version: 60 });
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.state.xp).toBe(40);
    expect(loaded.state.level).toBe(2);
    expect(loaded.state.money).toBe(123_456);
    // Merchandise is a gift shop since 0.21.0 and opens at level 9: a company of level 2 does not have it.
    expect([...loaded.state.unlocked].sort()).toEqual(FEATURES.filter((f) => f !== 'merchandise').sort());
    expect(loaded.state.floorsUnlocked).toBe(buildingOf(loaded.state).floors);
    // Next day nothing is paid for the levels it already has.
    expect(tick(loaded.state).money).toBeGreaterThan(0);
    expect(checkLevels(loaded.state)).toEqual([]);
  });

  it('keeps the XP and the level of a game saved now', () => {
    const mine = { ...fresh(), xp: 99, level: 3 };
    const back = fromSaveFile(JSON.parse(JSON.stringify(toSaveFile(mine, 0)))).state;
    expect(back).toMatchObject({ xp: 99, level: 3 });
  });
});

// From version012.
function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}

/** The sensible bot's radio station, with a TV channel in the Capital, a library and money to spare. */
function tvStation(difficulty: GameState['difficulty'] = 'normal'): GameState & { tvId: string } {
  let s: GameState & { lastId?: string } = structuredClone(unlockAll(sensibleBot(createInitialState(1, difficulty))));
  s.money = 2_000_000;
  s.floorsUnlocked = 2;
  s = ok(createChannel(s, { name: 'Test TV', logo: { shape: 'square', color: '#000', initials: 'TV' }, medium: 'tv' }));
  const tvId = s.lastId!;
  s = ok(buyLicense(s, tvId, 'capital'));
  s.candidates.push({ id: 'p-manager', name: 'Test Person', skill: 80, salary: 2_000, specialties: [], fame: 0, department: null, role: 'channelManager' });
  s = ok(hire(s, 'p-manager'));
  s = ok(autoPlaceFurniture(s, s.rooms.find((r) => r.type === 'managementOffice')!.roomId, 'managerDesk'));
  s = ok(setChannelManager(s, tvId, 'p-manager'));
  // The titles come by post (0.17.0).
  s = ok(addMissingEquipment(ok(setRoomType(ok(setUpPostRoom(ok(rentRoom(s, 'K')))), 'K', 'library')), 'K'));
  // A second channel goes out through a master control room (0.16.0).
  s = ok(setUpMasterControl(s));
  return Object.assign(s, { tvId });
}

const getXp = (id: string) => MILESTONE_LIST.find((m) => m.id === id)!.xp;

describe('version 0.12.0: balance (R85)', () => {
  describe('Uncle Tabby pays for levels (0.20.0)', () => {
    it('a milestone gives XP, not money; the level it adds up to is paid by the difficulty', () => {
      expect(MILESTONE_LIST.every((m) => m.xp > 0)).toBe(true);
      for (const difficulty of DIFFICULTIES) {
        expect(levelPay({ difficulty }, 4)).toBe(4 * COMPANY_XP.levelPay * MILESTONES.rewardScale[difficulty]);
      }
    });

    it('a milestone adds its XP at once, and the money comes with the level, as a gift in the books', () => {
      const s = structuredClone(tvStation('easy'));
      s.milestones = s.milestones.filter((m) => m.id !== 'tvLicense');
      const { money, xp } = s;
      const gifts = s.ledger.gifts;
      checkMilestones(s);
      expect(s.xp - xp).toBe(getXp('tvLicense'));
      expect(s.messages.some((m) => m.text.includes(`+${getXp('tvLicense')} XP`))).toBe(true);
      // The money is Tabby's pay for the levels the XP has now reached.
      const paid = s.money - money;
      expect(s.ledger.gifts - gifts).toBe(paid);
      expect(s.level).toBe(levelOf(s.xp));
      expect(monthlyNet({ ...s.ledger, revenue: 0 })).toBeGreaterThanOrEqual(monthlyNet({ ...s.ledger, revenue: 0, gifts: 0 }));
    });
  });
});
