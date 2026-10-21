import { describe, expect, it } from 'vitest';
import { COMFORT, MORALE } from '../config/balance';
import { getGenre } from '../config/genres';
import { AUDIENCE_PER_SEATING, FURNITURE, RECEPTION, ROOM_TYPE_NAMES, SET_TYPES, STUDIO_REQUIREMENTS, TITLES_PER_RACK, TITLES_PER_SHELF, type FurnitureType, type RoomType } from '../config/office';
import { TECHS } from '../config/tech';
import { FURNITURE_ASSETS } from '../office/assets';
import { DAY, airtimes, receptionistName, tripsOf } from '../office/day';
import { DAY_BEATS, SERVICE, audienceBlocks, beatOfHour, hourOfBeat, peopleAt, showsOnAir, slotAt, spotsAt, whereabouts } from '../office/layout';
import { createShow, placeFurniture, releaseRoom, sellFurniture, setRoomType, type ActionResult } from './actions';
import { addMissingEquipment, autoPlaceFurniture, rentRoom, setUpPostRoom } from './fixtures';
import { missingSet, showQuality, studioLevel } from './broadcast';
import { sensibleBot } from './bots';
import { libraryCapacity } from './content';
import { createInitialState } from './newGame';
import { allRooms, employeesWithDesk, findRoom, isFurnished, isStudioReady, missingFurniture, monthlyRent, placementError, requirements } from './office';
import { kindError } from './rooms';
import { fromSaveFile, toSaveFile } from './save';
import type { GameState } from './state';
import { eraTier, lockedTiers, purchaseTier, saleBlocker } from './tech';
import { tick } from './tick';
import { canteenComfort, canteenCoverage, comfort, hasToilets, moraleTarget } from './upkeep';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
const error = (result: ActionResult) => (result.ok ? '' : result.error);
const rich = (s: GameState): GameState => ({ ...s, money: 5_000_000 });
const room = (s: GameState, id: string) => findRoom(s, id)!;
const rent = (s: GameState, id: string, type: RoomType) => ok(setRoomType(ok(rentRoom(s, id)), id, type));
const owning = (s: GameState, ...techs: GameState['techs']): GameState => ({ ...s, techs: [...s.techs, ...techs] });
const place = (s: GameState, id: string, ...types: FurnitureType[]) => types.reduce((next, type) => ok(autoPlaceFurniture(next, id, type)), s);

/** The sensible bot's station after a month, with money to spend and without its canteen, so morale has room to move. */
function station(): GameState {
  let s = createInitialState(1);
  for (let day = 0; day < 30; day++) s = tick(sensibleBot(s));
  return rich({ ...s, rooms: s.rooms.filter((r) => r.type !== 'canteen') });
}

describe('the new pieces', () => {
  it('every piece has a price, a size, a room and a model; every room has a name and something to put in it', () => {
    for (const [type, spec] of Object.entries(FURNITURE)) {
      expect(spec.cost, type).toBeGreaterThan(0);
      expect(spec.w * spec.h, type).toBeGreaterThan(0);
      expect(spec.rooms.length, type).toBeGreaterThan(0);
      expect(FURNITURE_ASSETS[type as FurnitureType].parts.length, type).toBeGreaterThan(0);
    }
    for (const type of Object.keys(ROOM_TYPE_NAMES) as RoomType[]) expect(Object.values(FURNITURE).some((spec) => spec.rooms.includes(type)), type).toBe(true);
    // A planter goes in every kind of room.
    expect(FURNITURE.planter.rooms).toHaveLength(Object.keys(ROOM_TYPE_NAMES).length);
  });

  it('the loose microphone is no longer sold or needed, but one from an older game stays and can be sold', () => {
    let s = rent(rich(createInitialState(1)), 'C', 'radioStudio');
    expect(error(placeFurniture(s, 'C', 'microphone', 0, 0))).toMatch(/no longer sold/);
    expect(Object.values(STUDIO_REQUIREMENTS).some((list) => list && 'microphone' in list)).toBe(false);
    s = ok(addMissingEquipment(s, 'C'));
    expect(room(s, 'C').furniture.map((f) => f.type).sort()).toEqual(['mixingDesk', 'onAirLight']);
    // One that is already there:
    room(s, 'C').furniture.push({ id: 'old-mic', type: 'microphone', x: 3, y: 4, turn: 0, tier: 1, condition: 100, boughtOn: s.day });
    expect(isStudioReady(s, room(s, 'C'))).toBe(true);
    expect(lockedTiers(s, 'microphone')).toEqual([]);
    expect(ok(sellFurniture(s, 'C', 'old-mic')).money).toBeGreaterThan(s.money);
  });

  it('the mixing desk has a fourth tier, and seats two guests from the second', () => {
    expect(eraTier('radio', 2009)).toBe(3);
    expect(eraTier('radio', 2010)).toBe(4);
    expect(spotsAt('mixingDesk', 1)).toHaveLength(1);
    for (const tier of [2, 3, 4]) expect(spotsAt('mixingDesk', tier)).toHaveLength(3);
    // Every tier of the pieces with photos has its own look.
    for (const type of ['mixingDesk', 'camera', 'controlDesk'] as const) {
      const looks = [1, 2, 3].map((tier) => JSON.stringify(FURNITURE_ASSETS[type].parts.filter((p) => !p.tiers || (tier >= p.tiers[0] && tier <= p.tiers[1]))));
      expect(new Set(looks).size, type).toBe(3);
    }
  });

  it('a radio talk studio needs a talk table only until its own mixing desk seats the guests', () => {
    let s = rent(rich(createInitialState(1)), 'A', 'radioTalkStudio');
    expect(requirements(room(s, 'A')).map(([type]) => type)).toEqual(['mixingDesk', 'talkTable', 'onAirLight']);
    s = place(owning(s, 'fmStereo'), 'A', 'mixingDesk', 'onAirLight');
    expect(room(s, 'A').furniture[0]!.tier).toBe(2);
    expect(requirements(room(s, 'A')).map(([type]) => type)).toEqual(['mixingDesk', 'onAirLight']);
    expect(isStudioReady(s, room(s, 'A'))).toBe(true);
    // Buying what is missing does not buy a table that the new desk makes unnecessary.
    const fresh = rent(owning(rich(createInitialState(1)), 'fmStereo'), 'A', 'radioTalkStudio');
    const equipped = ok(addMissingEquipment(fresh, 'A'));
    expect(fresh.money - equipped.money).toBe(FURNITURE.mixingDesk.cost * 1.5 + FURNITURE.onAirLight.cost);
    expect(room(equipped, 'A').furniture.some((f) => f.type === 'talkTable')).toBe(false);
    // A tier 1 desk still needs the table.
    const old = ok(addMissingEquipment(rent(rich(createInitialState(1)), 'A', 'radioTalkStudio'), 'A'));
    expect(room(old, 'A').furniture.some((f) => f.type === 'talkTable')).toBe(true);
  });
});

describe('sets', () => {
  it('the soap opera decor and the game show decor are locked until researched, and so are their studios', () => {
    const s = rent(rich(createInitialState(1)), 'F', 'tvTalkStudio');
    expect(saleBlocker(s, 'set')).toBeNull();
    expect(saleBlocker(s, 'soapSet')).toMatch(/Research Soap operas/);
    expect(saleBlocker(s, 'gameShowSet')).toMatch(/Research Game shows/);
    expect(saleBlocker(owning(s, 'soapOperaFormat'), 'soapSet')).toBeNull();
    // A studio that is built around a decor waits for it too, and says so.
    expect(kindError(s, 'tvGameStudio')).toMatch(/needs the game show decor. Research Game shows first/);
    expect(error(setRoomType(ok(rentRoom(s, 'G')), 'G', 'tvSoapStudio'))).toMatch(/Research Soap operas/);
    expect(kindError(owning(s, 'gameShowFormat'), 'tvGameStudio')).toBeNull();
    expect(kindError(s, 'tvTalkStudio')).toBeNull();
    // Both technologies are in the tree, early and cheap.
    for (const id of ['soapOperaFormat', 'gameShowFormat']) expect(TECHS.find((t) => t.id === id)!.year).toBeLessThan(1975);
    expect(TECHS.map((t) => t.year)).toEqual([...TECHS.map((t) => t.year)].sort((a, b) => a - b));
  });

  it('each set stands in the studio of its own show and nowhere else, and that studio needs it', () => {
    const studios = { set: 'tvTalkStudio', gameShowSet: 'tvGameStudio', soapSet: 'tvSoapStudio', sitcomSet: 'tvSitcomStudio', kidsSet: 'tvKidsStudio', realitySet: 'tvRealityStudio' } as const;
    for (const set of SET_TYPES) {
      expect(FURNITURE[set].rooms, set).toEqual([studios[set as keyof typeof studios]]);
      const s = rent(owning(rich(createInitialState(1)), 'soapOperaFormat', 'gameShowFormat', 'realityFormat'), 'F', studios[set as keyof typeof studios]);
      // The reality studio also needs its confession booth (0.14.0).
      const booth = set === 'realitySet' ? ['confessionBooth'] : [];
      expect(missingFurniture(s, room(s, 'F')).map(([type]) => type), set).toEqual(['camera', 'studioLights', set, ...booth, 'controlDesk', 'audioMixer']);
      const full = ok(addMissingEquipment(s, 'F'));
      expect(isStudioReady(full, room(full, 'F'))).toBe(true);
      expect(room(full, 'F').furniture.filter((f) => SET_TYPES.includes(f.type)).map((f) => f.type)).toEqual([set]);
      for (const other of SET_TYPES.filter((t) => t !== set)) expect(placementError(full, room(full, 'F'), other, 0, 0), other).not.toBeNull();
    }
    expect(FURNITURE.confessionBooth.rooms).toEqual(['tvRealityStudio']);
  });

  it('a soap, a game show and a talk show are each made in their own kind of studio, on their own set', () => {
    expect([getGenre('soap').set, getGenre('gameShow').set, getGenre('talkShow').set]).toEqual(['soapSet', 'gameShowSet', 'set']);
    expect([getGenre('soap').studio, getGenre('gameShow').studio, getGenre('talkShow').studio]).toEqual(['tvSoapStudio', 'tvGameStudio', 'tvTalkStudio']);
    // Since 0.14.0 the sitcom, kids' shows and reality TV each have theirs too.
    expect([getGenre('sitcom').set, getGenre('kids').set, getGenre('reality').set]).toEqual(['sitcomSet', 'kidsSet', 'realitySet']);
    expect([getGenre('sitcom').studio, getGenre('kids').studio, getGenre('reality').studio]).toEqual(['tvSitcomStudio', 'tvKidsStudio', 'tvRealityStudio']);

    // On the second floor, where there is a place beside it for its control room (0.16.0).
    let s = owning({ ...station(), floorsUnlocked: 2 }, 'soapOperaFormat');
    s = rent(s, 'H', 'tvSoapStudio');
    const base = s.shows[0]!;
    const soap = { ...base, id: 'soap-show', genre: 'soap' as const, studioId: 'H' };
    s = { ...s, shows: [...s.shows, soap] };

    expect(missingSet(s, soap)).toBe('soapSet');
    expect(studioLevel(s, soap)).toBe(0);
    expect(showQuality(s, soap).problems).toContain('Its studio has no soap opera decor');

    const withDecor = ok(addMissingEquipment(s, 'H'));
    expect(missingSet(withDecor, soap)).toBeNull();
    expect(studioLevel(withDecor, soap)).toBeGreaterThan(0);
    expect(showQuality(withDecor, soap).problems).not.toContain('Its studio has no soap opera decor');
    // A show can't be given a studio of another kind.
    expect(error(createShow(withDecor, { name: 'Quiz', genre: 'gameShow', hostId: null, staffIds: [], studioId: 'H' }))).toMatch(/Game show needs a TV game show studio/);
  });
});

describe('the master control desk', () => {
  it('is the 1970s console until the personal computer, then the desk with flat screens', () => {
    const s = createInitialState(1);
    expect(purchaseTier(s, 'mcrDesk')).toBe(1);
    expect(purchaseTier(owning(s, 'personalComputer'), 'mcrDesk')).toBe(2);
    expect(lockedTiers(s, 'mcrDesk').map((l) => [l.tier, l.tech.id])).toEqual([[2, 'personalComputer']]);
  });
});

describe('the library and the canteen', () => {
  it('a server rack waits for the personal computer, and holds far more than a shelf', () => {
    let s = ok(setRoomType(ok(setUpPostRoom(ok(rentRoom(rich(createInitialState(1)), 'A')))), 'A', 'library'));
    expect(saleBlocker(s, 'serverRack')).toMatch(/Research Personal computer/);
    s = place(owning(s, 'personalComputer'), 'A', 'shelving', 'serverRack');
    expect(purchaseTier(s, 'serverRack')).toBe(1);
    expect(libraryCapacity(s)).toBe(TITLES_PER_SHELF + TITLES_PER_RACK[0]!);
    expect(lockedTiers(s, 'serverRack').map((l) => [l.tier, l.tech.id])).toEqual([[2, 'cloudProduction']]);

    const later = place(owning(s, 'cloudProduction'), 'A', 'serverRack');
    expect(room(later, 'A').furniture.at(-1)!.tier).toBe(2);
    expect(libraryCapacity(later)).toBe(TITLES_PER_SHELF + TITLES_PER_RACK[0]! + TITLES_PER_RACK[1]!);
    expect(lockedTiers(later, 'serverRack')).toEqual([]);
  });

  it('a canteen needs a fridge and a counter as well: one counter is enough', () => {
    let s = rent(station(), 'G', 'canteen');
    s = place(s, 'G', 'canteenTable', 'coffeeMachine', 'fridge');
    expect(canteenCoverage(s)).toBe(0);
    expect(missingFurniture(s, room(s, 'G'))).toEqual([['counter', 1]]);
    s = place(s, 'G', 'counter');
    expect(canteenCoverage(s)).toBeGreaterThan(0);
  });

  it('a canteen from an older game gets its fridge and counters with the update', () => {
    let s = rent(station(), 'G', 'canteen');
    s = place(s, 'G', 'canteenTable', 'coffeeMachine');
    // Version 14 is the last one from before the fridge and the counters.
    const { state } = fromSaveFile({ ...JSON.parse(JSON.stringify(toSaveFile(s, 0))), version: 14 });
    expect(isFurnished(room(state, 'G'))).toBe(true);
    expect(room(state, 'G').furniture.map((f) => f.type).sort()).toEqual(['canteenTable', 'coffeeMachine', 'counter', 'counter', 'fridge']);
    expect(new Set(allRooms(state).flatMap((r) => r.furniture.map((f) => f.id))).size).toBe(allRooms(state).flatMap((r) => r.furniture).length);
    // Nothing is charged for them. (Step 27 of the update pays the month's bills that a save from before 0.12.0 still owed.)
    expect(state.money).toBeCloseTo(s.money - s.ledger.salaries - s.ledger.rent - s.ledger.licenseFees, 6);
  });
});

describe('comfort', () => {
  it('comfort pieces lift the morale of those who work in the room, up to four of them', () => {
    const s = station();
    const worker = s.employees.find((e) => e.role === 'production')!;
    const desked = employeesWithDesk(s);
    const office = desked.get(worker.id)!.roomId;
    const before = moraleTarget(s, worker, desked);
    const one = place(s, office, 'planter');
    expect(moraleTarget(one, worker, employeesWithDesk(one))).toBe(before + COMFORT.perPiece);
    let many = s;
    for (let i = 0; i < 6; i++) many = place(many, office, 'planter');
    expect(comfort(many, worker, employeesWithDesk(many))).toBe(COMFORT.maxPieces * COMFORT.perPiece);
    // Someone who works elsewhere gets nothing from it.
    const host = s.employees.find((e) => e.role === 'host')!;
    expect(comfort(many, host, employeesWithDesk(many))).toBe(0);
  });

  it('a couch, a TV and a radio in the canteen count for everyone it has a seat for', () => {
    // One table: a seat for some, not for all.
    let s = ok(addMissingEquipment(rent(station(), 'G', 'canteen'), 'G'));
    const share = canteenCoverage(s);
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThan(1);
    expect(canteenComfort(s)).toBe(0);
    s = place(s, 'G', 'couch', 'tvScreen', 'radio');
    expect(canteenComfort(s)).toBeCloseTo(3 * COMFORT.perPiece * share);
    const worker = s.employees.find((e) => e.role === 'production')!;
    expect(moraleTarget(s, worker, employeesWithDesk(s))).toBeCloseTo(MORALE.neutral + (MORALE.canteenBonus + 3 * COMFORT.perPiece) * share);
    // With a seat for everyone, the canteen and its comfort count in full; since 0.15.0 that is no longer 100 by itself.
    const few = { ...s, employees: [worker, ...s.employees.filter((e) => e !== worker).slice(0, 5)] };
    expect(canteenCoverage(few)).toBe(1);
    expect(moraleTarget(few, worker, employeesWithDesk(few))).toBeCloseTo(MORALE.neutral + MORALE.canteenBonus + 3 * COMFORT.perPiece + comfort(few, worker, employeesWithDesk(few)));
    expect(moraleTarget(few, worker, employeesWithDesk(few))).toBeLessThan(100);
  });

  it('toilets with two toilets and two sinks lift morale on their floor', () => {
    // In G: the test player's own office stands where D is (0.16.0).
    let s = rent(station(), 'G', 'toilets');
    const worker = s.employees.find((e) => e.role === 'production')!;
    const before = moraleTarget(s, worker, employeesWithDesk(s));
    s = place(s, 'G', 'toilet', 'toilet', 'sink');
    expect(hasToilets(s, 1)).toBe(false);
    s = place(s, 'G', 'sink');
    expect(hasToilets(s, 1)).toBe(true);
    expect(hasToilets(s, 2)).toBe(false);
    expect(moraleTarget(s, worker, employeesWithDesk(s))).toBe(before + COMFORT.toilets);
  });
});

describe('the reception', () => {
  it('comes with the building: no rent, no renting, no giving up, and only reception furniture', () => {
    const s = rich(createInitialState(1));
    expect(s.rooms).toEqual([]);
    expect(room(s, RECEPTION.id)).toMatchObject({ type: 'reception', furniture: [] });
    expect(monthlyRent(room(s, RECEPTION.id), s)).toBe(0);
    expect(error(rentRoom(s, RECEPTION.id))).toMatch(/comes with the building/);
    expect(error(setRoomType(s, RECEPTION.id, 'office'))).toMatch(/can’t be moved/);
    expect(error(setRoomType(ok(rentRoom(s, 'A')), 'A', 'reception'))).toMatch(/can’t be moved/);
    expect(error(placeFurniture(s, RECEPTION.id, 'workstation', 0, 0))).toMatch(/doesn't belong/);
    expect(isFurnished(room(s, RECEPTION.id))).toBe(false);
  });

  it('gets its desk, a couch and a planter like any room, and keeps them', () => {
    let s = place(rich(createInitialState(1)), RECEPTION.id, 'receptionDesk', 'couch', 'planter');
    expect(s.rooms.map((r) => r.roomId)).toEqual([RECEPTION.id]);
    expect(isFurnished(room(s, RECEPTION.id))).toBe(true);
    expect(error(releaseRoom(s, RECEPTION.id))).toMatch(/comes with the building/);
    s = tick(s);
    expect(room(s, RECEPTION.id).furniture).toHaveLength(3);
    // And it is not charged for.
    for (let day = 0; day < 40; day++) s = tick(s);
    expect(s.monthlyReports[0]!.rent).toBe(0);
  });
});

describe('who is in the office besides the staff', () => {
  /** Everyone who is in the building at a beat. */
  const everyone = (s: GameState, beat: number) => [...peopleAt(s, beat).values()];

  it('a receptionist sits at the reception desk', () => {
    // The test player has a reception desk from the first day (0.16.0): this is the station without it.
    const s = { ...station(), rooms: station().rooms.filter((r) => r.roomId !== RECEPTION.id) };
    expect(everyone(s, 0).some((p) => p.role === 'visitor')).toBe(false);
    const withDesk = place(s, RECEPTION.id, 'receptionDesk');
    const receptionist = everyone(withDesk, 0).filter((p) => p.roomId === RECEPTION.id && p.role !== 'ceo');
    // All day, from the first minute to the last.
    expect(everyone(withDesk, DAY_BEATS - 1).some((p) => p.id === receptionist[0]?.id)).toBe(true);
    expect(receptionist).toHaveLength(1);
    expect(receptionist[0]).toMatchObject({ role: 'visitor', activity: 'sit', floor: 1, name: receptionistName(s.seed) });
    expect(whereabouts(withDesk, receptionist[0]!)).toBe('The receptionist, at the reception desk.');
    // Inside the hall, which lies west of the corridor.
    expect(receptionist[0]!.x).toBeLessThan(0);
  });

  it('an audience of ten fills a block of seating from before a show in that studio until after it', () => {
    let s = station();
    const studio = s.shows.find((show) => show.studioId)!.studioId!;
    // Seating does not belong in a radio studio, so give the room the kind that takes it.
    s = { ...s, rooms: s.rooms.map((r) => (r.roomId === studio ? { ...r, type: 'tvKidsStudio' as const, furniture: [] } : r)) };
    s = place(s, studio, 'audienceSeating');
    let withShow = 0;
    for (let beat = 0; beat < DAY_BEATS; beat++) {
      const audience = everyone(s, beat).filter((p) => p.id.startsWith('visitor-audience'));
      const hour = hourOfBeat(beat);
      const live = s.shows.some((show) => show.studioId === studio && airtimes(s, show).some(([from, to]) => hour >= from - DAY.audienceBefore && hour < to + DAY.audienceAfter));
      // They are in their seats whenever a show is on.
      if (showsOnAir(s, slotAt(beat)).some((show) => show.studioId === studio)) expect(live).toBe(true);
      expect(audience.length, `beat ${beat}`).toBe(live ? AUDIENCE_PER_SEATING : 0);
      for (const p of audience) expect(p).toMatchObject({ roomId: studio, activity: 'sit', role: 'visitor' });
      // The rows are steps: the back rows sit higher.
      if (live) expect(new Set(audience.map((p) => p.y)).size).toBe(3);
      withShow += live ? 1 : 0;
    }
    expect(withShow).toBeGreaterThan(0);
  });

  it('everyone in the audience has a name, the same all the time and the same as on the bus (#72)', () => {
    let s = station();
    const studio = s.shows.find((show) => show.studioId)!.studioId!;
    s = { ...s, rooms: s.rooms.map((r) => (r.roomId === studio ? { ...r, type: 'tvKidsStudio' as const, furniture: [] } : r)) };
    s = place(s, studio, 'audienceSeating');
    const names = new Map<string, string>();
    for (let beat = 0; beat < DAY_BEATS; beat++) {
      const audience = everyone(s, beat).filter((p) => p.id.startsWith('visitor-audience'));
      if (audience.length === 0) continue;
      // Real names, all different, not a label.
      expect(audience.every((p) => /^[A-Z][a-z]+ [A-Z]/.test(p.name) && !p.name.startsWith('Audience'))).toBe(true);
      expect(new Set(audience.map((p) => p.name)).size).toBe(audience.length);
      for (const p of audience) {
        const show = s.shows.find((x) => x.name === p.show)!;
        const key = `${show.id}:${p.id}`;
        expect(names.get(key) ?? p.name, key).toBe(p.name);
        names.set(key, p.name);
        expect(whereabouts(s, p)).toBe(`In the audience of “${p.show}”.`);
      }
    }
    expect(names.size).toBeGreaterThan(0);
    // The people who come by bus have the names of those in the seats.
    const riders = new Set(tripsOf(s, 0, audienceBlocks(s)).filter((t) => t.id.startsWith('audience-')).map((t) => t.name));
    expect(riders).toEqual(new Set(names.values()));
  });

  it('with toilets on the floor people go there; without, they go down the stairs', () => {
    const s = station();
    const away = (state: GameState) => Array.from({ length: DAY_BEATS }, (_, beat) => everyone(state, beat).filter((p) => p.status === 'away')).flat();
    expect(away(s).length).toBeGreaterThan(0);
    expect(away(s).every((p) => p.roomId === 'stairs' && p.away && p.x === SERVICE.stairs.at.x)).toBe(true);

    const withToilets = ok(addMissingEquipment(rent(s, 'G', 'toilets'), 'G'));
    const onFloor = away(withToilets).filter((p) => p.floor === 1);
    expect(onFloor.length).toBeGreaterThan(0);
    expect(onFloor.every((p) => p.roomId === 'G' && !p.away)).toBe(true);
    // Whoever gets a toilet sits; nobody shares one at the same moment.
    expect(onFloor.some((p) => p.activity === 'sit')).toBe(true);
    for (let beat = 0; beat < DAY_BEATS; beat++) {
      const seated = everyone(withToilets, beat).filter((p) => p.status === 'away' && p.activity === 'sit');
      expect(new Set(seated.map((p) => `${p.x}:${p.z}`)).size).toBe(seated.length);
    }
  });

  it('support staff with nothing to do wait in their own rooms by the entrance', () => {
    const s = station();
    const idle = everyone(s, beatOfHour(10)).filter((p) => p.roomId === 'technician' || p.roomId === 'cleaners');
    for (const p of idle) {
      expect(p.x).toBeLessThan(0);
      expect(p.role === 'cleaner' ? p.roomId : 'technician').toBe(p.roomId);
    }
  });
});
