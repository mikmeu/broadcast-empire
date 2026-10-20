import { describe, expect, it } from 'vitest';
import { COMFORT, CONTROL_ROOM, DECOR, GRACE, MS_PER_DAY, OFF_AIR_WARNING, SPEEDS } from '../config/balance';
import { getGenre } from '../config/genres';
import { STEPS } from '../config/guide';
import { TITLE_NAMES } from '../config/names';
import { CONTROL_ROOM_KIT, FURNITURE, ONE_DESK_ROOMS, RECEPTION, STUDIO_REQUIREMENTS, type FurnitureType, type RoomType } from '../config/office';
import { TO_RECORD } from '../config/voiceOver';
import { isNight } from '../ui/theme';
import { buildRoom, buyLicense, createChannel, createShow, hire, placeFurniture, scheduleShow, setChannelManager, type ActionResult } from './actions';
import { growthBot, sensibleBot } from './bots';
import { channelOffAirReason, crewFactor, showQuality, studioLevel } from './broadcast';
import { refreshMarket } from './content';
import { cables, crewing, crewPosts, headquartersMissing, masterControlRoom } from './control';
import { weeklyCost } from './economy';
import { addMissingEquipment, autoPlaceFurniture, setUpMasterControl } from './fixtures';
import { channelMeetingLiftToday } from './morale';
import { createInitialState } from './newGame';
import { controlRoomOf, employeesWithDesk, findFreeSpot, findRoom, isStudioReady, tvControlRooms } from './office';
import { Rng } from './rng';
import { proposeRoom } from './rooms';
import { SAVE_VERSION, fromSaveFile, toSaveFile } from './save';
import { effectiveSkill } from './staff';
import type { GameState, Person } from './state';
import { advance, tick } from './tick';
import { unlockAll } from './unlocks';
import { dirtPerDay, roomComfort } from './upkeep';
import { ARTICLES } from '../wiki/articles';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}
const error = (result: ActionResult) => (result.ok ? 'no error' : result.error);

/** A radio station from the sensible test player, a month on the air, with everything open, money to spare and two floors. */
const station = (): GameState => {
  const s = structuredClone(unlockAll(advance(sensibleBot(createInitialState(1)), 30)));
  s.money = 5_000_000;
  s.floorsUnlocked = 2;
  return s;
};

/** Hires a made-up person straight from the pool. Their id is `lastId`. */
function hirePerson(state: GameState, person: Partial<Person> & Pick<Person, 'role'>): GameState & { lastId?: string } {
  const s = structuredClone(state);
  const id = `p-${s.nextId++}`;
  s.candidates.push({ id, name: `Test ${person.role} ${id}`, skill: 50, salary: 2_000, specialties: [], fame: 0, department: null, ...person });
  return Object.assign(ok(hire(s, id)), { lastId: id });
}

/** Builds a room of a kind where the game proposes it, with everything on its checklist and more pieces. Its id is `lastId`. */
function room(state: GameState, type: RoomType, ...extra: FurnitureType[]): GameState & { lastId?: string } {
  const floor = [1, 2].find((f) => proposeRoom(state, f, type))!;
  let s = ok(buildRoom(state, { ...proposeRoom(state, floor, type)!, type }));
  const id = s.lastId!;
  if (STUDIO_REQUIREMENTS[type]) s = ok(addMissingEquipment(s, id));
  for (const piece of extra) s = ok(autoPlaceFurniture(s, id, piece));
  return Object.assign(s, { lastId: id });
}

/** A second channel, on the radio, with a license in Coaxia and a channel manager of its own at a desk. Its id is `lastId`. */
function secondChannel(state: GameState, medium: 'radio' | 'tv' = 'radio'): GameState & { lastId?: string } {
  let s = ok(createChannel(state, { name: 'Second', logo: { shape: 'square', color: '#000', initials: 'S2' }, medium }));
  const id = s.lastId!;
  s = ok(buyLicense(s, id, 'capital'));
  s = hirePerson(s, { role: 'channelManager' });
  const manager = s.lastId!;
  s = ok(autoPlaceFurniture(s, s.rooms.find((r) => r.type === 'managementOffice')!.roomId, 'managerDesk'));
  return Object.assign(ok(setChannelManager(s, id, manager)), { lastId: id });
}

/** A TV channel with a news show made in a TV news studio of its own, and a master control room. `tv` is the channel, `studio` the studio. */
function withNews(state: GameState): GameState & { tv: string; studio: string } {
  let s = setUpMasterControlOk(secondChannel(state, 'tv'));
  const tv = s.channels.at(-1)!.id;
  s = room(s, 'tvNewsStudio');
  const studio = s.lastId!;
  s = hirePerson(s, { role: 'host', specialties: ['tvNews'] });
  const host = s.lastId!;
  const staff: string[] = [];
  s = room(s, 'office');
  const office = s.lastId!;
  for (let n = 0; n < getGenre('tvNews').requiredStaff; n++) {
    s = hirePerson(s, { role: 'production' });
    staff.push(s.lastId!);
    s = ok(autoPlaceFurniture(s, office, 'workstation'));
  }
  s = ok(createShow(s, { name: 'The News', genre: 'tvNews', hostId: host, staffIds: staff, studioId: studio }));
  s = ok(scheduleShow(s, tv, 3, s.lastId!));
  return Object.assign(s, { tv, studio });
}
const setUpMasterControlOk = (s: GameState) => ok(setUpMasterControl(s));

describe('version 0.16.0', () => {
  it('runs four times slower, at the same speeds (R135)', () => {
    expect(MS_PER_DAY).toBe(16_000);
    expect(SPEEDS).toEqual([0, 1, 2, 4]);
  });

  describe('the company itself (R136)', () => {
    it('goes on the air only with a CEO’s office and a reception desk', () => {
      const s = station();
      const channel = s.channels[0]!;
      expect(headquartersMissing(s)).toEqual([]);
      expect(channelOffAirReason(s, channel)).toBeNull();
      const noDesk = { ...s, rooms: s.rooms.filter((r) => r.roomId !== RECEPTION.id) };
      expect(channelOffAirReason(noDesk, channel)).toBe('No reception desk');
      const noOffice = { ...s, rooms: s.rooms.filter((r) => r.type !== 'ceoOffice') };
      expect(channelOffAirReason(noOffice, channel)).toBe('No CEO’s office with its desk');
      const neither = { ...noOffice, rooms: noOffice.rooms.filter((r) => r.roomId !== RECEPTION.id) };
      expect(channelOffAirReason(neither, channel)).toBe('No CEO’s office and no reception desk');
      // An empty CEO's office is not enough.
      const empty = { ...s, rooms: s.rooms.map((r) => (r.type === 'ceoOffice' ? { ...r, furniture: [] } : r)) };
      expect(channelOffAirReason(empty, channel)).toBe('No CEO’s office with its desk');
      // A game from before 0.16.0 waits for it.
      expect(channelOffAirReason({ ...neither, grace: { headquarters: s.day + GRACE.days } }, channel)).toBeNull();
    });

    it('is where Penny starts, and the test players too', () => {
      expect(STEPS.slice(0, 6).map((line) => line.id)).toEqual(['look-around', 'ceo-office', 'reception', 'studio', 'equipment', 'mcr']);
      expect(STEPS.findIndex((line) => line.id === 'technician-hire')).toBe(STEPS.findIndex((line) => line.id === 'cleaner') + 1);
      expect(STEPS.findIndex((line) => line.id === 'clock')).toBe(STEPS.findIndex((line) => line.id === 'play') + 1);
      // `mcr` is left out: it gets new words in 0.17.0 (#46).
      for (const id of ['look-around', 'ceo-office', 'reception', 'technician-hire', 'clock', 'master-control']) expect(TO_RECORD[id]).toBeUndefined();
      const bot = sensibleBot(createInitialState(2));
      expect(headquartersMissing(bot)).toEqual([]);
      expect(bot).not.toHaveProperty('lastId');
    });
  });

  describe('the master control room (R45)', () => {
    it('is needed for every channel, with a technician at its desk', () => {
      const withRoom = secondChannel(station());
      const [first, second] = withRoom.channels;
      // The test player built one with its first station.
      expect(masterControlRoom(withRoom)).toBeDefined();
      for (const channel of withRoom.channels) expect(channelOffAirReason(withRoom, channel)).toBeNull();
      const without = { ...withRoom, rooms: withRoom.rooms.filter((r) => r.type !== 'masterControl') };
      expect(channelOffAirReason(without, first!)).toMatch(/No master control room/);
      expect(channelOffAirReason(without, second!)).toMatch(/No master control room/);
      expect(channelOffAirReason({ ...without, grace: { masterControl: withRoom.day + 1 } }, first!)).toBeNull();
      let s: GameState = ok(setUpMasterControl(without));
      expect(masterControlRoom(s)).toBeDefined();
      expect(STUDIO_REQUIREMENTS.masterControl).toEqual({ mcrDesk: 1, monitorWall: 1 });
      expect(channelOffAirReason(s, second!)).toBeNull();
      expect(crewPosts(s).map((p) => p.key)).toEqual(['mcr']);
      // Without a technician nobody works it.
      const nobody = { ...s, employees: s.employees.filter((e) => e.role !== 'technician') };
      expect(channelOffAirReason(nobody, second!)).toMatch(/Nobody works the master control room/);
      // Nor without its wall of monitors.
      const bare = { ...s, rooms: s.rooms.map((r) => (r.type === 'masterControl' ? { ...r, furniture: r.furniture.filter((f) => f.type !== 'monitorWall') } : r)) };
      expect(channelOffAirReason(bare, second!)).toMatch(/No master control room/);
    });

    it('serves the second channel of a growing test player as well', () => {
      let s = createInitialState(1);
      for (let day = 0; day < 3 * 365 && s.channels.length < 2; day++) s = tick(growthBot(s));
      s = advance(s, 7);
      expect(s.channels).toHaveLength(2);
      expect(masterControlRoom(s)).toBeDefined();
      for (const channel of s.channels) expect(channelOffAirReason(s, channel)).toBeNull();
      // Every manager in a room of their own (R132).
      expect(s.rooms.filter((r) => r.type === 'managementOffice').every((r) => r.furniture.filter((f) => f.type === 'managerDesk').length <= 1)).toBe(true);
    });
  });

  describe('a control room for every TV studio (R131)', () => {
    it('holds the studio’s control desk and audio mixer, next door, for that studio alone', () => {
      const s = room(station(), 'tvNewsStudio');
      const studio = s.lastId!;
      const control = controlRoomOf(s, studio)!;
      expect(control).toBeDefined();
      expect(control.furniture.map((f) => f.type).sort()).toEqual([...CONTROL_ROOM_KIT].sort());
      expect(findRoom(s, studio)!.furniture.some((f) => CONTROL_ROOM_KIT.includes(f.type))).toBe(false);
      expect(isStudioReady(s, findRoom(s, studio)!)).toBe(true);
      expect(error(placeFurniture(s, studio, 'controlDesk', 0, 0))).toMatch(/doesn't belong/);
      // Without its audio mixer the studio can't be used.
      const silent = { ...s, rooms: s.rooms.map((r) => (r.roomId === control.roomId ? { ...r, furniture: r.furniture.filter((f) => f.type !== 'audioMixer') } : r)) };
      expect(isStudioReady(silent, findRoom(silent, studio)!)).toBe(false);
      // A game from before 0.16.0 waits for it.
      expect(isStudioReady({ ...silent, grace: { controlRooms: s.day + 1 } }, findRoom(silent, studio)!)).toBe(true);
      // Two TV studios never share one.
      const two = room(s, 'tvTalkStudio');
      const pairs = [...tvControlRooms(two).values()].map((r) => r.roomId);
      expect(new Set(pairs).size).toBe(pairs.length);
    });

    it('is worked by a technician while its studio has shows on the schedule, which leaves less time for repairs', () => {
      const s = withNews(station());
      expect(crewPosts(s).map((p) => p.key)).toEqual(['mcr', s.studio]);
      // One technician: half a day at master control, half at the control room.
      expect(crewing(s).used).toBeCloseTo(1);
      expect(crewFactor(s, s.studio)).toBe(1);
      const show = s.shows.find((x) => x.studioId === s.studio)!;
      const level = studioLevel(s, show);
      // A second control room in use is more than one technician can work.
      const nobody = { ...s, employees: s.employees.filter((e) => e.role !== 'technician') };
      expect(crewFactor(nobody, s.studio)).toBe(CONTROL_ROOM.unmanned);
      expect(studioLevel(nobody, show)).toBeCloseTo(level * CONTROL_ROOM.unmanned);
      // The technician sits at the desk in the control room.
      const technician = s.employees.find((e) => e.role === 'technician')!;
      expect(tick(s).employees.find((e) => e.id === technician.id)!.location).toBe(controlRoomOf(s, s.studio)!.roomId);
    });
  });

  describe('one desk to a room (R132)', () => {
    it('in a management office, an editing room and an audio room', () => {
      // And a workshop with its trainer's desk, since 0.18.0.
      expect(ONE_DESK_ROOMS).toEqual({ managementOffice: 'managerDesk', editingRoom: 'editingDesk', audioRoom: 'audioDesk', workshop: 'trainerDesk' });
      let s = station();
      for (const [type, desk] of Object.entries(ONE_DESK_ROOMS) as [RoomType, FurnitureType][]) {
        const built = room(s, type, ...(STUDIO_REQUIREMENTS[type]?.[desk] ? [] : [desk]));
        s = built;
        const placed = findRoom(s, built.lastId!)!;
        expect(placed.furniture.filter((f) => f.type === desk)).toHaveLength(1);
        expect(findFreeSpot(s, placed, desk)).toBeNull();
        expect(error(placeFurniture(s, placed.roomId, desk, placed.w - FURNITURE[desk].w, 0))).toMatch(/has room for one/);
      }
    });

    it('sells the extra desks of an older game back, keeping the channel manager’s', () => {
      let s = station();
      s = hirePerson(s, { role: 'manager', department: 'production' });
      const office = s.rooms.find((r) => r.type === 'managementOffice')!;
      // Two desks in one room, as an older game could have them.
      office.furniture.push({ ...office.furniture.find((f) => f.type === 'managerDesk')!, id: 'f-extra', x: office.w - 2, y: 0 });
      const channelManager = s.employees.find((e) => e.role === 'channelManager')!;
      const save = JSON.parse(JSON.stringify(toSaveFile(s, 0)));
      delete save.state.offAir;
      delete save.state.grace;
      const { state, version } = fromSaveFile({ ...save, version: 31 });
      expect(version).toBe(SAVE_VERSION);
      expect(SAVE_VERSION).toBeGreaterThanOrEqual(32);
      expect(state.rooms.find((r) => r.roomId === office.roomId)!.furniture.filter((f) => f.type === 'managerDesk')).toHaveLength(1);
      expect(state.money).toBeGreaterThan(s.money);
      expect(employeesWithDesk(state).has(channelManager.id)).toBe(true);
      expect(state.messages.at(-1)!.text).toMatch(/One desk to a room now/);
      expect(state.offAir).toEqual({});
      expect(state.grace).toEqual({});
    });

    it('gives an older game a month for what the new rules ask for', () => {
      const s = secondChannel(station());
      const old = { ...s, rooms: s.rooms.filter((r) => r.roomId !== RECEPTION.id && r.type !== 'masterControl') };
      const { state } = fromSaveFile({ ...JSON.parse(JSON.stringify(toSaveFile(old, 0))), version: 31 });
      expect(state.grace).toEqual({ headquarters: s.day + GRACE.days, masterControl: s.day + GRACE.days });
      for (const channel of state.channels) expect(channelOffAirReason(state, channel)).toBeNull();
      expect(state.messages.slice(-2).map((m) => m.text)).toEqual([expect.stringMatching(/a desk at the reception/), expect.stringMatching(/master control room/)]);
      const later = { ...state, day: state.day + GRACE.days };
      expect(channelOffAirReason(later, state.channels[0]!)).toBe('No reception desk');
    });
  });

  describe('a warning after a week off the air (R138)', () => {
    it('for a channel, once, and again when it stops once more', () => {
      let s = station();
      const channel = s.channels[0]!;
      const manager = channel.managerId!;
      s.channels[0]!.managerId = null;
      const warnings = (x: GameState) => x.messages.filter((m) => /off the air for a week/.test(m.text));
      s = advance(s, OFF_AIR_WARNING.days - 1);
      expect(warnings(s)).toHaveLength(0);
      s = tick(s);
      expect(warnings(s).map((m) => m.text)).toEqual([`${channel.name} has been off the air for a week: no channel manager.`]);
      s = advance(s, OFF_AIR_WARNING.days);
      expect(warnings(s)).toHaveLength(1);
      // On the air again, it is forgotten; off again, it is told again.
      s = ok(setChannelManager(s, channel.id, manager));
      s = tick(s);
      expect(s.offAir[channel.id]).toBeUndefined();
      s.channels[0]!.managerId = null;
      s = advance(s, OFF_AIR_WARNING.days);
      expect(warnings(s)).toHaveLength(2);
    });

    it('for a show on the schedule that does not go out', () => {
      let s = station();
      const show = s.shows.find((x) => x.hostId)!;
      show.hostId = null;
      s = advance(s, OFF_AIR_WARNING.days);
      expect(s.messages.filter((m) => m.text.includes(`“${show.name}” has not gone out for a week: no host.`))).toHaveLength(1);
    });
  });

  describe('decor that does something (R128)', () => {
    it('a production calendar and a sales chart help the staff in their office', () => {
      let s = hirePerson(station(), { role: 'sales', skill: 50 });
      const salesperson = s.lastId!;
      const office = s.rooms.find((r) => r.type === 'office')!.roomId;
      s = ok(autoPlaceFurniture(s, office, 'workstation'));
      const producer = s.employees.find((e) => e.role === 'production' && employeesWithDesk(s).get(e.id)?.roomId === office)!;
      const skill = (x: GameState, id: string) => effectiveSkill(x, x.employees.find((e) => e.id === id)!, employeesWithDesk(x));
      const before = [skill(s, producer.id), skill(s, salesperson)];
      s = ok(autoPlaceFurniture(ok(autoPlaceFurniture(s, office, 'calendar')), office, 'salesChart'));
      expect(skill(s, producer.id)).toBeCloseTo(before[0]! * (1 + DECOR.calendar));
      expect(skill(s, salesperson)).toBeCloseTo(before[1]! * (1 + DECOR.salesChart));
    });

    it('a printer makes campaigns cheaper; a bin and a dishwasher keep rooms clean for longer', () => {
      let s = station();
      const office = s.rooms.find((r) => r.type === 'office')!.roomId;
      expect(weeklyCost(s, 2_500)).toBe(2_500);
      s = ok(autoPlaceFurniture(s, office, 'printer'));
      expect(weeklyCost(s, 2_500)).toBeCloseTo(2_500 * (1 - DECOR.printer));
      const dirt = (x: GameState, id: string) => dirtPerDay(x, findRoom(x, id)!, employeesWithDesk(x));
      const before = dirt(s, office);
      s = ok(autoPlaceFurniture(s, office, 'bin'));
      expect(dirt(s, office)).toBeCloseTo(before * (1 - DECOR.bin));
      const canteen = s.rooms.find((r) => r.type === 'canteen')!.roomId;
      const messy = dirt(s, canteen);
      s = ok(autoPlaceFurniture(s, canteen, 'dishwasher'));
      expect(dirt(s, canteen)).toBeCloseTo(messy * (1 - DECOR.dishwasher));
    });

    it('an aquarium counts as three pieces of comfort, and a flip chart makes meetings better', () => {
      let s = station();
      const office = s.rooms.find((r) => r.type === 'office')!.roomId;
      s = ok(autoPlaceFurniture(s, office, 'aquarium'));
      expect(FURNITURE.aquarium.comfort).toBe(3);
      expect(roomComfort(findRoom(s, office)!)).toBe(3 * COMFORT.perPiece);
      for (let n = 0; n < 4; n++) s = ok(autoPlaceFurniture(s, office, 'planter'));
      // The best four pieces count.
      expect(roomComfort(findRoom(s, office)!)).toBe((3 + 3) * COMFORT.perPiece);

      const withRoom = room(s, 'meetingRoom');
      const meetingRoom = withRoom.lastId!;
      s = withRoom;
      // Its production staff meet with the channel manager (0.17.0).
      const channel = s.channels[0]!.id;
      const lift = channelMeetingLiftToday(s, channel);
      expect(lift).toBeGreaterThan(0);
      s = ok(autoPlaceFurniture(s, meetingRoom, 'flipChart'));
      expect(channelMeetingLiftToday(s, channel)).toBeCloseTo(lift * (1 + DECOR.flipChart), 0);
    });
  });

  it('a recording booth makes the shows of its audio engineer better (R130)', () => {
    let s = room(station(), 'audioRoom');
    const audio = s.lastId!;
    s = hirePerson(s, { role: 'engineer', skill: 60 });
    s = tick(s);
    const show = s.shows.find((x) => getGenre(x.genre).medium === 'radio' && x.studioId)!;
    const before = showQuality(s, show);
    expect(before.recorded).toBe(1);
    s = ok(autoPlaceFurniture(s, audio, 'recordingBooth'));
    const after = showQuality(s, show);
    expect(after.recorded).toBe(1 + DECOR.recordingBooth);
    expect(after.quality).toBeCloseTo(before.quality * (1 + DECOR.recordingBooth));
  });

  it('cartoons are bought for the library, for the families (R134)', () => {
    const cartoons = getGenre('cartoons');
    expect(cartoons).toMatchObject({ kind: 'licensed', medium: 'tv', studio: 'library' });
    expect(cartoons.fit.families).toBe(1);
    expect(TITLE_NAMES.cartoons).toBeDefined();
    const s = structuredClone(createInitialState(1));
    refreshMarket(s, new Rng(5));
    expect(s.market.titles.filter((t) => t.genre === 'cartoons')).toHaveLength(4);
  });

  it('the cables run from every studio to master control or the antenna (R127)', () => {
    let s = station();
    const onAir = (x: GameState) => (channel: GameState['channels'][number]) => channelOffAirReason(x, channel) === null;
    const studios = s.rooms.filter((r) => r.type === 'radioStudio' || r.type === 'radioTalkStudio').map((r) => r.roomId);
    // Without a master control room they would go straight to the antenna; the channel is off the air then, so they are cut.
    const bare = { ...s, rooms: s.rooms.filter((r) => r.type !== 'masterControl') };
    expect(cables(bare, onAir(bare)).map((c) => [c.from, c.to, c.status])).toEqual(studios.map((id) => [id, 'antenna', 'cut']));
    s = secondChannel(s);
    const mcr = masterControlRoom(s)!.roomId;
    const wired = cables(s, onAir(s));
    expect(wired.filter((c) => c.to === 'mcr').map((c) => c.from)).toEqual(studios);
    expect(wired.filter((c) => c.from === mcr).map((c) => c.to)).toEqual(['antenna']);
    // The studio of a show on the air is live; the dish comes with the satellite uplink.
    const live = s.shows.find((x) => s.channels[0]!.schedule.includes(x.id) && x.studioId)!.studioId!;
    expect(wired.find((c) => c.from === live)!.status).toBe('live');
    expect(cables({ ...s, techs: [...s.techs, 'satelliteUplink'] }, onAir(s)).filter((c) => c.from === mcr).map((c) => c.to)).toEqual(['antenna', 'dish']);
  });

  it('a new game opens in the light, and the wiki says how the clock and the cables go (R137, R139)', () => {
    expect(isNight(0)).toBe(false);
    const text = ARTICLES.map((a) => JSON.stringify(a.sections)).join('\n');
    expect(text).toMatch(/second half of the month/);
    expect(text).toMatch(/“Cables”/);
    expect(text).toMatch(/\*\*Rooms\*\* in the menu/);
    expect(ARTICLES.some((a) => a.id === 'headquarters')).toBe(true);
  });
});
