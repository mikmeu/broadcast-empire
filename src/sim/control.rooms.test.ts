import { describe, expect, it } from 'vitest';
import { CONTROL_ROOM } from '../config/balance';
import { getGenre } from '../config/genres';
import { CONTROL_ROOM_KIT, STUDIO_REQUIREMENTS, type FurnitureType, type RoomType } from '../config/office';
import { buildRoom, buyLicense, createChannel, createShow, hire, placeFurniture, scheduleShow, setChannelManager, type ActionResult } from './actions';
import { growthBot, sensibleBot } from './bots';
import { channelOffAirReason, crewFactor, studioLevel } from './broadcast';
import { cables, crewing, crewPosts, masterControlRoom } from './control';
import { addMissingEquipment, autoPlaceFurniture, setUpMasterControl } from './fixtures';
import { createInitialState } from './newGame';
import { controlRoomOf, findRoom, isStudioReady, tvControlRooms } from './office';
import { proposeRoom } from './rooms';
import type { GameState, Person } from './state';
import { advance, tick } from './tick';
import { unlockAll } from './unlocks';

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
});
