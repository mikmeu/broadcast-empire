import { describe, expect, it } from 'vitest';
import { MILESTONE_LIST } from '../config/milestones';
import { ACTIVE_REGIONS } from '../config/balance';
import { FEATURES, UNLOCKS } from '../config/unlocks';
import { buyLicense, createChannel, hire, placeRightsBid, research, stageEvent, startCampaign, type ActionResult } from './actions';
import { capitalBot, growthBot, sensibleBot } from './bots';
import { runCheat } from './cheats';
import { toDay } from './calendar';
import { licenseSlots, nextTvLicenseYear } from './licenses';
import { createInitialState } from './newGame';
import { SAVE_VERSION, fromSaveFile, toSaveFile } from './save';
import { newAlerts, type GameState } from './state';
import { tick } from './tick';
import { canHire, featureOfRole, isUnlocked, lockedReason, regionOpen, unlockAll } from './unlocks';

const error = (result: ActionResult) => (result.ok ? '' : result.error);
const ok = (result: ActionResult): GameState => {
  if (!result.ok) throw new Error(result.error);
  return result.state;
};

/** A company on its first day with a channel on the air in Coaxia, and money. */
const station = (): GameState => ({ ...sensibleBot(createInitialState(1)), money: 2_000_000 });

/** Plays a bot from a new game and notes the day each thing opened. */
function play(bot: typeof growthBot, days: number, seed = 1): { state: GameState; opened: Record<string, number>; alerts: string[] } {
  let state = createInitialState(seed);
  const opened: Record<string, number> = {};
  const alerts: string[] = [];
  for (let day = 0; day < days; day++) {
    const next = tick(bot(state));
    for (const feature of next.unlocked) opened[feature] ??= next.day;
    alerts.push(...newAlerts(state, next).filter((m) => / (is|are) open: /.test(m.text)).map((m) => `${m.about}: ${m.text}`));
    state = next;
  }
  return { state, opened, alerts };
}

describe('what a new company can do (Phase 12e)', () => {
  it('starts with everything on the list still to open, each behind a milestone that exists', () => {
    const s = createInitialState(1);
    expect(s.unlocked).toEqual([]);
    for (const feature of FEATURES) {
      expect(isUnlocked(s, feature)).toBe(false);
      expect(UNLOCKS[feature].milestones.length).toBeGreaterThan(0);
      for (const id of UNLOCKS[feature].milestones) expect(MILESTONE_LIST.some((m) => m.id === id), id).toBe(true);
    }
    expect(Object.keys(UNLOCKS).sort()).toEqual([...FEATURES].sort());
    expect(lockedReason('sales')).toBe('Sales opens with the milestone “First profitable month”.');
    expect(lockedReason('regions')).toBe('More regions open with the milestone “One month on the air”.');
    expect(lockedReason('research')).toBe('Research opens with the milestone “On the air in two regions” or “#1 radio channel in a region”.');
    expect(lockedReason('events')).toBe('Events of your own open with the milestone “Radio market leader”.');
  });

  it('hires the people who make radio and keep the building going, and nobody for what is not open', () => {
    const s = station();
    for (const role of ['host', 'production', 'channelManager', 'cleaner', 'technician', 'maintenance'] as const) expect(canHire(s, role), role).toBe(true);
    for (const role of ['sales', 'marketing', 'researcher'] as const) {
      expect(canHire(s, role), role).toBe(false);
      const candidate = s.candidates.find((c) => c.role === role)!;
      expect(error(hire(s, candidate.id))).toBe(lockedReason(featureOfRole(role)!));
      expect(hire(unlockAll(s), candidate.id).ok).toBe(true);
    }
    // A manager belongs to a department: one for production can be hired, one for sales cannot.
    expect(canHire(s, 'manager', 'production')).toBe(true);
    expect(canHire(s, 'manager', 'sales')).toBe(false);
    const manager = s.candidates.find((c) => c.role === 'manager' && c.department && c.department !== 'production');
    if (manager) expect(error(hire(s, manager.id))).toMatch(/opens with the milestone/);
  });

  it('sells the first license anywhere, and until more regions open no license outside that region', () => {
    for (const region of ACTIVE_REGIONS) {
      let s: GameState = { ...createInitialState(2), money: 2_000_000 };
      const made = createChannel(s, { name: 'First', logo: { shape: 'circle', color: '#6631d2', initials: 'F' }, medium: 'radio' });
      if (!made.ok) throw new Error(made.error);
      s = ok(buyLicense(made.state, made.id!, region));
      expect(s.licenses).toHaveLength(1);
      for (const other of ACTIVE_REGIONS) expect(regionOpen(s, other), `${region} → ${other}`).toBe(other === region);
      const elsewhere = ACTIVE_REGIONS.find((r) => r !== region)!;
      expect(error(buyLicense(s, made.id!, elsewhere))).toMatch(/can’t buy a license outside .+ yet\. More regions open with the milestone “One month on the air”\./);
      // Once regions are open it can.
      expect(buyLicense({ ...s, unlocked: ['regions'] }, made.id!, elsewhere).ok).toBe(true);
    }
  });

  it('refuses research, a campaign, an event and a bid for rights with the milestone that opens them', () => {
    const s = station();
    const channel = s.channels[0]!;
    expect(error(research(s, 'stereoBroadcast' as never))).toBe(lockedReason('research'));
    expect(error(startCampaign(s, { targetId: channel.id, audience: 'all', weeklyBudget: 2_500, weeks: 8 }))).toBe(lockedReason('marketing'));
    expect(error(stageEvent(s, channel.id, 'concert'))).toBe(lockedReason('events'));
    expect(error(placeRightsBid(s, 'none', 1))).toBe(lockedReason('content'));
    // With everything open the same moves get past the lock, to whatever else stands in their way.
    const open = unlockAll(s);
    expect(error(startCampaign(open, { targetId: channel.id, audience: 'all', weeklyBudget: 2_500, weeks: 8 }))).toMatch(/marketer/);
    expect(error(placeRightsBid(open, 'none', 1))).toMatch(/closed/);
  });
});

describe('what the milestones open (Phase 12e)', () => {
  it('opens more regions after a month, sales with the first profit, marketing with the first sponsor and research with a second region', () => {
    const { state, opened, alerts } = play(growthBot, 300);
    for (const feature of ['regions', 'sales', 'marketing', 'research'] as const) expect(opened[feature], feature).toBeDefined();
    const day = (id: string) => state.milestones.find((m) => m.id === id)!.day;
    expect(opened.regions).toBe(day('firstMonth'));
    expect(day('firstMonth') - day('onAir')).toBe(30);
    expect(opened.sales).toBe(day('firstProfit'));
    // The contract is signed during the day and opens Marketing at once (Phase 12f); the note here is taken after the day has run.
    expect(opened.marketing! - day('firstSponsor')).toBeGreaterThanOrEqual(0);
    expect(opened.marketing! - day('firstSponsor')).toBeLessThanOrEqual(1);
    expect(opened.research).toBe(Math.min(day('twoRegions'), day('regionNumberOne')));
    // In that order for a company that grows: regions, then research with its second region, sales, marketing.
    // A first month that pays its own way opens sales on the same day as the regions.
    expect(opened.regions!).toBeLessThanOrEqual(opened.sales!);
    expect(opened.sales!).toBeLessThan(opened.marketing!);
    // Nobody was hired for something before it was open.
    expect(state.employees.filter((e) => e.role === 'sales').every((e) => e.hiredOn >= opened.sales!)).toBe(true);
    expect(state.employees.filter((e) => e.role === 'marketing').every((e) => e.hiredOn >= opened.marketing!)).toBe(true);
    expect(state.employees.filter((e) => e.role === 'researcher').every((e) => e.hiredOn >= opened.research!)).toBe(true);
    // Each opening is news about the window it is in.
    expect(alerts.some((a) => a.startsWith('licenses: More regions are open'))).toBe(true);
    expect(alerts.some((a) => a.startsWith('sales: Sales is open'))).toBe(true);
    expect(alerts.some((a) => a.startsWith('marketing: Marketing is open'))).toBe(true);
    expect(alerts.some((a) => a.startsWith('research: Research is open'))).toBe(true);
    expect(new Set(alerts).size).toBe(alerts.length);
  });

  it('keeps events for a company that leads the radio market, and the content market for one with a TV license', () => {
    const { state, opened } = play(growthBot, 300);
    const leader = state.milestones.find((m) => m.id === 'radioLeader');
    expect(opened.events).toBe(leader?.day);
    if (leader) expect(leader.day).toBeGreaterThan(opened.marketing!);
    // No television yet, so no content market.
    expect(state.licenses.some((l) => l.medium === 'tv')).toBe(false);
    expect(isUnlocked(state, 'content')).toBe(false);
    // A TV license opens it the next day.
    const withTv = structuredClone(state);
    withTv.licenses.push({ ...withTv.licenses[0]!, id: 'l-tv', medium: 'tv' });
    const next = tick(withTv);
    expect(next.milestones.some((m) => m.id === 'tvLicense')).toBe(true);
    expect(isUnlocked(next, 'content')).toBe(true);
    expect(newAlerts(withTv, next).some((m) => m.about === 'broadcast:content' && /The content market is open/.test(m.text))).toBe(true);
  });

  it('opens research for a company that stays in one region, once its channel is the biggest there', () => {
    const { state, opened } = play(capitalBot, 240);
    expect(new Set(state.licenses.map((l) => l.regionId)).size).toBe(1);
    expect(state.milestones.some((m) => m.id === 'twoRegions')).toBe(false);
    expect(opened.research).toBe(state.milestones.find((m) => m.id === 'regionNumberOne')!.day);
    expect(state.employees.some((e) => e.role === 'researcher')).toBe(true);
  });
});

describe('older games, and the way round (Phase 12e)', () => {
  it('opens everything in a game from before the locks', () => {
    const file = JSON.parse(JSON.stringify(toSaveFile(createInitialState(4), 0)));
    delete file.state.unlocked;
    const { version, state } = fromSaveFile({ ...file, version: 19 });
    expect(version).toBe(SAVE_VERSION);
    expect([...state.unlocked].sort()).toEqual([...FEATURES].sort());
    // A game saved now keeps what it has opened.
    const mine = { ...createInitialState(4), unlocked: ['regions' as const] };
    expect(fromSaveFile(JSON.parse(JSON.stringify(toSaveFile(mine, 0)))).state.unlocked).toEqual(['regions']);
  });

  it('opens everything with a cheat code', () => {
    const result = runCheat(createInitialState(1), 'unlock');
    expect(result.ok).toBe(true);
    if (result.ok) for (const feature of FEATURES) expect(isUnlocked(result.state, feature)).toBe(true);
  });
});

describe('when the next TV license comes (#136)', () => {
  it('names the next listed year, and none after the last', () => {
    expect(nextTvLicenseYear('north', toDay(1970, 1, 1))).toBe(1971);
    expect(nextTvLicenseYear('north', toDay(1972, 6, 1))).toBe(1977);
    expect(nextTvLicenseYear('highlands', toDay(1979, 1, 1))).toBeUndefined();
  });

  it('gives every region a second TV license by the end of 1972, and the Capital a third', () => {
    const day = toDay(1972, 12, 31);
    for (const region of ACTIVE_REGIONS) expect(licenseSlots('tv', region, day)).toBeGreaterThanOrEqual(region === 'capital' ? 3 : 2);
  });
});
