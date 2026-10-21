import { describe, expect, it } from 'vitest';
import { MARKETING, SOCIAL } from '../config/balance';
import { HINTS } from '../config/guide';
import { TO_RECORD } from '../config/voiceOver';
import { closeSocialAccount, hire, openSocialAccount, startCampaign, type ActionResult } from './actions';
import { simulateDay } from './broadcast';
import { sensibleBot } from './bots';
import { autoPlaceFurniture } from './fixtures';
import { runCampaigns, promotionFor } from './marketing';
import { createInitialState } from './newGame';
import { deskFor, deskRoomFor, employeesWithDesk } from './office';
import { fromSaveFile, SAVE_VERSION, toSaveFile } from './save';
import { removeEmployee } from './staff';
import type { GameState, Person } from './state';
import { unlockAll } from './unlocks';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}
const error = (result: ActionResult) => (result.ok ? 'no error' : result.error);

const station = () => {
  const s = structuredClone(unlockAll(sensibleBot(createInitialState(1))));
  s.money = 5_000_000;
  return s;
};

/** Hires a made-up marketer and gives them a workstation. */
function withMarketer(state: GameState, skill = 100): GameState & { lastId?: string } {
  const s = structuredClone(state);
  const person: Person = { id: `p-test-${s.employees.length}-${skill}`, name: 'Test Marketer', role: 'marketing', skill, salary: 2_000, specialties: [], fame: 0, department: null };
  s.candidates.push(person);
  const room = s.rooms.find((r) => r.type === deskRoomFor('marketing'))!.roomId;
  return Object.assign(ok(autoPlaceFurniture(ok(hire(s, person.id)), room, deskFor('marketing'))), { lastId: person.id });
}

const researched = (s: GameState) => ({ ...s, techs: [...s.techs, 'socialMedia' as const] }) as GameState;

const days = (s: GameState, n: number) => {
  for (let i = 0; i < n; i++) {
    runCampaigns(s, employeesWithDesk(s));
    s.day += 1;
  }
};

describe('social media accounts', () => {
  it('need the research and a free marketer', () => {
    const s = station();
    const id = s.channels[0]!.id;
    expect(error(openSocialAccount(s, id))).toMatch(/Research/);
    expect(error(openSocialAccount(researched(s), id))).toMatch(/marketer/);
  });

  it('grow a following, and fade without a marketer', () => {
    const base = researched(withMarketer(station()));
    const state = ok(openSocialAccount(base, base.channels[0]!.id));
    const channel = state.channels[0]!;
    days(state, 120);
    const grown = channel.social!.following;
    expect(grown).toBeGreaterThan(0.4);
    expect(promotionFor(state, [channel.id], 'teens')).toBeGreaterThan(promotionFor(state, [channel.id], 'seniors'));

    removeEmployee(state, channel.social!.marketerId!);
    expect(channel.social!.marketerId).toBeNull();
    days(state, 60);
    expect(channel.social!.following).toBeLessThan(grown);
    expect(channel.social).not.toBeNull();
  });

  it('draw more listeners after six months than the same channel without one', () => {
    const base = researched(withMarketer(station()));
    const s = ok(openSocialAccount(base, base.channels[0]!.id));
    days(s, 180);
    const without = structuredClone(s);
    without.channels[0]!.social = null;
    const listeners = (state: GameState) => simulateDay(state).channels[0]!.slots.reduce((sum, x) => sum + x.listeners, 0);
    expect(listeners(s)).toBeGreaterThan(listeners(without));
  });

  it('are paid for day by day', () => {
    const base = researched(withMarketer(station()));
    const s = ok(openSocialAccount(base, base.channels[0]!.id));
    const money = s.money;
    days(s, 7);
    expect(money - s.money).toBeGreaterThan(SOCIAL.weeklyCost * 0.85);
    expect(money - s.money).toBeLessThanOrEqual(SOCIAL.weeklyCost + 1);
  });

  it('keep a marketer from a campaign, and a campaign from an account', () => {
    const base = researched(withMarketer(station()));
    const id = base.channels[0]!.id;
    const withAccount = ok(openSocialAccount(base, id));
    expect(error(startCampaign(withAccount, { targetId: id, audience: 'all', weeklyBudget: 1_000, weeks: 4 }))).toMatch(/marketer/);
    const withCampaign = ok(startCampaign(base, { targetId: id, audience: 'all', weeklyBudget: 1_000, weeks: 4 }));
    expect(error(openSocialAccount(withCampaign, id))).toMatch(/marketer/);
  });

  it('stay under the cap together with a campaign', () => {
    const s = researched(station());
    const id = s.channels[0]!.id;
    s.channels[0]!.social = { marketerId: null, following: 1 };
    s.promotion[id] = { teens: MARKETING.maxPromotion };
    expect(promotionFor(s, [id], 'teens')).toBe(MARKETING.maxPromotion);
    s.promotion = {};
    expect(promotionFor(s, [id], 'teens')).toBeLessThanOrEqual(SOCIAL.maxPromotion * 1.3 + 1e-9);
    expect(promotionFor(s, [id], 'teens')).toBeGreaterThan(0);
  });

  it('closing one loses the following', () => {
    const base = researched(withMarketer(station()));
    const id = base.channels[0]!.id;
    const s = ok(closeSocialAccount(ok(openSocialAccount(base, id)), id));
    expect(s.channels[0]!.social).toBeNull();
    expect(error(closeSocialAccount(s, id))).toMatch(/no account/);
  });

  it('are freed when the marketer goes, and taken over by the next free one', () => {
    const first = withMarketer(researched(station()), 60);
    const second = withMarketer(first, 40);
    expect(employeesWithDesk(second).has(second.lastId!)).toBe(true);
    const id = second.channels[0]!.id;
    const s = ok(openSocialAccount(second, id));
    expect(s.channels[0]!.social!.marketerId).toBe(first.lastId);
    removeEmployee(s, first.lastId!);
    expect(s.channels[0]!.social!.marketerId).toBeNull();
    days(s, 1);
    expect(s.channels[0]!.social!.marketerId).toBe(second.lastId);
  });

  it('load from a save of version 44', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(45);
    const file = toSaveFile(station(), 1);
    const old = structuredClone(file) as unknown as { version: number; state: { channels: { social?: unknown }[] } };
    old.version = 44;
    for (const c of old.state.channels) delete c.social;
    const loaded = fromSaveFile(old);
    expect(loaded.state.channels.every((c) => c.social === null)).toBe(true);
  });

  it('has Penny speak of them once the research is in, and records the line', () => {
    const line = HINTS.find((h) => h.id === 'social-media')!;
    expect(line.say).toContain('account');
    expect(TO_RECORD['social-media']).toBe('new');
  });
});
