import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../config/office';
import { SLOTS } from '../config/world';
import { assignVan, buyNewsVan, hire, type ActionResult } from '../sim/actions';
import { sensibleBot } from '../sim/bots';
import { autoPlaceFurniture, roomOfKind } from '../sim/fixtures';
import { createInitialState } from '../sim/newGame';
import { employeesWithDesk } from '../sim/office';
import { advance } from '../sim/tick';
import { unlockAll } from '../sim/unlocks';
import type { GameState } from '../sim/state';
import { vanTripsOf } from './day';
import { vanBays } from './parking';
import { SITES } from './sites';
import { createStreet, stepVans } from './street';
import { touching } from './touching';
import { HOUR_SECONDS, clockHours, createTraffic, lotCarFor, stepTraffic, vehiclesIn } from './traffic';

const ok = (r: ActionResult): GameState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

/** A station with a news show in the evening, a van sent out on the evening shift and a journalist at a desk. */
function crewed(): GameState {
  let s = structuredClone(unlockAll(advance(sensibleBot(createInitialState(1)), 34)));
  s.money = 5_000_000;
  s = ok(buyNewsVan(s));
  s = ok(assignVan(s, s.vans[0]!.id, 'evening'));
  const hired = structuredClone(s);
  hired.candidates.push({ id: 'journo', name: 'Jo', role: 'journalist', skill: 50, salary: 1_500, specialties: [], fame: 0, department: null, foundFor: null });
  s = ok(hire(hired, 'journo'));
  for (let i = 0; i < 6 && !employeesWithDesk(s).has('journo'); i++) s = ok(autoPlaceFurniture(s, roomOfKind(s, 'office'), 'workstation'));
  return s;
}

const FRAME = 0.25;

describe('the news van in the town (0.20.0, #20)', () => {
  it('stands in the first bay of the van zone, and goes out two hours before the evening news and is back an hour after it', () => {
    const s = crewed();
    const [trip] = vanTripsOf(s, 0);
    expect(trip!.bay).toBe(vanBays(BUILDINGS.standard, s.floorsUnlocked)[0]!.id);
    expect(trip!.out).toBe(17 - 2);
    expect(trip!.back).toBe(19.5 + 1);
  });

  it('stays parked all day when it has no shift, no journalist or no news', () => {
    const s = crewed();
    const parked = ok(assignVan(s, s.vans[0]!.id, null));
    expect(vanTripsOf(parked, 0)[0]).toMatchObject({ out: null, back: null });
    const day = ok(assignVan(s, s.vans[0]!.id, 'day'));
    expect(vanTripsOf(day, 0)[0]).toMatchObject({ out: null, back: null });
    const alone = structuredClone(s);
    alone.employees = alone.employees.filter((e) => e.id !== 'journo');
    expect(vanTripsOf(alone, 0)[0]!.out).toBeNull();
    expect(vanTripsOf({ ...s, vans: [] }, 0)).toEqual([]);
  });

  it('drives out of the lot into the street, and back into its bay, without touching anything', () => {
    const s = crewed();
    const trips = vanTripsOf(s, 0);
    const building = BUILDINGS.standard;
    const traffic = createTraffic(7, clockHours(0, 8), SITES.capital.traffic, building);
    const street = createStreet();
    const dawn = clockHours(0, 8);
    const key = trips[0]!.key;
    let wasParked = false;
    let left = false;
    let outInStreet = false;
    let back = false;
    while (traffic.hours < clockHours(0, 21.5)) {
      const hours = traffic.hours + FRAME / HOUR_SECONDS;
      stepTraffic(traffic, FRAME, hours);
      stepVans(street, traffic, trips, dawn, hours);
      expect(touching(traffic)).toBeNull();
      const home = lotCarFor(traffic, key);
      if (home?.state === 'parked' && !left) wasParked = true;
      if (home?.state === 'leaving') left = true;
      if (left && vehiclesIn(traffic).some((v) => v.news)) outInStreet = true;
      if (outInStreet && lotCarFor(traffic, `${key}:back`)?.state === 'parked') back = true;
    }
    expect(wasParked).toBe(true);
    expect(left).toBe(true);
    expect(outInStreet).toBe(true);
    expect(back).toBe(true);
    // It is all there: the van is parked in its bay at the end of the day and nothing else is in the lot.
    expect(traffic.lot.cars.filter((car) => car.news)).toHaveLength(1);
    expect(traffic.lot.cars[0]!.bay).toBe(trips[0]!.bay);
    expect(SLOTS[3]).toBe('evening');
  }, 120_000);
});
