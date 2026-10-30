import { describe, expect, it } from 'vitest';
import { buildingFor } from '../config/office';
import { ACTIVE_REGIONS } from '../config/balance';
import { type RegionId } from '../config/world';
import { ARROW, ARROW_BEFORE, ARROW_EVERY, LAMP_HEIGHT, PAVEMENT, arrowsOf, lampHides, townBlocks } from './city';
import { SITES } from './sites';
import { roadsOf } from './traffic';
import { layoutOf } from './townLayout';

const capital = SITES.capital;
const office = buildingFor('capital');
const layout = layoutOf(capital);
const inside = (r: { x: number; z: number; w: number; d: number }, x: number, z: number) => x > r.x && x < r.x + r.w && z > r.z && z < r.z + r.d;

describe('lamp posts and middle strips (#195)', () => {
  const blocks = townBlocks(7, capital, office);
  const lamps = blocks.flatMap((b) => (b.lamps ?? []).map((lamp) => ({ lamp, block: b })));

  it('stand on the green strips of Coax City, in rows along both edges', () => {
    expect(lamps.length).toBeGreaterThan(10);
    for (const { lamp, block } of lamps) {
      // (A block's rect is given by its middle and its size.)
      const m = block.rect!;
      const r = { x: m.x - m.w / 2, z: m.z - m.d / 2, w: m.w, d: m.d };
      expect(inside(r, lamp.x, lamp.z)).toBe(true);
      expect(block.ground).toBe('grass');
      // 0.8 in from the kerb: clear of the strollers' line (0.22 in) and of the road.
      const edge = Math.min(lamp.x - r.x, r.x + r.w - lamp.x, lamp.z - r.z, r.z + r.d - lamp.z);
      expect(edge).toBeCloseTo(0.8, 6);
    }
  });

  it('never hide the office from the first view, and the drawing leaves out those that would from a turned one', () => {
    for (const { lamp } of lamps) expect(lampHides(lamp, 0, office)).toBe(false);
    // (A lamp is 2.4 tall: it hides the office when it stands within that distance of its ground floor, whichever way the view turns.)
    for (const turn of [1, 2, 3]) {
      const shown = lamps.filter(({ lamp }) => !lampHides(lamp, turn, office));
      expect(shown.length, `turn ${turn}`).toBeGreaterThan(0);
      for (const { lamp } of shown) expect(lampHides(lamp, turn, office)).toBe(false);
    }
    expect(LAMP_HEIGHT + PAVEMENT).toBeGreaterThan(2);
  });

  it('keep clear of the trees', () => {
    for (const b of blocks.filter((x) => x.lamps)) for (const tree of b.items) for (const lamp of b.lamps!) expect(Math.hypot(tree.x - lamp.x, tree.z - lamp.z)).toBeGreaterThan(1);
  });

  it('are only in Coax City', () => {
    for (const id of ACTIVE_REGIONS as RegionId[]) {
      if (id === 'capital') continue;
      const site = SITES[id];
      expect(townBlocks(7, site, buildingFor(id)).some((b) => b.lamps), id).toBe(false);
    }
  });

  it('middle strips are the narrow cells between the two carriageways, and never the railway side', () => {
    const { medians, cells } = layout.map!;    expect(medians.length).toBeGreaterThan(0);
    for (const m of medians) {
      expect(Math.min(m.w, m.d)).toBeLessThan(6);
      expect(m.z + m.d).toBeLessThanOrEqual(layout.railway.z - layout.railway.width / 2 + 0.01);
      // They are cells, so a strip is broken at every cross street, and never overlaps a block.
      for (const c of cells.filter((c) => Math.min(c.w, c.d) >= 6)) {
        const overlap = m.x < c.x + c.w && m.x + m.w > c.x && m.z < c.z + c.d && m.z + m.d > c.z;
        expect(overlap).toBe(false);
      }
    }
    expect(blocks.filter((b) => b.median).length).toBe(medians.length);
  });
});

describe('arrows on the one-way streets (#235)', () => {
  const arrows = arrowsOf(layout);
  const roads = roadsOf(layout);
  const { oneWays, cells } = layout.map!;

  it('are on the one-way streets only, never on a dual carriageway', () => {
    expect(oneWays.length).toBeGreaterThanOrEqual(2);
    expect(arrows.length).toBeGreaterThan(oneWays.length);
    for (const street of oneWays) expect(new Set(street.lanes!.map((l) => l.direction)).size).toBe(1);
  });

  it('lie in a lane and point the way it is driven', () => {
    for (const a of arrows) {
      const street = oneWays.find((s) => s.along === a.along && s.lanes!.some((l) => Math.abs(l.at - (a.along === 'z' ? a.x : a.z)) < 0.01));
      expect(street, JSON.stringify(a)).toBeDefined();
      const lane = street!.lanes!.find((l) => Math.abs(l.at - (a.along === 'z' ? a.x : a.z)) < 0.01)!;
      expect(a.direction).toBe(lane.direction);
      // Within the street, kerb to kerb.
      expect(Math.abs(lane.at - street!.at)).toBeLessThan(street!.width! / 2);
    }
  });

  it('agree with the cars: the lane of the traffic at that place runs the same way', () => {
    const { lanes } = roads;
    const busy = arrows.filter((a) => lanes.some((l) => l.along === a.along && Math.abs(l.at - (a.along === 'z' ? a.x : a.z)) < 0.01));
    expect(busy.length).toBeGreaterThan(0);
    for (const a of busy) {
      const same = lanes.filter((l) => l.along === a.along && Math.abs(l.at - (a.along === 'z' ? a.x : a.z)) < 0.01);
      for (const l of same) expect(l.direction, JSON.stringify(a)).toBe(a.direction);
    }
  });

  it('lie outside every crossing and every cross street', () => {
    for (const a of arrows) {
      for (const c of roads.crossings) {
        const inBox = Math.abs(a.x - c.x) < c.reach.x + ARROW.length / 2 && Math.abs(a.z - c.z) < c.reach.z + ARROW.length / 2;
        expect(inBox, JSON.stringify(a)).toBe(false);
      }
      // On the stretch between two rows (or columns) of cells, not on the street across.
      const along = a.along === 'z' ? a.z : a.x;
      expect(cells.some((c) => (a.along === 'z' ? c.z : c.x) + ARROW.length / 2 <= along && along <= (a.along === 'z' ? c.z + c.d : c.x + c.w) - ARROW.length / 2), JSON.stringify(a)).toBe(true);
    }
  });

  it('stand ARROW_BEFORE tiles short of the crossing ahead, and again every 20 tiles on a long stretch', () => {
    // Every arrow is 5 + 20n tiles before a kerb of a crossing ahead.
    for (const a of arrows) {
      const along = a.along === 'z' ? a.z : a.x;
      const stretch = cells.map((c) => (a.along === 'z' ? [c.z, c.z + c.d] : [c.x, c.x + c.w])).find(([lo, hi]) => along > lo! && along < hi!)!;
      const ahead = a.direction === 1 ? stretch[1]! - along : along - stretch[0]!;
      expect((ahead - ARROW_BEFORE) % ARROW_EVERY).toBeCloseTo(0, 6);
    }
  });

  it('are only in Coax City', () => {
    for (const id of ACTIVE_REGIONS as RegionId[]) {
      if (id === 'capital') continue;
      expect(arrowsOf(layoutOf(SITES[id])), id).toEqual([]);
    }
  });
});
