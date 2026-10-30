import { describe as suite, expect, it } from 'vitest';
import fixture from './traffic.fixture.json';
import { FIXTURE_TOWNS, describe } from './traffic.fixture';

// Streets with ends of their own, crossings that are junctions and routes (#217) must not change how the towns
// that already exist drive. traffic.fixture.json was recorded from the code before that change: the lanes, crossings,
// stops, lights, the lanes by the water and the place of every vehicle after a minute (that also catches a change in
// the order of the random draws). (Skywave Beach was re-recorded in #219, when its lot got a drive past the shore;
// the other two towns are as they were recorded.)
suite.each(FIXTURE_TOWNS)('the traffic in $name', (town) => {
  it('is as it was recorded', () => {
    const now = JSON.parse(JSON.stringify(describe(town)));
    const was = (fixture as Record<string, unknown>)[town.name];
    expect(now).toEqual(was);
  });
});
