import { describe, expect, it } from 'vitest';
import { placeFurniture, rotateFurniture, setRoomType, type ActionResult } from './actions';
import { rentRoom } from './fixtures';
import { createInitialState } from './newGame';
import { footprint, placementError } from './office';
import type { GameState } from './state';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
const error = (result: ActionResult) => (result.ok ? null : result.error);

/** Room C (4 × 5 tiles) as a radio studio, with money to furnish it. */
const studio = () => ({ ...ok(setRoomType(ok(rentRoom(createInitialState(1), 'C')), 'C', 'radioStudio')), money: 1_000_000 });
const items = (s: GameState) => s.rooms.find((r) => r.roomId === 'C')!.furniture;

describe('turning furniture', () => {
  it('swaps width and depth on a quarter turn', () => {
    expect(footprint('recordShelves', 0)).toEqual({ w: 2, h: 1 });
    expect(footprint('recordShelves', 1)).toEqual({ w: 1, h: 2 });
    expect(footprint('recordShelves', 2)).toEqual({ w: 2, h: 1 });
    expect(footprint('workstation', 3)).toEqual({ w: 2, h: 2 });
  });

  it('places a turned piece where the unturned one would not fit', () => {
    const s = studio();
    // The last column: a 2 × 1 desk sticks out, a 1 × 2 one fits.
    expect(error(placeFurniture(s, 'C', 'recordShelves', 3, 0))).toMatch(/doesn’t fit/);
    const placed = ok(placeFurniture(s, 'C', 'recordShelves', 3, 0, 1));
    expect(items(placed)[0]).toMatchObject({ x: 3, y: 0, turn: 1 });
    // It now covers the tile below, and no longer the one beside it.
    expect(placementError(placed, placed.rooms[0]!, 'onAirLight', 3, 1)).toMatch(/already there/);
    expect(placementError(placed, placed.rooms[0]!, 'onAirLight', 2, 0)).toBeNull();
  });

  it('turns a piece where it stands, for free, through all four directions', () => {
    let s = ok(placeFurniture(studio(), 'C', 'recordShelves', 1, 1));
    const money = s.money;
    const id = items(s)[0]!.id;
    for (const turn of [1, 2, 3, 0]) {
      s = ok(rotateFurniture(s, 'C', id));
      expect(items(s)[0]!.turn).toBe(turn);
    }
    expect(s.money).toBe(money);
    expect(items(s)[0]).toMatchObject({ x: 1, y: 1 });
  });

  it('refuses a turn that would hit a wall or another piece', () => {
    // Standing along the east wall: turned, the desk would need a fifth column.
    const atWall = ok(placeFurniture(studio(), 'C', 'recordShelves', 3, 0, 1));
    expect(error(rotateFurniture(atWall, 'C', items(atWall)[0]!.id))).toMatch(/no room to turn/);
    // An on-air light right below it is in the way.
    let s = ok(placeFurniture(studio(), 'C', 'recordShelves', 0, 0));
    s = ok(placeFurniture(s, 'C', 'onAirLight', 0, 1));
    expect(error(rotateFurniture(s, 'C', items(s)[0]!.id))).toMatch(/no room to turn/);
    // A square piece can always turn.
    expect(items(ok(rotateFurniture(s, 'C', items(s)[1]!.id)))[1]!.turn).toBe(1);
    expect(error(rotateFurniture(s, 'C', 'nothing'))).toMatch(/isn’t here/);
  });
});
