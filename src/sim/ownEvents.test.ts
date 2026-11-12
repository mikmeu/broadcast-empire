import { describe, expect, it } from 'vitest';
import { OWN_EVENTS, OWN_EVENT_LIMITS } from '../config/balance';
import { stageEvent, type ActionResult } from './actions';
import { channelRegions } from './broadcast';
import { sensibleBot } from './bots';
import { hasMilestone } from './milestones';
import { createInitialState } from './newGame';
import { unlockAll } from './unlocks';
import { eventHost, ownEventCooldown, ownEventCost } from './ownEvents';
import type { GameState } from './state';
import { advance, tick } from './tick';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
const error = (result: ActionResult) => (result.ok ? 'no error' : result.error);

/** The sensible bot's station in Coaxia after a week on the air, with money to spend. */
function station(): GameState {
  const s = structuredClone(advance(unlockAll(sensibleBot(createInitialState(1))), 8));
  s.money = 2_000_000;
  return s;
}

describe('staging your own events', () => {
  it('costs per region and lifts reputation, the host’s fame and prestige', () => {
    const s = station();
    const channel = s.channels[0]!;
    const host = eventHost(s, channel)!;
    const regions = channelRegions(s, channel.id);
    expect(ownEventCost(s, channel, 'gala')).toBe(OWN_EVENTS.gala.costPerRegion * regions.length);

    const after = ok(stageEvent(s, channel.id, 'gala'));
    expect(s.money - after.money).toBe(OWN_EVENTS.gala.costPerRegion);
    expect(after.ledger.events).toBe(OWN_EVENTS.gala.costPerRegion);
    expect(after.channels[0]!.reputation.capital).toBeCloseTo(channel.reputation.capital! + OWN_EVENTS.gala.reputation);
    expect(after.employees.find((e) => e.id === host.id)!.fame).toBeCloseTo(Math.min(100, host.fame + OWN_EVENTS.gala.fame));
    expect(after.prestige).toBe(OWN_EVENTS.gala.prestigePerRegion);
    expect(after.headlines.at(-1)!.text).toMatch(/stages a gala/);
    expect(hasMilestone(tick(after), 'firstEvent')).toBe(true);
  });

  it('is limited to one a year per channel, and needs the channel on air and the money', () => {
    const s = station();
    const id = s.channels[0]!.id;
    const after = ok(stageEvent(s, id, 'concert'));
    expect(ownEventCooldown(after, after.channels[0]!)).toBe(OWN_EVENT_LIMITS.cooldownDays);
    expect(error(stageEvent(after, id, 'concert'))).toMatch(/less than a year ago/);
    expect(stageEvent({ ...after, day: after.day + OWN_EVENT_LIMITS.cooldownDays }, id, 'concert').ok).toBe(true);
    expect(error(stageEvent({ ...s, money: 1_000 }, id, 'telethon'))).toMatch(/Not enough money/);
    expect(error(stageEvent({ ...s, licenses: [] }, id, 'concert'))).toMatch(/off the air/);
  });

  it('the lift fades again, the prestige stays', () => {
    const s = station();
    const before = advance(s, 300).channels[0]!.reputation.capital!;
    const staged = ok(stageEvent(s, s.channels[0]!.id, 'telethon'));
    const after = advance(staged, 300);
    expect(staged.channels[0]!.reputation.capital!).toBeGreaterThan(s.channels[0]!.reputation.capital! + 0.15);
    expect(after.channels[0]!.reputation.capital! - before).toBeLessThan(0.04);
    expect(after.prestige).toBe(OWN_EVENTS.telethon.prestigePerRegion);
  });
});
