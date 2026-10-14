import { describe, expect, it } from 'vitest';
import { FURNITURE } from '../config/office';
import { FURNITURE_ASSETS } from '../office/assets';
import { acceptOffer, setRoomType, type ActionResult } from './actions';
import { autoPlaceFurniture, rentRoom } from './fixtures';
import { sensibleBot } from './bots';
import { createInitialState } from './newGame';
import { showForOffer, showsForOffer } from './sales';
import type { GameState, SponsorOffer } from './state';
import { tick } from './tick';
import { canteenCoverage, canteenStatus } from './upkeep';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** The sensible bot's station after a month, with money to spend. */
function station(): GameState {
  let s = createInitialState(1);
  for (let day = 0; day < 30; day++) s = tick(sensibleBot(s));
  return { ...s, money: 5_000_000 };
}

describe('playtest fixes (Phase 12a)', () => {
  it('says what stands between the staff and their canteen, instead of asking for one that is there', () => {
    const base = station();
    const bare = { ...base, rooms: base.rooms.filter((r) => r.type !== 'canteen') };
    expect(canteenStatus(bare)).toEqual({ kind: 'none' });

    // A canteen that lacks a piece serves nobody, and says which piece.
    let s = ok(setRoomType(ok(rentRoom(bare, 'G')), 'G', 'canteen'));
    expect(canteenStatus(s)).toMatchObject({ kind: 'incomplete', roomId: 'G' });
    for (const type of ['canteenTable', 'coffeeMachine', 'fridge'] as const) s = ok(autoPlaceFurniture(s, 'G', type));
    expect(canteenStatus(s)).toEqual({ kind: 'incomplete', roomId: 'G', missing: [['counter', 1]] });
    expect(canteenCoverage(s)).toBe(0);

    s = ok(autoPlaceFurniture(s, 'G', 'counter'));
    const open = canteenStatus(s);
    expect(open.kind).toBe('open');
    expect(open).toEqual({ kind: 'open', coverage: canteenCoverage(s) });
    expect(canteenCoverage(s)).toBeGreaterThan(0);

    // One that nobody cleans ends up serving nobody too.
    const filthy = { ...s, rooms: s.rooms.map((r) => (r.roomId === 'G' ? { ...r, cleanliness: 0 } : r)) };
    expect(canteenStatus(filthy)).toEqual({ kind: 'filthy', roomId: 'G' });
    // A second canteen that is in order counts.
    expect(canteenStatus({ ...filthy, rooms: [...filthy.rooms, ...base.rooms.filter((r) => r.type === 'canteen')] }).kind).toBe('open');
  });

  it('raises morale within weeks once the canteen is complete', () => {
    const base = station();
    let s: GameState = { ...base, rooms: base.rooms.filter((r) => r.type !== 'canteen'), employees: base.employees.map((e) => ({ ...e, morale: 60 })) };
    const average = (state: GameState) => state.employees.reduce((sum, e) => sum + e.morale, 0) / state.employees.length;
    s = ok(setRoomType(ok(rentRoom(s, 'G')), 'G', 'canteen'));
    for (const type of ['canteenTable', 'coffeeMachine', 'fridge', 'counter', 'counter'] as const) s = ok(autoPlaceFurniture(s, 'G', type));
    for (let day = 0; day < 21; day++) s = tick(s);
    expect(average(s)).toBeGreaterThan(75);
  });

  it('never leaves a sponsor offer standing on a show that has just got a sponsor', () => {
    let s = structuredClone(tick(station()));
    const offer = (id: string): SponsorOffer => ({ id, sponsor: `Sponsor ${id}`, medium: 'radio', cpmMultiplier: 1.3, preferredAudience: null, minListeners: 1, weeks: 4, penalty: 100, expiresOn: s.day + 14 });
    s.offers.push(offer('o-1'), offer('o-2'));
    const [first, second] = s.offers.slice(-2) as [SponsorOffer, SponsorOffer];
    const free = showsForOffer(s, first);
    expect(free.length).toBeGreaterThan(1);
    // Both cards start on the show with the most listeners.
    const best = showForOffer(s, first, null)!;
    expect(best).toBe(free[0]!.id);
    expect(showForOffer(s, second, null)).toBe(best);

    s = ok(acceptOffer(s, first.id, best));
    // The other card, which stood on the same show, moves on to the best one that is left…
    expect(showsForOffer(s, second).map((show) => show.id)).not.toContain(best);
    const next = showForOffer(s, second, best)!;
    expect(next).toBe(free[1]!.id);
    // …and that one can be accepted.
    s = ok(acceptOffer(s, second.id, next));
    // A choice the player made is kept while it stands.
    const third = offer('o-3');
    const left = showsForOffer(s, third);
    if (left.length > 1) expect(showForOffer(s, third, left[1]!.id)).toBe(left[1]!.id);
    // A TV sponsor has no radio show to go to.
    expect(showForOffer(s, { ...third, medium: 'tv' }, null)).toBeNull();
  });

  it('turns the chairs of the canteen table, and the people on them, towards the table', () => {
    const table = FURNITURE_ASSETS.canteenTable;
    const middle = FURNITURE.canteenTable.w / 2;
    const chairs = table.parts.filter((p) => 'model' in p && p.model === 'chair');
    expect(chairs).toHaveLength(4);
    for (const chair of chairs) {
      // A chair that is not turned faces south (+z); a quarter turn brings it round to the east (+x).
      expect(chair.turn, `chair at ${chair.at[0]}`).toBe(chair.at[0] < middle ? 1 : 3);
      // A person faces north unturned, so sits half a turn further round than the chair.
      const seat = table.spots!.find((spot) => spot.at[0] === chair.at[0] && spot.at[1] === chair.at[2])!;
      expect(seat.turn).toBe(((chair.turn ?? 0) + 2) % 4);
    }
  });

  it('closes a toilet cubicle with a door', () => {
    const parts = FURNITURE_ASSETS.toilet.parts;
    const panels = parts.filter((p) => 'box' in p && p.box[1] > 1);
    // A back wall, two sides and the door across the front.
    expect(panels).toHaveLength(4);
    const door = panels.find((p) => 'box' in p && p.box[0] > 0.5 && p.at[2] > 0.5);
    expect(door).toBeDefined();
    // The door hangs clear of the floor and stays inside the tile.
    expect(door!.at[1]).toBeGreaterThan(0);
    expect(door!.at[2]).toBeLessThan(FURNITURE.toilet.h);
  });
});
