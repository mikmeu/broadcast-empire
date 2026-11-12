import { describe, expect, it } from 'vitest';
import { furnitureTypes } from '../config/office';
import { furnitureAsset } from './assets';
import { peopleOnFloor, turned } from './layout';
import { rotateFurniture, type ActionResult } from '../sim/actions';
import { sensibleBot } from '../sim/bots';
import { createInitialState } from '../sim/newGame';
import { footprint } from '../sim/office';
import type { GameState } from '../sim/state';
import { tick } from '../sim/tick';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

describe('where people are at turned furniture', () => {
  it('turns points about the middle of the footprint', () => {
    // A 2 × 1 desk: its middle stays the middle, its right end becomes the far end.
    expect(turned('recordShelves', 1, 1, 0.5)).toEqual([0.5, 1]);
    expect(turned('recordShelves', 1, 2, 0.5)).toEqual([0.5, 0]);
    expect(turned('recordShelves', 2, 2, 0.5)).toEqual([0, 0.5]);
    const [x, z] = turned('recordShelves', 0, 0.3, 0.2);
    expect(x).toBeCloseTo(0.3);
    expect(z).toBeCloseTo(0.2);
  });

  it('keeps every spot of every piece inside its footprint, whichever way it is turned', () => {
    for (const type of furnitureTypes()) {
      for (const turn of [0, 1, 2, 3]) {
        const size = footprint(type, turn);
        for (const spot of furnitureAsset(type).spots ?? []) {
          const [x, z] = turned(type, turn, spot.at[0], spot.at[1]);
          // Someone at a desk or microphone may stand just outside its tiles, never far.
          expect(x, `${type} turn ${turn}`).toBeGreaterThan(-0.5);
          expect(x, `${type} turn ${turn}`).toBeLessThan(size.w + 0.5);
          expect(z, `${type} turn ${turn}`).toBeGreaterThan(-0.5);
          expect(z, `${type} turn ${turn}`).toBeLessThan(size.h + 0.5);
        }
      }
    }
  });

  it('seats staff at a workstation that was turned', () => {
    let s = createInitialState(1);
    for (let day = 0; day < 5; day++) s = tick(sensibleBot(s));
    const office = s.rooms.find((r) => r.type === 'office')!;
    const desk = office.furniture.find((f) => f.type === 'workstation')!;
    const before = peopleOnFloor(s, office.floor).filter((p) => p.activity === 'sit');
    s = ok(rotateFurniture(s, office.roomId, desk.id));
    const after = peopleOnFloor(s, office.floor).filter((p) => p.activity === 'sit');
    expect(after).toHaveLength(before.length);
    // Exactly one person moved, and faces a quarter turn further.
    const moved = after.filter((p) => { const was = before.find((b) => b.id === p.id)!; return was.x !== p.x || was.z !== p.z; });
    expect(moved).toHaveLength(1);
    expect(moved[0]!.turn - before.find((b) => b.id === moved[0]!.id)!.turn).toBe(1);
  });
});
