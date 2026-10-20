import { describe, expect, it } from 'vitest';
import { FURNITURE, RENTABLE_ROOM_TYPES, ROOM_SIZES, STUDIO_REQUIREMENTS } from '../config/office';
import { deskSeats, peopleOnFloor } from '../office/layout';
import { assignDesk, buildRoom, moveFurniture, seatGroup, sellFurniture, setRoomType, type ActionResult } from './actions';
import { autoPlaceFurniture } from './fixtures';
import { sensibleBot } from './bots';
import { createInitialState } from './newGame';
import { deskFor, deskHolders, deskRoomFor, employeesWithDesk, findRoom, isStudioReady, needsDesk, ownDesk, ownerOf, workplacesIn } from './office';
import { kindError } from './rooms';
import { SAVE_VERSION, fromSaveFile, toSaveFile } from './save';
import type { Employee, GameState, Role } from './state';
import { tick } from './tick';
import { workplaces } from './upkeep';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
const error = (result: ActionResult) => (result.ok ? null : result.error);

/** A company on its first day as the test bot sets it up, with money and every floor, and a second office on floor 2 with four workstations. */
function company(): { s: GameState; first: string; second: string } {
  let s: GameState = { ...sensibleBot(createInitialState(1)), money: 5_000_000, floorsUnlocked: 3 };
  const first = s.rooms.find((r) => r.type === 'office')!.roomId;
  const built = buildRoom(s, { floor: 2, x: 0, y: 0, w: 8, h: 5, door: { x: 4.5, z: 5 }, type: 'office' });
  s = ok(built);
  const second = String(built.ok && built.id);
  for (let n = 0; n < 4; n++) s = ok(autoPlaceFurniture(s, second, 'workstation'));
  return { s, first, second };
}
const staff = (s: GameState, role: Role) => s.employees.filter((e) => e.role === role);
const person = (s: GameState, id: string) => s.employees.find((e) => e.id === id)!;
const add = (s: GameState, role: Role, n = 1): GameState => ({
  ...s,
  employees: [...s.employees, ...Array.from({ length: n }, (_, i): Employee => ({ id: `x-${role}-${i}`, name: `Extra ${role} ${i}`, role, skill: 50, salary: 1_000, specialties: [], fame: 0, department: null, hiredOn: s.day, xp: 0, level: 1, morale: 60, location: null, desk: null, trainingUntil: null, courseIn: null, leaving: null, talentUntil: null }))],
});

describe('who sits where (Phase 13f)', () => {
  it('knows which desk everyone works at, and seats nobody differently while no place is anybody’s own', () => {
    const { s, first } = company();
    const desked = employeesWithDesk(s);
    const workers = s.employees.filter((e) => needsDesk(e.role));
    expect(workers.length).toBeGreaterThan(3);
    for (const e of workers) expect(desked.has(e.id)).toBe(true);
    // Every desk is one piece of furniture, in a room of the right kind, and nobody shares one.
    const taken = [...desked.values()].map((d) => d.itemId);
    expect(new Set(taken).size).toBe(taken.length);
    for (const [id, desk] of desked) {
      const room = findRoom(s, desk.roomId)!;
      const item = room.furniture.find((f) => f.id === desk.itemId)!;
      expect(item.type).toBe(deskFor(person(s, id).role));
      expect(room.type).toBe(deskRoomFor(person(s, id).role));
      expect(deskSeats(s).get(id)!.item).toBe(item);
    }
    // The office staff fill the first office before the second, as they always did.
    for (const e of staff(s, 'production')) expect(desked.get(e.id)!.roomId).toBe(first);
    expect(deskHolders(s).size).toBe(desked.size);
  });

  it('gives someone a workplace of their own, and the others take what is left', () => {
    const { s: before, first, second } = company();
    const [anna, ben] = staff(before, 'production');
    const place = workplacesIn(findRoom(before, second)!)[2]!;
    const s = ok(assignDesk(before, anna!.id, place.id));
    expect(person(s, anna!.id).desk).toBe(place.id);
    expect(employeesWithDesk(s).get(anna!.id)).toEqual({ roomId: second, itemId: place.id, tier: place.tier });
    expect(ownDesk(s, person(s, anna!.id))).toMatchObject({ item: { id: place.id }, room: { roomId: second } });
    expect(ownerOf(s, place.id)!.id).toBe(anna!.id);
    expect(deskHolders(s).get(place.id)).toBe(anna!.id);
    // She is seen sitting there, and the room she works in is that office: its dirt and its comfort are hers.
    expect(peopleOnFloor(s, 2).find((p) => p.id === anna!.id)).toMatchObject({ roomId: second, activity: 'sit' });
    expect(workplaces(s, person(s, anna!.id), employeesWithDesk(s)).map((r) => r.roomId)).toEqual([second]);
    // Everyone else still has a desk, in the first office, and nobody else took hers.
    for (const e of before.employees.filter((x) => needsDesk(x.role) && x.id !== anna!.id)) expect(employeesWithDesk(s).has(e.id)).toBe(true);
    expect(employeesWithDesk(s).get(ben!.id)!.roomId).toBe(first);

    // Someone else gets that place: she takes what is free again.
    const swapped = ok(assignDesk(s, ben!.id, place.id));
    expect(person(swapped, anna!.id).desk).toBeNull();
    expect(ownerOf(swapped, place.id)!.id).toBe(ben!.id);
    expect(employeesWithDesk(swapped).get(anna!.id)!.roomId).toBe(first);
    // And she can let her own place go.
    const free = ok(assignDesk(s, anna!.id, null));
    expect(person(free, anna!.id).desk).toBeNull();
    expect(employeesWithDesk(free)).toEqual(employeesWithDesk(before));
    // It costs nothing.
    expect(s.money).toBe(before.money);
  });

  it('gives a workplace to those who work at one only, and each kind of desk to its own kind of staff', () => {
    const { s, second } = company();
    const place = workplacesIn(findRoom(s, second)!)[0]!;
    const management = s.rooms.find((r) => r.type === 'managementOffice')!;
    const desk = workplacesIn(management)[0]!;
    expect(error(assignDesk(s, staff(s, 'host')[0]!.id, place.id))).toMatch(/doesn’t work at a desk/);
    expect(error(assignDesk(s, staff(s, 'channelManager')[0]!.id, place.id))).toMatch(/works at a manager’s desk, in a management office/);
    expect(error(assignDesk(s, staff(s, 'production')[0]!.id, desk.id))).toMatch(/works at a workstation, in an office/);
    expect(error(assignDesk(s, 'nobody', place.id))).toMatch(/doesn’t work here/);
    expect(error(assignDesk(s, staff(s, 'production')[0]!.id, 'nothing'))).toMatch(/no place to work/);
    // A mixing desk is no workplace to be given out.
    const studio = s.rooms.find((r) => r.type === 'radioStudio')!;
    expect(error(assignDesk(s, staff(s, 'production')[0]!.id, studio.furniture[0]!.id))).toMatch(/no place to work/);
    // A manager gets a manager's desk of their own.
    const manager = staff(s, 'channelManager')[0]!;
    const given = ok(assignDesk(s, manager.id, desk.id));
    expect(employeesWithDesk(given).get(manager.id)!.itemId).toBe(desk.id);
  });

  it('lets someone whose own desk is broken take a free one until it is repaired', () => {
    const { s: before, first, second } = company();
    const anna = staff(before, 'production')[0]!;
    const place = workplacesIn(findRoom(before, second)!)[0]!;
    const s = ok(assignDesk(before, anna.id, place.id));
    const broken = structuredClone(s);
    findRoom(broken, second)!.furniture.find((f) => f.id === place.id)!.condition = 0;
    // The place stays hers, but she works elsewhere for now.
    expect(person(broken, anna.id).desk).toBe(place.id);
    expect(employeesWithDesk(broken).get(anna.id)!.itemId).not.toBe(place.id);
    expect(deskHolders(broken).has(place.id)).toBe(false);
    // Without a free desk anywhere she can't work, like anyone.
    const full = structuredClone(broken);
    for (const room of full.rooms.filter((r) => r.type === 'office')) room.furniture = room.furniture.filter((f) => f.id === place.id || room.roomId === first);
    const crowded = add(full, 'sales', workplacesIn(findRoom(full, first)!).length);
    expect(employeesWithDesk(crowded).size).toBeLessThan(crowded.employees.filter((e) => needsDesk(e.role)).length);
    // Repaired, she is back.
    findRoom(broken, second)!.furniture.find((f) => f.id === place.id)!.condition = 100;
    expect(employeesWithDesk(broken).get(anna.id)!.itemId).toBe(place.id);
  });

  it('keeps a place with its desk when it is moved, and frees its owner when it is sold', () => {
    const { s: before, first, second } = company();
    const anna = staff(before, 'production')[0]!;
    const place = workplacesIn(findRoom(before, second)!)[0]!;
    let s = ok(assignDesk(before, anna.id, place.id));
    s = ok(moveFurniture(s, second, place.id, { roomId: second, x: 6, y: 3 }));
    expect(employeesWithDesk(s).get(anna.id)!.itemId).toBe(place.id);
    expect(deskSeats(s).get(anna.id)!.item).toMatchObject({ x: 6, y: 3 });
    const sold = ok(sellFurniture(s, second, place.id));
    expect(person(sold, anna.id).desk).toBeNull();
    expect(employeesWithDesk(sold).get(anna.id)!.roomId).toBe(first);
    // A day goes by like any other.
    expect(tick(s).employees.find((e) => e.id === anna.id)!.desk).toBe(place.id);
  });

  it('gives the places of a room that are nobody’s own to one job, so that a department has an office to itself', () => {
    const { s: before, first, second } = company();
    const s = add(before, 'marketing', 3);
    const places = workplacesIn(findRoom(s, second)!);
    expect(places).toHaveLength(4);
    const seated = ok(seatGroup(s, second, 'marketing'));
    const marketers = staff(seated, 'marketing');
    for (const e of marketers) expect(ownDesk(seated, e)!.room.roomId).toBe(second);
    expect(new Set(marketers.map((e) => e.desk)).size).toBe(3);
    // Nobody else was moved: production has no places of its own and stays where it sat.
    for (const e of staff(seated, 'production')) {
      expect(e.desk).toBeNull();
      expect(employeesWithDesk(seated).get(e.id)!.roomId).toBe(first);
    }
    // Once more: everyone in marketing has a place. Another job gets the one that is left, and then the room is full.
    expect(error(seatGroup(seated, second, 'marketing'))).toMatch(/has a place of their own already/);
    const more = ok(seatGroup(add(seated, 'sales', 2), second, 'sales'));
    expect(staff(more, 'sales').filter((e) => e.desk !== null)).toHaveLength(1);
    expect(error(seatGroup(more, second, 'sales'))).toMatch(/somebody’s own already/);
    // Not for those who work elsewhere, and not in a room without such desks.
    expect(error(seatGroup(s, second, 'host'))).toMatch(/don’t work at a desk/);
    expect(error(seatGroup(s, second, 'channelManager'))).toMatch(/no workplace for them/);
    expect(error(seatGroup(s, 'nowhere', 'marketing'))).toMatch(/don’t have this room/);
    // The managers of the company get the desks of a management office the same way.
    const management = s.rooms.find((r) => r.type === 'managementOffice')!.roomId;
    const led = ok(seatGroup(s, management, 'channelManager'));
    for (const e of staff(led, 'channelManager')) expect(ownDesk(led, e)!.room.roomId).toBe(management);
  });

  it('keeps who has which place in a save, and gives nobody one in an older save', () => {
    const { s: before, second } = company();
    const anna = staff(before, 'production')[0]!;
    const place = workplacesIn(findRoom(before, second)!)[1]!;
    const s = ok(assignDesk(before, anna.id, place.id));
    const file = JSON.parse(JSON.stringify(toSaveFile(s, 0)));
    expect(person(fromSaveFile(file).state, anna.id).desk).toBe(place.id);
    for (const employee of file.state.employees) delete employee.desk;
    const { state, version } = fromSaveFile({ ...file, version: 23 });
    expect(version).toBe(SAVE_VERSION);
    expect(state.employees.every((e) => e.desk === null)).toBe(true);
    expect(employeesWithDesk(state)).toEqual(employeesWithDesk(before));
  });

  describe('the CEO’s office', () => {
    it('is a kind of room like the others, with a desk of its own on its checklist', () => {
      expect(RENTABLE_ROOM_TYPES).toContain('ceoOffice');
      expect(STUDIO_REQUIREMENTS.ceoOffice).toEqual({ ceoDesk: 1 });
      expect(FURNITURE.ceoDesk.rooms).toEqual(['ceoOffice']);
      // The desk fits the room the game proposes, with the floor in front of the door left clear.
      expect(ROOM_SIZES.ceoOffice.w).toBeGreaterThanOrEqual(FURNITURE.ceoDesk.w);
      // The test player's company without the office it builds itself (0.16.0).
      const { s: bot } = company();
      const before = { ...bot, rooms: bot.rooms.filter((r) => r.type !== 'ceoOffice') };
      const built = buildRoom(before, { floor: 2, x: 8, y: 0, ...ROOM_SIZES.ceoOffice, door: { x: 10.5, z: 5 }, type: 'ceoOffice' });
      let s = ok(built);
      const id = String(built.ok && built.id);
      expect(findRoom(s, id)).toMatchObject({ name: 'CEO’s office', type: 'ceoOffice' });
      expect(isStudioReady(s, findRoom(s, id)!)).toBe(false);
      s = ok(autoPlaceFurniture(s, id, 'ceoDesk'));
      expect(isStudioReady(s, findRoom(s, id)!)).toBe(true);
      // It is nobody's workplace but the CEO's: it is not given out, and it seats no manager.
      expect(workplacesIn(findRoom(s, id)!)).toEqual([]);
      expect(employeesWithDesk(s)).toEqual(employeesWithDesk(before));
      expect(error(assignDesk(s, staff(s, 'channelManager')[0]!.id, findRoom(s, id)!.furniture[0]!.id))).toMatch(/no place to work/);
      expect(ok(autoPlaceFurniture(ok(autoPlaceFurniture(s, id, 'couch')), id, 'planter')).rooms.find((r) => r.roomId === id)!.furniture).toHaveLength(3);
    });

    it('is the only one a company has', () => {
      const { s: bot, second } = company();
      const before = { ...bot, rooms: bot.rooms.filter((r) => r.type !== 'ceoOffice') };
      const plan = { floor: 3, x: 0, y: 0, w: 4, h: 5, door: { x: 2.5, z: 5 } };
      const s = ok(buildRoom(before, { ...plan, type: 'ceoOffice' }));
      expect(kindError(before, 'ceoOffice')).toBeNull();
      expect(kindError(s, 'ceoOffice')).toMatch(/office of your own already: CEO’s office/);
      expect(error(buildRoom(s, { ...plan, x: 6, door: { x: 8.5, z: 5 }, type: 'ceoOffice' }))).toMatch(/office of your own already/);
      // No other room becomes one either; but the office itself can become something else and back.
      const empty = ok(buildRoom(s, { ...plan, x: 6, door: { x: 8.5, z: 5 }, type: 'library' }));
      const library = empty.rooms.at(-1)!.roomId;
      expect(error(setRoomType(empty, library, 'ceoOffice'))).toMatch(/office of your own already/);
      const own = s.rooms.find((r) => r.type === 'ceoOffice')!.roomId;
      const changed = ok(setRoomType(empty, own, 'office'));
      expect(findRoom(changed, own)!.name).toMatch(/^Office \d$/);
      expect(findRoom(ok(setRoomType(changed, library, 'ceoOffice')), library)!.name).toBe('CEO’s office');
      void second;
    });
  });

  it('changes nothing for the bots: they give nobody a place, and their games go as before', () => {
    let s = createInitialState(5);
    for (let day = 0; day < 120; day++) s = tick(sensibleBot(s));
    expect(s.employees.every((e) => e.desk === null)).toBe(true);
    // Their own office they do build (0.16.0): nothing goes on the air without it.
    expect(s.rooms.filter((r) => r.type === 'ceoOffice')).toHaveLength(1);
    const workers = s.employees.filter((e) => needsDesk(e.role));
    expect(workers.every((e) => employeesWithDesk(s).has(e.id))).toBe(true);
  });
});
