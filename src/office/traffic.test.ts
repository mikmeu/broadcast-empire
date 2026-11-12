import { describe, expect, it, vi } from 'vitest';
import { MS_PER_DAY } from '../config/balance';
import { BUILDINGS, FLOOR } from '../config/office';
import { REGIONS } from '../config/world';
import { daysInMonth, hourAt, monthNumber, officeHours, toDay } from '../sim/calendar';
import { CITY } from './assets';
import { SITES } from './sites';
import { SYNTHETIC_TOWNS } from './syntheticTowns';
import { CAPITAL, GRID, layoutOf, type Layout } from './townLayout';
import { MAPS } from '../config/maps';
import { touching } from './touching';
import { HOUR_SECONDS, clockHours, createTraffic, lightFor, roadsOf, stepTraffic, vehiclesIn, type Traffic } from './traffic';

// (Transponder Valley, drawn in #402, has streets 190 tiles long: its tests take 2 to 6 s alone and run over the default 5 s when the machine is busy.)
vi.setConfig({ testTimeout: 30_000 });

const SEEDS = [1, 7, 12345];
/** A frame at normal speed. */
const FRAME = 1 / 30;

/** Lets `seconds` of game time go by, a frame at a time, and looks at the town after every frame. */
function run(traffic: Traffic, seconds: number, look?: (traffic: Traffic) => void, frame = FRAME): void {
  for (let n = Math.round(seconds / frame); n > 0; n--) {
    stepTraffic(traffic, frame, traffic.hours + frame / HOUR_SECONDS);
    look?.(traffic);
  }
}

const collision = touching;

/** A town to try the traffic in: a region's, with the building the office is in. */
interface Town {
  name: string;
  layout: Layout;
  site: (typeof SITES)[keyof typeof SITES];
  building: (typeof BUILDINGS)[keyof typeof BUILDINGS];
}

/** Every region with both buildings: the capital's town is laid out from its drawing, the others are grids. */
const EVERY: Town[] = REGIONS.flatMap(({ id }) =>
  // (The drawings of the valley and the coast have no street beyond the east one on the office's side that a longer building could stand beside, and they never get one. The buildings of Aerial Fields and Amplify Hills are only ever in their own regions, which have them instead of the long one.)
  Object.values(BUILDINGS).filter((building) => !((id === 'north' || id === 'coast' || id === 'heartland' || id === 'highlands') && building.id === 'long') && !(building.id === 'fields' && id !== 'heartland') && !(building.id === 'hills' && id !== 'highlands')).map((building): Town => ({ name: `${id}, ${building.id} building`, layout: layoutOf(SITES[id]), site: SITES[id], building })),
);

/** The towns with streets of the same length (a grid, or the map of the capital, the valley and the coast); the other two have roads with ends of their own. */
const TOWNS: Town[] = EVERY.filter((town) => !town.layout.edge);

/** Aerial Fields and Amplify Hills, laid out by their roads (#218): T-junctions, corners, dead ends, one or two ways in. In the countryside they have the long building (Amplify Hills) and the building of Aerial Fields. */
const ROAD_TOWNS: Town[] = EVERY.filter((town) => town.layout.edge && town.building.id !== 'courtyard');

/** The made-up towns (syntheticTowns.ts): streets with ends of their own. They have the capital's traffic and the standard building. */
const MADE_UP: Town[] = SYNTHETIC_TOWNS.map((layout) => ({ name: layout.id, layout, site: SITES.capital, building: BUILDINGS.standard }));

const make = (town: Town, seed: number, hours: number) => createTraffic(seed, hours, town.site.traffic, town.building, town.site.front === 'water', town.layout);

// (The grid of blocks, which was the capital's town until 0.20.0, is no town of the game any more, and its streets are too narrow for vehicles drawn twice as large: its traffic is no longer tried.)

describe('the streets', () => {
  it('have a lane each way on the streets beside and in front of the office, and none where the railway stands', () => {
    for (const layout of [GRID, CAPITAL]) {
      const { lanes } = roadsOf(layout);
      expect(lanes.length).toBeGreaterThanOrEqual(layout === GRID ? 8 : 6);
      const lines = layout.streets(BUILDINGS.standard);
      for (const lane of lanes) {
        const street = lines.find((l) => l.along === lane.along && Math.abs(l.at - lane.at) < layout.streetWidth / 2);
        expect(street).toBeDefined();
        if (lane.along === 'x') expect(Math.abs(lane.at - layout.railway.z)).toBeGreaterThan(layout.streetWidth / 2);
        // Never through the office.
        const span = lane.along === 'x' ? [0, FLOOR.h] : [-6, BUILDINGS.standard.w];
        expect(lane.at < span[0]! || lane.at > span[1]!).toBe(true);
        // Keeping to the right: both lanes of a street lie on either side of its middle.
        // (#194: every lane lies on the driver's right of each lane of its street that goes the other way.)
        const right = (l: (typeof lanes)[number]) => (l.along === 'x' ? l.direction : -l.direction);
        for (const other of lanes) if (other.street === lane.street && other.direction === -lane.direction) expect(right(lane) * (lane.at - other.at)).toBeGreaterThan(0);
      }
    }
  });

  it('are four tiles wide in every town of the game, a lane of two tiles each way, for vehicles drawn twice as large (0.20.0)', () => {
    expect(CAPITAL.streetWidth).toBe(4);
    expect(GRID.streetWidth).toBe(CITY.streetWidth);
    // (The two towns laid out by their roads, #218, have roads drawn two tiles wide: they are driven as roads of four.)
    for (const { id } of REGIONS) expect(layoutOf(SITES[id]).streetWidth).toBe(4);
    // Each lane lies in the middle of its half of the street: a lane of the map is two tiles.
    for (const lane of roadsOf(CAPITAL).lanes) {
      const street = CAPITAL.streets(BUILDINGS.standard).find((l) => l.along === lane.along && Math.abs(l.at - lane.at) < 2)!;
      expect(Math.abs(lane.at - street.at)).toBe(1);
    }
  });

  it('have the bus stop and the taxi stand on the reception’s street, on the office’s side, clear of the crossings and of each other', () => {
    for (const layout of [GRID, CAPITAL]) {
      const roads = roadsOf(layout);
      const own = layout.own(BUILDINGS.standard);
      const bus = CITY.vehicles.bus.length / 2;
      const taxi = CITY.vehicles.taxi.length / 2;
      const lane = roads.lanes[roads.busStop.lane]!;
      for (const [stop, half] of [[roads.busStop, bus], [roads.taxiStand, taxi]] as const) {
        const there = roads.lanes[stop.lane]!;
        // The office’s side of the street: the lane nearer the middle of its own block, with the pavement beyond it.
        const middle = there.along === 'x' ? own.z + own.d / 2 : own.x + own.w / 2;
        const street = layout.streets(BUILDINGS.standard).find((l) => l.along === there.along && Math.abs(l.at - there.at) < layout.streetWidth / 2)!;
        expect(Math.abs(there.at - middle)).toBeLessThan(Math.abs(street.at - middle));
        const wait = there.along === 'x' ? stop.wait.z : stop.wait.x;
        expect(Math.abs(wait - middle)).toBeLessThan(Math.abs(there.at - middle));
        for (const crossing of there.crossings) expect(Math.abs(crossing.s - stop.s)).toBeGreaterThan(layout.streetWidth / 2 + half + 0.5);
      }
      expect(lane.at).toBeGreaterThan(layout === GRID ? FLOOR.h : -Infinity);
      if (layout === CAPITAL) {
        // Both on the map’s reception street, in the same lane, a bus and a taxi apart.
        expect(roads.busStop.lane).toBe(roads.taxiStand.lane);
        expect(Math.abs(roads.busStop.s - roads.taxiStand.s)).toBeGreaterThan(bus + taxi + 1);
        // On the kerb the drawing has its bus stop on, west of the entrance.
        expect(roads.busStop.wait.x).toBeLessThan(-6);
      }
    }
  });

  it('have lights at the junctions of the busy streets of the map, and at no junction without one', () => {
    const roads = roadsOf(CAPITAL);
    const standard = CAPITAL.busy(BUILDINGS.standard);
    const across = { x: standard.filter((s) => s.along === 'x'), z: standard.filter((s) => s.along === 'z') };
    expect(roads.crossings).toHaveLength(across.x.length * across.z.length);
    for (const crossing of roads.crossings) {
      expect(across.z.some((s) => s.at === crossing.x)).toBe(true);
      expect(across.x.some((s) => s.at === crossing.z)).toBe(true);
    }
    // Streets whose kerbs are a tile or two apart are one road in the drawing: only one of them carries traffic.
    const lines = CAPITAL.streets(BUILDINGS.standard).filter((s) => s.along === 'x').map((s) => s.at);
    for (const a of across.x) for (const b of across.x) if (a !== b) expect(Math.abs(a.at - b.at) - CAPITAL.streetWidth).toBeGreaterThanOrEqual(4);
    expect(lines.length).toBeGreaterThan(across.x.length);
  });
});

describe.each([...TOWNS, ...ROAD_TOWNS, ...MADE_UP])('the traffic in $name (Phase 11b)', (town) => {
  const seeds = town.name === 'capital, standard building' || MADE_UP.includes(town) ? SEEDS : [1];
  it('never lets two vehicles touch, in a lane or on a crossing', () => {
    for (const seed of seeds) {
      const traffic = make(town, seed, clockHours(0, 9));
      expect(vehiclesIn(traffic).length).toBeGreaterThan(3);
      // Four minutes, a frame at a time: a full day of buses and thousands of crossings.
      run(traffic, 240, (now) => {
        const hit = collision(now);
        if (hit) throw new Error(`A ${hit[0].kind} and a ${hit[1].kind} touch after ${now.time.toFixed(2)} s (seed ${seed}).`);
      });
    }
  });

  it('does not let them touch at the fastest speed either, when a frame is four times as long', () => {
    const traffic = make(town, 3, clockHours(2, 14));
    run(traffic, 240, (now) => expect(collision(now)).toBeNull(), 4 * FRAME);
  });

  it('keeps everything moving: nobody stands still for long, and every lane that is driven is driven to its end', () => {
    for (const seed of seeds) {
      const traffic = make(town, seed, clockHours(0, 9));
      const still = new Map<number, number>();
      const seen = new Set<number>();
      let longest = 0;
      run(traffic, 300, (now) => {
        for (const v of vehiclesIn(now)) {
          seen.add(v.lane);
          const standing = v.v === 0 && v.halt?.state !== 'standing' ? (still.get(v.id) ?? 0) + FRAME : 0;
          still.set(v.id, standing);
          longest = Math.max(longest, standing);
        }
      });
      expect(longest, `seed ${seed}`).toBeLessThan(20);
      const driven = traffic.closed.filter((closed) => !closed).length;
      // (The two towns of roads drawn by hand, #399, have lanes nobody can enter, or only after a long way round: the eastbound lane beside the lot in Aerial Fields, between two one-way roads, and a road from the west edge in Amplify Hills that does not reach the edge. Five minutes is not long enough to see all the rest of the 20 lanes there.)
      if (ROAD_TOWNS.includes(town)) expect(seen.size).toBeGreaterThanOrEqual(Math.floor(driven * 0.65));
      else expect(seen.size).toBe(driven);
      // Vehicles keep coming in at the start of each lane that has one (a lane by the water begins past the shore) and keep leaving.
      const entering = traffic.closed.filter((closed, l) => !closed && traffic.begins[l] === null && (!town.layout.edge || traffic.lanes[l]!.startsAt === 'edge')).length;
      expect(traffic.left).toBeGreaterThan((0.4 * entering * 300) / town.site.traffic.every);
    }
  });
});

describe.each([...TOWNS.filter((town) => town.building.id === 'standard' && town.site.traffic.every < 20)])('the traffic in $name: kinds and repeats', (town) => {
  it('is not a procession: speeds, gaps and the kinds of vehicle differ', () => {
    const traffic = make(town, 7, clockHours(0, 12));
    const kinds = new Set<string>();
    const speeds = new Set<number>();
    const tones = new Set<string>();
    let waited = 0;
    // (Four minutes since 0.20.0, when the vehicles grew: where vans are one in ten, a couple of minutes may go by without one.)
    run(traffic, 240, (now) => {
      for (const v of vehiclesIn(now)) {
        kinds.add(v.kind);
        tones.add(v.tone);
        speeds.add(Math.round(v.speed * 10));
        if (v.v === 0) waited++;
      }
    });
    // (Where trucks are rare, as by the sea, a couple of minutes may go by without one.)
    expect([...kinds].sort()).toEqual(town.site.traffic.mix.truck >= 0.1 ? ['bus', 'car', 'taxi', 'truck', 'van'] : expect.arrayContaining(['bus', 'car', 'taxi', 'van']));
    expect(speeds.size).toBeGreaterThan(10);
    expect(tones.size).toBeGreaterThan(3);
    // Some have to wait for a crossing or for the one in front.
    expect(waited).toBeGreaterThan(0);
    // In a lane the gaps between vehicles are not all alike.
    const lane = traffic.queues.find((queue) => queue.length >= 4)!;
    const gaps = lane.slice(1).map((v, i) => Math.round(lane[i]!.s - v.s));
    expect(new Set(gaps).size).toBeGreaterThan(1);
  });

  it('is the same every time for the same game, and different for another', () => {
    const picture = (seed: number) => {
      const traffic = make(town, seed, clockHours(1, 10));
      run(traffic, 20);
      return vehiclesIn(traffic).map((v) => `${v.kind}:${v.lane}:${v.s.toFixed(3)}`).join();
    };
    expect(picture(5)).toBe(picture(5));
    expect(picture(5)).not.toBe(picture(6));
  });
});

describe('the lanes of the capital follow its map (#194)', () => {
  const capital = EVERY.find((town) => town.name === 'capital, standard building')!;
  const { lanes } = roadsOf(capital.layout);
  const written = MAPS.coaxia!.map.roads.flatMap((road) => (road.along === 'z' ? (road.lanes ?? []) : []));

  it('run the way the map’s lanes do: one-way streets with two lanes, a dual carriageway with two lanes each way, driven on the right', () => {
    const streets = new Set(lanes.map((lane) => lane.street));
    expect(streets.size).toBe(3);
    for (const street of streets) {
      const mine = lanes.filter((lane) => lane.street === street);
      expect(mine.every((lane) => lane.places === 2)).toBe(true);
      if (mine[0]!.along === 'z') {
        // The streets beside the office: one way only, with no lane the other way.
        expect(new Set(mine.map((lane) => lane.direction)).size).toBe(1);
        for (const lane of mine) {
          expect(lane.oncoming).toBe(-1);
          expect(lane.opposite).toEqual([]);
        }
        // The map has a one-way street each way along z.
        expect(written.some((lane) => lane.direction === mine[0]!.direction)).toBe(true);
      } else {
        expect(mine.filter((lane) => lane.direction === 1)).toHaveLength(2);
        expect(mine.filter((lane) => lane.direction === -1)).toHaveLength(2);
        for (const lane of mine) expect(lane.opposite).toHaveLength(2);
      }
    }
  });

  it('turns right only from the kerb lane into the kerb lane, left only from the lane next to the middle, onto green; left turns across the oncoming carriageway happen, and nobody changes lane but round a corner or goes backwards', () => {
    let lefts = 0;
    let across = 0;
    let rights = 0;
    for (const seed of [1, 7]) {
      const traffic = make(capital, seed, clockHours(0, 9));
      const was = new Map<number, { lane: number; s: number; turned: boolean }>();
      run(traffic, 600, (now) => {
        for (const v of vehiclesIn(now)) {
          const before = was.get(v.id);
          if (before && !before.turned) {
            if (v.lane !== before.lane) throw new Error(`A ${v.kind} changed lane without turning`);
            expect(v.s).toBeGreaterThanOrEqual(before.s - 1e-9);
          }
          const first = !before || !before.turned;
          if (v.turn && first) {
            const from = now.lanes[v.turn.from]!;
            const to = now.lanes[v.turn.to]!;
            if (v.turn.kind === 'right') {
              rights++;
              expect(from.place).toBe(0);
              expect(to.place).toBe(0);
            } else if (v.turn.kind === 'left') {
              lefts++;
              if (from.opposite.length > 0) across++;
              expect(from.place).toBe(from.places - 1);
              expect(to.place).toBe(to.places - 1);
              // Onto a crossing on green, or a junction without lights.
              const light = lightFor(now, v.turn.id, from.along);
              expect(light === 'green' || light === null).toBe(true);
            }
          }
          was.set(v.id, { lane: v.lane, s: v.s, turned: v.turn !== undefined });
        }
      });
    }
    expect(rights).toBeGreaterThan(0);
    expect(lefts).toBeGreaterThan(0);
    expect(across).toBeGreaterThan(0);
  }, 60_000);
});

describe('the clock the traffic runs on', () => {
  it('counts the hours on through the months, as the calendar does', () => {
    for (const [day, progress] of [[0, 0], [0, 0.5], [17, 0.25], [31, 0], [400, 0.9], [20000, 0.1]] as const) {
      expect(officeHours(day, progress)).toBeCloseTo(clockHours(monthNumber(day), hourAt(day, progress)), 9);
    }
    // An hour on the clock lasts about as long as the traffic reckons with: within a tenth, whatever the month.
    for (const month of [1, 2, 3, 4]) {
      const first = toDay(1970, month, 1);
      const seconds = (daysInMonth(first) * MS_PER_DAY) / 1000 / 14;
      expect(Math.abs(seconds - HOUR_SECONDS) / HOUR_SECONDS).toBeLessThan(0.1);
    }
  });
});
