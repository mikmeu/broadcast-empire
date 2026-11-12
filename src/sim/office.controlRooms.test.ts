import { describe, expect, it } from 'vitest';
import { WEAR } from '../config/balance';
import { furnitureTypes, furnitureSpec, BUILDINGS, isStudioType, plotsOf, type FurnitureType, type RoomType } from '../config/office';
import { DAY_BEATS, peopleAt, showsOnAir, slotAt, whereabouts } from '../office/layout';
import { buildRoom, placeFurniture, sellFurniture, setRoomType, type ActionResult } from './actions';
import { addMissingEquipment, autoPlaceFurniture, rentRoom } from './fixtures';
import { studioLevel } from './broadcast';
import { sensibleBot } from './bots';
import { createInitialState } from './newGame';
import { unlockAll } from './unlocks';
import { adjacentRooms, borrowedDesks, findRoom, isStudioReady, missingFurniture, studioKit } from './office';
import type { GameState } from './state';
import { equipmentLevel } from './tech';
import { tick } from './tick';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

const rich = (s: GameState): GameState => unlockAll({ ...s, money: 1_000_000 });
const room = (s: GameState, id: string) => findRoom(s, id)!;
/** Rents a room as a kind of room. */
const rent = (s: GameState, id: string, type: RoomType) => ok(setRoomType(ok(rentRoom(s, id)), id, type));
/** Sells every piece of a kind in a room. */
const sellAll = (s: GameState, id: string, type: FurnitureType) =>
  room(s, id).furniture.filter((f) => f.type === type).reduce((next, f) => ok(sellFurniture(next, id, f.id)), s);

describe('control rooms (Phase 8b)', () => {
  /** Radio studios in A and C without a mixing desk, and a control room between them. */
  function wing(): GameState {
    let s = rich(createInitialState(1));
    for (const id of ['A', 'C']) s = sellAll(ok(addMissingEquipment(rent(s, id, 'radioStudio'), id)), id, 'mixingDesk');
    return rent(s, 'B', 'controlRoom');
  }

  it('rooms next door share a wall: same floor, same side of the corridor', () => {
    // With every room of the building's first plan built.
    const s = plotsOf(BUILDINGS.standard).reduce((game, plot) => ok(rentRoom(game, plot.id)), { ...rich(createInitialState(1)), floorsUnlocked: 6 });
    const names = (id: string) => adjacentRooms(s, id).map((r) => r.id);
    expect(names('A')).toEqual(['B']);
    expect(names('B')).toEqual(['A', 'C']);
    expect(names('D')).toEqual(['C']);
    expect(names('F')).toEqual(['E', 'G']);
    // Every room along the corridor has a neighbour, and being neighbours goes both ways.
    for (const r of plotsOf(BUILDINGS.standard)) {
      expect(names(r.id).length).toBeGreaterThan(0);
      for (const other of names(r.id)) expect(names(other)).toContain(r.id);
    }
  });

  it('is not a studio, and takes only the desks', () => {
    expect(isStudioType('controlRoom')).toBe(false);
    // The control desk and the audio mixer, which a TV studio has here (0.16.0) and a radio studio has in place of its mixing desk (0.19.0); besides a planter and a bin, which go anywhere.
    expect(furnitureTypes().filter((t) => furnitureSpec(t).rooms.includes('controlRoom'))).toEqual(['controlDesk', 'planter', 'audioMixer', 'bin']);
    expect(placeFurniture(wing(), 'B', 'mixingDesk', 0, 0).ok).toBe(false);
    expect(placeFurniture(wing(), 'B', 'onAirLight', 0, 0).ok).toBe(false);
  });

  it('an audio mixer in the control room completes the studio next door; each mixer serves one studio', () => {
    let s = wing();
    expect(isStudioReady(s, room(s, 'A'))).toBe(false);
    expect(missingFurniture(s, room(s, 'A'))).toEqual([['mixingDesk', 1]]);

    s = ok(autoPlaceFurniture(s, 'B', 'audioMixer'));
    expect(isStudioReady(s, room(s, 'A'))).toBe(true);
    expect(isStudioReady(s, room(s, 'C'))).toBe(false);
    expect(borrowedDesks(s).get('A')).toMatchObject({ roomId: 'B' });
    expect(studioKit(s, room(s, 'A'))).toHaveLength(room(s, 'A').furniture.length + 1);

    s = ok(autoPlaceFurniture(s, 'B', 'audioMixer'));
    expect(isStudioReady(s, room(s, 'C'))).toBe(true);
    expect(borrowedDesks(s).get('A')!.item.id).not.toBe(borrowedDesks(s).get('C')!.item.id);
    // Nothing is left to buy for the studios themselves.
    expect(addMissingEquipment(s, 'A').ok).toBe(false);
  });

  it('a studio with its own desk keeps using it', () => {
    let s = ok(autoPlaceFurniture(wing(), 'B', 'audioMixer'));
    s = ok(autoPlaceFurniture(s, 'A', 'mixingDesk'));
    expect(borrowedDesks(s).has('A')).toBe(false);
    // So the desk next door is free for the studio on the other side.
    expect(borrowedDesks(s).get('C')).toMatchObject({ roomId: 'B' });
  });

  it('only serves studios next door that need that kind of desk', () => {
    let s = wing();
    // A control desk is no use to a radio studio.
    s = ok(autoPlaceFurniture(s, 'B', 'controlDesk'));
    expect(isStudioReady(s, room(s, 'A'))).toBe(false);
    // And a control room across the corridor, or two doors down, is too far.
    s = ok(sellFurniture(s, 'B', room(s, 'B').furniture[0]!.id));
    s = ok(autoPlaceFurniture(rent(s, 'E', 'controlRoom'), 'E', 'audioMixer'));
    s = ok(autoPlaceFurniture(rent(s, 'D', 'controlRoom'), 'D', 'audioMixer'));
    expect(isStudioReady(s, room(s, 'A'))).toBe(false);
    expect(isStudioReady(s, room(s, 'C'))).toBe(true);
    expect(borrowedDesks(s).get('C')).toMatchObject({ roomId: 'D' });
  });

  it('serves a TV studio with a control desk and an audio mixer, and only that one (0.16.0)', () => {
    let s = rent(rich(createInitialState(1)), 'F', 'tvNewsStudio');
    // The studio's own checklist has no place for them: they stand in its control room.
    expect(placeFurniture(s, 'F', 'controlDesk', 0, 0).ok).toBe(false);
    s = rent(s, 'G', 'controlRoom');
    s = ok(addMissingEquipment(s, 'F'));
    expect(room(s, 'F').furniture.some((f) => f.type === 'controlDesk')).toBe(false);
    expect(room(s, 'G').furniture.map((f) => f.type).sort()).toEqual(['audioMixer', 'controlDesk']);
    expect(isStudioReady(s, room(s, 'F'))).toBe(true);
    // Without the audio mixer it is not ready.
    s = sellAll(s, 'G', 'audioMixer');
    expect(missingFurniture(s, room(s, 'F'))).toEqual([['audioMixer', 1]]);
  });

  /**
   * The sensible bot's station after a month, with its first show made in a studio of its own on the second
   * floor (`before`), and then with the mixing desk of that studio moved to a control room next door (`s`).
   */
  function apart(): { before: GameState; s: GameState; control: string } {
    let base = createInitialState(1);
    for (let day = 0; day < 30; day++) base = tick(sensibleBot(base));
    base = { ...rich(base), floorsUnlocked: 3 };
    const type = findRoom(base, base.shows[0]!.studioId!)!.type!;
    const built = buildRoom(base, { floor: 2, x: 0, y: 0, w: 4, h: 5, door: { x: 2.5, z: 5 }, type });
    const studio = String(built.ok && built.id);
    const before = structuredClone(ok(addMissingEquipment(ok(built), studio)));
    before.shows[0]!.studioId = studio;
    const beside = buildRoom(sellAll(before, studio, 'mixingDesk'), { floor: 2, x: 4, y: 0, w: 3, h: 5, door: { x: 5.5, z: 5 }, type: 'controlRoom' });
    const control = String(beside.ok && beside.id);
    const s = ok(autoPlaceFurniture(ok(beside), control, 'audioMixer'));
    return { before, s, control };
  }

  it('a studio with its desk next door works a little better, and its equipment still counts', () => {
    const { before, s } = apart();
    const show = s.shows[0]!;
    expect(studioLevel(before, show)).toBeGreaterThan(0);
    // The audio mixer is of the TV line, so the level follows TV research (0.19.0): it still counts, as a level of its own.
    expect(equipmentLevel(s, room(s, show.studioId!), 1970)).toBeGreaterThan(0);
    expect(studioLevel(s, show)).toBeGreaterThan(0);
    expect(room(s, show.studioId!).furniture.some((f) => f.type === 'mixingDesk')).toBe(false);
  });

  it('a broken desk next door halves the studio like a broken one inside', () => {
    const { s, control } = apart();
    const show = s.shows[0]!;
    const whole = studioLevel(s, show);
    room(s, control).furniture[0]!.condition = 0;
    expect(studioLevel(s, show)).toBeCloseTo(whole * WEAR.brokenStudioLevel);
  });

  it('without the desk the studio is off the air again', () => {
    const { s, control } = apart();
    const gone = ok(sellFurniture(s, control, room(s, control).furniture[0]!.id));
    expect(studioLevel(gone, gone.shows[0]!)).toBe(0);
  });

  it('someone from the show works the desk while it is on the air, and only then', () => {
    const { s, control } = apart();
    const studio = s.shows[0]!.studioId!;
    // Everyone who works here and is in at that moment.
    const everyone = (beat: number) => [...peopleAt(s, beat).values()].filter((p) => p.role !== 'visitor' && p.role !== 'ceo');
    let seen = 0;
    for (let beat = 0; beat < DAY_BEATS; beat++) {
      const inControl = everyone(beat).filter((p) => p.roomId === control && p.status === 'onAir');
      // The shows going out from the studio next door, as far as they have production staff.
      const live = showsOnAir(s, slotAt(beat)).filter((x) => x.studioId === studio && x.staffIds.length > 0);
      expect(inControl.length, `beat ${beat}`).toBe(live.length > 0 ? 1 : 0);
      for (const person of inControl) {
        seen++;
        expect(live.flatMap((x) => x.staffIds)).toContain(person.id);
        expect(whereabouts(s, person)).toMatch(/At the controls/);
      }
      // Nobody is in two places.
      expect(new Set(everyone(beat).map((p) => p.id)).size).toBe(everyone(beat).length);
    }
    expect(seen).toBeGreaterThan(0);
  });
});
