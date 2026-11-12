import { describe, expect, it } from 'vitest';
import { AUDIENCE_PER_SEATING, RECEPTION, type FurnitureType, type RoomType } from '../config/office';
import { CHARACTERS, characterFor } from './assets';
import { DAY, airtimes, receptionistName, tripsOf } from './day';
import { DAY_BEATS, audienceBlocks, serviceOf, beatOfHour, hourOfBeat, peopleAt, showsOnAir, slotAt, whereabouts } from './layout';
import { setRoomType, type ActionResult } from '../sim/actions';
import { addMissingEquipment, autoPlaceFurniture, rentRoom } from '../sim/fixtures';
import { sensibleBot } from '../sim/bots';
import { createInitialState } from '../sim/newGame';
import { buildingOf } from '../sim/office';
import type { GameState } from '../sim/state';
import { tick } from '../sim/tick';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
const rich = (s: GameState): GameState => ({ ...s, money: 5_000_000 });
const rent = (s: GameState, id: string, type: RoomType) => ok(setRoomType(ok(rentRoom(s, id)), id, type));
const place = (s: GameState, id: string, ...types: FurnitureType[]) => types.reduce((next, type) => ok(autoPlaceFurniture(next, id, type)), s);

/** The sensible bot's station after a month, with money to spend and without its canteen, so morale has room to move. */
function station(): GameState {
  let s = createInitialState(1);
  for (let day = 0; day < 30; day++) s = tick(sensibleBot(s));
  return rich({ ...s, rooms: s.rooms.filter((r) => r.type !== 'canteen') });
}

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
    expect(receptionist[0]).toMatchObject({ role: 'visitor', activity: 'sit', floor: 1, name: 'Elien Brasser' });
    // The same in every game, with a female body.
    expect(receptionistName()).toBe('Elien Brasser');
    expect(CHARACTERS.female).toContain(characterFor(receptionistName()));
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
    expect(away(s).every((p) => p.roomId === 'stairs' && p.away && p.x === serviceOf(buildingOf(s)).stairs.at.x)).toBe(true);

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
