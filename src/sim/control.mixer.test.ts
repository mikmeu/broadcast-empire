import { describe, expect, it } from 'vitest';
import { getPlot } from '../config/office';
import { createInitialState } from './newGame';
import { borrowedDesks, isStudioReady, missingFurniture, newRoom, studioKit } from './office';
import { SAVE_VERSION, fromSaveFile, toSaveFile } from './save';
import type { Furniture, GameState, RentedRoom } from './state';

const piece = (id: string, type: Furniture['type'], tier = 1): Furniture => ({ id, type, x: 0, y: 0, turn: 0, tier, condition: 0.7, boughtOn: 12 } as Furniture);

/** A radio studio in A, a control room in B and a TV talk studio in C, with these pieces in the control room. */
function game(controlKit: Furniture[], tvStudio = false): GameState {
  const s = structuredClone(createInitialState(1));
  const studio: RentedRoom = { ...newRoom(getPlot('A')), type: 'radioStudio', furniture: [piece('light', 'onAirLight')] };
  const control: RentedRoom = { ...newRoom(getPlot('B')), type: 'controlRoom', furniture: controlKit };
  s.rooms.push(studio, control);
  if (tvStudio) s.rooms.push({ ...newRoom(getPlot('C')), type: 'tvTalkStudio' });
  return s;
}

const load = (s: GameState, version: number) => fromSaveFile({ ...JSON.parse(JSON.stringify(toSaveFile(s, 0))), version });

describe('a radio control room holds an audio mixer (#137)', () => {
  it('lends an audio mixer to the radio studio next door, and it counts as the mixing desk', () => {
    const s = game([piece('mixer', 'audioMixer')]);
    expect(borrowedDesks(s).get(s.rooms[0]!.roomId)).toMatchObject({ roomId: s.rooms[1]!.roomId });
    expect(missingFurniture(s, s.rooms[0]!)).toEqual([]);
    expect(isStudioReady(s, s.rooms[0]!)).toBe(true);
    expect(studioKit(s, s.rooms[0]!).map((f) => f.type)).toContain('audioMixer');
  });

  it('lends nothing to a studio that has no need of it, or when there is no mixer', () => {
    const s = game([piece('desk', 'controlDesk')]);
    expect(borrowedDesks(s).size).toBe(0);
    expect(missingFurniture(s, s.rooms[0]!)).toEqual([['mixingDesk', 1]]);
  });

  it('a control room that belongs to a TV studio serves only that studio', () => {
    const s = game([piece('desk', 'controlDesk'), piece('mixer', 'audioMixer')], true);
    expect(borrowedDesks(s).size).toBe(0);
  });
});

describe('migration 49 → 50: no mixing desk in a control room (#137)', () => {
  it('swaps a mixing desk in a control room for an audio mixer in the same place, keeping its condition', () => {
    const s = game([{ ...piece('desk', 'mixingDesk', 3), x: 1, y: 2 }]);
    s.rooms[0]!.furniture.push(piece('own', 'mixingDesk'));
    const { state, version } = load(s, 49);
    expect(version).toBe(SAVE_VERSION);
    const [studio, control] = state.rooms;
    expect(control!.furniture).toHaveLength(1);
    expect(control!.furniture[0]).toMatchObject({ id: 'desk', type: 'audioMixer', x: 1, y: 2, condition: 0.7, boughtOn: 12, tier: 1 });
    // A mixing desk in the studio itself stays.
    expect(studio!.furniture.some((f) => f.type === 'mixingDesk')).toBe(true);
    expect(state.messages.some((m) => /audio mixer/.test(m.text) && m.from.kind === 'tabby')).toBe(true);
    // The studio has a desk of its own, so it borrows nothing.
    expect(borrowedDesks(state).size).toBe(0);
  });

  it('says nothing to a game without one, and loads again without a change', () => {
    const s = game([piece('mixer', 'audioMixer')]);
    const { state } = load(s, 49);
    expect(state.messages.length).toBe(s.messages.length);
    expect(state.rooms[1]!.furniture[0]!.type).toBe('audioMixer');
  });
});
