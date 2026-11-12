import { describe, expect, it } from 'vitest';
import { capitalBot, sensibleBot } from './bots';
import { createInitialState } from './newGame';
import { addMessage, newAlerts, topMessage, type GameState, waitingFor, type Message } from './state';
import { tick } from './tick';
import { unlockAll } from './unlocks';
import { RENEWAL, RESEARCH } from '../config/balance';
import { TECHS } from '../config/tech';
import { toDay } from './calendar';

function play(bot: typeof sensibleBot, days: number, seed = 1): GameState[] {
  const states = [createInitialState(seed)];
  for (let day = 0; day < days; day++) states.push(tick(bot(states[states.length - 1]!)));
  return states;
}

describe('news about a window (Phase 12c)', () => {
  it('marks new sponsor offers as news about Sales and an ended campaign as news about Marketing', () => {
    const days = play(capitalBot, 200);
    const all = days[days.length - 1]!.messages;
    // Messages are kept for a while only, so look at every day as it happened.
    const fresh = days.slice(1).flatMap((after, n) => newAlerts(days[n]!, after));
    const offers = fresh.filter((m) => /new sponsor offer/.test(m.text));
    expect(offers.length).toBeGreaterThan(3);
    for (const m of offers) expect(m.about).toBe('sales');
    // The other news with a pop-up: something has opened (Phase 12e), since 0.9.0 a rival's offer to a host, a license
    // that runs out and a technology within reach, and since 0.10.0 a sponsor the company got to know better. A monthly
    // report or a milestone gets none. Since 0.20.2 (#264) a host, producer or channel manager who falls ill gets one too.
    for (const m of fresh.filter((x) => !offers.includes(x))) expect(m.text, m.text).toMatch(/ (is|are) open: | is ill until |has offered|runs out on|up for renewal|the points for |on better terms with |fewer (listeners|viewers) than a week ago/);
    expect(all.some((m) => m.about === undefined)).toBe(true);

    // A campaign on its last day: the next morning's news is about Marketing.
    const state = structuredClone(unlockAll(days[60]!));
    state.campaigns.push({ id: 'c-test', targetId: state.channels[0]!.id, audience: 'all', weeklyBudget: 0, marketerId: 'nobody', endDay: state.day + 1, weeks: 4, repeat: false });
    const ended = newAlerts(state, tick(state)).filter((m) => m.about === 'marketing');
    expect(ended).toHaveLength(1);
    expect(ended[0]!.text).toMatch(/campaign for “.+” has ended/);
  });

  it('gives each of them a pop-up of its own, the day it comes in', () => {
    const before = createInitialState(1);
    const after = structuredClone(before);
    addMessage(after, 'info', 'Sales brought in 2 new sponsor offers.', undefined, 'sales');
    addMessage(after, 'good', 'A milestone', 'milestone');
    addMessage(after, 'info', 'The campaign for “Coax FM” has ended; its effect will slowly fade.', undefined, 'marketing');
    expect(newAlerts(before, after).map((m) => m.about)).toEqual(['sales', 'marketing']);
    // The message with the most weight is still the milestone, which gets the usual notice.
    expect(topMessage(before, after)?.topic).toBe('milestone');
    // The next day they are no longer new.
    expect(newAlerts(after, after)).toEqual([]);
  });
});

// From version09.
/** Plays day by day and collects every message that is about a window. */
function alertsOver(state: GameState, days: number): { state: GameState; alerts: Message[] } {
  const alerts: Message[] = [];
  let s = state;
  for (let i = 0; i < days; i++) {
    const next = tick(s);
    alerts.push(...newAlerts(s, next));
    s = next;
  }
  return { state: s, alerts };
}

describe('version 0.9.0', () => {
  describe('news with a pop-up and a dot (R15)', () => {
    /** The sensible bot's station with everything open and money to spare. */
    const station = () => ({ ...structuredClone(unlockAll(sensibleBot(createInitialState(1)))), money: 1_000_000 });

    it('a rival’s offer to one of your hosts is news about the Staff window', () => {
      let s = station();
      const star = s.employees.find((e) => e.role === 'host')!.id;
      let offer: Message | undefined;
      for (let i = 0; i < 3_000 && !offer; i++) {
        s = structuredClone(s);
        for (const e of s.employees) if (e.role === 'host') e.fame = e.id === star ? 90 : 0;
        const next = tick(s);
        offer = newAlerts(s, next).find((m) => m.about === 'staff' && m.kind === 'danger'); // (not a fan getting in to the star, 0.18.0)
        s = next;
      }
      expect(offer).toMatchObject({ kind: 'danger', text: expect.stringMatching(/has offered .* a month/) });
      // Loaded again while the offer is waiting, Staff has its dot back.
      expect(s.poachOffers).toHaveLength(1);
      expect(waitingFor(s)).toContain('staff');
      expect(waitingFor(station())).toEqual([]);
    });

    it('a license that runs out, and its renewal round, are news about Licenses', () => {
      const s = station();
      s.day = s.licenses[0]!.expiresOn - RENEWAL.warnDays - 1;
      const warned = tick(s);
      expect(newAlerts(s, warned)).toContainEqual(expect.objectContaining({ about: 'licenses', kind: 'warning', text: expect.stringMatching(/runs out on/) }));
      expect(waitingFor(warned)).not.toContain('licenses');

      const t = structuredClone(warned);
      t.day = t.licenses[0]!.expiresOn - RENEWAL.auctionDays - 1;
      const round = tick(t);
      expect(newAlerts(t, round)).toContainEqual(expect.objectContaining({ about: 'licenses', text: expect.stringMatching(/up for renewal/) }));
      expect(waitingFor(round)).toContain('licenses');
    });

    it('a technology that comes within reach is news about Research, once', () => {
      // With points to spare, the next thing to come within reach is the first technology more than five years off.
      const rich = { ...unlockAll(createInitialState(1)), researchPoints: 1_000_000 };
      // (unlockAll already owns the techs for jobs and formats, so they are not news.)
      const next = TECHS.filter((tech) => tech.year - RESEARCH.maxYearsEarly > 1970 && !rich.techs.includes(tech.id)).sort((a, b) => a.year - b.year)[0]!;
      const day = toDay(next.year - RESEARCH.maxYearsEarly, 1, 1);
      const about = (alerts: Message[]) => alerts.filter((m) => m.about === 'research');
      expect(about(alertsOver(rich, day + 30).alerts)).toEqual([expect.objectContaining({ kind: 'info', day, text: expect.stringContaining(`the points for ${next.name}`) })]);
      // A company that has no research yet hears nothing.
      expect(about(alertsOver({ ...createInitialState(1), researchPoints: 1_000_000 }, day + 30).alerts)).toEqual([]);
    });
  });
});
