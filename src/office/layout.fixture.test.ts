import { describe as suite, expect, it } from 'vitest';
import fixture from './layout.fixture.json';
import { LAYOUT_TOWNS, MAP_KEYS, describeTown, standing } from './layout.fixture';

// The layout of a town (townLayout.ts) must say what it said before there was one function for all five (#327): layout.fixture.json
// was recorded from `mapLayout` and `roadLayout`, with the towns as their old map files drew them. And what stands in the town (houses,
// trees, lamps, foothills, the range) is what the seed 1970 gave, written into the files once: to two decimals.
const recorded = fixture as unknown as { layouts: Record<string, unknown>; standing: Record<string, { things: string[]; peaks: string[] }> };

suite.each(LAYOUT_TOWNS)('the layout of $name', (town) => {
  it('says what it said when it was recorded', () => {
    const was = JSON.parse(JSON.stringify(recorded.layouts[town.name])) as { fields: { map: Record<string, unknown> } };
    const kept = Object.fromEntries(MAP_KEYS.map((key) => [key, was.fields.map[key]]));
    // (Transponder Valley's old layout made five cells and medians of a negative width between its last two streets, which lie in the wrong order: nothing was ever drawn or walked on them. The file has no ground of a negative width.)
    for (const key of ['cells', 'medians'] as const) kept[key] = (kept[key] as { w: number }[]).filter((r) => r.w > 0);
    was.fields.map = kept;
    expect(JSON.parse(JSON.stringify(describeTown(town)))).toEqual(was);
  });

  it('has what the seed 1970 put in the town', () => {
    const now = standing(town.region);
    const was = recorded.standing[town.name]!;
    expect(now.things).toEqual(was.things);
    expect(now.peaks).toEqual(was.peaks);
  });
});
