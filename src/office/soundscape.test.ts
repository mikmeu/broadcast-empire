import { beforeAll, describe, expect, it } from 'vitest';
import { sensibleBot } from '../sim/bots';
import { createInitialState } from '../sim/newGame';
import type { GameState } from '../sim/state';
import { tick } from '../sim/tick';
import { OFFICE_SOUNDS } from '../audio/officeSounds';
import { trainAt } from './city';
import { beatOfHour } from './layout';
import { SITES } from './sites';
import { SOUNDSCAPE, soundsAt, typingSound, type Listener } from './soundscape';

/** The sensible bot's station after four months: an office, a canteen with a cook, studios and a master control room, on floor 1. */
let station: GameState;
beforeAll(() => {
  station = createInitialState(1);
  for (let day = 0; day < 120; day++) station = tick(sensibleBot(station));
});

const ear: Listener = { x: 10, z: 10, zoom: 1, angle: Math.PI / 4 };
/** The beat at an hour; 23 is late in the evening, when the day has all but ended. */
const at = (hour: number) => beatOfHour(Math.min(hour, 21.75));
const ids = (state: GameState, hour: number, view = ear, time = 3, floor = 1) => soundsAt(state, floor, at(hour), view, time).map((h) => h.id);
/** Every sound that is heard at some moment of a few minutes. */
const overTime = (state: GameState, hour: number, floor = 1) => {
  const heard = new Set<string>();
  for (let time = 0; time < 600; time += 1) for (const h of soundsAt(state, floor, at(hour), ear, time)) heard.add(h.id);
  return heard;
};
const withTier = (state: GameState, tier: number): GameState => ({
  ...state,
  rooms: state.rooms.map((r) => ({ ...r, furniture: r.furniture.map((f) => (f.type === 'workstation' ? { ...f, tier } : f)) })),
});
const audienceSeating = { id: 'seats', type: 'audienceSeating' as const, x: 0, y: 0, turn: 0, tier: 1, condition: 100, boughtOn: 0 };
const withAudience = (state: GameState, genre?: GameState['shows'][number]['genre']): GameState => ({
  ...state,
  rooms: state.rooms.map((r) => (r.type === 'radioTalkStudio' ? { ...r, furniture: [...r.furniture, audienceSeating] } : r)),
  shows: genre ? state.shows.map((s) => (s.genre === 'news' ? { ...s, genre } : s)) : state.shows,
});

describe('the sounds of the office', () => {
  it('has the workspace type, and a typewriter before PCs and keyboards after', () => {
    expect(typingSound(1)).toBe('typewriter');
    expect(typingSound(2)).toBe('typewriter-electric');
    expect(typingSound(3)).toBe('keyboard');
    expect(typingSound(4)).toBe('keyboard');
    expect(ids(withTier(station, 1), 10)).toContain('typewriter');
    expect(ids(withTier(station, 2), 10)).toContain('typewriter-electric');
    expect(ids(withTier(station, 3), 10)).toContain('keyboard');
    expect(ids(withTier(station, 3), 10)).not.toContain('typewriter');
    // Phones follow the desks.
    expect(overTime(withTier(station, 1), 10)).toContain('phone-bell');
    expect(overTime(withTier(station, 3), 10)).toContain('phone-electric');
    expect(overTime(withTier(station, 3), 10)).not.toContain('phone-bell');
  });

  it('is silent in an office with nobody in it: only the town is heard', () => {
    const empty = { ...station, employees: [] };
    const heard = soundsAt(empty, 1, at(10), ear, 3).map((h) => h.id);
    expect(heard).toContain('city');
    expect(heard.filter((id) => !['city', 'train'].includes(id))).toEqual([]);
  });

  it('has no audience sounds without an audience, or when the show is not on the air', () => {
    const audience = new Set(['applause', 'laughter']);
    expect([...overTime(station, 18)].filter((id) => audience.has(id))).toEqual([]);
    const sitcom = withAudience(station, 'sitcom');
    // The audience is there, the show is on: laughter now and then.
    expect(overTime(sitcom, 18)).toContain('laughter');
    // Before the first show: the audience waits quietly.
    expect([...overTime(sitcom, 8.25)].filter((id) => audience.has(id))).toEqual([]);
  });

  it('applauds when the show starts and when it ends, and laughs only at genres that have laughs', () => {
    const news = withAudience(station);
    const sitcom = withAudience(station, 'sitcom');
    // Somewhere in the evening a slot begins or ends with the audience in.
    const beats = [...Array(24)].map((_, i) => at(15 + i / 4));
    const clapped = beats.filter((beat) => soundsAt(news, 1, beat, ear, 0).some((h) => h.id === 'applause'));
    expect(clapped.length).toBeGreaterThan(0);
    // Only at those moments, and the same moment has the same key all through it.
    expect(clapped.length).toBeLessThan(beats.length / 2);
    expect(overTime(news, 18)).not.toContain('laughter');
    expect(overTime(sitcom, 18)).toContain('laughter');
  });

  it('plays the stove only while a cook is there', () => {
    expect(ids(station, 10)).toContain('stove');
    const none = { ...station, employees: station.employees.filter((e) => e.role !== 'cook') };
    expect(ids(none, 10)).not.toContain('stove');
    expect(ids(none, 13)).toContain('cutlery');
  });

  it('plays cutlery and chatter while people eat, louder the more of them', () => {
    expect(ids(station, 10)).not.toContain('chatter');
    const few = soundsAt(station, 1, at(12.5), ear, 3).find((h) => h.id === 'chatter')!;
    const many = soundsAt(station, 1, at(13), ear, 3).find((h) => h.id === 'chatter')!;
    expect(few).toBeDefined();
    expect(many.level).toBeGreaterThan(few.level);
    expect(ids(station, 13)).toContain('cutlery');
  });

  it('plays repairs where a technician works at a broken piece', () => {
    const office = station.rooms.find((r) => r.type === 'office')!;
    const broken = {
      ...station,
      rooms: station.rooms.map((r) => (r === office ? { ...r, furniture: r.furniture.map((f) => ({ ...f, condition: 0 })) } : r)),
      employees: station.employees.map((e) => (e.role === 'maintenance' ? { ...e, location: office.roomId } : e)),
    };
    expect(overTime(station, 10)).not.toContain('repair');
    expect(overTime(broken, 10)).toContain('repair');
  });

  it('plays the town outside by the place, on every floor', () => {
    const where = (headquarters: GameState['headquarters']) => ({ ...station, headquarters });
    expect(ids(where('capital'), 23)).toContain('city');
    expect(ids(where('north'), 23)).toContain('industry');
    expect(ids(where('coast'), 23)).toContain('sea');
    expect(ids(where('heartland'), 23)).toContain('countryside');
    expect(ids(where('highlands'), 23)).toContain('countryside');
    expect(overTime(where('coast'), 23)).toContain('gulls');
    expect(overTime(where('heartland'), 9)).toContain('farm');
    // The animals are heard in the morning only.
    expect(overTime(where('heartland'), 20)).not.toContain('farm');
    // The town is quieter higher up, and the roof has it too.
    const low = soundsAt(station, 1, at(23), ear, 3).find((h) => h.id === 'city')!;
    const high = soundsAt(station, 6, at(23), ear, 3).find((h) => h.id === 'city')!;
    expect(high.level).toBeLessThan(low.level);
    // Only the floor on screen is heard.
    expect(ids(station, 10, ear, 3, 2)).not.toContain('typewriter');
    expect(ids(station, 10, ear, 3, 2)).toContain('city');
  });

  it('plays the train only while it passes, and none with motion reduced', () => {
    const pass = (time: number) => soundsAt(station, 1, at(23), ear, time).some((h) => h.id === 'train');
    const cars = SITES.capital.train.length;
    expect(trainAt(3, cars)).not.toBeNull();
    expect(pass(3)).toBe(true);
    let quiet = 0;
    while (trainAt(quiet, cars) !== null) quiet += 1;
    expect(pass(quiet)).toBe(false);
    expect(soundsAt(station, 1, at(23), ear, 3, true).some((h) => h.id === 'train')).toBe(false);
    // A goods train in the industrial valley.
    const north = { ...station, headquarters: 'north' as const };
    expect(soundsAt(north, 1, at(23), ear, 3).map((h) => h.id)).toContain('goods-train');
    expect(soundsAt(north, 1, at(23), ear, 3).map((h) => h.id)).not.toContain('train');
  });

  it('is louder the nearer the camera looks, and the further it is zoomed in', () => {
    const office = station.rooms.find((r) => r.type === 'office')!;
    const level = (view: Listener) => soundsAt(station, 1, at(10), view, 3).find((h) => h.id === 'typewriter')!.level;
    const centre = { x: office.x + office.w / 2, z: office.y + office.h / 2 };
    const close = level({ ...ear, ...centre });
    const far = level({ ...ear, x: centre.x + 15, z: centre.z });
    expect(close).toBeGreaterThan(far);
    expect(level({ ...ear, ...centre, zoom: 2 })).toBeGreaterThanOrEqual(close);
    expect(level({ ...ear, x: centre.x + 6, z: centre.z, zoom: 2 })).toBeGreaterThan(level({ ...ear, x: centre.x + 6, z: centre.z }));
  });

  it('puts a sound on the side of the screen it is on', () => {
    const office = station.rooms.find((r) => r.type === 'office')!;
    const centre = { x: office.x + office.w / 2, z: office.y + office.h / 2 };
    const pan = (view: Listener) => soundsAt(station, 1, at(10), view, 3).find((h) => h.id === 'typewriter')!.pan;
    // The camera looks along (−1, −1): to the right on screen is +x, −z.
    expect(pan({ ...ear, x: centre.x - 8, z: centre.z + 8 })).toBeGreaterThan(0.2);
    expect(pan({ ...ear, x: centre.x + 8, z: centre.z - 8 })).toBeLessThan(-0.2);
  });

  it('plays at most so many loops and sounds at once, and every sound it names has a clip', () => {
    for (const state of [station, withTier(station, 3), withAudience(station, 'sitcom')]) {
      for (const hour of [9, 10, 12.5, 13, 18]) {
        for (let time = 0; time < 300; time += 7) {
          const heard = soundsAt(state, 1, at(hour), ear, time);
          expect(heard.filter((h) => h.loop).length).toBeLessThanOrEqual(SOUNDSCAPE.loops);
          expect(heard.filter((h) => !h.loop).length).toBeLessThanOrEqual(SOUNDSCAPE.onces);
          for (const h of heard) {
            expect(OFFICE_SOUNDS[h.id].loop, h.id).toBe(h.loop);
            expect(h.level).toBeGreaterThan(0);
            expect(h.level).toBeLessThanOrEqual(1);
            expect(Math.abs(h.pan)).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });
});
