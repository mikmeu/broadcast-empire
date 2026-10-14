import { describe, expect, it } from 'vitest';
import { FURNITURE } from '../config/office';
import { buyLicense, createChannel, createShow, deleteShow, dropLicense, fire, hire, placeFurniture, releaseRoom, scheduleShow, sellFurniture, setRoomType, updateChannel, updateShow, type ActionResult, type ShowInput } from './actions';
import { addMissingEquipment, rentRoom, roomOfKind } from './fixtures';
import { sensibleBot } from './bots';
import { freeLicenses, licensePrice } from './licenses';
import { isStudioReady } from './office';
import { createInitialState } from './newGame';
import type { GameState, Role, Show } from './state';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}

function error(result: ActionResult): string {
  if (result.ok) throw new Error('Expected the action to fail');
  return result.error;
}

const logo = { shape: 'circle' as const, color: '#000', initials: 'tst' };

/** A fully staffed station with five scheduled shows (the sensible bot's day 0). */
const station = () => sensibleBot(createInitialState(1));

/** Slots 0–2 use studio C, slots 3–4 use studio D (see the sensible bot's plan). */
const scheduled = (s: GameState, slot: number): Show => s.shows.find((sh) => sh.id === s.channels[0]!.schedule[slot])!;

const inputOf = (show: Show): ShowInput => ({
  name: show.name,
  genre: show.genre,
  hostId: show.hostId,
  staffIds: show.staffIds,
  studioId: show.studioId,
});

/**
 * Phase 1 allows one channel, so a second one is added by hand to test the
 * rules between channels (a studio or host can't be in two places at once).
 */
function twoChannels(): GameState {
  const s = structuredClone(station());
  s.licenses.push({ id: 'l-test', regionId: 'north', medium: 'radio', channelId: 'c-test', price: 0, expiresOn: 10_000 });
  s.channels.push({
    id: 'c-test',
    name: 'Second FM',
    logo,
    medium: 'radio',
    managerId: null,
    schedule: [null, null, null, null, null],
    reputation: {}, lastEventDay: null
  });
  return s;
}

function hireRole(state: GameState, role: Role): GameState & { lastId?: string } {
  return ok(hire(state, state.candidates.find((c) => c.role === role)!.id));
}

describe('office actions', () => {
  it('rents a room once and releases it only when empty', () => {
    let s = ok(rentRoom(createInitialState(1), 'A'));
    expect(error(rentRoom(s, 'A'))).toMatch(/already rent/);
    s = ok(setRoomType(s, 'A', 'office'));
    s = ok(placeFurniture(s, 'A', 'workstation', 0, 0));
    expect(error(releaseRoom(s, 'A'))).toMatch(/Sell the furniture/);
    s = ok(sellFurniture(s, 'A', s.rooms[0]!.furniture[0]!.id));
    expect(ok(releaseRoom(s, 'A')).rooms).toEqual([]);
  });

  it('charges for furniture, refunds it when it is sold straight away, and rejects bad placements', () => {
    let s = ok(setRoomType(ok(rentRoom(createInitialState(1), 'A')), 'A', 'office'));
    const before = s.money;
    s = ok(placeFurniture(s, 'A', 'workstation', 0, 0));
    expect(s.money).toBe(before - FURNITURE.workstation.cost);
    expect(error(placeFurniture(s, 'A', 'workstation', 1, 1))).toMatch(/already there/);
    expect(error(placeFurniture(s, 'A', 'workstation', 5, 0))).toMatch(/doesn’t fit/);
    expect(error(placeFurniture(s, 'A', 'mixingDesk', 3, 3))).toMatch(/doesn't belong/);
    // Second-hand it brings less than it cost; sold straight away, all of it.
    const later = ok(sellFurniture({ ...s, day: s.day + 60 }, 'A', s.rooms[0]!.furniture[0]!.id));
    expect(later.money).toBeLessThan(before - FURNITURE.workstation.cost / 5);
    expect(later.money).toBeGreaterThan(before - FURNITURE.workstation.cost / 3);
    s = ok(sellFurniture(s, 'A', s.rooms[0]!.furniture[0]!.id));
    expect(s.money).toBe(before);
  });

  it('equips a studio in one go', () => {
    let s = ok(setRoomType(ok(rentRoom(createInitialState(1), 'C')), 'C', 'radioTalkStudio'));
    expect(isStudioReady(s, s.rooms[0]!)).toBe(false);
    s = ok(addMissingEquipment(s, 'C'));
    expect(isStudioReady(s, s.rooms[0]!)).toBe(true);
  });
});

describe('staff actions', () => {
  it('hires from the pool and pays severance when firing', () => {
    let s = hireRole(createInitialState(1), 'production');
    const employee = s.employees[0]!;
    expect(s.candidates.some((c) => c.id === employee.id)).toBe(false);
    const before = s.money;
    s = ok(fire(s, employee.id));
    expect(s.employees).toEqual([]);
    expect(s.money).toBe(before - employee.salary);
  });
});

describe('channels and shows', () => {
  function station() {
    let s = ok(createChannel(createInitialState(1), { name: 'Test FM', logo }));
    const channelId = s.lastId!;
    s = ok(buyLicense(s, channelId, 'capital'));
    s = ok(setRoomType(ok(rentRoom(s, 'C')), 'C', 'radioStudio'));
    s = hireRole(s, 'host');
    const hostId = s.lastId!;
    s = hireRole(s, 'production');
    return { s, channelId, hostId, staffId: s.lastId! };
  }

  it('buys one license per channel and region, priced by population', () => {
    let s = ok(createChannel(createInitialState(1), { name: 'X', logo }));
    const channelId = s.lastId!;
    const before = s.money;
    s = ok(buyLicense(s, channelId, 'capital'));
    expect(s.money).toBe(before - licensePrice('radio', 'capital', 0));
    expect(error(buyLicense(s, channelId, 'capital'))).toMatch(/already broadcasts/);
    expect(licensePrice('radio', 'highlands', 0)).toBeLessThan(licensePrice('radio', 'capital', 0));

    // Dropping a license refunds nothing.
    const money = s.money;
    s = ok(dropLicense(s, s.licenses[0]!.id));
    expect(s.licenses).toEqual([]);
    expect(s.money).toBe(money);
  });

  it('refuses a license when every one in the region is taken', () => {
    let s = ok(createChannel(createInitialState(1), { name: 'X', logo }));
    const channelId = s.lastId!;
    s = structuredClone(s);
    while (freeLicenses(s, 'radio', 'highlands') > 0) {
      s.rivals[0]!.channels.push({ ...structuredClone(s.rivals[0]!.channels[0]!), id: `rc-${s.rivals[0]!.channels.length}`, regionIds: ['highlands'] });
    }
    expect(error(buyLicense(s, channelId, 'highlands'))).toMatch(/taken/);
  });

  it('limits a host to one show and checks the studio type', () => {
    let { s, hostId, staffId } = station();
    const input = { name: 'Show', genre: 'top40' as const, hostId, staffIds: [], studioId: 'C' };
    s = ok(createShow(s, input));
    expect(error(createShow(s, input))).toMatch(/already presents a show/);
    expect(error(createShow(s, { ...input, hostId: null, genre: 'news' }))).toMatch(/needs a radio talk studio/);
    expect(error(createShow(s, { ...input, hostId: staffId }))).toMatch(/Pick a host/);
  });

  it('moves a show when it is scheduled in another slot', () => {
    let { s, channelId, hostId } = station();
    s = ok(createShow(s, { name: 'Show', genre: 'top40', hostId, staffIds: [], studioId: 'C' }));
    const showId = s.lastId!;
    s = ok(scheduleShow(s, channelId, 0, showId));
    s = ok(scheduleShow(s, channelId, 3, showId));
    expect(s.channels[0]!.schedule).toEqual([null, null, null, showId, null]);
  });
});

describe('editing shows and channels', () => {
  it('cancelling a show also takes it off the schedule', () => {
    const s = station();
    const morning = scheduled(s, 0);
    const next = ok(deleteShow(s, morning.id));
    expect(next.shows.some((sh) => sh.id === morning.id)).toBe(false);
    expect(next.channels[0]!.schedule[0]).toBeNull();
    expect(error(deleteShow(next, morning.id))).toMatch(/doesn’t exist/);
  });

  it('lets a busy host keep the show they already present', () => {
    const s = station();
    const show = scheduled(s, 0);
    const next = ok(updateShow(s, show.id, { ...inputOf(show), name: '  Wake Up Capital  ' }));
    expect(next.shows.find((sh) => sh.id === show.id)!.name).toBe('Wake Up Capital');
    expect(error(updateShow(s, show.id, { ...inputOf(show), name: ' ' }))).toMatch(/name/);
  });

  it('treats a new genre as a fresh show', () => {
    const s = structuredClone(station());
    const show = scheduled(s, 0); // morning show in studio C
    show.freshness = 0.7;
    const next = ok(updateShow(s, show.id, { ...inputOf(show), genre: 'top40' }));
    expect(next.shows.find((sh) => sh.id === show.id)!.freshness).toBe(1);
  });

  it('renames a channel and tidies its logo initials', () => {
    const s = station();
    const id = s.channels[0]!.id;
    const next = ok(updateChannel(s, id, { name: ' Capital FM ', logo: { ...logo, initials: ' abcd ' } }));
    expect(next.channels[0]!.name).toBe('Capital FM');
    expect(next.channels[0]!.logo.initials).toBe('ABC');
    expect(error(updateChannel(s, id, { name: '' }))).toMatch(/name/);
  });

  it('clears a slot when scheduling nothing', () => {
    const s = station();
    expect(ok(scheduleShow(s, s.channels[0]!.id, 2, null)).channels[0]!.schedule[2]).toBeNull();
  });
});

describe('a studio or host in two places at once', () => {
  it('refuses a studio that another channel uses in the same slot', () => {
    let s = ok(createShow(twoChannels(), { name: 'Clash', genre: 'top40', hostId: null, staffIds: [], studioId: roomOfKind(station(), 'radioStudio') }));
    const clashId = s.lastId!;
    expect(error(scheduleShow(s, 'c-test', 0, clashId))).toMatch(/studio is already in use/);

    // Once the first channel frees its studio at lunch, the second channel can use it.
    s = ok(scheduleShow(s, s.channels[0]!.id, 1, null));
    expect(ok(scheduleShow(s, 'c-test', 1, clashId)).channels[1]!.schedule[1]).toBe(clashId);
  });

  it('refuses a host who is already on air on another channel', () => {
    const s = twoChannels();
    const host = scheduled(s, 0).hostId;
    // Added by hand: the host's show limit would otherwise stop this show being created.
    s.shows.push({ id: 's-test', name: 'Moonlighting', genre: 'talk', hostId: host, staffIds: [], studioId: roomOfKind(station(), 'radioTalkStudio'), freshness: 1 });
    expect(error(scheduleShow(s, 'c-test', 0, 's-test'))).toMatch(/host is already on air/);
  });

  it('checks the schedule again when a show changes studio', () => {
    let s = ok(createShow(twoChannels(), { name: 'Roaming', genre: 'top40', hostId: null, staffIds: [], studioId: null }));
    const id = s.lastId!;
    s = ok(scheduleShow(s, 'c-test', 0, id));
    const show = s.shows.find((sh) => sh.id === id)!;
    expect(error(updateShow(s, id, { ...inputOf(show), studioId: roomOfKind(s, 'radioStudio') }))).toMatch(/studio is already in use/);
  });
});

describe('refusals', () => {
  it('blocks every action once the company is bankrupt', () => {
    const s = { ...createInitialState(1), bankrupt: true };
    expect(error(rentRoom(s, 'A'))).toMatch(/bankrupt/);
  });

  it('refuses purchases the company can’t afford', () => {
    const withChannel = ok(createChannel(createInitialState(1), { name: 'X', logo }));
    const s = { ...ok(setRoomType(ok(rentRoom(withChannel, 'A')), 'A', 'office')), money: 100 };
    expect(error(placeFurniture(s, 'A', 'workstation', 0, 0))).toMatch(/Not enough money/);
    expect(error(buyLicense(s, withChannel.lastId!, 'capital'))).toMatch(/Not enough money/);
  });

  it('rejects rooms, channels, slots and shows that don’t exist', () => {
    const s = station();
    const channelId = s.channels[0]!.id;
    expect(error(rentRoom(s, 'Z'))).toMatch(/doesn’t exist/);
    expect(error(scheduleShow(s, 'nope', 0, null))).toMatch(/channel doesn’t exist/);
    expect(error(scheduleShow(s, channelId, 5, null))).toMatch(/time slot/);
    expect(error(scheduleShow(s, channelId, 0, 'nope'))).toMatch(/show doesn’t exist/);
  });
});
