// The designer's basic furniture (0.21.0, #345): 20 pieces with new looks and seats, and two bigger desks.

import { describe, expect, it } from 'vitest';
import { furnitureSpec } from '../config/office';
import { FURNITURE_ASSETS, furnitureAsset, partsForTier } from '../office/assets';
import { rentRoom } from './fixtures';
import { createInitialState } from './newGame';
import { footprint, placementError } from './office';
import { fromSaveFile, toSaveFile } from './save';
import { setRoomType, type ActionResult } from './actions';
import type { Furniture, GameState } from './state';

const ok = (result: ActionResult): GameState => {
  if (!result.ok) throw new Error(result.error);
  return result.state;
};

describe('the 20 pieces', () => {
  const spotsOf = { audioDesk: 1, callDesk: 1, ceoDesk: 1, editingDesk: 1, gameShowSet: 3, managerDesk: 1, mixingDesk: 3, newsDesk: 2, realitySet: 4, schedulingDesk: 1, set: 3, sitcomSet: 3, trainerDesk: 1, workstation: 1 } as const;

  it('keep the places for people the game relies on', () => {
    for (const [type, n] of Object.entries(spotsOf)) expect(FURNITURE_ASSETS[type as keyof typeof FURNITURE_ASSETS].spots, type).toHaveLength(n);
    for (const type of ['dresser', 'flipChart', 'onAirLight', 'printer', 'salesChart', 'shelving'] as const) expect(FURNITURE_ASSETS[type].spots, type).toBeUndefined();
    // The contestants of the game show take the second and third places.
    expect(FURNITURE_ASSETS.gameShowSet.spots!.slice(1, 3)).toHaveLength(2);
  });

  it('keep the tiers of the mixing desk: guests from tier 2, a different look at every tier', () => {
    const spots = furnitureAsset('mixingDesk').spots!;
    expect(spots.map((s) => s.tiers ?? null)).toEqual([null, [2, 9], [2, 9]]);
    const looks = [1, 2, 3, 4].map((tier) => JSON.stringify(partsForTier(furnitureAsset('mixingDesk').parts, tier)));
    expect(new Set(looks).size).toBe(4);
  });

  it('give the two desks their new footprints', () => {
    expect(furnitureSpec('mixingDesk')).toMatchObject({ w: 2, h: 3, cost: 8_000 });
    expect(furnitureSpec('newsDesk')).toMatchObject({ w: 3, h: 2, cost: 6_000 });
  });
});

describe('a save from version 72', () => {
  /** A radio studio (room C, 4 × 5) with a mixing desk where the old 2 × 1 desk stood, as a version 72 save. */
  function old(at: { x: number; y: number }, extra: Furniture[] = []): { version: number; state: GameState } {
    const s = { ...ok(setRoomType(ok(rentRoom(createInitialState(1), 'C')), 'C', 'radioStudio')), money: 1_000_000 };
    const room = s.rooms.find((r) => r.roomId === 'C')!;
    room.furniture = [{ id: 'desk', type: 'mixingDesk', x: at.x, y: at.y, turn: 0 } as Furniture, ...extra];
    const file = JSON.parse(JSON.stringify(toSaveFile(s, 1))) as { version: number; state: GameState };
    file.version = 72;
    return file;
  }
  const load = (file: { version: number; state: GameState }) => fromSaveFile(file).state;
  const roomOf = (s: GameState) => s.rooms.find((r) => r.roomId === 'C')!;

  it('keeps a desk that still fits where it is', () => {
    const state = load(old({ x: 1, y: 0 }));
    expect(roomOf(state).furniture[0]).toMatchObject({ id: 'desk', x: 1, y: 0 });
    expect(state.storage).toHaveLength(0);
  });

  it('puts a desk that no longer fits down again in its room', () => {
    // On the last row it would stick out of the room at 3 tiles deep.
    const state = load(old({ x: 1, y: 4 }));
    const desk = roomOf(state).furniture.find((f) => f.id === 'desk')!;
    expect({ x: desk.x, y: desk.y }).not.toEqual({ x: 1, y: 4 });
    expect(placementError(state, roomOf(state), 'mixingDesk', desk.x, desk.y, desk.turn, desk.id)).toBeNull();
    expect(state.messages.some((m) => m.text.includes('were moved') || m.text.includes('moved:'))).toBe(true);
  });

  it('puts a desk that fits nowhere in storage and takes it from whoever had it', () => {
    // A row of 1 × 1 pieces on the second and the fourth row leaves no gap of two rows, so no 2 × 3 or 3 × 2 desk fits.
    const blocks: Furniture[] = [1, 3].flatMap((y) => [0, 1, 2, 3].map((x) => ({ id: `light${x}${y}`, type: 'onAirLight', x, y, turn: 0 }) as Furniture));
    const file = old({ x: 1, y: 4 }, blocks);
    file.state.employees = [{ ...createInitialState(1).employees[0]!, desk: 'desk' }];
    const state = load(file);
    expect(roomOf(state).furniture.some((f) => f.id === 'desk')).toBe(false);
    expect(state.storage.map((f) => f.id)).toContain('desk');
    expect(state.employees[0]!.desk).toBeNull();
    expect(state.messages.some((m) => m.text.includes('in storage'))).toBe(true);
    expect(footprint('mixingDesk', 0)).toEqual({ w: 2, h: 3 });
  });
});
