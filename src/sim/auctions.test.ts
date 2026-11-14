import { describe, expect, it } from 'vitest';
import { RIVALRY } from '../config/balance';
import { buyLicense, createChannel, hire, placeBid, setChannelManager, setRoomType, type ActionResult } from './actions';
import { addMissingEquipment, autoPlaceFurniture, rentRoom, setUpMasterControl, setUpPostRoom } from './fixtures';
import { issueLicenses } from './auctions';
import { sensibleBot } from './bots';
import { freeLicenses, licensePrice } from './licenses';
import { createInitialState } from './newGame';
import { unlockAll } from './unlocks';
import { isManager } from './office';
import type { GameState, Person } from './state';
import { tick } from './tick';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}
const error = (result: ActionResult) => (result.ok ? 'no error' : result.error);
const logo = { shape: 'square' as const, color: '#000', initials: 'TV' };

/** Day numbers of 1 January in a given year. */
const jan1 = (year: number) => Math.round((Date.UTC(year, 0, 1) - Date.UTC(1970, 0, 1)) / 86_400_000);

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

describe('license auctions', () => {
  it('open when the authority issues a new license', () => {
    const s = structuredClone(unlockAll(createInitialState(1)));
    s.day = jan1(1972);
    issueLicenses(s);
    const auction = s.auctions.find((a) => a.medium === 'tv' && a.regionId === 'north');
    expect(auction).toBeDefined();
    expect(auction!.reserve).toBe(licensePrice('tv', 'north', s));
    expect(freeLicenses(s, 'tv', 'north')).toBe(0);
  });

  it('refuse bids below the reserve or above your money', () => {
    const s = tvStation();
    s.auctions.push({ id: 'a1', medium: 'tv', regionId: 'north', reserve: 100_000, endsOn: s.day + 7, interested: 0, bid: null, holder: null });
    expect(error(placeBid(s, 'a1', s.tvId, 50_000))).toMatch(/at least the reserve/);
    expect(error(placeBid(s, 'a1', s.tvId, 9_000_000))).toMatch(/more than you have/);
    expect(error(placeBid(s, 'a1', s.channels[0]!.id, 200_000))).toMatch(/TV license/);
  });

  it('the highest sealed bid wins, and the player pays only when winning', () => {
    const s = tvStation();
    s.auctions.push({ id: 'a1', medium: 'tv', regionId: 'north', reserve: 100_000, endsOn: s.day + 1, interested: 0, bid: null, holder: null });
    const bid = ok(placeBid(s, 'a1', s.tvId, 900_000));
    const after = tick(bid);
    expect(after.auctions).toHaveLength(0);
    expect(after.licenses.some((l) => l.channelId === s.tvId && l.regionId === 'north' && l.price === 900_000)).toBe(true);
    expect(after.ledger.purchases - bid.ledger.purchases).toBe(900_000);
  });

  it('a rival outbids a low bid and launches its TV channel', () => {
    const s = tvStation();
    s.day = jan1(1975) + 3;
    for (const r of s.rivals) r.money = 2_000_000;
    s.auctions.push({ id: 'a1', medium: 'tv', regionId: 'north', reserve: 100_000, endsOn: s.day + 1, interested: 1, bid: null, holder: null });
    const bid = ok(placeBid(s, 'a1', s.tvId, 100_000));
    const after = tick(bid);
    expect(after.licenses.some((l) => l.channelId === s.tvId && l.regionId === 'north')).toBe(false);
    expect(after.money).toBeGreaterThan(bid.money - 100_000);
    const rivalTv = after.rivals.flatMap((r) => r.channels).filter((c) => c.medium === 'tv' && c.regionIds.includes('north'));
    expect(rivalTv.length).toBeGreaterThan(1);
  });

  describe('what rivals can pay (#414)', () => {
    /** A TV auction in the north on the day it closes, with every rival's money set. */
    function closing(money: (r: GameState['rivals'][number]) => number): GameState {
      const s = tvStation();
      s.day = jan1(1975) + 3;
      for (const r of s.rivals) r.money = money(r);
      s.auctions.push({ id: 'a1', medium: 'tv', regionId: 'north', reserve: 100_000, endsOn: s.day + 1, interested: 3, bid: null, holder: null });
      return s;
    }
    const totalMoney = (s: GameState) => s.rivals.reduce((sum, r) => sum + r.money, 0);

    it('a rival that cannot reach the reserve does not bid, and your reserve bid wins', () => {
      const s = closing(() => 0);
      const after = tick(ok(placeBid(s, 'a1', s.tvId, 100_000)));
      expect(after.licenses.some((l) => l.channelId === s.tvId && l.regionId === 'north')).toBe(true);
    });

    it('a bid is capped by what the rival has to spare, and the winner pays it', () => {
      const s = closing((r) => RIVALRY.startMoney[r.personality] * RIVALRY.shortBelow + 150_000);
      const before = totalMoney(s);
      const after = tick(ok(placeBid(s, 'a1', s.tvId, 100_000)));
      const paid = before - totalMoney(after);
      // A day's ad income comes back in the same tick.
      expect(paid).toBeGreaterThanOrEqual(90_000);
      expect(paid).toBeLessThanOrEqual(150_000);
      expect(after.licenses.some((l) => l.channelId === s.tvId && l.regionId === 'north')).toBe(false);
    });

    it('rivalry pushes a bid up', () => {
      const s = closing(() => 5_000_000);
      const pushedState = structuredClone(s);
      for (const r of pushedState.rivals) r.rivalry = 1;
      const paid = (state: GameState) => totalMoney(s) - totalMoney(tick(state));
      expect(paid(pushedState)).toBeGreaterThan(paid(s));
    });

    it('every wanting rival still draws its bid, whatever its money', () => {
      // A radio auction where the winner only extends a channel, so nothing else is drawn after the bids.
      const radio = (money: number) => {
        const s = tvStation();
        s.day = jan1(1975) + 3;
        for (const r of s.rivals) r.money = money;
        const region = (['north', 'coast', 'heartland', 'highlands'] as const).find((reg) => s.rivals.some((r) => r.channels.some((c) => c.medium === 'radio' && !c.regionIds.includes(reg))))!;
        s.auctions.push({ id: 'a1', medium: 'radio', regionId: region, reserve: 10_000, endsOn: s.day + 1, interested: 3, bid: null, holder: null });
        return s;
      };
      expect(tick(radio(0)).rngState).toBe(tick(radio(5_000_000)).rngState);
    });
  });

  it('a license nobody bids on can be bought at the list price', () => {
    const s = tvStation();
    // In 1970 no rival is ready for more TV.
    s.licensesIssued.tv.north = 2;
    s.auctions.push({ id: 'a1', medium: 'tv', regionId: 'north', reserve: 100_000, endsOn: s.day + 1, interested: 0, bid: null, holder: null });
    expect(freeLicenses(s, 'tv', 'north')).toBe(0);
    const after = tick(s);
    expect(freeLicenses(after, 'tv', 'north')).toBe(1);
    expect(ok(buyLicense(after, s.tvId, 'north')).licenses.some((l) => l.channelId === s.tvId && l.regionId === 'north')).toBe(true);
  });
});
