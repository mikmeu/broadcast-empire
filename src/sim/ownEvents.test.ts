import { describe, expect, it } from 'vitest';
import { EVENT_COSTS, OWN_EVENTS, OWN_EVENT_LIMITS } from '../config/balance';
import { HINTS } from '../config/guide';
import { ROOM_TYPE_NAMES, STUDIO_REQUIREMENTS, SET_TYPES, furnitureSpec, isStudioType } from '../config/office';
import { TO_RECORD } from '../config/voiceOver';
import { VENUES, hallSize, venueFits } from '../config/venues';
import { buildRoom, stageEvent, type ActionResult } from './actions';
import { addMissingEquipment, autoPlaceFurniture } from './fixtures';
import { DUE } from './guide';
import { isTvStudio } from './office';
import { kindError, proposeRoom } from './rooms';
import { channelRegions } from './broadcast';
import { sensibleBot } from './bots';
import { hasMilestone } from './milestones';
import { createInitialState } from './newGame';
import { lockedReason, unlockAll } from './unlocks';
import { eventAt, eventHalls, eventHosts, hallBlocker, ownEventBlocker, ownEventCooldown, ownEventCost, venueSize } from './ownEvents';
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
    const host = eventHosts(s, channel)[0]!;
    const regions = channelRegions(s, channel.id);
    expect(ownEventCost(s, channel, 'gala', 'medium', host.id).total).toBe(OWN_EVENTS.gala.costPerRegion * regions.length + host.salary);

    const after = ok(stageEvent(s, channel.id, 'gala', 'medium', host.id));
    expect(s.money - after.money).toBe(OWN_EVENTS.gala.costPerRegion + host.salary);
    expect(after.ledger.events).toBe(OWN_EVENTS.gala.costPerRegion + host.salary);
    expect(after.channels[0]!.reputation.capital).toBeCloseTo(channel.reputation.capital! + OWN_EVENTS.gala.reputation);
    expect(after.employees.find((e) => e.id === host.id)!.fame).toBeCloseTo(Math.min(100, host.fame + OWN_EVENTS.gala.fame));
    expect(after.prestige).toBe(OWN_EVENTS.gala.prestigePerRegion);
    expect(after.headlines.at(-1)!.text).toMatch(/stages a gala at Aerial Fields Assembly Hall, presented by /);
    expect(hasMilestone(tick(after), 'firstEvent')).toBe(true);
  });

  it('is limited to one a year per channel, and needs the channel on air and the money', () => {
    const s = station();
    const id = s.channels[0]!.id;
    const after = ok(stageEvent(s, id, 'concert', 'small', null));
    expect(ownEventCooldown(after, after.channels[0]!)).toBe(OWN_EVENT_LIMITS.cooldownDays);
    expect(error(stageEvent(after, id, 'concert', 'small', null))).toMatch(/less than a year ago/);
    expect(stageEvent({ ...after, day: after.day + OWN_EVENT_LIMITS.cooldownDays }, id, 'concert', 'small', null).ok).toBe(true);
    expect(error(stageEvent({ ...s, money: 1_000 }, id, 'telethon', 'large', null))).toMatch(/Not enough money/);
    expect(error(stageEvent({ ...s, licenses: [] }, id, 'concert', 'small', null))).toMatch(/off the air/);
  });

  it('the lift fades again, the prestige stays', () => {
    const s = station();
    const before = advance(s, 300).channels[0]!.reputation.capital!;
    const staged = ok(stageEvent(s, s.channels[0]!.id, 'telethon', 'large', null));
    const after = advance(staged, 300);
    expect(staged.channels[0]!.reputation.capital!).toBeGreaterThan(s.channels[0]!.reputation.capital! + 0.15);
    expect(after.channels[0]!.reputation.capital! - before).toBeLessThan(0.04);
    expect(after.prestige).toBe(OWN_EVENTS.telethon.prestigePerRegion);
  });
});

/** The station with an event hall built on the ground floor and everything on its checklist, with its control room. */
function withHall(s: GameState, extraSeating = 0): { s: GameState; hall: string } {
  const plan = proposeRoom(s, 1, 'eventHall');
  if (!plan) throw new Error('no place for the event hall');
  const built = buildRoom(s, { ...plan, type: 'eventHall' });
  if (!built.ok) throw new Error(built.error);
  let next = ok(addMissingEquipment(built.state, built.id!));
  for (let n = 0; n < extraSeating; n++) next = ok(autoPlaceFurniture(next, built.id!, 'audienceSeating'));
  return { s: next, hall: built.id! };
}

/** The station with a technician on the staff. */
function withTechnician(s: GameState): GameState {
  if (s.employees.some((e) => e.role === 'technician')) return s;
  const tech = { ...structuredClone(s.employees[0]!), id: 'tech-1', name: 'Tess Nician', role: 'technician' as const, location: null, deskId: undefined };
  return { ...s, employees: [...s.employees, tech] };
}

describe('venues and the event hall (#404)', () => {
  it('the event hall is a TV studio that no show is made in, with a stage, audience seating and a control room', () => {
    expect(ROOM_TYPE_NAMES.eventHall).toBe('Event hall');
    expect(STUDIO_REQUIREMENTS.eventHall).toEqual({ camera: 2, studioLights: 2, stage: 1, audienceSeating: 2, controlDesk: 1, audioMixer: 1 });
    expect(isStudioType('eventHall') && isTvStudio('eventHall')).toBe(true);
    expect(furnitureSpec('stage').rooms).toEqual(['eventHall']);
    expect(furnitureSpec('audienceSeating').rooms).toContain('eventHall');
    expect(SET_TYPES).toContain('stage');
  });

  it('is built once events are open, and holds the whole checklist', () => {
    expect(kindError(createInitialState(1), 'eventHall')).toBe(lockedReason('events'));
    expect(kindError(station(), 'eventHall')).toBeNull();
    const { s, hall } = withHall(station());
    expect(eventHalls(s).map((r) => r.roomId)).toEqual([hall]);
    expect(hallBlocker(withTechnician(s), eventHalls(s)[0]!)).toBeNull();
  });

  it('a venue takes its own kind and every smaller one, and a hall is small, medium or large by its seating', () => {
    expect([venueFits('small', 'concert'), venueFits('small', 'gala'), venueFits('medium', 'gala'), venueFits('medium', 'telethon'), venueFits('large', 'telethon'), venueFits('large', 'concert')]).toEqual([true, false, true, false, true, true]);
    expect([hallSize(2), hallSize(3), hallSize(4), hallSize(6)]).toEqual(['small', 'medium', 'large', 'large']);
    expect(Object.values(VENUES).map((v) => v.id)).toEqual(['small', 'medium', 'large']);
    const { s, hall } = withHall(station());
    expect(venueSize(s, hall)).toBe('small');
    expect(venueSize(withHall(station(), 1).s, withHall(station(), 1).hall)).toBe('medium');
    const big = withHall(station(), 2);
    expect(venueSize(big.s, big.hall)).toBe('large');
    expect(venueSize(s, 'no-such-room')).toBeNull();
  });

  it('costs rent, catering and a month of the host’s salary outside, and only 60% catering and the fee at home', () => {
    const { s, hall } = withHall(withTechnician(station()), 2);
    const channel = s.channels[0]!;
    const host = eventHosts(s, channel)[0]!;
    const full = OWN_EVENTS.telethon.costPerRegion * channelRegions(s, channel.id).length;
    const outside = ownEventCost(s, channel, 'telethon', 'large', host.id);
    expect(outside.rent + outside.catering).toBe(full);
    expect(outside.rent).toBe(Math.round(full * EVENT_COSTS.rentShare));
    expect(outside.host).toBe(host.salary);
    expect(outside.total).toBe(full + host.salary);
    const home = ownEventCost(s, channel, 'telethon', hall, host.id);
    expect(home).toMatchObject({ rent: 0, catering: Math.round(full * 0.6), host: host.salary });
    expect(full - home.catering).toBe(Math.round(full * 0.4));
    // Nobody to front it: no fee.
    expect(ownEventCost(s, channel, 'telethon', hall, null).host).toBe(0);

    const after = ok(stageEvent(s, channel.id, 'telethon', hall, host.id));
    expect(s.money - after.money).toBe(home.total);
    expect(after.channels[0]!.lastEvent).toEqual({ day: s.day, kind: 'telethon', venue: hall, hostId: host.id });
    expect(after.headlines.at(-1)!.text).toContain(s.rooms.find((r) => r.roomId === hall)!.name);
    expect(eventAt(after, hall)).toMatchObject({ kind: 'telethon', hostId: host.id });
    expect(eventAt({ ...after, day: after.day + 1 }, hall)).toBeNull();
  });

  it('is refused for a venue too small, a hall that is not ready, let out or without a technician, and a host of another channel', () => {
    const base = withHall(withTechnician(station()));
    const { s, hall } = base;
    const channel = s.channels[0]!;
    const host = eventHosts(s, channel)[0]!;
    expect(ownEventBlocker(s, channel, 'gala', 'small', host.id)).toMatch(/too small for a gala/);
    expect(ownEventBlocker(s, channel, 'telethon', hall, host.id)).toMatch(/too small for a telethon/);
    expect(ownEventBlocker(s, channel, 'concert', hall, host.id)).toBeNull();
    expect(ownEventBlocker(s, channel, 'concert', 'nowhere', host.id)).toMatch(/doesn’t exist/);
    expect(ownEventBlocker(s, channel, 'concert', 'small', 'nobody')).toMatch(/no show on/);

    const unfinished = { ...s, rooms: s.rooms.map((r) => (r.roomId === hall ? { ...r, furniture: r.furniture.filter((f) => f.type !== 'stage') } : r)) };
    expect(error(stageEvent(unfinished, channel.id, 'concert', hall, host.id))).toMatch(/isn’t ready/);
    const noTech = { ...s, employees: s.employees.filter((e) => e.role !== 'technician') };
    // (A company with no technician at all is off the air, so the hall's own check is read here.)
    expect(hallBlocker(noTech, noTech.rooms.find((r) => r.roomId === hall)!)).toMatch(/needs a technician/);
    const let_ = { ...s, studioLets: [{ id: 'l1', roomId: hall, tenant: 'X', rent: 1, startDay: s.day, endDay: s.day + 90 }] } as unknown as GameState;
    expect(error(stageEvent(let_, channel.id, 'concert', hall, host.id))).toMatch(/let out/);
  });

  it('the host who is picked gets the fame, and nobody does when there is no host', () => {
    const s = station();
    const channel = s.channels[0]!;
    const host = eventHosts(s, channel)[0]!;
    const picked = ok(stageEvent(s, channel.id, 'concert', 'small', host.id));
    expect(picked.employees.find((e) => e.id === host.id)!.fame).toBeCloseTo(Math.min(100, host.fame + OWN_EVENTS.concert.fame));
    const none = ok(stageEvent(s, channel.id, 'concert', 'small', null));
    expect(none.employees.find((e) => e.id === host.id)!.fame).toBe(host.fame);
    expect(s.money - none.money).toBe(ownEventCost(s, channel, 'concert', 'small', null).total);
  });

  it('Penny points at an event hall once an event was held outside and there is none', () => {
    const hint = HINTS.find((h) => h.id === 'event-hall')!;
    expect(hint.speaker).toBe('penny');
    expect(TO_RECORD['event-hall']).toBe('new');
    const s = station();
    expect(DUE['event-hall']!(s)).toBe(false);
    const held = ok(stageEvent(s, s.channels[0]!.id, 'concert', 'small', null));
    expect(DUE['event-hall']!(held)).toBe(true);
    expect(DUE['event-hall']!(withHall(held).s)).toBe(false);
  });
});
