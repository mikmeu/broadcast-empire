import { describe, expect, it } from 'vitest';
import { buildRoom, type ActionResult } from '../sim/actions';
import type { FurnitureType, RoomType } from '../config/office';
import { autoPlaceFurniture, withoutRecordRooms } from '../sim/fixtures';
import { sensibleBot } from '../sim/bots';
import { createInitialState } from '../sim/newGame';
import { proposeRoom } from '../sim/rooms';
import type { GameState, Id } from '../sim/state';
import { advance } from '../sim/tick';
import { unlockAll } from '../sim/unlocks';
import { DAY_BEATS, peopleAt, whereabouts } from './layout';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}

/** A station with a host, and no canteen or dressing room anywhere. */
function bare() {
  const s = structuredClone(withoutRecordRooms(unlockAll(advance(sensibleBot(createInitialState(1)), 30))));
  s.money = 5_000_000;
  s.floorsUnlocked = 3;
  s.rooms = s.rooms.filter((r) => r.type !== 'canteen' && r.type !== 'dressingRoom');
  const show = s.shows.find((sh) => sh.hostId && sh.studioId && s.rooms.some((r) => r.roomId === sh.studioId))!;
  const floor = s.rooms.find((r) => r.roomId === show.studioId)!.floor;
  return { s, host: show.hostId!, floor };
}

function build(state: GameState, floor: number, type: RoomType, furniture: FurnitureType[]) {
  let s = ok(buildRoom(state, { ...proposeRoom(state, floor, type)!, type }));
  const id = s.lastId!;
  for (const f of furniture) s = ok(autoPlaceFurniture(s, id, f));
  return Object.assign(s, { lastId: id });
}

/** Where the host is at the first beat of the day when they are between shows. */
function between(s: GameState, host: Id) {
  for (let b = 0; b < DAY_BEATS; b++) {
    const p = peopleAt(s, b).get(host);
    if (p?.status === 'offAir') return p;
  }
  return undefined;
}

describe('hosts between shows (#141)', () => {
  it('wait in the hall when there is no canteen or dressing room', () => {
    const { s, host, floor } = bare();
    const p = between(s, host)!;
    expect(p).toMatchObject({ roomId: null, floor });
    expect(whereabouts(s, p)).toMatch(/no free seat in a canteen or a dressing room/);
  });

  it('sit at the make-up table of a dressing room on their floor', () => {
    const { s: base, host, floor } = bare();
    const s = build(base, floor, 'dressingRoom', ['makeupTable', 'clothesRail']);
    const p = between(s, host)!;
    expect(p).toMatchObject({ roomId: s.lastId, floor, activity: 'sit' });
  });

  it('go to the nearest floor with a canteen when their own has none', () => {
    const { s: base, host, floor } = bare();
    const other = floor === 1 ? 2 : 1;
    const s = build(base, other, 'canteen', ['canteenTable']);
    const p = between(s, host)!;
    expect(p).toMatchObject({ roomId: s.lastId, floor: other });
  });
});
