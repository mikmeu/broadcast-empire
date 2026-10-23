import { describe, expect, it } from 'vitest';
import { OFFICE_DAY, SLOTS, SLOT_HOURS } from '../config/world';
import { setRoomType, type ActionResult } from '../sim/actions';
import { addMissingEquipment, autoPlaceFurniture, rentRoom } from '../sim/fixtures';
import { sensibleBot } from '../sim/bots';
import { createInitialState } from '../sim/newGame';
import { needsDesk, roomName } from '../sim/office';
import type { Employee, GameState } from '../sim/state';
import { tick } from '../sim/tick';
import { FURNITURE_ASSETS } from './assets';
import { CEO_ID, DAY, airtimes, atWork, busBefore, doorTime, guestName, guestStays, mealPlan, shiftOf, travelOf, tripsOf } from './day';
import { DAY_BEATS, LIFT_QUEUE, ROUTINE, SERVICE, audienceBlocks, beatOfHour, hourOfBeat, liftQueue, peopleAt, peopleOnFloor, roomAt, showsOnAir, slotAt, talkGuests, whereabouts, whereaboutsOf } from './layout';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** A staffed station after a month, with a canteen on the floor where everyone works. */
function station(): GameState {
  let s = createInitialState(1);
  for (let day = 0; day < 30; day++) s = tick(sensibleBot(s));
  const free = ['G', 'D', 'B', 'A'].find((id) => !s.rooms.some((r) => r.roomId === id))!;
  s = { ...s, money: 1_000_000 };
  return ok(addMissingEquipment(ok(setRoomType(ok(rentRoom(s, free)), free, 'canteen')), free));
}

/** Everyone who works here and is in the building at a beat; guests, audiences, the receptionist and the player are left out. */
const staff = (s: GameState, beat?: number) => [...peopleAt(s, beat).values()].filter((p) => p.role !== 'visitor' && p.role !== 'ceo');
const beats = Array.from({ length: DAY_BEATS }, (_, beat) => beat);
/** Several days, as beats: the same hours, with other people on the bus. */
const days = [0, 1, 2, 3, 4];
const inAt = (s: GameState, e: Employee, day: number, hour: number) => atWork(shiftOf(s, e), travelOf(e, day), hour);

describe('the slots of the schedule by the clock', () => {
  it('follow each other through the day, and start again the next day', () => {
    expect(DAY_BEATS).toBe((OFFICE_DAY.to - OFFICE_DAY.from) * ROUTINE.beatsPerHour);
    // Nothing is on before half past eight or after half past nine.
    expect(slotAt(0)).toBe(-1);
    expect(slotAt(DAY_BEATS - 1)).toBe(-1);
    SLOTS.forEach((slot, index) => {
      const [from, to] = SLOT_HOURS[slot];
      expect(slotAt(beatOfHour(from))).toBe(index);
      expect(slotAt(beatOfHour(to) - 1)).toBe(index);
      expect(slotAt(beatOfHour(from) + 3 * DAY_BEATS)).toBe(index);
    });
    expect(showsOnAir(station(), -1)).toEqual([]);
  });
});

describe('working hours (Phase 11e)', () => {
  it('are nine to five for everyone but hosts and production staff', () => {
    const s = station();
    const others = s.employees.filter((e) => e.role !== 'host' && e.role !== 'production');
    expect(others.length).toBeGreaterThan(1);
    for (const e of others) expect(shiftOf(s, e)).toEqual({ from: 9, to: 17, early: false });
  });

  it('bring a host in shortly before their first show and send them home shortly after their last', () => {
    const s = station();
    const hosts = s.employees.filter((e) => e.role === 'host');
    let checked = 0;
    for (const host of hosts) {
      const times = s.shows.filter((show) => show.hostId === host.id && show.studioId).flatMap((show) => airtimes(s, show));
      const shift = shiftOf(s, host);
      if (times.length === 0) {
        expect(shift).toBeNull();
        continue;
      }
      checked++;
      const first = Math.min(...times.map((t) => t[0]));
      const last = Math.max(...times.map((t) => t[1]));
      // The first show of the day begins half an hour into it: its host is in before the clock starts.
      expect(shift).toEqual(first === SLOT_HOURS.morning[0] ? { from: OFFICE_DAY.from, to: last + DAY.hostAfter, early: true } : { from: first - DAY.hostBefore, to: Math.min(OFFICE_DAY.to, last + DAY.hostAfter), early: false });
      expect(travelOf(host, 3)).toBe('taxi');
    }
    expect(checked).toBeGreaterThan(1);
    // A host whose show is taken off the schedule stays at home.
    const idle = structuredClone(s);
    idle.channels.forEach((channel) => (channel.schedule = channel.schedule.map(() => null)));
    for (const host of hosts) expect(shiftOf(idle, host)).toBeNull();
  });

  it('give production staff eight hours around their shows: early with the first show, late with the last', () => {
    const s = structuredClone(station());
    const crew = s.employees.find((e) => e.role === 'production')!;
    const only = (slots: number[]) => {
      const t = structuredClone(s);
      const show = t.shows.find((x) => x.studioId)!;
      t.shows = [{ ...show, staffIds: [crew.id] }];
      t.channels = [{ ...t.channels[0]!, schedule: SLOTS.map((_, slot) => (slots.includes(slot) ? show.id : null)) }];
      return shiftOf(t, crew);
    };
    // No show to make, or shows in the middle of the day: office hours.
    expect(only([])).toEqual({ from: 9, to: 17, early: false });
    expect(only([1])).toEqual({ from: 9, to: 17, early: false });
    // The afternoon show ends at five: they stay the quarter of an hour after it.
    expect(only([1, 2])).toEqual({ from: 9, to: 17.25, early: false });
    // The morning show starts at half past eight: in before the day begins, and home eight hours later.
    expect(only([0])).toEqual({ from: 8, to: 16, early: true });
    // The evening show ends at half past seven: a quarter of an hour after it they go, eight hours after they came.
    expect(only([3])).toEqual({ from: 11.75, to: 19.75, early: false });
    expect(only([4])).toEqual({ from: 13.75, to: 21.75, early: false });
    // The first and the last show: a long day.
    expect(only([0, 4])).toEqual({ from: 8, to: 21.75, early: true });
  });

  it('have everyone in the building during their hours, once, and nobody outside them', () => {
    const s = station();
    for (const day of days) {
      for (const beat of beats) {
        const hour = hourOfBeat(beat);
        const present = staff(s, day * DAY_BEATS + beat);
        expect(present.map((p) => p.id).sort(), `day ${day}, ${hour}`).toEqual(s.employees.filter((e) => inAt(s, e, day, hour)).map((e) => e.id).sort());
        for (const p of present) expect(whereabouts(s, p)).toMatch(/\.$/);
        for (const e of s.employees) expect(whereaboutsOf(s, e.id, day * DAY_BEATS + beat)).toMatch(/\.$/);
      }
    }
    // The building is empty of staff at neither end of a day with a morning show and a late one.
    expect(staff(s, 0).length).toBeGreaterThan(0);
    expect(staff(s, beatOfHour(21)).length).toBeGreaterThan(0);
    expect(staff(s, beatOfHour(12)).length).toBeGreaterThan(staff(s, 0).length);
  });

  it('has everyone at their post when no beat is given', () => {
    const s = station();
    expect(staff(s).map((p) => p.id).sort()).toEqual(s.employees.map((e) => e.id).sort());
    expect(staff(s).every((p) => (p.status === 'post' || p.status === 'waiting') && !p.away)).toBe(true);
  });

  it('says of those who are not in when they come or that they have gone', () => {
    const s = station();
    const clerk = s.employees.find((e) => e.role === 'channelManager')!;
    const travel = travelOf(clerk, 0);
    const door = doorTime(shiftOf(s, clerk)!, travel)!;
    expect(whereaboutsOf(s, clerk.id, 0)).toMatch(/^Not in yet: coming (on foot|by bus|by taxi), in at 9:(00|15) am\. Their hours today are 9:00 am to 5:00 pm\.$/);
    expect(whereaboutsOf(s, clerk.id, beatOfHour(door))).toMatch(/^(At their desk|Waiting)/);
    expect(whereaboutsOf(s, clerk.id, beatOfHour(18))).toMatch(/^Gone home (on foot|by bus|by taxi)\. Their hours today were/);
    expect(whereaboutsOf(s, CEO_ID, 0)).toMatch(/^Not in yet: .* Your hours today are/);
  });
});

describe('getting to work (Phase 11e)', () => {
  it('is on foot, by bus or by taxi for the staff, differently from day to day; hosts take a taxi', () => {
    const s = station();
    const office = s.employees.filter((e) => e.role !== 'host');
    const seen = new Set<string>();
    for (let day = 0; day < 40; day++) for (const e of office) seen.add(travelOf(e, day));
    expect([...seen].sort()).toEqual(['bus', 'taxi', 'walk']);
    const one = office[0]!;
    expect(new Set(Array.from({ length: 40 }, (_, day) => travelOf(one, day))).size).toBe(3);
    expect(travelOf(one, 12)).toBe(travelOf(one, 12));
    for (const host of s.employees.filter((e) => e.role === 'host')) for (let day = 0; day < 10; day++) expect(travelOf(host, day)).toBe('taxi');
  });

  it('gets those who walk or take a taxi to the door on the hour; the bus is the one that stands at the stop at a quarter to', () => {
    const office = { from: 9, to: 17, early: false };
    expect(doorTime(office, 'walk')).toBe(9);
    expect(doorTime(office, 'taxi')).toBe(9);
    expect(busBefore(9.25)).toBe(8.75);
    // The walk from the stop takes the same real seconds as it did when a day was shorter (0.16.0): it may be over by nine.
    expect(doorTime(office, 'bus')).toBe(Math.max(9, 8.75 + DAY.busWalk));
    // A late shift: the bus before it, and the walk from the stop.
    expect(doorTime({ from: 13.75, to: 21.75, early: false }, 'bus')).toBe(13.75 + DAY.busWalk);
    expect(doorTime({ from: 8, to: 16, early: true }, 'taxi')).toBeNull();
  });

  it('lists the journeys of a day: in for everyone who is seen to arrive, out for everyone who leaves before the day ends', () => {
    const s = station();
    const trips = tripsOf(s, 2, audienceBlocks(s));
    expect(new Set(trips.map((t) => t.key)).size).toBe(trips.length);
    for (const e of s.employees) {
      const shift = shiftOf(s, e);
      const mine = trips.filter((t) => t.id === e.id);
      if (!shift) {
        expect(mine).toEqual([]);
        continue;
      }
      const travel = travelOf(e, 2);
      expect(mine.filter((t) => t.way === 'in').map((t) => t.at)).toEqual(shift.early ? [] : [doorTime(shift, travel)]);
      expect(mine.filter((t) => t.way === 'out').map((t) => t.at)).toEqual(shift.to + DAY.wayOut < OFFICE_DAY.to ? [shift.to + DAY.wayOut] : []);
      for (const t of mine) expect(t.travel).toBe(travel);
    }
    // The player comes and goes like the office staff.
    expect(trips.filter((t) => t.id === CEO_ID).map((t) => t.way).sort()).toEqual(['in', 'out']);
    expect([...trips].sort((a, b) => a.at - b.at)).toEqual(trips);
  });

  it('brings an audience by bus before its show and takes it home after', () => {
    let s = station();
    const studio = s.shows.find((show) => show.studioId && airtimes(s, show).some(([from]) => from > 10))!.studioId!;
    s = { ...s, rooms: s.rooms.map((r) => (r.roomId === studio ? { ...r, type: 'tvKidsStudio' as const, furniture: [] } : r)) };
    s = ok(autoPlaceFurniture(s, studio, 'audienceSeating'));
    expect(audienceBlocks(s)).toEqual([{ studioId: studio, seats: 10 }]);
    const trips = tripsOf(s, 0, audienceBlocks(s)).filter((t) => t.id.startsWith('audience-'));
    const times = s.shows.filter((show) => show.studioId === studio).flatMap((show) => airtimes(s, show));
    expect(trips.filter((t) => t.way === 'in').length).toBe(10 * times.filter(([from]) => from - DAY.audienceBefore > OFFICE_DAY.from + 0.5).length);
    expect(trips.every((t) => t.travel === 'bus')).toBe(true);
    for (const t of trips.filter((x) => x.way === 'in')) expect(times.some(([from]) => t.at === from - DAY.audienceBefore)).toBe(true);
  });
});

describe('the guest of a talk show comes and goes by taxi (0.20.0)', () => {
  /** The station with a radio talk studio, with a talk table, for the first show with a studio. */
  function talking() {
    let s = station();
    const show = s.shows.find((x) => x.studioId && airtimes(s, x).some(([from]) => from > 10))!;
    s = { ...s, rooms: s.rooms.map((r) => (r.roomId === show.studioId ? { ...r, type: 'radioTalkStudio' as const, furniture: [] } : r)) };
    return { s: ok(autoPlaceFurniture(s, show.studioId!, 'talkTable')), show, studio: show.studioId! };
  }

  it('is the person who gets out of the taxi before the show, and who takes the taxi home after it', () => {
    const { s, show, studio } = talking();
    expect(talkGuests(s)).toContain(studio);
    const id = `visitor-guest-${studio}`;
    const trips = tripsOf(s, 0, audienceBlocks(s), talkGuests(s)).filter((t) => t.id === id);
    const times = airtimes(s, show);
    expect(trips.length).toBeGreaterThan(0);
    expect(new Set(trips.map((t) => t.key)).size).toBe(trips.length);
    const names = s.shows.filter((x) => x.studioId === studio).map((x) => guestName(x.id));
    for (const t of trips) {
      expect(t.travel).toBe('taxi');
      expect(names).toContain(t.name);
    }
    for (const [from, to] of times) {
      const [arrives] = trips.filter((t) => t.way === 'in' && t.at === from - DAY.guestBefore);
      expect(arrives, `before ${from}`).toBeDefined();
      expect(arrives!.name).toBe(guestName(show.id));
      // They are in the studio from the time they come in until after the show: the person at the table is the one from the taxi.
      for (const hour of [from - DAY.guestBefore, from, to - 0.25]) {
        expect(peopleAt(s, beatOfHour(hour)).get(id), `at ${hour}`).toMatchObject({ name: arrives!.name, roomId: studio, status: 'visiting' });
      }
      if (to + DAY.guestAfter + DAY.wayOut < OFFICE_DAY.to) expect(trips.some((t) => t.way === 'out' && t.at === to + DAY.guestAfter + DAY.wayOut)).toBe(true);
    }
    // Not there while no show of the studio is near.
    const stays = guestStays(s, studio);
    for (const beat of beats) {
      const hour = hourOfBeat(beat);
      expect(peopleAt(s, beat).has(id), `at ${hour}`).toBe(stays.some((stay) => hour >= stay.from && hour < stay.to));
    }
  });

  it('has no trip when the studio has no seat for a guest', () => {
    const { s, studio } = talking();
    const none = { ...s, rooms: s.rooms.map((r) => (r.roomId === studio ? { ...r, furniture: [] } : r)) };
    expect(talkGuests(none)).not.toContain(studio);
    expect(tripsOf(none, 0, audienceBlocks(none), talkGuests(none)).filter((t) => t.id === `visitor-guest-${studio}`)).toEqual([]);
    // Without being asked for guests the journeys are what they were.
    expect(tripsOf(s, 0, audienceBlocks(s)).filter((t) => t.id.startsWith('visitor-guest-'))).toEqual([]);
  });
});

describe('the line for the lifts (0.20.0)', () => {
  const people = (n: number) => Array.from({ length: n }, (_, i) => `p${String(i).padStart(2, '0')}`);

  it('gives everyone a place in front of one of the two doors, a row behind the one before', () => {
    const places = liftQueue(people(8));
    expect([...places.keys()]).toEqual(people(8));
    const spots = [...places.values()];
    expect(new Set(spots.map((p) => `${p.x},${p.z}`)).size).toBe(8);
    // The two lifts take turns, and each line runs away from its door.
    expect(new Set(spots.map((p) => p.x)).size).toBe(2);
    for (let k = 2; k < 8; k++) expect(spots[k]!.z).toBeLessThan(spots[k - 2]!.z);
    for (const p of spots) expect(p.z).toBeLessThan(SERVICE.lifts.door.z);
  });

  it('lets two lifts’ worth go at once, and the rest wait for the next departure', () => {
    const places = [...liftQueue(people(14)).values()];
    expect(places.slice(0, 2 * LIFT_QUEUE.perLift).every((p) => p.wait === 0)).toBe(true);
    expect(places.slice(2 * LIFT_QUEUE.perLift, 4 * LIFT_QUEUE.perLift).every((p) => p.wait === LIFT_QUEUE.every)).toBe(true);
    expect(places[12]!.wait).toBe(2 * LIFT_QUEUE.every);
    // The waits never get shorter down the line.
    places.forEach((p, k) => k > 0 && expect(p.wait).toBeGreaterThanOrEqual(places[k - 1]!.wait));
  });

  it('is there for those who come in at nine, and only for those who set out in that very beat', () => {
    // Everyone works on the second floor: they go in from the street through the lifts.
    const s = { ...station(), rooms: station().rooms.map((r) => ({ ...r, floor: 2 })) };
    let queued = 0;
    for (const beat of beats) {
      for (const floor of [1, 2]) {
        const here = peopleOnFloor(s, floor, beat).filter((p) => p.queue);
        for (const p of here) {
          expect(p.roomId).toBe('lifts');
          expect(p.fresh).toBe(true);
        }
        expect(new Set(here.map((p) => `${p.queue!.x},${p.queue!.z}`)).size).toBe(here.length);
        queued += here.length;
      }
    }
    expect(queued).toBeGreaterThan(5);
    // Nobody lines up at the entrance.
    for (const p of peopleOnFloor(s, 1, beatOfHour(9))) if (p.roomId === 'entrance') expect(p.queue).toBeUndefined();
  });
});

describe('a day in the office (Phase 11e)', () => {
  it('uses a studio only while one of its shows is on the schedule', () => {
    const s = station();
    let onAir = 0;
    let between = 0;
    for (const beat of beats) {
      const live = showsOnAir(s, slotAt(beat));
      for (const p of staff(s, beat).filter((person) => person.role === 'host')) {
        const show = live.find((candidate) => candidate.hostId === p.id);
        if (show) {
          onAir++;
          expect(p).toMatchObject({ status: 'onAir', roomId: show.studioId, show: show.name });
          expect(whereabouts(s, p)).toBe(`On the air in ${roomName(s, show.studioId!)}, presenting “${show.name}”.`);
        } else {
          between++;
          expect(p.status).not.toBe('onAir');
          // Nobody is in a studio without a show: they rest in the canteen, wait in the corridor or are away.
          expect(p.roomId === null || p.roomId === 'stairs' || s.rooms.find((r) => r.roomId === p.roomId)?.type === 'canteen').toBe(true);
        }
      }
      // Whoever presents a show that is on is in the building.
      for (const show of live) expect(staff(s, beat).some((p) => p.id === show.hostId), `beat ${beat}`).toBe(true);
    }
    expect(onAir).toBeGreaterThan(0);
    expect(between).toBeGreaterThan(0);
  });

  it('feeds everyone who is at work over lunch, each at a moment of their own, on a seat to themselves', () => {
    const s = station();
    const seats = s.rooms.filter((r) => r.type === 'canteen').flatMap((r) => r.furniture).reduce((n, item) => n + (FURNITURE_ASSETS[item.type].spots?.length ?? 0), 0);
    expect(seats).toBeGreaterThan(0);
    for (const day of days) {
      const meals = mealPlan(s, day, seats);
      const lunches = meals.filter((m) => m.from < DAY.lunch.to);
      for (const meal of meals) {
        const e = s.employees.find((x) => x.id === meal.id)!;
        expect(e.role).not.toBe('host');
        expect(meal.to - meal.from).toBe(DAY.meal);
        expect(meal.seat).toBeLessThan(seats);
        // Within the hours of lunch or dinner, and within their own.
        const window = meal.from < DAY.lunch.to ? DAY.lunch : DAY.dinner;
        expect(meal.from).toBeGreaterThanOrEqual(window.from);
        expect(meal.to).toBeLessThanOrEqual(window.to);
        expect(inAt(s, e, day, meal.from) && inAt(s, e, day, meal.to - 0.01)).toBe(true);
        // Nobody else on that seat meanwhile.
        expect(meals.some((other) => other !== meal && other.seat === meal.seat && other.from < meal.to && meal.from < other.to)).toBe(false);
      }
      // One lunch each, and not all at the same moment.
      expect(new Set(lunches.map((m) => m.id)).size).toBe(lunches.length);
      expect(new Set(lunches.map((m) => m.from)).size).toBeGreaterThan(1);
      // The office is small and the canteen has room: everyone who is in over lunch eats.
      const hungry = s.employees.filter((e) => e.role !== 'host' && inAt(s, e, day, 12) && inAt(s, e, day, 13.5));
      for (const e of hungry) expect(lunches.some((m) => m.id === e.id), `${e.role} on day ${day}`).toBe(true);
    }
  });

  it('shows the eaters at the table for as long as their meal lasts, on the same chair', () => {
    const s = station();
    const chairs = new Map<string, string>();
    let eaten = 0;
    for (const beat of beats) {
      const eating = staff(s, beat).filter((p) => p.status === 'lunch');
      expect(new Set(eating.map((p) => `${p.x}:${p.z}`)).size).toBe(eating.length);
      for (const p of eating) {
        eaten++;
        expect(p.activity).toBe('sit');
        expect(s.rooms.find((r) => r.roomId === p.roomId)!.type).toBe('canteen');
        expect(needsDesk(p.role as Employee['role']) || ['cleaner', 'technician', 'maintenance'].includes(p.role)).toBe(true);
        expect(whereabouts(s, p)).toBe(`Having lunch in ${roomName(s, p.roomId!)}.`);
        // The same chair all through a meal; dinner may be at another one.
        const chair = `${p.x}:${p.z}`;
        const meal = `${p.id}:${hourOfBeat(beat) < DAY.lunch.to ? 'lunch' : 'dinner'}`;
        expect(chairs.get(meal) ?? chair).toBe(chair);
        chairs.set(meal, chair);
      }
    }
    expect(eaten).toBeGreaterThan(0);
    // Nobody eats before eleven.
    expect(staff(s, beatOfHour(10.5)).some((p) => p.status === 'lunch')).toBe(false);
  });

  it('goes without when the canteen is full all through lunch', () => {
    const s = station();
    const eaters = s.employees.filter((e) => e.role !== 'host' && inAt(s, e, 0, 12) && inAt(s, e, 0, 13.5));
    expect(eaters.length).toBeGreaterThan(4);
    // One seat: at most four sittings fit between eleven and two, and the others go without.
    const lunches = mealPlan(s, 0, 1).filter((m) => m.from < DAY.lunch.to);
    expect(lunches.length).toBeGreaterThanOrEqual(3);
    expect(lunches.length).toBeLessThanOrEqual(4);
    expect(lunches.length).toBeLessThan(eaters.length);
    expect(mealPlan(s, 0, 0)).toEqual([]);
  });

  it('gives those who work into the evening a dinner as well', () => {
    const s = structuredClone(station());
    const crew = s.employees.find((e) => e.role === 'production')!;
    const show = s.shows.find((x) => x.studioId)!;
    s.shows = [{ ...show, staffIds: [crew.id] }];
    s.channels = [{ ...s.channels[0]!, schedule: SLOTS.map((_, slot) => (slot === 4 ? show.id : null)) }];
    expect(shiftOf(s, crew)).toEqual({ from: 13.75, to: 21.75, early: false });
    const mine = mealPlan(s, 0, 8).filter((m) => m.id === crew.id);
    // In too late for lunch, and at the table around dinner time.
    expect(mine).toHaveLength(1);
    expect(mine[0]!.from).toBeGreaterThanOrEqual(DAY.dinner.from);
    expect(mine[0]!.to).toBeLessThanOrEqual(DAY.dinner.to);
    // Nine-to-five people have gone by then.
    expect(mealPlan(s, 0, 8).filter((m) => m.from >= DAY.dinner.from).every((m) => m.id === crew.id)).toBe(true);
  });

  it('lets everyone slip away once a day, down the stairs if there are no toilets', () => {
    const s = station();
    const away = new Map<string, number>();
    for (const beat of beats) {
      for (const p of staff(s, beat).filter((person) => person.status === 'away')) {
        expect(p).toMatchObject({ ...SERVICE.stairs.at, roomId: 'stairs', away: true });
        expect(whereabouts(s, p)).toBe('Away for a moment.');
        away.set(p.id, (away.get(p.id) ?? 0) + 1);
      }
    }
    for (const e of s.employees.filter((x) => x.role !== 'host' && x.role !== 'production')) {
      expect(away.get(e.id) ?? 0, e.name).toBeGreaterThan(0);
      expect(away.get(e.id)!).toBeLessThanOrEqual(ROUTINE.awayBeats);
    }
    // They don't all go at once.
    const most = Math.max(...beats.map((beat) => staff(s, beat).filter((p) => p.away).length));
    expect(most).toBeLessThan(s.employees.length / 2);
  });
});

describe('coming in and going home (Phase 11e)', () => {
  /** The first beat at which someone is on the ground floor on a day, and what they look like then. */
  const first = (s: GameState, id: string, day = 0) => {
    for (const beat of beats) {
      const person = peopleOnFloor(s, 1, day * DAY_BEATS + beat).find((p) => p.id === id);
      if (person) return { beat, person };
    }
    throw new Error(`${id} never turns up`);
  };

  it('has people walk in through the entrance when their hours begin, to their place', () => {
    const s = station();
    const clerk = s.employees.find((e) => e.role === 'channelManager')!;
    const { beat, person } = first(s, clerk.id);
    expect(hourOfBeat(beat)).toBe(doorTime(shiftOf(s, clerk)!, travelOf(clerk, 0)));
    expect(person.from).toEqual({ ...SERVICE.entrance.at, roomId: 'entrance' });
    expect(person.away).toBeUndefined();
    // A beat later they are simply there: nothing sends them back to the door.
    expect(peopleOnFloor(s, 1, beat + 1).find((p) => p.id === clerk.id)!.from).toBeUndefined();
    // The entrance is at the head of the building, outside every room.
    expect(roomAt(s, 1, SERVICE.entrance.at.x, SERVICE.entrance.at.z)).toBe('entrance');
    expect(SERVICE.entrance.at.x).toBeLessThan(SERVICE.entrance.door.x);
  });

  it('has whoever is in early at their place when the day begins, without being seen to arrive', () => {
    const s = station();
    const early = s.employees.filter((e) => shiftOf(s, e)?.early);
    expect(early.length).toBeGreaterThan(0);
    for (const day of [0, 1]) {
      const people = [1, 2, 3].flatMap((floor) => peopleOnFloor(s, floor, day * DAY_BEATS));
      for (const e of early) {
        const person = people.find((p) => p.id === e.id)!;
        expect(person.from).toBeUndefined();
        expect(person.away).toBeUndefined();
      }
      // And nobody from yesterday evening is still on their way out.
      expect(people.every((p) => p.status !== 'leaving' && p.status !== 'passing')).toBe(true);
    }
  });

  it('has people walk out by the entrance when their hours end, and be gone a little later', () => {
    const s = station();
    const clerk = s.employees.find((e) => e.role === 'channelManager')!;
    const end = beatOfHour(17);
    const on = (beat: number) => peopleOnFloor(s, 1, beat).find((p) => p.id === clerk.id);
    expect(on(end - 1)!.away).toBeUndefined();
    for (let k = 0; k < 4; k++) {
      expect(on(end + k)).toMatchObject({ ...SERVICE.entrance.at, roomId: 'entrance', status: 'leaving', away: true });
      expect(whereabouts(s, on(end + k)!)).toBe('On the way out.');
    }
    expect(on(end + 4)).toBeUndefined();
  });

  it('takes people who work upstairs through the ground floor and the lifts', () => {
    let s = station();
    s = { ...s, floorsUnlocked: 2 };
    // Move the office staff to the first room on the second floor.
    const desks = s.rooms.find((r) => r.type === 'office')!.furniture.length;
    s = ok(setRoomType(ok(rentRoom(s, 'H')), 'H', 'office'));
    for (let n = 0; n < desks; n++) s = ok(autoPlaceFurniture(s, 'H', 'workstation'));
    s = { ...s, rooms: s.rooms.map((r) => (r.type === 'office' && r.roomId !== 'H' ? { ...r, furniture: [] } : r)) };
    expect(s.rooms.find((r) => r.roomId === 'H')!.floor).toBe(2);
    // Someone who works at a workstation and has no show to make today keeps office hours.
    const clerk = s.employees.find((e) => e.role === 'production')!;
    s = { ...s, shows: s.shows.map((show) => ({ ...show, staffIds: show.staffIds.filter((id) => id !== clerk.id) })) };
    expect(shiftOf(s, clerk)).toEqual({ from: 9, to: 17, early: false });
    const door = beatOfHour(doorTime(shiftOf(s, clerk)!, travelOf(clerk, 0))!);
    const on = (floor: number, beat: number) => peopleOnFloor(s, floor, beat).find((p) => p.id === clerk.id);

    // Coming in: across the ground floor from the entrance to the lifts, and out of the lifts upstairs.
    expect(on(1, door - 1)).toBeUndefined();
    expect(on(1, door)).toMatchObject({ ...SERVICE.lifts.at, roomId: 'lifts', status: 'passing', away: true, from: { roomId: 'entrance' } });
    expect(whereabouts(s, on(1, door)!)).toBe('On the way up in the lift.');
    expect(on(2, door)).toMatchObject({ roomId: 'H', from: { ...SERVICE.lifts.at, roomId: 'lifts' } });
    expect(on(1, door + 2)).toBeUndefined();
    expect(on(2, door + 2)).toMatchObject({ roomId: 'H' });
    expect(on(2, door + 2)!.from).toBeUndefined();

    // Going home: to the lifts upstairs, and from the lifts to the entrance downstairs.
    const end = beatOfHour(17);
    expect(on(2, end)).toMatchObject({ ...SERVICE.lifts.at, roomId: 'lifts', status: 'leaving', away: true });
    expect(whereabouts(s, on(2, end)!)).toBe('On the way to the lift.');
    expect(on(1, end)).toMatchObject({ ...SERVICE.entrance.at, roomId: 'entrance', status: 'passing', away: true, from: { roomId: 'lifts' } });
    expect(on(1, end + 2)).toBeUndefined();
    expect(on(2, end + 4)).toBeUndefined();
  });

  it('knows which room a point is in, so that someone on their way goes on from where they are', () => {
    // With rooms A and H built: the first room of the ground floor and of the floor above.
    const s = ['A', 'H'].reduce((game, id) => ok(rentRoom(game, id)), { ...createInitialState(1), floorsUnlocked: 3 });
    expect(roomAt(s, 1, 1, 1)).toBe('A');
    expect(roomAt(s, 1, 8, 1)).toBeNull();
    expect(roomAt(s, 2, 1, 1)).toBe('H');
    expect(roomAt(s, 1, 3, 5.5)).toBeNull();
    expect(roomAt(s, 1, -2, 5)).toBe('reception');
    expect(roomAt(s, 2, -2, 5)).toBeNull();
    expect(roomAt(s, 1, SERVICE.lifts.at.x, SERVICE.lifts.at.z)).toBe('lifts');
    expect(roomAt(s, 3, SERVICE.stairs.at.x, SERVICE.stairs.at.z)).toBe('stairs');
  });
});
