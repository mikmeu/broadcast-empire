import { describe, expect, it } from 'vitest';
import { ACTIVE_REGIONS, DIFFICULTIES, LICENSE_RAMP, LICENSE_RISE, STARTING_MONEY } from '../config/balance';
import { toDay } from './calendar';
import { licenseMonthly, licenseSlots, nextTvLicenseYear, freeLicenses, licensePrice, licenseRamp, LIST_PRICES, playerAuctionReserve, playerLicenseMonthly, playerLicensePrice } from './licenses';
import { createInitialState } from './newGame';
import { unlockAll } from './unlocks';
import { furnitureSpec, STUDIO_REQUIREMENTS, type FurnitureType, type RoomType } from '../config/office';
import { buyLicense, createChannel, hire, setChannelManager, setRoomType, type ActionResult } from './actions';
import { addMissingEquipment, autoPlaceFurniture, rentRoom, setUpMasterControl, setUpPostRoom } from './fixtures';
import { sensibleBot } from './bots';
import { isManager } from './office';
import { monthlyCosts } from './economy';
import type { GameState, Person } from './state';

describe('when the next TV license comes (#136)', () => {
  it('names the next listed year, and none after the last', () => {
    expect(nextTvLicenseYear('north', toDay(1970, 1, 1))).toBe(1971);
    expect(nextTvLicenseYear('north', toDay(1972, 6, 1))).toBe(1977);
    expect(nextTvLicenseYear('highlands', toDay(1979, 1, 1))).toBeUndefined();
  });

  it('gives every region a second TV license by the end of 1972, and the Capital a third', () => {
    const day = toDay(1972, 12, 31);
    for (const region of ACTIVE_REGIONS) expect(licenseSlots('tv', region, day)).toBeGreaterThanOrEqual(region === 'capital' ? 3 : 2);
  });
});

// From phase2.
describe('licenses', () => {
  it('leaves at least one license free in every region at the start', () => {
    const s = unlockAll(createInitialState(1));
    for (const region of ACTIVE_REGIONS) expect(freeLicenses(s, 'radio', region)).toBeGreaterThanOrEqual(1);
  });

  it('adds licenses as regions grow', () => {
    expect(licenseSlots('radio', 'capital', 30 * 365)).toBeGreaterThan(licenseSlots('radio', 'capital', 0));
  });
});

// From phase3.
function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}
const error = (result: ActionResult) => (result.ok ? 'no error' : result.error);
const logo = { shape: 'square' as const, color: '#000', initials: 'TV' };

/** Hires a made-up person and gives them a desk in office L (floor 2). */
function hireWithDesk(state: GameState, person: Partial<Person> & Pick<Person, 'role'>): GameState & { lastId?: string } {
  let s = structuredClone(state);
  const id = `p-tv-${s.nextId++}`;
  s.candidates.push({ id, name: 'Test Person', skill: 80, salary: 2_000, specialties: [], fame: 0, department: null, ...person });
  s = ok(hire(s, id));
  if (!s.rooms.some((r) => r.roomId === 'L')) s = ok(setRoomType(ok(rentRoom(s, 'L')), 'L', 'office'));
  // A manager's desk goes in the management office the station already has.
  if (isManager(person.role)) s = ok(autoPlaceFurniture(s, s.rooms.find((r) => r.type === 'managementOffice')!.roomId, 'managerDesk'));
  else if (person.role !== 'host') s = ok(autoPlaceFurniture(s, 'L', 'workstation'));
  return Object.assign(s, { lastId: id });
}

/** The sensible bot's radio station plus a rich company with a TV channel in the Capital and a library. */
function tvStation(): GameState & { tvId: string } {
  let s: GameState & { lastId?: string } = structuredClone(unlockAll(sensibleBot(createInitialState(1))));
  s.money = 5_000_000;
  s.floorsUnlocked = 2;
  s = ok(createChannel(s, { name: 'Test TV', logo, medium: 'tv' }));
  const tvId = s.lastId!;
  s = ok(buyLicense(s, tvId, 'capital'));
  s = hireWithDesk(s, { role: 'channelManager' });
  s = ok(setChannelManager(s, tvId, s.lastId!));
  // The titles come by post (0.17.0).
  s = ok(addMissingEquipment(ok(setRoomType(ok(setUpPostRoom(ok(rentRoom(s, 'K')))), 'K', 'library')), 'K'));
  // A second channel goes out through a master control room (0.16.0).
  s = ok(setUpMasterControl(s));
  return Object.assign(s, { tvId });
}

describe('TV licenses', () => {
  it('cost eight times a radio license, with one free in the Capital at the start', () => {
    const s = unlockAll(createInitialState(1));
    expect(licensePrice('tv', 'capital', LIST_PRICES)).toBe(8 * licensePrice('radio', 'capital', LIST_PRICES));
    expect(freeLicenses(s, 'tv', 'capital')).toBe(1);
    for (const region of ['north', 'coast', 'heartland', 'highlands'] as const) expect(freeLicenses(s, 'tv', region)).toBe(0);
  });

  it('the public broadcaster runs a national TV channel from the start', () => {
    const s = unlockAll(createInitialState(1));
    const tv = s.rivals.flatMap((r) => r.channels).filter((c) => c.medium === 'tv');
    expect(tv).toHaveLength(1);
    expect(tv[0]!.regionIds).toHaveLength(5);
  });

  it('can be bought once; a TV channel only takes TV licenses', () => {
    const s = tvStation();
    expect(s.licenses.find((l) => l.channelId === s.tvId)!.medium).toBe('tv');
    const second = ok(createChannel(s, { name: 'Second TV', logo, medium: 'tv' }));
    expect(error(buyLicense(second, second.lastId!, 'capital'))).toMatch(/All TV licenses in Coaxia are taken/);
  });
});

// --- Phase 3 acceptance (prompt.md section 14) ---

describe('Phase 3 acceptance', () => {
  it('starting TV costs more than the company starts with, and many times a radio station', () => {
    const cost = (type: RoomType) =>
      (Object.entries(STUDIO_REQUIREMENTS[type]!) as [FurnitureType, number][]).reduce((sum, [f, n]) => sum + furnitureSpec(f).cost * n, 0);
    const cheapestStudio = Math.min(cost('tvTalkStudio'), cost('tvNewsStudio'), cost('tvKidsStudio'));
    const tv = licensePrice('tv', 'capital', LIST_PRICES) + cheapestStudio + cost('library');
    const radio = licensePrice('radio', 'capital', LIST_PRICES) + cost('radioStudio');
    // On easy a company starts with enough for it (0.12.0): the user wanted to be able to build studios early.
    for (const difficulty of DIFFICULTIES.filter((d) => d !== 'easy')) {
      expect(licensePrice('tv', 'capital', { day: 0, difficulty }) + cheapestStudio + cost('library')).toBeGreaterThan(STARTING_MONEY[difficulty]);
    }
    expect(tv).toBeGreaterThan(5 * radio);
  });

  // (The ten-year game, TV against radio, is a long test now: bots.tv.long.test.ts.)
});

describe('each radio license costs more than the last (#430)', () => {
  /** A company that holds `n` radio licenses (made up, in the Capital) on one channel. */
  function holding(n: number): GameState {
    const s = unlockAll(createInitialState(1));
    s.licenses = Array.from({ length: n }, (_, i) => ({ id: `l-t${i}`, regionId: 'capital' as const, medium: 'radio' as const, channelId: 'c-1', price: 0, expiresOn: 99_999 }));
    return s;
  }

  it('adds the rise to the price of the next radio license for each one held', () => {
    const list = licensePrice('radio', 'north', LIST_PRICES);
    expect(playerLicensePrice(holding(0), 'radio', 'north')).toBe(list);
    expect(playerLicensePrice(holding(3), 'radio', 'north')).toBeCloseTo(list * (1 + 3 * LICENSE_RISE.price), -3);
    expect(playerLicensePrice(holding(3), 'radio', 'north')).toBeGreaterThan(playerLicensePrice(holding(1), 'radio', 'north'));
  });

  it('leaves TV and the list price alone', () => {
    const s = holding(5);
    expect(playerLicensePrice(s, 'tv', 'capital')).toBe(licensePrice('tv', 'capital', s));
    expect(licensePrice('radio', 'capital', s)).toBe(licensePrice('radio', 'capital', LIST_PRICES));
  });

  it('multiplies every radio fee from the second license on', () => {
    const base = playerLicenseMonthly(holding(1), 'radio', 'capital');
    expect(base).toBe(licenseMonthly('radio', 'capital', LIST_PRICES));
    expect(playerLicenseMonthly(holding(3), 'radio', 'capital')).toBeCloseTo(base * (1 + 2 * LICENSE_RISE.monthly), -2);
    // The rise stops at maxMonthly, so a big company is not bled dry for decades.
    expect(playerLicenseMonthly(holding(12), 'radio', 'capital')).toBeCloseTo(base * LICENSE_RISE.maxMonthly, -2);
    expect(playerLicenseMonthly(holding(1), 'radio', 'capital', 1)).toBeGreaterThan(base);
    expect(playerLicenseMonthly(holding(5), 'tv', 'capital')).toBe(licenseMonthly('tv', 'capital', LIST_PRICES));
  });

  it('charges the monthly costs with the rise', () => {
    const one = monthlyCosts(holding(1)).licenseFees;
    const four = monthlyCosts(holding(4)).licenseFees;
    expect(four).toBeGreaterThan(4 * one);
  });

  it('charges a purchase the player price, and the price of a first license is the list price', () => {
    const first = unlockAll(createInitialState(1));
    first.money = 10_000_000;
    const channel = ok(createChannel(first, { name: 'R', logo }));
    const bought = ok(buyLicense(channel, channel.lastId!, 'capital'));
    expect(first.money - bought.money).toBe(licensePrice('radio', 'capital', LIST_PRICES));
    expect(bought.licenses[0]!.since).toBeUndefined();
    const second = ok(buyLicense(bought, channel.lastId!, 'north'));
    expect(bought.money - second.money).toBe(playerLicensePrice(bought, 'radio', 'north'));
    expect(second.licenses[1]!.since).toBe(second.day);
  });

  it('asks the player for the rise at an auction of a new license, not at a renewal', () => {
    const s = holding(2);
    const fresh = { reserve: 20_000, medium: 'radio' as const, holder: undefined } as unknown as GameState['auctions'][number];
    const renewal = { ...fresh, holder: { ownerId: 'player', channelId: 'c-1', value: 0 } } as unknown as GameState['auctions'][number];
    expect(playerAuctionReserve(s, fresh)).toBe(20_000 * (1 + 2 * LICENSE_RISE.price));
    expect(playerAuctionReserve(s, renewal)).toBe(20_000);
  });

  it('builds the listeners of a new license up in a straight line, and a saved license is established', () => {
    expect(licenseRamp({ since: 100 }, 100)).toBeCloseTo(LICENSE_RAMP.start);
    expect(licenseRamp({ since: 100 }, 100 + LICENSE_RAMP.days / 2)).toBeGreaterThan(LICENSE_RAMP.start);
    expect(licenseRamp({ since: 100 }, 100 + LICENSE_RAMP.days)).toBe(1);
    expect(licenseRamp({}, 100)).toBe(1);
  });
});
