import { describe, expect, it } from 'vitest';
import { hire, startCampaign, type ActionResult, extendCampaign, setCampaignRepeat } from './actions';
import { autoPlaceFurniture, withoutRecordRooms } from './fixtures';
import { simulateDay } from './broadcast';
import { sensibleBot } from './bots';
import { runCampaigns } from './marketing';
import { createInitialState } from './newGame';
import { unlockAll } from './unlocks';
import { deskFor, deskRoomFor, employeesWithDesk } from './office';
import type { GameState, Person } from './state';
import { tick, advance } from './tick';
import { MARKETING } from '../config/balance';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}
const error = (result: ActionResult) => (result.ok ? 'no error' : result.error);

/** The sensible bot's day-0 station: one channel in the Capital, five shows, free desks for two more staff. */
const station = () => structuredClone(unlockAll(sensibleBot(createInitialState(1))));

/** Adds a made-up candidate to the pool, so tests don't depend on the random pool. */
function withCandidate(state: GameState, person: Partial<Person> & Pick<Person, 'role'>): GameState & { lastId?: string } {
  const s = structuredClone(state);
  const candidate: Person = { id: `p-test-${s.candidates.length}`, name: 'Test Person', skill: 80, salary: 2_000, specialties: [], fame: 0, department: null, ...person };
  s.candidates.push(candidate);
  return Object.assign(s, { lastId: candidate.id });
}

/** Hires a made-up person and gives them a desk: a workstation, or for a manager a desk in the management office. */
function hireTest(state: GameState, person: Partial<Person> & Pick<Person, 'role'>): GameState & { lastId?: string } {
  const s = withCandidate(state, person);
  const id = s.lastId!;
  const room = s.rooms.find((r) => r.type === deskRoomFor(person.role))!.roomId;
  return Object.assign(ok(autoPlaceFurniture(ok(hire(s, id)), room, deskFor(person.role))), { lastId: id });
}

describe('marketing', () => {
  it('needs a marketer, costs its budget and raises listeners, then fades', () => {
    let s = tick(station());
    const channelId = s.channels[0]!.id;
    const input = { targetId: channelId, audience: 'all' as const, weeklyBudget: 10_000, weeks: 4 };
    expect(error(startCampaign(s, input))).toMatch(/marketer/);

    s = ok(startCampaign(hireTest(s, { role: 'marketing', skill: 100 }), input));
    const listeners = (state: GameState) => simulateDay(state).channels[0]!.slots.reduce((sum, x) => sum + x.listeners, 0);
    const before = listeners(s);
    const money = s.money;
    for (let i = 0; i < 28; i++) {
      runCampaigns(s, employeesWithDesk(s));
      s.day += 1;
    }
    expect(s.money).toBeCloseTo(money - 40_000);
    expect(s.campaigns).toEqual([]);
    expect(listeners(s)).toBeGreaterThan(before * 1.1);

    const peak = s.promotion[channelId]!.workers!;
    runCampaigns(s, employeesWithDesk(s));
    expect(s.promotion[channelId]!.workers!).toBeLessThan(peak);
  });
});

// From version013.
{
  function ok(result: ActionResult): GameState & { lastId?: string } {
    if (!result.ok) throw new Error(result.error);
    return Object.assign(result.state, { lastId: result.id });
  }

  /** A radio station from the sensible test player, a month on the air, with everything open and money to spare. */
  const station = (days = 30): GameState => {
    // Without the library and post room the bot keeps its records in (0.18.0): the tests below build rooms where the game proposes them.
    const s = structuredClone(withoutRecordRooms(unlockAll(advance(sensibleBot(createInitialState(1)), days))));
    s.money = 3_000_000;
    s.floorsUnlocked = 2;
    return s;
  };

  /** Hires a made-up person straight from the pool. */
  function hirePerson(state: GameState, person: Partial<Person> & Pick<Person, 'role'>): GameState & { lastId?: string } {
    const s = structuredClone(state);
    const id = `p-${s.nextId++}`;
    s.candidates.push({ id, name: 'Test Person', skill: 80, salary: 2_000, specialties: [], fame: 0, department: null, ...person });
    return Object.assign(ok(hire(s, id)), { lastId: id });
  }

  describe('version 0.13.0', () => {
    describe('campaigns that go on (R90)', () => {
      it('a campaign can be made longer, and one that repeats starts again when it ends', () => {
        let s = station();
        s = hirePerson(s, { role: 'marketing' });
        s = ok(autoPlaceFurniture(s, s.rooms.find((r) => r.type === 'office')!.roomId, 'workstation'));
        s = ok(startCampaign(s, { targetId: s.channels[0]!.id, audience: 'all', weeklyBudget: MARKETING.budgets[0]!, weeks: 4 }));
        const id = s.campaigns[0]!.id;
        const end = s.campaigns[0]!.endDay;
        s = ok(extendCampaign(s, id, 4));
        expect(s.campaigns[0]!.endDay).toBe(end + 28);
        expect(extendCampaign(s, id, 3).ok).toBe(false);
        s = ok(setCampaignRepeat(s, id, true));
        s = advance(s, 8 * 7 + 1);
        expect(s.campaigns).toHaveLength(1);
        expect(s.campaigns[0]!.endDay).toBe(end + 28 + 28);
        s = ok(setCampaignRepeat(s, id, false));
        const notices = advance(s, 4 * 7 + 1).messages.map((m) => m.text);
        expect(notices.some((t) => /ends in a week/.test(t))).toBe(true);
        expect(notices.some((t) => /has ended/.test(t))).toBe(true);
      });
    });
  });
}
