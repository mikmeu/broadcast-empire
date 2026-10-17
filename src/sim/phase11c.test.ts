import { describe, expect, it } from 'vitest';
import { FURNITURE_ASSETS } from '../office/assets';
import { deskSeats, peopleOnFloor, whereabouts } from '../office/layout';
import { FURNITURE, RENTABLE_ROOM_TYPES, ROOM_TYPE_NAMES, STUDIO_REQUIREMENTS } from '../config/office';
import { hire, placeFurniture, sellFurniture, setRoomType, type ActionResult } from './actions';
import { addMissingEquipment, autoPlaceFurniture, rentRoom } from './fixtures';
import { buildCost } from './rooms';
import { sensibleBot } from './bots';
import { channelOffAirReason, simulateDay } from './broadcast';
import { createInitialState } from './newGame';
import { unlockAll } from './unlocks';
import { employeesWithDesk, isFurnished, isManager, managerDeskCount, needsDesk, wearsOut } from './office';
import { SAVE_VERSION, fromSaveFile, toSaveFile } from './save';
import { managerOf } from './staff';
import type { GameState } from './state';
import { tick } from './tick';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** A company with money to spend and nothing else. */
const rich = () => ({ ...unlockAll(createInitialState(1)), money: 1_000_000 });
/** A staffed station on its first day: the sensible bot's opening. */
const station = () => unlockAll(sensibleBot(createInitialState(1)));
const candidate = (s: GameState, role: string) => s.candidates.find((c) => c.role === role)!;

describe('the management office (Phase 11c)', () => {
  it('is a kind of room that can be rented, and needs one manager’s desk', () => {
    expect(RENTABLE_ROOM_TYPES).toContain('managementOffice');
    expect(ROOM_TYPE_NAMES.managementOffice).toBe('Management office');
    expect(STUDIO_REQUIREMENTS.managementOffice).toEqual({ managerDesk: 1 });
    let s = ok(setRoomType(ok(rentRoom(rich(), 'D')), 'D', 'managementOffice'));
    expect(isFurnished(s.rooms[0]!)).toBe(false);
    s = ok(addMissingEquipment(s, 'D'));
    expect(isFurnished(s.rooms[0]!)).toBe(true);
    expect(managerDeskCount(s)).toBe(1);
    expect(s.money).toBe(1_000_000 - FURNITURE.managerDesk.cost - buildCost(s.rooms[0]!));
  });

  it('takes manager’s desks and nothing a manager can’t use, and the desks go nowhere else', () => {
    expect(FURNITURE.managerDesk.rooms).toEqual(['managementOffice']);
    expect(FURNITURE.workstation.rooms).toEqual(['office']);
    expect(wearsOut('managerDesk')).toBe(false);
    const s = ok(setRoomType(ok(rentRoom(ok(setRoomType(ok(rentRoom(rich(), 'D')), 'D', 'managementOffice')), 'E')), 'E', 'office'));
    expect(placeFurniture(s, 'D', 'workstation', 0, 0).ok).toBe(false);
    expect(placeFurniture(s, 'E', 'managerDesk', 0, 0).ok).toBe(false);
    expect(placeFurniture(s, 'D', 'managerDesk', 0, 0).ok).toBe(true);
    expect(placeFurniture(s, 'D', 'couch', 0, 0).ok).toBe(true);
    // The desk comes with its chair, and the manager sits on it.
    expect(FURNITURE_ASSETS.managerDesk.parts.some((p) => 'model' in p && p.model === 'deskChair')).toBe(true);
    expect(FURNITURE_ASSETS.managerDesk.spots).toHaveLength(1);
  });

  it('holds one desk: every manager has a room of their own (0.16.0)', () => {
    let s = ok(setRoomType(ok(rentRoom(rich(), 'D')), 'D', 'managementOffice'));
    s = ok(placeFurniture(s, 'D', 'managerDesk', 0, 0));
    const second = placeFurniture(s, 'D', 'managerDesk', 2, 0);
    expect(second.ok ? '' : second.error).toMatch(/has room for one manager’s desk/);
    // The test shortcut puts the next one in a management office of its own.
    s = ok(autoPlaceFurniture(s, 'D', 'managerDesk'));
    const offices = s.rooms.filter((r) => r.type === 'managementOffice');
    expect(offices).toHaveLength(2);
    expect(offices.every((r) => r.furniture.filter((f) => f.type === 'managerDesk').length === 1)).toBe(true);
  });

  it('is where managers get their desk: a workstation does not do, and a manager’s desk is for nobody else', () => {
    let s = ok(setRoomType(ok(rentRoom(rich(), 'E')), 'E', 'office'));
    for (let n = 0; n < 4; n++) s = ok(autoPlaceFurniture(s, 'E', 'workstation'));
    s = ok(hire(s, candidate(s, 'channelManager').id));
    s = ok(hire(s, candidate(s, 'manager').id));
    s = ok(hire(s, candidate(s, 'production').id));
    const [channelManager, manager, producer] = s.employees;
    // Four free workstations: only the producer takes one.
    expect([...employeesWithDesk(s).keys()]).toEqual([producer!.id]);

    s = ok(addMissingEquipment(ok(setRoomType(ok(rentRoom(s, 'D')), 'D', 'managementOffice')), 'D'));
    // One desk: the channel manager goes first.
    expect(employeesWithDesk(s).get(channelManager!.id)).toMatchObject({ roomId: 'D' });
    expect(employeesWithDesk(s).has(manager!.id)).toBe(false);
    // The second desk goes in a management office of its own (0.16.0).
    s = ok(autoPlaceFurniture(s, 'D', 'managerDesk'));
    const second = s.rooms.filter((r) => r.type === 'managementOffice').find((r) => r.roomId !== 'D')!.roomId;
    expect(employeesWithDesk(s).get(manager!.id)).toMatchObject({ roomId: second });
    expect(employeesWithDesk(s).get(producer!.id)).toMatchObject({ roomId: 'E' });

    // With the workstations gone the managers keep theirs, and a third manager's desk is no use to the producer.
    for (const item of [...s.rooms.find((r) => r.roomId === 'E')!.furniture]) s = ok(sellFurniture(s, 'E', item.id));
    s = ok(autoPlaceFurniture(s, 'D', 'managerDesk'));
    expect([...employeesWithDesk(s).keys()].sort()).toEqual([channelManager!.id, manager!.id].sort());
  });

  it('takes a channel off the air when its manager has no desk there', () => {
    const s = structuredClone(station());
    expect(channelOffAirReason(s, s.channels[0]!)).toBeNull();
    const management = s.rooms.find((r) => r.type === 'managementOffice')!;
    expect(management.furniture.filter((f) => f.type === 'managerDesk')).toHaveLength(s.employees.filter((e) => isManager(e.role)).length);
    management.furniture = [];
    expect(channelOffAirReason(s, s.channels[0]!)).toBe('Channel manager has no desk in a management office');
    expect(simulateDay(s).channels.find((c) => c.isPlayer)!.onAir).toBe(false);
  });

  it('gives a department manager’s bonus only from a desk in a management office', () => {
    let s = structuredClone(station());
    s.money = 1_000_000;
    s.candidates.push({ id: 'p-boss', name: 'Test Boss', role: 'manager', department: 'production', skill: 80, salary: 3_000, specialties: [], fame: 0 });
    s = ok(hire(s, 'p-boss'));
    const manager = s.employees.find((e) => e.role === 'manager')!;
    expect(managerOf(s, 'production', employeesWithDesk(s))).toBeUndefined();
    const management = s.rooms.find((r) => r.type === 'managementOffice')!;
    s = ok(autoPlaceFurniture(s, management.roomId, 'managerDesk'));
    expect(managerOf(s, 'production', employeesWithDesk(s))?.id).toBe(manager.id);
  });

  it('seats managers at their desks in the office you look at', () => {
    const s = station();
    const seats = deskSeats(s);
    for (const e of s.employees.filter((x) => needsDesk(x.role))) {
      const seat = seats.get(e.id)!;
      // (A cook stands at a stove in the canteen, since 0.15.0.)
      expect(seat.item.type, e.role).toBe(isManager(e.role) ? 'managerDesk' : e.role === 'cook' ? 'stove' : 'workstation');
      expect(s.rooms.find((r) => r.roomId === seat.roomId)!.type).toBe(isManager(e.role) ? 'managementOffice' : e.role === 'cook' ? 'canteen' : 'office');
    }
    const manager = s.employees.find((e) => e.role === 'channelManager')!;
    const person = [1, 2, 3].flatMap((floor) => peopleOnFloor(s, floor)).find((p) => p.id === manager.id)!;
    expect(person).toMatchObject({ roomId: seats.get(manager.id)!.roomId, activity: 'sit', status: 'post' });
    // Without the desk they wait in the corridor, and the person panel says why.
    const without = structuredClone(s);
    without.rooms.find((r) => r.type === 'managementOffice')!.furniture = [];
    const waiting = [1, 2, 3].flatMap((floor) => peopleOnFloor(without, floor)).find((p) => p.id === manager.id)!;
    expect(waiting.roomId).toBeNull();
    expect(whereabouts(without, waiting)).toContain('no manager’s desk');
  });

  it('gets dirty with the managers who work in it', () => {
    let s = structuredClone(station());
    const management = () => s.rooms.find((r) => r.type === 'managementOffice')!;
    s.employees = s.employees.filter((e) => e.role !== 'cleaner');
    const before = management().cleanliness;
    for (let day = 0; day < 10; day++) s = tick(s);
    expect(management().cleanliness).toBeLessThan(before);
  });
});

describe('older saves (Phase 11c)', () => {
  /** A save from before managers had an office of their own: the managers sit at workstations. */
  function oldSave(state: GameState) {
    const old = JSON.parse(JSON.stringify(toSaveFile(state, 0)));
    const offices = old.state.rooms.filter((r: { type: string }) => r.type === 'office');
    const managers = old.state.employees.filter((e: { role: string }) => isManager(e.role as never)).length;
    old.state.rooms = old.state.rooms.filter((r: { type: string }) => r.type !== 'managementOffice');
    for (let n = 0; n < managers; n++) offices[0].furniture.push({ id: `old${n}`, type: 'workstation', x: 0, y: 0, turn: 0, tier: 1, condition: 100 });
    return { ...old, version: 16 };
  }

  it('get a management office with a desk for every manager, so their channels stay on the air', () => {
    const before = station();
    const { state, version } = fromSaveFile(oldSave(before));
    expect(version).toBe(SAVE_VERSION);
    const managers = state.employees.filter((e) => isManager(e.role));
    expect(managers.length).toBeGreaterThan(0);
    expect(managerDeskCount(state)).toBe(managers.length);
    for (const manager of managers) expect(employeesWithDesk(state).has(manager.id)).toBe(true);
    expect(channelOffAirReason(state, state.channels[0]!)).toBeNull();
    // The furniture was free; the rent is not.
    expect(state.money).toBe(before.money);
    expect(state.messages.at(-1)!.text).toContain('management office');
    expect(state.messages.at(-1)!.kind).toBe('info');
    // Furniture ids stay unique.
    const ids = state.rooms.flatMap((r) => r.furniture.map((f) => f.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('are told what to do when no room stands empty', () => {
    const old = oldSave(station());
    const taken = new Set(old.state.rooms.map((r: { roomId: string }) => r.roomId));
    for (const id of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) if (!taken.has(id)) old.state.rooms.push({ roomId: id, type: 'canteen', furniture: [], cleanliness: 100, issue: null });
    const { state } = fromSaveFile(old);
    expect(managerDeskCount(state)).toBe(0);
    expect(state.messages.at(-1)).toMatchObject({ kind: 'danger' });
    expect(state.messages.at(-1)!.text).toContain('build a room');
  });

  it('without managers are left as they were', () => {
    const fresh = JSON.parse(JSON.stringify(toSaveFile(createInitialState(3), 0)));
    const { state } = fromSaveFile({ ...fresh, version: 16 });
    expect(state.rooms).toEqual([]);
    expect(state.messages).toEqual(createInitialState(3).messages);
  });
});
